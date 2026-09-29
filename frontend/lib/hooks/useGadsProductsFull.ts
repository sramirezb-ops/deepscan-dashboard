'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
// useGadsProductsFull — rendimiento COMPLETO por producto (PMax/Shopping)
// Fuente ÚNICA y consistente: gads_flowboost_products (export del script
// FlowBoost) — trae impresiones, clics, costo, conversiones, revenue, roas y la
// etiqueta del feed, TODO del mismo snapshot (sus totales coinciden con la
// campaña PMax). Solo el título del producto se cruza desde gads_products.
// Así el CTR (clics/impr) y el CPA/ROAS quedan internamente consistentes.
//   impresiones · clics · CTR · conversiones · costo · CPA · revenue · ROAS.
// ============================================================

const PAGE = 1000;
const n = (v: unknown) => Number(v || 0);

export interface GadsFullProduct {
  id: string; title: string; label: string;
  impressions: number; clicks: number; ctr: number;
  conversions: number; cost: number; cpa: number;
  revenue: number; roas: number;
}
export interface GadsProductsFullData {
  products: GadsFullProduct[];
  totals: { impressions: number; clicks: number; conversions: number; cost: number; revenue: number };
  hasData: boolean;
}

async function pageAll<T>(table: string, select: string, filter: (q: any) => any): Promise<T[]> {
  const all: T[] = [];
  let off = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await filter(supabase.from(table).select(select)).range(off, off + PAGE - 1);
    if (error) throw error;
    const b = (data || []) as T[];
    all.push(...b);
    if (b.length < PAGE) break;
    off += PAGE;
  }
  return all;
}

export function useGadsProductsFull(clientId: string) {
  const [data, setData] = useState<GadsProductsFullData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [fb, prods] = await Promise.all([
          pageAll<any>('gads_flowboost_products',
            'product_item_id, impressions, clicks, cost, conversions, conv_value, roas, label',
            (q) => q.eq('client_id', clientId)),
          pageAll<any>('gads_products', 'product_item_id, product_title',
            (q) => q.eq('client_id', clientId).eq('period', '30d')),
        ]);
        if (cancelled) return;

        // Título por product_item_id (desde gads_products).
        const titleMap = new Map<string, string>();
        for (const p of prods) if (p.product_item_id && p.product_title) titleMap.set(String(p.product_item_id), p.product_title);

        // Agregar por producto (todas las métricas desde FlowBoost).
        const m = new Map<string, { label: string; cost: number; conv: number; rev: number; impr: number; clicks: number }>();
        for (const r of fb) {
          const id = String(r.product_item_id || '');
          if (!id) continue;
          const a = m.get(id) || { label: String(r.label || ''), cost: 0, conv: 0, rev: 0, impr: 0, clicks: 0 };
          a.cost += n(r.cost); a.conv += n(r.conversions); a.rev += n(r.conv_value);
          a.impr += n(r.impressions); a.clicks += n(r.clicks);
          if (!a.label && r.label) a.label = String(r.label);
          m.set(id, a);
        }
        const products: GadsFullProduct[] = [...m.entries()].map(([id, a]) => ({
          id, title: titleMap.get(id) || id, label: a.label,
          impressions: a.impr, clicks: a.clicks, ctr: a.impr > 0 ? a.clicks / a.impr : 0,
          conversions: a.conv, cost: +a.cost.toFixed(2), cpa: a.conv > 0 ? a.cost / a.conv : 0,
          revenue: a.rev, roas: a.cost > 0 ? a.rev / a.cost : 0,
        })).sort((x, y) => y.cost - x.cost);

        const totals = products.reduce((t, p) => ({
          impressions: t.impressions + p.impressions, clicks: t.clicks + p.clicks,
          conversions: t.conversions + p.conversions, cost: t.cost + p.cost, revenue: t.revenue + p.revenue,
        }), { impressions: 0, clicks: 0, conversions: 0, cost: 0, revenue: 0 });

        if (!cancelled) { setData({ products, totals, hasData: products.length > 0 }); setLoading(false); }
      } catch (e: any) {
        if (!cancelled) { setError(e?.message || 'error'); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  return { data, loading, error };
}
