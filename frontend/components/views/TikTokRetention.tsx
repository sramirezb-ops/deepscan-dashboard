'use client';

import { useEffect, useMemo, useState } from 'react';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useTikTok, type TikTokAdRow, type TikTokVideo } from '@/lib/hooks/useTikTok';
import { calcDelta, formatCurrency, formatInt, formatNumber, formatPercent } from '@/lib/utils';
import {
  TT_PINK,
  TikTokLoading,
  TikTokError,
  TikTokEmpty,
  TikTokHero,
  RetentionCurve,
  MiniRetentionBar,
  CreativeThumb,
  SectionLabel,
  SummaryStat,
  BackToTop,
  chipStyle,
  pagerBtnStyle,
  summaryGridStyle,
  toolbarStyle,
  searchInputStyle,
  searchIconStyle,
  searchClearStyle,
  selectStyle,
} from './tiktokShared';

// ============================================================
// TikTok Ads · RETENCIÓN DE LOS ANUNCIOS
// ============================================================
// Vista 3 de 3. El foco es el CREATIVO: qué anuncio engancha y retiene. Misma
// organización que Campañas pero 100 % retención:
//   1. Resumen de retención del período (6 KPIs vs. período anterior).
//   2. Curva de retención global (de dónde se cae la atención).
//   3. Buscador + filtro por conjunto + orden + ranking paginado de anuncios,
//      cada uno comparado contra el PROMEDIO de la propia cuenta.
// Solo anuncios con reproducciones de video. 100 % datos reales.
// ============================================================

type SortKey = 'views' | 'hook' | 'hold' | 'completion' | 'watch';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'views', label: 'Reproducciones' },
  { key: 'hook', label: 'Gancho 2s' },
  { key: 'hold', label: 'Retención 6s' },
  { key: 'completion', label: 'Video completo' },
  { key: 'watch', label: 'Tiempo promedio' },
];

const ADS_PER_PAGE = 12;

function sortValue(a: TikTokAdRow, key: SortKey): number {
  switch (key) {
    case 'views': return a.video.views;
    case 'hook': return a.video.hookRate;
    case 'hold': return a.video.holdRate;
    case 'completion': return a.video.completionRate;
    case 'watch': return a.video.avgWatchTime;
  }
}

// Comparación honesta de un anuncio contra el PROMEDIO de la cuenta en la
// métrica por la que se está ordenando. Para tasas → diferencia en puntos; para
// tiempo → segundos; para reproducciones → cuánto del total representa.
function benchmark(a: TikTokAdRow, key: SortKey, v: TikTokVideo): { label: string; text: string; color: string } {
  const good = '#4ade80';
  const bad = '#f87171';
  const mu = 'var(--mu)';
  if (key === 'views') {
    const share = v.views > 0 ? a.video.views / v.views : 0;
    return { label: 'del total de reproducciones', text: formatPercent(share, 1), color: mu };
  }
  const map: Record<Exclude<SortKey, 'views'>, { now: number; avg: number; kind: 'pts' | 's' }> = {
    hook: { now: a.video.hookRate, avg: v.hookRate, kind: 'pts' },
    hold: { now: a.video.holdRate, avg: v.holdRate, kind: 'pts' },
    completion: { now: a.video.completionRate, avg: v.completionRate, kind: 'pts' },
    watch: { now: a.video.avgWatchTime, avg: v.avgWatchTime, kind: 's' },
  };
  const m = map[key];
  const diff = m.now - m.avg;
  const near = m.kind === 'pts' ? Math.abs(diff) < 5e-4 : Math.abs(diff) < 0.05;
  if (near) return { label: 'vs. promedio de la cuenta', text: '■ en el promedio', color: mu };
  const arrow = diff > 0 ? '▲' : '▼';
  const mag = m.kind === 'pts' ? `${(Math.abs(diff) * 100).toFixed(1)} pts` : `${Math.abs(diff).toFixed(1)} s`;
  return { label: 'vs. promedio de la cuenta', text: `${arrow} ${mag}`, color: diff > 0 ? good : bad };
}

