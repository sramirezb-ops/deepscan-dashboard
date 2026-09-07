'use client';

import { useState } from 'react';
import { HeroHead } from '@/components/ui/BrandLogo';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useGoogleAds } from '@/lib/hooks/useGoogleAds';
import { useGadsAssets, type VideoAsset, type TextAsset, type ImageAsset } from '@/lib/hooks/useGadsAssets';
import { useGadsPmaxChannels, type PmaxChannel } from '@/lib/hooks/useGadsPmaxChannels';
import { useGadsAssetGroups } from '@/lib/hooks/useGadsAssetGroups';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChartWithTooltip, type ChartDataPoint } from '@/components/ui/ChartWithTooltip';
import { getMeasurementGaps, gapsInRange, isInGap } from '@/lib/measurementGaps';

// Colores de red (mismos que GadsPmaxChannels) y del leaderboard.
const CH_C: Record<PmaxChannel, string> = { video: '#ef4444', display: '#3b82f6', search: '#22d97a', shop: '#f59e0b' };
const CH_LABEL: Record<PmaxChannel, string> = { video: 'Video', display: 'Display', search: 'Search*', shop: 'Shopping' };
const CH_ORDER: PmaxChannel[] = ['video', 'search', 'display', 'shop'];
const ANGLE = /gasolin|ahorr|\bluz\b|el[eé]ctric|electr/i; // ángulo ganador: gasolina/ahorro

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fmtCOP(v: number): string {
  if (v == null || isNaN(v)) return '—';
  return `$ ${Math.round(v).toLocaleString('es-CO')}`;
}
function fmtInt(v: number): string {
  if (v == null || isNaN(v)) return '—';
  return Math.round(v).toLocaleString('es-CO');
}
function fmtM(v: number): string {
  if (v == null || isNaN(v)) return '—';
  return `$ ${(v / 1_000_000).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M`;
}
function fmtPct1(ratio: number): string {
  if (ratio == null || isNaN(ratio)) return '—';
  return `${(ratio * 100).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
function dayLabel(iso: string): string {
  const p = iso.split('-');
  if (p.length < 3) return iso;
  return `${parseInt(p[2], 10)} ${MONTHS_ES[parseInt(p[1], 10) - 1] ?? ''}`;
}

// ── Item unificado del leaderboard ──
interface LbItem {
  id: string;
  title: string;
  thumbKind?: 'video' | 'img';
  thumbSrc?: string;
  impressions: number;
  clicks: number;
  conversions: number;
  groups: number;
  angle: boolean;
}
type LbTab = 'video' | 'head' | 'desc' | 'img';
type LbSort = 'leads' | 'conv' | 'ctr';

const PAGE_SIZE = 6;

const SORTERS: Record<LbSort, { get: (i: LbItem) => number; fmt: (v: number) => string; k: string }> = {
  leads: { get: (i) => i.conversions, fmt: (v) => fmtInt(v), k: 'leads' },
  conv: { get: (i) => (i.clicks > 0 ? i.conversions / i.clicks : 0), fmt: (v) => fmtPct1(v), k: 'tasa conv' },
  ctr: { get: (i) => (i.impressions > 0 ? i.clicks / i.impressions : 0), fmt: (v) => fmtPct1(v), k: 'CTR' },
};

// ============================================================
// Leaderboard de creativos — el protagonista de la vista
// ============================================================
function CreativeLeaderboard({
  videos,
  headlines,
  descriptions,
  images,
  counts,
}: {
  videos: LbItem[];
  headlines: LbItem[];
  descriptions: LbItem[];
  images: LbItem[];
  counts: { videos: number; texts: number; images: number };
}) {
  const [tab, setTab] = useState<LbTab>('video');
  const [sort, setSort] = useState<LbSort>('leads');
  const [page, setPage] = useState(0);
  const [tip, setTip] = useState<{ x: number; y: number; it: LbItem } | null>(null);

  const LISTS: Record<LbTab, LbItem[]> = { video: videos, head: headlines, desc: descriptions, img: images };
  const TABS: { k: LbTab; label: string }[] = [
    { k: 'video', label: '🎬 Videos' },
    { k: 'head', label: '✍️ Titulares' },
    { k: 'desc', label: '📝 Descripciones' },
    { k: 'img', label: '🖼️ Imágenes' },
  ];

  const S = SORTERS[sort];
  const rows = [...LISTS[tab]].sort((a, b) => S.get(b) - S.get(a));
  const max = Math.max(...rows.map(S.get), 0.0001);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pg = Math.min(page, pages - 1);
  const view = rows.slice(pg * PAGE_SIZE, pg * PAGE_SIZE + PAGE_SIZE);
  const barColor = tab === 'video' ? CH_C.video : tab === 'img' ? CH_C.display : 'var(--acc)';

  const switchTab = (k: LbTab) => { setTab(k); setPage(0); };

  return (
    <div className="card pmx-lead">
      <div className="pmx-lead-head">
        <div>
          <div className="pmx-kick">Lo que de verdad vende</div>
          <div className="pmx-sec-t">🏆 Leaderboard de creativos · por leads</div>
        </div>
        <div className="pmx-tabs">
          {TABS.map((t) => (
            <button key={t.k} className={`pmx-tab ${tab === t.k ? 'on' : ''}`} onClick={() => switchTab(t.k)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pmx-theme-cta">
        🔑 El ángulo ganador: <b>“gasolina / ahorro”</b>. Los creativos top giran alrededor de no pagar gasolina — es el mensaje a escalar y replicar en piezas nuevas.
      </div>

      <div className="pmx-tools">
        <label className="pmx-sortwrap">
          Ordenar por{' '}
          <select className="pmx-sortsel" value={sort} onChange={(e) => { setSort(e.target.value as LbSort); setPage(0); }}>
            <option value="leads">Leads</option>
            <option value="conv">Tasa de conversión</option>
            <option value="ctr">CTR</option>
          </select>
        </label>
        <span className="pmx-count">{rows.length} piezas</span>
      </div>

      <div>
        {view.map((it, i) => {
          const rank = pg * PAGE_SIZE + i + 1;
          const val = S.get(it);
          const w = Math.round((val / max) * 100);
          const ctr = it.impressions > 0 ? it.clicks / it.impressions : 0;
          const cv = it.clicks > 0 ? it.conversions / it.clicks : 0;
          return (
            <div
              key={it.id}
              className="pmx-row"
              onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, it })}
              onMouseLeave={() => setTip(null)}
            >
              <div className={`pmx-rank ${rank === 1 ? 'g' : ''}`}>{rank}</div>
              {it.thumbKind && <Thumb kind={it.thumbKind} src={it.thumbSrc} />}
              <div className="pmx-mid">
                <div className="pmx-title">
                  {it.title}
                  {it.angle && <span className="pmx-chip">⛽ gasolina</span>}
                </div>
                <div className="pmx-sub">
                  <span>{fmtInt(it.impressions)} impr</span>
                  <span>CTR {fmtPct1(ctr)}</span>
                  <span>{fmtPct1(cv)} conv</span>
                </div>
                <div className="pmx-bar"><span style={{ width: `${w}%`, background: barColor }} /></div>
              </div>
              <div className="pmx-num">
                <div className="n">{S.fmt(val)}</div>
                <div className="k">{S.k}</div>
              </div>
            </div>
          );
        })}
      </div>

      {pages > 1 && (
        <div className="pmx-pager">
          <button className="pmx-pgb" disabled={pg === 0} onClick={() => setPage(pg - 1)}>‹</button>
          {Array.from({ length: pages }).map((_, p) => (
            <button key={p} className={`pmx-pgb ${p === pg ? 'on' : ''}`} onClick={() => setPage(p)}>{p + 1}</button>
          ))}
          <button className="pmx-pgb" disabled={pg === pages - 1} onClick={() => setPage(pg + 1)}>›</button>
        </div>
      )}

      <div className="pmx-note" style={{ marginTop: 14 }}>
        <span className="pmx-note-b" style={{ color: 'var(--acc)', borderColor: 'var(--acc)' }}>CONTRIBUCIÓN</span>
        <span>
          En PMax cada conversión se acredita a <b>cada</b> pieza que participó, así que los leads por asset <b>no se suman</b> al total: sirven para comparar
          piezas entre sí. <b>Google no da costo por asset</b>, por eso la eficiencia se mide con <b>CTR</b> y <b>tasa de conversión</b> (leads/clic), no con CPL
          por pieza. Dato real de la API (últimos 30 días) · {counts.videos} videos · {counts.texts} textos · {counts.images} imágenes.
        </span>
      </div>

      {tip && (
        <div className="chart-tooltip on" style={{ left: `${tip.x}px`, top: `${tip.y + (typeof window !== 'undefined' ? window.scrollY : 0)}px` }}>
          <div className="chart-tooltip-date">{tip.it.title.slice(0, 46)}</div>
          <div>
            <TipRow lbl="Leads" val={fmtInt(tip.it.conversions)} dot="var(--acc)" />
            <TipRow lbl="Impresiones" val={fmtInt(tip.it.impressions)} />
            <TipRow lbl="Clics" val={fmtInt(tip.it.clicks)} />
            <TipRow lbl="CTR" val={fmtPct1(tip.it.impressions > 0 ? tip.it.clicks / tip.it.impressions : 0)} />
            <TipRow lbl="Tasa conv" val={fmtPct1(tip.it.clicks > 0 ? tip.it.conversions / tip.it.clicks : 0)} />
          </div>
        </div>
      )}
    </div>
  );
}

// Miniatura con fallback: si la imagen falla, muestra un placeholder limpio.
function Thumb({ kind, src }: { kind: 'video' | 'img'; src?: string }) {
  const [err, setErr] = useState(false);
  if (err || !src) {
    return <div className="pmx-thumb pmx-thumb-ph">{kind === 'video' ? '🎬' : '🖼️'}</div>;
  }
  return (
    <div className="pmx-thumb">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" onError={() => setErr(true)} />
      {kind === 'video' && <span className="pmx-play">▶</span>}
    </div>
  );
}

function TipRow({ lbl, val, dot }: { lbl: string; val: string; dot?: string }) {
  return (
    <div className="pmx-ttrow">
      <span className="l"><i style={{ background: dot || 'transparent' }} />{lbl}</span>
      <span className="v">{val}</span>
    </div>
  );
}

// ============================================================
// Tendencia diaria de CPL de PMAX (excluye baches de medición)
// ============================================================
function DailyCplChart({ daily, target, gaps }: { daily: { date: string; cost: number; conversions: number }[]; target?: number; gaps: ReturnType<typeof getMeasurementGaps> }) {
  const VB_W = 720, VB_H = 220, L = 46, R = 48, T = 16, ih = 150, X0 = L, X1 = VB_W - R;
  const rows = daily.map((d) => {
    const gap = isInGap(d.date, gaps);
    return { date: d.date, gap, cpl: !gap && d.conversions > 0 ? d.cost / d.conversions : null, leads: d.conversions };
  });
  const n = rows.length;
  const cpls = rows.map((r) => r.cpl).filter((v): v is number => v != null && v > 0);
  const cplMax = Math.max(...cpls, target ?? 0, 1) * 1.15;
  const xAt = (i: number) => (n > 1 ? X0 + ((X1 - X0) * i) / (n - 1) : (X0 + X1) / 2);
  const yAt = (v: number) => T + ih - (Math.min(v, cplMax) / cplMax) * ih;

  if (n < 2) {
    return <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--t3)' }}>Necesitas ≥2 días con datos.</div>;
  }

  let line = '', started = false;
  rows.forEach((r, i) => {
    if (r.cpl == null) { started = false; return; }
    line += `${started ? 'L' : 'M'}${xAt(i).toFixed(1)} ${yAt(r.cpl).toFixed(1)} `;
    started = true;
  });

  const data: ChartDataPoint[] = rows.map((r, i) => ({
    date: dayLabel(r.date) + (r.gap ? ' · sin tracking' : ''),
    values: r.cpl != null
      ? [{ lbl: 'CPL', val: fmtCOP(r.cpl), color: 'var(--acc)', y: yAt(r.cpl) }, { lbl: 'Leads', val: fmtInt(r.leads), color: 'transparent' }]
      : [{ lbl: 'CPL', val: '— (sin tracking)', color: 'var(--t3)' }],
  }));

  const hasGoal = typeof target === 'number' && target > 0;
  const gi = rows.map((r, i) => (r.gap ? i : -1)).filter((i) => i >= 0);
  const step = n > 1 ? (X1 - X0) / (n - 1) : 0;

  return (
    <ChartWithTooltip data={data} xStart={X0} xEnd={X1} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      {gi.length > 0 && (
        <g>
          <rect x={xAt(gi[0]) - step / 2} y={T} width={Math.max(0, xAt(gi[gi.length - 1]) + step / 2 - (xAt(gi[0]) - step / 2))} height={ih} fill="var(--bg4)" opacity="0.55" rx="4" />
          <text x={(xAt(gi[0]) + xAt(gi[gi.length - 1])) / 2} y={T + 9} textAnchor="middle" fontFamily="'JetBrains Mono',monospace" fontSize="8.5" fill="var(--t3)">sin tracking</text>
        </g>
      )}
      {[0.5, 1].map((f, k) => {
        const v = cplMax * f, y = yAt(v);
        return (
          <g key={k}>
            <line x1={X0} y1={y} x2={X1} y2={y} stroke="var(--grid)" />
            <text x={X1 + 8} y={y + 3.5} fontFamily="'JetBrains Mono',monospace" fontSize="9.5" fill="var(--t3)">{`$${Math.round(v / 1000)}k`}</text>
          </g>
        );
      })}
      {hasGoal && (
        <>
          <line x1={X0} y1={yAt(target!)} x2={X1} y2={yAt(target!)} stroke="var(--up)" strokeWidth="1.6" strokeDasharray="3 5" />
          <text x={X0} y={yAt(target!) - 7} fontFamily="'JetBrains Mono',monospace" fontSize="10" fontWeight="600" fill="var(--up)">{`META ${fmtCOP(target!)}`}</text>
        </>
      )}
      <path d={line.trim()} fill="none" stroke="var(--acc)" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      {rows.map((r, i) => (r.cpl != null ? <circle key={i} cx={xAt(i)} cy={yAt(r.cpl)} r="2.8" fill="var(--acc)" /> : null))}
      {rows.map((r, i) =>
        i % Math.ceil(n / 8) === 0 || i === n - 1 ? (
          <text key={`x${i}`} x={xAt(i)} y={VB_H - 6} textAnchor="middle" fontFamily="'JetBrains Mono',monospace" fontSize="9" fill="var(--t3)">{dayLabel(r.date).split(' ')[0]}</text>
        ) : null
      )}
      <line className="chart-cursor" x1={0} y1={T} x2={0} y2={T + ih} />
      <circle className="chart-point" cx={0} cy={0} />
    </ChartWithTooltip>
  );
}

// ============================================================
// Vista PMAX orientada a LEADS
// ============================================================
export function PMAXLeads() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useGoogleAds(client.id, range, previous, 'pmax');
  const assets = useGadsAssets(client.id);
  const channels = useGadsPmaxChannels(client.id);
  const groups = useGadsAssetGroups(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const previousLabel = formatRangeLabel(previous);
  const target = client.cplTarget;

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>Cargando Performance Max de {client.name}…</div>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="view on">
        <div className="card" style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}>
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>Error cargando Performance Max</div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }
  if (!data || data.campaigns.length === 0) {
    if (!data?.segmentExistsEver) {
      return <EmptyState icon="🅿" title="Sin campañas Performance Max" message={<>{client.name} no tiene campañas de <b>Performance Max</b> activas por el momento.</>} />;
    }
    return (
      <EmptyState icon="📅" title="Sin actividad de Performance Max en este período" message={<>{client.name} tiene PMAX, pero sin actividad entre <b>{rangeLabel}</b>.</>} hint="Prueba ampliar el rango de fechas." />
    );
  }

  const t = data.totals;
  const cpl = t.cpa;
  const ratio = target ? cpl / target : 0;
  const underMeta = target ? cpl <= target : false;

  // ── Reparto por red (agregado de todas las campañas del snapshot) ──
  const netCost: Partial<Record<PmaxChannel, number>> = {};
  const netLeads: Partial<Record<PmaxChannel, number>> = {};
  let netTotal = 0;
  (channels.data?.campaigns ?? []).forEach((c) =>
    c.channels.forEach((ch) => {
      netCost[ch.channel] = (netCost[ch.channel] || 0) + ch.cost;
      netLeads[ch.channel] = (netLeads[ch.channel] || 0) + ch.conversions;
      netTotal += ch.cost;
    })
  );
  const netRows = CH_ORDER.map((k) => ({ k, cost: netCost[k] || 0, leads: netLeads[k] || 0, pct: netTotal > 0 ? (netCost[k] || 0) / netTotal : 0 })).filter((r) => r.cost > 0);
  const topNet = netRows.slice().sort((a, b) => b.pct - a.pct)[0];

  // ── Ad strength (nivel dominante por nº de grupos) ──
  const sc = groups.data?.strengthCounts ?? {};
  const strengthOrder = ['POOR', 'AVERAGE', 'GOOD', 'EXCELLENT'] as const;
  const primaryStrength = strengthOrder.reduce<{ k: string; n: number }>((best, k) => ((sc[k] || 0) > best.n ? { k, n: sc[k] || 0 } : best), { k: '', n: 0 }).k;
  const STR_LABEL: Record<string, string> = { POOR: 'Pobre', AVERAGE: 'Media', GOOD: 'Buena', EXCELLENT: 'Excelente' };
  const strengthIdx = strengthOrder.indexOf(primaryStrength as any);

  // ── Assets → leaderboard items ──
  const mkText = (a: TextAsset, i: number): LbItem => ({ id: `t${i}-${a.text.slice(0, 20)}`, title: a.text, impressions: a.impressions, clicks: a.clicks, conversions: a.conversions, groups: a.groups.length, angle: ANGLE.test(a.text) });
  const ad = assets.data;
  const lbVideos: LbItem[] = (ad?.videos ?? []).map((v: VideoAsset, i) => ({ id: `v${i}-${v.videoId}`, title: v.title, thumbKind: 'video', thumbSrc: `https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg`, impressions: v.impressions, clicks: v.clicks, conversions: v.conversions, groups: v.groups.length, angle: ANGLE.test(v.title) }));
  const lbHead: LbItem[] = [...(ad?.headlines ?? []), ...(ad?.longHeadlines ?? [])].map(mkText);
  const lbDesc: LbItem[] = (ad?.descriptions ?? []).map(mkText);
  const lbImg: LbItem[] = (ad?.images ?? []).map((im: ImageAsset, i) => ({ id: `i${i}-${im.url.slice(-16)}`, title: im.fieldType.replace(/_/g, ' ').toLowerCase(), thumbKind: 'img', thumbSrc: im.url, impressions: im.impressions, clicks: im.clicks, conversions: im.conversions, groups: im.groups.length, angle: false }));
  const hasBoard = ad && ad.assetCount > 0 && ad.hasAnyMetric;

  // ── Gaps de medición ──
  const allGaps = getMeasurementGaps(client.id);
  const gapsNote = gapsInRange(allGaps, data.from, data.to);

  return (
    <div className="view on">
      <div className="hero">
        <HeroHead brand="google-ads">Performance Max</HeroHead>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {data.campaignCount} campaña{data.campaignCount === 1 ? '' : 's'} · {fmtCOP(t.cost)} invertido · {fmtInt(t.conversions)} leads
        </div>
      </div>

      {/* HERO VERDICT */}
      <div className="card pmx-verdict">
        <div className="pmx-kick" style={{ color: CH_C.video }}>Performance Max · leads</div>
        <div className="pmx-htitle">
          PMAX trae leads a <span style={{ color: underMeta ? 'var(--up)' : 'var(--dn)' }}>{fmtCOP(cpl)}</span>.
          {topNet && topNet.k === 'video' && topNet.pct >= 0.5 && (
            <> Y tu PMAX es, en realidad, <span style={{ color: CH_C.video }}>YouTube</span>.</>
          )}
        </div>
        <div className="pmx-chips">
          {target && (
            <span className="pmx-hchip" style={{ background: `color-mix(in srgb, ${underMeta ? 'var(--up)' : 'var(--dn)'} 15%, transparent)`, color: underMeta ? 'var(--up)' : 'var(--dn)' }}>
              {underMeta ? `✓ ${Math.round((1 - ratio) * 100)}% bajo la meta (${fmtCOP(target)})` : `▲ ${Math.round((ratio - 1) * 100)}% sobre la meta`}
            </span>
          )}
          {topNet && (
            <span className="pmx-hchip" style={{ background: `color-mix(in srgb, ${CH_C[topNet.k]} 14%, transparent)`, color: CH_C[topNet.k] }}>
              ▶ {Math.round(topNet.pct * 100)}% de la inversión es {CH_LABEL[topNet.k].replace('*', '')}
            </span>
          )}
          <span className="pmx-hchip plain">{fmtInt(t.conversions)} leads · {fmtM(t.cost)}</span>
        </div>
        {hasBoard && (
          <div className="pmx-hsub">
            {ad!.assetCount} piezas creativas peleando por el lead. La historia está en cuáles venden — y en un ángulo que se repite: <b>gasolina/ahorro</b>.
          </div>
        )}
      </div>

      {/* STAT ROW */}
      <div className="pmx-r4">
        <div className="card pmx-st">
          <div className="pmx-lbl">Costo por lead</div>
          <div className="pmx-v" style={{ color: underMeta ? 'var(--up)' : undefined }}>{fmtCOP(cpl)}</div>
          <div className="pmx-d" style={{ color: underMeta ? 'var(--up)' : 'var(--t3)' }}>{target ? `${Math.round(ratio * 100)}% de la meta ${underMeta ? '✓' : '⚠'}` : 'CPA'}</div>
        </div>
        <div className="card pmx-st">
          <div className="pmx-lbl">Leads</div>
          <div className="pmx-v">{fmtInt(t.conversions)}</div>
          <div className="pmx-d" style={{ color: 'var(--t3)' }}>últimos {rangeLabel}</div>
        </div>
        <div className="card pmx-st">
          <div className="pmx-lbl">Inversión</div>
          <div className="pmx-v">{fmtM(t.cost)}</div>
          <div className="pmx-d" style={{ color: data.costDelta >= 0 ? 'var(--up)' : 'var(--dn)' }}>{(data.costDelta >= 0 ? '▲ +' : '▼ ') + data.costDelta.toFixed(1)}% vs {previousLabel}</div>
        </div>
        <div className="card pmx-st">
          <div className="pmx-lbl">CTR · clics</div>
          <div className="pmx-v">{fmtPct1(t.ctr)}</div>
          <div className="pmx-d" style={{ color: 'var(--t3)' }}>{fmtInt(t.clicks)} clics · {fmtInt(t.impressions)} impr.</div>
        </div>
      </div>

      {/* LEADERBOARD (protagonista) */}
      {hasBoard && (
        <CreativeLeaderboard
          videos={lbVideos}
          headlines={lbHead}
          descriptions={lbDesc}
          images={lbImg}
          counts={{ videos: ad!.videoCount, texts: ad!.textCount, images: ad!.imageCount }}
        />
      )}

      {/* RED + AD STRENGTH */}
      <div className="pmx-r2">
        {netRows.length > 0 && (
          <div className="card" style={{ padding: '22px 24px' }}>
            <div className="pmx-sec-h">
              <div><div className="pmx-kick" style={{ color: 'var(--t3)' }}>Reparto por red</div><div className="pmx-sec-t">¿Dónde se va la plata?</div></div>
              <span className="pmx-pill">snapshot 30d</span>
            </div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
              <Donut rows={netRows} />
              <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {netRows.map((r) => (
                  <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: CH_C[r.k], flex: 'none' }} />
                    <span>{CH_LABEL[r.k]}</span>
                    <span style={{ color: 'var(--t3)', fontSize: 11, marginLeft: 'auto', width: 34, textAlign: 'right' }}>{Math.round(r.pct * 100)}%</span>
                    <span style={{ fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", minWidth: 96, textAlign: 'right' }}>{fmtCOP(r.cost)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 14, lineHeight: 1.5 }}>
              <b>Search* es residual</b> (total − las otras redes). Google no expone esto por API — sale del script de Mike Rhodes. Snapshot de 30 días (no responde al filtro).
            </div>
          </div>
        )}

        {groups.data && groups.data.groupCount > 0 && (
          <div className="card" style={{ padding: '22px 24px' }}>
            <div className="pmx-sec-h">
              <div><div className="pmx-kick" style={{ color: 'var(--t3)' }}>Calidad del anuncio</div><div className="pmx-sec-t">Ad Strength</div></div>
              <span className="pmx-pill">{groups.data.groupCount} asset group{groups.data.groupCount === 1 ? '' : 's'}</span>
            </div>
            <div className="pmx-meter">
              {(['POOR', 'AVERAGE', 'GOOD', 'EXCELLENT'] as const).map((k, idx) => (
                <div key={k} className={`pmx-mseg p${idx + 1} ${idx === strengthIdx ? 'on' : ''}`}>{STR_LABEL[k]}</div>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.5, marginTop: 6 }}>
              {strengthIdx >= 2
                ? <>Tu grupo está en <b className="up">{STR_LABEL[primaryStrength]}</b>. Buen nivel — mantén la variedad de assets para sostener el alcance.</>
                : <>Tu grupo está en <b style={{ color: 'var(--warn)' }}>{STR_LABEL[primaryStrength] || 'Sin dato'}</b>. Google premia con más alcance los grupos en <b>Buena/Excelente</b> → sumar más titulares e imágenes de calidad es la palanca directa para bajar el CPL.</>}
            </div>
            {ad && ad.assetCount > 0 && (
              <>
                <div className="pmx-kick" style={{ color: 'var(--t3)', margin: '18px 0 8px' }}>Inventario creativo</div>
                <div className="pmx-mix">
                  <div className="pmx-mixc"><div className="mv">{fmtInt(ad.videoCount)}</div><div className="mk">🎬 Videos</div></div>
                  <div className="pmx-mixc"><div className="mv">{fmtInt(ad.textCount)}</div><div className="mk">✍️ Textos</div></div>
                  <div className="pmx-mixc"><div className="mv">{fmtInt(ad.imageCount)}</div><div className="mk">🖼️ Imágenes</div></div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* TENDENCIA DIARIA */}
      <div className="card" style={{ padding: '22px 24px 14px', marginBottom: 16 }}>
        <div className="pmx-sec-h">
          <div><div className="pmx-kick" style={{ color: 'var(--t3)' }}>La trayectoria</div><div className="pmx-sec-t">CPL de PMAX por día</div></div>
          <div className="pmx-leg">
            <span><i style={{ background: 'var(--acc)' }} />CPL/día</span>
            {target && <span><i style={{ borderTop: '2px dashed var(--up)', height: 0, background: 'transparent' }} />Meta {fmtCOP(target)}</span>}
          </div>
        </div>
        <DailyCplChart daily={data.daily} target={target} gaps={allGaps} />
      </div>

      {/* NOTAS */}
      {gapsNote.length > 0 && (
        <div className="pmx-note">
          <span className="pmx-note-b">MEDICIÓN</span>
          <span>
            {gapsNote.map((g, i) => (<span key={i}>{dayLabel(g.from)}–{dayLabel(g.to)}: {g.reason} </span>))}
            Esos días quedan fuera de la línea de tendencia.
          </span>
        </div>
      )}
      <div className="pmx-note" style={{ marginTop: 10 }}>
        <span className="pmx-note-b" style={{ color: CH_C.video, borderColor: CH_C.video }}>LEADS</span>
        <span>Cuenta de <b>generación de leads</b>: sin Revenue ni ROAS reales. La referencia es <b>leads</b> y <b>costo por lead</b>. Vista de PMAX enfocada 100% en venta de vehículos.</span>
      </div>

      <style jsx global>{`
        .pmx-kick{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--acc)}
        .pmx-pill{font-size:11.5px;font-weight:600;color:var(--t2);border:1px solid var(--b1);border-radius:999px;padding:5px 11px;background:var(--bg1)}
        .pmx-verdict{padding:28px 30px;margin-bottom:16px;position:relative;overflow:hidden;box-shadow:var(--sh-md);border-color:var(--b2)}
        .pmx-htitle{font-size:clamp(24px,3.4vw,34px);font-weight:800;letter-spacing:-.025em;line-height:1.1;margin:12px 0 0}
        .pmx-chips{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
        .pmx-hchip{display:inline-flex;align-items:center;gap:7px;font-weight:700;font-size:13px;padding:6px 12px;border-radius:999px}
        .pmx-hchip.plain{background:var(--bg3);border:1px solid var(--b1);color:var(--t2)}
        .pmx-hsub{color:var(--t2);font-size:14px;margin-top:12px;max-width:66ch}
        .pmx-r4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
        .pmx-st{padding:16px 18px}
        .pmx-lbl{font-size:10px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--t3)}
        .pmx-v{font-size:24px;font-weight:800;letter-spacing:-.02em;margin:6px 0 2px}
        .pmx-d{font-size:11px;font-weight:600}
        .pmx-sec-h{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px}
        .pmx-sec-t{font-size:18px;font-weight:800;letter-spacing:-.02em;margin-top:3px}
        .pmx-leg{display:flex;gap:14px;font-size:10.5px;color:var(--t3);flex-wrap:wrap;align-items:center;font-weight:600}
        .pmx-leg i{width:11px;height:3px;border-radius:2px;display:inline-block;margin-right:5px;vertical-align:2px}
        .pmx-r2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
        /* leaderboard */
        .pmx-lead{padding:22px 24px;margin-bottom:16px;position:relative}
        .pmx-lead-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:space-between}
        .pmx-tabs{display:inline-flex;background:var(--bg3);border:1px solid var(--b1);border-radius:10px;padding:3px;gap:2px}
        .pmx-tab{font-size:12px;font-weight:700;padding:6px 12px;border-radius:8px;cursor:pointer;color:var(--t2);border:none;background:transparent}
        .pmx-tab.on{background:var(--bg1);color:var(--t1);box-shadow:var(--sh-sm)}
        .pmx-theme-cta{margin:14px 0 6px;padding:12px 16px;border-radius:12px;background:color-mix(in srgb,var(--up) 8%,var(--bg1));border:1px solid color-mix(in srgb,var(--up) 26%,transparent);font-size:13px;font-weight:600;line-height:1.4}
        .pmx-theme-cta b{color:var(--up)}
        .pmx-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:12px 0 2px;justify-content:space-between}
        .pmx-sortwrap{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--t3)}
        .pmx-sortsel{font-size:11.5px;font-weight:600;color:var(--t2);background:var(--bg3);border:1px solid var(--b1);border-radius:8px;padding:6px 10px;cursor:pointer}
        .pmx-count{font-size:11px;color:var(--t3)}
        .pmx-row{display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--b1)}
        .pmx-rank{flex:none;width:26px;height:26px;border-radius:8px;display:grid;place-items:center;font-weight:800;font-size:13px;background:var(--bg3);color:var(--t2)}
        .pmx-rank.g{background:color-mix(in srgb,var(--up) 16%,transparent);color:var(--up)}
        .pmx-thumb{flex:none;width:64px;height:38px;border-radius:7px;overflow:hidden;position:relative;background:var(--bg3)}
        .pmx-thumb img{width:100%;height:100%;object-fit:cover;display:block}
        .pmx-thumb-ph{display:grid;place-items:center;font-size:16px;color:var(--t3)}
        .pmx-play{position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:13px;text-shadow:0 1px 3px rgba(0,0,0,.6)}
        .pmx-mid{flex:1;min-width:0}
        .pmx-title{font-size:13px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .pmx-chip{font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;background:color-mix(in srgb,var(--up) 14%,transparent);color:var(--up);margin-left:7px;white-space:nowrap}
        .pmx-sub{font-size:10px;color:var(--t3);margin-top:4px;display:flex;gap:10px;flex-wrap:wrap}
        .pmx-bar{height:7px;border-radius:5px;background:var(--track);overflow:hidden;margin-top:7px}
        .pmx-bar>span{display:block;height:100%;border-radius:5px}
        .pmx-num{flex:none;text-align:right;min-width:74px}
        .pmx-num .n{font-size:17px;font-weight:800;font-family:'Space Grotesk',sans-serif}
        .pmx-num .k{font-size:9.5px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em}
        .pmx-pager{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:16px}
        .pmx-pgb{min-width:30px;height:30px;padding:0 8px;border-radius:8px;border:1px solid var(--b1);background:var(--bg1);color:var(--t2);font-size:12px;font-weight:700;cursor:pointer}
        .pmx-pgb.on{background:var(--acc);color:#fff;border-color:transparent}
        .pmx-pgb:disabled{opacity:.35;cursor:default}
        /* meter */
        .pmx-meter{display:flex;gap:6px;margin:6px 0 8px}
        .pmx-mseg{flex:1;height:34px;border-radius:7px;display:grid;place-items:center;font-size:10.5px;font-weight:700;color:var(--t3);background:var(--bg3);border:1px solid var(--b1)}
        .pmx-mseg.on{color:#fff;border-color:transparent}
        .pmx-mseg.p1.on{background:var(--dn)}
        .pmx-mseg.p2.on{background:var(--warn)}
        .pmx-mseg.p3.on{background:#84cc16}
        .pmx-mseg.p4.on{background:var(--up)}
        .pmx-mix{display:flex;gap:10px;flex-wrap:wrap}
        .pmx-mixc{flex:1;min-width:80px;text-align:center;padding:12px;border-radius:10px;background:var(--bg3);border:1px solid var(--b1)}
        .pmx-mixc .mv{font-size:22px;font-weight:800}
        .pmx-mixc .mk{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-top:2px}
        /* notes + tooltip */
        .pmx-note{display:flex;gap:11px;align-items:flex-start;margin-top:16px;font-size:12px;color:var(--t2);line-height:1.55}
        .pmx-note-b{flex:none;font-size:9.5px;font-weight:700;color:var(--warn);border:1px solid color-mix(in srgb,var(--warn) 40%,transparent);border-radius:6px;padding:3px 7px;letter-spacing:.06em;margin-top:1px}
        .pmx-ttrow{display:flex;justify-content:space-between;gap:12px;align-items:center}
        .pmx-ttrow .l{display:flex;align-items:center;gap:6px;color:var(--t2)}
        .pmx-ttrow .l i{width:8px;height:8px;border-radius:50%}
        .pmx-ttrow .v{font-family:'Space Grotesk',sans-serif;font-weight:600;color:var(--t1)}
        @media(max-width:820px){.pmx-r4{grid-template-columns:1fr 1fr}.pmx-r2{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}

// Donut de reparto por red.
function Donut({ rows }: { rows: { k: PmaxChannel; pct: number }[] }) {
  const cx = 90, cy = 90, r = 64, sw = 26, C = 2 * Math.PI * r;
  let off = 0;
  const top = rows.slice().sort((a, b) => b.pct - a.pct)[0];
  return (
    <svg viewBox="0 0 180 180" style={{ width: 180, flex: 'none' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--track)" strokeWidth={sw} />
      {rows.map((n) => {
        const len = n.pct * C;
        const el = (
          <circle key={n.k} cx={cx} cy={cy} r={r} fill="none" stroke={CH_C[n.k]} strokeWidth={sw} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform={`rotate(-90 ${cx} ${cy})`} />
        );
        off += len;
        return el;
      })}
      {top && (
        <>
          <text x={cx} y={cy - 4} textAnchor="middle" fontFamily="'Space Grotesk',sans-serif" fontWeight="700" fontSize="30" fill={CH_C[top.k]}>{Math.round(top.pct * 100)}%</text>
          <text x={cx} y={cy + 16} textAnchor="middle" fontFamily="'Inter',sans-serif" fontSize="12" fill="var(--t3)">{CH_LABEL[top.k].replace('*', '')}</text>
        </>
      )}
    </svg>
  );
}
