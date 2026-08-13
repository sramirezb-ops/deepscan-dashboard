'use client';

import { HeroHead } from '@/components/ui/BrandLogo';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import {
  useClarity,
  type ClarityDailyRow,
  type ClarityPageRow,
  type ProductPerf,
  type BounceRow,
} from '@/lib/hooks/useClarity';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatInt, formatPercent } from '@/lib/utils';
import { DataTable, type DataColumn } from '@/components/ui/DataTable';

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
const CRO_RED = '#e5384d', CRO_AMBER = '#f5a524', CRO_GREEN = '#1faf6a', CRO_MUT = '#77718a', CRO_ACC = '#7c5cff', CRO_BLUE = '#5b9df9';
const VERDICT: Record<string, [string, string]> = {
  escalar: ['ESCALAR PAUTA', CRO_GREEN],
  arreglar: ['NO ESCALAR · arreglar', CRO_RED],
  explorar: ['EXPLORAR', CRO_BLUE],
  observar: ['observar', CRO_MUT],
};
const money = (v: number) => '$' + Math.round(v || 0).toLocaleString('en-US');
const tidy = (s: string) => (s || '').replace(/^(TENIS|Tenis|BOTAS|Botas)\s+/, '').replace(/\s+20\d\d\b/, '').trim();
// Semáforo de tasa de dead-click por página (fricción): menor es mejor.
function deadColor(rate: number): string {
  if (rate >= 0.08) return CRO_RED;
  if (rate >= 0.04) return CRO_AMBER;
  return CRO_GREEN;
}

// Veredicto conclusivo por sección: semáforo + etiqueta + "por qué" (no un scatter
// que hay que interpretar). Combina fricción (dead-click) con el scroll donde aplica.
function sectionVerdict(type: string, scroll: number, deadRate: number, sessions: number): { label: string; color: string; reason: string } {
  let label: string, color: string;
  if (deadRate >= 0.08) { label = 'ARREGLAR'; color = CRO_RED; }
  else if (deadRate >= 0.05) { label = 'OJO'; color = CRO_AMBER; }
  else { label = 'FUNCIONA'; color = CRO_GREEN; }
  // Familia de página → dónde se concentran los toques sin respuesta (dead-click).
  const fam = type.startsWith('PDP') ? 'pdp'
    : /colecci|categor|lista/i.test(type) ? 'list'
    : /b[uú]squeda|search/i.test(type) ? 'search'
    : /carrito|cart/i.test(type) ? 'cart'
    : type === 'Home' ? 'home' : 'other';
  const pct = formatPercent(deadRate, 1);
  let reason: string;
  if (deadRate >= 0.05) {
    const where = fam === 'list' ? 'sobre tarjetas de producto y filtros que no reaccionan al toque'
      : fam === 'search' ? 'sobre resultados y filtros de búsqueda que no reaccionan al toque'
      : fam === 'cart' ? 'en los controles del carrito (cantidad, quitar, ir a pagar)'
      : fam === 'pdp' ? 'en la ficha (galería, guía de tallas, botones)'
      : fam === 'home' ? 'en banners y accesos del inicio'
      : 'sobre elementos que no responden';
    const sev = deadRate >= 0.08 ? `Fricción alta (${pct})` : `Fricción media (${pct})`;
    const weight = sessions >= 1500 ? ' Alto volumen → prioridad #1 de la zona.'
      : sessions < 300 ? ' Volumen bajo: corrígelo, pero el impacto es acotado.'
      : '';
    reason = `${sev}: toques sin respuesta ${where}.${weight}`;
  } else {
    reason = `Baja fricción (${pct}) — la sección responde bien al toque.`;
  }
  // Caveat de scroll: sólo donde el contenido decisivo debe ir arriba del pliegue.
  if (scroll < 0.45 && fam === 'pdp') {
    reason += ` Scroll ~${formatPercent(scroll, 0)}: precio, talla, MSI y botón de compra tienen que ir arriba del pliegue.`;
  } else if (scroll < 0.45 && fam === 'home') {
    reason += ` Scroll ~${formatPercent(scroll, 0)}: la propuesta de valor y el CTA principal tienen que ir arriba del pliegue.`;
  }
  return { label, color, reason };
}

// Sparkline: forma de la tendencia (sin ejes) para un stat tile. Una sola serie
// → una línea de un color; área tenue + punto final. min 2 puntos.
function Spark({ values, color }: { values: number[]; color: string }) {
  if (!values || values.length < 2) return null;
  const W = 116, H = 26, pad = 3;
  const mn = Math.min(...values), mx = Math.max(...values);
  const rng = mx - mn || 1;
  const pts = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (W - 2 * pad),
    H - pad - ((v - mn) / rng) * (H - 2 * pad),
  ] as [number, number]);
  const d = 'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L');
  const last = pts[pts.length - 1];
  return (
    <svg className="cro-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d} L${last[0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`} fill={color} opacity="0.09" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill={color} />
    </svg>
  );
}

