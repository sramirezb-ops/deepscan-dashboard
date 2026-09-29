'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { floorGadsFrom, applyGadsFloor } from '@/lib/dataFloors';
import { calcDelta } from '@/lib/utils';
import type { DateRange } from '@/lib/period';

export interface CampaignRow {
  name: string;
  type: string | null; // PERFORMANCE_MAX, SHOPPING, … o null
  impressions: number;
  clicks: number;
  ctr: number; // clicks / impressions
  cost: number;
  conversions: number;
  cpa: number; // cost / conversions
  revenue: number; // conv_value
  roas: number; // revenue / cost
}

export interface GoogleAdsTotals {
  impressions: number;
  clicks: number;
  ctr: number;
  cost: number;
  conversions: number;
  cpa: number;
  revenue: number;
  roas: number;
}

// Punto diario del segmento (para la tendencia de CPL/CPA por día).
export interface SegmentDailyPoint {
  date: string; // 'YYYY-MM-DD'
  cost: number;
  conversions: number;
}

export interface GoogleAdsData {
  campaigns: CampaignRow[]; // ordenadas por ROAS desc
  totals: GoogleAdsTotals;
  daily: SegmentDailyPoint[]; // serie diaria del segmento (orden cronológico)
  campaignCount: number;
  // ¿El cliente tiene campañas de este segmento en CUALQUIER fecha?
  // Permite distinguir "no existe el canal" de "no hubo actividad en el rango".
  segmentExistsEver: boolean;
  // Deltas vs período anterior (sobre los totales)
  costDelta: number;
  revenueDelta: number;
  roasDelta: number; // absoluto
  conversionsDelta: number;
  from: string;
  to: string;
}

export interface UseGoogleAdsResult {
  data: GoogleAdsData | null;
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
  conv_value: number | null;
}

const SELECT =
  'campaign_name, campaign_type, date, impressions, clicks, cost, conversions, conv_value';

async function fetchRows(clientId: string, from: string, to: string): Promise<RawRow[]> {
  const { data, error } = await supabase
    .from('gads_campaigns')
    .select(SELECT)
    .eq('client_id', clientId)
    .gte('date', floorGadsFrom(from, clientId))
    .lte('date', to);

  if (error) throw error;
  return (data || []) as RawRow[];
}

/**
 * ¿El cliente tiene ALGUNA campaña del segmento, en cualquier fecha?
 * Consulta liviana (solo nombre + tipo, sin filtro de fecha) para distinguir
 * "el canal no existe para este cliente" de "no hubo actividad en el rango".
 */
async function fetchSegmentExists(
  clientId: string,
  segment: GoogleAdsSegment
): Promise<boolean> {
  const { data, error } = await applyGadsFloor(
    supabase
      .from('gads_campaigns')
      .select('campaign_name, campaign_type')
      .eq('client_id', clientId),
    clientId,
  ).limit(5000);

  if (error) throw error;
  const rows = (data || []) as RawRow[];
  return rows.some((r) => matchesSegment(r, segment));
}

// Segmentos de Google Ads. Clasificamos por campaign_type y, como muchas filas
// traen el tipo en null, también por palabras clave del nombre de campaña.
export type GoogleAdsSegment = 'all' | 'pmax' | 'shopping' | 'search' | 'video';

function matchesSegment(row: RawRow, segment: GoogleAdsSegment): boolean {
  if (segment === 'all') return true;
  const type = (row.campaign_type || '').toUpperCase();
  const name = (row.campaign_name || '').toLowerCase();
  switch (segment) {
    case 'pmax':
      return type === 'PERFORMANCE_MAX' || name.includes('pmax') || name.includes('performance max');
    case 'shopping':
      return type === 'SHOPPING' || name.includes('shopping');
    case 'search':
      return type === 'SEARCH' || name.includes('search') || name.includes('búsqueda');
    case 'video':
      return type === 'VIDEO' || name.includes('youtube') || name.includes('video');
    default:
      return true;
  }
}

/** Suma cost/revenue/conv/impr/clicks de un set de filas. */
function sumTotals(rows: RawRow[]) {
  return rows.reduce(
    (acc, r) => {
      acc.cost += Number(r.cost) || 0;
      acc.revenue += Number(r.conv_value) || 0;
      acc.conversions += Number(r.conversions) || 0;
      acc.impressions += Number(r.impressions) || 0;
      acc.clicks += Number(r.clicks) || 0;
      return acc;
    },
    { cost: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 }
  );
}

