'use client';

import { useState, type ReactNode } from 'react';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useMetaCompras, type ComprasHierNode, type ComprasMetric } from '@/lib/hooks/useMetaCompras';
import { useCatalog } from '@/lib/hooks/useCatalog';
import { useMetaPlacements, type PlaceRow, type PlaceNode } from '@/lib/hooks/useMetaPlacements';
import { formatCurrency, formatInt } from '@/lib/utils';

// Meta de ROAS que gobierna el semáforo. TODO: leerla de la config del cliente
// (como el target de Ofero); por ahora constante para Sneaker Store.
const GOAL = 7;
// Presupuesto objetivo por conjunto cuando la cuenta escale a ~$5,000/día.
const SET_BUDGET_HINT = '$300–$500/día por conjunto';

type Derived = {
  spend: number; purch: number; roas: number; atc: number; cpcart: number;
  ic: number; cpco: number; clicks: number; cpc: number; vc: number; cpvc: number;
  impr: number; reach: number; freq: number;
};
function derive(m: ComprasMetric): Derived {
  return {
    spend: m.spend, purch: m.purchases, roas: m.spend ? m.purchaseValue / m.spend : 0,
    atc: m.addToCart, cpcart: m.addToCart ? m.spend / m.addToCart : 0,
    ic: m.initiateCheckout, cpco: m.initiateCheckout ? m.spend / m.initiateCheckout : 0,
    clicks: m.clicks, cpc: m.clicks ? m.spend / m.clicks : 0,
    vc: m.viewContent, cpvc: m.viewContent ? m.spend / m.viewContent : 0,
    impr: m.impressions, reach: m.reach, freq: m.reach ? m.impressions / m.reach : 0,
  };
}

function semCls(r: number): string {
  return r >= GOAL ? 'mc-good' : r >= GOAL * 0.7 ? 'mc-warn' : 'mc-bad';
}

// Métricas del árbol (paid-media manager): valor derivado + tasas de funnel.
function dval(d: Derived, k: string): number {
  if (k === 'cr') return d.clicks ? d.purch / d.clicks : 0;         // tasa de conversión (compras/clics)
  if (k === 'cartpct') return d.clicks ? d.atc / d.clicks : 0;      // % de carritos
  if (k === 'chkpct') return d.clicks ? d.ic / d.clicks : 0;        // % de checkouts
  if (k === 'ctr') return d.impr ? d.clicks / d.impr : 0;           // CTR
  return (d as any)[k] ?? 0;
}
type TMet = { k: string; l: string; t: 'money' | 'int' | 'pct' | 'x' | 'freq'; sem?: boolean };
const TMETRICS: TMet[] = [
  { k: 'spend', l: 'Gasto', t: 'money' }, { k: 'purch', l: 'Compras', t: 'int' },
  { k: 'roas', l: 'ROAS', t: 'x', sem: true }, { k: 'cr', l: 'CR%', t: 'pct' },
  { k: 'atc', l: 'Carritos', t: 'int' }, { k: 'cartpct', l: '%Carr', t: 'pct' },
  { k: 'ic', l: 'Checkouts', t: 'int' }, { k: 'chkpct', l: '%Chk', t: 'pct' },
  { k: 'vc', l: 'Vistas prod.', t: 'int' }, { k: 'clicks', l: 'Clics', t: 'int' },
  { k: 'ctr', l: 'CTR', t: 'pct' }, { k: 'freq', l: 'Frec.', t: 'freq' },
  { k: 'cpa', l: 'CPA', t: 'money' },
];
function tcells(d: Derived, cur: string): ReactNode[] {
  return TMETRICS.map((m) => {
    const v = dval(d, m.k);
    let node: ReactNode;
    if (m.t === 'money') node = m.k === 'cpa' && d.purch === 0 ? '—' : formatCurrency(v, cur);
    else if (m.t === 'int') node = formatInt(v);
    else if (m.t === 'pct') node = v > 0 ? (v * 100).toFixed(1) + '%' : '—';
    else if (m.t === 'x') node = v > 0 ? v.toFixed(1) + '×' : '—';
    else node = v > 0 ? v.toFixed(1) : '—';
    return <td key={m.k} className={m.sem ? (d.purch > 0 ? semCls(d.roas) : '') : ''}>{node}</td>;
  });
}

// ── Veredicto de decisión por conjunto/campaña (la "Biblia": qué hacer) ──────
// Honesto con la atribución: como la venta suele cerrar por WhatsApp/AURA (no en
// la web), 0 compras web NO es igual a "descartar" si hubo intención (carritos/
// checkout) → ahí manda revisar el cierre real (MER), no cortar a ciegas.
type Verdict = { l: string; c: string; tip: string };
// Umbrales suaves durante la rampa: damos margen para aprender y solo
// "Descartar" con evidencia fuerte (mucho gasto y nada de nada).
function verdict(d: Derived, goal: number, targetCpa: number): Verdict {
  const gate = targetCpa > 0 ? targetCpa * 1.2 : 400; // gasto mínimo para juzgar
  if (d.spend < gate) return { l: 'Aprendiendo', c: 'v-learn', tip: `Aún no gasta lo suficiente (< ${targetCpa ? Math.round(gate) : 400}) para decidir. Dale tiempo mientras rampa.` };
  if (d.purch > 0) {
    if (d.roas === 0) return { l: 'Revisar medición', c: 'v-meas', tip: 'Hay compras pero el valor llega en $0 — el píxel no está enviando el value de compra. Corregir el tag antes de juzgar el ROAS.' };
    if (d.roas >= goal) return { l: 'Escalar', c: 'v-scale', tip: `ROAS ${d.roas.toFixed(1)}× ≥ meta ${goal}×. Subir presupuesto.` };
    if (d.roas >= goal * 0.6) return { l: 'Iterar', c: 'v-iter', tip: `ROAS ${d.roas.toFixed(1)}× cerca de la meta ${goal}×. Optimizar creativo/oferta.` };
    if (d.roas < goal * 0.35) return { l: 'Descartar', c: 'v-discard', tip: `ROAS ${d.roas.toFixed(1)}× muy por debajo de la meta ${goal}×.` };
    return { l: 'Iterar', c: 'v-iter', tip: `ROAS ${d.roas.toFixed(1)}× bajo. Iterar antes de cortar.` };
  }
  if (d.atc > 0 || d.ic > 0) return { l: 'Revisar cierre', c: 'v-check', tip: 'Gastó y hubo carritos/checkout pero 0 compra web → la venta puede estar cerrando por WhatsApp/AURA. Juzgar por MER, no cortar aún.' };
  if (d.spend >= gate * 2.5) return { l: 'Descartar', c: 'v-discard', tip: 'Gastó bastante sin carritos ni compras. Cortar.' };
  return { l: 'Aprendiendo', c: 'v-learn', tip: 'Sin compras aún pero todavía en rampa. Vigilar.' };
}
// Orden de prioridad para el leaderboard de conjuntos.
const VRANK: Record<string, number> = { 'Escalar': 0, 'Iterar': 1, 'Revisar cierre': 2, 'Revisar medición': 2, 'Aprendiendo': 3, 'Descartar': 4 };

// ── P2: headroom de escalamiento + señal de fatiga ───────────────────────────
// Headroom: cuánto subir el presupuesto de un ganador. Paso incremental según
// qué tan por encima de la meta está (escalar de a poco no resetea el aprendizaje).
function headroom(d: Derived, goal: number, periodDays: number): { step: number; currentDaily: number; targetDaily: number } {
  const ratio = goal > 0 ? d.roas / goal : 0;
  const step = ratio >= 2 ? 0.5 : ratio >= 1.4 ? 0.3 : 0.2;
  const currentDaily = periodDays > 0 ? d.spend / periodDays : d.spend;
  return { step, currentDaily, targetDaily: currentDaily * (1 + step) };
}
// Fatiga: la frecuencia (impresiones/alcance) es la señal. >4 = quemado.
function fatigue(d: Derived): { freq: number; ctr: number; level: 'ok' | 'warn' | 'hot' } {
  const freq = d.freq;
  const ctr = d.impr > 0 ? d.clicks / d.impr : 0;
  const level: 'ok' | 'warn' | 'hot' = freq >= 4 ? 'hot' : freq >= 2.5 ? 'warn' : 'ok';
  return { freq, ctr, level };
}

// ── Sitio de destino / confiabilidad de medición por nombre de campaña ────────
// .mx (Web Original / SS.COM.MX): compra PREPAGADA → ROAS web confiable.
// Shopify: el purchase mezcla COD (no pagado) → optimizar a Compra Pagada y
// juzgar por MER/AURA, no por el ROAS crudo. Por defecto, lo que no declara .mx
// se asume Shopify (conservador: no confiar en un ROAS que puede traer COD).
type Site = 'mx' | 'shopify';
function siteOf(campaignName: string): Site {
  const n = (campaignName || '').toLowerCase();
  if (n.includes('ss.com.mx') || n.includes('web original') || n.includes('com.mx')) return 'mx';
  return 'shopify';
}
// Veredicto consciente del sitio: una campaña Shopify NO puede quedar como
// "Escalar"/"Iterar" por un ROAS inflado con COD → se manda a "Revisar cierre".
function verdictFor(d: Derived, goal: number, targetCpa: number, site: Site): Verdict {
  const base = verdict(d, goal, targetCpa);
  if (site === 'shopify' && (base.l === 'Escalar' || base.l === 'Iterar')) {
    return { l: 'Revisar cierre', c: 'v-check', tip: 'Campaña Shopify: el ROAS web mezcla COD (pedidos no pagados). Optimizar a Compra Pagada y juzgar por MER/AURA, no por este ROAS.' };
  }
  return base;
}
function adKind(name: string): { c: string; i: string; t: string } {
  const n = (name || '').toLowerCase();
  if (/video|\breel/.test(n)) return { c: 'vid', i: '▶', t: 'Video' };
  if (/img|imagen|cat[aá]log|foto/.test(n)) return { c: 'img', i: '🖼', t: 'Imagen' };
  return { c: 'prd', i: '👟', t: 'Creativo' };
}
// Insignia de momentum (Δ ROAS vs período previo), reutilizable en conjunto y anuncio.
function momBadge(mom: number | null, hadPrev: boolean) {
  if (!hadPrev) return <span className="mom mom-new" title="Sin datos del período anterior — nuevo o recién activado.">nuevo</span>;
  if (mom == null || Math.abs(mom) < 0.05) return <span className="mom mom-flat" title="ROAS estable vs el período anterior.">→ igual</span>;
  if (mom > 0) return <span className="mom mom-up" title={`ROAS subió ${mom.toFixed(1)}× vs el período anterior.`}>▲ +{mom.toFixed(1)}×</span>;
  return <span className="mom mom-dn" title={`ROAS bajó ${Math.abs(mom).toFixed(1)}× vs el período anterior.`}>▼ −{Math.abs(mom).toFixed(1)}×</span>;
}
// Insignia de sitio de destino / medición.
function siteBadge(site: Site) {
  return site === 'mx'
    ? <span className="site site-mx" title="sneakerstore.com.mx · compra prepagada — ROAS web confiable.">.mx</span>
    : <span className="site site-shop" title="Tienda Shopify · el purchase mezcla COD → optimizar a Compra Pagada y juzgar por MER/AURA.">Shopify</span>;
}

