'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useClient } from '@/lib/useClient';
import { useOverview } from '@/lib/hooks/useOverview';
import { useShopify } from '@/lib/hooks/useShopify';
import { useImplementations } from '@/lib/hooks/useImplementations';
import { formatRangeLabel } from '@/lib/period';
import { formatCurrency, formatInt, formatROAS, formatDelta } from '@/lib/utils';
import {
  weekRanges,
  buildEcommerceWeekActionables,
  buildEcommerceWeekBrief,
  countOpenActions,
  type EcomWeekAction,
  type Severity,
} from '@/lib/weekEcommerce';
import { SectionLabel, BackToTop } from './tiktokShared';
import { RevenueEvolutionChart } from './RevenueEvolutionChart';

// ============================================================
// WeekEcommerce — "Esta semana" para clientes de VENTA (Sneakers)
// ============================================================
// Gemelo ecommerce de Week.tsx (que es solo leads/Ofero). Cadencia FIJA: últimos
// 7 días vs. los 7 previos, ignorando el date-picker global. Responde "¿qué
// cambió desde la semana pasada?" y "¿qué hago el lunes?" bajo la lógica de los
// TRES MUNDOS del overview, sin mezclarlos nunca:
//   · Venta real (GA4)      → north-star: revenue de compra + ROAS real.
//   · Intención (Google)    → add-to-cart, no venta.
//   · Compra atribuida Meta → modelo propio de Meta, se muestra aparte.
// El corazón son los Accionables (motor puro en lib/weekEcommerce.ts); los KPIs
// solo los justifican. Shopify se cita como venta CONFIRMADA, etiquetada. 100%
// dato real: sin metas inventadas (Sneakers no tiene budget objetivo guardado,
// así que la proyección de inversión se rotula como run-rate, no como "vs meta").
// ============================================================

const GREEN = '#4ade80';
const RED = '#f87171';
const AMBER = '#fbbf24';
const BLUE = '#60a5fa';
const MUTED = 'var(--mu)';

// Colores por mundo (coinciden con los borderLeft del Overview ecommerce).
const GA4_VIOLET = '#8b5cf6';
const GOOGLE_AMBER = 'var(--warn)';
const META_BLUE = '#3b82f6';

const SEV_COLOR: Record<Severity, string> = { critical: RED, warn: AMBER, info: BLUE, ok: GREEN };
const SEV_LABEL: Record<Severity, string> = { critical: 'Urgente', warn: 'Revisar', info: 'Nota', ok: 'En orden' };

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function dayLabel(iso: string): string {
  const p = iso.split('-');
  if (p.length < 3) return iso;
  return `${parseInt(p[2], 10)} ${MONTHS_ES[parseInt(p[1], 10) - 1] ?? ''}`.trim();
}

// Color del canal para la bitácora.
const CH_COLOR: Record<string, string> = {
  google: GOOGLE_AMBER,
  meta: META_BLUE,
  tiktok: '#ee1d52',
  global: '#a78bfa',
};

const MAX_VISIBLE = 5; // tope de accionables visibles; el resto se colapsa

