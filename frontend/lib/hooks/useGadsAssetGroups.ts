'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { floorGadsFrom } from '@/lib/dataFloors';
import { calcDelta } from '@/lib/utils';
import type { DateRange } from '@/lib/period';

// ============================================================
// useGadsAssetGroups — performance por ASSET GROUP de Performance Max
// ============================================================
// En PMAX no hay "ad groups" tradicionales: la unidad de optimización es el
// ASSET GROUP. La tabla gads_asset_groups trae métricas reales por día
// (impresiones, clics, costo, conversiones, valor, ROAS) más el ad_strength
// que Google calcula para cada grupo.
//
// Este hook:
//   • Filtra por rango de fechas (responde al filtro global).
//   • Agrega las filas diarias por (campaña + asset group).
//   • Recalcula CTR / CPA / ROAS desde los acumulados (no promedia ratios).
//   • Conserva el ad_strength y status del día más reciente.
//   • Calcula deltas de inversión, revenue y ROAS vs el período anterior.
// Nada se inventa: si no hay filas, la sección no se pinta.
// ============================================================

const PAGE = 1000;

export interface AssetGroupRow {
  assetGroup: string;
  campaign: string;
  adStrength: string; // POOR | AVERAGE | GOOD | EXCELLENT | ''
  status: string; // ENABLED | PAUSED | ''
  impressions: number;
  clicks: number;
  ctr: number; // clicks / impressions
  cost: number;
  conversions: number;
  cpa: number; // cost / conversions
  revenue: number; // conv_value
  roas: number; // revenue / cost
}

export interface AssetGroupTotals {
  impressions: number;
  clicks: number;
  ctr: number;
  cost: number;
  conversions: number;
  cpa: number;
  revenue: number;
  roas: number;
}

export interface GadsAssetGroupsData {
  groups: AssetGroupRow[]; // ordenados por ROAS desc
  totals: AssetGroupTotals;
  groupCount: number;
  // Distribución por ad_strength (cuántos grupos en cada nivel).
  strengthCounts: Record<string, number>;
  costDelta: number;
  revenueDelta: number;
  roasDelta: number; // absoluto
  from: string;
  to: string;
}

export interface UseGadsAssetGroupsResult {
  data: GadsAssetGroupsData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RawRow {
  date: string | null;
  campaign_name: string | null;
  asset_group_name: string | null;
  ad_strength: string | null;
  status: string | null;
  impressions: number | null;
  clicks: number | null;
  cost: number | null;
  conversions: number | null;
  conv_value: number | null;
}

const SELECT =
  'date, campaign_name, asset_group_name, ad_strength, status, impressions, clicks, cost, conversions, conv_value';

async function fetchRows(clientId: string, from: string, to: string): Promise<RawRow[]> {
  const all: RawRow[] = [];
  let offset = 0;
  // Piso por cliente: nunca leer antes del cambio de cuenta de Google Ads.
  const effFrom = floorGadsFrom(from, clientId);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('gads_asset_groups')
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

interface Agg extends AssetGroupRow {
  _lastDate: string; // para conservar ad_strength/status más recientes
}

/** Agrupa las filas diarias por (campaña + asset group) y consolida métricas. */
function groupRows(rows: RawRow[]): AssetGroupRow[] {
  const map = new Map<string, Agg>();
  for (const r of rows) {
    const ag = r.asset_group_name || '(sin nombre)';
    const camp = r.campaign_name || '(sin campaña)';
    const key = `${camp}␟${ag}`;
    let g = map.get(key);
    if (!g) {
      g = {
        assetGroup: ag,
        campaign: camp,
        adStrength: r.ad_strength || '',
        status: r.status || '',
        impressions: 0,
        clicks: 0,
        ctr: 0,
        cost: 0,
        conversions: 0,
        cpa: 0,
        revenue: 0,
        roas: 0,
        _lastDate: '',
      };
      map.set(key, g);
    }
    g.impressions += Number(r.impressions) || 0;
    g.clicks += Number(r.clicks) || 0;
    g.cost += Number(r.cost) || 0;
    g.conversions += Number(r.conversions) || 0;
    g.revenue += Number(r.conv_value) || 0;
    // ad_strength / status del día más reciente (Google los actualiza con el tiempo)
    const d = (r.date || '').slice(0, 10);
    if (d >= g._lastDate) {
      g._lastDate = d;
      if (r.ad_strength) g.adStrength = r.ad_strength;
      if (r.status) g.status = r.status;
    }
  }

  const list = Array.from(map.values());
  for (const g of list) {
    g.ctr = g.impressions > 0 ? g.clicks / g.impressions : 0;
    g.cpa = g.conversions > 0 ? g.cost / g.conversions : 0;
    g.roas = g.cost > 0 ? g.revenue / g.cost : 0;
  }
  list.sort((a, b) => b.roas - a.roas);
  // Quitamos el campo interno antes de devolver.
  return list.map(({ _lastDate, ...rest }) => rest);
}

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

export function useGadsAssetGroups(
  clientId: string,
  range: DateRange,
  previous: DateRange
): UseGadsAssetGroupsResult {
  const [data, setData] = useState<GadsAssetGroupsData | null>(null);
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
        const [now, prev] = await Promise.all([
          fetchRows(clientId, range.from, range.to),
          fetchRows(clientId, previous.from, previous.to),
        ]);
        if (cancelled) return;

        const groups = groupRows(now);
        const t = sumTotals(now);
        const p = sumTotals(prev);

        const totals: AssetGroupTotals = {
          impressions: t.impressions,
          clicks: t.clicks,
          ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
          cost: t.cost,
          conversions: t.conversions,
          cpa: t.conversions > 0 ? t.cost / t.conversions : 0,
          revenue: t.revenue,
          roas: t.cost > 0 ? t.revenue / t.cost : 0,
        };

        const strengthCounts: Record<string, number> = {};
        for (const g of groups) {
          const k = g.adStrength || 'UNKNOWN';
          strengthCounts[k] = (strengthCounts[k] || 0) + 1;
        }

        const roasPrev = p.cost > 0 ? p.revenue / p.cost : 0;

        setData({
          groups,
          totals,
          groupCount: groups.length,
          strengthCounts,
          costDelta: calcDelta(t.cost, p.cost),
          revenueDelta: calcDelta(t.revenue, p.revenue),
          roasDelta: totals.roas - roasPrev,
          from: range.from,
          to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useGadsAssetGroups]', e);
        setError(e?.message || 'Error desconocido al cargar asset groups');
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
