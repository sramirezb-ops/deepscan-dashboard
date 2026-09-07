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
import { useGadsSearchAds, type SearchAdsCampaign, type SearchAdRow } from '@/lib/hooks/useGadsSearchAds';
import { PieChart, type PieSlice } from '@/components/ui/PieChart';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSortableTable, type SortAccessor } from '@/components/ui/useSortableTable';

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

  // Sorting Looker: ordena toda la lista (orden por defecto: gasto desc del backend)
  // y luego recorta a `limit`. Las barras y el diagnóstico usan el array original.
  const termAccessors: SortAccessor<(typeof terms)[number]>[] = [
    null, // # (índice)
    (r) => r.searchTerm,
    (r) => r.keyword,
    (r) => r.cost,
    (r) => r.impressions,
    (r) => r.clicks,
    (r) => r.cpc,
    (r) => r.ctr,
    (r) => r.conversions,
    (r) => r.costPerConv,
    (r) => r.convRate,
  ];
  const { rows: sortedTerms, headerProps } = useSortableTable(terms, termAccessors);
  const shown = sortedTerms.slice(0, limit);

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
              <th {...headerProps(1)}>Término de búsqueda</th>
              <th {...headerProps(2)}>Palabra clave de búsqueda</th>
              <th {...headerProps(3)}>Gasto</th>
              <th {...headerProps(4)}>Impresiones</th>
              <th {...headerProps(5)}>Clics</th>
              <th {...headerProps(6)}>CPC Promedio</th>
              <th {...headerProps(7)}>CTR</th>
              <th {...headerProps(8)}>Conversiones</th>
              <th {...headerProps(9)}>Coste/conv.</th>
              <th {...headerProps(10)}>Tasa de conversión</th>
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

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--mu)', marginBottom: 10 }}>
        📍 ¿De qué ciudades vienen los resultados? · <span style={{ color: 'var(--tx)' }}>{campaign.campaignName}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <PieChart title="Conversiones (leads) por ciudad" slices={convSlices} formatValue={fmtInt} />
        <PieChart title="Inversión por ciudad" slices={costSlices} formatValue={fmtCOP} />
        <PieChart title="Impresiones por ciudad" slices={imprSlices} formatValue={fmtInt} />
        <CityCplTable campaign={campaign} />
      </div>
    </div>
  );
}

// CPL por ciudad HONESTO: ponderado (gasto ÷ leads), no la suma de CPL por
// ciudad (una micro-zona con 1 lead no puede pesar igual que Bogotá). Filtra
// ciudades con muy pocos leads que distorsionan la lectura.
const MIN_LEADS_CITY = 20;
function CityCplTable({ campaign }: { campaign: SearchCampaign }) {
  const target = useClient().cplTarget;
  const totalLeads = campaign.cities.reduce((a, c) => a + c.conversions, 0);
  const rows = campaign.cities.filter((c) => c.conversions >= MIN_LEADS_CITY).sort((a, b) => b.conversions - a.conversions);
  const sumCost = rows.reduce((a, c) => a + c.cost, 0);
  const sumLeads = rows.reduce((a, c) => a + c.conversions, 0);

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>CPL por ciudad</div>
        <span className="period-pill">≥ {MIN_LEADS_CITY} leads</span>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--mu)' }}>Ninguna ciudad supera {MIN_LEADS_CITY} leads en el período.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="t">
            <thead>
              <tr>
                <th>Ciudad</th>
                <th>Leads</th>
                <th>CPL</th>
                <th>Part.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const ok = target ? c.cpa <= target : true;
                return (
                  <tr key={c.city}>
                    <td><b>{c.city}</b></td>
                    <td>{fmtInt(c.conversions)}</td>
                    <td style={{ fontWeight: 800, color: target ? (ok ? '#34d399' : '#f87171') : 'var(--tx)' }}>{fmtCOP(c.cpa)}</td>
                    <td>{totalLeads > 0 ? fmtPct(c.conversions / totalLeads, 0) : '—'}</td>
                  </tr>
                );
              })}
              <tr className="t-avg">
                <td>Ponderado</td>
                <td>{fmtInt(sumLeads)}</td>
                <td style={{ fontWeight: 800 }}>{fmtCOP(sumLeads > 0 ? sumCost / sumLeads : 0)}</td>
                <td>{totalLeads > 0 ? fmtPct(sumLeads / totalLeads, 0) : '—'}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ fontSize: 10.5, color: 'var(--mu)', marginTop: 8, lineHeight: 1.5 }}>
            CPL <b>ponderado</b> (gasto ÷ leads), no la suma de CPL por ciudad. Se excluyen micro-zonas &lt;{MIN_LEADS_CITY} leads.
          </div>
        </div>
      )}
    </div>
  );
}

