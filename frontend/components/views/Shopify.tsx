'use client';

import { HeroHead } from '@/components/ui/BrandLogo';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import {
  useShopify,
  type ShopifyOrderRow,
  type ShopifyProductRow,
} from '@/lib/hooks/useShopify';
import { useGA4Funnel } from '@/lib/hooks/useGA4Funnel';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSortableTable, type SortAccessor } from '@/components/ui/useSortableTable';
import { formatCurrency, formatInt } from '@/lib/utils';

// ============================================================
// Shopify — ventas reales + salud del pago + embudo (CRO)
// ============================================================
// 100% dato real:
//   · shopify_orders          → ventas por día + desglose de estado de pago
//                               (paid / pending / refunded / voided, mig. 0012)
//   · shopify_abandoned_checkouts → carritos abandonados (conteo + valor)
//   · shopify_products        → top de productos del último período del ETL
//   · ga4_events              → embudo del sitio (sesión → producto → carrito
//                               → checkout → pago → compra)
// Todo respeta el filtro global de fechas salvo el top de productos (Shopify lo
// entrega agregado por ventana) — se avisa en la etiqueta y en la nota final.
// ============================================================

const GREEN = 'var(--up)'; // cobrado / paid
const AMBER = 'var(--warn)'; // pendiente / pending
const RED = 'var(--dn)'; // fuga / abandonado
const SHOP_GREEN = '#34d399'; // verde Shopify (barras neutras)

const PRODUCT_LIMIT = 30;

function fmtDay(iso: string): string {
  // 2026-06-16 → "16 jun" (sin depender de zona horaria)
  const [, m, d] = iso.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mi = Number(m) - 1;
  return `${Number(d)} ${meses[mi] ?? m}`;
}

interface FunnelStep {
  label: string;
  ev: string;
  val: number;
  stepPct: number | null; // % respecto al paso anterior
  leak: boolean;
}

