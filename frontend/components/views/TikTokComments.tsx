'use client';

import { useMemo, useState, useEffect } from 'react';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { formatInt, formatPercent } from '@/lib/utils';
import { useTikTokComments } from '@/lib/hooks/useTikTokComments';
import type { Sentiment, TikTokCommentItem } from '@/lib/hooks/useTikTokComments';
import {
  TT_PINK,
  TT_CYAN,
  TikTokHero,
  TikTokLoading,
  TikTokError,
  SectionLabel,
  BackToTop,
  chipStyle,
  toolbarStyle,
  searchInputStyle,
  searchIconStyle,
  searchClearStyle,
  selectStyle,
} from './tiktokShared';

// ============================================================
// TikTok Ads · COMENTARIOS
// ============================================================
// Vista 4 de TikTok. Monitorea los comentarios de los anuncios y su SENTIMENT
// para entender la reacción real de la audiencia al creativo.
//
// Los datos vienen de la tabla `tiktok_comments` (la llena el ETL
// etl/extractors/tiktok_comments.py). El sentiment NO es una métrica de TikTok:
// lo DERIVA el ETL con una heurística de léxico en español. Lo decimos con
// honestidad en la propia hoja. Mientras la fuente no escriba comentarios,
// se muestra el marcador "esperando conexión" en vez de inventar nada.
// ============================================================

// Colores de sentiment.
const SENT: Record<Sentiment, string> = {
  positive: '#22d97a',
  neutral: '#9aa3b2',
  negative: '#f87171',
};
const SENT_LABEL: Record<Sentiment, string> = {
  positive: 'Positivo',
  neutral: 'Neutral',
  negative: 'Negativo',
};

const PER_PAGE = 20;

