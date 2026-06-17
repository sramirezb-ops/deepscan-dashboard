'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calcDelta } from '@/lib/utils';
import type { DateRange } from '@/lib/period';

// ============================================================
// useMetaWhatsApp — campañas de MENSAJES de Meta (campaña + ad set)
// ============================================================
// Lee meta_messaging (nivel adset/día, optimization_goal=CONVERSATIONS) y arma
// el detalle ejecutivo de las campañas de conversaciones:
//   1. Por campaña — conversaciones, inversión, costo por conversación, destino.
//   2. Por ad set — el mismo detalle a nivel conjunto, conservando el EMOJI que
//      el equipo pone al inicio del nombre como marcador manual de conversión.
//   3. Por destino — WhatsApp / Messenger / Instagram Direct (señal real del
//      destination_type del adset, no adivinada por el nombre).
//   4. Serie diaria — conversaciones, inversión y costo/conversación por día.
//
// La métrica "conversaciones con mensaje iniciadas" es dato real de Meta. Si no
// hay filas en el rango, no se inventa nada (estado honesto en la vista).
//
// El desglose POR ANUNCIO (con miniatura) no vive aún aquí: la tabla a nivel
// anuncio (meta_campaigns) no guarda conversaciones todavía. Eso es la Parte 2.
// ============================================================

export interface WaCampaignRow {
  campaign: string;
  destination: string;
  conversations: number;
  spend: number;
  costPerConversation: number; // spend / conversations
}

// Lectura automática del rendimiento de un anuncio (regla determinista, no IA):
// se compara su costo por conversación contra el promedio de su propio conjunto.
export type WaAdTone = 'win' | 'ok' | 'warn' | 'bad' | 'pending';

export interface WaAdRow {
  adId: string;
  adName: string;
  emoji: string; // marcador del nombre del anuncio (si lo trae)
  cleanName: string; // nombre del anuncio sin el emoji inicial
  adset: string;
  campaign: string;
  thumbUrl: string | null;
  status: string; // effective_status crudo de Meta (ACTIVE / PAUSED / …)
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number; // clicks / impresiones
  conversations: number;
  costPerConversation: number;
  analysisTone: WaAdTone;
  analysisLabel: string; // texto corto del análisis
}

export interface WaAdsetRow {
  adset: string; // nombre completo del conjunto (incluye el emoji)
  emoji: string; // marcador de conversión extraído del inicio del nombre
  cleanName: string; // nombre del conjunto sin el emoji inicial
  campaign: string;
  destination: string;
  conversations: number;
  spend: number;
  costPerConversation: number;
  ads: WaAdRow[]; // anuncios del conjunto (vacío hasta que el conector los traiga)
}

export interface WaDestinationRow {
  destination: string;
  conversations: number;
  spend: number;
  costPerConversation: number;
}

export interface WaDailyRow {
  date: string; // YYYY-MM-DD
  conversations: number;
  spend: number;
  costPerConversation: number; // spend / conversations del día
}

export interface WaTotals {
  conversations: number;
  spend: number;
  costPerConversation: number;
}

export interface MetaWhatsAppData {
  campaigns: WaCampaignRow[]; // ordenadas por conversaciones desc
  adsets: WaAdsetRow[]; // ordenados por conversaciones desc
  destinations: WaDestinationRow[]; // ordenadas por conversaciones desc
  daily: WaDailyRow[]; // serie diaria asc
  totals: WaTotals;
  campaignCount: number;
  adsetCount: number;
  adCount: number; // anuncios de mensajería con datos
  withThumb: number; // cuántos traen miniatura
  adsConversationsReady: boolean; // ¿el conector ya guarda conversaciones por anuncio?
  metaMessagingExistsEver: boolean;
  // Deltas vs período anterior
  conversationsDelta: number; // %
  spendDelta: number; // %
  costDelta: number; // absoluto (moneda) — costo/conv. actual − anterior
  from: string;
  to: string;
}

