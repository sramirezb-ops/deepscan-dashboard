'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DateRange } from '@/lib/period';

// ============================================================
// useTikTokComments — comentarios de los anuncios de TikTok
// ============================================================
// Lee la tabla tiktok_comments (una fila = un comentario) que llena el ETL
// (etl/extractors/tiktok_comments.py) y la prepara para la hoja "Comentarios".
//
// El campo `sentiment` lo DERIVA el ETL con una heurística de léxico en español
// (no es una métrica oficial de TikTok). Aquí solo lo leemos y agregamos.
//
// Honestidad de estados (igual que useTikTok):
//   · existsEver=false → la fuente aún no escribió nada → la hoja muestra el
//     marcador "esperando conexión".
//   · existsEver=true pero sin filas en el rango → "sin comentarios en este
//     período".
// Si la tabla todavía no existe (migración sin aplicar) o no hay permiso, NO
// rompemos: caemos al estado "esperando conexión".
// ============================================================

const PAGE = 1000;

export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface TikTokCommentItem {
  commentId: string;
  adId: string;
  adName: string;
  adgroupName: string;
  campaignName: string;
  author: string;
  authorAvatar: string;
  content: string;
  likes: number;
  replies: number;
  commentType: string;
  commentStatus: string;
  parentCommentId: string; // '' si es comentario raíz; id del padre si es respuesta
  isPinned: boolean;
  createdAt: string | null;
  sentiment: Sentiment;
  sentimentScore: number;
}

export interface TikTokCommentsSummary {
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  positivePct: number; // fracción 0-1
  neutralPct: number;
  negativePct: number;
  totalLikes: number;
}

// Un anuncio para el filtro (cuántos comentarios tiene en el rango).
export interface TikTokCommentAd {
  adId: string;
  adName: string;
  count: number;
}

export interface TikTokCommentsData {
  comments: TikTokCommentItem[]; // ordenados por likes desc, luego recientes
  summary: TikTokCommentsSummary;
  ads: TikTokCommentAd[]; // para el filtro por anuncio
  existsEver: boolean; // ¿hay comentarios en cualquier fecha?
  from: string;
  to: string;
}

export interface UseTikTokCommentsResult {
  data: TikTokCommentsData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RawComment {
  comment_id: string | null;
  ad_id: string | null;
  ad_name: string | null;
  adgroup_name: string | null;
  campaign_name: string | null;
  author: string | null;
  author_avatar: string | null;
  content: string | null;
  likes: number | null;
  replies: number | null;
  comment_type: string | null;
  comment_status: string | null;
  parent_comment_id: string | null;
  is_pinned: boolean | null;
  created_at: string | null;
  sentiment: string | null;
  sentiment_score: number | null;
}

const SELECT =
  'comment_id, ad_id, ad_name, adgroup_name, campaign_name, author, author_avatar, content, likes, replies, comment_type, comment_status, parent_comment_id, is_pinned, created_at, sentiment, sentiment_score';

/** Trae los comentarios del rango paginando. Devuelve null si la tabla no existe
 *  o no hay permiso (→ la hoja muestra el marcador honesto, sin pantalla de error). */
async function fetchComments(
  clientId: string,
  from: string,
  to: string
): Promise<RawComment[] | null> {
  const all: RawComment[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('tiktok_comments')
      .select(SELECT)
      .eq('client_id', clientId)
      .gte('created_at', from)
      .lte('created_at', `${to}T23:59:59`)
      .order('likes', { ascending: false })
      .range(offset, offset + PAGE - 1);

    // Tabla inexistente / sin permiso → null (marcador honesto, no error).
    if (error) {
      console.warn('[useTikTokComments] tabla no disponible aún:', error.message);
      return null;
    }
    const batch = (data || []) as RawComment[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

/** ¿El cliente tiene ALGÚN comentario, en cualquier fecha? */
async function fetchCommentsExist(clientId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('tiktok_comments')
    .select('comment_id', { count: 'exact', head: true })
    .eq('client_id', clientId);
  if (error) return false;
  return (count || 0) > 0;
}

function normSentiment(s: string | null): Sentiment {
  return s === 'positive' || s === 'negative' ? s : 'neutral';
}

function toItem(r: RawComment): TikTokCommentItem {
  return {
    commentId: (r.comment_id || '').trim(),
    adId: (r.ad_id || '').trim(),
    adName: r.ad_name || '(sin nombre)',
    adgroupName: r.adgroup_name || '',
    campaignName: r.campaign_name || '',
    author: r.author || 'Usuario de TikTok',
    authorAvatar: r.author_avatar || '',
    content: r.content || '',
    likes: Number(r.likes) || 0,
    replies: Number(r.replies) || 0,
    commentType: r.comment_type || '',
    commentStatus: r.comment_status || '',
    parentCommentId: (r.parent_comment_id || '').trim(),
    isPinned: Boolean(r.is_pinned),
    createdAt: r.created_at || null,
    sentiment: normSentiment(r.sentiment),
    sentimentScore: Number(r.sentiment_score) || 0,
  };
}

function summarize(items: TikTokCommentItem[]): TikTokCommentsSummary {
  const total = items.length;
  let positive = 0;
  let negative = 0;
  let totalLikes = 0;
  for (const it of items) {
    if (it.sentiment === 'positive') positive += 1;
    else if (it.sentiment === 'negative') negative += 1;
    totalLikes += it.likes;
  }
  const neutral = total - positive - negative;
  return {
    total,
    positive,
    neutral,
    negative,
    positivePct: total > 0 ? positive / total : 0,
    neutralPct: total > 0 ? neutral / total : 0,
    negativePct: total > 0 ? negative / total : 0,
    totalLikes,
  };
}

/** Lista de anuncios presentes en los comentarios (para el filtro), por volumen. */
function adsFromComments(items: TikTokCommentItem[]): TikTokCommentAd[] {
  const map = new Map<string, TikTokCommentAd>();
  for (const it of items) {
    const id = it.adId || it.adName;
    const entry = map.get(id);
    if (entry) entry.count += 1;
    else map.set(id, { adId: id, adName: it.adName, count: 1 });
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export function useTikTokComments(clientId: string, range: DateRange): UseTikTokCommentsResult {
  const [data, setData] = useState<TikTokCommentsData | null>(null);
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
        const rows = await fetchComments(clientId, range.from, range.to);
        if (cancelled) return;

        // Tabla aún no disponible → estado "esperando conexión" honesto.
        if (rows === null) {
          setData({
            comments: [],
            summary: summarize([]),
            ads: [],
            existsEver: false,
            from: range.from,
            to: range.to,
          });
          return;
        }

        const items = rows
          .map(toItem)
          .filter((it) => it.commentId)
          .sort((a, b) => {
            if (b.likes !== a.likes) return b.likes - a.likes;
            // a igualdad de likes, el más reciente primero
            return (b.createdAt || '').localeCompare(a.createdAt || '');
          });

        // Si no hubo comentarios en el rango, ¿existen en otra fecha?
        let existsEver = items.length > 0;
        if (!existsEver) {
          existsEver = await fetchCommentsExist(clientId);
          if (cancelled) return;
        }

        setData({
          comments: items,
          summary: summarize(items),
          ads: adsFromComments(items),
          existsEver,
          from: range.from,
          to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useTikTokComments]', e);
        setError(e?.message || 'Error desconocido al cargar los comentarios');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [clientId, range.from, range.to, tick]);

  return { data, loading, error, refresh: () => setTick((x) => x + 1) };
}
