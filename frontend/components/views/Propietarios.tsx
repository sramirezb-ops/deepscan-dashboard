'use client';

import { useState, type MouseEvent } from 'react';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import {
  useGadsPropietarios,
  type PropCampaign,
  type PropKpis,
  type PropDeltas,
  type PropDailyPoint,
} from '@/lib/hooks/useGadsPropietarios';
import { useGadsAdAssets, type AssetCampaign, type AssetItem } from '@/lib/hooks/useGadsAdAssets';
import { PieChart, type PieSlice } from '@/components/ui/PieChart';
import { EmptyState } from '@/components/ui/EmptyState';

// ============================================================
// Propietarios — vista EXCLUSIVA del modelo de captación (Display).
// Son campañas de Display de generación de leads: NO hay revenue/ROAS,
// por eso todo gira en torno a LEADS y COSTO POR LEAD (CPL).
// Por campaña: ① KPIs de captación con tendencia y hover · ② anuncios
// (responsive display) · ③ tortas por ciudad. 100% dato real.
// "Resultados por imagen/video" individual aún no existen en la base
// (requieren extraer ad_group_ad_asset_view en el ETL → Fase 2). Honesto.
// ============================================================

// ── Formateadores estilo Colombia (COP, coma decimal) ──
function fmtCOP(v: number): string {
  if (v == null || isNaN(v)) return '—';
  return `$ ${Math.round(v).toLocaleString('es-CO')}`;
}
function fmtInt(v: number): string {
  if (v == null || isNaN(v)) return '—';
  return Math.round(v).toLocaleString('es-CO');
}
function fmtDec(v: number, dec = 1): string {
  if (v == null || isNaN(v)) return '—';
  return v.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtPct(ratio: number, dec = 2): string {
  if (ratio == null || isNaN(ratio)) return '—';
  return `${(ratio * 100).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })} %`;
}

// Píldora de delta. En captación, para costes (Inversión, CPL, CPC, CPM) subir
// es "malo" y bajar es "bueno"; para resultados (Leads, Clics, CTR, conv.) es al
// revés. `goodWhenDown` invierte el color para leerlo sin pensar.
function Delta({ value, goodWhenDown = false }: { value: number; goodWhenDown?: boolean }) {
  const up = value >= 0;
  const good = goodWhenDown ? !up : up;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: good ? '#34d399' : '#f87171', whiteSpace: 'nowrap' }}>
      {up ? '▲' : '▼'} {(up ? '+' : '') + value.toFixed(1)}%
    </span>
  );
}

