'use client';

import { useState } from 'react';
import { HeroHead } from '@/components/ui/BrandLogo';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import {
  useGadsLeads,
  type BusinessModel,
  type CampaignLeadRow,
  type GadsDailyType,
} from '@/lib/hooks/useGadsLeads';
import { GadsGeoCharts } from '@/components/views/GadsGeoCharts';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSortableTable, type SortAccessor } from '@/components/ui/useSortableTable';
import { ChartWithTooltip, type ChartDataPoint } from '@/components/ui/ChartWithTooltip';
import { getMeasurementGaps, gapsInRange } from '@/lib/measurementGaps';

// ── Colores de los dos motores (tipos de campaña) ──
// PMAX en azul (reutiliza el azul de Google del overview de leads) y Search en
// naranja. No son colores de canal (ambos son Google): distinguen los dos
// motores del negocio en la narrativa "PMAX vs Search".
const PMAX_COLOR = '#60a5fa';
const SEARCH_COLOR = '#fb923c';

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// ── Formateadores locales en estilo Colombia (COP, coma decimal) ──
function fmtCOP(v: number): string {
  if (v == null || isNaN(v)) return '—';
  return `$ ${Math.round(v).toLocaleString('es-CO')}`;
}
function fmtInt(v: number): string {
  if (v == null || isNaN(v)) return '—';
  return Math.round(v).toLocaleString('es-CO');
}
function fmtPct(ratio: number, dec = 2): string {
  if (ratio == null || isNaN(ratio)) return '—';
  return `${(ratio * 100).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })} %`;
}
// Millones compactos: 12_380_000 → "$ 12,38 M"
function fmtM(v: number): string {
  if (v == null || isNaN(v)) return '—';
  return `$ ${(v / 1_000_000).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M`;
}
// 'YYYY-MM-DD' → '5 sep'
function dayLabel(iso: string): string {
  const p = iso.split('-');
  if (p.length < 3) return iso;
  return `${parseInt(p[2], 10)} ${MONTHS_ES[parseInt(p[1], 10) - 1] ?? ''}`;
}

function typeLabel(type: string | null): string {
  if (!type) return '—';
  const map: Record<string, string> = {
    PERFORMANCE_MAX: 'PMAX',
    SHOPPING: 'Shopping',
    SEARCH: 'Search',
    VIDEO: 'Video',
    DISPLAY: 'Display',
  };
  return map[type] || type;
}
function typeBucket(type: string | null): 'pmax' | 'search' | 'other' {
  const t = (type || '').toUpperCase();
  if (t === 'PERFORMANCE_MAX') return 'pmax';
  if (t === 'SEARCH') return 'search';
  return 'other';
}

function Delta({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: up ? 'var(--up)' : 'var(--dn)', whiteSpace: 'nowrap' }}>
      {up ? '▲' : '▼'} {(up ? '+' : '') + value.toFixed(1)}%
    </span>
  );
}

