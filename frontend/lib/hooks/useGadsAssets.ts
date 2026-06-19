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

export interface VideoAsset {
  videoId: string;
  title: string;
  groups: string[]; // asset groups que lo usan
}

export interface TextAsset {
  text: string;
  fieldType: string;
  groups: string[];
}

export interface TypeCount {
  fieldType: string;
  count: number;
}

export interface ImageAsset {
  url: string;
  fieldType: string;
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
  // Banderas de honestidad para el aviso de la UI.
  hasAnyImageUrl: boolean;
  hasAnyPerfLabel: boolean;
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
  asset_text: string | null;
  image_url: string | null;
  youtube_video_id: string | null;
  youtube_title: string | null;
  asset_group_name: string | null;
}

const SELECT =
  'asset_type, field_type, performance_label, asset_text, image_url, youtube_video_id, youtube_title, asset_group_name';

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

/** Acumula assets de texto distintos por su contenido, juntando los grupos que los usan. */
function dedupeText(rows: RawAsset[]): TextAsset[] {
  const map = new Map<string, TextAsset>();
  for (const r of rows) {
    const text = (r.asset_text || '').trim();
    if (!text) continue;
    const ft = r.field_type || 'TEXT';
    const key = `${ft}␟${text}`;
    let a = map.get(key);
    if (!a) {
      a = { text, fieldType: ft, groups: [] };
      map.set(key, a);
    }
    const g = r.asset_group_name || '';
    if (g && !a.groups.includes(g)) a.groups.push(g);
  }
  // Más usados (en más grupos) primero, luego alfabético.
  return Array.from(map.values()).sort(
    (a, b) => b.groups.length - a.groups.length || a.text.localeCompare(b.text)
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

        // Videos distintos por youtube_video_id, juntando los grupos.
        const vmap = new Map<string, VideoAsset>();
        for (const r of videoRows) {
          const id = (r.youtube_video_id || '').trim();
          if (!id) continue;
          let v = vmap.get(id);
          if (!v) {
            v = { videoId: id, title: (r.youtube_title || '').trim() || 'Video sin título', groups: [] };
            vmap.set(id, v);
          }
          const g = r.asset_group_name || '';
          if (g && !v.groups.includes(g)) v.groups.push(g);
        }
        const videos = Array.from(vmap.values()).sort(
          (a, b) => b.groups.length - a.groups.length
        );

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
            im = { url, fieldType: r.field_type || 'IMAGE', groups: [] };
            imgMap.set(url, im);
          }
          const g = r.asset_group_name || '';
          if (g && !im.groups.includes(g)) im.groups.push(g);
        }
        const images = Array.from(imgMap.values()).sort(
          (a, b) => b.groups.length - a.groups.length
        );

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
          hasAnyImageUrl: rows.some((r) => (r.image_url || '').trim() !== ''),
          hasAnyPerfLabel: rows.some((r) => (r.performance_label || '').trim() !== ''),
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
