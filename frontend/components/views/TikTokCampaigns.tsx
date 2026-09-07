'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import {
  useTikTok,
  type TikTokCampaignRow,
  type TikTokAdGroupRow,
  type TikTokAdRow,
} from '@/lib/hooks/useTikTok';
import { formatCurrency, formatInt, formatPercent } from '@/lib/utils';
import {
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
// TikTok Ads · RESULTADOS POR CAMPAÑAS  (v5 · "la biblia", reestructurado)
// ============================================================
// Dos zonas, no siete secciones apiladas:
//   ZONA 1 — Resumen + Acciones: un titular sobrio CPL vs meta + UN panel de
//            acciones (Escalar / Reemplazar / Apagar) derivado del dato real.
//   ZONA 2 — Explorador con pestañas: UNA tabla robusta con 3 agrupaciones —
//            Campañas (drill-down campaña→conjunto→anuncio, top-5 + ver más),
//            Ciudades (agrega los conjuntos por su nombre = ciudad) y
//            Creativos (todos los anuncios en plano).
// El SEMÁFORO (CPL vs meta) vive contenido: un punto de color + el estado + el
// color del CPL. Las barras de inversión son acento tenue (magnitud, no alarma).
// Todo es dato real; la meta de CPL sale de client.cplTarget (acordada con el
// cliente). Sin meta, el semáforo se mide contra el CPL promedio de la cuenta.
// ============================================================

// Colores del semáforo (tokens del dashboard).
const GOOD = 'var(--up)';
const WARN = 'var(--warn)';
const BAD = 'var(--dn)';
const NEUTRAL = 'var(--mu)';

interface StatusInfo {
  dot: string;
  label: string;
  key: 'esc' | 'bien' | 'vig' | 'rev' | 'off' | 'na';
}

// Semáforo por fila: verde escala/bien, ámbar vigilar, rojo revisar/apagar.
function statusOf(cpl: number, conv: number, spend: number, meta: number): StatusInfo {
  if (spend > 0 && conv === 0) return { dot: BAD, label: 'Apagar', key: 'off' };
  if (conv === 0) return { dot: NEUTRAL, label: 'sin conv.', key: 'na' };
  const m = meta > 0 ? cpl / meta : 1;
  if (m <= 1) return { dot: GOOD, label: 'Escalar', key: 'esc' };
  if (m <= 2) return { dot: GOOD, label: 'Bien', key: 'bien' };
  if (m <= 3) return { dot: WARN, label: 'Vigilar', key: 'vig' };
  return { dot: BAD, label: 'Revisar', key: 'rev' };
}

// Color del texto del CPL (contenido: solo aquí y en el punto de estado).
function cplColor(cpl: number, conv: number, meta: number): string {
  if (conv === 0) return 'var(--t2)';
  const m = meta > 0 ? cpl / meta : 1;
  return m <= 2 ? GOOD : m <= 3 ? WARN : BAD;
}

// ── Métricas comunes a campaña / conjunto / anuncio / ciudad ─────────────────
interface Metrics {
  spend: number;
  conversions: number;
  cpl: number;
  ctr: number;
  impressions: number;
  reach: number;
  frequency: number;
  cpm: number;
  cvr: number;
  hook: number; // gancho 2s (fracción)
}

function toMetrics(x: TikTokCampaignRow | TikTokAdGroupRow | TikTokAdRow): Metrics {
  return {
    spend: x.spend,
    conversions: x.conversions,
    cpl: x.cpl,
    ctr: x.ctr,
    impressions: x.impressions,
    reach: x.reach,
    frequency: x.frequency,
    cpm: x.cpm,
    cvr: x.cvr,
    hook: x.video?.hookRate ?? 0,
  };
}

type SortKey = 'spend' | 'conversions' | 'cpl' | 'ctr' | 'hook' | 'frequency' | 'cpm' | 'cvr';
const COLS: { key: SortKey; label: string }[] = [
  { key: 'spend', label: 'Inversión' },
  { key: 'conversions', label: 'Conv.' },
  { key: 'cpl', label: 'CPL' },
  { key: 'ctr', label: 'CTR' },
  { key: 'hook', label: 'Gancho' },
  { key: 'frequency', label: 'Frec.' },
  { key: 'cpm', label: 'CPM' },
  { key: 'cvr', label: 'Conv %' },
];

// Orden estable; el CPL sin conversiones queda siempre al final (no es 0 barato).
function sortMetrics<T>(arr: T[], get: (r: T) => Metrics, key: SortKey, dir: 'asc' | 'desc'): T[] {
  const val = (r: T): number | null => {
    const m = get(r);
    if (key === 'cpl') return m.conversions > 0 ? m.cpl : null;
    return (m[key] as number) ?? 0;
  };
  const dec = arr.map((r, i) => [r, i] as [T, number]);
  dec.sort((A, B) => {
    const va = val(A[0]);
    const vb = val(B[0]);
    if (va == null && vb == null) return A[1] - B[1];
    if (va == null) return 1;
    if (vb == null) return -1;
    const c = va - vb;
    if (c === 0) return A[1] - B[1];
    return dir === 'asc' ? c : -c;
  });
  return dec.map(([r]) => r);
}

type Tab = 'camp' | 'city' | 'ad';

export function TikTokCampaigns() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useTikTok(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const cur = client.currency;

  const [tab, setTab] = useState<Tab>('camp');
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [query, setQuery] = useState('');

  const changeTab = (next: Tab) => {
    setTab(next);
    // Campañas: inversión desc (el motor arriba). Ciudades/Creativos: CPL asc
    // (lo más barato/eficiente primero, que es lo accionable).
    if (next === 'camp') {
      setSortKey('spend');
      setSortDir('desc');
    } else {
      setSortKey('cpl');
      setSortDir('asc');
    }
  };
  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'cpl' ? 'asc' : 'desc');
    }
  };

  if (loading && !data) return <TikTokLoading clientName={client.name} />;
  if (error) return <TikTokError error={error} />;
  if (!data || data.totals.spend === 0)
    return <TikTokEmpty data={data} clientName={client.name} rangeLabel={rangeLabel} />;

  const t = data.totals;
  const target = client.cplTarget;
  const hasTarget = typeof target === 'number' && target > 0;
  const meta = hasTarget ? target! : t.cpl; // sin meta: CPL promedio de la cuenta
  const ratio = meta > 0 ? t.cpl / meta : 0;
  const over = hasTarget && t.cpl > target!;

  return (
    <div className="view on">
      <TikTokHero
        title="TikTok Ads · Resultados por campañas"
        sub={
          <>
            {rangeLabel} · {client.name} · {formatInt(data.campaignCount)} campañas ·{' '}
            {formatInt(data.adgroupCount)} conjuntos · {formatInt(data.adCount)} anuncios
          </>
        }
      />

      {/* ═══ ZONA 1 · RESUMEN + ACCIONES ═══ */}
      <div className="card ttc-z1" style={{ padding: '20px 22px' }}>
        <HeadlineBlock
          data={data}
          cur={cur}
          meta={meta}
          ratio={ratio}
          over={over}
          hasTarget={hasTarget}
          target={hasTarget ? target! : undefined}
        />
        <ActionsPanel ads={data.ads} meta={meta} cur={cur} />
      </div>

      {/* ═══ ZONA 2 · EXPLORADOR CON PESTAÑAS ═══ */}
      <SectionLabel style={{ margin: '24px 0 10px' }}>El desglose · explóralo como quieras</SectionLabel>

      <div style={explorerHeadStyle}>
        <div style={tabsStyle}>
          <TabBtn active={tab === 'camp'} onClick={() => changeTab('camp')}>Campañas</TabBtn>
          <TabBtn active={tab === 'city'} onClick={() => changeTab('city')}>Ciudades</TabBtn>
          <TabBtn active={tab === 'ad'} onClick={() => changeTab('ad')}>Creativos</TabBtn>
        </div>
        <div style={{ position: 'relative', flex: '0 1 240px', minWidth: 170 }}>
          <span style={searchIcon}>⌕</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre…"
            style={searchInput}
            aria-label="Buscar por nombre"
          />
          {query && (
            <button onClick={() => setQuery('')} style={searchClear} title="Limpiar" aria-label="Limpiar búsqueda">×</button>
          )}
        </div>
      </div>

      {tab === 'camp' && (
        <CampaignsTab data={data} meta={meta} cur={cur} sortKey={sortKey} sortDir={sortDir} onSort={onSort} query={query} />
      )}
      {tab === 'city' && (
        <CitiesTab data={data} meta={meta} cur={cur} sortKey={sortKey} sortDir={sortDir} onSort={onSort} query={query} />
      )}
      {tab === 'ad' && (
        <CreativesTab data={data} meta={meta} cur={cur} sortKey={sortKey} sortDir={sortDir} onSort={onSort} query={query} />
      )}

      <SemaforoLegend hasTarget={hasTarget} />

      {/* Nota honesta */}
      <div className="card" style={{ marginTop: 16, borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Todo se deriva del dato real de TikTok. El <b>semáforo</b> y las <b>acciones</b> se calculan
          contra {hasTarget ? <>la meta de CPL acordada (<b>{formatCurrency(meta, cur)}</b>)</> : <>el CPL promedio de la cuenta (<b>{formatCurrency(meta, cur)}</b>) — no hay meta configurada para este cliente</>}. La pestaña <b>Ciudades</b> agrupa los conjuntos de anuncios por su nombre; en TikTok los conjuntos suelen nombrarse por ciudad, pero los de audiencia/retargeting también aparecen aquí. El <b>alcance</b> es la suma del alcance diario (aprox., no usuarios únicos del período).
        </div>
      </div>

      <BackToTop />
    </div>
  );
}

// ── Titular sobrio: CPL vs meta + insight + KPIs con delta ───────────────────
function HeadlineBlock({
  data, cur, meta, ratio, over, hasTarget, target,
}: {
  data: ReturnType<typeof useTikTok>['data'] & {};
  cur: string; meta: number; ratio: number; over: boolean; hasTarget: boolean; target?: number;
}) {
  const t = data!.totals;
  const ranked = data!.campaigns.filter((c) => c.conversions > 0).sort((a, b) => a.cpl - b.cpl);
  const best = ranked[0];
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : undefined;

  return (
    <div className="ttc-head">
      <div>
        <SectionLabel style={{ margin: 0 }}>Resumen del período</SectionLabel>
        <div style={headlineStyle}>
          CPL{' '}
          <span style={{ color: hasTarget ? (over ? BAD : GOOD) : 'var(--t1)' }}>
            {t.conversions > 0 ? formatCurrency(t.cpl, cur) : '—'}
          </span>
          {hasTarget && t.conversions > 0 ? (
            <>
              {' · '}
              {ratio.toFixed(1)}× la meta <span style={{ color: GOOD }}>{formatCurrency(target!, cur)}</span>
            </>
          ) : (
            <>{' · '}<span style={{ color: 'var(--t2)' }}>{formatInt(t.conversions)} leads en el período</span></>
          )}
        </div>
        {best && (
          <div style={headSubStyle}>
            «<b>{best.name}</b>» trae el lead más barato ({formatCurrency(best.cpl, cur)})
            {worst && <> ; «<b>{worst.name}</b>» el más caro ({formatCurrency(worst.cpl, cur)})</>}. La jugada:
            mover presupuesto a lo eficiente, clonar lo que funciona y apagar lo que quema plata.
          </div>
        )}
      </div>
      <div className="ttc-kpis">
        <Kpi label="Inversión" value={formatCurrency(t.spend, cur)} delta={data!.spendDelta} good="neutral" />
        <Kpi label="Leads" value={formatInt(t.conversions)} delta={data!.conversionsDelta} good="up" />
        <Kpi
          label="Costo / conv."
          value={t.conversions > 0 ? formatCurrency(t.cpl, cur) : '—'}
          delta={data!.cplDelta}
          good="down"
          fmtDelta={(v) => formatCurrency(v, cur)}
        />
        <Kpi
          label="CTR"
          value={formatPercent(t.ctr, 2)}
          delta={data!.ctrDelta}
          good="up"
          fmtDelta={(v) => formatPercent(v, 2)}
        />
      </div>
    </div>
  );
}

function Kpi({
  label, value, delta, good, fmtDelta,
}: {
  label: string; value: string; delta: number | null; good: 'up' | 'down' | 'neutral'; fmtDelta?: (v: number) => string;
}) {
  const { text, color } = deltaParts(delta, good, fmtDelta);
  return (
    <div style={kpiStyle}>
      <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--mu)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', marginTop: 3, color: 'var(--t1)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 10, color, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{text}</div>
    </div>
  );
}

