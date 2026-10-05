'use client';

import { useState } from 'react';
import { useClient } from '@/lib/useClient';
import { useAgenciaVsIA, type Owner, type ChangeRow } from '@/lib/hooks/useAgenciaVsIA';
import { formatCurrency, formatInt } from '@/lib/utils';

// ============================================================
// AgenciaVsIA — quién gestiona qué en Google Ads: la agencia vs la IA de Aura.
// Firma por usuario + client_type del historial de cambios (inmune a renombres).
// Google por ahora; Meta se suma después.
// ============================================================

const OWNER_META: Record<Owner, { label: string; cls: string }> = {
  agencia: { label: 'Agencia', cls: 'ag' },
  ia: { label: 'IA · Aura', cls: 'ia' },
  sin: { label: 'Sin atribuir', cls: 'sin' },
};
const ACTION_LABEL: Record<string, string> = {
  crear_campana: 'creó', pausar: 'pausó', activar: 'activó', eliminar: 'eliminó',
  cambio_presupuesto: 'cambió presupuesto', editar: 'editó',
};
const fmtDate = (s: string) => {
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function OwnerChip({ owner }: { owner: Owner }) {
  const m = OWNER_META[owner];
  return <span className={'av-own ' + m.cls}>{m.label}</span>;
}

export function AgenciaVsIA() {
  const client = useClient();
  const cur = client.currency;
  const { data, loading, error } = useAgenciaVsIA(client.id);
  const [filter, setFilter] = useState<Owner | 'all'>('all');

  if (loading && !data) return <div className="view on"><div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>Cargando Agencia vs IA…</div></div>;
  if (error || !data || !data.hasData) return <div className="view on"><div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>Aún no hay historial de cambios. Corre el ETL de Google para empezar a acumular.</div></div>;

  const money = (v: number) => formatCurrency(v, cur);
  const purchasePct = data.convGoogleTotal > 0 ? (data.purchaseConvTotal / data.convGoogleTotal) : 0;
  const changesF = filter === 'all' ? data.changes : data.changes.filter((c) => c.owner === filter);
  const iaTouches = data.changes.filter((c) => c.touchesAgency).length;
  const pauses = data.changes.filter((c) => c.action === 'pausar');

  return (
    <div className="view on">
      <div className="av">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />

        {/* HEADER */}
        <div className="av-hero">
          <div className="mk">⚖️</div>
          <div>
            <h1>Agencia vs IA (Aura)</h1>
            <div className="sub">Quién gestiona qué en Google Ads · {client.name} · <b>Google</b> <span className="soon">Meta próximamente</span></div>
          </div>
        </div>

        {/* FIRMA — cómo distinguimos */}
        <div className="av-sh"><h3>Cómo los distinguimos</h3><span className="hint">por usuario y herramienta del historial de cambios (no por el nombre de la campaña)</span></div>
        <div className="av-users">
          {data.users.map((u) => (
            <div className={'av-ucard ' + OWNER_META[u.owner].cls} key={u.email + u.clientType}>
              <OwnerChip owner={u.owner} />
              <div className="av-uemail">{u.email}</div>
              <div className="av-umeta">{u.clientType} · {u.count} cambios</div>
            </div>
          ))}
        </div>

        {/* SALUD DE MEDICIÓN */}
        <div className="av-sh"><h3>Salud de la medición</h3><span className="hint">qué cuenta Google como “conversión” vs compras reales</span></div>
        <div className="card av-pad">
          <div className="av-measkpis">
            <div><span className="l">“Conversiones” Google (primarias)</span><span className="v">{formatInt(Math.round(data.convGoogleTotal))}</span></div>
            <div><span className="l">De esas, compras reales</span><span className="v up">{formatInt(Math.round(data.purchaseConvTotal))}</span></div>
            <div><span className="l">% que es compra</span><span className={'v ' + (purchasePct < 0.3 ? 'dn' : '')}>{(purchasePct * 100).toFixed(1)}%</span></div>
            <div><span className="l">Valor de compra real</span><span className="v">{money(data.purchaseValueTotal)}</span></div>
          </div>
          <div className="av-catbars">
            {data.categories.slice(0, 6).map((c) => {
              const max = Math.max(...data.categories.map((x) => x.allConv), 1);
              const isPur = c.category === 'PURCHASE';
              return (
                <div className="av-catrow" key={c.category + c.name}>
                  <div className="av-catname" title={c.name}>{c.category}{c.name ? ` · ${c.name}` : ''}</div>
                  <div className="av-catbar"><i className={isPur ? 'pur' : ''} style={{ width: (c.allConv / max) * 100 + '%' }} /></div>
                  <div className="av-catval">{formatInt(Math.round(c.allConv))}</div>
                </div>
              );
            })}
          </div>
          <div className={'av-verdict' + (purchasePct < 0.3 ? ' warn' : '')}>
            <span className="vk">Lectura</span>
            Google reporta <b>{formatInt(Math.round(data.convGoogleTotal))}</b> “conversiones”, pero solo <b>{formatInt(Math.round(data.purchaseConvTotal))}</b> son <b>compras</b> ({(purchasePct * 100).toFixed(1)}%). El resto es view item / carrito / checkout. Por eso el <b>ROAS de compra</b> es el número honesto — lo usamos abajo, al margen de qué acción esté marcada como primaria.
          </div>
        </div>

        {/* ROAS vs ROAS */}
        <div className="av-sh"><h3>Rendimiento por gestor</h3><span className="hint">solo compras reales (PURCHASE) · campañas atribuidas por su creador</span></div>
        <div className="av-vs">
          {(['agencia', 'ia'] as Owner[]).map((o) => {
            const t = data.totals[o];
            return (
              <div className={'av-vscard ' + OWNER_META[o].cls} key={o}>
                <div className="av-vshead"><OwnerChip owner={o} /><span className="av-vscount">{t.campaigns} campañas</span></div>
                <div className="av-vsroas"><b>{t.purchaseRoas > 0 ? t.purchaseRoas.toFixed(1) + '×' : '—'}</b><span>ROAS de compra</span></div>
                <div className="av-vsgrid">
                  <div><span className="k">Inversión</span><span className="v">{money(t.cost)}</span></div>
                  <div><span className="k">Compras</span><span className="v">{formatInt(Math.round(t.purchaseConv))}</span></div>
                  <div><span className="k">Valor compra</span><span className="v">{money(t.purchaseValue)}</span></div>
                </div>
              </div>
            );
          })}
        </div>
        {data.totals.sin.campaigns > 0 && (
          <p className="av-note">↳ {data.totals.sin.campaigns} campaña(s) <b>sin atribuir</b> (creadas antes de la ventana de historial de ~30 días). Se irán etiquetando a medida que se acumulan cambios.</p>
        )}

        {/* CAMPAÑAS POR GESTOR */}
        <div className="av-sh"><h3>Campañas por gestor</h3><span className="hint">{data.campaigns.length} campañas · ROAS = compra real / inversión</span></div>
        <div className="card av-pad">
          <div className="av-cph">
            <div>Campaña</div><div>Gestor</div><div>Estado</div><div>Inversión</div><div>Conv. Google</div><div>Compras</div><div>ROAS compra</div>
          </div>
          {data.campaigns.map((c) => (
            <div className="av-crow" key={c.campaignId}>
              <div className="cn" title={c.name}>{c.name}</div>
              <div className="cm"><OwnerChip owner={c.owner} /></div>
              <div className="cm"><span className={'av-st ' + (c.status === 'PAUSED' ? 'pau' : c.status === 'ENABLED' ? 'ena' : '')}>{c.status || '—'}</span></div>
              <div className="nv">{money(c.cost)}</div>
              <div className="nv">{c.convGoogle > 0 ? formatInt(Math.round(c.convGoogle)) : '—'}</div>
              <div className="nv">{c.purchaseConv > 0 ? <b>{formatInt(Math.round(c.purchaseConv))}</b> : <span className="z">0</span>}</div>
              <div className="nv"><b style={{ color: c.purchaseRoas >= 3 ? 'var(--up)' : c.purchaseRoas > 0 ? 'var(--warn)' : 'var(--t3)' }}>{c.purchaseRoas > 0 ? c.purchaseRoas.toFixed(1) + '×' : '—'}</b></div>
            </div>
          ))}
        </div>

        {/* BITÁCORA */}
        <div className="av-sh"><h3>Bitácora de cambios</h3>
          <span className="hint">quién tocó qué, cuándo</span>
          {iaTouches > 0 && <span className="av-alert">⚠ la IA tocó {iaTouches} campaña(s) de la agencia</span>}
        </div>
        <div className="av-chips">
          {(['all', 'agencia', 'ia'] as const).map((f) => (
            <button key={f} className={'av-chip' + (filter === f ? ' on' : '')} onClick={() => setFilter(f)}>
              {f === 'all' ? 'Todos' : OWNER_META[f].label} <b>{f === 'all' ? data.changes.length : data.changes.filter((c) => c.owner === f).length}</b>
            </button>
          ))}
        </div>
        <div className="card av-pad">
          {changesF.length === 0 ? <div className="av-empty">Sin cambios en este filtro.</div> : changesF.map((c, i) => (
            <div className={'av-log' + (c.touchesAgency ? ' touch' : '') + (c.action === 'pausar' ? ' pause' : '')} key={i}>
              <div className="av-logdt">{fmtDate(c.dt)}</div>
              <div className="av-logown"><OwnerChip owner={c.owner} /></div>
              <div className="av-logtxt">
                <b>{ACTION_LABEL[c.action] || c.action}</b> {c.campaignName}
                {c.action === 'pausar' && c.oldStatus && <span className="av-status"> ({c.oldStatus} → {c.newStatus})</span>}
                {c.touchesAgency && <span className="av-tflag"> · tocó una campaña de la agencia</span>}
              </div>
            </div>
          ))}
        </div>

        <p className="av-foot">Firma: <b>GOOGLE_ADS_API = IA (Aura)</b> · humano/web = Agencia. El historial de Google guarda ~30 días; esta tabla <b>acumula</b>, así que la historia crece con cada corrida del ETL. Meta se integra en la siguiente fase (para las pausas de conjuntos).</p>
      </div>
    </div>
  );
}

const CSS = `
.av{margin-top:4px}
.av-hero{display:flex;align-items:center;gap:14px;margin-bottom:8px}
.av-hero .mk{width:46px;height:46px;border-radius:12px;background:var(--bg2);display:grid;place-items:center;font-size:24px;border:1px solid var(--b1)}
.av-hero h1{font-size:22px;font-weight:800;margin:0;letter-spacing:-.02em}
.av-hero .sub{font-size:12px;color:var(--t3);margin-top:2px}
.av-hero .soon{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;background:var(--bg3);color:var(--t3);padding:2px 7px;border-radius:6px;margin-left:6px}
.av-sh{display:flex;align-items:baseline;gap:11px;margin:26px 0 12px;flex-wrap:wrap}.av-sh h3{font-size:15px;font-weight:800;margin:0}.av-sh .hint{font-size:11px;color:var(--t3)}
.av-sh .av-alert{margin-left:auto;font-size:11px;color:var(--warn);font-weight:700;background:var(--warn-soft,rgba(234,179,8,.12));padding:3px 10px;border-radius:7px}
.av-pad{padding:16px 18px}
.card{background:var(--bg1);border:1px solid var(--b1);border-radius:16px}
/* firma */
.av-users{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.av-ucard{background:var(--bg1);border:1px solid var(--b1);border-radius:14px;padding:14px 16px}
.av-ucard.ia{border-color:color-mix(in srgb,var(--acc) 40%,var(--b1))}
.av-ucard.ag{border-color:color-mix(in srgb,#0ea5e9 40%,var(--b1))}
.av-uemail{font-size:13.5px;font-weight:700;margin-top:8px;overflow-wrap:anywhere}
.av-umeta{font-size:10.5px;color:var(--t3);font-family:var(--mono,monospace);margin-top:3px}
.av-own{display:inline-block;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;padding:3px 9px;border-radius:6px}
.av-own.ia{background:rgba(139,92,246,.14);color:var(--acc)}
.av-own.ag{background:rgba(14,165,233,.14);color:#0ea5e9}
.av-own.sin{background:var(--bg3);color:var(--t3)}
/* medición */
.av-measkpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}
.av-measkpis .l{display:block;font-size:10.5px;color:var(--t3);font-weight:600}
.av-measkpis .v{display:block;font-size:21px;font-weight:800;letter-spacing:-.02em;margin-top:3px;color:var(--t1)}
.av-measkpis .v.up{color:var(--up)}.av-measkpis .v.dn{color:var(--dn)}
.av-catrow{display:grid;grid-template-columns:1fr 90px 54px;gap:10px;align-items:center;padding:4px 0}
.av-catname{font-size:11.5px;color:var(--t2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.av-catbar{height:13px;background:var(--track);border-radius:5px;overflow:hidden}
.av-catbar i{display:block;height:100%;border-radius:5px;background:var(--t3)}.av-catbar i.pur{background:var(--up)}
.av-catval{text-align:right;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}
.av-verdict{margin-top:14px;background:var(--bg2);border:1px solid var(--b1);border-left:3px solid var(--acc);border-radius:12px;padding:12px 15px;font-size:12.5px;color:var(--t2);line-height:1.5}
.av-verdict.warn{border-left-color:var(--warn)}
.av-verdict .vk{font-family:var(--mono,monospace);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--acc);font-weight:700;margin-right:8px}
.av-verdict.warn .vk{color:var(--warn)}.av-verdict b{color:var(--t1)}
/* vs */
.av-vs{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.av-vscard{background:var(--bg1);border:1px solid var(--b1);border-radius:16px;padding:17px 18px}
.av-vscard.ia{border-color:color-mix(in srgb,var(--acc) 35%,var(--b1))}
.av-vscard.ag{border-color:color-mix(in srgb,#0ea5e9 35%,var(--b1))}
.av-vshead{display:flex;align-items:center;justify-content:space-between}
.av-vscount{font-size:11px;color:var(--t3);font-weight:600}
.av-vsroas{margin:12px 0;display:flex;align-items:baseline;gap:8px}
.av-vsroas b{font-size:30px;font-weight:800;letter-spacing:-.02em;color:var(--t1)}
.av-vsroas span{font-size:11px;color:var(--t3)}
.av-vsgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.av-vsgrid .k{display:block;font-size:10px;color:var(--t3);font-weight:600}
.av-vsgrid .v{display:block;font-size:14px;font-weight:800;margin-top:2px}
.av-note{font-size:11.5px;color:var(--t3);margin:10px 2px 0}.av-note b{color:var(--t2)}
/* tabla campañas */
.av-cph,.av-crow{display:grid;grid-template-columns:1fr 92px 78px 92px 86px 70px 92px;gap:8px;align-items:center}
.av-cph{font-size:9px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--t3);padding-bottom:8px;border-bottom:1px solid var(--b1)}
.av-cph>*:not(:first-child){text-align:right;justify-self:end}
.av-cph>*:nth-child(2),.av-cph>*:nth-child(3){text-align:center;justify-self:center}
.av-crow{padding:8px 0;border-top:1px solid var(--b1);font-size:12px}
.av-crow .cn{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.av-crow .cm{text-align:center}
.av-crow .nv{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.av-crow .nv .z{color:var(--t3);font-weight:400}
.av-st{font-size:9px;font-weight:800;text-transform:uppercase;padding:2px 6px;border-radius:5px;background:var(--bg3);color:var(--t3)}
.av-st.ena{background:color-mix(in srgb,var(--up) 15%,transparent);color:var(--up)}
.av-st.pau{background:color-mix(in srgb,var(--warn) 15%,transparent);color:var(--warn)}
/* chips + bitácora */
.av-chips{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.av-chip{font-size:12px;font-weight:600;padding:6px 12px;border-radius:999px;border:1px solid var(--b1);background:var(--bg1);color:var(--t2);cursor:pointer}
.av-chip.on{background:var(--acc);border-color:var(--acc);color:#fff}
.av-chip b{margin-left:4px}
.av-log{display:grid;grid-template-columns:96px 92px 1fr;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--b1);font-size:12.5px}
.av-log:first-child{border-top:none}
.av-log.touch{background:linear-gradient(90deg,color-mix(in srgb,var(--warn) 7%,transparent),transparent)}
.av-log.pause{background:linear-gradient(90deg,color-mix(in srgb,var(--dn) 6%,transparent),transparent)}
.av-logdt{font-size:11px;color:var(--t3);font-variant-numeric:tabular-nums}
.av-logown{text-align:left}
.av-logtxt{color:var(--t1);overflow-wrap:anywhere}.av-logtxt b{font-weight:700}
.av-status{color:var(--warn);font-weight:600}
.av-tflag{color:var(--warn);font-weight:600}
.av-empty{text-align:center;color:var(--t3);padding:18px;font-size:12px}
.av-foot{margin-top:16px;font-size:11px;color:var(--t3);line-height:1.6}.av-foot b{color:var(--t2)}
@media(max-width:820px){
  .av-users,.av-vs{grid-template-columns:1fr}
  .av-measkpis{grid-template-columns:repeat(2,1fr)}
  .av-cph,.av-crow{grid-template-columns:1fr 80px 64px 80px}
  .av-cph>*:nth-child(5),.av-crow>*:nth-child(5),.av-cph>*:nth-child(6),.av-crow>*:nth-child(6){display:none}
  .av-log{grid-template-columns:80px 1fr;grid-template-areas:'dt own' 'txt txt';row-gap:4px}
  .av-logdt{grid-area:dt}.av-logown{grid-area:own}.av-logtxt{grid-area:txt}
}
`;
