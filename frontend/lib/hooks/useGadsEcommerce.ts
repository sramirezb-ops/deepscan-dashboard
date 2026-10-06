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

export type GadsOwner = 'agencia' | 'ia' | 'sin';
export interface GadsOwnerStat { cost: number; purchaseConv: number; purchaseValue: number; purchaseRoas: number; count: number }

export interface GadsEcomMetrics {
  cost: number;
  impressions: number;
  clicks: number;
  carts: number; // carritos añadidos (puede ser fraccional)
  cartValue: number; // valor de carrito (intención, no venta)
  atcRoas: number; // cartValue / cost
  // Compra REAL aislada por acción de conversión (conv_action_category=PURCHASE),
  // no la conversión amplia (view_item / add_to_cart) que infla.
  purchaseConv: number;
  purchaseValue: number;
  purchaseRoas: number; // purchaseValue / cost
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
  purchaseConv: number;
  purchaseValue: number;
  purchaseRoas: number;
  owner: GadsOwner; // quién creó la campaña (agencia / IA·Aura / sin atribuir)
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
  purchaseConv: number;
  purchaseValue: number;
  purchaseRoas: number;
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
  ownerSplit: Record<'nosotros' | 'ia', GadsOwnerStat>; // Nosotros vs IA·Aura (por ROAS de compra)
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
  campaign_id: string | null;
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
  'date, campaign_id, campaign_name, campaign_type, impressions, clicks, cost, conversions, conv_value, search_impression_share, search_abs_top_impression_share, video_views';
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

// Compra REAL por campaña: aísla la acción de conversión PURCHASE (ignora
// view_item / add_to_cart que inflan). Suma all_conversions / all_conv_value.
async function fetchPurchaseByCampaign(clientId: string, from: string, to: string): Promise<Map<string, { conv: number; value: number }>> {
  const effFrom = floorGadsFrom(from, clientId);
  const m = new Map<string, { conv: number; value: number }>();
  let off = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('gads_conversions_by_action')
      .select('campaign_name, conv_action_category, all_conversions, all_conv_value')
      .eq('client_id', clientId).gte('date', effFrom).lte('date', to)
      .range(off, off + PAGE - 1);
    if (error) { if (off === 0) return m; break; }
    const batch = (data || []) as any[];
    for (const r of batch) {
      if (r.conv_action_category !== 'PURCHASE') continue;
      const n = r.campaign_name || '';
      const g = m.get(n) || { conv: 0, value: 0 };
      g.conv += Number(r.all_conversions) || 0; g.value += Number(r.all_conv_value) || 0;
      m.set(n, g);
    }
    if (batch.length < PAGE) break; off += PAGE;
  }
  return m;
}

// Creador por campaña (Agencia vs IA·Aura) desde la bitácora. IA = client_type
// GOOGLE_ADS_API; cualquier otro (p.ej. GOOGLE_ADS_WEB_CLIENT) = agencia.
async function fetchCreators(clientId: string): Promise<Map<string, GadsOwner>> {
  const m = new Map<string, GadsOwner>();
  const { data, error } = await supabase
    .from('gads_change_events')
    .select('action, client_type, campaign_id')
    .eq('client_id', clientId).range(0, 9999);
  if (error) return m;
  for (const e of (data || []) as any[]) {
    if (e.action !== 'crear_campana' || !e.campaign_id) continue;
    m.set(String(e.campaign_id), e.client_type === 'GOOGLE_ADS_API' ? 'ia' : 'agencia');
  }
  return m;
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
    // Compra real se calcula aparte (gads_conversions_by_action); default 0.
    purchaseConv: 0,
    purchaseValue: 0,
    purchaseRoas: 0,
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
    purchaseConv: 0,
    purchaseValue: 0,
    purchaseRoas: 0,
    owner: 'sin',
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
    const purchaseConv = camps.reduce((a, c) => a + c.purchaseConv, 0);
    const purchaseValue = camps.reduce((a, c) => a + c.purchaseValue, 0);
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
      purchaseConv,
      purchaseValue,
      purchaseRoas: cost > 0 ? purchaseValue / cost : 0,
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
        const [nowRows, prevRows, purchaseByName, creators] = await Promise.all([
          fetchRows(clientId, range.from, range.to),
          fetchRows(clientId, previous.from, previous.to),
          fetchPurchaseByCampaign(clientId, range.from, range.to),
          fetchCreators(clientId),
        ]);
        if (cancelled) return;

        const nowSum = emptySum();
        const prevSum = emptySum();
        for (const r of nowRows) addInto(nowSum, r);
        for (const r of prevRows) addInto(prevSum, r);

        const metrics = deriveMetrics(nowSum);
        const deltas = deriveDeltas(metrics, deriveMetrics(prevSum));

        // Mapa nombre→id (para atribuir creador por id, inmune a renombres) y
        // nombre→owner.
        const idByName = new Map<string, string>();
        for (const r of nowRows) if (r.campaign_name && r.campaign_id) idByName.set(r.campaign_name, String(r.campaign_id));

        // Campañas con compra real + creador inyectados.
        const campaigns = groupCampaigns(nowRows, metrics.cost).map((c): GadsEcomCampaign => {
          const id = idByName.get(c.name);
          const owner: GadsOwner = (id && creators.get(id)) || 'sin';
          const p = purchaseByName.get(c.name) || { conv: 0, value: 0 };
          return { ...c, owner, purchaseConv: p.conv, purchaseValue: p.value, purchaseRoas: c.cost > 0 ? p.value / c.cost : 0 };
        });

        // Métricas globales de compra real.
        metrics.purchaseConv = campaigns.reduce((a, c) => a + c.purchaseConv, 0);
        metrics.purchaseValue = campaigns.reduce((a, c) => a + c.purchaseValue, 0);
        metrics.purchaseRoas = metrics.cost > 0 ? metrics.purchaseValue / metrics.cost : 0;

        // Resumen IA·Aura vs el resto (nuestro), por ROAS de compra.
        const mkOw = (): GadsOwnerStat => ({ cost: 0, purchaseConv: 0, purchaseValue: 0, purchaseRoas: 0, count: 0 });
        const ownerSplit: Record<'nosotros' | 'ia', GadsOwnerStat> = { nosotros: mkOw(), ia: mkOw() };
        for (const c of campaigns) {
          const t = ownerSplit[c.owner === 'ia' ? 'ia' : 'nosotros'];
          t.cost += c.cost; t.purchaseConv += c.purchaseConv; t.purchaseValue += c.purchaseValue; t.count += 1;
        }
        (['nosotros', 'ia'] as const).forEach((k) => { ownerSplit[k].purchaseRoas = ownerSplit[k].cost > 0 ? ownerSplit[k].purchaseValue / ownerSplit[k].cost : 0; });

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
          ownerSplit,
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
