'use client';

import type { ReactNode } from 'react';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useTikTok } from '@/lib/hooks/useTikTok';
import type { TikTokCampaignRow, TikTokDailyPoint } from '@/lib/hooks/useTikTok';
import { useImplementations } from '@/lib/hooks/useImplementations';
import {
  formatCurrency,
  formatInt,
  formatNumber,
  formatPercent,
  formatDelta,
} from '@/lib/utils';
import { TrendChart } from '@/components/ui/TrendChart';
import {
  TT_PINK,
  TT_CYAN,
  TikTokLoading,
  TikTokError,
  TikTokEmpty,
  TikTokHero,
  VideoStat,
  WatchTimeStat,
  RetentionCurve,
  SectionLabel,
  BackToTop,
} from './tiktokShared';

// ============================================================
// TikTok Ads · OVERVIEW — reporte ejecutivo y gerencial (Ofero, negocio de LEADS)
// ============================================================
// Vista 1 de 3. Pensada para que un gerente entienda en 5 segundos: ¿cómo
// vamos, qué se movió y qué hay que atender? Todo se DERIVA del dato real del
// rango (tabla tiktok_campaigns) — nunca se inventan cifras ni superlativos que
// no podamos verificar.
//
// Decisiones de UX gerencial:
//   · Los % "explosivos" (cuando el período previo fue casi nulo) se cuentan en
//     ABSOLUTO ("2,4× — de 253 a 2.153") en vez de "+751 %", que parece error.
//   · El titular INTERPRETA el dato (no repite las tarjetas) y el veredicto es
//     lo más visible de la página.
//   · Las métricas se agrupan en bandas con rótulo para no saturar.
//   · Lo táctico (CPC/CPM, retención de video) va más abajo.
// ============================================================

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Umbral a partir del cual un crecimiento se cuenta como múltiplo ("2,4×") en
// vez de porcentaje: +200 % = 3×. Por debajo, el % se lee bien.
const BIG_GROWTH = 200;

const GREEN = '#4ade80';
const RED = '#f87171';
const AMBER = '#fbbf24';
const MUTED = 'var(--mu)';

/** Múltiplo legible en español: 8.51 → "8,5". */
function fmtMult(m: number): string {
  return m.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Texto compacto de variación: múltiplo para crecimientos grandes ("2,4×"),
 *  porcentaje (acotado a 1000 %) para el resto. NO incluye "vs. anterior". */
function growthText(pct: number): string {
  if (pct >= BIG_GROWTH) return `${fmtMult(1 + pct / 100)}×`;
  if (Math.abs(pct) >= 1000) return `${pct > 0 ? '+' : '−'}1000%+`;
  return formatDelta(pct);
}

/** 'YYYY-MM-DD' → '5 jun' (etiqueta corta para los tooltips de tendencia). */
function dayLabel(iso: string): string {
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  return `${d} ${MONTHS_ES[m - 1] ?? ''}`.trim();
}

/** Serie diaria del PERÍODO completo: suma spend/leads/impresiones de todas las
 *  campañas por fecha y re-deriva el CPL de ese día (nunca promedia promedios). */
function periodDaily(campaigns: TikTokCampaignRow[]): TikTokDailyPoint[] {
  const map = new Map<string, { spend: number; conversions: number; impressions: number }>();
  for (const c of campaigns) {
    for (const d of c.daily) {
      const e = map.get(d.date) ?? { spend: 0, conversions: 0, impressions: 0 };
      e.spend += d.spend;
      e.conversions += d.conversions;
      e.impressions += d.impressions;
      map.set(d.date, e);
    }
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, e]) => ({
      date,
      spend: e.spend,
      conversions: e.conversions,
      impressions: e.impressions,
      cpl: e.conversions > 0 ? e.spend / e.conversions : 0,
      reach: 0,
      frequency: 0,
      ctr: 0,
      cpm: 0,
    }));
}

/** Dirección global de una serie: compara el promedio del primer tercio con el
 *  del último. Devuelve etiqueta corta para el subtítulo de la tendencia. */