const MESES_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fmtDay(iso?: string): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES_ABBR[(m || 1) - 1]}`;
}

// Mini sparkline (área + línea) en SVG puro, baseline en 0 (honesto).
// Al pasar el mouse (sin click) muestra el valor del día más cercano, como Looker.
function Spark({
  points,
  color,
  height = 34,
  dates,
  fmt,
}: {
  points: number[];
  color: string;
  height?: number;
  dates?: string[];
  fmt?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 120;
  const H = height;
  const n = points.length;
  if (n < 2) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', fontSize: 10, color: 'var(--mu)' }}>
        ≥2 días para ver tendencia
      </div>
    );
  }
  const max = Math.max(...points, 0.0001);
  const xAt = (i: number) => (W * i) / (n - 1);
  const yAt = (v: number) => H - 2 - (Math.max(v, 0) / max) * (H - 6);
  const coords = points.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`);
  const line = coords.join(' ');
  const area = `${line} ${W},${H} 0,${H}`;

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(n - 1, Math.round((x / rect.width) * (n - 1))));
    setHover(idx);
  };

  const leftPct = hover != null ? (hover / (n - 1)) * 100 : 0;
  const topPct = hover != null ? (yAt(points[hover]) / H) * 100 : 0;
  const fmtV = fmt ?? ((v: number) => Math.round(v).toLocaleString('es-CO'));

  return (
    <div style={{ position: 'relative', height: H }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <polygon points={area} fill={color} fillOpacity={0.14} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      </svg>
      {hover != null && (
        <>
          <div style={{ position: 'absolute', left: `${leftPct}%`, top: 0, bottom: 0, width: 1, background: color, opacity: 0.45, pointerEvents: 'none' }} />
          <div
            style={{
              position: 'absolute',
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: color,
              border: '1.5px solid var(--bg)',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: `${leftPct}%`,
              bottom: H + 4,
              transform: `translateX(${leftPct > 70 ? '-90%' : leftPct < 30 ? '-10%' : '-50%'})`,
              background: 'var(--bg)',
              border: '1px solid var(--b2)',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 11,
              lineHeight: 1.35,
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <div style={{ color: 'var(--mu)' }}>{fmtDay(dates?.[hover])}</div>
            <div style={{ color: 'var(--tx)', fontWeight: 700 }}>{fmtV(points[hover])}</div>
          </div>
        </>
      )}
    </div>
  );
}

// Tarjeta KPI: etiqueta · valor · delta · sparkline. Variante `hero` para Inversión.
function SparkKpi({
  label,
  value,
  delta,
  goodWhenDown,
  points,
  color,
  hero = false,
  dates,
  fmt,
}: {
  label: string;
  value: string;
  delta: number;
  goodWhenDown?: boolean;
  points: number[];
  color: string;
  hero?: boolean;
  dates?: string[];
  fmt?: (v: number) => string;
}) {
  const deltaNode = <Delta value={delta} goodWhenDown={goodWhenDown} />;

  if (hero) {
    return (
      <div className="card" style={{ padding: '14px 18px', gridColumn: '1 / -1' }}>
        <div style={{ fontSize: 11, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginTop: 4 }}>
          <div>
            <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--tx)', lineHeight: 1.1 }}>{value}</div>
            <div style={{ marginTop: 4 }}>{deltaNode}</div>
          </div>
          <div style={{ flex: '1 1 260px', maxWidth: 520, minWidth: 200 }}>
            <Spark points={points} color={color} height={52} dates={dates} fmt={fmt} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ fontSize: 10.5, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: 0.3, lineHeight: 1.3, minHeight: 26 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--tx)', lineHeight: 1.25, marginTop: 2 }}>{value}</div>
      <div style={{ marginTop: 2, marginBottom: 6 }}>{deltaNode}</div>
      <Spark points={points} color={color} dates={dates} fmt={fmt} />
    </div>
  );
}

const KPI_COLOR = '#15803d';

function series(daily: PropDailyPoint[], pick: (p: PropDailyPoint) => number): number[] {
  return daily.map(pick);
}

// Bloque ① — KPIs de captación por campaña.
function KpiGrid({ kpis, deltas, daily }: { kpis: PropKpis; deltas: PropDeltas; daily: PropDailyPoint[] }) {
  const dates = daily.map((p) => p.date);
  const hero = { label: 'Inversión', value: fmtCOP(kpis.cost), delta: deltas.cost, points: series(daily, (p) => p.cost), fmt: fmtCOP, goodWhenDown: true };
  const cards: {
    label: string;
    value: string;
    delta: number;
    points: number[];
    fmt: (v: number) => string;
    goodWhenDown?: boolean;
  }[] = [
    { label: 'Leads (conversiones)', value: fmtDec(kpis.conversions), delta: deltas.conversions, points: series(daily, (p) => p.conversions), fmt: (v) => fmtDec(v) },
    { label: 'Costo por lead (CPL)', value: fmtCOP(kpis.cpl), delta: deltas.cpl, points: series(daily, (p) => p.cpl), fmt: fmtCOP, goodWhenDown: true },
    { label: 'Impresiones', value: fmtInt(kpis.impressions), delta: deltas.impressions, points: series(daily, (p) => p.impressions), fmt: fmtInt },
    { label: 'Clics', value: fmtInt(kpis.clicks), delta: deltas.clicks, points: series(daily, (p) => p.clicks), fmt: fmtInt },
    { label: 'CTR', value: fmtPct(kpis.ctr), delta: deltas.ctr, points: series(daily, (p) => p.ctr), fmt: (v) => fmtPct(v) },
    { label: 'CPC medio', value: fmtCOP(kpis.cpc), delta: deltas.cpc, points: series(daily, (p) => p.cpc), fmt: fmtCOP, goodWhenDown: true },
    { label: 'Avg. CPM', value: fmtCOP(kpis.cpm), delta: deltas.cpm, points: series(daily, (p) => p.cpm), fmt: fmtCOP, goodWhenDown: true },
    { label: 'Tasa de conversión', value: fmtPct(kpis.convRate), delta: deltas.convRate, points: series(daily, (p) => p.convRate), fmt: (v) => fmtPct(v) },
  ];
  return (
    <>
      <div style={{ marginTop: 14 }}>
        <SparkKpi label={hero.label} value={hero.value} delta={hero.delta} goodWhenDown={hero.goodWhenDown} points={hero.points} color={KPI_COLOR} hero dates={dates} fmt={hero.fmt} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 12, marginTop: 12 }}>
        {cards.map((c) => (
          <SparkKpi key={c.label} label={c.label} value={c.value} delta={c.delta} goodWhenDown={c.goodWhenDown} points={c.points} color={KPI_COLOR} dates={dates} fmt={c.fmt} />
        ))}
      </div>
    </>
  );
}

