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
// Shopify — auditoría CRO robusta (100% dato real, dinámica)
// ============================================================
// Fuentes:
//   · shopify_orders          → ventas por día + estado de pago (mig. 0012)
//   · shopify_abandoned_checkouts → carritos abandonados
//   · shopify_products        → top de productos (último período del ETL)
//   · ga4_events              → embudo del sitio + sesiones por día
// Secciones: veredicto, situación, KPIs, diagnóstico vs industria, embudo,
// dinero cobrado/pendiente, carritos abandonados, plan de prioridades,
// tendencia de conversión, ventas por día, top de productos, nota honesta.
// Todo respeta el filtro de fechas salvo el top de productos (Shopify lo
// entrega por ventana). Nada se inventa: cada sección se oculta si no hay dato.
// ============================================================

const GREEN = 'var(--up)'; // cobrado / paid / sano
const AMBER = 'var(--warn)'; // pendiente / atención
const RED = 'var(--dn)'; // fuga / crítico
const SHOP_GREEN = '#34d399'; // verde Shopify (barras neutras)

const PRODUCT_LIMIT = 30;

function fmtDay(iso: string): string {
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

type Zone = 'crit' | 'warn' | 'ok';
const ZONE_COLOR: Record<Zone, string> = { crit: RED, warn: AMBER, ok: GREEN };
const ZONE_WORD: Record<Zone, string> = { crit: 'Crítico', warn: 'Atención', ok: 'Sano' };

/** Clasifica un valor: ok si >= okAt, warn si >= warnAt, si no crítico. */
function classify(value: number, warnAt: number, okAt: number): Zone {
  if (value >= okAt) return 'ok';
  if (value >= warnAt) return 'warn';
  return 'crit';
}

interface Bench {
  label: string;
  valueTxt: string;
  zone: Zone;
  actual: number; // posición real en la escala
  scaleMax: number;
  zoneLo: number; // inicio de la banda "meta"
  zoneHi: number;
  metaTxt: string;
}

interface Priority {
  title: string;
  why: string;
  how: string;
  impact: string;
  unit: string;
  effort: string;
}

export function Shopify() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useShopify(client.id, range);
  const { data: funnel } = useGA4Funnel(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const cur = client.currency;

  const dailyBase = data ? [...data.daily].reverse() : [];
  const productsBase = data ? data.products.slice(0, PRODUCT_LIMIT) : [];

  const dailyAccessors: SortAccessor<(typeof dailyBase)[number]>[] = [
    (r) => r.date,
    (r) => r.orders,
    (r) => r.ordersPaid,
    (r) => r.ordersPending,
    (r) => r.revenue,
    null,
  ];
  const productAccessors: SortAccessor<(typeof productsBase)[number]>[] = [
    (r) => r.title,
    (r) => r.unitsSold,
    (r) => r.orders,
    (r) => r.avgPrice,
    (r) => r.revenue,
    null,
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
            mostrará el veredicto, ingresos, estado de pago, carritos abandonados, el embudo y el top
            de productos, todo con datos reales.
          </>
        }
        hint="Si la sincronización ya corrió, prueba ampliar el rango de fechas con el filtro de arriba."
      />
    );
  }

  const t = data.totals;
  const ab = data.abandonedTotals;
  const maxDailyRevenue = Math.max(1, ...data.daily.map((d) => d.revenue));
  const maxProductRevenue = Math.max(1, ...productsBase.map((p) => p.revenue));

  // ── Dinero: cobrado vs pendiente ─────────────────────────────
  const collected = t.revenueCollected;
  const pending = t.revenuePending;
  const moneyTotal = Math.max(1, collected + pending);
  const collectedPct = (collected / moneyTotal) * 100;
  const pendingPct = (pending / moneyTotal) * 100;
  const paidMoneyPct = t.revenue > 0 ? (collected / t.revenue) * 100 : 0;

  // ── Embudo (GA4, a nivel de sitio) ───────────────────────────
  const F = (name: string, key: 'users' | 'count' = 'users') =>
    funnel?.byName.get(name)?.[key] ?? 0;
  const sessions = F('session_start', 'count');
  const viewItem = F('view_item');
  const addToCart = F('add_to_cart');
  const beginCheckout = F('begin_checkout');
  const addPayment = F('add_payment_info');
  const purchase = F('purchase');
  const funnelReady = funnel != null && sessions > 0;

  const rawSteps: { label: string; ev: string; val: number }[] = [
    { label: 'Sesiones', ev: 'session_start', val: sessions },
    { label: 'Vieron un producto', ev: 'view_item', val: viewItem },
    { label: 'Añadieron al carrito', ev: 'add_to_cart', val: addToCart },
    { label: 'Iniciaron checkout', ev: 'begin_checkout', val: beginCheckout },
    { label: 'Agregaron pago', ev: 'add_payment_info', val: addPayment },
    { label: 'Compraron', ev: 'purchase', val: purchase },
    { label: 'Pagaron de verdad', ev: 'shopify · paid', val: t.ordersPaid },
  ];
  const maxStep = Math.max(1, sessions);
  const steps: FunnelStep[] = rawSteps.map((s, i) => {
    const prev = i > 0 ? rawSteps[i - 1].val : null;
    const stepPct = prev && prev > 0 ? (s.val / prev) * 100 : null;
    const leak = i > 0 && stepPct !== null && stepPct < 20;
    return { ...s, stepPct, leak };
  });

  // ── Tasas clave (para veredicto + diagnóstico) ───────────────
  const conv = sessions > 0 ? (t.orders / sessions) * 100 : 0;
  const realConv = sessions > 0 ? (t.ordersPaid / sessions) * 100 : 0;
  const viewRate = sessions > 0 ? (viewItem / sessions) * 100 : 0;
  const atcRate = viewItem > 0 ? (addToCart / viewItem) * 100 : 0;
  const checkoutComplete = beginCheckout > 0 ? (t.orders / beginCheckout) * 100 : 0;
  const totalCustomers = t.newCustomers + t.returningCustomers;
  const repeatPct = totalCustomers > 0 ? (t.returningCustomers / totalCustomers) * 100 : 0;
  const pendOrdersPct = t.orders > 0 ? (t.ordersPending / t.orders) * 100 : 0;

  // ── Índice DEEPSCAN (heurístico, 0–10) ───────────────────────
  // 5 señales, cada una 0/1/2 (crít/atención/sano). Transparente y dinámico.
  const sig: { z: Zone; has: boolean }[] = [
    { z: classify(viewRate, 40, 60), has: sessions > 0 },
    { z: classify(conv, 0.8, 1.5), has: sessions > 0 },
    { z: classify(atcRate, 5, 8), has: viewItem > 0 },
    { z: classify(checkoutComplete, 30, 45), has: beginCheckout > 0 },
    { z: classify(repeatPct, 10, 20), has: totalCustomers > 0 },
    { z: classify(paidMoneyPct, 50, 80), has: t.revenue > 0 },
  ];
  const activeSig = sig.filter((s) => s.has);
  const zPts = (z: Zone) => (z === 'ok' ? 2 : z === 'warn' ? 1 : 0);
  const score =
    activeSig.length > 0
      ? (activeSig.reduce((a, s) => a + zPts(s.z), 0) / (activeSig.length * 2)) * 10
      : 5;
  const scoreBand: Zone = score < 4 ? 'crit' : score < 7 ? 'warn' : 'ok';
  const bandLabel = score < 4 ? 'INTERVENIR' : score < 7 ? 'MEJORAR' : 'SANO';
  const scoreCol = ZONE_COLOR[scoreBand];

  // Tesis dinámica (dos fallas dominantes: cierre y cobro).
  const closes = conv >= 1.0;
  const collects = paidMoneyPct >= 50;
  const problem =
    !closes && !collects
      ? 'ni cierra ni cobra'
      : !closes
        ? 'no cierra la venta'
        : !collects
          ? 'vende pero no cobra'
          : 'tiene fugas puntuales por tapar';

  // ── Diagnóstico vs industria (solo tarjetas con dato) ────────
  const benches: Bench[] = [];
  if (sessions > 0)
    benches.push({
      label: 'Atracción (sesión → producto)',
      valueTxt: `${viewRate.toFixed(0)}%`,
      zone: classify(viewRate, 40, 60),
      actual: viewRate,
      scaleMax: 100,
      zoneLo: 60,
      zoneHi: 100,
      metaTxt: '60–100%',
    });
  if (sessions > 0)
    benches.push({
      label: 'Conversión sesión → compra',
      valueTxt: `${conv.toFixed(2)}%`,
      zone: classify(conv, 0.8, 1.5),
      actual: conv,
      scaleMax: 2.5,
      zoneLo: 1.5,
      zoneHi: 2.5,
      metaTxt: '1.5–2.5%',
    });
  if (viewItem > 0)
    benches.push({
      label: 'Producto → Carrito',
      valueTxt: `${atcRate.toFixed(1)}%`,
      zone: classify(atcRate, 5, 8),
      actual: atcRate,
      scaleMax: 12,
      zoneLo: 8,
      zoneHi: 12,
      metaTxt: '8–12%',
    });
  if (beginCheckout > 0)
    benches.push({
      label: 'Checkout → Compra',
      valueTxt: `${checkoutComplete.toFixed(1)}%`,
      zone: classify(checkoutComplete, 30, 45),
      actual: checkoutComplete,
      scaleMax: 50,
      zoneLo: 45,
      zoneHi: 50,
      metaTxt: '45–50%',
    });
  if (totalCustomers > 0)
    benches.push({
      label: 'Clientes que repiten',
      valueTxt: `${repeatPct.toFixed(0)}%`,
      zone: classify(repeatPct, 10, 20),
      actual: repeatPct,
      scaleMax: 30,
      zoneLo: 20,
      zoneHi: 30,
      metaTxt: '20–30%',
    });
  benches.push({
    label: 'Cobro del dinero vendido',
    valueTxt: `${paidMoneyPct.toFixed(0)}%`,
    zone: classify(paidMoneyPct, 50, 80),
    actual: paidMoneyPct,
    scaleMax: 100,
    zoneLo: 80,
    zoneHi: 100,
    metaTxt: '80–100%',
  });

  // ── Plan de prioridades (condicional al dato) ────────────────
  const purchOfAtc = addToCart > 0 ? t.orders / addToCart : 0;
  const oppCheckout = Math.max(0, (beginCheckout * 0.3 - t.orders) * t.avgOrderValue);
  const oppAtc = Math.max(0, (viewItem * 0.08 * purchOfAtc - t.orders) * t.avgOrderValue);
  const fellPrePay = Math.max(0, beginCheckout - addPayment);
  const fellAtPay = Math.max(0, addPayment - purchase);

  const prios: Priority[] = [];
  if (pending > 0 && t.ordersPending > 0)
    prios.push({
      title: 'Cobrar los pagos pendientes',
      why: `El ${pendOrdersPct.toFixed(0)}% de los pedidos (${t.ordersPending} de ${t.orders}) quedó en OXXO/SPEI sin liquidar: ${formatCurrency(pending, cur)} generados que no entraron a caja. Es la palanca más rentable porque la venta ya ocurrió — solo falta cobrarla.`,
      how: 'Recordatorio automático (email/WhatsApp) antes de que expire el voucher · mostrar fecha límite de pago · empujar tarjeta/wallet como opción por defecto sobre OXXO.',
      impact: formatCurrency(pending, cur),
      unit: 'por cobrar',
      effort: 'Esfuerzo bajo',
    });
  if (ab.count > 0 && ab.recovered === 0)
    prios.push({
      title: 'Recuperar carritos abandonados',
      why: `${formatInt(ab.count)} checkouts abandonados por ${formatCurrency(ab.value, cur)} y 0 recuperados: no hay ningún flujo de recuperación. Es dinero que llegó hasta poner el correo y se fue en silencio.`,
      how: 'Secuencia de carrito abandonado (email + WhatsApp) a 1h / 24h / 72h · incluir el producto y un incentivo · estándar en e-commerce, aquí en cero.',
      impact: formatCurrency(ab.value, cur),
      unit: 'sin recuperar',
      effort: 'Esfuerzo bajo',
    });
  if (beginCheckout > 0 && checkoutComplete < 30 && oppCheckout > 0)
    prios.push({
      title: 'El checkout: la fuga más cara',
      why: `De ${formatInt(beginCheckout)} que inician el pago, solo compran ${formatInt(t.orders)} (${checkoutComplete.toFixed(0)}%). Llevar el checkout a 30% —aún por debajo del estándar— casi triplica las ventas con el mismo tráfico.`,
      how: 'Mostrar envío y total antes del paso final · checkout como invitado · menos campos · métodos de pago (MSI, wallets) claros.',
      impact: `+${formatCurrency(oppCheckout, cur)}`,
      unit: 'potencial',
      effort: 'Esfuerzo bajo',
    });
  if (viewItem > 0 && atcRate < 8 && oppAtc > 0)
    prios.push({
      title: 'La ficha: subir el add-to-cart',
      why: `Solo ${atcRate.toFixed(0)} de cada 100 que ven un producto lo agregan (industria 8–12). La página de producto no está cerrando el deseo.`,
      how: 'Tallas y stock a la vista · precio con meses sin intereses · más fotos y video · reseñas · señales de escasez.',
      impact: `+${formatCurrency(oppAtc, cur)}`,
      unit: 'potencial',
      effort: 'Esfuerzo medio',
    });
  if (totalCustomers > 0 && repeatPct < 10)
    prios.push({
      title: 'Retención: activar la recompra',
      why: `Solo ${repeatPct.toFixed(0)}% de clientes recurrentes en la ventana. Cada venta es casi 100% adquisición nueva: el costo nunca baja y el valor de vida del cliente se pierde.`,
      how: 'Flujos post-compra · programa de lealtad · remarketing a compradores · upsell de accesorios.',
      impact: 'LTV',
      unit: 'compuesto',
      effort: 'Esfuerzo medio',
    });

  // ── Tendencia: conversión diaria (Shopify pedidos ÷ GA4 sesiones) ──
  const sByDate = funnel?.sessionsByDate;
  const trend = sByDate
    ? data.daily
        .map((d) => {
          const s = sByDate.get(d.date) ?? 0;
          return { date: d.date, cv: s > 0 ? (d.orders / s) * 100 : 0, has: s > 0 };
        })
        .filter((p) => p.has)
    : [];
  const trendReady = trend.length >= 3;
  let trendSvg: {
    line: string;
    area: string;
    avgY: number;
    avg: number;
    W: number;
    H: number;
  } | null = null;
  if (trendReady) {
    const W = 660;
    const H = 100;
    const vals = trend.map((p) => p.cv);
    const mx = Math.max(1e-9, ...vals);
    const n = trend.length;
    const pts = vals.map((v, i) => {
      const x = (i / (n - 1)) * W;
      const y = H - (v / mx) * (H - 14) - 6;
      return [x, y] as const;
    });
    const line = pts.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(' ');
    const area = `0,${H} ${line} ${W},${H}`;
    const avg = vals.reduce((a, b) => a + b, 0) / n;
    const avgY = H - (avg / mx) * (H - 14) - 6;
    trendSvg = { line, area, avgY, avg, W, H };
  }

  return (
    <div className="view on">
      <div className="hero">
        <HeroHead brand="shopify">Shopify · tienda</HeroHead>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {formatInt(t.orders)} órdenes ·{' '}
          {formatCurrency(t.revenue, cur)} facturados
        </div>
      </div>

      {/* ── VEREDICTO ─────────────────────────────────────────── */}
      <div
        className="card"
        style={{
          marginTop: 20,
          position: 'relative',
          overflow: 'hidden',
          background:
            'radial-gradient(120% 140% at 0% 0%, var(--bg2) 0%, var(--bg1) 60%)',
        }}
      >
        <div
          style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}
        >
          <div style={{ flex: '1 1 420px', minWidth: 280 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 1,
                color: scoreCol,
                marginBottom: 10,
              }}
            >
              EL VEREDICTO
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.4px' }}>
              La tienda <span style={{ color: viewRate >= 50 ? GREEN : 'var(--t1)' }}>atrae bien</span>
              , pero <span style={{ color: RED }}>{problem}</span>.
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--t2)', marginTop: 12, lineHeight: 1.55 }}>
              {viewRate >= 30 && (
                <>
                  El <b>{viewRate.toFixed(0)}%</b> de las sesiones llega a ver un producto — el tope
                  del embudo está sano.{' '}
                </>
              )}
              Convierte al <b style={{ color: conv < 1 ? RED : 'var(--t1)' }}>{conv.toFixed(2)}%</b>
              {sessions > 0 && conv < 1 ? ' (por debajo del estándar de industria)' : ''} y de lo que
              factura solo cobra{' '}
              <b style={{ color: paidMoneyPct < 60 ? RED : GREEN }}>{paidMoneyPct.toFixed(0)}%</b>. La
              conversión a <b>dinero real cobrado</b> es de{' '}
              <b style={{ color: RED }}>{realConv.toFixed(2)}%</b>.
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 14,
                marginTop: 18,
                paddingTop: 16,
                borderTop: '1px solid var(--b2)',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 12, color: 'var(--mu)' }}>De lo facturado este periodo:</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: GREEN }}>
                {formatCurrency(collected, cur)}
              </span>
              <span style={{ fontSize: 12, color: 'var(--mu)' }}>
                cobrados de {formatCurrency(t.revenue, cur)} — el{' '}
                <b style={{ color: AMBER }}>{pendOrdersPct.toFixed(0)}% de los pedidos</b> (
                {formatCurrency(pending, cur)}) sigue pendiente.
              </span>
            </div>
          </div>
          {/* Anillo de score */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: '50%',
                background: `conic-gradient(${scoreCol} 0% ${(score / 10) * 100}%, var(--bg3) ${(score / 10) * 100}% 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: '50%',
                  background: 'var(--bg1)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: 26, fontWeight: 800, color: scoreCol, lineHeight: 1 }}>
                  {score.toFixed(1)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--mu)' }}>/10</span>
              </div>
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: scoreCol, letterSpacing: 0.3 }}>
              {bandLabel}
            </span>
          </div>
        </div>
      </div>

      {/* ── SITUACIÓN (embudo en números) ─────────────────────── */}
      {funnelReady && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 1,
            background: 'var(--b2)',
            border: '1px solid var(--b2)',
            borderRadius: 14,
            overflow: 'hidden',
            marginTop: 20,
          }}
        >
          {[
            { v: formatInt(sessions), l: 'Sesiones', c: 'var(--t1)' },
            { v: formatInt(viewItem), l: 'Vieron producto', c: 'var(--t1)' },
            { v: formatInt(addToCart), l: 'Añadieron al carrito', c: 'var(--t1)' },
            { v: formatInt(t.orders), l: 'Pedidos (Shopify)', c: 'var(--t1)' },
            { v: formatInt(t.ordersPaid), l: 'Pagados de verdad', c: GREEN },
          ].map((s) => (
            <div key={s.l} style={{ background: 'var(--bg1)', padding: '16px 18px' }}>
              <div style={{ fontSize: 21, fontWeight: 800, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 3 }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* KPIs reales — foco en salud del cobro */}
      <div className="kpis" style={{ marginTop: 20 }}>
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

      {/* ── DIAGNÓSTICO vs industria ──────────────────────────── */}
      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: 15 }}>El diagnóstico: tú vs. la industria</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 16 }}>
          Cada barra ubica tu métrica frente a la banda sana de referencia (moda/calzado). La zona
          verde es la meta.
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {benches.map((b) => {
            const col = ZONE_COLOR[b.zone];
            const zL = (b.zoneLo / b.scaleMax) * 100;
            const zW = ((b.zoneHi - b.zoneLo) / b.scaleMax) * 100;
            const mk = Math.min(99, Math.max(1, (b.actual / b.scaleMax) * 100));
            return (
              <div
                key={b.label}
                style={{
                  background: 'var(--bg2)',
                  border: '1px solid var(--b2)',
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>{b.label}</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: 6,
                      color: col,
                      background: 'var(--bg3)',
                    }}
                  >
                    {ZONE_WORD[b.zone]}
                  </span>
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: col, lineHeight: 1 }}>
                  {b.valueTxt}
                </div>
                <div
                  style={{
                    position: 'relative',
                    height: 7,
                    background: 'var(--bg3)',
                    borderRadius: 5,
                    margin: '12px 0 8px',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${zL}%`,
                      width: `${zW}%`,
                      background: 'rgba(34,217,122,0.22)',
                      borderLeft: '1px solid rgba(34,217,122,0.5)',
                      borderRight: '1px solid rgba(34,217,122,0.5)',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: -3,
                      left: `${mk}%`,
                      width: 3,
                      height: 13,
                      borderRadius: 2,
                      background: col,
                    }}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 10.5,
                    color: 'var(--t3)',
                  }}
                >
                  <span>Tú</span>
                  <span>Meta {b.metaTxt}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Embudo del sitio — GA4 + Shopify */}
      {funnelReady && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 15 }}>El embudo: dónde se cae la gente</h3>
          <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 18 }}>
            Personas en cada paso (GA4, a nivel de sitio) y, al final, los pedidos realmente pagados
            (Shopify). En rojo, las caídas más fuertes.
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
          {beginCheckout > 0 && addPayment > 0 && (
            <div
              style={{
                marginTop: 14,
                fontSize: 12.5,
                color: 'var(--t1)',
                background: 'var(--bg3)',
                borderLeft: `3px solid ${RED}`,
                borderRadius: 10,
                padding: '11px 14px',
                lineHeight: 1.55,
              }}
            >
              <b>La fuga del pago tiene dos escalones.</b> De {formatInt(beginCheckout)} que inician el
              pago, solo <b>{formatInt(addPayment)}</b> llegan a poner la tarjeta —{' '}
              <b style={{ color: RED }}>{formatInt(fellPrePay)} se caen antes</b>. De esos, compran{' '}
              {formatInt(purchase)}:{' '}
              <b style={{ color: RED }}>otros {formatInt(fellAtPay)} abandonan con la tarjeta puesta</b>.
              Tapar cualquiera de estos escalones multiplica las ventas sin gastar más en tráfico.
            </div>
          )}
        </div>
      )}

      {/* Dinero: cobrado vs pendiente */}
      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: 15 }}>Dinero: cobrado vs. pendiente</h3>
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
          <div style={{ width: `${collectedPct}%`, background: GREEN, minWidth: collected > 0 ? 4 : 0 }} />
          <div style={{ width: `${pendingPct}%`, background: AMBER, minWidth: pending > 0 ? 4 : 0 }} />
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
            ⚠️ El <b>{pendingPct.toFixed(0)}%</b> de lo facturado ({formatCurrency(pending, cur)}) aún
            no entra a caja. Son pagos pending (OXXO/SPEI): si no se capturan en su ventana, caen. Vale
            la pena un recordatorio de pago o empujar métodos de captura inmediata.
          </div>
        )}
      </div>

      {/* Checkouts abandonados */}
      {ab.count > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 15 }}>Carritos abandonados</h3>
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

      {/* ── PLAN DE PRIORIDADES ───────────────────────────────── */}
      {prios.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 15 }}>El plan: por dónde empezar</h3>
          <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 16 }}>
            Movimientos ordenados por retorno. Las cifras <b>+</b> son potencial estimado si se
            alcanza la meta, no ingreso garantizado.
          </div>
          {prios.map((p, i) => (
            <div
              key={p.title}
              style={{
                display: 'grid',
                gridTemplateColumns: '44px 1fr 150px',
                gap: 16,
                alignItems: 'center',
                background: 'var(--bg2)',
                border: '1px solid var(--b2)',
                borderRadius: 12,
                padding: '16px 18px',
                marginBottom: 11,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: `linear-gradient(135deg, ${SHOP_GREEN}, ${GREEN})`,
                  color: '#08110A',
                  fontSize: 20,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {i + 1}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 5 }}>{p.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--t2)', marginBottom: 6, lineHeight: 1.5 }}>
                  {p.why}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--mu)', lineHeight: 1.5 }}>{p.how}</div>
              </div>
              <div
                style={{
                  textAlign: 'right',
                  borderLeft: '1px solid var(--b2)',
                  paddingLeft: 14,
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 800, color: GREEN, lineHeight: 1.1 }}>
                  {p.impact}
                </div>
                <div style={{ fontSize: 11, color: 'var(--mu)' }}>{p.unit}</div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: 'var(--t3)',
                    fontWeight: 700,
                    marginTop: 8,
                    background: 'var(--bg3)',
                    borderRadius: 6,
                    padding: '3px 0',
                  }}
                >
                  {p.effort}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TENDENCIA: conversión diaria ──────────────────────── */}
      {trendReady && trendSvg && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 15 }}>¿Está mejorando sola?</h3>
          <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 16 }}>
            Conversión diaria (pedidos Shopify ÷ sesiones GA4). Si es plana, el problema es
            estructural, no un bache puntual.
          </div>
          <svg
            viewBox={`0 0 ${trendSvg.W} ${trendSvg.H}`}
            width="100%"
            height="120"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="shopTrend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={SHOP_GREEN} stopOpacity="0.28" />
                <stop offset="1" stopColor={SHOP_GREEN} stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points={trendSvg.area} fill="url(#shopTrend)" />
            <line
              x1="0"
              y1={trendSvg.avgY}
              x2={trendSvg.W}
              y2={trendSvg.avgY}
              stroke="var(--mu)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <polyline
              points={trendSvg.line}
              fill="none"
              stroke={SHOP_GREEN}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          </svg>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              color: 'var(--t3)',
              marginTop: 2,
            }}
          >
            <span>{fmtDay(trend[0].date)}</span>
            <span style={{ color: 'var(--mu)' }}>– – promedio {trendSvg.avg.toFixed(2)}%</span>
            <span>{fmtDay(trend[trend.length - 1].date)}</span>
          </div>
        </div>
      )}

      {/* Ventas por día — datos reales, con estado de pago */}
      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 15 }}>Ventas por día</h3>
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
      <div className="card" style={{ marginTop: 20 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15 }}>Top de productos vendidos</h3>
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
        style={{ marginTop: 20, borderStyle: 'dashed', borderColor: 'var(--b2)' }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: 15 }}>Sobre estos datos</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Todo viene directo de la cuenta, sin estimaciones. Las ventas, el estado de pago
          (pagado/pendiente) y el ingreso pendiente salen del <b>Admin API de Shopify</b> (tablas{' '}
          <code>shopify_orders</code> y <code>shopify_abandoned_checkouts</code>) y{' '}
          <b>respetan el filtro de fechas</b>. El <b>embudo</b> y la <b>tendencia</b> usan eventos de{' '}
          <b>GA4</b> a nivel de sitio (no por producto en esta cuenta); los conteos por paso son
          aproximados porque se suman por día. El <b>índice /10</b> y el <b>diagnóstico</b> comparan
          tus tasas reales contra bandas de referencia generales de industria (moda/calzado), no de
          esta cuenta. Las cifras <b>+{cur}</b> del plan son potencial si se alcanza la meta, no
          ingreso garantizado. El <b>top de productos</b> refleja el último período sincronizado por
          el ETL (etiqueta), no el filtro. «Cobrado» = facturado − pendiente.
        </div>
      </div>
    </div>
  );
}
