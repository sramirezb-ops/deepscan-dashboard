'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DateRange } from '@/lib/period';

// ============================================================
// useInstagramOrganic — lo ORGÁNICO de Instagram (no anuncios)
// ============================================================
// Lee dos tablas reales escritas por el extractor instagram_organic.py:
//   • ig_account_daily → serie diaria: alcance, visitas al perfil, seguidores
//     nuevos, y snapshot de seguidores totales (en el último día del rango).
//   • ig_media → cada publicación con su engagement real (likes, comentarios,
//     guardados, compartidos, alcance).
// Todo sale de datos reales; si no hay filas, la vista muestra el aviso honesto.
// ============================================================

const PAGE = 1000;

export interface IgDailyRow {
  date: string;
  reach: number;
  profileViews: number;
  newFollowers: number;
  followers: number; // snapshot total (0 salvo el día de captura)
}

export interface IgMediaRow {
  mediaId: string;
  date: string; // fecha de publicación (YYYY-MM-DD)
  mediaType: string; // IMAGE | VIDEO | CAROUSEL_ALBUM
  productType: string; // FEED | REELS | STORY
  caption: string;
  permalink: string;
  thumbnailUrl: string;
  likes: number;
  comments: number;
  saved: number;
  shares: number;
  reach: number;
  interactions: number;
  engagementRate: number; // interactions / reach (fracción 0-1)
}

export interface IgTypeBreakdown {
  label: string; // "Reels" | "Carrusel" | "Imagen" | "Video"
  count: number;
  reach: number;
  interactions: number;
  engagementRate: number;
}

export interface IgTotals {
  followers: number;
  follows: number;
  mediaCountTotal: number;
  reach: number;
  profileViews: number;
  newFollowers: number;
  interactions: number;
  postsInRange: number;
  engagementRate: number; // interactions / reach del período
  avgPerPost: number; // interacciones promedio por publicación
}

export interface InstagramOrganicData {
  username: string;
  daily: IgDailyRow[];
  media: IgMediaRow[];
  topPosts: IgMediaRow[];
  typeBreakdown: IgTypeBreakdown[];
  totals: IgTotals;
  reachDelta: number;
  profileViewsDelta: number;
  newFollowersDelta: number;
  hasAccountData: boolean;
  hasMediaData: boolean;
  accountExistsEver: boolean;
  from: string;
  to: string;
}