export function Shopify() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useShopify(client.id, range);
  const { data: funnel } = useGA4Funnel(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const cur = client.currency;

  // Tabla diaria: más reciente primero (orden por defecto antes de ordenar).
  const dailyBase = data ? [...data.daily].reverse() : [];
  const productsBase = data ? data.products.slice(0, PRODUCT_LIMIT) : [];

  const dailyAccessors: SortAccessor<(typeof dailyBase)[number]>[] = [
    (r) => r.date, // Fecha
    (r) => r.orders, // Órdenes
    (r) => r.ordersPaid, // Pagadas
    (r) => r.ordersPending, // Pendientes
    (r) => r.revenue, // Ingresos
    null, // Ingresos (rel.) — barra
  ];
  const productAccessors: SortAccessor<(typeof productsBase)[number]>[] = [
    (r) => r.title, // Producto
    (r) => r.unitsSold, // Unidades
    (r) => r.orders, // Órdenes
    (r) => r.avgPrice, // Precio prom.
    (r) => r.revenue, // Ingresos
    null, // Ingresos (rel.) — barra
  ];
  const { rows: dailyRowsSorted, headerProps: dailyHeader } = useSortableTable(
    dailyBase,
    dailyAccessors,
  );
  const { rows: productsSorted, headerProps: productHeader } = useSortableTable(
    productsBase,
    productAccessors,
  );

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
            mostrará ingresos, estado de pago, carritos abandonados, el embudo y el top de productos,
            todo con datos reales.
          </>
        }
        hint="Si la sincronización ya corrió, prueba ampliar el rango de fechas con el filtro de arriba."
      />
    );
  }

  const t = data.totals;
  const ab = data.abandonedTotals;
  const daysWithSales = data.daily.length;
  const maxDailyRevenue = Math.max(1, ...data.daily.map((d) => d.revenue));
  const maxProductRevenue = Math.max(1, ...productsBase.map((p) => p.revenue));

  // ── Dinero: cobrado vs pendiente ─────────────────────────────
  const collected = t.revenueCollected;
  const pending = t.revenuePending;
  const moneyTotal = Math.max(1, collected + pending);
  const collectedPct = (collected / moneyTotal) * 100;
  const pendingPct = (pending / moneyTotal) * 100;

  // ── Embudo (GA4, a nivel de sitio) ───────────────────────────
  const F = (name: string, key: 'users' | 'count' = 'users') =>
    funnel?.byName.get(name)?.[key] ?? 0;
  const rawSteps: { label: string; ev: string; val: number }[] = [
    { label: 'Sesiones', ev: 'session_start', val: F('session_start', 'count') },
    { label: 'Vieron un producto', ev: 'view_item', val: F('view_item') },
    { label: 'Añadieron al carrito', ev: 'add_to_cart', val: F('add_to_cart') },
    { label: 'Iniciaron checkout', ev: 'begin_checkout', val: F('begin_checkout') },
    { label: 'Agregaron pago', ev: 'add_payment_info', val: F('add_payment_info') },
    { label: 'Compraron', ev: 'purchase', val: F('purchase') },
  ];
  const funnelReady = funnel != null && rawSteps[0].val > 0;
  const maxStep = Math.max(1, rawSteps[0].val);
  const steps: FunnelStep[] = rawSteps.map((s, i) => {
    const prev = i > 0 ? rawSteps[i - 1].val : null;
    const stepPct = prev && prev > 0 ? (s.val / prev) * 100 : null;
    const leak = i > 0 && stepPct !== null && stepPct < 20; // caída ≥ 80%
    return { ...s, stepPct, leak };
  });

  return (
    <div className="view on">
      <div className="hero">
        <HeroHead brand="shopify">Shopify · tienda</HeroHead>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {formatInt(t.orders)} órdenes ·{' '}
          {formatCurrency(t.revenue, cur)} facturados
        </div>
      </div>

      {/* KPIs reales — foco en salud del cobro */}
      <div className="kpis">
        <div className="kpi k-green">
          <div className="kpi-lbl">Ingresos cobrados</div>
          <div className="kpi-val">{formatCurrency(collected, cur)}</div>
          <div className="kpi-bot">
            <span className="dcmp">
              {t.ordersPaid} de {t.orders} órdenes pagadas
            </span>
          </div>
        </div>
        <div className="kpi k-amber">
          <div className="kpi-lbl">Pendiente por cobrar</div>
          <div className="kpi-val">{formatCurrency(pending, cur)}</div>
          <div className="kpi-bot">
            <span className="dcmp">{t.ordersPending} órdenes pending (OXXO/SPEI)</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Ticket promedio</div>
          <div className="kpi-val">{formatCurrency(t.avgOrderValue, cur)}</div>
          <div className="kpi-bot">
            <span className="dcmp">{formatInt(t.unitsSold)} unidades vendidas</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Carritos abandonados</div>
          <div className="kpi-val">{formatInt(ab.count)}</div>
          <div className="kpi-bot">
            <span className="dcmp">{formatCurrency(ab.value, cur)} sin cerrar</span>
          </div>
        </div>
      </div>

      {/* Dinero: cobrado vs pendiente */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: '15px' }}>Dinero: cobrado vs. pendiente</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 16 }}>
          De {formatCurrency(t.revenue, cur)} facturados, cuánto entró de verdad a caja y cuánto
          sigue en el aire (pagos pending: OXXO, SPEI o transferencia sin capturar).
        </div>
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: 34,
            borderRadius: 8,
            overflow: 'hidden',
            background: 'var(--bg3)',
          }}
        >
          <div
            style={{
              width: `${collectedPct}%`,
              background: GREEN,
              minWidth: collected > 0 ? 4 : 0,
            }}
          />
          <div
            style={{
              width: `${pendingPct}%`,
              background: AMBER,
              minWidth: pending > 0 ? 4 : 0,
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            marginTop: 14,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: 3,
                background: GREEN,
                marginRight: 7,
              }}
            />
            <b style={{ color: GREEN }}>{formatCurrency(collected, cur)}</b>
            <span style={{ color: 'var(--mu)', fontSize: 12, marginLeft: 6 }}>
              cobrado ({collectedPct.toFixed(0)}%)
            </span>
          </div>
          <div>
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: 3,
                background: AMBER,
                marginRight: 7,
              }}
            />
            <b style={{ color: AMBER }}>{formatCurrency(pending, cur)}</b>
            <span style={{ color: 'var(--mu)', fontSize: 12, marginLeft: 6 }}>
              pendiente ({pendingPct.toFixed(0)}%)
            </span>
          </div>
        </div>
        {pendingPct >= 30 && (
          <div
            style={{
              marginTop: 14,
              fontSize: 12.5,
              color: 'var(--t1)',
              background: 'rgba(251,191,36,0.10)',
              border: '1px solid rgba(251,191,36,0.3)',
              borderRadius: 10,
              padding: '10px 14px',
              lineHeight: 1.55,
            }}
          >
            ⚠️ El <b>{pendingPct.toFixed(0)}%</b> de lo facturado ({formatCurrency(pending, cur)})
            aún no entra a caja. Son pagos pending (OXXO/SPEI): si no se capturan en su ventana,
            caen. Vale la pena un recordatorio de pago o empujar métodos de captura inmediata.
          </div>
        )}
      </div>

      {/* Checkouts abandonados */}
      {ab.count > 0 && (
        <div className="card" style={{ marginTop: '20px' }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '15px' }}>Carritos abandonados</h3>
          <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 16 }}>
            Gente que llegó al checkout con producto y no terminó. Dato real de Shopify
            (<code>shopify_abandoned_checkouts</code>).
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 14,
            }}
          >
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: RED, lineHeight: 1 }}>
                {formatInt(ab.count)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 6 }}>
                carritos abandonados
              </div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: RED, lineHeight: 1 }}>
                {formatCurrency(ab.value, cur)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 6 }}>
                valor perdido en carritos
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: ab.recovered > 0 ? GREEN : 'var(--t1)',
                  lineHeight: 1,
                }}
              >
                {formatInt(ab.recovered)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 6 }}>recuperados</div>
            </div>
          </div>
          {ab.recovered === 0 && (
            <div
              style={{
                marginTop: 14,
                fontSize: 12.5,
                color: 'var(--t1)',
                background: 'rgba(248,113,113,0.10)',
                border: '1px solid rgba(248,113,113,0.3)',
                borderRadius: 10,
                padding: '10px 14px',
                lineHeight: 1.55,
              }}
            >
              🔴 <b>0 carritos recuperados.</b> No hay recuperación automática activa. Un correo o
              WhatsApp de carrito abandonado suele rescatar 5–15% — sobre {formatCurrency(ab.value, cur)}{' '}
              es dinero real sobre la mesa.
            </div>
          )}
        </div>
      )}

      {/* Embudo del sitio — GA4 */}
      {funnelReady && (
        <div className="card" style={{ marginTop: '20px' }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '15px' }}>El embudo: dónde se cae la gente</h3>
          <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 18 }}>
            Personas en cada paso (GA4, a nivel de sitio). En rojo, las caídas más fuertes.
          </div>
          {steps.map((s) => {
            const w = Math.max(3, (s.val / maxStep) * 100);
            const barCol = s.leak ? RED : SHOP_GREEN;
            return (
              <div
                key={s.ev}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '150px 1fr 190px',
                  alignItems: 'center',
                  gap: 14,
                  margin: '9px 0',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>
                  {s.label}
                  <br />
                  <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 500 }}>{s.ev}</span>
                </div>
                <div
                  style={{
                    position: 'relative',
                    background: 'var(--bg3)',
                    borderRadius: 8,
                    height: 30,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <div
                    style={{
                      width: `${w}%`,
                      height: 30,
                      borderRadius: 8,
                      background: barCol,
                      transition: 'width .4s ease',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      right: 10,
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: 'var(--t1)',
                    }}
                  >
                    {formatInt(s.val)}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, textAlign: 'right' }}>
                  {s.stepPct !== null && (
                    <span style={{ color: s.leak ? RED : 'var(--mu)', fontWeight: 600 }}>
                      {s.stepPct.toFixed(1)}% del paso anterior{s.leak ? ' ⚠️' : ''}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <div
            style={{
              marginTop: 14,
              fontSize: 12,
              color: 'var(--mu)',
              lineHeight: 1.55,
              borderTop: '1px solid var(--b2)',
              paddingTop: 12,
            }}
          >
            El paso <b>Compraron</b> viene de GA4. La venta real y cobrada la manda Shopify:{' '}
            <b style={{ color: GREEN }}>{t.ordersPaid} órdenes pagadas</b> en el período. El embudo
            es a nivel de sitio (GA4 no guarda estos eventos por producto en esta cuenta).
          </div>
        </div>
      )}

      {/* Ventas por día — datos reales, con estado de pago */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Ventas por día</h3>
        <table className="t">
          <thead>
            <tr>
              <th {...dailyHeader(0)}>Fecha</th>
              <th {...dailyHeader(1)}>Órdenes</th>
              <th {...dailyHeader(2)}>Pagadas</th>
              <th {...dailyHeader(3)}>Pend.</th>
              <th {...dailyHeader(4)}>Ingresos</th>
              <th {...dailyHeader(5)}>Ingresos (rel.)</th>
            </tr>
          </thead>
          <tbody>
            {dailyRowsSorted.map((d: ShopifyOrderRow) => {
              const share = d.revenue / maxDailyRevenue;
              return (
                <tr key={d.date}>
                  <td>
                    <b>{fmtDay(d.date)}</b>
                  </td>
                  <td>{formatInt(d.orders)}</td>
                  <td style={{ color: d.ordersPaid > 0 ? GREEN : 'var(--mu)' }}>
                    {formatInt(d.ordersPaid)}
                  </td>
                  <td style={{ color: d.ordersPending > 0 ? AMBER : 'var(--mu)' }}>
                    {formatInt(d.ordersPending)}
                  </td>
                  <td>{formatCurrency(d.revenue, cur)}</td>
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
              <th {...productHeader(0)}>Producto</th>
              <th {...productHeader(1)}>Unidades</th>
              <th {...productHeader(2)}>Órdenes</th>
              <th {...productHeader(3)}>Precio prom.</th>
              <th {...productHeader(4)}>Ingresos</th>
              <th {...productHeader(5)}>Ingresos (rel.)</th>
            </tr>
          </thead>
          <tbody>
            {productsSorted.map((p: ShopifyProductRow) => {
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
          Todo viene directo de la cuenta, sin estimaciones. Las ventas, el estado de pago
          (pagado/pendiente) y el ingreso pendiente salen del <b>Admin API de Shopify</b> (tablas{' '}
          <code>shopify_orders</code> y <code>shopify_abandoned_checkouts</code>) y{' '}
          <b>respetan el filtro de fechas</b> de arriba. El <b>embudo</b> usa eventos de{' '}
          <b>GA4</b> a nivel de sitio (no por producto en esta cuenta) y los conteos por paso son
          aproximados porque se suman por día. El <b>top de productos</b> refleja el último período
          que sincronizó el ETL (etiqueta), no el filtro. «Cobrado» = facturado − pendiente.
        </div>
      </div>
    </div>
  );
}
