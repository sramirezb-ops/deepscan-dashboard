'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { floorGadsFrom } from '@/lib/dataFloors';
import { calcDelta } from '@/lib/utils';
import type { DateRange } from '@/lib/period';

// ============================================================
// MODELO DE ATRIBUCIÓN DEL OVERVIEW (documentado, no "mágico")
// ============================================================
// Fuentes con ETL detectadas: Google Ads (gads_campaigns), GA4 (ga4_metrics),
// Meta Ads (meta_campaigns) y Shopify (shopify_orders). TikTok aún no.
//
// ⚠️ TRES MUNDOS QUE CONVIVEN Y SE DIFERENCIAN — nunca se suman ni se mezclan:
//
//  1) INTENCIÓN (Google Ads). La acción de conversión configurada en Google
//     Ads es "Add to cart", NO la compra. Por lo tanto:
//       - gads.conversions = # de carritos (add-to-cart), NO ventas.
//       - gads.conv_value  = valor de esos carritos, NO revenue de venta.
//       - atcRoas = valor ATC / gasto Google → PROXY DE INTENCIÓN, no un ROAS
//         de venta real. Se muestra etiquetado como tal, aparte del real.
//
//  2) COMPRA REAL CONSOLIDADA (GA4). El revenue y las compras confirmadas:
//       - revenue = GA4 revenue (compra). Fuente de venta consolidada hoy;
//         ya incluye las compras originadas por Meta (paid social), orgánico,
//         directo, etc. Por eso NO se le suma el purchase_value de Meta.
//       - sales   = compras estimadas GA4 (sessions × conv_rate). Estimación
//         hasta adoptar Shopify como venta confirmada E2E.
//       - roas = revenue de compra / INVERSIÓN TOTAL (Google + Meta).
//       - cpa  = inversión total / compras.
//
//  3) COMPRA ATRIBUIDA POR META (meta_campaigns). Meta SÍ mide compra con su
//     propio modelo de atribución (view-through/click), distinto de Google:
//       - metaPurchases / metaRevenue (purchase_value) + funnel propio.
//       - metaRoas = metaRevenue / metaSpend.
//     Se muestra en su PROPIO panel; NO se suma al revenue de GA4 (doble
//     conteo). Lo único de Meta que sí entra al total es el GASTO.
//
// Inversión total = gasto de Google Ads + gasto de Meta Ads. (Antes solo
// contaba Google, lo que subestimaba la inversión e inflaba el ROAS real.)
//
// Shopify (shopify_orders con datos): fuente autoritativa de venta a futuro,
// pero tiene pedidos en estado "pendiente" (pago no confirmado) que no deben
// contarse como revenue hasta completarse. Aún no se adopta como north-star;
// por ahora solo se reporta su presencia en integraciones. Ver nota en la UI.
// ============================================================

export interface OverviewData {
  // ── MUNDO COMPRA REAL (GA4) ──────────────────────────────
  // Revenue y ventas de COMPRA. Estimado hasta que Shopify entregue el dato
  // confirmado. El north-star del tablero.
  revenue: number;
  investment: number;
  roas: number;
  sales: number;
  cpa: number;
  conversionRate: number;

  // Deltas vs periodo anterior
  revenueDelta: number;
  investmentDelta: number;
  roasDelta: number;
  salesDelta: number;
  cpaDelta: number;
  conversionRateDelta: number;

  // Inversión desglosada por canal (para los paneles por-mundo). `investment`
  // de arriba es el TOTAL (Google + Meta); estos son los componentes.
  googleSpend: number;
  googleSpendDelta: number;

  // ── MUNDO INTENCIÓN (Google Ads · add-to-cart) ───────────
  // La conversión configurada en Google es "add to cart", NO compra. Estas
  // métricas miden INTENCIÓN y se muestran SIEMPRE separadas de la venta real.
  //  - addToCart:      # de carritos (gads.conversions).
  //  - addToCartValue: valor de esos carritos (gads.conv_value).
  //  - atcRoas:        valor ATC / gasto Google → proxy de intención, no venta.
  addToCart: number;
  addToCartValue: number;
  atcRoas: number;
  addToCartDelta: number;
  addToCartValueDelta: number;
  atcRoasDelta: number;

