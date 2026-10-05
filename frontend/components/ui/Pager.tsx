'use client';

import { useMemo, type CSSProperties } from 'react';

// Paginador reutilizable para listas largas (bitácoras, logs).
// Selector de tamaño (10/20/50/100) + navegación de páginas con elipsis.
// El estado (page, pageSize) vive en el componente padre.

export function Pager({
  total, page, pageSize, onPage, onPageSize,
  sizes = [10, 20, 50, 100], label = 'filas',
}: {
  total: number; page: number; pageSize: number;
  onPage: (p: number) => void; onPageSize: (s: number) => void;
  sizes?: number[]; label?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(Math.max(page, 1), totalPages);
  const from = total === 0 ? 0 : (cur - 1) * pageSize + 1;
  const to = Math.min(cur * pageSize, total);

  const nums = useMemo(() => {
    const out: (number | '…')[] = [];
    let last = 0;
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || Math.abs(p - cur) <= 1) {
        if (last && p - last > 1) out.push('…');
        out.push(p); last = p;
      }
    }
    return out;
  }, [totalPages, cur]);

  const btn: CSSProperties = {
    minWidth: 28, height: 28, padding: '0 8px', borderRadius: 8, border: '1px solid var(--b1)',
    background: 'var(--bg1)', color: 'var(--t2)', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
  const on: CSSProperties = { ...btn, background: 'var(--acc)', border: '1px solid var(--acc)', color: '#fff', cursor: 'default' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, marginRight: 2 }}>Ver</span>
        {sizes.map((s) => (
          <button key={s} style={s === pageSize ? on : btn} onClick={() => onPageSize(s)}>{s}</button>
        ))}
        <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 6 }}>{from}–{to} de {total} {label}</span>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <button style={{ ...btn, opacity: cur === 1 ? 0.4 : 1 }} disabled={cur === 1} onClick={() => onPage(cur - 1)} aria-label="Anterior">‹</button>
          {nums.map((p, i) => p === '…'
            ? <span key={'e' + i} style={{ color: 'var(--t3)', fontSize: 12, padding: '0 2px' }}>…</span>
            : <button key={p} style={p === cur ? on : btn} onClick={() => onPage(p)}>{p}</button>)}
          <button style={{ ...btn, opacity: cur === totalPages ? 0.4 : 1 }} disabled={cur === totalPages} onClick={() => onPage(cur + 1)} aria-label="Siguiente">›</button>
        </div>
      )}
    </div>
  );
}
