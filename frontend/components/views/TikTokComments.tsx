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
// TikTok Ads · COMENTARIOS  (v3 · "qué dice la audiencia")
// ============================================================
// Menos lista cruda, más lectura de agencia. Lo valioso no es el +/− sino la
// INTENCIÓN (la gente quiere comprar y pregunta lo mismo) y las PREGUNTAS SIN
// RESPONDER (leads que se escapan).
//   ZONA 1 — Diagnóstico + acciones compactas (Responder / Reforzar / Moderar).
//   ZONA 2 — Intención + Temas (barras) · Preguntas sin responder · FAQ con la
//            respuesta real de la marca · Discusiones/HILOS (respuestas anidadas
//            bajo su comentario, marca vs comunidad) · Moderación · Explorador.
// Todo responde al filtro de fecha global y se recalcula en el navegador.
// Sentiment/intención/temas son capas de análisis propias (léxico ES),
// claramente etiquetadas. Los hilos usan parent_comment_id (dato real).
// ============================================================

const SENT: Record<Sentiment, string> = { positive: 'var(--up)', neutral: '#9aa3b2', negative: 'var(--dn)' };
const SENT_LABEL: Record<Sentiment, string> = { positive: 'Positivo', neutral: 'Neutral', negative: 'Negativo' };
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const isBrand = (a: string) => a.toLowerCase().includes('ofero');
const isQuestion = (t: string) =>
  t.includes('?') || /\b(cuanto|cuánto|donde|dónde|como|cómo|precio|cuesta|vale|garant|soat|bateria|batería|repuesto|sirve|funciona|entrega|env[ií]o)\b/.test(norm(t));

