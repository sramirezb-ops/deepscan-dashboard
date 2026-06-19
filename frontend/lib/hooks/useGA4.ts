'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calcDelta } from '@/lib/utils';
import type { DateRange } from '@/lib/period';

export interface SourceRow {
  sourceMedium: string; // limpio, para mostrar
  sessions: number;
  users: number;
  conversions: number;
  bounceRate: number; // ponderado por sesiones (0–1)
}

export interface GA4Totals {
  sessions: number;
  users: number;
  newUsers: number;
  conversions: number;
  bounceRate: number; // ponderado por sesiones (0–1)
  avgDuration: number; // segundos, ponderado por sesiones
  revenue: number;
}

// Un punto por día (sumado sobre todas las fuentes/canales de ese día).
export interface GA4DailyPoint {
  date: string; // YYYY-MM-DD
  sessions: number;
  users: number;
  newUsers: number;
  conversions: number;
}

export interface GA4Data {
  totals: GA4Totals;
  sources: SourceRow[]; // ordenadas por sesiones desc
  series: GA4DailyPoint[]; // serie diaria del rango actual, cronológica
  // Deltas vs período anterior
  usersDelta: number;
  newUsersDelta: number;
  sessionsDelta: number;
  conversionsDelta: number;
  bounceRateDelta: number; // en puntos porcentuales
  durationDelta: number; // en segundos
  from: string;
  to: string;
}

export interface UseGA4Result {
  data: GA4Data | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RawRow {
  date: string | null;
  sessions: number | null;
  new_users: number | null;
  active_users: number | null;
  bounce_rate: number | null;
  avg_session_duration: number | null;
  conversions: number | null;
  revenue: number | null;
  source_medium: string | null;
}

const SELECT =
  'date, sessions, new_users, active_users, bounce_rate, avg_session_duration, conversions, revenue, source_medium';

const PAGE = 1000;

/** Trae TODAS las filas del rango paginando (Supabase corta en 1000 por request). */
async function fetchRows(clientId: string, from: string, to: string): Promise<RawRow[]> {
  const all: RawRow[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('ga4_metrics')
      .select(SELECT)
      .eq('client_id', clientId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as RawRow[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// "508597206 / Organic Search" → "Organic Search"
function cleanSourceMedium(sm: string | null): string {
  if (!sm) return '(sin fuente)';
  const parts = sm.split('/');
  return parts[parts.length - 1].trim() || sm;
}

function aggregateTotals(rows: RawRow[]): GA4Totals {
  let sessions = 0,
    users = 0,
    newUsers = 0,
    conversions = 0,
    revenue = 0,
    bounceWeighted = 0,
    durWeighted = 0;

  for (const r of rows) {
    const s = Number(r.sessions) || 0;
    sessions += s;
    users += Number(r.active_users) || 0;
    newUsers += Number(r.new_users) || 0;
    conversions += Number(r.conversions) || 0;
    revenue += Number(r.revenue) || 0;
    bounceWeighted += (Number(r.bounce_rate) || 0) * s;
    durWeighted += (Number(r.avg_session_duration) || 0) * s;
  }

  return {
    sessions,
    users,
    newUsers,
    conversions,
    revenue,
    bounceRate: sessions > 0 ? bounceWeighted / sessions : 0,
    avgDuration: sessions > 0 ? durWeighted / sessions : 0,
  };
}

function groupBySource(rows: RawRow[]): SourceRow[] {
  const map = new Map<string, { sessions: number; users: number; conversions: number; bw: number }>();
  for (const r of rows) {
    const key = cleanSourceMedium(r.source_medium);
    let g = map.get(key);
    if (!g) {
      g = { sessions: 0, users: 0, conversions: 0, bw: 0 };
      map.set(key, g);
    }
    const s = Number(r.sessions) || 0;
    g.sessions += s;
    g.users += Number(r.active_users) || 0;
    g.conversions += Number(r.conversions) || 0;
    g.bw += (Number(r.bounce_rate) || 0) * s;
  }
  return Array.from(map.entries())
    .map(([sourceMedium, g]) => ({
      sourceMedium,
      sessions: g.sessions,
      users: g.users,
      conversions: g.conversions,
      bounceRate: g.sessions > 0 ? g.bw / g.sessions : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);
}

// Agrupa filas (fecha × fuente) en un punto por día, sumando todas las
// fuentes/canales de ese día. Ordena cronológicamente para las gráficas.
function buildSeries(rows: RawRow[]): GA4DailyPoint[] {
  const map = new Map<string, GA4DailyPoint>();
  for (const r of rows) {
    const date = r.date;
    if (!date) continue;
    let p = map.get(date);
    if (!p) {
      p = { date, sessions: 0, users: 0, newUsers: 0, conversions: 0 };
      map.set(date, p);
    }
    p.sessions += Number(r.sessions) || 0;
    p.users += Number(r.active_users) || 0;
    p.newUsers += Number(r.new_users) || 0;
    p.conversions += Number(r.conversions) || 0;
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function useGA4(clientId: string, range: DateRange, previous: DateRange): UseGA4Result {
  const [data, setData] = useState<GA4Data | null>(null);
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

        const t = aggregateTotals(nowRows);
        const p = aggregateTotals(prevRows);

        setData({
          totals: t,
          sources: groupBySource(nowRows),
          series: buildSeries(nowRows),
          usersDelta: calcDelta(t.users, p.users),
          newUsersDelta: calcDelta(t.newUsers, p.newUsers),
          sessionsDelta: calcDelta(t.sessions, p.sessions),
          conversionsDelta: calcDelta(t.conversions, p.conversions),
          bounceRateDelta: (t.bounceRate - p.bounceRate) * 100,
          durationDelta: t.avgDuration - p.avgDuration,
          from: range.from,
          to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useGA4]', e);
        setError(e?.message || 'Error desconocido al cargar GA4');
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