  // ── MUNDO COMPRA ATRIBUIDA POR META (meta_campaigns) ─────
  // Meta reporta compra con su propio modelo de atribución. Se lee aparte y
  // NO se suma al revenue de GA4 (doble conteo). El gasto sí entra al total.
  metaSpend: number;
  metaPurchases: number;
  metaRevenue: number; // purchase_value
  metaRoas: number; // metaRevenue / metaSpend
  metaViewContent: number;
  metaAddToCart: number;
  metaInitiateCheckout: number;
  metaExists: boolean; // ¿hay filas de Meta en el período?
  metaSpendDelta: number;
  metaPurchasesDelta: number;
  metaRevenueDelta: number;
  metaRoasDelta: number;

  // ── MUNDO VENTA REAL (AURA · venta cobrada) — NORTH-STAR ecommerce ──
  // AURA es el sistema de ventas del cliente (manual/WhatsApp/POS/web). Aquí vive
  // la venta real cobrada, que el checkout web subregistra. Solo aplica a clientes
  // con aura_sheet_id configurado; para el resto auraExists=false.
  auraExists: boolean;
  auraCobrado: number;      // medición cobrada — el north-star
  auraCobradoDelta: number;
  auraBruto: number;        // bruto cobrado (todas las filas, dedup)
  auraTicket: number;       // ticket promedio (ventas medición, sin abonos)
  mer: number;              // auraCobrado / inversión total
  merDelta: number;
  auraCambio: number;       // excluido: cambios (exchange)
  auraCowmmerce: number;    // excluido: marketplace / mercadolibre
  auraPrueba: number;       // excluido: pruebas (<=50)

  // ── WHATSAPP (meta_messaging · conversaciones) ──
  waConversations: number;
  waConversationsDelta: number;
  waCostPerConv: number;    // spend / conversations
  waSpend: number;
  waShareOfMeta: number;    // waSpend / metaSpend (0-1)

  // ── SHOPIFY (cobro real: bruto / cobrado / pendiente) ──
  shopBruto: number;
  shopCobrado: number;      // bruto − pendiente
  shopPendiente: number;
  shopCollectedPct: number; // cobrado / bruto (0-1)

  // ── GA4 por propiedad (las 2 webs, separadas, sin sumar) ──
  ga4Sites: { property: string; sessions: number; revenue: number }[];

  // Serie diaria de revenue para la evolución (período actual vs anterior,
  // alineados por índice de día). `previous` es null si el período anterior
  // tiene menos días con datos que el actual en ese índice.
  dailyRevenue: { date: string; current: number; previous: number | null }[];

  // Presencia REAL de datos por fuente en el período (para el panel de
  // integraciones). `days` = días distintos con filas. `active` = hubo datos.
  // Solo reportamos fuentes con ETL (Google Ads, GA4); el resto no tiene
  // pipeline y se marca como pendiente en la UI, sin inventar métricas.
  sources: {
    googleAds: { active: boolean; days: number };
    ga4: { active: boolean; days: number };
    meta: { active: boolean; days: number };
    shopify: { active: boolean; days: number };
  };

  // Metadata
  from: string;
  to: string;
}

