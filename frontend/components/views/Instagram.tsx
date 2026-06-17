'use client';

import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useInstagram, type InstagramCampaignRow } from '@/lib/hooks/useInstagram';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  formatCurrency,
  formatInt,
  formatNumber,
  formatROAS,
  formatPercent,
} from '@/lib/utils';

// ============================================================
// Instagram — rendimiento de Meta Ads que corre en Instagram
// ============================================================
// Datos reales de meta_platform filtrando publisher_platform='instagram',
// agregados por campaña. Respeta el filtro global de fechas. Mientras la
// sincronización (ETL) no haya escrito filas, mostramos un estado honesto
// de "esperando datos" — no se inventa nada.
// ============================================================

function roasTone(roas: number): 'tgu' | 'tgm' | 'tgd' {
  if (roas >= 4) return 'tgu';
  if (roas >= 2.5) return 'tgm';
  return 'tgd';
}

const ROW_LIMIT = 30;

export function Instagram() {
  const client = useClient();
  const { range } = usePeriod();
  const { data, loading, error } = useInstagram(client.id, range);

  const rangeLabel = formatRangeLabel(range);
  const cur = client.currency;

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Cargando Instagram de {client.name}…
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
            Error cargando Instagram
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || data.campaignCount === 0) {
    return (
      <EmptyState
        icon="📸"
        title="Esperando el desglose de Instagram"
        message={
          <>
            Aún no hay filas de Meta en la plataforma <b>Instagram</b> para {client.name} entre{' '}
            <b>{rangeLabel}</b>. En cuanto la sincronización escriba el desglose por plataforma
            (publisher_platform) en la tabla <code>meta_platform</code>, esta vista mostrará la
            inversión, el alcance y el ROAS reales.
          </>
        }
        hint="Si la sincronización ya corrió, prueba ampliar el rango de fechas con el filtro de arriba."
      />
    );
  }

  const t = data.totals;
  const rows = data.campaigns.slice(0, ROW_LIMIT);

  return (
    <div className="view on">
      <div className="hero">
        <div className="hero-title">Instagram · Meta Ads</div>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {formatInt(data.campaignCount)} campañas ·{' '}
          {formatCurrency(t.spend, cur)} invertido
        </div>
      </div>

      {/* KPIs reales del tráfico de Instagram */}
      <div className="kpis">
        <div className="kpi k-meta">
          <div className="kpi-lbl">Inversión</div>
          <div className="kpi-val">{formatCurrency(t.spend, cur)}</div>
          <div className="kpi-bot">
            <span className="dcmp">{formatInt(data.campaignCount)} campañas</span>
          </div>
        </div>
        <div className="kpi k-meta">
          <div className="kpi-lbl">Revenue</div>
          <div className="kpi-val">{formatCurrency(t.purchaseValue, cur)}</div>
          <div className="kpi-bot">
            <span className="dcmp">
              <b>{formatInt(t.purchases)}</b> compras
            </span>
          </div>
        </div>
        <div className="kpi k-green">
          <div className="kpi-lbl">ROAS</div>
          <div className="kpi-val">{formatROAS(t.roas)}</div>
          <div className="kpi-bot">
            <span className="dcmp">revenue / inversión</span>
          </div>
        </div>
        <div className="kpi k-meta">
          <div className="kpi-lbl">Alcance</div>
          <div className="kpi-val">{formatNumber(t.reach)}</div>
          <div className="kpi-bot">
            <span className="dcmp">
              CTR {formatPercent(t.ctr, 1)} · {formatNumber(t.impressions)} impr.
            </span>
          </div>
        </div>
      </div>

      {/* Tabla por campaña en Instagram — datos reales */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <h3 style={{ margin: '0', fontSize: '15px' }}>Campañas en Instagram</h3>
          <span className="period-pill">
            top {Math.min(ROW_LIMIT, data.campaignCount)} de {formatInt(data.campaignCount)} ·{' '}
            <b>por inversión</b>
          </span>
        </div>
        <table className="t">
          <thead>
            <tr>
              <th>Campaña</th>
              <th>Impr.</th>
              <th>Alcance</th>
              <th>CTR</th>
              <th>Inversión</th>
              <th>Compras</th>
              <th>CPA</th>
              <th>Revenue</th>
              <th>ROAS</th>
              <th>Share inv.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c: InstagramCampaignRow) => {
              const share = t.spend > 0 ? c.spend / t.spend : 0;
              return (
                <tr key={c.name}>
                  <td>
                    <b>{c.name}</b>
                  </td>
                  <td>{formatNumber(c.impressions)}</td>
                  <td>{formatNumber(c.reach)}</td>
                  <td>{formatPercent(c.ctr, 1)}</td>
                  <td>{formatCurrency(c.spend, cur)}</td>
                  <td>{formatInt(c.purchases)}</td>
                  <td>{c.purchases > 0 ? formatCurrency(c.cpa, cur) : '—'}</td>
                  <td>{formatCurrency(c.purchaseValue, cur)}</td>
                  <td>
                    <span className={`tg ${roasTone(c.roas)}`}>
                      <b>{c.spend > 0 ? formatROAS(c.roas) : '—'}</b>
                    </span>
                  </td>
                  <td>
                    <span className="hb">
                      <span
                        className="hb-fill"
                        style={{
                          width: `${Math.max(2, Math.round(share * 100))}%`,
                          background: '#E1306C',
                        }}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Aviso honesto sobre el origen de los datos */}
      <div
        className="card"
        style={{ marginTop: '20px', borderStyle: 'dashed', borderColor: 'var(--b2)' }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Sobre estos datos</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          El desglose sale de <code>meta_platform</code> filtrando{' '}
          <b>publisher_platform = instagram</b>, agregado por campaña × día dentro del rango que
          elijas arriba. Es la porción de tus anuncios de Meta que efectivamente se sirvió en
          Instagram. Las métricas de creativo (miniaturas, hook rate, retención) no llegan por esta
          fuente; en cuanto la sincronización las incluya, las sumamos aquí.
        </div>
      </div>
    </div>
  );
}