// Etiqueta legible de plataforma / segmento.
function niceLabel(k: string): string {
  const m: Record<string, string> = {
    facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Audience Network',
    messenger: 'Messenger', threads: 'Threads', unknown: '(sin dato)',
    prospecting: 'Prospección', existing: 'Clientes / retargeting', engaged: 'Interactuaron', uncategorized: '(sin clasificar)',
  };
  return m[k] || k;
}
// Tabla ordenable de un desglose (plataforma / placement / audiencia) con
// métricas de funnel (CR% y % carritos). Clic en un header ordena por esa métrica.
type PCol = { k: keyof PlaceRow | 'name'; l: string; t: 'txt' | 'money' | 'int' | 'pct' | 'pctRaw' | 'x' };
const PCOLS: PCol[] = [
  { k: 'name', l: '', t: 'txt' },
  { k: 'spend', l: 'Gasto', t: 'money' }, { k: 'share', l: '% gasto', t: 'pctRaw' },
  { k: 'purchases', l: 'Compras', t: 'int' }, { k: 'cr', l: 'CR%', t: 'pct' },
  { k: 'atc', l: 'Carritos', t: 'int' }, { k: 'cartRate', l: 'Cart%', t: 'pct' },
  { k: 'roas', l: 'ROAS', t: 'x' }, { k: 'cpa', l: 'CPA', t: 'money' },
];
// Formatea un valor de métrica según el tipo de columna.
function fmtVal(v: number, t: PCol['t'], cur: string, hasPurch: boolean): ReactNode {
  if (t === 'money') return t === 'money' && v === 0 && !hasPurch ? '—' : formatCurrency(v, cur);
  if (t === 'int') return formatInt(v);
  if (t === 'pct') return v > 0 ? (v * 100).toFixed(1) + '%' : '—';
  if (t === 'pctRaw') return v.toFixed(0) + '%';
  if (t === 'x') return v > 0 ? v.toFixed(1) + '×' : '—';
  return String(v);
}
function pcell(p: PlaceRow, c: PCol, cur: string): ReactNode {
  if (c.k === 'name') return niceLabel(p.key);
  const v = (p as any)[c.k] as number;
  if (c.k === 'cpa' && p.purchases === 0) return '—';
  return fmtVal(v, c.t, cur, true);
}
const roasCls = (roas: number, purch: number) => (purch > 0 ? (roas >= GOAL ? 'mc-good' : roas >= GOAL * 0.7 ? 'mc-warn' : 'mc-bad') : '');

// Tabla plana ordenable genérica (para catálogo, etc.). Clic en header ordena.
type SCol<T> = { key: string; label: string; num?: (r: T) => number; fmt: (r: T) => ReactNode; left?: boolean; sem?: (r: T) => string };
function SortTable<T>({ rows, cols, initial, limit }: { rows: T[]; cols: SCol<T>[]; initial: string; limit?: number }) {
  const [sk, setSk] = useState(initial);
  const [dir, setDir] = useState<1 | -1>(-1);
  const col = cols.find((c) => c.key === sk);
  const arr = [...rows];
  if (col && col.num) arr.sort((a, b) => dir * (col.num!(a) - col.num!(b)));
  const view = limit ? arr.slice(0, limit) : arr;
  const onSort = (c: SCol<T>) => { if (!c.num) return; if (sk === c.key) setDir((d) => (d === 1 ? -1 : 1)); else { setSk(c.key); setDir(-1); } };
  return (
    <div className="mc-wrap"><div className="mc-scroll">
      <table className="cj-t sortable">
        <thead><tr>{cols.map((c) => (
          <th key={c.key} className={(c.left ? 'nm-th' : c.num ? 'srt' : '') + (sk === c.key ? ' on' : '')} onClick={() => onSort(c)}>
            {c.label}{c.num && <span className="ar">{sk === c.key ? (dir < 0 ? '▼' : '▲') : '⇅'}</span>}
          </th>
        ))}</tr></thead>
        <tbody>{view.map((r, i) => (
          <tr key={i}>{cols.map((c) => (
            <td key={c.key} className={(c.left ? 'nm' : '') + (c.sem ? ' ' + c.sem(r) : '')}>{c.fmt(r)}</td>
          ))}</tr>
        ))}</tbody>
      </table>
    </div></div>
  );
}

// P4d: barras comparativas de ROAS por plataforma (FB vs IG de un vistazo).
function PlatformBars({ rows, cur, goal }: { rows: PlaceRow[]; cur: string; goal: number }) {
  const vis = rows.filter((r) => r.spend > 1 && r.purchases > 0);
  if (vis.length < 2) return null;
  const max = Math.max(...vis.map((r) => r.roas), goal * 1.2);
  return (
    <div className="pbars">
      {vis.map((r, i) => (
        <div className="pbar" key={i}>
          <div className="pbar-l">{niceLabel(r.key)}</div>
          <div className="pbar-track">
            <div className="pbar-fill" style={{ width: (r.roas / max) * 100 + '%', background: r.roas >= goal ? 'var(--up)' : 'var(--warn)' }} />
            <div className="pbar-goal" style={{ left: (goal / max) * 100 + '%' }} title={`meta ${goal}×`} />
          </div>
          <div className="pbar-v">{r.roas.toFixed(1)}× <span>· {formatCurrency(r.spend, cur)} · {formatInt(r.purchases)} compras</span></div>
        </div>
      ))}
    </div>
  );
}
// P4d: tendencia diaria del funnel (carritos y compras).
function FunnelTrend({ daily, cur }: { daily: { date: string; addToCart: number; purchases: number; purchaseValue: number }[]; cur: string }) {
  const W = 920, H = 190, X0 = 40, X1 = 900, YT = 16, YB = 150;
  const d = daily;
  if (d.length < 2) return null;
  const atc = d.map((x) => x.addToCart), pur = d.map((x) => x.purchases);
  const max = Math.max(...atc, ...pur, 1);
  const band = (X1 - X0) / d.length;
  const xC = (i: number) => X0 + band * i + band / 2;
  const yV = (v: number) => YB - (v / max) * (YB - YT);
  const lineOf = (arr: number[]) => arr.map((v, i) => `${xC(i).toFixed(1)},${yV(v).toFixed(1)}`).join(' ');
  const sd = (s: string) => { const dt = new Date(`${s}T00:00:00`); return isNaN(dt.getTime()) ? s : dt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); };
  const xi = [0, Math.floor((d.length - 1) * 0.5), d.length - 1];
  return (
    <div className="cab-chart">
      <div className="cab-legend">
        <span><i className="lg-line" style={{ background: '#3b82f6' }} /> Carritos/día</span>
        <span><i className="lg-line" style={{ background: 'var(--up)' }} /> Compras/día</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
        {[0, 0.5, 1].map((f, i) => (
          <g key={i}>
            <line x1={X0} y1={yV(max * f)} x2={X1} y2={yV(max * f)} stroke={i === 0 ? 'var(--b2)' : 'var(--b1)'} />
            <text x={X0 - 6} y={yV(max * f) + 4} textAnchor="end" style={{ fontSize: 11, fill: 'var(--t3)' }}>{Math.round(max * f)}</text>
          </g>
        ))}
        <polyline points={lineOf(atc)} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" opacity="0.8" />
        <polyline points={lineOf(pur)} fill="none" stroke="var(--up)" strokeWidth="2.5" strokeLinejoin="round" />
        {xi.map((i, k) => <text key={k} x={xC(i)} y={YB + 18} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--t3)' }}>{sd(d[i].date)}</text>)}
      </svg>
    </div>
  );
}

function PlaceTable({ rows, cur, first = 'Plataforma', limit = 20, tree }: { rows: PlaceRow[]; cur: string; first?: string; limit?: number; tree?: Record<string, PlaceNode[]> }) {
  const [sk, setSk] = useState<string>('spend');
  const [dir, setDir] = useState<1 | -1>(-1);
  const [exp, setExp] = useState<Record<string, boolean>>({});
  const onSort = (k: string) => { if (k === 'name') return; if (sk === k) setDir((d) => (d === 1 ? -1 : 1)); else { setSk(k); setDir(-1); } };
  const sorted = [...rows].sort((a, b) => dir * (((a as any)[sk] || 0) - ((b as any)[sk] || 0))).slice(0, limit);
  // Filas de nodos del drilldown (campaña → conjunto → anuncio).
  const renderNodes = (nodes: PlaceNode[], depth: number, path: string): ReactNode[] =>
    nodes.flatMap((nd, i) => {
      const key = `${path}/${i}`;
      const kids = nd.kids && nd.kids.length ? nd.kids : null;
      const open = !!exp[key];
      const out: ReactNode[] = [
        <tr key={key} className={'pl-node' + (kids ? ' clk' : '')} onClick={() => kids && setExp((e) => ({ ...e, [key]: !e[key] }))}>
          {PCOLS.map((c) => {
            if (c.k === 'name') return <td key="name" className="nm"><span style={{ paddingLeft: depth * 14 }}>{kids ? (open ? '▾ ' : '▸ ') : ''}{nd.name}</span></td>;
            if (c.k === 'share') return <td key="share">—</td>;
            const v = (nd as any)[c.k] as number;
            return <td key={String(c.k)} className={c.k === 'roas' ? roasCls(nd.roas, nd.purchases) : ''}>{c.k === 'cpa' && nd.purchases === 0 ? '—' : fmtVal(v, c.t, cur, true)}</td>;
          })}
        </tr>,
      ];
      if (open && kids) out.push(...renderNodes(kids, depth + 1, key));
      return out;
    });
  return (
    <div className="mc-wrap"><div className="mc-scroll">
      <table className="cj-t sortable">
        <thead><tr>{PCOLS.map((c) => (
          <th key={String(c.k)} className={(c.k === 'name' ? 'nm-th' : 'srt') + (sk === c.k ? ' on' : '')} onClick={() => onSort(String(c.k))}>
            {c.k === 'name' ? first : c.l}{c.k !== 'name' && <span className="ar">{sk === c.k ? (dir < 0 ? '▼' : '▲') : '⇅'}</span>}
          </th>
        ))}</tr></thead>
        <tbody>
          {sorted.flatMap((p) => {
            const nodes = tree?.[p.key];
            const canExp = !!(nodes && nodes.length);
            const pk = 'P:' + p.key;
            const open = !!exp[pk];
            const out: ReactNode[] = [
              <tr key={pk} className={canExp ? 'clk' : ''} onClick={() => canExp && setExp((e) => ({ ...e, [pk]: !e[pk] }))}>
                {PCOLS.map((c) => (
                  <td key={String(c.k)} className={c.k === 'name' ? 'nm' : c.k === 'roas' ? roasCls(p.roas, p.purchases) : ''}>
                    {c.k === 'name' ? <>{canExp ? (open ? '▾ ' : '▸ ') : ''}{niceLabel(p.key)}</> : pcell(p, c, cur)}
                  </td>
                ))}
              </tr>,
            ];
            if (open && nodes) out.push(...renderNodes(nodes, 1, pk));
            return out;
          })}
        </tbody>
      </table>
    </div></div>
  );
}

