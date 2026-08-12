'use client';

import { HeroHead } from '@/components/ui/BrandLogo';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import {
  useClarity,
  type ClarityDailyRow,
  type ClarityPageRow,
} from '@/lib/hooks/useClarity';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatInt, formatPercent } from '@/lib/utils';
import { useSortableTable, type SortAccessor } from '@/components/ui/useSortableTable';

// ============================================================
// Clarity · CRO — comportamiento real del sitio
// ============================================================
// Datos reales de clarity_metrics (por día, respetando el filtro de fechas) y
// clarity_pages (detalle por página). Todo llega vía la Data Export API de
// Microsoft Clarity. Mientras el ETL no escriba filas, muestra un estado honesto.
// ============================================================

const CLARITY_BLUE = '#4f6bed'; // azul Clarity

// Sneakers tiene 2 propiedades GA4; el embudo on-site se filtra a la de Shopify (Basics).
const SNEAKERS_ID = 'bae8c125-19e0-46b4-b0f6-462b642658ac';
const SHOPIFY_PROP = '523524806';

const PAGE_LIMIT = 30;

function fmtDay(iso: string): string {
  // 2026-06-16 → "16 jun" (sin depender de zona horaria)
  const [, m, d] = iso.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mi = Number(m) - 1;
  return `${Number(d)} ${meses[mi] ?? m}`;
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === '/' || u.pathname === '' ? '(inicio)' : u.pathname;
  } catch {
    return url;
  }
}

// Clasifica una ruta en su sección de tienda — para el rayos-X "qué sección funciona".
function pageType(path: string): string {
  if (path === '/' || path === '(inicio)' || path === '') return 'Home';
  if (path.startsWith('/products/')) return 'PDP (producto)';
  if (path.startsWith('/collections/')) return 'Colección';
  if (path.startsWith('/cart')) return 'Carrito';
  if (path.startsWith('/search')) return 'Búsqueda';
  if (path.startsWith('/pages/')) return 'Info';
  if (path.startsWith('/checkout')) return 'Checkout';
  return 'Otra';
}
const CRO_RED = '#e5384d', CRO_AMBER = '#f5a524', CRO_GREEN = '#1faf6a', CRO_MUT = '#77718a', CRO_ACC = '#7c5cff';
// Semáforo de tasa de dead-click por página (fricción): menor es mejor.
function deadColor(rate: number): string {
  if (rate >= 0.08) return CRO_RED;
  if (rate >= 0.04) return CRO_AMBER;
  return CRO_GREEN;
}

