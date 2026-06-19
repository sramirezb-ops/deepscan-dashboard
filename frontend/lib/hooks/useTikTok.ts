'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calcDelta } from '@/lib/utils';
import type { DateRange } from '@/lib/period';

// ============================================================
// useTikTok — rendimiento de TikTok Ads (orientado a LEADS)
// ============================================================
// Lee tiktok_campaigns (una fila = anuncio × día) y agrega por campaña,
// respondiendo al filtro global de fechas. Espeja la lógica de useMeta,
// pero la métrica estrella NO es ROAS sino: leads (conversiones), costo
// por lead (CPL) y CTR — porque Ofero es negocio de prospectos, no ecommerce.
// Incluye métricas de video (vistas + retención) para juzgar el creativo.
// Nada se inventa: si no hay filas en el rango, la vista muestra el aviso.
// ============================================================

const PAGE = 1000;

export interface TikTokCampaignRow {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number; // clicks / impressions (fracción 0-1)
  conversions: number; // leads
  cpl: number; // spend / conversions
  cvr: number; // conversions / clicks (fracción 0-1)
  cpc: number; // spend / clicks
  videoViews: number;
}

export interface TikTokTotals {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  reach: number;
  conversions: number; // leads totales
  cpl: number; // costo por lead
  cvr: number; // tasa de conversión
  cpc: number;
  cpm: number;
}

export interface TikTokVideo {
  views: number;
  watched2s: number;
  watched6s: number;
  completes: number;
  // Tasas de retención (fracción 0-1) respecto a las vistas.
  hookRate: number; // watched2s / views
  holdRate: number; // watched6s / views
  completionRate: number; // completes / views
}

export interface TikTokData {
  campaigns: TikTokCampaignRow[]; // ordenadas por inversión desc
  totals: TikTokTotals;
  video: TikTokVideo;
  campaignCount: number;
  // ¿El cliente tiene datos de TikTok en CUALQUIER fecha?
  tiktokExistsEver: boolean;
  // Deltas vs período anterior
  spendDelta: number;
  conversionsDelta: number;
  cplDelta: number; // absoluto
  ctrDelta: number; // absoluto
  from: string;
  to: string;
}

export interface UseTikTokResult {
  data: TikTokData | null;
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
  conversions: number | null;
  video_views: number | null;
  video_watched_2s: number | null;
  video_watched_6s: number | null;
  video_completes: number | null;
}

const SELECT =
  'campaign_name, spend, impressions, clicks, reach, conversions, video_views, video_watched_2s, video_watched_6s, video_completes';

/** Trae TODAS las filas del rango paginando (Supabase corta en 1000 por request). */
async function fetchRows(clientId: string, from: string, to: string): Promise<RawRow[]> {
  const all: RawRow[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('tiktok_campaigns')
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

/** ¿El cliente tiene ALGUNA fila de TikTok, en cualquier fecha? */
async function fetchTikTokExists(clientId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('tiktok_campaigns')
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
      acc.conversions += Number(r.conversions) || 0;
      acc.videoViews += Number(r.video_views) || 0;
      acc.watched2s += Number(r.video_watched_2s) || 0;
      acc.watched6s += Number(r.video_watched_6s) || 0;
      acc.completes += Number(r.video_completes) || 0;
      return acc;
    },
    {
      spend: 0,
      impressions: 0,
      clicks: 0,
      reach: 0,
      conversions: 0,
      videoViews: 0,
      watched2s: 0,
      watched6s: 0,
      completes: 0,
    }
  );
}

/** Agrupa filas (anuncio/día) por nombre de campaña. */
function groupByCampaign(rows: RawRow[]): TikTokCampaignRow[] {
  const map = new Map<string, TikTokCampaignRow>();

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
        conversions: 0,
        cpl: 0,
        cvr: 0,
        cpc: 0,
        videoViews: 0,
      };
      map.set(name, c);
    }
    c.spend += Number(r.spend) || 0;
    c.impressions += Number(r.impressions) || 0;
    c.clicks += Number(r.clicks) || 0;
    c.conversions += Number(r.conversions) || 0;
    c.videoViews += Number(r.video_views) || 0;
  }

  const list = Array.from(map.values());
  for (const c of list) {
    c.ctr = c.impressions > 0 ? c.clicks / c.impressions : 0;
    c.cpl = c.conversions > 0 ? c.spend / c.conversions : 0;
    c.cvr = c.clicks > 0 ? c.conversions / c.clicks : 0;
    c.cpc = c.clicks > 0 ? c.spend / c.clicks : 0;
  }

  // Orden por inversión desc (las que más mueven plata arriba).
  list.sort((a, b) => b.spend - a.spend);
  return list;
}

export function useTikTok(
  clientId: string,
  range: DateRange,
  previous: DateRange
): UseTikTokResult {
  const [data, setData] = useState<TikTokData | null>(null);
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

        // Si no hubo actividad en el rango, ¿existe TikTok en otra fecha?
        let tiktokExistsEver = nowRows.length > 0;
        if (!tiktokExistsEver) {
          tiktokExistsEver = await fetchTikTokExists(clientId);
          if (cancelled) return;
        }

        const totals: TikTokTotals = {
          spend: t.spend,
          impressions: t.impressions,
          clicks: t.clicks,
          ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
          reach: t.reach,
          conversions: t.conversions,
          cpl: t.conversions > 0 ? t.spend / t.conversions : 0,
          cvr: t.clicks > 0 ? t.conversions / t.clicks : 0,
          cpc: t.clicks > 0 ? t.spend / t.clicks : 0,
          cpm: t.impressions > 0 ? t.spend / (t.impressions / 1000) : 0,
        };

        const video: TikTokVideo = {
          views: t.videoViews,
          watched2s: t.watched2s,
          watched6s: t.watched6s,
          completes: t.completes,
          hookRate: t.videoViews > 0 ? t.watched2s / t.videoViews : 0,
          holdRate: t.videoViews > 0 ? t.watched6s / t.videoViews : 0,
          completionRate: t.videoViews > 0 ? t.completes / t.videoViews : 0,
        };

        const cplPrev = p.conversions > 0 ? p.spend / p.conversions : 0;
        const ctrPrev = p.impressions > 0 ? p.clicks / p.impressions : 0;

        setData({
          campaigns,
          totals,
          video,
          campaignCount: campaigns.length,
          tiktokExistsEver,
          spendDelta: calcDelta(t.spend, p.spend),
          conversionsDelta: calcDelta(t.conversions, p.conversions),
          cplDelta: totals.cpl - cplPrev,
          ctrDelta: totals.ctr - ctrPrev,
          from: range.from,
          to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useTikTok]', e);
        setError(e?.message || 'Error desconocido al cargar TikTok Ads');
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