// ── UN panel de acciones: Escalar / Reemplazar / Apagar (auto, dato real) ────
function ActionsPanel({ ads, meta, cur }: { ads: TikTokAdRow[]; meta: number; cur: string }) {
  const { escalar, reemplazar, apagar } = useMemo(() => {
    // Piso de materialidad: solo aconsejamos sobre anuncios que gastaron al menos
    // lo que cuesta UN lead en meta. Así "Escalar" no recomienda un fluke de 1
    // lead a $792, sino ganadores con volumen probado.
    const floor = meta > 0 ? meta : 0;
    const spending = ads.filter((a) => a.spend >= floor && a.spend > 0);
    const withConv = spending.filter((a) => a.conversions > 0);
    // Escalar: funcionan bien (≤1,5× meta) y con más leads probados.
    const escalar = withConv
      .filter((a) => a.cpl <= meta * 1.5)
      .sort((a, b) => b.conversions - a.conversions)
      .slice(0, 3);
    // Reemplazar: zona intermedia (2–3× meta) — creativo que se cansa. El que más gasta primero.
    const reemplazar = withConv
      .filter((a) => a.cpl > meta * 2 && a.cpl <= meta * 3)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 3);
    // Apagar: gasta sin convertir, o CPL >3× meta. Prioriza el que más quema plata.
    const apagar = spending
      .filter((a) => a.conversions === 0 || a.cpl > meta * 3)
      .sort((a, b) => {
        const aw = a.conversions === 0 ? 1 : 0;
        const bw = b.conversions === 0 ? 1 : 0;
        if (aw !== bw) return bw - aw;
        return b.spend - a.spend;
      })
      .slice(0, 3);
    return { escalar, reemplazar, apagar };
  }, [ads, meta]);

  return (
    <div className="ttc-acts">
      <ActionCol color={GOOD} title="Escalar" verb="sube presupuesto y clónalo"
        items={escalar} meta={meta} cur={cur} empty="Nada con CPL claramente bajo la meta en este rango." />
      <ActionCol color={WARN} title="Reemplazar" verb="creativo cansado: renuévalo"
        items={reemplazar} meta={meta} cur={cur} empty="Ningún creativo en zona intermedia (2–3× meta)." />
      <ActionCol color={BAD} title="Apagar" verb="quema plata: apágalo"
        items={apagar} meta={meta} cur={cur} empty="Nada que apagar: ningún anuncio gasta en balde." />
    </div>
  );
}