export function Clarity() {
  const client = useClient();
  const { range } = usePeriod();
  const { data, loading, error } = useClarity(client.id, range, client.id === SNEAKERS_ID ? SHOPIFY_PROP : undefined);

  const rangeLabel = formatRangeLabel(range);

  // Sorting Looker. Orden por defecto: diario más reciente primero (daily invertido),
  // páginas por sesiones desc (ya vienen así). El hook conserva ese orden hasta el clic.
  const dailySource = data ? [...data.daily].reverse() : [];
  const dailyAccessors: SortAccessor<ClarityDailyRow>[] = [
    (r) => r.date,
    (r) => r.sessions,
    (r) => r.scrollDepth,
    (r) => r.deadClickRate,
    (r) => r.rageClickRate,
    (r) => r.quickBackRate,
    null, // barra relativa
  ];
  const { rows: sortedDaily, headerProps: dailyHeaderProps } = useSortableTable(
    dailySource,
    dailyAccessors,
  );

  const pageSource = data ? data.pages.slice(0, PAGE_LIMIT) : [];
  const pageAccessors: SortAccessor<ClarityPageRow>[] = [
    (r) => r.pageUrl,
    (r) => r.sessions,
    (r) => r.scrollDepth,
    (r) => r.deadClicks,
    (r) => r.rageClicks,
    null, // barra relativa
  ];
  const { rows: sortedPages, headerProps: pageHeaderProps } = useSortableTable(
    pageSource,
    pageAccessors,
  );

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Cargando comportamiento de {client.name}…
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
            Error cargando Clarity
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || data.totals.sessions === 0) {
    return (
      <EmptyState
        icon="🔬"
        title="Esperando el comportamiento de Clarity"
        message={
          <>
            Aún no hay sesiones registradas para {client.name} entre <b>{rangeLabel}</b>. En cuanto la
            sincronización escriba las métricas en la tabla <code>clarity_metrics</code>, esta vista
            mostrará sesiones, scroll depth, dead clicks, rage clicks, quickbacks y el detalle de
            comportamiento por página, todo con datos reales.
          </>
        }
        hint="La API de Clarity solo entrega los últimos 1–3 días, así que el historial se va llenando hacia adelante con cada sincronización."
      />
    );
  }

  const t = data.totals;
  // Tabla diaria: más reciente primero (orden por defecto), ya ordenable.
  const dailyRows = sortedDaily;
  const maxDailySessions = Math.max(1, ...data.daily.map((d) => d.sessions));
  const pages = sortedPages;
  const maxPageSessions = Math.max(1, ...pageSource.map((p) => p.sessions));

  // ── Cómputos CRO ────────────────────────────────────────────────
  const devTotal = t.deviceMobile + t.devicePc + t.deviceTablet;
  const mobilePct = devTotal > 0 ? Math.round((100 * t.deviceMobile) / devTotal) : 0;

  // Rayos-X por sección: agrega TODAS las páginas (no solo el top) por tipo.
  const secAgg: Record<string, { sessions: number; dead: number; rage: number; scrollW: number }> = {};
  for (const p of data.pages) {
    const ty = pageType(shortPath(p.pageUrl));
    const a = (secAgg[ty] ||= { sessions: 0, dead: 0, rage: 0, scrollW: 0 });
    a.sessions += p.sessions; a.dead += p.deadClicks; a.rage += p.rageClicks; a.scrollW += p.scrollDepth * p.sessions;
  }
  const SEC_ORDER = ['Home', 'PDP (producto)', 'Colección', 'Búsqueda', 'Carrito', 'Checkout', 'Info', 'Otra'];
  const sections = SEC_ORDER.filter((k) => secAgg[k] && secAgg[k].sessions >= 20).map((k) => {
    const a = secAgg[k];
    return { type: k, sessions: a.sessions, scroll: a.sessions ? a.scrollW / a.sessions : 0, deadRate: a.sessions ? a.dead / a.sessions : 0 };
  });

  // Duelo de PDP: entre fichas con tráfico suficiente, la de menor vs mayor fricción.
  const pdps = data.pages.filter((p) => pageType(shortPath(p.pageUrl)) === 'PDP (producto)' && p.sessions >= 100)
    .map((p) => ({ path: shortPath(p.pageUrl), sessions: p.sessions, scroll: p.scrollDepth, deadRate: p.deadClicks / p.sessions }));
  const bestPdp = pdps.length ? pdps.reduce((b, p) => (p.deadRate < b.deadRate ? p : b)) : null;
  const worstPdp = pdps.length ? pdps.reduce((w, p) => (p.deadRate > w.deadRate ? p : w)) : null;
  const pdpName = (path: string) => path.replace('/products/', '').replace(/-/g, ' ').slice(0, 30);

  // ── Matriz de salud por sección (scatter tráfico × fricción) ────
  // Job: magnitud + prioridad en 2D. X=tráfico (escala sqrt por el rango enorme),
  // Y=fricción (lineal). Color=estado (verde/ámbar/rojo) SIEMPRE con etiqueta directa.
  const MW = 640, MH = 300, mL = 48, mR = 104, mT = 16, mB = 42;
  const mxSess = Math.max(...sections.map((s) => s.sessions), 1);
  const mxFr = Math.max(...sections.map((s) => s.deadRate), 0.06);
  const yTop = mxFr * 1.15; // headroom: la burbuja más alta no toca el borde
  const msx = (s: number) => mL + (Math.sqrt(s) / Math.sqrt(mxSess)) * (MW - mL - mR);
  const msy = (f: number) => MH - mB - (f / yTop) * (MH - mB - mT);
  const mrad = (s: number) => 9 + (Math.sqrt(s) / Math.sqrt(mxSess)) * 15; // 9–24px
  const FR_HI = 0.08; // umbral de fricción alta
  const SESS_HI = mxSess * 0.16; // umbral de "mucho tráfico" (~raíz media)
  const yTicks = [0, mxFr / 2, mxFr];

  return (
    <div className="view on">
      <div className="hero">
        <HeroHead brand="clarity">Clarity · CRO</HeroHead>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {formatInt(t.sessions)} sesiones ·{' '}
          {formatPercent(t.scrollDepth, 1)} scroll promedio
        </div>
      </div>

      {/* 1 · PULSO CRO — dispositivo + salud de fricción */}
      <div className="cro-pulse">
        <div className="cro-dev">
          {devTotal > 0 ? (
            <>
              <div className="cro-dev-big">{mobilePct}%<span>móvil</span></div>
              <div className="cro-dev-bar"><span style={{ width: `${mobilePct}%` }} /></div>
              <div className="cro-dev-leg">{formatInt(t.deviceMobile)} móvil · {formatInt(t.devicePc)} PC · {formatInt(t.deviceTablet)} tablet</div>
            </>
          ) : (
            <div className="cro-dev-pend">📱 <b>Split por dispositivo pendiente</b><span>Corre la migración 0022 + el ETL para poblar mobile/PC/tablet.</span></div>
          )}
        </div>
        <div className="cro-health">
          <div className="cro-hchip"><b style={{ color: deadColor(t.deadClickRate) }}>{formatPercent(t.deadClickRate, 1)}</b><span>dead clicks</span></div>
          <div className="cro-hchip"><b style={{ color: t.quickBackRate >= 0.15 ? CRO_RED : CRO_AMBER }}>{formatPercent(t.quickBackRate, 1)}</b><span>quickback</span></div>
          <div className="cro-hchip"><b>{formatPercent(t.scrollDepth, 0)}</b><span>scroll medio</span></div>
          <div className="cro-hchip"><b>{formatInt(t.sessions)}</b><span>sesiones</span></div>
        </div>
      </div>
      <div className="cro-verdict">{mobilePct >= 80 ? <><b>{mobilePct}% móvil</b> — cada decisión de UX se juzga en el celular. </> : null}Scroll medio <b>{formatPercent(t.scrollDepth, 0)}</b>: lo crítico (precio, talla, MSI, botón de compra) debe ir <b>arriba del pliegue</b>.</div>

      {/* 1b · EMBUDO DE COMPORTAMIENTO (GA4) */}
      {data.funnel && (() => {
        const f = data.funnel;
        const stages = [
          { label: 'Vistas de producto', n: f.views },
          { label: 'Al carrito', n: f.atc },
          { label: 'Checkout iniciado', n: f.checkout },
          { label: 'Compra (GA4)', n: f.purchases },
        ];
        const mx = f.views || 1;
        const conv = stages.map((s, i) => (i === 0 ? null : stages[i - 1].n ? s.n / stages[i - 1].n : 0));
        // El "peor paso" excluye Checkout→Compra: ese salto es artefacto de medición
        // (GA4 pierde la compra offsite), no una fuga real de UX.
        let worst = -1, wv = 2;
        conv.forEach((c, i) => { if (i < stages.length - 1 && c != null && c < wv) { wv = c; worst = i; } });
        return (
          <>
            <h3 className="cro-h">🔻 Embudo de comportamiento · ¿dónde caen dentro del sitio?</h3>
            <div className="card cro-fnl">
              {stages.map((s, i) => {
                const w = Math.max(2, Math.round((100 * s.n) / mx));
                const isWorst = i === worst;
                const isLast = i === stages.length - 1;
                return (
                  <div className="cro-fnl-row" key={s.label}>
                    <div className="cro-fnl-lbl">{s.label}</div>
                    <div className="cro-fnl-track">
                      <span className="cro-fnl-bar" style={{ width: `${w}%`, background: isWorst ? CRO_RED : isLast ? '#c3bcd4' : CRO_ACC }} />
                      <span className="cro-fnl-n">{formatInt(s.n)}</span>
                    </div>
                    <div className="cro-fnl-conv">
                      {i === 0 ? <span className="cro-fnl-base">arranque</span>
                        : isLast ? <span className="cro-fnl-off">offsite · sub-medido</span>
                          : <><b style={{ color: isWorst ? CRO_RED : '#171226' }}>{formatPercent(conv[i]!, 1)}</b>{isWorst ? <span className="cro-fnl-worst"> ← mayor caída</span> : ' del paso anterior'}</>}
                    </div>
                  </div>
                );
              })}
              <div className="cro-fnl-note"><b>Fuente: GA4</b> (comportamiento en sitio). ⚠️ La <b>compra</b> está sub-medida — el checkout de Shopify es offsite y GA4 no lo ve; la venta real de caja vive en Shopify. La lectura útil es <b>dónde caen dentro del sitio</b>{worst >= 0 ? <>: el mayor salto se pierde en <b>{stages[worst].label.toLowerCase()}</b>.</> : '.'}</div>
            </div>
          </>
        );
      })()}

      {/* 2 · RAYOS-X POR SECCIÓN */}
      <h3 className="cro-h">🩻 Rayos-X por sección · ¿qué parte del sitio funciona?</h3>
      <div className="cro-matrix card">
        <div className="cro-mx-cap">Cada burbuja es una sección · <b>eje X</b> = tráfico · <b>eje Y</b> = fricción (dead-click) · tamaño = sesiones. <b style={{ color: CRO_RED }}>Arriba-derecha</b> = mucho tráfico + mucha fricción → <b>arreglar primero</b>.</div>
        <svg viewBox={`0 0 ${MW} ${MH}`} width="100%" role="img" aria-label="Matriz de secciones: tráfico vs fricción">
          <rect x={msx(SESS_HI)} y={mT} width={Math.max(0, MW - mR - msx(SESS_HI))} height={Math.max(0, msy(FR_HI) - mT)} fill={CRO_RED} opacity="0.045" />
          {yTicks.map((f, i) => (
            <g key={i}>
              <line x1={mL} y1={msy(f)} x2={MW - mR} y2={msy(f)} stroke="#ebe7f4" strokeWidth="1" />
              <text x={mL - 8} y={msy(f) + 3} textAnchor="end" fontSize="10" fill={CRO_MUT}>{Math.round(f * 100)}%</text>
            </g>
          ))}
          <line x1={mL} y1={msy(FR_HI)} x2={MW - mR} y2={msy(FR_HI)} stroke={CRO_RED} strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
          <line x1={msx(SESS_HI)} y1={mT} x2={msx(SESS_HI)} y2={MH - mB} stroke={CRO_MUT} strokeWidth="1" strokeDasharray="4 4" opacity="0.3" />
          <text x={MW - mR - 6} y={mT + 13} textAnchor="end" fontSize="10" fontWeight="800" fill={CRO_RED} opacity="0.75">arreglar ya ↗</text>
          <text x={MW - mR} y={MH - 8} textAnchor="end" fontSize="10" fill={CRO_MUT}>más tráfico →</text>
          <text x={13} y={(MH - mB + mT) / 2} transform={`rotate(-90 13 ${(MH - mB + mT) / 2})`} textAnchor="middle" fontSize="10" fill={CRO_MUT}>fricción ↑</text>
          {sections.map((s) => {
            const x = msx(s.sessions), y = msy(s.deadRate), r = mrad(s.sessions), c = deadColor(s.deadRate);
            const left = x > MW - mR - 52;
            return (
              <g key={s.type}>
                <circle cx={x} cy={y} r={r} fill={c} fillOpacity="0.5" stroke="#fff" strokeWidth="2" />
                <circle cx={x} cy={y} r={r} fill="none" stroke={c} strokeWidth="1.5" />
                <title>{`${s.type}: ${formatInt(s.sessions)} sesiones · ${formatPercent(s.deadRate, 1)} fricción · scroll ${formatPercent(s.scroll, 0)}`}</title>
                <text x={left ? x - r - 5 : x + r + 5} y={y + 3.5} textAnchor={left ? 'end' : 'start'} fontSize="10.5" fontWeight="700" fill="#171226" stroke="#fff" strokeWidth="2.6" paintOrder="stroke">{s.type.replace(' (producto)', '')}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="cro-secs">
        {sections.map((s) => (
          <div className="cro-sec" key={s.type}>
            <div className="cro-sec-t">{s.type}</div>
            <div className="cro-sec-n">{formatInt(s.sessions)}<span>sesiones</span></div>
            <div className="cro-sec-m">
              <span>scroll <b>{formatPercent(s.scroll, 0)}</b></span>
              <span>fricción <b style={{ color: deadColor(s.deadRate) }}>{formatPercent(s.deadRate, 1)}</b></span>
            </div>
          </div>
        ))}
      </div>

      {/* 3 · DUELO DE PDP */}
      {bestPdp && worstPdp && bestPdp.path !== worstPdp.path && (
        <>
          <h3 className="cro-h">⚔️ Duelo de PDP · el molde que convierte vs el que traba</h3>
          <div className="cro-duel">
            <div className="cro-duel-c win">
              <div className="cro-duel-tag" style={{ color: CRO_GREEN }}>🟢 MENOS FRICCIÓN · el molde a replicar</div>
              <div className="cro-duel-n">{pdpName(bestPdp.path)}</div>
              <div className="cro-duel-m"><b style={{ color: CRO_GREEN }}>{formatPercent(bestPdp.deadRate, 1)}</b> fricción · {formatPercent(bestPdp.scroll, 0)} scroll · {formatInt(bestPdp.sessions)} ses.</div>
            </div>
            <div className="cro-duel-c lose">
              <div className="cro-duel-tag" style={{ color: CRO_RED }}>🔴 MÁS FRICCIÓN · auditar ya</div>
              <div className="cro-duel-n">{pdpName(worstPdp.path)}</div>
              <div className="cro-duel-m"><b style={{ color: CRO_RED }}>{formatPercent(worstPdp.deadRate, 1)}</b> fricción · {formatPercent(worstPdp.scroll, 0)} scroll · {formatInt(worstPdp.sessions)} ses.</div>
            </div>
          </div>
          <div className="cro-duel-note">La ficha de <b>{pdpName(worstPdp.path)}</b> tiene <b>{(worstPdp.deadRate / Math.max(bestPdp.deadRate, 0.001)).toFixed(1)}×</b> la fricción de <b>{pdpName(bestPdp.path)}</b> — algo se ve clickeable y no lo es. Audita ese elemento y replica el molde de la ganadora.</div>
        </>
      )}

      {/* Comportamiento por día — datos reales */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Comportamiento por día</h3>
        <table className="t">
          <thead>
            <tr>
              <th {...dailyHeaderProps(0)}>Fecha</th>
              <th {...dailyHeaderProps(1)}>Sesiones</th>
              <th {...dailyHeaderProps(2)}>Scroll</th>
              <th {...dailyHeaderProps(3)}>Dead clicks</th>
              <th {...dailyHeaderProps(4)}>Rage clicks</th>
              <th {...dailyHeaderProps(5)}>Quickback</th>
              <th>Sesiones (rel.)</th>
            </tr>
          </thead>
          <tbody>
            {dailyRows.map((d: ClarityDailyRow) => {
              const share = d.sessions / maxDailySessions;
              return (
                <tr key={d.date}>
                  <td>
                    <b>{fmtDay(d.date)}</b>
                  </td>
                  <td>{formatInt(d.sessions)}</td>
                  <td>{formatPercent(d.scrollDepth, 1)}</td>
                  <td>{formatPercent(d.deadClickRate, 2)}</td>
                  <td>{formatPercent(d.rageClickRate, 2)}</td>
                  <td>{formatPercent(d.quickBackRate, 2)}</td>
                  <td>
                    <span className="hb">
                      <span
                        className="hb-fill"
                        style={{
                          width: `${Math.max(2, Math.round(share * 100))}%`,
                          background: CLARITY_BLUE,
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

      {/* Páginas más vistas — datos reales */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Páginas con más sesiones</h3>
        <table className="t">
          <thead>
            <tr>
              <th {...pageHeaderProps(0)}>Página</th>
              <th {...pageHeaderProps(1)}>Sesiones</th>
              <th {...pageHeaderProps(2)}>Scroll</th>
              <th {...pageHeaderProps(3)}>Dead clicks</th>
              <th>Fricción</th>
              <th {...pageHeaderProps(4)}>Rage clicks</th>
              <th>Sesiones (rel.)</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p: ClarityPageRow) => {
              const share = p.sessions / maxPageSessions;
              return (
                <tr key={p.pageUrl}>
                  <td>
                    <a
                      href={p.pageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      <span className="cro-badge">{pageType(shortPath(p.pageUrl))}</span>
                      <b>{shortPath(p.pageUrl)}</b>
                    </a>
                  </td>
                  <td>{formatInt(p.sessions)}</td>
                  <td>{formatPercent(p.scrollDepth, 1)}</td>
                  <td>{formatInt(p.deadClicks)}</td>
                  <td><b style={{ color: deadColor(p.sessions ? p.deadClicks / p.sessions : 0) }}>{formatPercent(p.sessions ? p.deadClicks / p.sessions : 0, 1)}</b></td>
                  <td>{formatInt(p.rageClicks)}</td>
                  <td>
                    <span className="hb">
                      <span
                        className="hb-fill"
                        style={{
                          width: `${Math.max(2, Math.round(share * 100))}%`,
                          background: CLARITY_BLUE,
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

      {/* Aviso honesto sobre el origen */}
      <div
        className="card"
        style={{ marginTop: '20px', borderStyle: 'dashed', borderColor: 'var(--b2)' }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Sobre estos datos</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Vienen directo de la <b>Data Export API de Microsoft Clarity</b> (tablas{' '}
          <code>clarity_metrics</code> y <code>clarity_pages</code>). El <b>dead/rage click rate</b> y
          el <b>quickback</b> son el porcentaje de sesiones con esa fricción (definición nativa de
          Clarity); el <b>scroll</b> es la profundidad promedio. La API de Clarity{' '}
          <b>solo entrega los últimos 1–3 días</b>, así que el historial se acumula hacia adelante con
          cada sincronización diaria — no hay backfill de fechas anteriores.
        </div>
      </div>

      <style jsx>{`
        .cro-pulse{display:flex;gap:16px;flex-wrap:wrap;align-items:stretch;margin-top:6px}
        .cro-dev{flex:1;min-width:230px;background:linear-gradient(135deg,#151226,#3a2170 70%,#5a37e0);border-radius:16px;padding:18px 22px;color:#fff;display:flex;flex-direction:column;justify-content:center}
        .cro-dev-big{font-size:44px;font-weight:800;line-height:1}.cro-dev-big span{font-size:16px;font-weight:700;margin-left:8px;opacity:.9}
        .cro-dev-bar{height:8px;background:rgba(255,255,255,.2);border-radius:5px;overflow:hidden;margin:12px 0 8px}.cro-dev-bar span{display:block;height:100%;background:#fff;border-radius:5px}
        .cro-dev-leg{font-size:11px;opacity:.85}
        .cro-dev-pend{font-size:13px;line-height:1.5}.cro-dev-pend b{display:block;font-size:15px;margin:2px 0}.cro-dev-pend span{opacity:.8;font-size:11.5px}
        .cro-health{flex:2;min-width:280px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
        .cro-hchip{background:#fff;border:1px solid #ebe7f4;border-radius:14px;padding:14px 12px;text-align:center;box-shadow:0 4px 18px rgba(60,40,120,.05);display:flex;flex-direction:column;justify-content:center}
        .cro-hchip b{font-size:24px;font-weight:800;line-height:1;color:#171226}.cro-hchip span{font-size:10px;color:${CRO_MUT};text-transform:uppercase;letter-spacing:.4px;font-weight:700;margin-top:5px}
        .cro-verdict{background:#faf9ff;border:1px solid #ece7fb;border-radius:12px;padding:12px 15px;font-size:12.5px;color:#2b2440;line-height:1.55;margin-top:12px}
        .cro-h{font-size:16px;font-weight:800;color:#171226;margin:26px 0 12px}
        .cro-matrix{margin-bottom:14px;padding:16px 18px 8px}
        .cro-mx-cap{font-size:11.5px;color:${CRO_MUT};line-height:1.5;margin-bottom:4px}
        .cro-matrix :global(svg) text{font-family:inherit}
        .cro-fnl{padding:16px 18px}
        .cro-fnl-row{display:grid;grid-template-columns:150px 1fr 190px;gap:14px;align-items:center;padding:7px 0}
        .cro-fnl-lbl{font-size:12.5px;font-weight:700;color:#171226}
        .cro-fnl-track{position:relative;background:#f2eff8;border-radius:8px;height:26px;display:flex;align-items:center}
        .cro-fnl-bar{position:absolute;left:0;top:0;height:100%;border-radius:8px;min-width:6px}
        .cro-fnl-n{position:relative;z-index:1;margin-left:10px;font-size:12.5px;font-weight:800;color:#171226;mix-blend-mode:normal}
        .cro-fnl-conv{font-size:11.5px;color:${CRO_MUT}}.cro-fnl-conv b{font-size:14px}
        .cro-fnl-base{font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:${CRO_MUT};font-weight:700}
        .cro-fnl-worst{color:${CRO_RED};font-weight:800}
        .cro-fnl-off{font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:${CRO_MUT};font-weight:700;background:#f0eef7;padding:2px 8px;border-radius:20px}
        .cro-fnl-note{font-size:11px;color:${CRO_MUT};line-height:1.55;margin-top:10px;border-top:1px solid #f4f2f9;padding-top:10px}.cro-fnl-note b{color:#2b2440}
        @media(max-width:640px){.cro-fnl-row{grid-template-columns:1fr;gap:4px}.cro-fnl-conv{padding-left:0}}
        .cro-secs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
        .cro-sec{background:#fff;border:1px solid #ebe7f4;border-radius:14px;padding:14px 15px;box-shadow:0 4px 18px rgba(60,40,120,.05)}
        .cro-sec-t{font-size:11px;font-weight:800;color:#5a37e0;text-transform:uppercase;letter-spacing:.4px}
        .cro-sec-n{font-size:26px;font-weight:800;color:#171226;margin:6px 0 2px;line-height:1}.cro-sec-n span{font-size:10px;color:${CRO_MUT};font-weight:700;margin-left:6px;text-transform:uppercase}
        .cro-sec-m{display:flex;justify-content:space-between;font-size:11px;color:${CRO_MUT};margin-top:8px;border-top:1px solid #f4f2f9;padding-top:8px}.cro-sec-m b{color:#171226}
        .cro-duel{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .cro-duel-c{border-radius:14px;padding:16px 18px;border:1px solid #ebe7f4}
        .cro-duel-c.win{background:rgba(31,175,106,.06);border-color:rgba(31,175,106,.3)}
        .cro-duel-c.lose{background:rgba(229,56,77,.05);border-color:rgba(229,56,77,.28)}
        .cro-duel-tag{font-size:10px;font-weight:800;letter-spacing:.4px}
        .cro-duel-n{font-size:16px;font-weight:800;color:#171226;margin:6px 0 6px;text-transform:capitalize}
        .cro-duel-m{font-size:12px;color:#2b2440}
        .cro-duel-note{background:#faf9ff;border:1px solid #ece7fb;border-radius:12px;padding:12px 15px;font-size:12px;color:#2b2440;line-height:1.55;margin-top:12px}
        .cro-badge{font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.3px;color:#5a37e0;background:rgba(124,92,255,.12);border-radius:5px;padding:2px 6px;margin-right:8px;white-space:nowrap}
        @media(max-width:640px){.cro-health{grid-template-columns:repeat(2,1fr)}.cro-duel{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