// Mini-celda con barra de magnitud verde detrás del número.
function BarCell({ value, max, fmt }: { value: number; max: number; fmt: (v: number) => string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <td style={{ position: 'relative' }}>
      <div aria-hidden style={{ position: 'absolute', left: 0, top: 3, bottom: 3, width: `${(pct * 100).toFixed(1)}%`, background: 'rgba(21,128,61,0.22)', borderRadius: 4 }} />
      <span style={{ position: 'relative' }}>{fmt(value)}</span>
    </td>
  );
}

// Etiqueta legible del tipo de anuncio.
function adTypeLabel(t: string): string {
  if (t === 'RESPONSIVE_DISPLAY_AD') return 'Display adaptable';
  if (t === 'RESPONSIVE_SEARCH_AD') return 'Search adaptable';
  return t.replace(/_/g, ' ').toLowerCase();
}

// Bloque ② — anuncios (responsive display) de la campaña.
function AdsTable({ campaign }: { campaign: PropCampaign }) {
  const ads = campaign.ads;
  if (ads.length === 0) {
    return (
      <div className="card" style={{ marginTop: 16, padding: 18, borderStyle: 'dashed', borderColor: 'var(--b2)', fontSize: 12, color: 'var(--mu)' }}>
        Sin anuncios registrados para esta campaña en el período.
      </div>
    );
  }
  const maxImpr = Math.max(...ads.map((a) => a.impressions), 1);
  const maxClicks = Math.max(...ads.map((a) => a.clicks), 1);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="dim-tbl-head">
        <div className="dim-tbl-title">
          <div className="dim-tbl-ic">🎨</div>
          <div>
            <div className="dim-tbl-label">Anuncios de la campaña</div>
            <div className="dim-tbl-h">Anuncios adaptables de display · ordenados por inversión</div>
          </div>
        </div>
        <span className="period-pill">{ads.length} anuncio{ads.length === 1 ? '' : 's'}</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="t">
          <thead>
            <tr>
              <th>Grupo de anuncios / segmento</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Inversión</th>
              <th>Impresiones</th>
              <th>Clics</th>
              <th>CTR</th>
              <th>Leads</th>
              <th>CPL</th>
            </tr>
          </thead>
          <tbody>
            {ads.map((a) => (
              <tr key={a.adId}>
                <td><b>{a.adGroupName}</b></td>
                <td style={{ color: 'var(--mu)' }}>{adTypeLabel(a.adType)}</td>
                <td>
                  <span style={{ fontSize: 11, color: a.status === 'ENABLED' ? '#34d399' : 'var(--mu)' }}>
                    {a.status === 'ENABLED' ? '● Activo' : a.status}
                  </span>
                </td>
                <td>{fmtCOP(a.cost)}</td>
                <BarCell value={a.impressions} max={maxImpr} fmt={fmtInt} />
                <BarCell value={a.clicks} max={maxClicks} fmt={fmtInt} />
                <td style={{ background: 'rgba(21,128,61,0.05)' }}>{fmtPct(a.ctr)}</td>
                <td style={{ fontWeight: a.conversions > 0 ? 700 : 400, color: a.conversions > 0 ? '#34d399' : 'var(--tx)' }}>{fmtDec(a.conversions)}</td>
                <td>{a.conversions > 0 ? fmtCOP(a.cpl) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Calificación de Google a cada pieza creativa (performance_label).
function PerfBadge({ label }: { label: string }) {
  const map: Record<string, { txt: string; color: string; bg: string }> = {
    BEST: { txt: 'La mejor', color: '#34d399', bg: 'rgba(52,211,153,0.14)' },
    GOOD: { txt: 'Buena', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
    LOW: { txt: 'Baja', color: '#f87171', bg: 'rgba(248,113,113,0.14)' },
    LEARNING: { txt: 'Aprendiendo', color: 'var(--mu)', bg: 'var(--b2)' },
    PENDING: { txt: 'Pendiente', color: 'var(--mu)', bg: 'var(--b2)' },
  };
  const m = map[label];
  if (!m) return null;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: m.color, background: m.bg, borderRadius: 5, padding: '1px 6px', whiteSpace: 'nowrap' }}>
      {m.txt}
    </span>
  );
}

function fieldTypeLabel(ft: string, kind: string): string {
  const f = (ft || '').toUpperCase();
  if (f.includes('LOGO')) return 'Logo';
  if (f.includes('SQUARE')) return 'Imagen cuadrada';
  if (f.includes('PORTRAIT')) return 'Imagen vertical';
  if (f.includes('LANDSCAPE') || f === 'MARKETING_IMAGE') return 'Imagen horizontal';
  if (f.includes('VIDEO')) return 'Video';
  if (f.includes('LONG_HEADLINE')) return 'Titular largo';
  if (f.includes('HEADLINE')) return 'Titular';
  if (f.includes('DESCRIPTION')) return 'Descripción';
  if (f.includes('BUSINESS_NAME')) return 'Nombre del negocio';
  if (kind === 'image') return 'Imagen';
  if (kind === 'video') return 'Video';
  return 'Texto';
}

// Mini-métricas bajo cada pieza (impresiones · clics · CTR · leads).
function AssetMetrics({ a }: { a: AssetItem }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 11, color: 'var(--mu)' }}>
      <span><b style={{ color: 'var(--tx)' }}>{fmtInt(a.impressions)}</b> impr.</span>
      <span><b style={{ color: 'var(--tx)' }}>{fmtInt(a.clicks)}</b> clics</span>
      <span><b style={{ color: 'var(--tx)' }}>{fmtPct(a.ctr)}</b> CTR</span>
      <span style={{ color: a.conversions > 0 ? '#34d399' : 'var(--mu)' }}>
        <b>{fmtDec(a.conversions)}</b> leads
      </span>
    </div>
  );
}

