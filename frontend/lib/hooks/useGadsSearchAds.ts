'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { floorGadsFrom } from '@/lib/dataFloors';
import type { DateRange } from '@/lib/period';

// ============================================================
// useGadsSearchAds — desglose POR ANUNCIO (RSA) de las campañas Search.
// Lee gads_ad_assets (ad_group_ad_asset_view): cada fila es un asset
// (titular/descripción) de un anuncio, con métricas de CONTRIBUCIÓN.
// Agrupamos por anuncio (ad_id) dentro de cada campaña Search:
//   · impresiones/clics/conversiones = suma de la contribución de sus assets
//     (NO es el total real del anuncio ni hay costo por anuncio: Google no lo
//     atribuye en RSA). Sirve para COMPARAR anuncios entre sí, no como reparto.
//   · titular estrella = el asset que más convierte del anuncio.
// 100% dato real. Si no hay filas, la sección no se pinta.
// ============================================================

export interface SearchAdRow {
  adId: string;
  topText: string; // titular/descr. que más convierte
  topField: string; // HEADLINE / DESCRIPTION
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number; // clicks / impressions
  active: boolean; // ¿tuvo alguna impresión en el período?
}

export interface SearchAdsCampaign {
  campaignId: string;
  campaignName: string;
  ads: SearchAdRow[]; // ordenados por conversiones desc
  adCount: number;
}

export interface GadsSearchAdsData {
  campaigns: SearchAdsCampaign[];
  hasAny: boolean;
}

export interface UseGadsSearchAdsResult {
  data: GadsSearchAdsData | null;
  loading: boolean;
  error: string | null;
}

interface RawRow {
  campaign_id: string;
  campaign_name: string | null;
  ad_id: string;
  field_type: string | null;
  asset_text: string | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
}

const SELECT =
  'campaign_id, campaign_name, ad_id, field_type, asset_text, impressions, clicks, conversions';
const PAGE = 1000;

// ¿La campaña es de tipo Search? (por nombre; el asset view no trae el tipo)
function isSearchCampaign(name: string | null): boolean {
  return /search|búsqueda|busqueda/i.test(name || '');
}

async function fetchRows(clientId: string, from: string, to: string): Promise<RawRow[]> {
  const all: RawRow[] = [];
  let offset = 0;
  // Piso por cliente: nunca leer antes del cambio de cuenta de Google Ads.
  const effFrom = floorGadsFrom(from, clientId);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('gads_ad_assets')
      .select(SELECT)
      .eq('client_id', clientId)
      .gte('date_start', effFrom)
      .lte('date_start', to)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as RawRow[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

interface AdAcc {
  impressions: number;
  clicks: number;
  conversions: number;
  top: { text: string; field: string; conversions: number } | null;
}

export function useGadsSearchAds(clientId: string, range: DateRange): UseGadsSearchAdsResult {
  const [data, setData] = useState<GadsSearchAdsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = (await fetchRows(clientId, range.from, range.to)).filter((r) =>
          isSearchCampaign(r.campaign_name)
        );
        if (cancelled) return;

        // campaña → (ad_id → acumulado)
        const byCamp = new Map<string, { name: string; ads: Map<string, AdAcc> }>();
        for (const r of rows) {
          let camp = byCamp.get(r.campaign_id);
          if (!camp) {
            camp = { name: r.campaign_name || '(sin nombre)', ads: new Map() };
            byCamp.set(r.campaign_id, camp);
          }
          let ad = camp.ads.get(r.ad_id);
          if (!ad) {
            ad = { impressions: 0, clicks: 0, conversions: 0, top: null };
            camp.ads.set(r.ad_id, ad);
          }
          const conv = Number(r.conversions) || 0;
          ad.impressions += Number(r.impressions) || 0;
          ad.clicks += Number(r.clicks) || 0;
          ad.conversions += conv;
          const text = (r.asset_text || '').trim();
          // Titular estrella: el asset con más conversiones (preferir HEADLINE en empate).
          if (text && (!ad.top || conv > ad.top.conversions)) {
            ad.top = { text, field: r.field_type || '', conversions: conv };
          }
        }

        const campaigns: SearchAdsCampaign[] = [];
        for (const [campaignId, c] of byCamp.entries()) {
          const ads: SearchAdRow[] = [];
          for (const [adId, a] of c.ads.entries()) {
            ads.push({
              adId,
              topText: a.top?.text || '(anuncio sin texto)',
              topField: a.top?.field || '',
              impressions: a.impressions,
              clicks: a.clicks,
              conversions: a.conversions,
              ctr: a.impressions > 0 ? a.clicks / a.impressions : 0,
              active: a.impressions > 0,
            });
          }
          ads.sort((x, y) => y.conversions - x.conversions || y.impressions - x.impressions);
          campaigns.push({ campaignId, campaignName: c.name, ads, adCount: ads.length });
        }
        campaigns.sort((a, b) => b.ads.length - a.ads.length);

        setData({ campaigns, hasAny: campaigns.some((c) => c.adCount > 0) });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useGadsSearchAds]', e);
        setError(e?.message || 'Error al cargar anuncios de Search');
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
