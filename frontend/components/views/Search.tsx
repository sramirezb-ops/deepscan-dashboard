'use client';

import { useState } from 'react';
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

// Mini sparkline (área + línea) en SVG puro, baseline en 0 (honesto).
function Spark({ points, color }: { points: number[]; color: string }) {
  const W = 120;
  const H = 34;
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
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <polygon points={area} fill={color} fillOpacity={0.14} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

// Tarjeta KPI compacta: etiqueta · valor · delta · sparkline.
function SparkKpi({
  label,
  value,
  delta,
  points,
  color,
}: {
  label: string;
  value: string;
  delta: number;
  points: number[];
  color: string;
}) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ fontSize: 10.5, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: 0.3, lineHeight: 1.3, minHeight: 26 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--tx)', lineHeight: 1.25, marginTop: 2 }}>
        {value}
      </div>
      <div style={{ marginTop: 2, marginBottom: 6 }}>
        <Delta value={delta} />
      </div>
      <Spark points={points} color={color} />
    </div>
  );
}

// Verde de marca con leves acentos para distinguir las 10 sparklines.
const KPI_COLOR = '#15803d';

function series(daily: SearchDailyPoint[], pick: (p: SearchDailyPoint) => number): number[] {
  return daily.map(pick);
}

// Bloque ① — 10 KPIs por campaña.
function KpiGrid({ kpis, deltas, daily }: { kpis: SearchKpis; deltas: SearchDeltas; daily: SearchDailyPoint[] }) {
  const cards: { label: string; value: string; delta: number; points: number[] }[] = [
    { label: 'Coste', value: fmtCOP(kpis.cost), delta: deltas.cost, points: series(daily, (p) => p.cost) },
    { label: '% impresiones de búsqueda', value: fmtPct(kpis.impressionShare), delta: deltas.impressionShare, points: series(daily, (p) => p.impressionShare) },
    { label: 'Impression Absolute Top %', value: fmtPct(kpis.absTopImpressionShare), delta: deltas.absTopImpressionShare, points: series(daily, (p) => p.absTopImpressionShare) },
    { label: 'Avg. CPM', value: fmtCOP(kpis.cpm), delta: deltas.cpm, points: series(daily, (p) => p.cpm) },
    { label: 'Clics', value: fmtInt(kpis.clicks), delta: deltas.clicks, points: series(daily, (p) => p.clicks) },
    { label: 'CPC medio', value: fmtCOP(kpis.cpc), delta: deltas.cpc, points: series(daily, (p) => p.cpc) },
    { label: 'CTR', value: fmtPct(kpis.ctr), delta: deltas.ctr, points: series(daily, (p) => p.ctr) },
    { label: 'Conversiones', value: fmtInt(kpis.conversions), delta: deltas.conversions, points: series(daily, (p) => p.conversions) },
    { label: 'Coste/conv.', value: fmtCOP(kpis.costPerConv), delta: deltas.costPerConv, points: series(daily, (p) => p.costPerConv) },
    { label: 'Tasa de conversión', value: fmtPct(kpis.convRate), delta: deltas.convRate, points: series(daily, (p) => p.convRate) },
  ];
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: 12,
        marginTop: 14,
      }}
    >
      {cards.map((c) => (
        <SparkKpi key={c.label} label={c.label} value={c.value} delta={c.delta} points={c.points} color={KPI_COLOR} />
      ))}
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
      <div style={{ overflowX: 'auto' }}>
        <table className="t">
          <thead>
            <tr>
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
            {shown.map((t, i) => (
              <tr key={`${t.searchTerm}__${t.keyword}__${i}`}>
                <td><b>{t.searchTerm}</b></td>
                <td style={{ color: 'var(--mu)' }}>{t.keyword || '—'}</td>
                <td>{fmtCOP(t.cost)}</td>
                <td>{fmtInt(t.impressions)}</td>
                <td>{fmtInt(t.clicks)}</td>
                <td>{t.clicks > 0 ? fmtCOP(t.cpc) : '—'}</td>
                <td>{fmtPct(t.ctr)}</td>
                <td>{fmtInt(t.conversions)}</td>
                <td>{t.conversions > 0 ? fmtCOP(t.costPerConv) : '—'}</td>
                <td>{fmtPct(t.convRate)}</td>
              </tr>
            ))}
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
      <div style={{ fontSize: 13, color: 'var(--mu)', marginBottom: 10 }}>📍 ¿De qué ciudades vienen los resultados?</div>
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

      <KpiGrid kpis={campaign.kpis} deltas={campaign.deltas} daily={campaign.daily} />
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
        <div className="hero-title">🔎 Search</div>
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
