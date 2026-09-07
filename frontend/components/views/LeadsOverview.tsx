'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useLeadsOverview, type ChannelLeads } from '@/lib/hooks/useLeadsOverview';
import { useImplementations } from '@/lib/hooks/useImplementations';
import { formatCurrency, formatInt, formatDelta } from '@/lib/utils';
import { getMeasurementGaps, isInGap, gapsInRange } from '@/lib/measurementGaps';
import { TrendChart } from '@/components/ui/TrendChart';
import { SectionLabel, BackToTop, TT_PINK } from './tiktokShared';

// ============================================================
// LeadsOverview — Overview CONSOLIDADO de ambos canales (Ofero · negocio de LEADS)
// ============================================================
// Storytelling orientado a la META de CPL del mes:
//   1) Hero: veredicto (¿vamos a cumplir la meta?)
//   2) Tendencia diaria PRIMERO (con línea de meta)
//   3) Meta y ritmo: CPL vs meta, % de cumplimiento y el cálculo diario accionable
//   4) Ventas de vehículos: los números grandes + reparto por canal
//   5) Nota de medición (días con tracking caído, excluidos del "ritmo limpio")
// 100% dato real (useLeadsOverview). El "ritmo limpio" excluye los gaps de
// medición para no leer un bache de tracking como caída de rendimiento.
// ============================================================

const GREEN = '#4ade80';
const RED = '#f87171';
const MUTED = 'var(--mu)';

// Colores de marca por canal (para el reparto y los marcadores de bitácora).
const GOOGLE_BLUE = '#60a5fa';
const CH_COLOR: Record<string, string> = {
  google: GOOGLE_BLUE,
  tiktok: TT_PINK,
  global: '#a78bfa',
};

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 'YYYY-MM-DD' → '5 jun' (etiqueta corta para tooltips de tendencia). */
function dayLabel(iso: string): string {
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  return `${d} ${MONTHS_ES[m - 1] ?? ''}`.trim();
}

