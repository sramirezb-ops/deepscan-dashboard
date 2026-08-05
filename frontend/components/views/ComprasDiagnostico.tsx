'use client';

import { useState, useMemo, useEffect } from 'react';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { useCompras, type Creative, type Pair } from '@/lib/hooks/useCompras';
import { useLanding, type LandingPage } from '@/lib/hooks/useLanding';
import { useCatalog } from '@/lib/hooks/useCatalog';
import { useSortableTable } from '@/components/ui/useSortableTable';
import { EmptyState } from '@/components/ui/EmptyState';

const INK = '#171226', INK2 = '#2b2440', MUT = '#77718a', ACC = '#7c5cff', ACCD = '#5a37e0';
const RED = '#e5384d', AMBER = '#f5a524', GREEN = '#1faf6a', LINE = '#ebe7f4';
const BERRY = '#b0466e', BLUE = '#5b9df9';
// Clasifica cada par por su MODO de éxito/fracaso (diferencia dónde muere la venta):
// vende+cobra / vende-no cobra / llega a checkout pero 0 cerradas (cobro/COD) /
// mucha vista sin intención (viral) / la página no convierte.
function pairTag(p: { sold: number; rev_paid: number; checkout: number; views: number }): [string, string] {
  if (p.sold > 0 && p.rev_paid > 0) return ['ESCALAR', GREEN];
  if (p.sold > 0) return ['COBRAR', AMBER];
  if (p.checkout >= 5) return ['MUERE EN COBRO', BERRY];
  if (p.views >= 150 && p.checkout < 3) return ['VIRAL · NO VENDE', BLUE];
  if (p.views >= 80) return ['ARREGLAR PÁGINA', RED];
  return ['observar', MUT];
}

const money = (v: number | null | undefined) => {
  const x = Math.round(((v || 0) as number) * 100) / 100;
  if (x !== 0 && Math.abs(x) < 10 && Math.abs(x) % 1 !== 0) return (x < 0 ? '-$' : '$') + Math.abs(x).toFixed(2);
  return (x < 0 ? '-$' : '$') + Math.abs(Math.round(x)).toLocaleString('en-US');
};
const kfmt = (v: number) => Math.round(v || 0).toLocaleString('en-US');
const sem = (v: number, g: number, a: number) => (v >= g ? GREEN : v >= a ? AMBER : RED);
const short = (nm: string) => {
  let s = nm.split('|')[0];
  ['🥇', '🏆', '🔥', '⚡️', '⚡', '(2)', '💎', '🌸', '🚨'].forEach((c) => (s = s.split(c).join('')));
  return s.trim().slice(0, 40);
};
function posterUrl(c: Creative): string {
  if (c.image_url) return c.image_url;
  const t = c.thumbnail_url || '';
  if (t.includes('url=') && decodeURIComponent(t).includes('/ads/image')) {
    try { const u = new URL(t); const inner = u.searchParams.get('url'); if (inner) return inner; } catch { /* noop */ }
  }
  return t;
}

