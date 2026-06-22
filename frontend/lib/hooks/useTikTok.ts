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

// Curva de retención + tiempo de reproducción de un grupo de filas (total,
// campaña o conjunto). Todas las tasas son fracciones 0-1 respecto a las
// REPRODUCCIONES (video_views), para dibujar un embudo monótono y honesto.
export interface TikTokRetention {
  views: number; // reproducciones (base 100% del embudo)
  watched2s: number;
  watched6s: number;
  watchedP25: number;
  watchedP50: number;
  watchedP75: number;
  completes: number; // p100
  // Tasas respecto a las reproducciones
  hookRate: number; // 2s / views — el "gancho": cuántos no se fueron al instante
  holdRate: number; // 6s / views — retención temprana
  p25Rate: number; // 25 % / views
  p50Rate: number; // 50 % / views
  p75Rate: number; // 75 % / views
  completionRate: number; // 100 % / views
  // Tiempo de reproducción promedio (segundos), ponderado por reproducciones.
  avgWatchTime: number;
}

// Un punto de la serie diaria de una campaña (para las líneas de tendencia).
// Cada métrica derivada (cpl, ctr, cpm, frecuencia) se recalcula sobre los
// acumulados DE ESE DÍA — nunca se promedian promedios.
export interface TikTokDailyPoint {
  date: string;
  spend: number;
  conversions: number;
  cpl: number;
  impressions: number;
  reach: number;
  frequency: number;
  ctr: number;
  cpm: number;
}

// Mismas 8 métricas agregadas (se usa para el período anterior → deltas).
export interface TikTokCampaignMetrics {
  spend: number;
  conversions: number;
  cpl: number;
  impressions: number;
  reach: number;
  frequency: number;
  ctr: number;
  cpm: number;
}

export interface TikTokCampaignRow {
  campaignId: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number; // suma del alcance diario (aprox., no únicos del período)
  frequency: number; // impressions / reach
  ctr: number; // clicks / impressions (fracción 0-1)
  conversions: number; // leads
  cpl: number; // spend / conversions
  cvr: number; // conversions / clicks (fracción 0-1)
  cpc: number; // spend / clicks
  cpm: number; // spend / (impressions/1000)
  videoViews: number;
  video: TikTokRetention; // curva de retención de la campaña
  daily: TikTokDailyPoint[]; // serie diaria ordenada (para las tendencias)
  prev: TikTokCampaignMetrics | null; // mismas métricas en el período anterior
}

export interface TikTokAdGroupRow {
  adgroupId: string;
  name: string;
  campaignName: string; // a qué campaña pertenece
  campaignId: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  frequency: number;
  ctr: number;
  conversions: number; // leads
  cpl: number;
  cvr: number;
  cpc: number;
  cpm: number;
  videoViews: number;
  video: TikTokRetention; // curva de retención del conjunto
}

// Nivel más granular: un anuncio (creativo) agregado en el período.
export interface TikTokAdRow {
  adId: string;
  name: string;
  adgroupId: string;
  adgroupName: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  frequency: number;
  ctr: number;
  conversions: number; // leads
  cpl: number;
  cvr: number;
  cpc: number;
  cpm: number;
  videoViews: number;
  video: TikTokRetention; // curva de retención del anuncio
  // Creativo real (tabla tiktok_creatives). Vacío si aún no se resolvió la
  // portada → la UI muestra el marcador honesto.
  coverUrl: string;
  videoUrl: string;
  mediaType: string; // 'video' | 'image' | ''
}

export interface TikTokTotals {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  reach: number;
  frequency: number; // impressions / reach
  conversions: number; // leads totales
  cpl: number; // costo por lead
  cvr: number; // tasa de conversión
  cpc: number;
  cpm: number;
}

// El bloque de video del TOTAL es exactamente una curva de retención.
export type TikTokVideo = TikTokRetention;

export interface TikTokData {
  campaigns: TikTokCampaignRow[]; // ordenadas por inversión desc
  adgroups: TikTokAdGroupRow[]; // conjuntos de anuncios, ordenados por inversión desc
  ads: TikTokAdRow[]; // anuncios (creativos), ordenados por inversión desc
  totals: TikTokTotals;
  video: TikTokVideo;
  videoPrev: TikTokVideo | null; // retención del período anterior (para deltas)
  campaignCount: number;
  adgroupCount: number;
  adCount: number;
  // ¿El cliente tiene datos de TikTok en CUALQUIER fecha?
  tiktokExistsEver: boolean;
  // Deltas vs período anterior
  spendDelta: number;
  conversionsDelta: number;
  impressionsDelta: number;
  reachDelta: number;
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
  date: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adgroup_id: string | null;
  adgroup_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
  conversions: number | null;
  video_views: number | null;
  video_watched_2s: number | null;
  video_watched_6s: number | null;
  video_watched_p25: number | null;
  video_watched_p50: number | null;
  video_watched_p75: number | null;
  video_completes: number | null;
  avg_watch_time: number | null;
}

