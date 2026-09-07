'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import {
  useTikTok,
  type TikTokAdRow,
  type TikTokAdGroupRow,
  type TikTokVideo,
} from '@/lib/hooks/useTikTok';
import { calcDelta, formatCurrency, formatInt, formatNumber, formatPercent } from '@/lib/utils';
import {
  TT_PINK,
  TT_CYAN,
  TikTokLoading,
  TikTokError,
  TikTokEmpty,
  TikTokHero,
  CreativeThumb,
  SectionLabel,
  deltaParts,
  BackToTop,
} from './tiktokShared';

// ============================================================
// TikTok Ads · RETENCIÓN DE LOS ANUNCIOS  (v3 · gráfico, "la biblia")
// ============================================================
// Misma filosofía que Campañas: menos texto, más gráfica.
//   ZONA 1 — Diagnóstico (dónde está la fuga) + KPIs + UN panel de acciones
//            (Escalar / Ajustar / Descartar) cruzando gancho con resultado.
//   ZONA 2 — Curva de retención global como área SVG (el "acantilado") +
//            explorador con pestañas Creativos / Ciudades, micro-funnel por
//            fila, campaña › conjunto para rastreo, y paginación 10/25/100.
// El semáforo va por GANCHO vs. el promedio de la cuenta; el resultado
// (leads/CPL) se muestra al lado. 100 % datos reales.
// ============================================================

const GOOD = 'var(--up)';
const WARN = 'var(--warn)';
const BAD = 'var(--dn)';

interface RetMetrics {
  hook: number;
  hold: number;
  p50: number;
  p100: number;
  watch: number;
  views: number;
  conversions: number;
  cpl: number;
}

function statusOf(hook: number, avg: number): { dot: string; label: string } {
  if (avg <= 0) return { dot: WARN, label: '—' };
  if (hook >= avg * 1.25) return { dot: GOOD, label: 'Fuerte' };
  if (hook >= avg * 0.8) return { dot: WARN, label: 'Promedio' };
  return { dot: BAD, label: 'Débil' };
}
const hookColor = (hook: number, avg: number) =>
  avg <= 0 ? 'var(--t1)' : hook >= avg * 1.25 ? GOOD : hook >= avg * 0.8 ? WARN : BAD;
const cplColor = (cpl: number, conv: number, meta: number) =>
  conv === 0 ? 'var(--t2)' : cpl <= meta * 2 ? GOOD : cpl <= meta * 3 ? WARN : BAD;

type SortKey = 'views' | 'hook' | 'watch' | 'conversions' | 'cpl';
type Tab = 'ad' | 'city';
const PAGE_SIZES = [10, 25, 100];

