'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { floorGadsFrom } from '@/lib/dataFloors';
import type { DateRange } from '@/lib/period';
import { classifyModel } from '@/lib/hooks/useGadsLeads';

// ============================================================
// useGadsAdAssets — resultados POR ASSET (imagen / video / texto) de las
// campañas Propietarios (Display). Lee gads_ad_assets (Fase 2 del ETL:
// ad_group_ad_asset_view) y agrega por asset a lo largo del período.
//
// Google NO atribuye costo por asset en anuncios adaptables, así que aquí
// solo hay métricas reales por pieza: impresiones, clics, leads y la
// calificación de Google (performance_label). 100% dato real; si la tabla
// está vacía (ETL aún no corre) devolvemos hasAny=false y la vista muestra
// el aviso honesto "Próximamente".
// ============================================================

export type AssetKind = 'image' | 'video' | 'text';

export interface AssetItem {
  assetId: string;
  fieldType: string; // MARKETING_IMAGE | YOUTUBE_VIDEO | HEADLINE | DESCRIPTION | ...
  assetType: string; // IMAGE | YOUTUBE_VIDEO | TEXT | ...
  kind: AssetKind;
  performanceLabel: string; // BEST | GOOD | LOW | LEARNING | PENDING | ...
  assetText: string;
  imageUrl: string;
  youtubeVideoId: string;
  youtubeTitle: string;
  impressions: number;
  clicks: number;
  conversions: number; // leads
  ctr: number; // clicks / impressions
}

export interface AssetCampaign {
  campaignId: string;
  campaignName: string;
  visuals: AssetItem[]; // imágenes y videos, orden por impresiones desc
  texts: AssetItem[]; // titulares y descripciones, orden por impresiones desc
  hasMetrics: boolean; // ¿Google reportó métricas por pieza? (Display normalmente NO)
}

export interface GadsAdAssetsData {
  byCampaign: Map<string, AssetCampaign>;
  hasAny: boolean; // ¿hubo alguna fila de asset en el rango?
  from: string;
  to: string;
}

export interface UseGadsAdAssetsResult {
  data: GadsAdAssetsData | null;
  loading: boolean;
  error: string | null;
}

interface RawAssetRow {
  date_start: string;
  campaign_id: string;
  campaign_name: string | null;
  ad_id: string;
  asset_id: string;
  field_type: string | null;
  asset_type: string | null;
  performance_label: string | null;
  asset_text: string | null;
  image_url: string | null;
  youtube_video_id: string | null;
  youtube_title: string | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
}

const SELECT =
  'date_start, campaign_id, campaign_name, ad_id, asset_id, field_type, asset_type, performance_label, asset_text, image_url, youtube_video_id, youtube_title, impressions, clicks, conversions';
const PAGE = 1000;

