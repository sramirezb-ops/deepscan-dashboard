'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DateRange } from '@/lib/period';

// ============================================================
// useGA4Pages — páginas con más tráfico (tabla ga4_pages) y páginas
// de entrada / landing (tabla ga4_landing). Agrega todo el período
// por ruta y por landing, y calcula deltas de vistas/sesiones contra
// el período anterior. 100% dato real de la GA4 Data API.
// ============================================================

const PAGE = 1000;
const SELECT_PAGES = 'page_path, page_title, views, sessions, users, engagement_seconds, bounce_rate, conversions';
const SELECT_LANDING = 'landing_page, sessions, users, bounce_rate, conversions';

export interface PageRow {
  path: string;
  title: string;
  views: number;
  prevViews: number;
  sessions: number;
  users: number;
  avgEngagement: number; // segundos de interacción por sesión
  bounceRate: number; // 0..1
  conversions: number;
}

export interface LandingRow {
  landing: string;
  sessions: number;
  prevSessions: number;
  users: number;
  bounceRate: number; // 0..1
  conversions: number;
}

export interface GA4PagesData {
  pages: PageRow[]; // ordenadas por vistas desc
  landings: LandingRow[]; // ordenadas por sesiones desc
  totalViews: number;
  from: string;
  to: string;
}

export interface UseGA4PagesResult {
  data: GA4PagesData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RawPageRow {
  page_path: string | null;
  page_title: string | null;
  views: number | null;
  sessions: number | null;
  users: number | null;
  engagement_seconds: number | null;
  bounce_rate: number | null;
  conversions: number | null;
}

interface RawLandingRow {
  landing_page: string | null;
  sessions: number | null;
  users: number | null;
  bounce_rate: number | null;
  conversions: number | null;
}

/** Trae TODAS las filas del rango paginando (Supabase corta en 1000). */
async function fetchAll<T>(
  table: string,
  select: string,
  clientId: string,
  from: string,
  to: string
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq('client_id', clientId)
      .gte('date', from)
      .lte('date', to)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as T[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

interface PageAcc {
  title: string;
  titleViews: number; // vistas asociadas al título guardado (para quedarnos con el dominante)
  views: number;
  sessions: number;
  users: number;
  engagementSeconds: number;
  bounceWeighted: number; // bounce_rate * sessions acumulado
  conversions: number;
}

/** Agrega filas (fecha×ruta) por ruta de página. */
function aggregatePages(rows: RawPageRow[]): Map<string, PageAcc> {
  const map = new Map<string, PageAcc>();
  for (const r of rows) {
    const path = (r.page_path || '(no definido)').trim();
    const views = Number(r.views) || 0;
    const sessions = Number(r.sessions) || 0;
    const bounce = Number(r.bounce_rate) || 0;
    let g = map.get(path);
    if (!g) {
      g = {
        title: '',
        titleViews: -1,
        views: 0,
        sessions: 0,
        users: 0,
        engagementSeconds: 0,
        bounceWeighted: 0,
        conversions: 0,
      };
      map.set(path, g);
    }
    g.views += views;
    g.sessions += sessions;
    g.users += Number(r.users) || 0;
    g.engagementSeconds += Number(r.engagement_seconds) || 0;
    g.bounceWeighted += bounce * sessions;
    g.conversions += Number(r.conversions) || 0;
    // Conservamos el título de la fila con más vistas (más representativo).
    if (views > g.titleViews && r.page_title) {
      g.title = r.page_title;
      g.titleViews = views;
    }
  }
  return map;
}

interface LandingAcc {
  sessions: number;
  users: number;
  bounceWeighted: number;
  conversions: number;
}

function aggregateLandings(rows: RawLandingRow[]): Map<string, LandingAcc> {
  const map = new Map<string, LandingAcc>();
  for (const r of rows) {
    const landing = (r.landing_page || '(no definido)').trim();
    const sessions = Number(r.sessions) || 0;
    const bounce = Number(r.bounce_rate) || 0;
    let g = map.get(landing);
    if (!g) {
      g = { sessions: 0, users: 0, bounceWeighted: 0, conversions: 0 };
      map.set(landing, g);
    }
    g.sessions += sessions;
    g.users += Number(r.users) || 0;
    g.bounceWeighted += bounce * sessions;
    g.conversions += Number(r.conversions) || 0;
  }
  return map;
}

export function useGA4Pages(
  clientId: string,
  range: DateRange,
  previous: DateRange
): UseGA4PagesResult {
  const [data, setData] = useState<GA4PagesData | null>(null);
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
        const [nowPages, prevPages, nowLand, prevLand] = await Promise.all([
          fetchAll<RawPageRow>('ga4_pages', SELECT_PAGES, clientId, range.from, range.to),
          fetchAll<RawPageRow>('ga4_pages', SELECT_PAGES, clientId, previous.from, previous.to),
          fetchAll<RawLandingRow>('ga4_landing', SELECT_LANDING, clientId, range.from, range.to),
          fetchAll<RawLandingRow>('ga4_landing', SELECT_LANDING, clientId, previous.from, previous.to),
        ]);
        if (cancelled) return;

        const nowPagesMap = aggregatePages(nowPages);
        const prevPagesMap = aggregatePages(prevPages);

        let totalViews = 0;
        const pages: PageRow[] = [];
        for (const [path, g] of nowPagesMap.entries()) {
          totalViews += g.views;
          pages.push({
            path,
            title: g.title || path,
            views: g.views,
            prevViews: prevPagesMap.get(path)?.views ?? 0,
            sessions: g.sessions,
            users: g.users,
            avgEngagement: g.sessions > 0 ? g.engagementSeconds / g.sessions : 0,
            bounceRate: g.sessions > 0 ? g.bounceWeighted / g.sessions : 0,
            conversions: g.conversions,
          });
        }
        pages.sort((a, b) => b.views - a.views);

        const nowLandMap = aggregateLandings(nowLand);
        const prevLandMap = aggregateLandings(prevLand);
        const landings: LandingRow[] = [];
        for (const [landing, g] of nowLandMap.entries()) {
          landings.push({
            landing,
            sessions: g.sessions,
            prevSessions: prevLandMap.get(landing)?.sessions ?? 0,
            users: g.users,
            bounceRate: g.sessions > 0 ? g.bounceWeighted / g.sessions : 0,
            conversions: g.conversions,
          });
        }
        landings.sort((a, b) => b.sessions - a.sessions);

        setData({ pages, landings, totalViews, from: range.from, to: range.to });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useGA4Pages]', e);
        setError(e?.message || 'Error desconocido al cargar páginas de GA4');
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
