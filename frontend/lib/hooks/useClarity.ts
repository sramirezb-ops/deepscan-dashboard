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
// Cruce tráfico (Clarity) × venta (Shopify) por producto → "hacia dónde llevar la pauta".
export interface ProductPerf {
  name: string; sessions: number; sold: number; revenue: number;
  conv: number; // ventas Shopify ÷ sesiones PDP de Clarity (tasa real sesión→compra, aprox.)
  matched: boolean; // si se emparejó con un producto de Shopify (para no juzgar sin dato de venta)
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
  salesDated: boolean; // true = venta sumada del rango exacto (shopify_product_daily); false = snapshot ~30d
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
// Extrae el slug de producto de una URL PDP y junta variantes (locale /en/ y año final)
// → "jordan-9-space-jam-2026" y "/en/products/jordan-9-space-jam" caen en el mismo slug.
function pdpSlug(u: string): string | null {
  const m = /\/(?:[a-z]{2}\/)?products\/([^/?#]+)/i.exec(u || '');
  if (!m) return null;
  return m[1].toLowerCase().replace(/-20\d\d$/, '');
}
// Tokens para emparejar slug↔título: a diferencia de toks(), CONSERVA los dígitos porque
// el número de modelo distingue Jordan 1/4/9. Quita año y palabras de categoría/relleno.
function stoks(s: string): Set<string> {
  const x = (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b20\d\d\b/g, ' ').replace(/\b(tenis|botas|de|the|the)\b/g, ' ');
  return new Set(x.split(/\s+/).filter((w) => w.length >= 2 || /[0-9]/.test(w)));
}
// Slug → nombre legible cuando NO hay match en Shopify (fallback de display).
const prettySlug = (slug: string) => slug.replace(/^(tenis|botas)-/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function fetchSales(clientId: string, from: string, to: string, property?: string): Promise<{ rows: ProductPerf[]; dated: boolean } | null> {
  try {
    // 1) TRÁFICO = sesiones PDP de Clarity, por slug de producto (junta /en/ y año).
    //    Misma fuente y unidad que la tabla "Páginas con más sesiones" → los dos cuadros
    //    reconcilian, y la conversión es sesión→compra REAL (no el view_item sub-medido de GA4).
    const bySlug = new Map<string, number>();
    let off = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase.from('clarity_pages')
        .select('page_url, sessions')
        .eq('client_id', clientId).gte('date', from).lte('date', to)
        .ilike('page_url', '%/products/%')
        .range(off, off + PAGE - 1);
      if (error) throw error;
      const batch = (data || []) as any[];
      for (const r of batch) {
        const slug = pdpSlug(r.page_url); if (!slug) continue;
        bySlug.set(slug, (bySlug.get(slug) || 0) + (Number(r.sessions) || 0));
      }
      if (batch.length < PAGE) break;
      off += PAGE;
    }
    if (bySlug.size === 0) return null;

    // 2) VENTA por producto (Shopify). Preferimos ventas por (producto, día) del rango
    //    EXACTO elegido (tabla shopify_product_daily). Si aún no existe/está vacía (pre-ETL),
    //    caemos al snapshot de ventana completa de shopify_products (último POR producto) para
    //    no romper prod. `dated` avisa a la UI cuál se usó.
    const junk = (t: string) => !t || /prueba|test|sin\s*cliente|preliminar/i.test(t);
    const salesByTitle = new Map<string, { sold: number; revenue: number }>();
    let dated = false;
    try {
      let o2 = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase.from('shopify_product_daily')
          .select('title, units_sold, revenue')
          .eq('client_id', clientId).gte('date', from).lte('date', to)
          .range(o2, o2 + PAGE - 1);
        if (error) throw error;
        const batch = (data || []) as any[];
        for (const r of batch) {
          const t = (r.title || '').trim(); if (junk(t)) continue;
          const cur = salesByTitle.get(t) || { sold: 0, revenue: 0 };
          cur.sold += Number(r.units_sold) || 0; cur.revenue += Number(r.revenue) || 0;
          salesByTitle.set(t, cur);
        }
        if (batch.length < PAGE) break;
        o2 += PAGE;
      }
      dated = salesByTitle.size > 0;
    } catch { /* tabla aún no creada → fallback al snapshot */ }

    if (!dated) {
      // Fallback: último snapshot POR producto (no un único period_end global, que tiraba
      // productos con venta pero snapshot más viejo, ej. True Blue, Flu Game).
      const sp: any[] = []; let o3 = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase.from('shopify_products')
          .select('title, period_end, units_sold, revenue')
          .eq('client_id', clientId).range(o3, o3 + PAGE - 1);
        if (error) throw error;
        const batch = (data || []) as any[];
        sp.push(...batch);
        if (batch.length < PAGE) break;
        o3 += PAGE;
      }
      const latest = new Map<string, any>();
      for (const r of sp) {
        const t = (r.title || '').trim(); if (junk(t)) continue;
        const cur = latest.get(t);
        if (!cur || (r.period_end || '') > (cur.period_end || '')) latest.set(t, r);
      }
      for (const r of latest.values()) salesByTitle.set((r.title || '').trim(), { sold: Number(r.units_sold) || 0, revenue: Number(r.revenue) || 0 });
    }
    const prods = [...salesByTitle.entries()].map(([title, v]) => ({
      name: title, sold: v.sold, revenue: v.revenue, tk: stoks(title), sessions: 0, hit: false,
    }));

    // 3) ANCLAR EN EL PRODUCTO: cada slug de Clarity se asigna a su mejor producto Shopify
    //    (inter≥2, score≥0.4; stoks conserva el nº de modelo para no confundir Jordan 1/4/9).
    //    Un producto puede recibir VARIOS slugs (colorways/locale) → se SUMAN sus sesiones.
    const MIN_SESS = 40;
    const leftover: { slug: string; sessions: number }[] = [];
    for (const [slug, sessions] of bySlug) {
      if (sessions < MIN_SESS) continue;
      const stk = stoks(slug);
      let best = -1, bestSc = 0;
      prods.forEach((p, pi) => {
        let inter = 0; stk.forEach((t) => { if (p.tk.has(t)) inter++; });
        if (inter < 2) return;
        const uni = new Set([...stk, ...p.tk]).size; const sc = inter / (uni || 1);
        if (sc > bestSc) { bestSc = sc; best = pi; }
      });
      if (best >= 0 && bestSc >= 0.4) { prods[best].sessions += sessions; prods[best].hit = true; }
      else leftover.push({ slug, sessions });
    }

    // 4) Filas: un producto real por fila (tráfico Clarity sumado × venta Shopify). Los slugs
    //    con tráfico alto que NO casaron con el catálogo se muestran aparte (sin dato de venta).
    const rows: ProductPerf[] = [];
    for (const p of prods) if (p.sessions >= MIN_SESS) {
      rows.push({ name: p.name, sessions: p.sessions, sold: p.sold, revenue: p.revenue, conv: p.sessions ? p.sold / p.sessions : 0, matched: true, verdict: 'observar' });
    }
    for (const l of leftover) if (l.sessions >= 150) {
      rows.push({ name: prettySlug(l.slug), sessions: l.sessions, sold: 0, revenue: 0, conv: 0, matched: false, verdict: 'observar' });
    }
    rows.sort((a, b) => b.sessions - a.sessions);
    if (!rows.length) return null;

    // 5) Veredicto RELATIVO al promedio de la tienda (robusto: la conversión absoluta es
    //    baja por el cobro offsite/COD). baseline = compras ÷ sesiones sobre lo emparejado.
    //    Sólo se juzga lo que tiene dato de venta (matched); lo demás queda en 'observar'.
    const m = rows.filter((r) => r.matched);
    const totSold = m.reduce((s, r) => s + r.sold, 0);
    const totSess = m.reduce((s, r) => s + r.sessions, 0);
    const baseline = totSess ? totSold / totSess : 0;
    const sortedSess = rows.map((r) => r.sessions).sort((a, b) => a - b);
    const med = sortedSess[Math.floor(sortedSess.length / 2)] || 0;
    const hiCut = Math.max(med, 150);
    for (const p of rows) {
      if (!p.matched || baseline <= 0) { p.verdict = 'observar'; continue; }
      const hi = p.sessions >= hiCut;
      const good = p.conv >= baseline * 1.25 && p.sold >= 2;
      const bad = p.conv <= baseline * 0.5;
      if (good && hi) p.verdict = 'escalar';
      else if (good && !hi) p.verdict = 'explorar';
      else if (hi && bad) p.verdict = 'arreglar';
      else p.verdict = 'observar';
    }
    return { rows, dated };
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
        const [metricRows, pageRows, devices, funnel, salesRes, bounce] = await Promise.all([
          fetchMetrics(clientId, range.from, range.to),
          fetchPages(clientId, range.from, range.to),
          fetchDevices(clientId, range.from, range.to),
          fetchFunnel(clientId, range.from, range.to, property),
          fetchSales(clientId, range.from, range.to, property),
          fetchBounce(clientId, range.from, range.to, property),
        ]);
        if (cancelled) return;
        const products = salesRes?.rows ?? null;
        const salesDated = salesRes?.dated ?? false;

        const daily = buildDaily(metricRows);
        const totals = sumTotals(daily);
        totals.deviceMobile = devices.mobile;
        totals.devicePc = devices.pc;
        totals.deviceTablet = devices.tablet;
        const pages = buildPages(pageRows);

        setData({ daily, pages, totals, funnel, products, salesDated, bounce, from: range.from, to: range.to });
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
