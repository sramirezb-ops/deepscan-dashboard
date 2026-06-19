'use client';

import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useGA4 } from '@/lib/hooks/useGA4';
import { EmptyState } from '@/components/ui/EmptyState';
import { ComparisonAreaChart } from '@/components/ui/ComparisonAreaChart';
import { GA4Funnel } from '@/components/views/GA4Funnel';
import { GA4Pages } from '@/components/views/GA4Pages';
import { GA4Cities } from '@/components/views/GA4Cities';
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
  const labelsPrev = data.seriesPrev.map((p) => shortDate(p.date));
  // Tasa de evento clave = eventos clave / sesiones (proxy de conversión web).
  const keyEventRate = t.sessions > 0 ? (t.conversions / t.sessions) * 100 : 0;
  const sessionsPerUser = t.users > 0 ? t.sessions / t.users : 0;
  const maxSourceSessions = Math.max(...data.sources.map((s) => s.sessions), 1);

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

      {/* Crecimiento acumulado: período actual vs anterior (estilo Looker) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          marginTop: 20,
        }}
      >
        <ComparisonAreaChart
          title="Crecimiento del tráfico (acumulado)"
          headline={formatNumber(t.sessions)}
          sub={`Sesiones · ${rangeLabel} vs anterior`}
          current={data.series.map((p) => p.sessions)}
          previous={data.seriesPrev.map((p) => p.sessions)}
          labelsCurrent={labels}
          labelsPrevious={labelsPrev}
          color="#38bdf8"
          format={formatNumber}
        />
        <ComparisonAreaChart
          title="Eventos clave (acumulado)"
          headline={formatInt(t.conversions)}
          sub={`Eventos clave · ${rangeLabel} vs anterior`}
          current={data.series.map((p) => p.conversions)}
          previous={data.seriesPrev.map((p) => p.conversions)}
          labelsCurrent={labels}
          labelsPrevious={labelsPrev}
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
          <div className="kpi-lbl">Sesiones por usuario</div>
          <div className="kpi-val">{sessionsPerUser.toFixed(2)}</div>
          <div className="kpi-bot">
            <span className="dcmp">sesiones ÷ usuarios</span>
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

      {/* Canales de adquisición de tráfico — barras horizontales estilo Looker */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: '0', fontSize: '15px' }}>Canales de adquisición de tráfico</h3>
          <span className="period-pill">
            {data.sources.length} canales · <b>por sesiones</b>
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.sources.map((s) => {
            const w = Math.max(2, Math.round((s.sessions / maxSourceSessions) * 100));
            return (
              <div
                key={s.sourceMedium}
                style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12, alignItems: 'center' }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--tx)',
                    textAlign: 'right',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={s.sourceMedium}
                >
                  {s.sourceMedium}
                </div>
                <div style={{ position: 'relative', height: 22 }}>
                  <div
                    style={{
                      width: `${w}%`,
                      height: '100%',
                      background: '#34d399',
                      borderRadius: 4,
                      minWidth: 2,
                      transition: 'width .3s',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: `calc(${w}% + 8px)`,
                      transform: 'translateY(-50%)',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--mu)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatNumber(s.sessions)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Funnel de leads — eventos clave reales (ga4_events) */}
      <GA4Funnel
        clientId={client.id}
        range={range}
        previous={previous}
        totals={t}
        totalsPrev={data.totalsPrev}
      />

      {/* Páginas con más tráfico + exploración de ruta — datos reales (ga4_pages / ga4_landing) */}
      <GA4Pages clientId={client.id} range={range} previous={previous} />

      {/* Ciudades — datos reales (ga4_cities) */}
      <GA4Cities clientId={client.id} range={range} previous={previous} />

      {/* Bloques sin fuente real — aviso honesto */}
      <div
        className="card"
        style={{ marginTop: '20px', borderStyle: 'dashed', borderColor: 'var(--b2)' }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Próximamente en esta vista</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          El <b>Agente Web Analytics IA</b> y el <b>flujo de ruta paso a paso</b> (Sankey
          página 1 → 2 → 3) requieren la exportación de eventos de GA4 a BigQuery, que aún no está
          conectada para esta cuenta. Por ahora esta vista muestra solo datos reales y verificables:
          usuarios, sesiones, eventos clave, rebote, duración, canales de adquisición,{' '}
          <b>funnel de leads</b>, <b>páginas con más tráfico</b>, <b>páginas de entrada</b> y ciudades.
        </div>
      </div>
    </div>
  );
}
