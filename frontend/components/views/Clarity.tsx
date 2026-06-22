'use client';

import { HeroHead } from '@/components/ui/BrandLogo';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import {
  useClarity,
  type ClarityDailyRow,
  type ClarityPageRow,
} from '@/lib/hooks/useClarity';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatInt, formatPercent } from '@/lib/utils';
import { useSortableTable, type SortAccessor } from '@/components/ui/useSortableTable';

// ============================================================
// Clarity · CRO — comportamiento real del sitio
// ============================================================
// Datos reales de clarity_metrics (por día, respetando el filtro de fechas) y
// clarity_pages (detalle por página). Todo llega vía la Data Export API de
// Microsoft Clarity. Mientras el ETL no escriba filas, muestra un estado honesto.
// ============================================================

const CLARITY_BLUE = '#4f6bed'; // azul Clarity

const PAGE_LIMIT = 30;

function fmtDay(iso: string): string {
  // 2026-06-16 → "16 jun" (sin depender de zona horaria)
  const [, m, d] = iso.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mi = Number(m) - 1;
  return `${Number(d)} ${meses[mi] ?? m}`;
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === '/' || u.pathname === '' ? '(inicio)' : u.pathname;
  } catch {
    return url;
  }
}

export function Clarity() {
  const client = useClient();
  const { range } = usePeriod();
  const { data, loading, error } = useClarity(client.id, range);

  const rangeLabel = formatRangeLabel(range);

  // Sorting Looker. Orden por defecto: diario más reciente primero (daily invertido),
  // páginas por sesiones desc (ya vienen así). El hook conserva ese orden hasta el clic.
  const dailySource = data ? [...data.daily].reverse() : [];
  const dailyAccessors: SortAccessor<ClarityDailyRow>[] = [
    (r) => r.date,
    (r) => r.sessions,
    (r) => r.scrollDepth,
    (r) => r.deadClickRate,
    (r) => r.rageClickRate,
    (r) => r.quickBackRate,
    null, // barra relativa
  ];
  const { rows: sortedDaily, headerProps: dailyHeaderProps } = useSortableTable(
    dailySource,
    dailyAccessors,
  );

  const pageSource = data ? data.pages.slice(0, PAGE_LIMIT) : [];
  const pageAccessors: SortAccessor<ClarityPageRow>[] = [
    (r) => r.pageUrl,
    (r) => r.sessions,
    (r) => r.scrollDepth,
    (r) => r.deadClicks,
    (r) => r.rageClicks,
    null, // barra relativa
  ];
  const { rows: sortedPages, headerProps: pageHeaderProps } = useSortableTable(
    pageSource,
    pageAccessors,
  );

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Cargando comportamiento de {client.name}…
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
            Error cargando Clarity
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || data.totals.sessions === 0) {
    return (
      <EmptyState
        icon="🔬"
        title="Esperando el comportamiento de Clarity"
        message={
          <>
            Aún no hay sesiones registradas para {client.name} entre <b>{rangeLabel}</b>. En cuanto la
            sincronización escriba las métricas en la tabla <code>clarity_metrics</code>, esta vista
            mostrará sesiones, scroll depth, dead clicks, rage clicks, quickbacks y el detalle de
            comportamiento por página, todo con datos reales.
          </>
        }
        hint="La API de Clarity solo entrega los últimos 1–3 días, así que el historial se va llenando hacia adelante con cada sincronización."
      />
    );
  }

  const t = data.totals;
  // Tabla diaria: más reciente primero (orden por defecto), ya ordenable.
  const dailyRows = sortedDaily;
  const maxDailySessions = Math.max(1, ...data.daily.map((d) => d.sessions));
  const pages = sortedPages;
  const maxPageSessions = Math.max(1, ...pageSource.map((p) => p.sessions));

  return (
    <div className="view on">
      <div className="hero">
        <HeroHead brand="clarity">Clarity · CRO</HeroHead>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {formatInt(t.sessions)} sesiones ·{' '}
          {formatPercent(t.scrollDepth, 1)} scroll promedio
        </div>
      </div>

      {/* KPIs reales */}
      <div className="kpis">
        <div className="kpi k-green">
          <div className="kpi-lbl">Sesiones</div>
          <div className="kpi-val">{formatInt(t.sessions)}</div>
          <div className="kpi-bot">
            <span className="dcmp">{formatInt(t.daysWithData)} días con datos</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Scroll depth</div>
          <div className="kpi-val">{formatPercent(t.scrollDepth, 1)}</div>
          <div className="kpi-bot">
            <span className="dcmp">profundidad promedio de página</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Dead clicks</div>
          <div className="kpi-val">{formatPercent(t.deadClickRate, 2)}</div>
          <div className="kpi-bot">
            <span className="dcmp">{formatPercent(t.rageClickRate, 2)} rage clicks</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Quickback</div>
          <div className="kpi-val">{formatPercent(t.quickBackRate, 2)}</div>
          <div className="kpi-bot">
            <span className="dcmp">vuelven atrás rápido (fricción)</span>
          </div>
        </div>
      </div>

      {/* Comportamiento por día — datos reales */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Comportamiento por día</h3>
        <table className="t">
          <thead>
            <tr>
              <th {...dailyHeaderProps(0)}>Fecha</th>
              <th {...dailyHeaderProps(1)}>Sesiones</th>
              <th {...dailyHeaderProps(2)}>Scroll</th>
              <th {...dailyHeaderProps(3)}>Dead clicks</th>
              <th {...dailyHeaderProps(4)}>Rage clicks</th>
              <th {...dailyHeaderProps(5)}>Quickback</th>
              <th>Sesiones (rel.)</th>
            </tr>
          </thead>
          <tbody>
            {dailyRows.map((d: ClarityDailyRow) => {
              const share = d.sessions / maxDailySessions;
              return (
                <tr key={d.date}>
                  <td>
                    <b>{fmtDay(d.date)}</b>
                  </td>
                  <td>{formatInt(d.sessions)}</td>
                  <td>{formatPercent(d.scrollDepth, 1)}</td>
                  <td>{formatPercent(d.deadClickRate, 2)}</td>
                  <td>{formatPercent(d.rageClickRate, 2)}</td>
                  <td>{formatPercent(d.quickBackRate, 2)}</td>
                  <td>
                    <span className="hb">
                      <span
                        className="hb-fill"
                        style={{
                          width: `${Math.max(2, Math.round(share * 100))}%`,
                          background: CLARITY_BLUE,
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

      {/* Páginas más vistas — datos reales */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Páginas con más sesiones</h3>
        <table className="t">
          <thead>
            <tr>
              <th {...pageHeaderProps(0)}>Página</th>
              <th {...pageHeaderProps(1)}>Sesiones</th>
              <th {...pageHeaderProps(2)}>Scroll</th>
              <th {...pageHeaderProps(3)}>Dead clicks</th>
              <th {...pageHeaderProps(4)}>Rage clicks</th>
              <th>Sesiones (rel.)</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p: ClarityPageRow) => {
              const share = p.sessions / maxPageSessions;
              return (
                <tr key={p.pageUrl}>
                  <td>
                    <a
                      href={p.pageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      <b>{shortPath(p.pageUrl)}</b>
                    </a>
                  </td>
                  <td>{formatInt(p.sessions)}</td>
                  <td>{formatPercent(p.scrollDepth, 1)}</td>
                  <td>{formatInt(p.deadClicks)}</td>
                  <td>{formatInt(p.rageClicks)}</td>
                  <td>
                    <span className="hb">
                      <span
                        className="hb-fill"
                        style={{
                          width: `${Math.max(2, Math.round(share * 100))}%`,
                          background: CLARITY_BLUE,
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
          Vienen directo de la <b>Data Export API de Microsoft Clarity</b> (tablas{' '}
          <code>clarity_metrics</code> y <code>clarity_pages</code>). El <b>dead/rage click rate</b> y
          el <b>quickback</b> son el porcentaje de sesiones con esa fricción (definición nativa de
          Clarity); el <b>scroll</b> es la profundidad promedio. La API de Clarity{' '}
          <b>solo entrega los últimos 1–3 días</b>, así que el historial se acumula hacia adelante con
          cada sincronización diaria — no hay backfill de fechas anteriores.
        </div>
      </div>
    </div>
  );
}
