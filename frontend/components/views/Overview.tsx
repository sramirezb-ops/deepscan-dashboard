'use client';

import { Card } from '@/components/ui/Card';
import { HeroStat } from '@/components/ui/KpiCard';
import { Agent } from '@/components/ui/Agent';
import { RevenueEvolutionChart } from './RevenueEvolutionChart';
import { LeadsOverview } from './LeadsOverview';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useOverview, type OverviewData } from '@/lib/hooks/useOverview';
import {
  formatCurrency,
  formatInt,
  formatROAS,
  formatDelta,
  formatPercent,
  deltaDirection,
} from '@/lib/utils';

// ── Router del Overview ejecutivo ────────────────────────────
// Un cliente "modelo de leads puro" (objetivo 'leads' y SIN 'ventas'/ecommerce,
// ej. Ofero) ve el overview consolidado de leads, sin ROAS/revenue. El resto
// sigue con el overview ecommerce. Branch por COMPONENTE (no por hook): este
// router solo llama useClient, así el orden de hooks es estable.
export function OverviewSwitch() {
  const client = useClient();
  const isLeadsModel =
    client.objectives.includes('leads') && !client.objectives.includes('ventas');
  return isLeadsModel ? <LeadsOverview /> : <Overview />;
}

export function Overview() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useOverview(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const previousLabel = formatRangeLabel(previous);

  // Estado de carga
  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Cargando datos de {client.name}…
          </div>
        </div>
      </div>
    );
  }

  // Estado de error
  if (error) {
    return (
      <div className="view on">
        <div
          className="card"
          style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}
        >
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>
            Error cargando datos
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 16 }}>{error}</div>
          <div style={{ fontSize: 11, color: 'var(--mu)' }}>
            Revisá tu conexión a Supabase en <code>.env.local</code> y que las tablas tengan
            datos para el <code>client_id</code> de {client.name}.
          </div>
        </div>
      </div>
    );
  }

  // Sin datos
  if (!data) {
    return (
      <div className="view on">
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Sin datos disponibles para el período.
          </div>
        </div>
      </div>
    );
  }

  const hasAnyData = data.revenue > 0 || data.investment > 0 || data.addToCart > 0;

  // Sparkline REAL del north-star: alturas (%) de la serie diaria de revenue.
  // Solo se dibuja con ≥2 días; nunca se fabrican datos. Los demás KPIs no
  // tienen serie diaria propia, así que no llevan sparkline (honestidad).
  const revSpark = (() => {
    const vals = data.dailyRevenue.map((d) => d.current);
    if (vals.length < 2) return [] as number[];
    const max = Math.max(...vals, 1);
    return vals.map((v) => Math.max(4, Math.round((v / max) * 100)));
  })();

  // ── Lógica del agente, DERIVADA de señales reales (no hardcode) ──────────
  // Cada alerta/oportunidad se dispara por un umbral objetivo sobre los datos
  // del período. Sin target de ROAS por cliente para Sneakers, usamos el punto
  // de equilibrio (1.00×) y las tendencias vs período anterior como criterios.
  // Los dos mundos (compra real GA4 / intención Google) se evalúan por separado.
  const agentAlerts: { type: 'critical' | 'warn' | 'info'; icon: string; text: string }[] = [];
  const agentOpps: { title: string; sub: string; cta: string }[] = [];

  if (hasAnyData) {
    // ROAS REAL de compra por debajo del punto de equilibrio: la inversión de
    // Google no se recupera en revenue de venta confirmada (GA4). Señal objetiva.
    if (data.investment > 0 && data.revenue > 0 && data.roas < 1) {
      agentAlerts.push({
        type: 'critical',
        icon: '⚠',
        text: `ROAS real de compra en <b>${formatROAS(data.roas)}</b>, por debajo del punto de equilibrio (1.00×): cada ${client.currency} invertido en Google devuelve menos de uno en revenue de venta real (GA4).`,
      });
    }
    // CPA en alza con ventas a la baja: eficiencia deteriorándose.
    if (data.cpaDelta > 0 && data.salesDelta < 0) {
      agentAlerts.push({
        type: 'warn',
        icon: '▲',
        text: `El CPA subió <b>${formatDelta(data.cpaDelta)}</b> mientras las compras cayeron <b>${formatDelta(data.salesDelta)}</b> vs ${previousLabel}. La eficiencia de adquisición se está deteriorando.`,
      });
    }
    // Revenue de compra cayendo vs período anterior.
    if (data.revenueDelta < 0) {
      agentAlerts.push({
        type: 'warn',
        icon: '▼',
        text: `El revenue de compra cayó <b>${formatDelta(data.revenueDelta)}</b> frente a ${previousLabel}.`,
      });
    }

    // Oportunidad #1 — la más importante: Google optimiza hacia add-to-cart,
    // no hacia compra. Es un hecho del setup (conv_value ATC alto vs venta real).
    agentOpps.push({
      title: 'Migrar la conversión de Google Ads de add-to-cart a compra',
      sub: `Hoy Google optimiza el gasto hacia carritos (intención: ROAS ATC ${formatROAS(data.atcRoas)}), no hacia ventas (ROAS real ${formatROAS(data.roas)}). Configurar la compra como acción de conversión alinearía la puja con el revenue real y haría ambos ROAS comparables.`,
      cta: 'Ajustar en Google Ads →',
    });
    // Oportunidad #2: Shopify como fuente autoritativa de venta (cierra el gap
    // de la estimación GA4 y resuelve los pedidos pendientes).
    agentOpps.push({
      title: 'Conectar Shopify para venta confirmada E2E',
      sub: 'Hoy las compras son una estimación de GA4 (sesiones × tasa de conversión). Shopify daría la venta autoritativa y permitiría excluir los pedidos en estado pendiente (pago no confirmado) del revenue.',
      cta: 'Conectar →',
    });
    // Oportunidad #3: TikTok sigue sin ETL (Meta y Shopify ya conectados).
    agentOpps.push({
      title: 'Activar ETL de TikTok Ads',
      sub: 'Meta y Shopify ya reportan datos; TikTok sigue sin pipeline, así que su gasto y su compra no entran al consolidado. Conectarlo cerraría la visibilidad cross-canal.',
      cta: 'Configurar →',
    });

    // Alerta: ROAS de Meta bajo el punto de equilibrio (con su propia venta).
    if (data.metaExists && data.metaSpend > 0 && data.metaRoas < 1) {
      agentAlerts.push({
        type: 'warn',
        icon: '▼',
        text: `ROAS de Meta en <b>${formatROAS(data.metaRoas)}</b> (con su compra atribuida), por debajo del punto de equilibrio: el gasto de Meta no se recupera ni con su propia atribución (que suele ser optimista).`,
      });
    }
  }

  // Severidad del agente: alta si hay alerta crítica, media si hay warnings.
  const agentSeverity: 'hi' | 'me' | 'lo' = agentAlerts.some((a) => a.type === 'critical')
    ? 'hi'
    : agentAlerts.length > 0
      ? 'me'
      : 'lo';

  return (
    <div className="view on">
      {/* HERO — north-star dominante (Revenue) + fila de soporte (5 KPIs) */}
      <div className="hero">
        <div className="hero-lbl">
          <span>✦</span>
          <span>Resumen ejecutivo · {rangeLabel}</span>
        </div>
        <div className="hero-title">
          {hasAnyData ? (
            <>
              Revenue de compra <em>{formatCurrency(data.revenue, client.currency)} {client.currency}</em>{' '}
              con ROAS real <em>{formatROAS(data.roas)}</em> (
              {data.roasDelta >= 0 ? '+' : ''}
              {data.roasDelta.toFixed(2)}). Datos en vivo desde Supabase para {client.name}.
            </>
          ) : (
            <>Sin datos suficientes aún para {client.name}. Revisá que el ETL esté corriendo.</>
          )}
        </div>

        {/* North-star: Revenue, la métrica que gobierna al negocio */}
        <div className="hero-northstar">
          <div className="hero-northstar-main">
            <div className="hero-northstar-lbl">Revenue total · vs {previousLabel}</div>
            <div className="hero-northstar-val">
              {formatCurrency(data.revenue, client.currency)}
              <span className="hero-northstar-cur">{client.currency}</span>
            </div>
            <div className="hero-northstar-sub">
              <span className={`tg ${deltaDirection(data.revenueDelta) === 'up' ? 'tgu' : deltaDirection(data.revenueDelta) === 'down' ? 'tgd' : 'tgm'}`}>
                {formatDelta(data.revenueDelta)}
              </span>
              <span className="dcmp">vs {previousLabel}</span>
            </div>
          </div>
          {revSpark.length > 0 && (
            <span className="spark k-violet" aria-hidden="true">
              {revSpark.map((h, i) => (
                <span key={i} className="spark-bar" style={{ height: `${h}%` }} />
              ))}
            </span>
          )}
        </div>

        {/* Fila de soporte: 5 KPIs secundarios, peso visual uniforme */}
        <div className="hero-stats-support">
          <HeroStat
            label="Inversión total"
            value={formatCurrency(data.investment, client.currency)}
            delta={{
              value: formatDelta(data.investmentDelta),
              direction: deltaDirection(data.investmentDelta),
            }}
            ytd={`vs ${previousLabel}`}
          />
          <HeroStat
            label="ROAS real"
            value={formatROAS(data.roas)}
            delta={{
              value: (data.roasDelta >= 0 ? '+' : '') + data.roasDelta.toFixed(2),
              direction: deltaDirection(data.roasDelta),
            }}
            ytd={`vs ${previousLabel}`}
          />
          <HeroStat
            label="Ventas"
            value={formatInt(data.sales)}
            delta={{
              value: formatDelta(data.salesDelta),
              direction: deltaDirection(data.salesDelta),
            }}
            ytd={`vs ${previousLabel}`}
          />
          <HeroStat
            label="Costo por compra"
            value={formatCurrency(data.cpa, client.currency)}
            delta={{
              value: formatDelta(data.cpaDelta),
              direction: deltaDirection(-data.cpaDelta), // invertido: bajar CPA es bueno
            }}
            ytd={`CPA vs ${previousLabel}`}
          />
          <HeroStat
            label="Tasa conversión"
            value={formatPercent(data.conversionRate, 2)}
            delta={{
              value: `${data.conversionRateDelta >= 0 ? '+' : ''}${data.conversionRateDelta.toFixed(2)}pp`,
              direction: deltaDirection(data.conversionRateDelta),
            }}
            ytd={`vs ${previousLabel}`}
          />
        </div>
      </div>

      {/* Evolución de revenue — serie diaria real desde Supabase */}
      <RevenueEvolutionChart
        points={data.dailyRevenue}
        currency={client.currency}
        curLabel={rangeLabel}
        prevLabel={previousLabel}
      />

      {/* DOS MUNDOS que conviven y se diferencian: venta real (GA4) vs
          intención (Google Ads · add-to-cart). Nunca se suman ni se mezclan. */}
      <div className="r2" style={{ marginTop: 20 }}>
        {/* Panel A — VENTA REAL (GA4). El north-star del negocio. */}
        <Card style={{ borderLeft: '2px solid var(--acc)' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6,
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 15 }}>Venta real · GA4</h3>
            <span className="tg tgu" style={{ flexShrink: 0 }}>
              Compra confirmada
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>
            Revenue y compras de venta real · {client.currency} · {rangeLabel}
          </div>
          <MetricRow
            label="Revenue de compra"
            value={formatCurrency(data.revenue, client.currency)}
            delta={{ value: formatDelta(data.revenueDelta), direction: deltaDirection(data.revenueDelta) }}
          />
          <MetricRow
            label="Compras estimadas"
            value={formatInt(data.sales)}
            delta={{ value: formatDelta(data.salesDelta), direction: deltaDirection(data.salesDelta) }}
          />
          <MetricRow
            label="ROAS real"
            value={formatROAS(data.roas)}
            delta={{
              value: (data.roasDelta >= 0 ? '+' : '') + data.roasDelta.toFixed(2),
              direction: deltaDirection(data.roasDelta),
            }}
          />
          <MetricRow
            label="CPA real (por compra)"
            value={formatCurrency(data.cpa, client.currency)}
            delta={{ value: formatDelta(data.cpaDelta), direction: deltaDirection(-data.cpaDelta) }}
          />
          <MetricRow
            label="Tasa de conversión"
            value={formatPercent(data.conversionRate, 2)}
            delta={{
              value: `${data.conversionRateDelta >= 0 ? '+' : ''}${data.conversionRateDelta.toFixed(2)}pp`,
              direction: deltaDirection(data.conversionRateDelta),
            }}
          />
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--mu)', lineHeight: 1.5 }}>
            <b style={{ color: 'var(--t2)' }}>Estimación:</b> las compras se estiman con GA4
            (sesiones × tasa de conversión) hasta conectar Shopify como fuente autoritativa. Shopify
            además tiene pedidos en estado <b>pendiente</b> (pago no confirmado) que no deben contar
            como venta hasta completarse.
          </div>
        </Card>

        {/* Panel B — INTENCIÓN (Google Ads · add-to-cart). NO es venta. */}
        <Card style={{ borderLeft: '2px solid var(--warn)' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6,
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 15 }}>Google Ads · Intención</h3>
            <span className="tg tgm" style={{ flexShrink: 0 }}>
              Add-to-cart, no compra
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>
            Inversión y carritos (intención) · {client.currency} · {rangeLabel}
          </div>
          <MetricRow
            label="Inversión Google"
            value={formatCurrency(data.googleSpend, client.currency)}
            delta={{ value: formatDelta(data.googleSpendDelta), direction: deltaDirection(data.googleSpendDelta) }}
          />
          <MetricRow
            label="Add to cart (carritos)"
            value={formatInt(data.addToCart)}
            delta={{ value: formatDelta(data.addToCartDelta), direction: deltaDirection(data.addToCartDelta) }}
          />
          <MetricRow
            label="Valor de carritos (ATC)"
            value={formatCurrency(data.addToCartValue, client.currency)}
            delta={{ value: formatDelta(data.addToCartValueDelta), direction: deltaDirection(data.addToCartValueDelta) }}
          />
          <MetricRow
            label="ROAS ATC (proxy de intención)"
            value={formatROAS(data.atcRoas)}
            delta={{
              value: (data.atcRoasDelta >= 0 ? '+' : '') + data.atcRoasDelta.toFixed(2),
              direction: deltaDirection(data.atcRoasDelta),
            }}
          />
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--mu)', lineHeight: 1.5 }}>
            <b style={{ color: 'var(--warn)' }}>Ojo:</b> la acción de conversión configurada en
            Google Ads es <b>«add to cart»</b>, no la compra. Estas métricas miden <b>intención</b>,
            no venta real. El <b>ROAS ATC</b> es un proxy — no lo compares 1:1 con el ROAS real del
            panel de la izquierda.
          </div>
        </Card>
      </div>

      {/* Fila 2: Meta (compra atribuida, mundo propio) + integraciones */}
      <div className="r2" style={{ marginTop: 20 }}>
        {/* Panel C — META ADS · compra con atribución propia. No se suma a GA4. */}
        <Card style={{ borderLeft: '2px solid #3b82f6' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6,
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 15 }}>Meta Ads · Compra atribuida</h3>
            <span className="tg tgm" style={{ flexShrink: 0 }}>
              Atribución propia · no sumar
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>
            Compra que Meta atribuye a sus campañas · {client.currency} · {rangeLabel}
          </div>

          {data.metaExists ? (
            <>
              <MetricRow
                label="Inversión Meta"
                value={formatCurrency(data.metaSpend, client.currency)}
                delta={{ value: formatDelta(data.metaSpendDelta), direction: deltaDirection(data.metaSpendDelta) }}
              />
              <MetricRow
                label="Compras (atrib. Meta)"
                value={formatInt(data.metaPurchases)}
                delta={{ value: formatDelta(data.metaPurchasesDelta), direction: deltaDirection(data.metaPurchasesDelta) }}
              />
              <MetricRow
                label="Valor de compra (Meta)"
                value={formatCurrency(data.metaRevenue, client.currency)}
                delta={{ value: formatDelta(data.metaRevenueDelta), direction: deltaDirection(data.metaRevenueDelta) }}
              />
              <MetricRow
                label="ROAS Meta"
                value={formatROAS(data.metaRoas)}
                delta={{
                  value: (data.metaRoasDelta >= 0 ? '+' : '') + data.metaRoasDelta.toFixed(2),
                  direction: deltaDirection(data.metaRoasDelta),
                }}
              />

              {/* Funnel propio de Meta: view → cart → checkout → compra */}
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  marginTop: 12,
                  fontSize: 11,
                  color: 'var(--t3)',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <b style={{ color: 'var(--t2)' }}>Funnel Meta:</b>
                <span>View {formatInt(data.metaViewContent)}</span>
                <span aria-hidden="true">→</span>
                <span>Cart {formatInt(data.metaAddToCart)}</span>
                <span aria-hidden="true">→</span>
                <span>Checkout {formatInt(data.metaInitiateCheckout)}</span>
                <span aria-hidden="true">→</span>
                <span style={{ color: 'var(--t1)' }}>Compra {formatInt(data.metaPurchases)}</span>
              </div>

              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--mu)', lineHeight: 1.5 }}>
                <b style={{ color: '#3b82f6' }}>Atribución:</b> Meta cuenta la compra con su propio
                modelo (view-through / click), distinto de GA4. Por eso <b>no se suma</b> al revenue
                de GA4 (doble conteo). Lo único de Meta que entra a la inversión total y al ROAS real
                es el <b>gasto</b>.
              </div>
            </>
          ) : (
            <div style={{ padding: '24px 0', fontSize: 12, color: 'var(--mu)' }}>
              Sin filas de Meta Ads en {rangeLabel}. Ampliá el rango o revisá el ETL de{' '}
              <code>meta_campaigns</code>.
            </div>
          )}
        </Card>

        {/* Estado de integraciones — presencia real de datos por fuente */}
        <Card>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 15 }}>Estado de integraciones</h3>
          <IntegrationsStatus sources={data.sources} rangeLabel={rangeLabel} />
        </Card>
      </div>

      {/* Agente Performance Senior */}
      <Agent
        role="Agente Performance Senior"
        subtitle={`Análisis · ${client.name} · ${rangeLabel}`}
        avatar="◈"
        severity={agentSeverity}
        timestamp={`Datos del ${data.from} al ${data.to}`}
        diagnosis={
          hasAnyData ? (
            <>
              Dos mundos que conviven y se leen por separado. <b>Venta real (GA4):</b>{' '}
              <b>{formatCurrency(data.revenue, client.currency)}</b> de revenue de compra con{' '}
              <b>ROAS real {formatROAS(data.roas)}</b>
              {data.investment > 0 && (
                <>
                  , sobre una inversión de <b>{formatCurrency(data.investment, client.currency)}</b>{' '}
                  y <b>{formatInt(data.sales)}</b> compras estimadas (CPA{' '}
                  <b>{formatCurrency(data.cpa, client.currency)}</b>)
                </>
              )
              }. <b>Intención (Google Ads):</b> la conversión configurada es «add to cart», así que
              los <b>{formatInt(data.addToCart)}</b> carritos y su valor{' '}
              <b>{formatCurrency(data.addToCartValue, client.currency)}</b> (ROAS ATC{' '}
              {formatROAS(data.atcRoas)}) miden intención, no venta — no se suman al revenue real.
              {data.metaExists && (
                <>
                  {' '}
                  <b>Meta</b> sí reporta compra con su propia atribución (
                  <b>{formatCurrency(data.metaRevenue, client.currency)}</b>, ROAS{' '}
                  {formatROAS(data.metaRoas)}); su gasto entra a la inversión total pero su revenue
                  se lee aparte para no duplicar con GA4.
                </>
              )}{' '}
              Para cerrar el ciclo: migrar la conversión de Google a compra, adoptar Shopify como
              venta confirmada y activar el ETL de TikTok.
            </>
          ) : (
            <>
              No hay datos suficientes en el período seleccionado. Verifica que el ETL esté
              corriendo correctamente y que existan registros en las tablas{' '}
              <code>gads_campaigns</code> y <code>ga4_metrics</code> para{' '}
              <code>client_id = {client.id}</code>.
            </>
          )
        }
        opportunities={agentOpps}
        alerts={agentAlerts}
      />
    </div>
  );
}