export function TikTokRetention() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useTikTok(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const cur = client.currency;

  const [tab, setTab] = useState<Tab>('ad');
  const [sortKey, setSortKey] = useState<SortKey>('views');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const withVideo = useMemo(() => (data?.ads ?? []).filter((a) => a.video.views > 0), [data]);

  // Ciudades: agrega los conjuntos (adgroups) por nombre, retención ponderada
  // por reproducciones a partir de los conteos reales de video.
  const cities = useMemo(() => aggregateCities(data?.adgroups ?? []), [data]);

  if (loading && !data) return <TikTokLoading clientName={client.name} />;
  if (error) return <TikTokError error={error} />;
  if (!data || data.totals.spend === 0)
    return <TikTokEmpty data={data} clientName={client.name} rangeLabel={rangeLabel} />;

  const v = data.video;
  const vp = data.videoPrev;
  const avgHook = v.hookRate;
  const meta = typeof client.cplTarget === 'number' && client.cplTarget > 0 ? client.cplTarget : data.totals.cpl;

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'cpl' ? 'asc' : 'desc');
    }
    setPage(1);
  };
  const changeTab = (next: Tab) => { setTab(next); setSortKey('views'); setSortDir('desc'); setPage(1); };

  return (
    <div className="view on">
      <TikTokHero
        title="TikTok Ads · Retención de los anuncios"
        sub={
          <>
            {rangeLabel} · {client.name} · {formatNumber(v.views)} reproducciones ·{' '}
            {formatInt(withVideo.length)} anuncios con video
          </>
        }
      />

      {/* ═══ ZONA 1 · DIAGNÓSTICO + ACCIONES ═══ */}
      <div className="card ttc-z1" style={{ padding: '20px 22px' }}>
        <Diagnostico v={v} vp={vp} withVideo={withVideo} cur={cur} meta={meta} />
        <ActionsPanel ads={withVideo} avgHook={avgHook} meta={meta} cur={cur} />
      </div>

      {/* ═══ ZONA 2 · CURVA + EXPLORADOR ═══ */}
      <SectionLabel style={{ margin: '24px 0 10px' }}>Curva de retención global · el acantilado</SectionLabel>
      <div className="card" style={{ padding: '16px 18px 8px' }}>
        <RetentionCurveSVG v={v} />
        <div style={{ fontSize: 11, color: 'var(--mu)', padding: '0 4px 8px' }}>
          Del 100 % que reproduce, cuántos siguen viendo en cada hito. La caída en rojo es dónde el
          creativo pierde a la audiencia.
        </div>
      </div>

      <SectionLabel style={{ margin: '24px 0 10px' }}>El desglose · retención + resultado</SectionLabel>
      <div style={explorerHeadStyle}>
        <div style={tabsStyle}>
          <TabBtn active={tab === 'ad'} onClick={() => changeTab('ad')}>Creativos</TabBtn>
          <TabBtn active={tab === 'city'} onClick={() => changeTab('city')}>Ciudades</TabBtn>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--mu)' }}>
            Mostrar
            <div style={psizeWrap}>
              {PAGE_SIZES.map((n) => (
                <button key={n} onClick={() => { setPageSize(n); setPage(1); }} style={psizeBtn(pageSize === n)}>{n}</button>
              ))}
            </div>
          </div>
          <div style={{ position: 'relative', flex: '0 1 220px', minWidth: 150 }}>
            <span style={searchIcon}>⌕</span>
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Buscar…"
              style={searchInput}
              aria-label="Buscar"
            />
            {query && <button onClick={() => setQuery('')} style={searchClear} title="Limpiar" aria-label="Limpiar">×</button>}
          </div>
        </div>
      </div>

      {tab === 'ad' ? (
        <AdsTable
          ads={withVideo} avgHook={avgHook} meta={meta} cur={cur}
          sortKey={sortKey} sortDir={sortDir} onSort={onSort}
          query={query} page={page} pageSize={pageSize} setPage={setPage}
        />
      ) : (
        <CitiesTable
          cities={cities} avgHook={avgHook} meta={meta} cur={cur}
          sortKey={sortKey} sortDir={sortDir} onSort={onSort}
          query={query} page={page} pageSize={pageSize} setPage={setPage}
        />
      )}

      <div style={{ fontSize: 11, color: 'var(--mu)', margin: '10px 2px 0', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>Semáforo (gancho vs. promedio {formatPercent(avgHook, 1)}):</span>
        <span><Dot c={GOOD} /> fuerte</span>
        <span><Dot c={WARN} /> promedio</span>
        <span><Dot c={BAD} /> débil</span>
        <span>· barras = 2s·6s·50%·100% (pasa el cursor para ver %)</span>
      </div>

      <div className="card" style={{ marginTop: 16, borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Dato real de TikTok; las tasas se calculan sobre <b>reproducciones</b> (no impresiones). El
          semáforo va por <b>gancho</b> vs. el promedio de la cuenta; las acciones cruzan retención con
          el <b>resultado</b> (leads/CPL). En <b>Ciudades</b> se agregan los conjuntos por su nombre. El
          tiempo promedio lo reporta TikTok directo.
        </div>
      </div>

      <BackToTop />
    </div>
  );
}

// ── Diagnóstico: titular + KPIs ──────────────────────────────────────────────
function Diagnostico({
  v, vp, withVideo, cur, meta,
}: {
  v: TikTokVideo; vp: TikTokVideo | null; withVideo: TikTokAdRow[]; cur: string; meta: number;
}) {
  const dropHook = Math.round((1 - v.hookRate) * 100);
  const passHook = Math.round(v.hookRate * 100);
  const pass6s = Math.round(v.holdRate * 100);
  // El "modelo a replicar" debe enganchar Y convertir barato (mismo criterio que
  // Escalar), no el gancho más alto a secas (que puede ser un fluke caro).
  const best =
    [...withVideo]
      .filter((a) => a.conversions > 0 && a.video.hookRate >= v.hookRate && a.cpl <= meta * 2)
      .sort((a, b) => b.video.hookRate - a.video.hookRate)[0] ||
    [...withVideo].sort((a, b) => b.video.hookRate - a.video.hookRate)[0];

  const viewsDelta = vp ? calcDelta(v.views, vp.views) : null;
  const hookDelta = vp ? v.hookRate - vp.hookRate : null;
  const holdDelta = vp ? v.holdRate - vp.holdRate : null;
  const p50Delta = vp ? v.p50Rate - vp.p50Rate : null;
  const completeDelta = vp ? v.completionRate - vp.completionRate : null;
  const watchDelta = vp ? v.avgWatchTime - vp.avgWatchTime : null;
  const fmtPts = (x: number) => `${(x * 100).toFixed(1)} pts`;
  const fmtSec = (x: number) => `${x.toFixed(1)} s`;

  return (
    <div className="ttc-head">
      <div>
        <SectionLabel style={{ margin: 0 }}>Diagnóstico del período</SectionLabel>
        <div style={headlineStyle}>
          El <span style={{ color: BAD }}>{dropHook}%</span> se va antes del 2.º segundo
        </div>
        <div style={headSubStyle}>
          Solo <b>{passHook} de cada 100</b> reproducciones pasan el gancho y <b>{pass6s}</b> llegan al
          6.º segundo. El arranque es la prioridad
          {best ? (
            <> — y el modelo a replicar es <b>{shortName(best.name)}</b> (gancho {formatPercent(best.video.hookRate, 0)}
            {best.conversions > 0 ? <>, lead a {formatCurrency(best.cpl, cur)}</> : null}).</>
          ) : '.'}
        </div>
      </div>
      <div>
        <div className="ret-kpis">
          <KpiChip label="Gancho 2s" value={formatPercent(v.hookRate, 1)} delta={hookDelta} good="up" fmtDelta={fmtPts} />
          <KpiChip label="Retención 6s" value={formatPercent(v.holdRate, 1)} delta={holdDelta} good="up" fmtDelta={fmtPts} />
          <KpiChip label="Vieron 50%" value={formatPercent(v.p50Rate, 1)} delta={p50Delta} good="up" fmtDelta={fmtPts} />
          <KpiChip label="Completo" value={formatPercent(v.completionRate, 1)} delta={completeDelta} good="up" fmtDelta={fmtPts} />
          <KpiChip label="Tiempo prom." value={v.avgWatchTime > 0 ? fmtSec(v.avgWatchTime) : '—'} delta={watchDelta} good="up" fmtDelta={fmtSec} />
          <KpiChip label="Reproduc." value={formatNumber(v.views)} delta={viewsDelta} good="up" />
        </div>
      </div>
    </div>
  );
}

function KpiChip({
  label, value, delta, good, fmtDelta,
}: {
  label: string; value: string; delta: number | null; good: 'up' | 'down' | 'neutral'; fmtDelta?: (v: number) => string;
}) {
  const { text, color } = deltaParts(delta, good, fmtDelta);
  return (
    <div style={{ padding: '9px 11px', borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--b1)' }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--mu)' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2, color: 'var(--t1)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 9.5, marginTop: 1, color, fontVariantNumeric: 'tabular-nums' }}>{text}</div>
    </div>
  );
}

// ── Panel de acciones: Escalar / Ajustar / Descartar ─────────────────────────
function ActionsPanel({ ads, avgHook, meta, cur }: { ads: TikTokAdRow[]; avgHook: number; meta: number; cur: string }) {
  const { escalar, ajustar, descartar } = useMemo(() => {
    const escalar = ads.filter((a) => a.conversions > 0 && a.video.hookRate >= avgHook && a.cpl <= meta * 2)
      .sort((a, b) => b.video.hookRate - a.video.hookRate).slice(0, 3);
    const descartar = ads.filter((a) => a.video.hookRate < avgHook * 0.85 && (a.conversions === 0 || a.cpl >= meta * 3))
      .sort((a, b) => a.video.hookRate - b.video.hookRate).slice(0, 3);
    const escSet = new Set(escalar);
    const ajustar = ads.filter((a) => a.video.hookRate >= avgHook * 0.85 && a.cpl > meta * 2 && !escSet.has(a))
      .sort((a, b) => b.video.views - a.video.views).slice(0, 3);
    return { escalar, ajustar, descartar };
  }, [ads, avgHook, meta]);

  return (
    <div className="ttc-acts">
      <ActionCol color={GOOD} title="Escalar" items={escalar} avgHook={avgHook} meta={meta} cur={cur} empty="Sin creativos con gancho fuerte y lead barato en este rango." />
      <ActionCol color={WARN} title="Ajustar" items={ajustar} avgHook={avgHook} meta={meta} cur={cur} empty="Nada intermedio: gancho decente pero lead caro." />
      <ActionCol color={BAD} title="Descartar" items={descartar} avgHook={avgHook} meta={meta} cur={cur} empty="Nada que descartar: ningún creativo débil y caro." />
    </div>
  );
}

function ActionCol({
  color, title, items, avgHook, meta, cur, empty,
}: {
  color: string; title: string; items: TikTokAdRow[]; avgHook: number; meta: number; cur: string; empty: string;
}) {
  return (
    <div className="ttc-acol">
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase', color, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} /> {title}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--mu)', padding: '6px 0', lineHeight: 1.4 }}>{empty}</div>
      ) : (
        items.map((a, i) => {
          const gc = hookColor(a.video.hookRate, avgHook);
          return (
            <div key={a.adId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: i === 0 ? 'none' : '1px solid var(--b1)' }}>
              <span style={{ flex: 'none', width: 36, textAlign: 'center', fontSize: 11, fontWeight: 800, fontFamily: "'Space Grotesk',sans-serif", borderRadius: 6, padding: '3px 0', color: gc, background: `color-mix(in srgb, ${gc} 14%, transparent)` }}>
                {formatPercent(a.video.hookRate, 0)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ ...ellipsis, fontSize: 11.5, fontWeight: 700, display: 'block' }} title={a.name}>{shortName(a.name)}</b>
                <div style={{ ...ellipsis, fontSize: 9.5, color: 'var(--mu)' }}>{firstSeg(a.adgroupName)} · {formatInt(a.conversions)} leads</div>
              </div>
              <div style={{ flex: 'none', fontWeight: 800, fontFamily: "'Space Grotesk',sans-serif", fontSize: 11.5, color: cplColor(a.cpl, a.conversions, meta) }}>
                {a.conversions > 0 ? formatCurrency(a.cpl, cur) : 'sin conv.'}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Curva de retención global (área SVG · el acantilado) ──────────────────────
function RetentionCurveSVG({ v }: { v: TikTokVideo }) {
  const uid = useId().replace(/:/g, '');
  const stages = [
    { l: 'Reprod.', p: 1 },
    { l: '2s', p: v.hookRate },
    { l: '6s', p: v.holdRate },
    { l: '25%', p: v.p25Rate },
    { l: '50%', p: v.p50Rate },
    { l: '75%', p: v.p75Rate },
    { l: '100%', p: v.completionRate },
  ];
  const W = 900, H = 200, padL = 8, padR = 8, padT = 26, padB = 26;
  const n = stages.length;
  const x = (i: number) => padL + ((W - padL - padR) * i) / (n - 1);
  const y = (p: number) => padT + (H - padT - padB) * (1 - p);
  const pts = stages.map((s, i) => [x(i), y(s.p)] as const);
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} ${x(n - 1)},${H - padB} ${x(0)},${H - padB}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 190, display: 'block' }}>
      <defs>
        <linearGradient id={`cg-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TT_CYAN} stopOpacity="0.55" />
          <stop offset="100%" stopColor={TT_PINK} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#cg-${uid})`} />
      <polyline points={line} fill="none" stroke={TT_CYAN} strokeWidth="2.5" strokeLinejoin="round" />
      {[[0, 1], [1, 2]].map(([a, b]) => {
        const dp = stages[a].p - stages[b].p;
        if (dp < 0.1) return null;
        const mx = (x(a) + x(b)) / 2, my = (y(stages[a].p) + y(stages[b].p)) / 2;
        return (
          <text key={a} x={mx} y={my - 6} textAnchor="middle" fill="var(--dn)" style={{ fontSize: 11, fontWeight: 800 }}>
            ▼ {(dp * 100).toFixed(0)} pts
          </text>
        );
      })}
      {stages.map((s, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(s.p)} r="3.5" fill={TT_CYAN} />
          <text x={x(i)} y={y(s.p) - 9} textAnchor="middle" fill="var(--t1)" style={{ fontSize: 10, fontWeight: 800 }}>
            {(s.p * 100).toFixed(1)}%
          </text>
          <text x={x(i)} y={H - 8} textAnchor="middle" fill="var(--mu)" style={{ fontSize: 9.5 }}>{s.l}</text>
        </g>
      ))}
    </svg>
  );
}

