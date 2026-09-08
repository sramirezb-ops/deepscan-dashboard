'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Sentiment } from '@/lib/hooks/useTikTokComments';

// ============================================================
// useTikTokAdEngagement — reacción social por anuncio (ALL-TIME)
// ============================================================
// A propósito NO se filtra por fecha (el usuario quiere "todos"): agrega, por
// ad_id, los likes/comments/shares del video (tiktok_campaigns, suma sobre todas
// las fechas) y los comentarios reales con su sentimiento y texto
// (tiktok_comments). Alimenta el preview de "qué se comenta en cada asset" de la
// vista de campañas. Resiliente: si las columnas/tablas aún no existen, entrega
// mapas vacíos y la UI simplemente no muestra el engagement.
// ============================================================

const PAGE = 1000;

export interface AdComment {
  content: string;
  author: string;
  likes: number;
  sentiment: Sentiment;
}
export interface AdEngagement {
  likes: number;      // corazones del video (all-time)
  comments: number;   // comentarios reportados por TikTok (all-time)
  shares: number;     // compartidos (all-time)
  commentRows: number; // comentarios con texto que tenemos (tiktok_comments)
  positive: number;
  negative: number;
  neutral: number;
  top: AdComment[];   // top comentarios por likes (para el popover)
}

export interface TikTokAdEngagementData {
  byAd: Map<string, AdEngagement>;
  existsEver: boolean;
}

const emptyEng = (): AdEngagement => ({ likes: 0, comments: 0, shares: 0, commentRows: 0, positive: 0, negative: 0, neutral: 0, top: [] });

async function fetchAll(table: string, select: string, clientId: string): Promise<any[] | null> {
  const all: any[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq('client_id', clientId)
      .range(offset, offset + PAGE - 1);
    if (error) return null; // tabla/columna aún no disponible → sin engagement
    const batch = data || [];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

export function useTikTokAdEngagement(clientId: string) {
  const [data, setData] = useState<TikTokAdEngagementData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const [adRows, commentRows] = await Promise.all([
          fetchAll('tiktok_campaigns', 'ad_id, likes, comments, shares', clientId),
          fetchAll('tiktok_comments', 'ad_id, content, author, likes, sentiment', clientId),
        ]);
        if (cancelled) return;

        const byAd = new Map<string, AdEngagement>();
        const get = (id: string) => {
          let e = byAd.get(id);
          if (!e) { e = emptyEng(); byAd.set(id, e); }
          return e;
        };

        // Engagement del video (suma all-time por ad).
        if (adRows) {
          for (const r of adRows) {
            const id = (r.ad_id || '').trim();
            if (!id) continue;
            const e = get(id);
            e.likes += Number(r.likes) || 0;
            e.comments += Number(r.comments) || 0;
            e.shares += Number(r.shares) || 0;
          }
        }
        // Comentarios reales con texto y sentimiento.
        if (commentRows) {
          for (const r of commentRows) {
            const id = (r.ad_id || '').trim();
            if (!id) continue;
            const e = get(id);
            e.commentRows += 1;
            const s = (r.sentiment as Sentiment) || 'neutral';
            if (s === 'positive') e.positive += 1;
            else if (s === 'negative') e.negative += 1;
            else e.neutral += 1;
            e.top.push({ content: r.content || '', author: r.author || 'Usuario', likes: Number(r.likes) || 0, sentiment: s });
          }
          for (const e of byAd.values()) {
            e.top.sort((a, b) => b.likes - a.likes);
            e.top = e.top.slice(0, 12);
          }
        }

        setData({ byAd, existsEver: (adRows?.length ?? 0) > 0 || (commentRows?.length ?? 0) > 0 });
      } catch {
        if (!cancelled) setData({ byAd: new Map(), existsEver: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [clientId]);

  return { data, loading };
}
