'use client';

import { useMemo, useState, useEffect, type ReactNode } from 'react';
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
} from './tiktokShared';

// ============================================================
// TikTok Ads · COMENTARIOS  (v2 · "qué dice la audiencia")
// ============================================================
// Rediseño con la misma filosofía de Campañas/Retención: menos lista cruda,
// más lectura de agencia. Lo valioso no es solo +/−, sino la INTENCIÓN:
//   ZONA 1 — Diagnóstico (la gente quiere comprar pero pregunta lo mismo) +
//            sentiment (con nota honesta de que es una heurística) + acciones
//            (Responder / Reforzar en creativo / Moderar).
//   ZONA 2 — Temas más consultados (frecuencia de dudas, capa de análisis
//            nuestra sobre el texto real) + reacción por creativo + explorador
//            filtrable (sentiment · tema · búsqueda) con paginación 10/25/100.
// Todo responde al filtro de fecha global (useTikTokComments(clientId, range))
// y se recalcula en el navegador sobre los comentarios del rango. Sentiment y
// temas están claramente etiquetados como análisis propio, no métrica oficial.
// ============================================================

const SENT: Record<Sentiment, string> = {
  positive: 'var(--up)',
  neutral: '#9aa3b2',
  negative: 'var(--dn)',
};
const SENT_LABEL: Record<Sentiment, string> = {
  positive: 'Positivo',
  neutral: 'Neutral',
  negative: 'Negativo',
};

// Normaliza para clasificar temas: minúsculas sin tildes.
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Temas de INTENCIÓN (dudas de compra). Cada uno cuenta cuántos comentarios lo
// mencionan. Es una capa de análisis nuestra sobre el texto, no un dato de TikTok.
interface Theme { key: string; label: string; re: RegExp; }
const THEMES: Theme[] = [
  { key: 'precio', label: 'Precio / cuánto', re: /precio|cuesta|cuanto vale|cuanto cuesta|\bcuanto\b|\bvale\b|\bcosto\b|pesos|\$/ },
  { key: 'bateria', label: 'Batería / autonomía', re: /bateria|autonom|carga|kilometr|\bkm\b|cuanto dura/ },
  { key: 'soat', label: 'SOAT / legal', re: /soat|\bley\b|licencia|placa|matricul|legal|documento/ },
  { key: 'garantia', label: 'Garantía', re: /garanti/ },
  { key: 'donde', label: 'Dónde comprar', re: /\bdonde\b|ubica|envio|domicilio|direccion|sucursal|tienda|se consigue|la pido|comprar/ },
  { key: 'repuestos', label: 'Repuestos / servicio', re: /repuesto|se dana|se dano|servicio tecnic|mantenimiento|arreglar/ },
  { key: 'velocidad', label: 'Velocidad', re: /velocidad|rapid|km\/h/ },
];
// Categoría de riesgo: comentarios que desaniman la compra (solo chip/acción).
const DETER_RE = /malos comentarios|desanima|no duro|no sirve|estafa|arrepent|pesim|muy mala|es mala|son malas|no la compr/;

type SentFilter = 'all' | Sentiment;
const PAGE_SIZES = [10, 25, 100];

