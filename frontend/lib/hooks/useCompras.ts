'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DateRange } from '@/lib/period';

// ============================================================
// useCompras — hoja de Compras (diagnóstico Meta Advantage+ + Shopify)
// Lee y agrega: meta_campaigns (Advantage+, 2 conjuntos), shopify_orders,
// shopify_products (pagado/pendiente por par), ga4_items (comportamiento por
// par), meta_breakdowns (segmento + plataforma) y meta_ad_creatives (media).
// ============================================================

const CAMP_PREFIX = 'Advantage+ | Full funnel';
const PAGE = 1000;

function grp(adset: string | null): 'Best Sellers' | 'Próximos lanzamientos' | null {
  const a = (adset || '').trim();
  if (a.startsWith('Best Sellers')) return 'Best Sellers';
  if (a.startsWith('Próximos')) return 'Próximos lanzamientos';
  return null;
}
const n = (v: unknown) => Number(v || 0);
const div = (a: number, b: number, d = 2) => (b ? +(a / b).toFixed(d) : 0);

export interface SetMetrics {
  spend: number; impressions: number; reach: number; link_clicks: number;
  landing: number; cart: number; checkout: number; purchases: number; purchase_value: number;
  roas: number; cost_purchase: number; aov: number; ctr: number; cpc: number; cpm: number; freq: number;
}
export interface Pair {
  name: string; views: number; atc: number; checkout: number;
  sold: number; sold_rev: number; rev_paid: number; rev_pend: number; rcvr: number;
}
export interface SegRow { name: string; spend: number; buy: number; val: number; roas: number; pct: number; }
export interface PlatRow { key: string; spend: number; buy: number; val: number; roas: number; }
export interface Creative {
  ad_id: string; name: string; adset: string; is_video: boolean;
  image_url: string; thumbnail_url: string; video_id: string;
  title: string; body: string; cta: string;
  spend: number; impr: number; reach: number; link: number; ctr: number; cpm: number; freq: number;
  cpc: number; landing: number; cost_land: number; atc: number; cost_atc: number;
  chk: number; cost_chk: number; buy: number; cost_buy: number; pv: number; roas: number; hold: number;
  plat: Record<string, { spend: number; buy: number; val: number }>;
}
export interface DailyRow { date: string; spend: number; purchase_value: number; purchases: number; checkout: number; }
export interface StoreCobro { orders: number; orders_paid: number; orders_pending: number; revenue: number; revenue_paid: number; revenue_pending: number; paid_pct: number; roas_collected: number }
export interface ComprasData {
  from: string; to: string;
  prevFrom: string; prevTo: string;
  sets: Record<string, SetMetrics>;
  totals: SetMetrics;
  prevTotals: SetMetrics; // mismo embudo, periodo de comparación (para Δ por paso)
  store: StoreCobro;
  prevStore: StoreCobro; // cobro del periodo de comparación
  pairs: Pair[];
  segments: SegRow[];
  platforms: PlatRow[];
  segPlatform: Record<string, { spend: number; buy: number; val: number }>;
  creatives: Creative[];
  daily: DailyRow[];
}

async function page<T>(table: string, cols: string, clientId: string, extra?: (q: any) => any): Promise<T[]> {
  const all: T[] = [];
  let off = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase.from(table).select(cols).eq('client_id', clientId).range(off, off + PAGE - 1);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data || []) as T[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    off += PAGE;
  }
  return all;
}

function toks(s: string): Set<string> {
  const x = s.toLowerCase().replace(/^(tenis|botas)\s+/, '').replace(/\b20\d\d\b/g, ' ').replace(/[^a-z0-9 ]/g, ' ');
  return new Set(x.split(/\s+/).filter((w) => w.length > 1));
}

