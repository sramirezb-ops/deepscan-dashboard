'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useClient } from '@/lib/useClient';
import { useLeadsOverview } from '@/lib/hooks/useLeadsOverview';
import { useImplementations } from '@/lib/hooks/useImplementations';
import { formatRangeLabel } from '@/lib/period';
import { formatCurrency, formatInt, formatDelta } from '@/lib/utils';
import {
  weekRanges,
  buildWeekActionables,
  buildWeekBrief,
  countOpenActions,
  type WeekAction,
  type Severity,
} from '@/lib/week';
import { SectionLabel, BackToTop, TT_PINK } from './tiktokShared';

// ============================================================
// Week — "Esta semana" (Accionables) · digest semanal de leads (Ofero)
// ============================================================
// Cadencia FIJA: últimos 7 días vs. los 7 previos, ignorando el date-picker
// global. Responde dos preguntas que el Overview no: "¿qué cambió desde la
// semana pasada?" y "¿qué hago el lunes?". El corazón son los Accionables
// (motor de reglas en lib/week.ts); los KPIs solo los justifican. 100% real.
// ============================================================

const GREEN = '#4ade80';
const RED = '#f87171';
const AMBER = '#fbbf24';
const BLUE = '#60a5fa';
const MUTED = 'var(--mu)';
const GOOGLE_BLUE = '#60a5fa';

const CH_COLOR: Record<string, string> = { google: GOOGLE_BLUE, tiktok: TT_PINK, global: '#a78bfa' };

const SEV_COLOR: Record<Severity, string> = { critical: RED, warn: AMBER, info: BLUE, ok: GREEN };
const SEV_LABEL: Record<Severity, string> = { critical: 'Urgente', warn: 'Revisar', info: 'Nota', ok: 'En orden' };

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function dayLabel(iso: string): string {
  const p = iso.split('-');
  if (p.length < 3) return iso;
  return `${parseInt(p[2], 10)} ${MONTHS_ES[parseInt(p[1], 10) - 1] ?? ''}`.trim();
}

const MAX_VISIBLE = 5; // tope de accionables visibles; el resto se colapsa