// Fila de métrica para los paneles de los dos mundos: etiqueta a la izquierda,
// valor + delta a la derecha. Números tabulares para alineación vertical.
function MetricRow({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: { value: string; direction: 'up' | 'down' | 'neutral' };
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 12,
        padding: '10px 0',
        borderBottom: '1px solid var(--b1)',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--t2)' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
        {delta && (
          <span
            className={`tg ${delta.direction === 'up' ? 'tgu' : delta.direction === 'down' ? 'tgd' : 'tgm'}`}
            style={{ flexShrink: 0 }}
          >
            {delta.value}
          </span>
        )}
      </span>
    </div>
  );
}

// Estado de integraciones DERIVADO de datos reales. Solo Google Ads y GA4
// tienen ETL: su estado sale de la presencia de filas en el período. El resto
// no tiene pipeline conectado → 'pending' (sin inventar métricas). Accesible:
// el estado se comunica con texto + glifo + color, no solo con color.
type IntegStatus = 'active' | 'nodata' | 'pending';

const STATUS_META: Record<IntegStatus, { label: string; glyph: string; dot: string; pill: string }> = {
  active: { label: 'Activo', glyph: '✓', dot: 'var(--up)', pill: 'tgu' },
  nodata: { label: 'Sin datos', glyph: '—', dot: 'var(--warn)', pill: 'tgm' },
  pending: { label: 'Pendiente', glyph: '○', dot: 'var(--t4)', pill: 'tgm' },
};

