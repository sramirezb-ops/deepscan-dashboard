'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { floorGadsFrom, applyGadsFloor } from '@/lib/dataFloors';
import { calcDelta } from '@/lib/utils';
import { classifyModel } from '@/lib/hooks/useGadsLeads';
import type { DateRange } from '@/lib/period';

// ============================================================
// useLeadsOverview — overview CONSOLIDADO de ambos canales (Ofero, leads)
// ============================================================
// Junta Google Ads + TikTok bajo la lógica de LEADS (sin ROAS/revenue),
// respetando que Ofero tiene DOS objetivos que NO se mezclan:
//
//   · Ventas de vehículos → Google (Search/PMAX) + TikTok  → se consolidan
//   · Propietarios        → SOLO Google (Display)          → aparte
//
// Regla anti-trampa de mezcla: el bloque de Ventas siempre expone el total
// combinado Y su descomposición por canal (con su % de reparto), para que un
// CPL combinado que sube por cambio de mix no se confunda con pérdida de
// eficiencia. 100% dato real: si no hay filas en el rango, se reporta vacío.
// La META de CPL ($2.800) NO vive aquí: la aplica la vista desde client.cplTarget.
// ============================================================

const PAGE = 1000;

// ── Tipos públicos ──────────────────────────────────────────
export interface LeadMetrics {
  cost: number;
  leads: number; // conversiones
  cpl: number; // cost / leads
  impressions: number;
  clicks: number;
}

// Deltas en % vs período anterior (calcDelta). CPL incluido: subir es malo.
export interface LeadDeltas {
  cost: number;
  leads: number;
  cpl: number;
}

// Un punto de la serie diaria (para la tendencia de CPL combinado / Propietarios).
export interface LeadDailyPoint {
  date: string;
  cost: number;
  leads: number;
  cpl: number;
}

export type LeadChannel = 'google' | 'tiktok';

// La aportación de un canal dentro de un objetivo (con su % de reparto).
export interface ChannelLeads {
  channel: LeadChannel;
  label: string;
  metrics: LeadMetrics;
  deltas: LeadDeltas;
  // Reparto dentro del objetivo (fracción 0-1): qué tajada puso este canal.
  costShare: number;
  leadShare: number;
}

// Bloque HÉROE: Ventas de vehículos (Google + TikTok).
export interface VentaConsolidada {
  combined: LeadMetrics;
  combinedDeltas: LeadDeltas;
  daily: LeadDailyPoint[]; // CPL combinado por día (para la tendencia)
  google: ChannelLeads;
  tiktok: ChannelLeads;
  hasPrev: boolean; // ¿hubo inversión en el período anterior? (deltas confiables)
}

// Bloque SECUNDARIO: Propietarios (solo Google, sin meta).
export interface PropietariosConsolidado {
  metrics: LeadMetrics;
  deltas: LeadDeltas;
  daily: LeadDailyPoint[];
  hasPrev: boolean;
}

export interface LeadsOverviewData {
  venta: VentaConsolidada;
  propietarios: PropietariosConsolidado;
  googleExistsEver: boolean;
  tiktokExistsEver: boolean;
  hasAny: boolean; // ¿hubo actividad de algún canal en el rango?
  from: string;
  to: string;
}

