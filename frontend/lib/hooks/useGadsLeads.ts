'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calcDelta } from '@/lib/utils';
import type { DateRange } from '@/lib/period';

// ============================================================
// useGadsLeads — Google Ads orientado a LEADS (no ecommerce).
// La cuenta es una sola pero se divide en DOS modelos de negocio que
// SIEMPRE se tratan aparte (gasto y resultados separados):
//   · venta        → Venta de vehículos eléctricos (Search + PMAX)
//   · propietarios → Leads para volverse propietario de tienda Ofero
// Regla de clasificación: si el nombre de la campaña contiene
// "propietario" → modelo propietarios; cualquier otra → venta.
// No hay ROAS/revenue reales (cada lead vale 1): la referencia es el
// número de leads y el costo por lead (CPA). 100% dato real.
// ============================================================

export type ModelKey = 'venta' | 'propietarios';

export interface ModelMetrics {
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number; // leads
  cpm: number; // cost / impressions * 1000
  ctr: number; // clicks / impressions (ratio 0..1)
  cpc: number; // cost / clicks
  cpa: number; // cost / conversions  (costo por lead)
  convRate: number; // conversions / clicks (ratio 0..1)
}

// Deltas en % vs período anterior (uno por métrica).
export interface ModelDeltas {
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpm: number;
  ctr: number;
  cpc: number;
  cpa: number;
}

export interface CampaignLeadRow {
  name: string;
  type: string | null;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpc: number;
  ctr: number;
  cpa: number;
  convRate: number;
}

export interface BusinessModel {
  key: ModelKey;
  label: string;
  metrics: ModelMetrics;
  deltas: ModelDeltas;
  campaigns: CampaignLeadRow[]; // ordenadas por gasto desc
}

// Punto diario del modelo "venta", separado por tipo de campaña (los dos
// motores del negocio: Performance Max vs Search). Alimenta la línea de
// tendencia diaria "PMAX vs Search" del overview. `other` recoge cualquier
// otro tipo (Video/Display/Shopping) para no perder leads del conteo.
export interface GadsDailyType {
  date: string; // 'YYYY-MM-DD'
  pmaxCost: number;
  pmaxLeads: number;
  searchCost: number;
  searchLeads: number;
  otherCost: number;
  otherLeads: number;
}

export interface GadsLeadsData {
  venta: BusinessModel;
  propietarios: BusinessModel;
  ventaDaily: GadsDailyType[]; // serie diaria de "venta" por tipo (orden cronológico)
  hasAny: boolean; // ¿hubo alguna campaña con actividad en el rango?
  existsEver: boolean; // ¿el cliente tiene Google Ads en cualquier fecha?
  from: string;
  to: string;
}

