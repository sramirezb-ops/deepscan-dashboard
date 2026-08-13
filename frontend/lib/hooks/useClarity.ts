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

// Embudo de comportamiento on-site (GA4 item-scoped). GA4 sub-mide la compra
// (checkout offsite en Shopify) → el último paso es piso, no verdad de caja.
export interface ClarityFunnel { views: number; atc: number; checkout: number; purchases: number; }
// Cruce tráfico (GA4) × venta (Shopify) por producto → "hacia dónde llevar la pauta".
export interface ProductPerf {
  name: string; views: number; atc: number; sold: number; revenue: number;
  conv: number; // ventas Shopify ÷ vistas GA4 (tasa de conversión real por producto)
  verdict: 'escalar' | 'arreglar' | 'explorar' | 'observar';
}
// Rebote por página de entrada (GA4 ga4_landing): dónde entran y se van sin interactuar.
export interface BounceRow { page: string; sessions: number; bounce: number; }
export interface ClarityData {
  daily: ClarityDailyRow[]; // ordenadas por fecha asc
  pages: ClarityPageRow[]; // ordenadas por sesiones desc
  totals: ClarityTotals;
  funnel: ClarityFunnel | null; // embudo GA4 (null si no hay dato)
  products: ProductPerf[] | null; // cruce tráfico×venta por producto
  bounce: BounceRow[] | null; // rebote por landing (GA4)
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

async function fetchFunnel(clientId: string, from: string, to: string, property?: string): Promise<ClarityFunnel | null> {
  try {
    const acc = { views: 0, atc: 0, checkout: 0, purchases: 0 };
    let off = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let q = supabase.from('ga4_items')
        .select('items_viewed, items_added_to_cart, items_checked_out, items_purchased')
        .eq('client_id', clientId).gte('date', from).lte('date', to).range(off, off + PAGE - 1);
      if (property) q = q.eq('property_id', property);
      const { data, error } = await q;
      if (error) throw error;
      const batch = (data || []) as any[];
      for (const r of batch) {
        acc.views += Number(r.items_viewed) || 0;
        acc.atc += Number(r.items_added_to_cart) || 0;
        acc.checkout += Number(r.items_checked_out) || 0;
        acc.purchases += Number(r.items_purchased) || 0;
      }
      if (batch.length < PAGE) break;
      off += PAGE;
    }
    return acc.views > 0 ? acc : null;
  } catch {
    return null;
  }
}

// Tokens de un nombre de producto, para emparejar GA4 ↔ Shopify (mismo criterio
// que la hoja de Compras): sin "tenis/botas", sin años, solo palabras ≥2 letras.
function toks(s: string): Set<string> {
  const x = (s || '').toLowerCase().replace(/^(tenis|botas)\s+/, '').replace(/\b20\d\d\b/g, ' ').replace(/[^a-z0-9 ]/g, ' ');
  return new Set(x.split(/\s+/).filter((w) => w.length > 1));
}

