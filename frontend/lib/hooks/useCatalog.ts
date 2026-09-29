'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DateRange } from '@/lib/period';

// ============================================================
// useCatalog — catálogo (Compras, Cap 2)
// Cruza la ENTREGA de Meta por producto (meta_catalog_products: gasto/impresiones
// que el algoritmo destinó a cada producto — Meta NO expone compras por producto)
// con el COMPORTAMIENTO REAL del producto en el sitio principal sneakerstore.com.mx
// (ga4_items, propiedad 508597206: vistas → add-to-cart → compra → ingreso).
// Muestra el detalle por producto (sin veredicto) y un rollup por subcategoría/modelo.
// Nota: la compra por producto en .mx recién empieza a dispararse; la señal fuerte
// hoy es vistas/ATC (intención). El catálogo (DPA) empuja sobre todo hacia .mx.
// ============================================================

const PAGE = 1000;
const MAIN_PROPERTY = '508597206'; // sneakerstore.com.mx (el item-tracking bueno vive aquí)

const n = (v: unknown) => Number(v || 0);

export interface CatalogProd {
  name: string; sub: string;
  impr: number; spend: number;          // Meta empuja
  views: number; atc: number; purchases: number; revenue: number; // .mx real
}
export interface CatalogSub {
  sub: string; nProducts: number;
  impr: number; spend: number; views: number; atc: number; purchases: number; revenue: number;
}
export interface CatalogHealth { product_count: number; product_set_count: number; oos_count: number; no_image_count: number; }
export interface CatalogData {
  health: CatalogHealth | null;
  products: CatalogProd[];   // detalle por producto (impr desc), sin veredicto
  subcats: CatalogSub[];     // rollup por subcategoría/modelo (impr desc)
  metaSpend: number;         // gasto total de Meta en catálogo (snapshot)
  nProducts: number;         // productos con pauta
  ga4Window: string;         // fecha máx de ga4_items usada
  hasData: boolean;
}

async function pageAll<T>(table: string, cols: string, clientId: string,
  filter?: (q: any) => any): Promise<T[]> {
  const all: T[] = [];
  let off = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase.from(table).select(cols).eq('client_id', clientId);
    if (filter) q = filter(q);
    const { data, error } = await q.range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as T[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    off += PAGE;
  }
  return all;
}

// Tokeniza un nombre de producto para cruzar Meta↔GA4 (quita "tenis/botas", años y símbolos).
function toks(s: string): Set<string> {
  const x = (s || '').toLowerCase().replace(/^(tenis|botas)\s+/, '').replace(/\b20\d\d\b/g, ' ').replace(/[^a-z0-9 ]/g, ' ');
  return new Set(x.split(/\s+/).filter((w) => w.length > 1));
}

// Subcategoría / línea de modelo, parseada del nombre.
export function subcatOf(name: string): string {
  const s = (name || '').toLowerCase();
  const jm = s.match(/jordan\s*(\d{1,2})\b/);
  if (jm) return `Jordan ${jm[1]}`;
  if (/yeezy/.test(s)) return 'Yeezy';
  if (/air\s*force|force\s*1|\baf1\b/.test(s)) return 'Air Force 1';
  if (/\bdunk\b/.test(s)) return 'Dunk';
  if (/samba/.test(s)) return 'Samba';
  if (/amiri/.test(s)) return 'Amiri';
  if (/new\s*balance|\bnb\b/.test(s)) return 'New Balance';
  if (/balenciaga/.test(s)) return 'Balenciaga';
  if (/badbo/.test(s)) return 'BADBO';
  if (/travis/.test(s)) return 'Travis Scott';
  return 'Otros';
}

