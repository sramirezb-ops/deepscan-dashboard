'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeroHead } from '@/components/ui/BrandLogo';
import { formatNumber, formatPercent } from '@/lib/utils';
import type { TikTokData, TikTokRetention } from '@/lib/hooks/useTikTok';

// Paleta TikTok
export const TT_PINK = '#ee1d52';
export const TT_CYAN = '#69c9d0';

// ── Estados compartidos entre las 3 vistas ───────────────────────────────────

export function TikTokLoading({ clientName }: { clientName: string }) {
  return (
    <div className="view on">
      <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 14, color: 'var(--mu)' }}>
          Cargando campañas de TikTok de {clientName}…
        </div>
      </div>
    </div>
  );
}

export function TikTokError({ error }: { error: string }) {
  return (
    <div className="view on">
      <div
        className="card"
        style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}
      >
        <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>
          Error cargando TikTok Ads
        </div>
        <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
      </div>
    </div>
  );
}

export function TikTokEmpty({
  data,
  clientName,
  rangeLabel,
}: {
  data: TikTokData | null;
  clientName: string;
  rangeLabel: string;
}) {
  return (
    <EmptyState
      icon="🎵"
      title={data?.tiktokExistsEver ? 'Sin actividad en este período' : 'Esperando la conexión de TikTok Ads'}
      message={
        data?.tiktokExistsEver ? (
          <>
            No hubo inversión de TikTok para {clientName} entre <b>{rangeLabel}</b>. Prueba a ampliar
            el rango de fechas con el filtro de arriba.
          </>
        ) : (
          <>
            Aún no hay datos de TikTok Ads para {clientName}. En cuanto la sincronización escriba las
            campañas en la tabla <code>tiktok_campaigns</code>, esta vista mostrará leads, costo por
            lead, CTR y el rendimiento de los videos — todo con datos reales.
          </>
        )
      }
      hint="La conexión con TikTok depende de que la app de la Marketing API esté aprobada y sus credenciales cargadas."
    />
  );
}

// ── Componentes de video (retención) ─────────────────────────────────────────

// Mini-tarjeta de una métrica de video: porcentaje grande + barra + absoluto.
export function VideoStat({
  label,
  pct,
  abs,
  color,
}: {
  label: string;
  pct: number;
  abs: number;
  color: string;
}) {
  return (
    <div
      style={{
        background: 'var(--bg3)',
        border: '1px solid var(--b2)',
        borderRadius: 10,
        padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)' }}>{formatPercent(pct, 1)}</div>
      <div className="hb" style={{ marginTop: 8 }}>
        <span
          className="hb-fill"
          style={{ width: `${Math.max(2, Math.round(pct * 100))}%`, background: color }}
        />
      </div>
      <div style={{ fontSize: 10, color: 'var(--mu)', marginTop: 6 }}>
        {formatNumber(abs)} reproducciones
      </div>
    </div>
  );
}

// Tiempo de reproducción promedio (segundos). TikTok lo da directo.
export function WatchTimeStat({ seconds }: { seconds: number }) {
  return (
    <div
      style={{
        background: 'var(--bg3)',
        border: '1px solid var(--b2)',
        borderRadius: 10,
        padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 6 }}>Tiempo promedio</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)' }}>
        {seconds > 0 ? `${seconds.toFixed(1)} s` : '—'}
      </div>
      <div style={{ fontSize: 10, color: 'var(--mu)', marginTop: 26 }}>por reproducción</div>
    </div>
  );
}

