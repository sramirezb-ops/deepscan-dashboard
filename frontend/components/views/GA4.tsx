'use client';

import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useGA4 } from '@/lib/hooks/useGA4';
import { EmptyState } from '@/components/ui/EmptyState';
import { TrendChart } from '@/components/ui/TrendChart';
import { formatInt, formatNumber, formatPercentRaw } from '@/lib/utils';

// 90.5 segundos → "1m 31s"
function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// "2026-06-19" → "19 jun"
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const day = Number(m[3]);
  const mon = MONTHS[Number(m[2]) - 1] ?? '';
  return `${day} ${mon}`;
}

// Píldora de delta reutilizable (verde si mejora). `lowerIsBetter` invierte el color.
function DeltaPill({
  delta,
  suffix = '%',
  lowerIsBetter = false,
}: {
  delta: number;
  suffix?: string;
  lowerIsBetter?: boolean;
}) {
  const good = lowerIsBetter ? delta <= 0 : delta >= 0;
  const sign = delta >= 0 ? '+' : '';
  const val = suffix === '%' || suffix === 'pp' ? delta.toFixed(1) : String(Math.round(delta));
  return <span className={`kpi-delta ${good ? 'tgu' : 'tgd'}`}>{sign + val + suffix}</span>;
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
  const labels = data.series.map((p) => shortDate(p.date));
  // Tasa de evento clave = eventos clave / sesiones (proxy de conversión web).
  const keyEventRate = t.sessions > 0 ? (t.conversions / t.sessions) * 100 : 0;

  return (
    <div className="view on">
      <div className="hero">
        <div className="hero-title">Google Analytics 4</div>
        <div className="hero-sub" suppressHydrationWarning>
          Comportamiento web · {client.name} · {rangeLabel}
        </div>
      </div>

      {/* KPIs principales — replican la cabecera de Looker */}
      <div className="kpis">
        <div className="kpi k-ga4">
          <div className="kpi-lbl">Usuarios</div>
          <div className="kpi-val">{formatNumber(t.users)}</div>
          <div className="kpi-bot">
            <DeltaPill delta={data.usersDelta} />
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-ga4">
          <div className="kpi-lbl">Usuarios nuevos</div>
          <div className="kpi-val">{formatNumber(t.newUsers)}</div>
          <div className="kpi-bot">
            <DeltaPill delta={data.newUsersDelta} />
            <span className="dcmp">
              {t.users > 0 ? formatPercentRaw((t.newUsers / t.users) * 100, 0) : '—'} del total
            </span>
          </div>
        </div>
        <div className="kpi k-ga4">
          <div className="kpi-lbl">Sesiones</div>
          <div className="kpi-val">{formatNumber(t.sessions)}</div>
          <div className="kpi-bot">
            <DeltaPill delta={data.sessionsDelta} />
            <span className="dcmp">
              {t.users > 0 ? (t.sessions / t.users).toFixed(2) : '—'}/usuario
            </span>
          </div>
        </div>
        <div className="kpi k-ga4">
          <div className="kpi-lbl">Eventos clave</div>
          <div className="kpi-val">{formatInt(t.conversions)}</div>
          <div className="kpi-bot">
            <DeltaPill delta={data.conversionsDelta} />
            <span className="dcmp">{formatPercentRaw(keyEventRate, 1)} de sesiones</span>
          </div>
        </div>
      </div>

      {/* Tendencias diarias — área estilo Looker */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          marginTop: 20,
        }}
      >
        <TrendChart
          title="Sesiones por día"
          headline={formatNumber(t.sessions)}
          sub={`${rangeLabel}`}
          points={data.series.map((p) => p.sessions)}
          labels={labels}
          color="#38bdf8"
          format={formatNumber}
        />
        <TrendChart
          title="Eventos clave por día"
          headline={formatInt(t.conversions)}
          sub={`${rangeLabel}`}
          points={data.series.map((p) => p.conversions)}
          labels={labels}
          color="#34d399"
          format={formatInt}
        />
      </div>

      {/* Engagement secundario */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginTop: 16,
        }}
      >
        <div className="kpi k-ga4">
          <div className="kpi-lbl">Tasa de rebote</div>
          <div className="kpi-val">{formatPercentRaw(t.bounceRate * 100, 1)}</div>
          <div className="kpi-bot">
            <DeltaPill delta={data.bounceRateDelta} suffix="pp" lowerIsBetter />
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-ga4">
          <div className="kpi-lbl">Duración media</div>
          <div className="kpi-val">{formatDuration(t.avgDuration)}</div>
          <div className="kpi-bot">
            <DeltaPill delta={data.durationDelta} suffix="s" />
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-ga4">
          <div className="kpi-lbl">Tasa de evento clave</div>
          <div className="kpi-val">{formatPercentRaw(keyEventRate, 2)}</div>
          <div className="kpi-bot">
            <span className="dcmp">eventos clave ÷ sesiones</span>
          </div>
        </div>
      </div>

      {/* Canales de adquisición de tráfico — datos reales */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: '0', fontSize: '15px' }}>Canales de adquisición de tráfico</h3>
          <span className="period-pill">
            {data.sources.length} canales · <b>ordenados por sesiones</b>
          </span>
        </div>
        <table className="t">
          <thead>
            <tr>
              <th>Canal</th>
              <th>Sesiones</th>
              <th>Usuarios</th>
              <th>Eventos clave</th>
              <th>Rebote</th>
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
          El desglose por <b>ciudad</b>, el detalle de <b>eventos clave nombrados</b> (Escribir
          correo, Descargar catálogo, Clics a WhatsApp…), las <b>páginas top</b> y el{' '}
          <b>Agente Web Analytics IA</b> requieren tablas de GA4 a nivel evento/página que aún no
          están conectadas en el ETL. Por ahora esta vista muestra solo datos reales y verificables:
          usuarios, sesiones, eventos clave, rebote, duración y canales de adquisición.
        </div>
      </div>
    </div>
  );
}
