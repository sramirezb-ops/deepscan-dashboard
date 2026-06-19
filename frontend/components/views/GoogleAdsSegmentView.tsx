'use client';

import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import {
  useGoogleAds,
  type CampaignRow,
  type GoogleAdsSegment,
} from '@/lib/hooks/useGoogleAds';
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

function roasTone(roas: number): 'tgu' | 'tgm' | 'tgd' {
  if (roas >= 4) return 'tgu';
  if (roas >= 2.5) return 'tgm';
  return 'tgd';
}

export interface GoogleAdsSegmentViewProps {
  segment: GoogleAdsSegment;
  /** Título grande de la vista, ej. "Performance Max". */
  title: string;
  /** Nombre del canal para los avisos, ej. "Performance Max". */
  channelLabel: string;
  /** Ícono para el aviso de "sin campañas". */
  icon?: string;
  /** Texto bajo la tabla, explicando qué partes aún no tienen fuente real. */
  pendingNote?: string;
  /** Sección opcional inyectada entre la tabla de campañas y el aviso "Próximamente". */
  extraSection?: React.ReactNode;
}

/**
 * Vista genérica para un segmento de Google Ads (PMAX, Shopping, Search, Video).
 * Se auto-resuelve a partir de los datos del cliente:
 *  - Si hay campañas del segmento en el rango → KPIs + tabla reales.
 *  - Si el cliente nunca ha tenido ese tipo → aviso "sin campañas activas".
 *  - Si tiene pero no en el rango → aviso "sin actividad en este período".
 * Ningún dato es inventado: todo sale de gads_campaigns.
 */
export function GoogleAdsSegmentView({
  segment,
  title,
  channelLabel,
  icon = '🟢',
  pendingNote,
  extraSection,
}: GoogleAdsSegmentViewProps) {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useGoogleAds(client.id, range, previous, segment);

  const rangeLabel = formatRangeLabel(range);
  const previousLabel = formatRangeLabel(previous);

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Cargando campañas {title} de {client.name}…
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
            Error cargando {title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  // Sin campañas en el rango → dos avisos distintos según exista o no el canal.
  if (!data || data.campaigns.length === 0) {
    if (!data?.segmentExistsEver) {
      return (
        <EmptyState
          icon={icon}
          title={`Sin campañas ${channelLabel}`}
          message={
            <>
              {client.name} no tiene campañas de <b>{channelLabel}</b> activas por el momento. En
              cuanto se lancen, aparecerán aquí automáticamente.
            </>
          }
        />
      );
    }
    return (
      <EmptyState
        icon="📅"
        title={`Sin actividad ${channelLabel} en este período`}
        message={
          <>
            {client.name} tiene campañas de {channelLabel}, pero no registraron actividad entre{' '}
            <b>{rangeLabel}</b>.
          </>
        }
        hint="Prueba ampliar el rango de fechas con el filtro de arriba."
      />
    );
  }

  const t = data.totals;
  const cur = client.currency;

  return (
    <div className="view on">
      <div className="hero">
        <div className="hero-title">{title}</div>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {data.campaignCount} campañas ·{' '}
          {formatCurrency(t.cost, cur)} invertido
        </div>
      </div>

      {/* KPIs reales del segmento */}
      <div className="kpis kpis-5">
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
        <div className="kpi k-green">
          <div className="kpi-lbl">ROAS consolidado</div>
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
            <span className="dcmp">
              CPA <b>{t.conversions > 0 ? formatCurrency(t.cpa, cur) : '—'}</b>
            </span>
          </div>
        </div>
        <div className="kpi k-google">
          <div className="kpi-lbl">Impresiones</div>
          <div className="kpi-val">{formatNumber(t.impressions)}</div>
          <div className="kpi-bot">
            <span className="dcmp">
              CTR <b>{formatPercent(t.ctr, 1)}</b> · {formatInt(t.clicks)} clics
            </span>
          </div>
        </div>
      </div>

      {/* Tabla por campaña — datos reales */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: '0', fontSize: '15px' }}>Campañas {title} · performance</h3>
          <span className="period-pill">
            {data.campaignCount} campañas · <b>ordenadas por ROAS</b>
          </span>
        </div>
        <table className="t">
          <thead>
            <tr>
              <th>Campaña</th>
              <th>Impr.</th>
              <th>CTR</th>
              <th>Inversión</th>
              <th>Conv.</th>
              <th>CPA</th>
              <th>Revenue</th>
              <th>ROAS</th>
              <th>Share inv.</th>
            </tr>
          </thead>
          <tbody>
            {data.campaigns.map((c: CampaignRow) => {
              const share = t.cost > 0 ? c.cost / t.cost : 0;
              return (
                <tr key={c.name}>
                  <td>
                    <b>{c.name}</b>
                  </td>
                  <td>{formatNumber(c.impressions)}</td>
                  <td>{formatPercent(c.ctr, 1)}</td>
                  <td>{formatCurrency(c.cost, cur)}</td>
                  <td>{formatInt(c.conversions)}</td>
                  <td>{c.conversions > 0 ? formatCurrency(c.cpa, cur) : '—'}</td>
                  <td>{formatCurrency(c.revenue, cur)}</td>
                  <td>
                    <span className={`tg ${roasTone(c.roas)}`}>
                      <b>{formatROAS(c.roas)}</b>
                    </span>
                  </td>
                  <td>
                    <span className="hb">
                      <span
                        className="hb-fill"
                        style={{ width: `${Math.max(2, Math.round(share * 100))}%`, background: '#22d97a' }}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr className="t-avg">
              <td>Total</td>
              <td>{formatNumber(t.impressions)}</td>
              <td>{formatPercent(t.ctr, 1)}</td>
              <td>{formatCurrency(t.cost, cur)}</td>
              <td>{formatInt(t.conversions)}</td>
              <td>{formatCurrency(t.cpa, cur)}</td>
              <td>{formatCurrency(t.revenue, cur)}</td>
              <td>
                <b>{formatROAS(t.roas)}</b>
              </td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Sección extra inyectada por la vista concreta (ej. productos en PMAX). */}
      {extraSection}

      {/* Bloques sin fuente real — aviso honesto */}
      <div
        className="card"
        style={{ marginTop: '20px', borderStyle: 'dashed', borderColor: 'var(--b2)' }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Próximamente en esta vista</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          {pendingNote ||
            'Los desgloses a nivel asset group, search terms, placements y el agente IA necesitan fuentes que aún no están en la base. Por ahora esta vista muestra solo datos reales y verificables de tus campañas.'}
        </div>
      </div>
    </div>
  );
}