const SELECT =
  'date, campaign_id, campaign_name, adgroup_id, adgroup_name, ad_id, ad_name, spend, impressions, clicks, reach, conversions, video_views, video_watched_2s, video_watched_6s, video_watched_p25, video_watched_p50, video_watched_p75, video_completes, avg_watch_time';

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

// ---- Curva de retención (reutilizable: total, campaña, conjunto) ----------
// Acumulador crudo de conteos de video + segundos·reproducción para promedio.
interface VidAgg {
  views: number;
  watched2s: number;
  watched6s: number;
  p25: number;
  p50: number;
  p75: number;
  completes: number;
  watchSecondsSum: number; // Σ(avg_watch_time × views) → para el promedio ponderado
}

function emptyVid(): VidAgg {
  return { views: 0, watched2s: 0, watched6s: 0, p25: 0, p50: 0, p75: 0, completes: 0, watchSecondsSum: 0 };
}

function addVid(a: VidAgg, r: RawRow): void {
  const views = Number(r.video_views) || 0;
  a.views += views;
  a.watched2s += Number(r.video_watched_2s) || 0;
  a.watched6s += Number(r.video_watched_6s) || 0;
  a.p25 += Number(r.video_watched_p25) || 0;
  a.p50 += Number(r.video_watched_p50) || 0;
  a.p75 += Number(r.video_watched_p75) || 0;
  a.completes += Number(r.video_completes) || 0;
  // El promedio diario viene por reproducción; lo re-pesamos por reproducciones
  // para poder promediar correctamente entre días/anuncios.
  a.watchSecondsSum += (Number(r.avg_watch_time) || 0) * views;
}

function finalizeVid(a: VidAgg): TikTokRetention {
  const v = a.views;
  return {
    views: v,
    watched2s: a.watched2s,
    watched6s: a.watched6s,
    watchedP25: a.p25,
    watchedP50: a.p50,
    watchedP75: a.p75,
    completes: a.completes,
    hookRate: v > 0 ? a.watched2s / v : 0,
    holdRate: v > 0 ? a.watched6s / v : 0,
    p25Rate: v > 0 ? a.p25 / v : 0,
    p50Rate: v > 0 ? a.p50 / v : 0,
    p75Rate: v > 0 ? a.p75 / v : 0,
    completionRate: v > 0 ? a.completes / v : 0,
    avgWatchTime: v > 0 ? a.watchSecondsSum / v : 0,
  };
}

function sumTotals(rows: RawRow[]) {
  return rows.reduce(
    (acc, r) => {
      acc.spend += Number(r.spend) || 0;
      acc.impressions += Number(r.impressions) || 0;
      acc.clicks += Number(r.clicks) || 0;
      acc.reach += Number(r.reach) || 0;
      acc.conversions += Number(r.conversions) || 0;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, reach: 0, conversions: 0 }
  );
}

// Acumulador común de campaña/conjunto antes de calcular las derivadas.
interface GroupAcc {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  conversions: number;
  vid: VidAgg;
}

function newGroupAcc(): GroupAcc {
  return { spend: 0, impressions: 0, clicks: 0, reach: 0, conversions: 0, vid: emptyVid() };
}

function addToGroup(g: GroupAcc, r: RawRow): void {
  g.spend += Number(r.spend) || 0;
  g.impressions += Number(r.impressions) || 0;
  g.clicks += Number(r.clicks) || 0;
  g.reach += Number(r.reach) || 0;
  g.conversions += Number(r.conversions) || 0;
  addVid(g.vid, r);
}

// Derivadas comunes a campaña/conjunto/anuncio a partir del acumulador.
function deriv(g: GroupAcc) {
  return {
    ctr: g.impressions > 0 ? g.clicks / g.impressions : 0,
    cpl: g.conversions > 0 ? g.spend / g.conversions : 0,
    cvr: g.clicks > 0 ? g.conversions / g.clicks : 0,
    cpc: g.clicks > 0 ? g.spend / g.clicks : 0,
    cpm: g.impressions > 0 ? g.spend / (g.impressions / 1000) : 0,
    frequency: g.reach > 0 ? g.impressions / g.reach : 0,
  };
}