interface Theme { key: string; label: string; re: RegExp; }
const THEMES: Theme[] = [
  { key: 'precio', label: 'Precio', re: /precio|cuesta|cuanto vale|cuanto cuesta|\bcuanto\b|\bvale\b|\bcosto\b|pesos|\$/ },
  { key: 'bateria', label: 'Batería / autonomía', re: /bateria|autonom|carga|kilometr|\bkm\b|cuanto dura/ },
  { key: 'donde', label: 'Dónde comprar', re: /\bdonde\b|ubica|envio|domicilio|sucursal|tienda|se consigue|la pido|comprar/ },
  { key: 'soat', label: 'SOAT / legal', re: /soat|\bley\b|licencia|placa|matricul|legal|documento|regula/ },
  { key: 'garantia', label: 'Garantía', re: /garanti/ },
  { key: 'repuestos', label: 'Repuestos / servicio', re: /repuesto|se dana|se dano|servicio tecnic|mantenimiento|arreglar/ },
  { key: 'velocidad', label: 'Velocidad', re: /velocidad|rapid|km\/h/ },
];
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

  // ── Analítica derivada (una pasada) ──
  const an = useMemo(() => analyze(comments), [comments]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const th = THEMES.find((t) => t.key === themeFilter);
    // El explorador muestra comentarios de nivel raíz (no las respuestas sueltas).
    return an.topLevel.filter((c) => {
      if (sentFilter !== 'all' && c.sentiment !== sentFilter) return false;
      if (themeFilter === 'deter' && !DETER_RE.test(norm(c.content))) return false;
      if (th && !th.re.test(norm(c.content))) return false;
      if (q && !c.content.toLowerCase().includes(q) && !c.author.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [an, query, sentFilter, themeFilter]);

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
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>No hay comentarios de TikTok para {client.name} entre <b>{rangeLabel}</b>. Amplía el rango de fechas.</div>
        </div>
        <BackToTop />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);
  const qPct = an.topLevel.length > 0 ? an.questions.length / an.topLevel.length : 0;

  return (
    <div className="view on">
      <TikTokHero
        title="TikTok Ads · Comentarios"
        sub={<>{rangeLabel} · {client.name} · {formatInt(an.topLevel.length)} comentarios · {formatInt(an.replies.length)} respuestas · {formatInt(data.ads.length)} anuncios</>}
      />

      {/* ═══ ZONA 1 · DIAGNÓSTICO + ACCIONES ═══ */}
      <div className="card ttc-z1" style={{ padding: '20px 22px' }}>
        <div className="ttc-head">
          <div>
            <SectionLabel style={{ margin: 0 }}>Qué dice la audiencia</SectionLabel>
            <div style={headlineStyle}>
              El <span style={{ color: 'var(--acc)' }}>{formatPercent(qPct, 0)}</span> son preguntas de compra — y <span style={{ color: 'var(--dn)' }}>{formatInt(an.unanswered.length)}</span> sin responder
            </div>
            <div style={headSubStyle}>Quieren comprar y preguntan lo mismo: precio, batería, SOAT, garantía. Cada pregunta sin responder es un lead que se escapa.</div>
          </div>
          <div className="ret-kpis">
            <Stat label="Comentarios" value={formatInt(an.topLevel.length)} sub={`+${formatInt(an.replies.length)} respuestas`} />
            <Stat label="Preguntas" value={formatInt(an.questions.length)} sub={`${formatPercent(qPct, 0)} del total`} />
            <Stat label="Sin responder" value={formatInt(an.unanswered.length)} sub="oportunidad" color="var(--dn)" />
            <Stat label="Respuestas marca" value={formatInt(an.brandReplies)} sub="@oferocolombia" />
            <Stat label="Ocultos" value={formatInt(an.hidden.total)} sub="moderados" color="var(--warn)" />
            <Stat label="Sentiment" value={`${Math.round(s.positivePct * 100)}/${Math.round(s.neutralPct * 100)}/${Math.round(s.negativePct * 100)}`} sub="+ / neu / −" />
          </div>
        </div>
        <div className="ttc-acts">
          <ActionStrip color="var(--up)" title="Responder" big={formatInt(an.unanswered.length)} lab="preguntas → WhatsApp" />
          <ActionStrip color="var(--warn)" title="Reforzar" big={reinforceTop(an.themeCounts)} lab="en video y landing" small />
          <ActionStrip color="var(--dn)" title="Moderar" big={formatInt(an.hidden.total)} lab="ocultos · revisar" />
        </div>
      </div>

      {/* ═══ INTENCIÓN + TEMAS ═══ */}
      <div className="cmt-grid2">
        <div>
          <SectionLabel style={{ margin: '18px 0 10px' }}>Intención (más allá del +/−)</SectionLabel>
          <div className="card" style={{ padding: '16px 18px' }}>
            <Bars rows={an.intent} />
          </div>
        </div>
        <div>
          <SectionLabel style={{ margin: '18px 0 10px' }}>Temas más consultados</SectionLabel>
          <div className="card" style={{ padding: '16px 18px' }}>
            <Bars rows={THEMES.map((t) => ({ label: t.label, value: an.themeCounts[t.key] || 0, grad: true }))} />
          </div>
        </div>
      </div>

      {/* ═══ PREGUNTAS SIN RESPONDER ═══ */}
      <SectionLabel style={{ margin: '24px 0 10px' }}>Preguntas sin responder · la mina de oro ({formatInt(an.unanswered.length)})</SectionLabel>
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {an.unanswered.slice(0, 8).map((c) => (
            <div key={c.commentId} style={miniq}>
              <span style={{ fontSize: 11, color: 'var(--t3)', flex: 'none', width: 40 }}>♥ {formatInt(c.likes)}</span>
              <span style={{ flex: 1, minWidth: 0, ...ellipsis }} title={c.content}>{c.content}</span>
              <span style={miniqCta}>Responder</span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ FAQ ═══ */}
      <SectionLabel style={{ margin: '24px 0 10px' }}>FAQ · lo que preguntan y cómo responde la marca</SectionLabel>
      <div className="card" style={{ padding: '4px 6px' }}>
        {an.faq.map((f, i) => <FaqRow key={f.key} f={f} first={i === 0} />)}
      </div>

      {/* ═══ DISCUSIONES / HILOS ═══ */}
      <SectionLabel style={{ margin: '24px 0 10px' }}>Discusiones · comentarios que generan hilos ({formatInt(an.threads.length)})</SectionLabel>
      <div className="card" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {an.threads.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--mu)', padding: 12, textAlign: 'center' }}>No hay hilos con respuestas enlazadas en este rango.</div>
        ) : (
          an.threads.slice(0, 8).map((t) => <Thread key={t.parent.commentId} t={t} />)
        )}
      </div>

      {/* ═══ MODERACIÓN ═══ */}
      <SectionLabel style={{ margin: '24px 0 10px' }}>Moderación · qué se está ocultando ({formatInt(an.hidden.total)})</SectionLabel>
      <div className="card" style={{ padding: '16px 18px' }}>
        <Bars rows={[
          { label: 'Spam / neutral', value: an.hidden.neutral, color: '#9aa3b2' },
          { label: 'Negativos', value: an.hidden.negative, color: 'var(--dn)' },
          { label: 'Positivos', value: an.hidden.positive, color: 'var(--up)' },
        ]} />
        {an.hidden.positive > 0 && (
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 8 }}>⚠ {formatInt(an.hidden.positive)} positivos ocultos (¿por error?) — revisa que la moderación no tape leads.</div>
        )}
      </div>

      {/* ═══ EXPLORADOR ═══ */}
      <SectionLabel style={{ margin: '24px 0 10px' }}>Explorar comentarios</SectionLabel>
      <div style={expHead}>
        <div style={chips}>
          <Chip on={sentFilter === 'all'} onClick={() => setSentFilter('all')}>Todos</Chip>
          {(['positive', 'neutral', 'negative'] as Sentiment[]).map((k) => (
            <Chip key={k} on={sentFilter === k} onClick={() => setSentFilter(k)}>{SENT_LABEL[k]}s</Chip>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--mu)' }}>
            Mostrar<div style={psizeWrap}>{PAGE_SIZES.map((n) => <button key={n} onClick={() => setPageSize(n)} style={psizeBtn(pageSize === n)}>{n}</button>)}</div>
          </div>
          <div style={{ position: 'relative', flex: '0 1 220px', minWidth: 150 }}>
            <span style={searchIcon}>⌕</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" style={searchInput} aria-label="Buscar" />
            {query && <button onClick={() => setQuery('')} style={searchClear} title="Limpiar" aria-label="Limpiar">×</button>}
          </div>
        </div>
      </div>
      <div style={{ ...chips, marginBottom: 12 }}>
        <Chip on={themeFilter === 'all'} onClick={() => setThemeFilter('all')}>Todos los temas</Chip>
        {THEMES.map((t) => <Chip key={t.key} on={themeFilter === t.key} onClick={() => setThemeFilter(t.key)}>{t.label}</Chip>)}
        <Chip on={themeFilter === 'deter'} onClick={() => setThemeFilter('deter')} danger>Espantan compra</Chip>
      </div>
      {pageItems.length === 0 ? (
        <div className="card" style={{ padding: 22, textAlign: 'center', color: 'var(--mu)', fontSize: 12 }}>Ningún comentario coincide con el filtro.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{pageItems.map((c) => <CommentCard key={c.commentId} c={c} repliesN={an.byParent.get(c.commentId)?.length ?? 0} />)}</div>
      )}
      <div style={pager}>
        <span>{filtered.length ? start + 1 : 0}–{Math.min(start + pageSize, filtered.length)} de {formatInt(filtered.length)}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setPage(safePage - 1)} disabled={safePage <= 1} style={pagerBtn(safePage <= 1)}>‹ Anterior</button>
          <span style={{ minWidth: 74, textAlign: 'center' }}>Pág. {safePage} / {totalPages}</span>
          <button onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages} style={pagerBtn(safePage >= totalPages)}>Siguiente ›</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Dato real de TikTok (`tiktok_comments`), filtrado por fecha. <b>Sentiment, intención, temas y FAQ</b> son capas de análisis nuestras (léxico ES), no métricas oficiales de TikTok. Los <b>hilos</b> se arman con `parent_comment_id` (respuestas enlazadas a su comentario). El FAQ usa las respuestas reales de <b>@oferocolombia</b>.
        </div>
      </div>
      <BackToTop />
    </div>
  );
}

