'use client';

import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { useEcommerceWeb } from '@/lib/hooks/useEcommerceWeb';
import { formatCurrencyFull, formatInt, formatPercent } from '@/lib/utils';

// ============================================================
// EcommerceWeb — hoja 100% ecommerce: comparativa de webs (dónde invertir) +
// venta real Shopify (pagado vs pendiente) + embudo + demanda. Cruza GA4
// (comportamiento) con Shopify (venta real). UX limpia, poco texto.
// ============================================================

export function EcommerceWeb() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useEcommerceWeb(client.id, range, previous);
  const cur = client.currency;
  const money = (v: number) => formatCurrencyFull(v, cur);

  if (loading && !data) return <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--t3)' }}>Cargando análisis ecommerce…</div>;
  if (error || !data) return null;

  const maxStep = Math.max(...data.funnel.map((s) => s.value), 1);
  const rps = (v: number) => `$${v.toFixed(2)}`; // venta/sesión: 2 decimales (valores chicos)
  const win = data.webs[0];
  const investReason = !win ? '' : win.kind === 'shopify'
    ? `Cierra más venta real por sesión (${rps(win.revPerSession)}) — la pauta ya convierte ahí. Pero su GA4 está en $0 y el 67% queda pendiente: escala, pero arregla tracking y cobranza.`
    : `Mejor retorno por sesión (${rps(win.revPerSession)}) y tráfico más sano (rebote ${formatPercent(win.bounce, 0)}). Base más sólida para escalar con menos riesgo.`;
  const maxRps = Math.max(...data.webs.map((w) => w.revPerSession), 0.01);

  return (
    <div className="ec">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* COMPARATIVA DE WEBS · DÓNDE INVERTIR */}
      <div className="ec-sh"><h3>¿Dónde meter la plata?</h3><span className="hint">las 2 webs, por retorno de tráfico</span></div>
      <div className="ec-webs">
        {data.webs.map((w) => (
          <div className={'ec-web' + (w === win ? ' win' : '')} key={w.property}>
            {w === win && <span className="wbadge">▲ Escalar aquí</span>}
            <div className="wtitle">{w.label}<span className={'wkind ' + w.kind}>{w.kind === 'shopify' ? 'Shopify' : 'principal'}</span></div>
            <div className="wrps"><b>{rps(w.revPerSession)}</b><span>venta real / sesión</span></div>
            <div className="wrpsbar"><i style={{ width: (w.revPerSession / maxRps) * 100 + '%' }} /></div>
            <div className="wgrid">
              <div><span className="k">Sesiones</span><span className="v">{formatInt(w.sessions)}</span></div>
              <div><span className="k">Venta real</span><span className="v">{money(w.realRevenue)}<small> {w.revSource}</small></span></div>
              <div><span className="k">Rebote</span><span className={'v ' + (w.bounce <= 0.35 ? 'good' : w.bounce >= 0.5 ? 'bad' : '')}>{formatPercent(w.bounce, 0)}</span></div>
              <div><span className="k">Dependencia pauta</span><span className={'v ' + (w.paidShare >= 0.6 ? 'bad' : '')}>{formatPercent(w.paidShare, 0)}</span></div>
            </div>
            {!w.ga4Tracks && <div className="wflag">⚠ GA4 no mide venta en esta web · dato de Shopify</div>}
          </div>
        ))}
      </div>
      {win && (
        <div className="ec-verdict">
          <span className="vk">Veredicto</span>
          <b>{data.investLabel}</b> — {investReason}
        </div>
      )}

      {/* VENTA REAL SHOPIFY — PAID vs PENDING */}
      <div className="ec-sh"><h3>Venta real · Shopify</h3><span className="hint">pagado vs pendiente de pago</span></div>
      <div className="ec-kpis">
        <div className="ec-kpi paid"><div className="l">✅ Pagado</div><div className="v">{money(data.revPaid)}</div><div className="s">{formatInt(data.unitsPaid)}u · {formatPercent(data.paidPct, 0)} del bruto</div></div>
        <div className="ec-kpi pend"><div className="l">⏳ Pendiente</div><div className="v">{money(data.revPending)}</div><div className="s">{formatInt(data.unitsPending)}u · por cobrar</div></div>
        <div className="ec-kpi"><div className="l">Ticket promedio</div><div className="v">{money(data.aovPaid)}</div><div className="s">Bruto {money(data.revBruto)}</div></div>
      </div>
      <div className="ec-splitbar"><i className="paid" style={{ width: data.paidPct * 100 + '%' }} /><i className="pend" style={{ width: (1 - data.paidPct) * 100 + '%' }} /></div>
      <div className="card ec-pad" style={{ marginTop: 14 }}>
        <div className="ec-ph"><div>Producto</div><div>✅ Pagado</div><div>⏳ Pendiente</div></div>
        {data.products.map((p) => (
          <div className="ec-prow" key={p.title}>
            <div className="pn" title={p.title}>{p.title}</div>
            <div className="pp">{p.unitsPaid > 0 ? <><b>{money(p.revPaid)}</b><span>{p.unitsPaid}u</span></> : <span className="z">—</span>}</div>
            <div className="pd">{p.unitsPending > 0 ? <><b>{money(p.revPending)}</b><span>{p.unitsPending}u</span></> : <span className="z">—</span>}</div>
          </div>
        ))}
      </div>

      {/* EMBUDO */}
      <div className="ec-sh"><h3>Embudo de conversión</h3><span className="hint">GA4</span>
        {data.breakLabel !== '—' && <span className="ec-break">⚠ se rompe en {data.breakLabel}</span>}
      </div>
      <div className="card ec-pad">
        {data.funnel.map((s) => (
          <div className={'ec-fstep' + (s.isBreak ? ' brk' : '')} key={s.key}>
            <div className="fl">{s.label}</div>
            <div className="fbar"><i style={{ width: Math.max(1.5, (s.value / maxStep) * 100) + '%' }} /></div>
            <div className="fv">{formatInt(s.value)}</div>
            <div className="fr">{s.stepRate === null ? '' : <span className={s.isBreak ? 'bad' : ''}>{formatPercent(s.stepRate, 1)}</span>}</div>
          </div>
        ))}
      </div>

      {/* DEMANDA */}
      <div className="ec-sh"><h3>Lo más visto</h3><span className="hint">demanda GA4 · ✓ = vendió en el período</span></div>
      <div className="card ec-pad">
        {data.topViewed.slice(0, 8).map((v, i) => (
          <div className="ec-vrow" key={v.name}>
            <span className="rk">{i + 1}</span>
            <span className="vn" title={v.name}>{v.name}</span>
            <span className="vv">{formatInt(v.views)}</span>
            <span className={'vs ' + (v.sold ? 'ok' : 'no')}>{v.sold ? '✓' : '✕'}</span>
          </div>
        ))}
      </div>

      {/* ACCIONES */}
      <div className="ec-acts">
        <div className="ec-act bad"><div className="tag">🔴 Vista → Carrito</div><div className="body">{formatInt(data.productViews)} vistas → {formatInt(data.funnel[2]?.value || 0)} carritos. El mayor cuello: revisar precio, tallas y fotos en la ficha.</div></div>
        <div className="ec-act warn"><div className="tag">⏳ Cobrar lo pendiente</div><div className="body">{money(data.revPending)} vendidos sin pagar. Un flujo de recordatorio recupera venta ya ganada.</div></div>
        <div className="ec-act info"><div className="tag">🛠 Desbloquear el dato</div><div className="body">La tienda Shopify mide $0 en GA4. Arreglar el datalayer daría CVR y ROAS reales por web y producto.</div></div>
      </div>
    </div>
  );
}

