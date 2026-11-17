'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calcDelta } from '@/lib/utils';
import type { DateRange } from '@/lib/period';

// ============================================================
// useEcommerceWeb — análisis ecommerce robusto de la web (Sneaker Store):
// cruza el COMPORTAMIENTO (GA4: embudo, vistas de producto) con la VENTA REAL
// (Shopify: unidades y revenue, con paid/pending separados). El norte: dónde se
// rompe el funnel, qué se ve pero no se vende, y qué está pagado vs pendiente.
//   · ga4_funnel            → embudo del sitio (sesiones→vistas→carrito→checkout→compra)
//   · shopify_product_daily → venta real por producto (paid vs pending)
//   · ga4_items             → demanda por producto (vistas)
//   · ga4_metrics           → tráfico + engagement (sitio principal)
// Honestidad: el add-to-cart/compra por PRODUCTO en GA4 está sub-registrado
// (item-events), por eso la venta por producto se toma de Shopify (la verdad).
// ============================================================

const MAIN_PROPERTY = '508597206'; // sitio principal (sneakerstore.com.mx)


export interface FunnelStep { key: string; label: string; value: number; pctOfSessions: number; stepRate: number | null; isBreak: boolean }



// Etiquetas del catálogo GA4 (comportamiento, SIN venta — eso vive en el de Shopify).
export type ProductLabel = 'potencial' | 'optimizar' | 'baja' | 'mantener';
export interface ProductPerf {
  name: string; views: number; atc: number; atcRate: number;
  checkout: number; purchases: number; cvr: number; revenue: number;
  label: ProductLabel;
}

export interface EcommerceData {
  // Embudo (GA4)
  funnel: FunnelStep[];
  breakLabel: string;           // dónde se rompe (paso con peor conversión)
  productViews: number;
  // Demanda por producto (GA4 · solo la web principal)
  catalogGa4: ProductPerf[];
  ga4LabelCounts: Record<ProductLabel, number>;
  siteAtcRate: number;          // baseline del sitio (carrito/vistas)
  // Tráfico / engagement (solo la web principal)
  sessions: number; sessionsDelta: number;
  bounceRate: number;
  channels: { label: string; sessions: number; pct: number }[];
  from: string; to: string;
}

export interface UseEcommerceResult { data: EcommerceData | null; loading: boolean; error: string | null; refresh: () => void }

const PAGE = 1000;
async function fetchAll(table: string, select: string, clientId: string, from: string, to: string, extra?: (q: any) => any) {
  const all: any[] = []; let off = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase.from(table).select(select).eq('client_id', clientId).gte('date', from).lte('date', to).range(off, off + PAGE - 1);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) { if (off === 0) return []; break; }
    const b = (data || []) as any[]; all.push(...b);
    if (b.length < PAGE) break; off += PAGE;
  }
  return all;
}

// Demanda por producto YA AGREGADA en el servidor (una fila por producto) vía
// RPC → 1 request en vez de ~92 páginas de filas diarias (el cuello de la hoja).
// Si la función aún no existe en la base, cae al paginado filtrado a la web
// principal (lento pero correcto) para no romper la vista.
async function fetchItems(clientId: string, from: string, to: string) {
  const { data, error } = await supabase.rpc('ga4_items_period', { p_client: clientId, p_from: from, p_to: to, p_property: MAIN_PROPERTY });
  if (!error && Array.isArray(data)) return data as any[];
  return fetchAll('ga4_items', 'item_name, items_viewed, items_added_to_cart, items_checked_out, items_purchased, item_revenue', clientId, from, to, (q) => q.eq('property_id', MAIN_PROPERTY));
}