// ── Analítica ────────────────────────────────────────────────────────────────
interface ThreadT { parent: TikTokCommentItem; replies: TikTokCommentItem[]; }
interface FaqT { key: string; label: string; count: number; answer: string; hasBrand: boolean; }
function analyze(comments: TikTokCommentItem[]) {
  const topLevel = comments.filter((c) => c.commentType !== 'REPLY');
  const replies = comments.filter((c) => c.commentType === 'REPLY');
  const ids = new Set(comments.map((c) => c.commentId));

  const byParent = new Map<string, TikTokCommentItem[]>();
  for (const r of replies) {
    if (!r.parentCommentId || !ids.has(r.parentCommentId)) continue;
    const arr = byParent.get(r.parentCommentId) ?? [];
    arr.push(r);
    byParent.set(r.parentCommentId, arr);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => b.likes - a.likes);

  const questions = topLevel.filter((c) => isQuestion(c.content));
  const unanswered = questions
    .filter((c) => !isBrand(c.author) && (byParent.get(c.commentId)?.length ?? 0) === 0)
    .sort((a, b) => b.likes - a.likes);
  const brandReplies = replies.filter((r) => isBrand(r.author)).length;

  const themeCounts: Record<string, number> = {};
  for (const th of THEMES) themeCounts[th.key] = 0;
  for (const c of topLevel) {
    const t = norm(c.content);
    for (const th of THEMES) if (th.re.test(t)) themeCounts[th.key] += 1;
  }

  // Intención (real, derivada de sentiment + detección de pregunta).
  let elogios = 0, quejas = 0;
  for (const c of topLevel) {
    if (isQuestion(c.content)) continue;
    if (c.sentiment === 'positive') elogios += 1;
    else if (c.sentiment === 'negative') quejas += 1;
  }
  const otros = topLevel.length - questions.length - elogios - quejas;
  const intent = [
    { label: 'Preguntas', value: questions.length, color: 'var(--acc)' },
    { label: 'Elogios', value: elogios, color: 'var(--up)' },
    { label: 'Quejas / objeción', value: quejas, color: 'var(--dn)' },
    { label: 'Memes / otros', value: Math.max(0, otros), color: '#9aa3b2' },
  ];

  // FAQ: por tema, la mejor respuesta real de la marca que toque ese tema.
  const brandReplyList = replies.filter((r) => isBrand(r.author)).sort((a, b) => b.likes - a.likes);
  const faq: FaqT[] = THEMES.filter((t) => (themeCounts[t.key] || 0) >= 5).slice(0, 6).map((t) => {
    const ans = brandReplyList.find((r) => t.re.test(norm(r.content)));
    return { key: t.key, label: t.label, count: themeCounts[t.key] || 0, answer: ans?.content || 'Sin respuesta oficial todavía — tema recurrente por resolver.', hasBrand: !!ans };
  });

  const threads: ThreadT[] = topLevel
    .map((c) => ({ parent: c, replies: byParent.get(c.commentId) ?? [] }))
    .filter((t) => t.replies.length > 0)
    .sort((a, b) => b.replies.length - a.replies.length);

  const hiddenRows = comments.filter((c) => c.commentStatus === 'HIDDEN');
  const hidden = {
    total: hiddenRows.length,
    positive: hiddenRows.filter((c) => c.sentiment === 'positive').length,
    negative: hiddenRows.filter((c) => c.sentiment === 'negative').length,
    neutral: hiddenRows.filter((c) => c.sentiment === 'neutral').length,
  };

  return { topLevel, replies, byParent, questions, unanswered, brandReplies, themeCounts, intent, faq, threads, hidden };
}

