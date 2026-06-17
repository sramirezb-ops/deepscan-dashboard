'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
// useGadsProducts — rendimiento producto a producto de Google Ads
// ============================================================
// Lee dos tablas que son FOTOS por período (campo `period` = '30d' | '180d'),
// NO series diarias. Por eso NO se aplica el filtro global de fechas.
//   · gads_products → cada producto con cost/conv/revenue/impr/roas.
//   · gads_zombies  → productos con impresiones pero 0 clics (gasto de
//                     visibilidad sin retorno = candidatos a excluir del feed).
// Todo sale de datos reales; nada se inventa.
// ============================================================

export interface GadsProductRow {
  itemId: string;
  title: string;
  cost: number;
  conversions: number;
  revenue: number; // conv_value
  impressions: number;
  roas: number; // revenue / cost
}

export interface GadsZombieRow {
  itemId: string;
  title: string;
  impressions: number;
}

export interface GadsProductsData {
  topProducts: GadsProductRow[]; // ordenados por revenue desc
  zombies: GadsZombieRow[]; // ordenados por impresiones desc
  productCount: number; // nº de productos con actividad
  zombieCount: number; // nº de productos zombie
  totalRevenue: number;
  totalCost: number;
  wastedImpressions: number; // suma de impresiones de zombies
  period: string; // '30d'
}

export interface UseGadsProductsResult {
  data: GadsProductsData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RawProduct {
  product_item_id: string | null;
  product_title: string | null;
  cost: number | null;
  conversions: number | null;
  conv_value: number | null;
  impressions: number | null;
}

interface RawZombie {
  product_item_id: string | null;
  product_title: string | null;
  impressions: number | null;
}

const PRODUCT_SELECT = 'product_item_id, product_title, cost, conversions, conv_value, impressions';
const ZOMBIE_SELECT = 'product_item_id, product_title, impressions';

/** Agrega filas de gads_products por product_item_id (un producto puede salir en varias campañas). */
function aggregateProducts(rows: RawProduct[]): GadsProductRow[] {
  const map = new Map<string, GadsProductRow>();
  for (const r of rows) {
    const itemId = r.product_item_id || '(sin id)';
    let p = map.get(itemId);
    if (!p) {
      p = {
        itemId,
        title: r.product_title || '(sin título)',
        cost: 0,
        conversions: 0,
        revenue: 0,
        impressions: 0,
        roas: 0,
      };
      map.set(itemId, p);
    }
    if (p.title === '(sin título)' && r.product_title) p.title = r.product_title;
    p.cost += Number(r.cost) || 0;
    p.conversions += Number(r.conversions) || 0;
    p.revenue += Number(r.conv_value) || 0;
    p.impressions += Number(r.impressions) || 0;
  }
  const list = Array.from(map.values());
  for (const p of list) p.roas = p.cost > 0 ? p.revenue / p.cost : 0;
  list.sort((a, b) => b.revenue - a.revenue);
  return list;
}

export function useGadsProducts(
  clientId: string,
  period: string = '30d'
): UseGadsProductsResult {
  const [data, setData] = useState<GadsProductsData | null>(null);
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
        const [prodRes, zombieRes] = await Promise.all([
          supabase
            .from('gads_products')
            .select(PRODUCT_SELECT)
            .eq('client_id', clientId)
            .eq('period', period),
          supabase
            .from('gads_zombies')
            .select(ZOMBIE_SELECT)
            .eq('client_id', clientId)
            .order('impressions', { ascending: false }),
        ]);
        if (cancelled) return;
        if (prodRes.error) throw prodRes.error;
        if (zombieRes.error) throw zombieRes.error;

        const topProducts = aggregateProducts((prodRes.data || []) as RawProduct[]);
        const zombies: GadsZombieRow[] = ((zombieRes.data || []) as RawZombie[]).map((z) => ({
          itemId: z.product_item_id || '(sin id)',
          title: z.product_title || '(sin título)',
          impressions: Number(z.impressions) || 0,
        }));

        setData({
          topProducts,
          zombies,
          productCount: topProducts.length,
          zombieCount: zombies.length,
          totalRevenue: topProducts.reduce((s, p) => s + p.revenue, 0),
          totalCost: topProducts.reduce((s, p) => s + p.cost, 0),
          wastedImpressions: zombies.reduce((s, z) => s + z.impressions, 0),
          period,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useGadsProducts]', e);
        setError(e?.message || 'Error desconocido al cargar productos de Google Ads');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [clientId, period, tick]);

  return { data, loading, error, refresh: () => setTick((x) => x + 1) };
}
