'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calcDelta } from '@/lib/utils';
import type { DateRange } from '@/lib/period';
import { classifyModel } from '@/lib/hooks/useGadsLeads';

// ============================================================
// useGadsPropietarios — vista EXCLUSIVA del modelo "Propietarios".
// Son campañas de DISPLAY de generación de leads (no PMax, no venta):
// conv_value == nº de conversiones, o sea NO hay revenue real en pesos.
// Por eso todo gira en torno a LEADS y COSTO POR LEAD (CPL), no a ROAS.
//
// Por cada campaña Propietarios (Display) arma:
//   ① KPIs de captación con tendencia diaria (sparkline) + delta vs período previo
//      (Inversión, Leads, CPL, Impresiones, Clics, CTR, CPC, CPM, Tasa de conv.).
//   ② Tabla de anuncios responsive de display (ad group + métricas reales).
//   ③ Datos de ciudad para las tortas (leads / inversión / impresiones / CPL).
//
// 100% dato real desde gads_campaigns, gads_ads y gads_geo.
// Resultados por imagen/video individual NO existen aún en la base (requieren
// extraer ad_group_ad_asset_view en el ETL → Fase 2). La vista lo declara honesto.
// ============================================================

export interface PropKpis {
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number; // leads
  cpl: number; // cost / conversions (costo por lead)
  cpc: number; // cost / clicks
  ctr: number; // clicks / impressions (ratio 0..1)
  cpm: number; // cost / impressions * 1000
  convRate: number; // conversions / clicks (ratio 0..1)
}

export interface PropDeltas {
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpl: number;
  cpc: number;
  ctr: number;
  cpm: number;
  convRate: number;
}

export interface PropDailyPoint {
  date: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpl: number;
  cpc: number;
  ctr: number;
  cpm: number;
  convRate: number;
}

// Un anuncio responsive de display (lo más cercano a "el creativo").
export interface PropAdRow {
  adId: string;
  adGroupName: string;
  adType: string; // p.ej. RESPONSIVE_DISPLAY_AD
  status: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpl: number;
  cpc: number;
  ctr: number;
}

export interface PropCityRow {
  city: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpl: number;
}

export interface PropCampaign {
  campaignId: string;
  campaignName: string;
  kpis: PropKpis;
  deltas: PropDeltas;
  daily: PropDailyPoint[]; // orden cronológico ascendente
  ads: PropAdRow[]; // orden por inversión desc
  cities: PropCityRow[]; // orden por leads desc
}

export interface GadsPropietariosData {
  campaigns: PropCampaign[]; // orden por inversión desc
  hasAny: boolean;
  existsEver: boolean;
  from: string;
  to: string;
}