function reinforceTop(counts: Record<string, number>): string {
  const keys = ['soat', 'bateria', 'garantia', 'repuestos'] as const;
  const lab: Record<string, string> = { soat: 'SOAT', bateria: 'batería', garantia: 'garantía', repuestos: 'repuestos' };
  const top = keys.map((k) => ({ k, v: counts[k] || 0 })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 2);
  return top.length ? top.map((x) => lab[x.k]).join(' · ') : '—';
}

// ── Piezas ───────────────────────────────────────────────────────────────────
function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div style={{ padding: '9px 11px', borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--b1)' }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--mu)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2, color: color || 'var(--t1)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 9.5, color: 'var(--t3)', marginTop: 1 }}>{sub}</div>
    </div>
  );
}
function ActionStrip({ color, title, big, lab, small }: { color: string; title: string; big: string; lab: string; small?: boolean }) {
  return (
    <div className="ttc-acol">
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase', color, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />{title}
      </div>
      <div style={{ fontSize: small ? 16 : 22, fontWeight: 800, fontFamily: "'Space Grotesk',sans-serif", lineHeight: 1.1, color }}>{big}</div>
      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 1 }}>{lab}</div>
    </div>
  );
}
function Bars({ rows }: { rows: { label: string; value: number; color?: string; grad?: boolean }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '6px 0' }}>
          <div style={{ width: 150, flex: 'none', fontSize: 12, color: 'var(--t1)', fontWeight: 600, ...ellipsis }}>{r.label}</div>
          <div style={{ flex: 1, height: 18, background: 'var(--track)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(r.value / max) * 100}%`, borderRadius: 6, background: r.grad ? `linear-gradient(90deg, ${TT_CYAN}, ${TT_PINK})` : r.color || 'var(--acc)' }} />
          </div>
          <div style={{ width: 44, flex: 'none', textAlign: 'right', fontSize: 12, fontWeight: 800, fontFamily: "'Space Grotesk',sans-serif" }}>{formatInt(r.value)}</div>
        </div>
      ))}
    </>
  );
}
function FaqRow({ f, first }: { f: FaqT; first: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: '12px 12px', borderTop: first ? 'none' : '1px solid var(--b1)' }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
          <span style={{ fontSize: 10, color: 'var(--t3)' }}>{open ? '▾' : '▸'}</span>{f.label}
        </span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, color: f.hasBrand ? 'var(--up)' : 'var(--dn)', border: `1px solid ${f.hasBrand ? 'var(--up)' : 'var(--dn)'}` }}>{f.hasBrand ? '✓ marca' : '✗ falta'}</span>
          <span style={{ fontSize: 10.5, fontWeight: 800, fontFamily: "'Space Grotesk',sans-serif", color: 'var(--acc)', background: 'var(--acc-dim)', padding: '2px 9px', borderRadius: 999 }}>{formatInt(f.count)}</span>
        </span>
      </div>
      {open && (
        <div style={{ fontSize: 12, color: f.hasBrand ? 'var(--t2)' : 'var(--dn)', marginTop: 7, lineHeight: 1.45, paddingLeft: 18 }}>{f.answer}</div>
      )}
    </div>
  );
}
function Thread({ t }: { t: ThreadT }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: '1px solid var(--b1)', borderRadius: 12, padding: 6, background: 'var(--bg1)' }}>
      <CommentCard c={t.parent} repliesN={t.replies.length} />
      <div onClick={() => setOpen((o) => !o)} style={{ fontSize: 11.5, color: 'var(--acc)', fontWeight: 600, cursor: 'pointer', padding: '6px 0 4px 22px' }}>
        {open ? '▴ Ocultar' : `▾ Ver ${t.replies.length}`} respuestas
      </div>
      {open && t.replies.map((r) => (
        <div key={r.commentId} style={{ marginLeft: 22, borderLeft: '2px solid var(--b2)', paddingLeft: 12, marginTop: 4 }}>
          <ReplyCard c={r} />
        </div>
      ))}
    </div>
  );
}
function ReplyCard({ c }: { c: TikTokCommentItem }) {
  const brand = isBrand(c.author);
  return (
    <div style={{ display: 'flex', gap: 10, padding: '7px 0' }}>
      <span style={{ ...avatar, ...(brand ? { background: `linear-gradient(135deg, ${TT_CYAN}, ${TT_PINK})`, color: '#fff' } : {}) }}>{(c.author || '?')[0].toUpperCase()}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>{c.author}</span>
          {brand && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 5, color: TT_CYAN, border: `1px solid ${TT_CYAN}` }}>Marca</span>}
          <span style={{ fontSize: 10, color: SENT[c.sentiment] }}>● {SENT_LABEL[c.sentiment]}</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.45, wordBreak: 'break-word' }}>{c.content}</div>
        <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3 }}>♥ {formatInt(c.likes)}</div>
      </div>
    </div>
  );
}
function CommentCard({ c, repliesN }: { c: TikTokCommentItem; repliesN: number }) {
  const dateLabel = c.createdAt ? new Date(c.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : '';
  return (
    <div style={cmtStyle}>
      {c.authorAvatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.authorAvatar} alt={c.author} loading="lazy" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
      ) : (
        <span aria-hidden style={avatar}>{(c.author || '?').trim().charAt(0).toUpperCase() || '?'}</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>{c.author}</span>
          {c.isPinned && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 5, color: 'var(--warn)', border: '1px solid var(--warn)' }}>📌 Fijado</span>}
          <span style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4, color: SENT[c.sentiment] }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: SENT[c.sentiment] }} />{SENT_LABEL[c.sentiment]}
          </span>
          {dateLabel && <span style={{ fontSize: 10, color: 'var(--mu)' }}>· {dateLabel}</span>}
        </div>
        <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.45, wordBreak: 'break-word' }}>
          {c.content || <span style={{ color: 'var(--mu)', fontStyle: 'italic' }}>(comentario sin texto)</span>}
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 11, color: 'var(--mu)', flexWrap: 'wrap' }}>
          <span title="Likes">♥ {formatInt(c.likes)}</span>
          {repliesN > 0 && <span>💬 {formatInt(repliesN)} respuestas</span>}
          {c.adName && <span style={{ ...ellipsis, maxWidth: 280 }} title={c.adName}>· {shortAd(c.adName)}</span>}
        </div>
      </div>
    </div>
  );
}
function Chip({ on, danger, onClick, children }: { on: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) {
  const color = danger ? 'var(--dn)' : 'var(--acc)';
  return (
    <button onClick={onClick} style={{ fontSize: 11, fontWeight: 600, padding: '5px 11px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', border: `1px solid ${on ? 'transparent' : 'var(--b1)'}`, background: on ? (danger ? 'color-mix(in srgb, var(--dn) 14%, transparent)' : 'var(--acc-dim)') : 'var(--bg1)', color: on ? color : 'var(--t2)' }}>{children}</button>
  );
}
const shortAd = (s: string) => s.replace(/^\(DUPLICADO[^)]*\)\s*/i, '').split('|').slice(0, 2).map((p) => p.trim()).join(' · ');