export function WeekEcommerce() {
  const client = useClient();
  // Ventanas fijas de 7 días (memoizadas para no recomputar fechas cada render).
  const { range, previous } = useMemo(() => weekRanges(), []);
  const { data, loading, error } = useOverview(client.id, range, previous);
  // Shopify se consulta para ambas ventanas → WoW de venta confirmada.
  const shopifyNowRes = useShopify(client.id, range);
  const shopifyPrevRes = useShopify(client.id, previous);
  const { items: implementations } = useImplementations(client.id, range, [
    'google',
    'meta',
    'tiktok',
    'global',
  ]);

  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);

  const rangeLabel = formatRangeLabel(range);
  const cur = client.currency;

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: MUTED }}>Cargando la semana de {client.name}…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view on">
        <div className="card" style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}>
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>Error cargando la semana</div>
          <div style={{ fontSize: 12, color: MUTED }}>{error}</div>
        </div>
      </div>
    );
  }

  const hasAnyData = !!data && (data.revenue > 0 || data.investment > 0 || data.addToCart > 0);
  if (!data || !hasAnyData) {
    return (
      <div className="view on">
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: MUTED }}>
            Sin actividad de compra ni inversión en los últimos 7 días ({rangeLabel}) para {client.name}.
          </div>
        </div>
      </div>
    );
  }

  const shopifyNow = shopifyNowRes.data?.totals ?? null;
  const shopifyPrev = shopifyPrevRes.data?.totals ?? null;
  const hasShopify = !!shopifyNow && shopifyNow.orders > 0;
  const shopifyDelta =
    shopifyNow && shopifyPrev && shopifyPrev.revenue > 0
      ? ((shopifyNow.revenue - shopifyPrev.revenue) / shopifyPrev.revenue) * 100
      : null;

  // ── Unit economics que sobreviven a una tienda nueva ──
  // AOV y unidades/pedido NO dependen del histórico de clientes (a diferencia
  // de CAC o nuevo/recurrente, que hoy son mentira: Shopify marca el 100% como
  // "nuevo" porque no tiene histórico de recompra).
  const aovDelta =
    shopifyNow && shopifyPrev && shopifyPrev.orders > 0 && shopifyPrev.avgOrderValue > 0
      ? ((shopifyNow.avgOrderValue - shopifyPrev.avgOrderValue) / shopifyPrev.avgOrderValue) * 100
      : null;
  const unitsPerOrder = shopifyNow && shopifyNow.orders > 0 ? shopifyNow.unitsSold / shopifyNow.orders : 0;

  // ── Reconciliación GA4 (estimado) vs. Shopify (confirmado), misma ventana 7d ──
  // Gana peso justo porque Shopify es nuevo: dice cuánto confiar en el north-star
  // de GA4 mientras la tienda madura. Positivo = GA4 sobreestima.
  const reconGapPct =
    shopifyNow && shopifyNow.revenue > 0
      ? ((data.revenue - shopifyNow.revenue) / shopifyNow.revenue) * 100
      : null;

  // ── Top productos (último período de 30d del ETL, NO la semana exacta) ──
  const products = shopifyNowRes.data?.products ?? [];
  const productPeriod = shopifyNowRes.data?.productPeriod ?? null;
  const productPeriodLabel = productPeriod
    ? `${dayLabel(productPeriod.start)} – ${dayLabel(productPeriod.end)}`
    : '';
  const topProducts = products.slice(0, 5);
  const topMaxRev = topProducts.reduce((m, p) => Math.max(m, p.revenue), 0) || 1;

  const weekInput = {
    data,
    shopifyNow,
    shopifyPrev,
    currency: cur,
    implementationsCount: implementations.length,
  };

  // ── Accionables (motor puro) + badge + brief copiable ──
  const actions = buildEcommerceWeekActionables(weekInput);
  const openCount = countOpenActions(actions);
  const visible = showAll ? actions : actions.slice(0, MAX_VISIBLE);
  const hiddenCount = actions.length - visible.length;
  const brief = buildEcommerceWeekBrief(weekInput, client.name, rangeLabel, openCount);

  // ── Serie diaria de revenue (sparkline del pulso) ──
  const revenueSeries = data.dailyRevenue.map((d) => d.current);

  // ── Run-rate de inversión (proyección honesta, NO vs meta) ──
  // Sneakers no tiene budget objetivo guardado; proyectamos el gasto de la
  // semana a 30 días al ritmo actual y lo rotulamos como tal.
  const dailySpend = data.investment / 7;
  const projected30 = dailySpend * 30;

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const revDeltaTxt =
    data.revenueDelta !== 0 ? ` · ${formatDelta(data.revenueDelta)} vs. semana pasada` : '';

  return (
    <div className="view on">
      {/* ════ TITULAR + BRIEF COPIABLE ════ */}
      <div className="hero">
        <div className="hero-lbl">
          <span>⚡</span>
          <span>Esta semana · últimos 7 días · {rangeLabel}</span>
        </div>
        <div className="hero-title">
          {formatCurrency(data.revenue, cur)} de venta real a ROAS {formatROAS(data.roas)}
        </div>
        <div className="hero-sub" suppressHydrationWarning>
          {client.name} · venta de compra (GA4){revDeltaTxt} ·{' '}
          {openCount > 0 ? `${openCount} accionable${openCount > 1 ? 's' : ''}` : 'sin pendientes urgentes'}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={copyBrief}
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: copied ? GREEN : 'var(--t1)',
              background: 'var(--b2)',
              border: `1px solid ${copied ? GREEN : 'var(--b1)'}`,
              borderRadius: 8,
              padding: '8px 14px',
              cursor: 'pointer',
              transition: 'all .15s',
            }}
          >
            {copied ? '✓ Copiado' : '📋 Copiar resumen'}
          </button>
          <span style={{ fontSize: 11, color: MUTED }}>listo para reenviar (dueño + operador)</span>
        </div>
      </div>

      {/* ════ LOS TRES MUNDOS (tira honesta, nunca sumados) ════ */}
      <SectionLabel style={{ margin: '22px 0 10px' }}>Los tres mundos · esta semana</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
        <WorldCard
          accent={GA4_VIOLET}
          tag="Venta real · GA4"
          headline={formatCurrency(data.revenue, cur)}
          headlineSub={`ROAS real ${formatROAS(data.roas)}`}
          rows={[
            { k: 'Compras estimadas', v: formatInt(data.sales) },
            { k: 'CPA real', v: data.sales > 0 ? formatCurrency(data.cpa, cur) : '—' },
            { k: 'Inversión total', v: formatCurrency(data.investment, cur) },
          ]}
        />
        <WorldCard
          accent={GOOGLE_AMBER}
          tag="Intención · Google"
          headline={formatInt(data.addToCart)}
          headlineSub="add to cart (no venta)"
          rows={[
            { k: 'Valor de carritos', v: formatCurrency(data.addToCartValue, cur) },
            { k: 'ROAS ATC (proxy)', v: formatROAS(data.atcRoas) },
            { k: 'Gasto Google', v: formatCurrency(data.googleSpend, cur) },
          ]}
        />
        <WorldCard
          accent={META_BLUE}
          tag="Compra atribuida · Meta"
          headline={data.metaExists ? formatInt(data.metaPurchases) : '—'}
          headlineSub={data.metaExists ? 'compras (atribución propia)' : 'sin datos de Meta'}
          muted={!data.metaExists}
          rows={
            data.metaExists
              ? [
                  { k: 'Valor de compra Meta', v: formatCurrency(data.metaRevenue, cur) },
                  { k: 'ROAS Meta', v: formatROAS(data.metaRoas) },
                  { k: 'Gasto Meta', v: formatCurrency(data.metaSpend, cur) },
                ]
              : [{ k: 'Sin campañas activas', v: 'no se suma a GA4' }]
          }
        />
      </div>

      {/* ════ PULSO 7d vs 7d ════ */}
      <SectionLabel style={{ margin: '24px 0 10px' }}>Pulso · 7 días vs. 7 previos</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <PulseCard
          label="Revenue de compra"
          value={formatCurrency(data.revenue, cur)}
          accent={GA4_VIOLET}
          delta={formatDelta(data.revenueDelta)}
          deltaColor={data.revenueDelta >= 0 ? GREEN : RED}
          series={revenueSeries}
          seriesColor={GA4_VIOLET}
          sub="Venta estimada GA4 · north-star"
        />
        <PulseCard
          label="ROAS real"
          value={formatROAS(data.roas)}
          accent={GREEN}
          delta={`${data.roasDelta >= 0 ? '+' : ''}${data.roasDelta.toFixed(2)}×`}
          deltaColor={data.roasDelta >= 0 ? GREEN : RED}
          series={[]}
          seriesColor={GREEN}
          sub={`Sobre ${formatCurrency(data.investment, cur)} de inversión total`}
        />
        <PulseCard
          label="Inversión total"
          value={formatCurrency(data.investment, cur)}
          accent="#a78bfa"
          delta={formatDelta(data.investmentDelta)}
          deltaColor={MUTED}
          series={[]}
          seriesColor="#a78bfa"
          sub={`Google ${formatCurrency(data.googleSpend, cur)} · Meta ${formatCurrency(data.metaSpend, cur)}`}
          footer={
            <span style={{ color: MUTED }}>
              ≈ {formatCurrency(projected30, cur)} proyectado a 30 días al ritmo actual
            </span>
          }
        />
      </div>

      {/* ════ EVOLUCIÓN DE REVENUE DIARIO (7d actual vs 7d previo) ════ */}
      <RevenueEvolutionChart
        points={data.dailyRevenue}
        currency={cur}
        curLabel="Esta semana"
        prevLabel="Semana previa"
      />

      {/* ════ ANATOMÍA DE LA SEMANA (donut inversión + funnel Meta) ════ */}
      <SectionLabel style={{ margin: '24px 0 10px' }}>Anatomía de la semana</SectionLabel>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: data.metaExists ? 'repeat(auto-fit, minmax(280px, 1fr))' : '1fr',
          gap: 12,
        }}
      >
        <div className="card">
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t1)', marginBottom: 2 }}>Reparto de inversión</div>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 14 }}>Google vs. Meta · dónde va el presupuesto</div>
          <DonutChart
            segments={[
              { label: 'Google', value: data.googleSpend, color: GOOGLE_AMBER },
              { label: 'Meta', value: data.metaSpend, color: META_BLUE },
            ]}
            centerTop={formatCurrency(data.investment, cur)}
            centerSub="inversión total"
            currency={cur}
          />
        </div>

        {data.metaExists && (
          <div className="card">
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t1)', marginBottom: 2 }}>Funnel de Meta</div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 14 }}>View → Cart → Checkout → Compra · atribución propia de Meta</div>
            <Funnel
              stages={[
                { label: 'Contenido visto', value: data.metaViewContent, color: '#60a5fa' },
                { label: 'Add to cart', value: data.metaAddToCart, color: '#38bdf8' },
                { label: 'Checkout iniciado', value: data.metaInitiateCheckout, color: '#22d3ee' },
                { label: 'Compra', value: data.metaPurchases, color: GREEN },
              ]}
            />
          </div>
        )}
      </div>

      {/* ════ VENTA CONFIRMADA SHOPIFY (etiquetada, no se mezcla) ════ */}
      {hasShopify && shopifyNow && (
        <>
          <SectionLabel style={{ margin: '24px 0 10px' }}>Venta confirmada · Shopify</SectionLabel>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderLeft: `3px solid ${GREEN}` }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: GREEN }} />
            <span style={{ fontSize: 12.5, color: 'var(--t1)' }}>
              <b>{formatCurrency(shopifyNow.revenue, cur)}</b> en <b>{formatInt(shopifyNow.orders)}</b> pedidos ·{' '}
              ticket {formatCurrency(shopifyNow.avgOrderValue, cur)}
              {shopifyDelta != null && (
                <span style={{ color: shopifyDelta >= 0 ? GREEN : RED, marginLeft: 8, fontWeight: 600 }}>
                  {shopifyDelta >= 0 ? '+' : ''}
                  {shopifyDelta.toFixed(1)}% vs. semana pasada
                </span>
              )}
            </span>
            <span style={{ fontSize: 11, color: MUTED }}>dato confirmado · excluye pendientes · no se mezcla con GA4</span>
          </div>

          {/* Unit economics honestos (AOV, unidades/pedido) + reconciliación GA4 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginTop: 12 }}>
            <MiniStat
              accent={GREEN}
              label="Ticket promedio (AOV)"
              value={formatCurrency(shopifyNow.avgOrderValue, cur)}
              delta={aovDelta}
              sub="confirmado Shopify"
            />
            <MiniStat
              accent="#a78bfa"
              label="Unidades por pedido"
              value={unitsPerOrder.toFixed(2)}
              delta={null}
              sub={unitsPerOrder < 1.3 ? 'casi 1 par por compra · margen de cross-sell' : 'tamaño de carrito'}
            />
            <div className="card" style={{ borderTop: `3px solid ${GA4_VIOLET}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                GA4 vs. confirmado
              </div>
              {reconGapPct != null ? (
                <>
                  <div style={{ fontSize: 'clamp(20px, 5vw, 25px)', fontWeight: 800, color: Math.abs(reconGapPct) <= 15 ? GREEN : AMBER, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
                    {reconGapPct >= 0 ? '+' : ''}
                    {reconGapPct.toFixed(0)}%
                  </div>
                  <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
                    GA4 estima {formatCurrency(data.revenue, cur)} · Shopify confirma {formatCurrency(shopifyNow.revenue, cur)}.{' '}
                    {reconGapPct >= 0 ? 'GA4 sobreestima' : 'GA4 subestima'} la venta.
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: MUTED }}>Sin venta confirmada para reconciliar.</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ════ TOP PRODUCTOS (ventana rodante 30d del ETL, etiquetada) ════ */}
      {hasShopify && topProducts.length > 0 && (
        <>
          <SectionLabel style={{ margin: '24px 0 10px' }}>Top productos por venta</SectionLabel>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {topProducts.map((p, i) => (
              <div
                key={p.productId}
                style={{ padding: '11px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--b2)', display: 'flex', gap: 12, alignItems: 'center' }}
              >
                <span style={{ flex: '0 0 auto', width: 20, fontSize: 12, fontWeight: 700, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                  {i + 1}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--t1)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.title}
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--b2)', marginTop: 5, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(4, (p.revenue / topMaxRev) * 100)}%`, background: GREEN, borderRadius: 2 }} />
                  </div>
                </div>
                <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
                  <div style={{ fontSize: 12.5, color: 'var(--t1)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(p.revenue, cur)}
                  </div>
                  <div style={{ fontSize: 10.5, color: MUTED }}>{formatInt(p.unitsSold)} u · {formatInt(p.orders)} ped</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6 }}>
            Ventana rodante de 30 días del ETL ({productPeriodLabel}), no exactamente los 7 días de la semana.
          </div>
        </>
      )}

      {/* ════ ACCIONABLES (el corazón) ════ */}
      <SectionLabel style={{ margin: '24px 0 10px' }}>
        Accionables {openCount > 0 && <span style={{ color: MUTED }}>· {openCount}</span>}
      </SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visible.map((a) => (
          <ActionCard key={a.id} action={a} />
        ))}
      </div>
      {hiddenCount > 0 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          style={{
            marginTop: 10,
            fontSize: 12,
            color: 'var(--ac)',
            background: 'transparent',
            border: '1px solid var(--b1)',
            borderRadius: 8,
            padding: '8px 14px',
            cursor: 'pointer',
          }}
        >
          Ver {hiddenCount} accionable{hiddenCount > 1 ? 's' : ''} más
        </button>
      )}

      {/* ════ QUÉ HICIMOS ESTA SEMANA (bitácora 7d) ════ */}
      {implementations.length > 0 && (
        <>
          <SectionLabel style={{ margin: '24px 0 10px' }}>Qué hicimos esta semana</SectionLabel>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {implementations.map((it, i) => {
              const color = CH_COLOR[it.channel] ?? CH_COLOR.global;
              return (
                <div
                  key={`${it.date}-${i}`}
                  style={{ padding: '10px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--b2)', display: 'flex', gap: 11, alignItems: 'flex-start' }}
                >
                  <span style={{ flex: '0 0 auto', width: 9, height: 9, borderRadius: '50%', background: color, marginTop: 5 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--t1)' }}>
                      <b style={{ color: MUTED, fontWeight: 600 }}>{dayLabel(it.date)}</b> · {it.title}
                      <span style={{ marginLeft: 8, fontSize: 10, color, border: `1px solid ${color}66`, borderRadius: 4, padding: '1px 5px', textTransform: 'capitalize' }}>
                        {it.channel}
                      </span>
                    </div>
                    {it.detail && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2, lineHeight: 1.5 }}>{it.detail}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ════ NOTA DE HONESTIDAD DE DATOS ════ */}
      <div style={{ marginTop: 22, fontSize: 11, color: MUTED, lineHeight: 1.6 }}>
        Los tres mundos se miden por separado y nunca se suman: GA4 estima la venta real de compra
        (north-star), Google cuenta intención (add-to-cart), y Meta reporta compra con su propia
        atribución. Shopify, cuando hay dato, es la venta confirmada. La proyección de inversión es
        run-rate al ritmo actual, no una meta de presupuesto. El ticket promedio y las unidades por
        pedido son de venta confirmada Shopify. Las métricas de cliente (CAC, nuevo vs. recurrente,
        LTV) quedan en maduración: Shopify se conectó hace pocas semanas y aún marca casi todo como
        cliente nuevo, así que no las mostramos hasta que el histórico sea creíble.
      </div>

      <BackToTop />
    </div>
  );
}

// ── Donut SVG (segmentos por stroke-dasharray, total al centro) ──
function DonutChart({
  segments,
  centerTop,
  centerSub,
  currency,
}: {
  segments: { label: string; value: number; color: string }[];
  centerTop: string;
  centerSub: string;
  currency: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const SZ = 160;
  const R = 62;
  const C = 2 * Math.PI * R;
  const cx = SZ / 2;
  const cy = SZ / 2;

  if (total <= 0) {
    return <div style={{ fontSize: 12, color: MUTED, padding: '20px 0' }}>Sin inversión en la semana.</div>;
  }

  let acc = 0; // fracción acumulada
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s, i) => {
      const frac = s.value / total;
      const dash = frac * C;
      const gap = C - dash;
      const offset = -acc * C;
      acc += frac;
      return { key: i, color: s.color, dash, gap, offset };
    });

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`} style={{ flex: '0 0 auto' }}>
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--b2)" strokeWidth={16} />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx={cx}
              cy={cy}
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={16}
              strokeDasharray={`${a.dash.toFixed(2)} ${a.gap.toFixed(2)}`}
              strokeDashoffset={a.offset.toFixed(2)}
              strokeLinecap="butt"
            />
          ))}
        </g>
        <text x={cx} y={cy - 3} textAnchor="middle" style={{ fontSize: 15, fontWeight: 800, fill: 'var(--t1)' }}>
          {centerTop}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontSize: 9.5, fill: 'var(--mu)' }}>
          {centerSub}
        </text>
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 120 }}>
        {segments.map((s, i) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flex: '0 0 auto' }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--t1)', fontWeight: 600 }}>
                  {s.label} · {pct.toFixed(0)}%
                </div>
                <div style={{ fontSize: 10.5, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(s.value, currency)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Funnel (etapas decrecientes, barra + conversión paso a paso) ──
function Funnel({ stages }: { stages: { label: string; value: number; color: string }[] }) {
  const first = stages[0]?.value || 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {stages.map((s, i) => {
        const wpct = first > 0 ? Math.max((s.value / first) * 100, 2) : 0;
        const prev = i > 0 ? stages[i - 1].value : null;
        const stepConv = prev && prev > 0 ? (s.value / prev) * 100 : null;
        return (
          <div key={i}>
            {i > 0 && (
              <div style={{ fontSize: 10, color: MUTED, padding: '3px 0 3px 2px' }}>
                ↓ {stepConv != null ? `${stepConv.toFixed(stepConv < 10 ? 1 : 0)}%` : '—'} pasa al siguiente paso
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 11.5, color: 'var(--t1)', fontWeight: 600 }}>{s.label}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--t1)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {formatInt(s.value)}
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 3, background: 'var(--b2)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${wpct}%`, background: s.color, borderRadius: 3, transition: 'width .3s' }} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Mini-KPI (unit economics: valor + delta WoW opcional + sub) ──
function MiniStat({
  accent,
  label,
  value,
  delta,
  sub,
}: {
  accent: string;
  label: string;
  value: string;
  delta: number | null;
  sub: string;
}) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${accent}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 'clamp(20px, 5vw, 25px)', fontWeight: 800, color: 'var(--t1)', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {delta != null ? (
        <div style={{ fontSize: 12, fontWeight: 600, color: delta >= 0 ? GREEN : RED, fontVariantNumeric: 'tabular-nums' }}>
          {delta >= 0 ? '+' : ''}
          {delta.toFixed(1)}%<span style={{ color: MUTED, fontWeight: 400 }}> vs. semana pasada</span>
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: MUTED }}>{sub}</div>
      )}
      {delta != null && <div style={{ fontSize: 11, color: MUTED }}>{sub}</div>}
    </div>
  );
}