// ── Cabina de escalamiento (P1): sparkline, medidor y chart de doble eje ──────
function Sparkline({ vals, color, w = 96, h = 28 }: { vals: number[]; color: string; w?: number; h?: number }) {
  const v = vals.filter((x) => isFinite(x));
  if (v.length < 2) return <svg width={w} height={h} className="spk" />;
  const max = Math.max(...v), min = Math.min(...v), rng = max - min || 1;
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 3 - ((x - min) / rng) * (h - 6)).toFixed(1)}`).join(' ');
  const lx = w - 1, ly = h - 3 - ((v[v.length - 1] - min) / rng) * (h - 6);
  return (
    <svg width={w} height={h} className="spk" viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2" fill={color} />
    </svg>
  );
}
// Medidor horizontal contra meta (para ROAS: verde si ≥ meta).
function GaugeBar({ value, goal }: { value: number; goal: number }) {
  const axisMax = goal * 1.6;
  const pct = Math.max(0, Math.min(value / axisMax, 1)) * 100;
  const goalPct = Math.min((goal / axisMax) * 100, 100);
  const good = value >= goal;
  return (
    <div className="gauge" title={`${value.toFixed(1)}× vs meta ${goal}×`}>
      <div className="gauge-fill" style={{ width: pct + '%', background: good ? 'var(--up)' : 'var(--warn)' }} />
      <div className="gauge-goal" style={{ left: goalPct + '%' }} />
    </div>
  );
}
// Chart de doble eje: barras = inversión diaria, línea = ROAS, guía = meta.
function Cabina({ daily, cur, goal }: { daily: { date: string; spend: number; purchases: number; purchaseValue: number }[]; cur: string; goal: number }) {
  const W = 920, H = 250, X0 = 46, X1 = 884, YT = 20, YB = 200;
  const d = daily.filter((x) => x.spend > 0);
  if (d.length < 2) return <div className="cab-empty">Se necesitan ≥2 días con inversión para trazar la cabina.</div>;
  const spendMax = Math.max(...d.map((x) => x.spend)) || 1;
  const roas = d.map((x) => (x.spend > 0 ? x.purchaseValue / x.spend : 0));
  const roasMax = Math.max(goal * 1.4, Math.min(Math.max(...roas), goal * 3));
  const band = (X1 - X0) / d.length, barW = Math.min(band * 0.62, 26);
  const yS = (v: number) => YB - (v / spendMax) * (YB - YT);
  const yR = (v: number) => YB - (Math.min(v, roasMax) / roasMax) * (YB - YT);
  const xC = (i: number) => X0 + band * i + band / 2;
  const line = roas.map((r, i) => `${xC(i).toFixed(1)},${yR(r).toFixed(1)}`).join(' ');
  const abbr = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`;
  const sd = (s: string) => { const dt = new Date(`${s}T00:00:00`); return isNaN(dt.getTime()) ? s : dt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); };
  const xi = d.length <= 1 ? [0] : [0, Math.floor((d.length - 1) * 0.33), Math.floor((d.length - 1) * 0.66), d.length - 1];
  // Lectura de escalamiento: primera mitad vs segunda mitad.
  const h1 = d.slice(0, Math.floor(d.length / 2)), h2 = d.slice(Math.floor(d.length / 2));
  const avg = (arr: typeof d, f: (x: typeof d[number]) => number) => arr.reduce((s, x) => s + f(x), 0) / (arr.length || 1);
  const s1 = avg(h1, (x) => x.spend), s2 = avg(h2, (x) => x.spend);
  const r2 = avg(h2, (x) => (x.spend > 0 ? x.purchaseValue / x.spend : 0));
  let read = { t: 'Inversión estable en el período.', c: 'var(--t3)' };
  if (s2 > s1 * 1.1 && r2 >= goal) read = { t: 'Subiste la inversión y el ROAS aguantó sobre la meta — escala sana.', c: 'var(--up)' };
  else if (s2 > s1 * 1.1 && r2 < goal) read = { t: 'La inversión subió pero el ROAS cede por debajo de la meta — cuidado al escalar.', c: 'var(--warn)' };
  else if (s2 < s1 * 0.9) read = { t: 'Bajaste la inversión en la segunda mitad — hay margen para reactivar donde rinde.', c: 'var(--t3)' };
  return (
    <div className="cab-chart">
      <div className="cab-legend">
        <span><i className="lg-bar" /> Inversión/día</span>
        <span><i className="lg-line" /> ROAS</span>
        <span><i className="lg-goal" /> meta {goal}×</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
        {[0, 1 / 3, 2 / 3, 1].map((f, i) => (
          <g key={i}>
            <line x1={X0} y1={yS(spendMax * f)} x2={X1} y2={yS(spendMax * f)} stroke={i === 0 ? 'var(--b2)' : 'var(--b1)'} />
            <text x={X0 - 6} y={yS(spendMax * f) + 4} textAnchor="end" style={{ fontSize: 11, fill: 'var(--t3)' }}>{abbr(spendMax * f)}</text>
            <text x={X1 + 6} y={yR(roasMax * f) + 4} textAnchor="start" style={{ fontSize: 11, fill: 'var(--up)' }}>{(roasMax * f).toFixed(0)}×</text>
          </g>
        ))}
        {d.map((x, i) => (
          <rect key={i} x={xC(i) - barW / 2} y={yS(x.spend)} width={barW} height={Math.max(YB - yS(x.spend), 0)} rx="2" fill="#3b82f6" opacity="0.45" />
        ))}
        <line x1={X0} y1={yR(goal)} x2={X1} y2={yR(goal)} stroke="var(--warn)" strokeWidth="1.5" strokeDasharray="5 4" />
        <polyline points={line} fill="none" stroke="var(--up)" strokeWidth="2.5" strokeLinejoin="round" />
        {roas.map((r, i) => <circle key={i} cx={xC(i)} cy={yR(r)} r="2.5" fill="var(--up)" />)}
        {xi.map((i, k) => <text key={k} x={xC(i)} y={YB + 20} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--t3)' }}>{sd(d[i].date)}</text>)}
      </svg>
      <div className="cab-read" style={{ color: read.c }}>{read.t}</div>
    </div>
  );
}

