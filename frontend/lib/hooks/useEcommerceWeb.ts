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
const SHOPIFY_PROPERTY = '523524806'; // tienda Shopify (/products/)
const PROP_META: Record<string, { label: string; kind: 'main' | 'shopify' }> = {
  '508597206': { label: 'sneakerstore.com.mx', kind: 'main' },
  '523524806': { label: 'Tienda Shopify', kind: 'shopify' },
};
const PAID_CH = /paid|cross-network|display|cpc|\bads\b|video/i;

export interface WebPerf {
  property: string; label: string; kind: 'main' | 'shopify';
  sessions: number; newPct: number; bounce: number; avgDur: number;
  realRevenue: number; revSource: 'GA4' | 'Shopify (pagado)';
  revPerSession: number; ga4Tracks: boolean;
  paidShare: number; topChannel: string;
}

export interface FunnelStep { key: string; label: string; value: number; pctOfSessions: number; stepRate: number | null; isBreak: boolean }

export type ShopLabel = 'hero' | 'cobrar' | 'solido';
export interface ShopProduct {
  title: string;
  unitsPaid: number; unitsPending: number;
  revPaid: number; revPending: number;
  shopLabel: ShopLabel;
}

export interface ViewedProduct { name: string; views: number; sold: boolean }

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
  // Venta real (Shopify) · paid vs pending
  revBruto: number;
  revPaid: number; revPending: number; paidPct: number;
  unitsPaid: number; unitsPending: number;
  aovPaid: number;              // ticket promedio pagado
  products: ShopProduct[];      // por revenue total desc
  // Comparativa de webs + veredicto de inversión
  webs: WebPerf[];
  investLabel: string;      // web recomendada para escalar
  investReason: string;
  // Demanda (GA4 vistas)
  topViewed: ViewedProduct[];
  viewedTotalProducts: number;
  productViews: number;
  // Catálogo inteligente · Analytics (GA4 · comportamiento, todos los canales)
  catalogGa4: ProductPerf[];
  ga4LabelCounts: Record<ProductLabel, number>;
  siteAtcRate: number;      // baseline del sitio (carrito/vistas)
  // Catálogo inteligente · Shopify (venta real) — labels en `products`
  shopLabelCounts: Record<ShopLabel, number>;
  // Tráfico / engagement (sitio principal)
  sessions: number; sessionsDelta: number;
  bounceRate: number;
  channels: { label: string; sessions: number; pct: number }[];
  ga4Revenue: number;
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

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

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
        const [funnelRows, shopRows, itemRows, metricNow, metricPrev] = await Promise.all([
          fetchAll('ga4_funnel', 'sessions, product_views, add_to_cart, checkout_start, purchases', clientId, range.from, range.to),
          fetchAll('shopify_product_daily', 'title, units_paid, units_pending, revenue_paid, revenue_pending', clientId, range.from, range.to),
          fetchAll('ga4_items', 'item_name, items_viewed, items_added_to_cart, items_checked_out, items_purchased, item_revenue, property_id', clientId, range.from, range.to),
          fetchAll('ga4_metrics', 'sessions, new_users, active_users, bounce_rate, avg_session_duration, revenue, source_medium', clientId, range.from, range.to),
          fetchAll('ga4_metrics', 'sessions', clientId, previous.from, previous.to),
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
        // step rate = paso / paso anterior; el quiebre = menor tasa (excluye vistas>sesiones)
        let worstIdx = -1, worstRate = Infinity;
        const funnel: FunnelStep[] = steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1].value : 0;
          const stepRate = i > 0 && prev > 0 ? s.value / prev : null;
          if (i >= 2 && stepRate !== null && stepRate < worstRate) { worstRate = stepRate; worstIdx = i; }
          return { ...s, pctOfSessions: f.sessions > 0 ? s.value / f.sessions : 0, stepRate, isBreak: false };
        });
        // marca el quiebre en el paso de PEOR conversión (a partir de vistas→carrito)
        const cartRate = f.product_views > 0 ? f.add_to_cart / f.product_views : 1;
        const breakIdx = cartRate <= worstRate ? 2 : worstIdx; // prioriza vista→carrito si es el peor
        if (breakIdx >= 0) funnel[breakIdx].isBreak = true;
        const breakLabel = breakIdx >= 0 ? `${funnel[breakIdx - 1].label} → ${funnel[breakIdx].label}` : '—';

        // ── Venta real Shopify (paid vs pending) ──
        const pmap = new Map<string, { up: number; un: number; rp: number; rn: number }>();
        for (const r of shopRows) {
          const t = r.title || '(sin título)';
          const e = pmap.get(t) || { up: 0, un: 0, rp: 0, rn: 0 };
          e.up += Number(r.units_paid) || 0; e.un += Number(r.units_pending) || 0;
          e.rp += Number(r.revenue_paid) || 0; e.rn += Number(r.revenue_pending) || 0;
          pmap.set(t, e);
        }
        const itemAgg = new Map<string, number>();
        for (const r of itemRows) {
          const n = r.item_name || ''; itemAgg.set(n, (itemAgg.get(n) || 0) + (Number(r.items_viewed) || 0));
        }

        // ── CATÁLOGO SHOPIFY (venta real) — etiquetado SOLO con datos de Shopify ──
        const base = Array.from(pmap.entries()).map(([title, e]) => ({
          title, unitsPaid: e.up, unitsPending: e.un, revPaid: e.rp, revPending: e.rn,
        }));
        // Hero (a menor escala): top venta PAGADA con cobro sano (pagado ≥ pendiente).
        // Un producto grande pero mayormente pendiente NO es hero → cae a "cobrar".
        const heroTitles = new Set(
          base.filter((p) => p.revPaid > 0 && p.revPaid >= p.revPending)
            .sort((a, b) => b.revPaid - a.revPaid).slice(0, 3).map((p) => p.title),
        );
        const products: ShopProduct[] = base
          .map((p) => {
            let shopLabel: ShopLabel = 'solido';
            if (heroTitles.has(p.title)) shopLabel = 'hero';             // sostiene la caja → escalar
            else if (p.revPending > p.revPaid) shopLabel = 'cobrar';     // plata atrapada en pendiente
            else shopLabel = 'solido';                                   // paga limpio, volumen menor
            return { ...p, shopLabel };
          })
          .sort((a, b) => (b.revPaid + b.revPending) - (a.revPaid + a.revPending));
        const revPaid = products.reduce((s, p) => s + p.revPaid, 0);
        const revPending = products.reduce((s, p) => s + p.revPending, 0);
        const unitsPaid = products.reduce((s, p) => s + p.unitsPaid, 0);
        const unitsPending = products.reduce((s, p) => s + p.unitsPending, 0);
        const revBruto = revPaid + revPending;
        const shopLabelCounts = products.reduce((acc, p) => { acc[p.shopLabel] = (acc[p.shopLabel] || 0) + 1; return acc; },
          { hero: 0, cobrar: 0, solido: 0 } as Record<ShopLabel, number>);

        // ── Demanda GA4 (top vistos) ──
        const topViewed: ViewedProduct[] = Array.from(itemAgg.entries())
          .filter(([n]) => n && !norm(n).startsWith('test'))
          .map(([name, views]) => ({ name, views, sold: false }))
          .sort((a, b) => b.views - a.views)
          .slice(0, 15);

        // ── CATÁLOGO ANALYTICS (GA4 · comportamiento) — etiquetado SOLO con GA4 ──
        // El item-tracking bueno vive en la web principal (508597206). No se cruza con Shopify.
        const isTest = (n: string) => /test|no comprar|prueba/i.test(n);
        const perf = new Map<string, { v: number; a: number; c: number; p: number; rev: number }>();
        let siteV = 0, siteA = 0;
        for (const r of itemRows) {
          if (r.property_id !== MAIN_PROPERTY) continue;
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
            if (atcRate >= siteAtcRate * 1.6 && e.a >= 2) label = 'potencial';        // buen carrito → escalar tráfico
            else if (e.v >= 100 && atcRate < siteAtcRate * 0.8) label = 'optimizar';  // muchas vistas, poco carrito
            else if (e.v < 25 && e.a === 0) label = 'baja';                           // baja tracción
            return { name, views: e.v, atc: e.a, atcRate, checkout: e.c, purchases: e.p, cvr, revenue: e.rev, label };
          });
        const ORD: Record<ProductLabel, number> = { potencial: 0, optimizar: 1, mantener: 2, baja: 3 };
        catalogGa4.sort((a, b) => (ORD[a.label] - ORD[b.label]) || b.views - a.views);
        const ga4LabelCounts = catalogGa4.reduce((acc, p) => { acc[p.label] = (acc[p.label] || 0) + 1; return acc; },
          { potencial: 0, optimizar: 0, baja: 0, mantener: 0 } as Record<ProductLabel, number>);

        // ── Tráfico / engagement (sitio principal) ──
        let sess = 0, bw = 0, ga4rev = 0;
        const chMap = new Map<string, number>();
        for (const r of metricNow) {
          const sm = String(r.source_medium || '');
          if (sm.split('/')[0].trim() !== MAIN_PROPERTY) continue;
          const s = Number(r.sessions) || 0; sess += s; bw += (Number(r.bounce_rate) || 0) * s;
          ga4rev += Number(r.revenue) || 0;
          const ch = sm.split('/').slice(1).join('/').trim() || '(sin canal)';
          chMap.set(ch, (chMap.get(ch) || 0) + s);
        }
        let sessPrev = 0;
        for (const r of metricPrev) sessPrev += Number(r.sessions) || 0; // prev todas las props (aprox)
        const channels = Array.from(chMap.entries())
          .map(([label, s]) => ({ label, sessions: s, pct: sess > 0 ? s / sess : 0 }))
          .sort((a, b) => b.sessions - a.sessions).slice(0, 6);

        // ── Comparativa de webs (por propiedad) ──
        const wagg = new Map<string, { s: number; nu: number; u: number; bw: number; dw: number; rev: number; ch: Map<string, number> }>();
        for (const r of metricNow) {
          const pid = String(r.source_medium || '').split('/')[0].trim();
          if (!PROP_META[pid]) continue;
          const w = wagg.get(pid) || { s: 0, nu: 0, u: 0, bw: 0, dw: 0, rev: 0, ch: new Map() };
          const s = Number(r.sessions) || 0;
          w.s += s; w.nu += Number(r.new_users) || 0; w.u += Number(r.active_users) || 0;
          w.bw += (Number(r.bounce_rate) || 0) * s; w.dw += (Number(r.avg_session_duration) || 0) * s;
          w.rev += Number(r.revenue) || 0;
          const ch = String(r.source_medium || '').split('/').slice(1).join('/').trim() || '(sin canal)';
          w.ch.set(ch, (w.ch.get(ch) || 0) + s);
          wagg.set(pid, w);
        }
        const webs: WebPerf[] = Object.keys(PROP_META).map((pid) => {
          const w = wagg.get(pid) || { s: 0, nu: 0, u: 0, bw: 0, dw: 0, rev: 0, ch: new Map() };
          const meta = PROP_META[pid];
          const isShop = meta.kind === 'shopify';
          const realRevenue = isShop ? revPaid : w.rev;
          let paid = 0; for (const [c, cs] of w.ch) if (PAID_CH.test(c)) paid += cs;
          const topChannel = Array.from(w.ch.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
          return {
            property: pid, label: meta.label, kind: meta.kind,
            sessions: w.s, newPct: w.u > 0 ? w.nu / w.u : 0, bounce: w.s > 0 ? w.bw / w.s : 0,
            avgDur: w.s > 0 ? w.dw / w.s : 0,
            realRevenue, revSource: (isShop ? 'Shopify (pagado)' : 'GA4') as WebPerf['revSource'],
            revPerSession: w.s > 0 ? realRevenue / w.s : 0,
            ga4Tracks: !isShop || w.rev > 0, paidShare: w.s > 0 ? paid / w.s : 0, topChannel,
          };
        }).filter((w) => w.sessions > 0).sort((a, b) => b.revPerSession - a.revPerSession);
        // Veredicto: la web con mayor $/sesión (venta real) es la de mejor retorno por tráfico.
        const win = webs[0];
        const investLabel = win ? win.label : '—';
        const investReason = win ? win.kind : ''; // el texto se compone en la vista con la moneda

        setData({
          funnel, breakLabel,
          webs, investLabel, investReason,
          revBruto, revPaid, revPending, paidPct: revBruto > 0 ? revPaid / revBruto : 0,
          unitsPaid, unitsPending, aovPaid: unitsPaid > 0 ? revPaid / unitsPaid : 0,
          products,
          topViewed, viewedTotalProducts: itemAgg.size, productViews: f.product_views,
          catalogGa4, ga4LabelCounts, siteAtcRate, shopLabelCounts,
          sessions: sess, sessionsDelta: calcDelta(sess, sessPrev), bounceRate: sess > 0 ? bw / sess : 0,
          channels, ga4Revenue: ga4rev,
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
