'use client';

import { useEffect, useState } from 'react';
import { useGA4Cities, type CityRow } from '@/lib/hooks/useGA4Cities';
import type { DateRange } from '@/lib/period';
import { formatInt, formatNumber } from '@/lib/utils';
import { useSortableTable, type SortAccessor } from '@/components/ui/useSortableTable';

// Píldora de delta con flecha (verde sube / rojo baja), estilo Looker.
function Delta({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: up ? '#34d399' : '#f87171',
        whiteSpace: 'nowrap',
      }}
    >
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

const PAGE_SIZE = 20;

export function GA4Cities({
  clientId,
  range,
  previous,
}: {
  clientId: string;
  range: DateRange;
  previous: DateRange;
}) {
  const { data, loading, error } = useGA4Cities(clientId, range, previous);
  const [page, setPage] = useState(0);

  // Sorting al estilo Looker: ordena toda la lista antes de paginar.
  const cityAccessors: SortAccessor<CityRow>[] = [
    null, // # (índice)
    (r) => r.city,
    (r) => r.sessions,
    (r) => r.sessionsDelta,
    (r) => r.users,
    (r) => r.usersDelta,
    (r) => r.conversions,
    (r) => r.conversionsDelta,
  ];
  const { rows: sortedCities, headerProps } = useSortableTable(data?.cities ?? [], cityAccessors);

  // Vuelve a la hoja 1 cuando cambia el cliente o el rango de fechas.
  useEffect(() => {
    setPage(0);
  }, [clientId, range.from, range.to]);

  if (loading && !data) {
    return (
      <div className="card" style={{ marginTop: 20, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--mu)' }}>Cargando ciudades…</div>
      </div>
    );
  }

  // Si no hay datos de ciudades, no rompemos la vista: mostramos aviso honesto.
  if (error || !data || data.cities.length === 0) {
    return (
      <div
        className="card"
        style={{ marginTop: 20, padding: 20, borderStyle: 'dashed', borderColor: 'var(--b2)' }}
      >
        <h3 style={{ margin: '0 0 6px 0', fontSize: 15 }}>Ciudades</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)' }}>
          {error
            ? `No se pudieron cargar las ciudades: ${error}`
            : 'Aún no hay datos de ciudades en este período.'}
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.cities.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const startIdx = safePage * PAGE_SIZE;
  const rows: CityRow[] = sortedCities.slice(startIdx, startIdx + PAGE_SIZE);
  const maxSessions = Math.max(...data.cities.map((c) => c.sessions), 1);
  const maxUsers = Math.max(...data.cities.map((c) => c.users), 1);
  const maxConv = Math.max(...data.cities.map((c) => c.conversions), 1);

  return (
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
          <h3 style={{ margin: 0, fontSize: 15 }}>¿Desde qué ciudades visitan la Web?</h3>
          <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 4 }}>
            <b style={{ color: 'var(--tx)', fontSize: 14 }}>{formatInt(data.cityCount)}</b> ciudades ·{' '}
            <Delta value={data.cityCountDelta} /> vs período anterior
          </div>
        </div>
        <span className="period-pill">performance vs período anterior</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="t">
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th>
              <th {...headerProps(1)}>Ciudad</th>
              <th {...headerProps(2)}>Sesiones</th>
              <th {...headerProps(3)}>%Δ</th>
              <th {...headerProps(4)}>Usuarios</th>
              <th {...headerProps(5)}>%Δ</th>
              <th {...headerProps(6)}>Eventos clave</th>
              <th {...headerProps(7)}>%Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={`${c.country}|${c.city}`}>
                <td style={{ color: 'var(--mu)' }}>{startIdx + i + 1}</td>
                <td>
                  <b>{c.city}</b>
                  {c.country !== 'Colombia' && (
                    <span style={{ fontSize: 10, color: 'var(--mu)', marginLeft: 6 }}>{c.country}</span>
                  )}
                </td>
                <td>
                  <BarCell value={c.sessions} max={maxSessions} color="#34d399" />
                </td>
                <td>
                  <Delta value={c.sessionsDelta} />
                </td>
                <td>
                  <BarCell value={c.users} max={maxUsers} color="#15803d" />
                </td>
                <td>
                  <Delta value={c.usersDelta} />
                </td>
                <td>
                  <BarCell value={c.conversions} max={maxConv} color="#86efac" />
                </td>
                <td>
                  <Delta value={c.conversionsDelta} />
                </td>
              </tr>
            ))}
            <tr className="t-avg">
              <td />
              <td>Total ({formatInt(data.cityCount)} ciudades)</td>
              <td>{formatNumber(data.totals.sessions)}</td>
              <td>—</td>
              <td>{formatNumber(data.totals.users)}</td>
              <td>—</td>
              <td>{formatInt(data.totals.conversions)}</td>
              <td>—</td>
            </tr>
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
            <b style={{ color: 'var(--tx)' }}>{startIdx + rows.length}</b> de {data.cities.length} ciudades
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              style={pagerBtn(safePage === 0)}
            >
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
