'use client';

import { HeroHead } from '@/components/ui/BrandLogo';
import { useState, type MouseEvent } from 'react';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import {
  useGadsSearch,
  type SearchCampaign,
  type SearchKpis,
  type SearchDeltas,
  type SearchDailyPoint,
} from '@/lib/hooks/useGadsSearch';
import { PieChart, type PieSlice } from '@/components/ui/PieChart';
import { EmptyState } from '@/components/ui/EmptyState';

// ============================================================
// Search — réplica de la hoja "Search" de Looker, POR CAMPAÑA.
// Por cada campaña de tipo SEARCH muestra tres bloques:
//   ① 10 KPIs con tendencia diaria (sparkline) y delta vs período previo.
//   ② Tabla de términos de búsqueda (con la palabra clave que los disparó).
//   ③ 4 tortas por ciudad (conversiones / inversión / impresiones / coste-lead).
// 100% dato real desde gads_campaigns, gads_search_term_details y gads_geo.
// ============================================================

// ── Formateadores estilo Colombia (COP, coma decimal) ──
function fmtCOP(v: number): string {
  if (v == null || isNaN(v)) return '—';
  return `$ ${Math.round(v).toLocaleString('es-CO')}`;
}
function fmtInt(v: number): string {
  if (v == null || isNaN(v)) return '—';
  return Math.round(v).toLocaleString('es-CO');
}
function fmtPct(ratio: number, dec = 2): string {
  if (ratio == null || isNaN(ratio)) return '—';
  return `${(ratio * 100).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })} %`;
}

// Píldora de delta (verde sube / rojo baja), coloreada por signo como Looker.
function Delta({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: up ? '#34d399' : '#f87171', whiteSpace: 'nowrap' }}>
      {up ? '▲' : '▼'} {(up ? '+' : '') + value.toFixed(1)}%
    </span>
  );
}

// Día "5 jun" desde un ISO "YYYY-MM-DD" (sin líos de zona horaria).
const MESES_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fmtDay(iso?: string): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES_ABBR[(m || 1) - 1]}`;
}

// Mini sparkline (área + línea) en SVG puro, baseline en 0 (honesto).
// Al pasar el mouse (sin click) muestra el valor del día más cercano, como Looker.
function Spark({
  points,
  color,
  height = 34,
  dates,
  fmt,
}: {
  points: number[];
  color: string;
  height?: number;
  dates?: string[];
  fmt?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 120;
  const H = height;
  const n = points.length;
  if (n < 2) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', fontSize: 10, color: 'var(--mu)' }}>
        ≥2 días para ver tendencia
      </div>
    );
  }
  const max = Math.max(...points, 0.0001);
  const xAt = (i: number) => (W * i) / (n - 1);
  const yAt = (v: number) => H - 2 - (Math.max(v, 0) / max) * (H - 6);
  const coords = points.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`);
  const line = coords.join(' ');
  const area = `${line} ${W},${H} 0,${H}`;

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(n - 1, Math.round((x / rect.width) * (n - 1))));
    setHover(idx);
  };

  const leftPct = hover != null ? (hover / (n - 1)) * 100 : 0;
  const topPct = hover != null ? (yAt(points[hover]) / H) * 100 : 0;
  const fmtV = fmt ?? ((v: number) => Math.round(v).toLocaleString('es-CO'));

  return (
    <div
      style={{ position: 'relative', height: H }}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <polygon points={area} fill={color} fillOpacity={0.14} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      </svg>
      {hover != null && (
        <>
          {/* Guía vertical + punto en el día apuntado */}
          <div style={{ position: 'absolute', left: `${leftPct}%`, top: 0, bottom: 0, width: 1, background: color, opacity: 0.45, pointerEvents: 'none' }} />
          <div
            style={{
              position: 'absolute',
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: color,
              border: '1.5px solid var(--bg)',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }}
          />
          {/* Tooltip flotante con día + valor */}
          <div
            style={{
              position: 'absolute',
              left: `${leftPct}%`,
              bottom: H + 4,
              transform: `translateX(${leftPct > 70 ? '-90%' : leftPct < 30 ? '-10%' : '-50%'})`,
              background: 'var(--bg)',
              border: '1px solid var(--b2)',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 11,
              lineHeight: 1.35,
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <div style={{ color: 'var(--mu)' }}>{fmtDay(dates?.[hover])}</div>
            <div style={{ color: 'var(--tx)', fontWeight: 700 }}>{fmtV(points[hover])}</div>
          </div>
        </>
      )}
    </div>
  );
}

// Tarjeta KPI: etiqueta · valor · delta · sparkline.
// Variante `hero` (Coste) = más grande y la línea a la derecha del número,
// igual que el Looker original. Si deltaUnavailable, en vez del delta muestra
// un sello "nuevo" (sin histórico comparable) — honesto, sin números falsos.
function SparkKpi({
  label,
  value,
  delta,
  deltaUnavailable,
  points,
  color,
  hero = false,
  dates,
  fmt,
}: {
  label: string;
  value: string;
  delta: number;
  deltaUnavailable?: boolean;
  points: number[];
  color: string;
  hero?: boolean;
  dates?: string[];
  fmt?: (v: number) => string;
}) {
  const deltaNode = deltaUnavailable ? (
    <span
      title="Métrica nueva: aún no hay período anterior comparable. El delta aparecerá cuando se acumule historial."
      style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--mu)', whiteSpace: 'nowrap' }}
    >
      nuevo · sin histórico
    </span>
  ) : (
    <Delta value={delta} />
  );

  if (hero) {
    return (
      <div className="card" style={{ padding: '14px 18px', gridColumn: '1 / -1' }}>
        <div style={{ fontSize: 11, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginTop: 4 }}>
          <div>
            <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--tx)', lineHeight: 1.1 }}>{value}</div>
            <div style={{ marginTop: 4 }}>{deltaNode}</div>
          </div>
          <div style={{ flex: '1 1 260px', maxWidth: 520, minWidth: 200 }}>
            <Spark points={points} color={color} height={52} dates={dates} fmt={fmt} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ fontSize: 10.5, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: 0.3, lineHeight: 1.3, minHeight: 26 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--tx)', lineHeight: 1.25, marginTop: 2 }}>
        {value}
      </div>
      <div style={{ marginTop: 2, marginBottom: 6 }}>{deltaNode}</div>
      <Spark points={points} color={color} dates={dates} fmt={fmt} />
    </div>
  );
}

