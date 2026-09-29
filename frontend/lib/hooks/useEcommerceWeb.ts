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

// ── Canales por web (P1) ── de dónde viene el tráfico y la venta en cada web.
export interface WebChannel {
  channel: string;
  sessions: number; revenue: number; revPerSession: number;
  sessPct: number;   // % de sesiones de la web
  revPct: number;    // % de la venta GA4 de la web (0 si la web no reporta venta)
  sessDelta: number; // % vs período anterior (mismo canal, misma web)
  isPaid: boolean;   // canal de pauta (paid social, cpc, display, video, cross-network)
}
export interface WebChannels {
  property: string; label: string; kind: 'main' | 'shopify';
  sessions: number; revenue: number;
  ga4Tracks: boolean;              // ¿esta web reporta venta en GA4?
  channels: WebChannel[];          // ordenados por venta (main) o sesiones (shopify)
  topPaid?: WebChannel;            // mejor canal de pauta (para el titular)
  topOrganic?: WebChannel;         // mejor canal orgánico (para el titular)
}

// ── Carritos abandonados + recuperación (P2) ── caja que inicia checkout y no paga.
export interface AbandonData {
  count: number;          // checkouts abandonados (no recuperados) en el período
  value: number;          // valor listado de esos carritos (NO recuperable 1:1)
  recovered: number;      // checkouts recuperados
  recoveryRate: number;   // recovered / (count + recovered)
  avgValue: number;       // ticket abandonado promedio (value / count)
  countDelta: number;     // % vs período anterior
  valueDelta: number;     // % vs período anterior
  purchases: number;      // compras del período (contexto: abandono vs compra)
  hasFlow: boolean;       // ¿existe algún recupero? (recovered > 0)
  series: { date: string; value: number; count: number }[]; // mini-tendencia diaria
}

// ── Salud de venta y clientes (P4) ── pedidos reales de Shopify.
export interface SalesHealth {
  orders: number; ordersDelta: number;
  revenue: number; aov: number;              // ticket promedio = revenue / pedidos
  newCustomers: number; returningCustomers: number; returningPct: number;
  refundsValue: number; ordersRefunded: number; refundRate: number; netRevenue: number;
  ordersPaid: number; ordersPending: number; ordersAuthorized: number; ordersVoided: number;
  revenuePending: number; units: number;
  hasOrders: boolean;
}

// ── Landing pages que convierten (P3) ── a dónde mandar la pauta cara.
export interface LandingPerf {
  page: string; property: string; kind: 'main' | 'shopify';
  sessions: number; bounce: number;
  atc: number; atcRate: number;          // intención (carrito/sesiones) — señal fiable
  checkout: number; purchases: number; revenue: number;
  cvr: number;                            // compras/sesiones (GA4 sub-registra: referencial)
}

