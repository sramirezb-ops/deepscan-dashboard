'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DateRange } from '@/lib/period';

// ============================================================
// useGA4Funnel — conteo de eventos GA4 por nombre (tabla ga4_events).
// Permite construir el funnel de leads de Looker mapeando nombres de
// evento a pasos (Escribir Correo, Descargar Catálogo, Clics a WhatsApp).
// Devuelve, por nombre de evento, su conteo en el período actual y en el
// anterior, para que la vista calcule totales y deltas. 100% dato real.
// ============================================================

const PAGE = 1000;
const SELECT = 'event_name, event_count, total_users, is_key_event, date';

export interface EventAgg {
  count: number; // eventos en el período actual
  prevCount: number; // eventos en el período anterior
  users: number; // usuarios en el período actual
  isKeyEvent: boolean; // GA4 lo marca como evento clave (conversión)
}

export interface GA4FunnelData {
  byName: Map<string, EventAgg>; // clave = event_name
  totalEvents: number; // suma de todos los eventos (período actual)
  sessionsByDate: Map<string, number>; // session_start por día (período actual) — para tendencia
  from: string;
  to: string;
}

export interface UseGA4FunnelResult {
  data: GA4FunnelData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RawRow {
  event_name: string | null;
  event_count: number | null;
  total_users: number | null;
  is_key_event: number | null;
  date: string | null;
}

/** Trae TODAS las filas del rango paginando (Supabase corta en 1000). */
async function fetchRows(clientId: string, from: string, to: string): Promise<RawRow[]> {
  const all: RawRow[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('ga4_events')
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

/** Agrega filas (fecha×evento) por nombre de evento. */
function aggregateByName(rows: RawRow[]): Map<string, { count: number; users: number; key: boolean }> {
  const map = new Map<string, { count: number; users: number; key: boolean }>();
  for (const r of rows) {
    const name = (r.event_name || '(unknown)').trim();
    let g = map.get(name);
    if (!g) {
      g = { count: 0, users: 0, key: false };
      map.set(name, g);
    }
    g.count += Number(r.event_count) || 0;
    g.users += Number(r.total_users) || 0;
    if (Number(r.is_key_event) > 0) g.key = true;
  }
  return map;
}

export function useGA4Funnel(
  clientId: string,
  range: DateRange,
  previous: DateRange
): UseGA4FunnelResult {
  const [data, setData] = useState<GA4FunnelData | null>(null);
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

        const nowMap = aggregateByName(nowRows);
        const prevMap = aggregateByName(prevRows);

        // Serie diaria de sesiones (session_start) del período actual → tendencia.
        const sessionsByDate = new Map<string, number>();
        for (const r of nowRows) {
          if ((r.event_name || '').trim() !== 'session_start') continue;
          const d = r.date;
          if (!d) continue;
          sessionsByDate.set(d, (sessionsByDate.get(d) ?? 0) + (Number(r.event_count) || 0));
        }

        const byName = new Map<string, EventAgg>();
        let totalEvents = 0;
        for (const [name, g] of nowMap.entries()) {
          totalEvents += g.count;
          byName.set(name, {
            count: g.count,
            prevCount: prevMap.get(name)?.count ?? 0,
            users: g.users,
            isKeyEvent: g.key,
          });
        }
        // Eventos que solo existían en el período anterior (para deltas completos).
        for (const [name, g] of prevMap.entries()) {
          if (!byName.has(name)) {
            byName.set(name, { count: 0, prevCount: g.count, users: 0, isKeyEvent: g.key });
          }
        }

        setData({ byName, totalEvents, sessionsByDate, from: range.from, to: range.to });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useGA4Funnel]', e);
        setError(e?.message || 'Error desconocido al cargar eventos de GA4');
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