// Verde de marca con leves acentos para distinguir las 10 sparklines.
const KPI_COLOR = '#15803d';

function series(daily: SearchDailyPoint[], pick: (p: SearchDailyPoint) => number): number[] {
  return daily.map(pick);
}

// Bloque ① — 10 KPIs por campaña.
function KpiGrid({
  kpis,
  deltas,
  daily,
  shareDeltaReliable,
}: {
  kpis: SearchKpis;
  deltas: SearchDeltas;
  daily: SearchDailyPoint[];
  shareDeltaReliable: boolean;
}) {
  // "Coste" es la tarjeta destacada (hero) que encabeza el bloque, igual que el
  // Looker original. El resto (9 KPIs) va debajo en una rejilla compacta.
  const dates = daily.map((p) => p.date);
  const hero = { label: 'Coste', value: fmtCOP(kpis.cost), delta: deltas.cost, points: series(daily, (p) => p.cost), fmt: fmtCOP };
  const cards: { label: string; value: string; delta: number; points: number[]; fmt: (v: number) => string; deltaUnavailable?: boolean }[] = [
    { label: '% impresiones de búsqueda', value: fmtPct(kpis.impressionShare), delta: deltas.impressionShare, points: series(daily, (p) => p.impressionShare), fmt: (v) => fmtPct(v), deltaUnavailable: !shareDeltaReliable },
    { label: 'Impression Absolute Top %', value: fmtPct(kpis.absTopImpressionShare), delta: deltas.absTopImpressionShare, points: series(daily, (p) => p.absTopImpressionShare), fmt: (v) => fmtPct(v), deltaUnavailable: !shareDeltaReliable },
    { label: 'Avg. CPM', value: fmtCOP(kpis.cpm), delta: deltas.cpm, points: series(daily, (p) => p.cpm), fmt: fmtCOP },
    { label: 'Clics', value: fmtInt(kpis.clicks), delta: deltas.clicks, points: series(daily, (p) => p.clicks), fmt: fmtInt },
    { label: 'CPC medio', value: fmtCOP(kpis.cpc), delta: deltas.cpc, points: series(daily, (p) => p.cpc), fmt: fmtCOP },
    { label: 'CTR', value: fmtPct(kpis.ctr), delta: deltas.ctr, points: series(daily, (p) => p.ctr), fmt: (v) => fmtPct(v) },
    { label: 'Conversiones', value: fmtInt(kpis.conversions), delta: deltas.conversions, points: series(daily, (p) => p.conversions), fmt: fmtInt },
    { label: 'Coste/conv.', value: fmtCOP(kpis.costPerConv), delta: deltas.costPerConv, points: series(daily, (p) => p.costPerConv), fmt: fmtCOP },
    { label: 'Tasa de conversión', value: fmtPct(kpis.convRate), delta: deltas.convRate, points: series(daily, (p) => p.convRate), fmt: (v) => fmtPct(v) },
  ];
  return (
    <>
      <div style={{ marginTop: 14 }}>
        <SparkKpi label={hero.label} value={hero.value} delta={hero.delta} points={hero.points} color={KPI_COLOR} hero dates={dates} fmt={hero.fmt} />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
          gap: 12,
          marginTop: 12,
        }}
      >
        {cards.map((c) => (
          <SparkKpi
            key={c.label}
            label={c.label}
            value={c.value}
            delta={c.delta}
            deltaUnavailable={c.deltaUnavailable}
            points={c.points}
            color={KPI_COLOR}
            dates={dates}
            fmt={c.fmt}
          />
        ))}
      </div>
    </>
  );
}