function ActionCol({
  color, title, verb, items, meta, cur, empty,
}: {
  color: string; title: string; verb: string; items: TikTokAdRow[]; meta: number; cur: string; empty: string;
}) {
  return (
    <div className="ttc-acol">
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase', color, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        {title}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--mu)', padding: '6px 0', lineHeight: 1.4 }}>{empty}</div>
      ) : (
        items.map((a, i) => (
          <div key={a.adId} style={{ display: 'flex', gap: 8, padding: '7px 0', borderTop: i === 0 ? 'none' : '1px solid var(--b1)', fontSize: 12, lineHeight: 1.35 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9.5, color: 'var(--mu)' }}>
                {a.adgroupName} · {formatInt(a.conversions)} leads · gancho {a.video.hookRate > 0 ? formatPercent(a.video.hookRate, 0) : '—'}
              </div>
              <div style={{ ...ellipsis, fontWeight: 700 }} title={a.name}>{a.name}</div>
              <div style={{ fontSize: 10, color: 'var(--mu)' }}>{verb}</div>
            </div>
            <div style={{ flexShrink: 0, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", color: cplColor(a.cpl, a.conversions, meta) }}>
              {a.conversions > 0 ? formatCurrency(a.cpl, cur) : 'sin conv.'}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Encabezado de tabla compartido ───────────────────────────────────────────
function HeadRow({
  firstLabel, sortKey, sortDir, onSort,
}: {
  firstLabel: string; sortKey: SortKey; sortDir: 'asc' | 'desc'; onSort: (k: SortKey) => void;
}) {
  return (
    <thead>
      <tr>
        <th data-cat="dim">{firstLabel}</th>
        <th data-cat="dim">Estado</th>
        {COLS.map((c) => (
          <th
            key={c.key}
            className="th-sort"
            data-sort={sortKey === c.key ? sortDir : 'none'}
            role="button"
            tabIndex={0}
            title="Ordenar por esta columna"
            style={{ textAlign: 'right' }}
            onClick={() => onSort(c.key)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(c.key); }
            }}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function EstadoCell({ m, meta }: { m: Metrics; meta: number }) {
  const s = statusOf(m.cpl, m.conversions, m.spend, meta);
  return (
    <td>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--t2)', whiteSpace: 'nowrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
        {s.label}
      </span>
    </td>
  );
}

// Celdas numéricas (con la barra tenue de inversión).
function MetricCells({ m, meta, cur, maxSpend }: { m: Metrics; meta: number; cur: string; maxSpend: number }) {
  const pct = maxSpend > 0 ? Math.min(100, (m.spend / maxSpend) * 100) : 0;
  return (
    <>
      <td className="num" style={{ position: 'relative' }}>
        <span style={{ position: 'relative', zIndex: 1 }}>{formatCurrency(m.spend, cur)}</span>
        {/* Barra fina de magnitud (acento tenue), no un bloque. */}
        <div style={{ position: 'absolute', left: 8, bottom: 3, height: 3, width: `calc((100% - 16px) * ${pct / 100})`, background: 'var(--acc)', opacity: 0.55, borderRadius: 2, zIndex: 0 }} />
      </td>
      <td className="num">{formatInt(m.conversions)}</td>
      <td className="num" style={{ color: cplColor(m.cpl, m.conversions, meta), fontWeight: 700 }}>
        {m.conversions > 0 ? formatCurrency(m.cpl, cur) : '—'}
      </td>
      <td className="num">{m.impressions > 0 ? formatPercent(m.ctr, 2) : '—'}</td>
      <td className="num">{m.hook > 0 ? formatPercent(m.hook, 0) : '—'}</td>
      <td className="num">{m.frequency > 0 ? `${m.frequency.toFixed(2)}×` : '—'}</td>
      <td className="num">{m.cpm > 0 ? formatCurrency(m.cpm, cur) : '—'}</td>
      <td className="num">{m.cvr > 0 ? formatPercent(m.cvr, 1) : '—'}</td>
    </>
  );
}

const ADS_SHOWN = 5;

// ── PESTAÑA CAMPAÑAS: drill-down campaña → conjunto → anuncio ────────────────
function CampaignsTab({
  data, meta, cur, sortKey, sortDir, onSort, query,
}: {
  data: NonNullable<ReturnType<typeof useTikTok>['data']>; meta: number; cur: string;
  sortKey: SortKey; sortDir: 'asc' | 'desc'; onSort: (k: SortKey) => void; query: string;
}) {
  const [openCamps, setOpenCamps] = useState<Set<string>>(new Set());
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [moreGroups, setMoreGroups] = useState<Set<string>>(new Set());

  const adgroupsByCampaign = useMemo(() => {
    const m = new Map<string, TikTokAdGroupRow[]>();
    for (const g of data.adgroups) (m.get(g.campaignName) ?? m.set(g.campaignName, []).get(g.campaignName)!).push(g);
    return m;
  }, [data]);
  const adsByGroup = useMemo(() => {
    const m = new Map<string, TikTokAdRow[]>();
    for (const a of data.ads) {
      const k = a.campaignName + '||' + a.adgroupId;
      (m.get(k) ?? m.set(k, []).get(k)!).push(a);
    }
    return m;
  }, [data]);

  const q = query.trim().toLowerCase();
  const campaigns = useMemo(() => {
    const base = q ? data.campaigns.filter((c) => c.name.toLowerCase().includes(q)) : data.campaigns;
    return sortMetrics(base, toMetrics, sortKey, sortDir);
  }, [data, q, sortKey, sortDir]);

  const maxSpend = Math.max(1, ...data.campaigns.map((c) => c.spend));

  const toggleCamp = (n: string) => setOpenCamps((p) => { const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s; });
  const toggleGroup = (id: string) => setOpenGroups((p) => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const expandAll = () => {
    setOpenCamps(new Set(campaigns.map((c) => c.name)));
    setOpenGroups(new Set(data.adgroups.map((g) => g.campaignName + '||' + g.adgroupId)));
  };
  const collapseAll = () => { setOpenCamps(new Set()); setOpenGroups(new Set()); };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, margin: '0 0 8px' }}>
        <button onClick={expandAll} style={toolBtn}>Expandir todo</button>
        <button onClick={collapseAll} style={toolBtn}>Colapsar</button>
      </div>
      <div style={tblWrap}>
        <table className="t" style={{ minWidth: 1020 }}>
          <HeadRow firstLabel="Campaña · conjunto · anuncio" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          <tbody>
            {campaigns.length === 0 && (
              <tr><td colSpan={10} style={{ color: 'var(--mu)', textAlign: 'center', padding: 20 }}>Ninguna campaña coincide con «{query}».</td></tr>
            )}
            {campaigns.map((c) => {
              const cOpen = openCamps.has(c.name);
              const groups = sortMetrics(adgroupsByCampaign.get(c.name) ?? [], toMetrics, sortKey, sortDir);
              const share = data.totals.spend > 0 ? c.spend / data.totals.spend : 0;
              return (
                <FragmentRows key={c.name}>
                  {/* Nivel 1 · Campaña */}
                  <tr onClick={() => toggleCamp(c.name)} style={{ cursor: 'pointer' }}>
                    <td data-cat="dim">
                      <div style={nameCell}>
                        <span style={{ ...statusDot(statusOf(c.cpl, c.conversions, c.spend, meta).dot) }} />
                        <span style={{ ...togStyle, transform: cOpen ? 'rotate(90deg)' : 'none' }}>▸</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ ...ellipsis, fontWeight: 700, maxWidth: 340 }} title={c.name}>{c.name}</div>
                          <div style={subStyle}>{groups.length} conjuntos · {formatPercent(share, 1)} de la inversión</div>
                        </div>
                      </div>
                    </td>
                    <EstadoCell m={toMetrics(c)} meta={meta} />
                    <MetricCells m={toMetrics(c)} meta={meta} cur={cur} maxSpend={maxSpend} />
                  </tr>

                  {/* Nivel 2 · Conjuntos */}
                  {cOpen && groups.map((g) => {
                    const gid = c.name + '||' + g.adgroupId;
                    const gOpen = openGroups.has(gid);
                    const ads = sortMetrics(adsByGroup.get(gid) ?? [], toMetrics, sortKey, sortDir);
                    const showAll = moreGroups.has(gid);
                    const shown = showAll ? ads : ads.slice(0, ADS_SHOWN);
                    return (
                      <FragmentRows key={gid}>
                        <tr onClick={() => toggleGroup(gid)} style={{ cursor: 'pointer' }}>
                          <td data-cat="dim">
                            <div style={{ ...nameCell, paddingLeft: 22 }}>
                              <span style={{ ...statusDot(statusOf(g.cpl, g.conversions, g.spend, meta).dot) }} />
                              <span style={{ ...togStyle, transform: gOpen ? 'rotate(90deg)' : 'none' }}>▸</span>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ ...ellipsis, fontWeight: 600, maxWidth: 320 }} title={g.name}>{g.name}</div>
                                <div style={subStyle}>{ads.length} anuncios · {formatPercent(c.spend > 0 ? g.spend / c.spend : 0, 0)} de la campaña</div>
                              </div>
                            </div>
                          </td>
                          <EstadoCell m={toMetrics(g)} meta={meta} />
                          <MetricCells m={toMetrics(g)} meta={meta} cur={cur} maxSpend={maxSpend} />
                        </tr>

                        {/* Nivel 3 · Anuncios (top 5 + ver más) */}
                        {gOpen && shown.map((a) => (
                          <tr key={a.adId}>
                            <td data-cat="dim">
                              <div style={{ ...nameCell, paddingLeft: 44 }}>
                                <span style={{ ...statusDot(statusOf(a.cpl, a.conversions, a.spend, meta).dot) }} />
                                <CreativeThumb name={a.name} coverUrl={a.coverUrl} videoUrl={a.videoUrl} />
                                <span style={{ ...ellipsis, maxWidth: 260 }} title={a.name}>{a.name}</span>
                              </div>
                            </td>
                            <EstadoCell m={toMetrics(a)} meta={meta} />
                            <MetricCells m={toMetrics(a)} meta={meta} cur={cur} maxSpend={maxSpend} />
                          </tr>
                        ))}
                        {gOpen && ads.length > ADS_SHOWN && !showAll && (
                          <tr onClick={() => setMoreGroups((p) => new Set(p).add(gid))} style={{ cursor: 'pointer' }}>
                            <td colSpan={10} style={{ paddingLeft: 44, color: 'var(--acc)', fontWeight: 600, fontSize: 11.5 }}>
                              ▾ Ver {ads.length - ADS_SHOWN} anuncios más
                            </td>
                          </tr>
                        )}
                      </FragmentRows>
                    );
                  })}
                </FragmentRows>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── PESTAÑA CIUDADES: agrega conjuntos por nombre (ciudad) ───────────────────
interface CityRow extends Metrics { name: string; campaigns: number; }

function CitiesTab({
  data, meta, cur, sortKey, sortDir, onSort, query,
}: {
  data: NonNullable<ReturnType<typeof useTikTok>['data']>; meta: number; cur: string;
  sortKey: SortKey; sortDir: 'asc' | 'desc'; onSort: (k: SortKey) => void; query: string;
}) {
  const cities = useMemo<CityRow[]>(() => {
    interface Agg { spend: number; conv: number; clicks: number; impr: number; reach: number; views: number; w2s: number; camps: Set<string>; }
    const m = new Map<string, Agg>();
    for (const g of data.adgroups) {
      const key = g.name;
      let a = m.get(key);
      if (!a) { a = { spend: 0, conv: 0, clicks: 0, impr: 0, reach: 0, views: 0, w2s: 0, camps: new Set() }; m.set(key, a); }
      a.spend += g.spend; a.conv += g.conversions; a.clicks += g.clicks;
      a.impr += g.impressions; a.reach += g.reach;
      a.views += g.video?.views ?? 0; a.w2s += g.video?.watched2s ?? 0;
      a.camps.add(g.campaignName);
    }
    return Array.from(m.entries()).map(([name, a]) => ({
      name,
      spend: a.spend,
      conversions: a.conv,
      cpl: a.conv > 0 ? a.spend / a.conv : 0,
      ctr: a.impr > 0 ? a.clicks / a.impr : 0,
      impressions: a.impr,
      reach: a.reach,
      frequency: a.reach > 0 ? a.impr / a.reach : 0,
      cpm: a.impr > 0 ? a.spend / (a.impr / 1000) : 0,
      cvr: a.clicks > 0 ? a.conv / a.clicks : 0,
      hook: a.views > 0 ? a.w2s / a.views : 0,
      campaigns: a.camps.size,
    }));
  }, [data]);

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const base = q ? cities.filter((c) => c.name.toLowerCase().includes(q)) : cities;
    return sortMetrics(base, (r) => r, sortKey, sortDir);
  }, [cities, q, sortKey, sortDir]);
  const maxSpend = Math.max(1, ...cities.map((c) => c.spend));

  return (
    <div style={tblWrap}>
      <table className="t" style={{ minWidth: 1020 }}>
        <HeadRow firstLabel="Ciudad / conjunto" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={10} style={{ color: 'var(--mu)', textAlign: 'center', padding: 20 }}>Nada coincide con «{query}».</td></tr>
          )}
          {rows.map((c) => (
            <tr key={c.name}>
              <td data-cat="dim">
                <div style={nameCell}>
                  <span style={{ ...statusDot(statusOf(c.cpl, c.conversions, c.spend, meta).dot) }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ ...ellipsis, fontWeight: 600, maxWidth: 320 }} title={c.name}>{c.name}</div>
                    <div style={subStyle}>{c.campaigns > 1 ? `en ${c.campaigns} campañas` : '1 campaña'}</div>
                  </div>
                </div>
              </td>
              <EstadoCell m={c} meta={meta} />
              <MetricCells m={c} meta={meta} cur={cur} maxSpend={maxSpend} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── PESTAÑA CREATIVOS: todos los anuncios en plano ───────────────────────────
function CreativesTab({
  data, meta, cur, sortKey, sortDir, onSort, query,
}: {
  data: NonNullable<ReturnType<typeof useTikTok>['data']>; meta: number; cur: string;
  sortKey: SortKey; sortDir: 'asc' | 'desc'; onSort: (k: SortKey) => void; query: string;
}) {
  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const base = q ? data.ads.filter((a) => a.name.toLowerCase().includes(q) || a.campaignName.toLowerCase().includes(q) || a.adgroupName.toLowerCase().includes(q)) : data.ads;
    return sortMetrics(base, toMetrics, sortKey, sortDir);
  }, [data, q, sortKey, sortDir]);
  const maxSpend = Math.max(1, ...data.ads.map((a) => a.spend));

  return (
    <div style={tblWrap}>
      <table className="t" style={{ minWidth: 1020 }}>
        <HeadRow firstLabel="Anuncio · campaña · conjunto" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={10} style={{ color: 'var(--mu)', textAlign: 'center', padding: 20 }}>Nada coincide con «{query}».</td></tr>
          )}
          {rows.map((a) => (
            <tr key={a.adId}>
              <td data-cat="dim">
                <div style={nameCell}>
                  <span style={{ ...statusDot(statusOf(a.cpl, a.conversions, a.spend, meta).dot) }} />
                  <CreativeThumb name={a.name} coverUrl={a.coverUrl} videoUrl={a.videoUrl} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ ...ellipsis, maxWidth: 280 }} title={a.name}>{a.name}</div>
                    <div style={subStyle}>{a.campaignName} · {a.adgroupName}</div>
                  </div>
                </div>
              </td>
              <EstadoCell m={toMetrics(a)} meta={meta} />
              <MetricCells m={toMetrics(a)} meta={meta} cur={cur} maxSpend={maxSpend} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SemaforoLegend({ hasTarget }: { hasTarget: boolean }) {
  return (
    <div style={{ fontSize: 11, color: 'var(--mu)', margin: '10px 2px 0', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
      <span>Semáforo (CPL vs {hasTarget ? 'meta' : 'CPL promedio'}):</span>
      <span><Dot c={GOOD} /> ≤ 2× · va bien</span>
      <span><Dot c={WARN} /> 2–3× · vigilar</span>
      <span><Dot c={BAD} /> &gt; 3× · revisar / apagar</span>
      <span>· clic en una columna para ordenar · ▸ para desplegar</span>
    </div>
  );
}
function Dot({ c }: { c: string }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: c, verticalAlign: 1 }} />;
}

// Envoltura para devolver varias <tr> sin romper el <tbody>.
function FragmentRows({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', border: 'none',
        background: active ? 'var(--bg1)' : 'transparent',
        color: active ? 'var(--t1)' : 'var(--t2)',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
      }}
    >
      {children}
    </button>
  );
}

// ── estilos ──────────────────────────────────────────────────────────────────
const headlineStyle: React.CSSProperties = { fontSize: 'clamp(19px,2.3vw,25px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.18, marginTop: 4 };
const headSubStyle: React.CSSProperties = { fontSize: 13, color: 'var(--t2)', marginTop: 10, lineHeight: 1.5 };
const kpiStyle: React.CSSProperties = { padding: '10px 12px', borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--b1)' };
const explorerHeadStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 11 };
const tabsStyle: React.CSSProperties = { display: 'inline-flex', background: 'var(--bg3)', border: '1px solid var(--b1)', borderRadius: 10, padding: 3, gap: 2 };
const tblWrap: React.CSSProperties = { overflowX: 'auto', border: '1px solid var(--b1)', borderRadius: 12, background: 'var(--bg1)' };
const nameCell: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 };
const subStyle: React.CSSProperties = { fontSize: 9.5, color: 'var(--mu)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 };
const togStyle: React.CSSProperties = { flexShrink: 0, width: 12, fontSize: 9, color: 'var(--mu)', transition: 'transform .15s', display: 'inline-block' };
const ellipsis: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const toolBtn: React.CSSProperties = { fontSize: 11, padding: '6px 11px', borderRadius: 7, border: '1px solid var(--b2)', background: 'transparent', color: 'var(--t2)', cursor: 'pointer', whiteSpace: 'nowrap' };
const searchInput: React.CSSProperties = { width: '100%', fontSize: 12, color: 'var(--t1)', background: 'var(--bg1)', border: '1px solid var(--b1)', borderRadius: 9, padding: '7px 26px 7px 26px', outline: 'none' };
const searchIcon: React.CSSProperties = { position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--mu)', pointerEvents: 'none' };
const searchClear: React.CSSProperties = { position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, lineHeight: '16px', textAlign: 'center', fontSize: 14, color: 'var(--mu)', background: 'transparent', border: 'none', cursor: 'pointer' };

function statusDot(color: string): React.CSSProperties {
  return { flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' };
}
