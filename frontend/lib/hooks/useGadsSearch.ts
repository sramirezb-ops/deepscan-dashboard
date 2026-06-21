'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calcDelta } from '@/lib/utils';
import type { DateRange } from '@/lib/period';
import { classifyModel, type ModelKey } from '@/lib/hooks/useGadsLeads';

// ============================================================
// useGadsSearch — réplica de la hoja "Search" de Looker, POR CAMPAÑA.
// Para cada campaña de tipo SEARCH (Bicicletas, Motocicletas) arma:
//   ① 10 KPIs con su tendencia diaria (sparkline) y delta vs período previo
//      (Coste, % impr. de búsqueda, Impression Absolute Top %, CPM, Clics,
//       CPC medio, CTR, Conversiones, Coste/conv., Tasa de conversión).
//   ② Tabla de términos de búsqueda (con la palabra clave que los disparó).
//   ③ Datos de ciudad para las 4 tortas (conv/inversión/impr/coste-lead).
// 100% dato real. Las cuotas de impresión se reconstruyen correctamente:
//   share_día = impresiones / elegibles  →  elegibles = impresiones / share
//   share_período = Σimpresiones / Σelegibles  (no un promedio simple).
// ============================================================

export interface SearchKpis {
  cost: number;
  impressionShare: number; // ratio 0..1 (recibidas / elegibles)
  absTopImpressionShare: number; // ratio 0..1
  cpm: number; // cost / impressions * 1000
  clicks: number;
  cpc: number; // cost / clicks
  ctr: number; // clicks / impressions (ratio 0..1)
  conversions: number; // leads
  costPerConv: number; // cost / conversions
  convRate: number; // conversions / clicks (ratio 0..1)
  impressions: number;
}

// Deltas en % vs período anterior (uno por KPI con sentido comparable).
export interface SearchDeltas {
  cost: number;
  impressionShare: number;
  absTopImpressionShare: number;
  cpm: number;
  clicks: number;
  cpc: number;
  ctr: number;
  conversions: number;
  costPerConv: number;
  convRate: number;
}

// Punto diario para las sparklines (un valor por KPI por día).
export interface SearchDailyPoint {
  date: string;
  cost: number;
  impressionShare: number;
  absTopImpressionShare: number;
  cpm: number;
  clicks: number;
  cpc: number;
  ctr: number;
  conversions: number;
  costPerConv: number;
  convRate: number;
}

export interface SearchTermRow {
  searchTerm: string;
  keyword: string; // palabra clave de búsqueda (puede ir vacía)
  cost: number;
  impressions: number;
  clicks: number;
  cpc: number;
  ctr: number;
  conversions: number;
  costPerConv: number;
  convRate: number;
}

export interface SearchCityRow {
  city: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpa: number;
}

export interface SearchCampaign {
  campaignId: string;
  campaignName: string;
  model: ModelKey;
  kpis: SearchKpis;
  deltas: SearchDeltas;
  daily: SearchDailyPoint[]; // orden cronológico ascendente
  terms: SearchTermRow[]; // orden por gasto desc
  cities: SearchCityRow[]; // orden por conversiones desc
  // ¿El período anterior tiene cobertura comparable de cuota de impresión?
  // Las columnas de cuota son nuevas: hasta que la historia se llene, el delta
  // de "% impresiones de búsqueda" y "Absolute Top %" no es comparable y se
  // muestra como "nuevo" en vez de un número engañoso.
  shareDeltaReliable: boolean;
}

export interface GadsSearchData {
  campaigns: SearchCampaign[]; // orden por gasto desc
  hasAny: boolean;
  existsEver: boolean;
  from: string;
  to: string;
}

