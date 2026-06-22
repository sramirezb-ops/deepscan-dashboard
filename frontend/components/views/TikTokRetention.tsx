'use client';

import { useMemo, useState } from 'react';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useTikTok, type TikTokAdRow } from '@/lib/hooks/useTikTok';
import { formatCurrency, formatInt, formatNumber, formatPercent } from '@/lib/utils';
import {
  TT_PINK,
  TT_CYAN,
  TikTokLoading,
  TikTokError,
  TikTokEmpty,
  TikTokHero,
  VideoStat,
  WatchTimeStat,
  RetentionCurve,
  MiniRetentionBar,
  CreativeThumb,
} from './tiktokShared';

// ============================================================
// TikTok Ads · RETENCIÓN DE LOS ANUNCIOS
// ============================================================
// Vista 3 de 3. El foco es el CREATIVO: qué anuncio engancha y retiene. Arriba,
// la curva de retención global; abajo, el ranking de anuncios con su embudo de
// retención (gancho 2s, 6s, 50 %, completo) y tiempo promedio. Se ordena por el
// criterio que elija el usuario. Solo anuncios con reproducciones de video.
// ============================================================

type SortKey = 'views' | 'hook' | 'hold' | 'completion' | 'watch';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'views', label: 'Reproducciones' },
  { key: 'hook', label: 'Gancho 2s' },
  { key: 'hold', label: 'Retención 6s' },
  { key: 'completion', label: 'Completado' },
  { key: 'watch', label: 'Tiempo prom.' },
];

function sortValue(a: TikTokAdRow, key: SortKey): number {
  switch (key) {
    case 'views': return a.video.views;
    case 'hook': return a.video.hookRate;
    case 'hold': return a.video.holdRate;
    case 'completion': return a.video.completionRate;
    case 'watch': return a.video.avgWatchTime;
  }
}

export function TikTokRetention() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useTikTok(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const cur = client.currency;

  const [sort, setSort] = useState<SortKey>('views');

  // Solo anuncios con reproducciones de video (sin video no hay retención).
  const ads = useMemo(() => {
    const list = (data?.ads ?? []).filter((a) => a.video.views > 0);
    list.sort((x, y) => sortValue(y, sort) - sortValue(x, sort));
    return list;
  }, [data, sort]);

  if (loading && !data) return <TikTokLoading clientName={client.name} />;
  if (error) return <TikTokError error={error} />;
  if (!data || data.totals.spend === 0)
    return <TikTokEmpty data={data} clientName={client.name} rangeLabel={rangeLabel} />;

  const v = data.video;

  return (
    <div className="view on">
      <TikTokHero
        title="TikTok Ads · Retención de los anuncios"
        sub={
          <>
            {rangeLabel} · {client.name} · {formatNumber(v.views)} reproducciones ·{' '}
            {formatInt(ads.length)} anuncios con video
          </>
        }
      />

      {/* Retención global */}
      {v.views > 0 && (
        <div className="card">
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
            <h3 style={{ margin: 0, fontSize: '15px' }}>Retención global</h3>
            <span className="period-pill">{formatNumber(v.views)} reproducciones</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 16, lineHeight: 1.5 }}>
            Promedio de todos los anuncios. En TikTok el creativo manda: el <b>gancho (2s)</b> mide
            cuántos no se fueron al instante; la <b>retención (6s)</b>, cuántos siguen viendo; y la
            curva muestra dónde cae la atención. Abajo, el detalle por anuncio.
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 16,
            }}
          >
            <VideoStat label="Gancho (vieron 2s)" pct={v.hookRate} abs={v.watched2s} color={TT_PINK} />
            <VideoStat label="Retención (6s)" pct={v.holdRate} abs={v.watched6s} color={TT_CYAN} />
            <VideoStat label="Video completo" pct={v.completionRate} abs={v.completes} color="#22d97a" />
            <WatchTimeStat seconds={v.avgWatchTime} />
          </div>
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', marginBottom: 10 }}>
              Curva de retención
            </div>
            <RetentionCurve v={v} />
          </div>
        </div>
      )}

      {/* Controles de orden */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          margin: '20px 0 12px',
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--mu)' }}>Ordenar por:</span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSort(s.key)}
            className="period-pill"
            style={{
              cursor: 'pointer',
              border: sort === s.key ? `1px solid ${TT_PINK}` : '1px solid var(--b2)',
              color: sort === s.key ? 'var(--t1)' : 'var(--mu)',
              background: sort === s.key ? `${TT_PINK}1a` : 'transparent',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Ranking de anuncios */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
        {ads.map((a, i) => (
          <div key={a.adId} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <CreativeThumb name={a.name} coverUrl={a.coverUrl} videoUrl={a.videoUrl} size="lg" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: TT_PINK,
                      flexShrink: 0,
                    }}
                  >
                    #{i + 1}
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
        ))}
      </div>

      {ads.length === 0 && (
        <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--mu)', fontSize: 13 }}>
          No hay anuncios con reproducciones de video en este período.
        </div>
      )}

      {/* Nota honesta */}
      <div className="card" style={{ marginTop: 20, borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Las tasas de retención se calculan sobre las <b>reproducciones</b> de cada anuncio (no sobre
          impresiones). El <b>tiempo promedio</b> lo reporta TikTok directo. La miniatura del creativo
          es por ahora un marcador; la portada/video real se conecta en el siguiente paso. Todo
          proviene de <code>tiktok_campaigns</code>.
        </div>
      </div>
    </div>
  );
}
