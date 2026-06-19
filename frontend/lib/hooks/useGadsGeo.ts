'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DateRange } from '@/lib/period';
import { classifyModel, type ModelKey } from '@/lib/hooks/useGadsLeads';

// ============================================================
// useGadsGeo — datos de localización (ciudad) de Google Ads.
// Lee gads_geo (geographic_view resuelto a nombres de ciudad) y agrupa
// por ciudad para alimentar las tortas: Conversiones, Inversión,
// Impresiones y Coste/lead por ciudad. Se separa por modelo de negocio
// (venta / propietarios) igual que el resto del Overview. 100% dato real.
// ============================================================

export interface CityRow {
  city: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number; // leads
  cpa: number; // cost / conversions (costo por lead)
}

export interface GeoModel {
  key: ModelKey;
  cities: CityRow[]; // ordenadas por conversiones desc
  totalCost: number;
  totalConversions: number;
}

export interface GadsGeoData {
  venta: GeoModel;
  propietarios: GeoModel;
  hasAny: boolean; // ¿hubo alguna fila de geo en el rango?
  from: string;
  to: string;
}

export interface UseGadsGeoResult {
  data: GadsGeoData | null;
  loading: boolean;
  error: string | null;
}

interface RawGeoRow {
  campaign_name: string | null;
  city: string | null;
  cost: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
}

const SELECT = 'campaign_name, city, cost, impressions, clicks, conversions';
const PAGE = 1000;

async function fetchGeoRows(clientId: string, from: string, to: string): Promise<RawGeoRow[]> {
  const all: RawGeoRow[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('gads_geo')
      .select(SELECT)
      .eq('client_id', clientId)
      .gte('date_start', from)
      .lte('date_start', to)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as RawGeoRow[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

interface CitySum {
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

function buildGeoModel(key: ModelKey, rows: RawGeoRow[]): GeoModel {
  const map = new Map<string, CitySum>();
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
  const cities: CityRow[] = [];
  let totalCost = 0;
  let totalConversions = 0;
  for (const [city, s] of map.entries()) {
    totalCost += s.cost;
    totalConversions += s.conversions;
    cities.push({
      city,
      cost: s.cost,
      impressions: s.impressions,
      clicks: s.clicks,
      conversions: s.conversions,
      cpa: s.conversions > 0 ? s.cost / s.conversions : 0,
    });
  }
  cities.sort((a, b) => b.conversions - a.conversions || b.cost - a.cost);
  return { key, cities, totalCost, totalConversions };
}

export function useGadsGeo(clientId: string, range: DateRange): UseGadsGeoResult {
  const [data, setData] = useState<GadsGeoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchGeoRows(clientId, range.from, range.to);
        if (cancelled) return;

        const split = (key: ModelKey) =>
          rows.filter((r) => classifyModel(r.campaign_name) === key);

        const venta = buildGeoModel('venta', split('venta'));
        const propietarios = buildGeoModel('propietarios', split('propietarios'));

        setData({
          venta,
          propietarios,
          hasAny: rows.length > 0,
          from: range.from,
          to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useGadsGeo]', e);
        setError(e?.message || 'Error desconocido al cargar localizaciones de Google Ads');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [clientId, range.from, range.to]);

  return { data, loading, error };
}
