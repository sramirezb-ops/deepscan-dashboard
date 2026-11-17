'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { floorGadsFrom } from '@/lib/dataFloors';
import { calcDelta } from '@/lib/utils';
import type { DateRange } from '@/lib/period';

// ============================================================
// useEcommercePerf — lectura de RESULTADOS y ROAS para el Overview ecommerce.
// Lidera con lo accionable: qué rinde, qué escalar y con qué creativos.
//   · Campañas (meta_campaigns, nivel anuncio) agregadas con ROAS real.
//   · Creativos ganadores (ad_name + thumb_url) por ROAS.
//   · Segmento Agencia vs [MOTOR AURA] (la IA de AURA) — detectado por nombre.
//   · Google PMAX (gads_campaigns) como bloque aparte con su ROAS.
// 100% dato real de Supabase. Sin la hoja de venta-real AURA (jubilada del eje).
// ============================================================

const PAGE = 1000;
// Las campañas que corre la IA de AURA se nombran "[MOTOR AURA] …".
const isAura = (name: string | null | undefined) => /aura/i.test(name || '');

// Umbrales de ROAS para el semáforo de "qué hacer" (heurística de ecommerce).
export const ROAS_SCALE = 4; // 🟢 escalar
export const ROAS_WATCH = 2.5; // 🟡 vigilar · por debajo → 🔴 cortar
export type PerfAction = 'escalar' | 'vigilar' | 'cortar';
export function roasAction(roas: number): PerfAction {
  if (roas >= ROAS_SCALE) return 'escalar';
  if (roas >= ROAS_WATCH) return 'vigilar';
  return 'cortar';
}

export interface Totals {
  spend: number;
  revenue: number;
  purchases: number;
  roas: number;
}
export interface CampaignRow {
  name: string;
  segment: 'Agencia' | 'AURA';
  spend: number;
  revenue: number;
  purchases: number;
  roas: number;
  atc: number;
  checkout: number;
}
export interface AdRow {
  campaign: string;
  name: string;
  segment: 'Agencia' | 'AURA';
  spend: number;
  revenue: number;
  purchases: number;
  roas: number;
  ctr: number; // %
  thumb: string | null;
}
export interface EcommercePerfData {
  meta: Totals & { roasDelta: number; revenueDelta: number; purchasesDelta: number; cpa: number };
  campaigns: CampaignRow[]; // ordenadas por revenue desc
  ads: AdRow[]; // ordenadas por roas desc (solo con revenue y gasto mínimo)
  segments: { agencia: Totals; aura: Totals }; // Meta + Google combinados por nombre
  google: Totals | null; // PMAX total, si hay datos en el período
  googleSeg: { agencia: Totals; aura: Totals }; // PMAX partido por quién lo corre
}

interface RawMeta {
  campaign_name: string | null; ad_name: string | null;
  spend: number | null; purchase_value: number | null; purchases: number | null;
  impressions: number | null; clicks: number | null;
  add_to_cart: number | null; initiate_checkout: number | null; thumb_url: string | null;
}

async function fetchMeta(clientId: string, from: string, to: string): Promise<RawMeta[]> {
  const out: RawMeta[] = [];
  let off = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('meta_campaigns')
      .select('campaign_name, ad_name, spend, purchase_value, purchases, impressions, clicks, add_to_cart, initiate_checkout, thumb_url')
      .eq('client_id', clientId)
      .gte('date', from)
      .lte('date', to)
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as RawMeta[];
    out.push(...batch);
    if (batch.length < PAGE) break;
    off += PAGE;
  }
  return out;
}

interface RawGads { campaign_name: string | null; cost: number | null; conv_value: number | null; conversions: number | null }
async function fetchGoogle(clientId: string, from: string, to: string): Promise<RawGads[]> {
  const out: RawGads[] = [];
  let off = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('gads_campaigns')
      .select('campaign_name, cost, conv_value, conversions')
      .eq('client_id', clientId)
      .gte('date', floorGadsFrom(from, clientId))
      .lte('date', to)
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as RawGads[];
    out.push(...batch);
    if (batch.length < PAGE) break;
    off += PAGE;
  }
  return out;
}

const n = (v: any) => Number(v) || 0;
const roasOf = (rev: number, sp: number) => (sp > 0 ? rev / sp : 0);