export function TikTokComments() {
  const client = useClient();
  const { range } = usePeriod();
  const rangeLabel = formatRangeLabel(range);
  const { data, loading, error } = useTikTokComments(client.id, range);

  // Filtros de la lista.
  const [query, setQuery] = useState('');
  const [adFilter, setAdFilter] = useState('all');
  const [sentFilter, setSentFilter] = useState<'all' | Sentiment>('all');
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [query, adFilter, sentFilter]);

  const comments = data?.comments ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return comments.filter((c) => {
      if (adFilter !== 'all' && (c.adId || c.adName) !== adFilter) return false;
      if (sentFilter !== 'all' && c.sentiment !== sentFilter) return false;
      if (q && !c.content.toLowerCase().includes(q) && !c.author.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [comments, query, adFilter, sentFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  if (loading && !data) return <TikTokLoading clientName={client.name} />;
  if (error) return <TikTokError error={error} />;

  // ── Estado honesto: la fuente aún no escribió comentarios ──────────────────
  if (!data || !data.existsEver) {
    return <EsperandoConexion rangeLabel={rangeLabel} clientName={client.name} />;
  }

  const s = data.summary;

  return (
    <div className="view on">
      <TikTokHero
        title="TikTok Ads · Comentarios"
        sub={
          <>
            {rangeLabel} · {client.name} · {formatInt(s.total)} comentarios ·{' '}
            {formatInt(s.totalLikes)} likes
          </>
        }
      />

      {data.existsEver && s.total === 0 ? (
        // Hay comentarios en otras fechas, pero no en este rango.
        <div className="card" style={{ padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)', marginBottom: 6 }}>
            Sin comentarios en este período
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>
            No hay comentarios de TikTok para {client.name} entre <b>{rangeLabel}</b>. Prueba a
            ampliar el rango con el filtro de fechas de arriba.
          </div>
        </div>
      ) : (
        <>
          {/* Resumen de sentiment */}
          <SectionLabel>Sentiment del período</SectionLabel>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 10,
            }}
          >
            <SentimentStat label="Comentarios" big={formatInt(s.total)} hint="total del período" color="var(--t1)" />
            <SentimentStat
              label="Positivos"
              big={formatInt(s.positive)}
              hint={`${formatPercent(s.positivePct, 0)} del total`}
              color={SENT.positive}
            />
            <SentimentStat
              label="Neutrales"
              big={formatInt(s.neutral)}
              hint={`${formatPercent(s.neutralPct, 0)} del total`}
              color={SENT.neutral}
            />
            <SentimentStat
              label="Negativos"
              big={formatInt(s.negative)}
              hint={`${formatPercent(s.negativePct, 0)} del total`}
              color={SENT.negative}
            />
          </div>

          {/* Barra de distribución de sentiment */}
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', background: 'var(--bg3)' }}>
              {(['positive', 'neutral', 'negative'] as Sentiment[]).map((k) => {
                const pct = k === 'positive' ? s.positivePct : k === 'neutral' ? s.neutralPct : s.negativePct;
                if (pct <= 0) return null;
                return (
                  <div
                    key={k}
                    title={`${SENT_LABEL[k]}: ${formatPercent(pct, 1)}`}
                    style={{ width: `${pct * 100}%`, background: SENT[k] }}
                  />
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
              {(['positive', 'neutral', 'negative'] as Sentiment[]).map((k) => (
                <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--mu)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: SENT[k] }} />
                  {SENT_LABEL[k]}
                </span>
              ))}
            </div>
          </div>

          {/* Toolbar: búsqueda + filtro por anuncio + conteo */}
          <SectionLabel style={{ marginTop: 22 }}>Comentarios</SectionLabel>
          <div style={toolbarStyle}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 360 }}>
              <span style={searchIconStyle}>⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar en comentarios o autor…"
                style={searchInputStyle}
              />
              {query && (
                <button style={searchClearStyle} onClick={() => setQuery('')} aria-label="Limpiar">
                  ×
                </button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <select value={adFilter} onChange={(e) => setAdFilter(e.target.value)} style={selectStyle}>
                <option value="all">Todos los anuncios ({data.ads.length})</option>
                {data.ads.map((a) => (
                  <option key={a.adId} value={a.adId}>
                    {a.adName.length > 40 ? a.adName.slice(0, 40) + '…' : a.adName} ({a.count})
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 11, color: 'var(--mu)', whiteSpace: 'nowrap' }}>
                {formatInt(filtered.length)} comentarios
              </span>
            </div>
          </div>

          {/* Chips de sentiment */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 12px' }}>
            <button style={chipStyle(sentFilter === 'all')} onClick={() => setSentFilter('all')}>
              Todos
            </button>
            {(['positive', 'neutral', 'negative'] as Sentiment[]).map((k) => (
              <button key={k} style={chipStyle(sentFilter === k)} onClick={() => setSentFilter(k)}>
                {SENT_LABEL[k]}
              </button>
            ))}
          </div>

          {/* Lista de comentarios */}
          {pageItems.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--mu)' }}>
              Ningún comentario coincide con el filtro.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pageItems.map((c) => (
                <CommentCard key={c.commentId} c={c} />
              ))}
            </div>
          )}

          {/* Paginación */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                style={pagerStyle(safePage <= 1)}
              >
                ← Anterior
              </button>
              <span style={{ fontSize: 11, color: 'var(--mu)' }}>
                Página {safePage} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                style={pagerStyle(safePage >= totalPages)}
              >
                Siguiente →
              </button>
            </div>
          )}

          {/* Nota honesta sobre el sentiment */}
          <div style={{ fontSize: 10, color: 'var(--mu)', marginTop: 18, lineHeight: 1.6 }}>
            El <b>sentiment</b> (positivo / neutral / negativo) lo calcula el ETL con una heurística
            de léxico en español, no es una métrica oficial de TikTok. Sirve como guía de la reacción
            general; cada comentario se muestra tal cual lo escribió la audiencia.
          </div>
        </>
      )}

      <BackToTop />
    </div>
  );
}

// ── Tarjeta de un comentario ─────────────────────────────────────────────────
function CommentCard({ c }: { c: TikTokCommentItem }) {
  const dateLabel = c.createdAt
    ? new Date(c.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short' })
    : '';
  const initial = (c.author || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 10,
        background: 'var(--bg3)',
        border: '1px solid var(--b2)',
      }}
    >
      {/* Avatar (o inicial honesta si no hay) */}
      {c.authorAvatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={c.authorAvatar}
          alt={c.author}
          loading="lazy"
          style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--t1)',
            background: `linear-gradient(150deg, ${TT_PINK}22, ${TT_CYAN}22)`,
          }}
        >
          {initial}
        </span>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)' }}>{c.author}</span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 10,
              color: SENT[c.sentiment],
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: SENT[c.sentiment] }} />
            {SENT_LABEL[c.sentiment]}
          </span>
          {dateLabel && <span style={{ fontSize: 10, color: 'var(--mu)' }}>· {dateLabel}</span>}
        </div>

        <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.5, wordBreak: 'break-word' }}>
          {c.content || <span style={{ color: 'var(--mu)', fontStyle: 'italic' }}>(comentario sin texto)</span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 7, fontSize: 11, color: 'var(--mu)' }}>
          <span title="Likes">♥ {formatInt(c.likes)}</span>
          {c.replies > 0 && <span title="Respuestas">💬 {formatInt(c.replies)}</span>}
          {c.adName && (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }} title={c.adName}>
              · {c.adName}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tarjeta de resumen de sentiment ──────────────────────────────────────────
