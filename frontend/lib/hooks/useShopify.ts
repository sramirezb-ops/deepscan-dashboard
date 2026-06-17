'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DateRange } from '@/lib/period';

// ============================================================
// useShopify — ventas reales de la tienda (Shopify Admin API)
// ============================================================
// Lee shopify_orders (una fila por día, ya agregada por el ETL) respetando
// el filtro global de fechas, y shopify_products (top de productos del último
// período sincronizado por el ETL). Si no hay filas, no se inventa nada.
// ============================================================

export interface ShopifyOrderRow {
  date: string;
  orders: number;
  revenue: number;
  avgOrderValue: number;
  newCustomers: number;
  returningCustomers: number;
  unitsSold: number;
  refunds: number;
}

export interface ShopifyProductRow {
  productId: string;
  title: string;
  sku: string | null;
  revenue: number;
  unitsSold: number;
  orders: number;
  avgPrice: number;
}

export interface ShopifyTotals {
  revenue: number;
  orders: number;
  avgOrderValue: number; // revenue / orders
  unitsSold: number;
  newCustomers: number;
  returningCustomers: number;
  refunds: number;
}

export interface ShopifyData {
  daily: ShopifyOrderRow[]; // ordenadas por fecha asc
  products: ShopifyProductRow[]; // ordenadas por ingresos desc (último período)
  totals: ShopifyTotals;
  productPeriod: { start: string; end: string } | null;
  from: string;
  to: string;
}

export interface UseShopifyResult {
  data: ShopifyData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RawOrder {
  date: string | null;
  orders: number | null;
  revenue: number | null;
  avg_order_value: number | null;
  new_customers: number | null;
  returning_customers: number | null;
  units_sold: number | null;
  refunds: number | null;
}

interface RawProduct {
  period_start: string | null;
  period_end: string | null;
  product_id: string | null;
  title: string | null;
  sku: string | null;
  revenue: number | null;
  units_sold: number | null;
  orders: number | null;
  avg_price: number | null;
}

const ORDER_SELECT =
  'date, orders, revenue, avg_order_value, new_customers, returning_customers, units_sold, refunds';
const PRODUCT_SELECT =
  'period_start, period_end, product_id, title, sku, revenue, units_sold, orders, avg_price';
const PAGE = 1000;

async function fetchOrders(clientId: string, from: string, to: string): Promise<RawOrder[]> {
  const all: RawOrder[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('shopify_orders')
      .select(ORDER_SELECT)
      .eq('client_id', clientId)
      .gte('date', from)
      .lte('date', to)
      .range(offset, offset + PAGE - 1);

    if (error) throw error;
    const batch = (data || []) as RawOrder[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function fetchProducts(clientId: string): Promise<RawProduct[]> {
  const all: RawProduct[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('shopify_products')
      .select(PRODUCT_SELECT)
      .eq('client_id', clientId)
      .order('period_start', { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (error) throw error;
    const batch = (data || []) as RawProduct[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

function buildDaily(rows: RawOrder[]): ShopifyOrderRow[] {
  const list: ShopifyOrderRow[] = rows
    .filter((r) => r.date)
    .map((r) => ({
      date: r.date as string,
      orders: Number(r.orders) || 0,
      revenue: Number(r.revenue) || 0,
      avgOrderValue: Number(r.avg_order_value) || 0,
      newCustomers: Number(r.new_customers) || 0,
      returningCustomers: Number(r.returning_customers) || 0,
      unitsSold: Number(r.units_sold) || 0,
      refunds: Number(r.refunds) || 0,
    }));
  list.sort((a, b) => a.date.localeCompare(b.date));
  return list;
}

function sumTotals(daily: ShopifyOrderRow[]): ShopifyTotals {
  let revenue = 0,
    orders = 0,
    unitsSold = 0,
    newCustomers = 0,
    returningCustomers = 0,
    refunds = 0;
  for (const d of daily) {
    revenue += d.revenue;
    orders += d.orders;
    unitsSold += d.unitsSold;
    newCustomers += d.newCustomers;
    returningCustomers += d.returningCustomers;
    refunds += d.refunds;
  }
  return {
    revenue,
    orders,
    avgOrderValue: orders > 0 ? revenue / orders : 0,
    unitsSold,
    newCustomers,
    returningCustomers,
    refunds,
  };
}

/** Productos del período más reciente sincronizado por el ETL. */
function buildProducts(rows: RawProduct[]): {
  products: ShopifyProductRow[];
  period: { start: string; end: string } | null;
} {
  if (rows.length === 0) return { products: [], period: null };

  // Tomar solo el período (period_start) más reciente para no mezclar ventanas.
  const latestStart = rows
    .map((r) => r.period_start || '')
    .sort((a, b) => b.localeCompare(a))[0];

  const inPeriod = rows.filter((r) => (r.period_start || '') === latestStart);
  const period = {
    start: latestStart,
    end: inPeriod[0]?.period_end || latestStart,
  };

  const products: ShopifyProductRow[] = inPeriod
    .filter((r) => r.product_id)
    .map((r) => ({
      productId: r.product_id as string,
      title: r.title || '(sin nombre)',
      sku: r.sku,
      revenue: Number(r.revenue) || 0,
      unitsSold: Number(r.units_sold) || 0,
      orders: Number(r.orders) || 0,
      avgPrice: Number(r.avg_price) || 0,
    }));

  products.sort((a, b) => b.revenue - a.revenue || b.unitsSold - a.unitsSold);
  return { products, period };
}

export function useShopify(clientId: string, range: DateRange): UseShopifyResult {
  const [data, setData] = useState<ShopifyData | null>(null);
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
        const [orderRows, productRows] = await Promise.all([
          fetchOrders(clientId, range.from, range.to),
          fetchProducts(clientId),
        ]);
        if (cancelled) return;

        const daily = buildDaily(orderRows);
        const totals = sumTotals(daily);
        const { products, period } = buildProducts(productRows);

        setData({
          daily,
          products,
          totals,
          productPeriod: period,
          from: range.from,
          to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useShopify]', e);
        setError(e?.message || 'Error desconocido al cargar Shopify');
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
