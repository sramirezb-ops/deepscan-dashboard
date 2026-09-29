'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { floorGadsFrom, applyGadsFloor } from '@/lib/dataFloors';
import { calcDelta } from '@/lib/utils';
import type { DateRange } from '@/lib/period';

// ============================================================
// useGadsEcommerce — Google Ads orientado a ECOMMERCE (intención).
//
// HONESTIDAD (modelo de tres mundos): en estas cuentas la conversión que
// mide Google es AÑADIR AL CARRITO, no la compra. Por eso todo se nombra
// como intención: `carts` (carritos añadidos), `cartValue` (valor de
// carrito) y `atcRoas` (valor de carrito ÷ inversión). NO es venta real
// —esa vive en Overview (GA4/Shopify)— y nunca se suma con otros mundos.
// 100% dato real de `gads_campaigns` (columnas conversions / conv_value).
// ============================================================

export type GadsCampaignType =
  | 'PERFORMANCE_MAX'
  | 'SHOPPING'
  | 'SEARCH'
  | 'VIDEO'
  | 'DISPLAY'
  | 'OTHER';

export interface GadsEcomMetrics {
  cost: number;
  impressions: number;
  clicks: number;
  carts: number; // carritos añadidos (puede ser fraccional)
  cartValue: number; // valor de carrito (intención, no venta)
  atcRoas: number; // cartValue / cost
  ctr: number; // clicks / impressions (0..1)
  cpc: number; // cost / clicks
  cpAtc: number; // cost / carts (costo por carrito)
  cartAov: number; // cartValue / carts (valor promedio por carrito)
  cartRate: number; // carts / clicks (tasa de carrito, 0..1)
  // Impression share consolidado (solo campañas que lo reportan; PMAX no).
  searchImprShare: number | null; // 0..1
  searchAbsTopShare: number | null; // 0..1
}

export interface GadsEcomDeltas {
  cost: number;
  impressions: number;
  clicks: number;
  carts: number;
  cartValue: number;
  atcRoas: number; // diferencia ABSOLUTA (× puntos)
  ctr: number;
  cpc: number;
  cpAtc: number;
  cartAov: number;
}

export interface GadsEcomCampaign {
  name: string;
  type: GadsCampaignType;
  cost: number;
  impressions: number;
  clicks: number;
  carts: number;
  cartValue: number;
  atcRoas: number;
  ctr: number;
  cpc: number;
  cartRate: number;
  searchImprShare: number | null;
  spendShare: number; // 0..1
}

export interface GadsEcomTypeBucket {
  type: GadsCampaignType;
  label: string;
  cost: number;
  impressions: number;
  clicks: number;
  carts: number;
  cartValue: number;
  atcRoas: number;
  ctr: number;
  cpc: number;
  spendShare: number; // 0..1
  campaignCount: number;
  campaigns: GadsEcomCampaign[]; // de este tipo, orden gasto desc
}

export interface GadsEcomDayPoint {
  date: string;
  cost: number;
  cartValue: number;
}

export interface GadsEcommerceData {
  metrics: GadsEcomMetrics;
  deltas: GadsEcomDeltas;
  byType: GadsEcomTypeBucket[]; // orden gasto desc
  campaigns: GadsEcomCampaign[]; // orden gasto desc
  daily: GadsEcomDayPoint[]; // serie diaria período actual, asc
  hasVideo: boolean;
  hasAny: boolean;
  existsEver: boolean;
  from: string;
  to: string;
}

