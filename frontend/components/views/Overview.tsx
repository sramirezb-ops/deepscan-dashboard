'use client';

import { LeadsOverview } from './LeadsOverview';
import { VisibilidadVenta } from './VisibilidadVenta';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useOverview } from '@/lib/hooks/useOverview';
import { formatCurrency, formatInt, formatDelta, deltaDirection } from '@/lib/utils';

// ── Router del Overview ejecutivo ────────────────────────────
// Un cliente "modelo de leads puro" (objetivo 'leads' y SIN 'ventas'/ecommerce,
// ej. Ofero) ve el overview consolidado de leads. El resto ve el overview de
// ecommerce + WhatsApp de abajo. Branch por COMPONENTE (no por hook) para que el
// orden de hooks sea estable.
export function OverviewSwitch() {
  const client = useClient();
  const isLeadsModel =
    client.objectives.includes('leads') && !client.objectives.includes('ventas');
  return isLeadsModel ? <LeadsOverview /> : <Overview />;
}

// Estilos scopeados a .ov-root. Usan los tokens del app (--bg1, --t1..t3, --b1,
// --acc, --up, --warn, --mu) → el tema claro/oscuro funciona solo. Solo el verde
// de WhatsApp y el azul de Meta son literales (legibles en ambos temas).
const CSS = `
.ov-root{--sale:var(--up);--pend:var(--warn);--wa:#17b877;--meta:#6a7cff}
.ov-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:40px}
.ov-brand{display:flex;align-items:center;gap:12px}
.ov-mk{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--acc),#a98cff);display:grid;place-items:center;color:#fff;font-weight:800;font-size:17px}
.ov-brand .n{font-weight:700;font-size:15px;letter-spacing:-.01em}
.ov-brand .s{font-size:11.5px;color:var(--t3)}
.ov-meta{display:flex;align-items:center;gap:16px;font-size:12px;color:var(--t2);flex-wrap:wrap}
.ov-meta .st{display:inline-flex;align-items:center;gap:6px}
.ov-meta .st .dot{width:6px;height:6px;border-radius:50%}
.ov-eyebrow{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--t3)}
.ov-hero{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:40px;align-items:end;padding-bottom:36px;border-bottom:1px solid var(--b1)}
.ov-thesis{font-size:clamp(23px,3.2vw,36px);font-weight:800;letter-spacing:-.02em;line-height:1.15;text-wrap:balance}
.ov-thesis .hl{color:var(--sale)}
.ov-thesis-sub{font-size:13.5px;color:var(--t2);margin-top:16px;max-width:58ch;line-height:1.6}
.ov-thesis-sub b{color:var(--t1)}
.ov-north .k{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--t3);margin-bottom:8px}
.ov-north .v{font-size:clamp(38px,5vw,54px);font-weight:800;letter-spacing:-.03em;line-height:.95;color:var(--sale)}
.ov-north .r{display:flex;gap:22px;margin-top:16px}
.ov-north .r .l{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--t3)}
.ov-north .r .rv{font-size:19px;font-weight:800;margin-top:2px}
.ov-sh{display:flex;align-items:baseline;gap:12px;margin:42px 0 20px}
.ov-sh h2{font-size:15px;font-weight:700;letter-spacing:-.01em;margin:0}
.ov-sh .hint{font-size:12px;color:var(--t3)}
.ov-gap{display:flex;flex-direction:column;gap:16px}
.ov-gaprow{display:grid;grid-template-columns:132px 1fr;gap:16px;align-items:center}
.ov-gaprow .lab{font-size:12.5px;font-weight:600}
.ov-gaprow .lab small{display:block;font-size:10.5px;color:var(--t3);font-weight:500;margin-top:1px}
.ov-gaprow .track{position:relative;height:14px}
.ov-gaprow .fill{position:absolute;left:0;top:0;height:100%;border-radius:0 7px 7px 0;min-width:3px}
.ov-gaprow .amt{position:absolute;top:50%;transform:translateY(-50%);font-size:13px;font-weight:800;white-space:nowrap;padding-left:12px}
.ov-gapnote{font-size:12px;color:var(--t2);margin-top:22px;padding-left:148px;line-height:1.55}
.ov-gapnote b{color:var(--t1)}
.ov-strip{display:grid;grid-template-columns:repeat(5,1fr);border-top:1px solid var(--b1);border-bottom:1px solid var(--b1)}
.ov-cell{padding:20px 22px;border-left:1px solid var(--b1)}
.ov-cell:first-child{border-left:none;padding-left:2px}
.ov-cell .l{font-size:10.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--t3)}
.ov-cell .v{font-size:26px;font-weight:800;letter-spacing:-.02em;margin-top:7px}
.ov-cell .d{font-size:11px;margin-top:5px;color:var(--t3)}
.ov-cell .d.up{color:var(--sale);font-weight:600}.ov-cell .d.dn{color:var(--warn);font-weight:600}
.ov-waink{color:var(--wa)}
.ov-duo{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.ov-mini{background:var(--bg1);border:1px solid var(--b1);border-radius:14px;padding:22px}
.ov-mini .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.ov-mini .top .t{font-size:13px;font-weight:700}
.ov-mini .chip{font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:3px 9px;border-radius:999px}
.ov-mini .chip.wa{background:rgba(23,184,119,.13);color:var(--wa)}
.ov-mini .chip.web{background:var(--bg3);color:var(--t2)}
.ov-mini .big{display:flex;align-items:baseline;gap:10px}
.ov-mini .big .n{font-size:34px;font-weight:800;letter-spacing:-.02em}
.ov-mini .big .x{font-size:12px;color:var(--t2)}
.ov-mini .sub{font-size:12px;color:var(--t2);margin-top:6px;line-height:1.5}
.ov-collect{margin-top:18px}
.ov-collect .b{height:12px;border-radius:6px;overflow:hidden;display:flex;background:var(--bg3)}
.ov-collect .lg{display:flex;justify-content:space-between;margin-top:9px;font-size:11.5px}
.ov-collect .it{display:flex;align-items:center;gap:6px}
.ov-collect .sw{width:9px;height:9px;border-radius:3px}
.ov-collect b{font-weight:800}
.ov-acts{display:flex;flex-direction:column;border-top:1px solid var(--b1)}
.ov-act{display:grid;grid-template-columns:150px 1fr;gap:20px;padding:18px 2px;border-bottom:1px solid var(--b1);align-items:baseline}
.ov-act .tag{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:700}
.ov-act .tag .dot{width:9px;height:9px;border-radius:50%}
.ov-act .body{font-size:13px;color:var(--t2);line-height:1.55}
.ov-act .body b{color:var(--t1)}
.ov-fn{margin-top:38px;display:flex;gap:24px;flex-wrap:wrap;align-items:center;font-size:11.5px;color:var(--t3);border-top:1px solid var(--b1);padding-top:18px}
.ov-fn .w{display:flex;align-items:center;gap:8px}.ov-fn .w .sw{width:8px;height:8px;border-radius:50%}
.ov-fn b{color:var(--t2);font-weight:800}
@media(max-width:820px){.ov-hero{grid-template-columns:1fr;gap:26px;align-items:start}.ov-strip{grid-template-columns:1fr 1fr}.ov-cell:nth-child(3){border-left:none}.ov-duo{grid-template-columns:1fr}.ov-gaprow{grid-template-columns:96px 1fr}.ov-gapnote{padding-left:0}.ov-act{grid-template-columns:1fr;gap:6px}}
`;

