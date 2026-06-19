'use client';

import { useEffect, useState } from 'react';
import { useGA4Pages, type PageRow, type LandingRow } from '@/lib/hooks/useGA4Pages';
import type { DateRange } from '@/lib/period';
import { formatInt, formatNumber } from '@/lib/utils';

// Píldora de delta con flecha (verde sube / rojo baja), estilo Looker.
function Delta({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: up ? '#34d399' : '#f87171', whiteSpace: 'nowrap' }}>
      {up ? '▲' : '▼'} {(up ? '+' : '') + value.toFixed(1)}%
    </span>
  );
}

// Celda con valor + mini-barra proporcional al máximo de la columna.
function BarCell({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ minWidth: 90 }}>
      <div style={{ fontSize: 12, color: 'var(--tx)', marginBottom: 3 }}>{formatNumber(value)}</div>
      <div style={{ height: 4, background: 'var(--b2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
    </div>
  );
}

// Δ% entre actual y anterior; 0 si no hay base previa.
function pctDelta(now: number, prev: number): number {
  if (!prev || prev === 0) return 0;
  return ((now - prev) / prev) * 100;
}

// Duración de interacción media por sesión → "1m 23s" / "45s".
function fmtDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toString().padStart(2, '0')}s`;
}

// Tasa de rebote (0..1) → "45,2%" con coma decimal.
function fmtBounce(rate: number): string {
  return `${(rate * 100).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

// Acorta rutas largas para que la tabla no se rompa.
function shortPath(path: string): string {
  if (path.length <= 48) return path;
  return path.slice(0, 45) + '…';
}

const PAGE_SIZE = 50;

export function GA4Pages({
  clientId,
  range,
  previous,
}: {
  clientId: string;
  range: DateRange;
  previous: DateRange;
}) {
  const { data, loading, error } = useGA4Pages(clientId, range, previous);
  const [page, setPage] = useState(0);

  // Vuelve a la hoja 1 cuando cambia el cliente o el rango de fechas.
  useEffect(() => {
    setPage(0);
  }, [clientId, range.from, range.to]);

  if (loading && !data) {
    return (
      <div className="card" style={{ marginTop: 20, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--mu)' }}>Cargando páginas…</div>
      </div>
    );
  }

  // Sin datos: aviso honesto, no rompemos la vista.
  if (error || !data || data.pages.length === 0) {
    return (
      <div className="card" style={{ marginTop: 20, padding: 20, borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <h3 style={{ margin: '0 0 6px 0', fontSize: 15 }}>Páginas con más tráfico</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)' }}>
          {error
            ? `No se pudieron cargar las páginas: ${error}`
            : 'Aún no hay datos de páginas en este período. Corre el ETL para poblarlos.'}
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.pages.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const startIdx = safePage * PAGE_SIZE;
  const rows: PageRow[] = data.pages.slice(startIdx, startIdx + PAGE_SIZE);
  const maxViews = Math.max(...data.pages.map((p) => p.views), 1);
  const maxUsers = Math.max(...data.pages.map((p) => p.users), 1);

  // Landings: top 15 (la entrada relevante suele concentrarse en pocas URLs).
  const landings: LandingRow[] = data.landings.slice(0, 15);
  const maxLandSess = Math.max(...data.landings.map((l) => l.sessions), 1);

  return (
    <>
      {/* ── PÁGINAS CON MÁS TRÁFICO ───────────────────────── */}
      <div className="card" style={{ marginTop: 20 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 15 }}>Páginas con más tráfico</h3>
            <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 4 }}>
              <b style={{ color: 'var(--tx)', fontSize: 14 }}>{formatInt(data.pages.length)}</b> páginas ·{' '}
              <b style={{ color: 'var(--tx)' }}>{formatNumber(data.totalViews)}</b> vistas en total
            </div>
          </div>
          <span className="period-pill">performance vs período anterior</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="t">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th>Página</th>
                <th>Vistas</th>
                <th>%Δ</th>
                <th>Usuarios</th>
                <th>Interacción media</th>
                <th>Rebote</th>
                <th>Eventos clave</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={p.path}>
                  <td style={{ color: 'var(--mu)' }}>{startIdx + i + 1}</td>
                  <td>
                    <b style={{ display: 'block' }}>{shortPath(p.path)}</b>
                    {p.title && p.title !== p.path && (
                      <span style={{ fontSize: 10, color: 'var(--mu)' }}>{p.title}</span>
                    )}
                  </td>
                  <td>
                    <BarCell value={p.views} max={maxViews} color="#34d399" />
                  </td>
                  <td>
                    <Delta value={pctDelta(p.views, p.prevViews)} />
                  </td>
                  <td>
                    <BarCell value={p.users} max={maxUsers} color="#15803d" />
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--tx)', whiteSpace: 'nowrap' }}>
                    {fmtDuration(p.avgEngagement)}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--tx)', whiteSpace: 'nowrap' }}>
                    {fmtBounce(p.bounceRate)}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--tx)' }}>{formatInt(p.conversions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div
            style={{
              marginTop: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--mu)' }}>
              Mostrando <b style={{ color: 'var(--tx)' }}>{startIdx + 1}</b>–
              <b style={{ color: 'var(--tx)' }}>{startIdx + rows.length}</b> de {data.pages.length} páginas
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} style={pagerBtn(safePage === 0)}>
                ‹ Anterior
              </button>
              <span style={{ fontSize: 12, color: 'var(--mu)', whiteSpace: 'nowrap' }}>
                Hoja <b style={{ color: 'var(--tx)' }}>{safePage + 1}</b> de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                style={pagerBtn(safePage >= totalPages - 1)}
              >
                Siguiente ›
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── EXPLORACIÓN DE RUTA: PÁGINAS DE ENTRADA ────────── */}
      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Exploración de ruta · Páginas de entrada</h3>
          <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 4 }}>
            Por dónde <b style={{ color: 'var(--tx)' }}>empiezan</b> la navegación los usuarios y cómo se comporta cada
            puerta de entrada.
          </div>
        </div>

        {landings.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>Aún no hay datos de páginas de entrada en este período.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="t">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>#</th>
                  <th>Página de entrada</th>
                  <th>Sesiones</th>
                  <th>%Δ</th>
                  <th>Usuarios</th>
                  <th>Rebote</th>
                  <th>Eventos clave</th>
                </tr>
              </thead>
              <tbody>
                {landings.map((l, i) => (
                  <tr key={l.landing}>
                    <td style={{ color: 'var(--mu)' }}>{i + 1}</td>
                    <td>
                      <b>{shortPath(l.landing)}</b>
                    </td>
                    <td>
                      <BarCell value={l.sessions} max={maxLandSess} color="#34d399" />
                    </td>
                    <td>
                      <Delta value={pctDelta(l.sessions, l.prevSessions)} />
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--tx)' }}>{formatNumber(l.users)}</td>
                    <td style={{ fontSize: 12, color: 'var(--tx)', whiteSpace: 'nowrap' }}>{fmtBounce(l.bounceRate)}</td>
                    <td style={{ fontSize: 12, color: 'var(--tx)' }}>{formatInt(l.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Nota honesta sobre el alcance del dato (sin inventar Sankey). */}
        <div
          style={{
            marginTop: 14,
            fontSize: 11,
            color: 'var(--mu)',
            background: 'var(--b1)',
            borderRadius: 8,
            padding: '10px 12px',
            lineHeight: 1.5,
          }}
        >
          ℹ️ La <b>página de entrada</b> es la primera página de cada sesión: muestra dónde comienza la navegación. El
          flujo paso a paso completo (página 1 → página 2 → página 3) requiere la exportación de eventos de GA4 a
          BigQuery, que hoy no está conectada para esta cuenta.
        </div>
      </div>
    </>
  );
}

// Estilo de los botones de paginación (atenuados cuando están deshabilitados).
function pagerBtn(disabled: boolean): React.CSSProperties {
  return {
    background: 'transparent',
    border: '1px solid var(--b2)',
    borderRadius: 8,
    color: disabled ? 'var(--b2)' : 'var(--tx)',
    fontSize: 12,
    padding: '6px 12px',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    whiteSpace: 'nowrap',
  };
}
