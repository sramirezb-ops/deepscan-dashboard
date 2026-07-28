'use client';

import { useState, useMemo } from 'react';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { useCompras, type Creative } from '@/lib/hooks/useCompras';
import { EmptyState } from '@/components/ui/EmptyState';

const INK = '#171226', INK2 = '#2b2440', MUT = '#77718a', ACC = '#7c5cff', ACCD = '#5a37e0';
const RED = '#e5384d', AMBER = '#f5a524', GREEN = '#1faf6a', LINE = '#ebe7f4';

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
  const { range } = usePeriod();
  const { data, loading, error } = useCompras(client.id, range);
  const [sel, setSel] = useState<number | null>(null);

  const view = useMemo(() => {
    if (!data) return null;
    const T = data.totals, ST = data.store;
    const r = (a: number, b: number, d = 1) => (b ? +((100 * a) / b).toFixed(d) : 0);
    const rBuy = r(T.purchases, T.checkout);
    const abandon = T.checkout - T.purchases;
    const steps = [
      { lbl: 'Impresiones', val: T.impressions, sub: `CPM ${money(T.cpm)} · Frec ${data.sets ? T.freq : ''}`, conv: null as number | null, cc: '', bm: '', leak: '' },
      { lbl: 'Clics en el enlace', val: T.link_clicks, sub: `CPC ${money(T.cpc)} · CTR ${T.ctr}%`, conv: r(T.link_clicks, T.impressions), cc: sem(r(T.link_clicks, T.impressions), 2, 1), bm: 'bench 1–2%', leak: '' },
      { lbl: 'Visitas a la página', val: T.landing, sub: `${money(T.spend / (T.landing || 1))}/visita`, conv: r(T.landing, T.link_clicks), cc: sem(r(T.landing, T.link_clicks), 85, 70), bm: 'bench >85%', leak: `${kfmt(T.link_clicks - T.landing)} clics no cargan` },
      { lbl: 'Agregan al carrito', val: T.cart, sub: `${money(T.spend / (T.cart || 1))}/carrito`, conv: r(T.cart, T.landing), cc: sem(r(T.cart, T.landing), 6, 3), bm: 'bench 5–10%', leak: `${kfmt(T.landing - T.cart)} ven y NO agregan` },
      { lbl: 'Inician pago', val: T.checkout, sub: `${money(T.spend / (T.checkout || 1))}/pago`, conv: r(T.checkout, T.cart), cc: sem(r(T.checkout, T.cart), 45, 30), bm: 'bench >45%', leak: '' },
      { lbl: 'Compran', val: T.purchases, sub: `${money(T.spend / (T.purchases || 1))}/compra`, conv: rBuy, cc: sem(rBuy, 35, 15), bm: 'bench 35–60%', leak: `${kfmt(abandon)} inician pago y NO compran` },
    ];
    const maxv = T.impressions || 1;
    const blended = T.roas;
    const aov = T.aov;
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
    return { T, ST, steps, maxv, blended, aov, rBuy, abandon, AI, vroas, iroas, fb, ig };
  }, [data]);

  if (loading) return <div className="ct-pad"><EmptyState title="Cargando Compras…" message="Un momento…" /></div>;
  if (error || !data || !view) return <div className="ct-pad"><EmptyState title="Sin datos de Compras" message={error || 'No hay datos de Advantage+ en este período.'} /></div>;

  const BS = data.sets['Best Sellers'], PX = data.sets['Próximos lanzamientos'];
  const { T, ST, steps, maxv, blended, AI, fb, ig } = view;
  const selc = sel != null ? data.creatives[sel] : null;

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

      {/* Embudo */}
      <h2><span className="nn">1</span>Embudo diagnóstico · dónde se rompe</h2>
      <div className="h2sub">De cada paso al siguiente: % que sobrevive vs benchmark. 🔴 = fuga.</div>
      <div className="card">
        {steps.map((s, i) => (
          <div key={i}>
            {s.conv != null && (
              <div className="fconv"><span className="fchip" style={{ background: s.cc + '1a', color: s.cc, borderColor: s.cc + '55' }}>▼ {s.conv}% <small>{s.bm}</small></span>
                {(s.cc === RED || s.cc === AMBER) && s.leak ? <span className="leak">⚠ {s.leak}</span> : null}</div>
            )}
            <div className="fstage">
              <div className="fbarbox"><div className="fbar" style={{ width: `${Math.max(Math.round((100 * s.val) / maxv), 5)}%`, background: s.cc === RED ? RED : i === 0 ? INK : ACC }} /></div>
              <div className="fnum"><b>{kfmt(s.val)}</b><span>{s.lbl} · {s.sub}</span></div>
            </div>
          </div>
        ))}
        <div className="leakbox"><b style={{ color: RED }}>Fuga mayor — el pago:</b> {kfmt(view.abandon)} inician el pago y no compran. Recuperar 10% = <b>~{Math.round(view.abandon * 0.1)} compras extra</b> (casi 2× las {T.purchases}) sin gastar $1 más. La palanca #1 es método de pago, confianza y seguimiento de checkout.</div>
      </div>

      {/* Duelo */}
      <h2><span className="nn">2</span>Duelo de conjuntos · quién escala y quién se audita</h2>
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
      <h2><span className="nn">3</span>Segmentos de público · Full Funnel</h2>
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
      <h2><span className="nn">4</span>Rendimiento por plataforma</h2>
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

      {/* Tendencias */}
      <h2><span className="nn">5</span>Tendencias · cómo se movió el mes</h2>
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

      {/* Creativos */}
      <h2><span className="nn">6</span>Creativos · todos los activos, con datos</h2>
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

      {/* Pares */}
      <h2><span className="nn">7</span>El par correcto · escalar / arreglar / cobrar</h2>
      <div className="h2sub">Comportamiento (GA4) + venta real y cobro (Shopify) por par.</div>
      <div className="card">
        <table className="pairs"><thead><tr><th>Par</th><th>Vistas</th><th>Carrito</th><th>Checkout</th><th>Vend.</th><th>💰 Cobrado</th><th>⏳ Pendiente</th><th></th></tr></thead>
          <tbody>{data.pairs.slice(0, 14).map((p, i) => {
            const t = p.sold > 0 && p.rev_paid > 0 ? ['ESCALAR', GREEN] : p.sold > 0 ? ['COBRAR', AMBER] : p.views >= 80 ? ['ARREGLAR', RED] : ['observar', MUT];
            return <tr key={i}><td className="pn">{p.name}</td><td>{kfmt(p.views)}</td><td>{p.atc}</td><td>{p.checkout}</td>
              <td><b>{p.sold || '—'}</b></td><td style={{ color: GREEN }}>{p.rev_paid ? money(p.rev_paid) : '—'}</td><td style={{ color: AMBER }}>{p.rev_pend ? money(p.rev_pend) : '—'}</td>
              <td><span className="tag" style={{ color: t[1] as string, background: (t[1] as string) + '14', borderColor: (t[1] as string) + '40' }}>{t[0]}</span></td></tr>;
          })}</tbody></table>
        <div style={{ marginTop: 14 }}>
          <svg viewBox={`0 0 ${SW} ${SH}`} width="100%">
            <line x1={PXo} y1={SH - PYo} x2={SW - 8} y2={SH - PYo} stroke={LINE} /><line x1={PXo} y1="8" x2={PXo} y2={SH - PYo} stroke={LINE} />
            <text x={SW - 10} y={SH - 10} textAnchor="end" fontSize="10" fill={MUT}>más vistas →</text><text x="8" y="18" fontSize="10" fill={MUT}>↑ % convierte</text>
            {data.pairs.map((p, i) => {
              const x = sx(p.views), y = sy(p.rcvr); const rr = p.sold_rev ? 6 + Math.min(Math.sqrt(p.sold_rev) / 12, 15) : 5;
              const c = p.sold > 0 && p.rev_paid > 0 ? GREEN : p.sold > 0 ? AMBER : p.views >= 80 ? RED : '#c3bcd4';
              if (p.sold_rev >= 4000 || (p.views >= 150 && p.sold === 0)) labels.push([x, y - rr - 5, p.name.replace('TENIS ', '').replace('Tenis ', '').slice(0, 15), c]);
              return <circle key={i} cx={x} cy={y} r={rr} fill={c} fillOpacity="0.5" stroke={c} strokeWidth="1.5" />;
            })}
            {labels.sort((a, b) => a[1] - b[1]).map((l, i, arr) => { let ly = l[1]; if (i > 0 && Math.abs(l[0] - arr[i - 1][0]) < 80 && ly - arr[i - 1][1] < 12) { ly = arr[i - 1][1] + 12; arr[i][1] = ly; }
              return <text key={i} x={l[0]} y={Math.max(ly, 12)} textAnchor="middle" fontSize="9.5" fill={INK2} fontWeight="700" stroke="#fff" strokeWidth="2.4" paintOrder="stroke">{l[2]}</text>; })}
          </svg>
          <div className="legend">
            <span><span className="dot" style={{ background: GREEN }} /><b>Escalar</b> — vende y cobra</span>
            <span><span className="dot" style={{ background: AMBER }} /><b>Cobrar</b> — vende, pago pendiente</span>
            <span><span className="dot" style={{ background: RED }} /><b>Arreglar</b> — mucha vista, 0 venta</span>
          </div>
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
              {selc.body && <><div className="adm-sec">Texto del anuncio</div><div className="copybox">{(selc.title ? selc.title + '\n\n' : '') + selc.body + (selc.cta ? `\n\n[ ${selc.cta.replace(/_/g, ' ')} ]` : '')}</div></>}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .cd{max-width:1140px;margin:0 auto;padding:6px 4px 60px;font-size:13px;color:${INK}}
        .cd-hd{padding:6px 0 6px}
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
        .fstage{display:flex;align-items:center;gap:14px;margin:2px 0}
        .fbarbox{flex:1;background:#f2eff8;border-radius:7px;height:30px;overflow:hidden}.fbar{height:100%;border-radius:7px;opacity:.9}
        .fnum{width:230px;flex:none}.fnum b{font-size:16px;font-weight:800}.fnum span{display:block;font-size:10.5px;color:${MUT}}
        .fconv{display:flex;align-items:center;gap:10px;margin:5px 0 5px calc(100% - 244px)}
        .fchip{font-size:11px;font-weight:800;border:1px solid;border-radius:20px;padding:2px 9px}.fchip small{font-weight:500;opacity:.75;font-size:9px}
        .leak{font-size:11px;color:${RED};font-weight:700}
        .leakbox{margin-top:14px;padding:12px 14px;background:rgba(229,56,77,.06);border:1px solid rgba(229,56,77,.2);border-radius:11px;font-size:12px;line-height:1.55}
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
        .foot{margin-top:26px;font-size:10px;color:${MUT};border-top:1px solid ${LINE};padding-top:12px;line-height:1.5}
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
