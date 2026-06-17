'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DateRange } from '@/lib/period';

// ============================================================
// useInstagram — rendimiento de Meta Ads en la plataforma Instagram
// ============================================================
// Lee meta_platform (Meta Ads desglosado por publisher_platform) filtrando
// publisher_platform = 'instagram'. Una fila = campaña × plataforma × día,
// así que respeta el filtro global de fechas y se agrega por campaña.
// Todo sale de datos reales; si no hay filas, no se inventa nada.
// ============================================================

const PLATFORM = 'instagram';

export interface InstagramCampaignRow {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number; // clicks / impressions (fracción 0-1)
  purchases: number;
  purchaseValue: number; // revenue
  roas: number; // revenue / spend
  cpa: number; // spend / purchases
}

export interface InstagramTotals {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number;
  purchases: number;
  purchaseValue: number;
  roas: number;
}

export interface InstagramData {
  campaigns: InstagramCampaignRow[]; // ordenadas por inversión desc
  totals: InstagramTotals;
  campaignCount: number;
  from: string;
  to: string;
}

export interface UseInstagramResult {
  data: InstagramData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RawRow {
  campaign_name: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
  purchases: number | null;
  purchase_value: number | null;
}

const SELECT =
  'campaign_name, spend, impressions, clicks, reach, purchases, purchase_value';

const PAGE = 1000;

async function fetchRows(clientId: string, from: string, to: string): Promise<RawRow[]> {
  const all: RawRow[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('meta_platform')
      .select(SELECT)
      .eq('client_id', clientId)
      .eq('publisher_platform', PLATFORM)
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

/** Agrupa filas (campaña × día) por nombre de campaña. */
function groupByCampaign(rows: RawRow[]): InstagramCampaignRow[] {
  const map = new Map<string, InstagramCampaignRow>();

  for (const r of rows) {
    const name = r.campaign_name || '(sin nombre)';
    let c = map.get(name);
    if (!c) {
      c = {
        name,
        spend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0,
        ctr: 0,
        purchases: 0,
        purchaseValue: 0,
        roas: 0,
        cpa: 0,
      };
      map.set(name, c);
    }
    c.spend += Number(r.spend) || 0;
    c.impressions += Number(r.impressions) || 0;
    c.clicks += Number(r.clicks) || 0;
    c.reach += Number(r.reach) || 0;
    c.purchases += Number(r.purchases) || 0;
    c.purchaseValue += Number(r.purchase_value) || 0;
  }

  const list = Array.from(map.values());
  for (const c of list) {
    c.ctr = c.impressions > 0 ? c.clicks / c.impressions : 0;
    c.roas = c.spend > 0 ? c.purchaseValue / c.spend : 0;
    c.cpa = c.purchases > 0 ? c.spend / c.purchases : 0;
  }

  list.sort((a, b) => b.spend - a.spend);
  return list;
}

function sumTotals(list: InstagramCampaignRow[]): InstagramTotals {
  const t = list.reduce(
    (acc, c) => {
      acc.spend += c.spend;
      acc.impressions += c.impressions;
      acc.clicks += c.clicks;
      acc.reach += c.reach;
      acc.purchases += c.purchases;
      acc.purchaseValue += c.purchaseValue;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, reach: 0, purchases: 0, purchaseValue: 0 }
  );
  return {
    ...t,
    ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
    roas: t.spend > 0 ? t.purchaseValue / t.spend : 0,
  };
}

export function useInstagram(clientId: string, range: DateRange): UseInstagramResult {
  const [data, setData] = useState<InstagramData | null>(null);
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
        const rows = await fetchRows(clientId, range.from, range.to);
        if (cancelled) return;

        const campaigns = groupByCampaign(rows);
        const totals = sumTotals(campaigns);

        setData({
          campaigns,
          totals,
          campaignCount: campaigns.length,
          from: range.from,
          to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useInstagram]', e);
        setError(e?.message || 'Error desconocido al cargar Instagram');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [clientId, range.from, range.to, tick]);

  return { data, loading, error, refresh: () => setTick((x) => x + 1) };
}
