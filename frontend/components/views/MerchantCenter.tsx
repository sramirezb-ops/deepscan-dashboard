'use client';

import { useClient } from '@/lib/useClient';
import { useMerchantCenter } from '@/lib/hooks/useMerchantCenter';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatInt, formatPercentRaw } from '@/lib/utils';

export function MerchantCenter() {
  const client = useClient();
  const { data, loading, error } = useMerchantCenter(client.id);

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Cargando feed de Merchant Center de {client.name}…
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
            Error cargando Merchant Center
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <EmptyState
        icon="📦"
        title="Sin productos en Merchant Center"
        message={
          <>
            No hay productos en el feed de Google Merchant Center para {client.name} por el momento.
          </>
        }
        hint="En cuanto el feed se sincronice, los productos aparecerán aquí automáticamente."
      />
    );
  }

  const approvalPct = data.approvalRate * 100;
  const approvalTone = approvalPct >= 90 ? '#22d97a' : approvalPct >= 60 ? '#f5b14c' : '#ef4444';

  return (
    <div className="view on">
      <div className="hero">
        <div className="hero-title">Google Merchant Center</div>
        <div className="hero-sub" suppressHydrationWarning>
          Salud del feed · {client.name} · cuenta avanzada (MCA) · {data.feeds.length} subcuentas
        </div>
      </div>

      {/* KPIs reales — foto actual del feed */}
      <div className="kpis">
        <div className="kpi k-google">
          <div className="kpi-lbl">Productos en feed</div>
          <div className="kpi-val">{formatInt(data.total)}</div>
          <div className="kpi-bot">
            <span style={{ fontSize: 11, color: 'var(--mu)' }}>foto actual</span>
          </div>
        </div>
        <div className="kpi k-green">
          <div className="kpi-lbl">Aprobados</div>
          <div className="kpi-val">{formatInt(data.approved)}</div>
          <div className="kpi-bot">
            <span style={{ fontSize: 11, color: approvalTone }}>
              {formatPercentRaw(approvalPct, 1)} del feed
            </span>
          </div>
        </div>
        <div className="kpi k-amber">
          <div className="kpi-lbl" style={{ color: '#ef4444' }}>
            Rechazados
          </div>
          <div className="kpi-val" style={{ color: '#ef4444' }}>
            {formatInt(data.disapproved)}
          </div>
          <div className="kpi-bot">
            <span style={{ fontSize: 11, color: 'var(--mu)' }}>
              {formatPercentRaw(100 - approvalPct, 1)} no sirven en Shopping/PMAX
            </span>
          </div>
        </div>
        <div className="kpi k-google">
          <div className="kpi-lbl">Subcuentas</div>
          <div className="kpi-val">{data.feeds.length}</div>
          <div className="kpi-bot">
            <span style={{ fontSize: 11, color: 'var(--mu)' }}>Shopify · sitio propio</span>
          </div>
        </div>
      </div>

      {/* Salud por subcuenta — el dato clave de la cuenta avanzada */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h3 style={{ margin: '0', fontSize: '15px' }}>Salud por subcuenta (feed)</h3>
          <span className="period-pill">cuenta avanzada · 2 feeds</span>
        </div>
        <table className="t">
          <thead>
            <tr>
              <th>Subcuenta / feed</th>
              <th>Productos</th>
              <th>Aprobados</th>
              <th>Rechazados</th>
              <th>% aprobado</th>
              <th>Salud</th>
            </tr>
          </thead>
          <tbody>
            {data.feeds.map((f) => {
              const pct = f.approvalRate * 100;
              const tone = pct >= 90 ? '#22d97a' : pct >= 60 ? '#f5b14c' : '#ef4444';
              return (
                <tr key={f.label}>
                  <td>
                    <b>{f.label}</b>
                  </td>
                  <td>{formatInt(f.total)}</td>
                  <td style={{ color: '#22d97a' }}>{formatInt(f.approved)}</td>
                  <td style={{ color: f.disapproved > 0 ? '#ef4444' : 'var(--mu)' }}>
                    {formatInt(f.disapproved)}
                  </td>
                  <td style={{ color: tone, fontWeight: 600 }}>{formatPercentRaw(pct, 1)}</td>
                  <td>
                    <span className="hb">
                      <span
                        className="hb-fill"
                        style={{ width: `${Math.max(2, Math.round(pct))}%`, background: tone }}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr className="t-avg">
              <td>Total</td>
              <td>{formatInt(data.total)}</td>
              <td>{formatInt(data.approved)}</td>
              <td>{formatInt(data.disapproved)}</td>
              <td>{formatPercentRaw(approvalPct, 1)}</td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Top issues — muestra real de productos rechazados */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h3 style={{ margin: '0', fontSize: '15px' }}>Motivos de rechazo más frecuentes</h3>
          <span className="period-pill">
            muestra de {formatInt(data.issuesSampleSize)} productos rechazados
          </span>
        </div>
        {data.topIssues.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>
            No se detectaron motivos de rechazo en la muestra.
          </div>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>Motivo (Google)</th>
                <th>Productos afectados (muestra)</th>
                <th>Peso</th>
              </tr>
            </thead>
            <tbody>
              {data.topIssues.map((iss) => {
                const share =
                  data.issuesSampleSize > 0 ? iss.products / data.issuesSampleSize : 0;
                return (
                  <tr key={iss.description}>
                    <td>
                      <b>{iss.description}</b>
                    </td>
                    <td>{formatInt(iss.products)}</td>
                    <td>
                      <span className="hb">
                        <span
                          className="hb-fill"
                          style={{
                            width: `${Math.max(2, Math.round(share * 100))}%`,
                            background: '#f5b14c',
                          }}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Nota honesta — qué es y qué falta */}
      <div
        className="card"
        style={{ marginTop: '20px', borderStyle: 'dashed', borderColor: 'var(--b2)' }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Cómo leer esta vista</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Es una <b>foto actual</b> del feed (no una serie temporal), por eso el filtro de fechas de
          arriba no aplica aquí. Los conteos de productos, aprobados y rechazados por subcuenta son{' '}
          <b>reales y exactos</b>. Los motivos de rechazo se calculan sobre una <b>muestra</b> de
          productos rechazados, así que su orden es representativo pero el conteo no es del feed
          completo. El cruce con clicks/impresiones y revenue por producto (zombies, top CTR)
          requiere conectar las tablas de rendimiento a nivel producto, que aún no están en la base.
        </div>
      </div>
    </div>
  );
}