// Tarjeta visual (imagen o video) con miniatura + calificación + métricas.
function VisualCard({ a, showMetrics }: { a: AssetItem; showMetrics: boolean }) {
  const thumb =
    a.kind === 'video' && a.youtubeVideoId
      ? `https://img.youtube.com/vi/${a.youtubeVideoId}/mqdefault.jpg`
      : a.imageUrl;
  return (
    <div className="card" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '1.4', borderRadius: 8, overflow: 'hidden', background: 'var(--b2)' }}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={fieldTypeLabel(a.fieldType, a.kind)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--mu)' }}>
            sin miniatura
          </div>
        )}
        {a.kind === 'video' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontSize: 26, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>▶</span>
          </div>
        )}
        <div style={{ position: 'absolute', top: 6, right: 6 }}>
          <PerfBadge label={a.performanceLabel} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--mu)' }}>
        <span>{a.kind === 'video' ? '🎬' : '🖼️'}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {a.youtubeTitle || fieldTypeLabel(a.fieldType, a.kind)}
        </span>
      </div>
      {showMetrics && <AssetMetrics a={a} />}
    </div>
  );
}

// Fila de texto (titular o descripción) con su calificación + métricas.
function TextRow({ a, showMetrics }: { a: AssetItem; showMetrics: boolean }) {
  return (
    <div className="card" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 10.5, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
          {fieldTypeLabel(a.fieldType, a.kind)}
        </span>
        <PerfBadge label={a.performanceLabel} />
      </div>
      <div style={{ fontSize: 13, color: 'var(--tx)', lineHeight: 1.35 }}>“{a.assetText || '—'}”</div>
      {showMetrics && <AssetMetrics a={a} />}
    </div>
  );
}