export interface UseLeadsOverviewResult {
  data: LeadsOverviewData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// ── Filas crudas ────────────────────────────────────────────
interface GadsRaw {
  date: string | null;
  campaign_name: string | null;
  cost: number | null;
  conversions: number | null;
  impressions: number | null;
  clicks: number | null;
}
interface TtkRaw {
  date: string | null;
  spend: number | null;
  conversions: number | null;
  impressions: number | null;
  clicks: number | null;
}

const GADS_SELECT = 'date, campaign_name, cost, conversions, impressions, clicks';
const TTK_SELECT = 'date, spend, conversions, impressions, clicks';

async function fetchGads(clientId: string, from: string, to: string): Promise<GadsRaw[]> {
  const all: GadsRaw[] = [];
  let offset = 0;
  // Piso por cliente: nunca leer antes del cambio de cuenta de Google Ads.
  const effFrom = floorGadsFrom(from, clientId);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('gads_campaigns')
      .select(GADS_SELECT)
      .eq('client_id', clientId)
      .gte('date', effFrom)
      .lte('date', to)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as GadsRaw[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function fetchTtk(clientId: string, from: string, to: string): Promise<TtkRaw[]> {
  const all: TtkRaw[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('tiktok_campaigns')
      .select(TTK_SELECT)
      .eq('client_id', clientId)
      .gte('date', from)
      .lte('date', to)
      .range(offset, offset + PAGE - 1);
    // TikTok puede no estar configurado para el cliente → tratamos como vacío.
    if (error) return all;
    const batch = (data || []) as TtkRaw[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function gadsExistsEver(clientId: string): Promise<boolean> {
  const { count, error } = await applyGadsFloor(
    supabase
      .from('gads_campaigns')
      .select('campaign_name', { count: 'exact', head: true })
      .eq('client_id', clientId),
    clientId,
  );
  if (error) return false;
  return (count || 0) > 0;
}

async function ttkExistsEver(clientId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('tiktok_campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId);
  if (error) return false;
  return (count || 0) > 0;
}

// ── Acumuladores ────────────────────────────────────────────
interface Sum {
  cost: number;
  leads: number;
  impressions: number;
  clicks: number;
}
function emptySum(): Sum {
  return { cost: 0, leads: 0, impressions: 0, clicks: 0 };
}
function addSum(a: Sum, b: Sum): Sum {
  return {
    cost: a.cost + b.cost,
    leads: a.leads + b.leads,
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
  };
}
function metricsOf(s: Sum): LeadMetrics {
  return {
    cost: s.cost,
    leads: s.leads,
    cpl: s.leads > 0 ? s.cost / s.leads : 0,
    impressions: s.impressions,
    clicks: s.clicks,
  };
}
function deltasOf(now: LeadMetrics, prev: LeadMetrics): LeadDeltas {
  return {
    cost: calcDelta(now.cost, prev.cost),
    leads: calcDelta(now.leads, prev.leads),
    cpl: calcDelta(now.cpl, prev.cpl),
  };
}

// Suma total de un conjunto de filas Google (ya filtradas por modelo).
function sumGads(rows: GadsRaw[]): Sum {
  return rows.reduce((acc, r) => {
    acc.cost += Number(r.cost) || 0;
    acc.leads += Number(r.conversions) || 0;
    acc.impressions += Number(r.impressions) || 0;
    acc.clicks += Number(r.clicks) || 0;
    return acc;
  }, emptySum());
}
function sumTtk(rows: TtkRaw[]): Sum {
  return rows.reduce((acc, r) => {
    acc.cost += Number(r.spend) || 0;
    acc.leads += Number(r.conversions) || 0;
    acc.impressions += Number(r.impressions) || 0;
    acc.clicks += Number(r.clicks) || 0;
    return acc;
  }, emptySum());
}

// Acumula filas (de cualquier canal) en un mapa fecha→Sum.
function intoDailyMap(map: Map<string, Sum>, date: string | null, s: Sum) {
  const d = date || '';
  if (!d) return;
  const cur = map.get(d);
  map.set(d, cur ? addSum(cur, s) : s);
}

// Convierte un mapa fecha→Sum en una serie diaria ordenada con CPL recalculado.
function dailyFromMap(map: Map<string, Sum>): LeadDailyPoint[] {
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, s]) => ({
      date,
      cost: s.cost,
      leads: s.leads,
      cpl: s.leads > 0 ? s.cost / s.leads : 0,
    }));
}

function channelLeads(
  channel: LeadChannel,
  label: string,
  now: Sum,
  prev: Sum,
  objectiveCost: number,
  objectiveLeads: number
): ChannelLeads {
  const metrics = metricsOf(now);
  return {
    channel,
    label,
    metrics,
    deltas: deltasOf(metrics, metricsOf(prev)),
    costShare: objectiveCost > 0 ? now.cost / objectiveCost : 0,
    leadShare: objectiveLeads > 0 ? now.leads / objectiveLeads : 0,
  };
}

export function useLeadsOverview(
  clientId: string,
  range: DateRange,
  previous: DateRange
): UseLeadsOverviewResult {
  const [data, setData] = useState<LeadsOverviewData | null>(null);
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
        const [gadsNow, gadsPrev, ttkNow, ttkPrev] = await Promise.all([
          fetchGads(clientId, range.from, range.to),
          fetchGads(clientId, previous.from, previous.to),
          fetchTtk(clientId, range.from, range.to),
          fetchTtk(clientId, previous.from, previous.to),
        ]);
        if (cancelled) return;

        // Partir Google en sus dos modelos por el nombre de la campaña.
        const isVenta = (r: GadsRaw) => classifyModel(r.campaign_name) === 'venta';
        const isProp = (r: GadsRaw) => classifyModel(r.campaign_name) === 'propietarios';

        const gVentaNow = sumGads(gadsNow.filter(isVenta));
        const gVentaPrev = sumGads(gadsPrev.filter(isVenta));
        const gPropNow = sumGads(gadsNow.filter(isProp));
        const gPropPrev = sumGads(gadsPrev.filter(isProp));
        const tNow = sumTtk(ttkNow);
        const tPrev = sumTtk(ttkPrev);

        // ── Ventas de vehículos: combinado Google(venta) + TikTok ──
        const combinedNowSum = addSum(gVentaNow, tNow);
        const combinedPrevSum = addSum(gVentaPrev, tPrev);
        const combined = metricsOf(combinedNowSum);
        const combinedDeltas = deltasOf(combined, metricsOf(combinedPrevSum));

        const google = channelLeads(
          'google',
          'Google Ads',
          gVentaNow,
          gVentaPrev,
          combinedNowSum.cost,
          combinedNowSum.leads
        );
        const tiktok = channelLeads(
          'tiktok',
          'TikTok Ads',
          tNow,
          tPrev,
          combinedNowSum.cost,
          combinedNowSum.leads
        );

        // Serie diaria combinada (Google venta + TikTok por fecha).
        const ventaDaily = new Map<string, Sum>();
        for (const r of gadsNow.filter(isVenta)) {
          intoDailyMap(ventaDaily, r.date, {
            cost: Number(r.cost) || 0,
            leads: Number(r.conversions) || 0,
            impressions: Number(r.impressions) || 0,
            clicks: Number(r.clicks) || 0,
          });
        }
        for (const r of ttkNow) {
          intoDailyMap(ventaDaily, r.date, {
            cost: Number(r.spend) || 0,
            leads: Number(r.conversions) || 0,
            impressions: Number(r.impressions) || 0,
            clicks: Number(r.clicks) || 0,
          });
        }

        // ── Propietarios: solo Google ──
        const propDaily = new Map<string, Sum>();
        for (const r of gadsNow.filter(isProp)) {
          intoDailyMap(propDaily, r.date, {
            cost: Number(r.cost) || 0,
            leads: Number(r.conversions) || 0,
            impressions: Number(r.impressions) || 0,
            clicks: Number(r.clicks) || 0,
          });
        }
        const propMetrics = metricsOf(gPropNow);

        // ¿Existe cada canal en cualquier fecha? (para distinguir "sin actividad
        // en el rango" de "canal no conectado"). Solo se consulta si hace falta.
        let googleExistsEver = gadsNow.length > 0 || gadsPrev.length > 0;
        let tiktokExistsEver = ttkNow.length > 0 || ttkPrev.length > 0;
        if (!googleExistsEver) {
          googleExistsEver = await gadsExistsEver(clientId);
          if (cancelled) return;
        }
        if (!tiktokExistsEver) {
          tiktokExistsEver = await ttkExistsEver(clientId);
          if (cancelled) return;
        }

        const hasAny = gadsNow.length > 0 || ttkNow.length > 0;

        setData({
          venta: {
            combined,
            combinedDeltas,
            daily: dailyFromMap(ventaDaily),
            google,
            tiktok,
            hasPrev: combinedPrevSum.cost > 0,
          },
          propietarios: {
            metrics: propMetrics,
            deltas: deltasOf(propMetrics, metricsOf(gPropPrev)),
            daily: dailyFromMap(propDaily),
            hasPrev: gPropPrev.cost > 0,
          },
          googleExistsEver,
          tiktokExistsEver,
          hasAny,
          from: range.from,
          to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useLeadsOverview]', e);
        setError(e?.message || 'Error desconocido al cargar el overview de leads');
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