// Sección "Por anuncio" (RSA): compara los anuncios de la campaña por su
// contribución. Revela cuáles hacen el trabajo y cuáles están muertos.
function PerAdSection({ ads }: { ads: SearchAdsCampaign }) {
  const rows = ads.ads;
  const [tip, setTip] = useState<{ x: number; y: number; a: SearchAdRow } | null>(null);
  const max = Math.max(...rows.map((a) => a.conversions), 0.0001);
  const totalConv = rows.reduce((a, r) => a + r.conversions, 0);
  // Insight: ¿cuántos anuncios concentran el ~90% de las conversiones?
  const sorted = [...rows].sort((a, b) => b.conversions - a.conversions);
  let acc = 0;
  let vital = 0;
  for (const a of sorted) { if (totalConv > 0 && acc / totalConv >= 0.9) break; acc += a.conversions; vital++; }
  const dead = rows.filter((a) => !a.active).length;

  return (
    <div className="card" style={{ marginTop: 16, position: 'relative' }}>
      <div className="dim-tbl-head">
        <div className="dim-tbl-title">
          <div className="dim-tbl-ic">🖼️</div>
          <div>
            <div className="dim-tbl-label">Por anuncio · RSA</div>
            <div className="dim-tbl-h">Qué anuncio hace el trabajo · por contribución</div>
          </div>
        </div>
        <span className="period-pill">{ads.adCount} anuncios</span>
      </div>
      {totalConv > 0 && (
        <div style={{ padding: '0 14px 12px', fontSize: 12.5, color: 'var(--mu)', lineHeight: 1.5 }}>
          <b style={{ color: 'var(--tx)' }}>{vital} de {ads.adCount} anuncios</b> concentran el ~90% de las conversiones
          {dead > 0 && <> · <b style={{ color: '#f87171' }}>{dead} sin actividad</b></>}. Renueva o pausa los que no rinden y concentra el aprendizaje del algoritmo en los que sí.
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table className="t">
          <thead>
            <tr>
              <th style={{ width: 34, textAlign: 'right' }}>#</th>
              <th>Anuncio · titular estrella</th>
              <th>Impr.</th>
              <th>Clics</th>
              <th>CTR</th>
              <th>Conv. (contrib.)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => {
              const w = Math.round((a.conversions / max) * 100);
              return (
                <tr
                  key={a.adId}
                  onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, a })}
                  onMouseLeave={() => setTip(null)}
                >
                  <td style={{ textAlign: 'right', color: 'var(--mu)' }}>{i + 1}</td>
                  <td>
                    <b>{a.topText}</b>
                    {!a.active && <span title="Sin impresiones en el período" style={{ marginLeft: 6, fontSize: 10, color: '#f87171' }}>· sin actividad</span>}
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--mu)' }}>anuncio …{a.adId.slice(-6)}</span>
                  </td>
                  <td>{fmtInt(a.impressions)}</td>
                  <td>{fmtInt(a.clicks)}</td>
                  <td>{fmtPct(a.ctr)}</td>
                  <td style={{ position: 'relative', minWidth: 120 }}>
                    <div aria-hidden style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: `${w}%`, background: 'rgba(52,211,153,0.18)', borderRadius: 4 }} />
                    <span style={{ position: 'relative', fontWeight: a.conversions > 0 ? 700 : 400, color: a.conversions > 0 ? '#34d399' : 'var(--tx)' }}>{fmtInt(a.conversions)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--mu)', padding: '10px 14px 0', lineHeight: 1.5 }}>
        Métricas de <b>contribución por asset</b> del anuncio (titulares y descripciones). Google <b>no atribuye costo por anuncio</b> en RSA: sirve para comparar anuncios entre sí, no como reparto del total. El titular mostrado es el que más convierte de cada anuncio.
      </div>
      {tip && (
        <div className="chart-tooltip on" style={{ left: `${tip.x}px`, top: `${tip.y + (typeof window !== 'undefined' ? window.scrollY : 0)}px` }}>
          <div className="chart-tooltip-date">{tip.a.topText.slice(0, 42)}</div>
          <div className="chart-tooltip-rows">
            <TtRow lbl="Conv. (contrib.)" val={fmtInt(tip.a.conversions)} dot="#34d399" />
            <TtRow lbl="Impresiones" val={fmtInt(tip.a.impressions)} />
            <TtRow lbl="Clics" val={fmtInt(tip.a.clicks)} />
            <TtRow lbl="CTR" val={fmtPct(tip.a.ctr)} />
          </div>
        </div>
      )}
    </div>
  );
}

