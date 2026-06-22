'use client';

// ============================================================
// useSortableTable — ordenar tablas haciendo clic en el encabezado
// ============================================================
// Estilo Looker: cada columna ordenable se ordena al hacer clic; un segundo
// clic invierte el sentido. Reusable en TODO el dashboard con cambios mínimos:
//
//   const { rows, headerProps } = useSortableTable(data, [
//     null,                 // col 0 (#) no ordenable
//     (r) => r.name,        // col 1 ordena por texto
//     (r) => r.sessions,    // col 2 ordena por número
//   ]);
//   ...
//   <th {...headerProps(2)}>Sesiones</th>
//   ...
//   {rows.map(...)}
//
// `accessors` es un arreglo paralelo a las columnas: una función que extrae el
// valor a ordenar, o `null` si esa columna no se ordena (índices, barras, etc.).
// ============================================================

import { useCallback, useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';
export type SortAccessor<T> = ((row: T) => number | string | null | undefined) | null;
export interface SortState {
  col: number;
  dir: SortDir;
}

export function useSortableTable<T>(
  data: T[],
  accessors: SortAccessor<T>[],
  initial: SortState | null = null,
) {
  const [sort, setSort] = useState<SortState | null>(initial);

  const rows = useMemo(() => {
    if (!sort) return data;
    const acc = accessors[sort.col];
    if (!acc) return data;
    // Decoramos con el índice original para un orden ESTABLE (empates conservan
    // su posición previa).
    const decorated = data.map((row, i) => [row, i] as [T, number]);
    decorated.sort((A, B) => {
      const va = acc(A[0]);
      const vb = acc(B[0]);
      const emptyA = va == null || va === '';
      const emptyB = vb == null || vb === '';
      if (emptyA && emptyB) return A[1] - B[1];
      if (emptyA) return 1; // vacíos siempre al final
      if (emptyB) return -1;
      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' });
      }
      if (cmp === 0) return A[1] - B[1];
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return decorated.map(([row]) => row);
    // accessors se recrea por render; las tablas son pequeñas, recalcular es barato.
  }, [data, accessors, sort]);

  const sortBy = useCallback((col: number) => {
    setSort((prev) => {
      if (prev && prev.col === col) {
        return { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      // Primer clic: descendente (lo más útil para métricas: mayor primero).
      return { col, dir: 'desc' };
    });
  }, []);

  /** Props para el <th>: clic, teclado y estado visual de la flecha. */
  const headerProps = useCallback(
    (col: number, extraClassName?: string) => {
      if (!accessors[col]) return extraClassName ? { className: extraClassName } : {};
      const active = sort?.col === col;
      return {
        className: `th-sort${extraClassName ? ' ' + extraClassName : ''}`,
        'data-sort': active ? sort!.dir : 'none',
        role: 'button' as const,
        tabIndex: 0,
        title: 'Ordenar por esta columna',
        onClick: () => sortBy(col),
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            sortBy(col);
          }
        },
      };
    },
    [accessors, sort, sortBy],
  );

  return { rows, sort, sortBy, headerProps };
}