export function Overview() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useOverview(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const cur = client.currency;

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>Cargando datos de {client.name}…</div>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="view on">
        <div className="card" style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}>
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>Error cargando datos</div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="view on">
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>Sin datos disponibles para el período.</div>
        </div>
      </div>
    );
  }

  const cfmt = (v: number) => formatCurrency(v, cur);
  const merTxt = `${data.mer.toFixed(1)}×`;

  // North-star: AURA si existe (venta real cobrada); si no, revenue de GA4.
  const northVal = data.auraExists ? data.auraCobrado : data.revenue;
  const northDelta = data.auraExists ? data.auraCobradoDelta : data.revenueDelta;
  const excluded = data.auraCambio + data.auraCowmmerce + data.auraPrueba;
  const enRitmo = northDelta >= 0;

  // Desfase: la misma demanda vista por cada fuente. Escala por el máximo.
  const bars = [
    { lab: 'Venta real', sub: 'AURA · cobrado', v: data.auraCobrado, c: 'var(--sale)', white: true },
    { lab: 'Meta atribuido', sub: 'modelo Meta', v: data.metaRevenue, c: 'var(--meta)' },
    { lab: 'Shopify cobrado', sub: 'tienda web', v: data.shopCobrado, c: 'var(--acc)' },
    { lab: 'GA4 revenue', sub: `${data.ga4Sites.length} web${data.ga4Sites.length === 1 ? '' : 's'}`, v: data.revenue, c: 'var(--t3)' },
  ];
  const barMax = Math.max(...bars.map((b) => b.v), 1);
  const webPct = data.auraCobrado > 0 ? (data.revenue / data.auraCobrado) * 100 : 0;

  const shopPct = Math.round(data.shopCollectedPct * 100);
  const sites = data.ga4Sites.slice(0, 2);

  // Acciones DERIVADAS de los datos (no hardcode).
  const escalar
    = data.waConversations > 0
      ? `<b>WhatsApp:</b> ${formatInt(data.waConversations)} conversaciones a ${cfmt(data.waCostPerConv)} c/u con MER de negocio ${merTxt}. Subir presupuesto del CBO de conversación es la palanca más clara.`
      : `<b>Venta real (AURA):</b> ${cfmt(data.auraCobrado)} cobrados con MER ${merTxt}. Escalar la inversión mantiene el retorno mientras la eficiencia aguante.`;
  const ajustar
    = data.shopPendiente > 0
      ? `<b>Cobro Shopify:</b> ${100 - shopPct}% del revenue web queda pendiente (${cfmt(data.shopPendiente)}). Automatizar el recordatorio de pago recupera venta sin invertir un peso más.`
      : `<b>Google optimiza a add-to-cart:</b> alinear la conversión de Google a compra haría comparable la puja con la venta real.`;
  const vigilar
    = data.googleSpend > 0
      ? `<b>Google Ads:</b> ${cfmt(data.googleSpend)} de gasto — validar que el tracking de la cuenta esté midiendo bien antes de escalar, para no leer ruido.`
      : `<b>Google Ads:</b> cuenta recién vinculada (sin gasto aún en el período). Validar el tracking antes de activar presupuesto.`;

  return (
    <div className="view on">
      <div className="ov-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />

        {/* TOP */}
        <div className="ov-bar">
          <div className="ov-brand">
            <div className="ov-mk">{client.name.charAt(0)}</div>
            <div>
              <div className="n">{client.name}</div>
              <div className="s">Overview · Ecommerce &amp; WhatsApp</div>
            </div>
          </div>
          <div className="ov-meta">
            <span className="st"><span className="dot" style={{ background: enRitmo ? 'var(--sale)' : 'var(--warn)' }} />{enRitmo ? 'En ritmo' : 'Atención'}</span>
            <span>{rangeLabel}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{cur}</span>
          </div>
        </div>

        {/* VISIBILIDAD DE VENTA (automatizada desde aura_sales · el reporte que antes se armaba a mano) */}
        <VisibilidadVenta />

        {/* HERO */}
        <div className="ov-hero">
          <div>
            <div className="ov-eyebrow" style={{ marginBottom: 18 }}>La lectura del período</div>
            {data.auraExists ? (
              <div className="ov-thesis">La venta se cierra por <span className="hl">WhatsApp y punto de venta</span>, no en el checkout web.</div>
            ) : (
              <div className="ov-thesis">Revenue de compra <span className="hl">{cfmt(data.revenue)}</span> con retorno de {merTxt || '—'}.</div>
            )}
            <div className="ov-thesis-sub">
              {data.auraExists ? (
                <>El negocio cobró <b>{cfmt(data.auraCobrado)}</b> reales (AURA) con un retorno de <b>{merTxt}</b>. La web solo alcanza a registrar una fracción — por eso medimos la venta real, no el checkout.</>
              ) : (
                <>Venta y eficiencia del período para {client.name}. Conectá AURA para medir la venta real cobrada de todos los canales.</>
              )}
            </div>
          </div>
          <div className="ov-north">
            <div className="k">{data.auraExists ? 'Ventas cobradas · AURA' : 'Revenue · GA4'}</div>
            <div className="v">{cfmt(northVal)}</div>
            <div className="r">
              <div><div className="l">MER</div><div className="rv">{merTxt}</div></div>
              <div><div className="l">Inversión</div><div className="rv">{cfmt(data.investment)}</div></div>
              {data.auraExists && <div><div className="l">Ticket</div><div className="rv">{cfmt(data.auraTicket)}</div></div>}
            </div>
          </div>
        </div>

        {/* DESFASE */}
        <div className="ov-sh"><h2>¿Dónde se registra esa venta?</h2><span className="hint">la misma demanda, medida por cada fuente</span></div>
        <div className="ov-gap">
          {bars.map((b) => {
            const w = Math.max((b.v / barMax) * 100, b.v > 0 ? 2 : 0);
            return (
              <div className="ov-gaprow" key={b.lab}>
                <div className="lab">{b.lab}<small>{b.sub}</small></div>
                <div className="track">
                  <div className="fill" style={{ width: `${w}%`, background: b.c }} />
                  <div className="amt" style={{ left: `${w}%`, color: b.white && w > 22 ? '#fff' : 'var(--t2)', ...(b.white && w > 22 ? { left: 0, paddingLeft: 12 } : {}) }}>{cfmt(b.v)}</div>
                </div>
              </div>
            );
          })}
        </div>
        {data.auraExists && (
          <div className="ov-gapnote">El checkout web captura <b>{webPct < 10 ? webPct.toFixed(1) : Math.round(webPct)}%</b> de la venta real. No es un problema de demanda — el cliente investiga en la web y <b>cierra la compra conversando</b>. La medición vive en AURA.</div>
        )}

        {/* KPI STRIP */}
        <div className="ov-sh"><h2>Indicadores</h2></div>
        <div className="ov-strip">
          <div className="ov-cell"><div className="l">Ventas cobradas</div><div className="v">{cfmt(data.auraExists ? data.auraCobrado : data.revenue)}</div><div className={`d ${deltaDirection(northDelta)}`}>{formatDelta(northDelta)}</div></div>
          <div className="ov-cell"><div className="l">MER</div><div className="v">{merTxt}</div><div className={`d ${data.merDelta >= 0 ? 'up' : 'dn'}`}>{(data.merDelta >= 0 ? '+' : '') + data.merDelta.toFixed(1)}×</div></div>
          <div className="ov-cell"><div className="l">Conversaciones WA</div><div className="v ov-waink">{formatInt(data.waConversations)}</div><div className={`d ${deltaDirection(data.waConversationsDelta)}`}>{formatDelta(data.waConversationsDelta)}</div></div>
          <div className="ov-cell"><div className="l">Costo / conversación</div><div className="v ov-waink">{data.waConversations > 0 ? cfmt(data.waCostPerConv) : '—'}</div><div className="d">mensajería</div></div>
          <div className="ov-cell"><div className="l">Inversión</div><div className="v">{cfmt(data.investment)}</div><div className="d">Meta {data.investment > 0 ? Math.round((data.metaSpend / data.investment) * 100) : 0}% · Google {data.investment > 0 ? Math.round((data.googleSpend / data.investment) * 100) : 0}%</div></div>
        </div>

        {/* WHATSAPP + SHOPIFY */}
        <div className="ov-sh"><h2>Cómo llega y cómo se cobra</h2></div>
        <div className="ov-duo">
          <div className="ov-mini">
            <div className="top"><div className="t">El canal que cierra</div><div className="chip wa">WhatsApp</div></div>
            <div className="big"><div className="n ov-waink">{formatInt(data.waConversations)}</div><div className="x">conversaciones · {cfmt(data.waCostPerConv)} c/u</div></div>
            <div className="sub">Con ticket cobrado de {cfmt(data.auraTicket)}, el retorno por conversación es altísimo. Aquí AURA recupera la venta que la web no ve.</div>
          </div>
          <div className="ov-mini">
            <div className="top"><div className="t">Cobro de la tienda web</div><div className="chip web">Shopify</div></div>
            <div className="big"><div className="n" style={{ color: 'var(--sale)' }}>{shopPct}%</div><div className="x">cobrado de {cfmt(data.shopBruto)} brutos</div></div>
            <div className="ov-collect">
              <div className="b"><div style={{ width: `${shopPct}%`, background: 'var(--sale)' }} /><div style={{ width: `${100 - shopPct}%`, background: 'var(--pend)' }} /></div>
              <div className="lg">
                <span className="it"><span className="sw" style={{ background: 'var(--sale)' }} />Cobrado <b>{cfmt(data.shopCobrado)}</b></span>
                <span className="it"><span className="sw" style={{ background: 'var(--pend)' }} />Pendiente <b>{cfmt(data.shopPendiente)}</b></span>
              </div>
            </div>
          </div>
        </div>

        {/* ACCIONES */}
        <div className="ov-sh"><h2>Acciones</h2><span className="hint">lente de agencia · {rangeLabel}</span></div>
        <div className="ov-acts">
          <div className="ov-act"><div className="tag"><span className="dot" style={{ background: 'var(--sale)' }} />Escalar</div><div className="body" dangerouslySetInnerHTML={{ __html: escalar }} /></div>
          <div className="ov-act"><div className="tag"><span className="dot" style={{ background: 'var(--pend)' }} />Ajustar</div><div className="body" dangerouslySetInnerHTML={{ __html: ajustar }} /></div>
          <div className="ov-act"><div className="tag"><span className="dot" style={{ background: 'var(--acc)' }} />Vigilar</div><div className="body" dangerouslySetInnerHTML={{ __html: vigilar }} /></div>
        </div>

        {/* FOOTNOTE — 2 webs */}
        <div className="ov-fn">
          {sites.map((s, i) => (
            <span className="w" key={s.property}><span className="sw" style={{ background: i === 0 ? 'var(--acc)' : 'var(--wa)' }} />Web {i + 1} <b>{formatInt(s.sessions)}</b> ses.</span>
          ))}
          <span style={{ marginLeft: 'auto' }}>Venta real desde AURA · web y Meta como sublentes · {cur} · {rangeLabel}.</span>
        </div>
      </div>
    </div>
  );
}
