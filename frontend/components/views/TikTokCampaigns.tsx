'use client';

import { useId, useMemo, useState } from 'react';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import {
  useTikTok,
  type TikTokCampaignRow,
  type TikTokAdGroupRow,
  type TikTokAdRow,
  type TikTokDailyPoint,
} from '@/lib/hooks/useTikTok';
import { formatCurrency, formatInt, formatNumber, formatPercent } from '@/lib/utils';
import { PieChart, type PieSlice } from '@/components/ui/PieChart';
import { useSortableTable, type SortAccessor } from '@/components/ui/useSortableTable';
import {
  TikTokLoading,
  TikTokError,
  TikTokEmpty,
  TikTokHero,
  CreativeThumb,
  TT_PINK,
  TT_CYAN,
} from './tiktokShared';

// ============================================================
// TikTok Ads · RESULTADOS POR CAMPAÑAS  (rediseño "agencia top level")
// ============================================================
// Por cada campaña (acordeón), al abrir mostramos:
//   1. 8 KPIs con línea de tendencia diaria real (inversión, conversiones,
//      costo/conv, impresiones, alcance, frecuencia, CTR, CPM).
//   2. Distribución por CONJUNTO de anuncios (donas: gasto/conv/impresiones).
//      → TikTok no entrega desglose por ciudad en el reporte actual, así que
//        usamos el corte real que sí existe; "por ciudad" queda para cuando se
//        conecte el reporte de audiencia/geo en el ETL.
//   3. Tabla con la visual del anuncio + métricas relevantes.
// Todo es dato real; si una pieza no tiene datos, se dice honestamente.
// ============================================================

// Configuración de las 8 métricas con tendencia. `good` indica qué dirección
// del cambio es buena (para colorear el delta sin engañar).
type MetricKey =
  | 'spend'
  | 'conversions'
  | 'cpl'
  | 'impressions'
  | 'reach'
  | 'frequency'
  | 'ctr'
  | 'cpm';

interface MetricCfg {
  key: MetricKey;
  label: string;
  color: string;
  good: 'up' | 'down' | 'neutral';
  pick: (p: TikTokDailyPoint) => number;
  fmt: (v: number, cur: string) => string;
}

const METRICS: MetricCfg[] = [
  { key: 'spend', label: 'Inversión', color: TT_PINK, good: 'neutral',
    pick: (p) => p.spend, fmt: (v, c) => formatCurrency(v, c) },
  { key: 'conversions', label: 'Conversiones', color: '#4ade80', good: 'up',
    pick: (p) => p.conversions, fmt: (v) => formatInt(v) },
  { key: 'cpl', label: 'Costo / conv.', color: '#fb923c', good: 'down',
    pick: (p) => p.cpl, fmt: (v, c) => (v > 0 ? formatCurrency(v, c) : '—') },
  { key: 'impressions', label: 'Impresiones', color: TT_CYAN, good: 'up',
    pick: (p) => p.impressions, fmt: (v) => formatNumber(v) },
  { key: 'reach', label: 'Alcance', color: '#22d3ee', good: 'up',
    pick: (p) => p.reach, fmt: (v) => formatNumber(v) },
  { key: 'frequency', label: 'Frecuencia', color: '#a78bfa', good: 'neutral',
    pick: (p) => p.frequency, fmt: (v) => (v > 0 ? `${v.toFixed(2)}×` : '—') },
  { key: 'ctr', label: 'CTR', color: '#facc15', good: 'up',
    pick: (p) => p.ctr, fmt: (v) => formatPercent(v, 2) },
  { key: 'cpm', label: 'CPM', color: '#ec4899', good: 'down',
    pick: (p) => p.cpm, fmt: (v, c) => (v > 0 ? formatCurrency(v, c) : '—') },
];