export interface UseInstagramOrganicResult {
  data: InstagramOrganicData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface AccountRaw {
  date: string;
  username: string | null;
  followers_count: number | null;
  follows_count: number | null;
  media_count: number | null;
  reach: number | null;
  profile_views: number | null;
  new_followers: number | null;
}

interface MediaRaw {
  media_id: string;
  timestamp: string | null;
  media_type: string | null;
  media_product_type: string | null;
  caption: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  like_count: number | null;
  comments_count: number | null;
  saved: number | null;
  shares: number | null;
  reach: number | null;
  interactions: number | null;
  engagement_rate: number | null;
}

const ACCOUNT_SELECT =
  'date, username, followers_count, follows_count, media_count, reach, profile_views, new_followers';
const MEDIA_SELECT =
  'media_id, timestamp, media_type, media_product_type, caption, permalink, thumbnail_url, like_count, comments_count, saved, shares, reach, interactions, engagement_rate';

async function fetchAccount(clientId: string, from: string, to: string): Promise<AccountRaw[]> {
  const all: AccountRaw[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('ig_account_daily')
      .select(ACCOUNT_SELECT)
      .eq('client_id', clientId)
      .gte('date', from)
      .lte('date', to)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as AccountRaw[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function fetchMedia(clientId: string, from: string, to: string): Promise<MediaRaw[]> {
  const all: MediaRaw[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('ig_media')
      .select(MEDIA_SELECT)
      .eq('client_id', clientId)
      .gte('timestamp', from)
      .lte('timestamp', to)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as MediaRaw[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

/** ¿Existe ALGUNA fila de cuenta para el cliente (independiente del rango)? */
async function accountExists(clientId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('ig_account_daily')
    .select('date', { count: 'exact', head: true })
    .eq('client_id', clientId);
  if (error) return false;
  return (count || 0) > 0;
}

const TYPE_LABEL: Record<string, string> = {
  REELS: 'Reels',
  CAROUSEL_ALBUM: 'Carrusel',
  IMAGE: 'Imagen',
  VIDEO: 'Video',
  FEED: 'Feed',
};

function mediaLabel(m: MediaRaw): string {
  const prod = (m.media_product_type || '').toUpperCase();
  if (prod === 'REELS') return 'Reels';
  const type = (m.media_type || '').toUpperCase();
  return TYPE_LABEL[type] || type || 'Otro';
}

function toDaily(rows: AccountRaw[]): IgDailyRow[] {
  const map = new Map<string, IgDailyRow>();
  for (const r of rows) {
    const d = (r.date || '').slice(0, 10);
    if (!d) continue;
    const cur = map.get(d) || { date: d, reach: 0, profileViews: 0, newFollowers: 0, followers: 0 };
    cur.reach += Number(r.reach) || 0;
    cur.profileViews += Number(r.profile_views) || 0;
    cur.newFollowers += Number(r.new_followers) || 0;
    cur.followers = Math.max(cur.followers, Number(r.followers_count) || 0);
    map.set(d, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function toMedia(rows: MediaRaw[]): IgMediaRow[] {
  return rows.map((m) => ({
    mediaId: m.media_id,
    date: (m.timestamp || '').slice(0, 10),
    mediaType: m.media_type || '',
    productType: m.media_product_type || '',
    caption: m.caption || '',
    permalink: m.permalink || '',
    thumbnailUrl: m.thumbnail_url || '',
    likes: Number(m.like_count) || 0,
    comments: Number(m.comments_count) || 0,
    saved: Number(m.saved) || 0,
    shares: Number(m.shares) || 0,
    reach: Number(m.reach) || 0,
    interactions: Number(m.interactions) || 0,
    engagementRate: Number(m.engagement_rate) || 0,
  }));
}

function buildTypeBreakdown(rows: MediaRaw[]): IgTypeBreakdown[] {
  const map = new Map<string, IgTypeBreakdown>();
  for (const m of rows) {
    const label = mediaLabel(m);
    const cur =
      map.get(label) || { label, count: 0, reach: 0, interactions: 0, engagementRate: 0 };
    cur.count += 1;
    cur.reach += Number(m.reach) || 0;
    cur.interactions += Number(m.interactions) || 0;
    map.set(label, cur);
  }
  const list = Array.from(map.values());
  for (const t of list) t.engagementRate = t.reach > 0 ? t.interactions / t.reach : 0;
  list.sort((a, b) => b.interactions - a.interactions);
  return list;
}

function sumReach(rows: AccountRaw[]): number {
  return rows.reduce((s, r) => s + (Number(r.reach) || 0), 0);
}
function sumViews(rows: AccountRaw[]): number {
  return rows.reduce((s, r) => s + (Number(r.profile_views) || 0), 0);
}
function sumNewFollowers(rows: AccountRaw[]): number {
  return rows.reduce((s, r) => s + (Number(r.new_followers) || 0), 0);
}

export function useInstagramOrganic(
  clientId: string,
  range: DateRange,
  previous: DateRange
): UseInstagramOrganicResult {
  const [data, setData] = useState<InstagramOrganicData | null>(null);
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
        const [accNow, accPrev, mediaRows, everExists] = await Promise.all([
          fetchAccount(clientId, range.from, range.to),
          fetchAccount(clientId, previous.from, previous.to),
          fetchMedia(clientId, range.from, range.to),
          accountExists(clientId),
        ]);
        if (cancelled) return;

        const daily = toDaily(accNow);
        const media = toMedia(mediaRows);

        // Snapshot de seguidores: el último día con followers_count > 0.
        let followers = 0;
        let follows = 0;
        let mediaCountTotal = 0;
        let username = '';
        for (const r of accNow) {
          if ((Number(r.followers_count) || 0) > 0) {
            followers = Number(r.followers_count) || 0;
            follows = Number(r.follows_count) || 0;
            mediaCountTotal = Number(r.media_count) || 0;
          }
          if (r.username) username = r.username;
        }

        const reach = sumReach(accNow);
        const profileViews = sumViews(accNow);
        const newFollowers = sumNewFollowers(accNow);
        const interactions = media.reduce((s, m) => s + m.interactions, 0);
        const mediaReach = media.reduce((s, m) => s + m.reach, 0);

        const totals: IgTotals = {
          followers,
          follows,
          mediaCountTotal,
          reach,
          profileViews,
          newFollowers,
          interactions,
          postsInRange: media.length,
          engagementRate: mediaReach > 0 ? interactions / mediaReach : 0,
          avgPerPost: media.length > 0 ? interactions / media.length : 0,
        };

        // Deltas vs período anterior (métricas de cuenta).
        const reachPrev = sumReach(accPrev);
        const viewsPrev = sumViews(accPrev);
        const newFollowersPrev = sumNewFollowers(accPrev);
        const pct = (now: number, prev: number) =>
          prev > 0 ? ((now - prev) / prev) * 100 : now > 0 ? 100 : 0;

        const topPosts = [...media]
          .sort((a, b) => b.interactions - a.interactions || b.reach - a.reach)
          .slice(0, 12);

        setData({
          username,
          daily,
          media,
          topPosts,
          typeBreakdown: buildTypeBreakdown(mediaRows),
          totals,
          reachDelta: pct(reach, reachPrev),
          profileViewsDelta: pct(profileViews, viewsPrev),
          newFollowersDelta: pct(newFollowers, newFollowersPrev),
          hasAccountData: accNow.length > 0,
          hasMediaData: media.length > 0,
          accountExistsEver: everExists,
          from: range.from,
          to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useInstagramOrganic]', e);
        setError(e?.message || 'Error desconocido al cargar Instagram orgánico');
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
