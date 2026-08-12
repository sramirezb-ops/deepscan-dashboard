'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DateRange } from '@/lib/period';

// ============================================================
// useClarity — comportamiento real del sitio (Microsoft Clarity)
// ============================================================
// Lee clarity_metrics (una fila por día, ya agregada por el ETL vía Data
// Export API) y clarity_pages (detalle por página), respetando el filtro
// global de fechas. Si no hay filas, no se inventa nada.
//
// Nota: la Data Export API de Clarity solo entrega los últimos 1–3 días, así
// que el histórico se acumula hacia adelante desde que el ETL empezó a correr.
// ============================================================

export interface ClarityDailyRow {
  date: string;
  sessions: number;
  scrollDepth: number; // fracción 0–1
  deadClickRate: number; // fracción 0–1 (sesiones con dead click)
  rageClickRate: number; // fracción 0–1
  quickBackRate: number; // fracción 0–1
}

export interface ClarityPageRow {
  pageUrl: string;
  sessions: number;
  scrollDepth: number; // fracción 0–1 (promedio ponderado por sesiones)
  deadClicks: number;
  rageClicks: number;
}

export interface ClarityTotals {
  sessions: number;
  scrollDepth: number; // promedio ponderado por sesiones
  deadClickRate: number; // promedio ponderado por sesiones
  rageClickRate: number;
  quickBackRate: number;
  daysWithData: number;
  deviceMobile: number; // sesiones por dispositivo (0 si el ETL aún no lo pobló)
  devicePc: number;
  deviceTablet: number;
}

export interface ClarityData {
  daily: ClarityDailyRow[]; // ordenadas por fecha asc
  pages: ClarityPageRow[]; // ordenadas por sesiones desc
  totals: ClarityTotals;
  from: string;
  to: string;
}