export function ComprasDiagnostico() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useMetaCompras(client.id, range, previous);
  const catalog = useCatalog(client.id, range);
  const salesNames = (data?.hierarchy ?? []).map((c) => c.name);
  const placements = useMetaPlacements(client.id, salesNames);
  const cur = client.currency;
  const rangeLabel = formatRangeLabel(range);

  const [preview, setPreview] = useState<{ node: ComprasHierNode; cmp: string; set: string } | null>(null);
  const [expCj, setExpCj] = useState<Record<string, boolean>>({}); // nodos desplegados en el árbol de decisión
  const [treeSk, setTreeSk] = useState<string | null>(null); // orden del árbol (null = por veredicto)
  const [treeDir, setTreeDir] = useState<1 | -1>(-1);

  if (loading && !data) {
    return <div className="view on"><div className="hero" style={{ textAlign: 'center', padding: 60 }}><div style={{ fontSize: 14, color: 'var(--mu)' }}>Cargando compras de {client.name}…</div></div></div>;
  }
  if (error) {
    return <div className="view on"><div className="card" style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,.3)' }}><div style={{ color: '#ef4444', marginBottom: 8 }}>Error cargando datos</div><div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div></div></div>;
  }
  if (!data || !data.metaExistsEver) {
    return <div className="view on"><div className="card" style={{ padding: 40, textAlign: 'center' }}><div style={{ fontSize: 14, color: 'var(--mu)' }}>Sin datos de Meta para el período.</div></div></div>;
  }

  const t = data.totals;
  const targetCpa = t.aov > 0 ? t.aov / GOAL : 0; // costo/compra esperado a la meta
  const split = data.spendSplit;
  const totalMeta = split.sales + split.whatsapp + split.brand || 1;
  const naiveRoas = totalMeta > 0 ? t.purchaseValue / totalMeta : 0;
  const pct = (v: number) => Math.round((v / totalMeta) * 100);

  // Series diarias para la cabina de escalamiento (P1).
  const daily = data.daily ?? [];
  const roasSeries = daily.map((x) => (x.spend > 0 ? x.purchaseValue / x.spend : 0));
  const cpaSeries = daily.map((x) => (x.purchases > 0 ? x.spend / x.purchases : 0));
  const spendSeries = daily.map((x) => x.spend);
  const revSeries = daily.map((x) => x.purchaseValue);
  const avgDailySpend = daily.length ? t.spend / daily.length : 0;

  // Acciones derivadas.
  const flat: { name: string; d: Derived }[] = [];
  data.hierarchy.forEach((c) => flat.push({ name: c.name, d: derive(c.m) }));
  const best = flat.filter((x) => x.d.roas >= GOAL && x.d.spend > 0).sort((a, b) => b.d.roas - a.d.roas)[0];
  const zeros = data.hierarchy.filter((c) => c.m.spend > 0 && c.m.purchases === 0);
  const worstMonth = (data.monthlyRoas ?? []).filter((m) => m.roas > 0).sort((a, b) => a.roas - b.roas)[0];
  const maxMR = Math.max(...(data.monthlyRoas ?? []).map((m) => m.roas), 1);
  const MO: Record<string, string> = { '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic' };

  // Leaderboard plano de conjuntos de anuncios — el "qué escalar / qué descartar".
  // Momentum: ROAS de este período vs el anterior (mismo conjunto), para saber si
  // un ganador viene subiendo o un rezagado ya está mejorando.
  const prevSets = data.prevSets ?? {};
  const prevAds = data.prevAds ?? {};
  const conjuntos = (data.hierarchy ?? [])
    .flatMap((c) => (c.kids ?? []).map((s) => {
      const dd = derive(s.m);
      const pm = prevSets[`${c.name}\u0000${s.name}`];
      const prevD = pm ? derive(pm) : null;
      const hadPrev = !!pm && pm.spend > 0;
      const mom = hadPrev && prevD ? dd.roas - prevD.roas : null; // Δ ROAS absoluto
      const site = siteOf(c.name);
      return { camp: c.name, set: s.name, d: dd, v: verdictFor(dd, GOAL, targetCpa, site), site, mom, hadPrev, node: s };
    }))
    .sort((a, b) => (VRANK[a.v.l] - VRANK[b.v.l]) || (b.d.spend - a.d.spend));
  const vCount = (l: string) => conjuntos.filter((x) => x.v.l === l).length;

  // P2: días del período y listas accionables para el plan de escalamiento.
  const periodDays = Math.max(1, Math.round((new Date(`${data.to}T00:00:00`).getTime() - new Date(`${data.from}T00:00:00`).getTime()) / 86400000) + 1);
  // Candidatos a escalar = mejores por ROAS con compras (los Shopify se marcan
  // para validar por MER, ya que su ROAS web mezcla COD).
  const escalar = conjuntos.filter((x) => x.d.purch > 0 && x.d.roas >= GOAL).sort((a, b) => b.d.roas - a.d.roas).slice(0, 6);
  const apagar = conjuntos.filter((x) => x.v.l === 'Descartar').slice(0, 6);

  // Momentum de un anuncio dentro de un conjunto (Δ ROAS vs período previo por ad_id).
  const adMom = (ad: ComprasHierNode) => {
    const pm = ad.adId ? prevAds[ad.adId] : undefined;
    const hadPrev = !!pm && pm.spend > 0;
    const mom = hadPrev && pm ? derive(ad.m).roas - derive(pm).roas : null;
    return { mom, hadPrev };
  };

  // Movers: el conjunto que más sube y el que más cae (por momentum de ROAS).
  const withMom = conjuntos.filter((x) => x.mom != null && x.hadPrev);
  const topRiser = withMom.filter((x) => (x.mom as number) > 0.05).sort((a, b) => (b.mom as number) - (a.mom as number))[0];
  const topFaller = withMom.filter((x) => (x.mom as number) < -0.05).sort((a, b) => (a.mom as number) - (b.mom as number))[0];

  // Árbol de decisión: campaña → conjunto → anuncio. Orden por veredicto por
  // defecto; clic en un header ordena todos los niveles por esa métrica.
  const prevCamps = data.prevCamps ?? {};
  const treeSort = (k: string) => { if (treeSk === k) setTreeDir((d) => (d === 1 ? -1 : 1)); else { setTreeSk(k); setTreeDir(-1); } };
  const rank = (a: { v: Verdict; d: Derived; mom: number | null }, b: { v: Verdict; d: Derived; mom: number | null }) => {
    if (!treeSk) return (VRANK[a.v.l] - VRANK[b.v.l]) || (b.d.spend - a.d.spend);
    const val = (x: { v: Verdict; d: Derived; mom: number | null }) => treeSk === 'veredicto' ? -VRANK[x.v.l] : treeSk === 'mom' ? (x.mom ?? -1e9) : dval(x.d, treeSk);
    return treeDir * (val(a) - val(b));
  };
  const adCmp = (a: ComprasHierNode, b: ComprasHierNode) => {
    if (!treeSk || treeSk === 'veredicto') return b.m.spend - a.m.spend;
    if (treeSk === 'mom') return treeDir * ((adMom(a).mom ?? -1e9) - (adMom(b).mom ?? -1e9));
    return treeDir * (dval(derive(a.m), treeSk) - dval(derive(b.m), treeSk));
  };
  const th = (k: string, label: string) => (
    <th key={k} className={'srt' + (treeSk === k ? ' on' : '')} onClick={() => treeSort(k)} style={{ cursor: 'pointer' }}>{label}<span className="ar">{treeSk === k ? (treeDir < 0 ? '▼' : '▲') : '⇅'}</span></th>
  );
  const campanas = (data.hierarchy ?? []).map((c) => {
    const dd = derive(c.m);
    const site = siteOf(c.name);
    const pc = prevCamps[c.name];
    const cHad = !!pc && pc.spend > 0;
    const cMom = cHad && pc ? dd.roas - derive(pc).roas : null;
    const sets = (c.kids ?? []).map((s) => {
      const sd = derive(s.m);
      const ps = prevSets[`${c.name}\u0000${s.name}`];
      const sHad = !!ps && ps.spend > 0;
      const sMom = sHad && ps ? sd.roas - derive(ps).roas : null;
      return { name: s.name, d: sd, v: verdictFor(sd, GOAL, targetCpa, site), mom: sMom, hadPrev: sHad, node: s };
    }).sort(rank);
    return { name: c.name, d: dd, v: verdictFor(dd, GOAL, targetCpa, site), site, mom: cMom, hadPrev: cHad, sets };
  }).sort(rank);

  return (
    <div className="view on">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="mc">

        {/* HERO */}
        <div className="mc-eyebrow">Meta Ads · Compras · {rangeLabel}</div>
        <div className="mc-hero">
          <div>
            <div className="mc-thesis">Las campañas de venta rinden <span className="hl">ROAS {t.roas.toFixed(1)}×</span> — el número mezclado esconde lo bueno.</div>
            <div className="mc-sub">El ROAS "de todo Meta" (~{naiveRoas.toFixed(1)}×) mete el gasto de <b>WhatsApp</b> en el denominador. Separado, las {data.campaignCount} campañas de venta devuelven <b>{cur} {t.roas.toFixed(1)} por cada 1</b>: <b>{formatCurrency(t.spend, cur)} → {formatCurrency(t.purchaseValue, cur)}</b> en {formatInt(t.purchases)} compras.</div>
          </div>
          <div className="mc-north">
            <div className="k">ROAS · campañas de venta</div>
            <div className="v">{t.roas.toFixed(1)}× <span className={'nd ' + (data.roasDelta >= 0 ? 'up' : 'dn')} title="Momentum del ROAS vs el período anterior.">{data.roasDelta >= 0 ? '▲' : '▼'} {Math.abs(data.roasDelta).toFixed(1)}×</span></div>
            <div className="old">no <s>{naiveRoas.toFixed(1)}×</s> — eso mezcla WhatsApp</div>
            <div className="r">
              <div><div className="l">Compras</div><div className="rv">{formatInt(t.purchases)}</div></div>
              <div><div className="l">AOV</div><div className="rv">{formatCurrency(t.aov, cur)}</div></div>
              <div><div className="l">CPA</div><div className="rv">{formatCurrency(t.cpa, cur)}</div></div>
            </div>
          </div>
        </div>

        {/* CABINA DE ESCALAMIENTO (P1) */}
        <div className="mc-sh"><h2>Cabina de escalamiento</h2><span className="hint">¿sube la inversión sin perder eficiencia?</span></div>
        <div className="cab-kpis">
          <div className="cab-kpi">
            <div className="cab-k">ROAS · venta</div>
            <div className="cab-v" style={{ color: t.roas >= GOAL ? 'var(--up)' : 'var(--warn)' }}>{t.roas.toFixed(1)}×</div>
            <GaugeBar value={t.roas} goal={GOAL} />
            <div className="cab-foot"><span>meta {GOAL}×</span><span className={data.roasDelta >= 0 ? 'up' : 'dn'}>{data.roasDelta >= 0 ? '▲' : '▼'} {Math.abs(data.roasDelta).toFixed(1)}× vs previo</span></div>
          </div>
          <div className="cab-kpi">
            <div className="cab-k">CPA · costo/compra</div>
            <div className="cab-v">{formatCurrency(t.cpa, cur)}</div>
            <Sparkline vals={cpaSeries} color="var(--dn)" />
            <div className="cab-foot"><span>meta ≤ {formatCurrency(targetCpa, cur)}</span><span className={t.cpa <= targetCpa ? 'up' : 'dn'}>{t.cpa <= targetCpa ? 'en meta' : 'sobre meta'}</span></div>
          </div>
          <div className="cab-kpi">
            <div className="cab-k">Inversión · por día</div>
            <div className="cab-v">{formatCurrency(avgDailySpend, cur)}</div>
            <Sparkline vals={spendSeries} color="#3b82f6" />
            <div className="cab-foot"><span>acum {formatCurrency(t.spend, cur)}</span><span className={data.spendDelta >= 0 ? 'up' : 'dn'}>{data.spendDelta >= 0 ? '▲' : '▼'} {Math.abs(data.spendDelta).toFixed(0)}%</span></div>
          </div>
          <div className="cab-kpi">
            <div className="cab-k">Ingreso · venta web</div>
            <div className="cab-v">{formatCurrency(t.purchaseValue, cur)}</div>
            <Sparkline vals={revSeries} color="var(--up)" />
            <div className="cab-foot"><span>{formatInt(t.purchases)} compras</span><span className={data.revenueDelta >= 0 ? 'up' : 'dn'}>{data.revenueDelta >= 0 ? '▲' : '▼'} {Math.abs(data.revenueDelta).toFixed(0)}%</span></div>
          </div>
        </div>
        <Cabina daily={daily} cur={cur} goal={GOAL} />

        {/* SPLIT */}
        <div className="mc-sh"><h2>En qué se fue la inversión de Meta</h2><span className="hint">tres objetivos que no se deben mezclar</span></div>
        <div className="mc-splitbar">
          <div style={{ width: pct(split.sales) + '%', background: 'var(--up)' }} />
          <div style={{ width: pct(split.whatsapp) + '%', background: '#12b76a' }} />
          <div style={{ width: pct(split.brand) + '%', background: 'var(--t3)' }} />
        </div>
        <div className="mc-splitlg">
          <span className="it"><span className="sw" style={{ background: 'var(--up)' }} />Venta <b>{formatCurrency(split.sales, cur)}</b> <span className="mut">· ROAS {t.roas.toFixed(1)}×</span></span>
          <span className="it"><span className="sw" style={{ background: '#12b76a' }} />WhatsApp <b>{formatCurrency(split.whatsapp, cur)}</b> <span className="mut">· {formatInt(data.waConversations)} conv.</span></span>
          <span className="it"><span className="sw" style={{ background: 'var(--t3)' }} />Marca <b>{formatCurrency(split.brand, cur)}</b> <span className="mut">· top-funnel</span></span>
        </div>
        <div className="mc-mernote">El ROAS de venta mira solo la <b>compra web</b>. Las campañas <b>Shopify</b> miden un <b>purchase que mezcla COD</b> (no pagado) → se optimizan y juzgan por <b>Compra Pagada</b>, no por ese ROAS. El juez final del negocio es el <b>MER</b> (venta real ÷ inversión, incluye WhatsApp/AURA), que se alimenta de la hoja diaria de <b>AURA</b> y vive en el <b>Overview</b>.</div>

        {/* ÁRBOL DE DECISIÓN — campaña → conjunto → anuncio */}
        <div className="mc-sh"><h2>Campañas → conjuntos → anuncios · qué escalar y qué descartar</h2><span className="hint">meta ROAS {GOAL}× · objetivo {SET_BUDGET_HINT}</span></div>
        <div className="cj-sum">
          <span className="v-badge v-scale">{vCount('Escalar')} escalar</span>
          <span className="v-badge v-iter">{vCount('Iterar')} iterar</span>
          <span className="v-badge v-check">{vCount('Revisar cierre')} revisar cierre</span>
          {vCount('Revisar medición') > 0 && <span className="v-badge v-meas">{vCount('Revisar medición')} revisar medición</span>}
          <span className="v-badge v-discard">{vCount('Descartar')} descartar</span>
          <span className="v-badge v-learn">{vCount('Aprendiendo')} aprendiendo</span>
          <span className="cj-count">· conteo por conjunto</span>
        </div>
        {(topRiser || topFaller) && (
          <div className="cj-movers">
            {topRiser && <span className="mv mv-up" title={topRiser.set}>▲ <b>{topRiser.set}</b> despega +{(topRiser.mom as number).toFixed(1)}×</span>}
            {topFaller && <span className="mv mv-dn" title={topFaller.set}>▼ <b>{topFaller.set}</b> se cae −{Math.abs(topFaller.mom as number).toFixed(1)}×</span>}
          </div>
        )}
        {(escalar.length > 0 || apagar.length > 0) && (
          <div className="plan">
            {escalar.length > 0 && (
              <div className="plan-col">
                <div className="plan-h plan-up">▲ Escalar · sube presupuesto donde rinde</div>
                {escalar.map((x, i) => {
                  const hr = headroom(x.d, GOAL, periodDays);
                  const fg = fatigue(x.d);
                  return (
                    <div className="plan-row" key={i}>
                      <div className="plan-nm" title={`${x.set} · ${x.camp}`}>{siteBadge(x.site)} <span className="plan-set">{x.set}</span></div>
                      <div className="plan-tags">
                        <span className="plan-roas">{x.d.roas.toFixed(1)}×</span>
                        <span className={`fat fat-${fg.level}`} title={`Frecuencia ${fg.freq.toFixed(1)} · CTR ${(fg.ctr * 100).toFixed(2)}%`}>frec {fg.freq.toFixed(1)}</span>
                      </div>
                      <div className="plan-act">
                        {fg.level === 'hot'
                          ? <span className="plan-warn">refresca creativo antes de escalar (frec {fg.freq.toFixed(1)})</span>
                          : x.site === 'shopify'
                            ? <span className="plan-warn">ROAS con COD — valida por MER, luego sube</span>
                            : <>{formatCurrency(hr.currentDaily, cur)}/día → <b>{formatCurrency(hr.targetDaily, cur)}</b> <span className="plan-step">+{Math.round(hr.step * 100)}%</span></>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {apagar.length > 0 && (
              <div className="plan-col">
                <div className="plan-h plan-dn">■ Apagar · gasto sin retorno</div>
                {apagar.map((x, i) => (
                  <div className="plan-row" key={i}>
                    <div className="plan-nm" title={`${x.set} · ${x.camp}`}>{siteBadge(x.site)} <span className="plan-set">{x.set}</span></div>
                    <div className="plan-tags"><span className="plan-roas dn">{x.d.roas > 0 ? x.d.roas.toFixed(1) + '×' : '0×'}</span></div>
                    <div className="plan-act">{formatCurrency(x.d.spend, cur)} · {formatInt(x.d.purch)} compras <span className="plan-off">apagar</span></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="cj-hint">Clic en una campaña para ver sus conjuntos, y en un conjunto para ver sus anuncios · clic en un anuncio para su preview.</div>
        <div className="mc-wrap"><div className="mc-scroll">
          <table className="cj-t sortable">
            <thead><tr><th className="cj-caret"></th><th>Campaña · conjunto · anuncio</th>{th('veredicto', 'Veredicto')}{th('mom', 'Momentum')}{TMETRICS.map((m) => th(m.k, m.l))}</tr></thead>
            <tbody>
              {campanas.flatMap((camp) => {
                const ck = 'C:' + camp.name;
                const cOpen = !!expCj[ck];
                const out = [
                  <tr key={ck} className={'cj-row cj-camp clk' + (cOpen ? ' open' : '')}
                    onClick={() => setExpCj((e) => ({ ...e, [ck]: !e[ck] }))}>
                    <td className="cj-caret">{camp.sets.length ? (cOpen ? '▾' : '▸') : ''}</td>
                    <td className="nm" title={camp.name}>{siteBadge(camp.site)} {camp.name}</td>
                    <td><span className={`v-badge ${camp.v.c}`} title={camp.v.tip}>{camp.v.l}</span></td>
                    <td>{momBadge(camp.mom, camp.hadPrev)}</td>
                    {tcells(camp.d, cur)}
                  </tr>,
                ];
                if (cOpen) camp.sets.forEach((s, si) => {
                  const sk = 'S:' + camp.name + '\u0000' + s.name;
                  const sOpen = !!expCj[sk];
                  const ads = (s.node.kids ?? []).slice().sort(adCmp);
                  out.push(
                    <tr key={sk} className={'cj-row cj-set' + (sOpen ? ' open' : '') + (ads.length ? ' clk' : '')}
                      onClick={() => ads.length && setExpCj((e) => ({ ...e, [sk]: !e[sk] }))}>
                      <td className="cj-caret l2">{ads.length ? (sOpen ? '▾' : '▸') : ''}</td>
                      <td className="nm sub" title={s.name}>{s.name}</td>
                      <td><span className={`v-badge ${s.v.c}`} title={s.v.tip}>{s.v.l}</span></td>
                      <td>{momBadge(s.mom, s.hadPrev)}</td>
                      {tcells(s.d, cur)}
                    </tr>
                  );
                  if (sOpen) ads.forEach((ad, j) => {
                    const dd = derive(ad.m);
                    const av = verdictFor(dd, GOAL, targetCpa, camp.site);
                    const am = adMom(ad);
                    const kind = adKind(ad.name);
                    out.push(
                      <tr key={sk + '-a' + j} className="cj-ad clk" onClick={() => setPreview({ node: ad, cmp: camp.name, set: s.name })}>
                        <td className="cj-caret" />
                        <td className="nm ad" title={ad.name}>
                          <span className="cj-thwrap">
                            {ad.thumbUrl ? <img className="cj-thmb" src={ad.thumbUrl} alt="" loading="lazy" /> : <span className={`cj-thmb ak-${kind.c}`}>{kind.i}</span>}
                            {ad.isVideo && <span className="cj-vb">▶</span>}
                          </span>
                          <span className="cj-adnm">{ad.name}</span>
                          <span className="cj-pv">🔍</span>
                        </td>
                        <td><span className={`v-badge ${av.c}`} title={av.tip}>{av.l}</span></td>
                        <td>{momBadge(am.mom, am.hadPrev)}</td>
                        {tcells(dd, cur)}
                      </tr>
                    );
                  });
                });
                return out;
              })}
            </tbody>
          </table>
        </div></div>

        {/* DÓNDE CONVIERTE — plataforma y placement (P3) */}
        <div className="mc-sh"><h2>Dónde convierte · plataforma y placement</h2><span className="hint">Facebook vs Instagram · ¿Advantage+ completo o restringir?</span></div>
        {placements.loading ? (
          <div className="cat-msg">Cargando placements de {client.name}…</div>
        ) : !placements.data?.hasData ? (
          <div className="cat-msg">Sin desglose de placements para {client.name}.</div>
        ) : (() => {
          const pl = placements.data;
          const fb = pl.platforms.find((p) => p.key === 'facebook');
          const ig = pl.platforms.find((p) => p.key === 'instagram');
          let take: ReactNode = null;
          if (fb && ig && fb.roas > 0 && ig.roas > 0) {
            take = ig.roas >= fb.roas * 1.25 ? (
              <><b>Instagram es ~{(ig.roas / fb.roas).toFixed(1)}× más eficiente</b> ({ig.roas.toFixed(1)}× vs {fb.roas.toFixed(1)}×). Pero <b>Facebook sí convierte</b>: {formatInt(fb.purchases)} compras y {formatInt(fb.atc)} carritos (más que IG). No lo apagues del todo — si vas a restringir, prioriza Instagram y deja Facebook solo en los placements que rinden.</>
            ) : fb.roas >= ig.roas * 1.25 ? (
              <><b>Facebook rinde mejor</b> ({fb.roas.toFixed(1)}× vs {ig.roas.toFixed(1)}×) — al revés de la percepción. No restrinjas a Instagram.</>
            ) : (
              <>Facebook e Instagram rinden parecido ({fb.roas.toFixed(1)}× vs {ig.roas.toFixed(1)}×) — <b>Advantage+ completo tiene sentido</b>; restringir placements no se justifica con el dato.</>
            );
          }
          return (
            <>
              {take && <div className="pl-take">{take}</div>}
              <PlatformBars rows={pl.platforms} cur={cur} goal={GOAL} />
              <div className="cat-block"><div className="cat-h">Por plataforma <span className="cat-fresh">FB vs IG</span> <span className="cat-sub">clic para desglosar campaña → conjunto → anuncio</span></div>
                <PlaceTable rows={pl.platforms} cur={cur} first="Plataforma" tree={pl.platTree} />
              </div>
              <div className="cat-block"><div className="cat-h">Por placement <span className="cat-sub">top por gasto</span></div>
                <PlaceTable rows={pl.placements} cur={cur} first="Placement" limit={12} />
              </div>
              {pl.segments.length > 0 && (
                <div className="cat-block"><div className="cat-h">Por audiencia</div>
                  <PlaceTable rows={pl.segments} cur={cur} first="Audiencia" />
                </div>
              )}
              <div className="pl-note">Desglose de Meta (snapshot, todas las campañas de venta) — no sigue el selector de fechas. Las compras son atribución de Meta (mezcla COD en Shopify); útil para el <b>peso relativo</b> FB↔IG, no como venta pagada absoluta.</div>
            </>
          );
        })()}

        {/* CATÁLOGO */}
        <div className="mc-sh"><h2>Catálogo · Meta empuja ↔ sneakerstore.com.mx</h2><span className="hint">DPA / catálogo · por subcategoría y por producto</span></div>
        {catalog.loading ? (
          <div className="cat-msg">Cargando catálogo de {client.name}…</div>
        ) : !catalog.data?.hasData ? (
          <div className="cat-msg">Sin datos de catálogo para {client.name} en el período.</div>
        ) : (
          <>
            <div className="cat-caveat">Meta empuja <b>al día</b> · {catalog.data.nProducts} productos, {formatCurrency(catalog.data.metaSpend, cur)} en catálogo. El comportamiento del producto es de <b>sneakerstore.com.mx</b> (vistas → carrito → compra) hasta el <b>{catalog.data.ga4Window || '—'}</b>. La <b>compra por producto recién empieza a dispararse</b> — hoy la señal fuerte es vistas/carrito (intención).</div>

            <div className="cat-block">
              <div className="cat-h">Por subcategoría <span className="cat-fresh">línea de modelo</span></div>
              <SortTable rows={catalog.data.subcats ?? []} initial="impr" cols={[
                { key: 'sub', label: 'Subcategoría', left: true, fmt: (s) => s.sub },
                { key: 'nProducts', label: 'Prod.', num: (s) => s.nProducts, fmt: (s) => formatInt(s.nProducts) },
                { key: 'impr', label: 'Impr (Meta)', num: (s) => s.impr, fmt: (s) => formatInt(s.impr) },
                { key: 'spend', label: 'Gasto', num: (s) => s.spend, fmt: (s) => formatCurrency(s.spend, cur) },
                { key: 'views', label: 'Vistas (.mx)', num: (s) => s.views, fmt: (s) => formatInt(s.views) },
                { key: 'atc', label: 'Carrito', num: (s) => s.atc, fmt: (s) => formatInt(s.atc) },
                { key: 'purchases', label: 'Compra', num: (s) => s.purchases, fmt: (s) => s.purchases > 0 ? formatInt(s.purchases) : '—' },
                { key: 'revenue', label: 'Ingreso', num: (s) => s.revenue, fmt: (s) => s.revenue > 0 ? formatCurrency(s.revenue, cur) : '—', sem: (s) => s.revenue > 0 ? 'mc-good' : '' },
              ]} />
            </div>

            <div className="cat-block">
              <div className="cat-h">Detalle por producto <span className="cat-sub">top por empuje de Meta</span></div>
              <SortTable rows={catalog.data.products ?? []} initial="impr" cols={[
                { key: 'name', label: 'Producto', left: true, fmt: (p) => <span title={p.name}>{p.name}</span> },
                { key: 'sub', label: 'Subcat.', fmt: (p) => <span className="cmp">{p.sub}</span> },
                { key: 'impr', label: 'Impr (Meta)', num: (p) => p.impr, fmt: (p) => p.impr > 0 ? formatInt(p.impr) : <span className="cat-none">sin pauta</span> },
                { key: 'spend', label: 'Gasto', num: (p) => p.spend, fmt: (p) => p.spend > 0 ? formatCurrency(p.spend, cur) : '—' },
                { key: 'views', label: 'Vistas (.mx)', num: (p) => p.views, fmt: (p) => formatInt(p.views) },
                { key: 'atc', label: 'Carrito', num: (p) => p.atc, fmt: (p) => formatInt(p.atc) },
                { key: 'purchases', label: 'Compra', num: (p) => p.purchases, fmt: (p) => p.purchases > 0 ? formatInt(p.purchases) : '—' },
                { key: 'revenue', label: 'Ingreso', num: (p) => p.revenue, fmt: (p) => p.revenue > 0 ? formatCurrency(p.revenue, cur) : '—', sem: (p) => p.revenue > 0 ? 'mc-good' : '' },
              ]} />
            </div>
          </>
        )}

        {/* FUNNEL */}
        <div className="mc-sh"><h2>Embudo de compra web</h2><span className="hint">píxel de Meta · foto y tendencia</span></div>
        <Funnel t={t} />
        {daily.length >= 2 && <div style={{ marginTop: 12 }}><FunnelTrend daily={daily} cur={cur} /></div>}

        {/* TREND + BRIDGE */}
        <div className="mc-sh"><h2>Tendencia y la venta que no se ve</h2></div>
        <div className="mc-duo">
          <div className="mc-mini"><h3>ROAS de compras por mes</h3>
            <div className="mc-spark">
              {(data.monthlyRoas ?? []).map((m) => (
                <div className="col" key={m.month}>
                  <div className="bv" style={{ color: m.roas >= GOAL ? 'var(--up)' : m.roas >= GOAL * 0.7 ? 'var(--warn)' : 'var(--dn)' }}>{m.roas.toFixed(1)}×</div>
                  <div className="bb" style={{ height: Math.max(6, (m.roas / maxMR) * 100) + '%', background: m.roas >= GOAL ? 'var(--up)' : m.roas >= GOAL * 0.7 ? 'var(--warn)' : 'var(--dn)' }} />
                  <div className="bl">{MO[m.month.slice(5)] || m.month}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="mc-mini mc-bridge"><h3>Las compras web son la punta del iceberg</h3>
            <div className="big"><div className="n" style={{ color: '#12b76a' }}>{formatInt(data.waConversations)}</div><div className="x">conversaciones de WhatsApp que Meta también generó</div></div>
            <p>El píxel solo cuenta la compra <b>que cierra en la web</b>. La mayoría de la venta que Meta empuja se cierra <b>conversando por WhatsApp</b> y se cobra en <b>AURA</b>. El ROAS web subvalora el retorno real de Meta.</p>
          </div>
        </div>

        {/* ACCIONES */}
        <div className="mc-sh"><h2>Acciones</h2><span className="hint">lente de agencia</span></div>
        <div className="mc-acts">
          {best && <div className="mc-act"><div className="tag"><span className="dot" style={{ background: 'var(--up)' }} />Escalar</div><div className="body"><b>{best.name.split('·')[0].trim()}:</b> ROAS {best.d.roas.toFixed(1)}× con {formatCurrency(best.d.spend, cur)} de gasto. Es la campaña de mejor retorno — subir presupuesto es la palanca más clara.</div></div>}
          {worstMonth && worstMonth.roas < GOAL && <div className="mc-act"><div className="tag"><span className="dot" style={{ background: 'var(--warn)' }} />Investigar</div><div className="body"><b>{MO[worstMonth.month.slice(5)] || worstMonth.month} rindió {worstMonth.roas.toFixed(1)}×</b>, debajo de la meta. Revisar fatiga de creativo, audiencia o mezcla ese mes.</div></div>}
          {zeros.length > 0 && <div className="mc-act"><div className="tag"><span className="dot" style={{ background: 'var(--dn)' }} />Revisar tracking</div><div className="body"><b>{zeros.length} campaña{zeros.length > 1 ? 's' : ''} de venta</b> gastó {formatCurrency(zeros.reduce((s, c) => s + c.m.spend, 0), cur)} con <b>0 compras</b>. Probable píxel sin disparar — validar el tracking antes de seguir invirtiendo ahí.</div></div>}
        </div>

        <div className="mc-fn">Meta Ads · Compras · datos de meta_campaigns · {rangeLabel} · {cur}. El ROAS de venta excluye WhatsApp y marca. La tabla trae las métricas por campaña → conjunto → anuncio. Meta de ROAS {GOAL}× (configurable por cliente).</div>
      </div>

      {preview && <Preview p={preview} cur={cur} onClose={() => setPreview(null)} />}
    </div>
  );
}

function Funnel({ t }: { t: { impressions: number; clicks: number; viewContent: number; addToCart: number; initiateCheckout: number; purchases: number } }) {
  const max = Math.max(t.impressions, 1);
  const w = (v: number) => Math.max(6, (v / max) * 100);
  const steps: [string, number, string][] = [
    ['Impresiones', t.impressions, ''],
    ['Clics', t.clicks, t.impressions ? 'CTR ' + ((t.clicks / t.impressions) * 100).toFixed(1) + '%' : ''],
    ['View content', t.viewContent, t.clicks ? Math.round((t.viewContent / t.clicks) * 100) + '% de clics' : ''],
    ['Agregó al carrito', t.addToCart, t.viewContent ? ((t.addToCart / t.viewContent) * 100).toFixed(1) + '% de VC' : ''],
    ['Checkout', t.initiateCheckout, t.addToCart ? Math.round((t.initiateCheckout / t.addToCart) * 100) + '% del carrito' : ''],
    ['Compra', t.purchases, t.initiateCheckout ? ((t.purchases / t.initiateCheckout) * 100).toFixed(1) + '% del checkout' : ''],
  ];
  return (
    <div className="mc-funnel">
      {steps.map((s, i) => (
        <div className="mc-fstep" key={s[0]}>
          <div className="fl">{s[0]}</div>
          <div className="ft"><div className="ff" style={{ width: w(s[1]) + '%', background: i >= 3 && i < 5 ? 'var(--warn)' : i === 5 ? 'var(--up)' : '#5b6cff' }}>{formatInt(s[1])}</div></div>
          <div className="fp">{s[2]}</div>
        </div>
      ))}
    </div>
  );
}

function Preview({ p, cur, onClose }: { p: { node: ComprasHierNode; cmp: string; set: string }; cur: string; onClose: () => void }) {
  const k = adKind(p.node.name);
  const d = derive(p.node.m);
  const mm: [string, string][] = [
    ['Gasto', formatCurrency(d.spend, cur)], ['Compras', formatInt(d.purch)], ['ROAS', d.roas > 0 ? d.roas.toFixed(1) + '×' : '0×'],
    ['Carritos', formatInt(d.atc)], ['Checkouts', formatInt(d.ic)], ['CPC', d.cpc > 0 ? '$' + d.cpc.toFixed(2) : '—'],
  ];
  return (
    <div className="mc-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mc-card">
        <div className={`mc-media mc-${k.c}`}>
          <button className="mc-x" onClick={onClose}>✕</button>
          {p.node.thumbUrl
            ? <><img src={p.node.thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />{p.node.isVideo && <div className="mc-playbig">▶</div>}</>
            : <><div className="ico">{k.i}</div><div className="lbl">{k.t} · sin miniatura</div></>}
        </div>
        <div className="mc-body">
          <div className="mc-crumb">{p.cmp} › {p.set}</div>
          <div className="mc-name">{p.node.name}</div>
          <div className="mc-metrics">{mm.map((x) => <div className="m" key={x[0]}><div className="l">{x[0]}</div><div className="v">{x[1]}</div></div>)}</div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.mc{--good:var(--up);--bad:var(--dn)}
.mc-eyebrow{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--t3);margin-bottom:16px}
.mc-hero{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:36px;align-items:end;padding-bottom:32px;border-bottom:1px solid var(--b1)}
.mc-thesis{font-size:clamp(21px,2.9vw,32px);font-weight:800;letter-spacing:-.02em;line-height:1.17}
.mc-thesis .hl{color:var(--up)}
.mc-sub{font-size:13px;color:var(--t2);margin-top:14px;line-height:1.6}.mc-sub b{color:var(--t1)}
.mc-north .k{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--t3);margin-bottom:8px}
.mc-north .v{font-size:clamp(30px,3.4vw,38px);font-weight:800;letter-spacing:-.03em;line-height:.95;color:var(--up);font-family:'Space Grotesk',sans-serif}
.mc-north .old{font-size:12px;color:var(--t3);margin-top:8px}.mc-north .old s{color:var(--dn)}
.mc-north .r{display:flex;gap:20px;margin-top:14px}.mc-north .r .l{font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--t3)}
.mc-north .r .rv{font-size:17px;font-weight:800;margin-top:2px;font-family:'Space Grotesk',sans-serif}
.mc-sh{display:flex;align-items:baseline;gap:12px;margin:40px 0 16px}.mc-sh h2{font-size:14.5px;font-weight:700;margin:0}.mc-sh .hint{font-size:11.5px;color:var(--t3)}
.mc-splitbar{height:15px;border-radius:8px;overflow:hidden;display:flex;background:var(--bg3)}
.mc-splitlg{display:flex;gap:20px;flex-wrap:wrap;font-size:12px;margin-top:11px}.mc-splitlg .it{display:flex;align-items:center;gap:7px}
.mc-splitlg .sw{width:10px;height:10px;border-radius:3px}.mc-splitlg b{font-weight:800}.mc-splitlg .mut{color:var(--t3)}
.mc-mttop{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:11px}
.mc-legend{display:flex;align-items:center;gap:13px;font-size:11.5px;color:var(--t3);flex-wrap:wrap}.mc-legend b{color:var(--t1)}
.mc-legend .sw{width:9px;height:9px;border-radius:3px;display:inline-block;margin-right:5px;vertical-align:middle}
.mc-tools{display:flex;gap:8px}.mc-btn{font-size:11.5px;font-weight:600;color:var(--t2);background:var(--bg3);border:1px solid var(--b1);border-radius:8px;padding:6px 11px;cursor:pointer}
.mc-wrap{border:1px solid var(--b2);border-radius:14px;overflow:hidden;background:var(--bg1)}
.mc-scroll{overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;scrollbar-color:var(--b2) transparent}
.mc-scroll::-webkit-scrollbar{height:9px}
.mc-scroll::-webkit-scrollbar-track{background:transparent}
.mc-scroll::-webkit-scrollbar-thumb{background:var(--b2);border-radius:9px}
.mc-scroll::-webkit-scrollbar-thumb:hover{background:var(--t3)}
table.mc-t{border-collapse:collapse;width:100%;min-width:1200px;font-size:12.5px}
.mc-t th{background:var(--bg2);font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--t3);padding:11px 12px;text-align:right;white-space:nowrap;cursor:pointer;user-select:none;border-bottom:1px solid var(--b2)}
.mc-t th:first-child{text-align:left;position:sticky;left:0;z-index:3;background:var(--bg2);min-width:280px;cursor:default}
.mc-t th.on{color:var(--acc)}.mc-t th .ar{margin-left:3px;font-size:9px;opacity:.35}.mc-t th.on .ar{opacity:1}
.mc-t td{padding:11px 12px;border-bottom:1px solid var(--b1);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--t2)}
.mc-t td:first-child{text-align:left;position:sticky;left:0;z-index:1;background:var(--bg1);box-shadow:1px 0 0 var(--b1)}
.mc-t tr:hover td{background:var(--bg2)}.mc-t tr:hover td:first-child{background:var(--bg2)}
.mc-t tr.mcr1{cursor:pointer;font-weight:600}.mc-t tr.mcr1 td{color:var(--t1)}
.mc-t tr.mcr2{cursor:pointer}.mc-t tr.mcr2 td:first-child{background:color-mix(in srgb,var(--acc) 4%,var(--bg1))}
.mc-t tr.mcr3{cursor:pointer}.mc-t tr.mcr3 td:first-child{background:color-mix(in srgb,var(--acc) 7%,var(--bg1))}
.mc-t td.mc-good{color:var(--up)!important;font-weight:700}.mc-t td.mc-warn{color:var(--warn)!important;font-weight:700}.mc-t td.mc-bad{color:var(--dn)!important;font-weight:700}
.mc-t td.v-cell{text-align:left}
.v-badge{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.02em;padding:3px 9px;border-radius:999px;white-space:nowrap;cursor:help}
.v-scale{background:color-mix(in srgb,var(--up) 16%,transparent);color:var(--up)}
.v-iter{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn)}
.v-discard{background:color-mix(in srgb,var(--dn) 15%,transparent);color:var(--dn)}
.v-check{background:color-mix(in srgb,#5b6cff 16%,transparent);color:#7c8cff}
.v-learn{background:var(--bg3);color:var(--t3)}
.v-meas{background:color-mix(in srgb,var(--warn) 16%,transparent);color:var(--warn)}
.site{display:inline-block;font-size:9px;font-weight:800;letter-spacing:.02em;padding:1px 6px;border-radius:5px;vertical-align:middle;cursor:help}
.site-mx{background:color-mix(in srgb,var(--up) 15%,transparent);color:var(--up)}
.site-shop{background:color-mix(in srgb,#7c8cff 18%,transparent);color:#8b96ff}
.mom{display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.02em;cursor:help;font-variant-numeric:tabular-nums}
.mom-up{color:var(--up)}
.mom-dn{color:var(--dn)}
.mom-flat{color:var(--t3);font-weight:700}
.mom-new{color:var(--t3);font-weight:700;background:var(--bg3);padding:2px 7px;border-radius:999px}
.mc-north .v .nd{font-size:13px;font-weight:800;margin-left:8px;vertical-align:middle}
.mc-north .v .nd.up{color:var(--up)}.mc-north .v .nd.dn{color:var(--dn)}
.mc-mernote{font-size:11.5px;color:var(--t3);line-height:1.5;margin:10px 2px 0;padding:9px 12px;background:var(--bg2);border-radius:10px;border:1px solid var(--b1)}
.mc-mernote b{color:var(--t2);font-weight:700}
.cj-movers{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px}
.cj-movers .mv{font-size:12px;font-weight:700;display:inline-flex;gap:6px;align-items:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cj-movers .mv b{font-weight:800}
.mv-up{color:var(--up)}.mv-dn{color:var(--dn)}
.cj-hint{font-size:11px;color:var(--t3);margin-bottom:10px}
/* Plan de escalamiento (P2) */
.plan{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-bottom:14px}
.plan-col{background:var(--bg1);border:1px solid var(--b1);border-radius:14px;padding:12px 14px}
.plan-h{font-size:11px;font-weight:800;letter-spacing:.02em;margin-bottom:8px}
.plan-up{color:var(--up)}.plan-dn{color:var(--dn)}
.plan-row{display:grid;grid-template-columns:1fr auto;grid-template-areas:'nm tags' 'act act';gap:3px 10px;padding:8px 0;border-top:1px solid var(--b1)}
.plan-nm{grid-area:nm;font-size:12.5px;font-weight:700;color:var(--t1);display:flex;align-items:center;gap:6px;min-width:0}
.plan-set{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.plan-tags{grid-area:tags;display:flex;align-items:center;gap:7px;white-space:nowrap}
.plan-act{grid-area:act;font-size:11.5px;color:var(--t2);font-variant-numeric:tabular-nums}
.plan-act b{color:var(--t1);font-weight:800}
.plan-roas{font-size:12px;font-weight:800;color:var(--up)}.plan-roas.dn{color:var(--dn)}
.plan-step{color:var(--up);font-weight:800;margin-left:2px}
.plan-off{color:var(--dn);font-weight:800;text-transform:uppercase;font-size:9.5px;letter-spacing:.05em;margin-left:6px;background:color-mix(in srgb,var(--dn) 14%,transparent);padding:2px 7px;border-radius:5px}
.plan-warn{color:var(--warn);font-weight:700}
.fat{font-size:9.5px;font-weight:800;padding:2px 7px;border-radius:5px;cursor:help}
.fat-ok{color:var(--up);background:color-mix(in srgb,var(--up) 14%,transparent)}
.fat-warn{color:var(--warn);background:color-mix(in srgb,var(--warn) 15%,transparent)}
.fat-hot{color:var(--dn);background:color-mix(in srgb,var(--dn) 15%,transparent)}
@media(max-width:820px){.plan{grid-template-columns:1fr}}
.cj-row.clk{cursor:pointer}
.cj-row.clk:hover td{background:var(--bg2)}
.cj-row.open td{background:var(--bg2)}
.cj-caret{width:26px;text-align:center!important;color:var(--t3);font-size:10px}
.cj-t td.cj-caret{padding-left:8px;padding-right:0}
.cj-ad td{background:var(--bg1)!important;border-bottom:1px solid var(--b1);font-size:11.5px}
.cj-ad td.nm.ad{text-align:left;font-weight:600;color:var(--t2);padding-left:14px;max-width:360px}
.cj-ad.clk{cursor:pointer}
.cj-count{font-size:10px;color:var(--t3);align-self:center;margin-left:2px}
/* Jerarquía visual campaña → conjunto → anuncio */
.cj-camp td.nm{font-weight:800;color:var(--t1)}
.cj-camp td{background:var(--bg2)!important}
.cj-set td.nm.sub{padding-left:16px;font-weight:700;color:var(--t1);position:relative}
.cj-set td.nm.sub::before{content:'└';position:absolute;left:4px;color:var(--t3)}
.cj-caret.l2{padding-left:16px!important}
/* Miniatura del creativo dentro del árbol */
.cj-ad td.nm.ad{display:flex;align-items:center;gap:8px}
.cj-thwrap{position:relative;flex:none;width:30px;height:30px}
.cj-thmb{width:30px;height:30px;border-radius:6px;object-fit:cover;display:flex;align-items:center;justify-content:center;background:var(--bg3);font-size:14px;border:1px solid var(--b1)}
.cj-vb{position:absolute;right:-3px;bottom:-3px;font-size:8px;background:#000;color:#fff;border-radius:3px;padding:0 2px;line-height:1.3}
.cj-adnm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}
.cj-pv{flex:none;font-size:11px;opacity:.45}
.cj-ad.clk:hover .cj-pv{opacity:.9}
/* Catálogo */
/* Cabina de escalamiento */
.cab-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}
.cab-kpi{background:var(--bg1);border:1px solid var(--b1);border-radius:14px;padding:14px 16px}
.cab-k{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--t3);margin-bottom:6px}
.cab-v{font-size:26px;font-weight:800;color:var(--t1);letter-spacing:-.5px;line-height:1.1;margin-bottom:9px}
.cab-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:10.5px;color:var(--t3);margin-top:8px}
.cab-foot .up{color:var(--up);font-weight:700}.cab-foot .dn{color:var(--dn);font-weight:700}
.spk{display:block}
.gauge{position:relative;height:8px;border-radius:6px;background:var(--bg3);overflow:visible}
.gauge-fill{position:absolute;left:0;top:0;height:100%;border-radius:6px}
.gauge-goal{position:absolute;top:-2px;width:2px;height:12px;background:var(--t1);border-radius:2px;transform:translateX(-1px)}
.cab-chart{background:var(--bg1);border:1px solid var(--b1);border-radius:14px;padding:14px 16px 6px}
.cab-legend{display:flex;gap:16px;font-size:11px;color:var(--t3);margin-bottom:6px}
.cab-legend span{display:inline-flex;align-items:center;gap:6px}
.cab-legend i{width:14px;height:3px;border-radius:2px;display:inline-block}
.lg-bar{background:#3b82f6;opacity:.55}.lg-line{background:var(--up)}.lg-goal{background:var(--warn);height:0!important;border-top:2px dashed var(--warn);width:16px!important}
.cab-read{font-size:12px;font-weight:600;padding:8px 2px 4px;line-height:1.4}
.cab-empty{padding:24px;text-align:center;color:var(--t3);font-size:12px;background:var(--bg1);border:1px solid var(--b1);border-radius:14px}
@media(max-width:820px){.cab-kpis{grid-template-columns:repeat(2,1fr)}}
.cj-t .clk{cursor:pointer}
.cj-t tr.clk:hover td{background:var(--bg2)}
.pl-node td{background:var(--bg1)!important;font-size:11.5px;color:var(--t2)}
.pl-node td.nm{font-weight:600}
.cj-t.sortable th.srt{cursor:pointer;user-select:none}
.cj-t.sortable th.srt:hover{color:var(--t1)}
.cj-t.sortable th.on{color:var(--acc,var(--up))}
.cj-t .ar{margin-left:4px;font-size:8px;opacity:.6}
.cj-t.sortable th.on .ar{opacity:1}
.pbars{display:flex;flex-direction:column;gap:9px;margin-bottom:14px;background:var(--bg1);border:1px solid var(--b1);border-radius:14px;padding:14px 16px}
.pbar{display:grid;grid-template-columns:110px 1fr auto;align-items:center;gap:12px}
.pbar-l{font-size:12.5px;font-weight:700;color:var(--t1)}
.pbar-track{position:relative;height:12px;border-radius:7px;background:var(--bg3)}
.pbar-fill{position:absolute;left:0;top:0;height:100%;border-radius:7px}
.pbar-goal{position:absolute;top:-3px;width:2px;height:18px;background:var(--warn);border-radius:2px}
.pbar-v{font-size:12px;font-weight:800;color:var(--t1);white-space:nowrap}
.pbar-v span{font-weight:600;color:var(--t3);font-size:10.5px}
.pl-take{font-size:13px;line-height:1.5;padding:12px 15px;background:var(--bg2);border:1px solid var(--b1);border-left:3px solid var(--up);border-radius:10px;margin-bottom:14px;color:var(--t2)}
.pl-take b{color:var(--t1);font-weight:700}
.pl-note{font-size:10.5px;color:var(--t3);font-style:italic;line-height:1.5;margin-top:4px}
.pl-note b{color:var(--t2);font-style:normal}
.cat-msg{padding:24px;text-align:center;color:var(--t3);font-size:13px;background:var(--bg1);border:1px solid var(--b1);border-radius:12px}
.cat-caveat{font-size:11.5px;color:var(--t3);line-height:1.5;margin-bottom:12px;padding:9px 12px;background:var(--bg2);border-radius:10px;border:1px solid var(--b1)}
.cat-caveat b{color:var(--t2);font-weight:700}
.cat-block{margin-bottom:16px}
.cat-h{font-size:13px;font-weight:700;color:var(--t1);margin-bottom:8px;display:flex;align-items:center;gap:8px}
.cat-fresh{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--up);background:color-mix(in srgb,var(--up) 15%,transparent);padding:2px 7px;border-radius:5px}
.cat-sub{font-size:10.5px;font-weight:600;color:var(--t3)}
.cj-t td.cmp{font-size:11px}
.cat-none{color:var(--t3);font-style:italic}
.cat-buckets{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.cat-col{background:var(--bg1);border:1px solid var(--b1);border-radius:12px;padding:13px 14px}
.cat-ok{border-top:2px solid var(--up)}
.cat-op{border-top:2px solid var(--warn)}
.cat-wa{border-top:2px solid var(--dn)}
.cat-col-h{display:flex;flex-direction:column;gap:1px;margin-bottom:10px}
.cat-col-h b{font-size:13px;color:var(--t1)}
.cat-col-h span{font-size:10.5px;color:var(--t3)}
.cat-item{display:flex;flex-direction:column;gap:1px;padding:7px 0;border-top:1px solid var(--b1)}
.cat-item-nm{font-size:12px;font-weight:600;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cat-item-mt{font-size:10.5px;color:var(--t3);font-variant-numeric:tabular-nums}
.cat-empty{font-size:11px;color:var(--t3);padding:8px 0;font-style:italic}
@media(max-width:820px){.cat-buckets{grid-template-columns:1fr}}
.cj-sum{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:12px}
table.cj-t{border-collapse:collapse;width:100%;min-width:860px;font-size:12.5px}
.cj-t th{background:var(--bg2);font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--t3);padding:10px 13px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--b2)}
.cj-t th:first-child,.cj-t th:nth-child(2),.cj-t th:nth-child(3){text-align:left}
.cj-t td{padding:10px 13px;border-bottom:1px solid var(--b1);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--t2)}
.cj-t tr:hover td{background:var(--bg2)}
.cj-t td.nm{text-align:left;font-weight:700;color:var(--t1);max-width:300px;overflow:hidden;text-overflow:ellipsis}
.cj-t td.cmp{text-align:left;color:var(--t3);font-size:11px;max-width:220px;overflow:hidden;text-overflow:ellipsis}
.cj-t td:nth-child(3){text-align:left}
.cj-t td.mc-good{color:var(--up)!important;font-weight:700}.cj-t td.mc-warn{color:var(--warn)!important;font-weight:700}.cj-t td.mc-bad{color:var(--dn)!important;font-weight:700}
.mc-nmcell{display:flex;align-items:center;gap:9px;min-width:0}
.mc-cx{width:11px;color:var(--t3);font-size:9px;transition:transform .15s;flex:none}.mc-cx.open{transform:rotate(90deg)}
.mc-nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px}
.mc-thmb{width:28px;height:28px;border-radius:6px;flex:none;display:grid;place-items:center;font-size:12px;color:#fff;object-fit:cover}
.mc-thmb.mc-img{background:linear-gradient(135deg,#f0975b,#e0655b)}.mc-thmb.mc-vid{background:linear-gradient(135deg,#5b6cff,#8e5bff)}.mc-thmb.mc-prd{background:linear-gradient(135deg,#0f9d58,#12b877)}
.mc-thwrap{position:relative;flex:none;width:28px;height:28px;display:grid}
.mc-vbadge{position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:10px;text-shadow:0 1px 3px rgba(0,0,0,.7);pointer-events:none}
.mc-playbig{position:absolute;inset:0;display:grid;place-items:center;font-size:44px;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.6);pointer-events:none}
.mc-pvhint{margin-left:auto;font-size:10px;color:var(--acc);opacity:0;transition:opacity .12s;padding-left:8px}.mc-t tr.mcr3:hover .mc-pvhint{opacity:1}
.mc-funnel{display:flex;flex-direction:column;gap:7px}
.mc-fstep{display:grid;grid-template-columns:120px 1fr auto;gap:14px;align-items:center}.mc-fstep .fl{font-size:12.5px;font-weight:600;color:var(--t1)}
.mc-fstep .ft{position:relative;height:30px;background:var(--bg3);border-radius:7px;overflow:hidden}
.mc-fstep .ff{height:100%;border-radius:7px;display:flex;align-items:center;padding:0 11px;color:#fff;font-weight:800;font-size:12.5px}
.mc-fstep .fp{font-size:11.5px;color:var(--t3);white-space:nowrap;min-width:120px;text-align:right}
.mc-duo{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.mc-mini{background:var(--bg1);border:1px solid var(--b1);border-radius:14px;padding:22px}.mc-mini h3{font-size:13px;font-weight:700;margin:0 0 16px}
.mc-spark{display:flex;align-items:flex-end;gap:10px;height:96px}.mc-spark .col{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;justify-content:flex-end}
.mc-spark .bb{width:100%;border-radius:5px 5px 0 0;min-height:4px}.mc-spark .bl{font-size:10px;color:var(--t3)}.mc-spark .bv{font-size:11px;font-weight:800;font-family:'Space Grotesk',sans-serif}
.mc-bridge .big{display:flex;align-items:baseline;gap:10px;margin-bottom:4px}.mc-bridge .big .n{font-size:32px;font-weight:800;font-family:'Space Grotesk',sans-serif}.mc-bridge .big .x{font-size:12px;color:var(--t2)}
.mc-bridge p{font-size:12.5px;color:var(--t2);line-height:1.55;margin-top:10px}.mc-bridge p b{color:var(--t1)}
.mc-acts{display:flex;flex-direction:column;border-top:1px solid var(--b1)}
.mc-act{display:grid;grid-template-columns:150px 1fr;gap:20px;padding:18px 2px;border-bottom:1px solid var(--b1);align-items:baseline}
.mc-act .tag{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:700}.mc-act .tag .dot{width:9px;height:9px;border-radius:50%}
.mc-act .body{font-size:13px;color:var(--t2);line-height:1.55}.mc-act .body b{color:var(--t1)}
.mc-fn{margin-top:34px;font-size:11px;color:var(--t3);border-top:1px solid var(--b1);padding-top:16px;line-height:1.6}
.mc-ov{position:fixed;inset:0;background:rgba(10,8,20,.62);backdrop-filter:blur(3px);display:grid;place-items:center;z-index:200;padding:20px}
.mc-card{background:var(--bg1);border:1px solid var(--b2);border-radius:16px;width:min(430px,94vw);overflow:hidden;box-shadow:0 24px 70px -20px rgba(10,8,30,.5)}
.mc-media{aspect-ratio:16/10;display:grid;place-items:center;position:relative;gap:8px;overflow:hidden}
.mc-media.mc-img{background:linear-gradient(135deg,#f0975b,#e0655b)}.mc-media.mc-vid{background:linear-gradient(135deg,#5b6cff,#8e5bff)}.mc-media.mc-prd{background:linear-gradient(135deg,#0f9d58,#12b877)}
.mc-media .ico{font-size:44px}.mc-media .lbl{font-size:11.5px;color:rgba(255,255,255,.85);font-weight:600}
.mc-x{position:absolute;top:12px;right:14px;width:30px;height:30px;border-radius:50%;background:rgba(0,0,0,.4);color:#fff;border:none;font-size:16px;cursor:pointer;display:grid;place-items:center;z-index:2}
.mc-body{padding:18px 20px 20px}.mc-crumb{font-size:11px;color:var(--t3);margin-bottom:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mc-name{font-size:15px;font-weight:800;letter-spacing:-.01em;line-height:1.3}
.mc-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:16px}
.mc-metrics .m{background:var(--bg3);border-radius:10px;padding:10px 11px}.mc-metrics .m .l{font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--t3)}
.mc-metrics .m .v{font-size:16px;font-weight:800;font-family:'Space Grotesk',sans-serif;margin-top:3px}
@media(max-width:820px){.mc-hero{grid-template-columns:1fr;gap:22px;align-items:start}.mc-duo{grid-template-columns:1fr}.mc-fstep{grid-template-columns:92px 1fr}.mc-fstep .fp{display:none}.mc-act{grid-template-columns:1fr;gap:6px}.mc-t th:first-child,.mc-t td:first-child{min-width:200px}.mc-nm{max-width:150px}}
`;