// Bloque ④ — resultados por imagen / video / texto (Fase 2, dato real).
// Si la tabla aún no tiene datos para esta campaña (ETL no corrido o fuera de
// ventana), mostramos el aviso honesto en vez de inventar nada.
function AssetsSection({ assets }: { assets?: AssetCampaign }) {
  const hasVisuals = assets && assets.visuals.length > 0;
  const hasTexts = assets && assets.texts.length > 0;
  // En Display, Google no reparte métricas por pieza → solo tenemos su
  // calificación (BEST/GOOD/LOW). En ese caso ocultamos las mini-métricas en 0
  // (serían engañosas) y ordenamos/explicamos por calificación.
  const showMetrics = !!assets && assets.hasMetrics;
  // ¿Alguna pieza trae calificación real de Google? (Display suele devolver
  // NOT_APPLICABLE → no hay badge). Solo mencionamos la calificación si existe.
  const RATED = new Set(['BEST', 'GOOD', 'LOW', 'LEARNING', 'PENDING']);
  const hasRating =
    !!assets &&
    [...assets.visuals, ...assets.texts].some((a) => RATED.has((a.performanceLabel || '').toUpperCase()));

  if (!hasVisuals && !hasTexts) {
    return (
      <div className="card" style={{ marginTop: 16, padding: 18, borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          🔜 <b style={{ color: 'var(--tx)' }}>Resultados por imagen y video — pendiente de sincronizar.</b> Cada anuncio
          adaptable combina varias imágenes, videos y textos. El detalle por pieza se llena desde el ETL
          (ad_group_ad_asset_view); cuando la próxima sincronización lo traiga, aparecerá aquí automáticamente con
          impresiones, clics y leads de cada pieza.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--mu)', marginBottom: 10 }}>
        🎨 ¿Qué pieza creativa funciona mejor? ·{' '}
        <span style={{ color: 'var(--tx)' }}>
          {showMetrics
            ? 'resultados por imagen, video y texto'
            : 'piezas ordenadas por la calificación de Google'}
        </span>
      </div>

      {hasVisuals && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {assets!.visuals.map((a) => (
            <VisualCard key={`${a.assetId}__${a.fieldType}`} a={a} showMetrics={showMetrics} />
          ))}
        </div>
      )}

      {hasTexts && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 8 }}>Titulares y descripciones</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {assets!.texts.map((a) => (
              <TextRow key={`${a.assetId}__${a.fieldType}`} a={a} showMetrics={showMetrics} />
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 10, lineHeight: 1.5 }}>
        {showMetrics ? (
          <>
            Métricas reales por pieza desde Google Ads. El <b style={{ color: 'var(--tx)' }}>costo por pieza no existe</b>:
            Google no reparte la inversión entre imágenes/videos de un anuncio adaptable, así que medimos cada pieza por
            impresiones, clics y leads{hasRating ? ', más la calificación de Google' : ''}.
          </>
        ) : (
          <>
            En campañas de Display, Google <b style={{ color: 'var(--tx)' }}>no reparte métricas por pieza</b> (ni
            impresiones ni costo por imagen/video). Lo que sí entrega, y mostramos aquí, es su propia{' '}
            <b style={{ color: 'var(--tx)' }}>calificación de cada pieza</b> (La mejor / Buena / Baja): así sabes qué
            creativos conviene mantener o reemplazar, sin inventar números.
          </>
        )}
      </div>
    </div>
  );
}

// Bloque ③ — tortas por ciudad para ESTA campaña.
function CityPies({ campaign }: { campaign: PropCampaign }) {
  const cities = campaign.cities;
  if (cities.length === 0) {
    return (
      <div className="card" style={{ marginTop: 16, padding: 18, borderStyle: 'dashed', borderColor: 'var(--b2)', fontSize: 12, color: 'var(--mu)' }}>
        Sin datos de localización para esta campaña en el período.
      </div>
    );
  }
  const convSlices: PieSlice[] = cities.map((c) => ({ label: c.city, value: c.conversions }));
  const costSlices: PieSlice[] = cities.map((c) => ({ label: c.city, value: c.cost }));
  const imprSlices: PieSlice[] = cities.map((c) => ({ label: c.city, value: c.impressions }));
  const cplSlices: PieSlice[] = cities.filter((c) => c.conversions > 0).map((c) => ({ label: c.city, value: c.cpl }));

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--mu)', marginBottom: 10 }}>
        📍 ¿De qué ciudades vienen los propietarios? · <span style={{ color: 'var(--tx)' }}>{campaign.campaignName}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <PieChart title="Leads por ciudad" slices={convSlices} formatValue={fmtInt} />
        <PieChart title="Inversión por ciudad" slices={costSlices} formatValue={fmtCOP} />
        <PieChart title="Impresiones por ciudad" slices={imprSlices} formatValue={fmtInt} />
        <PieChart title="Costo por lead por ciudad" slices={cplSlices} formatValue={fmtCOP} />
      </div>
    </div>
  );
}

