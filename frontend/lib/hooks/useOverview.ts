'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calcDelta } from '@/lib/utils';
import type { DateRange } from '@/lib/period';

export interface OverviewData {
  // Totales consolidados
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

  // Mix por canal (revenue)
  channelMix: {
    google: number;
    meta: number;
    tiktok: number;
    organic: number;
    direct: number;
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
 * Agrega totales de Google Ads (gads_campaigns) para el rango de fechas.
 * La tabla tiene: date, client_id, campaign_id, impressions, clicks, cost,
 * conversions, conversion_value.
 */
async function fetchGoogleAdsTotals(clientId: string, from: string, to: string) {
  const { data, error } = await supabase
    .from('gads_campaigns')
    .select('cost, conv_value, conversions, impressions, clicks')
    .eq('client_id', clientId)
    .gte('date', from)
    .lte('date', to);

  if (error) throw error;

  const totals = (data || []).reduce(
    (acc, row: any) => {
      acc.cost += Number(row.cost) || 0;
      acc.revenue += Number(row.conv_value) || 0;
      acc.conversions += Number(row.conversions) || 0;
      acc.impressions += Number(row.impressions) || 0;
      acc.clicks += Number(row.clicks) || 0;
      return acc;
    },
    { cost: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 }
  );

  return totals;
}

/**
 * Agrega totales de GA4 (ga4_metrics) para el rango de fechas.
 * Columnas reales: date, client_id, sessions, new_users, active_users,
 * bounce_rate, avg_session_duration, conv_rate, revenue, source_medium.
 * Nota: purchases NO existe como columna, se calcula sessions * conv_rate.
 */
async function fetchGA4Totals(clientId: string, from: string, to: string) {
  const { data, error } = await supabase
    .from('ga4_metrics')
    .select('sessions, active_users, conv_rate, revenue')
    .eq('client_id', clientId)
    .gte('date', from)
    .lte('date', to);

  if (error) throw error;

  return (data || []).reduce(
    (acc, row: any) => {
      const sessions = Number(row.sessions) || 0;
      const convRate = Number(row.conv_rate) || 0;
      // purchases es una estimación; en GA4 conv_rate suele venir como decimal (0.023)
      // o como porcentaje (2.3). Lo normalizamos asumiendo decimal.
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

        // Consultas en paralelo
        const [gadsNow, gadsPrev, ga4Now, ga4Prev] = await Promise.all([
          fetchGoogleAdsTotals(clientId, current.from, current.to),
          fetchGoogleAdsTotals(clientId, previous.from, previous.to),
          fetchGA4Totals(clientId, current.from, current.to),
          fetchGA4Totals(clientId, previous.from, previous.to),
        ]);

        if (cancelled) return;

        // Los cálculos consolidados. Por ahora Meta/TikTok/Shopify sin datos
        // reales, sumamos solo Google Ads + GA4 (GA4 puede tener revenue no-Google).
        const revenue = Math.max(gadsNow.revenue, ga4Now.revenue); // evitar doble conteo
        const investment = gadsNow.cost;
        const sales = Math.round(Math.max(gadsNow.conversions, ga4Now.purchases));
        const sessions = ga4Now.sessions;

        const revenuePrev = Math.max(gadsPrev.revenue, ga4Prev.revenue);
        const investmentPrev = gadsPrev.cost;
        const salesPrev = Math.round(Math.max(gadsPrev.conversions, ga4Prev.purchases));
        const sessionsPrev = ga4Prev.sessions;

        const roas = investment > 0 ? revenue / investment : 0;
        const roasPrev = investmentPrev > 0 ? revenuePrev / investmentPrev : 0;

        const cpa = sales > 0 ? investment / sales : 0;
        const cpaPrev = salesPrev > 0 ? investmentPrev / salesPrev : 0;

        const conversionRate = sessions > 0 ? sales / sessions : 0;
        const conversionRatePrev = sessionsPrev > 0 ? salesPrev / sessionsPrev : 0;

        // Mix: por ahora solo tenemos Google y GA4. GA4 revenue total - Google = "otros"
        // Sin Meta/TikTok/Shopify reales, el mix queda parcial.
        const googleRev = gadsNow.revenue;
        const otherRev = Math.max(0, ga4Now.revenue - googleRev);

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

          channelMix: {
            google: googleRev,
            meta: 0, // sin ETL aún
            tiktok: 0, // sin ETL aún
            organic: otherRev,
            direct: 0,
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
