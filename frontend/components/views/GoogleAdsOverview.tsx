'use client';

import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useGoogleAds, type CampaignRow } from '@/lib/hooks/useGoogleAds';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  formatCurrency,
  formatInt,
  formatNumber,
  formatROAS,
  formatPercent,
  formatDelta,
  deltaDirection,
} from '@/lib/utils';

// Etiqueta legible para el tipo de campaña que viene de Google Ads.
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

// Color del ROAS según rentabilidad (verde / ámbar / rojo).
function roasTone(roas: number): 'tgu' | 'tgm' | 'tgd' {
  if (roas >= 4) return 'tgu';
  if (roas >= 2.5) return 'tgm';
  return 'tgd';
}
function roasBarColor(roas: number): 'g' | 'a' | 'r' {
  if (roas >= 4) return 'g';
  if (roas >= 2.5) return 'a';
  return 'r';
}

export function GoogleAdsOverview() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useGoogleAds(client.id, range, previous);

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
        <div
          className="card"
          style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}
        >
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>
            Error cargando Google Ads
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || data.campaigns.length === 0) {
    if (!data?.segmentExistsEver) {
      return (
        <EmptyState
          icon="🟢"
          title="Sin campañas de Google Ads"
          message={
            <>
              {client.name} no tiene campañas de <b>Google Ads</b> conectadas por el momento. En
              cuanto haya actividad, aparecerá aquí automáticamente.
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

  const t = data.totals;
  const cur = client.currency;
  const maxRoas = Math.max(...data.campaigns.map((c) => c.roas), 0.0001);

  return (
    <div className="view on">
      <div className="hero">
        <div className="hero-title">Google Ads · Overview</div>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {data.campaignCount} campañas ·{' '}
          {formatCurrency(t.cost, cur)} invertido
        </div>
      </div>

      {/* KPIs reales */}
      <div className="kpis">
        <div className="kpi k-google">
          <div className="kpi-lbl">Inversión</div>
          <div className="kpi-val">{formatCurrency(t.cost, cur)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${deltaDirection(data.costDelta) === 'up' ? 'tgu' : 'tgd'}`}>
              {formatDelta(data.costDelta)}
            </span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-google">
          <div className="kpi-lbl">Revenue</div>
          <div className="kpi-val">{formatCurrency(t.revenue, cur)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${deltaDirection(data.revenueDelta) === 'up' ? 'tgu' : 'tgd'}`}>
              {formatDelta(data.revenueDelta)}
            </span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-google">
          <div className="kpi-lbl">ROAS</div>
          <div className="kpi-val">{formatROAS(t.roas)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${data.roasDelta >= 0 ? 'tgu' : 'tgd'}`}>
              {(data.roasDelta >= 0 ? '+' : '') + data.roasDelta.toFixed(2)}
            </span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-google">
          <div className="kpi-lbl">Conversiones</div>
          <div className="kpi-val">{formatInt(t.conversions)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${deltaDirection(data.conversionsDelta) === 'up' ? 'tgu' : 'tgd'}`}>
              {formatDelta(data.conversionsDelta)}
            </span>
            <span className="dcmp">CPA {formatCurrency(t.cpa, cur)}</span>
          </div>
        </div>
      </div>

      {/* Tabla por NOMBRE de campaña — datos reales */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div className="dim-tbl-head">
          <div className="dim-tbl-title">
            <div className="dim-tbl-ic">◎</div>
            <div>
              <div className="dim-tbl-label">Dimensión · Campañas Google Ads</div>
              <div className="dim-tbl-h">Comparativa a nivel campaña · ordenado por ROAS</div>
            </div>
          </div>
          <span className="period-pill">{data.campaignCount} campañas</span>
        </div>
        <table className="t" id="gads-camp-tbl">
          <thead>
            <tr>
              <th data-cat="dim">Campaña</th>
              <th data-cat="dim">Tipo</th>
              <th data-cat="impr">Impr.</th>
              <th data-cat="impr">CTR</th>
              <th data-cat="cost">Inversión</th>
              <th data-cat="conv">Conv.</th>
              <th data-cat="cost,conv">CPA</th>
              <th data-cat="rev">Revenue</th>
              <th data-cat="rev">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {data.campaigns.map((c: CampaignRow) => (
              <tr key={c.name}>
                <td data-cat="dim">
                  <b>{c.name}</b>
                </td>
                <td data-cat="dim">
                  <span className="pl pl-google">{typeLabel(c.type)}</span>
                </td>
                <td data-cat="impr">{formatNumber(c.impressions)}</td>
                <td data-cat="impr">{formatPercent(c.ctr, 1)}</td>
                <td data-cat="cost">{formatCurrency(c.cost, cur)}</td>
                <td data-cat="conv">{formatInt(c.conversions)}</td>
                <td data-cat="cost,conv">{c.conversions > 0 ? formatCurrency(c.cpa, cur) : '—'}</td>
                <td data-cat="rev">{formatCurrency(c.revenue, cur)}</td>
                <td data-cat="rev">
                  <div className="cmp-cell">
                    <span className={`cmp-val ${roasTone(c.roas)}`}>{formatROAS(c.roas)}</span>
                    <div className="cmp-bar">
                      <div
                        className={`cmp-bar-fill ${roasBarColor(c.roas)}`}
                        style={{ width: `${Math.max(6, Math.round((c.roas / maxRoas) * 100))}%` }}
                      />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            <tr className="t-avg">
              <td data-cat="dim">Promedio / Total</td>
              <td data-cat="dim">—</td>
              <td data-cat="impr">{formatNumber(t.impressions)}</td>
              <td data-cat="impr">{formatPercent(t.ctr, 1)}</td>
              <td data-cat="cost">{formatCurrency(t.cost, cur)}</td>
              <td data-cat="conv">{formatInt(t.conversions)}</td>
              <td data-cat="cost,conv">{formatCurrency(t.cpa, cur)}</td>
              <td data-cat="rev">{formatCurrency(t.revenue, cur)}</td>
              <td data-cat="rev">
                <b>{formatROAS(t.roas)}</b>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Distribución de inversión por campaña — derivada de datos reales */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>
          Distribución de inversión por campaña
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
          {data.campaigns.map((c) => {
            const share = t.cost > 0 ? c.cost / t.cost : 0;
            return (
              <div key={c.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--tx)' }}>{c.name}</span>
                  <b>
                    {formatCurrency(c.cost, cur)} · {(share * 100).toFixed(1)}%
                  </b>
                </div>
                <div className="cmp-bar">
                  <div
                    className="cmp-bar-fill g"
                    style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bloques aún sin fuente de datos real — aviso honesto, sin números inventados */}
      <div
        className="card"
        style={{ marginTop: '20px', borderStyle: 'dashed', borderColor: 'var(--b2)' }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Próximamente en esta vista</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          El <b>funnel de conversión</b>, el <b>top de productos vendidos</b> y el{' '}
          <b>Agente Google Ads IA</b> requieren fuentes que aún no están conectadas (eventos de GA4 a
          nivel paso, feed de Merchant Center y el motor de insights). Se activarán en una próxima
          etapa. Por ahora esta vista muestra únicamente datos reales y verificables de tus campañas.
        </div>
      </div>
    </div>
  );
}