/** Serie diaria del segmento (cost + conversions por fecha). */
function buildDaily(rows: RawRow[]): SegmentDailyPoint[] {
  const map = new Map<string, SegmentDailyPoint>();
  for (const r of rows) {
    if (!r.date) continue;
    let d = map.get(r.date);
    if (!d) {
      d = { date: r.date, cost: 0, conversions: 0 };
      map.set(r.date, d);
    }
    d.cost += Number(r.cost) || 0;
    d.conversions += Number(r.conversions) || 0;
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** Agrupa filas diarias por nombre de campaña y consolida métricas. */
function groupByCampaign(rows: RawRow[]): CampaignRow[] {
  const map = new Map<string, CampaignRow>();

  for (const r of rows) {
    const name = r.campaign_name || '(sin nombre)';
    let c = map.get(name);
    if (!c) {
      c = {
        name,
        type: r.campaign_type ?? null,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        cost: 0,
        conversions: 0,
        cpa: 0,
        revenue: 0,
        roas: 0,
      };
      map.set(name, c);
    }
    // Si alguna fila trae el tipo, lo conservamos
    if (!c.type && r.campaign_type) c.type = r.campaign_type;
    c.impressions += Number(r.impressions) || 0;
    c.clicks += Number(r.clicks) || 0;
    c.cost += Number(r.cost) || 0;
    c.conversions += Number(r.conversions) || 0;
    c.revenue += Number(r.conv_value) || 0;
  }

  const list = Array.from(map.values());
  for (const c of list) {
    c.ctr = c.impressions > 0 ? c.clicks / c.impressions : 0;
    c.cpa = c.conversions > 0 ? c.cost / c.conversions : 0;
    c.roas = c.cost > 0 ? c.revenue / c.cost : 0;
  }

  // Orden por ROAS desc (las más rentables arriba)
  list.sort((a, b) => b.roas - a.roas);
  return list;
}

export function useGoogleAds(
  clientId: string,
  range: DateRange,
  previous: DateRange,
  segment: GoogleAdsSegment = 'all'
): UseGoogleAdsResult {
  const [data, setData] = useState<GoogleAdsData | null>(null);
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
        const [nowAll, prevAll] = await Promise.all([
          fetchRows(clientId, range.from, range.to),
          fetchRows(clientId, previous.from, previous.to),
        ]);
        if (cancelled) return;

        // Filtramos por segmento (PMAX, Shopping, …) o dejamos todo.
        const nowRows = nowAll.filter((r) => matchesSegment(r, segment));
        const prevRows = prevAll.filter((r) => matchesSegment(r, segment));

        const campaigns = groupByCampaign(nowRows);
        const t = sumTotals(nowRows);
        const p = sumTotals(prevRows);

        // Si no hubo actividad en el rango, averiguamos si el cliente
        // tiene este tipo de campaña en cualquier otra fecha.
        let segmentExistsEver = campaigns.length > 0;
        if (!segmentExistsEver) {
          segmentExistsEver = await fetchSegmentExists(clientId, segment);
          if (cancelled) return;
        }

        const totals: GoogleAdsTotals = {
          impressions: t.impressions,
          clicks: t.clicks,
          ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
          cost: t.cost,
          conversions: t.conversions,
          cpa: t.conversions > 0 ? t.cost / t.conversions : 0,
          revenue: t.revenue,
          roas: t.cost > 0 ? t.revenue / t.cost : 0,
        };

        const roasPrev = p.cost > 0 ? p.revenue / p.cost : 0;

        setData({
          campaigns,
          totals,
          daily: buildDaily(nowRows),
          campaignCount: campaigns.length,
          segmentExistsEver,
          costDelta: calcDelta(t.cost, p.cost),
          revenueDelta: calcDelta(t.revenue, p.revenue),
          roasDelta: totals.roas - roasPrev,
          conversionsDelta: calcDelta(t.conversions, p.conversions),
          from: range.from,
          to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useGoogleAds]', e);
        setError(e?.message || 'Error desconocido al cargar Google Ads');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [clientId, range.from, range.to, previous.from, previous.to, segment, tick]);

  return { data, loading, error, refresh: () => setTick((x) => x + 1) };
}