function EsperandoConexion({ rangeLabel, clientName }: { rangeLabel: string; clientName: string }) {
  return (
    <div className="view on">
      <TikTokHero title="TikTok Ads · Comentarios" sub={<>{rangeLabel} · {clientName} · función en preparación</>} />
      <div className="card" style={{ borderStyle: 'dashed', borderColor: `${TT_PINK}66`, background: `linear-gradient(180deg, ${TT_PINK}0d, transparent)` }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div aria-hidden style={{ width: 52, height: 52, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, background: `linear-gradient(150deg, ${TT_PINK}22, ${TT_CYAN}22)`, border: '1px solid var(--b2)' }}>💬</div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)', marginBottom: 6 }}>Esperando la conexión de los comentarios de TikTok</div>
            <div style={{ fontSize: 13, color: 'var(--mu)', lineHeight: 1.6, maxWidth: 640 }}>Esta hoja monitorea los comentarios, su intención y los temas que consulta la audiencia. En cuanto el ETL escriba filas en <code>tiktok_comments</code>, se enciende sola.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── estilos ──────────────────────────────────────────────────────────────────
const headlineStyle: React.CSSProperties = { fontSize: 'clamp(18px,2.2vw,24px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.22, marginTop: 2 };
const headSubStyle: React.CSSProperties = { fontSize: 12.5, color: 'var(--t2)', marginTop: 9, lineHeight: 1.5 };
const miniq: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, padding: '8px 11px', borderRadius: 9, background: 'var(--bg3)', border: '1px solid var(--b1)' };
const miniqCta: React.CSSProperties = { flex: 'none', fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--up)', borderRadius: 6, padding: '3px 8px' };
const expHead: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 };
const chips: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap' };
const cmtStyle: React.CSSProperties = { display: 'flex', gap: 11, padding: '11px 13px', borderRadius: 11, background: 'var(--bg1)', border: '1px solid var(--b1)' };
const avatar: React.CSSProperties = { width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--t1)', background: `linear-gradient(150deg, ${TT_PINK}22, ${TT_CYAN}22)` };
const pager: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 12, fontSize: 11.5, color: 'var(--mu)' };
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