async function fetchSales(clientId: string, from: string, to: string, property?: string): Promise<ProductPerf[] | null> {
  try {
    // 1) Tráfico/engagement por producto (GA4, propiedad Shopify).
    const ga = new Map<string, { views: number; atc: number }>();
    let off = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let q = supabase.from('ga4_items')
        .select('item_name, items_viewed, items_added_to_cart')
        .eq('client_id', clientId).gte('date', from).lte('date', to).range(off, off + PAGE - 1);
      if (property) q = q.eq('property_id', property);
      const { data, error } = await q;
      if (error) throw error;
      const batch = (data || []) as any[];
      for (const r of batch) {
        const k = r.item_name; if (!k) continue;
        const a = ga.get(k) || { views: 0, atc: 0 };
        a.views += Number(r.items_viewed) || 0; a.atc += Number(r.items_added_to_cart) || 0;
        ga.set(k, a);
      }
      if (batch.length < PAGE) break;
      off += PAGE;
    }
    // 2) Venta real por producto (Shopify) — snapshot del período más reciente.
    const sp: any[] = []; off = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase.from('shopify_products')
        .select('title, period_end, units_sold, revenue, revenue_paid')
        .eq('client_id', clientId).range(off, off + PAGE - 1);
      if (error) throw error;
      const batch = (data || []) as any[];
      sp.push(...batch);
      if (batch.length < PAGE) break;
      off += PAGE;
    }
    const maxpe = sp.reduce((m, r) => (r.period_end > m ? r.period_end : m), '');
    const spw = sp.filter((r) => r.period_end === maxpe);

    // 3) Emparejar GA4↔Shopify — ENDURECIDO:
    //  (a) excluir basura del lado Shopify (pedidos de prueba / sin cliente);
    //  (b) matching GLOBAL por mejor score (no goloso por vistas) → resuelve nombres
    //      ambiguos como "space jam" (el match perfecto se asigna antes que el parcial);
    //  (c) umbral de confianza 0.4 (más estricto que 0.34).
    const giList = [...ga.entries()].filter(([, a]) => a.views >= 30);
    const spClean = spw
      .map((r, i) => ({ r, i, tk: toks(r.title || '') }))
      .filter((s) => !/prueba|test|sin\s*cliente|preliminar/i.test(s.r.title || ''));
    const giTok = giList.map(([name, a]) => ({ name, a, tk: toks(name) }));
    // todos los pares candidatos (inter≥2, score≥0.4), ordenados por score desc
    const pairs: { g: number; s: number; sc: number }[] = [];
    giTok.forEach((g, gi) => {
      spClean.forEach((s, si) => {
        let inter = 0; g.tk.forEach((t) => { if (s.tk.has(t)) inter++; });
        if (inter < 2) return;
        const uni = new Set([...g.tk, ...s.tk]).size; const sc = inter / (uni || 1);
        if (sc >= 0.4) pairs.push({ g: gi, s: si, sc });
      });
    });
    pairs.sort((a, b) => b.sc - a.sc);
    const usedG = new Set<number>(), usedS = new Set<number>();
    const matchG = new Map<number, number>();
    for (const p of pairs) {
      if (usedG.has(p.g) || usedS.has(p.s)) continue;
      usedG.add(p.g); usedS.add(p.s); matchG.set(p.g, p.s);
    }
    const rows: ProductPerf[] = giTok.map((g, gi) => {
      let sold = 0, revenue = 0;
      const si = matchG.get(gi);
      if (si !== undefined) { const r = spClean[si].r; sold = Number(r.units_sold) || 0; revenue = Number(r.revenue) || 0; }
      const conv = g.a.views ? sold / g.a.views : 0;
      return { name: g.name, views: g.a.views, atc: g.a.atc, sold, revenue, conv, verdict: 'observar' as const };
    });
    rows.sort((a, b) => b.views - a.views);
    if (!rows.length) return null;
    // Veredicto: escalar (convierte bien) / arreglar (mucho tráfico, casi no convierte,
    // incluye conv muy baja como Miro 0.2%) / explorar (bajo tráfico pero convierte) / observar.
    for (const p of rows) {
      if (p.sold >= 2 && p.conv >= 0.015) p.verdict = 'escalar';
      else if (p.views >= 150 && p.conv < 0.005) p.verdict = 'arreglar';
      else if (p.views < 120 && p.sold >= 1 && p.conv >= 0.02) p.verdict = 'explorar';
      else p.verdict = 'observar';
    }
    return rows;
  } catch {
    return null;
  }
}

async function fetchBounce(clientId: string, from: string, to: string, property?: string): Promise<BounceRow[] | null> {
  try {
    const map = new Map<string, { sessions: number; bw: number }>();
    let off = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let q = supabase.from('ga4_landing')
        .select('landing_page, sessions, bounce_rate')
        .eq('client_id', clientId).gte('date', from).lte('date', to).range(off, off + PAGE - 1);
      if (property) q = q.eq('property_id', property);
      const { data, error } = await q;
      if (error) throw error;
      const batch = (data || []) as any[];
      for (const r of batch) {
        const p = r.landing_page; if (!p || p === '(not set)') continue;
        const s = Number(r.sessions) || 0;
        const cur = map.get(p) || { sessions: 0, bw: 0 };
        cur.sessions += s; cur.bw += (Number(r.bounce_rate) || 0) * s;
        map.set(p, cur);
      }
      if (batch.length < PAGE) break;
      off += PAGE;
    }
    const rows: BounceRow[] = [...map.entries()]
      .map(([page, v]) => ({ page, sessions: v.sessions, bounce: v.sessions ? v.bw / v.sessions : 0 }))
      .filter((r) => r.sessions >= 50)
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10);
    return rows.length ? rows : null;
  } catch {
    return null;
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

export function useClarity(clientId: string, range: DateRange, property?: string): UseClarityResult {
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
        const [metricRows, pageRows, devices, funnel, products, bounce] = await Promise.all([
          fetchMetrics(clientId, range.from, range.to),
          fetchPages(clientId, range.from, range.to),
          fetchDevices(clientId, range.from, range.to),
          fetchFunnel(clientId, range.from, range.to, property),
          fetchSales(clientId, range.from, range.to, property),
          fetchBounce(clientId, range.from, range.to, property),
        ]);
        if (cancelled) return;

        const daily = buildDaily(metricRows);
        const totals = sumTotals(daily);
        totals.deviceMobile = devices.mobile;
        totals.devicePc = devices.pc;
        totals.deviceTablet = devices.tablet;
        const pages = buildPages(pageRows);

        setData({ daily, pages, totals, funnel, products, bounce, from: range.from, to: range.to });
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
  }, [clientId, range.from, range.to, tick, property]);

  return { data, loading, error, refresh: () => setTick((x) => x + 1) };
}
