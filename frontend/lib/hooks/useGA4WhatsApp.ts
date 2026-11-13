'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DateRange } from '@/lib/period';

// ============================================================
// useGA4WhatsApp — clics al botón de WhatsApp por día (tabla ga4_events).
// Replica el "Comportamiento de los eventos de WhatsApp" del Looker:
// serie diaria de clic_whatsapp (+ whatsapp_flotante) para el período actual
// y el anterior, con total y delta. 100% dato real de GA4.
// ============================================================

const PAGE = 1000;
// Mismos eventos que el scorecard "Clics a WhatsApp" del funnel.
const WA_EVENTS = ['clic_whatsapp', 'whatsapp_flotante'];

export interface GA4WhatsAppData {
  labels: string[]; // fechas (YYYY-MM-DD) del período actual
  current: number[]; // clics a WhatsApp por día (actual)
  previous: number[]; // clics a WhatsApp por día (período anterior)
  total: number;
  totalPrev: number;
  delta: number; // % vs período anterior
}

export interface UseGA4WhatsAppResult {
  data: GA4WhatsAppData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RawRow {
  event_count: number | null;
  date: string | null;
}

/** Suma clics a WhatsApp por fecha en un rango (paginando). */
async function fetchByDate(clientId: string, from: string, to: string): Promise<Map<string, number>> {
  const byDate = new Map<string, number>();
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('ga4_events')
      .select('event_count, date')
      .eq('client_id', clientId)
      .in('event_name', WA_EVENTS)
      .gte('date', from)
      .lte('date', to)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as RawRow[];
    for (const r of batch) {
      const d = r.date || '';
      if (!d) continue;
      byDate.set(d, (byDate.get(d) || 0) + (Number(r.event_count) || 0));
    }
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return byDate;
}

/** Lista de días YYYY-MM-DD entre from y to (inclusive). */
function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function useGA4WhatsApp(clientId: string, range: DateRange, previous: DateRange): UseGA4WhatsAppResult {
  const [data, setData] = useState<GA4WhatsAppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [cur, prev] = await Promise.all([
          fetchByDate(clientId, range.from, range.to),
          fetchByDate(clientId, previous.from, previous.to),
        ]);
        const curDays = eachDay(range.from, range.to);
        const prevDays = eachDay(previous.from, previous.to);
        const current = curDays.map((d) => cur.get(d) || 0);
        const previousArr = prevDays.map((d) => prev.get(d) || 0);
        const total = current.reduce((a, b) => a + b, 0);
        const totalPrev = previousArr.reduce((a, b) => a + b, 0);
        const delta = totalPrev > 0 ? ((total - totalPrev) / totalPrev) * 100 : 0;
        if (alive) setData({ labels: curDays, current, previous: previousArr, total, totalPrev, delta });
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Error cargando eventos de WhatsApp');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [clientId, range.from, range.to, previous.from, previous.to, tick]);

  return { data, loading, error, refresh: () => setTick((t) => t + 1) };
}