// ── Vista ────────────────────────────────────────────────────
export function LeadsOverview() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useLeadsOverview(client.id, range, previous);
  // Bitácora: implementaciones de los dos canales + las globales.
  const { items: implementations } = useImplementations(client.id, range, ['google', 'tiktok', 'global']);

  const rangeLabel = formatRangeLabel(range);
  const previousLabel = formatRangeLabel(previous);
  const cur = client.currency;

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: MUTED }}>Cargando overview de {client.name}…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view on">
        <div className="card" style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}>
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>Error cargando el overview</div>
          <div style={{ fontSize: 12, color: MUTED }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || !data.hasAny) {
    return (
      <div className="view on">
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: MUTED }}>
            Sin actividad de Google Ads ni TikTok en {rangeLabel} para {client.name}.
          </div>
        </div>
      </div>
    );
  }

  const venta = data.venta;
  const v = venta.combined;

  // ── Meta de CPL (solo Ventas de vehículos), desde client.cplTarget ──
  const cplTarget = client.cplTarget;
  const hasTarget = typeof cplTarget === 'number' && cplTarget > 0 && v.leads > 0;

  // ── Serie diaria combinada para las tendencias ──
  const daily = venta.daily;
  const labels = daily.map((d) => dayLabel(d.date));
  const leadsSeries = daily.map((d) => d.leads);
  const cplSeries = daily.map((d) => d.cpl);

  // ── Gaps de medición → "ritmo limpio" (excluye días sin tracking) ──
  const gaps = getMeasurementGaps(client.id);
  const rangeGaps = gapsInRange(gaps, data.from, data.to);
  const cleanDaily = daily.filter((d) => !isInGap(d.date, gaps));
  const baseDaily = cleanDaily.length >= 2 ? cleanDaily : daily;
  const recent = baseDaily.slice(-3); // últimos días limpios = ritmo actual
  const rSpend = recent.reduce((s, d) => s + d.cost, 0);
  const rLeads = recent.reduce((s, d) => s + d.leads, 0);
  const recentCpl = rLeads > 0 ? rSpend / rLeads : v.cpl;
  const recentLeadsDay = recent.length > 0 ? rLeads / recent.length : 0;
  const spendDay = recent.length > 0 ? rSpend / recent.length : 0;
  const trendDown = baseDaily.length >= 2 && baseDaily[baseDaily.length - 1].cpl < baseDaily[0].cpl;

  // vs meta, con el CPL de ritmo limpio (más honesto que el crudo del período)
  const metaPct = hasTarget ? Math.round((recentCpl / cplTarget!) * 100) : 0; // <100 = por debajo de meta (mejor)
  const overMeta = hasTarget && recentCpl > cplTarget!;
  const metaState: 'ok' | 'close' | 'far' = !overMeta ? 'ok' : recentCpl <= cplTarget! * 1.15 ? 'close' : 'far';
  const metaColor = metaState === 'ok' ? GREEN : metaState === 'close' ? 'var(--warn)' : RED;
  // cálculo diario: cuántos leads/día se necesitan para el CPL meta al gasto actual
  const needLeadsDay = hasTarget && cplTarget! > 0 ? Math.round(spendDay / cplTarget!) : 0;
  const gapLeadsDay = Math.max(0, needLeadsDay - Math.round(recentLeadsDay));
  // barra de cumplimiento (qué tan cerca del CPL meta): target/actual, cap 100%
  const fulfillPct = hasTarget && recentCpl > 0 ? Math.min(100, Math.round((cplTarget! / recentCpl) * 100)) : 0;

  // ── Marcadores de bitácora, anclados a la serie y coloreados por canal ──
  const dailyDates = daily.map((d) => d.date);
  const markedImpls = implementations.map((it, i) => {
    let idx = dailyDates.indexOf(it.date);
    if (idx < 0) {
      for (let k = dailyDates.length - 1; k >= 0; k--) {
        if (dailyDates[k] <= it.date) {
          idx = k;
          break;
        }
      }
    }
    if (idx < 0) idx = 0;
    return { it, index: idx, n: i + 1 };
  });
  const chartMarkers =
    daily.length >= 2
      ? markedImpls.map((m) => ({ index: m.index, n: m.n, color: CH_COLOR[m.it.channel] ?? CH_COLOR.global }))
      : undefined;

  // Pie de meta para el KPI de CPL combinado (usa el crudo del período).
  const overTargetCrudo = hasTarget && v.cpl > cplTarget!;
  const crudoGapPct = hasTarget ? Math.round(((v.cpl - cplTarget!) / cplTarget!) * 100) : 0;
  const cplMetaNode: ReactNode = hasTarget ? (
    <span style={{ color: overTargetCrudo ? RED : GREEN }}>
      {overTargetCrudo ? '✗' : '✓'} Meta {formatCurrency(cplTarget!, cur)} ·{' '}
      {overTargetCrudo ? `${crudoGapPct}% por encima` : `dentro de meta (${Math.abs(crudoGapPct)}% por debajo)`}
    </span>
  ) : null;

  // ── Propietarios (bloque secundario, solo Google) ──
  const prop = data.propietarios;
  const p = prop.metrics;
  const showProp = p.cost > 0 || p.leads > 0;
  const pDaily = prop.daily;
  const pLabels = pDaily.map((d) => dayLabel(d.date));
  const pCplSeries = pDaily.map((d) => d.cpl);

  // ── La jugada de hoy: UNA acción prioritaria, derivada del dato ──
  const g = venta.google.metrics;
  const t = venta.tiktok.metrics;
  const cheaper =
    g.leads > 0 && t.leads > 0 ? (g.cpl <= t.cpl ? venta.google : venta.tiktok) : g.leads > 0 ? venta.google : venta.tiktok;
  const pricier =
    g.leads > 0 && t.leads > 0 ? (g.cpl >= t.cpl ? venta.google : venta.tiktok) : g.leads > 0 ? venta.google : venta.tiktok;

  return (
    <div className="view on">
      {/* ════ HERO · el veredicto ════ */}
      <div className="hero">
        <div className="hero-lbl">
          <span>✦</span>
          <span>
            {hasTarget ? `Meta del período · CPL ≤ ${formatCurrency(cplTarget!, cur)}` : `Resumen ejecutivo · ${rangeLabel}`}
          </span>
        </div>
        {hasTarget ? (
          <>
            <div className="hero-title">
              Vamos a {formatCurrency(recentCpl, cur)} por lead. La meta es{' '}
              <span style={{ color: 'var(--acc)' }}>{formatCurrency(cplTarget!, cur)}</span>.
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  fontWeight: 700,
                  fontSize: 13,
                  padding: '6px 12px',
                  borderRadius: 999,
                  color: metaColor,
                  background: `color-mix(in srgb, ${metaColor} 14%, transparent)`,
                }}
              >
                {overMeta ? `▲ ${metaPct - 100}% arriba` : `✓ ${100 - metaPct}% bajo la meta`}
                {trendDown ? ' · y bajando' : ''}
              </span>
              <span className="hero-sub" style={{ marginTop: 0 }} suppressHydrationWarning>
                {client.name} · Google + TikTok · negocio de leads (sin ROAS)
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="hero-title">
              {formatInt(v.leads)} leads de Ventas de vehículos a {formatCurrency(v.cpl, cur)} por lead
            </div>
            <div className="hero-sub" suppressHydrationWarning>
              {client.name} · Google Ads + TikTok consolidados · negocio de leads (sin ROAS)
            </div>
          </>
        )}
      </div>

      {/* ════ 1 · TENDENCIA DIARIA (primero) ════ */}
      <SectionLabel style={{ margin: '20px 0 10px' }}>Tendencia diaria · camino a la meta</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <TrendChart
          title="CPL combinado por día"
          headline={hasTarget ? formatCurrency(recentCpl, cur) : v.leads > 0 ? formatCurrency(v.cpl, cur) : '—'}
          sub={hasTarget ? 'ritmo limpio · vs meta' : 'promedio del período · Google + TikTok'}
          points={cplSeries}
          labels={labels}
          color={TT_PINK}
          format={(n) => formatCurrency(n, cur)}
          goal={hasTarget ? cplTarget! : undefined}
          goalLabel={hasTarget ? `Meta ${formatCurrency(cplTarget!, cur)}` : undefined}
          markers={chartMarkers}
        />
        <TrendChart
          title="Leads por día"
          headline={formatInt(v.leads)}
          sub="total del período · Google + TikTok"
          points={leadsSeries}
          labels={labels}
          color={CH_COLOR.global}
          format={(n) => formatInt(n)}
          markers={chartMarkers}
        />
      </div>

      {/* Nota de medición: días con tracking caído, excluidos del ritmo limpio */}
      {rangeGaps.length > 0 && (
        <div
          className="card"
          style={{
            marginTop: 12,
            display: 'flex',
            gap: 11,
            alignItems: 'flex-start',
            borderColor: 'color-mix(in srgb, var(--warn) 35%, var(--b2))',
          }}
        >
          <span
            style={{
              flex: '0 0 auto',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.5,
              color: 'var(--warn)',
              border: '1px solid color-mix(in srgb, var(--warn) 45%, transparent)',
              borderRadius: 6,
              padding: '3px 7px',
              marginTop: 1,
            }}
          >
            MEDICIÓN
          </span>
          <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.5 }}>
            {rangeGaps.map((gp, i) => (
              <span key={i}>
                <b style={{ color: 'var(--t1)' }}>
                  {dayLabel(gp.from)}–{dayLabel(gp.to)}
                </b>{' '}
                {gp.reason} Esos días quedan <b style={{ color: 'var(--t2)' }}>fuera del "ritmo limpio"</b> y de la
                proyección.{i < rangeGaps.length - 1 ? ' ' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ════ 2 · META Y RITMO ════ */}
      {hasTarget && (
        <>
          <SectionLabel style={{ margin: '22px 0 10px' }}>Meta y ritmo del período</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(280px, 1.4fr)', gap: 12 }}>
            {/* CPL vs meta */}
            <div className="card" style={{ borderTop: `3px solid ${metaColor}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                CPL vs meta · ritmo limpio
              </div>
              <div style={{ fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: 800, color: 'var(--t1)', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(recentCpl, cur)}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: metaColor, fontVariantNumeric: 'tabular-nums' }}>
                {metaPct}% de la meta ({formatCurrency(cplTarget!, cur)})
              </div>
              <div style={{ height: 7, borderRadius: 6, background: 'var(--track, rgba(128,128,128,0.15))', overflow: 'hidden', marginTop: 8 }}>
                <div style={{ height: '100%', width: `${fulfillPct}%`, background: metaColor, borderRadius: 6 }} />
              </div>
              {rangeGaps.length > 0 && (
                <div style={{ fontSize: 11, color: MUTED, marginTop: 8, lineHeight: 1.4 }}>
                  CPL crudo del período {formatCurrency(v.cpl, cur)} — incluye días sin tracking ⚠️
                </div>
              )}
            </div>

            {/* El cálculo del día */}
            <div className="card" style={{ borderLeft: '3px solid var(--acc)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--acc)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                🎯 El cálculo del día · ¿vamos a cumplir?
              </div>
              {needLeadsDay > 0 ? (
                <>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--t1)', lineHeight: 1.5 }}>
                    A tu gasto actual (~{formatCurrency(spendDay, cur)}/día) necesitas{' '}
                    <b style={{ color: 'var(--acc)' }}>~{formatInt(needLeadsDay)} leads/día</b> para llegar a{' '}
                    {formatCurrency(cplTarget!, cur)}.
                  </div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--t1)', lineHeight: 1.5 }}>
                    Vas a <b>~{formatInt(Math.round(recentLeadsDay))} leads/día</b> →{' '}
                    {gapLeadsDay > 0 ? (
                      <b style={{ color: metaColor }}>te faltan ~{formatInt(gapLeadsDay)} leads/día</b>
                    ) : (
                      <b style={{ color: GREEN }}>ya cumples el ritmo ✓</b>
                    )}
                    .
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--t2)' }}>Sin datos limpios suficientes para el cálculo diario.</div>
              )}
              {cheaper && (
                <div style={{ fontSize: 12, color: MUTED, marginTop: 4, borderTop: '1px solid var(--b2)', paddingTop: 10, lineHeight: 1.5 }}>
                  Palanca:{' '}
                  {overMeta ? (
                    <>
                      escala <b style={{ color: 'var(--t2)' }}>{cheaper.label}</b> (el lead más barato,{' '}
                      {formatCurrency(cheaper.metrics.cpl, cur)}) y baja el CPL de{' '}
                      <b style={{ color: 'var(--t2)' }}>{pricier.label}</b> — cierra la brecha.
                    </>
                  ) : (
                    <>
                      dentro de meta: escala <b style={{ color: 'var(--t2)' }}>{cheaper.label}</b> (
                      {formatCurrency(cheaper.metrics.cpl, cur)}) para crecer sin romperla.
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ════ 3 · VENTAS DE VEHÍCULOS ════ */}
      <SectionLabel style={{ margin: '22px 0 10px' }}>Ventas de vehículos · Google + TikTok</SectionLabel>

      {/* 3 números grandes combinados */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <BigKpi
          label="Inversión total"
          value={formatCurrency(v.cost, cur)}
          accent="#a78bfa"
          deltaText={venta.hasPrev ? `${formatDelta(venta.combinedDeltas.cost)} vs. ${previousLabel}` : 'sin período anterior'}
          deltaColor={MUTED}
        />
        <BigKpi
          label="Leads generados"
          value={formatInt(v.leads)}
          accent={CH_COLOR.global}
          deltaText={venta.hasPrev ? `${formatDelta(venta.combinedDeltas.leads)} vs. ${previousLabel}` : 'sin período anterior'}
          deltaColor={!venta.hasPrev ? MUTED : venta.combinedDeltas.leads > 0 ? GREEN : venta.combinedDeltas.leads < 0 ? RED : MUTED}
        />
        <BigKpi
          label="Costo por lead (CPL) combinado"
          value={v.leads > 0 ? formatCurrency(v.cpl, cur) : '—'}
          accent={TT_PINK}
          deltaText={venta.hasPrev ? `${formatDelta(venta.combinedDeltas.cpl)} vs. ${previousLabel}` : 'sin período anterior'}
          deltaColor={!venta.hasPrev ? MUTED : venta.combinedDeltas.cpl < 0 ? GREEN : venta.combinedDeltas.cpl > 0 ? RED : MUTED}
          meta={cplMetaNode}
        />
      </div>

      {/* Reparto por canal (anti-trampa de mezcla) */}
      <RepartoBar google={venta.google} tiktok={venta.tiktok} />

      {/* Mini-tabla comparativa de 2 filas */}
      <div className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="t">
            <thead>
              <tr>
                <th>Canal</th>
                <th>Inversión</th>
                <th>Leads</th>
                <th>CPL</th>
                <th>% de leads</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <ChannelRow ch={venta.google} cur={cur} href="/google-ads" />
              <ChannelRow ch={venta.tiktok} cur={cur} href="/tiktok" />
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
        Google y TikTok son <b style={{ color: 'var(--t2)' }}>complementarios</b>, no rivales: traen leads del mismo
        objetivo en etapas distintas del embudo. Por eso mostramos el <b style={{ color: 'var(--t2)' }}>reparto</b>, no
        un ganador.
      </div>

      {/* Bitácora de implementaciones (leyenda de los marcadores, coloreada por canal) */}
      {markedImpls.length > 0 && (
        <div className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--b2)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>Implementaciones del período</span>
            <span style={{ fontSize: 11, color: MUTED }}>· lo que hicimos, marcado sobre la tendencia</span>
            <span style={{ flex: 1 }} />
            <ChannelLegendDot color={CH_COLOR.google} label="Google" />
            <ChannelLegendDot color={CH_COLOR.tiktok} label="TikTok" />
            <ChannelLegendDot color={CH_COLOR.global} label="Global" />
          </div>
          {markedImpls.map(({ it, n }) => {
            const color = CH_COLOR[it.channel] ?? CH_COLOR.global;
            return (
              <div
                key={`${it.date}-${n}`}
                style={{ padding: '10px 14px', borderTop: n === 1 ? 'none' : '1px solid var(--b2)', display: 'flex', gap: 11, alignItems: 'flex-start' }}
              >
                <span
                  style={{
                    flex: '0 0 auto',
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: color,
                    color: '#0b0b12',
                    fontSize: 10,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 1,
                  }}
                >
                  {n}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--t1)' }}>
                    <b style={{ color: MUTED, fontWeight: 600 }}>{dayLabel(it.date)}</b> · {it.title}
                    <span style={{ marginLeft: 8, fontSize: 10, color, border: `1px solid ${color}66`, borderRadius: 4, padding: '1px 5px', textTransform: 'capitalize' }}>
                      {it.channel}
                    </span>
                  </div>
                  {it.detail && (
                    <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2, lineHeight: 1.5 }}>{it.detail}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ════ 4 · PROPIETARIOS (SECUNDARIO · solo Google) ════ */}
      {showProp && (
        <>
          <SectionLabel style={{ margin: '28px 0 10px' }}>Propietarios · solo Google (Display)</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {/* Resumen compacto (sin meta: Propietarios no tiene objetivo de CPL) */}
            <div className="card" style={{ borderTop: `3px solid ${GOOGLE_BLUE}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Objetivo independiente
                </span>
                <Link href="/google-ads/propietarios" style={{ fontSize: 11.5, color: 'var(--acc)', textDecoration: 'none' }}>
                  ver detalle →
                </Link>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <MiniStat
                  label="Inversión"
                  value={formatCurrency(p.cost, cur)}
                  delta={prop.hasPrev ? `${formatDelta(prop.deltas.cost)} vs. ${previousLabel}` : 'sin período anterior'}
                  deltaColor={MUTED}
                />
                <MiniStat
                  label="Leads"
                  value={formatInt(p.leads)}
                  delta={prop.hasPrev ? `${formatDelta(prop.deltas.leads)}` : '—'}
                  deltaColor={!prop.hasPrev ? MUTED : prop.deltas.leads > 0 ? GREEN : prop.deltas.leads < 0 ? RED : MUTED}
                />
                <MiniStat
                  label="CPL"
                  value={p.leads > 0 ? formatCurrency(p.cpl, cur) : '—'}
                  delta={prop.hasPrev ? `${formatDelta(prop.deltas.cpl)}` : '—'}
                  deltaColor={!prop.hasPrev ? MUTED : prop.deltas.cpl < 0 ? GREEN : prop.deltas.cpl > 0 ? RED : MUTED}
                />
              </div>
              <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
                Propietarios es un objetivo <b style={{ color: 'var(--t2)' }}>aparte</b> (captación de quien vende su
                vehículo). No se suma ni se compara con Ventas de vehículos, y no tiene meta de CPL.
              </div>
            </div>

            {/* Tendencia diaria de CPL (sin línea de meta) */}
            {pDaily.length >= 2 ? (
              <TrendChart
                title="CPL de Propietarios por día"
                headline={p.leads > 0 ? formatCurrency(p.cpl, cur) : '—'}
                sub="promedio del período · solo Google"
                points={pCplSeries}
                labels={pLabels}
                color={GOOGLE_BLUE}
                format={(n) => formatCurrency(n, cur)}
              />
            ) : (
              <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140 }}>
                <span style={{ fontSize: 11.5, color: MUTED }}>Necesitas ≥2 días con datos para ver la tendencia</span>
              </div>
            )}
          </div>
        </>
      )}

      <BackToTop />
    </div>
  );
}

// ── Mini-estadística compacta (bloque Propietarios) ──────────
function MiniStat({ label, value, delta, deltaColor }: { label: string; value: string; delta: string; deltaColor: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div
        style={{
          fontSize: 'clamp(15px, 4.6vw, 20px)',
          fontWeight: 700,
          color: 'var(--t1)',
          lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={value}
      >
        {value}
      </div>
      <div style={{ fontSize: 10.5, color: deltaColor, fontVariantNumeric: 'tabular-nums' }}>{delta}</div>
    </div>
  );
}

// ── Barra de reparto por canal (leads) ───────────────────────
function RepartoBar({ google, tiktok }: { google: ChannelLeads; tiktok: ChannelLeads }) {
  const gPct = Math.round(google.leadShare * 100);
  const tPct = Math.round(tiktok.leadShare * 100);
  const totalLeads = google.metrics.leads + tiktok.metrics.leads;
  if (totalLeads <= 0) return null;
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Reparto de leads
        </span>
        <span style={{ fontSize: 11, color: MUTED }}>{formatInt(totalLeads)} leads en total</span>
      </div>
      <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: 'rgba(128,128,128,0.15)' }}>
        {google.metrics.leads > 0 && (
          <div style={{ width: `${gPct}%`, background: GOOGLE_BLUE }} title={`Google ${gPct}%`} />
        )}
        {tiktok.metrics.leads > 0 && (
          <div style={{ width: `${tPct}%`, background: TT_PINK }} title={`TikTok ${tPct}%`} />
        )}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11.5, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--t2)' }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: GOOGLE_BLUE, marginRight: 6 }} />
          Google {gPct}% · {formatInt(google.metrics.leads)} leads
        </span>
        <span style={{ color: 'var(--t2)' }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: TT_PINK, marginRight: 6 }} />
          TikTok {tPct}% · {formatInt(tiktok.metrics.leads)} leads
        </span>
      </div>
    </div>
  );
}