export function useCompras(clientId: string, range: DateRange, previous?: DateRange) {
  const [data, setData] = useState<ComprasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevFrom = previous?.from || range.from, prevTo = previous?.to || range.to;

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const from = range.from, to = range.to;
        const cfCols = 'campaign_name,adset_name,spend,impressions,reach,link_clicks,landing_page_views,add_to_cart,initiate_checkout,purchases,purchase_value';
        const [mc, so, sp, gi, bd, cr, mcPrev, soPrev] = await Promise.all([
          page<any>('meta_campaigns',
            'date,campaign_name,adset_name,ad_id,ad_name,spend,impressions,reach,link_clicks,landing_page_views,add_to_cart,initiate_checkout,purchases,purchase_value,thruplay,ctr',
            clientId, (q) => q.gte('date', from).lte('date', to)),
          page<any>('shopify_orders', 'date,orders,orders_paid,orders_pending,revenue,revenue_pending',
            clientId, (q) => q.gte('date', from).lte('date', to)),
          page<any>('shopify_products', 'period_end,title,units_sold,revenue,revenue_paid,revenue_pending,units_paid,units_pending', clientId),
          page<any>('ga4_items', 'item_name,items_viewed,items_added_to_cart,items_checked_out,items_purchased,item_revenue',
            clientId, (q) => q.gte('date', from).lte('date', to)),
          page<any>('meta_breakdowns', 'level,breakdown_type,breakdown_value,campaign_name,adset_name,entity_id,spend,purchases,purchase_value', clientId),
          page<any>('meta_ad_creatives', 'ad_id,ad_name,adset_name,campaign_name,is_video,image_url,thumbnail_url,video_id,title,body,cta', clientId),
          // Periodo de comparación (para Δ por paso del embudo): solo el embudo Advantage+ y el cobro.
          page<any>('meta_campaigns', 'date,' + cfCols, clientId, (q) => q.gte('date', prevFrom).lte('date', prevTo)),
          page<any>('shopify_orders', 'date,orders,orders_paid,orders_pending,revenue,revenue_pending', clientId, (q) => q.gte('date', prevFrom).lte('date', prevTo)),
        ]);

        // ---- META por conjunto + totales + diario + por anuncio ----
        const adv = mc.filter((r) => (r.campaign_name || '').startsWith(CAMP_PREFIX) && grp(r.adset_name));
        const setAcc: Record<string, any> = {};
        const daily: Record<string, DailyRow> = {};
        const adAcc: Record<string, any> = {};
        for (const r of adv) {
          const g = grp(r.adset_name)!;
          const S = (setAcc[g] ||= { spend: 0, impressions: 0, reach: 0, link_clicks: 0, landing: 0, cart: 0, checkout: 0, purchases: 0, purchase_value: 0 });
          S.spend += n(r.spend); S.impressions += n(r.impressions); S.reach += n(r.reach);
          S.link_clicks += n(r.link_clicks); S.landing += n(r.landing_page_views);
          S.cart += n(r.add_to_cart); S.checkout += n(r.initiate_checkout);
          S.purchases += n(r.purchases); S.purchase_value += n(r.purchase_value);
          const d = (daily[r.date] ||= { date: r.date, spend: 0, purchase_value: 0, purchases: 0, checkout: 0 });
          d.spend += n(r.spend); d.purchase_value += n(r.purchase_value); d.purchases += n(r.purchases); d.checkout += n(r.initiate_checkout);
          const A = (adAcc[r.ad_id] ||= { ad_id: r.ad_id, name: r.ad_name || '', adset: g, spend: 0, impr: 0, reach: 0, link: 0, landing: 0, atc: 0, chk: 0, buy: 0, pv: 0, thru: 0 });
          A.spend += n(r.spend); A.impr += n(r.impressions); A.reach += n(r.reach); A.link += n(r.link_clicks);
          A.landing += n(r.landing_page_views); A.atc += n(r.add_to_cart); A.chk += n(r.initiate_checkout);
          A.buy += n(r.purchases); A.pv += n(r.purchase_value); A.thru += n(r.thruplay);
        }
        const derive = (S: any): SetMetrics => ({
          spend: +S.spend.toFixed(2), impressions: S.impressions, reach: S.reach, link_clicks: S.link_clicks,
          landing: S.landing, cart: S.cart, checkout: S.checkout, purchases: S.purchases, purchase_value: +S.purchase_value.toFixed(2),
          roas: div(S.purchase_value, S.spend), cost_purchase: div(S.spend, S.purchases), aov: div(S.purchase_value, S.purchases),
          ctr: div(100 * S.link_clicks, S.impressions), cpc: div(S.spend, S.link_clicks),
          cpm: div(1000 * S.spend, S.impressions), freq: div(S.impressions, S.reach),
        });
        const sets: Record<string, SetMetrics> = {};
        for (const g of Object.keys(setAcc)) sets[g] = derive(setAcc[g]);
        const Tacc: any = { spend: 0, impressions: 0, reach: 0, link_clicks: 0, landing: 0, cart: 0, checkout: 0, purchases: 0, purchase_value: 0 };
        for (const g of Object.keys(setAcc)) for (const k of Object.keys(Tacc)) Tacc[k] += setAcc[g][k === 'link_clicks' ? 'link_clicks' : k] || 0;
        const totals = derive(Tacc);

        // ---- Store cobro (helper reusable para actual y periodo previo) ----
        const cobro = (rows: any[], spend: number): StoreCobro => {
          const st = { orders: 0, orders_paid: 0, orders_pending: 0, revenue: 0, revenue_pending: 0 };
          for (const r of rows) { st.orders += n(r.orders); st.orders_paid += n(r.orders_paid); st.orders_pending += n(r.orders_pending); st.revenue += n(r.revenue); st.revenue_pending += n(r.revenue_pending); }
          const revenue_paid = st.revenue - st.revenue_pending;
          return { ...st, revenue_paid, paid_pct: st.revenue ? Math.round((100 * revenue_paid) / st.revenue) : 0, roas_collected: div(revenue_paid, spend) };
        };
        const store = cobro(so, totals.spend);

        // ---- Embudo del periodo de comparación (Advantage+) para Δ por paso ----
        const prevAcc: any = { spend: 0, impressions: 0, reach: 0, link_clicks: 0, landing: 0, cart: 0, checkout: 0, purchases: 0, purchase_value: 0 };
        for (const r of mcPrev) {
          if (!(r.campaign_name || '').startsWith(CAMP_PREFIX) || !grp(r.adset_name)) continue;
          prevAcc.spend += n(r.spend); prevAcc.impressions += n(r.impressions); prevAcc.reach += n(r.reach);
          prevAcc.link_clicks += n(r.link_clicks); prevAcc.landing += n(r.landing_page_views);
          prevAcc.cart += n(r.add_to_cart); prevAcc.checkout += n(r.initiate_checkout);
          prevAcc.purchases += n(r.purchases); prevAcc.purchase_value += n(r.purchase_value);
        }
        const prevTotals = derive(prevAcc);
        const prevStore = cobro(soPrev, prevTotals.spend);

        // ---- Shopify por par (ventana más reciente) ----
        const maxpe = sp.reduce((m, r) => (r.period_end > m ? r.period_end : m), '');
        const spw = sp.filter((r) => r.period_end === maxpe);

        // ---- GA4 items por par ----
        const P: Record<string, any> = {};
        for (const r of gi) {
          const A = (P[r.item_name] ||= { name: r.item_name, views: 0, atc: 0, checkout: 0 });
          A.views += n(r.items_viewed); A.atc += n(r.items_added_to_cart); A.checkout += n(r.items_checked_out);
        }
        let pairs: Pair[] = Object.values(P).filter((p: any) => p.views >= 20).sort((a: any, b: any) => b.views - a.views);
        // cruce dedup con shopify
        const used = new Set<number>();
        for (const p of [...pairs].sort((a, b) => b.views - a.views)) {
          const gk = toks(p.name); let best = -1, bs = 0;
          spw.forEach((r, i) => {
            if (used.has(i)) return;
            const sk = toks(r.title); let inter = 0; gk.forEach((t) => { if (sk.has(t)) inter++; });
            if (inter < 2) return;
            const uni = new Set([...gk, ...sk]).size; const sc = inter / (uni || 1);
            if (sc > bs) { bs = sc; best = i; }
          });
          if (best >= 0 && bs >= 0.34) {
            used.add(best); const r = spw[best];
            p.sold = n(r.units_sold); p.sold_rev = +n(r.revenue).toFixed(2);
            p.rev_paid = +n(r.revenue_paid).toFixed(2); p.rev_pend = +n(r.revenue_pending).toFixed(2);
          } else { p.sold = 0; p.sold_rev = 0; p.rev_paid = 0; p.rev_pend = 0; }
          p.rcvr = div(100 * p.sold, p.views);
        }

        // ---- Segmentos + plataforma (meta_breakdowns Advantage+) ----
        const advbd = bd.filter((r) => (r.campaign_name || '').startsWith(CAMP_PREFIX) && grp(r.adset_name));
        const SEGLBL: Record<string, string> = { prospecting: 'Nuevos', engaged: 'Activos (engaged)', existing: 'Compradores actuales', unknown: 'Automático' };
        const segAcc: Record<string, any> = {}; const platAcc: Record<string, any> = {}; const segPlat: Record<string, any> = {};
        for (const r of advbd) {
          if (r.level !== 'adset') continue;
          if (r.breakdown_type === 'user_segment_key') {
            const A = (segAcc[r.breakdown_value] ||= { spend: 0, buy: 0, val: 0 });
            A.spend += n(r.spend); A.buy += n(r.purchases); A.val += n(r.purchase_value);
          } else if (r.breakdown_type === 'publisher_platform') {
            const A = (platAcc[r.breakdown_value] ||= { spend: 0, buy: 0, val: 0 });
            A.spend += n(r.spend); A.buy += n(r.purchases); A.val += n(r.purchase_value);
            const g = grp(r.adset_name); const key = `${g}|${r.breakdown_value}`;
            const B = (segPlat[key] ||= { spend: 0, buy: 0, val: 0 });
            B.spend += n(r.spend); B.buy += n(r.purchases); B.val += n(r.purchase_value);
          }
        }
        const segTot = Object.values(segAcc).reduce((s: number, v: any) => s + v.spend, 0) || 1;
        const segOrder = ['prospecting', 'engaged', 'existing', 'unknown'];
        const segments: SegRow[] = segOrder.filter((s) => segAcc[s]).map((s) => ({
          name: SEGLBL[s] || s, spend: Math.round(segAcc[s].spend), buy: Math.round(segAcc[s].buy),
          val: Math.round(segAcc[s].val), roas: div(segAcc[s].val, segAcc[s].spend), pct: Math.round((100 * segAcc[s].spend) / segTot),
        }));
        const platforms: PlatRow[] = Object.entries(platAcc).map(([key, v]: [string, any]) => ({
          key, spend: +v.spend.toFixed(2), buy: Math.round(v.buy), val: +v.val.toFixed(2), roas: div(v.val, v.spend),
        })).filter((p) => p.spend >= 1).sort((a, b) => b.spend - a.spend);
        const segPlatform: Record<string, { spend: number; buy: number; val: number }> = {};
        for (const [k, v] of Object.entries(segPlat)) segPlatform[k] = { spend: +(v as any).spend.toFixed(2), buy: Math.round((v as any).buy), val: +(v as any).val.toFixed(2) };

        // per-ad platform split (ad × publisher_platform)
        const adPlat: Record<string, Record<string, { spend: number; buy: number; val: number }>> = {};
        for (const r of bd) {
          if (r.level !== 'ad') continue;
          const pl = (adPlat[r.entity_id] ||= {});
          const A = (pl[r.breakdown_value] ||= { spend: 0, buy: 0, val: 0 });
          A.spend += n(r.spend); A.buy += n(r.purchases); A.val += n(r.purchase_value);
        }

        // ---- Creativos: driven por los anuncios que GASTARON, media donde exista ----
        const mediaByAd: Record<string, any> = {};
        for (const c of cr) mediaByAd[c.ad_id] = c;
        const creatives: Creative[] = Object.values(adAcc)
          .filter((A: any) => A.spend > 0)
          .map((A: any) => {
            const c = mediaByAd[A.ad_id] || {};
            return {
              ad_id: A.ad_id, name: A.name || c.ad_name || '', adset: A.adset, is_video: !!c.is_video,
              image_url: c.image_url || '', thumbnail_url: c.thumbnail_url || '', video_id: c.video_id || '',
              title: c.title || '', body: c.body || '', cta: c.cta || '',
              spend: +A.spend.toFixed(2), impr: A.impr, reach: A.reach, link: A.link,
              ctr: div(100 * A.link, A.impr), cpm: div(1000 * A.spend, A.impr), freq: div(A.impr, A.reach),
              cpc: div(A.spend, A.link), landing: A.landing, cost_land: div(A.spend, A.landing),
              atc: A.atc, cost_atc: div(A.spend, A.atc), chk: A.chk, cost_chk: div(A.spend, A.chk),
              buy: A.buy, cost_buy: div(A.spend, A.buy), pv: +A.pv.toFixed(2), roas: div(A.pv, A.spend),
              hold: div(100 * A.thru, A.impr, 1),
              plat: adPlat[A.ad_id] || {},
            };
          })
          .sort((a, b) => (b.thumbnail_url || b.image_url ? 1 : 0) - (a.thumbnail_url || a.image_url ? 1 : 0) || b.spend - a.spend);

        const out: ComprasData = {
          from, to, prevFrom, prevTo, sets, totals, prevTotals, store, prevStore, pairs, segments, platforms, segPlatform, creatives,
          daily: Object.values(daily).sort((a, b) => a.date.localeCompare(b.date)),
        };
        if (alive) { setData(out); setLoading(false); }
      } catch (e: any) {
        if (alive) { setError(e?.message || 'error'); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [clientId, range.from, range.to, prevFrom, prevTo]);

  return { data, loading, error };
}
