'use client';

import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useMeta, type MetaCampaignRow } from '@/lib/hooks/useMeta';
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

export function MetaOverview() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useMeta(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const previousLabel = formatRangeLabel(previous);

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Cargando campañas de Meta Ads de {client.name}…
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
            Error cargando Meta Ads
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || data.campaigns.length === 0) {
    if (!data?.metaExistsEver) {
      return (
        <EmptyState
          icon="📘"
          title="Sin datos de Meta Ads"
          message={
            <>
              {client.name} no tiene datos de <b>Meta Ads</b> conectados por el momento. En cuanto el
              conector traiga datos, aparecerán aquí automáticamente.
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
            {client.name} tiene datos de Meta Ads, pero no registraron actividad entre{' '}
            <b>{rangeLabel}</b>.
          </>
        }
        hint="Prueba ampliar el rango de fechas con el filtro de arriba."
      />
    );
  }

  const t = data.totals;
  const f = data.funnel;
  const cur = client.currency;
  const maxRoas = Math.max(...data.campaigns.map((c) => c.roas), 0.0001);

  // Funnel: pasos con su tasa respecto al paso anterior.
  const funnelSteps = [
    { label: 'Ver contenido', value: f.viewContent, color: '#4c8bf5' },
    { label: 'Agregar al carrito', value: f.addToCart, color: '#7c5cf5' },
    { label: 'Iniciar checkout', value: f.initiateCheckout, color: '#c14cf5' },
    { label: 'Compras', value: f.purchases, color: '#22d97a' },
  ];
  const funnelTop = Math.max(f.viewContent, 1);

  return (
    <div className="view on">
      <div className="hero">
        <div className="hero-title">Meta Ads · Overview</div>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {data.campaignCount} campañas ·{' '}
          {formatCurrency(t.spend, cur)} invertido
        </div>
      </div>

      {/* KPIs reales */}
      <div className="kpis">
        <div className="kpi k-meta">
          <div className="kpi-lbl">Inversión</div>
          <div className="kpi-val">{formatCurrency(t.spend, cur)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${deltaDirection(data.spendDelta) === 'up' ? 'tgu' : 'tgd'}`}>
              {formatDelta(data.spendDelta)}
            </span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-meta">
          <div className="kpi-lbl">Revenue</div>
          <div className="kpi-val">{formatCurrency(t.purchaseValue, cur)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${deltaDirection(data.revenueDelta) === 'up' ? 'tgu' : 'tgd'}`}>
              {formatDelta(data.revenueDelta)}
            </span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-meta">
          <div className="kpi-lbl">ROAS</div>
          <div className="kpi-val">{formatROAS(t.roas)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${data.roasDelta >= 0 ? 'tgu' : 'tgd'}`}>
              {(data.roasDelta >= 0 ? '+' : '') + data.roasDelta.toFixed(2)}
            </span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-meta">
          <div className="kpi-lbl">Compras</div>
          <div className="kpi-val">{formatInt(t.purchases)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${deltaDirection(data.purchasesDelta) === 'up' ? 'tgu' : 'tgd'}`}>
              {formatDelta(data.purchasesDelta)}
            </span>
            <span className="dcmp">CPA {t.purchases > 0 ? formatCurrency(t.cpa, cur) : '—'}</span>
          </div>
        </div>
      </div>

      {/* Funnel real — view_content → add_to_cart → checkout → compra */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h3 style={{ margin: '0', fontSize: '15px' }}>Funnel de conversión</h3>
          <span className="period-pill">eventos del píxel · {rangeLabel}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px' }}>
          {funnelSteps.map((step, i) => {
            const widthPct = Math.max(2, Math.round((step.value / funnelTop) * 100));
            const prev = i > 0 ? funnelSteps[i - 1].value : null;
            const stepRate = prev && prev > 0 ? step.value / prev : null;
            return (
              <div key={step.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--tx)' }}>{step.label}</span>
                  <b>
                    {formatInt(step.value)}
                    {stepRate != null && (
                      <span style={{ color: 'var(--mu)', fontWeight: 400 }}>
                        {' '}
                        · {formatPercent(stepRate, 1)} del paso anterior
                      </span>
                    )}
                  </b>
                </div>
                <span className="hb">
                  <span
                    className="hb-fill"
                    style={{ width: `${widthPct}%`, background: step.color }}
                  />
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabla por campaña — datos reales */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div className="dim-tbl-head">
          <div className="dim-tbl-title">
            <div className="dim-tbl-ic">◎</div>
            <div>
              <div className="dim-tbl-label">Dimensión · Campañas Meta Ads</div>
              <div className="dim-tbl-h">Comparativa a nivel campaña · ordenado por inversión</div>
            </div>
          </div>
          <span className="period-pill">{data.campaignCount} campañas</span>
        </div>
        <table className="t" id="meta-camp-tbl">
          <thead>
            <tr>
              <th data-cat="dim">Campaña</th>
              <th data-cat="impr">Impr.</th>
              <th data-cat="impr">CTR</th>
              <th data-cat="cost">Inversión</th>
              <th data-cat="conv">Compras</th>
              <th data-cat="cost,conv">CPA</th>
              <th data-cat="rev">Revenue</th>
              <th data-cat="rev">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {data.campaigns.map((c: MetaCampaignRow) => (
              <tr key={c.name}>
                <td data-cat="dim">
                  <b>{c.name}</b>
                </td>
                <td data-cat="impr">{formatNumber(c.impressions)}</td>
                <td data-cat="impr">{formatPercent(c.ctr, 1)}</td>
                <td data-cat="cost">{formatCurrency(c.spend, cur)}</td>
                <td data-cat="conv">{formatInt(c.purchases)}</td>
                <td data-cat="cost,conv">{c.purchases > 0 ? formatCurrency(c.cpa, cur) : '—'}</td>
                <td data-cat="rev">{formatCurrency(c.purchaseValue, cur)}</td>
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
              <td data-cat="impr">{formatNumber(t.impressions)}</td>
              <td data-cat="impr">{formatPercent(t.ctr, 1)}</td>
              <td data-cat="cost">{formatCurrency(t.spend, cur)}</td>
              <td data-cat="conv">{formatInt(t.purchases)}</td>
              <td data-cat="cost,conv">{t.purchases > 0 ? formatCurrency(t.cpa, cur) : '—'}</td>
              <td data-cat="rev">{formatCurrency(t.purchaseValue, cur)}</td>
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
            const share = t.spend > 0 ? c.spend / t.spend : 0;
            return (
              <div key={c.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--tx)' }}>{c.name}</span>
                  <b>
                    {formatCurrency(c.spend, cur)} · {(share * 100).toFixed(1)}%
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

      {/* Nota honesta */}
      <div
        className="card"
        style={{ marginTop: '20px', borderStyle: 'dashed', borderColor: 'var(--b2)' }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Cómo leer esta vista</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Todos los números son <b>reales</b> y vienen del conector de Meta Ads (nivel anuncio/día,
          consolidado por campaña). El <b>funnel</b> usa los eventos del píxel (ver contenido, carrito,
          checkout, compra). El CTR se calcula como clicks ÷ impresiones del período. La segmentación
          por <b>Instagram vs Facebook</b> y el desglose por conjunto de anuncios se activarán en una
          próxima etapa.
        </div>
      </div>
    </div>
  );
}