// ── Micro-funnel por fila (2s·6s·50%·100%) ───────────────────────────────────
function MicroFunnel({ m, color }: { m: RetMetrics; color: string }) {
  const steps: [string, number][] = [['2s', m.hook], ['6s', m.hold], ['50%', m.p50], ['100%', m.p100]];
  const title = `Gancho ${formatPercent(m.hook, 0)} · 6s ${formatPercent(m.hold, 0)} · 50% ${formatPercent(m.p50, 0)} · 100% ${formatPercent(m.p100, 0)}`;
  return (
    <span title={title} style={{ display: 'inline-flex', gap: 3, alignItems: 'flex-end', height: 26, verticalAlign: 'middle' }}>
      {steps.map(([lbl, val]) => (
        <span key={lbl} style={{ width: 8, height: '100%', background: 'var(--track)', borderRadius: 2, display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
          <i style={{ display: 'block', width: '100%', height: `${Math.max(8, Math.min(100, (val / 0.4) * 100))}%`, background: color, borderRadius: 2 }} />
        </span>
      ))}
    </span>
  );
}

// ── Tabla de creativos ───────────────────────────────────────────────────────
const COLS: { key: SortKey | ''; label: string }[] = [
  { key: 'views', label: 'Reprod.' },
  { key: 'hook', label: 'Gancho' },
  { key: '', label: 'Retención' },
  { key: 'watch', label: 'Tiempo' },
  { key: 'conversions', label: 'Leads' },
  { key: 'cpl', label: 'CPL' },
];

function TableHead({
  firstLabel, sortKey, sortDir, onSort,
}: {
  firstLabel: string; sortKey: SortKey; sortDir: 'asc' | 'desc'; onSort: (k: SortKey) => void;
}) {
  return (
    <thead>
      <tr>
        <th className="nos">{firstLabel}</th>
        <th className="nos">Estado</th>
        {COLS.map((c, i) =>
          c.key === '' ? (
            <th key={i} className="nos" style={{ textAlign: 'right' }}>{c.label}</th>
          ) : (
            <th
              key={i}
              className="th-sort"
              data-sort={sortKey === c.key ? sortDir : 'none'}
              role="button" tabIndex={0} title="Ordenar"
              style={{ textAlign: 'right' }}
              onClick={() => onSort(c.key as SortKey)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(c.key as SortKey); } }}
            >
              {c.label}
            </th>
          ),
        )}
      </tr>
    </thead>
  );
}

