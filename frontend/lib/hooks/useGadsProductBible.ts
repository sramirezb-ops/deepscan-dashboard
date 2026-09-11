'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
// useGadsProductBible — la "biblia" de PMax para escalar presupuesto.
// Cruza gads_products (nombre + costo/conv/ROAS/impr, MXN) con
// gads_flowboost_products (clics + índice) por product_item_id (join 100%),
// gads_pmax_channels (costo ABSOLUTO por red) y gads_search_categories
// (hacia dónde apunta). Todo en período 30d (snapshot de los scripts).
// ============================================================

const PAGE = 1000;
const n = (v: unknown) => Number(v || 0);
export const INDEX_TIERS = ['over-index', 'index', 'near-index', 'under-index', 'no-index'] as const;
const ACTIVE = new Set(['over-index', 'index', 'near-index']);

export interface BibleProduct {
  id: string; title: string; tier: string;
  impressions: number; clicks: number; conversions: number; cost: number; roas: number;
}
export interface BibleTier {
  tier: string; count: number; cost: number; conversions: number; impressions: number;
  convShare: number; products: BibleProduct[];
}
export interface BibleChannel { channel: string; cost: number; costPct: number; roas: number }
export interface BibleSearchCat {
  label: string; clicks: number; impressions: number; conversions: number; cvr: number;
}
export interface GadsBibleData {
  totals: {
    cost: number; revenue: number; roas: number; conversions: number;
    activeProducts: number; deadProducts: number; totalProducts: number;
  };
  channels: BibleChannel[];
  tiers: BibleTier[];
  searchCats: BibleSearchCat[];
  searchCatsExist: boolean;
  freshness: string | null;
  hasData: boolean;
}
export interface UseGadsBibleResult { data: GadsBibleData | null; loading: boolean; error: string | null }

interface ProdRaw {
  product_item_id: string | null; product_title: string | null; custom_label_1: string | null;
  cost: number | null; conversions: number | null; conv_value: number | null;
  impressions: number | null; roas: number | null; inserted_at: string | null;
}

async function pageAll<T>(table: string, select: string, filters: (q: any) => any): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase.from(table).select(select).range(offset, offset + PAGE - 1);
    q = filters(q);
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data || []) as T[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

const PER_TIER = 40; // top productos por tier para el drill (los demás se resumen)

export function useGadsProductBible(clientId: string): UseGadsBibleResult {
  const [data, setData] = useState<GadsBibleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [prods, fb, chans, cats] = await Promise.all([
          pageAll<ProdRaw>('gads_products',
            'product_item_id, product_title, custom_label_1, cost, conversions, conv_value, impressions, roas, inserted_at',
            (q) => q.eq('client_id', clientId).eq('period', '30d')),
          pageAll<{ product_item_id: string | null; clicks: number | null }>('gads_flowboost_products',
            'product_item_id, clicks', (q) => q.eq('client_id', clientId)),
          pageAll<{ channel: string | null; cost: number | null; conv_value: number | null }>('gads_pmax_channels',
            'channel, cost, conv_value', (q) => q.eq('client_id', clientId)),
          pageAll<{ category_label: string | null; clicks: number | null; impressions: number | null; conversions: number | null; conv_value: number | null }>('gads_search_categories',
            'category_label, clicks, impressions, conversions, conv_value', (q) => q.eq('client_id', clientId)),
        ]);
        if (cancelled) return;

        const clickMap = new Map<string, number>();
        for (const f of fb) if (f.product_item_id) clickMap.set(String(f.product_item_id), n(f.clicks));

        // Productos → BibleProduct (tier = custom_label_1 si es un índice)
        const products: BibleProduct[] = prods.map((r) => {
          const tier = (r.custom_label_1 || '').toLowerCase();
          return {
            id: String(r.product_item_id || ''),
            title: r.product_title || '(sin nombre)',
            tier: (INDEX_TIERS as readonly string[]).includes(tier) ? tier : 'otros',
            impressions: n(r.impressions), clicks: clickMap.get(String(r.product_item_id)) || 0,
            conversions: n(r.conversions), cost: n(r.cost), roas: n(r.roas),
          };
        });

        const totalConv = products.reduce((s, p) => s + p.conversions, 0) || 1;
        const tiers: BibleTier[] = INDEX_TIERS.map((tier) => {
          const list = products.filter((p) => p.tier === tier).sort((a, b) => b.cost - a.cost);
          const cost = list.reduce((s, p) => s + p.cost, 0);
          const conversions = list.reduce((s, p) => s + p.conversions, 0);
          const impressions = list.reduce((s, p) => s + p.impressions, 0);
          return {
            tier, count: list.length, cost, conversions, impressions,
            convShare: conversions / totalConv, products: list.slice(0, PER_TIER),
          };
        }).filter((t) => t.count > 0);

        const activeProducts = products.filter((p) => ACTIVE.has(p.tier)).length;
        const deadProducts = products.filter((p) => p.tier === 'no-index' || p.tier === 'under-index').length;
        const revenue = prods.reduce((s, r) => s + n(r.conv_value), 0);
        const cost = products.reduce((s, p) => s + p.cost, 0);
        const conversions = products.reduce((s, p) => s + p.conversions, 0);

        // Redes: costo absoluto por canal
        const chMap = new Map<string, { cost: number; cv: number }>();
        for (const c of chans) {
          const k = c.channel || '(sin red)';
          const a = chMap.get(k) || { cost: 0, cv: 0 };
          a.cost += n(c.cost); a.cv += n(c.conv_value); chMap.set(k, a);
        }
        const chTotal = Array.from(chMap.values()).reduce((s, a) => s + a.cost, 0) || 1;
        const channels: BibleChannel[] = Array.from(chMap.entries())
          .map(([channel, a]) => ({ channel, cost: a.cost, costPct: a.cost / chTotal, roas: a.cost > 0 ? a.cv / a.cost : 0 }))
          .sort((a, b) => b.cost - a.cost);

        // Categorías de búsqueda (hacia dónde apunta)
        const searchCats: BibleSearchCat[] = cats
          .map((c) => ({
            label: (c.category_label || '').trim() || '(genérica · sin marca)',
            clicks: n(c.clicks), impressions: n(c.impressions), conversions: n(c.conversions),
            cvr: n(c.clicks) > 0 ? n(c.conversions) / n(c.clicks) : 0,
          }))
          .sort((a, b) => b.conversions - a.conversions)
          .slice(0, 12);

        const freshness = prods.reduce<string | null>((mx, r) => {
          const t = r.inserted_at || '';
          return t > (mx || '') ? t : mx;
        }, null);

        setData({
          totals: {
            cost, revenue, roas: cost > 0 ? revenue / cost : 0, conversions,
            activeProducts, deadProducts, totalProducts: products.length,
          },
          channels, tiers, searchCats,
          searchCatsExist: cats.length > 0,
          freshness, hasData: products.length > 0,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useGadsProductBible]', e);
        setError(e?.message || 'Error cargando la biblia de productos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [clientId]);

  return { data, loading, error };
}