export interface UseGadsEcommerceResult {
  data: GadsEcommerceData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RawRow {
  date: string | null;
  campaign_name: string | null;
  campaign_type: string | null;
  impressions: number | null;
  clicks: number | null;
  cost: number | null;
  conversions: number | null;
  conv_value: number | null;
  search_impression_share: number | null;
  search_abs_top_impression_share: number | null;
  video_views: number | null;
}

const SELECT =
  'date, campaign_name, campaign_type, impressions, clicks, cost, conversions, conv_value, search_impression_share, search_abs_top_impression_share, video_views';
const PAGE = 1000;

const TYPE_LABELS: Record<GadsCampaignType, string> = {
  PERFORMANCE_MAX: 'Performance Max',
  SHOPPING: 'Shopping',
  SEARCH: 'Search',
  VIDEO: 'Video',
  DISPLAY: 'Display',
  OTHER: 'Otras',
};

export function gadsTypeLabel(t: GadsCampaignType): string {
  return TYPE_LABELS[t] ?? 'Otras';
}

function normType(t: string | null): GadsCampaignType {
  const up = (t || '').toUpperCase();
  if (up === 'PERFORMANCE_MAX' || up === 'SHOPPING' || up === 'SEARCH' || up === 'VIDEO' || up === 'DISPLAY') {
    return up as GadsCampaignType;
  }
  return 'OTHER';
}

async function fetchRows(clientId: string, from: string, to: string): Promise<RawRow[]> {
  const all: RawRow[] = [];
  let offset = 0;
  // Piso por cliente: nunca leer antes del cambio de cuenta de Google Ads.
  const effFrom = floorGadsFrom(from, clientId);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('gads_campaigns')
      .select(SELECT)
      .eq('client_id', clientId)
      .gte('date', effFrom)
      .lte('date', to)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as RawRow[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function fetchExistsEver(clientId: string): Promise<boolean> {
  const { data, error } = await applyGadsFloor(
    supabase.from('gads_campaigns').select('campaign_name').eq('client_id', clientId),
    clientId,
  ).limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}

interface Sum {
  cost: number;
  impressions: number;
  clicks: number;
  carts: number;
  cartValue: number;
  // Para consolidar impression share: elegibles = impresiones / IS.
  isImpr: number;
  isEligible: number;
  absTopImpr: number;
  absTopEligible: number;
}

function emptySum(): Sum {
  return {
    cost: 0,
    impressions: 0,
    clicks: 0,
    carts: 0,
    cartValue: 0,
    isImpr: 0,
    isEligible: 0,
    absTopImpr: 0,
    absTopEligible: 0,
  };
}

function addInto(acc: Sum, r: RawRow) {
  const impr = Number(r.impressions) || 0;
  acc.cost += Number(r.cost) || 0;
  acc.impressions += impr;
  acc.clicks += Number(r.clicks) || 0;
  acc.carts += Number(r.conversions) || 0;
  acc.cartValue += Number(r.conv_value) || 0;
  const is = Number(r.search_impression_share) || 0;
  if (is > 0 && impr > 0) {
    acc.isImpr += impr;
    acc.isEligible += impr / is;
  }
  const absTop = Number(r.search_abs_top_impression_share) || 0;
  if (absTop > 0 && impr > 0) {
    acc.absTopImpr += impr;
    acc.absTopEligible += impr / absTop;
  }
}

function deriveMetrics(s: Sum): GadsEcomMetrics {
  return {
    cost: s.cost,
    impressions: s.impressions,
    clicks: s.clicks,
    carts: s.carts,
    cartValue: s.cartValue,
    atcRoas: s.cost > 0 ? s.cartValue / s.cost : 0,
    ctr: s.impressions > 0 ? s.clicks / s.impressions : 0,
    cpc: s.clicks > 0 ? s.cost / s.clicks : 0,
    cpAtc: s.carts > 0 ? s.cost / s.carts : 0,
    cartAov: s.carts > 0 ? s.cartValue / s.carts : 0,
    cartRate: s.clicks > 0 ? s.carts / s.clicks : 0,
    searchImprShare: s.isEligible > 0 ? s.isImpr / s.isEligible : null,
    searchAbsTopShare: s.absTopEligible > 0 ? s.absTopImpr / s.absTopEligible : null,
  };
}

function deriveDeltas(now: GadsEcomMetrics, prev: GadsEcomMetrics): GadsEcomDeltas {
  return {
    cost: calcDelta(now.cost, prev.cost),
    impressions: calcDelta(now.impressions, prev.impressions),
    clicks: calcDelta(now.clicks, prev.clicks),
    carts: calcDelta(now.carts, prev.carts),
    cartValue: calcDelta(now.cartValue, prev.cartValue),
    atcRoas: now.atcRoas - prev.atcRoas, // ABSOLUTO
    ctr: calcDelta(now.ctr, prev.ctr),
    cpc: calcDelta(now.cpc, prev.cpc),
    cpAtc: calcDelta(now.cpAtc, prev.cpAtc),
    cartAov: calcDelta(now.cartAov, prev.cartAov),
  };
}

function campaignFromSum(name: string, type: GadsCampaignType, s: Sum, totalCost: number): GadsEcomCampaign {
  const m = deriveMetrics(s);
  return {
    name,
    type,
    cost: m.cost,
    impressions: m.impressions,
    clicks: m.clicks,
    carts: m.carts,
    cartValue: m.cartValue,
    atcRoas: m.atcRoas,
    ctr: m.ctr,
    cpc: m.cpc,
    cartRate: m.cartRate,
    searchImprShare: m.searchImprShare,
    spendShare: totalCost > 0 ? m.cost / totalCost : 0,
  };
}

function groupCampaigns(rows: RawRow[], totalCost: number): GadsEcomCampaign[] {
  const map = new Map<string, { type: GadsCampaignType; s: Sum }>();
  for (const r of rows) {
    const name = r.campaign_name || '(sin nombre)';
    let g = map.get(name);
    if (!g) {
      g = { type: normType(r.campaign_type), s: emptySum() };
      map.set(name, g);
    }
    if (g.type === 'OTHER' && r.campaign_type) g.type = normType(r.campaign_type);
    addInto(g.s, r);
  }
  const list: GadsEcomCampaign[] = [];
  for (const [name, g] of map.entries()) list.push(campaignFromSum(name, g.type, g.s, totalCost));
  list.sort((a, b) => b.cost - a.cost);
  return list;
}

function groupByType(campaigns: GadsEcomCampaign[], totalCost: number): GadsEcomTypeBucket[] {
  const map = new Map<GadsCampaignType, GadsEcomCampaign[]>();
  for (const c of campaigns) {
    const arr = map.get(c.type) ?? [];
    arr.push(c);
    map.set(c.type, arr);
  }
  const list: GadsEcomTypeBucket[] = [];
  for (const [type, camps] of map.entries()) {
    const cost = camps.reduce((a, c) => a + c.cost, 0);
    const impressions = camps.reduce((a, c) => a + c.impressions, 0);
    const clicks = camps.reduce((a, c) => a + c.clicks, 0);
    const carts = camps.reduce((a, c) => a + c.carts, 0);
    const cartValue = camps.reduce((a, c) => a + c.cartValue, 0);
    list.push({
      type,
      label: gadsTypeLabel(type),
      cost,
      impressions,
      clicks,
      carts,
      cartValue,
      atcRoas: cost > 0 ? cartValue / cost : 0,
      ctr: impressions > 0 ? clicks / impressions : 0,
      cpc: clicks > 0 ? cost / clicks : 0,
      spendShare: totalCost > 0 ? cost / totalCost : 0,
      campaignCount: camps.length,
      campaigns: [...camps].sort((a, b) => b.cost - a.cost),
    });
  }
  list.sort((a, b) => b.cost - a.cost);
  return list;
}

function buildDaily(rows: RawRow[]): GadsEcomDayPoint[] {
  const map = new Map<string, { cost: number; cartValue: number }>();
  for (const r of rows) {
    const d = r.date;
    if (!d) continue;
    let g = map.get(d);
    if (!g) {
      g = { cost: 0, cartValue: 0 };
      map.set(d, g);
    }
    g.cost += Number(r.cost) || 0;
    g.cartValue += Number(r.conv_value) || 0;
  }
  return Array.from(map.entries())
    .map(([date, g]) => ({ date, cost: g.cost, cartValue: g.cartValue }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function useGadsEcommerce(
  clientId: string,
  range: DateRange,
  previous: DateRange
): UseGadsEcommerceResult {
  const [data, setData] = useState<GadsEcommerceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [nowRows, prevRows] = await Promise.all([
          fetchRows(clientId, range.from, range.to),
          fetchRows(clientId, previous.from, previous.to),
        ]);
        if (cancelled) return;

        const nowSum = emptySum();
        const prevSum = emptySum();
        for (const r of nowRows) addInto(nowSum, r);
        for (const r of prevRows) addInto(prevSum, r);

        const metrics = deriveMetrics(nowSum);
        const deltas = deriveDeltas(metrics, deriveMetrics(prevSum));

        const campaigns = groupCampaigns(nowRows, metrics.cost);
        const byType = groupByType(campaigns, metrics.cost);
        const daily = buildDaily(nowRows);
        const hasVideo = byType.some((b) => b.type === 'VIDEO' && b.cost > 0);

        const hasAny = nowRows.length > 0;
        let existsEver = hasAny;
        if (!existsEver) {
          existsEver = await fetchExistsEver(clientId);
          if (cancelled) return;
        }

        setData({
          metrics,
          deltas,
          byType,
          campaigns,
          daily,
          hasVideo,
          hasAny,
          existsEver,
          from: range.from,
          to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useGadsEcommerce]', e);
        setError(e?.message || 'Error desconocido al cargar Google Ads');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [clientId, range.from, range.to, previous.from, previous.to, tick]);

  return { data, loading, error, refresh: () => setTick((x) => x + 1) };
}
