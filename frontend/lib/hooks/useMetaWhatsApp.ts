'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calcDelta } from '@/lib/utils';
import type { DateRange } from '@/lib/period';

// ============================================================
// useMetaWhatsApp — campañas de MENSAJERÍA de Meta (WhatsApp)
// ============================================================
// Fuente autoritativa: meta_messaging (adset·día, optimization_goal=CONVERSATIONS).
// El north-star es el COSTO POR CONVERSACIÓN (eficiencia), no un ROAS: la
// plataforma reporta conversaciones, no compras.
//
// Puente honesto a la venta real: aura_sales, canal "manual" (cierres del equipo
// por chat/DM) sobre el bucket "medición". Se muestra como DIMENSIÓN, no como
// atribución 1:1 — el canal manual incluye también orgánico, referidos y recompra.
//
// La jerarquía llega a nivel CONJUNTO DE ANUNCIOS (meta_messaging no tiene
// granularidad de anuncio). La tendencia mensual usa todo el historial.
// ============================================================

const PAGE = 1000;
const n = (v: unknown) => Number(v || 0);

export interface WaMetric {
  spend: number;
  conversations: number;
  impressions: number;
}
export type WaAdStatus = 'active' | 'paused' | 'rejected' | 'unknown';
export interface WaHierNode {
  name: string;
  m: WaMetric;
  adId?: string;             // solo anuncios
  thumbUrl?: string | null;  // solo anuncios
  isVideo?: boolean;         // solo anuncios
  status?: WaAdStatus;       // solo anuncios
  kids?: WaHierNode[];       // campañas → conjuntos → anuncios
}

// Un ANUNCIO (variante de un par) dentro de una campaña·conjunto.
export interface WaAdNode {
  adId: string;
  adName: string;
  adsetName: string;
  campaignName: string;
  status: WaAdStatus;
  thumbUrl: string | null;
  isVideo: boolean;
  spend: number;
  impressions: number;
  messages: number;
}
// Un PAR (modelo) agregado entre todos los conjuntos, con sus anuncios.
export interface WaPar {
  model: string;
  thumbUrl: string | null;
  spend: number;
  impressions: number;
  messages: number;
  ads: WaAdNode[]; // variantes del par, desc por mensajes
}

export interface WaAdvisor {
  name: string;
  tickets: number;
  cobrado: number;
}

export interface WaAuraBridge {
  hasAura: boolean;
  manualCobrado: number; // canal manual · bucket medición (cobrado)
  manualTickets: number; // # filas en ese bucket
  manualTicket: number; // ticket promedio
  totalMedicion: number; // venta nueva real (todos los canales, bucket medición)
  manualPct: number; // manualCobrado / totalMedicion (0-1)
  advisors: WaAdvisor[]; // cierres manual por asesor (vendedor), desc por cobrado
  from: string;
  to: string;
}

export interface MetaWhatsAppData {
  totals: { spend: number; conversations: number; cpc: number };
  hierarchy: WaHierNode[]; // campaña → conjunto (meta_messaging)
  adHierarchy: WaHierNode[]; // campaña → conjunto → anuncio (meta_campaigns, con impresiones)
  pares: WaPar[]; // modelos agregados entre conjuntos, desc por mensajes
  paresTotals: { messages: number; impressions: number; spend: number };
  concentration: { topShare: number; top3Share: number; parCount: number }; // fracciones 0-1
  monthly: { month: string; spend: number; conversations: number; cpc: number }[];
  aura: WaAuraBridge;
  // deltas vs período anterior
  prevCpc: number;
  cpcDelta: number; // absoluto (cpc actual - cpc previo)
  convDelta: number; // % conversaciones
  spendDelta: number; // % gasto
  campaignCount: number;
  adsetCount: number;
  messagingExistsEver: boolean;
  from: string;
  to: string;
}