export function Clarity() {
  const client = useClient();
  const { range } = usePeriod();
  const { data, loading, error } = useClarity(client.id, range, client.id === SNEAKERS_ID ? SHOPIFY_PROP : undefined);

  const rangeLabel = formatRangeLabel(range);

  // Tablas: orden/filtro/paginado los maneja <DataTable>. Diario más reciente primero
  // (daily invertido); páginas y rebote se pasan completas y la tabla pagina.
  const dailyRows = data ? [...data.daily].reverse() : [];

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
          <div className="cro-hchip"><b style={{ color: deadColor(t.deadClickRate) }}>{formatPercent(t.deadClickRate, 1)}</b><span>dead clicks</span><Spark values={data.daily.map((d) => d.deadClickRate)} color={deadColor(t.deadClickRate)} /></div>
          <div className="cro-hchip"><b style={{ color: t.quickBackRate >= 0.15 ? CRO_RED : CRO_AMBER }}>{formatPercent(t.quickBackRate, 1)}</b><span>quickback</span><Spark values={data.daily.map((d) => d.quickBackRate)} color={t.quickBackRate >= 0.15 ? CRO_RED : CRO_AMBER} /></div>
          <div className="cro-hchip"><b>{formatPercent(t.scrollDepth, 0)}</b><span>scroll medio</span><Spark values={data.daily.map((d) => d.scrollDepth)} color={CRO_ACC} /></div>
          <div className="cro-hchip"><b>{formatInt(t.sessions)}</b><span>sesiones</span><Spark values={data.daily.map((d) => d.sessions)} color={CRO_ACC} /></div>
        </div>
      </div>
      {/* 0 · EL VEREDICTO — síntesis conclusiva de toda la hoja (auto del dato) */}
      {(() => {
        const pdpB = (data.bounce || []).filter((b) => b.page.includes('/products/'));
        const pdpBounce = pdpB.length ? Math.round((100 * pdpB.reduce((s, b) => s + b.bounce * b.sessions, 0)) / pdpB.reduce((s, b) => s + b.sessions, 0)) : 0;
        const fnlDrop = data.funnel && data.funnel.views ? +((100 * data.funnel.atc) / data.funnel.views).toFixed(1) : 0;
        const fixSecs = sections.filter((s) => s.deadRate >= 0.08).map((s) => s.type.replace(' (producto)', ''));
        const waste = (data.products || []).filter((p) => p.verdict === 'arreglar').sort((a, b) => b.sessions - a.sessions)[0];
        // Ganador CONFIABLE = convierte sobre el promedio con ≥2 ventas (verdict escalar/explorar),
        // no un 1-venta ruidoso. Si no hay, el cuello es transversal (cobro), no "qué producto".
        const win = (data.products || []).filter((p) => p.verdict === 'escalar' || p.verdict === 'explorar').sort((a, b) => b.conv - a.conv)[0];
        return (
          <div className="cro-vg">
            <div className="cro-vg-tag">📋 El veredicto</div>
            <div className="cro-vg-body">
              <p><b>{mobilePct}% móvil.</b> El tráfico pagado cae en fichas de producto{pdpBounce > 0 ? <> que rebotan <b>~{pdpBounce}%</b></> : null} y convierten <b>&lt;1%</b> — no enganchan en los primeros segundos.</p>
              <p><b className="cro-vg-k">Dónde falla:</b> la mayor caída on-site es <b>Vistas→Carrito ({fnlDrop}%)</b>{fixSecs.length ? <>, y <b>{fixSecs.join(', ')}</b> tienen fricción alta</> : null}. Las PDP funcionan técnicamente, pero venden poco.</p>
              <p><b className="cro-vg-k">Qué hacer:</b> {waste && win
                ? <>mueve pauta de <b>{tidy(waste.name)}</b> (mucho tráfico, casi no vende) hacia lo que convierte como <b>{tidy(win.name)}</b> ({formatPercent(win.conv, 1)}); engancha la ficha <b>arriba del pliegue</b>; y ataca el <b>cobro</b> (el dinero real).</>
                : <>el tráfico de alto volumen convierte parejo y bajo, así que el cuello no es <i>qué</i> producto pauteas sino el <b>cobro</b> (checkout/COD) — atácalo primero; y engancha la ficha <b>arriba del pliegue</b>.</>}</p>
            </div>
          </div>
        );
      })()}

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

      {/* 1c · ¿QUÉ VENDE Y HACIA DÓNDE LLEVAR LA PAUTA? (sesiones Clarity × venta Shopify) */}
      {data.products && data.products.length > 0 && (() => {
        const ps = data.products;
        const mxSess = Math.max(...ps.map((p) => p.sessions), 1);
        const waste = [...ps].filter((p) => p.verdict === 'arreglar').sort((a, b) => b.sessions - a.sessions)[0];
        // Promedio real de la tienda (compras ÷ sesiones sobre lo emparejado) para colorear conv.
        const mm = ps.filter((p) => p.matched);
        const base = mm.reduce((s, p) => s + p.sessions, 0) ? mm.reduce((s, p) => s + p.sold, 0) / mm.reduce((s, p) => s + p.sessions, 0) : 0;
        const vrank: Record<string, number> = { escalar: 4, explorar: 3, observar: 2, arreglar: 1 };
        const opCols: DataColumn<ProductPerf>[] = [
          { key: 'name', header: 'Producto', align: 'left', width: '22%', text: (p) => tidy(p.name), sortValue: (p) => tidy(p.name),
            render: (p) => <span style={{ fontWeight: 700 }}>{tidy(p.name)}</span> },
          { key: 'sess', header: 'Tráfico (sesiones)', align: 'left', width: '24%', text: (p) => String(p.sessions), sortValue: (p) => p.sessions,
            render: (p) => { const col = VERDICT[p.verdict][1]; return (
              <div style={{ position: 'relative', height: 16, background: '#f1eef8', borderRadius: 6, display: 'flex', alignItems: 'center', minWidth: 90 }}>
                <span style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.max(3, Math.round((100 * p.sessions) / mxSess))}%`, background: col, borderRadius: 6, opacity: 0.72 }} />
                <small style={{ position: 'relative', marginLeft: 8, fontSize: 10.5, fontWeight: 800 }}>{formatInt(p.sessions)}</small>
              </div>); } },
          { key: 'carts', header: 'Carritos (GA4)', align: 'right', hideOnMobile: true, text: (p) => String(p.carts), sortValue: (p) => p.carts,
            render: (p) => p.gaViews > 0 ? <b>{formatInt(p.carts)}</b> : <span style={{ color: CRO_MUT }}>—</span> },
          { key: 'atc', header: '% carrito (GA4)', align: 'right', hideOnMobile: true, text: (p) => String(p.atcRate), sortValue: (p) => p.atcRate,
            render: (p) => p.gaViews > 0 ? <span style={{ fontWeight: 700, color: p.atcRate >= 0.05 ? CRO_GREEN : '#171226' }}>{formatPercent(p.atcRate, 1)}</span> : <span style={{ color: CRO_MUT }}>—</span> },
          { key: 'sold', header: 'Vende', align: 'right', text: (p) => String(p.sold), sortValue: (p) => p.sold,
            render: (p) => p.sold > 0 ? <span><b>{p.sold} uds</b>{p.revenue > 0 ? <small style={{ color: CRO_MUT }}> · {money(p.revenue)}</small> : null}</span> : <span style={{ color: CRO_MUT }}>—</span> },
          { key: 'conv', header: 'Conv.', align: 'right', text: (p) => String(p.conv), sortValue: (p) => p.conv,
            render: (p) => { const good = p.verdict === 'escalar' || p.verdict === 'explorar'; return <b style={{ color: good ? CRO_GREEN : p.sold > 0 ? '#171226' : CRO_MUT }}>{p.matched ? formatPercent(p.conv, 1) : '—'}</b>; } },
          { key: 'verdict', header: 'Veredicto', align: 'left', width: '150px', text: (p) => VERDICT[p.verdict][0], sortValue: (p) => vrank[p.verdict],
            render: (p) => { const [lbl, col] = VERDICT[p.verdict]; return <span style={{ display: 'inline-block', fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase', color: col, background: col + '18', border: `1px solid ${col}44`, borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap' }}>{lbl}</span>; } },
        ];
        return (
          <>
            <h3 className="cro-h">🎯 ¿Qué vende y hacia dónde llevar la pauta? <span className="cro-sub2">sesiones PDP (Clarity) × venta (Shopify)</span></h3>
            {(() => {
              const winR = [...ps].filter((p) => p.verdict === 'escalar' || p.verdict === 'explorar').sort((a, b) => b.conv - a.conv)[0];
              if (waste && winR && waste.name !== winR.name) return (
                <div className="cro-op-head">La pauta trae fuerte <b>{tidy(waste.name)}</b> ({formatInt(waste.sessions)} sesiones) pero convierte <b style={{ color: CRO_RED }}>{formatPercent(waste.conv, 1)}</b>. En cambio <b>{tidy(winR.name)}</b> convierte <b style={{ color: CRO_GREEN }}>{formatPercent(winR.conv, 1)}</b> ({winR.sold} uds) → <b>mueve presupuesto hacia lo que sí vende.</b></div>
              );
              if (waste) return (
                <div className="cro-op-head">La pauta trae fuerte <b>{tidy(waste.name)}</b> ({formatInt(waste.sessions)} sesiones) pero convierte <b style={{ color: CRO_RED }}>{formatPercent(waste.conv, 1)}</b>, por debajo del promedio{base > 0 ? <> (<b>{formatPercent(base, 1)}</b>)</> : null}. Hoy <b>ningún producto de alto tráfico</b> convierte por encima del promedio → la fuga es <b>transversal (checkout/cobro)</b>, no de qué producto pautear.</div>
              );
              return null;
            })()}
            <div className="card cro-op">
              <DataTable
                rows={ps}
                columns={opCols}
                rowKey={(p) => p.name}
                initialSort={{ key: 'sess', dir: 'desc' }}
                initialPageSize={10}
                searchPlaceholder="Filtrar producto…"
                toolbarLeft={`${ps.length} productos`}
              />
              <div className="cro-op-note">🟢 <b>Escalar</b>: convierte arriba del promedio con volumen. 🔴 <b>No escalar</b>: mucho tráfico, convierte muy por debajo → arregla la ficha o corta el gasto. 🔵 <b>Explorar</b>: poco tráfico pero convierte bien → prueba subirle pauta. <b>Tráfico</b> = sesiones PDP de <b>Clarity</b> (mismas de la tabla de páginas → los dos cuadros cuadran). <b>Conv.</b> = ventas Shopify ÷ esas sesiones = tasa real <b>sesión→compra</b>{base > 0 ? <> (promedio tienda <b>{formatPercent(base, 1)}</b>; el veredicto es relativo a ese promedio)</> : null}. <b>Carritos</b> y <b>% carrito</b> = añadir-al-carrito de <b>GA4</b> sobre vistas GA4 (métrica interna de GA4; su absoluto es más bajo que las sesiones, pero la tasa es consistente). {data.salesDated ? <>La venta suma el <b>rango exacto</b> seleccionado (ventas Shopify por día).</> : <>⚠️ La venta es el <b>snapshot Shopify</b> más reciente (~30 d, no el rango exacto — corre el ETL con ventas por día para respetar el rango).</>} Son unidades chicas → úsalo como señal, <b>verifica los movimientos grandes</b> antes de ejecutar.</div>
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
          {(() => {
            // Coloca cada burbuja y separa verticalmente las etiquetas del mismo lado
            // que se encimen (Home/Otra caen casi en el mismo punto → se pisaban).
            const nodes = sections.map((s) => {
              const x = msx(s.sessions), y = msy(s.deadRate), r = mrad(s.sessions);
              const left = x > MW - mR - 52;
              return { s, x, y, r, c: deadColor(s.deadRate), left, lx: left ? x - r - 5 : x + r + 5, ly: y + 3.5 };
            });
            const LH = 15;
            [true, false].forEach((side) => {
              const g = nodes.filter((n) => n.left === side).sort((a, b) => a.ly - b.ly);
              for (let i = 1; i < g.length; i++) if (g[i].ly - g[i - 1].ly < LH) g[i].ly = g[i - 1].ly + LH;
            });
            return nodes.map((n) => (
              <g key={n.s.type}>
                <circle cx={n.x} cy={n.y} r={n.r} fill={n.c} fillOpacity="0.5" stroke="#fff" strokeWidth="2" />
                <circle cx={n.x} cy={n.y} r={n.r} fill="none" stroke={n.c} strokeWidth="1.5" />
                <title>{`${n.s.type}: ${formatInt(n.s.sessions)} sesiones · ${formatPercent(n.s.deadRate, 1)} fricción · scroll ${formatPercent(n.s.scroll, 0)}`}</title>
                {Math.abs(n.ly - (n.y + 3.5)) > 1 && <line x1={n.left ? n.x - n.r - 2 : n.x + n.r + 2} y1={n.y} x2={n.lx} y2={n.ly - 3.5} stroke={n.c} strokeWidth="1" opacity="0.35" />}
                <text x={n.lx} y={n.ly} textAnchor={n.left ? 'end' : 'start'} fontSize="10.5" fontWeight="700" fill="#171226" stroke="#fff" strokeWidth="2.6" paintOrder="stroke">{n.s.type.replace(' (producto)', '')}</text>
              </g>
            ));
          })()}
        </svg>
      </div>
      <div className="card cro-score">
        {[...sections].sort((a, b) => b.deadRate - a.deadRate).map((s) => {
          const v = sectionVerdict(s.type, s.scroll, s.deadRate, s.sessions);
          return (
            <div className="cro-sc2-row" key={s.type}>
              <span className="cro-sc2-dot" style={{ background: v.color }} />
              <div className="cro-sc2-main">
                <div className="cro-sc2-hd"><b>{s.type.replace(' (producto)', '')}</b><span className="cro-sc2-badge" style={{ color: v.color, background: v.color + '18', borderColor: v.color + '44' }}>{v.label}</span></div>
                <div className="cro-sc2-reason">{v.reason}</div>
              </div>
              <div className="cro-sc2-stats">
                <span><b>{formatInt(s.sessions)}</b> sesiones</span>
                <span>scroll <b>{formatPercent(s.scroll, 0)}</b></span>
                <span>fricción <b style={{ color: deadColor(s.deadRate) }}>{formatPercent(s.deadRate, 1)}</b></span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 2b · SCROLL / FOLD POR SECCIÓN */}
      <h3 className="cro-h">📜 Profundidad de scroll · ¿ven lo importante?</h3>
      <div className="card cro-scroll">
        {[...sections].sort((a, b) => a.scroll - b.scroll).map((s) => {
          const pct = Math.round(s.scroll * 100);
          const shallow = s.scroll < 0.5;
          return (
            <div className="cro-sc-row" key={s.type}>
              <div className="cro-sc-lbl">{s.type.replace(' (producto)', '')}</div>
              <div className="cro-sc-track">
                <span className="cro-sc-bar" style={{ width: `${Math.max(2, pct)}%` }} />
                <span className="cro-sc-ref" />
              </div>
              <div className="cro-sc-val" style={{ color: shallow ? CRO_AMBER : '#171226' }}>{pct}%</div>
            </div>
          );
        })}
        <div className="cro-sc-note">La barra = hasta dónde llega el usuario promedio (línea <b>│</b> = 50%). <b>En PDP y Home el scroll es ~40%</b> → precio, talla, <b>MSI</b> y botón de compra <b>tienen que ir arriba del pliegue</b> o se pierden. En listas (Colección/Búsqueda) scrollean más porque están buscando — ahí el scroll alto es normal, no un logro.</div>
      </div>

      {/* 2c · ¿DÓNDE REBOTAN? (GA4 landing bounce) */}
      {data.bounce && data.bounce.length > 0 && (() => {
        const bs = data.bounce;
        const mxs = Math.max(...bs.map((b) => b.sessions), 1);
        const bcolor = (r: number) => (r >= 0.55 ? CRO_RED : r >= 0.4 ? CRO_AMBER : CRO_GREEN);
        const worst = [...bs].filter((b) => b.sessions >= 100).sort((a, b) => b.bounce - a.bounce)[0] || bs[0];
        return (
          <>
            <h3 className="cro-h">🚪 ¿Dónde rebotan? <span className="cro-sub2">entran y se van sin interactuar (GA4)</span></h3>
            {worst && (
              <div className="cro-bnc-head">Donde más rebotan con volumen: <b>{shortPath(worst.page)}</b> — <b style={{ color: bcolor(worst.bounce) }}>{formatPercent(worst.bounce, 0)}</b> de {formatInt(worst.sessions)} entradas se van sin tocar nada.{worst.bounce >= 0.5 ? ' La pauta trae gente que no engancha con esa página.' : ''}</div>
            )}
            <div className="card cro-bnc">
              <DataTable
                rows={bs}
                rowKey={(b) => b.page}
                initialSort={{ key: 'sess', dir: 'desc' }}
                initialPageSize={10}
                searchPlaceholder="Filtrar página…"
                toolbarLeft={`${bs.length} páginas de entrada`}
                columns={[
                  { key: 'page', header: 'Página de entrada', align: 'left', width: '46%', text: (b) => shortPath(b.page), sortValue: (b) => shortPath(b.page),
                    render: (b) => <b style={{ fontWeight: 700 }}>{shortPath(b.page)}</b> },
                  { key: 'sess', header: 'Entradas', align: 'right', text: (b) => String(b.sessions), sortValue: (b) => b.sessions,
                    render: (b) => (
                      <div style={{ position: 'relative', height: 16, background: '#f1eef8', borderRadius: 6, display: 'flex', alignItems: 'center', minWidth: 90 }}>
                        <span style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.max(3, Math.round((100 * b.sessions) / mxs))}%`, background: CRO_ACC, borderRadius: 6, opacity: 0.7 }} />
                        <small style={{ position: 'relative', marginLeft: 8, fontSize: 10.5, fontWeight: 800 }}>{formatInt(b.sessions)}</small>
                      </div>) },
                  { key: 'bounce', header: 'Rebote', align: 'right', sortValue: (b) => b.bounce,
                    render: (b) => <b style={{ color: bcolor(b.bounce) }}>{formatPercent(b.bounce, 0)}</b> },
                ] as DataColumn<BounceRow>[]}
              />
              <div className="cro-bnc-note">Rebote = % de entradas que se van sin ninguna interacción. 🔴 ≥55% · 🟡 40–55% · 🟢 &lt;40%. Rebote alto en una landing pagada = <b>mismatch anuncio↔página</b> o la ficha no engancha en los primeros segundos.</div>
            </div>
          </>
        );
      })()}

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
        <DataTable
          rows={dailyRows}
          rowKey={(d) => d.date}
          initialSort={{ key: 'date', dir: 'desc' }}
          initialPageSize={10}
          searchable={false}
          columns={[
            { key: 'date', header: 'Fecha', align: 'left', sortValue: (d) => d.date, render: (d) => <b>{fmtDay(d.date)}</b> },
            { key: 'sess', header: 'Sesiones', align: 'right', sortValue: (d) => d.sessions, render: (d) => formatInt(d.sessions) },
            { key: 'scroll', header: 'Scroll', align: 'right', sortValue: (d) => d.scrollDepth, render: (d) => formatPercent(d.scrollDepth, 1) },
            { key: 'dead', header: 'Dead clicks', align: 'right', hideOnMobile: true, sortValue: (d) => d.deadClickRate, render: (d) => formatPercent(d.deadClickRate, 2) },
            { key: 'rage', header: 'Rage clicks', align: 'right', hideOnMobile: true, sortValue: (d) => d.rageClickRate, render: (d) => formatPercent(d.rageClickRate, 2) },
            { key: 'qb', header: 'Quickback', align: 'right', sortValue: (d) => d.quickBackRate, render: (d) => formatPercent(d.quickBackRate, 2) },
          ] as DataColumn<ClarityDailyRow>[]}
        />
      </div>

      {/* Páginas más vistas — datos reales */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Páginas con más sesiones</h3>
        <DataTable
          rows={data.pages}
          rowKey={(p) => p.pageUrl}
          initialSort={{ key: 'sess', dir: 'desc' }}
          initialPageSize={10}
          searchPlaceholder="Filtrar página…"
          toolbarLeft={`${data.pages.length} páginas`}
          columns={[
            { key: 'page', header: 'Página', align: 'left', width: '36%', text: (p) => shortPath(p.pageUrl), sortValue: (p) => shortPath(p.pageUrl),
              render: (p) => (
                <a href={p.pageUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.3, color: CRO_ACC, background: CRO_ACC + '14', border: `1px solid ${CRO_ACC}33`, borderRadius: 6, padding: '2px 6px', whiteSpace: 'nowrap' }}>{pageType(shortPath(p.pageUrl))}</span>
                  <b>{shortPath(p.pageUrl)}</b>
                </a>) },
            { key: 'sess', header: 'Sesiones', align: 'right', text: (p) => String(p.sessions), sortValue: (p) => p.sessions, render: (p) => formatInt(p.sessions) },
            { key: 'scroll', header: 'Scroll', align: 'right', sortValue: (p) => p.scrollDepth, render: (p) => formatPercent(p.scrollDepth, 1) },
            { key: 'dead', header: 'Dead clicks', align: 'right', hideOnMobile: true, sortValue: (p) => p.deadClicks, render: (p) => formatInt(p.deadClicks) },
            { key: 'fric', header: 'Fricción', align: 'right', sortValue: (p) => (p.sessions ? p.deadClicks / p.sessions : 0),
              render: (p) => { const d = p.sessions ? p.deadClicks / p.sessions : 0; return <b style={{ color: deadColor(d) }}>{formatPercent(d, 1)}</b>; } },
            { key: 'rage', header: 'Rage clicks', align: 'right', hideOnMobile: true, sortValue: (p) => p.rageClicks, render: (p) => formatInt(p.rageClicks) },
          ] as DataColumn<ClarityPageRow>[]}
        />
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
        .cro-spark{width:100%;height:22px;margin-top:8px;display:block}
        .cro-verdict{background:#faf9ff;border:1px solid #ece7fb;border-radius:12px;padding:12px 15px;font-size:12.5px;color:#2b2440;line-height:1.55;margin-top:12px}
        .cro-vg{margin-top:14px;background:linear-gradient(120deg,#151226,#3a2170 62%,#5a37e0);border-radius:16px;padding:18px 22px;box-shadow:0 6px 22px rgba(60,40,120,.14)}
        .cro-vg-tag{display:inline-block;font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#151226;background:#c4e938;padding:4px 11px;border-radius:20px}
        .cro-vg-body{margin-top:11px}
        .cro-vg-body p{font-size:13px;line-height:1.6;color:#efeafc;margin:0 0 7px}.cro-vg-body p:last-child{margin-bottom:0}
        .cro-vg-body b{color:#fff}
        .cro-vg-k{color:#c4e938 !important}
        .cro-h{font-size:16px;font-weight:800;color:#171226;margin:26px 0 12px}
        .cro-matrix{margin-bottom:14px;padding:16px 18px 8px}
        .cro-mx-cap{font-size:11.5px;color:${CRO_MUT};line-height:1.5;margin-bottom:4px}
        .cro-matrix :global(svg) text{font-family:inherit}
        .cro-sub2{font-size:11px;font-weight:600;color:${CRO_MUT};text-transform:none;letter-spacing:0}
        .cro-op-head{background:linear-gradient(135deg,#fff,#f0fbf5);border:1px solid rgba(31,175,106,.28);border-left:4px solid ${CRO_GREEN};border-radius:14px;padding:14px 18px;font-size:13px;line-height:1.55;color:#2b2440;margin-bottom:12px}
        .cro-op{padding:8px 18px 16px}
        .cro-op-hd,.cro-op-row{display:grid;grid-template-columns:1.6fr 1.4fr 1fr 60px 140px;gap:12px;align-items:center}
        .cro-op-hd{font-size:9.5px;text-transform:uppercase;letter-spacing:.4px;color:${CRO_MUT};font-weight:700;padding:10px 0 8px;border-bottom:2px solid #ebe7f4}
        .cro-op-row{padding:9px 0;border-bottom:1px solid #f4f2f9;font-size:12.5px}
        .cro-op-n{font-weight:700;color:#171226}
        .cro-op-bar{position:relative;background:#f2eff8;border-radius:6px;height:18px;display:flex;align-items:center}
        .cro-op-bar span{position:absolute;left:0;top:0;height:100%;border-radius:6px;opacity:.85}
        .cro-op-bar small{position:relative;margin-left:8px;font-size:11px;font-weight:700;color:#171226}
        .cro-op-v b{color:#171226}.cro-op-v small{color:${CRO_MUT}}
        .cro-op-c{font-weight:800;text-align:right}
        .cro-op-badge{font-size:8.5px;font-weight:800;border:1px solid;border-radius:20px;padding:3px 8px;letter-spacing:.3px;white-space:nowrap}
        .cro-op-note{font-size:11px;color:${CRO_MUT};line-height:1.55;margin-top:12px;border-top:1px solid #f4f2f9;padding-top:10px}.cro-op-note b{color:#2b2440}
        @media(max-width:720px){.cro-op-hd{display:none}.cro-op-row{grid-template-columns:1fr 1fr;row-gap:4px}}
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
        .cro-score{padding:6px 18px}
        .cro-sc2-row{display:grid;grid-template-columns:12px 1fr 190px;gap:14px;align-items:center;padding:12px 0;border-bottom:1px solid #f4f2f9}
        .cro-sc2-row:last-child{border-bottom:0}
        .cro-sc2-dot{width:12px;height:12px;border-radius:50%}
        .cro-sc2-hd{display:flex;align-items:center;gap:9px}.cro-sc2-hd b{font-size:13.5px;color:#171226}
        .cro-sc2-badge{font-size:8.5px;font-weight:800;border:1px solid;border-radius:20px;padding:2px 8px;letter-spacing:.4px}
        .cro-sc2-reason{font-size:11.5px;color:${CRO_MUT};line-height:1.5;margin-top:3px}
        .cro-sc2-stats{display:flex;flex-direction:column;gap:2px;font-size:10.5px;color:${CRO_MUT};text-align:right}.cro-sc2-stats b{color:#171226}
        @media(max-width:640px){.cro-sc2-row{grid-template-columns:12px 1fr}.cro-sc2-stats{grid-column:2;flex-direction:row;gap:12px;text-align:left;margin-top:4px}}
        .cro-bnc-head{background:linear-gradient(135deg,#fff,#fdf2f4);border:1px solid rgba(229,56,77,.22);border-left:4px solid ${CRO_RED};border-radius:14px;padding:13px 17px;font-size:12.5px;line-height:1.55;color:#2b2440;margin-bottom:12px}
        .cro-bnc{padding:14px 18px}
        .cro-bnc-row{display:grid;grid-template-columns:1.4fr 1fr 88px;gap:14px;align-items:center;padding:7px 0}
        .cro-bnc-n{font-size:12px;font-weight:700;color:#171226;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .cro-bnc-bar{position:relative;background:#f2eff8;border-radius:6px;height:16px;display:flex;align-items:center}
        .cro-bnc-bar span{position:absolute;left:0;top:0;height:100%;border-radius:6px;background:${CRO_ACC};opacity:.7}
        .cro-bnc-bar small{position:relative;margin-left:8px;font-size:10.5px;font-weight:700;color:#171226}
        .cro-bnc-v{font-size:14px;font-weight:800;text-align:right}.cro-bnc-v small{font-size:9px;color:${CRO_MUT};font-weight:700;text-transform:uppercase}
        .cro-bnc-note{font-size:11px;color:${CRO_MUT};line-height:1.55;margin-top:10px;border-top:1px solid #f4f2f9;padding-top:10px}.cro-bnc-note b{color:#2b2440}
        @media(max-width:640px){.cro-bnc-row{grid-template-columns:1fr 70px}.cro-bnc-bar{display:none}}
        .cro-scroll{padding:16px 18px}
        .cro-sc-row{display:grid;grid-template-columns:120px 1fr 48px;gap:14px;align-items:center;padding:6px 0}
        .cro-sc-lbl{font-size:12px;font-weight:700;color:#171226}
        .cro-sc-track{position:relative;background:#f2eff8;border-radius:7px;height:16px}
        .cro-sc-bar{position:absolute;left:0;top:0;height:100%;border-radius:7px;background:${CRO_ACC};min-width:4px}
        .cro-sc-ref{position:absolute;left:50%;top:-3px;height:22px;width:2px;background:${CRO_MUT};opacity:.5}
        .cro-sc-val{font-size:13px;font-weight:800;text-align:right}
        .cro-sc-note{font-size:11px;color:${CRO_MUT};line-height:1.55;margin-top:10px;border-top:1px solid #f4f2f9;padding-top:10px}.cro-sc-note b{color:#2b2440}
        .cro-duel{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .cro-duel-c{border-radius:14px;padding:16px 18px;border:1px solid #ebe7f4}
        .cro-duel-c.win{background:rgba(31,175,106,.06);border-color:rgba(31,175,106,.3)}
        .cro-duel-c.lose{background:rgba(229,56,77,.05);border-color:rgba(229,56,77,.28)}
        .cro-duel-tag{font-size:10px;font-weight:800;letter-spacing:.4px}
        .cro-duel-n{font-size:16px;font-weight:800;color:#171226;margin:6px 0 6px;text-transform:capitalize}
        .cro-duel-m{font-size:12px;color:#2b2440}
        .cro-duel-note{background:#faf9ff;border:1px solid #ece7fb;border-radius:12px;padding:12px 15px;font-size:12px;color:#2b2440;line-height:1.55;margin-top:12px}
        .cro-badge{font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.3px;color:#5a37e0;background:rgba(124,92,255,.12);border-radius:5px;padding:2px 6px;margin-right:8px;white-space:nowrap}
        /* #4 · micro-interacciones y pulido — sutil, rápido, físico */
        .cro-hchip,.cro-sec,.cro-duel-c{transition:box-shadow .18s ease,border-color .18s ease,transform .18s ease}
        .cro-hchip:hover,.cro-sec:hover{box-shadow:0 10px 26px rgba(60,40,120,.11);border-color:#d9d2ee;transform:translateY(-2px)}
        .cro-duel-c:hover{box-shadow:0 10px 26px rgba(60,40,120,.10)}
        .cro-fnl-row,.cro-sc-row{transition:background .15s ease;border-radius:8px}
        .cro-fnl-row:hover,.cro-sc-row:hover{background:#faf9ff}
        .cro-fnl-bar,.cro-sc-bar,.cro-dev-bar span{transition:width .5s cubic-bezier(.22,1,.36,1)}
        .cro-matrix :global(svg) circle{transition:fill-opacity .18s ease}
        .cro-matrix :global(svg) g{cursor:default}
        .cro-matrix :global(svg) g:hover circle{fill-opacity:.72}
        .cro-spark path,.cro-spark circle{transition:opacity .18s ease}
        @media(max-width:640px){.cro-health{grid-template-columns:repeat(2,1fr)}.cro-duel{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
