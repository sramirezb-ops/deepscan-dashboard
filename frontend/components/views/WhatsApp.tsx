'use client';

import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import {
  useMessaging,
  type MessagingCampaignRow,
  type MessagingDestinationRow,
} from '@/lib/hooks/useMessaging';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatInt, formatNumber } from '@/lib/utils';

// ============================================================
// Mensajes — campañas de conversaciones de Meta (antes "WhatsApp")
// ============================================================
// Datos reales de meta_messaging: adsets optimizados por Conversaciones
// (optimization_goal=CONVERSATIONS). Muestra las "conversaciones con mensaje
// iniciadas" desglosadas por destino (WhatsApp / Messenger / Instagram Direct),
// el costo por conversación y el detalle por campaña. Respeta el filtro de
// fechas. Mientras el ETL no escriba filas, muestra un estado honesto.
// ============================================================

const DEST_COLOR: Record<string, string> = {
  WhatsApp: '#25D366',
  Messenger: '#0084FF',
  'Instagram Direct': '#E1306C',
  'Sin clasificar': 'var(--mu)',
};

function destColor(d: string): string {
  return DEST_COLOR[d] || '#7c5cff';
}

const ROW_LIMIT = 30;

export function WhatsApp() {
  const client = useClient();
  const { range } = usePeriod();
  const { data, loading, error } = useMessaging(client.id, range);

  const rangeLabel = formatRangeLabel(range);
  const cur = client.currency;

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Cargando conversaciones de {client.name}…
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
            Error cargando conversaciones
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || data.totals.conversations === 0) {
    return (
      <EmptyState
        icon="💬"
        title="Esperando las campañas de mensajes"
        message={
          <>
            Aún no hay conversaciones con mensaje iniciadas para {client.name} entre{' '}
            <b>{rangeLabel}</b>. En cuanto la sincronización escriba las campañas de mensajes
            (las que optimizan por <b>Conversaciones</b>) en la tabla <code>meta_messaging</code>,
            esta vista mostrará las conversaciones por destino (WhatsApp / Messenger / Instagram
            Direct) y el costo por conversación, todo con datos reales.
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
        <div className="hero-title">Mensajes · conversaciones</div>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {formatInt(t.conversations)} conversaciones ·{' '}
          {formatCurrency(t.spend, cur)} invertido
        </div>
      </div>

      {/* KPIs reales */}
      <div className="kpis">
        <div className="kpi k-meta">
          <div className="kpi-lbl">Conversaciones iniciadas</div>
          <div className="kpi-val">{formatInt(t.conversations)}</div>
          <div className="kpi-bot">
            <span className="dcmp">{formatInt(data.campaignCount)} campañas</span>
          </div>
        </div>
        <div className="kpi k-meta">
          <div className="kpi-lbl">Inversión</div>
          <div className="kpi-val">{formatCurrency(t.spend, cur)}</div>
          <div className="kpi-bot">
            <span className="dcmp">en campañas de mensajes</span>
          </div>
        </div>
        <div className="kpi k-green">
          <div className="kpi-lbl">Costo por conversación</div>
          <div className="kpi-val">{formatCurrency(t.costPerConversation, cur)}</div>
          <div className="kpi-bot">
            <span className="dcmp">inversión / conversaciones</span>
          </div>
        </div>
        <div className="kpi k-meta">
          <div className="kpi-lbl">Destinos activos</div>
          <div className="kpi-val">{formatInt(data.destinations.length)}</div>
          <div className="kpi-bot">
            <span className="dcmp">
              {data.destinations.map((d) => d.destination).join(' · ')}
            </span>
          </div>
        </div>
      </div>

      {/* Desglose por destino — datos reales */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Conversaciones por destino</h3>
        <table className="t">
          <thead>
            <tr>
              <th>Destino</th>
              <th>Conversaciones</th>
              <th>Inversión</th>
              <th>Costo / conv.</th>
              <th>Share conv.</th>
            </tr>
          </thead>
          <tbody>
            {data.destinations.map((d: MessagingDestinationRow) => {
              const share = t.conversations > 0 ? d.conversations / t.conversations : 0;
              return (
                <tr key={d.destination}>
                  <td>
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: destColor(d.destination),
                        marginRight: 8,
                      }}
                    />
                    <b>{d.destination}</b>
                  </td>
                  <td>{formatInt(d.conversations)}</td>
                  <td>{formatCurrency(d.spend, cur)}</td>
                  <td>{d.conversations > 0 ? formatCurrency(d.costPerConversation, cur) : '—'}</td>
                  <td>
                    <span className="hb">
                      <span
                        className="hb-fill"
                        style={{
                          width: `${Math.max(2, Math.round(share * 100))}%`,
                          background: destColor(d.destination),
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

      {/* Detalle por campaña — datos reales */}
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
          <h3 style={{ margin: '0', fontSize: '15px' }}>Campañas de mensajes</h3>
          <span className="period-pill">
            top {Math.min(ROW_LIMIT, data.campaignCount)} de {formatInt(data.campaignCount)} ·{' '}
            <b>por conversaciones</b>
          </span>
        </div>
        <table className="t">
          <thead>
            <tr>
              <th>Campaña</th>
              <th>Destino</th>
              <th>Conversaciones</th>
              <th>Inversión</th>
              <th>Costo / conv.</th>
              <th>Share conv.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c: MessagingCampaignRow) => {
              const share = t.conversations > 0 ? c.conversations / t.conversations : 0;
              return (
                <tr key={`${c.campaign}__${c.destination}`}>
                  <td>
                    <b>{c.campaign}</b>
                  </td>
                  <td>
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: destColor(c.destination),
                        marginRight: 6,
                      }}
                    />
                    {c.destination}
                  </td>
                  <td>{formatInt(c.conversations)}</td>
                  <td>{formatCurrency(c.spend, cur)}</td>
                  <td>{c.conversations > 0 ? formatCurrency(c.costPerConversation, cur) : '—'}</td>
                  <td>
                    <span className="hb">
                      <span
                        className="hb-fill"
                        style={{
                          width: `${Math.max(2, Math.round(share * 100))}%`,
                          background: destColor(c.destination),
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

      {/* Aviso honesto sobre el origen */}
      <div
        className="card"
        style={{ marginTop: '20px', borderStyle: 'dashed', borderColor: 'var(--b2)' }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Sobre estos datos</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Son las campañas de Meta optimizadas por <b>Conversaciones</b>. La métrica es{' '}
          <b>conversaciones con mensaje iniciadas</b> (dato real de Meta) y el destino sale del{' '}
          <code>destination_type</code> del conjunto de anuncios — por eso el dashboard sabe con
          certeza qué campaña va a WhatsApp, a Messenger o a Instagram Direct, sin adivinar por el
          nombre. Si alguna campaña aparece como <b>Sin clasificar</b>, es que Meta no devolvió ese
          dato para ese conjunto.
        </div>
      </div>
    </div>
  );
}
