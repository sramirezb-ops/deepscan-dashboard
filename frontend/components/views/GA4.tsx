'use client';

import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useGA4 } from '@/lib/hooks/useGA4';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatInt, formatNumber, formatPercentRaw } from '@/lib/utils';

// 90.5 segundos → "1m 31s"
function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function GA4() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useGA4(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const previousLabel = formatRangeLabel(previous);

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Cargando datos de GA4 de {client.name}…
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
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>Error cargando GA4</div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || data.totals.sessions === 0) {
    return (
      <EmptyState
        icon="📊"
        title="Sin datos de GA4 en este período"
        message={
          <>
            No hay datos de Google Analytics 4 para {client.name} entre <b>{rangeLabel}</b>.
          </>
        }
        hint="Prueba ampliar el rango de fechas con el filtro de arriba."
      />
    );
  }

  const t = data.totals;

  return (
    <div className="view on">
      <div className="hero">
        <div className="hero-title">Google Analytics 4</div>
        <div className="hero-sub" suppressHydrationWarning>
          Comportamiento web · {client.name} · {rangeLabel}
        </div>
      </div>

      {/* KPIs reales */}
      <div className="kpis">
        <div className="kpi k-ga4">
          <div className="kpi-lbl">Usuarios</div>
          <div className="kpi-val">{formatNumber(t.users)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${data.usersDelta >= 0 ? 'tgu' : 'tgd'}`}>
              {(data.usersDelta >= 0 ? '+' : '') + data.usersDelta.toFixed(1)}%
            </span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-ga4">
          <div className="kpi-lbl">Sesiones</div>
          <div className="kpi-val">{formatNumber(t.sessions)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${data.sessionsDelta >= 0 ? 'tgu' : 'tgd'}`}>
              {(data.sessionsDelta >= 0 ? '+' : '') + data.sessionsDelta.toFixed(1)}%
            </span>
            <span className="dcmp">{t.users > 0 ? (t.sessions / t.users).toFixed(2) : '—'}/user</span>
          </div>
        </div>
        <div className="kpi k-ga4">
          <div className="kpi-lbl">Bounce rate</div>
          <div className="kpi-val">{formatPercentRaw(t.bounceRate * 100, 1)}</div>
          <div className="kpi-bot">
            {/* Bajar el rebote es bueno → verde si el delta es negativo */}
            <span className={`kpi-delta ${data.bounceRateDelta <= 0 ? 'tgu' : 'tgd'}`}>
              {(data.bounceRateDelta >= 0 ? '+' : '') + data.bounceRateDelta.toFixed(1)}pp
            </span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-ga4">
          <div className="kpi-lbl">Duración media</div>
          <div className="kpi-val">{formatDuration(t.avgDuration)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${data.durationDelta >= 0 ? 'tgu' : 'tgd'}`}>
              {(data.durationDelta >= 0 ? '+' : '') + Math.round(data.durationDelta)}s
            </span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
      </div>

      {/* Tabla por fuente / medio — datos reales */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: '0', fontSize: '15px' }}>Tráfico por fuente / medio</h3>
          <span className="period-pill">
            {data.sources.length} fuentes · <b>ordenadas por sesiones</b>
          </span>
        </div>
        <table className="t">
          <thead>
            <tr>
              <th>Fuente / medio</th>
              <th>Sesiones</th>
              <th>Usuarios</th>
              <th>Conv.</th>
              <th>Bounce</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {data.sources.map((s) => {
              const share = t.sessions > 0 ? s.sessions / t.sessions : 0;
              return (
                <tr key={s.sourceMedium}>
                  <td>
                    <b>{s.sourceMedium}</b>
                  </td>
                  <td>{formatNumber(s.sessions)}</td>
                  <td>{formatNumber(s.users)}</td>
                  <td>{formatInt(s.conversions)}</td>
                  <td>{formatPercentRaw(s.bounceRate * 100, 1)}</td>
                  <td>
                    <span className="hb">
                      <span
                        className="hb-fill"
                        style={{ width: `${Math.max(2, Math.round(share * 100))}%`, background: '#38bdf8' }}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr className="t-avg">
              <td>Total</td>
              <td>{formatNumber(t.sessions)}</td>
              <td>{formatNumber(t.users)}</td>
              <td>{formatInt(t.conversions)}</td>
              <td>{formatPercentRaw(t.bounceRate * 100, 1)}</td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Bloques sin fuente real — aviso honesto */}
      <div
        className="card"
        style={{ marginTop: '20px', borderStyle: 'dashed', borderColor: 'var(--b2)' }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Próximamente en esta vista</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          El <b>funnel de eventos</b> (view_item, add_to_cart, purchase…), el desglose por{' '}
          <b>ciudad</b>, las <b>páginas top</b> y el <b>Agente Web Analytics IA</b> requieren tablas
          de GA4 a nivel evento/página que aún no están conectadas. Por ahora esta vista muestra solo
          datos reales y verificables: sesiones, usuarios, rebote, duración y conversiones por fuente.
        </div>
      </div>
    </div>
  );
}
