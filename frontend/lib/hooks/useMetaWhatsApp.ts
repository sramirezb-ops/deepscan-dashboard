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
}
export interface WaHierNode {
  name: string;
  m: WaMetric;
  kids?: WaHierNode[]; // campañas → conjuntos
}

export interface WaAuraBridge {
  hasAura: boolean;
  manualCobrado: number; // canal manual · bucket medición (cobrado)
  manualTickets: number; // # filas en ese bucket
  manualTicket: number; // ticket promedio
  totalMedicion: number; // venta nueva real (todos los canales, bucket medición)
  manualPct: number; // manualCobrado / totalMedicion (0-1)
  from: string;
  to: string;
}

export interface MetaWhatsAppData {
  totals: { spend: number; conversations: number; cpc: number };
  hierarchy: WaHierNode[]; // campaña → conjunto (ordenado por gasto)
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
  fecha_date: string | null;
}

/** Venta AURA del rango: bucket medición (total) y canal manual (puente WhatsApp). */
async function fetchAuraBridge(clientId: string, from: string, to: string): Promise<WaAuraBridge> {
  const { data, error } = await supabase
    .from('aura_sales')
    .select('canal, bucket, tipo, cobrado, fecha_date')
    .eq('client_id', clientId)
    .gte('fecha_date', from)
    .lte('fecha_date', to);

  const empty: WaAuraBridge = {
    hasAura: false, manualCobrado: 0, manualTickets: 0, manualTicket: 0,
    totalMedicion: 0, manualPct: 0, from, to,
  };
  if (error) return empty;
  const rows = (data || []) as AuraRow[];
  if (!rows.length) return empty;

  let manualCobrado = 0;
  let manualTickets = 0;
  let totalMedicion = 0;
  for (const r of rows) {
    const medicion = r.bucket === 'medicion';
    if (medicion) totalMedicion += n(r.cobrado);
    if (medicion && r.canal === 'manual') {
      manualCobrado += n(r.cobrado);
      manualTickets += 1;
    }
  }
  return {
    hasAura: true,
    manualCobrado,
    manualTickets,
    manualTicket: manualTickets > 0 ? manualCobrado / manualTickets : 0,
    totalMedicion,
    manualPct: totalMedicion > 0 ? manualCobrado / totalMedicion : 0,
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
    if (!c) { c = { m: { spend: 0, conversations: 0 }, sets: new Map() }; camps.set(cn, c); }
    c.m.spend += n(r.spend);
    c.m.conversations += n(r.conversations);
    const an = r.adset_name || '(sin conjunto)';
    let s = c.sets.get(an);
    if (!s) { s = { spend: 0, conversations: 0 }; c.sets.set(an, s); }
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
        const [allRows, aura] = await Promise.all([
          fetchAllMessaging(clientId),
          fetchAuraBridge(clientId, range.from, range.to),
        ]);
        if (cancelled) return;

        const nowRows = allRows.filter((r) => inRange(r.date, range.from, range.to));
        const prevRows = allRows.filter((r) => inRange(r.date, previous.from, previous.to));

        const totals = totalsOf(nowRows);
        const prev = totalsOf(prevRows);
        const hierarchy = buildHierarchy(nowRows);
        const monthly = monthlyOf(allRows);

        setData({
          totals,
          hierarchy,
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
