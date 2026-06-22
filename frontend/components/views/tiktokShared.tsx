'use client';

import type { ReactNode } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
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

// Miniatura honesta del creativo. Hoy NO tenemos la portada/video real del
// anuncio en la base (el reporte de TikTok no la trae); mostramos un tile con
// la inicial y el nombre, claramente un marcador y no una imagen inventada.
// El Paso 2 reemplazará esto por la portada/preview real desde la API.
export function CreativeThumb({ name }: { name: string }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      title={name}
      style={{
        width: 46,
        height: 60,
        borderRadius: 8,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(150deg, ${TT_PINK}22, ${TT_CYAN}22)`,
        border: '1px solid var(--b2)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', opacity: 0.7 }}>{initial}</span>
      <span
        style={{
          position: 'absolute',
          bottom: 3,
          right: 4,
          fontSize: 9,
          color: 'var(--mu)',
        }}
      >
        ▶
      </span>
    </div>
  );
}

// Envoltura común: hero de las 3 vistas (título + subtítulo).
export function TikTokHero({ title, sub }: { title: string; sub: ReactNode }) {
  return (
    <div className="hero">
      <div className="hero-title">{title}</div>
      <div className="hero-sub" suppressHydrationWarning>
        {sub}
      </div>
    </div>
  );
}
