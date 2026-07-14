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
  // Migración 0012 — desglose por financial_status de Shopify
  ordersPaid: number; // pagos finalizados (paid)
  ordersPending: number; // pendientes de captura (OXXO/SPEI/transferencia)
  ordersAuthorized: number; // authorized / partially_paid
  ordersRefunded: number; // refunded / partially_refunded
  ordersVoided: number; // cancelados
  revenuePending: number; // total en el aire de los pedidos pending
}

/** Checkouts abandonados por día (shopify_abandoned_checkouts). */
export interface ShopifyAbandonedRow {
  date: string;
  abandonedCount: number;
  abandonedValue: number;
  recoveredCount: number;
  currency: string | null;
}

export interface ShopifyAbandonedTotals {
  count: number;
  value: number;
  recovered: number;
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
  // Desglose por estado de pago (migración 0012)
  ordersPaid: number;
  ordersPending: number;
  ordersAuthorized: number;
  ordersRefunded: number;
  ordersVoided: number;
  revenuePending: number;
  revenueCollected: number; // revenue - revenuePending (dinero realmente cobrado, aprox.)
}

export interface ShopifyData {
  daily: ShopifyOrderRow[]; // ordenadas por fecha asc
  products: ShopifyProductRow[]; // ordenadas por ingresos desc (último período)
  totals: ShopifyTotals;
  abandoned: ShopifyAbandonedRow[]; // ordenadas por fecha asc
  abandonedTotals: ShopifyAbandonedTotals;
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
  orders_paid: number | null;
  orders_pending: number | null;
  orders_authorized: number | null;
  orders_refunded: number | null;
  orders_voided: number | null;
  revenue_pending: number | null;
}

interface RawAbandoned {
  date: string | null;
  abandoned_count: number | null;
  abandoned_value: number | null;
  recovered_count: number | null;
  currency: string | null;
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
  'date, orders, revenue, avg_order_value, new_customers, returning_customers, units_sold, refunds, ' +
  'orders_paid, orders_pending, orders_authorized, orders_refunded, orders_voided, revenue_pending';
const PRODUCT_SELECT =
  'period_start, period_end, product_id, title, sku, revenue, units_sold, orders, avg_price';
const ABANDONED_SELECT = 'date, abandoned_count, abandoned_value, recovered_count, currency';
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
    const batch = (data || []) as unknown as RawOrder[];
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

async function fetchAbandoned(
  clientId: string,
  from: string,
  to: string
): Promise<RawAbandoned[]> {
  const all: RawAbandoned[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('shopify_abandoned_checkouts')
      .select(ABANDONED_SELECT)
      .eq('client_id', clientId)
      .gte('date', from)
      .lte('date', to)
      .range(offset, offset + PAGE - 1);

    if (error) throw error;
    const batch = (data || []) as RawAbandoned[];
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
      ordersPaid: Number(r.orders_paid) || 0,
      ordersPending: Number(r.orders_pending) || 0,
      ordersAuthorized: Number(r.orders_authorized) || 0,
      ordersRefunded: Number(r.orders_refunded) || 0,
      ordersVoided: Number(r.orders_voided) || 0,
      revenuePending: Number(r.revenue_pending) || 0,
    }));
  list.sort((a, b) => a.date.localeCompare(b.date));
  return list;
}

function buildAbandoned(rows: RawAbandoned[]): ShopifyAbandonedRow[] {
  const list: ShopifyAbandonedRow[] = rows
    .filter((r) => r.date)
    .map((r) => ({
      date: r.date as string,
      abandonedCount: Number(r.abandoned_count) || 0,
      abandonedValue: Number(r.abandoned_value) || 0,
      recoveredCount: Number(r.recovered_count) || 0,
      currency: r.currency,
    }));
  list.sort((a, b) => a.date.localeCompare(b.date));
  return list;
}

function sumAbandoned(rows: ShopifyAbandonedRow[]): ShopifyAbandonedTotals {
  let count = 0,
    value = 0,
    recovered = 0;
  for (const r of rows) {
    count += r.abandonedCount;
    value += r.abandonedValue;
    recovered += r.recoveredCount;
  }
  return { count, value, recovered };
}

function sumTotals(daily: ShopifyOrderRow[]): ShopifyTotals {
  let revenue = 0,
    orders = 0,
    unitsSold = 0,
    newCustomers = 0,
    returningCustomers = 0,
    refunds = 0,
    ordersPaid = 0,
    ordersPending = 0,
    ordersAuthorized = 0,
    ordersRefunded = 0,
    ordersVoided = 0,
    revenuePending = 0;
  for (const d of daily) {
    revenue += d.revenue;
    orders += d.orders;
    unitsSold += d.unitsSold;
    newCustomers += d.newCustomers;
    returningCustomers += d.returningCustomers;
    refunds += d.refunds;
    ordersPaid += d.ordersPaid;
    ordersPending += d.ordersPending;
    ordersAuthorized += d.ordersAuthorized;
    ordersRefunded += d.ordersRefunded;
    ordersVoided += d.ordersVoided;
    revenuePending += d.revenuePending;
  }
  return {
    revenue,
    orders,
    avgOrderValue: orders > 0 ? revenue / orders : 0,
    unitsSold,
    newCustomers,
    returningCustomers,
    refunds,
    ordersPaid,
    ordersPending,
    ordersAuthorized,
    ordersRefunded,
    ordersVoided,
    revenuePending,
    revenueCollected: Math.max(revenue - revenuePending, 0),
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
        const [orderRows, productRows, abandonedRows] = await Promise.all([
          fetchOrders(clientId, range.from, range.to),
          fetchProducts(clientId),
          fetchAbandoned(clientId, range.from, range.to),
        ]);
        if (cancelled) return;

        const daily = buildDaily(orderRows);
        const totals = sumTotals(daily);
        const { products, period } = buildProducts(productRows);
        const abandoned = buildAbandoned(abandonedRows);
        const abandonedTotals = sumAbandoned(abandoned);

        setData({
          daily,
          products,
          totals,
          abandoned,
          abandonedTotals,
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
