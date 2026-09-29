'use client';

// ============================================================
// DataTable — tabla reutilizable estilo Google/Looker
// ============================================================
// Ordenar por columna (clic en encabezado), filtro dinámico (busca en el texto
// de las filas) y paginado con selector 10/20/50/100/Todos. Cada columna define
// cómo se RENDERIZA, por qué valor se ORDENA y qué TEXTO se busca — así soporta
// celdas ricas (barras, badges) sin perder orden/búsqueda.
//
//   <DataTable rows={data} rowKey={(r)=>r.id} columns={[
//     { key:'name', header:'Producto', render:(r)=><b>{r.name}</b>, text:(r)=>r.name },
//     { key:'sess', header:'Sesiones', align:'right', sortValue:(r)=>r.sessions,
//       render:(r)=><Bar n={r.sessions}/> , text:(r)=>String(r.sessions) },
//   ]} initialSort={{key:'sess',dir:'desc'}} />
// ============================================================

import { useMemo, useState, ReactNode } from 'react';

export interface DataColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Valor para ordenar. Si se omite, usa `text`. `null` = columna no ordenable. */
  sortValue?: ((row: T) => number | string | null) | null;
  /** Texto para el filtro (y orden por defecto). Si se omite, la columna no aporta al filtro. */
  text?: (row: T) => string;
  align?: 'left' | 'right' | 'center';
  width?: string; // ej. '140px' o '1.4fr' (se usa en <col>)
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataColumn<T>[];
  rowKey: (row: T) => string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  pageSizes?: number[];
  initialPageSize?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Nodo opcional a la izquierda de la barra de herramientas (ej. un contador). */
  toolbarLeft?: ReactNode;
}