export function Week() {
  const client = useClient();
  // Ventanas fijas de 7 días (memoizadas para no recomputar fechas cada render).
  const { range, previous } = useMemo(() => weekRanges(), []);
  const { data, loading, error } = useLeadsOverview(client.id, range, previous);
  const { items: implementations } = useImplementations(client.id, range, ['google', 'tiktok', 'global']);

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

  if (!data || !data.hasAny) {
    return (
      <div className="view on">
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: MUTED }}>
            Sin actividad de Google Ads ni TikTok en los últimos 7 días ({rangeLabel}) para {client.name}.
          </div>
        </div>
      </div>
    );
  }

  const cplTarget = client.cplTarget;
  const v = data.venta.combined;
  const g = data.venta.google.metrics;
  const t = data.venta.tiktok.metrics;
  const hasPrev = data.venta.hasPrev;
  const hasTarget = typeof cplTarget === 'number' && cplTarget > 0 && v.leads > 0;
  const overMeta = hasTarget && v.cpl > cplTarget!;

  // ── Accionables (motor puro) + badge + brief copiable ──
  const actions = buildWeekActionables({
    data,
    cplTarget,
    currency: cur,
    implementationsCount: implementations.length,
  });
  const openCount = countOpenActions(actions);
  const visible = showAll ? actions : actions.slice(0, MAX_VISIBLE);
  const hiddenCount = actions.length - visible.length;
  const brief = buildWeekBrief(data, cplTarget, cur, rangeLabel, openCount);

  // ── Series diarias (sparklines del pulso) ──
  const daily = data.venta.daily;
  const leadsSeries = daily.map((d) => d.leads);
  const cplSeries = daily.map((d) => d.cpl);
  const costSeries = daily.map((d) => d.cost);

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  // Titular de la semana en una frase.
  const headlineState = hasTarget ? (overMeta ? 'sobre la meta' : 'dentro de la meta') : '';
  const headlineDelta = hasPrev ? ` · ${formatDelta(data.venta.combinedDeltas.leads)} en leads vs. semana pasada` : '';

  return (
    <div className="view on">
      {/* ════ TITULAR + BRIEF COPIABLE ════ */}
      <div className="hero">
        <div className="hero-lbl">
          <span>⚡</span>
          <span>Esta semana · últimos 7 días · {rangeLabel}</span>
        </div>
        <div className="hero-title">
          {formatInt(v.leads)} leads a {formatCurrency(v.cpl, cur)} por lead
          {hasTarget && (
            <span style={{ color: overMeta ? RED : GREEN }}>
              {' '}
              ({headlineState})
            </span>
          )}
        </div>
        <div className="hero-sub" suppressHydrationWarning>
          {client.name} · Ventas de vehículos (Google + TikTok){headlineDelta} ·{' '}
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
          <span style={{ fontSize: 11, color: MUTED }}>3 líneas listas para reenviar al cliente</span>
        </div>
      </div>

      {/* ════ PULSO 7d vs 7d ════ */}
      <SectionLabel style={{ margin: '22px 0 10px' }}>Pulso · 7 días vs. 7 previos</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <PulseCard
          label="Leads generados"
          value={formatInt(v.leads)}
          accent={CH_COLOR.global}
          delta={hasPrev ? formatDelta(data.venta.combinedDeltas.leads) : 'sin semana previa'}
          deltaColor={!hasPrev ? MUTED : data.venta.combinedDeltas.leads >= 0 ? GREEN : RED}
          series={leadsSeries}
          seriesColor={CH_COLOR.global}
          sub={`Google ${formatInt(g.leads)} · TikTok ${formatInt(t.leads)}`}
        />
        <PulseCard
          label="CPL combinado"
          value={v.leads > 0 ? formatCurrency(v.cpl, cur) : '—'}
          accent={TT_PINK}
          delta={hasPrev ? formatDelta(data.venta.combinedDeltas.cpl) : 'sin semana previa'}
          deltaColor={!hasPrev ? MUTED : data.venta.combinedDeltas.cpl <= 0 ? GREEN : RED}
          series={cplSeries}
          seriesColor={TT_PINK}
          sub={`Google ${formatCurrency(g.cpl, cur)} · TikTok ${formatCurrency(t.cpl, cur)}`}
          footer={
            hasTarget ? (
              <span style={{ color: overMeta ? RED : GREEN }}>
                {overMeta ? '✗' : '✓'} Meta {formatCurrency(cplTarget!, cur)}
              </span>
            ) : null
          }
        />
        <PulseCard
          label="Inversión"
          value={formatCurrency(v.cost, cur)}
          accent="#a78bfa"
          delta={hasPrev ? formatDelta(data.venta.combinedDeltas.cost) : 'sin semana previa'}
          deltaColor={MUTED}
          series={costSeries}
          seriesColor="#a78bfa"
          sub={`Google ${formatCurrency(g.cost, cur)} · TikTok ${formatCurrency(t.cost, cur)}`}
        />
      </div>

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

      {/* ════ PROPIETARIOS (una línea, secundario) ════ */}
      {(data.propietarios.metrics.cost > 0 || data.propietarios.metrics.leads > 0) && (
        <>
          <SectionLabel style={{ margin: '24px 0 10px' }}>Propietarios · solo Google</SectionLabel>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: GOOGLE_BLUE }} />
            <span style={{ fontSize: 12.5, color: 'var(--t1)' }}>
              <b>{formatInt(data.propietarios.metrics.leads)}</b> leads ·{' '}
              <b>{data.propietarios.metrics.leads > 0 ? formatCurrency(data.propietarios.metrics.cpl, cur) : '—'}</b> CPL ·{' '}
              {formatCurrency(data.propietarios.metrics.cost, cur)} invertidos
            </span>
            <span style={{ fontSize: 11, color: MUTED }}>objetivo aparte · sin meta</span>
            <span style={{ flex: 1 }} />
            <Link href="/google-ads/propietarios" style={{ fontSize: 11.5, color: 'var(--ac)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              ver detalle →
            </Link>
          </div>
        </>
      )}

      <BackToTop />
    </div>
  );
}

// ── Tarjeta de pulso (KPI + delta + sparkline + decomposición) ──
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
      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--t1)', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
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
function ActionCard({ action }: { action: WeekAction }) {
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