// ============================================================
// Tendencia diaria — CPL por día: PMAX vs Search + leads apilados + meta
// ============================================================
function DailyEnginesChart({ daily, target }: { daily: GadsDailyType[]; target?: number }) {
  const VB_W = 720;
  const VB_H = 300;
  const L = 46;
  const R = 54;
  const T = 14;
  const cih = 168; // alto banda CPL
  const gapY = T + cih + 22; // inicio banda leads
  const lih = 54; // alto banda leads
  const X0 = L;
  const X1 = VB_W - R;

  // CPL por día (null si ese día no tuvo leads en ese motor).
  const rows = daily.map((d) => ({
    date: d.date,
    pmaxCpl: d.pmaxLeads > 0 ? d.pmaxCost / d.pmaxLeads : null,
    searchCpl: d.searchLeads > 0 ? d.searchCost / d.searchLeads : null,
    leadsTot: d.pmaxLeads + d.searchLeads + d.otherLeads,
    pmaxLeads: d.pmaxLeads,
    searchLeads: d.searchLeads,
  }));
  const n = rows.length;

  const cpls = rows.flatMap((r) => [r.pmaxCpl, r.searchCpl]).filter((v): v is number => v != null && v > 0);
  const cplMax = Math.max(...cpls, target ?? 0, 1) * 1.12;
  const leadMax = Math.max(...rows.map((r) => r.leadsTot), 1);

  const xAt = (i: number) => (n > 1 ? X0 + ((X1 - X0) * i) / (n - 1) : (X0 + X1) / 2);
  const yCpl = (v: number) => T + cih - (Math.min(v, cplMax) / cplMax) * cih;
  const yLead = (v: number) => gapY + lih - (v / leadMax) * lih;

  // Polyline saltando nulos.
  const lineFor = (key: 'pmaxCpl' | 'searchCpl') => {
    let path = '';
    let started = false;
    rows.forEach((r, i) => {
      const v = r[key];
      if (v == null) {
        started = false;
        return;
      }
      path += `${started ? 'L' : 'M'}${xAt(i).toFixed(1)} ${yCpl(v).toFixed(1)} `;
      started = true;
    });
    return path.trim();
  };

  const data: ChartDataPoint[] = rows.map((r, i) => ({
    date: dayLabel(r.date),
    values: [
      { lbl: 'Search', val: r.searchCpl != null ? fmtCOP(r.searchCpl) : '—', color: SEARCH_COLOR, y: r.searchCpl != null ? yCpl(r.searchCpl) : undefined },
      { lbl: 'PMAX', val: r.pmaxCpl != null ? fmtCOP(r.pmaxCpl) : '—', color: PMAX_COLOR, y: r.pmaxCpl != null ? yCpl(r.pmaxCpl) : undefined },
      { lbl: 'Leads', val: `${fmtInt(r.leadsTot)} · ${fmtInt(r.pmaxLeads)} PMAX / ${fmtInt(r.searchLeads)} Search`, color: 'transparent' },
    ],
  }));

  const hasGoal = typeof target === 'number' && target > 0;
  const barW = ((X1 - X0) / n) * 0.5;

  if (n < 2) {
    return (
      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--t3)' }}>
        Necesitas ≥2 días con datos para ver la tendencia diaria.
      </div>
    );
  }

  return (
    <ChartWithTooltip data={data} xStart={X0} xEnd={X1} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      {/* grid + escala CPL */}
      {[0.5, 1].map((f, k) => {
        const v = cplMax * f;
        const y = yCpl(v);
        return (
          <g key={k}>
            <line x1={X0} y1={y} x2={X1} y2={y} stroke="var(--grid)" />
            <text x={X1 + 8} y={y + 3.5} fontFamily="'JetBrains Mono',monospace" fontSize="9.5" fill="var(--t3)">
              {`$${Math.round(v / 1000)}k`}
            </text>
          </g>
        );
      })}

      {/* leads apilados (contexto de volumen) */}
      <text x={X0} y={gapY - 4} fontFamily="'JetBrains Mono',monospace" fontSize="8.5" letterSpacing="1" fill="var(--t3)">
        LEADS/DÍA
      </text>
      {rows.map((r, i) => {
        const x = xAt(i) - barW / 2;
        const yP = yLead(r.pmaxLeads);
        const yTot = yLead(r.leadsTot);
        return (
          <g key={`b${i}`}>
            <rect x={x} y={yP} width={barW} height={gapY + lih - yP} rx="2" fill={PMAX_COLOR} opacity="0.32" />
            <rect x={x} y={yTot} width={barW} height={yP - yTot} rx="2" fill={SEARCH_COLOR} opacity="0.32" />
          </g>
        );
      })}

      {/* meta */}
      {hasGoal && (
        <>
          <line x1={X0} y1={yCpl(target!)} x2={X1} y2={yCpl(target!)} stroke="var(--up)" strokeWidth="1.6" strokeDasharray="3 5" />
          <text x={X0} y={yCpl(target!) - 7} fontFamily="'JetBrains Mono',monospace" fontSize="10" fontWeight="600" fill="var(--up)">
            {`META ${fmtCOP(target!)}`}
          </text>
        </>
      )}

      {/* líneas CPL */}
      <path d={lineFor('searchCpl')} fill="none" stroke={SEARCH_COLOR} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      <path d={lineFor('pmaxCpl')} fill="none" stroke={PMAX_COLOR} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      {rows.map((r, i) => (
        <g key={`p${i}`}>
          {r.searchCpl != null && <circle cx={xAt(i)} cy={yCpl(r.searchCpl)} r="2.8" fill={SEARCH_COLOR} />}
          {r.pmaxCpl != null && <circle cx={xAt(i)} cy={yCpl(r.pmaxCpl)} r="2.8" fill={PMAX_COLOR} />}
        </g>
      ))}

      {/* etiquetas de día (cada ~5 para no saturar) */}
      {rows.map((r, i) =>
        i % Math.ceil(n / 8) === 0 || i === n - 1 ? (
          <text key={`x${i}`} x={xAt(i)} y={VB_H - 6} textAnchor="middle" fontFamily="'JetBrains Mono',monospace" fontSize="9" fill="var(--t3)">
            {dayLabel(r.date).split(' ')[0]}
          </text>
        ) : null
      )}

      <line className="chart-cursor" x1={0} y1={T} x2={0} y2={gapY + lih} />
      <circle className="chart-point" cx={0} cy={0} />
      <circle className="chart-point" cx={0} cy={0} />
    </ChartWithTooltip>
  );
}