export type ShopLabel = 'hero' | 'cobrar' | 'solido';
export interface ShopProduct {
  title: string;
  unitsPaid: number; unitsPending: number;
  revPaid: number; revPending: number;
  shopLabel: ShopLabel;
  // Métricas robustas de venta (Shopify) — share sobre el total del catálogo.
  unitShare: number;   // % de las compras del catálogo (unidades)
  revShare: number;    // % del bruto del catálogo
  paidPct: number;     // % de su ingreso ya cobrado
  // Demanda GA4 (cruce EXACTO por nombre; ga4Tracked=false si GA4 no lo rastrea)
  views: number; atc: number; atcRate: number; viewShare: number; ga4Tracked: boolean;
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
  websChannels: WebChannels[]; // P1 · canales por web (tráfico + venta)
  abandon: AbandonData;        // P2 · carritos abandonados + recuperación
  salesHealth: SalesHealth;    // P4 · salud de venta y clientes (Shopify)
  landings: LandingPerf[];     // P3 · landing pages que convierten (por web)
  siteAtcRateLanding: number;  // baseline de % carrito de las landings (para resaltar)
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
        const [funnelRows, shopRows, itemRows, metricNow, metricPrev, abnNow, abnPrev, ordNow, ordPrev, landRows] = await Promise.all([
          fetchAll('ga4_funnel', 'sessions, product_views, add_to_cart, checkout_start, purchases', clientId, range.from, range.to),
          fetchAll('shopify_product_daily', 'title, units_paid, units_pending, revenue_paid, revenue_pending', clientId, range.from, range.to),
          fetchAll('ga4_items', 'item_name, items_viewed, items_added_to_cart, items_checked_out, items_purchased, item_revenue, property_id', clientId, range.from, range.to),
          fetchAll('ga4_metrics', 'sessions, new_users, active_users, bounce_rate, avg_session_duration, revenue, source_medium', clientId, range.from, range.to),
          fetchAll('ga4_metrics', 'sessions, source_medium', clientId, previous.from, previous.to),
          fetchAll('shopify_abandoned_checkouts', 'date, abandoned_count, abandoned_value, recovered_count, currency', clientId, range.from, range.to),
          fetchAll('shopify_abandoned_checkouts', 'abandoned_count, abandoned_value', clientId, previous.from, previous.to),
          fetchAll('shopify_orders', 'orders, revenue, new_customers, returning_customers, units_sold, refunds, orders_paid, orders_pending, orders_authorized, orders_refunded, orders_voided, revenue_pending', clientId, range.from, range.to),
          fetchAll('shopify_orders', 'orders', clientId, previous.from, previous.to),
          fetchAll('ga4_landing', 'landing_page, sessions, bounce_rate, add_to_cart, checkout, purchases, revenue, property_id', clientId, range.from, range.to),
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

        // Índice GA4 (sitio principal) por tokens para cruzar demanda con Shopify.
        // Match EXACTO por subconjunto de tokens conservando el nº de modelo → sin
        // falsos positivos (no confunde "Jordan 12 Bloodline" con "…Blueberry").
        const MATCH_STOP = new Set(['tenis', 'the', 'de', 'del', 'mx', 'us', 'eu', 'talla']);
        const mtokens = (s: string) => new Set(norm(s).split(' ').filter((t) => t && !MATCH_STOP.has(t)));
        const isTestName = (n: string) => /test|no comprar|prueba/i.test(n);
        const ga4Idx: { tok: Set<string>; v: number; a: number }[] = [];
        let siteViewsGa4 = 0;
        {
          const m = new Map<string, { v: number; a: number }>();
          for (const r of itemRows) {
            if (String(r.property_id) !== MAIN_PROPERTY) continue;
            const n = r.item_name || ''; if (!n || isTestName(n)) continue;
            const e = m.get(n) || { v: 0, a: 0 };
            e.v += Number(r.items_viewed) || 0; e.a += Number(r.items_added_to_cart) || 0;
            m.set(n, e);
          }
          for (const [n, e] of m) { ga4Idx.push({ tok: mtokens(n), v: e.v, a: e.a }); siteViewsGa4 += e.v; }
        }
        const matchGa4 = (title: string) => {
          const tt = mtokens(title); if (tt.size === 0) return null;
          let best: { v: number; a: number } | null = null;
          for (const g of ga4Idx) {
            let subset = true; for (const t of tt) if (!g.tok.has(t)) { subset = false; break; }
            if (subset && (!best || g.v > best.v)) best = { v: g.v, a: g.a };
          }
          return best;
        };

        // Hero (a menor escala): top venta PAGADA con cobro sano (pagado ≥ pendiente).
        // Un producto grande pero mayormente pendiente NO es hero → cae a "cobrar".
        const heroTitles = new Set(
          base.filter((p) => p.revPaid > 0 && p.revPaid >= p.revPending)
            .sort((a, b) => b.revPaid - a.revPaid).slice(0, 3).map((p) => p.title),
        );
        const totUnits = base.reduce((s, p) => s + p.unitsPaid + p.unitsPending, 0);
        const totBruto = base.reduce((s, p) => s + p.revPaid + p.revPending, 0);
        const products: ShopProduct[] = base
          .map((p) => {
            let shopLabel: ShopLabel = 'solido';
            if (heroTitles.has(p.title)) shopLabel = 'hero';             // sostiene la caja → escalar
            else if (p.revPending > p.revPaid) shopLabel = 'cobrar';     // plata atrapada en pendiente
            else shopLabel = 'solido';                                   // paga limpio, volumen menor
            const gross = p.revPaid + p.revPending;
            const units = p.unitsPaid + p.unitsPending;
            const g = matchGa4(p.title);
            return {
              ...p, shopLabel,
              unitShare: totUnits > 0 ? units / totUnits : 0,
              revShare: totBruto > 0 ? gross / totBruto : 0,
              paidPct: gross > 0 ? p.revPaid / gross : 0,
              views: g ? g.v : 0, atc: g ? g.a : 0,
              atcRate: g && g.v > 0 ? g.a / g.v : 0,
              viewShare: g && siteViewsGa4 > 0 ? g.v / siteViewsGa4 : 0,
              ga4Tracked: !!(g && g.v > 0),
            };
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
        // ── CANALES POR WEB (P1) ── sesiones + venta GA4 por (web, canal), con
        // delta vs período anterior. La venta solo la reporta el sitio principal;
        // en la web Shopify GA4 mide tráfico pero no valoriza (la venta vive en Shopify).
        const chAgg = new Map<string, Map<string, { s: number; rev: number }>>();
        for (const r of metricNow) {
          const pid = String(r.source_medium || '').split('/')[0].trim();
          if (!PROP_META[pid]) continue;
          const ch = String(r.source_medium || '').split('/').slice(1).join('/').trim() || '(sin canal)';
          const m = chAgg.get(pid) || new Map<string, { s: number; rev: number }>();
          const e = m.get(ch) || { s: 0, rev: 0 };
          e.s += Number(r.sessions) || 0; e.rev += Number(r.revenue) || 0;
          m.set(ch, e); chAgg.set(pid, m);
        }
        const chPrev = new Map<string, Map<string, number>>();
        for (const r of metricPrev) {
          const pid = String(r.source_medium || '').split('/')[0].trim();
          if (!PROP_META[pid]) continue;
          const ch = String(r.source_medium || '').split('/').slice(1).join('/').trim() || '(sin canal)';
          const m = chPrev.get(pid) || new Map<string, number>();
          m.set(ch, (m.get(ch) || 0) + (Number(r.sessions) || 0));
          chPrev.set(pid, m);
        }
        const websChannels: WebChannels[] = Object.keys(PROP_META).map((pid) => {
          const meta = PROP_META[pid];
          const m = chAgg.get(pid) || new Map<string, { s: number; rev: number }>();
          const totS = [...m.values()].reduce((a, e) => a + e.s, 0);
          const totR = [...m.values()].reduce((a, e) => a + e.rev, 0);
          const prevM = chPrev.get(pid) || new Map<string, number>();
          const channels: WebChannel[] = [...m.entries()].map(([channel, e]) => ({
            channel, sessions: e.s, revenue: e.rev,
            revPerSession: e.s > 0 ? e.rev / e.s : 0,
            sessPct: totS > 0 ? e.s / totS : 0,
            revPct: totR > 0 ? e.rev / totR : 0,
            sessDelta: calcDelta(e.s, prevM.get(channel) || 0),
            isPaid: PAID_CH.test(channel),
          }));
          // Orden: por venta si la web valoriza (main), si no por sesiones (shopify).
          const tracks = totR > 0;
          channels.sort((a, b) => (tracks ? b.revenue - a.revenue : b.sessions - a.sessions) || b.sessions - a.sessions);
          const topPaid = [...channels].filter((c) => c.isPaid).sort((a, b) => (tracks ? b.revenue - a.revenue : b.sessions - a.sessions))[0];
          const topOrganic = [...channels].filter((c) => !c.isPaid).sort((a, b) => (tracks ? b.revenue - a.revenue : b.sessions - a.sessions))[0];
          return { property: pid, label: meta.label, kind: meta.kind, sessions: totS, revenue: totR, ga4Tracks: tracks, channels, topPaid, topOrganic };
        }).filter((w) => w.sessions > 0).sort((a, b) => b.revenue - a.revenue || b.sessions - a.sessions);

        // ── CARRITOS ABANDONADOS + RECUPERACIÓN (P2) ── venta que inicia checkout
        // y no paga. El valor listado NO es caja recuperable 1:1 (ticket alto,
        // multi-ítem) — se muestra como oportunidad, con la tasa de recupero real.
        let abnCount = 0, abnValue = 0, abnRec = 0;
        const abnSeriesMap = new Map<string, { value: number; count: number }>();
        for (const r of abnNow) {
          const c = Number(r.abandoned_count) || 0, v = Number(r.abandoned_value) || 0, rec = Number(r.recovered_count) || 0;
          abnCount += c; abnValue += v; abnRec += rec;
          const d = String(r.date || '');
          const e = abnSeriesMap.get(d) || { value: 0, count: 0 };
          e.value += v; e.count += c; abnSeriesMap.set(d, e);
        }
        let abnCountPrev = 0, abnValuePrev = 0;
        for (const r of abnPrev) { abnCountPrev += Number(r.abandoned_count) || 0; abnValuePrev += Number(r.abandoned_value) || 0; }
        const abandon: AbandonData = {
          count: abnCount, value: abnValue, recovered: abnRec,
          recoveryRate: (abnCount + abnRec) > 0 ? abnRec / (abnCount + abnRec) : 0,
          avgValue: abnCount > 0 ? abnValue / abnCount : 0,
          countDelta: calcDelta(abnCount, abnCountPrev),
          valueDelta: calcDelta(abnValue, abnValuePrev),
          purchases: f.purchases,
          hasFlow: abnRec > 0,
          series: Array.from(abnSeriesMap.entries()).map(([date, e]) => ({ date, ...e })).sort((a, b) => a.date.localeCompare(b.date)),
        };

        // ── SALUD DE VENTA Y CLIENTES (P4) ── pedidos reales de Shopify:
        // ticket promedio, nuevos vs recurrentes (retención), reembolsos (neto)
        // y estado de cobro a nivel pedido.
        const oa = { orders: 0, revenue: 0, newC: 0, retC: 0, units: 0, refunds: 0, paid: 0, pending: 0, auth: 0, refunded: 0, voided: 0, revPend: 0 };
        for (const r of ordNow) {
          oa.orders += Number(r.orders) || 0; oa.revenue += Number(r.revenue) || 0;
          oa.newC += Number(r.new_customers) || 0; oa.retC += Number(r.returning_customers) || 0;
          oa.units += Number(r.units_sold) || 0; oa.refunds += Number(r.refunds) || 0;
          oa.paid += Number(r.orders_paid) || 0; oa.pending += Number(r.orders_pending) || 0;
          oa.auth += Number(r.orders_authorized) || 0; oa.refunded += Number(r.orders_refunded) || 0;
          oa.voided += Number(r.orders_voided) || 0; oa.revPend += Number(r.revenue_pending) || 0;
        }
        let ordersPrev = 0; for (const r of ordPrev) ordersPrev += Number(r.orders) || 0;
        const totCust = oa.newC + oa.retC;
        const salesHealth: SalesHealth = {
          orders: oa.orders, ordersDelta: calcDelta(oa.orders, ordersPrev),
          revenue: oa.revenue, aov: oa.orders > 0 ? oa.revenue / oa.orders : 0,
          newCustomers: oa.newC, returningCustomers: oa.retC,
          returningPct: totCust > 0 ? oa.retC / totCust : 0,
          refundsValue: oa.refunds, ordersRefunded: oa.refunded,
          refundRate: oa.orders > 0 ? oa.refunded / oa.orders : 0,
          netRevenue: oa.revenue - oa.refunds,
          ordersPaid: oa.paid, ordersPending: oa.pending, ordersAuthorized: oa.auth, ordersVoided: oa.voided,
          revenuePending: oa.revPend, units: oa.units, hasOrders: oa.orders > 0,
        };

        // ── LANDING PAGES QUE CONVIERTEN (P3) ── por web: intención (carrito) y
        // rebote para decidir a dónde mandar la pauta. La compra GA4 sub-registra,
        // por eso la señal fiable es % carrito + rebote (la venta real está en Shopify).
        const landMap = new Map<string, { pid: string; page: string; s: number; bw: number; atc: number; co: number; pu: number; rev: number }>();
        for (const r of landRows) {
          const pid = String(r.property_id || '');
          if (!PROP_META[pid]) continue;
          const page = String(r.landing_page || '(no set)');
          const key = pid + '|' + page;
          const e = landMap.get(key) || { pid, page, s: 0, bw: 0, atc: 0, co: 0, pu: 0, rev: 0 };
          const s = Number(r.sessions) || 0;
          e.s += s; e.bw += (Number(r.bounce_rate) || 0) * s;
          e.atc += Number(r.add_to_cart) || 0; e.co += Number(r.checkout) || 0;
          e.pu += Number(r.purchases) || 0; e.rev += Number(r.revenue) || 0;
          landMap.set(key, e);
        }
        let landV = 0, landA = 0;
        const landings: LandingPerf[] = Array.from(landMap.values())
          .filter((e) => e.s >= 10)
          .map((e) => {
            landV += e.s; landA += e.atc;
            return {
              page: e.page, property: e.pid, kind: PROP_META[e.pid].kind,
              sessions: e.s, bounce: e.s > 0 ? e.bw / e.s : 0,
              atc: e.atc, atcRate: e.s > 0 ? e.atc / e.s : 0,
              checkout: e.co, purchases: e.pu, revenue: e.rev,
              cvr: e.s > 0 ? e.pu / e.s : 0,
            };
          })
          .sort((a, b) => b.sessions - a.sessions)
          .slice(0, 60);
        const siteAtcRateLanding = landV > 0 ? landA / landV : 0;

        // Veredicto: la web con mayor $/sesión (venta real) es la de mejor retorno por tráfico.
        const win = webs[0];
        const investLabel = win ? win.label : '—';
        const investReason = win ? win.kind : ''; // el texto se compone en la vista con la moneda

        setData({
          funnel, breakLabel,
          webs, websChannels, abandon, salesHealth, landings, siteAtcRateLanding, investLabel, investReason,
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