// Curva de retención completa: del 100 % de reproducciones, cuántos quedan en
// cada hito. Embudo monótono, 100 % dato real de TikTok.
export function RetentionCurve({ v }: { v: TikTokRetention }) {
  const stages: { label: string; pct: number; abs: number }[] = [
    { label: 'Reproducciones', pct: 1, abs: v.views },
    { label: '2 segundos (gancho)', pct: v.hookRate, abs: v.watched2s },
    { label: '6 segundos', pct: v.holdRate, abs: v.watched6s },
    { label: '25 % del video', pct: v.p25Rate, abs: v.watchedP25 },
    { label: '50 % del video', pct: v.p50Rate, abs: v.watchedP50 },
    { label: '75 % del video', pct: v.p75Rate, abs: v.watchedP75 },
    { label: '100 % (completo)', pct: v.completionRate, abs: v.completes },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {stages.map((s) => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 150, fontSize: 11, color: 'var(--mu)', flexShrink: 0 }}>{s.label}</div>
          <div className="hb" style={{ flex: 1 }}>
            <span
              className="hb-fill"
              style={{
                width: `${Math.max(1, Math.round(s.pct * 100))}%`,
                background: `linear-gradient(90deg, ${TT_PINK}, ${TT_CYAN})`,
              }}
            />
          </div>
          <div
            style={{
              width: 96,
              textAlign: 'right',
              fontSize: 11,
              color: 'var(--t1)',
              flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatPercent(s.pct, 1)}
            <span style={{ color: 'var(--mu)', marginLeft: 6 }}>{formatNumber(s.abs)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Mini barra de retención compacta (gancho → 6s → completo) para listas de
// anuncios. Resume el embudo en una sola fila sin ocupar mucho espacio.
export function MiniRetentionBar({ v }: { v: TikTokRetention }) {
  const points: { label: string; pct: number }[] = [
    { label: '2s', pct: v.hookRate },
    { label: '6s', pct: v.holdRate },
    { label: '50%', pct: v.p50Rate },
    { label: '100%', pct: v.completionRate },
  ];
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {points.map((p) => (
        <div key={p.label} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--mu)', marginBottom: 3 }}>{p.label}</div>
          <div className="hb" style={{ height: 6 }}>
            <span
              className="hb-fill"
              style={{
                width: `${Math.max(2, Math.round(p.pct * 100))}%`,
                background: `linear-gradient(90deg, ${TT_PINK}, ${TT_CYAN})`,
              }}
            />
          </div>
          <div style={{ fontSize: 10, color: 'var(--t1)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
            {formatPercent(p.pct, 0)}
          </div>
        </div>
      ))}
    </div>
  );
}

// Miniatura del creativo. Si ya tenemos la portada real (tabla tiktok_creatives)
// la mostramos; si no, caemos a un marcador honesto con la inicial — nunca una
// imagen inventada. `videoUrl` (si existe) abre el preview del video en pestaña
// nueva al hacer clic.
export function CreativeThumb({
  name,
  coverUrl,
  videoUrl,
  size = 'sm',
}: {
  name: string;
  coverUrl?: string;
  videoUrl?: string;
  size?: 'sm' | 'lg';
}) {
  const dims = size === 'lg' ? { w: 64, h: 84 } : { w: 46, h: 60 };
  const box: React.CSSProperties = {
    width: dims.w,
    height: dims.h,
    borderRadius: 8,
    flexShrink: 0,
    border: '1px solid var(--b2)',
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (coverUrl) {
    const inner = (
      <div style={{ ...box, background: 'var(--bg3)' }} title={name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverUrl}
          alt={name}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {videoUrl && (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              color: '#fff',
              textShadow: '0 1px 3px rgba(0,0,0,0.6)',
              pointerEvents: 'none',
            }}
          >
            ▶
          </span>
        )}
      </div>
    );
    return videoUrl ? (
      <a href={videoUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex' }}>
        {inner}
      </a>
    ) : (
      inner
    );
  }

  // Marcador honesto (sin portada resuelta todavía).
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      title={`${name} · portada aún no sincronizada`}
      style={{ ...box, background: `linear-gradient(150deg, ${TT_PINK}22, ${TT_CYAN}22)` }}
    >
      <span style={{ fontSize: size === 'lg' ? 24 : 18, fontWeight: 700, color: 'var(--t1)', opacity: 0.7 }}>
        {initial}
      </span>
      <span style={{ position: 'absolute', bottom: 3, right: 4, fontSize: 9, color: 'var(--mu)' }}>▶</span>
    </div>
  );
}

// Envoltura común: hero de las 3 vistas (título + subtítulo).
export function TikTokHero({ title, sub }: { title: string; sub: ReactNode }) {
  return (
    <div className="hero">
      <HeroHead brand="tiktok">{title}</HeroHead>
      <div className="hero-sub" suppressHydrationWarning>
        {sub}
      </div>
    </div>
  );
}

// ── Piezas de navegabilidad compartidas (campañas + retención) ───────────────

// Etiqueta de sección en mayúsculas.
export function SectionLabel({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
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

// Etiqueta de variación vs. período anterior, honesta y legible.
// `fmtDelta` presente = el delta es ABSOLUTO (moneda, p.p., s) → se muestra tal cual.
// `fmtDelta` ausente = el delta es una FRACCIÓN (cambio %); si la base anterior
// fue casi nula el % se dispara, así que lo acotamos a ">+1000%" en vez de
// mostrar cifras absurdas (255000%) que parecen un error.
export function deltaParts(
  delta: number | null,
  good: 'up' | 'down' | 'neutral',
  fmtDelta?: (v: number) => string,
): { text: string; color: string } {
  if (delta == null) return { text: 'sin período anterior', color: 'var(--mu)' };
  if (Math.abs(delta) < 5e-4) return { text: '■ sin cambio vs. anterior', color: 'var(--mu)' };
  const dir: 'up' | 'down' = delta > 0 ? 'up' : 'down';
  const tone = good === 'neutral' ? 'neutral' : dir === good ? 'good' : 'bad';
  const color = tone === 'good' ? '#4ade80' : tone === 'bad' ? '#f87171' : 'var(--mu)';
  const arrow = dir === 'up' ? '▲' : '▼';
  const isFraction = !fmtDelta;
  if (isFraction && Math.abs(delta) >= 10) return { text: `${arrow} +1000% vs. anterior`, color };
  const fmt = fmtDelta ?? ((x: number) => formatPercent(x, 1));
  return { text: `${arrow} ${fmt(Math.abs(delta))} vs. anterior`, color };
}

// Tarjeta de KPI de resumen (overview-first): etiqueta + valor grande + delta.
export function SummaryStat({
  label,
  value,
  delta,
  good,
  fmtDelta,
}: {
  label: string;
  value: string;
  delta: number | null;
  good: 'up' | 'down' | 'neutral';
  fmtDelta?: (v: number) => string;
}) {
  const { text, color } = deltaParts(delta, good, fmtDelta);
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
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color, fontVariantNumeric: 'tabular-nums' }}>{text}</div>
    </div>
  );
}

// Botón flotante "volver arriba" para páginas largas. Escucha el scroll real del
// contenedor del dashboard (#ctContent) y aparece tras desplazarse un poco.
export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = document.getElementById('ctContent');
    if (!el) return;
    const onScroll = () => setShow(el.scrollTop > 600);
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  if (!show) return null;
  return (
    <button
      onClick={() => document.getElementById('ctContent')?.scrollTo({ top: 0, behavior: 'smooth' })}
      style={backToTopStyle}
      title="Volver arriba"
      aria-label="Volver arriba"
    >
      ↑
    </button>
  );
}

export function chipStyle(active: boolean): React.CSSProperties {
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

export function pagerBtnStyle(disabled: boolean): React.CSSProperties {
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

export const summaryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 10,
};

export const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 10,
  margin: '0 0 8px',
};

export const searchInputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 12,
  color: 'var(--t1)',
  background: 'var(--bg3)',
  border: '1px solid var(--b2)',
  borderRadius: 8,
  padding: '7px 28px 7px 28px',
  outline: 'none',
};