// ============================================================
// Mapa de eficiencia — burbujas: gasto (x) vs CPL (y), tamaño = leads
// ============================================================
function BubbleEfficiency({ campaigns, target }: { campaigns: CampaignLeadRow[]; target?: number }) {
  const [tip, setTip] = useState<{ x: number; y: number; c: CampaignLeadRow } | null>(null);
  const items = campaigns.filter((c) => c.cost > 0 && c.conversions > 0);
  if (items.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--t3)' }}>Sin campañas con leads en el período.</div>;
  }

  const VB_W = 720;
  const VB_H = 320;
  const L = 54;
  const R = 20;
  const T = 18;
  const B = 40;
  const iw = VB_W - L - R;
  const ih = VB_H - T - B;

  const costMax = Math.max(...items.map((c) => c.cost)) * 1.1;
  const cplMax = Math.max(...items.map((c) => c.cpa), target ?? 0) * 1.12;
  const rMax = Math.max(...items.map((c) => c.conversions), 1);

  const bx = (v: number) => L + (v / costMax) * iw;
  const by = (v: number) => T + ih - (Math.min(v, cplMax) / cplMax) * ih;
  const br = (l: number) => 6 + Math.sqrt(l / rMax) * 30;
  const hasGoal = typeof target === 'number' && target > 0;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        {/* grid y */}
        {[0.25, 0.5, 0.75, 1].map((f, k) => {
          const v = cplMax * f;
          const y = by(v);
          return (
            <g key={k}>
              <line x1={L} y1={y} x2={VB_W - R} y2={y} stroke="var(--grid)" />
              <text x={L - 8} y={y + 3.5} textAnchor="end" fontFamily="'JetBrains Mono',monospace" fontSize="9" fill="var(--t3)">
                {`$${Math.round(v / 1000)}k`}
              </text>
            </g>
          );
        })}
        <text x={VB_W - R} y={VB_H - 12} textAnchor="end" fontFamily="'JetBrains Mono',monospace" fontSize="9" fill="var(--t3)">
          gasto →
        </text>
        {/* banda meta */}
        {hasGoal && (
          <>
            <rect x={L} y={by(target!)} width={iw} height={T + ih - by(target!)} fill="var(--up)" opacity="0.05" />
            <line x1={L} y1={by(target!)} x2={VB_W - R} y2={by(target!)} stroke="var(--up)" strokeWidth="1.6" strokeDasharray="3 5" />
            <text x={VB_W - R} y={by(target!) - 7} textAnchor="end" fontFamily="'JetBrains Mono',monospace" fontSize="10" fontWeight="600" fill="var(--up)">
              {`META ${fmtCOP(target!)} · debajo = cumple`}
            </text>
          </>
        )}
        {/* burbujas */}
        {items.map((c, i) => {
          const x = bx(c.cost);
          const y = by(c.cpa);
          const r = br(c.conversions);
          const col = typeBucket(c.type) === 'search' ? SEARCH_COLOR : typeBucket(c.type) === 'pmax' ? PMAX_COLOR : 'var(--acc)';
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={r} fill={col} opacity="0.16" />
              <circle
                cx={x}
                cy={y}
                r={r}
                fill="transparent"
                stroke={col}
                strokeWidth="1.8"
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, c })}
                onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, c })}
                onMouseLeave={() => setTip(null)}
              />
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="chart-tooltip on" style={{ left: `${tip.x}px`, top: `${tip.y + window.scrollY}px` }}>
          <div className="chart-tooltip-date">{tip.c.name}</div>
          <div className="chart-tooltip-rows">
            <div className="chart-tooltip-row">
              <div className="chart-tooltip-row-lbl">
                <span className="chart-tooltip-row-dot" style={{ background: typeBucket(tip.c.type) === 'search' ? SEARCH_COLOR : PMAX_COLOR }} />
                Costo por lead
              </div>
              <div className="chart-tooltip-row-val">
                {fmtCOP(tip.c.cpa)} {target && tip.c.cpa <= target ? '✓' : target ? '⚠' : ''}
              </div>
            </div>
            <div className="chart-tooltip-row">
              <div className="chart-tooltip-row-lbl">
                <span className="chart-tooltip-row-dot" style={{ background: 'transparent' }} />
                Leads
              </div>
              <div className="chart-tooltip-row-val">{fmtInt(tip.c.conversions)}</div>
            </div>
            <div className="chart-tooltip-row">
              <div className="chart-tooltip-row-lbl">
                <span className="chart-tooltip-row-dot" style={{ background: 'transparent' }} />
                Inversión
              </div>
              <div className="chart-tooltip-row-val">{fmtCOP(tip.c.cost)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sparkline mínima (sin tooltip): micro-tendencia de CPL dentro de una tarjeta.
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const vals = values.filter((v) => v > 0);
  if (vals.length < 2) return null;
  const W = 120;
  const H = 34;
  const pad = 3;
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const rng = mx - mn || 1;
  const sx = (i: number) => pad + (i * (W - 2 * pad)) / (vals.length - 1);
  const sy = (v: number) => H - pad - ((v - mn) / rng) * (H - 2 * pad);
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 120, height: 34 }}>
      <path d={`${line} L${sx(vals.length - 1).toFixed(1)} ${H} L${sx(0).toFixed(1)} ${H} Z`} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx(vals.length - 1)} cy={sy(vals[vals.length - 1])} r="2.6" fill={color} />
    </svg>
  );
}