// Una campaña Propietarios completa (los 4 bloques).
function CampaignSection({ campaign, previousLabel, assets }: { campaign: PropCampaign; previousLabel: string; assets?: AssetCampaign }) {
  const k = campaign.kpis;
  return (
    <div style={{ marginTop: 30 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>🏠 {campaign.campaignName}</h3>
        <span style={{ fontSize: 12, color: 'var(--mu)' }}>
          <b style={{ color: 'var(--tx)' }}>{fmtCOP(k.cost)}</b> invertido ·{' '}
          <b style={{ color: 'var(--tx)' }}>{fmtDec(k.conversions)}</b> leads ·{' '}
          <b style={{ color: 'var(--tx)' }}>{fmtCOP(k.cpl)}</b> por lead · delta vs {previousLabel}
        </span>
      </div>

      <KpiGrid kpis={campaign.kpis} deltas={campaign.deltas} daily={campaign.daily} />
      <AdsTable campaign={campaign} />
      <AssetsSection assets={assets} />
      <CityPies campaign={campaign} />
    </div>
  );
}

export function Propietarios() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useGadsPropietarios(client.id, range, previous);
  const { data: assetsData } = useGadsAdAssets(client.id, range);

  const rangeLabel = formatRangeLabel(range);
  const previousLabel = formatRangeLabel(previous);

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>Cargando captación de Propietarios de {client.name}…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view on">
        <div className="card" style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}>
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>Error cargando Propietarios</div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || data.campaigns.length === 0) {
    if (!data?.existsEver) {
      return (
        <EmptyState
          icon="🏠"
          title="Sin campañas de Propietarios"
          message={
            <>
              {client.name} no tiene campañas de captación de <b>Propietarios</b> (Display) por el momento. En cuanto se
              lancen, aparecerán aquí automáticamente.
            </>
          }
        />
      );
    }
    return (
      <EmptyState
        icon="📅"
        title="Sin actividad de Propietarios en este período"
        message={
          <>
            {client.name} tiene campañas de Propietarios, pero no registraron actividad entre <b>{rangeLabel}</b>.
          </>
        }
        hint="Prueba ampliar el rango de fechas con el filtro de arriba."
      />
    );
  }

  const totalCost = data.campaigns.reduce((a, c) => a + c.kpis.cost, 0);
  const totalLeads = data.campaigns.reduce((a, c) => a + c.kpis.conversions, 0);
  const blendedCpl = totalLeads > 0 ? totalCost / totalLeads : 0;

  return (
    <div className="view on">
      <div className="hero">
        <div className="hero-title">🏠 Propietarios · Captación (Display)</div>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {data.campaigns.length} campaña{data.campaigns.length === 1 ? '' : 's'} ·{' '}
          {fmtCOP(totalCost)} invertido · {fmtDec(totalLeads)} leads · {fmtCOP(blendedCpl)} por lead
        </div>
      </div>

      {data.campaigns.map((c) => (
        <CampaignSection
          key={c.campaignId}
          campaign={c}
          previousLabel={previousLabel}
          assets={assetsData?.byCampaign.get(c.campaignId)}
        />
      ))}

      <div className="card" style={{ marginTop: 24, borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Estas son campañas de <b style={{ color: 'var(--tx)' }}>Display</b> de generación de leads: no producen revenue en
          pesos, por eso medimos resultados por <b style={{ color: 'var(--tx)' }}>leads</b> y{' '}
          <b style={{ color: 'var(--tx)' }}>costo por lead (CPL)</b>, no por ROAS. Todos los números provienen directo de
          Google Ads (campañas, anuncios y localización) — sin promedios engañosos ni datos inventados.
        </div>
      </div>
    </div>
  );
}