export function TikTokRetention() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useTikTok(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const cur = client.currency;

  const [sort, setSort] = useState<SortKey>('views');
  const [query, setQuery] = useState('');
  const [conjunto, setConjunto] = useState<string>('all');
  const [page, setPage] = useState(1);

  // Solo anuncios con reproducciones de video (sin video no hay retención).
  const withVideo = useMemo(
    () => (data?.ads ?? []).filter((a) => a.video.views > 0),
    [data],
  );

  // Conjuntos disponibles (para el filtro), ordenados alfabéticamente.
  const conjuntos = useMemo(() => {
    const set = new Set<string>();
    withVideo.forEach((a) => a.adgroupName && set.add(a.adgroupName));
    return Array.from(set).sort((x, y) => x.localeCompare(y, 'es'));
  }, [withVideo]);

  // Pipeline: filtro por conjunto → búsqueda por nombre → orden.
  const ads = useMemo(() => {
    let list = withVideo;
    if (conjunto !== 'all') list = list.filter((a) => a.adgroupName === conjunto);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((a) => a.name.toLowerCase().includes(q));
    return [...list].sort((x, y) => sortValue(y, sort) - sortValue(x, sort));
  }, [withVideo, conjunto, query, sort]);

  // Resetear a la página 1 cuando cambia el orden, la búsqueda o el filtro.
  useEffect(() => {
    setPage(1);
  }, [sort, query, conjunto]);

  if (loading && !data) return <TikTokLoading clientName={client.name} />;
  if (error) return <TikTokError error={error} />;
  if (!data || data.totals.spend === 0)
    return <TikTokEmpty data={data} clientName={client.name} rangeLabel={rangeLabel} />;

  const v = data.video;
  const vp = data.videoPrev;

  // Deltas del resumen vs. período anterior (solo si hay período comparable).
  const viewsDelta = vp ? calcDelta(v.views, vp.views) : null;
  const hookDelta = vp ? v.hookRate - vp.hookRate : null;
  const holdDelta = vp ? v.holdRate - vp.holdRate : null;
  const p50Delta = vp ? v.p50Rate - vp.p50Rate : null;
  const completeDelta = vp ? v.completionRate - vp.completionRate : null;
  const watchDelta = vp ? v.avgWatchTime - vp.avgWatchTime : null;

  const fmtPts = (x: number) => `${(x * 100).toFixed(1)} pts`;
  const fmtSec = (x: number) => `${x.toFixed(1)} s`;

  const totalPages = Math.max(1, Math.ceil(ads.length / ADS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * ADS_PER_PAGE;
  const pageAds = ads.slice(start, start + ADS_PER_PAGE);

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

      {/* 1 · Resumen de retención del período */}
      <SectionLabel style={{ marginTop: 4 }}>Resumen de retención del período</SectionLabel>
      <div style={summaryGridStyle}>
        <SummaryStat label="Reproducciones" value={formatNumber(v.views)} delta={viewsDelta} good="up" />
        <SummaryStat label="Gancho 2s" value={formatPercent(v.hookRate, 1)} delta={hookDelta} good="up" fmtDelta={fmtPts} />
        <SummaryStat label="Retención 6s" value={formatPercent(v.holdRate, 1)} delta={holdDelta} good="up" fmtDelta={fmtPts} />
        <SummaryStat label="Vieron 50%" value={formatPercent(v.p50Rate, 1)} delta={p50Delta} good="up" fmtDelta={fmtPts} />
        <SummaryStat label="Video completo" value={formatPercent(v.completionRate, 1)} delta={completeDelta} good="up" fmtDelta={fmtPts} />
        <SummaryStat label="Tiempo promedio" value={v.avgWatchTime > 0 ? fmtSec(v.avgWatchTime) : '—'} delta={watchDelta} good="up" fmtDelta={fmtSec} />
      </div>

      {/* 2 · Curva de retención global */}
      {v.views > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 4,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <h3 style={{ margin: 0, fontSize: '15px' }}>Curva de retención global</h3>
            <span className="period-pill">{formatNumber(v.views)} reproducciones</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 16, lineHeight: 1.5 }}>
            Promedio de todos los anuncios. Del 100 % que reproduce, cuántos siguen viendo en cada
            hito. Donde la barra cae con fuerza es donde el creativo pierde a la audiencia — ahí está
            la oportunidad de edición. Abajo, el detalle anuncio por anuncio.
          </div>
          <RetentionCurve v={v} />
        </div>
      )}

      {/* 3 · Ranking de anuncios */}
      <SectionLabel style={{ marginTop: 22 }}>Ranking de anuncios por retención</SectionLabel>

      {/* Barra de herramientas: buscar + ordenar + conteo */}
      <div style={toolbarStyle}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 340 }}>
          <span style={searchIconStyle}>⌕</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar anuncio por nombre…"
            style={searchInputStyle}
          />
          {query && (
            <button onClick={() => setQuery('')} style={searchClearStyle} title="Limpiar" aria-label="Limpiar búsqueda">
              ×
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--mu)' }}>
            Ordenar por
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={selectStyle}>
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <span style={{ fontSize: 11, color: 'var(--mu)', whiteSpace: 'nowrap' }}>
            {formatInt(ads.length)} {ads.length === 1 ? 'anuncio' : 'anuncios'}
          </span>
        </div>
      </div>

      {/* Filtro por conjunto (adgroup) */}
      {conjuntos.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 14px' }}>
          <button onClick={() => setConjunto('all')} style={chipStyle(conjunto === 'all')}>
            Todos los conjuntos
          </button>
          {conjuntos.map((c) => (
            <button key={c} onClick={() => setConjunto(c)} style={chipStyle(conjunto === c)} title={c}>
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Tarjetas de anuncios */}
      {pageAds.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {pageAds.map((a, i) => {
            const bench = benchmark(a, sort, v);
            return (
              <div key={a.adId} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <CreativeThumb name={a.name} coverUrl={a.coverUrl} videoUrl={a.videoUrl} size="lg" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: TT_PINK, flexShrink: 0 }}>
                        #{start + i + 1}
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--t1)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={a.name}
                      >
                        {a.name}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--mu)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={`${a.campaignName} · ${a.adgroupName}`}
                    >
                      {a.adgroupName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t1)', marginTop: 4 }}>
                      {formatNumber(a.video.views)} reprod. · {formatCurrency(a.spend, cur)} ·{' '}
                      {formatInt(a.conversions)} leads
                    </div>
                  </div>
                </div>

                {/* Comparación contra el promedio de la cuenta en la métrica activa */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    marginBottom: 12,
                    borderRadius: 8,
                    background: 'var(--bg3)',
                    border: '1px solid var(--b2)',
                  }}
                >
                  <span style={{ fontSize: 10, color: 'var(--mu)' }}>{bench.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: bench.color, fontVariantNumeric: 'tabular-nums' }}>
                    {bench.text}
                  </span>
                </div>

                <MiniRetentionBar v={a.video} />

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: '1px solid var(--b2)',
                    fontSize: 11,
                  }}
                >
                  <span style={{ color: 'var(--mu)' }}>
                    Tiempo prom.{' '}
                    <b style={{ color: 'var(--t1)' }}>
                      {a.video.avgWatchTime > 0 ? `${a.video.avgWatchTime.toFixed(1)} s` : '—'}
                    </b>
                  </span>
                  <span style={{ color: 'var(--mu)' }}>
                    CTR <b style={{ color: 'var(--t1)' }}>{formatPercent(a.ctr, 1)}</b>
                  </span>
                  <span style={{ color: 'var(--mu)' }}>
                    CPL{' '}
                    <b style={{ color: 'var(--t1)' }}>
                      {a.conversions > 0 ? formatCurrency(a.cpl, cur) : '—'}
                    </b>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--mu)', fontSize: 13 }}>
          {withVideo.length === 0
            ? 'No hay anuncios con reproducciones de video en este período.'
            : 'Ningún anuncio coincide con la búsqueda o el filtro actual.'}
        </div>
      )}

      {/* Paginación */}
      {ads.length > ADS_PER_PAGE && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} style={pagerBtnStyle(safePage <= 1)}>
            ← Anterior
          </button>
          <span style={{ fontSize: 11, color: 'var(--mu)', fontVariantNumeric: 'tabular-nums' }}>
            Página {safePage} de {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            style={pagerBtnStyle(safePage >= totalPages)}
          >
            Siguiente →
          </button>
        </div>
      )}

      {/* Nota honesta */}
      <div className="card" style={{ marginTop: 20, borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Las tasas de retención se calculan sobre las <b>reproducciones</b> de cada anuncio (no sobre
          impresiones). La comparación de cada tarjeta es contra el <b>promedio de la propia cuenta</b>{' '}
          en la métrica por la que ordenas — no contra un estándar externo inventado. El{' '}
          <b>tiempo promedio</b> lo reporta TikTok directo. La miniatura del creativo es por ahora un
          marcador; la portada/video real se conecta en el siguiente paso. Todo proviene de{' '}
          <code>tiktok_campaigns</code>.
        </div>
      </div>

      <BackToTop />
    </div>
  );
}