export interface UseGadsLeadsResult {
  data: GadsLeadsData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RawRow {
  campaign_name: string | null;
  campaign_type: string | null;
  date: string | null;
  impressions: number | null;
  clicks: number | null;
  cost: number | null;
  conversions: number | null;
}

const SELECT = 'campaign_name, campaign_type, date, impressions, clicks, cost, conversions';
const PAGE = 1000;

/** Clasifica una campaña en su modelo de negocio por el nombre. */
export function classifyModel(name: string | null): ModelKey {
  const n = (name || '').toLowerCase();
  return n.includes('propietario') ? 'propietarios' : 'venta';
}

async function fetchRows(clientId: string, from: string, to: string): Promise<RawRow[]> {
  const all: RawRow[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('gads_campaigns')
      .select(SELECT)
      .eq('client_id', clientId)
      .gte('date', from)
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

/** ¿El cliente tiene alguna fila de Google Ads en cualquier fecha? */
async function fetchExistsEver(clientId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('gads_campaigns')
    .select('campaign_name')
    .eq('client_id', clientId)
    .limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}

interface RawSum {
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

function emptySum(): RawSum {
  return { cost: 0, impressions: 0, clicks: 0, conversions: 0 };
}

function addInto(acc: RawSum, r: RawRow) {
  acc.cost += Number(r.cost) || 0;
  acc.impressions += Number(r.impressions) || 0;
  acc.clicks += Number(r.clicks) || 0;
  acc.conversions += Number(r.conversions) || 0;
}

function deriveMetrics(s: RawSum): ModelMetrics {
  return {
    cost: s.cost,
    impressions: s.impressions,
    clicks: s.clicks,
    conversions: s.conversions,
    cpm: s.impressions > 0 ? (s.cost / s.impressions) * 1000 : 0,
    ctr: s.impressions > 0 ? s.clicks / s.impressions : 0,
    cpc: s.clicks > 0 ? s.cost / s.clicks : 0,
    cpa: s.conversions > 0 ? s.cost / s.conversions : 0,
    convRate: s.clicks > 0 ? s.conversions / s.clicks : 0,
  };
}

function deriveDeltas(now: ModelMetrics, prev: ModelMetrics): ModelDeltas {
  return {
    cost: calcDelta(now.cost, prev.cost),
    impressions: calcDelta(now.impressions, prev.impressions),
    clicks: calcDelta(now.clicks, prev.clicks),
    conversions: calcDelta(now.conversions, prev.conversions),
    cpm: calcDelta(now.cpm, prev.cpm),
    ctr: calcDelta(now.ctr, prev.ctr),
    cpc: calcDelta(now.cpc, prev.cpc),
    cpa: calcDelta(now.cpa, prev.cpa),
  };
}

/** Agrupa filas diarias por campaña (dentro de un modelo) → fila consolidada. */
function groupCampaigns(rows: RawRow[]): CampaignLeadRow[] {
  const map = new Map<string, { type: string | null; s: RawSum }>();
  for (const r of rows) {
    const name = r.campaign_name || '(sin nombre)';
    let g = map.get(name);
    if (!g) {
      g = { type: r.campaign_type ?? null, s: emptySum() };
      map.set(name, g);
    }
    if (!g.type && r.campaign_type) g.type = r.campaign_type;
    addInto(g.s, r);
  }
  const list: CampaignLeadRow[] = [];
  for (const [name, g] of map.entries()) {
    const m = deriveMetrics(g.s);
    list.push({
      name,
      type: g.type,
      cost: m.cost,
      impressions: m.impressions,
      clicks: m.clicks,
      conversions: m.conversions,
      cpc: m.cpc,
      ctr: m.ctr,
      cpa: m.cpa,
      convRate: m.convRate,
    });
  }
  list.sort((a, b) => b.cost - a.cost);
  return list;
}

/** Bucket de tipo de campaña para la serie diaria (dos motores + resto). */
function typeBucket(type: string | null): 'pmax' | 'search' | 'other' {
  const t = (type || '').toUpperCase();
  if (t === 'PERFORMANCE_MAX') return 'pmax';
  if (t === 'SEARCH') return 'search';
  return 'other';
}

/** Serie diaria de un conjunto de filas, separada por tipo (PMAX / Search / otros). */
function buildDailyByType(rows: RawRow[]): GadsDailyType[] {
  const map = new Map<string, GadsDailyType>();
  for (const r of rows) {
    const date = r.date;
    if (!date) continue; // sin fecha no entra a la serie diaria
    let d = map.get(date);
    if (!d) {
      d = { date, pmaxCost: 0, pmaxLeads: 0, searchCost: 0, searchLeads: 0, otherCost: 0, otherLeads: 0 };
      map.set(date, d);
    }
    const cost = Number(r.cost) || 0;
    const leads = Number(r.conversions) || 0;
    const b = typeBucket(r.campaign_type);
    if (b === 'pmax') {
      d.pmaxCost += cost;
      d.pmaxLeads += leads;
    } else if (b === 'search') {
      d.searchCost += cost;
      d.searchLeads += leads;
    } else {
      d.otherCost += cost;
      d.otherLeads += leads;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function buildModel(
  key: ModelKey,
  label: string,
  nowRows: RawRow[],
  prevRows: RawRow[]
): BusinessModel {
  const nowSum = emptySum();
  const prevSum = emptySum();
  for (const r of nowRows) addInto(nowSum, r);
  for (const r of prevRows) addInto(prevSum, r);
  const metrics = deriveMetrics(nowSum);
  const deltas = deriveDeltas(metrics, deriveMetrics(prevSum));
  return { key, label, metrics, deltas, campaigns: groupCampaigns(nowRows) };
}

export function useGadsLeads(
  clientId: string,
  range: DateRange,
  previous: DateRange
): UseGadsLeadsResult {
  const [data, setData] = useState<GadsLeadsData | null>(null);
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

        const split = (rows: RawRow[], key: ModelKey) =>
          rows.filter((r) => classifyModel(r.campaign_name) === key);

        const venta = buildModel(
          'venta',
          'Venta de vehículos eléctricos',
          split(nowRows, 'venta'),
          split(prevRows, 'venta')
        );
        const propietarios = buildModel(
          'propietarios',
          'Propietarios',
          split(nowRows, 'propietarios'),
          split(prevRows, 'propietarios')
        );

        const ventaDaily = buildDailyByType(split(nowRows, 'venta'));

        const hasAny = nowRows.length > 0;
        let existsEver = hasAny;
        if (!existsEver) {
          existsEver = await fetchExistsEver(clientId);
          if (cancelled) return;
        }

        setData({ venta, propietarios, ventaDaily, hasAny, existsEver, from: range.from, to: range.to });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useGadsLeads]', e);
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