export interface UseMetaWhatsAppResult {
  data: MetaWhatsAppData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface MsgRow {
  date: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  conversations: number | null;
  spend: number | null;
}

/** Trae TODO el historial de mensajería del cliente (paginado). */
async function fetchAllMessaging(clientId: string): Promise<MsgRow[]> {
  const all: MsgRow[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('meta_messaging')
      .select('date, campaign_name, adset_name, conversations, spend')
      .eq('client_id', clientId)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as MsgRow[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

interface AuraRow {
  canal: string | null;
  bucket: string | null;
  tipo: string | null;
  cobrado: number | null;
  vendedor: string | null;
  fecha_date: string | null;
}

/** Venta AURA del rango: bucket medición (total) y canal manual (puente WhatsApp). */
async function fetchAuraBridge(clientId: string, from: string, to: string): Promise<WaAuraBridge> {
  const { data, error } = await supabase
    .from('aura_sales')
    .select('canal, bucket, tipo, cobrado, vendedor, fecha_date')
    .eq('client_id', clientId)
    .gte('fecha_date', from)
    .lte('fecha_date', to);

  const empty: WaAuraBridge = {
    hasAura: false, manualCobrado: 0, manualTickets: 0, manualTicket: 0,
    totalMedicion: 0, manualPct: 0, advisors: [], from, to,
  };
  if (error) return empty;
  const rows = (data || []) as AuraRow[];
  if (!rows.length) return empty;

  let manualCobrado = 0;
  let manualTickets = 0;
  let totalMedicion = 0;
  const advMap = new Map<string, { tickets: number; cobrado: number }>();
  for (const r of rows) {
    const medicion = r.bucket === 'medicion';
    if (medicion) totalMedicion += n(r.cobrado);
    if (medicion && r.canal === 'manual') {
      manualCobrado += n(r.cobrado);
      manualTickets += 1;
      const raw = (r.vendedor || '').trim();
      const v = raw && raw !== '-' ? raw : 'Sin asesor';
      const a = advMap.get(v) || { tickets: 0, cobrado: 0 };
      a.tickets += 1;
      a.cobrado += n(r.cobrado);
      advMap.set(v, a);
    }
  }
  const advisors: WaAdvisor[] = Array.from(advMap.entries())
    .map(([name, x]) => ({ name, tickets: x.tickets, cobrado: x.cobrado }))
    .sort((a, b) => b.cobrado - a.cobrado);
  return {
    hasAura: true,
    manualCobrado,
    manualTickets,
    manualTicket: manualTickets > 0 ? manualCobrado / manualTickets : 0,
    totalMedicion,
    manualPct: totalMedicion > 0 ? manualCobrado / totalMedicion : 0,
    advisors,
    from,
    to,
  };
}

function inRange(d: string | null, from: string, to: string): boolean {
  return !!d && d >= from && d <= to;
}

function totalsOf(rows: MsgRow[]): { spend: number; conversations: number; cpc: number } {
  let spend = 0;
  let conversations = 0;
  for (const r of rows) {
    spend += n(r.spend);
    conversations += n(r.conversations);
  }
  return { spend, conversations, cpc: conversations > 0 ? spend / conversations : 0 };
}

/** Árbol campaña → conjunto de anuncios (gasto + conversaciones). */
function buildHierarchy(rows: MsgRow[]): WaHierNode[] {
  const camps = new Map<string, { m: WaMetric; sets: Map<string, WaMetric> }>();
  for (const r of rows) {
    const cn = r.campaign_name || '(sin nombre)';
    let c = camps.get(cn);
    if (!c) { c = { m: { spend: 0, conversations: 0, impressions: 0 }, sets: new Map() }; camps.set(cn, c); }
    c.m.spend += n(r.spend);
    c.m.conversations += n(r.conversations);
    const an = r.adset_name || '(sin conjunto)';
    let s = c.sets.get(an);
    if (!s) { s = { spend: 0, conversations: 0, impressions: 0 }; c.sets.set(an, s); }
    s.spend += n(r.spend);
    s.conversations += n(r.conversations);
  }
  const bySpend = (a: { m: WaMetric }, b: { m: WaMetric }) => b.m.spend - a.m.spend;
  return Array.from(camps.entries())
    .map(([name, c]) => ({
      name,
      m: c.m,
      kids: Array.from(c.sets.entries())
        .map(([sn, m]) => ({ name: sn, m }))
        .sort((a, b) => b.m.spend - a.m.spend),
    }))
    .sort(bySpend);
}

/** Costo por conversación por mes (todo el historial). */
function monthlyOf(rows: MsgRow[]): { month: string; spend: number; conversations: number; cpc: number }[] {
  const m = new Map<string, { spend: number; conversations: number }>();
  for (const r of rows) {
    const mo = (r.date || '').slice(0, 7);
    if (!mo) continue;
    let a = m.get(mo);
    if (!a) { a = { spend: 0, conversations: 0 }; m.set(mo, a); }
    a.spend += n(r.spend);
    a.conversations += n(r.conversations);
  }
  return Array.from(m.entries())
    .map(([month, a]) => ({ month, spend: a.spend, conversations: a.conversations, cpc: a.conversations > 0 ? a.spend / a.conversations : 0 }))
    .sort((x, y) => x.month.localeCompare(y.month));
}

// ── Nivel ANUNCIO (par) desde meta_campaigns + creativos ────────────────────
interface AdRow {
  campaign_name: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  spend: number | null;
  impressions: number | null;
  conversations: number | null;
}

/** Filas nivel anuncio (meta_campaigns) SOLO de las campañas de mensajería del rango. */
async function fetchAdRows(clientId: string, from: string, to: string, msgCampaigns: Set<string>): Promise<AdRow[]> {
  const all: AdRow[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('meta_campaigns')
      .select('campaign_name, adset_name, ad_id, ad_name, spend, impressions, conversations')
      .eq('client_id', clientId)
      .gte('date', from)
      .lte('date', to)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as AdRow[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all.filter((r) => r.campaign_name && msgCampaigns.has(r.campaign_name));
}

/** Creativo + estado por anuncio (meta_ad_creatives). */
async function fetchAdCreatives(clientId: string): Promise<Map<string, { img: string | null; isVideo: boolean; status: WaAdStatus }>> {
  const m = new Map<string, { img: string | null; isVideo: boolean; status: WaAdStatus }>();
  const { data, error } = await supabase
    .from('meta_ad_creatives')
    .select('ad_id, image_url, thumbnail_url, is_video, status')
    .eq('client_id', clientId)
    .range(0, 4999);
  if (error) return m;
  for (const r of (data || []) as any[]) {
    if (!r.ad_id) continue;
    m.set(r.ad_id, {
      img: (r.image_url || r.thumbnail_url || '') || null,
      isVideo: !!r.is_video,
      status: statusCls(r.status),
    });
  }
  return m;
}

function statusCls(s: string | null): WaAdStatus {
  const v = (s || '').toUpperCase();
  if (v === 'ACTIVE') return 'active';
  if (v === 'DISAPPROVED' || v === 'WITH_ISSUES') return 'rejected';
  if (v.includes('PAUSED')) return 'paused';
  return 'unknown';
}

/** Extrae el "par" (modelo) del nombre del anuncio: quita emojis/símbolos, toma
 *  lo previo al primer "|", quita años y unifica variantes de nombre conocidas. */
function parModel(nm: string): string {
  let s = (nm || '').replace(/^[^\p{L}\p{N}]+/u, '');
  s = s.split('|')[0];
  s = s.replace(/\b20\d{2}\b/g, ' ').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim().replace(/^[-·\s]+|[-·\s]+$/g, '');
  const low = s.toLowerCase();
  if (low.includes('alaska')) return 'Air Jordan 1 Off-White "Alaska"';
  if (low.includes('flint')) return 'Jordan 13 Flint';
  if (low.includes('space jam')) return 'Jordan 9 Space Jam';
  if (low.includes('bloodline')) return 'Jordan 12 Bloodline';
  if (low.includes('balvin')) return 'Jordan 4 x J Balvin';
  if (low.includes('tour yellow')) return 'Jordan 4 Tour Yellow';
  if (low.includes('badbo') || low.includes('chalk')) return 'Adidas Badbo 1.0 Chalk White';
  if (low.includes('travis')) return 'Jordan x Travis Scott';
  return s || nm;
}

/** Agrega filas nivel anuncio → lista de anuncios únicos (con estado y creativo). */
function buildAdNodes(rows: AdRow[], creatives: Map<string, { img: string | null; isVideo: boolean; status: WaAdStatus }>): WaAdNode[] {
  const map = new Map<string, WaAdNode>();
  for (const r of rows) {
    const adId = r.ad_id || `(sin id) ${r.ad_name || ''}`;
    let a = map.get(adId);
    if (!a) {
      const cr = r.ad_id ? creatives.get(r.ad_id) : undefined;
      a = {
        adId, adName: r.ad_name || '(sin nombre)',
        adsetName: r.adset_name || '(sin conjunto)',
        campaignName: r.campaign_name || '(sin campaña)',
        status: cr?.status ?? 'unknown', thumbUrl: cr?.img ?? null, isVideo: cr?.isVideo ?? false,
        spend: 0, impressions: 0, messages: 0,
      };
      map.set(adId, a);
    }
    a.spend += n(r.spend);
    a.impressions += n(r.impressions);
    a.messages += n(r.conversations);
  }
  return Array.from(map.values());
}

/** Agrupa los anuncios por PAR (modelo), cruzando conjuntos. */
function buildPares(ads: WaAdNode[]): WaPar[] {
  const map = new Map<string, WaPar>();
  for (const a of ads) {
    const model = parModel(a.adName);
    let p = map.get(model);
    if (!p) { p = { model, thumbUrl: null, spend: 0, impressions: 0, messages: 0, ads: [] }; map.set(model, p); }
    p.spend += a.spend;
    p.impressions += a.impressions;
    p.messages += a.messages;
    p.ads.push(a);
    // miniatura: preferir la de un anuncio activo con imagen
    if (!p.thumbUrl && a.thumbUrl) p.thumbUrl = a.thumbUrl;
    if (a.status === 'active' && a.thumbUrl) p.thumbUrl = a.thumbUrl;
  }
  const list = Array.from(map.values());
  for (const p of list) p.ads.sort((x, y) => y.messages - x.messages);
  return list.sort((x, y) => y.messages - x.messages);
}

/** Árbol campaña → conjunto → anuncio desde las filas nivel anuncio. */
function buildAdHierarchy(ads: WaAdNode[]): WaHierNode[] {
  const camps = new Map<string, { m: WaMetric; sets: Map<string, { m: WaMetric; ads: WaAdNode[] }> }>();
  const zero = (): WaMetric => ({ spend: 0, conversations: 0, impressions: 0 });
  const addTo = (m: WaMetric, a: WaAdNode) => { m.spend += a.spend; m.conversations += a.messages; m.impressions += a.impressions; };
  for (const a of ads) {
    let c = camps.get(a.campaignName);
    if (!c) { c = { m: zero(), sets: new Map() }; camps.set(a.campaignName, c); }
    addTo(c.m, a);
    let s = c.sets.get(a.adsetName);
    if (!s) { s = { m: zero(), ads: [] }; c.sets.set(a.adsetName, s); }
    addTo(s.m, a);
    s.ads.push(a);
  }
  const bySpend = (x: { m: WaMetric }, y: { m: WaMetric }) => y.m.spend - x.m.spend;
  return Array.from(camps.entries()).map(([name, c]) => ({
    name, m: c.m,
    kids: Array.from(c.sets.entries()).map(([sn, s]) => ({
      name: sn, m: s.m,
      kids: s.ads.map((a) => ({
        name: a.adName, adId: a.adId, thumbUrl: a.thumbUrl, isVideo: a.isVideo, status: a.status,
        m: { spend: a.spend, conversations: a.messages, impressions: a.impressions },
      })).sort((x, y) => y.m.spend - x.m.spend),
    })).sort(bySpend),
  })).sort(bySpend);
}

export function useMetaWhatsApp(
  clientId: string,
  range: DateRange,
  previous: DateRange
): UseMetaWhatsAppResult {
  const [data, setData] = useState<MetaWhatsAppData | null>(null);
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
        const [allRows, aura, creatives] = await Promise.all([
          fetchAllMessaging(clientId),
          fetchAuraBridge(clientId, range.from, range.to),
          fetchAdCreatives(clientId),
        ]);
        if (cancelled) return;

        const nowRows = allRows.filter((r) => inRange(r.date, range.from, range.to));
        const prevRows = allRows.filter((r) => inRange(r.date, previous.from, previous.to));

        const totals = totalsOf(nowRows);
        const prev = totalsOf(prevRows);
        const hierarchy = buildHierarchy(nowRows);
        const monthly = monthlyOf(allRows);

        // Nivel anuncio (par): meta_campaigns de las campañas de mensajería del rango.
        const msgCampaigns = new Set(nowRows.map((r) => r.campaign_name || '').filter(Boolean));
        const adRows = await fetchAdRows(clientId, range.from, range.to, msgCampaigns);
        if (cancelled) return;
        const adNodes = buildAdNodes(adRows, creatives);
        const pares = buildPares(adNodes);
        const adHierarchy = buildAdHierarchy(adNodes);
        const totMsgs = pares.reduce((s, p) => s + p.messages, 0) || 1;
        const paresTotals = {
          messages: pares.reduce((s, p) => s + p.messages, 0),
          impressions: pares.reduce((s, p) => s + p.impressions, 0),
          spend: pares.reduce((s, p) => s + p.spend, 0),
        };
        const concentration = {
          topShare: pares.length ? pares[0].messages / totMsgs : 0,
          top3Share: pares.slice(0, 3).reduce((s, p) => s + p.messages, 0) / totMsgs,
          parCount: pares.length,
        };

        setData({
          totals,
          hierarchy,
          adHierarchy,
          pares,
          paresTotals,
          concentration,
          monthly,
          aura,
          prevCpc: prev.cpc,
          cpcDelta: totals.cpc - prev.cpc,
          convDelta: calcDelta(totals.conversations, prev.conversations),
          spendDelta: calcDelta(totals.spend, prev.spend),
          campaignCount: hierarchy.length,
          adsetCount: hierarchy.reduce((s, c) => s + (c.kids?.length || 0), 0),
          messagingExistsEver: allRows.length > 0,
          from: range.from,
          to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useMetaWhatsApp]', e);
        setError(e?.message || 'Error desconocido al cargar WhatsApp de Meta');
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
