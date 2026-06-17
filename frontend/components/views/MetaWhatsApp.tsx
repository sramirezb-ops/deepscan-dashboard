'use client';

import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import {
  useMetaWhatsApp,
  type WaCampaignRow,
  type WaAdsetRow,
  type WaAdRow,
  type WaDestinationRow,
  type WaAdTone,
} from '@/lib/hooks/useMetaWhatsApp';
import { EmptyState } from '@/components/ui/EmptyState';
import { TrendChart } from '@/components/ui/TrendChart';
import {
  formatCurrency,
  formatInt,
  formatPercent,
  formatDelta,
  deltaDirection,
} from '@/lib/utils';

// "2026-06-16" → "16 jun" (sin depender de zona horaria)
function fmtDayShort(iso: string): string {
  const [, m, d] = iso.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${Number(d)} ${meses[Number(m) - 1] ?? m}`;
}

const DEST_COLOR: Record<string, string> = {
  WhatsApp: '#25D366',
  Messenger: '#0084FF',
  'Instagram Direct': '#E1306C',
  'Sin clasificar': 'var(--mu)',
};

function destColor(d: string): string {
  if (DEST_COLOR[d]) return DEST_COLOR[d];
  // destinos combinados (p.ej. "WhatsApp + Instagram Direct"): color por la primera app.
  if (d.includes('WhatsApp')) return '#25D366';
  if (d.includes('Messenger')) return '#0084FF';
  if (d.includes('Instagram')) return '#E1306C';
  return '#7c5cff';
}

// Miniatura del anuncio — usa thumb_url real cuando el conector lo entrega;
// mientras tanto, un cuadrito neutro con la inicial (honesto, sin inventar).
function AdThumb({ url, name }: { url: string | null; name: string }) {
  const letter = (name.trim()[0] || '?').toUpperCase();
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt={name}
        width={40}
        height={40}
        loading="lazy"
        style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', display: 'block', flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 6,
        background: 'var(--b2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--mu)',
        flexShrink: 0,
      }}
      title="Miniatura pendiente del conector"
    >
      {letter}
    </div>
  );
}

// Colores del badge de análisis por tono.
const TONE_STYLE: Record<WaAdTone, { bg: string; fg: string }> = {
  win: { bg: 'rgba(34,217,122,0.14)', fg: '#22d97a' },
  ok: { bg: 'rgba(255,255,255,0.06)', fg: 'var(--mu)' },
  warn: { bg: 'rgba(245,158,11,0.14)', fg: '#f59e0b' },
  bad: { bg: 'rgba(239,68,68,0.14)', fg: '#ef4444' },
  pending: { bg: 'rgba(255,255,255,0.04)', fg: 'var(--mu)' },
};

function AnalysisBadge({ tone, label }: { tone: WaAdTone; label: string }) {
  const s = TONE_STYLE[tone];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 9px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.3,
        background: s.bg,
        color: s.fg,
        whiteSpace: 'normal',
      }}
    >
      {label}
    </span>
  );
}

// Estado de entrega del anuncio (effective_status de Meta) → etiqueta + color.
function statusInfo(raw: string): { label: string; dot: string; fg: string } {
  const s = (raw || '').toUpperCase();
  if (s === 'ACTIVE') return { label: 'Activo', dot: '#22d97a', fg: '#22d97a' };
  if (s.includes('PAUSED')) return { label: 'Pausado', dot: '#f59e0b', fg: '#f59e0b' };
  if (s === 'ARCHIVED' || s === 'DELETED')
    return { label: 'Archivado', dot: 'var(--mu)', fg: 'var(--mu)' };
  if (!s) return { label: '—', dot: 'var(--mu)', fg: 'var(--mu)' };
  // DISAPPROVED, WITH_ISSUES, PENDING_REVIEW, IN_PROCESS…
  const pretty = s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
  return { label: pretty, dot: '#ef4444', fg: '#ef4444' };
}

function StatusPill({ status }: { status: string }) {
  const s = statusInfo(status);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: s.fg }}>
      <span
        aria-hidden
        style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, display: 'inline-block' }}
      />
      {s.label}
    </span>
  );
}

// Celda del emoji marcador. Si el conjunto no trae emoji, mostramos un guion mudo.
function EmojiMark({ emoji }: { emoji: string }) {
  if (!emoji) {
    return (
      <span style={{ fontSize: 13, color: 'var(--mu)' }} title="Sin marcador de conversión">
        —
      </span>
    );
  }
  return (
    <span style={{ fontSize: 20, lineHeight: 1 }} title="Marcador manual de conversión (en el nombre)">
      {emoji}
    </span>
  );
}

export function MetaWhatsApp() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useMetaWhatsApp(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const previousLabel = formatRangeLabel(previous);
  const cur = client.currency;

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Cargando conversaciones de {client.name}…
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view on">
        <div
          className="card"
          style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}
        >
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>
            Error cargando conversaciones
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || data.totals.conversations === 0) {
    return (
      <EmptyState
        icon="💬"
        title="Esperando las campañas de mensajes"
        message={
          <>
            Aún no hay conversaciones con mensaje iniciadas para {client.name} entre{' '}
            <b>{rangeLabel}</b>. En cuanto la sincronización escriba las campañas de mensajes (las que
            optimizan por <b>Conversaciones</b>) en la tabla <code>meta_messaging</code>, esta vista
            mostrará las conversaciones por destino, campaña y conjunto, con su costo por conversación
            — todo con datos reales.
          </>
        }
        hint="Si la sincronización ya corrió, prueba ampliar el rango de fechas con el filtro de arriba."
      />
    );
  }

  const t = data.totals;
  const dl = data.daily;
  const dayLabels = dl.map((d) => fmtDayShort(d.date));

  // Costo/conversación: más barato es mejor → baja = verde, sube = rojo.
  const costCheaper = data.costDelta <= 0;
  const costDeltaLabel =
    (data.costDelta >= 0 ? '+' : '−') + formatCurrency(Math.abs(data.costDelta), cur);

  return (
    <div className="view on">
      <div className="hero">
        <div className="hero-title">Meta Ads · WhatsApp / Mensajes</div>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {formatInt(t.conversations)} conversaciones ·{' '}
          {formatCurrency(t.spend, cur)} invertido · {formatCurrency(t.costPerConversation, cur)} /
          conv.
        </div>
      </div>

      {/* KPIs reales */}
      <div className="kpis">
        <div className="kpi k-meta">
          <div className="kpi-lbl">Conversaciones iniciadas</div>
          <div className="kpi-val">{formatInt(t.conversations)}</div>
          <div className="kpi-bot">
            <span
              className={`kpi-delta ${deltaDirection(data.conversationsDelta) === 'up' ? 'tgu' : 'tgd'}`}
            >
              {formatDelta(data.conversationsDelta)}
            </span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-meta">
          <div className="kpi-lbl">Inversión</div>
          <div className="kpi-val">{formatCurrency(t.spend, cur)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${deltaDirection(data.spendDelta) === 'up' ? 'tgu' : 'tgd'}`}>
              {formatDelta(data.spendDelta)}
            </span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-green">
          <div className="kpi-lbl">Costo por conversación</div>
          <div className="kpi-val">{formatCurrency(t.costPerConversation, cur)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${costCheaper ? 'tgu' : 'tgd'}`}>{costDeltaLabel}</span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-meta">
          <div className="kpi-lbl">Destinos activos</div>
          <div className="kpi-val">{formatInt(data.destinations.length)}</div>
          <div className="kpi-bot">
            <span className="dcmp">{data.destinations.map((d) => d.destination).join(' · ')}</span>
          </div>
        </div>
      </div>

      {/* Tendencias diarias — dato real */}
      <div
        style={{
          marginTop: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 16,
        }}
      >
        <TrendChart
          title="Conversaciones / día"
          headline={formatInt(t.conversations)}
          sub="mensajes iniciados"
          points={dl.map((d) => d.conversations)}
          labels={dayLabels}
          color="#25D366"
          format={(v) => formatInt(v)}
        />
        <TrendChart
          title="Costo por conversación / día"
          headline={formatCurrency(t.costPerConversation, cur)}
          sub="inversión ÷ conversaciones"
          points={dl.map((d) => d.costPerConversation)}
          labels={dayLabels}
          color="#f59e0b"
          format={(v) => formatCurrency(v, cur)}
        />
        <TrendChart
          title="Inversión / día"
          headline={formatCurrency(t.spend, cur)}
          sub="gasto en mensajes"
          points={dl.map((d) => d.spend)}
          labels={dayLabels}
          color="#4c8bf5"
          format={(v) => formatCurrency(v, cur)}
        />
      </div>

      {/* Desglose por destino — dato real */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Conversaciones por destino</h3>
        <table className="t">
          <thead>
            <tr>
              <th>Destino</th>
              <th>Conversaciones</th>
              <th>Inversión</th>
              <th>Costo / conv.</th>
              <th>Share conv.</th>
            </tr>
          </thead>
          <tbody>
            {data.destinations.map((d: WaDestinationRow) => {
              const share = t.conversations > 0 ? d.conversations / t.conversations : 0;
              return (
                <tr key={d.destination}>
                  <td>
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: destColor(d.destination),
                        marginRight: 8,
                      }}
                    />
                    <b>{d.destination}</b>
                  </td>
                  <td>{formatInt(d.conversations)}</td>
                  <td>{formatCurrency(d.spend, cur)}</td>
                  <td>{d.conversations > 0 ? formatCurrency(d.costPerConversation, cur) : '—'}</td>
                  <td>
                    <span className="hb">
                      <span
                        className="hb-fill"
                        style={{
                          width: `${Math.max(2, Math.round(share * 100))}%`,
                          background: destColor(d.destination),
                        }}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Tabla por campaña — dato real */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div className="dim-tbl-head">
          <div className="dim-tbl-title">
            <div className="dim-tbl-ic">💬</div>
            <div>
              <div className="dim-tbl-label">Campañas de mensajes</div>
              <div className="dim-tbl-h">Resultados por campaña · ordenado por conversaciones</div>
            </div>
          </div>
          <span className="period-pill">{data.campaignCount} campañas</span>
        </div>
        <table className="t">
          <thead>
            <tr>
              <th data-cat="dim">Campaña</th>
              <th data-cat="dim">Destino</th>
              <th data-cat="conv">Conversaciones</th>
              <th data-cat="cost">Inversión</th>
              <th data-cat="cost,conv">Costo / conv.</th>
              <th data-cat="conv">Share conv.</th>
            </tr>
          </thead>
          <tbody>
            {data.campaigns.map((c: WaCampaignRow) => {
              const share = t.conversations > 0 ? c.conversations / t.conversations : 0;
              return (
                <tr key={`${c.campaign}__${c.destination}`}>
                  <td data-cat="dim">
                    <b>{c.campaign}</b>
                  </td>
                  <td data-cat="dim">
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: destColor(c.destination),
                        marginRight: 6,
                      }}
                    />
                    {c.destination}
                  </td>
                  <td data-cat="conv">{formatInt(c.conversations)}</td>
                  <td data-cat="cost">{formatCurrency(c.spend, cur)}</td>
                  <td data-cat="cost,conv">
                    {c.conversations > 0 ? formatCurrency(c.costPerConversation, cur) : '—'}
                  </td>
                  <td data-cat="conv">
                    <span className="hb">
                      <span
                        className="hb-fill"
                        style={{
                          width: `${Math.max(2, Math.round(share * 100))}%`,
                          background: destColor(c.destination),
                        }}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr className="t-avg">
              <td data-cat="dim">Total</td>
              <td data-cat="dim" />
              <td data-cat="conv">{formatInt(t.conversations)}</td>
              <td data-cat="cost">{formatCurrency(t.spend, cur)}</td>
              <td data-cat="cost,conv">{formatCurrency(t.costPerConversation, cur)}</td>
              <td data-cat="conv" />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Conjuntos con sus anuncios anidados — dato real */}
      <div className="dim-tbl-head" style={{ marginTop: 24, marginBottom: 4 }}>
        <div className="dim-tbl-title">
          <div className="dim-tbl-ic">🎯</div>
          <div>
            <div className="dim-tbl-label">Conjuntos y sus anuncios</div>
            <div className="dim-tbl-h">
              Cada conjunto con sus creativos · imagen, resultados y análisis · top{' '}
              {data.adsets.length} de {data.adsetCount}
            </div>
          </div>
        </div>
        <span className="period-pill">
          {data.adCount} anuncios
          {!data.adsConversationsReady && ' · conv. activando'}
        </span>
      </div>

      {data.adsets.map((a: WaAdsetRow) => (
        <div className="card" style={{ marginTop: 12, padding: 16 }} key={`${a.adset}__${a.campaign}__${a.destination}`}>
          {/* Cabecera del conjunto */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              borderBottom: '1px solid var(--b2)',
              paddingBottom: 12,
              marginBottom: a.ads.length > 0 ? 12 : 0,
            }}
          >
            <span style={{ fontSize: 26, lineHeight: 1 }} title="Marcador de conversión">
              {a.emoji || '💬'}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <b style={{ display: 'block', fontSize: 14 }} title={a.cleanName}>
                {a.cleanName}
              </b>
              <span style={{ fontSize: 11, color: 'var(--mu)' }}>
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: destColor(a.destination),
                    marginRight: 6,
                  }}
                />
                {a.destination} · {a.campaign}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 20, textAlign: 'right', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>
                  {formatInt(a.conversations)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--mu)' }}>conversaciones</div>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>
                  {formatCurrency(a.spend, cur)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--mu)' }}>inversión</div>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#25D366' }}>
                  {a.conversations > 0 ? formatCurrency(a.costPerConversation, cur) : '—'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--mu)' }}>costo / conv.</div>
              </div>
            </div>
          </div>

          {/* Anuncios del conjunto */}
          {a.ads.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--mu)', padding: '8px 2px' }}>
              {data.adsConversationsReady
                ? 'Sin anuncios con datos en este período para este conjunto.'
                : 'Los anuncios por conjunto se activan cuando el conector corra con la nueva columna.'}
            </div>
          ) : (
            <table className="t">
              <thead>
                <tr>
                  <th data-cat="dim">Anuncio</th>
                  <th data-cat="conv">Conversaciones</th>
                  <th data-cat="cost">Inversión</th>
                  <th data-cat="cost,conv">Costo / conv.</th>
                  <th data-cat="impr">CTR</th>
                  <th data-cat="dim">Estado</th>
                  <th data-cat="dim">Análisis</th>
                </tr>
              </thead>
              <tbody>
                {a.ads.map((ad: WaAdRow) => (
                  <tr key={ad.adId}>
                    <td data-cat="dim">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <AdThumb url={ad.thumbUrl} name={ad.adName} />
                        <div style={{ minWidth: 0 }}>
                          <b
                            style={{
                              display: 'block',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: 280,
                            }}
                            title={ad.adName}
                          >
                            {ad.emoji && <span style={{ marginRight: 4 }}>{ad.emoji}</span>}
                            {ad.cleanName}
                          </b>
                        </div>
                      </div>
                    </td>
                    <td data-cat="conv">
                      {data.adsConversationsReady ? formatInt(ad.conversations) : '—'}
                    </td>
                    <td data-cat="cost">{formatCurrency(ad.spend, cur)}</td>
                    <td data-cat="cost,conv">
                      {ad.conversations > 0 ? formatCurrency(ad.costPerConversation, cur) : '—'}
                    </td>
                    <td data-cat="impr">{formatPercent(ad.ctr, 1)}</td>
                    <td data-cat="dim"><StatusPill status={ad.status} /></td>
                    <td data-cat="dim">
                      <AnalysisBadge tone={ad.analysisTone} label={ad.analysisLabel} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {/* Nota honesta */}
      <div
        className="card"
        style={{ marginTop: '20px', borderStyle: 'dashed', borderColor: 'var(--b2)' }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Cómo leer esta vista</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Son las campañas de Meta optimizadas por <b>Conversaciones</b>. La métrica es{' '}
          <b>conversaciones con mensaje iniciadas</b> (dato real de Meta) y el destino sale del{' '}
          <code>destination_type</code> del conjunto — por eso el dashboard sabe con certeza qué va a
          WhatsApp, Messenger o Instagram Direct, sin adivinar por el nombre. El <b>emoji</b> de cada
          conjunto es el marcador manual de conversión que el equipo pone al inicio del nombre. Cada
          conjunto se abre en sus <b>anuncios</b> con miniatura, resultados y un <b>análisis</b>{' '}
          automático que compara el costo por conversación del creativo contra el promedio de su
          propio conjunto (ganador / en rango / caro / a pausar).{' '}
          {data.adsConversationsReady ? (
            <>
              Las <b>conversaciones por anuncio</b> son dato real del conector
              {data.withThumb > 0 && <> y las miniaturas llegan en {data.withThumb} de {data.adCount}</>}.
            </>
          ) : (
            <>
              Las <b>conversaciones por anuncio</b> se activan en cuanto el conector corra guardando esa
              métrica a nivel creativo; mientras tanto ves imagen, inversión y CTR por anuncio.
            </>
          )}
        </div>
      </div>
    </div>
  );
}