export const searchIconStyle: React.CSSProperties = {
  position: 'absolute',
  left: 9,
  top: '50%',
  transform: 'translateY(-50%)',
  fontSize: 13,
  color: 'var(--mu)',
  pointerEvents: 'none',
};

export const searchClearStyle: React.CSSProperties = {
  position: 'absolute',
  right: 6,
  top: '50%',
  transform: 'translateY(-50%)',
  width: 18,
  height: 18,
  lineHeight: '16px',
  textAlign: 'center',
  fontSize: 14,
  color: 'var(--mu)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  borderRadius: 4,
};

export const selectStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--t1)',
  background: 'var(--bg3)',
  border: '1px solid var(--b2)',
  borderRadius: 7,
  padding: '5px 7px',
  cursor: 'pointer',
};

export const toolBtnStyle: React.CSSProperties = {
  fontSize: 11,
  padding: '6px 11px',
  borderRadius: 7,
  border: '1px solid var(--b2)',
  background: 'transparent',
  color: 'var(--t2)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export const backToTopStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 24,
  right: 28,
  zIndex: 50,
  width: 40,
  height: 40,
  borderRadius: '50%',
  border: `1px solid ${TT_PINK}`,
  background: 'rgba(238,29,82,0.16)',
  color: '#fff',
  fontSize: 18,
  lineHeight: '1',
  cursor: 'pointer',
  boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
  backdropFilter: 'blur(4px)',
};
