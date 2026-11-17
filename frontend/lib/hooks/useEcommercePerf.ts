'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { floorGadsFrom } from '@/lib/dataFloors';
import { calcDelta } from '@/lib/utils';
import type { DateRange } from '@/lib/period';
import { roasAction, diagnose } from '@/lib/perfDiagnosis';
import type { PerfAction, DiagFactor, AdLite, AdsetLite, Diagnosis } from '@/lib/perfDiagnosis';

// Re-export para no romper imports existentes (Overview importaba desde aquí).
export { roasAction };
export type { PerfAction, DiagFactor, AdLite, AdsetLite, Diagnosis };

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
  ctr: number;        // % (clicks/impr)
  freq: number;       // frecuencia promedio ponderada por impresiones
  ads: AdLite[];      // anuncios de la campaña, por ROAS desc
  adsets: AdsetLite[];// adsets (públicos) de la campaña, por spend desc
  diag: Diagnosis;    // factor de falla probable
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
  campaign_name: string | null; ad_name: string | null; adset_name: string | null;
  spend: number | null; purchase_value: number | null; purchases: number | null;
  impressions: number | null; clicks: number | null; frequency: number | null;
  add_to_cart: number | null; initiate_checkout: number | null; thumb_url: string | null;
}

async function fetchMeta(clientId: string, from: string, to: string): Promise<RawMeta[]> {
  const out: RawMeta[] = [];
  let off = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('meta_campaigns')
      .select('campaign_name, ad_name, adset_name, spend, purchase_value, purchases, impressions, clicks, frequency, add_to_cart, initiate_checkout, thumb_url')
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

export function useEcommercePerf(clientId: string, range: DateRange, previous: DateRange, target: number) {
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

        // Agregación por campaña → con sus anuncios y adsets (para el diagnóstico).
        interface AdAgg { name: string; adset: string; spend: number; revenue: number; purchases: number; impressions: number; clicks: number; thumb: string | null; }
        interface AsAgg { name: string; spend: number; revenue: number; impressions: number; clicks: number; }
        interface CAgg { name: string; segment: 'Agencia' | 'AURA'; spend: number; revenue: number; purchases: number; atc: number; checkout: number; impressions: number; clicks: number; freqW: number; ads: Map<string, AdAgg>; adsets: Map<string, AsAgg>; }
        const cmap = new Map<string, CAgg>();
        for (const r of cur) {
          const cn = r.campaign_name || '(sin nombre)';
          const an = r.ad_name || '(sin nombre)';
          const asn = r.adset_name || '(sin adset)';
          let e = cmap.get(cn);
          if (!e) { e = { name: cn, segment: isAura(cn) ? 'AURA' : 'Agencia', spend: 0, revenue: 0, purchases: 0, atc: 0, checkout: 0, impressions: 0, clicks: 0, freqW: 0, ads: new Map(), adsets: new Map() }; cmap.set(cn, e); }
          const sp = n(r.spend), rv = n(r.purchase_value), pu = n(r.purchases), im = n(r.impressions), cl = n(r.clicks);
          e.spend += sp; e.revenue += rv; e.purchases += pu; e.atc += n(r.add_to_cart); e.checkout += n(r.initiate_checkout);
          e.impressions += im; e.clicks += cl; e.freqW += n(r.frequency) * im;
          let a = e.ads.get(an);
          if (!a) { a = { name: an, adset: asn, spend: 0, revenue: 0, purchases: 0, impressions: 0, clicks: 0, thumb: null }; e.ads.set(an, a); }
          a.spend += sp; a.revenue += rv; a.purchases += pu; a.impressions += im; a.clicks += cl; if (!a.thumb && r.thumb_url) a.thumb = r.thumb_url;
          let s = e.adsets.get(asn);
          if (!s) { s = { name: asn, spend: 0, revenue: 0, impressions: 0, clicks: 0 }; e.adsets.set(asn, s); }
          s.spend += sp; s.revenue += rv; s.impressions += im; s.clicks += cl;
        }
        const ctrOf = (clicks: number, impr: number) => (impr > 0 ? (clicks / impr) * 100 : 0);
        // Benchmark CTR = ganadoras (ROAS ≥ objetivo), ponderado por impresiones;
        // si no hay ganadoras, cae al CTR global de la cuenta.
        let winC = 0, winI = 0;
        for (const e of cmap.values()) if (e.spend > 0 && roasOf(e.revenue, e.spend) >= target) { winC += e.clicks; winI += e.impressions; }
        const allC = [...cmap.values()].reduce((s, e) => s + e.clicks, 0);
        const allI = [...cmap.values()].reduce((s, e) => s + e.impressions, 0);
        const benchCtr = winI > 0 ? ctrOf(winC, winI) : ctrOf(allC, allI);

        const campaigns: CampaignRow[] = [...cmap.values()].map((e) => {
          const ads: AdLite[] = [...e.ads.values()].map((a) => ({ name: a.name, adset: a.adset, spend: a.spend, revenue: a.revenue, purchases: a.purchases, roas: roasOf(a.revenue, a.spend), ctr: ctrOf(a.clicks, a.impressions), thumb: a.thumb })).sort((x, y) => y.roas - x.roas);
          const adsets: AdsetLite[] = [...e.adsets.values()].map((s) => ({ name: s.name, spend: s.spend, revenue: s.revenue, roas: roasOf(s.revenue, s.spend), ctr: ctrOf(s.clicks, s.impressions) })).sort((x, y) => y.spend - x.spend);
          const ctr = ctrOf(e.clicks, e.impressions);
          const freq = e.impressions > 0 ? e.freqW / e.impressions : 0;
          const roas = roasOf(e.revenue, e.spend);
          const diag = diagnose({ roas, ctr, freq, ads, adsets }, benchCtr, target);
          return { name: e.name, segment: e.segment, spend: e.spend, revenue: e.revenue, purchases: e.purchases, roas, atc: e.atc, checkout: e.checkout, ctr, freq, ads, adsets, diag };
        }).sort((a, b) => b.revenue - a.revenue);

        // Creativos ganadores globales (bloque "Creativos"): de todas las campañas.
        const ads: AdRow[] = campaigns
          .flatMap((c) => c.ads.map((a) => ({ campaign: c.name, name: a.name, segment: c.segment, spend: a.spend, revenue: a.revenue, purchases: a.purchases, roas: a.roas, ctr: a.ctr, thumb: a.thumb })))
          .filter((a) => a.spend > 300 && a.revenue > 0)
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
  }, [clientId, range.from, range.to, previous.from, previous.to, target]);

  return { data, loading, error };
}