function TtRow({ lbl, val, dot }: { lbl: string; val: string; dot?: string }) {
  return (
    <div className="chart-tooltip-row">
      <div className="chart-tooltip-row-lbl"><span className="chart-tooltip-row-dot" style={{ background: dot || 'transparent' }} />{lbl}</div>
      <div className="chart-tooltip-row-val">{val}</div>
    </div>
  );
}

// Una campaña completa: header + KPIs (desplegables) + términos + por anuncio + ciudades.
function CampaignSection({ campaign, ads, previousLabel, target }: { campaign: SearchCampaign; ads?: SearchAdsCampaign; previousLabel: string; target?: number }) {
  const k = campaign.kpis;
  const [showKpis, setShowKpis] = useState(false);
  const cpl = k.costPerConv;
  const ok = target ? cpl <= target : true;
  return (
    <div style={{ marginTop: 30 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>🔎 {campaign.campaignName}</h3>
        <span style={{ fontSize: 12, color: 'var(--mu)' }}>
          <b style={{ color: 'var(--tx)' }}>{fmtCOP(k.cost)}</b> invertido ·{' '}
          <b style={{ color: 'var(--tx)' }}>{fmtInt(k.conversions)}</b> leads
        </span>
        {target && (
          <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: ok ? 'rgba(52,211,153,0.14)' : 'rgba(248,113,113,0.14)', color: ok ? '#34d399' : '#f87171' }}>
            CPL {fmtCOP(cpl)} · {Math.round((cpl / target) * 100)}% de la meta {ok ? '✓' : '⚠'}
          </span>
        )}
      </div>

      {/* KPIs detallados con tendencia — desplegables (foco inicial en lo accionable) */}
      <button
        onClick={() => setShowKpis((s) => !s)}
        style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: 'var(--tx)', background: 'transparent', border: '1px solid var(--b2)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}
      >
        {showKpis ? '▴ Ocultar métricas detalladas' : '▾ Ver métricas detalladas (10 KPIs + tendencia)'}
      </button>
      {showKpis && (
        <KpiGrid
          kpis={campaign.kpis}
          deltas={campaign.deltas}
          daily={campaign.daily}
          shareDeltaReliable={campaign.shareDeltaReliable}
        />
      )}

      <TermsTable campaign={campaign} />
      {ads && ads.adCount > 0 && <PerAdSection ads={ads} />}
      <CityPies campaign={campaign} />
    </div>
  );
}

