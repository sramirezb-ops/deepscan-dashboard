'use client';

import { useClient } from '@/lib/useClient';
import { Card } from '@/components/ui/Card';
import { DataTable, type DataColumn } from '@/components/ui/DataTable';
import { useGadsProductsFull, type GadsFullProduct } from '@/lib/hooks/useGadsProductsFull';
import { formatCurrency, formatInt } from '@/lib/utils';

// ============================================================
// GadsProductsFull — tabla de rendimiento COMPLETO por producto (PMax).
// Todas las métricas que Google da a nivel producto, ordenables y filtrables:
// impresiones · clics · CTR · conversiones · costo · CPA · revenue · ROAS + etiqueta.
// ============================================================

function labelCls(label: string): string {
  const l = (label || '').toLowerCase();
  if (l.includes('over')) return 'pf-lbl pf-over';
  if (l.includes('under')) return 'pf-lbl pf-under';
  if (l.includes('no-index') || l.includes('muerto') || l.includes('zombie')) return 'pf-lbl pf-dead';
  if (l.includes('index')) return 'pf-lbl pf-index';
  return 'pf-lbl pf-neutral';
}
const pct = (v: number) => (v > 0 ? (v * 100).toFixed(2) + '%' : '—');
const roasColor = (r: number) => (r >= 5 ? 'var(--up)' : r >= 2 ? 'var(--warn)' : r > 0 ? 'var(--dn)' : 'var(--t3)');

export function GadsProductsFull() {
  const client = useClient();
  const cur = client.currency;
  const { data, loading, error } = useGadsProductsFull(client.id);

  const cols: DataColumn<GadsFullProduct>[] = [
    { key: 'title', header: 'Producto', text: (p) => `${p.title} ${p.label}`, sortValue: (p) => p.title,
      render: (p) => (
        <div className="pf-name">
          <span className="pf-t" title={p.title}>{p.title}</span>
          {p.label ? <span className={labelCls(p.label)}>{p.label}</span> : null}
        </div>
      ) },
    { key: 'impr', header: 'Impr.', align: 'right', sortValue: (p) => p.impressions, render: (p) => formatInt(p.impressions) },
    { key: 'clicks', header: 'Clics', align: 'right', sortValue: (p) => p.clicks, render: (p) => formatInt(p.clicks), hideOnMobile: true },
    { key: 'ctr', header: 'CTR', align: 'right', sortValue: (p) => p.ctr, render: (p) => pct(p.ctr) },
    { key: 'conv', header: 'Conv.', align: 'right', sortValue: (p) => p.conversions, render: (p) => (p.conversions > 0 ? formatInt(Math.round(p.conversions)) : '—') },
    { key: 'cost', header: 'Costo', align: 'right', sortValue: (p) => p.cost, render: (p) => formatCurrency(p.cost, cur) },
    { key: 'cpa', header: 'CPA', align: 'right', sortValue: (p) => p.cpa, render: (p) => (p.conversions > 0 ? formatCurrency(p.cpa, cur) : '—'), hideOnMobile: true },
    { key: 'rev', header: 'Revenue', align: 'right', sortValue: (p) => p.revenue, render: (p) => (p.revenue > 0 ? formatCurrency(p.revenue, cur) : '—') },
    { key: 'roas', header: 'ROAS', align: 'right', sortValue: (p) => p.roas,
      render: (p) => <b style={{ color: roasColor(p.roas) }}>{p.roas > 0 ? p.roas.toFixed(1) + '×' : '—'}</b> },
  ];

  return (
    <Card style={{ marginTop: 20 }}>
      <div className="pf-head">
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>Productos · rendimiento completo</h3>
          <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 4 }}>
            Todo lo que Google da por producto — ordena y filtra por la métrica que quieras · últimos 30 días · <b style={{ color: 'var(--t2)' }}>desliza →</b> para ver todas las columnas
          </div>
        </div>
      </div>
      {loading && !data ? (
        <div className="pf-msg">Cargando productos…</div>
      ) : error ? (
        <div className="pf-msg">Error: {error}</div>
      ) : !data?.hasData ? (
        <div className="pf-msg">Sin datos de productos para {client.name}.</div>
      ) : (
        <DataTable<GadsFullProduct>
          rows={data.products}
          columns={cols}
          rowKey={(p) => p.id}
          initialSort={{ key: 'cost', dir: 'desc' }}
          initialPageSize={12}
          searchable
          searchPlaceholder="Filtrar producto o etiqueta…"
          toolbarLeft={
            <span style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 600 }}>
              {formatInt(data.products.length)} productos · {formatCurrency(data.totals.cost, cur)} · {formatInt(data.totals.impressions)} impr · {formatCurrency(data.totals.revenue, cur)} rev
            </span>
          }
        />
      )}
      <style>{`
        .pf-head{margin-bottom:14px}
        .pf-msg{padding:22px;text-align:center;color:var(--t3);font-size:12px}
        .pf-name{display:flex;align-items:center;gap:8px;min-width:0}
        .pf-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px}
        .pf-lbl{font-size:9px;font-weight:800;letter-spacing:.02em;padding:2px 6px;border-radius:5px;text-transform:lowercase;white-space:nowrap;flex:none}
        .pf-over{color:var(--up);background:color-mix(in srgb,var(--up) 15%,transparent)}
        .pf-index{color:#8b96ff;background:color-mix(in srgb,#7c8cff 16%,transparent)}
        .pf-under{color:var(--warn);background:color-mix(in srgb,var(--warn) 15%,transparent)}
        .pf-dead{color:var(--dn);background:color-mix(in srgb,var(--dn) 14%,transparent)}
        .pf-neutral{color:var(--t3);background:var(--bg3)}
      `}</style>
    </Card>
  );
}
