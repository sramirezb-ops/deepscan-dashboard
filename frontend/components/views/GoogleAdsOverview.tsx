'use client';

import { HeroHead } from '@/components/ui/BrandLogo';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useGadsLeads, type BusinessModel, type CampaignLeadRow } from '@/lib/hooks/useGadsLeads';
import { GadsGeoCharts } from '@/components/views/GadsGeoCharts';
import { EmptyState } from '@/components/ui/EmptyState';

// ── Formateadores locales en estilo Colombia (COP, coma decimal) ──
// Moneda COP completa: "$ 5.680.204" (puntos de miles, como en Looker).
function fmtCOP(v: number): string {
  if (v == null || isNaN(v)) return '—';
  return `$ ${Math.round(v).toLocaleString('es-CO')}`;
}
// Entero con puntos de miles: "1.477.885".
function fmtInt(v: number): string {
  if (v == null || isNaN(v)) return '—';
  return Math.round(v).toLocaleString('es-CO');
}
// Porcentaje desde ratio 0..1 → "1,24 %" (coma decimal).
function fmtPct(ratio: number, dec = 2): string {
  if (ratio == null || isNaN(ratio)) return '—';
  return `${(ratio * 100).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })} %`;
}

// Etiqueta legible del tipo de campaña.
function typeLabel(type: string | null): string {
  if (!type) return '—';
  const map: Record<string, string> = {
    PERFORMANCE_MAX: 'PMAX',
    SHOPPING: 'Shopping',
    SEARCH: 'Search',
    VIDEO: 'Video',
    DISPLAY: 'Display',
  };
  return map[type] || type;
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

// Tarjeta KPI compacta con valor + delta + subtítulo opcional.
function Kpi({ label, value, delta, sub }: { label: string; value: string; delta?: number; sub?: string }) {
  return (
    <div className="kpi k-google">
      <div className="kpi-lbl">{label}</div>
      <div className="kpi-val">{value}</div>
      <div className="kpi-bot">
        {delta !== undefined && <Delta value={delta} />}
        {sub && <span className="dcmp">{sub}</span>}
      </div>
    </div>
  );
}

// Sección completa de un modelo de negocio: KPIs + tabla de campañas.
function ModelSection({ model, previousLabel }: { model: BusinessModel; previousLabel: string }) {
  const m = model.metrics;
  const d = model.deltas;
  const icon = model.key === 'propietarios' ? '🤝' : '🛒';

  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ margin: '0 0 4px 0', fontSize: 17 }}>
        {icon} {model.label}
      </h3>
      <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 14 }}>
        {model.campaigns.length} campaña{model.campaigns.length === 1 ? '' : 's'} ·{' '}
        <b style={{ color: 'var(--tx)' }}>{fmtCOP(m.cost)}</b> invertido ·{' '}
        <b style={{ color: 'var(--tx)' }}>{fmtInt(m.conversions)}</b> leads
      </div>

      {model.campaigns.length === 0 ? (
        <div
          className="card"
          style={{ padding: 18, borderStyle: 'dashed', borderColor: 'var(--b2)', fontSize: 12, color: 'var(--mu)' }}
        >
          Sin actividad de {model.label.toLowerCase()} en este período.
        </div>
      ) : (
        <>
          {/* Resultados generales (vs período anterior) — 8 KPIs de leads */}
          <div className="kpis">
            <Kpi label="Coste" value={fmtCOP(m.cost)} delta={d.cost} sub={`vs ${previousLabel}`} />
            <Kpi label="Impresiones" value={fmtInt(m.impressions)} delta={d.impressions} sub={`vs ${previousLabel}`} />
            <Kpi label="Avg. CPM" value={fmtCOP(m.cpm)} delta={d.cpm} sub={`vs ${previousLabel}`} />
            <Kpi label="CTR" value={fmtPct(m.ctr)} delta={d.ctr} sub={`vs ${previousLabel}`} />
            <Kpi label="Clics" value={fmtInt(m.clicks)} delta={d.clicks} sub={`vs ${previousLabel}`} />
            <Kpi label="Costo por clic" value={fmtCOP(m.cpc)} delta={d.cpc} sub={`vs ${previousLabel}`} />
            <Kpi label="Leads (conversiones)" value={fmtInt(m.conversions)} delta={d.conversions} sub={`vs ${previousLabel}`} />
            <Kpi label="Costo por lead" value={fmtCOP(m.cpa)} delta={d.cpa} sub={`vs ${previousLabel}`} />
          </div>

          {/* Análisis general de todas las campañas del modelo */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="dim-tbl-head">
              <div className="dim-tbl-title">
                <div className="dim-tbl-ic">◎</div>
                <div>
                  <div className="dim-tbl-label">Campañas · {model.label}</div>
                  <div className="dim-tbl-h">Análisis general · ordenado por gasto</div>
                </div>
              </div>
              <span className="period-pill">{model.campaigns.length} campañas</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="t">
                <thead>
                  <tr>
                    <th>Campaña</th>
                    <th>Tipo</th>
                    <th>Gasto</th>
                    <th>Impresiones</th>
                    <th>Clics</th>
                    <th>CPC Promedio</th>
                    <th>CTR</th>
                    <th>Leads</th>
                    <th>Coste/lead</th>
                    <th>Tasa de conversión</th>
                  </tr>
                </thead>
                <tbody>
                  {model.campaigns.map((c: CampaignLeadRow) => (
                    <tr key={c.name}>
                      <td>
                        <b>{c.name}</b>
                      </td>
                      <td>
                        <span className="pl pl-google">{typeLabel(c.type)}</span>
                      </td>
                      <td>{fmtCOP(c.cost)}</td>
                      <td>{fmtInt(c.impressions)}</td>
                      <td>{fmtInt(c.clicks)}</td>
                      <td>{fmtCOP(c.cpc)}</td>
                      <td>{fmtPct(c.ctr, 0)}</td>
                      <td>{fmtInt(c.conversions)}</td>
                      <td>{c.conversions > 0 ? fmtCOP(c.cpa) : '—'}</td>
                      <td>{fmtPct(c.convRate)}</td>
                    </tr>
                  ))}
                  <tr className="t-avg">
                    <td>Total {model.label}</td>
                    <td>—</td>
                    <td>{fmtCOP(m.cost)}</td>
                    <td>{fmtInt(m.impressions)}</td>
                    <td>{fmtInt(m.clicks)}</td>
                    <td>{fmtCOP(m.cpc)}</td>
                    <td>{fmtPct(m.ctr, 0)}</td>
                    <td>{fmtInt(m.conversions)}</td>
                    <td>{fmtCOP(m.cpa)}</td>
                    <td>{fmtPct(m.convRate)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Tarjeta resumen de un modelo para la comparativa superior.
function ModelSummaryCard({ model }: { model: BusinessModel }) {
  const m = model.metrics;
  const icon = model.key === 'propietarios' ? '🤝' : '🛒';
  return (
    <div className="card" style={{ flex: '1 1 260px', minWidth: 260 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
        {icon} {model.label}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--mu)' }}>Inversión</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtCOP(m.cost)}</div>
          <Delta value={model.deltas.cost} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--mu)' }}>Leads</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtInt(m.conversions)}</div>
          <Delta value={model.deltas.conversions} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--mu)' }}>Costo / lead</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{m.conversions > 0 ? fmtCOP(m.cpa) : '—'}</div>
          <Delta value={model.deltas.cpa} />
        </div>
      </div>
    </div>
  );
}

export function GoogleAdsOverview() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useGadsLeads(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const previousLabel = formatRangeLabel(previous);

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Cargando campañas de Google Ads de {client.name}…
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view on">
        <div className="card" style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}>
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>Error cargando Google Ads</div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || !data.hasAny) {
    if (!data?.existsEver) {
      return (
        <EmptyState
          icon="🟢"
          title="Sin campañas de Google Ads"
          message={
            <>
              {client.name} no tiene campañas de <b>Google Ads</b> conectadas por el momento. En cuanto
              haya actividad, aparecerá aquí automáticamente.
            </>
          }
        />
      );
    }
    return (
      <EmptyState
        icon="📅"
        title="Sin actividad en este período"
        message={
          <>
            {client.name} tiene campañas de Google Ads, pero no registraron actividad entre{' '}
            <b>{rangeLabel}</b>.
          </>
        }
        hint="Prueba ampliar el rango de fechas con el filtro de arriba."
      />
    );
  }

  const totalCost = data.venta.metrics.cost + data.propietarios.metrics.cost;

  return (
    <div className="view on">
      <div className="hero">
        <HeroHead brand="google-ads">Google Ads · Overview</HeroHead>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {fmtCOP(totalCost)} invertido · 2 modelos de negocio
        </div>
      </div>

      {/* Comparativa de los dos modelos de negocio (gasto y leads aparte) */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 4 }}>
        <ModelSummaryCard model={data.venta} />
        <ModelSummaryCard model={data.propietarios} />
      </div>

      {/* Cada modelo, con sus resultados generales y su tabla de campañas */}
      <ModelSection model={data.venta} previousLabel={previousLabel} />
      <ModelSection model={data.propietarios} previousLabel={previousLabel} />

      {/* Localizaciones: tortas por ciudad (conversiones, inversión, impresiones, coste/lead) */}
      <GadsGeoCharts clientId={client.id} range={range} />

      {/* Nota honesta: leads, no ecommerce */}
      <div
        className="card"
        style={{ marginTop: 24, borderStyle: 'dashed', borderColor: 'var(--b2)' }}
      >
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          ℹ️ Esta cuenta trabaja por <b>generación de leads</b>, no por venta directa, así que no se
          muestran <b>Revenue</b> ni <b>ROAS</b> (no existen como dato real). La referencia principal es
          el <b>número de leads</b> y el <b>costo por lead</b>. Los dos modelos de negocio —
          <b> Venta de vehículos eléctricos</b> y <b>Propietarios</b> — se reportan siempre con gasto y
          resultados separados.
        </div>
      </div>
    </div>
  );
}