export function ComprasDiagnostico() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useCompras(client.id, range, previous);
  const { data: landing } = useLanding(client.id, range, 12, 500);
  const { data: catalog } = useCatalog(client.id, range);
  const [sel, setSel] = useState<number | null>(null);

  // Tabla "El par correcto" — orden por columna + paginación (tipo Google Ads)
  const [parSize, setParSize] = useState(10);
  const [parPage, setParPage] = useState(1);
  const parSorted = useSortableTable<Pair>(data?.pairs ?? [], [
    (p) => p.name, (p) => p.views, (p) => p.atc, (p) => p.checkout, (p) => p.sold, (p) => p.rev_paid, (p) => p.rev_pend, null,
  ], { col: 1, dir: 'desc' });
  useEffect(() => { setParPage(1); }, [parSorted.sort, parSize]);

  // Tabla "Páginas de aterrizaje" — orden + paginación
  const [lpSize, setLpSize] = useState(10);
  const [lpPage, setLpPage] = useState(1);
  const lpSorted = useSortableTable<LandingPage>(landing?.pages ?? [], [
    (p) => p.path, (p) => p.sessions, (p) => p.atc_r, (p) => p.chk_r, (p) => p.buy, (p) => p.bounce,
  ], { col: 1, dir: 'desc' });
  useEffect(() => { setLpPage(1); }, [lpSorted.sort, lpSize]);

  const view = useMemo(() => {
    if (!data) return null;
    const T = data.totals, ST = data.store, PT = data.prevTotals, PST = data.prevStore;
    const r = (a: number, b: number, d = 1) => (b ? +((100 * a) / b).toFixed(d) : 0);
    const rBuy = r(T.purchases, T.checkout);
    const abandon = T.checkout - T.purchases;
    const blended = T.roas;
    const aov = T.aov;

    // ── Embudo por TASA (A) + Δ vs periodo de comparación (D) ──
    type Step = { key: string; lbl: string; val: number; from: number; sub: string;
      conv: number; pconv: number; delta: number; cc: string; obj: number; bench: string; ratelbl: string; leak: string; note?: string };
    const cfg: Array<[string, string, number, number, number, number, number, number, number, string, string, string]> = [
      // key, lbl, val, prevVal, from, prevFrom, g, a, obj, benchTxt, ratelbl, leakTxt
      ['clk', 'Clics en el enlace', T.link_clicks, PT.link_clicks, T.impressions, PT.impressions, 2, 1, 2, 'obj 1–2%', 'CTR', ''],
      ['lpv', 'Visitas a la página', T.landing, PT.landing, T.link_clicks, PT.link_clicks, 85, 70, 85, 'obj >85%', '% que carga', `${kfmt(T.link_clicks - T.landing)} clics no cargan`],
      ['cart', 'Agregan al carrito', T.cart, PT.cart, T.landing, PT.landing, 6, 3, 6, 'obj 5–10%', '% que agrega', `${kfmt(T.landing - T.cart)} ven y NO agregan`],
      ['chk', 'Inician pago', T.checkout, PT.checkout, T.cart, PT.cart, 45, 30, 45, 'obj >45%', '% que paga', ''],
      ['buy', 'Compran', T.purchases, PT.purchases, T.checkout, PT.checkout, 35, 15, 35, 'obj 35–60%', '% que compra', `${kfmt(abandon)} inician pago y NO compran`],
    ];
    const steps: Step[] = cfg.map(([key, lbl, val, pval, from, pfrom, g, a, obj, bench, ratelbl, leak]) => {
      const conv = r(val, from), pconv = r(pval, pfrom);
      return { key, lbl, val, from, sub: `${money(T.spend / (val || 1))}/${key === 'clk' ? 'clic' : key === 'lpv' ? 'visita' : key === 'cart' ? 'carrito' : key === 'chk' ? 'pago' : 'compra'}`,
        conv, pconv, delta: +(conv - pconv).toFixed(1), cc: sem(conv, g, a), obj, bench, ratelbl, leak };
    });
    // Paso extra (B): Compra → Cobrada (nivel tienda)
    const cobrada: Step = { key: 'cobr', lbl: 'Cobradas', val: ST.orders_paid, from: ST.orders,
      sub: `${money(ST.revenue_paid)} cobrado`, conv: ST.paid_pct, pconv: PST.paid_pct, delta: +(ST.paid_pct - PST.paid_pct).toFixed(1),
      cc: sem(ST.paid_pct, 90, 60), obj: 90, bench: 'obj >90%', ratelbl: 'se cobra', leak: `${money(ST.revenue_pending)} pendiente de cobro`, note: 'tienda' };
    // Rotura #1 = el paso rojo más lejos de su objetivo
    const reds = steps.filter((s) => s.cc === RED);
    const worst = (reds.length ? reds : steps).reduce((w, s) => (s.conv / s.obj < w.conv / w.obj ? s : w));
    const buyAtObj = Math.round((worst.from * worst.obj) / 100);
    const recover = Math.max(buyAtObj - worst.val, 0);
    // Segunda alerta = mayor deterioro de tasa (Δ más negativo) distinto de la rotura
    const second = steps.filter((s) => s.key !== worst.key && s.delta < -2).sort((x, y) => x.delta - y.delta)[0] || null;
    // AI insights
    const nm = data.pairs.find((p) => p.name.includes('MIND 001 SLIDE BLACK')) || { views: 0, atc: 0, checkout: 0 };
    const pend = data.pairs.filter((p) => p.sold > 0 && p.rev_paid === 0).slice(0, 3).map((p) => p.name.replace('TENIS ', ''));
    const existing = data.segments.find((s) => s.name === 'Compradores actuales') || { pct: 0, buy: 0, spend: 0 };
    const vids = data.creatives.filter((c) => c.is_video), imgs = data.creatives.filter((c) => !c.is_video);
    const avgroas = (x: Creative[]) => { const s = x.reduce((a, c) => a + c.spend, 0); return s ? +(x.reduce((a, c) => a + c.pv, 0) / s).toFixed(2) : 0; };
    const vroas = avgroas(vids), iroas = avgroas(imgs);
    const fb = data.platforms.find((p) => p.key === 'facebook'), ig = data.platforms.find((p) => p.key === 'instagram');
    const AI: { ic: string; pri: string; pc: string; t: string; h: string; hip: string; ac: string }[] = [
      { ic: '🔥', pri: 'ALTA', pc: RED, t: 'Tráfico caliente que no cierra: NIKE MIND 001 Slide', h: `Es el par más visto: ${nm.views} vistas, ${nm.atc} al carrito, ${nm.checkout} checkout… y 0 compras.`, hip: 'Siendo una slide (ticket bajo esperado), que nadie cierre apunta a precio fuera de mercado o falta de stock por talla.', ac: 'Comparar precio vs competencia (Amazon, Mercado Libre) y revisar stock. Si el precio es correcto, probar oferta. Es el mayor desperdicio de tráfico pagado.' },
      { ic: '💳', pri: 'ALTA', pc: RED, t: 'El ROAS “real” es la mitad — la fuga está en el pago', h: `De ${T.checkout} pagos iniciados solo compran ${T.purchases} (${rBuy}%), y solo se cobra ${ST.paid_pct}%. ROAS colocado ${blended}× → cobrado ${ST.roas_collected}×.`, hip: `A un ticket de ~${money(aov)}, sin meses sin intereses (MSI) ni pagos flexibles el checkout se cae; y los COD no se confirman.`, ac: 'Activar MSI + OXXO/SPEI y confirmación de COD por WhatsApp. Se optimiza por “compras” que en su mayoría no entran a caja.' },
      { ic: '📱', pri: 'MEDIA', pc: AMBER, t: 'Instagram paga CPM pero no vende', h: `Facebook rinde ${fb?.roas ?? 0}× vs ${ig?.roas ?? 0}× en Instagram.`, hip: 'La audiencia de IG (browsing/joven) no cierra tickets altos, o el creativo no está pensado para el formato vertical.', ac: 'Recortar IG en Próximos y mover peso a Facebook. Si se mantiene IG, probar Reels con oferta/MSI explícitos.' },
      { ic: '♻️', pri: 'MEDIA', pc: AMBER, t: 'Tus compradores actuales están abandonados', h: `El segmento “compradores actuales” recibe ${existing.pct}% del gasto y lleva ${existing.buy} ventas.`, hip: 'No hay estrategia de recompra: el público más barato de convertir está sin trabajar.', ac: 'Crear un ad set de retención/recompra con los nuevos drops + flujo post-compra (WhatsApp/email). Palanca de LTV.' },
      { ic: '🖼️', pri: 'MEDIA', pc: ACC, t: 'La imagen vende más que el video', h: `Los creativos de imagen promedian ${iroas}× ROAS vs ${vroas}× del video.`, hip: 'En sneakers de hype, la foto del producto + oferta convierte más que el storytelling largo.', ac: 'Priorizar creativos de producto/precio para cierre; reservar el video para awareness.' },
    ];
    if (pend.length) AI.push({ ic: '🧾', pri: 'MEDIA', pc: AMBER, t: 'Ventas “fantasma”: pares 100% pendientes de pago', h: `Vendidos pero con $0 cobrado: ${pend.join(', ')}.`, hip: 'Preventas/COD de ticket alto que no se concretan — el cliente aparta pero no paga.', ac: 'Exigir anticipo obligatorio en preventa y medir “venta cobrada”, no “venta colocada”.' });
    return { T, ST, steps, cobrada, worst, second, buyAtObj, recover, blended, aov, rBuy, abandon, AI, vroas, iroas, fb, ig };
  }, [data]);

  if (loading) return <div className="ct-pad"><EmptyState title="Cargando Compras…" message="Un momento…" /></div>;
  if (error || !data || !view) return <div className="ct-pad"><EmptyState title="Sin datos de Compras" message={error || 'No hay datos de Advantage+ en este período.'} /></div>;

  const BS = data.sets['Best Sellers'], PX = data.sets['Próximos lanzamientos'];
  const { T, ST, steps, cobrada, worst, second, buyAtObj, recover, blended, AI, fb, ig } = view;
  const selc = sel != null ? data.creatives[sel] : null;
  const mxCatW = catalog ? Math.max(1, ...catalog.waste.map((p) => p.impr), ...catalog.healthy.map((p) => p.impr)) : 1;
  const mxCatO = catalog ? Math.max(1, ...catalog.opportunity.map((p) => p.impr)) : 1;

  // charts
  const D = data.daily;
  const mx1 = Math.max(...D.map((x) => Math.max(x.spend, x.purchase_value)), 1);
  const sc = (arr: number[], mx: number, W = 520, H = 130) => arr.map((v, i) => [24 + (i / Math.max(arr.length - 1, 1)) * (W - 32), H - 16 - (v / mx) * (H - 30)] as [number, number]);
  const pathd = (pts: [number, number][]) => 'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L');
  const spPts = sc(D.map((x) => x.spend), mx1), rvPts = sc(D.map((x) => x.purchase_value), mx1);
  const mxb = Math.max(...D.map((x) => Math.max(x.purchases, x.checkout)), 1);

  // scatter
  const maxvw = Math.max(...data.pairs.map((p) => p.views), 1);
  const maxc = Math.max(...data.pairs.map((p) => p.rcvr), 1);
  const SW = 560, SH = 300, PXo = 46, PYo = 28;
  const sx = (v: number) => PXo + (v / maxvw) * (SW - PXo - 70);
  const sy = (c: number) => SH - PYo - (c / maxc) * (SH - PYo - 18);
  const labels: [number, number, string, string][] = [];

  const platName: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', messenger: 'Messenger', unknown: 'Auto' };
  const platCol: Record<string, string> = { facebook: '#1877f2', instagram: '#e1306c', threads: INK, messenger: '#a855f7', unknown: MUT };

  return (
    <div className="cd">
      <header className="cd-hd">
        <div className="brand">DEEPSCAN <small>· {client.name.toUpperCase()}</small></div>
        <h1>Compras · Diagnóstico del circuito <span className="pill">META → SHOPIFY</span></h1>
        <div className="sub">Advantage+ trae el tráfico · Shopify revela dónde muere la venta. {data.from} → {data.to}</div>
      </header>

      {/* Veredicto + Índice navegable */}
      <div className="biblia">
        <div className="biblia-l">
          <div className="biblia-t">📖 La Biblia de Compras</div>
          <div className="biblia-s">Todo el circuito Meta → Shopify en un recorrido: qué funciona, qué no, y qué hacer.</div>
        </div>
        <div className="biblia-nav">
          {([['cap1', '1 · El circuito'], ['cap2', '2 · El catálogo'], ['cap3', '3 · Los anuncios'], ['cap4', '4 · Tendencias y plan']] as [string, string][]).map(([id, t]) => (
            <button key={id} className="bn-chip" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{t}</button>
          ))}
        </div>
      </div>
      {/* Cobro */}
      <div className="card">
        <div className="cobro-head"><span>⚠️ Realidad de cobro · toda la tienda</span>
          <span className="muted">ROAS colocado <b style={{ color: INK }}>{blended}×</b> → cobrado <b style={{ color: RED }}>{ST.roas_collected}×</b></span></div>
        <div className="cobro-bar"><div style={{ width: `${ST.paid_pct}%`, background: GREEN }} /></div>
        <div className="cobro-legend">
          <span><b style={{ color: GREEN }}>{money(ST.revenue_paid)}</b> cobrado ({ST.paid_pct}%) · {ST.orders_paid} pagados</span>
          <span><b style={{ color: AMBER }}>{money(ST.revenue_pending)}</b> pendiente · {ST.orders_pending} sin pagar</span>
          <span className="muted">de {money(ST.revenue)} en {ST.orders} pedidos</span>
        </div>
      </div>

      <div className="cap" id="cap1"><span className="cap-n">CAPÍTULO 1</span><span className="cap-t">El circuito · dónde se gana y se pierde</span></div>
      {/* Embudo por tasa — rotura destacada + Δ vs comparación */}
      <div className="fnl-hero">
        <div className="hk">🔴 ROTURA #1 · DÓNDE SE ROMPE EL EMBUDO</div>
        <div className="ht">{steps.find((s) => s.key === worst.key)?.key === 'clk' ? 'Impresiones' : ({ lpv: 'Clics', cart: 'Visitas', chk: 'Carrito', buy: 'Inician pago' } as Record<string, string>)[worst.key] || ''} → {worst.lbl}</div>
        <div className="hbig">{worst.conv}%<small> · objetivo {worst.obj}%</small></div>
        <p>{kfmt(worst.from - worst.val)} {worst.key === 'buy' ? 'llegan a pagar y no compran' : 'avanzan y se caen'}. A objetivo serían <b>~{kfmt(buyAtObj)} compras/mes</b> — <b>+{kfmt(recover)}</b> sin gastar $1 más.{worst.delta < -0.3 ? <> Y empeoró: era <b>{worst.pconv}%</b> el periodo anterior ▼.</> : worst.delta > 0.3 ? <> Venía de {worst.pconv}% ▲.</> : null}</p>
        <div className="hstats">
          <div className="hstat"><b>{kfmt(worst.val)}</b><span>compran hoy</span></div>
          <div className="hstat"><b>{worst.conv}%</b><span>tasa actual</span></div>
          <div className="hstat"><b>{worst.pconv}%</b><span>periodo anterior</span></div>
          <div className="hstat"><b>~{kfmt(recover)}</b><span>recuperables</span></div>
        </div>
      </div>

      <h2><span className="nn">1</span>Embudo por tasa de conversión · no por volumen</h2>
      <div className="h2sub">Cada barra = % que sobrevive del paso anterior (0–100%). La marca vertical = tu objetivo. Δ = cambio vs {data.prevFrom} → {data.prevTo}.</div>
      <div className="card fnl">
        <div className="frow fnl-head">
          <div className="fl"><div className="fn">Impresiones</div><div className="fc">{kfmt(T.impressions)}</div></div>
          <div className="fbar-wrap"><div className="ftop">arranque del embudo · CPM {money(T.cpm)}</div></div>
          <div className="fd" />
        </div>
        {[...steps, cobrada].map((s) => {
          const isw = s.key === worst.key;
          const bw = Math.max(Math.min(s.conv, 100), 1.5);
          const objL = Math.min(s.obj, 100);
          const showLeak = (s.cc === RED || s.cc === AMBER) && s.leak;
          return (
            <div className={`frow${isw ? ' worst' : ''}${s.key === 'cobr' ? ' cobr' : ''}`} key={s.key}>
              <div className="fl"><div className="fn">{s.lbl}{s.note ? <span className="tienda">{s.note}</span> : null}</div>
                <div className="fc">{kfmt(s.val)}{s.key === 'cobr' ? <span className="ofrom"> de {kfmt(s.from)} pedidos</span> : null}</div></div>
              <div className="fbar-wrap">
                <div className="fconv2" style={{ color: s.cc }}>{s.conv}%<span className="frl">{s.ratelbl}</span></div>
                <div className="fbar2"><div className="fbar-in" style={{ width: `${bw}%`, background: s.cc }} /><div className="fobj" style={{ left: `${objL}%` }} title={`objetivo ${s.bench}`} /></div>
                <div className="fmeta">
                  {Math.abs(s.delta) < 0.3 ? <span className="dl flat">→ igual</span> : <span className="dl" style={{ color: s.delta > 0 ? GREEN : RED }}>{s.delta > 0 ? '▲' : '▼'} {Math.abs(s.delta)}pp</span>}
                  <span className="obj">{s.bench}</span>
                  {showLeak ? <span className="lk">⚠ {s.leak}</span> : null}
                </div>
              </div>
              <div className="fd">{isw ? <span className="wtag">ROTURA #1</span> : null}</div>
            </div>
          );
        })}
        <div className="fnl-leg"><span><b>│</b> objetivo</span><span><b style={{ color: GREEN }}>▲</b> mejora vs anterior</span><span><b style={{ color: RED }}>▼</b> empeora</span><span><b>pp</b> = puntos porcentuales</span></div>
      </div>
      {second ? (
        <div className="alert2"><span className="a2ic">🟠</span><div><b>Fuga que apareció este periodo · {({ lpv: 'Clics', cart: 'Visitas', chk: 'Carrito', buy: 'Inician pago' } as Record<string, string>)[second.key]} → {second.lbl}</b> cayó de <b>{second.pconv}%</b> a <b style={{ color: RED }}>{second.conv}%</b> ({second.delta}pp). Llega tráfico pero casi nadie avanza — señal de <b>menor calidad de tráfico o mismatch anuncio ↔ producto/precio</b>. Solo se ve gracias a la comparación vs. periodo anterior.</div></div>
      ) : null}

      {/* Páginas de aterrizaje (solo propiedad Shopify) */}
      {landing && landing.hasData && (() => {
        const S = landing.site;
        const prod = landing.pages.filter((p) => p.sessions >= 150);
        const best = (prod.length ? prod : landing.pages).reduce((a, b) => (b.chk_r > a.chk_r ? b : a));
        const waste = landing.pages.filter((p) => p.kind === 'Producto' && p.chk_r < S.chk_r * 0.4).sort((a, b) => b.sessions - a.sessions)[0] || null;
        const maxAtc = Math.max(...landing.pages.map((p) => p.atc_r), 1);
        const maxChk = Math.max(...landing.pages.map((p) => p.chk_r), 1);
        const KC: Record<string, string> = { Home: ACCD, Producto: ACC, 'Colección': '#17b3c9', Otra: MUT };
        const bar = (val: number, mx: number, avg: number) => {
          const col = val >= avg ? GREEN : val >= avg * 0.5 ? AMBER : RED;
          return (<div className="lp-bc"><span className="lp-bv" style={{ color: col }}>{val}%</span>
            <span className="lp-bt"><span className="lp-bf" style={{ width: `${Math.max(Math.round((100 * val) / mx), 2)}%`, background: col }} /><span className="lp-bavg" style={{ left: `${Math.round((100 * avg) / mx)}%` }} /></span></div>);
        };
        return (
          <div key="landing">
            <h2><span className="nn">2</span>Páginas de aterrizaje · conversión vs las demás</h2>
            <div className="h2sub">Por dónde entran las sesiones y qué tan bien convierten — solo propiedad Shopify (aísla el otro sitio GA4). Barra comparada vs el promedio del sitio (│).</div>
            <div className="card lp-kpis">
              <div className="lp-kpi"><b>{kfmt(S.sessions)}</b><span>Sesiones de entrada</span></div>
              <div className="lp-kpi"><b style={{ color: ACC }}>{S.atc_r}%</b><span>Al carrito</span><small>{kfmt(S.atc)} sesiones</small></div>
              <div className="lp-kpi"><b style={{ color: '#5b9df9' }}>{S.chk_r}%</b><span>Checkout</span><small>{kfmt(S.chk)} sesiones</small></div>
              <div className="lp-kpi"><b style={{ color: GREEN }}>{S.buy_r}%</b><span>Compra</span><small>{S.buy} · {money(S.rev)}</small></div>
            </div>
            <div className="lp-ins">
              {waste && <div className="lp-inc" style={{ borderColor: 'rgba(229,56,77,.3)' }}><b style={{ color: RED }}>🚨 Tráfico desperdiciado</b>«{waste.label}» recibe {kfmt(waste.sessions)} sesiones pero convierte {waste.chk_r}% a checkout (promedio {S.chk_r}%) y {waste.buy} compras. Mucho tráfico por una página que no cierra.</div>}
              <div className="lp-inc" style={{ borderColor: 'rgba(31,175,106,.3)' }}><b style={{ color: GREEN }}>🏆 La que mejor convierte</b>«{best.label}» lleva {best.chk_r}% a checkout ({(best.chk_r / Math.max(S.chk_r, 0.1)).toFixed(1)}× el promedio) con {kfmt(best.sessions)} sesiones. El molde a replicar (foto, precio, copy).</div>
            </div>
            <div className="card">
              <div className="tblctl">
                <span className="tc-info">{landing.pages.length === 0 ? 'Sin páginas' : `${(lpPage - 1) * lpSize + 1}–${Math.min(lpPage * lpSize, landing.pages.length)} de ${landing.pages.length} páginas`}</span>
                <div className="tc-r">
                  <span className="tc-lbl">Filas</span>
                  {[10, 25, 50, 100].map((n) => <button key={n} className={`tc-sz${lpSize === n ? ' on' : ''}`} onClick={() => setLpSize(n)}>{n}</button>)}
                  <div className="tc-pg">
                    <button disabled={lpPage <= 1} onClick={() => setLpPage(lpPage - 1)}>‹</button>
                    <span>{lpPage} / {Math.max(1, Math.ceil(landing.pages.length / lpSize))}</span>
                    <button disabled={lpPage >= Math.ceil(landing.pages.length / lpSize)} onClick={() => setLpPage(lpPage + 1)}>›</button>
                  </div>
                </div>
              </div>
              <div className="tscroll"><table className="lp-tbl"><thead><tr><th {...lpSorted.headerProps(0)}>Página de entrada</th><th {...lpSorted.headerProps(1)}>Sesiones</th><th {...lpSorted.headerProps(2)}>Al carrito</th><th {...lpSorted.headerProps(3)}>Checkout</th><th {...lpSorted.headerProps(4)}>Compra</th><th {...lpSorted.headerProps(5)}>Rebote</th></tr></thead>
                <tbody>{lpSorted.rows.slice((lpPage - 1) * lpSize, lpPage * lpSize).map((p: LandingPage) => {
                  const isw = !!waste && p.path === waste.path, isb = p.path === best.path;
                  return (<tr key={p.path} className={isw ? 'lp-w' : isb ? 'lp-b' : ''}>
                    <td><div className="lp-pl"><span className="lp-kd" style={{ background: KC[p.kind] + '1a', color: KC[p.kind] }}>{p.kind}</span><span className="lp-pn" title={p.path}>{p.label}</span>{isw ? <span className="lp-rt" style={{ background: RED }}>FUGA</span> : isb ? <span className="lp-rt" style={{ background: GREEN }}>MEJOR</span> : null}</div></td>
                    <td className="lp-num">{kfmt(p.sessions)}</td>
                    <td>{bar(p.atc_r, maxAtc, S.atc_r)}</td>
                    <td>{bar(p.chk_r, maxChk, S.chk_r)}</td>
                    <td className="lp-n2">{p.buy}<span className="muted"> · {p.buy_r}%</span></td>
                    <td className="lp-n2 muted">{p.bounce}%</td>
                  </tr>);
                })}</tbody></table></div>
              <div className="lp-leg"><span><b>│</b> promedio del sitio ({S.atc_r}% carrito · {S.chk_r}% checkout)</span><span><b style={{ color: GREEN }}>verde</b> sobre promedio</span><span><b style={{ color: RED }}>rojo</b> debajo</span></div>
            </div>
            <div className="lp-note"><b>Solo Shopify:</b> GA4 tiene 2 propiedades cruzando datos; esta hoja aísla la de Shopify (rutas /products, /collections) y descarta el sitio custom, que ni siquiera rastrea checkout. Las compras de GA4 cuadran con los pedidos de Shopify → el tracking funciona; lo bajo es la conversión real. {landing.nPages} páginas con ≥12 sesiones; se muestran las {landing.pages.length} con más tráfico.</div>
          </div>
        );
      })()}

      <div className="cap" id="cap2"><span className="cap-n">CAPÍTULO 2</span><span className="cap-t">El catálogo · qué productos funcionan</span></div>
      {/* Pares */}
      <h2><span className="nn">3</span>El par correcto · escalar / arreglar / cobrar</h2>
      <div className="h2sub">Comportamiento (GA4) + venta real y cobro (Shopify) por par.</div>
      <div className="card">
        <div className="tblctl">
          <span className="tc-info">{data.pairs.length === 0 ? 'Sin pares' : `${(parPage - 1) * parSize + 1}–${Math.min(parPage * parSize, data.pairs.length)} de ${data.pairs.length} pares`}</span>
          <div className="tc-r">
            <span className="tc-lbl">Filas</span>
            {[10, 25, 50, 100].map((n) => <button key={n} className={`tc-sz${parSize === n ? ' on' : ''}`} onClick={() => setParSize(n)}>{n}</button>)}
            <div className="tc-pg">
              <button disabled={parPage <= 1} onClick={() => setParPage(parPage - 1)}>‹</button>
              <span>{parPage} / {Math.max(1, Math.ceil(data.pairs.length / parSize))}</span>
              <button disabled={parPage >= Math.ceil(data.pairs.length / parSize)} onClick={() => setParPage(parPage + 1)}>›</button>
            </div>
          </div>
        </div>
        <div className="tscroll"><table className="pairs"><thead><tr><th {...parSorted.headerProps(0)}>Par</th><th {...parSorted.headerProps(1)}>Vistas</th><th {...parSorted.headerProps(2)}>Carrito</th><th {...parSorted.headerProps(3)}>Checkout</th><th {...parSorted.headerProps(4)}>Vend.</th><th {...parSorted.headerProps(5)}>💰 Cobrado</th><th {...parSorted.headerProps(6)}>⏳ Pendiente</th><th></th></tr></thead>
          <tbody>{parSorted.rows.slice((parPage - 1) * parSize, parPage * parSize).map((p) => {
            const t = pairTag(p);
            return <tr key={p.name}><td className="pn">{p.name}</td><td>{kfmt(p.views)}</td><td>{p.atc}</td><td>{p.checkout}</td>
              <td><b>{p.sold || '—'}</b></td><td style={{ color: GREEN }}>{p.rev_paid ? money(p.rev_paid) : '—'}</td><td style={{ color: AMBER }}>{p.rev_pend ? money(p.rev_pend) : '—'}</td>
              <td><span className="tag" style={{ color: t[1] as string, background: (t[1] as string) + '14', borderColor: (t[1] as string) + '40' }}>{t[0]}</span></td></tr>;
          })}</tbody></table></div>
        <div style={{ marginTop: 14 }}>
          <svg viewBox={`0 0 ${SW} ${SH}`} width="100%">
            <line x1={PXo} y1={SH - PYo} x2={SW - 8} y2={SH - PYo} stroke={LINE} /><line x1={PXo} y1="8" x2={PXo} y2={SH - PYo} stroke={LINE} />
            <text x={SW - 10} y={SH - 10} textAnchor="end" fontSize="10" fill={MUT}>más vistas →</text><text x="8" y="18" fontSize="10" fill={MUT}>↑ % convierte</text>
            {data.pairs.map((p, i) => {
              const x = sx(p.views), y = sy(p.rcvr); const rr = p.sold_rev ? 6 + Math.min(Math.sqrt(p.sold_rev) / 12, 15) : 5;
              const c = pairTag(p)[1];
              if (p.sold_rev >= 8000 || (p.views >= 350 && p.sold === 0)) labels.push([x, y - rr - 5, p.name.replace('TENIS ', '').replace('Tenis ', '').slice(0, 15), c]);
              return <circle key={i} cx={x} cy={y} r={rr} fill={c} fillOpacity="0.5" stroke={c} strokeWidth="1.5" />;
            })}
            {labels.sort((a, b) => a[1] - b[1]).map((l, i, arr) => { let ly = l[1]; if (i > 0 && Math.abs(l[0] - arr[i - 1][0]) < 80 && ly - arr[i - 1][1] < 12) { ly = arr[i - 1][1] + 12; arr[i][1] = ly; }
              return <text key={i} x={l[0]} y={Math.max(ly, 12)} textAnchor="middle" fontSize="9.5" fill={INK2} fontWeight="700" stroke="#fff" strokeWidth="2.4" paintOrder="stroke">{l[2]}</text>; })}
          </svg>
          <div className="legend">
            <span><span className="dot" style={{ background: GREEN }} /><b>Escalar</b> — vende y cobra</span>
            <span><span className="dot" style={{ background: AMBER }} /><b>Cobrar</b> — vende, pago pendiente</span>
            <span><span className="dot" style={{ background: BERRY }} /><b>Muere en cobro</b> — llega a checkout, 0 cerradas</span>
            <span><span className="dot" style={{ background: BLUE }} /><b>Viral</b> — mucha vista, sin intención</span>
            <span><span className="dot" style={{ background: RED }} /><b>Arreglar página</b> — no convierte</span>
          </div>
          <div className="pares-note">🔎 <b>La clave del embudo:</b> los pares en <b style={{ color: BERRY }}>«muere en cobro»</b> llegan a checkout pero cierran <b>0</b> — su fuga <b>no es la página, es el cobro</b> (COD / pago pendiente): el mismo <b>{ST.paid_pct}%</b> cobrado de la tira de arriba. Ahí se ataca con precio / MSI / confirmación por WhatsApp, no con otro creativo. Los <b style={{ color: BLUE }}>«virales»</b> (mucha vista, sin checkout) son curiosidad, no fracaso de pauta.</div>
        </div>
      </div>

      {/* Variaciones de catálogo — Meta empuja ↔ Shopify vende */}
      <h2><span className="nn">4</span>Variaciones de catálogo · Meta empuja ↔ Shopify vende</h2>
      <div className="h2sub">Meta no da compras por producto, así que cruzamos su <b>entrega</b> (impresiones/gasto por producto) con las <b>ventas reales de Shopify</b>. Señal direccional, no atribución exacta.</div>
      {catalog?.hasData ? (
        <div className="card">
          {catalog.health && (
            <div className="cat-h">
              <div className="cat-hc"><b>{catalog.health.product_count}</b><span>productos</span><small>{catalog.health.product_set_count} conjuntos</small></div>
              <div className="cat-hc red"><b style={{ color: RED }}>{catalog.health.oos_count}</b><span>agotados</span><small>fuera de ads dinámicos</small></div>
              <div className="cat-hc red"><b style={{ color: RED }}>{catalog.health.no_image_count}</b><span>sin imagen</span><small>no se muestran</small></div>
              <div className="cat-hc"><b>{catalog.nProducts}</b><span>con pauta</span><small>en el período</small></div>
            </div>
          )}
          {catalog.wasteSpend > 0 && (
            <div className="cat-hero">🚨 El algoritmo gastó <b>{money(catalog.wasteSpend)}</b> empujando productos que casi no vendieron, mientras varios que sí venden recibieron poca pauta. Ajustar el conjunto y las exclusiones libera presupuesto hacia lo que convierte.</div>
          )}
          <div className="cat-cols">
            <div className="cat-col">
              <div className="cat-ct" style={{ color: RED }}>🔴 Desperdicio · empuja fuerte, no vende</div>
              <div className="cat-cs">Mucha impresión, 0–1 ventas. Candidatos a excluir del conjunto o revisar precio/stock.</div>
              {catalog.waste.length ? catalog.waste.map((p) => (
                <div className="crow" key={p.name}>
                  <div className="cn">{p.name}</div>
                  <div className="cbar"><span className="bt"><span className="bf" style={{ width: `${Math.max(Math.round((100 * p.impr) / mxCatW), 3)}%`, background: RED }} /></span><span className="bl">{kfmt(p.impr)} impr · {money(p.spend)}</span></div>
                  <div className="cu">{p.units > 0 ? <b style={{ color: GREEN }}>{p.units} uds</b> : <b style={{ color: RED }}>0 ventas</b>}{p.revenue ? ` · ${money(p.revenue)}` : ''}</div>
                </div>
              )) : <div className="muted cat-empty">Sin casos en este período.</div>}
            </div>
            <div className="cat-col">
              <div className="cat-ct" style={{ color: GREEN }}>🟢 Oportunidad · vende, casi no empuja</div>
              <div className="cat-cs">Venden con poca o nula pauta. Subirles prioridad o meterlos al conjunto puede crecer ventas.</div>
              {catalog.opportunity.length ? catalog.opportunity.map((p) => (
                <div className="crow" key={p.name}>
                  <div className="cn">{p.name}</div>
                  <div className="cbar"><span className="bt"><span className="bf" style={{ width: `${Math.max(Math.round((100 * p.impr) / mxCatO), 2)}%`, background: GREEN }} /></span><span className="bl">{p.impr ? `${kfmt(p.impr)} impr` : 'sin pauta'}{p.spend ? ` · ${money(p.spend)}` : ''}</span></div>
                  <div className="cu"><b style={{ color: GREEN }}>{p.units} uds</b>{p.revenue ? ` · ${money(p.revenue)}` : ''}</div>
                </div>
              )) : <div className="muted cat-empty">Sin casos en este período.</div>}
            </div>
          </div>
          {catalog.healthy.length > 0 && (
            <div className="cat-healthy">
              <div className="cat-ct" style={{ color: INK }}>✅ Sanos · empuja y vende <span className="muted" style={{ fontWeight: 600 }}>— sostener / escalar</span></div>
              {catalog.healthy.map((p) => (
                <div className="crow" key={p.name}>
                  <div className="cn">{p.name}</div>
                  <div className="cbar"><span className="bt"><span className="bf" style={{ width: `${Math.max(Math.round((100 * p.impr) / mxCatW), 3)}%`, background: GREEN }} /></span><span className="bl">{kfmt(p.impr)} impr · {money(p.spend)}</span></div>
                  <div className="cu"><b style={{ color: GREEN }}>{p.units} uds</b>{p.revenue ? ` · ${money(p.revenue)}` : ''}</div>
                </div>
              ))}
            </div>
          )}
          <div className="cat-note"><b>Honestidad:</b> Meta no expone las compras por producto (confirmado hasta nivel campaña); cruzamos su entrega (gasto/impresiones por producto, dato real) con las ventas de Shopify (unidades/ingresos, dato real de todos los canales). Las ventanas difieren un poco, así que el cruce es direccional — suficiente para detectar productos mal priorizados.{!catalog.health ? ' · Salud del feed pendiente (requiere permiso de catálogo del token).' : ''}</div>
        </div>
      ) : (
        <div className="card muted" style={{ fontSize: 12 }}>Aún sin datos de entrega por producto para este período.</div>
      )}

      <div className="cap" id="cap3"><span className="cap-n">CAPÍTULO 3</span><span className="cap-t">Los anuncios · qué creativo y cómo</span></div>
      {/* Duelo */}
      <h2><span className="nn">5</span>Duelo de conjuntos · quién escala y quién se audita</h2>
      <div className="h2sub">Best Sellers gasta ~2× lo de Próximos. ¿Lo vale?</div>
      <div className="card">
        {BS && PX && (
          <table className="duel"><thead><tr><th></th><th style={{ color: '#17b3c9' }}>Best Sellers</th><th style={{ color: ACC }}>Próximos lanzamientos</th></tr></thead>
            <tbody>
              {([['Inversión', money(BS.spend), money(PX.spend), 0], ['ROAS', `${BS.roas}×`, `${PX.roas}×`, BS.roas > PX.roas ? 1 : 2],
              ['Costo/compra', money(BS.cost_purchase), money(PX.cost_purchase), BS.cost_purchase < PX.cost_purchase ? 1 : 2],
              ['Ticket prom.', money(BS.aov), money(PX.aov), BS.aov > PX.aov ? 1 : 2],
              ['CTR enlace', `${BS.ctr}%`, `${PX.ctr}%`, BS.ctr > PX.ctr ? 1 : 2], ['CPC', money(BS.cpc), money(PX.cpc), BS.cpc < PX.cpc ? 1 : 2],
              ['Checkout→Compra', `${(100 * BS.purchases / (BS.checkout || 1)).toFixed(1)}%`, `${(100 * PX.purchases / (PX.checkout || 1)).toFixed(1)}%`, (BS.purchases / (BS.checkout || 1)) > (PX.purchases / (PX.checkout || 1)) ? 1 : 2]] as [string, string, string, number][]).map((row, i) => (
                <tr key={i}><td>{row[0]}</td>
                  <td className="dv">{row[3] === 1 ? <b style={{ color: GREEN }}>{row[1]} ▲</b> : row[1]}</td>
                  <td className="dv">{row[3] === 2 ? <b style={{ color: GREEN }}>{row[2]} ▲</b> : row[2]}</td></tr>
              ))}
            </tbody></table>
        )}
        {BS && PX && (
          <div className="verdict">
            <div className="vc cut"><b style={{ color: RED }}>⚠ Best Sellers — auditar</b>Gasta {money(BS.spend)} para ROAS {BS.roas}× y costo/compra {money(BS.cost_purchase)}. Trae más clics (CTR {BS.ctr}%) pero de menor intención.</div>
            <div className="vc win"><b style={{ color: GREEN }}>✓ Próximos — escalar</b>Mejor ROAS ({PX.roas}×) y costo/compra ({money(PX.cost_purchase)}) con la mitad del gasto. El motor más eficiente.</div>
          </div>
        )}
      </div>

      {/* Segmentos */}
      <h2><span className="nn">6</span>Segmentos de público · Full Funnel</h2>
      <div className="h2sub">A quién le llega: nuevos, activos (engaged) o compradores actuales.</div>
      <div className="card">
        {data.segments.filter((s) => s.spend >= 5).map((s, i) => {
          const col = { Nuevos: '#5b9df9', 'Activos (engaged)': GREEN, 'Compradores actuales': AMBER, Automático: '#c3bcd4' }[s.name] || ACC;
          const mxs = Math.max(...data.segments.map((x) => x.spend), 1);
          return (
            <div className="segrow" key={i}>
              <div className="seglbl"><b>{s.name}</b><span>{s.pct}% del gasto</span></div>
              <div className="segbarwrap"><div className="segbar" style={{ width: `${Math.max(Math.round(100 * s.spend / mxs), 6)}%`, background: col }} /><span className="segval">{money(s.spend)}</span></div>
              <div className="segkpi"><b>{s.buy}</b><span>compras</span></div>
              <div className="segkpi"><b style={{ color: col }}>{s.roas < 50 ? s.roas + '×' : '—'}</b><span>ROAS</span></div>
            </div>
          );
        })}
        <div className="note amber">La campaña es mayormente nuevos + activos. A los <b>compradores actuales</b> les dedica poco y venden poco — recomprar suele ser lo más barato. Es una palanca de LTV sin tomar.</div>
      </div>

      {/* Plataforma */}
      <h2><span className="nn">7</span>Rendimiento por plataforma</h2>
      <div className="h2sub">Dónde rinde cada peso.</div>
      <div className="card">
        {data.platforms.map((p, i) => {
          const mxp = Math.max(...data.platforms.map((x) => x.spend), 1);
          const col = platCol[p.key] || ACC;
          return (
            <div className="segrow" key={i}>
              <div className="seglbl"><b>{platName[p.key] || p.key}</b><span>{money(p.spend)}</span></div>
              <div className="segbarwrap"><div className="segbar" style={{ width: `${Math.max(Math.round(100 * p.spend / mxp), 5)}%`, background: col }} /></div>
              <div className="segkpi"><b>{p.buy}</b><span>compras</span></div>
              <div className="segkpi"><b style={{ color: p.roas >= 1 ? col : RED }}>{p.roas}×</b><span>ROAS</span></div>
            </div>
          );
        })}
        {fb && ig && <div className="note red"><b>Facebook manda:</b> {fb.roas}× vs {ig.roas}× en Instagram. Considera bajarle a IG (sobre todo en Próximos) y mover el peso a Facebook.</div>}
        <table className="sptbl"><thead><tr><th>Conjunto</th><th>Plataforma</th><th>Gasto</th><th>Compras</th><th>ROAS</th></tr></thead>
          <tbody>{['Best Sellers|facebook', 'Best Sellers|instagram', 'Próximos lanzamientos|facebook', 'Próximos lanzamientos|instagram'].map((k) => {
            const v = data.segPlatform[k]; if (!v) return null; const [g, p] = k.split('|'); const roas = v.spend ? v.val / v.spend : 0;
            return <tr key={k}><td>{g}</td><td>{platName[p]}</td><td>{money(v.spend)}</td><td>{v.buy}</td><td style={{ color: roas >= 4 ? GREEN : roas < 1 ? RED : AMBER, fontWeight: 700 }}>{roas.toFixed(2)}×</td></tr>;
          })}</tbody></table>
      </div>

      {/* Creativos */}
      <h2><span className="nn">8</span>Creativos · todos los activos, con datos</h2>
      <div className="h2sub">{data.creatives.length} anuncios activos. Clic en una tarjeta para ver todo el detalle.</div>
      <div className="cinsight"><b>Lectura:</b> el video promedia <b style={{ color: view.vroas >= view.iroas ? GREEN : RED }}>{view.vroas}×</b> vs <b>{view.iroas}×</b> de la imagen. Clic en cada anuncio para su embudo, costos y ventas por plataforma.</div>
      <div className="card"><div className="cgrid">
        {data.creatives.map((a, i) => {
          const tag = a.buy > 0 && a.roas >= 5 ? ['GANADOR', GREEN] : a.spend >= 300 && a.buy === 0 ? ['QUEMA', RED] : a.buy > 0 ? ['RINDE', AMBER] : ['—', MUT];
          const p = posterUrl(a);
          return (
            <figure className="cc" key={a.ad_id} onClick={() => setSel(i)}>
              <div className="cph">
                {p ? <img src={p} loading="lazy" alt="" /> : <div className="noimg">{short(a.name)}</div>}
                {a.is_video && a.video_id ? <span className="play">▶</span> : null}
                <span className={a.is_video ? 'vlabel' : 'ilabel'}>{a.is_video ? 'VIDEO' : 'IMG'}</span>
                <span className="cbadge" style={{ background: tag[1] as string }}>{tag[0]}</span>
                <span className="cmore">＋ detalle</span>
              </div>
              <figcaption>
                <div className="cn">{short(a.name)}</div>
                <div className="cmeta"><span className="cset">{a.adset.slice(0, 4)}</span></div>
                <div className="cm"><b>{money(a.spend)}</b><b style={{ color: tag[1] as string }}>{a.roas}×</b><span>{a.buy} compras</span><span className="muted">CTR {a.ctr}%</span></div>
              </figcaption>
            </figure>
          );
        })}
      </div></div>

      <div className="cap" id="cap4"><span className="cap-n">CAPÍTULO 4</span><span className="cap-t">Tendencias y plan de acción</span></div>
      {/* Tendencias */}
      <h2><span className="nn">9</span>Tendencias · cómo se movió el mes</h2>
      <div className="h2sub">Día a día. Ritmo, picos y si la venta acompaña a la inversión.</div>
      <div className="card charts">
        <div><h4>Inversión vs Valor de compra</h4><div className="cs">diario MXN</div>
          <svg viewBox="0 0 520 130" width="100%">
            <path d={`${pathd(rvPts)} L${rvPts.length ? rvPts[rvPts.length - 1][0].toFixed(0) : 24},114 L24,114 Z`} fill={GREEN} fillOpacity="0.1" />
            <path d={pathd(rvPts)} fill="none" stroke={GREEN} strokeWidth="2.5" />
            <path d={pathd(spPts)} fill="none" stroke={ACC} strokeWidth="2.5" />
            <text x="24" y="12" fontSize="10" fill={ACC} fontWeight="700">■ Inversión</text>
            <text x="120" y="12" fontSize="10" fill={GREEN} fontWeight="700">■ Valor de compra</text>
          </svg></div>
        <div><h4>Pagos iniciados vs Compras</h4><div className="cs">la brecha = la fuga del pago</div>
          <svg viewBox="0 0 520 130" width="100%">
            {D.map((x, i) => { const xx = 24 + (i / Math.max(D.length - 1, 1)) * 480; const hc = (x.checkout / mxb) * 100, hb = (x.purchases / mxb) * 100; const bw = 480 / D.length * 0.5;
              return <g key={i}><rect x={xx} y={114 - hc} width={bw} height={hc} fill={AMBER} fillOpacity="0.35" /><rect x={xx} y={114 - hb} width={bw} height={hb} fill={ACC} /></g>; })}
            <text x="24" y="12" fontSize="10" fill={AMBER} fontWeight="700">▮ Pagos iniciados</text>
            <text x="150" y="12" fontSize="10" fill={ACC} fontWeight="700">▮ Compras</text>
          </svg></div>
      </div>

      {/* IA */}
      <div className="ai-wrap">
        <div className="aihead"><div className="l"><span className="spark">✦</span>Análisis IA · nivel negocio</div>
          <span className="badge">Hallazgo → hipótesis → acción · en vivo con IA (Gemini) al conectar la clave</span></div>
        <div className="aigrid">
          {AI.map((x, i) => (
            <div className="aic" key={i}>
              <div className="aic-h"><span className="aic-ic">{x.ic}</span><b>{x.t}</b><span className="aic-pri" style={{ background: x.pc + '1a', color: x.pc }}>{x.pri}</span></div>
              <div className="aic-row"><span className="aic-lbl">Hallazgo</span><p>{x.h}</p></div>
              <div className="aic-row"><span className="aic-lbl" style={{ color: ACCD }}>Hipótesis</span><p>{x.hip}</p></div>
              <div className="aic-row"><span className="aic-lbl" style={{ color: GREEN }}>Acción</span><p>{x.ac}</p></div>
            </div>
          ))}
        </div>
      </div>

      <div className="foot">Datos reales {data.from} → {data.to} · Meta (Advantage+ | Full funnel) · GA4 item-scoped · Shopify (pagado/pendiente). Segmentos/plataforma y creativos = snapshot del último ETL. Media de creativos: URLs de Meta refrescadas a diario.</div>

      {/* Modal */}
      {selc && (
        <div id="adm" className="on" onClick={(e) => { if ((e.target as HTMLElement).id === 'adm') setSel(null); }}>
          <div className="adm-box">
            <span id="adm-close" onClick={() => setSel(null)}>✕</span>
            <div className="adm-top">
              <div className="adm-media">{posterUrl(selc) ? <img src={posterUrl(selc)} alt="" /> : null}{selc.is_video && selc.video_id ? <a className="play" href={`https://www.facebook.com/sneakerstorecdmx/videos/${selc.video_id}/`} target="_blank" rel="noreferrer">▶</a> : null}</div>
              <div className="adm-head">
                <span className="badge" style={{ background: selc.buy > 0 && selc.roas >= 5 ? GREEN : selc.spend >= 300 && selc.buy === 0 ? RED : AMBER }}>{selc.buy > 0 && selc.roas >= 5 ? 'GANADOR' : selc.spend >= 300 && selc.buy === 0 ? 'QUEMA' : 'RINDE'}</span>
                <h3>{selc.name}</h3>
                <div className="adm-chips"><span>Conjunto: {selc.adset}</span><span>{selc.is_video ? 'Video' : 'Imagen'}</span></div>
                <div className="adm-big"><div><b>{money(selc.spend)}</b><span>Invertido</span></div><div><b style={{ color: GREEN }}>{selc.roas}×</b><span>ROAS</span></div><div><b>{selc.buy}</b><span>Compras</span></div><div><b>{money(selc.pv)}</b><span>Valor</span></div></div>
              </div>
            </div>
            <div className="adm-body">
              <div className="adm-sec">Embudo del anuncio · conteo y costo por paso</div>
              <div className="mtab">
                {[[kfmt(selc.impr), 'Impresiones', `CPM ${money(selc.cpm)}`], [kfmt(selc.reach), 'Alcance', `Frec ${selc.freq}`], [kfmt(selc.link), 'Clics enlace', `CPC ${money(selc.cpc)} · CTR ${selc.ctr}%`],
                [kfmt(selc.landing), 'Visitas landing', `${money(selc.cost_land)}/visita`], [String(selc.atc), 'Carritos', `${money(selc.cost_atc)}/carrito`], [String(selc.chk), 'Pagos iniciados', `${money(selc.cost_chk)}/pago`],
                [String(selc.buy), 'Compras', `${money(selc.cost_buy)}/compra`], [selc.is_video && selc.hold ? selc.hold + '%' : '—', 'Retención video', selc.is_video ? 'ThruPlay/impr' : 'estático'], [`${selc.ctr}%`, 'CTR enlace', '']].map((c, i) => (
                  <div className="mcell" key={i}><b>{c[0]}</b><span>{c[1]}</span>{c[2] ? <small>{c[2]}</small> : null}</div>
                ))}
              </div>
              <div className="adm-sec">Ventas por plataforma</div>
              <div className="pl2">
                {['facebook', 'instagram'].map((k) => { const d = selc.plat[k]; if (!d) return null; const roas = d.spend ? d.val / d.spend : 0;
                  return <div className="plcard" key={k}><div className="pn"><span style={{ width: 9, height: 9, borderRadius: '50%', background: platCol[k], display: 'inline-block' }} />{platName[k]}</div>
                    <div className="pm"><span>{money(d.spend)}</span><span>{d.buy} compras</span><span style={{ color: roas >= 1 ? GREEN : RED }}>{roas.toFixed(2)}×</span></div></div>; })}
                {(!selc.plat.facebook && !selc.plat.instagram) ? <div className="muted" style={{ fontSize: 11, gridColumn: '1/3' }}>Split por plataforma no disponible (gasto bajo).</div> : null}
              </div>
              {selc.placement.length > 0 && <>
                <div className="adm-sec">📍 Por ubicación / formato · dónde se muestra y dónde compra</div>
                <div className="tscroll"><table className="plc"><thead><tr><th>Ubicación</th><th>Gasto</th><th>Impr</th><th>Carrito</th><th>Pago</th><th>Compras</th></tr></thead>
                  <tbody>{selc.placement.map((p) => {
                    const isFeed = p.label.includes('Feed');
                    const col = isFeed ? GREEN : (p.buy > 0 ? '#5b9df9' : MUT);
                    return <tr key={p.label}>
                      <td className="plc-l"><span className="pdot" style={{ background: col }} />{p.label}{isFeed ? ' 🏆' : ''}</td>
                      <td>{money(p.spend)}</td><td>{kfmt(p.impr)}</td><td>{p.atc}</td><td>{p.chk}</td>
                      <td><b style={{ color: p.buy > 0 ? GREEN : MUT }}>{p.buy || 0}</b></td>
                    </tr>;
                  })}</tbody></table></div>
                <div className="plc-note">El <b>Feed</b> suele cerrar la venta; Reels/Stories gastan pero rara vez compran. Palanca de eficiencia: concentrar o excluir ubicaciones que no cierran.</div>
              </>}
              {selc.body && <><div className="adm-sec">Texto del anuncio</div><div className="copybox">{(selc.title ? selc.title + '\n\n' : '') + selc.body + (selc.cta ? `\n\n[ ${selc.cta.replace(/_/g, ' ')} ]` : '')}</div></>}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .cd{max-width:1140px;margin:0 auto;padding:6px 4px 60px;font-size:13px;color:${INK}}
        .cd-hd{padding:6px 0 6px}
        .biblia{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:12px;background:linear-gradient(120deg,${INK},#3a2170 60%,${ACCD});border-radius:16px;padding:16px 20px}
        .biblia-t{font-size:18px;font-weight:800;color:#fff}
        .biblia-s{font-size:11.5px;color:#cfc7ea;margin-top:2px;max-width:520px}
        .biblia-nav{display:flex;gap:8px;flex-wrap:wrap}
        .bn-chip{font-family:inherit;cursor:pointer;font-size:11px;font-weight:800;color:#fff;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);border-radius:20px;padding:7px 12px;transition:.15s}
        .bn-chip:hover{background:${ACC};border-color:${ACC}}
        .cap{display:flex;align-items:baseline;gap:12px;margin:34px 0 2px;padding-bottom:10px;border-bottom:2px solid ${LINE};scroll-margin-top:14px}
        .cap-n{font-size:11px;font-weight:800;color:${ACC};letter-spacing:1.5px;background:${ACC}14;padding:4px 10px;border-radius:20px}
        .cap-t{font-size:19px;font-weight:800;color:${INK}}
        .tblctl{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px}
        .tc-info{font-size:11px;color:${MUT};font-weight:600}
        .tc-r{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
        .tc-lbl{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:${MUT}}
        .tc-sz{font-family:inherit;cursor:pointer;font-size:11px;font-weight:700;color:${MUT};background:#fff;border:1px solid ${LINE};border-radius:7px;padding:4px 9px;transition:.12s}
        .tc-sz:hover{border-color:${ACC};color:${ACC}}.tc-sz.on{background:${ACC};border-color:${ACC};color:#fff}
        .tc-pg{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;color:${INK2};margin-left:2px}
        .tc-pg button{font-family:inherit;cursor:pointer;width:26px;height:26px;border-radius:7px;border:1px solid ${LINE};background:#fff;color:${INK};font-size:15px;line-height:1;display:flex;align-items:center;justify-content:center}
        .tc-pg button:hover:not(:disabled){border-color:${ACC};color:${ACC}}.tc-pg button:disabled{opacity:.35;cursor:default}
        .pairs th[data-sort],.lp-tbl th[data-sort]{cursor:pointer;user-select:none;white-space:nowrap}
        .pairs th[data-sort]::after,.lp-tbl th[data-sort]::after{content:'⇅';margin-left:4px;font-size:9px;opacity:.35}
        .pairs th[data-sort]:hover,.lp-tbl th[data-sort]:hover{color:${INK}}
        .pairs th[data-sort='asc']::after,.lp-tbl th[data-sort='asc']::after{content:'▲';opacity:.9;color:${ACC}}
        .pairs th[data-sort='desc']::after,.lp-tbl th[data-sort='desc']::after{content:'▼';opacity:.9;color:${ACC}}
        .tscroll{overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;max-width:100%}
        .tscroll .lp-tbl,.tscroll .pairs{min-width:480px}
        /* Catálogo (Cap 2) */
        .cat-h{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px}
        .cat-hc{flex:1;min-width:120px;border:1px solid ${LINE};border-radius:12px;padding:12px 14px}
        .cat-hc.red{border-color:rgba(229,56,77,.28)}
        .cat-hc b{font-size:26px;font-weight:800;display:block;line-height:1}
        .cat-hc span{font-size:10px;color:${MUT};text-transform:uppercase;letter-spacing:.4px;font-weight:700;display:block;margin-top:4px}
        .cat-hc small{font-size:10px;color:${MUT};display:block;margin-top:2px}
        .cat-hero{background:linear-gradient(135deg,#fff,#fdf2f4);border:1px solid rgba(229,56,77,.22);border-left:4px solid ${RED};border-radius:12px;padding:12px 15px;font-size:12.5px;line-height:1.55;color:${INK2};margin-bottom:14px}
        .cat-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .cat-col{border:1px solid ${LINE};border-radius:12px;padding:14px 16px}
        .cat-healthy{border:1px solid ${LINE};border-radius:12px;padding:14px 16px;margin-top:14px}
        .cat-ct{font-size:13px;font-weight:800;margin-bottom:2px}
        .cat-cs{font-size:11px;color:${MUT};margin-bottom:10px}
        .cat-empty{font-size:11.5px;padding:6px 0}
        .crow{padding:8px 0;border-bottom:1px solid #f4f2f9}
        .crow:last-child{border-bottom:0}
        .cn{font-size:12px;font-weight:700;margin-bottom:4px}
        .cbar{display:flex;align-items:center;gap:9px}
        .cbar .bt{width:130px;min-width:130px;height:8px;background:#f1eef8;border-radius:5px;overflow:hidden}
        .cbar .bf{display:block;height:100%;border-radius:5px}
        .cbar .bl{font-size:10px;color:${MUT}}
        .cu{font-size:11px;margin-top:3px}
        .cat-note{background:#faf9ff;border:1px solid #ece7fb;border-radius:10px;padding:11px 14px;font-size:11.5px;color:${INK2};margin-top:14px;line-height:1.5}
        @media(max-width:640px){.cat-cols{grid-template-columns:1fr}}
        /* Ubicación en el modal */
        .plc{width:100%;border-collapse:collapse}
        .plc th{font-size:9px;text-transform:uppercase;letter-spacing:.4px;color:${MUT};font-weight:700;text-align:right;padding:6px 8px;border-bottom:1.5px solid ${LINE}}
        .plc th:first-child{text-align:left}
        .plc td{padding:7px 8px;border-bottom:1px solid #f4f2f9;font-size:12px;text-align:right;color:${INK2}}
        .plc td.plc-l{text-align:left;font-weight:700;color:${INK};white-space:nowrap}
        .plc .pdot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px}
        .tscroll .plc{min-width:420px}
        .plc-note{font-size:11px;color:${INK2};margin-top:8px;line-height:1.45}
        @media(max-width:640px){.biblia{flex-direction:column;align-items:flex-start;padding:14px 16px}.biblia-nav{width:100%}.bn-chip{flex:1;text-align:center}.cap{margin-top:26px}.cap-t{font-size:16px}}
        .brand{font-weight:800;letter-spacing:.5px;font-size:12px}.brand small{color:${MUT};font-weight:600;letter-spacing:1.5px}
        .pill{display:inline-block;background:${ACC};color:#fff;font-size:9.5px;font-weight:800;border-radius:20px;padding:3px 9px;margin-left:8px;letter-spacing:.5px}
        .cd h1{font-size:23px;font-weight:800;margin:10px 0 3px;letter-spacing:-.3px}
        .sub{color:${MUT};font-size:12.5px}
        .muted{color:${MUT}}
        .cd h2{font-size:16px;font-weight:800;margin:28px 0 3px;display:flex;align-items:center;gap:8px}
        .nn{width:22px;height:22px;border-radius:7px;background:${ACC};color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center}
        .h2sub{color:${MUT};font-size:12px;margin:0 0 14px 30px}
        .card{background:#fff;border:1px solid ${LINE};border-radius:16px;box-shadow:0 4px 18px rgba(60,40,120,.05);padding:20px 22px;margin-top:12px}
        .cobro-head{display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700;color:${INK2};flex-wrap:wrap;gap:6px}
        .cobro-bar{height:14px;background:${AMBER};border-radius:7px;overflow:hidden;margin:8px 0 7px}.cobro-bar div{height:100%;border-radius:7px}
        .cobro-legend{display:flex;gap:20px;font-size:11.5px;flex-wrap:wrap}
        .ai-wrap{margin-top:28px}
        .aihead{background:linear-gradient(120deg,${INK},#3a2170 55%,${ACCD});color:#fff;border-radius:14px 14px 0 0;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px}
        .aihead .l{display:flex;align-items:center;gap:9px;font-weight:800;font-size:14px}
        .spark{width:24px;height:24px;border-radius:7px;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center}
        .aihead .badge{font-size:9px;font-weight:700;letter-spacing:.5px;opacity:.85;border:1px solid rgba(255,255,255,.3);border-radius:20px;padding:3px 10px}
        .aigrid{background:#fff;border:1px solid ${LINE};border-top:0;border-radius:0 0 14px 14px;padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:13px;box-shadow:0 4px 18px rgba(60,40,120,.05)}
        .aic{border:1px solid ${LINE};border-radius:13px;padding:13px 15px}
        .aic-h{display:flex;align-items:center;gap:9px;margin-bottom:9px}.aic-ic{font-size:17px}.aic-h b{flex:1;font-size:13px;line-height:1.25}
        .aic-pri{font-size:8.5px;font-weight:800;padding:2px 8px;border-radius:20px;letter-spacing:.4px}
        .aic-row{display:flex;gap:9px;margin-bottom:6px}.aic-lbl{width:64px;flex:none;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:${MUT};padding-top:1px}
        .aic-row p{font-size:11.5px;line-height:1.5;color:${INK2};margin:0}
        .fnl-hero{margin-top:12px;border:1px solid rgba(229,56,77,.22);border-left:4px solid ${RED};border-radius:16px;padding:18px 22px;background:linear-gradient(135deg,#fff,#fdf2f4);box-shadow:0 4px 18px rgba(60,40,120,.05)}
        .fnl-hero .hk{display:inline-block;font-size:9.5px;font-weight:800;letter-spacing:.8px;color:${RED};background:rgba(229,56,77,.1);padding:3px 9px;border-radius:20px}
        .fnl-hero .ht{font-size:21px;font-weight:800;margin:9px 0 2px;color:${INK}}
        .fnl-hero .hbig{font-size:34px;font-weight:800;color:${RED}}.fnl-hero .hbig small{font-size:13px;color:${MUT};font-weight:700}
        .fnl-hero p{font-size:12.5px;line-height:1.6;color:${INK2};max-width:660px;margin-top:6px}
        .fnl-hero .hstats{display:flex;gap:24px;margin-top:14px;flex-wrap:wrap}
        .fnl-hero .hstat b{font-size:20px;font-weight:800;display:block;color:${INK}}.fnl-hero .hstat span{font-size:9.5px;color:${MUT};text-transform:uppercase;letter-spacing:.5px}
        .fnl .frow{display:grid;grid-template-columns:186px 1fr 92px;gap:14px;align-items:center;padding:11px 6px;border-bottom:1px solid #f4f2f9}
        .fnl .frow:last-child{border-bottom:0}
        .fnl .frow.worst{background:rgba(229,56,77,.05);border:1.5px solid rgba(229,56,77,.35);border-radius:12px;margin:4px 0}
        .fnl .frow.cobr{background:rgba(245,165,36,.05);border-top:2px dashed ${LINE}}
        .fl .fn{font-weight:700;font-size:13px}.fl .fc{font-size:19px;font-weight:800;margin-top:1px}
        .fl .ofrom{font-size:10px;color:${MUT};font-weight:600}.tienda{font-size:9.5px;color:${MUT};font-weight:600;background:#f0eef7;padding:1px 6px;border-radius:5px;margin-left:5px}
        .fnl-head .ftop{font-size:11px;color:${MUT};font-style:italic}
        .fbar-wrap{display:flex;flex-direction:column;gap:5px}
        .fconv2{font-size:16px;font-weight:800;display:flex;align-items:baseline;gap:7px}.frl{font-size:10px;color:${MUT};font-weight:600}
        .fbar2{position:relative;height:12px;background:#f1eef8;border-radius:6px}
        .fbar-in{height:100%;border-radius:6px;min-width:3px}
        .fobj{position:absolute;top:-3px;height:18px;width:2px;background:${INK};opacity:.45}
        .fmeta{font-size:11px;color:${MUT};display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .dl{font-weight:800;font-size:11px}.dl.flat{color:${MUT}}.obj{font-weight:600}.lk{color:${RED};font-weight:700}
        .fd{text-align:right}.wtag{font-size:9px;font-weight:800;color:#fff;background:${RED};padding:3px 8px;border-radius:20px}
        .fnl-leg{font-size:11px;color:${MUT};margin-top:12px;display:flex;gap:16px;flex-wrap:wrap}.fnl-leg b{color:${INK}}
        .alert2{display:flex;gap:11px;background:rgba(245,165,36,.09);border:1px solid rgba(245,165,36,.35);border-radius:12px;padding:13px 15px;margin-top:14px;font-size:12.5px;line-height:1.55;color:${INK2}}.a2ic{font-size:18px}
        @media(max-width:640px){.fnl .frow{grid-template-columns:1fr;gap:6px}.fnl .fd{text-align:left}}
        .duel{width:100%;border-collapse:collapse}.duel th{font-size:12px;padding:9px 10px;border-bottom:2px solid ${LINE};text-align:center}.duel th:first-child{text-align:left;color:${MUT};font-weight:600}
        .duel td{padding:8px 10px;border-bottom:1px solid #f4f2f9;font-size:12.5px}.duel td:first-child{color:${MUT}}.duel td.dv{text-align:center;font-weight:600}
        .verdict{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
        .vc{border-radius:12px;padding:13px 15px;font-size:12px;line-height:1.5}.vc.win{background:rgba(31,175,106,.08);border:1px solid rgba(31,175,106,.3)}.vc.cut{background:rgba(229,56,77,.06);border:1px solid rgba(229,56,77,.25)}
        .vc b{display:block;margin-bottom:3px}
        .segrow{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #f4f2f9}.segrow:last-of-type{border-bottom:0}
        .seglbl{width:190px;flex:none}.seglbl b{font-size:12.5px;display:block}.seglbl span{font-size:10px;color:${MUT}}
        .segbarwrap{flex:1;display:flex;align-items:center;gap:9px;background:#f2eff8;border-radius:7px;height:24px;position:relative}.segbar{height:100%;border-radius:7px;min-width:10px;opacity:.9}
        .segval{position:absolute;right:9px;font-size:11px;font-weight:800}
        .segkpi{width:66px;flex:none;text-align:center}.segkpi b{font-size:15px;display:block}.segkpi span{font-size:9px;color:${MUT}}
        .note{border-radius:10px;padding:11px 14px;font-size:12px;line-height:1.5;margin-top:12px}.note.amber{background:rgba(245,165,36,.08);border:1px solid rgba(245,165,36,.28)}.note.red{background:rgba(229,56,77,.06);border:1px solid rgba(229,56,77,.2)}
        .sptbl{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}.sptbl th{text-align:left;color:${MUT};font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.4px;padding:6px 8px;border-bottom:2px solid ${LINE}}.sptbl td{padding:7px 8px;border-bottom:1px solid #f4f2f9}
        .charts{display:grid;grid-template-columns:1fr 1fr;gap:16px}.charts h4{font-size:12.5px;margin-bottom:1px}.charts .cs{font-size:10.5px;color:${MUT};margin-bottom:6px}
        .cinsight{background:#faf9ff;border:1px solid #ece7fb;border-radius:12px;padding:12px 15px;font-size:12px;color:${INK2};margin-top:12px;line-height:1.5}
        .cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(172px,1fr));gap:14px}
        .cc{background:#fff;border:1px solid ${LINE};border-radius:13px;overflow:hidden;box-shadow:0 2px 10px rgba(60,40,120,.05);cursor:pointer;transition:transform .16s,box-shadow .16s}
        .cc:hover{transform:translateY(-3px);box-shadow:0 10px 24px rgba(124,92,255,.18)}
        .cph{position:relative;aspect-ratio:1/1;background:#0d0c16;display:flex;align-items:center;justify-content:center}.cph img{width:100%;height:100%;object-fit:cover;display:block}
        .noimg{background:linear-gradient(135deg,#2a1d5c,${ACCD});color:#fff;font-size:12px;font-weight:700;text-align:center;padding:14px;line-height:1.35;width:100%;height:100%;display:flex;align-items:center;justify-content:center}
        .play{position:absolute;inset:0;margin:auto;width:46px;height:46px;border-radius:50%;background:rgba(23,18,38,.62);color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;text-decoration:none;border:2px solid rgba(255,255,255,.75)}
        .vlabel,.ilabel{position:absolute;top:7px;left:7px;font-size:8px;font-weight:800;letter-spacing:.5px;padding:2px 6px;border-radius:5px;color:#fff}.vlabel{background:${RED}}.ilabel{background:rgba(23,18,38,.55)}
        .cbadge{position:absolute;top:7px;right:7px;font-size:8px;font-weight:800;letter-spacing:.4px;color:#fff;padding:2px 7px;border-radius:20px}
        .cmore{position:absolute;bottom:7px;right:7px;font-size:9px;font-weight:800;color:#fff;background:rgba(23,18,38,.6);padding:3px 8px;border-radius:20px;opacity:0;transition:.15s}.cc:hover .cmore{opacity:1}
        .cc figcaption{padding:9px 11px 11px}.cn{font-weight:700;font-size:11.5px;line-height:1.25;height:29px;overflow:hidden}
        .cmeta{display:flex;gap:6px;margin:5px 0}.cset{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;padding:2px 6px;border-radius:4px;background:rgba(124,92,255,.12);color:${ACCD}}
        .cm{display:flex;gap:9px;align-items:baseline;font-size:11px;font-weight:700;flex-wrap:wrap}.cm span{font-weight:600;font-size:10px}
        .pairs{width:100%;border-collapse:collapse;font-size:12px}.pairs th{text-align:left;color:${MUT};font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.4px;padding:6px;border-bottom:2px solid ${LINE}}.pairs td{padding:7px 6px;border-bottom:1px solid #f2effa}.pn{font-weight:600;max-width:200px}
        .tag{font-size:9px;font-weight:800;border:1px solid;border-radius:20px;padding:2px 8px;letter-spacing:.3px}
        .legend{display:flex;gap:15px;font-size:11px;color:${MUT};margin-top:10px;flex-wrap:wrap}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:middle}
        .pares-note{margin-top:14px;background:#faf9ff;border:1px solid #ece7fb;border-radius:12px;padding:12px 15px;font-size:12px;color:${INK2};line-height:1.55}
        .foot{margin-top:26px;font-size:10px;color:${MUT};border-top:1px solid ${LINE};padding-top:12px;line-height:1.5}
        .lp-kpis{display:flex;gap:26px;flex-wrap:wrap}
        .lp-kpi b{font-size:24px;font-weight:800;display:block;line-height:1}.lp-kpi span{font-size:10px;color:${MUT};text-transform:uppercase;letter-spacing:.5px}.lp-kpi small{font-size:11px;color:${MUT};font-weight:600;display:block;margin-top:1px}
        .lp-ins{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
        .lp-inc{border:1px solid ${LINE};border-radius:12px;padding:13px 15px;font-size:12px;line-height:1.55}.lp-inc b{display:block;margin-bottom:3px}
        .lp-tbl{width:100%;border-collapse:collapse}
        .lp-tbl th{font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:${MUT};font-weight:700;text-align:right;padding:8px 10px;border-bottom:2px solid ${LINE}}.lp-tbl th:first-child{text-align:left}
        .lp-tbl td{padding:9px 10px;border-bottom:1px solid #f4f2f9;font-size:12.5px;vertical-align:middle}
        .lp-tbl tr.lp-w{background:rgba(229,56,77,.05)}.lp-tbl tr.lp-b{background:rgba(31,175,106,.05)}
        .lp-pl{display:flex;align-items:center;gap:8px}.lp-kd{font-size:8.5px;font-weight:800;text-transform:uppercase;padding:2px 7px;border-radius:5px;flex:none}
        .lp-pn{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:230px}
        .lp-rt{font-size:8px;font-weight:800;color:#fff;padding:2px 6px;border-radius:20px;flex:none}
        .lp-num{text-align:right;font-weight:800;font-size:13px}.lp-n2{text-align:right;font-weight:700}
        .lp-bc{display:flex;align-items:center;gap:9px;justify-content:flex-end}.lp-bv{font-weight:800;width:38px;text-align:right}
        .lp-bt{position:relative;width:96px;height:9px;background:#f1eef8;border-radius:5px;flex:none}.lp-bf{position:absolute;left:0;top:0;height:100%;border-radius:5px}
        .lp-bavg{position:absolute;top:-2px;height:13px;width:2px;background:${INK};opacity:.5}
        .lp-leg{font-size:11px;color:${MUT};margin-top:12px;display:flex;gap:16px;flex-wrap:wrap}.lp-leg b{color:${INK}}
        .lp-note{background:#faf9ff;border:1px solid #ece7fb;border-radius:12px;padding:12px 15px;font-size:12px;color:${INK2};margin-top:14px;line-height:1.55}
        @media(max-width:720px){.lp-ins{grid-template-columns:1fr}.lp-bt{width:60px}.lp-pn{max-width:130px}}
        #adm{position:fixed;inset:0;background:rgba(15,12,26,.55);z-index:99;display:flex;align-items:flex-start;justify-content:center;padding:34px 16px;overflow:auto}
        .adm-box{background:#fff;border-radius:18px;max-width:760px;width:100%;box-shadow:0 30px 80px rgba(20,10,50,.4);overflow:hidden;position:relative}
        .adm-top{display:flex}.adm-media{width:250px;flex:none;background:#0d0c16;position:relative;aspect-ratio:1/1}.adm-media img{width:100%;height:100%;object-fit:cover}.adm-media .play{width:52px;height:52px;font-size:19px}
        .adm-head{flex:1;padding:18px 20px}.adm-head .badge{font-size:9px;font-weight:800;color:#fff;padding:3px 9px;border-radius:20px;letter-spacing:.4px}
        .adm-head h3{font-size:16px;font-weight:800;margin:9px 0 5px;line-height:1.25}
        .adm-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.adm-chips span{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;padding:2px 7px;border-radius:5px;background:#f0eef7;color:${MUT}}
        .adm-big{display:flex;gap:18px;margin-top:6px}.adm-big div b{font-size:20px;font-weight:800;display:block}.adm-big div span{font-size:9.5px;color:${MUT};text-transform:uppercase;letter-spacing:.4px}
        .adm-body{padding:4px 20px 20px}.adm-sec{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:${ACC};margin:16px 0 8px}
        .mtab{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.mcell{background:#faf9ff;border:1px solid #eee;border-radius:10px;padding:9px 11px}.mcell b{font-size:15px;font-weight:800;display:block}.mcell span{font-size:9.5px;color:${MUT}}.mcell small{font-size:9.5px;color:${ACCD};font-weight:700;display:block;margin-top:1px}
        .pl2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.plcard{border:1px solid ${LINE};border-radius:11px;padding:11px 13px}.plcard .pn{font-weight:800;font-size:12px;display:flex;align-items:center;gap:6px}.plcard .pm{display:flex;gap:12px;margin-top:6px;font-size:11px;font-weight:700}
        .copybox{background:#faf9fe;border:1px solid #ece8f6;border-radius:11px;padding:11px 13px;font-size:11.5px;color:${INK2};line-height:1.5;white-space:pre-wrap;max-height:150px;overflow:auto}
        #adm-close{position:absolute;top:8px;right:10px;font-size:20px;color:#fff;background:rgba(0,0,0,.35);width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2}
        @media(max-width:720px){.aigrid,.charts,.verdict,.cgrid{grid-template-columns:1fr}.adm-top{flex-direction:column}.adm-media{width:100%}}
      `}</style>
    </div>
  );
}
