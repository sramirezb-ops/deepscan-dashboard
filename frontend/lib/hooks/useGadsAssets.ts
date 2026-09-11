'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
// useGadsAssets — inventario de ASSETS de Performance Max
// ============================================================
// Lee gads_assets, que es una FOTO del estado actual de los assets
// (no tiene columna de fecha), por eso NO responde al filtro global.
// Cada asset group de PMAX se arma con varios assets:
//   · TEXT       → headlines, long headlines y descriptions (copy real).
//   · YOUTUBE    → videos con su youtube_video_id (miniatura real).
//   · IMAGE      → imágenes; hoy el script no exporta la URL de preview,
//                  así que solo podemos contarlas por tipo (dato honesto).
// El performance_label de Google llega vacío desde la fuente; cuando el
// script lo exporte, esta sección lo mostrará automáticamente.
// Nada se inventa: solo se pinta lo que existe.
// ============================================================

const PAGE = 1000;

// Métricas reales por pieza (agregadas a 30 días, vienen de la API de PMax).
export interface AssetMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  convValue: number;
  cost: number;
}

const ZERO_METRICS: AssetMetrics = {
  impressions: 0,
  clicks: 0,
  conversions: 0,
  convValue: 0,
  cost: 0,
};

// Origen del asset: lo crea Google automáticamente o lo subió el anunciante.
export type AssetSource = 'auto' | 'advertiser' | 'unknown';

export interface VideoAsset extends AssetMetrics {
  videoId: string;
  title: string;
  source: AssetSource;
  groups: string[]; // asset groups que lo usan
}

export interface TextAsset extends AssetMetrics {
  text: string;
  fieldType: string;
  source: AssetSource;
  groups: string[];
}

export interface TypeCount {
  fieldType: string;
  count: number;
}

export interface ImageAsset extends AssetMetrics {
  url: string;
  fieldType: string;
  source: AssetSource;
  groups: string[]; // asset groups que la usan
}

export interface GadsAssetsData {
  videos: VideoAsset[]; // distintos por videoId
  headlines: TextAsset[];
  longHeadlines: TextAsset[];
  descriptions: TextAsset[];
  otherTexts: TextAsset[];
  images: ImageAsset[]; // imágenes distintas por URL (solo las que ya traen URL real)
  imageCount: number;
  imageTypes: TypeCount[];
  videoCount: number; // videos distintos
  textCount: number; // total filas de texto
  assetCount: number; // total filas
  // Origen de las piezas distintas (para el resumen de arriba).
  autoCount: number; // piezas que Google generó automáticamente
  advertiserCount: number; // piezas que subió el anunciante
  unknownCount: number; // piezas sin origen declarado
  distinctCount: number; // total de piezas distintas (videos + textos + imágenes)
  // Banderas de honestidad para el aviso de la UI.
  hasAnyImageUrl: boolean;
  hasAnyPerfLabel: boolean;
  hasAnyMetric: boolean; // ¿la fuente trae métricas reales por pieza?
}

