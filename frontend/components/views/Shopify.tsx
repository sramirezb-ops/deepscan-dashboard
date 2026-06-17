'use client';

import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import {
  useShopify,
  type ShopifyOrderRow,
  type ShopifyProductRow,
} from '@/lib/hooks/useShopify';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatInt } from '@/lib/utils';

// ============================================================
// Shopify — ventas reales de la tienda
// ============================================================
// Datos reales de shopify_orders (ventas por día, respetando el filtro de
// fechas) y shopify_products (top de productos del último período sincronizado
// por el ETL). Mientras el ETL no escriba filas, muestra un estado honesto.
// ============================================================

const SHOP_GREEN = '#96bf48'; // verde Shopify

const PRODUCT_LIMIT = 30;

function fmtDay(iso: string): string {
  // 2026-06-16 → "16 jun" (sin depender de zona horaria)
  const [, m, d] = iso.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mi = Number(m) - 1;
  return `${Number(d)} ${meses[mi] ?? m}`;
}

export function Shopify() {
  const client = useClient();
  const { range } = usePeriod();
  const { data, loading, error } = useShopify(client.id, range);

  const rangeLabel = formatRangeLabel(range);
  const cur = client.currency;

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Cargando ventas de {client.name}…
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view on">
        <div
          className="card"
          style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}
        >
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>
            Error cargando Shopify
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || data.totals.orders === 0) {
    return (
      <EmptyState
        icon="🛍️"
        title="Esperando las ventas de Shopify"
        message={
          <>
            Aún no hay órdenes registradas para {client.name} entre <b>{rangeLabel}</b>. En cuanto la
            sincronización escriba las ventas en la tabla <code>shopify_orders</code>, esta vista
            mostrará ingresos, órdenes, ticket promedio, unidades y el top de productos vendidos, todo
            con datos reales.
          </>
        }
        hint="Si la sincronización ya corrió, prueba ampliar el rango de fechas con el filtro de arriba."
      />
    );
  }

  const t = data.totals;
  const daysWithSales = data.daily.length;
  // Tabla diaria: más reciente primero.
  const dailyRows = [...data.daily].reverse();
  const maxDailyRevenue = Math.max(1, ...data.daily.map((d) => d.revenue));
  const products = data.products.slice(0, PRODUCT_LIMIT);
  const maxProductRevenue = Math.max(1, ...products.map((p) => p.revenue));

  return (
    <div className="view on">
      <div className="hero">
        <div className="hero-title">Shopify · tienda</div>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {formatInt(t.orders)} órdenes ·{' '}
          {formatCurrency(t.revenue, cur)} en ventas
        </div>
      </div>

      {/* KPIs reales */}
      <div className="kpis">
        <div className="kpi k-green">
          <div className="kpi-lbl">Ingresos</div>
          <div className="kpi-val">{formatCurrency(t.revenue, cur)}</div>
          <div className="kpi-bot">
            <span className="dcmp">{formatInt(daysWithSales)} días con ventas</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Órdenes</div>
          <div className="kpi-val">{formatInt(t.orders)}</div>
          <div className="kpi-bot">
            <span className="dcmp">{formatInt(t.unitsSold)} unidades vendidas</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Ticket promedio</div>
          <div className="kpi-val">{formatCurrency(t.avgOrderValue, cur)}</div>
          <div className="kpi-bot">
            <span className="dcmp">ingresos / órdenes</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Clientes nuevos</div>
          <div className="kpi-val">{formatInt(t.newCustomers)}</div>
          <div className="kpi-bot">
            <span className="dcmp">{formatInt(t.returningCustomers)} recurrentes</span>
          </div>
        </div>
      </div>

      {/* Ventas por día — datos reales */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Ventas por día</h3>
        <table className="t">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Órdenes</th>
              <th>Ingresos</th>
              <th>Ticket prom.</th>
              <th>Unidades</th>
              <th>Ingresos (rel.)</th>
            </tr>
          </thead>
          <tbody>
            {dailyRows.map((d: ShopifyOrderRow) => {
              const share = d.revenue / maxDailyRevenue;
              return (
                <tr key={d.date}>
                  <td>
                    <b>{fmtDay(d.date)}</b>
                  </td>
                  <td>{formatInt(d.orders)}</td>
                  <td>{formatCurrency(d.revenue, cur)}</td>
                  <td>{d.orders > 0 ? formatCurrency(d.avgOrderValue, cur) : '—'}</td>
                  <td>{formatInt(d.unitsSold)}</td>
                  <td>
                    <span className="hb">
                      <span
                        className="hb-fill"
                        style={{
                          width: `${Math.max(2, Math.round(share * 100))}%`,
                          background: SHOP_GREEN,
                        }}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Top de productos — datos reales */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <h3 style={{ margin: '0', fontSize: '15px' }}>Top de productos vendidos</h3>
          {data.productPeriod && (
            <span className="period-pill">
              período sincronizado {fmtDay(data.productPeriod.start)} – {fmtDay(data.productPeriod.end)}
            </span>
          )}
        </div>
        <table className="t">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Unidades</th>
              <th>Órdenes</th>
              <th>Precio prom.</th>
              <th>Ingresos</th>
              <th>Ingresos (rel.)</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p: ShopifyProductRow) => {
              const share = p.revenue / maxProductRevenue;
              return (
                <tr key={p.productId}>
                  <td>
                    <b>{p.title}</b>
                    {p.sku && (
                      <span style={{ color: 'var(--mu)', fontSize: 11, marginLeft: 6 }}>
                        {p.sku}
                      </span>
                    )}
                  </td>
                  <td>{formatInt(p.unitsSold)}</td>
                  <td>{formatInt(p.orders)}</td>
                  <td>{p.unitsSold > 0 ? formatCurrency(p.avgPrice, cur) : '—'}</td>
                  <td>{formatCurrency(p.revenue, cur)}</td>
                  <td>
                    <span className="hb">
                      <span
                        className="hb-fill"
                        style={{
                          width: `${Math.max(2, Math.round(share * 100))}%`,
                          background: SHOP_GREEN,
                        }}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Aviso honesto sobre el origen */}
      <div
        className="card"
        style={{ marginTop: '20px', borderStyle: 'dashed', borderColor: 'var(--b2)' }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Sobre estos datos</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Vienen directo del <b>Admin API de Shopify</b> (tabla <code>shopify_orders</code>). Los KPIs
          y las ventas por día <b>respetan el filtro de fechas</b> de arriba. El{' '}
          <b>top de productos</b> refleja el último período que sincronizó el ETL (mostrado en la
          etiqueta), no el filtro de fechas, porque Shopify lo entrega agregado por ventana. Los
          ingresos son el <code>total_price</code> real de cada orden.
        </div>
      </div>
    </div>
  );
}
