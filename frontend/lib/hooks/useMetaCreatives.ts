'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DateRange } from '@/lib/period';

// ============================================================
// useMetaCreatives — rendimiento a nivel ANUNCIO/CREATIVO de Meta
// ============================================================
// Lee meta_campaigns (que llega a nivel anuncio/día) y agrega por ad_id
// para obtener el rendimiento de cada creativo. A diferencia de gads_products,
// esta tabla SÍ tiene columna `date`, así que respeta el filtro global de fechas.
// Todo sale de datos reales; nada se inventa.
// ============================================================

export interface MetaCreativeRow {
  adId: string;
  adName: string;
  campaignName: string;
  adsetName: string;
  thumbUrl: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number; // clicks / impressions (fracción 0-1)
  purchases: number;
  purchaseValue: number; // revenue
  roas: number; // revenue / spend
  cpa: number; // spend / purchases
}

export interface MetaCreativesTotals {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  purchases: number;
  purchaseValue: number;
  roas: number;
}

export interface MetaCreativesData {
  creatives: MetaCreativeRow[]; // ordenados por inversión desc
  totals: MetaCreativesTotals;
  creativeCount: number;
  withThumb: number; // cuántos creativos traen miniatura
  from: string;
  to: string;
}

export interface UseMetaCreativesResult {
  data: MetaCreativesData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RawRow {
  ad_id: string | null;
  ad_name: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  thumb_url: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  purchases: number | null;
  purchase_value: number | null;
}

const SELECT =
  'ad_id, ad_name, campaign_name, adset_name, thumb_url, spend, impressions, clicks, purchases, purchase_value';

const PAGE = 1000;

/** Trae TODAS las filas del rango paginando (Meta a nivel anuncio/día supera 1000 en 30 días). */
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

/** Agrupa filas (anuncio/día) por ad_id para obtener cada creativo. */
function groupByAd(rows: RawRow[]): MetaCreativeRow[] {
  const map = new Map<string, MetaCreativeRow>();

  for (const r of rows) {
    const adId = r.ad_id || `(sin id) ${r.ad_name || ''}`;
    let c = map.get(adId);
    if (!c) {
      c = {
        adId,
        adName: r.ad_name || '(sin nombre)',
        campaignName: r.campaign_name || '(sin campaña)',
        adsetName: r.adset_name || '(sin conjunto)',
        thumbUrl: r.thumb_url || null,
        spend: 0,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        purchases: 0,
        purchaseValue: 0,
        roas: 0,
        cpa: 0,
      };
      map.set(adId, c);
    }
    // Completar metadatos que pudieran venir vacíos en alguna fila.
    if ((c.thumbUrl === null || c.thumbUrl === '') && r.thumb_url) c.thumbUrl = r.thumb_url;
    if (c.adName === '(sin nombre)' && r.ad_name) c.adName = r.ad_name;
    c.spend += Number(r.spend) || 0;
    c.impressions += Number(r.impressions) || 0;
    c.clicks += Number(r.clicks) || 0;
    c.purchases += Number(r.purchases) || 0;
    c.purchaseValue += Number(r.purchase_value) || 0;
  }

  const list = Array.from(map.values());
  for (const c of list) {
    if (c.thumbUrl === '') c.thumbUrl = null;
    c.ctr = c.impressions > 0 ? c.clicks / c.impressions : 0;
    c.roas = c.spend > 0 ? c.purchaseValue / c.spend : 0;
    c.cpa = c.purchases > 0 ? c.spend / c.purchases : 0;
  }

  // Orden por inversión desc (los creativos que más mueven plata arriba).
  list.sort((a, b) => b.spend - a.spend);
  return list;
}

function sumTotals(list: MetaCreativeRow[]): MetaCreativesTotals {
  const t = list.reduce(
    (acc, c) => {
      acc.spend += c.spend;
      acc.impressions += c.impressions;
      acc.clicks += c.clicks;
      acc.purchases += c.purchases;
      acc.purchaseValue += c.purchaseValue;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, purchases: 0, purchaseValue: 0 }
  );
  return {
    ...t,
    ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
    roas: t.spend > 0 ? t.purchaseValue / t.spend : 0,
  };
}

export function useMetaCreatives(
  clientId: string,
  range: DateRange
): UseMetaCreativesResult {
  const [data, setData] = useState<MetaCreativesData | null>(null);
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

        const creatives = groupByAd(rows);
        const totals = sumTotals(creatives);

        setData({
          creatives,
          totals,
          creativeCount: creatives.length,
          withThumb: creatives.filter((c) => !!c.thumbUrl).length,
          from: range.from,
          to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useMetaCreatives]', e);
        setError(e?.message || 'Error desconocido al cargar creativos de Meta');
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
