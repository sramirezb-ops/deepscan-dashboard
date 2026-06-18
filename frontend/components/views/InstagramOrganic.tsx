'use client';

import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import {
  useInstagramOrganic,
  type IgMediaRow,
  type IgTypeBreakdown,
} from '@/lib/hooks/useInstagramOrganic';
import { EmptyState } from '@/components/ui/EmptyState';
import { TrendChart } from '@/components/ui/TrendChart';
import { formatInt, formatPercent, formatDelta, deltaDirection } from '@/lib/utils';

// "2026-06-16" → "16 jun"
function fmtDayShort(iso: string): string {
  const [, m, d] = iso.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${Number(d)} ${meses[Number(m) - 1] ?? m}`;
}

const TYPE_COLOR: Record<string, string> = {
  Reels: '#E1306C',
  Carrusel: '#C13584',
  Imagen: '#833AB4',
  Video: '#5851DB',
  Feed: '#405DE6',
};
function typeColor(label: string): string {
  return TYPE_COLOR[label] || 'var(--mu)';
}

// Miniatura de publicación con respaldo cuando no hay imagen.
function PostThumb({ url, type }: { url: string; type: string }) {
  if (!url) {
    return (
      <div
        style={{
          width: 44, height: 44, borderRadius: 8, flex: '0 0 auto',
          background: 'var(--bg2, #1a1a22)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 16, color: 'var(--mu)',
        }}
        aria-hidden
      >
        {type === 'Reels' ? '🎬' : '🖼️'}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={44}
      height={44}
      loading="lazy"
      style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flex: '0 0 auto' }}
    />
  );
}

function TypePill({ label }: { label: string }) {
  const c = typeColor(label);
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
        padding: '2px 8px', borderRadius: 999, color: c,
        background: `${c}1f`, fontWeight: 600,
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
      {label}
    </span>
  );
}

// Recorta el caption para la tabla.
function shortCaption(c: string, max = 64): string {
  const clean = c.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean || '(sin texto)';
}

export function InstagramOrganic() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useInstagramOrganic(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const previousLabel = formatRangeLabel(previous);

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Cargando Instagram de {client.name}…
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
            Error cargando Instagram orgánico
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || (!data.hasAccountData && !data.hasMediaData)) {
    const everSynced = data?.accountExistsEver;
    return (
      <EmptyState
        icon="📸"
        title={everSynced ? 'Sin datos de Instagram en este rango' : 'Esperando los datos de Instagram'}
        message={
          everSynced ? (
            <>
              No hay actividad orgánica registrada para {client.name} entre <b>{rangeLabel}</b>. Prueba
              ampliar el rango de fechas con el filtro de arriba.
            </>
          ) : (
            <>
              Aún no se ha sincronizado la cuenta de Instagram de {client.name}. En cuanto la
              sincronización escriba la cuenta y sus publicaciones en las tablas{' '}
              <code>ig_account_daily</code> y <code>ig_media</code>, esta vista mostrará seguidores,
              alcance, visitas al perfil y el engagement de cada post — todo con datos reales.
            </>
          )
        }
        hint="Requiere que el token de Meta tenga permisos instagram_basic + instagram_manage_insights."
      />
    );
  }

  const t = data.totals;
  const dl = data.daily;

  // Instagram reporta los insights de cuenta con 1–2 días de retraso, y cada
  // métrica con su propio lag. Si dibujamos esos días el último punto cae a 0 y
  // parece un desplome real. Recortamos los ceros finales de cada serie por
  // separado para que la línea termine en su último dato real.
  const trimTrailing = <R,>(rows: R[], val: (r: R) => number): R[] => {
    let n = rows.length;
    while (n > 1 && val(rows[n - 1]) === 0) n--;
    return rows.slice(0, n);
  };
  const reachRows = trimTrailing(dl, (d) => d.reach);
  const followerRows = trimTrailing(dl, (d) => d.newFollowers);

  return (
    <div className="view on">
      <div className="hero">
        <div className="hero-title">
          Instagram orgánico{data.username ? ` · @${data.username}` : ''}
        </div>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {formatInt(t.followers)} seguidores ·{' '}
          {formatInt(t.reach)} de alcance · {formatInt(t.postsInRange)} publicaciones
        </div>
      </div>

      {/* KPIs reales */}
      <div className="kpis">
        <div className="kpi k-meta">
          <div className="kpi-lbl">Seguidores</div>
          <div className="kpi-val">{formatInt(t.followers)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${t.newFollowers >= 0 ? 'tgu' : 'tgd'}`}>
              {(t.newFollowers >= 0 ? '+' : '−') + formatInt(Math.abs(t.newFollowers))}
            </span>
            <span className="dcmp">nuevos en {rangeLabel}</span>
          </div>
        </div>
        <div className="kpi k-meta">
          <div className="kpi-lbl">Alcance</div>
          <div className="kpi-val">{formatInt(t.reach)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${deltaDirection(data.reachDelta) === 'up' ? 'tgu' : 'tgd'}`}>
              {formatDelta(data.reachDelta)}
            </span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-meta">
          <div className="kpi-lbl">Visitas al perfil</div>
          <div className="kpi-val">{formatInt(t.profileViews)}</div>
          <div className="kpi-bot">
            <span
              className={`kpi-delta ${deltaDirection(data.profileViewsDelta) === 'up' ? 'tgu' : 'tgd'}`}
            >
              {formatDelta(data.profileViewsDelta)}
            </span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-green">
          <div className="kpi-lbl">Engagement</div>
          <div className="kpi-val">{formatInt(t.interactions)}</div>
          <div className="kpi-bot">
            <span className="dcmp">
              {formatPercent(t.engagementRate, 1)} sobre alcance · {formatInt(Math.round(t.avgPerPost))}{' '}
              / post
            </span>
          </div>
        </div>
      </div>

      {/* Tendencias diarias — solo series con dato real por día.
          Las visitas al perfil NO se grafican por día porque Instagram solo
          entrega el total del período; viven como KPI arriba. */}
      <div
        style={{
          marginTop: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 16,
        }}
      >
        <TrendChart
          title="Alcance / día"
          headline={formatInt(t.reach)}
          sub="cuentas alcanzadas"
          points={reachRows.map((d) => d.reach)}
          labels={reachRows.map((d) => fmtDayShort(d.date))}
          color="#E1306C"
          format={(v) => formatInt(v)}
        />
        <TrendChart
          title="Seguidores nuevos / día"
          headline={(t.newFollowers >= 0 ? '+' : '−') + formatInt(Math.abs(t.newFollowers))}
          sub="crecimiento neto"
          points={followerRows.map((d) => d.newFollowers)}
          labels={followerRows.map((d) => fmtDayShort(d.date))}
          color="#F77737"
          format={(v) => formatInt(v)}
        />
      </div>

      {/* Mix de contenido — qué formato funciona mejor */}
      {data.typeBreakdown.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 15 }}>Mix de contenido</h3>
          <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 16 }}>
            Qué formato genera más interacción en {rangeLabel}
          </div>
          <table className="t">
            <thead>
              <tr>
                <th>Formato</th>
                <th>Publicaciones</th>
                <th>Alcance</th>
                <th>Interacciones</th>
                <th>Engagement</th>
                <th>Share interacc.</th>
              </tr>
            </thead>
            <tbody>
              {data.typeBreakdown.map((tb: IgTypeBreakdown) => {
                const share = t.interactions > 0 ? tb.interactions / t.interactions : 0;
                return (
                  <tr key={tb.label}>
                    <td>
                      <TypePill label={tb.label} />
                    </td>
                    <td>{formatInt(tb.count)}</td>
                    <td>{formatInt(tb.reach)}</td>
                    <td>{formatInt(tb.interactions)}</td>
                    <td>{formatPercent(tb.engagementRate, 1)}</td>
                    <td>
                      <span className="hb">
                        <span
                          className="hb-fill"
                          style={{
                            width: `${Math.max(2, Math.round(share * 100))}%`,
                            background: typeColor(tb.label),
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
      )}

      {/* Top publicaciones — el corazón del panel de un social media manager */}
      {data.topPosts.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 15 }}>Mejores publicaciones</h3>
          <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 16 }}>
            Ordenadas por interacciones totales — lo que más conectó con tu audiencia
          </div>
          <table className="t">
            <thead>
              <tr>
                <th>Publicación</th>
                <th>Formato</th>
                <th>Fecha</th>
                <th>Alcance</th>
                <th>Likes</th>
                <th>Coment.</th>
                <th>Guardados</th>
                <th>Engagement</th>
              </tr>
            </thead>
            <tbody>
              {data.topPosts.map((p: IgMediaRow) => {
                const formato = p.productType?.toUpperCase() === 'REELS'
                  ? 'Reels'
                  : p.mediaType?.toUpperCase() === 'CAROUSEL_ALBUM'
                  ? 'Carrusel'
                  : p.mediaType?.toUpperCase() === 'VIDEO'
                  ? 'Video'
                  : 'Imagen';
                return (
                  <tr key={p.mediaId}>
                    <td style={{ maxWidth: 320 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <PostThumb url={p.thumbnailUrl} type={formato} />
                        {p.permalink ? (
                          <a
                            href={p.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--tx)', textDecoration: 'none', fontSize: 13 }}
                          >
                            {shortCaption(p.caption)}
                          </a>
                        ) : (
                          <span style={{ fontSize: 13 }}>{shortCaption(p.caption)}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <TypePill label={formato} />
                    </td>
                    <td>{p.date ? fmtDayShort(p.date) : '—'}</td>
                    <td>{formatInt(p.reach)}</td>
                    <td>{formatInt(p.likes)}</td>
                    <td>{formatInt(p.comments)}</td>
                    <td>{formatInt(p.saved)}</td>
                    <td>{p.reach > 0 ? formatPercent(p.engagementRate, 1) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