/** Agrupa filas (anuncio/día) por campaña, con curva de retención. */
function groupByCampaign(rows: RawRow[]): TikTokCampaignRow[] {
  const map = new Map<string, { g: GroupAcc; campaignId: string }>();
  for (const r of rows) {
    const name = r.campaign_name || '(sin nombre)';
    let entry = map.get(name);
    if (!entry) {
      entry = { g: newGroupAcc(), campaignId: (r.campaign_id || '').trim() };
      map.set(name, entry);
    }
    addToGroup(entry.g, r);
  }

  const list: TikTokCampaignRow[] = Array.from(map.entries()).map(([name, { g, campaignId }]) => ({
    campaignId,
    name,
    spend: g.spend,
    impressions: g.impressions,
    clicks: g.clicks,
    reach: g.reach,
    conversions: g.conversions,
    videoViews: g.vid.views,
    video: finalizeVid(g.vid),
    daily: [],
    prev: null,
    ...deriv(g),
  }));

  list.sort((a, b) => b.spend - a.spend);
  return list;
}

/**
 * Serie diaria por campaña: para cada campaña, un punto por día con las 8
 * métricas (las derivadas se recalculan sobre los acumulados de ese día).
 * Alimenta las líneas de tendencia. Devuelve un mapa nombre→puntos ordenados.
 */
function dailyByCampaign(rows: RawRow[]): Map<string, TikTokDailyPoint[]> {
  const byCamp = new Map<string, Map<string, GroupAcc>>();
  for (const r of rows) {
    const name = r.campaign_name || '(sin nombre)';
    const date = r.date || '';
    let dm = byCamp.get(name);
    if (!dm) {
      dm = new Map<string, GroupAcc>();
      byCamp.set(name, dm);
    }
    let acc = dm.get(date);
    if (!acc) {
      acc = newGroupAcc();
      dm.set(date, acc);
    }
    addToGroup(acc, r);
  }

  const out = new Map<string, TikTokDailyPoint[]>();
  for (const [name, dm] of byCamp) {
    const pts = Array.from(dm.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([date, g]) => {
        const d = deriv(g);
        return {
          date,
          spend: g.spend,
          conversions: g.conversions,
          cpl: d.cpl,
          impressions: g.impressions,
          reach: g.reach,
          frequency: d.frequency,
          ctr: d.ctr,
          cpm: d.cpm,
        };
      });
    out.set(name, pts);
  }
  return out;
}

/** Agrupa por conjunto de anuncios (adgroup), con curva de retención. */
function groupByAdGroup(rows: RawRow[]): TikTokAdGroupRow[] {
  const map = new Map<string, { g: GroupAcc; name: string; campaignName: string; campaignId: string }>();
  for (const r of rows) {
    // Clave por id real del conjunto; si falta, caemos al nombre.
    const id = (r.adgroup_id || '').trim() || r.adgroup_name || '(sin conjunto)';
    let entry = map.get(id);
    if (!entry) {
      entry = {
        g: newGroupAcc(),
        name: r.adgroup_name || '(sin nombre)',
        campaignName: r.campaign_name || '(sin campaña)',
        campaignId: (r.campaign_id || '').trim(),
      };
      map.set(id, entry);
    }
    addToGroup(entry.g, r);
  }

  const list: TikTokAdGroupRow[] = Array.from(map.entries()).map(([adgroupId, { g, name, campaignName, campaignId }]) => ({
    adgroupId,
    name,
    campaignName,
    campaignId,
    spend: g.spend,
    impressions: g.impressions,
    clicks: g.clicks,
    reach: g.reach,
    conversions: g.conversions,
    videoViews: g.vid.views,
    video: finalizeVid(g.vid),
    ...deriv(g),
  }));

  list.sort((a, b) => b.spend - a.spend);
  return list;
}

/** Agrupa por anuncio (ad_id), con curva de retención. El nivel más granular. */
function groupByAd(rows: RawRow[]): TikTokAdRow[] {
  const map = new Map<
    string,
    { g: GroupAcc; name: string; adgroupId: string; adgroupName: string; campaignName: string }
  >();
  for (const r of rows) {
    const id = (r.ad_id || '').trim() || r.ad_name || '(sin anuncio)';
    let entry = map.get(id);
    if (!entry) {
      entry = {
        g: newGroupAcc(),
        name: r.ad_name || '(sin nombre)',
        adgroupId: (r.adgroup_id || '').trim(),
        adgroupName: r.adgroup_name || '(sin conjunto)',
        campaignName: r.campaign_name || '(sin campaña)',
      };
      map.set(id, entry);
    }
    addToGroup(entry.g, r);
  }

  const list: TikTokAdRow[] = Array.from(map.entries()).map(
    ([adId, { g, name, adgroupId, adgroupName, campaignName }]) => ({
      adId,
      name,
      adgroupId,
      adgroupName,
      campaignName,
      spend: g.spend,
      impressions: g.impressions,
      clicks: g.clicks,
      reach: g.reach,
      conversions: g.conversions,
      videoViews: g.vid.views,
      video: finalizeVid(g.vid),
      coverUrl: '',
      videoUrl: '',
      mediaType: '',
      ...deriv(g),
    })
  );

  list.sort((a, b) => b.spend - a.spend);
  return list;
}