export interface UseOverviewResult {
  data: OverviewData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Trae las filas diarias de Google Ads (gads_campaigns) para el rango.
 * Columnas: date, client_id, campaign_id, impressions, clicks, cost,
 * conversions, conv_value. Devolvemos las filas crudas para derivar tanto
 * los totales del período como la serie diaria (evolución de revenue).
 */
async function fetchGoogleAdsRows(clientId: string, from: string, to: string) {
  const { data, error } = await supabase
    .from('gads_campaigns')
    .select('date, cost, conv_value, conversions, impressions, clicks')
    .eq('client_id', clientId)
    .gte('date', floorGadsFrom(from, clientId))
    .lte('date', to);

  if (error) throw error;
  return (data || []) as any[];
}

/**
 * Trae las filas diarias de GA4 (ga4_metrics) para el rango.
 * Columnas reales: date, client_id, sessions, new_users, active_users,
 * bounce_rate, avg_session_duration, conv_rate, revenue, source_medium.
 * Nota: purchases NO existe como columna, se estima sessions * conv_rate.
 */
async function fetchGA4Rows(clientId: string, from: string, to: string) {
  const { data, error } = await supabase
    .from('ga4_metrics')
    .select('date, sessions, active_users, conv_rate, revenue, source_medium')
    .eq('client_id', clientId)
    .gte('date', from)
    .lte('date', to);

  if (error) throw error;
  return (data || []) as any[];
}

/**
 * AURA (venta real). Filas por venta con bucket ya clasificado. Resiliente: si la
 * tabla no existe (clientes sin AURA), devuelve []. Se filtra por fecha_date.
 */
async function fetchAuraRows(clientId: string, from: string, to: string) {
  const { data, error } = await supabase
    .from('aura_sales')
    .select('bucket, tipo, cobrado')
    .eq('client_id', clientId)
    .gte('fecha_date', from)
    .lte('fecha_date', to);
  if (error) return [] as any[];
  return (data || []) as any[];
}

/** WhatsApp: conversaciones y gasto de campañas de mensajería (meta_messaging). */
async function fetchMessagingRows(clientId: string, from: string, to: string) {
  const { data, error } = await supabase
    .from('meta_messaging')
    .select('conversations, spend')
    .eq('client_id', clientId)
    .gte('date', from)
    .lte('date', to);
  if (error) return [] as any[];
  return (data || []) as any[];
}

/** Shopify: revenue bruto y pendiente (para separar cobrado). Agregado diario. */
async function fetchShopifyRows(clientId: string, from: string, to: string) {
  const { data, error } = await supabase
    .from('shopify_orders')
    .select('revenue, revenue_pending')
    .eq('client_id', clientId)
    .gte('date', from)
    .lte('date', to);
  if (error) return [] as any[];
  return (data || []) as any[];
}

/**
 * Trae las filas de Meta Ads (meta_campaigns) para el rango. A nivel
 * campaña/día el volumen puede superar las 1000 filas por request, así que
 * paginamos (igual que useMeta). Columnas usadas: gasto, compra atribuida por
 * Meta (purchases/purchase_value) y su funnel (view_content, add_to_cart,
 * initiate_checkout).
 */
async function fetchMetaRows(clientId: string, from: string, to: string) {
  const PAGE = 1000;
  const all: any[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('meta_campaigns')
      .select('date, spend, purchases, purchase_value, view_content, add_to_cart, initiate_checkout')
      .eq('client_id', clientId)
      .gte('date', from)
      .lte('date', to)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as any[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

/**
 * Cuenta los días con datos de Shopify (shopify_orders) en el rango. La tabla
 * trae una fila por día ya agregada, así que el count = # de días. Solo se usa
 * para el estado de integraciones; no se adopta como fuente de revenue todavía.
 */
async function fetchShopifyDays(clientId: string, from: string, to: string): Promise<number> {
  const { count, error } = await supabase
    .from('shopify_orders')
    .select('date', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('date', from)
    .lte('date', to);
  if (error) throw error;
  return count || 0;
}

/** Suma los totales de Meta Ads a partir de las filas. */
function sumMeta(rows: any[]) {
  return rows.reduce(
    (acc, r) => {
      acc.spend += Number(r.spend) || 0;
      acc.purchases += Number(r.purchases) || 0;
      acc.revenue += Number(r.purchase_value) || 0;
      acc.viewContent += Number(r.view_content) || 0;
      acc.addToCart += Number(r.add_to_cart) || 0;
      acc.initiateCheckout += Number(r.initiate_checkout) || 0;
      return acc;
    },
    { spend: 0, purchases: 0, revenue: 0, viewContent: 0, addToCart: 0, initiateCheckout: 0 }
  );
}

/** Suma los totales de Google Ads a partir de las filas diarias. */
function sumGads(rows: any[]) {
  return rows.reduce(
    (acc, row) => {
      acc.cost += Number(row.cost) || 0;
      acc.revenue += Number(row.conv_value) || 0;
      acc.conversions += Number(row.conversions) || 0;
      acc.impressions += Number(row.impressions) || 0;
      acc.clicks += Number(row.clicks) || 0;
      return acc;
    },
    { cost: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 }
  );
}

/**
 * Detecta la escala de conv_rate en un dataset y devuelve el factor para
 * convertirlo a fracción (0-1). GA4 puede exportarlo como decimal (0.023) o
 * como porcentaje (2.3). Las tasas de conversión ecommerce viven en ~0.5%–8%,
 * así que en forma decimal SIEMPRE son < 1 y en forma porcentaje son > 1.
 * Miramos la mediana de los valores > 0: si supera 1, está en porcentaje.
 * Devuelve 0.01 (dividir entre 100) o 1. Evita el error ×100 en "Ventas".
 */
function convRateFactor(rows: any[]): number {
  const vals = rows
    .map((r) => Number(r.conv_rate))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (vals.length === 0) return 1;
  const median = vals[Math.floor(vals.length / 2)];
  return median > 1 ? 0.01 : 1;
}

/** Suma los totales de GA4 a partir de las filas diarias. */
function sumGA4(rows: any[]) {
  // La escala de conv_rate se decide UNA vez por dataset (no fila a fila).
  const factor = convRateFactor(rows);
  return rows.reduce(
    (acc, row) => {
      const sessions = Number(row.sessions) || 0;
      // conv_rate normalizado a fracción (0-1) y acotado por seguridad.
      const convRate = Math.min(1, Math.max(0, (Number(row.conv_rate) || 0) * factor));
      // purchases es una ESTIMACIÓN GA4 (no hay columna de compras): sessions × cr.
      const estimatedPurchases = sessions * convRate;
      acc.sessions += sessions;
      acc.users += Number(row.active_users) || 0;
      acc.purchases += estimatedPurchases;
      acc.revenue += Number(row.revenue) || 0;
      return acc;
    },
    { sessions: 0, users: 0, purchases: 0, revenue: 0 }
  );
}

/** Totales AURA por bucket (cobrado) + ticket promedio de ventas medición. */
function sumAura(rows: any[]) {
  let cobrado = 0, cambio = 0, cowmmerce = 0, prueba = 0;
  let medVentaSum = 0, medVentaCount = 0;
  for (const r of rows) {
    const c = Number(r.cobrado) || 0;
    const bucket = r.bucket;
    if (bucket === 'medicion') {
      cobrado += c;
      if ((r.tipo || '').toUpperCase() === 'VENTA') { medVentaSum += c; medVentaCount += 1; }
    } else if (bucket === 'cambio') cambio += c;
    else if (bucket === 'cowmmerce') cowmmerce += c;
    else if (bucket === 'prueba') prueba += c;
  }
  const bruto = cobrado + cambio + cowmmerce + prueba;
  const ticket = medVentaCount > 0 ? medVentaSum / medVentaCount : 0;
  return { cobrado, cambio, cowmmerce, prueba, bruto, ticket, exists: rows.length > 0 };
}

/** Totales WhatsApp (meta_messaging). */
function sumMessaging(rows: any[]) {
  let conversations = 0, spend = 0;
  for (const r of rows) { conversations += Number(r.conversations) || 0; spend += Number(r.spend) || 0; }
  return { conversations, spend, costPerConv: conversations > 0 ? spend / conversations : 0 };
}

/** Totales Shopify (bruto / pendiente → cobrado). */
function sumShopify(rows: any[]) {
  let bruto = 0, pendiente = 0;
  for (const r of rows) { bruto += Number(r.revenue) || 0; pendiente += Number(r.revenue_pending) || 0; }
  const cobrado = Math.max(0, bruto - pendiente);
  return { bruto, pendiente, cobrado, collectedPct: bruto > 0 ? cobrado / bruto : 0 };
}

/**
 * Sesiones/revenue por propiedad GA4. El id de propiedad viene como prefijo de
 * source_medium ("508597206 / Organic Search"). Este cliente envía tráfico a DOS
 * webs (dos propiedades): se reportan SEPARADAS, nunca sumadas.
 */
function ga4ByProperty(rows: any[]): { property: string; sessions: number; revenue: number }[] {
  const m = new Map<string, { sessions: number; revenue: number }>();
  for (const r of rows) {
    const prop = String(r.source_medium || '').split('/')[0].trim() || '(nd)';
    const e = m.get(prop) || { sessions: 0, revenue: 0 };
    e.sessions += Number(r.sessions) || 0;
    e.revenue += Number(r.revenue) || 0;
    m.set(prop, e);
  }
  return Array.from(m.entries())
    .map(([property, v]) => ({ property, ...v }))
    .sort((a, b) => b.sessions - a.sessions);
}

/**
 * Serie diaria de revenue de COMPRA REAL, tomada SOLO de GA4 (revenue). No se
 * mezcla con el valor de add-to-cart de Google (que es intención, no venta, y
 * lo inflaría). Ordenada ascendente por fecha.
 */
function purchaseRevenueSeries(ga4Rows: any[]): { date: string; revenue: number }[] {
  const m = new Map<string, number>();
  for (const r of ga4Rows) {
    const d = r.date;
    if (!d) continue;
    m.set(d, (m.get(d) || 0) + (Number(r.revenue) || 0));
  }
  return Array.from(m.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, revenue]) => ({ date, revenue }));
}

export function useOverview(
  clientId: string,
  range: DateRange,
  previous: DateRange
): UseOverviewResult {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const current = range;

        // Consultas en paralelo — filas diarias crudas de cada fuente
        const [
          gadsNowRows,
          gadsPrevRows,
          ga4NowRows,
          ga4PrevRows,
          metaNowRows,
          metaPrevRows,
          shopifyDays,
          auraNowRows,
          auraPrevRows,
          msgNowRows,
          msgPrevRows,
          shopNowRows,
        ] = await Promise.all([
          fetchGoogleAdsRows(clientId, current.from, current.to),
          fetchGoogleAdsRows(clientId, previous.from, previous.to),
          fetchGA4Rows(clientId, current.from, current.to),
          fetchGA4Rows(clientId, previous.from, previous.to),
          fetchMetaRows(clientId, current.from, current.to),
          fetchMetaRows(clientId, previous.from, previous.to),
          fetchShopifyDays(clientId, current.from, current.to),
          fetchAuraRows(clientId, current.from, current.to),
          fetchAuraRows(clientId, previous.from, previous.to),
          fetchMessagingRows(clientId, current.from, current.to),
          fetchMessagingRows(clientId, previous.from, previous.to),
          fetchShopifyRows(clientId, current.from, current.to),
        ]);

        if (cancelled) return;

        // Totales del período (a partir de las filas)
        const gadsNow = sumGads(gadsNowRows);
        const gadsPrev = sumGads(gadsPrevRows);
        const ga4Now = sumGA4(ga4NowRows);
        const ga4Prev = sumGA4(ga4PrevRows);
        const metaNow = sumMeta(metaNowRows);
        const metaPrev = sumMeta(metaPrevRows);

        // Serie diaria de revenue de COMPRA (solo GA4): actual vs anterior.
        const curSeries = purchaseRevenueSeries(ga4NowRows);
        const prevSeries = purchaseRevenueSeries(ga4PrevRows);
        const dailyRevenue = curSeries.map((p, i) => ({
          date: p.date,
          current: p.revenue,
          previous: i < prevSeries.length ? prevSeries[i].revenue : null,
        }));

        // Inversión: gasto de Google + gasto de Meta (ambos con ETL). El gasto
        // de Google se guarda aparte para el panel de intención (atcRoas).
        const googleSpend = gadsNow.cost;
        const googleSpendPrev = gadsPrev.cost;
        const metaSpend = metaNow.spend;
        const metaSpendPrev = metaPrev.spend;
        const investment = googleSpend + metaSpend;
        const investmentPrev = googleSpendPrev + metaSpendPrev;

        // ── VENTA REAL (AURA) ──────────────────────────────────────
        const auraNow = sumAura(auraNowRows);
        const auraPrev = sumAura(auraPrevRows);
        const mer = investment > 0 ? auraNow.cobrado / investment : 0;
        const merPrev = investmentPrev > 0 ? auraPrev.cobrado / investmentPrev : 0;

        // ── WHATSAPP (meta_messaging) ──────────────────────────────
        const msgNow = sumMessaging(msgNowRows);
        const msgPrev = sumMessaging(msgPrevRows);

        // ── SHOPIFY (cobro) ────────────────────────────────────────
        const shop = sumShopify(shopNowRows);

        // ── GA4 por propiedad (2 webs) ─────────────────────────────
        const ga4Sites = ga4ByProperty(ga4NowRows);

        // ── MUNDO COMPRA REAL (GA4) ────────────────────────────────
        // Revenue de compra: SOLO GA4. Ya no se hace max() con el valor de
        // add-to-cart de Google (intención), que lo inflaba.
        const revenue = ga4Now.revenue;
        const revenuePrev = ga4Prev.revenue;
        // Ventas = compras estimadas GA4 (sessions × conv_rate). No usamos las
        // conversiones de Google porque ésas son add-to-cart, no compras.
        const sales = Math.round(ga4Now.purchases);
        const salesPrev = Math.round(ga4Prev.purchases);
        const sessions = ga4Now.sessions;
        const sessionsPrev = ga4Prev.sessions;

        const roas = investment > 0 ? revenue / investment : 0;
        const roasPrev = investmentPrev > 0 ? revenuePrev / investmentPrev : 0;
        const cpa = sales > 0 ? investment / sales : 0;
        const cpaPrev = salesPrev > 0 ? investmentPrev / salesPrev : 0;
        const conversionRate = sessions > 0 ? sales / sessions : 0;
        const conversionRatePrev = sessionsPrev > 0 ? salesPrev / sessionsPrev : 0;

        // ── MUNDO INTENCIÓN (Google Ads · add-to-cart) ─────────────
        // conversions = carritos, conv_value = valor de carritos. NO es venta.
        const addToCart = Math.round(gadsNow.conversions);
        const addToCartPrev = Math.round(gadsPrev.conversions);
        const addToCartValue = gadsNow.revenue; // conv_value agregado
        const addToCartValuePrev = gadsPrev.revenue;
        // ROAS ATC usa el gasto de GOOGLE (no el total): es intención de Google.
        const atcRoas = googleSpend > 0 ? addToCartValue / googleSpend : 0;
        const atcRoasPrev = googleSpendPrev > 0 ? addToCartValuePrev / googleSpendPrev : 0;

        // ── MUNDO COMPRA ATRIBUIDA POR META ────────────────────────
        // Compra que Meta atribuye a sus campañas (modelo propio). Se lee
        // aparte; NO se suma al revenue de GA4.
        const metaRevenue = metaNow.revenue;
        const metaRevenuePrev = metaPrev.revenue;
        const metaPurchases = Math.round(metaNow.purchases);
        const metaPurchasesPrev = Math.round(metaPrev.purchases);
        const metaRoas = metaSpend > 0 ? metaRevenue / metaSpend : 0;
        const metaRoasPrev = metaSpendPrev > 0 ? metaRevenuePrev / metaSpendPrev : 0;

        // Presencia real por fuente: días distintos con filas en el período.
        const distinctDays = (rows: any[]) =>
          new Set(rows.map((r) => r.date).filter(Boolean)).size;
        const gadsDays = distinctDays(gadsNowRows);
        const ga4Days = distinctDays(ga4NowRows);
        const metaDays = distinctDays(metaNowRows);

        const overview: OverviewData = {
          revenue,
          investment,
          roas,
          sales,
          cpa,
          conversionRate,

          revenueDelta: calcDelta(revenue, revenuePrev),
          investmentDelta: calcDelta(investment, investmentPrev),
          roasDelta: roas - roasPrev, // delta absoluto para ROAS
          salesDelta: calcDelta(sales, salesPrev),
          cpaDelta: calcDelta(cpa, cpaPrev),
          conversionRateDelta: (conversionRate - conversionRatePrev) * 100, // en pp

          googleSpend,
          googleSpendDelta: calcDelta(googleSpend, googleSpendPrev),

          addToCart,
          addToCartValue,
          atcRoas,
          addToCartDelta: calcDelta(addToCart, addToCartPrev),
          addToCartValueDelta: calcDelta(addToCartValue, addToCartValuePrev),
          atcRoasDelta: atcRoas - atcRoasPrev,

          metaSpend,
          metaPurchases,
          metaRevenue,
          metaRoas,
          metaViewContent: Math.round(metaNow.viewContent),
          metaAddToCart: Math.round(metaNow.addToCart),
          metaInitiateCheckout: Math.round(metaNow.initiateCheckout),
          metaExists: metaDays > 0,
          metaSpendDelta: calcDelta(metaSpend, metaSpendPrev),
          metaPurchasesDelta: calcDelta(metaPurchases, metaPurchasesPrev),
          metaRevenueDelta: calcDelta(metaRevenue, metaRevenuePrev),
          metaRoasDelta: metaRoas - metaRoasPrev,

          // AURA (venta real · north-star)
          auraExists: auraNow.exists,
          auraCobrado: auraNow.cobrado,
          auraCobradoDelta: calcDelta(auraNow.cobrado, auraPrev.cobrado),
          auraBruto: auraNow.bruto,
          auraTicket: auraNow.ticket,
          mer,
          merDelta: mer - merPrev,
          auraCambio: auraNow.cambio,
          auraCowmmerce: auraNow.cowmmerce,
          auraPrueba: auraNow.prueba,

          // WhatsApp
          waConversations: Math.round(msgNow.conversations),
          waConversationsDelta: calcDelta(msgNow.conversations, msgPrev.conversations),
          waCostPerConv: msgNow.costPerConv,
          waSpend: msgNow.spend,
          waShareOfMeta: metaSpend > 0 ? msgNow.spend / metaSpend : 0,

          // Shopify (cobro)
          shopBruto: shop.bruto,
          shopCobrado: shop.cobrado,
          shopPendiente: shop.pendiente,
          shopCollectedPct: shop.collectedPct,

          // GA4 por propiedad (2 webs)
          ga4Sites,

          dailyRevenue,

          sources: {
            googleAds: { active: gadsDays > 0, days: gadsDays },
            ga4: { active: ga4Days > 0, days: ga4Days },
            meta: { active: metaDays > 0, days: metaDays },
            shopify: { active: shopifyDays > 0, days: shopifyDays },
          },

          from: current.from,
          to: current.to,
        };

        setData(overview);
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useOverview]', e);
        setError(e?.message || 'Error desconocido al cargar overview');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [clientId, range.from, range.to, previous.from, previous.to, tick]);

  return {
    data,
    loading,
    error,
    refresh: () => setTick((t) => t + 1),
  };
}