const CSS = `
.ec{margin-top:22px}
.ec-sh{display:flex;align-items:baseline;gap:11px;margin:26px 0 12px}.ec-sh h3{font-size:15px;font-weight:800;margin:0}.ec-sh .hint{font-size:11px;color:var(--t3)}
.ec-sh .ec-break{margin-left:auto;font-size:11px;color:var(--dn);font-weight:700;background:var(--dn-soft,rgba(229,56,77,.1));padding:3px 9px;border-radius:7px}
.ec-pad{padding:15px 18px}
/* comparativa webs */
.ec-webs{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.ec-web{position:relative;background:var(--bg1);border:1px solid var(--b1);border-radius:16px;padding:17px 18px}
.ec-web.win{border-color:var(--up);box-shadow:0 0 0 1px var(--up)}
.ec-web .wbadge{position:absolute;top:-9px;right:14px;background:var(--up);color:#fff;font-size:10px;font-weight:800;padding:2px 9px;border-radius:7px}
.ec-web .wtitle{font-size:15px;font-weight:800;display:flex;align-items:center;gap:8px}
.ec-web .wkind{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:2px 7px;border-radius:6px;background:var(--bg3);color:var(--t3)}
.ec-web .wkind.shopify{background:rgba(139,92,246,.12);color:var(--acc)}
.ec-web .wrps{margin-top:11px;display:flex;align-items:baseline;gap:8px}
.ec-web .wrps b{font-size:26px;font-weight:800;letter-spacing:-.02em;color:var(--t1)}
.ec-web.win .wrps b{color:var(--up)}
.ec-web .wrps span{font-size:11px;color:var(--t3)}
.ec-web .wrpsbar{height:6px;background:var(--track);border-radius:4px;overflow:hidden;margin:8px 0 14px}
.ec-web .wrpsbar i{display:block;height:100%;border-radius:4px;background:var(--t3)}
.ec-web.win .wrpsbar i{background:var(--up)}
.ec-web .wgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}
.ec-web .wgrid .k{display:block;font-size:10px;color:var(--t3);font-weight:600}
.ec-web .wgrid .v{display:block;font-size:15px;font-weight:800;margin-top:2px}
.ec-web .wgrid .v small{font-size:9px;color:var(--t3);font-weight:500}
.ec-web .wgrid .v.good{color:var(--up)}.ec-web .wgrid .v.bad{color:var(--dn)}
.ec-web .wflag{margin-top:12px;font-size:10.5px;color:var(--warn);background:rgba(234,179,8,.1);border-radius:7px;padding:6px 9px}
.ec-verdict{margin-top:14px;background:var(--bg1);border:1px solid var(--b1);border-left:3px solid var(--up);border-radius:12px;padding:13px 16px;font-size:12.5px;color:var(--t2);line-height:1.5}
.ec-verdict .vk{font-family:var(--mono,monospace);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--up);font-weight:700;margin-right:8px}
.ec-verdict b{color:var(--t1)}
/* venta kpis */
.ec-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:13px}
.ec-kpi{background:var(--bg1);border:1px solid var(--b1);border-radius:14px;padding:14px 16px}
.ec-kpi .l{font-size:11.5px;color:var(--t3);font-weight:600}
.ec-kpi .v{font-size:23px;font-weight:800;letter-spacing:-.02em;margin-top:5px;color:var(--t1)}
.ec-kpi .s{font-size:11px;color:var(--t3);margin-top:4px}
.ec-kpi.paid{border-color:var(--up)}.ec-kpi.paid .v{color:var(--up)}
.ec-kpi.pend{border-color:var(--warn)}.ec-kpi.pend .v{color:var(--warn)}
.ec-splitbar{display:flex;height:12px;border-radius:6px;overflow:hidden;margin-top:12px;background:var(--track)}
.ec-splitbar i.paid{background:var(--up)}.ec-splitbar i.pend{background:var(--warn)}
/* productos */
.ec-ph,.ec-prow{display:grid;grid-template-columns:1fr 130px 130px;gap:10px;align-items:center}
.ec-ph{font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--t3);padding-bottom:8px;border-bottom:1px solid var(--b1)}
.ec-ph div:not(:first-child){text-align:right}
.ec-prow{padding:9px 0;border-top:1px solid var(--b1);font-size:12.5px}
.ec-prow .pn{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ec-prow .pp,.ec-prow .pd{text-align:right}
.ec-prow .pp b,.ec-prow .pd b{font-weight:800}.ec-prow .pp span,.ec-prow .pd span{display:block;font-size:9.5px;color:var(--t3)}
.ec-prow .pp b{color:var(--up)}.ec-prow .pd b{color:var(--warn)}.ec-prow .z{color:var(--t3)}
/* embudo */
.ec-fstep{display:grid;grid-template-columns:150px 1fr 74px 54px;gap:12px;align-items:center;padding:6px 0;border-top:1px solid var(--b1)}
.ec-fstep:first-child{border-top:none}
.ec-fstep .fl{font-size:12.5px;font-weight:600}
.ec-fstep .fbar{height:14px;background:var(--track);border-radius:5px;overflow:hidden}.ec-fstep .fbar i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,var(--acc),var(--up))}
.ec-fstep.brk .fbar i{background:linear-gradient(90deg,#b23c33,var(--dn))}
.ec-fstep .fv{text-align:right;font-size:13px;font-weight:800}
.ec-fstep .fr{text-align:right;font-size:11px;color:var(--t3)}.ec-fstep .fr .bad{color:var(--dn);font-weight:700}
/* demanda */
.ec-vrow{display:grid;grid-template-columns:22px 1fr 70px 24px;gap:10px;align-items:center;padding:6px 0;border-top:1px solid var(--b1);font-size:12.5px}
.ec-vrow:first-child{border-top:none}
.ec-vrow .rk{color:var(--t3);font-weight:700;font-size:11px}
.ec-vrow .vn{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ec-vrow .vv{text-align:right;color:var(--t2);font-weight:700}
.ec-vrow .vs{text-align:center;font-weight:800}.ec-vrow .vs.ok{color:var(--up)}.ec-vrow .vs.no{color:var(--t3)}
/* acciones */
.ec-acts{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:22px}
.ec-act{background:var(--bg1);border:1px solid var(--b1);border-radius:13px;padding:14px 16px;border-left:3px solid var(--acc)}
.ec-act.bad{border-left-color:var(--dn)}.ec-act.warn{border-left-color:var(--warn)}.ec-act.info{border-left-color:var(--acc)}
.ec-act .tag{font-size:12px;font-weight:800;margin-bottom:5px}.ec-act .body{font-size:11.5px;color:var(--t2);line-height:1.5}
@media(max-width:820px){
  .ec-webs,.ec-kpis,.ec-acts{grid-template-columns:1fr}
  .ec-fstep{grid-template-columns:100px 1fr 60px;gap:8px}.ec-fstep .fr{display:none}
  .ec-ph,.ec-prow{grid-template-columns:1fr 96px 96px;gap:8px}
}
`;