function retSortVal(m: RetMetrics, key: SortKey): number | null {
  if (key === 'cpl') return m.conversions > 0 ? m.cpl : null;
  if (key === 'watch') return m.watch;
  if (key === 'conversions') return m.conversions;
  if (key === 'hook') return m.hook;
  return m.views;
}
function sortRet<T>(arr: T[], get: (r: T) => RetMetrics, key: SortKey, dir: 'asc' | 'desc'): T[] {
  const dec = arr.map((r, i) => [r, i] as [T, number]);
  dec.sort((A, B) => {
    const va = retSortVal(get(A[0]), key), vb = retSortVal(get(B[0]), key);
    if (va == null && vb == null) return A[1] - B[1];
    if (va == null) return 1;
    if (vb == null) return -1;
    const c = va - vb;
    if (c === 0) return A[1] - B[1];
    return dir === 'asc' ? c : -c;
  });
  return dec.map(([r]) => r);
}

function Pager({
  total, page, pageSize, setPage,
}: {
  total: number; page: number; pageSize: number; setPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safe = Math.min(page, pages);
  const start = (safe - 1) * pageSize;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 12, fontSize: 11.5, color: 'var(--mu)' }}>
      <span>{total ? start + 1 : 0}–{Math.min(start + pageSize, total)} de {total}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={() => setPage(safe - 1)} disabled={safe <= 1} style={pagerBtn(safe <= 1)}>‹ Anterior</button>
        <span style={{ minWidth: 74, textAlign: 'center' }}>Pág. {safe} / {pages}</span>
        <button onClick={() => setPage(safe + 1)} disabled={safe >= pages} style={pagerBtn(safe >= pages)}>Siguiente ›</button>
      </div>
    </div>
  );
}

