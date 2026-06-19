'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calcDelta } from '@/lib/utils';
import type { DateRange } from '@/lib/period';

// ============================================================
// useGA4Cities — detalle por ciudad (replica el panel de Looker
// "¿Desde qué ciudades visitan la Web?" y su performance vs período
// anterior). Lee ga4_cities (fila = fecha×país×ciudad) y agrega por
// ciudad respondiendo al filtro global de fechas. 100% dato real.
// ============================================================

const PAGE = 1000;

export interface CityRow {
  city: string;
  country: string;
  sessions: number;
  users: number;
  newUsers: number;
  conversions: number;
  // Deltas vs período anterior (porcentaje)
  sessionsDelta: number;
  usersDelta: number;
  conversionsDelta: number;
}

export interface GA4CitiesData {
  cities: CityRow[]; // ordenadas por sesiones desc
  cityCount: number; // nº de ciudades distintas en el rango actual
  cityCountDelta: number; // vs período anterior
  totals: { sessions: number; users: number; newUsers: number; conversions: number };
  from: string;
  to: string;
}

export interface UseGA4CitiesResult {
  data: GA4CitiesData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RawRow {
  country: string | null;
  city: string | null;
  sessions: number | null;
  users: number | null;
  new_users: number | null;
  conversions: number | null;
}

const SELECT = 'country, city, sessions, users, new_users, conversions';

/** Trae TODAS las filas del rango paginando (Supabase corta en 1000). */
async function fetchRows(clientId: string, from: string, to: string): Promise<RawRow[]> {
  const all: RawRow[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('ga4_cities')
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

interface Agg {
  city: string;
  country: string;
  sessions: number;
  users: number;
  newUsers: number;
  conversions: number;
}

/** Agrega filas (fecha×país×ciudad) por ciudad. Clave: país|ciudad. */
function aggregateByCity(rows: RawRow[]): Map<string, Agg> {
  const map = new Map<string, Agg>();
  for (const r of rows) {
    const city = (r.city || '(sin ciudad)').trim();
    const country = (r.country || '(sin país)').trim();
    const key = `${country}|${city}`;
    let g = map.get(key);
    if (!g) {
      g = { city, country, sessions: 0, users: 0, newUsers: 0, conversions: 0 };
      map.set(key, g);
    }
    g.sessions += Number(r.sessions) || 0;
    g.users += Number(r.users) || 0;
    g.newUsers += Number(r.new_users) || 0;
    g.conversions += Number(r.conversions) || 0;
  }
  return map;
}

export function useGA4Cities(
  clientId: string,
  range: DateRange,
  previous: DateRange
): UseGA4CitiesResult {
  const [data, setData] = useState<GA4CitiesData | null>(null);
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

        const nowMap = aggregateByCity(nowRows);
        const prevMap = aggregateByCity(prevRows);

        const totals = { sessions: 0, users: 0, newUsers: 0, conversions: 0 };
        const cities: CityRow[] = [];
        for (const [key, g] of nowMap.entries()) {
          const prev = prevMap.get(key);
          totals.sessions += g.sessions;
          totals.users += g.users;
          totals.newUsers += g.newUsers;
          totals.conversions += g.conversions;
          cities.push({
            city: g.city,
            country: g.country,
            sessions: g.sessions,
            users: g.users,
            newUsers: g.newUsers,
            conversions: g.conversions,
            sessionsDelta: calcDelta(g.sessions, prev?.sessions ?? 0),
            usersDelta: calcDelta(g.users, prev?.users ?? 0),
            conversionsDelta: calcDelta(g.conversions, prev?.conversions ?? 0),
          });
        }
        cities.sort((a, b) => b.sessions - a.sessions);

        setData({
          cities,
          cityCount: nowMap.size,
          cityCountDelta: calcDelta(nowMap.size, prevMap.size),
          totals,
          from: range.from,
          to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useGA4Cities]', e);
        setError(e?.message || 'Error desconocido al cargar ciudades de GA4');
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