// ── Tarjeta de mundo (tag + titular + filas k/v) ─────────────
function WorldCard({
  accent,
  tag,
  headline,
  headlineSub,
  rows,
  muted,
}: {
  accent: string;
  tag: string;
  headline: string;
  headlineSub: string;
  rows: { k: string; v: string }[];
  muted?: boolean;
}) {
  return (
    <div className="card" style={{ borderLeft: `3px solid ${accent}`, display: 'flex', flexDirection: 'column', gap: 8, opacity: muted ? 0.72 : 1 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: 0.4 }}>{tag}</div>
      <div>
        <div style={{ fontSize: 'clamp(20px, 5vw, 25px)', fontWeight: 800, color: 'var(--t1)', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
          {headline}
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{headlineSub}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11.5 }}>
            <span style={{ color: MUTED }}>{r.k}</span>
            <span style={{ color: 'var(--t1)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tarjeta de pulso (KPI + delta + sparkline opcional) ──────
function PulseCard({
  label,
  value,
  accent,
  delta,
  deltaColor,
  series,
  seriesColor,
  sub,
  footer,
}: {
  label: string;
  value: string;
  accent: string;
  delta: string;
  deltaColor: string;
  series: number[];
  seriesColor: string;
  sub: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${accent}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 11.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
        <Sparkline points={series} color={seriesColor} />
      </div>
      <div style={{ fontSize: 'clamp(22px, 5.5vw, 28px)', fontWeight: 800, color: 'var(--t1)', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: deltaColor, fontVariantNumeric: 'tabular-nums' }}>
        {delta}
        <span style={{ color: MUTED, fontWeight: 400 }}> vs. semana pasada</span>
      </div>
      <div style={{ fontSize: 11, color: MUTED }}>{sub}</div>
      {footer && <div style={{ fontSize: 11.5, fontWeight: 600 }}>{footer}</div>}
    </div>
  );
}

// ── Mini-sparkline SVG (línea simple, baseline relativa a la serie) ──
function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (!points || points.length < 2) return null;
  const W = 96;
  const H = 26;
  const P = 2;
  const max = Math.max(...points);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const x = (i: number) => P + ((W - 2 * P) * i) / (points.length - 1);
  const y = (val: number) => H - P - ((val - min) / span) * (H - 2 * P);
  const d = points.map((val, i) => `${x(i).toFixed(1)},${y(val).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ flex: '0 0 auto' }}>
      <polyline points={d} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(last)} r="2.2" fill={color} />
    </svg>
  );
}

// ── Tarjeta de accionable ───────────────────────────────────
function ActionCard({ action }: { action: EcomWeekAction }) {
  const color = SEV_COLOR[action.severity];
  return (
    <div
      className="card"
      style={{ borderLeft: `3px solid ${color}`, display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14 }}
    >
      <span style={{ fontSize: 18, lineHeight: 1.2, flex: '0 0 auto' }}>{action.icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--t1)' }}>{action.title}</span>
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              color,
              border: `1px solid ${color}66`,
              borderRadius: 4,
              padding: '1px 6px',
              textTransform: 'uppercase',
              letterSpacing: 0.3,
            }}
          >
            {SEV_LABEL[action.severity]}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.55 }}>{action.body}</div>
        {action.href && (
          <Link href={action.href} style={{ display: 'inline-block', marginTop: 6, fontSize: 11.5, color: 'var(--ac)', textDecoration: 'none' }}>
            ver detalle →
          </Link>
        )}
      </div>
    </div>
  );
}