// ── Fila de canal en la mini-tabla ───────────────────────────
function ChannelRow({ ch, cur, href }: { ch: ChannelLeads; cur: string; href: string }) {
  const m = ch.metrics;
  const color = CH_COLOR[ch.channel] ?? CH_COLOR.global;
  return (
    <tr>
      <td>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
          <b>{ch.label}</b>
        </span>
      </td>
      <td>{formatCurrency(m.cost, cur)}</td>
      <td style={{ fontWeight: m.leads > 0 ? 700 : 400 }}>{formatInt(m.leads)}</td>
      <td>{m.leads > 0 ? formatCurrency(m.cpl, cur) : '—'}</td>
      <td>{Math.round(ch.leadShare * 100)}%</td>
      <td style={{ textAlign: 'right' }}>
        <Link href={href} style={{ fontSize: 11.5, color: 'var(--acc)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          ver detalle →
        </Link>
      </td>
    </tr>
  );
}

function ChannelLegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: MUTED }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      {label}
    </span>
  );
}

// ── KPI grande (Inversión / Leads / CPL), con pie de meta opcional ──
function BigKpi({
  label,
  value,
  accent,
  deltaText,
  deltaColor,
  meta,
}: {
  label: string;
  value: string;
  accent: string;
  deltaText: string;
  deltaColor: string;
  meta?: ReactNode;
}) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${accent}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 12, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: 800, color: 'var(--t1)', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: deltaColor, fontVariantNumeric: 'tabular-nums' }}>{deltaText}</div>
      {meta && <div style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{meta}</div>}
    </div>
  );
}