export function TikTokComments() {
  const client = useClient();
  const { range } = usePeriod();
  const rangeLabel = formatRangeLabel(range);
  const { data, loading, error } = useTikTokComments(client.id, range);

  const [query, setQuery] = useState('');
  const [sentFilter, setSentFilter] = useState<SentFilter>('all');
  const [themeFilter, setThemeFilter] = useState<string>('all');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [query, sentFilter, themeFilter, pageSize]);

  const comments = data?.comments ?? [];

  // Conteo de temas sobre los comentarios del rango (una pasada).
  const themeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const th of THEMES) counts[th.key] = 0;
    let deter = 0;
    for (const c of comments) {
      const t = norm(c.content);
      for (const th of THEMES) if (th.re.test(t)) counts[th.key] += 1;
      if (DETER_RE.test(t)) deter += 1;
    }
    return { counts, deter };
  }, [comments]);

  // Reacción por creativo (agrega los comentarios por anuncio).
  const byAd = useMemo(() => {
    const m = new Map<string, { name: string; count: number; pos: number; neg: number; likes: number }>();
    for (const c of comments) {
      const key = c.adName || '(sin nombre)';
      let a = m.get(key);
      if (!a) { a = { name: key, count: 0, pos: 0, neg: 0, likes: 0 }; m.set(key, a); }
      a.count += 1;
      a.likes += c.likes;
      if (c.sentiment === 'positive') a.pos += 1;
      else if (c.sentiment === 'negative') a.neg += 1;
    }
    return Array.from(m.values()).sort((x, y) => y.count - x.count).slice(0, 8);
  }, [comments]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const th = THEMES.find((t) => t.key === themeFilter);
    return comments.filter((c) => {
      if (sentFilter !== 'all' && c.sentiment !== sentFilter) return false;
      if (themeFilter === 'deter' && !DETER_RE.test(norm(c.content))) return false;
      if (th && !th.re.test(norm(c.content))) return false;
      if (q && !c.content.toLowerCase().includes(q) && !c.author.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [comments, query, sentFilter, themeFilter]);

  if (loading && !data) return <TikTokLoading clientName={client.name} />;
  if (error) return <TikTokError error={error} />;
  if (!data || !data.existsEver) return <EsperandoConexion rangeLabel={rangeLabel} clientName={client.name} />;

  const s = data.summary;

  if (s.total === 0) {
    return (
      <div className="view on">
        <TikTokHero title="TikTok Ads · Comentarios" sub={<>{rangeLabel} · {client.name}</>} />
        <div className="card" style={{ padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)', marginBottom: 6 }}>Sin comentarios en este período</div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>
            No hay comentarios de TikTok para {client.name} entre <b>{rangeLabel}</b>. Prueba a ampliar el rango con el filtro de fechas de arriba.
          </div>
        </div>
        <BackToTop />
      </div>
    );
  }

  const precioN = themeCounts.counts.precio ?? 0;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);
  const maxTheme = Math.max(1, ...THEMES.map((t) => themeCounts.counts[t.key] || 0));

  return (
    <div className="view on">
      <TikTokHero
        title="TikTok Ads · Comentarios"
        sub={<>{rangeLabel} · {client.name} · {formatInt(s.total)} comentarios · {formatInt(s.totalLikes)} likes · {formatInt(data.ads.length)} anuncios</>}
      />

      {/* ═══ ZONA 1 · DIAGNÓSTICO + ACCIONES ═══ */}
      <div className="card ttc-z1" style={{ padding: '20px 22px' }}>
        <div className="ttc-head">
          <div>
            <SectionLabel style={{ margin: 0 }}>Qué dice la audiencia</SectionLabel>
            <div style={headlineStyle}>
              {precioN > 0 ? (
                <>Quieren comprar, pero preguntan lo mismo: <span style={{ color: 'var(--acc)' }}>precio</span> ({formatInt(precioN)} veces)</>
              ) : (
                <>{formatInt(s.total)} comentarios de la audiencia</>
              )}
            </div>
            <div style={headSubStyle}>
              El <b>{formatPercent(s.neutralPct, 0)}</b> cae como “neutral”, pero en su mayoría son <b>preguntas de compra</b> (precio, batería, SOAT, garantía, dónde comprar): hay <b>intención</b>, falta info. Ojo con los comentarios negativos que <b>espantan compra</b>.
            </div>
          </div>
          <div style={sentCardStyle}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--t3)' }}>Sentiment del período</div>
            <div style={sentBarStyle}>
              <span style={{ width: `${s.positivePct * 100}%`, background: SENT.positive }} />
              <span style={{ width: `${s.neutralPct * 100}%`, background: SENT.neutral }} />
              <span style={{ width: `${s.negativePct * 100}%`, background: SENT.negative }} />
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'var(--t2)' }}>
              <span><Dot c={SENT.positive} /><b>{formatInt(s.positive)}</b> pos · {formatPercent(s.positivePct, 0)}</span>
              <span><Dot c={SENT.neutral} /><b>{formatInt(s.neutral)}</b> neu · {formatPercent(s.neutralPct, 0)}</span>
              <span><Dot c={SENT.negative} /><b>{formatInt(s.negative)}</b> neg · {formatPercent(s.negativePct, 0)}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 8, lineHeight: 1.4 }}>
              El sentiment es una heurística nuestra (léxico ES), imperfecta: muchas preguntas caen como “neutral”. Por eso los <b>Temas</b> de abajo son más accionables que el +/−.
            </div>
          </div>
        </div>

        <div className="ttc-acts">
          <div className="ttc-acol">
            <div style={ahStyle('var(--up)')}><span style={dotSm('var(--up)')} />Responder / capitalizar</div>
            <div style={aiStyle}><b>Preguntas de compra</b> (precio, “¿dónde la pido?”, “cuéntame más”): <b>{formatInt((themeCounts.counts.precio || 0) + (themeCounts.counts.donde || 0))}</b> comentarios piden precio/info → respóndelos y manda a WhatsApp.</div>
            <div style={aiStyle}><b>{formatInt(s.positive)} positivos</b> (“ya la tengo y me encanta”) → fíjalos como prueba social.</div>
          </div>
          <div className="ttc-acol">
            <div style={ahStyle('var(--warn)')}><span style={dotSm('var(--warn)')} />Reforzar en creativo/landing</div>
            <div style={aiStyle}>
              Los temas que más preguntan y conviene pre-responder en el video y la página:{' '}
              {reinforceList(themeCounts.counts)}.
            </div>
          </div>
          <div className="ttc-acol">
            <div style={ahStyle('var(--dn)')}><span style={dotSm('var(--dn)')} />Moderar</div>
            <div style={aiStyle}>
              <b>{formatInt(themeCounts.deter)} comentarios</b> desaniman la compra (“con tantos malos comentarios ya no creo”, quejas de durabilidad/garantía) → respóndelos a la vista o modéralos.
            </div>
          </div>
        </div>
      </div>

      {/* ═══ ZONA 2 · TEMAS ═══ */}
      <SectionLabel style={{ margin: '24px 0 10px' }}>Temas más consultados · qué quiere saber la gente</SectionLabel>
      <div className="card" style={{ padding: '18px 22px' }}>
        {THEMES.map((th) => {
          const v = themeCounts.counts[th.key] || 0;
          return (
            <div key={th.key} style={themeRowStyle}>
              <div style={themeLabStyle}>{th.label}</div>
              <div style={themeTrackStyle}>
                <div style={{ height: '100%', width: `${(v / maxTheme) * 100}%`, borderRadius: 6, background: `linear-gradient(90deg, ${TT_CYAN}, ${TT_PINK})` }} />
              </div>
              <div style={themeValStyle}>{formatInt(v)}</div>
            </div>
          );
        })}
        <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 10, lineHeight: 1.5 }}>
          Nº de comentarios que mencionan cada tema (capa de análisis nuestra, no métrica de TikTok). Es el mapa de dudas a resolver en el copy, el video y la página.
        </div>
      </div>

      {/* ═══ REACCIÓN POR CREATIVO ═══ */}
      <SectionLabel style={{ margin: '24px 0 10px' }}>Reacción por creativo</SectionLabel>
      <div style={tblWrap}>
        <table className="t ttc-table" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th className="nos">Anuncio</th>
              <th className="nos" style={{ textAlign: 'right' }}>Coment.</th>
              <th className="nos" style={{ textAlign: 'left' }}>Sentiment</th>
              <th className="nos" style={{ textAlign: 'right' }}>Positivos</th>
              <th className="nos" style={{ textAlign: 'right' }}>Negativos</th>
              <th className="nos" style={{ textAlign: 'right' }}>Likes</th>
            </tr>
          </thead>
          <tbody>
            {byAd.map((a) => {
              const neu = a.count - a.pos - a.neg;
              return (
                <tr key={a.name}>
                  <td><span style={{ ...ellipsis, display: 'inline-block', maxWidth: 300 }} title={a.name}>{shortAd(a.name)}</span></td>
                  <td className="num">{formatInt(a.count)}</td>
                  <td>
                    <span style={sentiMini}>
                      <span style={{ width: `${(a.pos / a.count) * 100}%`, background: SENT.positive }} />
                      <span style={{ width: `${(neu / a.count) * 100}%`, background: SENT.neutral }} />
                      <span style={{ width: `${(a.neg / a.count) * 100}%`, background: SENT.negative }} />
                    </span>
                  </td>
                  <td className="num" style={{ color: 'var(--up)', fontWeight: 700 }}>+{formatInt(a.pos)}</td>
                  <td className="num" style={{ color: 'var(--dn)', fontWeight: 700 }}>−{formatInt(a.neg)}</td>
                  <td className="num">{formatInt(a.likes)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ═══ EXPLORADOR ═══ */}
      <SectionLabel style={{ margin: '24px 0 10px' }}>Explorar comentarios</SectionLabel>
      <div style={expHeadStyle}>
        <div style={chipsStyle}>
          <Chip on={sentFilter === 'all'} onClick={() => setSentFilter('all')}>Todos</Chip>
          {(['positive', 'neutral', 'negative'] as Sentiment[]).map((k) => (
            <Chip key={k} on={sentFilter === k} onClick={() => setSentFilter(k)}>{SENT_LABEL[k]}s</Chip>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--mu)' }}>
            Mostrar
            <div style={psizeWrap}>
              {PAGE_SIZES.map((n) => (
                <button key={n} onClick={() => setPageSize(n)} style={psizeBtn(pageSize === n)}>{n}</button>
              ))}
            </div>
          </div>
          <div style={{ position: 'relative', flex: '0 1 220px', minWidth: 150 }}>
            <span style={searchIcon}>⌕</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" style={searchInput} aria-label="Buscar en comentarios" />
            {query && <button onClick={() => setQuery('')} style={searchClear} title="Limpiar" aria-label="Limpiar">×</button>}
          </div>
        </div>
      </div>
      <div style={{ ...chipsStyle, marginBottom: 12 }}>
        <Chip on={themeFilter === 'all'} onClick={() => setThemeFilter('all')}>Todos los temas</Chip>
        {THEMES.map((t) => (
          <Chip key={t.key} on={themeFilter === t.key} onClick={() => setThemeFilter(t.key)}>{t.label}</Chip>
        ))}
        <Chip on={themeFilter === 'deter'} onClick={() => setThemeFilter('deter')} danger>Espantan compra</Chip>
      </div>

      {pageItems.length === 0 ? (
        <div className="card" style={{ padding: 22, textAlign: 'center', color: 'var(--mu)', fontSize: 12 }}>Ningún comentario coincide con el filtro.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {pageItems.map((c) => <CommentCard key={c.commentId} c={c} />)}
        </div>
      )}

      <div style={pagerStyle}>
        <span>{filtered.length ? start + 1 : 0}–{Math.min(start + pageSize, filtered.length)} de {formatInt(filtered.length)}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setPage(safePage - 1)} disabled={safePage <= 1} style={pagerBtn(safePage <= 1)}>‹ Anterior</button>
          <span style={{ minWidth: 74, textAlign: 'center' }}>Pág. {safePage} / {totalPages}</span>
          <button onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages} style={pagerBtn(safePage >= totalPages)}>Siguiente ›</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Comentarios reales de TikTok (tabla <code>tiktok_comments</code>), filtrados por la fecha de arriba. El <b>sentiment</b> y los <b>temas</b> son capas de análisis nuestras (léxico en español), claramente etiquetadas — no métricas oficiales de TikTok. Todo se recalcula al cambiar el rango o los filtros.
        </div>
      </div>

      <BackToTop />
    </div>
  );
}

function reinforceList(counts: Record<string, number>): ReactNode {
  const keys = ['soat', 'bateria', 'garantia', 'repuestos'] as const;
  const labels: Record<string, string> = { soat: 'SOAT', bateria: 'batería/autonomía', garantia: 'garantía', repuestos: 'repuestos' };
  const parts = keys
    .map((k) => ({ k, v: counts[k] || 0 }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v);
  if (parts.length === 0) return <b>—</b>;
  return parts.map((x, i) => (
    <span key={x.k}>{i > 0 ? ', ' : ''}<b>{labels[x.k]} ({formatInt(x.v)})</b></span>
  ));
}

// ── Tarjeta de comentario ─────────────────────────────────────────────────────
function CommentCard({ c }: { c: TikTokCommentItem }) {
  const dateLabel = c.createdAt ? new Date(c.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : '';
  const initial = (c.author || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div style={cmtStyle}>
      {c.authorAvatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.authorAvatar} alt={c.author} loading="lazy" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
      ) : (
        <span aria-hidden style={avStyle}>{initial}</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>{c.author}</span>
          <span style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4, color: SENT[c.sentiment] }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: SENT[c.sentiment] }} />
            {SENT_LABEL[c.sentiment]}
          </span>
          {dateLabel && <span style={{ fontSize: 10, color: 'var(--mu)' }}>· {dateLabel}</span>}
        </div>
        <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.45, wordBreak: 'break-word' }}>
          {c.content || <span style={{ color: 'var(--mu)', fontStyle: 'italic' }}>(comentario sin texto)</span>}
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 11, color: 'var(--mu)', flexWrap: 'wrap' }}>
          <span title="Likes">♥ {formatInt(c.likes)}</span>
          {c.replies > 0 && <span title="Respuestas">💬 {formatInt(c.replies)}</span>}
          {c.adName && <span style={{ ...ellipsis, maxWidth: 300 }} title={c.adName}>· {shortAd(c.adName)}</span>}
        </div>
      </div>
    </div>
  );
}

