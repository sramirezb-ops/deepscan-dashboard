'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calcDelta } from '@/lib/utils';
import type { DateRange } from '@/lib/period';

export interface MetaCampaignRow {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number; // clicks / impressions (fracción 0-1)
  purchases: number;
  purchaseValue: number; // revenue
  roas: number; // revenue / spend
  cpa: number; // spend / purchases
}

export interface MetaTotals {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  reach: number;
  purchases: number;
  purchaseValue: number;
  roas: number;
  cpa: number;
  aov: number; // ticket promedio = revenue / purchases
}

export interface MetaFunnel {
  viewContent: number;
  addToCart: number;
  initiateCheckout: number;
  purchases: number;
}

export interface MetaData {
  campaigns: MetaCampaignRow[]; // ordenadas por inversión desc
  totals: MetaTotals;
  funnel: MetaFunnel;
  campaignCount: number;
  // ¿El cliente tiene datos de Meta en CUALQUIER fecha?
  metaExistsEver: boolean;
  // Deltas vs período anterior
  spendDelta: number;
  revenueDelta: number;
  roasDelta: number; // absoluto
  purchasesDelta: number;
  from: string;
  to: string;
}

export interface UseMetaResult {
  data: MetaData | null;
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
  add_to_cart: number | null;
  initiate_checkout: number | null;
  view_content: number | null;
}

const SELECT =
  'campaign_name, spend, impressions, clicks, reach, purchases, purchase_value, add_to_cart, initiate_checkout, view_content';

const PAGE = 1000;

/**
 * Trae TODAS las filas del rango paginando (Supabase corta en 1000 por request,
 * y Meta a nivel anuncio/día supera ese número en 30 días).
 */
async function fetchRows(clientId: string, from: string, to: string): Promise<RawRow[]> {
  const all: RawRow[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('meta_campaigns')
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

/** ¿El cliente tiene ALGUNA fila de Meta, en cualquier fecha? */
async function fetchMetaExists(clientId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('meta_campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId);

  if (error) throw error;
  return (count || 0) > 0;
}

function sumTotals(rows: RawRow[]) {
  return rows.reduce(
    (acc, r) => {
      acc.spend += Number(r.spend) || 0;
      acc.impressions += Number(r.impressions) || 0;
      acc.clicks += Number(r.clicks) || 0;
      acc.reach += Number(r.reach) || 0;
      acc.purchases += Number(r.purchases) || 0;
      acc.purchaseValue += Number(r.purchase_value) || 0;
      acc.viewContent += Number(r.view_content) || 0;
      acc.addToCart += Number(r.add_to_cart) || 0;
      acc.initiateCheckout += Number(r.initiate_checkout) || 0;
      return acc;
    },
    {
      spend: 0,
      impressions: 0,
      clicks: 0,
      reach: 0,
      purchases: 0,
      purchaseValue: 0,
      viewContent: 0,
      addToCart: 0,
      initiateCheckout: 0,
    }
  );
}

/** Agrupa filas (anuncio/día) por nombre de campaña. */
function groupByCampaign(rows: RawRow[]): MetaCampaignRow[] {
  const map = new Map<string, MetaCampaignRow>();

  for (const r of rows) {
    const name = r.campaign_name || '(sin nombre)';
    let c = map.get(name);
    if (!c) {
      c = {
        name,
        spend: 0,
        impressions: 0,
        clicks: 0,
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
    c.purchases += Number(r.purchases) || 0;
    c.purchaseValue += Number(r.purchase_value) || 0;
  }

  const list = Array.from(map.values());
  for (const c of list) {
    c.ctr = c.impressions > 0 ? c.clicks / c.impressions : 0;
    c.roas = c.spend > 0 ? c.purchaseValue / c.spend : 0;
    c.cpa = c.purchases > 0 ? c.spend / c.purchases : 0;
  }

  // Orden por inversión desc (las que más mueven plata arriba)
  list.sort((a, b) => b.spend - a.spend);
  return list;
}

export function useMeta(
  clientId: string,
  range: DateRange,
  previous: DateRange
): UseMetaResult {
  const [data, setData] = useState<MetaData | null>(null);
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

        const campaigns = groupByCampaign(nowRows);
        const t = sumTotals(nowRows);
        const p = sumTotals(prevRows);

        // Si no hubo actividad en el rango, ¿existe Meta en otra fecha?
        let metaExistsEver = nowRows.length > 0;
        if (!metaExistsEver) {
          metaExistsEver = await fetchMetaExists(clientId);
          if (cancelled) return;
        }

        const totals: MetaTotals = {
          spend: t.spend,
          impressions: t.impressions,
          clicks: t.clicks,
          ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
          reach: t.reach,
          purchases: t.purchases,
          purchaseValue: t.purchaseValue,
          roas: t.spend > 0 ? t.purchaseValue / t.spend : 0,
          cpa: t.purchases > 0 ? t.spend / t.purchases : 0,
          aov: t.purchases > 0 ? t.purchaseValue / t.purchases : 0,
        };

        const funnel: MetaFunnel = {
          viewContent: t.viewContent,
          addToCart: t.addToCart,
          initiateCheckout: t.initiateCheckout,
          purchases: t.purchases,
        };

        const roasPrev = p.spend > 0 ? p.purchaseValue / p.spend : 0;

        setData({
          campaigns,
          totals,
          funnel,
          campaignCount: campaigns.length,
          metaExistsEver,
          spendDelta: calcDelta(t.spend, p.spend),
          revenueDelta: calcDelta(t.purchaseValue, p.purchaseValue),
          roasDelta: totals.roas - roasPrev,
          purchasesDelta: calcDelta(t.purchases, p.purchases),
          from: range.from,
          to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useMeta]', e);
        setError(e?.message || 'Error desconocido al cargar Meta Ads');
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
