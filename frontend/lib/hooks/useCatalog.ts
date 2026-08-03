'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DateRange } from '@/lib/period';

// ============================================================
// useCatalog — variaciones de catálogo (Compras, Cap 2)
// Cruza la ENTREGA de Meta por producto (meta_catalog_products: gasto/impresiones
// que el algoritmo destinó a cada producto — Meta NO expone compras por producto)
// con las VENTAS reales de Shopify por producto (shopify_products: unidades/ingresos).
// Resultado direccional "Meta empuja ↔ Shopify vende": desperdicio / oportunidad / sano.
// Además, salud del feed (meta_catalog_health) si el token puede leer el catálogo.
// ============================================================

const PAGE = 1000;
const PUSH = 3500;   // umbral de "empuja fuerte" (impresiones del producto en el período)

const n = (v: unknown) => Number(v || 0);

export interface CatalogProd { name: string; impr: number; spend: number; units: number; revenue: number; }
export interface CatalogHealth { product_count: number; product_set_count: number; oos_count: number; no_image_count: number; }
export interface CatalogData {
  health: CatalogHealth | null;
  waste: CatalogProd[];        // empuja fuerte, no vende
  opportunity: CatalogProd[];  // vende, casi no empuja
  healthy: CatalogProd[];      // empuja y vende
  wasteSpend: number;          // gasto sumado en "desperdicio"
  nProducts: number;           // productos con pauta en el período
  hasData: boolean;
}

async function page<T>(table: string, cols: string, clientId: string): Promise<T[]> {
  const all: T[] = [];
  let off = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase.from(table).select(cols).eq('client_id', clientId).range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as T[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    off += PAGE;
  }
  return all;
}

// Tokeniza un nombre de producto para cruzar Meta↔Shopify (quita "tenis/botas", años y símbolos).
function toks(s: string): Set<string> {
  const x = (s || '').toLowerCase().replace(/^(tenis|botas)\s+/, '').replace(/\b20\d\d\b/g, ' ').replace(/[^a-z0-9 ]/g, ' ');
  return new Set(x.split(/\s+/).filter((w) => w.length > 1));
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
        const [mp, sp, mh] = await Promise.all([
          page<any>('meta_catalog_products', 'product_name,spend,impressions', clientId),
          page<any>('shopify_products', 'period_end,title,units_sold,revenue', clientId),
          page<any>('meta_catalog_health', 'product_count,product_set_count,oos_count,no_image_count', clientId),
        ]);

        // Ventas de Shopify: ventana más reciente disponible (mismo criterio que useCompras).
        const maxpe = sp.reduce((m, r) => (r.period_end > m ? r.period_end : m), '');
        const shop = sp.filter((r) => r.period_end === maxpe)
          .map((r) => ({ title: r.title as string, units: n(r.units_sold), revenue: n(r.revenue) }));

        // Meta empuja: por producto (ya agregado por nombre en el ETL).
        const meta = mp.map((r) => ({ name: r.product_name as string, impr: n(r.impressions), spend: n(r.spend) }))
          .filter((r) => r.name);

        // Cruce: a cada producto de Meta le pego su mejor match de Shopify (por tokens).
        const usedShop = new Set<number>();
        const shopTok = shop.map((s) => toks(s.title));
        const unified: CatalogProd[] = [];
        for (const m of [...meta].sort((a, b) => b.impr - a.impr)) {
          const gk = toks(m.name); let best = -1, bs = 0;
          shopTok.forEach((sk, i) => {
            if (usedShop.has(i)) return;
            let inter = 0; gk.forEach((t) => { if (sk.has(t)) inter++; });
            if (inter < 2) return;
            const uni = new Set([...gk, ...sk]).size; const sc = inter / (uni || 1);
            if (sc > bs) { bs = sc; best = i; }
          });
          let units = 0, revenue = 0;
          if (best >= 0 && bs >= 0.34) { usedShop.add(best); units = shop[best].units; revenue = shop[best].revenue; }
          unified.push({ name: m.name, impr: m.impr, spend: +m.spend.toFixed(2), units, revenue });
        }
        // Productos que Shopify vendió pero Meta no empujó (o no cruzó) → oportunidad pura.
        shop.forEach((s, i) => {
          if (usedShop.has(i)) return;
          if (s.units >= 1) unified.push({ name: s.title, impr: 0, spend: 0, units: s.units, revenue: s.revenue });
        });

        const waste = unified.filter((p) => p.impr >= PUSH && p.units <= 1)
          .sort((a, b) => b.impr - a.impr).slice(0, 8);
        const healthy = unified.filter((p) => p.impr >= PUSH && p.units >= 2)
          .sort((a, b) => b.revenue - a.revenue).slice(0, 6);
        const opportunity = unified.filter((p) => p.units >= 1 && p.impr < PUSH)
          .sort((a, b) => b.revenue - a.revenue).slice(0, 8);
        const wasteSpend = +waste.reduce((s, p) => s + p.spend, 0).toFixed(2);

        const health: CatalogHealth | null = mh[0]
          ? { product_count: n(mh[0].product_count), product_set_count: n(mh[0].product_set_count),
              oos_count: n(mh[0].oos_count), no_image_count: n(mh[0].no_image_count) }
          : null;

        const out: CatalogData = {
          health, waste, opportunity, healthy, wasteSpend,
          nProducts: meta.length,
          hasData: meta.length > 0,
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