export function Search() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useGadsSearch(client.id, range, previous);
  const ads = useGadsSearchAds(client.id, range);

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

  // ── Totales y diagnóstico (dato real agregado) ──
  const totalCost = data.campaigns.reduce((a, c) => a + c.kpis.cost, 0);
  const totalLeads = data.campaigns.reduce((a, c) => a + c.kpis.conversions, 0);
  const totalImpr = data.campaigns.reduce((a, c) => a + c.kpis.impressions, 0);
  const totalClicks = data.campaigns.reduce((a, c) => a + c.kpis.clicks, 0);
  const cpl = totalLeads > 0 ? totalCost / totalLeads : 0;
  const totalCtr = totalImpr > 0 ? totalClicks / totalImpr : 0;
  const convRate = totalClicks > 0 ? totalLeads / totalClicks : 0;
  let wastedCost = 0;
  let wastedTerms = 0;
  data.campaigns.forEach((c) =>
    c.terms.forEach((t) => {
      if (t.conversions === 0 && t.cost > 0) {
        wastedCost += t.cost;
        wastedTerms += 1;
      }
    })
  );

  const target = client.cplTarget;
  const underMeta = target ? cpl <= target : false;
  const ratio = target ? cpl / target : 0;
  const wastedPct = totalCost > 0 ? wastedCost / totalCost : 0;

  // Anuncios por campaña (match por nombre, robusto entre tablas).
  const adsByName = new Map((ads.data?.campaigns ?? []).map((c) => [c.campaignName.trim(), c]));

  return (
    <div className="view on">
      <div className="hero">
        <HeroHead brand="google-ads">🔎 Search</HeroHead>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {data.campaigns.length} campaña
          {data.campaigns.length === 1 ? '' : 's'} · {fmtCOP(totalCost)} invertido · {fmtInt(totalLeads)} leads
        </div>
      </div>

      {/* HERO VERDICT — Search caro, pero ¿más calificado? */}
      <div className="card" style={{ padding: '24px 26px', marginTop: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--acc, #7c3aed)' }}>
          Search · costo por lead vs meta
        </div>
        <div style={{ fontSize: 'clamp(21px,3vw,29px)', fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.15, margin: '10px 0 0' }}>
          Search cuesta <span style={{ color: '#f87171' }}>{fmtCOP(cpl)}</span> por lead{target ? <> — {ratio.toFixed(1)}× la meta</> : null}.
          <br />Pero más caro <span style={{ color: '#14b8a6' }}>no es peor si el lead es más calificado</span>.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          {target && (
            <span style={{ fontWeight: 700, fontSize: 13, padding: '6px 12px', borderRadius: 999, background: 'rgba(248,113,113,0.14)', color: '#f87171' }}>
              ▲ {Math.round((ratio - 1) * 100)}% sobre la meta ({fmtCOP(target)})
            </span>
          )}
          <span style={{ fontWeight: 700, fontSize: 13, padding: '6px 12px', borderRadius: 999, background: 'rgba(20,184,166,0.16)', color: '#14b8a6' }}>💎 Alto intent de compra</span>
          <span style={{ fontWeight: 700, fontSize: 13, padding: '6px 12px', borderRadius: 999, background: 'var(--bg3, #f1f0f8)', border: '1px solid var(--b1)', color: 'var(--mu)' }}>{fmtInt(totalLeads)} leads · {fmtCOP(totalCost)}</span>
        </div>
        <div style={{ color: 'var(--mu)', fontSize: 14, marginTop: 12, maxWidth: '72ch', lineHeight: 1.5 }}>
          Quien busca <b>"moto eléctrica a crédito"</b> está mucho más cerca de comprar que quien ve un video. La hipótesis: Search trae <b>menos leads pero mejores</b>. Antes de recortarlo, hay que <b>medir la venta real</b> — no liquidar por CPL.
        </div>
      </div>

      {/* HIPÓTESIS + CONVERSIONES OFFLINE */}
      <div className="card" style={{ padding: '22px 24px', marginTop: 16, borderColor: 'rgba(20,184,166,0.32)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#14b8a6' }}>La hipótesis antes de decidir</div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', marginTop: 3 }}>💎 Medir la calidad, no solo el CPL</div>
          </div>
          <span className="period-pill" style={{ color: '#c9820a', borderColor: 'rgba(201,130,10,0.4)' }}>⚙ conversiones offline · pendiente</span>
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--mu)', lineHeight: 1.5 }}>
          Hoy medimos hasta el <b style={{ color: 'var(--tx)' }}>lead</b> (formulario / WhatsApp). No sabemos cuántos se vuelven <b style={{ color: '#14b8a6' }}>venta</b> — ese es el eslabón que falta para saber si Search vale su precio.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', margin: '14px 0 4px', flexWrap: 'wrap' }}>
          <FunnelStep k="Impresiones" v={fmtInt(totalImpr)} x="medido ✓" />
          <FunnelArrow />
          <FunnelStep k="Clics" v={fmtInt(totalClicks)} x={`CTR ${fmtPct(totalCtr, 1)} ✓`} />
          <FunnelArrow />
          <FunnelStep k="Leads" v={fmtInt(totalLeads)} x={`conv. ${fmtPct(convRate, 1)} ✓`} />
          <FunnelArrow />
          <FunnelStep k="Ventas" v="?" x="sin medir — falta offline" ghost />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16, marginTop: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--mu)', marginBottom: 6 }}>El plan (3 pasos)</div>
            <div style={{ fontSize: 12.5, color: 'var(--mu)', lineHeight: 1.7 }}>
              <b style={{ color: '#14b8a6' }}>1.</b> Marcar en el CRM qué lead viene de cada fuente (GCLID).<br />
              <b style={{ color: '#14b8a6' }}>2.</b> Subir las ventas reales a Google Ads (conversiones offline).<br />
              <b style={{ color: '#14b8a6' }}>3.</b> Comparar <b>costo por venta</b> Search vs Video → recién ahí, decidir.
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6, alignSelf: 'center' }}>
            Las señales de calidad que <b>sí</b> vemos hoy (tasa de conversión, intent de la búsqueda) son <b>proxies</b>, no la venta. No inventamos un costo por venta: queda como <b>incógnita</b> hasta activar offline.
          </div>
        </div>
      </div>

      {/* WASTED CALLOUT */}
      {wastedCost > 0 && (
        <div className="card" style={{ padding: '20px 24px', marginTop: 16, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', borderColor: 'rgba(248,113,113,0.28)', background: 'color-mix(in srgb, #f87171 6%, transparent)' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#f87171', letterSpacing: '-.02em', lineHeight: 1, fontFamily: "'Space Grotesk',sans-serif" }}>{fmtCOP(wastedCost)}</div>
          <div style={{ flex: 1, minWidth: 240, fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: 'var(--tx)' }}>
            se fue en <b>{fmtInt(wastedTerms)} términos que no trajeron ni una conversión</b> ({fmtPct(wastedPct, 0)} del gasto Search). No es "cortar Search" — es <b>negativizar lo irrelevante</b> (marcas de competencia, ciudades sin cobertura) y reinvertir esa plata en lo que sí convierte.
          </div>
        </div>
      )}

      {data.campaigns.map((c) => (
        <CampaignSection
          key={c.campaignId}
          campaign={c}
          ads={adsByName.get(c.campaignName.trim())}
          previousLabel={previousLabel}
          target={target}
        />
      ))}

      <div className="card" style={{ marginTop: 24, borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Cuenta de <b>generación de leads</b>: la referencia es leads y costo por lead (sin Revenue/ROAS). Todos los números vienen directo de Google Ads
          (campañas, términos, anuncios y localización). El <b>costo por venta</b> queda pendiente de activar conversiones offline — sin promedios engañosos ni datos inventados.
        </div>
      </div>
    </div>
  );
}

// Paso del embudo de medición.
function FunnelStep({ k, v, x, ghost }: { k: string; v: string; x: string; ghost?: boolean }) {
  return (
    <div
      className="card"
      style={{
        flex: 1,
        minWidth: 120,
        padding: '14px',
        borderStyle: ghost ? 'dashed' : 'solid',
        borderColor: ghost ? '#14b8a6' : 'var(--b1)',
        background: ghost ? 'color-mix(in srgb, #14b8a6 7%, transparent)' : 'var(--bg3, transparent)',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--mu)' }}>{k}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: ghost ? '#14b8a6' : 'var(--tx)' }}>{v}</div>
      <div style={{ fontSize: 10.5, color: 'var(--mu)', marginTop: 2 }}>{x}</div>
    </div>
  );
}
function FunnelArrow() {
  return <div style={{ display: 'flex', alignItems: 'center', color: 'var(--mu)', fontSize: 16, fontWeight: 700 }}>→</div>;
}