function metaTotals(rows: RawMeta[]): Totals {
  let spend = 0, revenue = 0, purchases = 0;
  for (const r of rows) { spend += n(r.spend); revenue += n(r.purchase_value); purchases += n(r.purchases); }
  return { spend, revenue, purchases, roas: roasOf(revenue, spend) };
}
function gadsTotals(rows: RawGads[]): Totals {
  let spend = 0, revenue = 0, purchases = 0;
  for (const r of rows) { spend += n(r.cost); revenue += n(r.conv_value); purchases += n(r.conversions); }
  return { spend, revenue, purchases, roas: roasOf(revenue, spend) };
}
/** Suma dos Totals y recalcula ROAS. */
function addTotals(a: Totals, b: Totals): Totals {
  const spend = a.spend + b.spend, revenue = a.revenue + b.revenue, purchases = a.purchases + b.purchases;
  return { spend, revenue, purchases, roas: roasOf(revenue, spend) };
}

export function useEcommercePerf(clientId: string, range: DateRange, previous: DateRange) {
  const [data, setData] = useState<EcommercePerfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [cur, prev, g] = await Promise.all([
          fetchMeta(clientId, range.from, range.to),
          fetchMeta(clientId, previous.from, previous.to),
          fetchGoogle(clientId, range.from, range.to),
        ]);

        const tot = metaTotals(cur);
        const totPrev = metaTotals(prev);

        // Campañas
        const cmap = new Map<string, CampaignRow>();
        for (const r of cur) {
          const name = r.campaign_name || '(sin nombre)';
          const e = cmap.get(name) || { name, segment: isAura(name) ? 'AURA' : 'Agencia', spend: 0, revenue: 0, purchases: 0, roas: 0, atc: 0, checkout: 0 };
          e.spend += n(r.spend); e.revenue += n(r.purchase_value); e.purchases += n(r.purchases);
          e.atc += n(r.add_to_cart); e.checkout += n(r.initiate_checkout);
          cmap.set(name, e);
        }
        const campaigns = [...cmap.values()].map((c) => ({ ...c, roas: roasOf(c.revenue, c.spend) })).sort((a, b) => b.revenue - a.revenue);

        // Creativos (ad_name × campaña)
        const amap = new Map<string, AdRow & { impressions: number; clicks: number }>();
        for (const r of cur) {
          const cn = r.campaign_name || '(sin nombre)';
          const an = r.ad_name || '(sin nombre)';
          const key = cn + '¦' + an;
          const e = amap.get(key) || { campaign: cn, name: an, segment: isAura(cn) ? 'AURA' : 'Agencia', spend: 0, revenue: 0, purchases: 0, roas: 0, ctr: 0, thumb: null, impressions: 0, clicks: 0 };
          e.spend += n(r.spend); e.revenue += n(r.purchase_value); e.purchases += n(r.purchases);
          e.impressions += n(r.impressions); e.clicks += n(r.clicks);
          if (!e.thumb && r.thumb_url) e.thumb = r.thumb_url;
          amap.set(key, e);
        }
        const ads = [...amap.values()]
          .filter((a) => a.spend > 300 && a.revenue > 0)
          .map((a) => ({ campaign: a.campaign, name: a.name, segment: a.segment, spend: a.spend, revenue: a.revenue, purchases: a.purchases, roas: roasOf(a.revenue, a.spend), ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0, thumb: a.thumb }))
          .sort((a, b) => b.roas - a.roas);

        // Segmentos — CROSS-PLATAFORMA (Meta + Google), por nombre de campaña.
        const metaAg = metaTotals(cur.filter((r) => !isAura(r.campaign_name)));
        const metaAu = metaTotals(cur.filter((r) => isAura(r.campaign_name)));
        const gAg = gadsTotals(g.filter((r) => !isAura(r.campaign_name)));
        const gAu = gadsTotals(g.filter((r) => isAura(r.campaign_name)));
        const segments = { agencia: addTotals(metaAg, gAg), aura: addTotals(metaAu, gAu) };
        const googleSeg = { agencia: gAg, aura: gAu };

        // Google PMAX total
        const gTot = gadsTotals(g);
        const google: Totals | null = gTot.spend > 0 ? gTot : null;

        const out: EcommercePerfData = {
          meta: {
            ...tot,
            roasDelta: calcDelta(tot.roas, totPrev.roas),
            revenueDelta: calcDelta(tot.revenue, totPrev.revenue),
            purchasesDelta: calcDelta(tot.purchases, totPrev.purchases),
            cpa: tot.purchases > 0 ? tot.spend / tot.purchases : 0,
          },
          campaigns,
          ads,
          segments,
          google,
          googleSeg,
        };
        if (alive) setData(out);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Error cargando performance');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [clientId, range.from, range.to, previous.from, previous.to]);

  return { data, loading, error };
}