export interface UseClarityResult {
  data: ClarityData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RawMetric {
  date: string | null;
  sessions: number | null;
  scroll_depth: number | null;
  dead_click_rate: number | null;
  rage_click_rate: number | null;
  quick_back_rate: number | null;
  sessions_mobile: number | null;
  sessions_pc: number | null;
  sessions_tablet: number | null;
}

interface RawPage {
  date: string | null;
  page_url: string | null;
  sessions: number | null;
  scroll_depth: number | null;
  dead_clicks: number | null;
  rage_clicks: number | null;
}

const METRIC_SELECT =
  'date, sessions, scroll_depth, dead_click_rate, rage_click_rate, quick_back_rate';
// Se pide aparte y blindado: si las columnas de device aún no existen (migración
// 0022 sin correr), el fetch falla y se ignora — la vista no se rompe.
const DEVICE_SELECT = 'sessions_mobile, sessions_pc, sessions_tablet';
const PAGE_SELECT = 'date, page_url, sessions, scroll_depth, dead_clicks, rage_clicks';
const PAGE = 1000;

async function fetchMetrics(clientId: string, from: string, to: string): Promise<RawMetric[]> {
  const all: RawMetric[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('clarity_metrics')
      .select(METRIC_SELECT)
      .eq('client_id', clientId)
      .gte('date', from)
      .lte('date', to)
      .range(offset, offset + PAGE - 1);

    if (error) throw error;
    const batch = (data || []) as RawMetric[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function fetchPages(clientId: string, from: string, to: string): Promise<RawPage[]> {
  const all: RawPage[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('clarity_pages')
      .select(PAGE_SELECT)
      .eq('client_id', clientId)
      .gte('date', from)
      .lte('date', to)
      .range(offset, offset + PAGE - 1);

    if (error) throw error;
    const batch = (data || []) as RawPage[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function fetchDevices(clientId: string, from: string, to: string): Promise<{ mobile: number; pc: number; tablet: number }> {
  try {
    const { data, error } = await supabase
      .from('clarity_metrics')
      .select(DEVICE_SELECT)
      .eq('client_id', clientId)
      .gte('date', from)
      .lte('date', to);
    if (error) throw error;
    const acc = { mobile: 0, pc: 0, tablet: 0 };
    for (const r of (data || []) as any[]) {
      acc.mobile += Number(r.sessions_mobile) || 0;
      acc.pc += Number(r.sessions_pc) || 0;
      acc.tablet += Number(r.sessions_tablet) || 0;
    }
    return acc;
  } catch {
    return { mobile: 0, pc: 0, tablet: 0 }; // columnas aún no existen → sin device
  }
}

function buildDaily(rows: RawMetric[]): ClarityDailyRow[] {
  const list: ClarityDailyRow[] = rows
    .filter((r) => r.date)
    .map((r) => ({
      date: r.date as string,
      sessions: Number(r.sessions) || 0,
      scrollDepth: Number(r.scroll_depth) || 0,
      deadClickRate: Number(r.dead_click_rate) || 0,
      rageClickRate: Number(r.rage_click_rate) || 0,
      quickBackRate: Number(r.quick_back_rate) || 0,
    }));
  list.sort((a, b) => a.date.localeCompare(b.date));
  return list;
}

function sumTotals(daily: ClarityDailyRow[]): ClarityTotals {
  let sessions = 0;
  let scrollW = 0;
  let deadW = 0;
  let rageW = 0;
  let quickW = 0;
  for (const d of daily) {
    sessions += d.sessions;
    scrollW += d.scrollDepth * d.sessions;
    deadW += d.deadClickRate * d.sessions;
    rageW += d.rageClickRate * d.sessions;
    quickW += d.quickBackRate * d.sessions;
  }
  const denom = sessions || 1;
  return {
    sessions,
    scrollDepth: scrollW / denom,
    deadClickRate: deadW / denom,
    rageClickRate: rageW / denom,
    quickBackRate: quickW / denom,
    daysWithData: daily.length,
    deviceMobile: 0,
    devicePc: 0,
    deviceTablet: 0,
  };
}

/** Agrega las páginas a lo largo del rango (misma URL en varios días → una fila). */
function buildPages(rows: RawPage[]): ClarityPageRow[] {
  const map = new Map<
    string,
    { sessions: number; dead: number; rage: number; scrollW: number }
  >();

  for (const r of rows) {
    const url = r.page_url;
    if (!url) continue;
    const s = Number(r.sessions) || 0;
    const cur = map.get(url) || { sessions: 0, dead: 0, rage: 0, scrollW: 0 };
    cur.sessions += s;
    cur.dead += Number(r.dead_clicks) || 0;
    cur.rage += Number(r.rage_clicks) || 0;
    cur.scrollW += (Number(r.scroll_depth) || 0) * s;
    map.set(url, cur);
  }

  const list: ClarityPageRow[] = Array.from(map.entries()).map(([url, v]) => ({
    pageUrl: url,
    sessions: v.sessions,
    scrollDepth: v.sessions > 0 ? v.scrollW / v.sessions : 0,
    deadClicks: v.dead,
    rageClicks: v.rage,
  }));

  list.sort((a, b) => b.sessions - a.sessions || b.deadClicks - a.deadClicks);
  return list;
}

export function useClarity(clientId: string, range: DateRange): UseClarityResult {
  const [data, setData] = useState<ClarityData | null>(null);
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
        const [metricRows, pageRows, devices] = await Promise.all([
          fetchMetrics(clientId, range.from, range.to),
          fetchPages(clientId, range.from, range.to),
          fetchDevices(clientId, range.from, range.to),
        ]);
        if (cancelled) return;

        const daily = buildDaily(metricRows);
        const totals = sumTotals(daily);
        totals.deviceMobile = devices.mobile;
        totals.devicePc = devices.pc;
        totals.deviceTablet = devices.tablet;
        const pages = buildPages(pageRows);

        setData({ daily, pages, totals, from: range.from, to: range.to });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useClarity]', e);
        setError(e?.message || 'Error desconocido al cargar Clarity');
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