function SentimentStat({
  label,
  big,
  hint,
  color,
}: {
  label: string;
  big: string;
  hint: string;
  color: string;
}) {
  return (
    <div
      style={{
        background: 'var(--bg3)',
        border: '1px solid var(--b2)',
        borderRadius: 10,
        padding: '11px 13px 9px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {big}
      </div>
      <div style={{ fontSize: 10, color: 'var(--mu)' }}>{hint}</div>
    </div>
  );
}

function pagerStyle(disabled: boolean): React.CSSProperties {
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

// ── Estado honesto: la fuente de comentarios aún no está conectada ───────────
function EsperandoConexion({ rangeLabel, clientName }: { rangeLabel: string; clientName: string }) {
  return (
    <div className="view on">
      <TikTokHero
        title="TikTok Ads · Comentarios"
        sub={
          <>
            {rangeLabel} · {clientName} · función en preparación
          </>
        }
      />

      <div
        className="card"
        style={{
          borderStyle: 'dashed',
          borderColor: `${TT_PINK}66`,
          background: `linear-gradient(180deg, ${TT_PINK}0d, transparent)`,
        }}
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div
            aria-hidden
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              background: `linear-gradient(150deg, ${TT_PINK}22, ${TT_CYAN}22)`,
              border: '1px solid var(--b2)',
            }}
          >
            💬
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)', marginBottom: 6 }}>
              Esperando la conexión de los comentarios de TikTok
            </div>
            <div style={{ fontSize: 13, color: 'var(--mu)', lineHeight: 1.6, maxWidth: 640 }}>
              Esta hoja monitoreará los <b>comentarios de tus anuncios</b> y su <b>sentiment</b>{' '}
              (positivo / neutral / negativo) para entender cómo reacciona la audiencia a cada
              creativo. Todavía <b>no hay datos reales que mostrar</b>: el ETL de comentarios ya está
              construido, pero aún no ha escrito filas en <code>tiktok_comments</code> (falta aplicar
              la migración y/o la primera corrida con permiso de comentarios). En cuanto lleguen, esta
              vista se encenderá automáticamente con datos en vivo.
            </div>
          </div>
        </div>
      </div>

      <SectionLabel style={{ marginTop: 22 }}>Qué se necesita para encender esta hoja</SectionLabel>
      <div className="card">
        <div style={{ fontSize: 13, color: 'var(--mu)', lineHeight: 1.7 }}>
          <div style={{ marginBottom: 10 }}>
            El <b style={{ color: 'var(--t1)' }}>ETL ya existe</b> (
            <code>etl/extractors/tiktok_comments.py</code>): pide los comentarios a la TikTok
            Marketing API y deriva el sentiment con una heurística de léxico en español. Para que
            empiecen a aparecer datos faltan dos pasos:
          </div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--t2)' }}>
            <li>
              Aplicar la migración <code>0010_tiktok_comments.sql</code> en Supabase (crea la tabla).
            </li>
            <li>
              Que el token de TikTok tenga permiso de <b>gestión de comentarios</b> y corra el ETL
              (cron diario o disparo manual).
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