// Mini-celda con barra de magnitud verde detrás del número (escala al máximo
// de la columna). Ayuda a leer "quién pesa más" sin mirar dígito por dígito.
function BarCell({ value, max, fmt }: { value: number; max: number; fmt: (v: number) => string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <td style={{ position: 'relative' }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 3,
          bottom: 3,
          width: `${(pct * 100).toFixed(1)}%`,
          background: 'rgba(21,128,61,0.22)',
          borderRadius: 4,
        }}
      />
      <span style={{ position: 'relative' }}>{fmt(value)}</span>
    </td>
  );
}

// Tarjeta de insight pequeña para la tira sobre la tabla.
function InsightStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'good' | 'bad' | 'neutral' }) {
  const accent = tone === 'good' ? '#34d399' : tone === 'bad' ? '#f87171' : 'var(--tx)';
  return (
    <div className="card" style={{ padding: '10px 14px', borderLeft: `3px solid ${accent}` }}>
      <div style={{ fontSize: 10.5, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: accent, lineHeight: 1.3, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// Bloque ② — tabla de términos de búsqueda (con paginación simple).
function TermsTable({ campaign }: { campaign: SearchCampaign }) {
  const [limit, setLimit] = useState(25);
  const terms = campaign.terms;
  const shown = terms.slice(0, limit);

  if (terms.length === 0) {
    return (
      <div className="card" style={{ marginTop: 16, padding: 18, borderStyle: 'dashed', borderColor: 'var(--b2)', fontSize: 12, color: 'var(--mu)' }}>
        Sin términos de búsqueda registrados para esta campaña en el período.
      </div>
    );
  }

  // ── Diagnóstico (todo dato real del período) ──
  const totalCost = terms.reduce((a, t) => a + t.cost, 0);
  const totalConv = terms.reduce((a, t) => a + t.conversions, 0);
  // Gasto que no produjo ninguna conversión (plata "desperdiciada").
  const wastedCost = terms.filter((t) => t.conversions === 0).reduce((a, t) => a + t.cost, 0);
  const wastedTerms = terms.filter((t) => t.conversions === 0 && t.cost > 0).length;
  // Mejor término por conversiones (desempate: menor coste/conv.).
  const converters = terms.filter((t) => t.conversions > 0);
  const best = converters.length
    ? converters.reduce((b, t) => (t.conversions > b.conversions || (t.conversions === b.conversions && t.costPerConv < b.costPerConv) ? t : b))
    : null;
  // Concentración: ¿qué % del gasto se va en el término #1?
  const topTerm = terms[0]; // ya viene ordenado por gasto desc
  const topShare = totalCost > 0 ? topTerm.cost / totalCost : 0;
  // Escalas para las barras de magnitud (máximo de toda la campaña, estable al paginar).
  const maxImpr = Math.max(...terms.map((t) => t.impressions), 1);
  const maxClicks = Math.max(...terms.map((t) => t.clicks), 1);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="dim-tbl-head">
        <div className="dim-tbl-title">
          <div className="dim-tbl-ic">🔎</div>
          <div>
            <div className="dim-tbl-label">Términos de búsqueda</div>
            <div className="dim-tbl-h">Qué buscó la gente · ordenado por gasto</div>
          </div>
        </div>
        <span className="period-pill">
          {shown.length} de {terms.length}
        </span>
      </div>

      {/* Tira de insights: lee la tabla por ti */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, padding: '0 14px 14px' }}>
        <InsightStat
          label="Gasto sin conversión"
          value={fmtCOP(wastedCost)}
          sub={`${fmtPct(totalCost > 0 ? wastedCost / totalCost : 0, 0)} del gasto · ${wastedTerms} término${wastedTerms === 1 ? '' : 's'}`}
          tone={wastedCost > 0 ? 'bad' : 'neutral'}
        />
        <InsightStat
          label="Mejor término"
          value={best ? best.searchTerm : '— sin conversiones'}
          sub={best ? `${fmtInt(best.conversions)} conv. · ${fmtCOP(best.costPerConv)} c/conv.` : `${fmtInt(totalConv)} conversiones en total`}
          tone={best ? 'good' : 'neutral'}
        />
        <InsightStat
          label="Concentración del gasto"
          value={fmtPct(topShare, 0)}
          sub={`en "${topTerm.searchTerm}" (#1 por gasto)`}
          tone="neutral"
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="t">
          <thead>
            <tr>
              <th style={{ width: 34, textAlign: 'right' }}>#</th>
              <th>Término de búsqueda</th>
              <th>Palabra clave de búsqueda</th>
              <th>Gasto</th>
              <th>Impresiones</th>
              <th>Clics</th>
              <th>CPC Promedio</th>
              <th>CTR</th>
              <th>Conversiones</th>
              <th>Coste/conv.</th>
              <th>Tasa de conversión</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t, i) => {
              const wasted = t.conversions === 0 && t.cost > 0;
              const isBest = best != null && t === best;
              const rowBg = isBest ? 'rgba(52,211,153,0.07)' : wasted ? 'rgba(248,113,113,0.06)' : undefined;
              const flag = isBest ? '#34d399' : wasted ? '#f87171' : 'transparent';
              return (
                <tr key={`${t.searchTerm}__${t.keyword}__${i}`} style={{ background: rowBg, boxShadow: `inset 3px 0 0 ${flag}` }}>
                  <td style={{ textAlign: 'right', color: 'var(--mu)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                  <td>
                    <b>{t.searchTerm}</b>
                    {isBest && <span title="Mejor término por conversiones" style={{ marginLeft: 6, fontSize: 10 }}>⭐</span>}
                    {wasted && <span title="Gastó sin convertir" style={{ marginLeft: 6, fontSize: 10 }}>⚠️</span>}
                  </td>
                  <td style={{ color: 'var(--mu)' }}>{t.keyword || '—'}</td>
                  <td>{fmtCOP(t.cost)}</td>
                  <BarCell value={t.impressions} max={maxImpr} fmt={fmtInt} />
                  <BarCell value={t.clicks} max={maxClicks} fmt={fmtInt} />
                  <td>{t.clicks > 0 ? fmtCOP(t.cpc) : '—'}</td>
                  <td style={{ background: 'rgba(21,128,61,0.05)' }}>{fmtPct(t.ctr)}</td>
                  <td style={{ fontWeight: t.conversions > 0 ? 700 : 400, color: t.conversions > 0 ? '#34d399' : 'var(--tx)' }}>{fmtInt(t.conversions)}</td>
                  <td>{t.conversions > 0 ? fmtCOP(t.costPerConv) : '—'}</td>
                  <td>{fmtPct(t.convRate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {terms.length > limit && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button
            onClick={() => setLimit((l) => l + 50)}
            style={{
              fontSize: 12,
              color: 'var(--tx)',
              background: 'transparent',
              border: '1px solid var(--b2)',
              borderRadius: 8,
              padding: '6px 14px',
              cursor: 'pointer',
            }}
          >
            Ver más términos ({terms.length - limit} restantes)
          </button>
        </div>
      )}
    </div>
  );
}

// Bloque ③ — 4 tortas por ciudad para ESTA campaña.
function CityPies({ campaign }: { campaign: SearchCampaign }) {
  const cities = campaign.cities;
  if (cities.length === 0) {
    return (
      <div className="card" style={{ marginTop: 16, padding: 18, borderStyle: 'dashed', borderColor: 'var(--b2)', fontSize: 12, color: 'var(--mu)' }}>
        Sin datos de localización para esta campaña en el período.
      </div>
    );
  }
  const convSlices: PieSlice[] = cities.map((c) => ({ label: c.city, value: c.conversions }));
  const costSlices: PieSlice[] = cities.map((c) => ({ label: c.city, value: c.cost }));
  const imprSlices: PieSlice[] = cities.map((c) => ({ label: c.city, value: c.impressions }));
  const cpaSlices: PieSlice[] = cities.filter((c) => c.conversions > 0).map((c) => ({ label: c.city, value: c.cpa }));

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--mu)', marginBottom: 10 }}>
        📍 ¿De qué ciudades vienen los resultados? · <span style={{ color: 'var(--tx)' }}>{campaign.campaignName}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <PieChart title="Conversiones (leads) por ciudad" slices={convSlices} formatValue={fmtInt} />
        <PieChart title="Inversión por ciudad" slices={costSlices} formatValue={fmtCOP} />
        <PieChart title="Impresiones por ciudad" slices={imprSlices} formatValue={fmtInt} />
        <PieChart title="Coste por lead por ciudad" slices={cpaSlices} formatValue={fmtCOP} />
      </div>
    </div>
  );
}

// Una campaña completa (los 3 bloques).
function CampaignSection({ campaign, previousLabel }: { campaign: SearchCampaign; previousLabel: string }) {
  const k = campaign.kpis;
  return (
    <div style={{ marginTop: 30 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>🔎 {campaign.campaignName}</h3>
        <span style={{ fontSize: 12, color: 'var(--mu)' }}>
          <b style={{ color: 'var(--tx)' }}>{fmtCOP(k.cost)}</b> invertido ·{' '}
          <b style={{ color: 'var(--tx)' }}>{fmtInt(k.conversions)}</b> leads · delta vs {previousLabel}
        </span>
      </div>

      <KpiGrid
        kpis={campaign.kpis}
        deltas={campaign.deltas}
        daily={campaign.daily}
        shareDeltaReliable={campaign.shareDeltaReliable}
      />
      <TermsTable campaign={campaign} />
      <CityPies campaign={campaign} />
    </div>
  );
}

export function Search() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useGadsSearch(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const previousLabel = formatRangeLabel(previous);

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>Cargando campañas Search de {client.name}…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view on">
        <div className="card" style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}>
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>Error cargando Search</div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || data.campaigns.length === 0) {
    if (!data?.existsEver) {
      return (
        <EmptyState
          icon="🔎"
          title="Sin campañas Search"
          message={
            <>
              {client.name} no tiene campañas de <b>Search</b> activas por el momento. En cuanto se lancen,
              aparecerán aquí automáticamente.
            </>
          }
        />
      );
    }
    return (
      <EmptyState
        icon="📅"
        title="Sin actividad Search en este período"
        message={
          <>
            {client.name} tiene campañas de Search, pero no registraron actividad entre <b>{rangeLabel}</b>.
          </>
        }
        hint="Prueba ampliar el rango de fechas con el filtro de arriba."
      />
    );
  }

  const totalCost = data.campaigns.reduce((a, c) => a + c.kpis.cost, 0);

  return (
    <div className="view on">
      <div className="hero">
        <HeroHead brand="google-ads">🔎 Search</HeroHead>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {data.campaigns.length} campaña
          {data.campaigns.length === 1 ? '' : 's'} · {fmtCOP(totalCost)} invertido
        </div>
      </div>

      {data.campaigns.map((c) => (
        <CampaignSection key={c.campaignId} campaign={c} previousLabel={previousLabel} />
      ))}

      <div className="card" style={{ marginTop: 24, borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Todos los números provienen directo de Google Ads (campañas, términos de búsqueda y localización).
          Las cuotas de impresión se reconstruyen sumando impresiones e impresiones elegibles del período —
          sin promedios engañosos ni datos inventados.
        </div>
      </div>
    </div>
  );
}