interface EngineAgg {
  cost: number;
  leads: number;
  cpl: number;
}
function aggByType(campaigns: CampaignLeadRow[]): { pmax: EngineAgg; search: EngineAgg; other: EngineAgg } {
  const mk = (): EngineAgg => ({ cost: 0, leads: 0, cpl: 0 });
  const acc = { pmax: mk(), search: mk(), other: mk() };
  for (const c of campaigns) {
    const b = typeBucket(c.type);
    acc[b].cost += c.cost;
    acc[b].leads += c.conversions;
  }
  (['pmax', 'search', 'other'] as const).forEach((k) => {
    acc[k].cpl = acc[k].leads > 0 ? acc[k].cost / acc[k].leads : 0;
  });
  return acc;
}

// Tarjeta de un motor (tipo de campaña).
function EngineCard({
  label,
  color,
  agg,
  totalCost,
  totalLeads,
  target,
  spark,
}: {
  label: string;
  color: string;
  agg: EngineAgg;
  totalCost: number;
  totalLeads: number;
  target?: number;
  spark: number[];
}) {
  const pctSpend = totalCost > 0 ? agg.cost / totalCost : 0;
  const pctLeads = totalLeads > 0 ? agg.leads / totalLeads : 0;
  const ratio = target ? agg.cpl / target : 0;
  const ok = target ? agg.cpl <= target : true;
  return (
    <div className="card gads-eng" style={{ borderColor: ok ? 'color-mix(in srgb, var(--up) 30%, var(--b1))' : 'color-mix(in srgb, var(--dn) 30%, var(--b1))' }}>
      <div className="gads-eng-head">
        <div className="gads-eng-type">
          <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
          {label}
        </div>
        <span className="gads-badge" style={{ background: `color-mix(in srgb, ${ok ? 'var(--up)' : 'var(--dn)'} 15%, transparent)`, color: ok ? 'var(--up)' : 'var(--dn)' }}>
          {ok ? '✓ Eficiente' : `⚠ ${ratio.toFixed(1)}× la meta`}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginTop: 12 }}>
        <div>
          <div className="gads-eng-cpl" style={{ color: ok ? 'var(--up)' : 'var(--dn)' }}>{fmtCOP(agg.cpl)}</div>
          {target ? (
            <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 4, color: ok ? 'var(--up)' : 'var(--dn)' }}>
              {`${Math.round(ratio * 100)}% de la meta · ${fmtCOP(Math.abs(agg.cpl - target))} ${ok ? 'bajo' : 'arriba'}`}
            </div>
          ) : null}
        </div>
        <div style={{ flex: 'none' }}>
          <div style={{ fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--t3)', textAlign: 'right', marginBottom: 3 }}>CPL por día</div>
          <Sparkline values={spark} color={color} />
        </div>
      </div>
      {/* barra vs meta */}
      {target ? (
        <div className="gads-mbar">
          <span style={{ width: `${Math.min(100, ratio * 100)}%`, background: ok ? 'var(--up)' : 'var(--dn)' }} />
          <span className="gads-mk" style={{ left: `${Math.min(100, (1 / (ratio || 1)) * 100)}%` }} />
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 16, marginTop: 16, paddingTop: 15, borderTop: '1px solid var(--b1)' }}>
        <div style={{ flex: 1 }}>
          <div className="gads-sk">Inversión</div>
          <div className="gads-sv">{fmtM(agg.cost)}</div>
          <div className="gads-sd">{Math.round(pctSpend * 100)}% del gasto</div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="gads-sk">Leads</div>
          <div className="gads-sv" style={{ color: ok ? 'var(--up)' : 'var(--dn)' }}>{fmtInt(agg.leads)}</div>
          <div className="gads-sd">{Math.round(pctLeads * 100)}% de los leads</div>
        </div>
      </div>
    </div>
  );
}