// Creativos (portada/video) por anuncio. Tabla pequeña (una fila por anuncio),
// así que la traemos completa para el cliente y la mapeamos por ad_id.
interface CreativeRow {
  ad_id: string | null;
  cover_url: string | null;
  video_url: string | null;
  media_type: string | null;
}

async function fetchCreatives(clientId: string): Promise<Map<string, CreativeRow>> {
  const map = new Map<string, CreativeRow>();
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('tiktok_creatives')
      .select('ad_id, cover_url, video_url, media_type')
      .eq('client_id', clientId)
      .range(offset, offset + PAGE - 1);
    // Si la tabla aún no existe o no hay permiso, no rompemos: la UI usa el marcador.
    if (error) return map;
    const batch = (data || []) as CreativeRow[];
    for (const r of batch) {
      const id = (r.ad_id || '').trim();
      if (id) map.set(id, r);
    }
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return map;
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
        const [nowRows, prevRows, creatives] = await Promise.all([
          fetchRows(clientId, range.from, range.to),
          fetchRows(clientId, previous.from, previous.to),
          fetchCreatives(clientId),
        ]);
        if (cancelled) return;

        const campaigns = groupByCampaign(nowRows);
        const adgroups = groupByAdGroup(nowRows);
        const ads = groupByAd(nowRows);

        // Serie diaria (tendencias) + métricas del período anterior por campaña.
        const dailyMap = dailyByCampaign(nowRows);
        const prevByName = new Map(groupByCampaign(prevRows).map((c) => [c.name, c]));
        for (const c of campaigns) {
          c.daily = dailyMap.get(c.name) ?? [];
          const pv = prevByName.get(c.name);
          c.prev = pv
            ? {
                spend: pv.spend,
                conversions: pv.conversions,
                cpl: pv.cpl,
                impressions: pv.impressions,
                reach: pv.reach,
                frequency: pv.frequency,
                ctr: pv.ctr,
                cpm: pv.cpm,
              }
            : null;
        }
        // Pegar la portada/video real a cada anuncio (si ya se resolvió).
        for (const a of ads) {
          const c = creatives.get(a.adId);
          if (c) {
            a.coverUrl = c.cover_url || '';
            a.videoUrl = c.video_url || '';
            a.mediaType = c.media_type || '';
          }
        }
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
          frequency: t.reach > 0 ? t.impressions / t.reach : 0,
          conversions: t.conversions,
          cpl: t.conversions > 0 ? t.spend / t.conversions : 0,
          cvr: t.clicks > 0 ? t.conversions / t.clicks : 0,
          cpc: t.clicks > 0 ? t.spend / t.clicks : 0,
          cpm: t.impressions > 0 ? t.spend / (t.impressions / 1000) : 0,
        };

        // Curva de retención del TOTAL: re-agregamos las filas crudas.
        const vidTotal = nowRows.reduce((acc, r) => {
          addVid(acc, r);
          return acc;
        }, emptyVid());
        const video: TikTokVideo = finalizeVid(vidTotal);

        // Curva de retención del período ANTERIOR (para comparar deltas). Si no
        // hubo reproducciones antes, queda null → la UI dice "sin período anterior".
        const vidTotalPrev = prevRows.reduce((acc, r) => {
          addVid(acc, r);
          return acc;
        }, emptyVid());
        const videoPrev: TikTokVideo | null = vidTotalPrev.views > 0 ? finalizeVid(vidTotalPrev) : null;

        const cplPrev = p.conversions > 0 ? p.spend / p.conversions : 0;
        const ctrPrev = p.impressions > 0 ? p.clicks / p.impressions : 0;

        setData({
          campaigns,
          adgroups,
          ads,
          totals,
          video,
          videoPrev,
          campaignCount: campaigns.length,
          adgroupCount: adgroups.length,
          adCount: ads.length,
          tiktokExistsEver,
          spendDelta: calcDelta(t.spend, p.spend),
          conversionsDelta: calcDelta(t.conversions, p.conversions),
          impressionsDelta: calcDelta(t.impressions, p.impressions),
          reachDelta: calcDelta(t.reach, p.reach),
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