export interface UseMetaWhatsAppResult {
  data: MetaWhatsAppData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RawRow {
  date: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  destination: string | null;
  conversations: number | null;
  spend: number | null;
}

const SELECT = 'date, campaign_name, adset_name, destination, conversations, spend';
const PAGE = 1000;
const ADSET_LIMIT = 40; // top conjuntos por conversaciones

// Emoji inicial del nombre del conjunto/anuncio = marcador manual de conversión.
// Capturamos solo clústeres pictográficos al inicio (con variation selector y ZWJ),
// para no confundir números o paréntesis del nombre con un emoji.
const LEADING_EMOJI_RE =
  /^\s*((?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)+)\s*/u;

function splitEmoji(name: string): { emoji: string; clean: string } {
  const m = name.match(LEADING_EMOJI_RE);
  if (m) return { emoji: m[1].trim(), clean: name.slice(m[0].length).trim() || name.trim() };
  return { emoji: '', clean: name.trim() };
}

async function fetchRows(clientId: string, from: string, to: string): Promise<RawRow[]> {
  const all: RawRow[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('meta_messaging')
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

async function fetchMessagingExists(clientId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('meta_messaging')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId);
  if (error) throw error;
  return (count || 0) > 0;
}

// ── Anuncios por conjunto (nivel ad de meta_campaigns) ──────────────────────
interface AdRaw {
  ad_id: string | null;
  ad_name: string | null;
  adset_name: string | null;
  campaign_name: string | null;
  thumb_url: string | null;
  status: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  conversations: number | null;
}

const AD_SELECT_FULL =
  'ad_id, ad_name, adset_name, campaign_name, thumb_url, status, spend, impressions, clicks, conversations';
const AD_SELECT_BASE =
  'ad_id, ad_name, adset_name, campaign_name, thumb_url, status, spend, impressions, clicks';

/**
 * Trae los anuncios (meta_campaigns nivel ad) de las campañas de mensajería del
 * rango. Defensivo: intenta con la columna `conversations`; si el conector aún
 * no la creó, reintenta sin ella para que la vista no se rompa, marcando que las
 * conversaciones por anuncio todavía no están listas.
 */
async function fetchMessagingAdRows(
  clientId: string,
  from: string,
  to: string,
  campaignNames: string[]
): Promise<{ rows: AdRaw[]; conversationsReady: boolean }> {
  if (campaignNames.length === 0) return { rows: [], conversationsReady: true };

  const pageFetch = async (select: string): Promise<AdRaw[]> => {
    const all: AdRaw[] = [];
    let offset = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from('meta_campaigns')
        .select(select)
        .eq('client_id', clientId)
        .gte('date', from)
        .lte('date', to)
        .in('campaign_name', campaignNames)
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const batch = (data || []) as unknown as AdRaw[];
      all.push(...batch);
      if (batch.length < PAGE) break;
      offset += PAGE;
    }
    return all;
  };

  try {
    const rows = await pageFetch(AD_SELECT_FULL);
    return { rows, conversationsReady: true };
  } catch {
    // La columna conversations aún no existe → degradar con elegancia.
    const rows = await pageFetch(AD_SELECT_BASE);
    return { rows: rows.map((r) => ({ ...r, conversations: null })), conversationsReady: false };
  }
}

interface AdAgg {
  adId: string;
  adName: string;
  adset: string;
  campaign: string;
  thumbUrl: string | null;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversations: number;
}

/** Agrupa filas de anuncio/día por ad_id. */
function aggregateAds(rows: AdRaw[]): AdAgg[] {
  const map = new Map<string, AdAgg>();
  for (const r of rows) {
    const adId = r.ad_id || `(sin id) ${r.ad_name || ''}`;
    let a = map.get(adId);
    if (!a) {
      a = {
        adId,
        adName: r.ad_name || '(sin nombre)',
        adset: r.adset_name || '(sin conjunto)',
        campaign: r.campaign_name || '(sin nombre)',
        thumbUrl: r.thumb_url || null,
        status: r.status || '',
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversations: 0,
      };
      map.set(adId, a);
    }
    if ((a.thumbUrl === null || a.thumbUrl === '') && r.thumb_url) a.thumbUrl = r.thumb_url;
    if (!a.status && r.status) a.status = r.status;
    a.spend += Number(r.spend) || 0;
    a.impressions += Number(r.impressions) || 0;
    a.clicks += Number(r.clicks) || 0;
    a.conversations += Number(r.conversations) || 0;
  }
  return Array.from(map.values());
}

/**
 * Convierte los anuncios agregados en filas de UI con su análisis, agrupados por
 * `campaña__conjunto`. El análisis compara el costo por conversación de cada
 * anuncio contra el promedio de SU conjunto (auto-consistente y honesto).
 */
function buildAdsByAdset(
  rows: AdRaw[],
  conversationsReady: boolean
): Map<string, WaAdRow[]> {
  const aggregated = aggregateAds(rows);

  // Promedio de costo por conversación por conjunto (campaña__conjunto).
  const benchSpend = new Map<string, number>();
  const benchConv = new Map<string, number>();
  for (const a of aggregated) {
    const k = `${a.campaign}__${a.adset}`;
    benchSpend.set(k, (benchSpend.get(k) || 0) + a.spend);
    benchConv.set(k, (benchConv.get(k) || 0) + a.conversations);
  }

  const out = new Map<string, WaAdRow[]>();
  for (const a of aggregated) {
    const k = `${a.campaign}__${a.adset}`;
    const cpc = a.conversations > 0 ? a.spend / a.conversations : 0;
    const setSpend = benchSpend.get(k) || 0;
    const setConv = benchConv.get(k) || 0;
    const setCpc = setConv > 0 ? setSpend / setConv : 0;

    let tone: WaAdTone;
    let label: string;
    if (!conversationsReady) {
      tone = 'pending';
      label = 'Conversaciones por anuncio: activando con el conector';
    } else if (a.conversations <= 0) {
      tone = a.spend > 0 ? 'bad' : 'ok';
      label = a.spend > 0 ? 'Sin conversaciones — candidato a pausar' : 'Sin actividad';
    } else if (setCpc > 0 && cpc <= setCpc * 0.7) {
      const pct = Math.round((1 - cpc / setCpc) * 100);
      tone = 'win';
      label = `Ganador · ${pct}% más barato que el conjunto`;
    } else if (setCpc > 0 && cpc >= setCpc * 1.3) {
      const pct = Math.round((cpc / setCpc - 1) * 100);
      tone = 'warn';
      label = `Caro · ${pct}% sobre el promedio del conjunto`;
    } else {
      tone = 'ok';
      label = 'En rango del conjunto';
    }

    const { emoji, clean } = splitEmoji(a.adName);
    const row: WaAdRow = {
      adId: a.adId,
      adName: a.adName,
      emoji,
      cleanName: clean,
      adset: a.adset,
      campaign: a.campaign,
      thumbUrl: a.thumbUrl === '' ? null : a.thumbUrl,
      status: a.status,
      spend: a.spend,
      impressions: a.impressions,
      clicks: a.clicks,
      ctr: a.impressions > 0 ? a.clicks / a.impressions : 0,
      conversations: a.conversations,
      costPerConversation: cpc,
      analysisTone: tone,
      analysisLabel: label,
    };
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }

  // Orden dentro de cada conjunto: por conversaciones, luego inversión.
  for (const list of out.values()) {
    list.sort((x, y) => y.conversations - x.conversations || y.spend - x.spend);
  }
  return out;
}

/** Agrupa por campaña + destino. */
function groupByCampaign(rows: RawRow[]): WaCampaignRow[] {
  const map = new Map<string, WaCampaignRow>();
  for (const r of rows) {
    const campaign = r.campaign_name || '(sin nombre)';
    const destination = r.destination || 'Sin clasificar';
    const key = `${campaign}__${destination}`;
    let c = map.get(key);
    if (!c) {
      c = { campaign, destination, conversations: 0, spend: 0, costPerConversation: 0 };
      map.set(key, c);
    }
    c.conversations += Number(r.conversations) || 0;
    c.spend += Number(r.spend) || 0;
  }
  const list = Array.from(map.values());
  for (const c of list) c.costPerConversation = c.conversations > 0 ? c.spend / c.conversations : 0;
  list.sort((a, b) => b.conversations - a.conversations || b.spend - a.spend);
  return list;
}

/** Agrupa por ad set (conjunto + campaña + destino), conservando el emoji. */
function groupByAdset(rows: RawRow[]): WaAdsetRow[] {
  const map = new Map<string, WaAdsetRow>();
  for (const r of rows) {
    const adset = r.adset_name || '(sin conjunto)';
    const campaign = r.campaign_name || '(sin nombre)';
    const destination = r.destination || 'Sin clasificar';
    const key = `${adset}__${campaign}__${destination}`;
    let a = map.get(key);
    if (!a) {
      const { emoji, clean } = splitEmoji(adset);
      a = {
        adset,
        emoji,
        cleanName: clean,
        campaign,
        destination,
        conversations: 0,
        spend: 0,
        costPerConversation: 0,
        ads: [],
      };
      map.set(key, a);
    }
    a.conversations += Number(r.conversations) || 0;
    a.spend += Number(r.spend) || 0;
  }
  const list = Array.from(map.values());
  for (const a of list) a.costPerConversation = a.conversations > 0 ? a.spend / a.conversations : 0;
  list.sort((a, b) => b.conversations - a.conversations || b.spend - a.spend);
  return list;
}

/** Agrupa por destino. */
function groupByDestination(rows: RawRow[]): WaDestinationRow[] {
  const map = new Map<string, WaDestinationRow>();
  for (const r of rows) {
    const destination = r.destination || 'Sin clasificar';
    let d = map.get(destination);
    if (!d) {
      d = { destination, conversations: 0, spend: 0, costPerConversation: 0 };
      map.set(destination, d);
    }
    d.conversations += Number(r.conversations) || 0;
    d.spend += Number(r.spend) || 0;
  }
  const list = Array.from(map.values());
  for (const d of list) d.costPerConversation = d.conversations > 0 ? d.spend / d.conversations : 0;
  list.sort((a, b) => b.conversations - a.conversations || b.spend - a.spend);
  return list;
}

/** Serie diaria (una fila por fecha). */
function buildDaily(rows: RawRow[]): WaDailyRow[] {
  const map = new Map<string, { conversations: number; spend: number }>();
  for (const r of rows) {
    const d = r.date;
    if (!d) continue;
    let agg = map.get(d);
    if (!agg) {
      agg = { conversations: 0, spend: 0 };
      map.set(d, agg);
    }
    agg.conversations += Number(r.conversations) || 0;
    agg.spend += Number(r.spend) || 0;
  }
  return Array.from(map.entries())
    .map(([date, a]) => ({
      date,
      conversations: a.conversations,
      spend: a.spend,
      costPerConversation: a.conversations > 0 ? a.spend / a.conversations : 0,
    }))
    .sort((x, y) => x.date.localeCompare(y.date));
}

function sumTotals(rows: RawRow[]): WaTotals {
  let conversations = 0;
  let spend = 0;
  for (const r of rows) {
    conversations += Number(r.conversations) || 0;
    spend += Number(r.spend) || 0;
  }
  return { conversations, spend, costPerConversation: conversations > 0 ? spend / conversations : 0 };
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
        const [nowRows, prevRows] = await Promise.all([
          fetchRows(clientId, range.from, range.to),
          fetchRows(clientId, previous.from, previous.to),
        ]);
        if (cancelled) return;

        const campaigns = groupByCampaign(nowRows);
        const allAdsets = groupByAdset(nowRows);
        const adsets = allAdsets.slice(0, ADSET_LIMIT);
        const destinations = groupByDestination(nowRows);
        const daily = buildDaily(nowRows);
        const totals = sumTotals(nowRows);

        const pt = sumTotals(prevRows);

        // Anuncios por conjunto: traemos los anuncios (nivel ad) de las campañas
        // de mensajería y los anidamos en su ad set por campaña + nombre.
        const messagingCampaignNames = Array.from(
          new Set(nowRows.map((r) => r.campaign_name).filter((n): n is string => !!n))
        );
        const { rows: adRows, conversationsReady } = await fetchMessagingAdRows(
          clientId,
          range.from,
          range.to,
          messagingCampaignNames
        );
        if (cancelled) return;

        const adsByAdset = buildAdsByAdset(adRows, conversationsReady);
        for (const a of adsets) {
          a.ads = adsByAdset.get(`${a.campaign}__${a.adset}`) || [];
        }
        const allAds = aggregateAds(adRows);

        let metaMessagingExistsEver = nowRows.length > 0;
        if (!metaMessagingExistsEver) {
          metaMessagingExistsEver = await fetchMessagingExists(clientId);
          if (cancelled) return;
        }

        setData({
          campaigns,
          adsets,
          destinations,
          daily,
          totals,
          campaignCount: campaigns.length,
          adsetCount: allAdsets.length,
          adCount: allAds.length,
          withThumb: allAds.filter((a) => !!a.thumbUrl).length,
          adsConversationsReady: conversationsReady,
          metaMessagingExistsEver,
          conversationsDelta: calcDelta(totals.conversations, pt.conversations),
          spendDelta: calcDelta(totals.spend, pt.spend),
          costDelta: totals.costPerConversation - pt.costPerConversation,
          from: range.from,
          to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useMetaWhatsApp]', e);
        setError(e?.message || 'Error desconocido al cargar mensajes de Meta');
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
