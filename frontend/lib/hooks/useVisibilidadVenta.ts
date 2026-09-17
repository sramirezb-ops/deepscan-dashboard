'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DateRange } from '@/lib/period';

// ============================================================
// useVisibilidadVenta — la "visibilidad de venta" de Sneaker Store,
// automatizada desde Supabase (misma lógica que el reporte de WhatsApp que
// armábamos a mano del CSV). Se actualiza sola con el ETL:
//   · aura_sales  → venta real cobrada por canal (bucket 'medicion'),
//     más lo separado (cambios + Cowmmerce). El bucket ya viene clasificado.
//   · meta_campaigns → inversión Meta + ROAS sobre compras reales.
//   · gads_campaigns → inversión Google (su ROAS NO se reporta: mezcla
//     add-to-cart, inflaría el dato).
//   MER = venta real cobrada ÷ inversión total (el número que importa).
// ============================================================

// Canal (aura_sales) → etiqueta legible, agrupando manual + whatsapp-ai.
const CANAL_LABEL: Record<string, string> = {
  manual: 'Cierre por chat/WhatsApp (manual)',
  'whatsapp-ai': 'Cierre por chat/WhatsApp (manual)',
  shopify: 'Shopify (web)',
  sneakerstore: 'Tienda / POS',
  direct: 'Directo (con vendedor)',
  carritos_abandonados: 'Carrito recuperado',
  instagram: 'Instagram',
};
// Orden de despliegue de los canales de medición.
const CANAL_ORDER = [
  'Cierre por chat/WhatsApp (manual)',
  'Shopify (web)',
  'Tienda / POS',
  'Directo (con vendedor)',
  'Carrito recuperado',
  'Instagram',
];

export interface CanalVenta { label: string; cobrado: number; ops: number; pct: number }

export interface VisibilidadData {
  exists: boolean;
  // Inversión
  metaSpend: number;
  googleSpend: number;
  inversion: number;
  // Venta real cobrada (medición)
  medicion: number;
  movimientos: number;
  abonos: number;
  canales: CanalVenta[];
  // MER (protagonista)
  mer: number;
  merPrev: number;
  // ROAS plataformas (solo Meta, sobre compras reales)
  metaRoas: number;
  metaValue: number;
  metaPurchases: number;
  // Separado de la medición
  cambios: number;
  cowmmerce: number;
  // Cierre
  gmvBruto: number;
  // Frescura del dato (última fecha con venta en aura_sales)
  ultimaFecha: string | null;
  from: string;
  to: string;
}

export interface UseVisibilidadResult {
  data: VisibilidadData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface AuraRow {
  bucket: string | null; tipo: string | null; canal: string | null;
  cobrado: number | null; fecha_date: string | null;
}

async function fetchAura(clientId: string, from: string, to: string): Promise<AuraRow[]> {
  const { data, error } = await supabase
    .from('aura_sales')
    .select('bucket, tipo, canal, cobrado, fecha_date')
    .eq('client_id', clientId)
    .gte('fecha_date', from)
    .lte('fecha_date', to);
  if (error) return [];
  return (data || []) as AuraRow[];
}

// Devuelve las filas diarias (con fecha) para poder ACOTAR la inversión a la
// misma ventana donde hay venta: si AURA va rezagada, sumar el gasto de días sin
// venta inflaría el denominador y hundiría el MER de mentira.
async function fetchMetaRows(clientId: string, from: string, to: string): Promise<any[]> {
  const PAGE = 1000; const all: any[] = []; let off = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('meta_campaigns')
      .select('date, spend, purchase_value, purchases')
      .eq('client_id', clientId).gte('date', from).lte('date', to)
      .range(off, off + PAGE - 1);
    if (error) break;
    const b = (data || []) as any[]; all.push(...b);
    if (b.length < PAGE) break; off += PAGE;
  }
  return all;
}

async function fetchGoogleRows(clientId: string, from: string, to: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('gads_campaigns').select('date, cost')
    .eq('client_id', clientId).gte('date', from).lte('date', to);
  if (error) return [];
  return (data || []) as any[];
}

const inWin = (d: string | null, a: string, b: string) => !!d && d >= a && d <= b;
function sumMetaWin(rows: any[], a: string, b: string) {
  return rows.reduce((acc, r) => {
    if (!inWin(r.date, a, b)) return acc;
    acc.spend += Number(r.spend) || 0;
    acc.value += Number(r.purchase_value) || 0;
    acc.purchases += Number(r.purchases) || 0;
    return acc;
  }, { spend: 0, value: 0, purchases: 0 });
}
const sumGoogleWin = (rows: any[], a: string, b: string) =>
  rows.reduce((s, r) => s + (inWin(r.date, a, b) ? Number(r.cost) || 0 : 0), 0);

