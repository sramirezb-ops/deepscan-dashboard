'use client';

import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { useVisibilidadVenta } from '@/lib/hooks/useVisibilidadVenta';
import { formatCurrencyFull, formatInt, formatPercent } from '@/lib/utils';

// ============================================================
// VisibilidadVenta — el reporte de "visibilidad de venta" de Sneaker Store,
// ahora vivo en el dashboard y actualizándose solo (antes se armaba a mano del
// CSV). Misma lógica: medición (venta real cobrada) por canal, MER como número
// protagonista, ROAS solo de Meta (sobre compras reales), y lo separado
// (cambios + Cowmmerce) aparte. Fuente: aura_sales + meta/gads (vía ETL).
// ============================================================

export function VisibilidadVenta() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useVisibilidadVenta(client.id, range, previous);
  const cur = client.currency;
  const money = (v: number) => formatCurrencyFull(v, cur);

  if (loading && !data) return null;
  if (error || !data || !data.exists) return null; // solo clientes con AURA

  const merUp = data.mer >= data.merPrev;
  const stale = data.ultimaFecha && data.ultimaFecha < data.to;
  const fdate = (s: string) => {
    const [y, m, d] = s.split('-');
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${parseInt(d, 10)} ${meses[parseInt(m, 10) - 1]}`;
  };
  const maxCanal = Math.max(...data.canales.map((c) => c.cobrado), 1);

  return (
    <div className="vv">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="vv-sh">
        <h3>💰 Visibilidad de venta</h3>
        <span className="hint">venta real cobrada · MER · se actualiza solo</span>
        {data.ultimaFecha && (
          <span className={'vv-fresh' + (stale ? ' stale' : '')}>
            <span className="dot" />
            {stale ? `datos al ${fdate(data.ultimaFecha)}` : `al día · ${fdate(data.ultimaFecha)}`}
          </span>
        )}
      </div>

      {stale && (
        <div className="vv-warn">
          La venta llega hasta el <b>{fdate(data.ultimaFecha!)}</b>: la fuente (Google Sheet de AURA) aún
          no recibió los días siguientes. En cuanto el sheet se actualice, esto avanza solo — sin pegar el CSV.
        </div>
      )}

      {/* KPIs */}
      <div className="vv-kpis">
        <div className="vv-kpi">
          <div className="l">Venta real cobrada</div>
          <div className="v">{money(data.medicion)}</div>
          <div className="s">{formatInt(data.movimientos)} movimientos · incluye {money(data.abonos)} de abonos</div>
        </div>
        <div className="vv-kpi hero">
          <div className="l">MER — el número que importa</div>
          <div className="v">{data.mer.toFixed(1)}×
            {data.merPrev > 0 && (
              <span className={'d ' + (merUp ? 'up' : 'dn')}>{merUp ? '▲' : '▼'} vs. antes {data.merPrev.toFixed(1)}×</span>
            )}
          </div>
          <div className="s">por cada $1 en anuncios entran {money(data.mer)} de venta real cobrada</div>
        </div>
        <div className="vv-kpi">
          <div className="l">Inversión en anuncios</div>
          <div className="v">{money(data.inversion)}</div>
          <div className="s">Meta {money(data.metaSpend)} · Google {money(data.googleSpend)}</div>
        </div>
      </div>

      {/* Venta por canal */}
      <div className="vv-sub">Venta por canal</div>
      <div className="vv-canales">
        {data.canales.map((c) => (
          <div className="vv-row" key={c.label}>
            <div className="nm">{c.label}<span className="ops">{c.ops}</span></div>
            <div className="track"><i style={{ width: Math.max(3, (c.cobrado / maxCanal) * 100) + '%' }} /></div>
            <div className="mo">{money(c.cobrado)}</div>
            <div className="pc">{formatPercent(c.pct, 0)}</div>
          </div>
        ))}
      </div>

      {/* ROAS plataformas + separado */}
      <div className="vv-cols">
        <div className="vv-box">
          <div className="bx-t">ROAS de plataformas <span>referencia</span></div>
          <div className="bx-roas">Meta <b>{data.metaRoas.toFixed(1)}×</b></div>
          <div className="bx-s">sobre compras reales ({money(data.metaValue)} atribuidos · {formatInt(data.metaPurchases)} compras)</div>
          <div className="bx-note">Google Ads: su conversión aún suma “agregar al carrito”, no solo compras, así que no reportamos su ROAS (inflaría el dato). El <b>MER</b> es el lente honesto.</div>
        </div>
        <div className="vv-box sep">
          <div className="bx-t">🔕 Separado de la medición</div>
          <div className="bx-s2">dinero ya cobrado antes, no es venta nueva del período</div>
          <div className="sep-row"><span>Cambios</span><b>{money(data.cambios)}</b></div>
          <div className="sep-row"><span>Cowmmerce (marketplace/ML)</span><b>{money(data.cowmmerce)}</b></div>
          <div className="sep-gmv"><span>GMV bruto del período</span><b>{money(data.gmvBruto)}</b></div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.vv{margin-top:22px}
.vv-sh{display:flex;align-items:baseline;gap:11px;margin-bottom:14px;flex-wrap:wrap}
.vv-sh h3{font-size:15px;font-weight:800;margin:0}
.vv-sh .hint{font-size:11px;color:var(--t3)}
.vv-fresh{margin-left:auto;font-size:10.5px;color:var(--up);display:flex;align-items:center;gap:5px;font-weight:600}
.vv-fresh .dot{width:7px;height:7px;border-radius:50%;background:var(--up)}
.vv-fresh.stale{color:var(--warn)}.vv-fresh.stale .dot{background:var(--warn)}
.vv-warn{background:rgba(234,179,8,.1);border:1px solid var(--warn);border-radius:10px;padding:10px 14px;font-size:12px;color:var(--t2);line-height:1.5;margin-bottom:16px}
.vv-warn b{color:var(--t1)}
.vv-kpis{display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:13px}
.vv-kpi{background:var(--bg1);border:1px solid var(--b1);border-radius:14px;padding:15px 17px}
.vv-kpi .l{font-size:11px;color:var(--t3);font-weight:600}
.vv-kpi .v{font-size:26px;font-weight:800;letter-spacing:-.02em;margin-top:6px;color:var(--t1)}
.vv-kpi .s{font-size:11px;color:var(--t3);margin-top:5px;line-height:1.4}
.vv-kpi.hero{background:linear-gradient(120deg,var(--bg1),var(--acc-faint,rgba(139,92,246,.06)));border-color:var(--acc)}
.vv-kpi.hero .v{color:var(--acc);display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.vv-kpi.hero .v .d{font-size:11px;font-weight:700}
.vv-kpi .v .d.up{color:var(--up)}.vv-kpi .v .d.dn{color:var(--dn)}
.vv-sub{font-size:12px;font-weight:700;color:var(--t1);margin:20px 0 10px}
.vv-canales{display:flex;flex-direction:column;gap:8px}
.vv-row{display:grid;grid-template-columns:1fr 2fr 110px 44px;gap:12px;align-items:center}
.vv-row .nm{font-size:12.5px;color:var(--t1);font-weight:600;display:flex;align-items:center;gap:8px}
.vv-row .nm .ops{font-size:10px;color:var(--t3);background:var(--bg3);border-radius:5px;padding:1px 6px;font-weight:600}
.vv-row .track{height:16px;background:var(--track);border-radius:5px;overflow:hidden}
.vv-row .track i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,var(--acc),var(--up))}
.vv-row .mo{text-align:right;font-size:12.5px;font-weight:700;font-family:'Space Grotesk',sans-serif}
.vv-row .pc{text-align:right;font-size:11.5px;color:var(--t3);font-weight:600}
.vv-cols{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin-top:20px}
.vv-box{background:var(--bg1);border:1px solid var(--b1);border-radius:14px;padding:15px 17px}
.vv-box .bx-t{font-size:12.5px;font-weight:800;color:var(--t1);display:flex;align-items:baseline;gap:8px}
.vv-box .bx-t span{font-size:10px;color:var(--t3);font-weight:500}
.vv-box .bx-roas{font-size:20px;font-weight:800;margin-top:8px;color:var(--t1)}.vv-box .bx-roas b{color:var(--up)}
.vv-box .bx-s{font-size:11px;color:var(--t3);margin-top:3px}
.vv-box .bx-note{font-size:11px;color:var(--t2);margin-top:10px;line-height:1.5;border-top:1px solid var(--b1);padding-top:9px}
.vv-box .bx-note b{color:var(--t1)}
.vv-box.sep .bx-s2{font-size:11px;color:var(--t3);margin-top:3px;margin-bottom:8px}
.sep-row{display:flex;justify-content:space-between;align-items:center;font-size:12.5px;color:var(--t2);padding:6px 0;border-top:1px solid var(--b1)}
.sep-row b{color:var(--t1);font-weight:700}
.sep-gmv{display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:10px 0 0;margin-top:4px;border-top:2px solid var(--b2);font-weight:700}
.sep-gmv b{color:var(--t1)}
@media(max-width:820px){.vv-kpis{grid-template-columns:1fr}.vv-cols{grid-template-columns:1fr}.vv-row{grid-template-columns:1fr 1.4fr 90px 40px;gap:8px}}
`;