function AdsTable({
  ads, avgHook, meta, cur, sortKey, sortDir, onSort, query, page, pageSize, setPage,
}: {
  ads: TikTokAdRow[]; avgHook: number; meta: number; cur: string;
  sortKey: SortKey; sortDir: 'asc' | 'desc'; onSort: (k: SortKey) => void;
  query: string; page: number; pageSize: number; setPage: (p: number) => void;
}) {
  const m = (a: TikTokAdRow): RetMetrics => ({
    hook: a.video.hookRate, hold: a.video.holdRate, p50: a.video.p50Rate, p100: a.video.completionRate,
    watch: a.video.avgWatchTime, views: a.video.views, conversions: a.conversions, cpl: a.cpl,
  });
  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const base = q ? ads.filter((a) => a.name.toLowerCase().includes(q) || a.campaignName.toLowerCase().includes(q) || a.adgroupName.toLowerCase().includes(q)) : ads;
    return sortRet(base, m, sortKey, sortDir);
  }, [ads, q, sortKey, sortDir]);

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safe = Math.min(page, pages);
  const start = (safe - 1) * pageSize;
  const slice = rows.slice(start, start + pageSize);

  return (
    <>
      <div style={tblWrap}>
        <table className="t ttc-table" style={{ minWidth: 900 }}>
          <TableHead firstLabel="Anuncio · campaña › conjunto" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          <tbody>
            {slice.length === 0 && (
              <tr><td colSpan={8} style={{ color: 'var(--mu)', textAlign: 'center', padding: 20 }}>Sin creativos que coincidan.</td></tr>
            )}
            {slice.map((a) => {
              const met = m(a);
              const s = statusOf(met.hook, avgHook);
              const gc = hookColor(met.hook, avgHook);
              return (
                <tr key={a.adId}>
                  <td>
                    <div style={nameCell}>
                      <span style={{ ...dotStyle, background: s.dot }} />
                      <CreativeThumb name={a.name} coverUrl={a.coverUrl} videoUrl={a.videoUrl} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ ...ellipsis, fontWeight: 600, maxWidth: 260 }} title={a.name}>{shortName(a.name)}</div>
                        <div style={{ ...subStyle }} title={`Campaña: ${a.campaignName}\nConjunto: ${a.adgroupName}`}>
                          {campShort(a.campaignName)} <span style={{ opacity: 0.5 }}>›</span> {firstSeg(a.adgroupName)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td><EstadoCell s={s} /></td>
                  <td className="num">{formatNumber(met.views)}</td>
                  <td className="num" style={{ color: gc, fontWeight: 800 }}>{formatPercent(met.hook, 0)}</td>
                  <td style={{ textAlign: 'right' }}><MicroFunnel m={met} color={gc} /></td>
                  <td className="num">{met.watch > 0 ? `${met.watch.toFixed(1)}s` : '—'}</td>
                  <td className="num">{formatInt(met.conversions)}</td>
                  <td className="num" style={{ fontWeight: 700, color: cplColor(met.cpl, met.conversions, meta) }}>{met.conversions > 0 ? formatCurrency(met.cpl, cur) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager total={total} page={page} pageSize={pageSize} setPage={setPage} />
    </>
  );
}

interface CityRet extends RetMetrics { name: string; full: string; ads: number; }

function aggregateCities(adgroups: TikTokAdGroupRow[]): CityRet[] {
  interface Agg { name: string; full: string; views: number; w2s: number; w6s: number; wp50: number; w100: number; spend: number; conv: number; watchw: number; ads: number; }
  const m = new Map<string, Agg>();
  for (const g of adgroups) {
    if (g.video.views <= 0) continue;
    let a = m.get(g.name);
    if (!a) { a = { name: firstSeg(g.name), full: g.name, views: 0, w2s: 0, w6s: 0, wp50: 0, w100: 0, spend: 0, conv: 0, watchw: 0, ads: 0 }; m.set(g.name, a); }
    a.views += g.video.views;
    a.w2s += g.video.watched2s;
    a.w6s += g.video.watched6s;
    a.wp50 += g.video.watchedP50;
    a.w100 += g.video.completes;
    a.watchw += g.video.avgWatchTime * g.video.views;
    a.spend += g.spend;
    a.conv += g.conversions;
    a.ads += 1;
  }
  return Array.from(m.values()).map((a) => ({
    name: a.name, full: a.full, ads: a.ads, views: a.views,
    hook: a.views > 0 ? a.w2s / a.views : 0,
    hold: a.views > 0 ? a.w6s / a.views : 0,
    p50: a.views > 0 ? a.wp50 / a.views : 0,
    p100: a.views > 0 ? a.w100 / a.views : 0,
    watch: a.views > 0 ? a.watchw / a.views : 0,
    conversions: a.conv,
    cpl: a.conv > 0 ? a.spend / a.conv : 0,
  }));
}

function CitiesTable({
  cities, avgHook, meta, cur, sortKey, sortDir, onSort, query, page, pageSize, setPage,
}: {
  cities: CityRet[]; avgHook: number; meta: number; cur: string;
  sortKey: SortKey; sortDir: 'asc' | 'desc'; onSort: (k: SortKey) => void;
  query: string; page: number; pageSize: number; setPage: (p: number) => void;
}) {
  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const base = q ? cities.filter((c) => c.full.toLowerCase().includes(q)) : cities;
    return sortRet(base, (r) => r, sortKey, sortDir);
  }, [cities, q, sortKey, sortDir]);

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safe = Math.min(page, pages);
  const start = (safe - 1) * pageSize;
  const slice = rows.slice(start, start + pageSize);

  return (
    <>
      <div style={tblWrap}>
        <table className="t ttc-table" style={{ minWidth: 900 }}>
          <TableHead firstLabel="Ciudad / conjunto" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          <tbody>
            {slice.length === 0 && (
              <tr><td colSpan={8} style={{ color: 'var(--mu)', textAlign: 'center', padding: 20 }}>Sin ciudades que coincidan.</td></tr>
            )}
            {slice.map((c) => {
              const s = statusOf(c.hook, avgHook);
              const gc = hookColor(c.hook, avgHook);
              return (
                <tr key={c.full}>
                  <td>
                    <div style={nameCell}>
                      <span style={{ ...dotStyle, background: s.dot }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ ...ellipsis, fontWeight: 600, maxWidth: 300 }} title={c.full}>{c.name}</div>
                        <div style={subStyle}>{c.ads} anuncios · varias campañas</div>
                      </div>
                    </div>
                  </td>
                  <td><EstadoCell s={s} /></td>
                  <td className="num">{formatNumber(c.views)}</td>
                  <td className="num" style={{ color: gc, fontWeight: 800 }}>{formatPercent(c.hook, 0)}</td>
                  <td style={{ textAlign: 'right' }}><MicroFunnel m={c} color={gc} /></td>
                  <td className="num">{c.watch > 0 ? `${c.watch.toFixed(1)}s` : '—'}</td>
                  <td className="num">{formatInt(c.conversions)}</td>
                  <td className="num" style={{ fontWeight: 700, color: cplColor(c.cpl, c.conversions, meta) }}>{c.conversions > 0 ? formatCurrency(c.cpl, cur) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager total={total} page={page} pageSize={pageSize} setPage={setPage} />
    </>
  );
}

function EstadoCell({ s }: { s: { dot: string; label: string } }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--t2)', whiteSpace: 'nowrap' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, flexShrink: 0 }} /> {s.label}
    </span>
  );
}
function Dot({ c }: { c: string }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: c, verticalAlign: 1 }} />;
}
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', border: 'none', background: active ? 'var(--bg1)' : 'transparent', color: active ? 'var(--t1)' : 'var(--t2)', boxShadow: active ? '0 1px 2px rgba(0,0,0,0.12)' : 'none' }}>
      {children}
    </button>
  );
}