function sumAura(rows: AuraRow[]) {
  let medicion = 0, cambios = 0, cowmmerce = 0, abonos = 0;
  const byCanal = new Map<string, { cobrado: number; ops: number }>();
  let ultima: string | null = null, primera: string | null = null;
  for (const r of rows) {
    const c = Number(r.cobrado) || 0;
    const f = (r.fecha_date || '').slice(0, 10);
    if (f) {
      if (f > (ultima || '')) ultima = f;
      if (!primera || f < primera) primera = f;
    }
    if (r.bucket === 'medicion') {
      if (c <= 0) continue;
      medicion += c;
      if ((r.tipo || '').toUpperCase() === 'ABONO') abonos += c;
      const label = CANAL_LABEL[r.canal || ''] || (r.canal || 'Otro');
      const e = byCanal.get(label) || { cobrado: 0, ops: 0 };
      e.cobrado += c; e.ops += 1; byCanal.set(label, e);
    } else if (r.bucket === 'cambio') cambios += c;
    else if (r.bucket === 'cowmmerce') cowmmerce += c;
  }
  const movimientos = Array.from(byCanal.values()).reduce((s, e) => s + e.ops, 0);
  const canales: CanalVenta[] = Array.from(byCanal.entries())
    .map(([label, e]) => ({ label, cobrado: e.cobrado, ops: e.ops, pct: medicion > 0 ? e.cobrado / medicion : 0 }))
    .sort((a, b) => (CANAL_ORDER.indexOf(a.label) - CANAL_ORDER.indexOf(b.label)) || b.cobrado - a.cobrado);
  return { medicion, cambios, cowmmerce, abonos, movimientos, canales, ultima, primera };
}

export function useVisibilidadVenta(
  clientId: string, range: DateRange, previous: DateRange
): UseVisibilidadResult {
  const [data, setData] = useState<VisibilidadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true); setError(null);
      try {
        const [aura, auraPrev, metaRows, metaPrevRows, gadsRows, gadsPrevRows] = await Promise.all([
          fetchAura(clientId, range.from, range.to),
          fetchAura(clientId, previous.from, previous.to),
          fetchMetaRows(clientId, range.from, range.to),
          fetchMetaRows(clientId, previous.from, previous.to),
          fetchGoogleRows(clientId, range.from, range.to),
          fetchGoogleRows(clientId, previous.from, previous.to),
        ]);
        if (cancelled) return;

        const a = sumAura(aura);
        const ap = sumAura(auraPrev);

        // Ventana efectiva = donde de verdad hay venta (AURA puede ir rezagada).
        // Acotamos la inversión a esa misma ventana para que el MER sea honesto.
        const effFrom = a.primera && a.primera > range.from ? a.primera : range.from;
        const effTo = a.ultima && a.ultima < range.to ? a.ultima : range.to;
        const meta = sumMetaWin(metaRows, effFrom, effTo);
        const gads = sumGoogleWin(gadsRows, effFrom, effTo);
        const inversion = meta.spend + gads;
        const mer = inversion > 0 ? a.medicion / inversion : 0;

        const pFrom = ap.primera && ap.primera > previous.from ? ap.primera : previous.from;
        const pTo = ap.ultima && ap.ultima < previous.to ? ap.ultima : previous.to;
        const invPrev = sumMetaWin(metaPrevRows, pFrom, pTo).spend + sumGoogleWin(gadsPrevRows, pFrom, pTo);
        const merPrev = invPrev > 0 ? ap.medicion / invPrev : 0;

        setData({
          exists: aura.length > 0,
          metaSpend: meta.spend, googleSpend: gads, inversion,
          medicion: a.medicion, movimientos: a.movimientos, abonos: a.abonos, canales: a.canales,
          mer, merPrev,
          metaRoas: meta.spend > 0 ? meta.value / meta.spend : 0,
          metaValue: meta.value, metaPurchases: Math.round(meta.purchases),
          cambios: a.cambios, cowmmerce: a.cowmmerce,
          gmvBruto: a.medicion + a.cambios + a.cowmmerce,
          ultimaFecha: a.ultima,
          from: range.from, to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useVisibilidadVenta]', e);
        setError(e?.message || 'Error cargando la visibilidad de venta');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [clientId, range.from, range.to, previous.from, previous.to, tick]);

  return { data, loading, error, refresh: () => setTick((t) => t + 1) };
}