// Tabla de campañas (venta) — detalle real ordenable.
function CampaignTable({ model }: { model: BusinessModel }) {
  const campAccessors: SortAccessor<CampaignLeadRow>[] = [
    (c) => c.name,
    (c) => c.type,
    (c) => c.cost,
    (c) => c.impressions,
    (c) => c.clicks,
    (c) => c.cpc,
    (c) => c.ctr,
    (c) => c.conversions,
    (c) => c.cpa,
    (c) => c.convRate,
  ];
  const { rows: campRows, headerProps: campHeader } = useSortableTable(model.campaigns, campAccessors);
  const m = model.metrics;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="dim-tbl-head">
        <div className="dim-tbl-title">
          <div className="dim-tbl-ic">◎</div>
          <div>
            <div className="dim-tbl-label">Campañas · {model.label}</div>
            <div className="dim-tbl-h">Detalle real · ordenado por gasto</div>
          </div>
        </div>
        <span className="period-pill">{model.campaigns.length} campañas</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="t">
          <thead>
            <tr>
              <th {...campHeader(0)}>Campaña</th>
              <th {...campHeader(1)}>Tipo</th>
              <th {...campHeader(2)}>Gasto</th>
              <th {...campHeader(3)}>Impresiones</th>
              <th {...campHeader(4)}>Clics</th>
              <th {...campHeader(5)}>CPC Promedio</th>
              <th {...campHeader(6)}>CTR</th>
              <th {...campHeader(7)}>Leads</th>
              <th {...campHeader(8)}>Coste/lead</th>
              <th {...campHeader(9)}>Tasa de conversión</th>
            </tr>
          </thead>
          <tbody>
            {campRows.map((c: CampaignLeadRow) => (
              <tr key={c.name}>
                <td>
                  <b>{c.name}</b>
                </td>
                <td>
                  <span className="pl pl-google">{typeLabel(c.type)}</span>
                </td>
                <td>{fmtCOP(c.cost)}</td>
                <td>{fmtInt(c.impressions)}</td>
                <td>{fmtInt(c.clicks)}</td>
                <td>{fmtCOP(c.cpc)}</td>
                <td>{fmtPct(c.ctr)}</td>
                <td>{fmtInt(c.conversions)}</td>
                <td>{c.conversions > 0 ? fmtCOP(c.cpa) : '—'}</td>
                <td>{fmtPct(c.convRate)}</td>
              </tr>
            ))}
            <tr className="t-avg">
              <td>Total {model.label}</td>
              <td>—</td>
              <td>{fmtCOP(m.cost)}</td>
              <td>{fmtInt(m.impressions)}</td>
              <td>{fmtInt(m.clicks)}</td>
              <td>{fmtCOP(m.cpc)}</td>
              <td>{fmtPct(m.ctr)}</td>
              <td>{fmtInt(m.conversions)}</td>
              <td>{fmtCOP(m.cpa)}</td>
              <td>{fmtPct(m.convRate)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function GoogleAdsLeadsOverview() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useGadsLeads(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const previousLabel = formatRangeLabel(previous);

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>Cargando campañas de Google Ads de {client.name}…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view on">
        <div className="card" style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}>
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>Error cargando Google Ads</div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || !data.hasAny) {
    if (!data?.existsEver) {
      return (
        <EmptyState
          icon="🟢"
          title="Sin campañas de Google Ads"
          message={
            <>
              {client.name} no tiene campañas de <b>Google Ads</b> conectadas por el momento. En cuanto haya actividad, aparecerá aquí automáticamente.
            </>
          }
        />
      );
    }
    return (
      <EmptyState
        icon="📅"
        title="Sin actividad en este período"
        message={
          <>
            {client.name} tiene campañas de Google Ads, pero no registraron actividad entre <b>{rangeLabel}</b>.
          </>
        }
        hint="Prueba ampliar el rango de fechas con el filtro de arriba."
      />
    );
  }

  const venta = data.venta;
  const m = venta.metrics;
  const target = client.cplTarget;
  const googleCpl = m.cpa;
  const ratio = target ? googleCpl / target : 0;
  const underMeta = target ? googleCpl <= target : false;

  const agg = aggByType(venta.campaigns);
  const totalCost = agg.pmax.cost + agg.search.cost + agg.other.cost;
  const totalLeads = agg.pmax.leads + agg.search.leads + agg.other.leads;

  // Sparklines: CPL diario por motor.
  const sparkPmax = data.ventaDaily.map((d) => (d.pmaxLeads > 0 ? d.pmaxCost / d.pmaxLeads : 0));
  const sparkSearch = data.ventaDaily.map((d) => (d.searchLeads > 0 ? d.searchCost / d.searchLeads : 0));

  // Reparto por tipo (para la tabla): solo los buckets con actividad.
  const typeRows = ([
    { key: 'pmax', label: 'Performance Max', color: PMAX_COLOR, agg: agg.pmax },
    { key: 'search', label: 'Search', color: SEARCH_COLOR, agg: agg.search },
    { key: 'other', label: 'Otros (Video/Display)', color: 'var(--acc)', agg: agg.other },
  ] as const).filter((r) => r.agg.cost > 0 || r.agg.leads > 0);

  // Gap de medición que toca el rango visible.
  const gaps = gapsInRange(getMeasurementGaps(client.id), data.from, data.to);

  // ¿Search es un problema? (para la jugada)
  const searchHeavy = agg.search.cost > 0 && target && agg.search.cpl > target * 1.3;

  return (
    <div className="view on">
      <div className="hero">
        <HeroHead brand="google-ads">Google Ads · Overview</HeroHead>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {fmtCOP(m.cost)} invertido · {fmtInt(m.conversions)} leads · venta de vehículos
        </div>
      </div>

      {/* HERO VERDICT */}
      <div className="card gads-verdict">
        <div className="gads-kick">Google Ads · costo por lead vs meta</div>
        <div className="gads-htitle">
          Google va a <span style={{ color: underMeta ? 'var(--up)' : 'var(--dn)' }}>{fmtCOP(googleCpl)}</span> por lead.
          {target ? (
            <>
              {' '}La meta es <span style={{ color: 'var(--up)' }}>{fmtCOP(target)}</span>
              {underMeta ? ' — y la cumple.' : '.'}
            </>
          ) : null}
        </div>
        {target ? (
          <div className="gads-state" style={{ background: `color-mix(in srgb, ${underMeta ? 'var(--up)' : 'var(--dn)'} 15%, transparent)`, color: underMeta ? 'var(--up)' : 'var(--dn)' }}>
            {underMeta ? `✓ ${Math.round((1 - ratio) * 100)}% bajo la meta` : `▲ ${Math.round((ratio - 1) * 100)}% sobre la meta`}
          </div>
        ) : null}
        <div className="gads-hsub">
          {agg.pmax.leads > 0 && agg.search.leads > 0 ? (
            <>
              Pero el promedio esconde dos historias distintas: <b style={{ color: PMAX_COLOR }}>Performance Max</b> a {fmtCOP(agg.pmax.cpl)}/lead y{' '}
              <b style={{ color: SEARCH_COLOR }}>Search</b> a {fmtCOP(agg.search.cpl)}/lead. El reto no es el total — es reequilibrar el gasto.
            </>
          ) : (
            <>Cuenta de generación de leads: la referencia es el número de leads y el costo por lead (no hay ROAS real).</>
          )}
        </div>
      </div>

      {/* TENDENCIA DIARIA */}
      <div className="card" style={{ padding: '22px 24px 14px', marginBottom: 16 }}>
        <div className="gads-sec-h">
          <div>
            <div className="gads-kick" style={{ color: 'var(--t3)' }}>La trayectoria</div>
            <div className="gads-sec-t">CPL por día — PMAX vs Search</div>
          </div>
          <div className="gads-leg">
            <span><i style={{ background: PMAX_COLOR }} />PMAX</span>
            <span><i style={{ background: SEARCH_COLOR }} />Search</span>
            {target ? <span><i style={{ borderTop: '2px dashed var(--up)', height: 0, background: 'transparent' }} />Meta {fmtCOP(target)}</span> : null}
          </div>
        </div>
        <DailyEnginesChart daily={data.ventaDaily} target={target} />
      </div>

      {/* DOS MOTORES */}
      {agg.pmax.leads > 0 && agg.search.leads > 0 ? (
        <>
          <div className="gads-sec-h" style={{ marginTop: 4 }}>
            <div>
              <div className="gads-kick" style={{ color: 'var(--t3)' }}>La historia real</div>
              <div className="gads-sec-t">Dos motores, un promedio</div>
            </div>
          </div>
          <div className="gads-r2">
            <EngineCard label="Performance Max" color={PMAX_COLOR} agg={agg.pmax} totalCost={totalCost} totalLeads={totalLeads} target={target} spark={sparkPmax} />
            <EngineCard label="Search" color={SEARCH_COLOR} agg={agg.search} totalCost={totalCost} totalLeads={totalLeads} target={target} spark={sparkSearch} />
          </div>
        </>
      ) : null}

      {/* JUGADA */}
      {searchHeavy ? (
        <div className="gads-lever">
          <div className="gads-lever-t">
            La jugada: <b>Search se lleva el {Math.round((agg.search.cost / totalCost) * 100)}% del gasto para solo el{' '}
            {Math.round((agg.search.leads / totalLeads) * 100)}% de los leads</b>. Reasignar hacia Performance Max o reestructurar Search acercaría el CPL global aún más abajo de la meta.
          </div>
        </div>
      ) : null}

      {/* MAPA DE EFICIENCIA */}
      <div className="card" style={{ padding: '22px 24px 16px', marginBottom: 16 }}>
        <div className="gads-sec-h">
          <div>
            <div className="gads-kick" style={{ color: 'var(--t3)' }}>Mapa de eficiencia</div>
            <div className="gads-sec-t">Cada campaña: gasto vs costo por lead</div>
          </div>
          <div className="gads-leg">
            <span><i className="sq" style={{ background: PMAX_COLOR }} />PMAX</span>
            <span><i className="sq" style={{ background: SEARCH_COLOR }} />Search</span>
            <span>○ tamaño = nº de leads</span>
          </div>
        </div>
        <BubbleEfficiency campaigns={venta.campaigns} target={target} />
        <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 4 }}>
          Todo lo que quede <b>por debajo de la línea verde</b> cumple la meta. Pasa el cursor por cada burbuja para ver su CPL, leads e inversión.
        </div>
      </div>

      {/* REPARTO POR TIPO */}
      <div className="card" style={{ padding: '20px 22px', marginBottom: 16 }}>
        <div className="gads-kick" style={{ color: 'var(--t3)', marginBottom: 12 }}>Reparto por tipo de campaña · venta de vehículos</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="t">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Inversión</th>
                <th>% gasto</th>
                <th>Leads</th>
                <th>% leads</th>
                <th>CPL</th>
                {target ? <th>vs meta</th> : null}
              </tr>
            </thead>
            <tbody>
              {typeRows.map((r) => {
                const ok = target ? r.agg.cpl <= target : true;
                const d = target ? (r.agg.cpl / target - 1) * 100 : 0;
                return (
                  <tr key={r.key}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: r.color }} />
                        {r.label}
                      </span>
                    </td>
                    <td>{fmtCOP(r.agg.cost)}</td>
                    <td>{totalCost > 0 ? Math.round((r.agg.cost / totalCost) * 100) : 0}%</td>
                    <td>{fmtInt(r.agg.leads)}</td>
                    <td>{totalLeads > 0 ? Math.round((r.agg.leads / totalLeads) * 100) : 0}%</td>
                    <td style={{ fontWeight: 800, color: r.agg.leads > 0 ? (ok ? 'var(--up)' : 'var(--dn)') : 'var(--t3)' }}>
                      {r.agg.leads > 0 ? fmtCOP(r.agg.cpl) : '—'}
                    </td>
                    {target ? (
                      <td style={{ color: ok ? 'var(--up)' : 'var(--dn)' }}>{r.agg.leads > 0 ? `${d >= 0 ? '+' : ''}${Math.round(d)}% ${ok ? '✓' : '⚠'}` : '—'}</td>
                    ) : null}
                  </tr>
                );
              })}
              <tr className="t-avg">
                <td>Total Google</td>
                <td>{fmtCOP(m.cost)}</td>
                <td>100%</td>
                <td>{fmtInt(m.conversions)}</td>
                <td>100%</td>
                <td style={{ fontWeight: 800 }}>{fmtCOP(m.cpa)}</td>
                {target ? <td style={{ color: underMeta ? 'var(--up)' : 'var(--dn)' }}>{`${ratio >= 1 ? '+' : ''}${Math.round((ratio - 1) * 100)}% ${underMeta ? '✓' : '⚠'}`}</td> : null}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* DETALLE DE CAMPAÑAS */}
      <CampaignTable model={venta} />

      {/* LOCALIZACIONES */}
      <GadsGeoCharts clientId={client.id} range={range} target={target} />

      {/* NOTA DE MEDICIÓN */}
      {gaps.length > 0 ? (
        <div className="gads-note">
          <span className="gads-note-b">MEDICIÓN</span>
          <span>
            {gaps.map((g, i) => (
              <span key={i}>
                {dayLabel(g.from)}–{dayLabel(g.to)}: {g.reason}{' '}
              </span>
            ))}
            Si el rango incluye esos días, los deltas vs período anterior quedan distorsionados; leer con cautela.
          </span>
        </div>
      ) : null}

      {/* NOTA LEADS */}
      <div className="gads-note" style={{ marginTop: 10 }}>
        <span className="gads-note-b" style={{ color: PMAX_COLOR, borderColor: `color-mix(in srgb, ${PMAX_COLOR} 40%, transparent)` }}>LEADS</span>
        <span>
          Esta cuenta trabaja por <b>generación de leads</b>, no por venta directa: no hay Revenue ni ROAS reales, por eso no se muestran. La
          referencia es el <b>número de leads</b> y el <b>costo por lead</b>. Foco 100% en <b>venta de vehículos</b> (Propietarios está desactivado).
        </span>
      </div>

      <style jsx>{`
        .gads-verdict {
          padding: 28px 30px;
          margin-bottom: 16px;
          position: relative;
          overflow: hidden;
          box-shadow: var(--sh-md);
          border-color: var(--b2);
        }
        .gads-kick {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--acc);
        }
        .gads-htitle {
          font-size: clamp(24px, 3.4vw, 34px);
          font-weight: 800;
          letter-spacing: -0.025em;
          line-height: 1.1;
          margin: 12px 0 0;
        }
        .gads-state {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          margin-top: 16px;
          font-weight: 700;
          font-size: 13px;
          padding: 6px 12px;
          border-radius: 999px;
        }
        .gads-hsub {
          color: var(--t2);
          font-size: 14px;
          margin-top: 12px;
          max-width: 66ch;
        }
        .gads-sec-h {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }
        .gads-sec-t {
          font-size: 17px;
          font-weight: 800;
          letter-spacing: -0.02em;
          margin-top: 3px;
        }
        .gads-leg {
          display: flex;
          gap: 14px;
          font-size: 10.5px;
          color: var(--t3);
          flex-wrap: wrap;
          align-items: center;
          font-weight: 600;
        }
        .gads-leg :global(i) {
          width: 11px;
          height: 3px;
          border-radius: 2px;
          display: inline-block;
          margin-right: 5px;
          vertical-align: 2px;
        }
        .gads-leg :global(i.sq) {
          width: 10px;
          height: 10px;
          border-radius: 3px;
          vertical-align: -1px;
        }
        .gads-r2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 16px;
        }
        .gads-eng {
          padding: 22px 24px;
        }
        .gads-eng-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .gads-eng-type {
          display: flex;
          align-items: center;
          gap: 9px;
          font-weight: 800;
          font-size: 16px;
          letter-spacing: -0.01em;
        }
        .gads-badge {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          padding: 4px 9px;
          border-radius: 999px;
        }
        .gads-eng-cpl {
          font-size: 36px;
          font-weight: 800;
          letter-spacing: -0.025em;
          line-height: 1;
        }
        .gads-mbar {
          height: 8px;
          border-radius: 6px;
          background: var(--track);
          overflow: hidden;
          margin: 14px 0 2px;
          position: relative;
        }
        .gads-mbar > span:first-child {
          display: block;
          height: 100%;
          border-radius: 6px;
        }
        .gads-mk {
          position: absolute;
          top: -3px;
          bottom: -3px;
          width: 2px;
          background: var(--t2);
          opacity: 0.55;
        }
        .gads-sk {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--t3);
        }
        .gads-sv {
          font-size: 19px;
          font-weight: 800;
          margin-top: 3px;
        }
        .gads-sd {
          font-size: 11px;
          color: var(--t3);
          margin-top: 1px;
        }
        .gads-lever {
          display: flex;
          align-items: center;
          gap: 18px;
          flex-wrap: wrap;
          padding: 20px 24px;
          background: color-mix(in srgb, var(--warn) 8%, var(--bg1));
          border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
          border-radius: var(--r-xl, 20px);
          margin: 0 0 16px;
        }
        .gads-lever-t {
          flex: 1;
          min-width: 250px;
          font-size: clamp(15px, 2vw, 18px);
          font-weight: 700;
          letter-spacing: -0.01em;
          line-height: 1.35;
        }
        .gads-lever-t :global(b) {
          color: var(--warn);
        }
        .gads-note {
          display: flex;
          gap: 11px;
          align-items: flex-start;
          margin-top: 16px;
          font-size: 12px;
          color: var(--t2);
          line-height: 1.55;
        }
        .gads-note-b {
          flex: none;
          font-size: 9.5px;
          font-weight: 700;
          color: var(--warn);
          border: 1px solid color-mix(in srgb, var(--warn) 40%, transparent);
          border-radius: 6px;
          padding: 3px 7px;
          letter-spacing: 0.06em;
          margin-top: 1px;
        }
        @media (max-width: 760px) {
          .gads-r2 {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