export function useEcommerceWeb(clientId: string, range: DateRange, previous: DateRange): UseEcommerceResult {
  const [data, setData] = useState<EcommerceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true); setError(null);
      try {
        const [funnelRows, itemRows, metricNow, metricPrev] = await Promise.all([
          fetchAll('ga4_funnel', 'sessions, product_views, add_to_cart, checkout_start, purchases', clientId, range.from, range.to),
          fetchItems(clientId, range.from, range.to),
          fetchAll('ga4_metrics', 'sessions, bounce_rate, source_medium', clientId, range.from, range.to),
          fetchAll('ga4_metrics', 'sessions, source_medium', clientId, previous.from, previous.to),
        ]);
        if (cancelled) return;

        // ── Embudo (GA4) ──
        const f = { sessions: 0, product_views: 0, add_to_cart: 0, checkout_start: 0, purchases: 0 };
        for (const r of funnelRows) for (const k of Object.keys(f)) (f as any)[k] += Number(r[k]) || 0;
        const steps: { key: string; label: string; value: number }[] = [
          { key: 'sessions', label: 'Sesiones', value: f.sessions },
          { key: 'product_views', label: 'Vistas de producto', value: f.product_views },
          { key: 'add_to_cart', label: 'Añadir al carrito', value: f.add_to_cart },
          { key: 'checkout_start', label: 'Checkout', value: f.checkout_start },
          { key: 'purchases', label: 'Compras', value: f.purchases },
        ];
        let worstIdx = -1, worstRate = Infinity;
        const funnel: FunnelStep[] = steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1].value : 0;
          const stepRate = i > 0 && prev > 0 ? s.value / prev : null;
          if (i >= 2 && stepRate !== null && stepRate < worstRate) { worstRate = stepRate; worstIdx = i; }
          return { ...s, pctOfSessions: f.sessions > 0 ? s.value / f.sessions : 0, stepRate, isBreak: false };
        });
        const cartRate = f.product_views > 0 ? f.add_to_cart / f.product_views : 1;
        const breakIdx = cartRate <= worstRate ? 2 : worstIdx;
        if (breakIdx >= 0) funnel[breakIdx].isBreak = true;
        const breakLabel = breakIdx >= 0 ? `${funnel[breakIdx - 1].label} → ${funnel[breakIdx].label}` : '—';

        // ── Catálogo GA4 · demanda por producto (solo propiedad principal) ──
        const isTest = (n: string) => /test|no comprar|prueba/i.test(n);
        const perf = new Map<string, { v: number; a: number; c: number; p: number; rev: number }>();
        let siteV = 0, siteA = 0;
        for (const r of itemRows) {
          const n = r.item_name || '';
          if (!n || isTest(n)) continue;
          const e = perf.get(n) || { v: 0, a: 0, c: 0, p: 0, rev: 0 };
          e.v += Number(r.items_viewed) || 0; e.a += Number(r.items_added_to_cart) || 0;
          e.c += Number(r.items_checked_out) || 0; e.p += Number(r.items_purchased) || 0;
          e.rev += Number(r.item_revenue) || 0;
          perf.set(n, e);
          siteV += Number(r.items_viewed) || 0; siteA += Number(r.items_added_to_cart) || 0;
        }
        const siteAtcRate = siteV > 0 ? siteA / siteV : 0;
        const MIN_VIEWS = 8;
        const catalogGa4: ProductPerf[] = Array.from(perf.entries())
          .filter(([, e]) => e.v >= MIN_VIEWS)
          .map(([name, e]) => {
            const atcRate = e.v > 0 ? e.a / e.v : 0;
            const cvr = e.v > 0 ? e.p / e.v : 0;
            let label: ProductLabel = 'mantener';
            if (atcRate >= siteAtcRate * 1.6 && e.a >= 2) label = 'potencial';
            else if (e.v >= 100 && atcRate < siteAtcRate * 0.8) label = 'optimizar';
            else if (e.v < 25 && e.a === 0) label = 'baja';
            return { name, views: e.v, atc: e.a, atcRate, checkout: e.c, purchases: e.p, cvr, revenue: e.rev, label };
          });
        const ORD: Record<ProductLabel, number> = { potencial: 0, optimizar: 1, mantener: 2, baja: 3 };
        catalogGa4.sort((a, b) => (ORD[a.label] - ORD[b.label]) || b.views - a.views);
        const ga4LabelCounts = catalogGa4.reduce((acc, p) => { acc[p.label] = (acc[p.label] || 0) + 1; return acc; },
          { potencial: 0, optimizar: 0, baja: 0, mantener: 0 } as Record<ProductLabel, number>);

        // ── Tráfico / engagement (solo propiedad principal) ──
        const isMain = (sm: unknown) => String(sm || '').split('/')[0].trim() === MAIN_PROPERTY;
        let sess = 0, bw = 0;
        const chMap = new Map<string, number>();
        for (const r of metricNow) {
          if (!isMain(r.source_medium)) continue;
          const s = Number(r.sessions) || 0; sess += s; bw += (Number(r.bounce_rate) || 0) * s;
          const ch = String(r.source_medium || '').split('/').slice(1).join('/').trim() || '(sin canal)';
          chMap.set(ch, (chMap.get(ch) || 0) + s);
        }
        let sessPrev = 0;
        for (const r of metricPrev) if (isMain(r.source_medium)) sessPrev += Number(r.sessions) || 0;
        const channels = Array.from(chMap.entries())
          .map(([label, s]) => ({ label, sessions: s, pct: sess > 0 ? s / sess : 0 }))
          .sort((a, b) => b.sessions - a.sessions).slice(0, 6);

        setData({
          funnel, breakLabel,
          productViews: f.product_views,
          catalogGa4, ga4LabelCounts, siteAtcRate,
          sessions: sess, sessionsDelta: calcDelta(sess, sessPrev), bounceRate: sess > 0 ? bw / sess : 0,
          channels,
          from: range.from, to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useEcommerceWeb]', e);
        setError(e?.message || 'Error cargando el análisis ecommerce');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [clientId, range.from, range.to, previous.from, previous.to, tick]);

  return { data, loading, error, refresh: () => setTick((t) => t + 1) };
}