export function TikTokCampaigns() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useTikTok(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const cur = client.currency;

  // Conjuntos y anuncios agrupados por campaña.
  const adgroupsByCampaign = useMemo(() => {
    const m = new Map<string, TikTokAdGroupRow[]>();
    for (const g of data?.adgroups ?? []) {
      const arr = m.get(g.campaignName) ?? [];
      arr.push(g);
      m.set(g.campaignName, arr);
    }
    return m;
  }, [data]);

  const adsByCampaign = useMemo(() => {
    const m = new Map<string, TikTokAdRow[]>();
    for (const a of data?.ads ?? []) {
      const arr = m.get(a.campaignName) ?? [];
      arr.push(a);
      m.set(a.campaignName, arr);
    }
    return m;
  }, [data]);

  // Primera campaña abierta por defecto (mejor primera impresión).
  const firstName = data?.campaigns[0]?.name;
  const [openCampaigns, setOpenCampaigns] = useState<Set<string>>(new Set());
  const openSet = openCampaigns.size === 0 && firstName ? new Set([firstName]) : openCampaigns;

  const toggle = (key: string) => {
    const base = openCampaigns.size === 0 && firstName ? new Set([firstName]) : openCampaigns;
    const next = new Set(base);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpenCampaigns(next);
  };

  if (loading && !data) return <TikTokLoading clientName={client.name} />;
  if (error) return <TikTokError error={error} />;
  if (!data || data.totals.spend === 0)
    return <TikTokEmpty data={data} clientName={client.name} rangeLabel={rangeLabel} />;

  const t = data.totals;

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

      <div style={{ fontSize: 12, color: 'var(--mu)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Haz clic en una <b>campaña</b> para desplegar sus <b>KPIs con tendencia diaria</b>, la{' '}
        <b>distribución por conjunto</b> y la <b>tabla de anuncios</b> con su creativo. Todo es dato
        real del rango seleccionado.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {data.campaigns.map((c: TikTokCampaignRow) => {
          const open = openSet.has(c.name);
          const groups = adgroupsByCampaign.get(c.name) ?? [];
          const ads = adsByCampaign.get(c.name) ?? [];
          const share = t.spend > 0 ? c.spend / t.spend : 0;
          return (
            <div key={c.name} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Encabezado de campaña */}
              <button onClick={() => toggle(c.name)} style={headerBtnStyle}>
                <span style={{ fontSize: 12, color: 'var(--mu)', width: 14, flexShrink: 0 }}>
                  {open ? '▾' : '▸'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={ellipsis}>
                    <b>{c.name}</b>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--mu)' }}>
                    {groups.length} conjuntos · {ads.length} anuncios · {formatPercent(share, 1)} de la
                    inversión
                  </div>
                </div>
                <HeaderMetrics cur={cur} spend={c.spend} conversions={c.conversions} cpl={c.cpl} ctr={c.ctr} />
              </button>

              {open && (
                <div style={{ borderTop: '1px solid var(--b2)', background: 'var(--bg2)', padding: 16 }}>
                  {/* 1 · KPIs con tendencia */}
                  <SectionLabel>Tendencia diaria · {c.daily.length} días con actividad</SectionLabel>
                  <div style={kpiGridStyle}>
                    {METRICS.map((m) => (
                      <TrendKpi key={m.key} cfg={m} c={c} cur={cur} />
                    ))}
                  </div>

                  {/* 2 · Distribución por conjunto de anuncios */}
                  <SectionLabel style={{ marginTop: 22 }}>
                    Distribución por conjunto de anuncios
                  </SectionLabel>
                  <div style={{ fontSize: 11, color: 'var(--mu)', margin: '0 0 10px', lineHeight: 1.5 }}>
                    TikTok no entrega el desglose por ciudad en el reporte actual, así que mostramos el
                    corte real que sí existe: por <b>conjunto de anuncios</b>.
                  </div>
                  <div style={donutGridStyle}>
                    <PieChart title="Gasto por conjunto" slices={slicesOf(groups, 'spend')}
                      formatValue={(v) => formatCurrency(v, cur)} />
                    <PieChart title="Conversiones por conjunto" slices={slicesOf(groups, 'conversions')}
                      formatValue={(v) => formatInt(v)} />
                    <PieChart title="Impresiones por conjunto" slices={slicesOf(groups, 'impressions')}
                      formatValue={(v) => formatNumber(v)} />
                  </div>

                  {/* 3 · Tabla de anuncios con su visual */}
                  <SectionLabel style={{ marginTop: 22 }}>Anuncios de la campaña</SectionLabel>
                  <AdsTable ads={ads} cur={cur} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Nota honesta */}
      <div className="card" style={{ marginTop: 20, borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Las <b>líneas de tendencia</b> son la serie diaria real de cada campaña; cada métrica
          derivada (costo/conv., CTR, CPM, frecuencia) se recalcula sobre los acumulados de cada día.
          El <b>alcance</b> es la suma del alcance diario reportado por TikTok, así que es una
          aproximación, no usuarios únicos del período. El desglose <b>por ciudad</b> de la imagen de
          referencia requiere conectar el reporte de audiencia/geo de TikTok en la sincronización;
          mientras tanto mostramos la distribución real por conjunto de anuncios.
        </div>
      </div>
    </div>
  );
}

// ── Tabla de anuncios: filtro por conjunto + orden por columna + paginación ──
const ADS_PER_PAGE = 10;

function AdsTable({ ads, cur }: { ads: TikTokAdRow[]; cur: string }) {
  // Conjuntos (grupos de anuncios) presentes en esta campaña.
  const conjuntos = useMemo(
    () => Array.from(new Set(ads.map((a) => a.adgroupName))).sort((a, b) => a.localeCompare(b, 'es')),
    [ads],
  );
  // Set vacío = "todos". Si el usuario elige conjuntos, filtramos por ellos.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const isAll = selected.size === 0;

  const filtered = useMemo(
    () => (isAll ? ads : ads.filter((a) => selected.has(a.adgroupName))),
    [ads, selected, isAll],
  );

  // Accesores paralelos a las columnas (null = no ordenable).
  const accessors: SortAccessor<TikTokAdRow>[] = [
    (a) => a.name,         // 0 Anuncio
    (a) => a.adgroupName,  // 1 Conjunto
    (a) => a.spend,        // 2 Inversión
    (a) => a.conversions,  // 3 Conv.
    (a) => a.cpl,          // 4 Costo/conv.
    (a) => a.ctr,          // 5 CTR
    (a) => a.reach,        // 6 Alcance
    (a) => a.impressions,  // 7 Impr.
    (a) => a.frequency,    // 8 Frec.
    (a) => a.cpm,          // 9 CPM
    (a) => a.cvr,          // 10 Conv. rate
  ];
  const { rows, headerProps } = useSortableTable(filtered, accessors, { col: 2, dir: 'desc' });

  const pageCount = Math.max(1, Math.ceil(rows.length / ADS_PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * ADS_PER_PAGE;
  const pageRows = rows.slice(start, start + ADS_PER_PAGE);

  const toggleConjunto = (name: string) => {
    setPage(1);
    setSelected((prev) => {
      const next = new Set(prev);
      if (prev.size === 0) {
        // Estábamos en "todos" → empezar a filtrar por el que se eligió.
        next.add(name);
        return next;
      }
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const selectAll = () => {
    setPage(1);
    setSelected(new Set());
  };

  return (
    <>
      {/* Filtro de conjuntos (solo si hay más de uno) */}
      {conjuntos.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, margin: '0 0 12px' }}>
          <span style={{ fontSize: 11, color: 'var(--mu)', marginRight: 2 }}>Conjuntos:</span>
          <button onClick={selectAll} style={chipStyle(isAll)}>Todos</button>
          {conjuntos.map((name) => (
            <button key={name} onClick={() => toggleConjunto(name)} style={chipStyle(!isAll && selected.has(name))}>
              {name}
            </button>
          ))}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="t" style={{ minWidth: 960 }}>
          <thead>
            <tr>
              <th {...headerProps(0)} data-cat="dim">Anuncio</th>
              <th {...headerProps(1)} data-cat="dim">Conjunto</th>
              <th {...headerProps(2)} data-cat="cost">Inversión</th>
              <th {...headerProps(3)} data-cat="conv">Conv.</th>
              <th {...headerProps(4)} data-cat="cost,conv">Costo/conv.</th>
              <th {...headerProps(5)} data-cat="impr">CTR</th>
              <th {...headerProps(6)} data-cat="impr">Alcance</th>
              <th {...headerProps(7)} data-cat="impr">Impr.</th>
              <th {...headerProps(8)} data-cat="impr">Frec.</th>
              <th {...headerProps(9)} data-cat="impr">CPM</th>
              <th {...headerProps(10)} data-cat="conv">Conv. rate</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((a) => (
              <tr key={a.adId}>
                <td data-cat="dim">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CreativeThumb name={a.name} coverUrl={a.coverUrl} videoUrl={a.videoUrl} />
                    <span style={{ ...ellipsis, maxWidth: 220 }}>{a.name}</span>
                  </div>
                </td>
                <td data-cat="dim">
                  <span style={{ ...ellipsis, maxWidth: 150, display: 'inline-block', color: 'var(--mu)' }}>
                    {a.adgroupName}
                  </span>
                </td>
                <td data-cat="cost">{formatCurrency(a.spend, cur)}</td>
                <td data-cat="conv">{formatInt(a.conversions)}</td>
                <td data-cat="cost,conv">{a.conversions > 0 ? formatCurrency(a.cpl, cur) : '—'}</td>
                <td data-cat="impr">{formatPercent(a.ctr, 2)}</td>
                <td data-cat="impr">{formatNumber(a.reach)}</td>
                <td data-cat="impr">{formatNumber(a.impressions)}</td>
                <td data-cat="impr">{a.frequency > 0 ? `${a.frequency.toFixed(2)}×` : '—'}</td>
                <td data-cat="impr">{a.cpm > 0 ? formatCurrency(a.cpm, cur) : '—'}</td>
                <td data-cat="conv">{formatPercent(a.cvr, 1)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td data-cat="dim" colSpan={11} style={{ color: 'var(--mu)' }}>
                  Sin anuncios con actividad en este rango{isAll ? '' : ' para los conjuntos elegidos'}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {rows.length > ADS_PER_PAGE && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--mu)' }}>
            {start + 1}–{Math.min(start + ADS_PER_PAGE, rows.length)} de {rows.length} anuncios
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setPage(safePage - 1)} disabled={safePage <= 1} style={pagerBtnStyle(safePage <= 1)}>
              ‹ Anterior
            </button>
            <span style={{ fontSize: 11, color: 'var(--t2)', minWidth: 70, textAlign: 'center' }}>
              Página {safePage} / {pageCount}
            </span>
            <button onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount} style={pagerBtnStyle(safePage >= pageCount)}>
              Siguiente ›
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    padding: '4px 10px',
    borderRadius: 999,
    cursor: 'pointer',
    border: `1px solid ${active ? TT_PINK : 'var(--b2)'}`,
    background: active ? 'rgba(238,29,82,0.14)' : 'transparent',
    color: active ? '#fff' : 'var(--mu)',
    whiteSpace: 'nowrap',
    transition: 'all .12s',
  };
}

function pagerBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    padding: '5px 11px',
    borderRadius: 7,
    border: '1px solid var(--b2)',
    background: 'transparent',
    color: disabled ? 'var(--b2)' : 'var(--t2)',
    cursor: disabled ? 'default' : 'pointer',
  };
}

// ── KPI con tendencia: número grande + delta vs período anterior + sparkline ──
function TrendKpi({ cfg, c, cur }: { cfg: MetricCfg; c: TikTokCampaignRow; cur: string }) {
  const series = c.daily.map(cfg.pick);
  // Valor del período = agregado de la campaña (no la suma de las derivadas).
  const value = c[cfg.key];
  const prev = c.prev ? c.prev[cfg.key] : null;
  const delta = prev != null && prev > 0 ? (value - prev) / prev : null;

  let dir: 'up' | 'down' | 'flat' = 'flat';
  if (delta != null) dir = delta > 0.0005 ? 'up' : delta < -0.0005 ? 'down' : 'flat';
  // ¿El cambio es bueno? Depende de la métrica.
  const goodTone =
    cfg.good === 'neutral' || dir === 'flat'
      ? 'neutral'
      : (dir === cfg.good ? 'good' : 'bad');
  const deltaColor = goodTone === 'good' ? '#4ade80' : goodTone === 'bad' ? '#f87171' : 'var(--mu)';

  return (
    <div
      style={{
        background: 'var(--bg3)',
        border: '1px solid var(--b2)',
        borderRadius: 10,
        padding: '11px 12px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {cfg.label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>
        {cfg.fmt(value, cur)}
      </div>
      <div style={{ fontSize: 10, color: deltaColor, height: 13, fontVariantNumeric: 'tabular-nums' }}>
        {delta != null
          ? `${dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'} ${formatPercent(Math.abs(delta), 1)} vs. anterior`
          : 'sin período anterior'}
      </div>
      <Sparkline points={series} color={cfg.color} />
    </div>
  );
}

// Sparkline ligera (área + línea + último punto). Baseline en 0 = honesto.
function Sparkline({ points, color }: { points: number[]; color: string }) {
  const uid = useId().replace(/:/g, '');
  const W = 168;
  const H = 34;
  const PAD = 3;
  const n = points.length;

  if (n < 2) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', fontSize: 9, color: 'var(--mu)' }}>
        ≥2 días para ver tendencia
      </div>
    );
  }

  const max = Math.max(...points, 0.0001);
  const xAt = (i: number) => PAD + ((W - 2 * PAD) * i) / (n - 1);
  const yAt = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);
  const coords = points.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const line = coords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} ${coords[n - 1].x.toFixed(1)},${H - PAD} ${coords[0].x.toFixed(1)},${H - PAD}`;
  const last = coords[n - 1];

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ marginTop: 3, display: 'block' }}>
      <defs>
        <linearGradient id={`sg-${uid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#sg-${uid})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last.x} cy={last.y} r="2.1" fill={color} />
    </svg>
  );
}

// Tajadas de dona a partir de los conjuntos de una campaña.
function slicesOf(groups: TikTokAdGroupRow[], key: 'spend' | 'conversions' | 'impressions'): PieSlice[] {
  return groups.map((g) => ({ label: g.name, value: g[key] }));
}

function HeaderMetrics({ cur, spend, conversions, cpl, ctr }: {
  cur: string; spend: number; conversions: number; cpl: number; ctr: number;
}) {
  return (
    <div style={{ display: 'flex', gap: 18, flexShrink: 0 }}>
      <Metric label="Inversión" value={formatCurrency(spend, cur)} />
      <Metric label="Conv." value={formatInt(conversions)} />
      <Metric label="Costo/conv." value={conversions > 0 ? formatCurrency(cpl, cur) : '—'} />
      <Metric label="CTR" value={formatPercent(ctr, 2)} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'right', minWidth: 64 }}>
      <div style={{ fontSize: 10, color: 'var(--mu)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--t1)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        margin: '0 0 10px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const kpiGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: 10,
};

const donutGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 12,
};

const headerBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '12px 16px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  color: 'var(--t1)',
};

const ellipsis: React.CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
