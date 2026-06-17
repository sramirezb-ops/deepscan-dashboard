'use client';

import { useState, type ReactNode } from 'react';
import type { MetricCategory, DimensionTableColumn, DimensionTableRow } from '@/lib/types';

interface MetricFilterProps {
  value: MetricCategory;
  onChange: (cat: MetricCategory) => void;
}

const FILTER_OPTIONS: { cat: MetricCategory; icon: string; label: string }[] = [
  { cat: 'all', icon: '◉', label: 'Completo' },
  { cat: 'impr', icon: '▤', label: 'Impresiones' },
  { cat: 'conv', icon: '✓', label: 'Conversión' },
  { cat: 'cost', icon: '$', label: 'Costo' },
  { cat: 'rev', icon: '↑', label: 'Revenue' },
];

export function MetricFilter({ value, onChange }: MetricFilterProps) {
  return (
    <div className="metric-filter">
      <div className="metric-filter-lbl">Métricas</div>
      {FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.cat}
          type="button"
          className={`metric-chip ${value === opt.cat ? 'on' : ''}`}
          onClick={() => onChange(opt.cat)}
        >
          <span className="metric-chip-ic">{opt.icon}</span>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface DimensionTableProps {
  title: string;
  subtitle?: string;
  icon?: string;
  dimensionLabel: string;
  columns: DimensionTableColumn[];
  rows: DimensionTableRow[];
  rightSlot?: ReactNode;
}

export function DimensionTable({
  title,
  subtitle,
  icon = '◎',
  dimensionLabel,
  columns,
  rows,
  rightSlot,
}: DimensionTableProps) {
  const [filter, setFilter] = useState<MetricCategory>('all');

  const isColumnVisible = (col: DimensionTableColumn): boolean => {
    if (filter === 'all') return true;
    const cats = Array.isArray(col.cat) ? col.cat : [col.cat];
    if (cats.includes('dim')) return true; // siempre visible
    return cats.includes(filter);
  };

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="dim-tbl-head">
        <div className="dim-tbl-title">
          <div className="dim-tbl-ic">{icon}</div>
          <div>
            <div className="dim-tbl-label">{dimensionLabel}</div>
            <div className="dim-tbl-h">{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 2 }}>{subtitle}</div>}
          </div>
        </div>
        {rightSlot}
      </div>

      <MetricFilter value={filter} onChange={setFilter} />

      <table className="t">
        <thead>
          <tr>
            {columns.map((col) =>
              isColumnVisible(col) ? (
                <th key={col.key} style={col.align === 'right' ? { textAlign: 'right' } : undefined}>
                  {col.label}
                </th>
              ) : null
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.isAverage ? 't-avg' : ''}>
              {columns.map((col) =>
                isColumnVisible(col) ? <td key={col.key}>{row.cells[col.key] ?? '—'}</td> : null
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Celda comparativa con barra (usada en columna ROAS típicamente)
 * cmpPct = 0-100 relativo al mejor del conjunto
 */
interface CmpCellProps {
  value: string;
  cmpPct: number;
  tone?: 'g' | 'a' | 'r';
}

export function CmpCell({ value, cmpPct, tone = 'g' }: CmpCellProps) {
  const trendClass = tone === 'g' ? 'tgu' : tone === 'r' ? 'tgd' : 'tgm';
  return (
    <div className="cmp-cell">
      <span className={`cmp-val ${trendClass}`}>{value}</span>
      <div className="cmp-bar">
        <div className={`cmp-bar-fill ${tone}`} style={{ width: `${cmpPct}%` }} />
      </div>
    </div>
  );
}