export interface UseGadsSearchResult {
  data: GadsSearchData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// ---------- filas crudas ----------
interface RawCampRow {
  date: string;
  campaign_id: string;
  campaign_name: string | null;
  campaign_type: string | null;
  cost: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  search_impression_share: number | null;
  search_abs_top_impression_share: number | null;
}
interface RawTermRow {
  campaign_id: string;
  search_term: string | null;
  keyword_text: string | null;
  cost: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
}
interface RawGeoRow {
  campaign_id: string;
  city: string | null;
  cost: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
}

const CAMP_SELECT =
  'date, campaign_id, campaign_name, campaign_type, cost, impressions, clicks, conversions, search_impression_share, search_abs_top_impression_share';
const TERM_SELECT = 'campaign_id, search_term, keyword_text, cost, impressions, clicks, conversions';
const GEO_SELECT = 'campaign_id, city, cost, impressions, clicks, conversions';
const PAGE = 1000;

async function fetchPaged<T>(
  table: string,
  select: string,
  clientId: string,
  dateCol: string,
  from: string,
  to: string
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq('client_id', clientId)
      .gte(dateCol, from)
      .lte(dateCol, to)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as T[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function fetchSearchExistsEver(clientId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('gads_campaigns')
    .select('campaign_name')
    .eq('client_id', clientId)
    .eq('campaign_type', 'SEARCH')
    .limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}

const isSearch = (r: RawCampRow) => (r.campaign_type || '').toUpperCase() === 'SEARCH';

// Acumulador para reconstruir KPIs (incluye "elegibles" para las cuotas).
// Importante: para las cuotas de impresión SOLO contamos los días que tienen
// el dato disponible (share>0). Si mezcláramos impresiones de días sin el dato
// en el numerador, el ratio se dispararía por encima del 100% (dato falso).
interface Acc {
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  shareImpr: number; // Σ impresiones (solo días con share>0) → numerador de la cuota
  eligible: number; // Σ impresiones/share (solo días con share>0) → denominador
  absTopImpr: number; // Σ absTopShare*elegibles (solo días con share>0)
  shareDays: number; // nº de días con dato de cuota disponible
}
function emptyAcc(): Acc {
  return { cost: 0, impressions: 0, clicks: 0, conversions: 0, shareImpr: 0, eligible: 0, absTopImpr: 0, shareDays: 0 };
}
function addCamp(acc: Acc, r: RawCampRow) {
  const impr = Number(r.impressions) || 0;
  const share = Number(r.search_impression_share) || 0;
  const absTop = Number(r.search_abs_top_impression_share) || 0;
  acc.cost += Number(r.cost) || 0;
  acc.impressions += impr;
  acc.clicks += Number(r.clicks) || 0;
  acc.conversions += Number(r.conversions) || 0;
  if (share > 0 && impr > 0) {
    const eligible = impr / share;
    acc.shareImpr += impr;
    acc.eligible += eligible;
    acc.absTopImpr += absTop * eligible;
    acc.shareDays += 1;
  }
}
function kpisFromAcc(a: Acc): SearchKpis {
  return {
    cost: a.cost,
    impressions: a.impressions,
    clicks: a.clicks,
    conversions: a.conversions,
    impressionShare: a.eligible > 0 ? a.shareImpr / a.eligible : 0,
    absTopImpressionShare: a.eligible > 0 ? a.absTopImpr / a.eligible : 0,
    cpm: a.impressions > 0 ? (a.cost / a.impressions) * 1000 : 0,
    cpc: a.clicks > 0 ? a.cost / a.clicks : 0,
    ctr: a.impressions > 0 ? a.clicks / a.impressions : 0,
    costPerConv: a.conversions > 0 ? a.cost / a.conversions : 0,
    convRate: a.clicks > 0 ? a.conversions / a.clicks : 0,
  };
}

function dailyPoint(date: string, r: RawCampRow): SearchDailyPoint {
  const acc = emptyAcc();
  addCamp(acc, r);
  const k = kpisFromAcc(acc);
  return {
    date,
    cost: k.cost,
    impressionShare: k.impressionShare,
    absTopImpressionShare: k.absTopImpressionShare,
    cpm: k.cpm,
    clicks: k.clicks,
    cpc: k.cpc,
    ctr: k.ctr,
    conversions: k.conversions,
    costPerConv: k.costPerConv,
    convRate: k.convRate,
  };
}

function buildDeltas(now: SearchKpis, prev: SearchKpis): SearchDeltas {
  return {
    cost: calcDelta(now.cost, prev.cost),
    impressionShare: calcDelta(now.impressionShare, prev.impressionShare),
    absTopImpressionShare: calcDelta(now.absTopImpressionShare, prev.absTopImpressionShare),
    cpm: calcDelta(now.cpm, prev.cpm),
    clicks: calcDelta(now.clicks, prev.clicks),
    cpc: calcDelta(now.cpc, prev.cpc),
    ctr: calcDelta(now.ctr, prev.ctr),
    conversions: calcDelta(now.conversions, prev.conversions),
    costPerConv: calcDelta(now.costPerConv, prev.costPerConv),
    convRate: calcDelta(now.convRate, prev.convRate),
  };
}

function buildTerms(rows: RawTermRow[]): SearchTermRow[] {
  // Agrupa por (término + palabra clave) por si vinieran en varias filas.
  const map = new Map<string, SearchTermRow & { _i: number; _cl: number }>();
  for (const r of rows) {
    const term = (r.search_term || '').trim() || '(sin término)';
    const kw = (r.keyword_text || '').trim();
    const key = `${term}__${kw}`;
    let t = map.get(key);
    if (!t) {
      t = {
        searchTerm: term,
        keyword: kw,
        cost: 0,
        impressions: 0,
        clicks: 0,
        cpc: 0,
        ctr: 0,
        conversions: 0,
        costPerConv: 0,
        convRate: 0,
        _i: 0,
        _cl: 0,
      };
      map.set(key, t);
    }
    t.cost += Number(r.cost) || 0;
    t.impressions += Number(r.impressions) || 0;
    t.clicks += Number(r.clicks) || 0;
    t.conversions += Number(r.conversions) || 0;
  }
  const list: SearchTermRow[] = [];
  for (const t of map.values()) {
    list.push({
      searchTerm: t.searchTerm,
      keyword: t.keyword,
      cost: t.cost,
      impressions: t.impressions,
      clicks: t.clicks,
      conversions: t.conversions,
      cpc: t.clicks > 0 ? t.cost / t.clicks : 0,
      ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
      costPerConv: t.conversions > 0 ? t.cost / t.conversions : 0,
      convRate: t.clicks > 0 ? t.conversions / t.clicks : 0,
    });
  }
  list.sort((a, b) => b.cost - a.cost || b.impressions - a.impressions);
  return list;
}

function buildCities(rows: RawGeoRow[]): SearchCityRow[] {
  const map = new Map<string, { cost: number; impressions: number; clicks: number; conversions: number }>();
  for (const r of rows) {
    const city = (r.city || '(sin ciudad)').trim() || '(sin ciudad)';
    let s = map.get(city);
    if (!s) {
      s = { cost: 0, impressions: 0, clicks: 0, conversions: 0 };
      map.set(city, s);
    }
    s.cost += Number(r.cost) || 0;
    s.impressions += Number(r.impressions) || 0;
    s.clicks += Number(r.clicks) || 0;
    s.conversions += Number(r.conversions) || 0;
  }
  const list: SearchCityRow[] = [];
  for (const [city, s] of map.entries()) {
    list.push({
      city,
      cost: s.cost,
      impressions: s.impressions,
      clicks: s.clicks,
      conversions: s.conversions,
      cpa: s.conversions > 0 ? s.cost / s.conversions : 0,
    });
  }
  list.sort((a, b) => b.conversions - a.conversions || b.cost - a.cost);
  return list;
}

export function useGadsSearch(
  clientId: string,
  range: DateRange,
  previous: DateRange
): UseGadsSearchResult {
  const [data, setData] = useState<GadsSearchData | null>(null);
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
        const [campNow, campPrev, terms, geo] = await Promise.all([
          fetchPaged<RawCampRow>('gads_campaigns', CAMP_SELECT, clientId, 'date', range.from, range.to),
          fetchPaged<RawCampRow>('gads_campaigns', CAMP_SELECT, clientId, 'date', previous.from, previous.to),
          fetchPaged<RawTermRow>('gads_search_term_details', TERM_SELECT, clientId, 'date_start', range.from, range.to),
          fetchPaged<RawGeoRow>('gads_geo', GEO_SELECT, clientId, 'date_start', range.from, range.to),
        ]);
        if (cancelled) return;

        const nowSearch = campNow.filter(isSearch);
        const prevSearch = campPrev.filter(isSearch);

        // IDs de campañas Search → para filtrar términos y geo de forma robusta.
        const searchIds = new Set(nowSearch.map((r) => r.campaign_id));
        const nameById = new Map<string, string>();
        const modelById = new Map<string, ModelKey>();
        for (const r of nowSearch) {
          if (!nameById.has(r.campaign_id)) {
            nameById.set(r.campaign_id, r.campaign_name || '(sin nombre)');
            modelById.set(r.campaign_id, classifyModel(r.campaign_name));
          }
        }

        // Acumuladores por campaña (período actual + anterior).
        const accNow = new Map<string, Acc>();
        const accPrev = new Map<string, Acc>();
        const dailyByCamp = new Map<string, Map<string, RawCampRow>>();

        for (const r of nowSearch) {
          let a = accNow.get(r.campaign_id);
          if (!a) {
            a = emptyAcc();
            accNow.set(r.campaign_id, a);
          }
          addCamp(a, r);
          let dm = dailyByCamp.get(r.campaign_id);
          if (!dm) {
            dm = new Map();
            dailyByCamp.set(r.campaign_id, dm);
          }
          dm.set(r.date, r); // una fila por (campaña,día)
        }
        for (const r of prevSearch) {
          let a = accPrev.get(r.campaign_id);
          if (!a) {
            a = emptyAcc();
            accPrev.set(r.campaign_id, a);
          }
          addCamp(a, r);
        }

        const termsByCamp = new Map<string, RawTermRow[]>();
        for (const r of terms) {
          if (!searchIds.has(r.campaign_id)) continue;
          const arr = termsByCamp.get(r.campaign_id) || [];
          arr.push(r);
          termsByCamp.set(r.campaign_id, arr);
        }
        const geoByCamp = new Map<string, RawGeoRow[]>();
        for (const r of geo) {
          if (!searchIds.has(r.campaign_id)) continue;
          const arr = geoByCamp.get(r.campaign_id) || [];
          arr.push(r);
          geoByCamp.set(r.campaign_id, arr);
        }

        const campaigns: SearchCampaign[] = [];
        for (const [id, acc] of accNow.entries()) {
          const prevAcc = accPrev.get(id) || emptyAcc();
          const kpis = kpisFromAcc(acc);
          const prevKpis = kpisFromAcc(prevAcc);
          // Comparable solo si el período anterior cubre al menos la mitad de
          // los días con dato que tiene el período actual (y al menos 1).
          const shareDeltaReliable =
            prevAcc.shareDays >= 1 && prevAcc.shareDays >= Math.ceil(acc.shareDays * 0.5);
          const dm = dailyByCamp.get(id);
          const daily = dm
            ? Array.from(dm.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([date, r]) => dailyPoint(date, r))
            : [];
          campaigns.push({
            campaignId: id,
            campaignName: nameById.get(id) || '(sin nombre)',
            model: modelById.get(id) || 'venta',
            kpis,
            deltas: buildDeltas(kpis, prevKpis),
            daily,
            terms: buildTerms(termsByCamp.get(id) || []),
            cities: buildCities(geoByCamp.get(id) || []),
            shareDeltaReliable,
          });
        }
        campaigns.sort((a, b) => b.kpis.cost - a.kpis.cost);

        const hasAny = campaigns.length > 0;
        let existsEver = hasAny;
        if (!existsEver) {
          existsEver = await fetchSearchExistsEver(clientId);
          if (cancelled) return;
        }

        setData({ campaigns, hasAny, existsEver, from: range.from, to: range.to });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useGadsSearch]', e);
        setError(e?.message || 'Error desconocido al cargar la pestaña Search');
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
