'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
// useGadsPmaxChannels — desglose del gasto PMax por RED
// ============================================================
// Lee gads_pmax_channels: el split Shop/Video/Display/Search* de cada campaña
// Performance Max. Responde la pregunta "¿en qué red se va la plata?".
//
// FUENTE: la pestaña "Campaigns" del sheet de Mike Rhodes (única fuente — Google
// no expone el costo-por-red de PMax por API). Es un SNAPSHOT "últimos 30 días"
// rodante, NO una serie diaria: por eso este hook NO recibe rango de fechas, y
// la vista debe aclararlo. Video/Display salen de placements reales, Shop de
// shopping; Search* es el RESIDUAL (Total − Video − Display − Shop).
//
// 100% dato real. Si la tabla está vacía (ETL aún no corre para este cliente),
// devolvemos channelCount=0 y la sección no se pinta.
// ============================================================

export type PmaxChannel = 'shop' | 'video' | 'display' | 'search';

export interface PmaxChannelRow {
  channel: PmaxChannel;
  isResidual: boolean;
  cost: number;
  conversions: number;
  convValue: number;
  costPct: number; // fracción 0-1 sobre el total de la campaña
  convPct: number; // fracción 0-1
  roas: number;
}

export interface PmaxChannelCampaign {
  campaignName: string;
  totalCost: number;
  totalConv: number;
  totalValue: number;
  channels: PmaxChannelRow[]; // ordenadas por costo desc
}

export interface PmaxChannelsData {
  campaigns: PmaxChannelCampaign[];
  channelCount: number; // total de filas (campaña × red) con datos
}

export interface UsePmaxChannelsResult {
  data: PmaxChannelsData | null;
  loading: boolean;
  error: string | null;
}

interface RawRow {
  campaign_name: string;
  channel: string;
  is_residual: boolean | null;
  cost: number | null;
  conversions: number | null;
  conv_value: number | null;
  cost_pct: number | null;
  conv_pct: number | null;
  roas: number | null;
  campaign_total_cost: number | null;
  campaign_total_conv: number | null;
  campaign_total_value: number | null;
}

const SELECT =
  'campaign_name, channel, is_residual, cost, conversions, conv_value, cost_pct, conv_pct, roas, campaign_total_cost, campaign_total_conv, campaign_total_value';

export function useGadsPmaxChannels(clientId: string): UsePmaxChannelsResult {
  const [data, setData] = useState<PmaxChannelsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: rows, error: err } = await supabase
          .from('gads_pmax_channels')
          .select(SELECT)
          .eq('client_id', clientId);
        if (err) throw err;
        if (cancelled) return;

        const raw = (rows || []) as RawRow[];

        // Agrupa por campaña.
        const byCamp = new Map<string, PmaxChannelCampaign>();
        for (const r of raw) {
          let camp = byCamp.get(r.campaign_name);
          if (!camp) {
            camp = {
              campaignName: r.campaign_name,
              totalCost: Number(r.campaign_total_cost) || 0,
              totalConv: Number(r.campaign_total_conv) || 0,
              totalValue: Number(r.campaign_total_value) || 0,
              channels: [],
            };
            byCamp.set(r.campaign_name, camp);
          }
          camp.channels.push({
            channel: (r.channel || '') as PmaxChannel,
            isResidual: Boolean(r.is_residual),
            cost: Number(r.cost) || 0,
            conversions: Number(r.conversions) || 0,
            convValue: Number(r.conv_value) || 0,
            costPct: Number(r.cost_pct) || 0,
            convPct: Number(r.conv_pct) || 0,
            roas: Number(r.roas) || 0,
          });
        }

        // Ordena redes por costo desc dentro de cada campaña; campañas por gasto.
        const campaigns = Array.from(byCamp.values());
        for (const c of campaigns) c.channels.sort((a, b) => b.cost - a.cost);
        campaigns.sort((a, b) => b.totalCost - a.totalCost);

        setData({ campaigns, channelCount: raw.length });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useGadsPmaxChannels]', e);
        setError(e?.message || 'Error desconocido al cargar el split de redes PMax');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return { data, loading, error };
}