function Chip({ on, danger, onClick, children }: { on: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) {
  const color = danger ? 'var(--dn)' : 'var(--acc)';
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11, fontWeight: 600, padding: '5px 11px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
        border: `1px solid ${on ? 'transparent' : 'var(--b1)'}`,
        background: on ? (danger ? 'color-mix(in srgb, var(--dn) 14%, transparent)' : 'var(--acc-dim)') : 'var(--bg1)',
        color: on ? color : 'var(--t2)',
      }}
    >
      {children}
    </button>
  );
}
function Dot({ c }: { c: string }) {
  return <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: c, marginRight: 5, verticalAlign: 0 }} />;
}
const shortAd = (s: string) => s.replace(/^\(DUPLICADO[^)]*\)\s*/i, '').split('|').slice(0, 2).map((p) => p.trim()).join(' · ');

// ── Estado honesto: fuente aún no conectada ──────────────────────────────────
function EsperandoConexion({ rangeLabel, clientName }: { rangeLabel: string; clientName: string }) {
  return (
    <div className="view on">
      <TikTokHero title="TikTok Ads · Comentarios" sub={<>{rangeLabel} · {clientName} · función en preparación</>} />
      <div className="card" style={{ borderStyle: 'dashed', borderColor: `${TT_PINK}66`, background: `linear-gradient(180deg, ${TT_PINK}0d, transparent)` }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div aria-hidden style={{ width: 52, height: 52, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, background: `linear-gradient(150deg, ${TT_PINK}22, ${TT_CYAN}22)`, border: '1px solid var(--b2)' }}>💬</div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)', marginBottom: 6 }}>Esperando la conexión de los comentarios de TikTok</div>
            <div style={{ fontSize: 13, color: 'var(--mu)', lineHeight: 1.6, maxWidth: 640 }}>
              Esta hoja monitorea los <b>comentarios de tus anuncios</b>, su <b>sentiment</b> y los <b>temas</b> que más consulta la audiencia. Todavía <b>no hay datos para {clientName}</b> en este rango: en cuanto el ETL escriba filas en <code>tiktok_comments</code>, la vista se enciende sola.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── estilos ──────────────────────────────────────────────────────────────────
const headlineStyle: React.CSSProperties = { fontSize: 'clamp(19px,2.3vw,25px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, marginTop: 2 };
const headSubStyle: React.CSSProperties = { fontSize: 12.5, color: 'var(--t2)', marginTop: 9, lineHeight: 1.5 };
const sentCardStyle: React.CSSProperties = { padding: '12px 14px', borderRadius: 12, background: 'var(--bg3)', border: '1px solid var(--b1)' };
const sentBarStyle: React.CSSProperties = { display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: 'var(--track)', margin: '8px 0 10px' };
const ahStyle = (c: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase', color: c, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 });
const dotSm = (c: string): React.CSSProperties => ({ width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block' });
const aiStyle: React.CSSProperties = { fontSize: 12, padding: '6px 0', borderTop: '1px solid var(--b1)', lineHeight: 1.4, color: 'var(--t2)' };
const themeRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, margin: '7px 0' };
const themeLabStyle: React.CSSProperties = { width: 150, flex: 'none', fontSize: 12, color: 'var(--t1)', fontWeight: 600 };
const themeTrackStyle: React.CSSProperties = { flex: 1, height: 20, background: 'var(--track)', borderRadius: 6, overflow: 'hidden' };
const themeValStyle: React.CSSProperties = { width: 48, flex: 'none', textAlign: 'right', fontSize: 12, fontWeight: 800, fontFamily: "'Space Grotesk',sans-serif" };
const tblWrap: React.CSSProperties = { overflowX: 'auto', border: '1px solid var(--b1)', borderRadius: 14, background: 'var(--bg1)' };
const sentiMini: React.CSSProperties = { display: 'inline-flex', height: 8, width: 90, borderRadius: 4, overflow: 'hidden', background: 'var(--track)', verticalAlign: 'middle' };
const expHeadStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 };
const chipsStyle: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap' };
const cmtStyle: React.CSSProperties = { display: 'flex', gap: 11, padding: '11px 13px', borderRadius: 11, background: 'var(--bg1)', border: '1px solid var(--b1)' };
const avStyle: React.CSSProperties = { width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--t1)', background: `linear-gradient(150deg, ${TT_PINK}22, ${TT_CYAN}22)` };
const pagerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 12, fontSize: 11.5, color: 'var(--mu)' };
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