async function fetchAssetRows(clientId: string, from: string, to: string): Promise<RawAssetRow[]> {
  const all: RawAssetRow[] = [];
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
    const batch = (data || []) as RawAssetRow[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// Orden de la calificación de Google cuando no hay métricas por pieza (Display).
// Mejor calificación primero: BEST > GOOD > LOW > LEARNING/PENDING > resto.
function labelRank(label: string): number {
  switch ((label || '').toUpperCase()) {
    case 'BEST': return 5;
    case 'GOOD': return 4;
    case 'LOW': return 3;
    case 'LEARNING': return 2;
    case 'PENDING': return 1;
    default: return 0;
  }
}

function kindOf(assetType: string, fieldType: string): AssetKind {
  const t = (assetType || '').toUpperCase();
  const f = (fieldType || '').toUpperCase();
  if (t.includes('YOUTUBE') || t.includes('VIDEO') || f.includes('VIDEO')) return 'video';
  if (t.includes('IMAGE') || t.includes('MEDIA_BUNDLE') || f.includes('IMAGE') || f.includes('LOGO')) return 'image';
  return 'text';
}

interface AssetAcc {
  row: RawAssetRow;
  impressions: number;
  clicks: number;
  conversions: number;
  lastDate: string;
  label: string; // performance_label más reciente no vacío
}

export function useGadsAdAssets(clientId: string, range: DateRange): UseGadsAdAssetsResult {
  const [data, setData] = useState<GadsAdAssetsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchAssetRows(clientId, range.from, range.to);
        if (cancelled) return;

        // Solo Propietarios (Display). Si algún día se usa en otra vista, se
        // parametriza; por ahora la sección vive en Propietarios.
        const prop = rows.filter((r) => classifyModel(r.campaign_name) === 'propietarios');

        // Agrega por (campaña, asset, field_type) a lo largo de los días.
        const accByCamp = new Map<string, { name: string; assets: Map<string, AssetAcc> }>();
        for (const r of prop) {
          let camp = accByCamp.get(r.campaign_id);
          if (!camp) {
            camp = { name: r.campaign_name || '(sin nombre)', assets: new Map() };
            accByCamp.set(r.campaign_id, camp);
          }
          const key = `${r.asset_id}__${r.field_type}`;
          let a = camp.assets.get(key);
          if (!a) {
            a = { row: r, impressions: 0, clicks: 0, conversions: 0, lastDate: '', label: '' };
            camp.assets.set(key, a);
          }
          a.impressions += Number(r.impressions) || 0;
          a.clicks += Number(r.clicks) || 0;
          a.conversions += Number(r.conversions) || 0;
          // performance_label vigente: el de la fecha más reciente con valor real.
          const lbl = (r.performance_label || '').toUpperCase();
          if (r.date_start >= a.lastDate && lbl && lbl !== 'UNKNOWN' && lbl !== 'UNSPECIFIED') {
            a.lastDate = r.date_start;
            a.label = lbl;
          }
          // Conserva la fila con contenido (URL/texto) por si la primera vino vacía.
          if (!a.row.image_url && !a.row.asset_text && !a.row.youtube_video_id) a.row = r;
        }

        const byCampaign = new Map<string, AssetCampaign>();
        for (const [campId, camp] of accByCamp.entries()) {
          const items: AssetItem[] = [];
          for (const a of camp.assets.values()) {
            const r = a.row;
            const assetType = r.asset_type || '';
            const fieldType = r.field_type || '';
            items.push({
              assetId: r.asset_id,
              fieldType,
              assetType,
              kind: kindOf(assetType, fieldType),
              performanceLabel: a.label || (r.performance_label || '').toUpperCase(),
              assetText: r.asset_text || '',
              imageUrl: r.image_url || '',
              youtubeVideoId: r.youtube_video_id || '',
              youtubeTitle: r.youtube_title || '',
              impressions: a.impressions,
              clicks: a.clicks,
              conversions: a.conversions,
              ctr: a.impressions > 0 ? a.clicks / a.impressions : 0,
            });
          }
          // ¿Hubo métricas reales por pieza? En Display, Google no las reparte
          // por asset → todas en 0; entonces ordenamos por la calificación de
          // Google (BEST→LOW) en vez de por impresiones, que serían todas 0.
          const hasMetrics = items.some((i) => i.impressions > 0 || i.clicks > 0);
          const cmp = (x: AssetItem, y: AssetItem) =>
            hasMetrics
              ? y.impressions - x.impressions || y.clicks - x.clicks
              : labelRank(y.performanceLabel) - labelRank(x.performanceLabel);
          const visuals = items.filter((i) => i.kind !== 'text').sort(cmp);
          const texts = items.filter((i) => i.kind === 'text').sort(cmp);
          byCampaign.set(campId, { campaignId: campId, campaignName: camp.name, visuals, texts, hasMetrics });
        }

        setData({ byCampaign, hasAny: prop.length > 0, from: range.from, to: range.to });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useGadsAdAssets]', e);
        setError(e?.message || 'Error desconocido al cargar resultados por asset');
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