export function useCatalog(clientId: string, range: DateRange) {
  const [data, setData] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [mp, it, mh] = await Promise.all([
          pageAll<any>('meta_catalog_products', 'product_name,spend,impressions', clientId),
          pageAll<any>('ga4_items', 'date,item_name,items_viewed,items_added_to_cart,items_purchased,item_revenue,property_id', clientId,
            (q) => q.eq('property_id', MAIN_PROPERTY).gte('date', range.from).lte('date', range.to)),
          pageAll<any>('meta_catalog_health', 'product_count,product_set_count,oos_count,no_image_count', clientId),
        ]);

        // .mx: agregar el comportamiento por producto en el rango.
        const site = new Map<string, { views: number; atc: number; purchases: number; revenue: number }>();
        let ga4Window = '';
        for (const r of it) {
          if (r.date > ga4Window) ga4Window = r.date;
          const key = (r.item_name || '').trim();
          if (!key) continue;
          const a = site.get(key) || { views: 0, atc: 0, purchases: 0, revenue: 0 };
          a.views += n(r.items_viewed); a.atc += n(r.items_added_to_cart);
          a.purchases += n(r.items_purchased); a.revenue += n(r.item_revenue);
          site.set(key, a);
        }
        const siteArr = [...site.entries()].map(([title, v]) => ({ title, ...v }));
        const siteTok = siteArr.map((s) => toks(s.title));

        // Meta empuja: por producto (ya agregado por nombre en el ETL).
        const meta = mp.map((r) => ({ name: r.product_name as string, impr: n(r.impressions), spend: n(r.spend) }))
          .filter((r) => r.name);

        // Cruce Meta → .mx por tokens (mejor match no usado).
        const used = new Set<number>();
        const products: CatalogProd[] = [];
        for (const m of [...meta].sort((a, b) => b.impr - a.impr)) {
          const gk = toks(m.name); let best = -1, bs = 0;
          siteTok.forEach((sk, i) => {
            if (used.has(i)) return;
            let inter = 0; gk.forEach((tk) => { if (sk.has(tk)) inter++; });
            if (inter < 2) return;
            const uni = new Set([...gk, ...sk]).size; const sc = inter / (uni || 1);
            if (sc > bs) { bs = sc; best = i; }
          });
          let views = 0, atc = 0, purchases = 0, revenue = 0;
          if (best >= 0 && bs >= 0.34) { used.add(best); const s = siteArr[best]; views = s.views; atc = s.atc; purchases = s.purchases; revenue = s.revenue; }
          products.push({ name: m.name, sub: subcatOf(m.name), impr: m.impr, spend: +m.spend.toFixed(2), views, atc, purchases, revenue });
        }
        // Productos que se vieron/cartearon en .mx pero Meta no empujó (o no cruzó).
        siteArr.forEach((s, i) => {
          if (used.has(i)) return;
          if (s.views >= 1 || s.atc >= 1) products.push({ name: s.title, sub: subcatOf(s.title), impr: 0, spend: 0, views: s.views, atc: s.atc, purchases: s.purchases, revenue: s.revenue });
        });

        // Rollup por subcategoría.
        const subMap = new Map<string, CatalogSub>();
        for (const p of products) {
          const s = subMap.get(p.sub) || { sub: p.sub, nProducts: 0, impr: 0, spend: 0, views: 0, atc: 0, purchases: 0, revenue: 0 };
          s.nProducts += 1; s.impr += p.impr; s.spend += p.spend; s.views += p.views; s.atc += p.atc; s.purchases += p.purchases; s.revenue += p.revenue;
          subMap.set(p.sub, s);
        }
        const subcats = [...subMap.values()].map((s) => ({ ...s, spend: +s.spend.toFixed(2) }))
          .sort((a, b) => b.impr - a.impr);

        const metaSpend = +meta.reduce((s, p) => s + p.spend, 0).toFixed(2);
        const health: CatalogHealth | null = mh[0]
          ? { product_count: n(mh[0].product_count), product_set_count: n(mh[0].product_set_count),
              oos_count: n(mh[0].oos_count), no_image_count: n(mh[0].no_image_count) }
          : null;

        const out: CatalogData = {
          health,
          products: products.sort((a, b) => b.impr - a.impr).slice(0, 20),
          subcats,
          metaSpend,
          nProducts: meta.length,
          ga4Window,
          hasData: meta.length > 0 || products.length > 0,
        };
        if (alive) { setData(out); setLoading(false); }
      } catch (e: any) {
        if (alive) { setError(e?.message || 'error'); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [clientId, range.from, range.to]);

  return { data, loading, error };
}