export interface UseGadsPropietariosResult {
  data: GadsPropietariosData | null;
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
}
interface RawAdRow {
  campaign_id: string;
  ad_id: string;
  ad_group_name: string | null;
  ad_type: string | null;
  status: string | null;
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

const CAMP_SELECT = 'date, campaign_id, campaign_name, campaign_type, cost, impressions, clicks, conversions';
const AD_SELECT = 'campaign_id, ad_id, ad_group_name, ad_type, status, cost, impressions, clicks, conversions';
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

// ¿Existe alguna vez una campaña Propietarios? (para distinguir "nunca hubo"
// de "no hubo actividad en el período"). Se filtra por nombre del modelo.
async function fetchPropExistsEver(clientId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('gads_campaigns')
    .select('campaign_name')
    .eq('client_id', clientId)
    .ilike('campaign_name', '%propietario%')
    .limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}

// Propietarios = se clasifica por nombre (modelo de negocio), no por tipo.
const isProp = (name: string | null) => classifyModel(name) === 'propietarios';

interface Acc {
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
}
function emptyAcc(): Acc {
  return { cost: 0, impressions: 0, clicks: 0, conversions: 0 };
}
function add(acc: Acc, cost: number, impr: number, clicks: number, conv: number) {
  acc.cost += cost;
  acc.impressions += impr;
  acc.clicks += clicks;
  acc.conversions += conv;
}
function kpisFromAcc(a: Acc): PropKpis {
  return {
    cost: a.cost,
    impressions: a.impressions,
    clicks: a.clicks,
    conversions: a.conversions,
    cpl: a.conversions > 0 ? a.cost / a.conversions : 0,
    cpc: a.clicks > 0 ? a.cost / a.clicks : 0,
    ctr: a.impressions > 0 ? a.clicks / a.impressions : 0,
    cpm: a.impressions > 0 ? (a.cost / a.impressions) * 1000 : 0,
    convRate: a.clicks > 0 ? a.conversions / a.clicks : 0,
  };
}
function dailyPoint(date: string, r: RawCampRow): PropDailyPoint {
  const acc = emptyAcc();
  add(acc, Number(r.cost) || 0, Number(r.impressions) || 0, Number(r.clicks) || 0, Number(r.conversions) || 0);
  const k = kpisFromAcc(acc);
  return {
    date,
    cost: k.cost,
    impressions: k.impressions,
    clicks: k.clicks,
    conversions: k.conversions,
    cpl: k.cpl,
    cpc: k.cpc,
    ctr: k.ctr,
    cpm: k.cpm,
    convRate: k.convRate,
  };
}
function buildDeltas(now: PropKpis, prev: PropKpis): PropDeltas {
  return {
    cost: calcDelta(now.cost, prev.cost),
    impressions: calcDelta(now.impressions, prev.impressions),
    clicks: calcDelta(now.clicks, prev.clicks),
    conversions: calcDelta(now.conversions, prev.conversions),
    cpl: calcDelta(now.cpl, prev.cpl),
    cpc: calcDelta(now.cpc, prev.cpc),
    ctr: calcDelta(now.ctr, prev.ctr),
    cpm: calcDelta(now.cpm, prev.cpm),
    convRate: calcDelta(now.convRate, prev.convRate),
  };
}

function buildAds(rows: RawAdRow[]): PropAdRow[] {
  // Agrupa por anuncio (ad_id) sumando todos sus días.
  const map = new Map<string, RawAdRow & { _cost: number; _impr: number; _clk: number; _conv: number }>();
  for (const r of rows) {
    let a = map.get(r.ad_id);
    if (!a) {
      a = { ...r, _cost: 0, _impr: 0, _clk: 0, _conv: 0 };
      map.set(r.ad_id, a);
    }
    a._cost += Number(r.cost) || 0;
    a._impr += Number(r.impressions) || 0;
    a._clk += Number(r.clicks) || 0;
    a._conv += Number(r.conversions) || 0;
  }
  const list: PropAdRow[] = [];
  for (const a of map.values()) {
    list.push({
      adId: a.ad_id,
      adGroupName: (a.ad_group_name || '(sin grupo)').trim() || '(sin grupo)',
      adType: a.ad_type || '—',
      status: a.status || '—',
      cost: a._cost,
      impressions: a._impr,
      clicks: a._clk,
      conversions: a._conv,
      cpl: a._conv > 0 ? a._cost / a._conv : 0,
      cpc: a._clk > 0 ? a._cost / a._clk : 0,
      ctr: a._impr > 0 ? a._clk / a._impr : 0,
    });
  }
  list.sort((a, b) => b.cost - a.cost || b.impressions - a.impressions);
  return list;
}

function buildCities(rows: RawGeoRow[]): PropCityRow[] {
  const map = new Map<string, Acc>();
  for (const r of rows) {
    const city = (r.city || '(sin ciudad)').trim() || '(sin ciudad)';
    let s = map.get(city);
    if (!s) {
      s = emptyAcc();
      map.set(city, s);
    }
    add(s, Number(r.cost) || 0, Number(r.impressions) || 0, Number(r.clicks) || 0, Number(r.conversions) || 0);
  }
  const list: PropCityRow[] = [];
  for (const [city, s] of map.entries()) {
    list.push({
      city,
      cost: s.cost,
      impressions: s.impressions,
      clicks: s.clicks,
      conversions: s.conversions,
      cpl: s.conversions > 0 ? s.cost / s.conversions : 0,
    });
  }
  list.sort((a, b) => b.conversions - a.conversions || b.cost - a.cost);
  return list;
}

export function useGadsPropietarios(
  clientId: string,
  range: DateRange,
  previous: DateRange
): UseGadsPropietariosResult {
  const [data, setData] = useState<GadsPropietariosData | null>(null);
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
        const [campNow, campPrev, ads, geo] = await Promise.all([
          fetchPaged<RawCampRow>('gads_campaigns', CAMP_SELECT, clientId, 'date', range.from, range.to),
          fetchPaged<RawCampRow>('gads_campaigns', CAMP_SELECT, clientId, 'date', previous.from, previous.to),
          fetchPaged<RawAdRow>('gads_ads', AD_SELECT, clientId, 'date_start', range.from, range.to),
          fetchPaged<RawGeoRow>('gads_geo', GEO_SELECT, clientId, 'date_start', range.from, range.to),
        ]);
        if (cancelled) return;

        const nowProp = campNow.filter((r) => isProp(r.campaign_name));
        const prevProp = campPrev.filter((r) => isProp(r.campaign_name));

        const propIds = new Set(nowProp.map((r) => r.campaign_id));
        const nameById = new Map<string, string>();
        for (const r of nowProp) {
          if (!nameById.has(r.campaign_id)) nameById.set(r.campaign_id, r.campaign_name || '(sin nombre)');
        }

        const accNow = new Map<string, Acc>();
        const accPrev = new Map<string, Acc>();
        const dailyByCamp = new Map<string, Map<string, RawCampRow>>();

        for (const r of nowProp) {
          let a = accNow.get(r.campaign_id);
          if (!a) {
            a = emptyAcc();
            accNow.set(r.campaign_id, a);
          }
          add(a, Number(r.cost) || 0, Number(r.impressions) || 0, Number(r.clicks) || 0, Number(r.conversions) || 0);
          let dm = dailyByCamp.get(r.campaign_id);
          if (!dm) {
            dm = new Map();
            dailyByCamp.set(r.campaign_id, dm);
          }
          dm.set(r.date, r);
        }
        for (const r of prevProp) {
          let a = accPrev.get(r.campaign_id);
          if (!a) {
            a = emptyAcc();
            accPrev.set(r.campaign_id, a);
          }
          add(a, Number(r.cost) || 0, Number(r.impressions) || 0, Number(r.clicks) || 0, Number(r.conversions) || 0);
        }

        const adsByCamp = new Map<string, RawAdRow[]>();
        for (const r of ads) {
          if (!propIds.has(r.campaign_id)) continue;
          const arr = adsByCamp.get(r.campaign_id) || [];
          arr.push(r);
          adsByCamp.set(r.campaign_id, arr);
        }
        const geoByCamp = new Map<string, RawGeoRow[]>();
        for (const r of geo) {
          if (!propIds.has(r.campaign_id)) continue;
          const arr = geoByCamp.get(r.campaign_id) || [];
          arr.push(r);
          geoByCamp.set(r.campaign_id, arr);
        }

        const campaigns: PropCampaign[] = [];
        for (const [id, acc] of accNow.entries()) {
          const prevAcc = accPrev.get(id) || emptyAcc();
          const kpis = kpisFromAcc(acc);
          const prevKpis = kpisFromAcc(prevAcc);
          const dm = dailyByCamp.get(id);
          const daily = dm
            ? Array.from(dm.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([date, r]) => dailyPoint(date, r))
            : [];
          campaigns.push({
            campaignId: id,
            campaignName: nameById.get(id) || '(sin nombre)',
            kpis,
            deltas: buildDeltas(kpis, prevKpis),
            daily,
            ads: buildAds(adsByCamp.get(id) || []),
            cities: buildCities(geoByCamp.get(id) || []),
          });
        }
        campaigns.sort((a, b) => b.kpis.cost - a.kpis.cost);

        const hasAny = campaigns.length > 0;
        let existsEver = hasAny;
        if (!existsEver) {
          existsEver = await fetchPropExistsEver(clientId);
          if (cancelled) return;
        }

        setData({ campaigns, hasAny, existsEver, from: range.from, to: range.to });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useGadsPropietarios]', e);
        setError(e?.message || 'Error desconocido al cargar la vista Propietarios');
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