// ── helpers de nombre ────────────────────────────────────────────────────────
const firstSeg = (s: string) => s.split('|')[0].trim();
const shortName = (s: string) => s.split('|').slice(0, 2).map((p) => p.trim()).join(' · ');
const campShort = (c: string) => { const p = c.split('|').map((s) => s.trim()); return p[2] || p[0]; };

// ── estilos ──────────────────────────────────────────────────────────────────
const headlineStyle: React.CSSProperties = { fontSize: 'clamp(19px,2.4vw,26px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.18, marginTop: 2 };
const headSubStyle: React.CSSProperties = { fontSize: 12.5, color: 'var(--t2)', marginTop: 9, lineHeight: 1.5 };
const explorerHeadStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 11 };
const tabsStyle: React.CSSProperties = { display: 'inline-flex', background: 'var(--bg3)', border: '1px solid var(--b1)', borderRadius: 10, padding: 3, gap: 2 };
const tblWrap: React.CSSProperties = { overflowX: 'auto', border: '1px solid var(--b1)', borderRadius: 14, background: 'var(--bg1)' };
const nameCell: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 };
const dotStyle: React.CSSProperties = { flex: 'none', width: 8, height: 8, borderRadius: '50%', display: 'inline-block' };
const subStyle: React.CSSProperties = { fontSize: 9.5, color: 'var(--mu)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 270 };
const ellipsis: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const psizeWrap: React.CSSProperties = { display: 'inline-flex', background: 'var(--bg3)', border: '1px solid var(--b1)', borderRadius: 8, padding: 2, gap: 2 };
function psizeBtn(on: boolean): React.CSSProperties {
  return { fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 6, border: 'none', background: on ? 'var(--bg1)' : 'transparent', color: on ? 'var(--t1)' : 'var(--t2)', cursor: 'pointer', boxShadow: on ? '0 1px 2px rgba(0,0,0,0.12)' : 'none' };
}
function pagerBtn(disabled: boolean): React.CSSProperties {
  return { fontSize: 11, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--b1)', background: 'var(--bg1)', color: 'var(--t2)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1 };
}
const searchInput: React.CSSProperties = { width: '100%', fontSize: 12, color: 'var(--t1)', background: 'var(--bg1)', border: '1px solid var(--b1)', borderRadius: 9, padding: '7px 26px 7px 26px', outline: 'none' };
const searchIcon: React.CSSProperties = { position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--mu)', pointerEvents: 'none' };
const searchClear: React.CSSProperties = { position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, lineHeight: '16px', textAlign: 'center', fontSize: 14, color: 'var(--mu)', background: 'transparent', border: 'none', cursor: 'pointer' };