export interface UseGadsAssetsResult {
  data: GadsAssetsData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RawAsset {
  asset_type: string | null;
  field_type: string | null;
  performance_label: string | null;
  source: string | null;
  asset_text: string | null;
  image_url: string | null;
  youtube_video_id: string | null;
  youtube_title: string | null;
  asset_group_name: string | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  conv_value: number | null;
  cost: number | null;
}

const SELECT =
  'asset_type, field_type, performance_label, source, asset_text, image_url, youtube_video_id, youtube_title, asset_group_name, impressions, clicks, conversions, conv_value, cost';

/** Normaliza el campo `source` de Google a nuestras 3 categorías. */
function srcOf(r: RawAsset): AssetSource {
  const s = (r.source || '').toUpperCase();
  if (s.includes('AUTOMATICALLY')) return 'auto';
  if (s.includes('ADVERTISER')) return 'advertiser';
  return 'unknown';
}

/** Al deduplicar, un origen declarado (auto/advertiser) gana sobre 'unknown'. */
function mergeSource(prev: AssetSource, next: AssetSource): AssetSource {
  return prev === 'unknown' ? next : prev;
}

/** Suma las métricas de una fila cruda sobre un acumulador. */
function addMetrics(acc: AssetMetrics, r: RawAsset) {
  acc.impressions += r.impressions || 0;
  acc.clicks += r.clicks || 0;
  acc.conversions += r.conversions || 0;
  acc.convValue += r.conv_value || 0;
  acc.cost += r.cost || 0;
}

/** Ordena por leads, luego impresiones, luego nº de grupos (desempate estable). */
function byPerformance(a: AssetMetrics & { groups: string[] }, b: AssetMetrics & { groups: string[] }) {
  return (
    b.conversions - a.conversions ||
    b.impressions - a.impressions ||
    b.groups.length - a.groups.length
  );
}

async function fetchRows(clientId: string): Promise<RawAsset[]> {
  const all: RawAsset[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('gads_assets')
      .select(SELECT)
      .eq('client_id', clientId)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as RawAsset[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

/** Acumula assets de texto distintos por su contenido, sumando métricas y grupos. */
function dedupeText(rows: RawAsset[]): TextAsset[] {
  const map = new Map<string, TextAsset>();
  for (const r of rows) {
    const text = (r.asset_text || '').trim();
    if (!text) continue;
    const ft = r.field_type || 'TEXT';
    const key = `${ft}␟${text}`;
    let a = map.get(key);
    if (!a) {
      a = { text, fieldType: ft, source: srcOf(r), groups: [], ...ZERO_METRICS };
      map.set(key, a);
    } else {
      a.source = mergeSource(a.source, srcOf(r));
    }
    const g = r.asset_group_name || '';
    if (g && !a.groups.includes(g)) a.groups.push(g);
    addMetrics(a, r);
  }
  // Por rendimiento (leads), luego impresiones; alfabético solo si todo es 0.
  return Array.from(map.values()).sort(
    (a, b) => byPerformance(a, b) || a.text.localeCompare(b.text)
  );
}

export function useGadsAssets(clientId: string): UseGadsAssetsResult {
  const [data, setData] = useState<GadsAssetsData | null>(null);
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
        const rows = await fetchRows(clientId);
        if (cancelled) return;

        const textRows = rows.filter((r) => (r.asset_type || '') === 'TEXT');
        const videoRows = rows.filter((r) => (r.asset_type || '') === 'YOUTUBE_VIDEO');
        const imageRows = rows.filter((r) => (r.asset_type || '') === 'IMAGE');

        // Videos distintos por youtube_video_id, sumando métricas y grupos.
        const vmap = new Map<string, VideoAsset>();
        for (const r of videoRows) {
          const id = (r.youtube_video_id || '').trim();
          if (!id) continue;
          let v = vmap.get(id);
          if (!v) {
            v = {
              videoId: id,
              title: (r.youtube_title || '').trim() || 'Video sin título',
              source: srcOf(r),
              groups: [],
              ...ZERO_METRICS,
            };
            vmap.set(id, v);
          } else {
            v.source = mergeSource(v.source, srcOf(r));
          }
          const g = r.asset_group_name || '';
          if (g && !v.groups.includes(g)) v.groups.push(g);
          addMetrics(v, r);
        }
        const videos = Array.from(vmap.values()).sort(byPerformance);

        // Textos por field_type.
        const allText = dedupeText(textRows);
        const headlines = allText.filter((t) => t.fieldType === 'HEADLINE');
        const longHeadlines = allText.filter((t) => t.fieldType === 'LONG_HEADLINE');
        const descriptions = allText.filter((t) => t.fieldType === 'DESCRIPTION');
        const known = new Set(['HEADLINE', 'LONG_HEADLINE', 'DESCRIPTION']);
        const otherTexts = allText.filter((t) => !known.has(t.fieldType));

        // Imágenes: conteo por field_type (no hay URL de preview todavía).
        const itMap = new Map<string, number>();
        for (const r of imageRows) {
          const ft = r.field_type || 'IMAGE';
          itMap.set(ft, (itMap.get(ft) || 0) + 1);
        }
        const imageTypes: TypeCount[] = Array.from(itMap.entries())
          .map(([fieldType, count]) => ({ fieldType, count }))
          .sort((a, b) => b.count - a.count);

        // Imágenes distintas por URL real (solo las que el script ya exporta).
        const imgMap = new Map<string, ImageAsset>();
        for (const r of imageRows) {
          const url = (r.image_url || '').trim();
          if (!url) continue; // honestidad: si no hay URL, no se pinta
          let im = imgMap.get(url);
          if (!im) {
            im = { url, fieldType: r.field_type || 'IMAGE', source: srcOf(r), groups: [], ...ZERO_METRICS };
            imgMap.set(url, im);
          } else {
            im.source = mergeSource(im.source, srcOf(r));
          }
          const g = r.asset_group_name || '';
          if (g && !im.groups.includes(g)) im.groups.push(g);
          addMetrics(im, r);
        }
        const images = Array.from(imgMap.values()).sort(byPerformance);

        // Origen de las piezas distintas (videos + textos + imágenes con URL).
        const allDistinct: { source: AssetSource }[] = [
          ...videos,
          ...allText,
          ...images,
        ];
        let autoCount = 0;
        let advertiserCount = 0;
        let unknownCount = 0;
        for (const a of allDistinct) {
          if (a.source === 'auto') autoCount++;
          else if (a.source === 'advertiser') advertiserCount++;
          else unknownCount++;
        }

        setData({
          videos,
          headlines,
          longHeadlines,
          descriptions,
          otherTexts,
          images,
          imageCount: imageRows.length,
          imageTypes,
          videoCount: videos.length,
          textCount: textRows.length,
          assetCount: rows.length,
          autoCount,
          advertiserCount,
          unknownCount,
          distinctCount: allDistinct.length,
          hasAnyImageUrl: rows.some((r) => (r.image_url || '').trim() !== ''),
          hasAnyPerfLabel: rows.some((r) => (r.performance_label || '').trim() !== ''),
          hasAnyMetric: rows.some(
            (r) => (r.impressions || 0) > 0 || (r.clicks || 0) > 0 || (r.conversions || 0) > 0
          ),
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useGadsAssets]', e);
        setError(e?.message || 'Error desconocido al cargar assets de Google Ads');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [clientId, tick]);

  return { data, loading, error, refresh: () => setTick((x) => x + 1) };
}