function trendDir(series: number[]): string {
  const n = series.length;
  if (n < 4) return '';
  const k = Math.max(1, Math.floor(n / 3));
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const head = avg(series.slice(0, k));
  const tail = avg(series.slice(-k));
  if (head <= 0 && tail <= 0) return '';
  const ch = (tail - head) / (head || 1);
  if (ch > 0.1) return '▲ al alza';
  if (ch < -0.1) return '▼ a la baja';
  return '▬ estable';
}

export function TikTok() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useTikTok(client.id, range, previous);
  // Bitácora: implementaciones de TikTok + las globales (valen para todo canal).
  const { items: implementations } = useImplementations(client.id, range, ['tiktok', 'global']);

  const rangeLabel = formatRangeLabel(range);
  const previousLabel = formatRangeLabel(previous);
  const cur = client.currency;

  if (loading && !data) return <TikTokLoading clientName={client.name} />;
  if (error) return <TikTokError error={error} />;
  if (!data || data.totals.spend === 0)
    return <TikTokEmpty data={data} clientName={client.name} rangeLabel={rangeLabel} />;

  const t = data.totals;
  const v = data.video;

  // ¿Hay un período anterior real con el que comparar? (evita falsos "+∞" /
  // "CPL subió" cuando el período previo simplemente no tenía datos).
  const hasPrev = data.campaigns.some((c) => c.prev && c.prev.spend > 0);

  const leadsUp = data.conversionsDelta > 0;
  const leadsDown = data.conversionsDelta < 0;
  const cplCheaper = data.cplDelta < 0;
  const cplPricier = data.cplDelta > 0;

  // ── Meta de CPL acordada con el cliente (objetivo de negocio, no dato de la
  //    plataforma). Solo aplica si hay leads reales con los que calcular el CPL. ──
  const cplTarget = client.cplTarget;
  const hasTarget = typeof cplTarget === 'number' && cplTarget > 0 && t.conversions > 0;
  const overTarget = hasTarget && t.cpl > cplTarget!;
  const targetGapPct = hasTarget ? Math.round(((t.cpl - cplTarget!) / cplTarget!) * 100) : 0;

  // ── Veredicto (la conclusión más visible de la página) ──
  const positives = (leadsUp ? 1 : 0) + (cplCheaper ? 1 : 0);
  const negatives = (leadsDown ? 1 : 0) + (cplPricier ? 1 : 0);
  let verdict: { label: string; color: string };
  if (!hasPrev) verdict = { label: 'Primer período', color: MUTED };
  else if (positives > 0 && negatives === 0) verdict = { label: 'Mejorando', color: GREEN };
  else if (negatives > 0 && positives === 0) verdict = { label: 'Requiere atención', color: RED };
  else if (positives > 0 && negatives > 0) verdict = { label: 'Resultado mixto', color: AMBER };
  else verdict = { label: 'Estable', color: MUTED };

  const cplDeltaLabel = (data.cplDelta >= 0 ? '+' : '−') + formatCurrency(Math.abs(data.cplDelta), cur);

  // ── Reconstrucción de los totales del período anterior (para el marco
  //    absoluto del titular). prev = cur / (1 + delta%/100), exacto salvo redondeo. ──
  const prevLeads = data.conversionsDelta > -100 ? Math.round(t.conversions / (1 + data.conversionsDelta / 100)) : 0;

  // ── Frase interpretativa del titular (no repite las tarjetas grandes) ──
  const cplClause: ReactNode = cplCheaper ? (
    <>
      , y abarataste el lead <b>{formatCurrency(Math.abs(data.cplDelta), cur)}</b> hasta{' '}
      {formatCurrency(t.cpl, cur)}
    </>
  ) : cplPricier ? (
    <>
      , aunque el lead se encareció <b>{formatCurrency(Math.abs(data.cplDelta), cur)}</b> hasta{' '}
      {formatCurrency(t.cpl, cur)}
    </>
  ) : (
    <>
      , manteniendo el costo por lead en <b>{formatCurrency(t.cpl, cur)}</b>
    </>
  );

  const narrative: ReactNode = !hasPrev ? (
    <>Es el primer período con datos: aún no hay un período anterior con el cual comparar.</>
  ) : data.conversionsDelta >= BIG_GROWTH ? (
    <>
      Multiplicaste los leads <b>{fmtMult(1 + data.conversionsDelta / 100)}×</b> — de{' '}
      {formatInt(prevLeads)} a <b>{formatInt(t.conversions)}</b> — frente al período anterior{cplClause}.
    </>
  ) : (
    <>
      Generaste <b>{formatInt(t.conversions)} leads</b> ({formatDelta(data.conversionsDelta)} vs.
      anterior){cplClause}.
    </>
  );

  // ── Tendencia diaria del período (leads, CPL, inversión) ──
  const daily = periodDaily(data.campaigns);
  const labels = daily.map((d) => dayLabel(d.date));
  const leadsSeries = daily.map((d) => d.conversions);
  const cplSeries = daily.map((d) => d.cpl);
  const spendSeries = daily.map((d) => d.spend);
  const subWith = (base: string, dir: string) => (dir ? `${base} · ${dir}` : base);

  // ── Marcadores de la bitácora alineados a la tendencia ──
  // Cada implementación se ancla al día exacto de la serie o, si ese día no
  // tuvo actividad, al último día con datos anterior. Se numeran en orden
  // cronológico (el hook ya las devuelve por fecha ascendente).
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
  const chartMarkers = daily.length >= 2 ? markedImpls.map((m) => ({ index: m.index, n: m.n })) : undefined;

  // ── Top movimientos: campañas con mayor cambio de leads vs. período anterior ──
  const movers = hasPrev
    ? data.campaigns
        .filter((c) => c.prev && (c.prev.conversions > 0 || c.conversions > 0))
        .map((c) => {
          const prevC = c.prev!.conversions;
          const leadsChange = c.conversions - prevC;
          const leadsPct = prevC > 0 ? ((c.conversions - prevC) / prevC) * 100 : null;
          const cplChange = c.prev!.cpl > 0 && c.cpl > 0 ? c.cpl - c.prev!.cpl : null;
          return { c, leadsChange, leadsPct, cplChange };
        })
        .sort((a, b) => Math.abs(b.leadsChange) - Math.abs(a.leadsChange))
        .slice(0, 5)
    : [];
  const moverMax = Math.max(1, ...movers.map((m) => Math.abs(m.leadsChange)));

  // ── Retos detectados (solo del dato real), ordenados por gravedad ──
  const challenges: { title: string; detail: ReactNode; weight: number }[] = [];
  if (overTarget) {
    challenges.push({
      weight: 4,
      title: 'CPL por encima de la meta',
      detail: (
        <>
          El costo por lead (<b>{formatCurrency(t.cpl, cur)}</b>) está <b>{targetGapPct}%</b> por encima
          de la meta de <b>{formatCurrency(cplTarget!, cur)}</b> acordada con el cliente. Es la prioridad:
          revisa qué campañas tienen el CPL más alto y reasigna presupuesto hacia las más eficientes.
        </>
      ),
    });
  }
  if (hasPrev && cplPricier) {
    challenges.push({
      weight: 3,
      title: 'El costo por lead subió',
      detail: (
        <>
          El CPL pasó a <b>{formatCurrency(t.cpl, cur)}</b> ({cplDeltaLabel} vs. {previousLabel}). Vale
          la pena revisar qué conjuntos están encareciendo el lead.
        </>
      ),
    });
  }
  if (hasPrev && leadsDown) {
    challenges.push({
      weight: 3,
      title: 'Los leads bajaron',
      detail: (
        <>
          Se generaron <b>{formatInt(t.conversions)} leads</b> ({formatDelta(data.conversionsDelta)} vs.{' '}
          {previousLabel}). Revisa si bajó la inversión o el rendimiento de las campañas clave.
        </>
      ),
    });
  }
  if (t.frequency >= 3) {
    challenges.push({
      weight: 2,
      title: 'Frecuencia alta',
      detail: (
        <>
          Cada persona vio el anuncio <b>{t.frequency.toFixed(2)} veces</b> en promedio. Por encima de
          3× el público empieza a saturarse: conviene refrescar creativos o ampliar la segmentación.
        </>
      ),
    });
  }
  if (hasPrev && data.ctrDelta < 0) {
    challenges.push({
      weight: 2,
      title: 'El CTR cayó',
      detail: (
        <>
          El CTR bajó a <b>{formatPercent(t.ctr, 2)}</b> (
          {(data.ctrDelta >= 0 ? '+' : '−') + formatPercent(Math.abs(data.ctrDelta), 2)} vs.{' '}
          {previousLabel}). Suele ser señal de fatiga del creativo.
        </>
      ),
    });
  }
  if (v.views > 0 && v.hookRate < 0.3) {
    challenges.push({
      weight: 1,
      title: 'Gancho débil en los videos',
      detail: (
        <>
          Solo el <b>{formatPercent(v.hookRate, 1)}</b> de las reproducciones pasó de los 2 segundos. Un
          gancho por debajo del 30 % deja mucho presupuesto en gente que se va al instante.
        </>
      ),
    });
  }
  if (daily.length < 2) {
    challenges.push({
      weight: 1,
      title: 'Pocos días con datos',
      detail: (
        <>
          El rango tiene <b>{daily.length === 1 ? '1 día' : 'menos de 2 días'}</b> con actividad; aún no
          alcanza para leer una tendencia confiable. Amplía el período para un panorama más estable.
        </>
      ),
    });
  }
  challenges.sort((a, b) => b.weight - a.weight);

  // ── Helpers de pie de tarjeta (delta o descripción), con color honesto ──
  const arrow = (d: number) => (d > 0 ? '▲' : d < 0 ? '▼' : '■');
  const pctFoot = (deltaPct: number, good: 'up' | 'down' | 'neutral'): ReactNode => {
    if (!hasPrev) return <span style={{ color: MUTED }}>sin período anterior</span>;
    const up = deltaPct > 0;
    const down = deltaPct < 0;
    const color =
      good === 'neutral' ? MUTED : good === 'up' ? (up ? GREEN : down ? RED : MUTED) : down ? GREEN : up ? RED : MUTED;
    return (
      <span style={{ color }}>
        {arrow(deltaPct)} {growthText(deltaPct)} vs. anterior
      </span>
    );
  };
  const ctrFoot: ReactNode = hasPrev ? (
    <span style={{ color: data.ctrDelta >= 0 ? GREEN : RED }}>
      {arrow(data.ctrDelta)} {(data.ctrDelta >= 0 ? '+' : '−') + formatPercent(Math.abs(data.ctrDelta), 2)} vs.
      anterior
    </span>
  ) : (
    <span style={{ color: MUTED }}>sin período anterior</span>
  );
  const ctx = (txt: string): ReactNode => <span style={{ color: MUTED }}>{txt}</span>;

  // Pie de meta para el KPI de CPL: «Meta $2.800 · 31% por encima / dentro de meta».
  const cplMetaNode: ReactNode = hasTarget ? (
    <span style={{ color: overTarget ? RED : GREEN }}>
      {overTarget ? '✗' : '✓'} Meta {formatCurrency(cplTarget!, cur)} ·{' '}
      {overTarget
        ? `${targetGapPct}% por encima`
        : `dentro de meta (${Math.abs(targetGapPct)}% por debajo)`}
    </span>
  ) : null;

  return (
    <div className="view on">
      <TikTokHero
        title="TikTok Ads · Overview"
        sub={<>Reporte ejecutivo del rendimiento como negocio de leads</>}
      />

      {/* 1 · Titular ejecutivo: veredicto prominente + frase interpretativa ── */}
      <div className="card" style={{ marginTop: 4, borderLeft: `3px solid ${verdict.color}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              width: 11,
              height: 11,
              borderRadius: '50%',
              background: verdict.color,
              boxShadow: `0 0 9px ${verdict.color}`,
            }}
          />
          <span style={{ fontSize: 19, fontWeight: 800, color: verdict.color, letterSpacing: 0.2 }}>
            {verdict.label}
          </span>
          <span style={{ fontSize: 12, color: MUTED }}>
            · {rangeLabel} · {client.name}
          </span>
        </div>
        <div style={{ fontSize: 14.5, color: 'var(--t2)', lineHeight: 1.6 }}>{narrative}</div>
      </div>

      {/* 2 · Leads + CPL en grande (los números que mandan) ──────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 12,
          marginTop: 12,
        }}
      >
        <BigKpi
          label="Leads generados"
          value={formatInt(t.conversions)}
          accent={TT_CYAN}
          deltaText={hasPrev ? `${growthText(data.conversionsDelta)} vs. ${previousLabel}` : 'sin período anterior'}
          deltaColor={!hasPrev ? MUTED : leadsUp ? GREEN : leadsDown ? RED : MUTED}
        />
        <BigKpi
          label="Costo por lead (CPL)"
          value={t.conversions > 0 ? formatCurrency(t.cpl, cur) : '—'}
          accent={TT_PINK}
          deltaText={hasPrev ? `${cplDeltaLabel} ${cplCheaper ? '(más barato)' : cplPricier ? '(más caro)' : ''}`.trim() : 'sin período anterior'}
          deltaColor={!hasPrev ? MUTED : cplCheaper ? GREEN : cplPricier ? RED : MUTED}
          meta={cplMetaNode}
        />
      </div>

      {/* 3 · Banda «Inversión y alcance» ─────────────────────────────────── */}
      <SectionLabel style={{ margin: '22px 0 10px' }}>Inversión y alcance</SectionLabel>
      <div style={statGrid}>
        <StatCard label="Inversión" value={formatCurrency(t.spend, cur)} foot={pctFoot(data.spendDelta, 'neutral')} />
        <StatCard label="Alcance" value={formatNumber(t.reach)} foot={pctFoot(data.reachDelta, 'up')} />
        <StatCard label="Impresiones" value={formatNumber(t.impressions)} foot={pctFoot(data.impressionsDelta, 'up')} />
        <StatCard
          label="Frecuencia"
          value={t.reach > 0 ? `${t.frequency.toFixed(2)}×` : '—'}
          foot={ctx('impresiones por persona')}
        />
      </div>

      {/* 4 · Banda «Eficiencia del embudo» ───────────────────────────────── */}
      <SectionLabel style={{ margin: '18px 0 10px' }}>Eficiencia del embudo</SectionLabel>
      <div style={statGrid}>
        <StatCard label="CTR" value={formatPercent(t.ctr, 2)} foot={ctrFoot} />
        <StatCard label="Tasa de conversión" value={formatPercent(t.cvr, 2)} foot={ctx('leads ÷ clics')} />
        <StatCard label="CPC" value={t.clicks > 0 ? formatCurrency(t.cpc, cur) : '—'} foot={ctx('costo por clic')} />
        <StatCard label="CPM" value={t.impressions > 0 ? formatCurrency(t.cpm, cur) : '—'} foot={ctx('costo por mil impr.')} />
      </div>
      <div style={{ fontSize: 11.5, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>
        Estructura: <b style={{ color: 'var(--t2)' }}>{formatInt(data.campaignCount)}</b> campañas ·{' '}
        <b style={{ color: 'var(--t2)' }}>{formatInt(data.adgroupCount)}</b> conjuntos ·{' '}
        <b style={{ color: 'var(--t2)' }}>{formatInt(data.adCount)}</b> anuncios ·{' '}
        <b style={{ color: 'var(--t2)' }}>{formatNumber(v.views)}</b> reproducciones de video.
      </div>

      {/* 5 · Tendencia diaria ────────────────────────────────────────────── */}
      <SectionLabel style={{ margin: '24px 0 10px' }}>Tendencia diaria</SectionLabel>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
        }}
      >
        <TrendChart
          title="Leads por día"
          headline={formatInt(t.conversions)}
          sub={subWith('total del período', trendDir(leadsSeries))}
          points={leadsSeries}
          labels={labels}
          color={TT_CYAN}
          format={(n) => formatInt(n)}
          markers={chartMarkers}
        />
        <TrendChart
          title="CPL por día"
          headline={t.conversions > 0 ? formatCurrency(t.cpl, cur) : '—'}
          sub={subWith('promedio del período', trendDir(cplSeries))}
          points={cplSeries}
          labels={labels}
          color={TT_PINK}
          format={(n) => formatCurrency(n, cur)}
          goal={hasTarget ? cplTarget! : undefined}
          goalLabel={hasTarget ? `Meta ${formatCurrency(cplTarget!, cur)}` : undefined}
          markers={chartMarkers}
        />
        <TrendChart
          title="Inversión por día"
          headline={formatCurrency(t.spend, cur)}
          sub={subWith('total del período', trendDir(spendSeries))}
          points={spendSeries}
          labels={labels}
          color="#a78bfa"
          format={(n) => formatCurrency(n, cur)}
          markers={chartMarkers}
        />
      </div>

      {/* 5b · Bitácora de implementaciones (leyenda de los marcadores) ──────── */}
      {markedImpls.length > 0 && (
        <div className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--b2)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#a78bfa' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>
              Implementaciones del período
            </span>
            <span style={{ fontSize: 11, color: MUTED }}>
              · lo que hicimos, marcado sobre la tendencia
            </span>
          </div>
          {markedImpls.map(({ it, n }) => (
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
                  background: '#a78bfa',
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
                  {it.kind && it.kind !== 'otro' && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 10,
                        color: '#c4b5fd',
                        border: '1px solid rgba(167,139,250,0.4)',
                        borderRadius: 4,
                        padding: '1px 5px',
                        textTransform: 'uppercase',
                        letterSpacing: 0.3,
                      }}
                    >
                      {it.kind}
                    </span>
                  )}
                </div>
                {it.detail && (
                  <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2, lineHeight: 1.5 }}>{it.detail}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 6 · Top movimientos por campaña (con barra de magnitud) ──────────── */}
      <SectionLabel style={{ margin: '24px 0 10px' }}>Top movimientos por campaña</SectionLabel>
      {movers.length > 0 ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {movers.map(({ c, leadsChange, leadsPct, cplChange }, i) => {
            const up = leadsChange > 0;
            const flat = leadsChange === 0;
            const color = flat ? MUTED : up ? GREEN : RED;
            return (
              <div
                key={c.campaignId}
                style={{ padding: '12px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--b2)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--t1)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {c.name}
                    </div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                      {formatInt(c.conversions)} leads ·{' '}
                      {c.conversions > 0 ? `${formatCurrency(c.cpl, cur)} / lead` : 'sin leads'} ·{' '}
                      {formatCurrency(c.spend, cur)} invertido
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color }}>
                      {arrow(leadsChange)} {up ? '+' : ''}
                      {formatInt(leadsChange)} leads
                    </div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                      {leadsPct != null
                        ? Math.abs(leadsPct) >= 1000
                          ? `${leadsPct > 0 ? '+' : '−'}1000%+`
                          : `${leadsPct >= 0 ? '+' : ''}${leadsPct.toFixed(0)}%`
                        : 'campaña nueva'}
                      {cplChange != null && (
                        <>
                          {' · '}CPL {cplChange <= 0 ? '−' : '+'}
                          {formatCurrency(Math.abs(cplChange), cur)}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    height: 5,
                    borderRadius: 3,
                    background: 'rgba(255,255,255,0.05)',
                    marginTop: 10,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${(Math.abs(leadsChange) / moverMax) * 100}%`,
                      background: color,
                      borderRadius: 3,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card" style={{ borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
          <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
            Sin período anterior con datos: cuando exista una comparación, aquí verás las campañas que
            más cambiaron en leads.
          </div>
        </div>
      )}

      {/* 7 · Retos detectados (ordenados por gravedad) ────────────────────── */}
      <SectionLabel style={{ margin: '24px 0 10px' }}>
        Retos detectados{challenges.length > 0 ? ` (${challenges.length})` : ''}
      </SectionLabel>
      {challenges.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 12,
          }}
        >
          {challenges.map((ch, i) => (
            <div
              key={i}
              className="card"
              style={{ borderLeft: `3px solid ${AMBER}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}
            >
              <span style={{ fontSize: 16, lineHeight: 1.2, color: AMBER }}>⚠</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>
                  {ch.title}
                </div>
                <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.55 }}>{ch.detail}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ borderLeft: `3px solid ${GREEN}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 16, lineHeight: 1.2, color: GREEN }}>✓</span>
          <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.55 }}>
            Sin alertas: frecuencia, CPL, CTR, leads y gancho de video están en rango saludable para el
            período.
          </div>
        </div>
      )}

      {/* 8 · Retención global de los videos (lo más táctico, abajo) ───────── */}
      {v.views > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 4,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <h3 style={{ margin: 0, fontSize: '15px' }}>Retención global de los videos</h3>
            <span className="period-pill">{formatNumber(v.views)} reproducciones</span>
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 16, lineHeight: 1.5 }}>
            El <b>gancho (2s)</b> mide cuántos no se fueron en el primer segundo; la{' '}
            <b>retención (6s)</b>, cuántos siguen enganchados; y la <b>curva</b> (25→100 %) muestra
            dónde cae la atención. Es el promedio de todos los anuncios del período. El detalle por
            creativo está en <b>Retención de los anuncios</b>.
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 16,
            }}
          >
            <VideoStat label="Gancho (vieron 2s)" pct={v.hookRate} abs={v.watched2s} color={TT_PINK} />
            <VideoStat label="Retención (6s)" pct={v.holdRate} abs={v.watched6s} color={TT_CYAN} />
            <VideoStat label="Video completo" pct={v.completionRate} abs={v.completes} color="#22d97a" />
            <WatchTimeStat seconds={v.avgWatchTime} />
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', marginBottom: 10 }}>
              Curva de retención
            </div>
            <RetentionCurve v={v} />
          </div>
        </div>
      )}

      {/* Nota honesta */}
      <div className="card" style={{ marginTop: 20, borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Cómo leer este reporte</h3>
        <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
          Es el <b>resumen ejecutivo</b> de TikTok Ads como negocio de <b>leads</b>: manda la cantidad de{' '}
          <b>leads</b> (conversiones reales del píxel/evento de TikTok) y su <b>costo por lead (CPL)</b>.
          El <b>veredicto</b>, el <b>titular</b>, los <b>movimientos</b> y los <b>retos</b> se calculan
          automáticamente a partir del propio dato del rango — no hay cifras inventadas ni superlativos
          que no podamos verificar. Cuando un crecimiento es enorme (porque el período anterior casi no
          tuvo actividad) lo mostramos como <b>múltiplo</b> (ej. 2,4×) en vez de un porcentaje que
          parecería un error. El desglose campaña → conjunto → anuncio está en{' '}
          <b>Resultados por campañas</b> y el rendimiento de cada creativo en{' '}
          <b>Retención de los anuncios</b>. Todo proviene de la tabla <code>tiktok_campaigns</code>, que
          la sincronización llena a diario desde la TikTok Marketing API.
        </div>
      </div>

      <BackToTop />
    </div>
  );
}

const statGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  gap: 10,
};

// Tarjeta de métrica uniforme: rótulo + valor + pie (delta o descripción).
// El pie ya viene coloreado por quien la invoca, para no duplicar la lógica de
// "bueno/malo" (que difiere métrica a métrica).
function StatCard({ label, value, foot }: { label: string; value: string; foot: ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg3)',
        border: '1px solid var(--b2)',
        borderRadius: 10,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{foot}</div>
    </div>
  );
}

// KPI grande para la jerarquía Leads + CPL del reporte ejecutivo.
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
  meta?: ReactNode; // pie opcional de meta (objetivo de negocio)
}) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${accent}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 12, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--t1)', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: deltaColor, fontVariantNumeric: 'tabular-nums' }}>
        {deltaText}
      </div>
      {meta && <div style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{meta}</div>}
    </div>
  );
}