const ALL = -1; // sentinel "Todos"

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  pageSizes = [10, 20, 50, 100],
  initialPageSize = 10,
  searchable = true,
  searchPlaceholder = 'Filtrar…',
  emptyText = 'Sin datos.',
  toolbarLeft,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);
  const [pageSize, setPageSize] = useState<number>(initialPageSize);
  const [page, setPage] = useState(0);

  // Filtro (texto de todas las columnas con `text`).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    const cols = columns.filter((c) => c.text);
    return rows.filter((r) => cols.some((c) => c.text!(r).toLowerCase().includes(q)));
  }, [rows, columns, query]);

  // Orden (estable).
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col || col.sortValue === null) return filtered;
    const acc = col.sortValue ?? (col.text ? (r: T) => col.text!(r) : null);
    if (!acc) return filtered;
    const dec = filtered.map((r, i) => [r, i] as [T, number]);
    dec.sort((A, B) => {
      const va = acc(A[0]); const vb = acc(B[0]);
      const ea = va == null || va === ''; const eb = vb == null || vb === '';
      if (ea && eb) return A[1] - B[1];
      if (ea) return 1;
      if (eb) return -1;
      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' });
      if (cmp === 0) return A[1] - B[1];
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return dec.map(([r]) => r);
  }, [filtered, columns, sort]);

  const total = sorted.length;
  const size = pageSize === ALL ? total || 1 : pageSize;
  const pages = Math.max(1, Math.ceil(total / size));
  const curPage = Math.min(page, pages - 1);
  const start = curPage * size;
  const pageRows = sorted.slice(start, start + size);

  const toggleSort = (c: DataColumn<T>) => {
    if (c.sortValue === null) return;
    setPage(0);
    setSort((prev) => (prev && prev.key === c.key
      ? { key: c.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key: c.key, dir: 'desc' }));
  };

  return (
    <div className="dt">
      {(searchable || toolbarLeft) && (
        <div className="dt-tools">
          <div className="dt-tl">{toolbarLeft}</div>
          {searchable && (
            <div className="dt-search">
              <span aria-hidden>🔎</span>
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(0); }}
                placeholder={searchPlaceholder}
                aria-label="Filtrar tabla"
              />
              {query && <button className="dt-clear" onClick={() => setQuery('')} aria-label="Limpiar filtro">×</button>}
            </div>
          )}
        </div>
      )}

      <div className="dt-scroll">
        <table className="dt-table">
          <colgroup>
            {columns.map((c) => <col key={c.key} style={c.width ? { width: c.width } : undefined} />)}
          </colgroup>
          <thead>
            <tr>
              {columns.map((c) => {
                const sortable = c.sortValue !== null;
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={`${c.align === 'right' ? 'r' : c.align === 'center' ? 'c' : ''}${c.hideOnMobile ? ' hm' : ''}${sortable ? ' s' : ''}`}
                    data-sort={active ? sort!.dir : 'none'}
                    role={sortable ? 'button' : undefined}
                    tabIndex={sortable ? 0 : undefined}
                    onClick={() => toggleSort(c)}
                    onKeyDown={(e) => { if (sortable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleSort(c); } }}
                    title={sortable ? 'Ordenar por esta columna' : undefined}
                  >
                    <span className="dt-hd">{c.header}{sortable && <i className="dt-arw">{active ? (sort!.dir === 'asc' ? '▲' : '▼') : '⇅'}</i>}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td className="dt-empty" colSpan={columns.length}>{query ? 'Nada coincide con el filtro.' : emptyText}</td></tr>
            ) : pageRows.map((r) => (
              <tr key={rowKey(r)}>
                {columns.map((c) => (
                  <td key={c.key} className={`${c.align === 'right' ? 'r' : c.align === 'center' ? 'c' : ''}${c.hideOnMobile ? ' hm' : ''}`}>{c.render(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="dt-foot">
        <div className="dt-count">{total === 0 ? '0' : `${start + 1}–${Math.min(start + size, total)}`} de <b>{total}</b></div>
        <div className="dt-pager">
          <label className="dt-ps">
            Ver
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}>
              {pageSizes.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value={ALL}>Todos</option>
            </select>
          </label>
          <div className="dt-nav">
            <button onClick={() => setPage(0)} disabled={curPage === 0} aria-label="Primera página">«</button>
            <button onClick={() => setPage(curPage - 1)} disabled={curPage === 0} aria-label="Anterior">‹</button>
            <span>{curPage + 1}/{pages}</span>
            <button onClick={() => setPage(curPage + 1)} disabled={curPage >= pages - 1} aria-label="Siguiente">›</button>
            <button onClick={() => setPage(pages - 1)} disabled={curPage >= pages - 1} aria-label="Última página">»</button>
          </div>
        </div>
      </div>

      <style jsx>{`
        /* Colores por VARIABLES de tema de la app (--t1/--t2/--bg/--acc…) para
           seguir el toggle .lm (claro/oscuro) automáticamente, sin media query. */
        .dt{width:100%}
        .dt-tools{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;flex-wrap:wrap}
        .dt-tl{font-size:11px;color:var(--t2);font-weight:700}
        .dt-search{position:relative;display:flex;align-items:center;gap:6px;background:var(--bg2);border:1px solid var(--b1);border-radius:10px;padding:6px 10px;min-width:200px}
        .dt-search span{font-size:12px;opacity:.6}
        .dt-search input{border:0;background:transparent;outline:none;font-size:12.5px;color:var(--t1);width:100%}
        .dt-search input::placeholder{color:var(--t3)}
        .dt-clear{border:0;background:var(--b2);color:var(--t2);border-radius:50%;width:18px;height:18px;line-height:1;cursor:pointer;font-size:13px}
        .dt-scroll{overflow-x:auto;overflow-y:hidden;padding-bottom:2px;scrollbar-width:thin;scrollbar-color:var(--b2) transparent}
        .dt-scroll::-webkit-scrollbar{height:9px}
        .dt-scroll::-webkit-scrollbar-track{background:transparent}
        .dt-scroll::-webkit-scrollbar-thumb{background:var(--b2);border-radius:9px}
        .dt-scroll::-webkit-scrollbar-thumb:hover{background:var(--t3)}
        .dt-table{width:100%;border-collapse:collapse;font-size:12.5px}
        .dt-table th{font-size:9.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--t3);font-weight:700;padding:10px 10px 8px;border-bottom:2px solid var(--b2);text-align:left;white-space:nowrap;vertical-align:bottom}
        .dt-table th.r{text-align:right}.dt-table th.c{text-align:center}
        .dt-table th.s{cursor:pointer;user-select:none}
        .dt-table th.s:hover{color:var(--t1)}
        .dt-hd{display:inline-flex;align-items:center;gap:5px}
        .dt-arw{font-style:normal;font-size:9px;opacity:.35;transition:opacity .15s}
        .dt-table th[data-sort="asc"] .dt-arw,.dt-table th[data-sort="desc"] .dt-arw{opacity:.9;color:var(--acc)}
        .dt-table th.s:hover .dt-arw{opacity:.7}
        .dt-table td{padding:9px 10px;border-bottom:1px solid var(--b1);color:var(--t1);vertical-align:middle}
        .dt-table td.r{text-align:right}.dt-table td.c{text-align:center}
        .dt-table tbody tr:hover td{background:var(--bg2)}
        .dt-empty{text-align:center;color:var(--t3);padding:22px 0!important;font-size:12px}
        .dt-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;flex-wrap:wrap}
        .dt-count{font-size:11.5px;color:var(--t2)}.dt-count b{color:var(--t1)}
        .dt-pager{display:flex;align-items:center;gap:14px}
        .dt-ps{font-size:11px;color:var(--t2);display:inline-flex;align-items:center;gap:6px;font-weight:600}
        .dt-ps select{font-size:12px;border:1px solid var(--b1);border-radius:8px;padding:4px 6px;background:var(--bg1);color:var(--t1);cursor:pointer}
        .dt-nav{display:flex;align-items:center;gap:3px}
        .dt-nav span{font-size:11.5px;color:var(--t2);min-width:42px;text-align:center;font-weight:700}
        .dt-nav button{border:1px solid var(--b1);background:var(--bg1);color:var(--t2);border-radius:8px;min-width:28px;height:28px;cursor:pointer;font-size:14px;line-height:1}
        .dt-nav button:hover:not(:disabled){background:var(--bg3);color:var(--t1)}
        .dt-nav button:disabled{opacity:.35;cursor:default}
        @media(max-width:640px){.dt-table th.hm,.dt-table td.hm{display:none}}
      `}</style>
    </div>
  );
}