interface IntegrationsStatusProps {
  sources: OverviewData['sources'];
  rangeLabel: string;
}

function IntegrationsStatus({ sources, rangeLabel }: IntegrationsStatusProps) {
  const etlStatus = (s: { active: boolean; days: number }): IntegStatus =>
    s.active ? 'active' : 'nodata';

  const integrations: { name: string; status: IntegStatus; note: string }[] = [
    {
      name: 'Google Ads',
      status: etlStatus(sources.googleAds),
      note: sources.googleAds.active
        ? `${sources.googleAds.days} días con datos · ${rangeLabel}`
        : `Sin filas en ${rangeLabel}`,
    },
    {
      name: 'Google Analytics 4',
      status: etlStatus(sources.ga4),
      note: sources.ga4.active
        ? `${sources.ga4.days} días con datos · ${rangeLabel}`
        : `Sin filas en ${rangeLabel}`,
    },
    {
      name: 'Meta Ads',
      status: etlStatus(sources.meta),
      note: sources.meta.active
        ? `${sources.meta.days} días con datos · ${rangeLabel}`
        : `Sin filas en ${rangeLabel}`,
    },
    {
      name: 'Shopify',
      status: etlStatus(sources.shopify),
      note: sources.shopify.active
        ? `${sources.shopify.days} días con datos · aún no adoptado como fuente de venta`
        : `Sin filas en ${rangeLabel}`,
    },
    { name: 'TikTok Ads', status: 'pending', note: 'Sin ETL conectado' },
    { name: 'Microsoft Clarity', status: 'pending', note: 'Sin ETL conectado' },
    { name: 'Search Console', status: 'pending', note: 'Sin ETL conectado' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {integrations.map((i) => {
        const m = STATUS_META[i.status];
        return (
          <div
            key={i.name}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              padding: '8px 0',
              borderBottom: '1px solid var(--b1)',
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span
                aria-hidden="true"
                style={{ width: 8, height: 8, borderRadius: '50%', background: m.dot, flexShrink: 0 }}
              />
              <span style={{ color: 'var(--t2)', whiteSpace: 'nowrap' }}>{i.name}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span
                style={{
                  color: 'var(--t3)',
                  fontSize: 11,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {i.note}
              </span>
              <span className={`tg ${m.pill}`} style={{ flexShrink: 0 }}>
                <span aria-hidden="true">{m.glyph}</span> {m.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
