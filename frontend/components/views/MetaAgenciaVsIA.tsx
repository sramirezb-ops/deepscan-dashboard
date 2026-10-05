'use client';

import { useState } from 'react';
import { useClient } from '@/lib/useClient';
import { useMetaAgenciaVsIA, type Owner, type Objective, type Impact } from '@/lib/hooks/useMetaAgenciaVsIA';
import { formatCurrency, formatInt } from '@/lib/utils';

// ============================================================
// MetaAgenciaVsIA — panel de Meta (objetivo-aware) para la vista Agencia vs IA.
// Reutiliza las clases av-* del contenedor; agrega pz-/obj- propias.
// ============================================================

const OWNER_META: Record<Owner, { label: string; cls: string }> = {
  agencia: { label: 'Agencia', cls: 'ag' },
  ia: { label: 'IA · Aura', cls: 'ia' },
  meta: { label: 'Meta (auto)', cls: 'sin' },
};
const OBJ_META: Record<Objective, { label: string; cls: string }> = {
  ventas: { label: 'Ventas', cls: 'ven' },
  whatsapp: { label: 'WhatsApp', cls: 'wa' },
  otro: { label: 'Otro', cls: 'otro' },
};
const IMPACT_META: Record<Impact, { icon: string; cls: string; label: string }> = {
  pos: { icon: '✓', cls: 'pos', label: 'Bien cortado' },
  neg: { icon: '✕', cls: 'neg', label: 'Pausó ganador' },
  pend: { icon: '⏳', cls: 'pend', label: 'Dudoso' },
  neu: { icon: '•', cls: 'neu', label: 'Neutro' },
};
const ACTION_LABEL: Record<string, string> = {
  crear_campaign: 'creó campaña', crear_adgroup: 'creó anuncio', crear_conjunto: 'creó conjunto',
  pausar: 'pausó', activar: 'activó', eliminar: 'eliminó', cambio_presupuesto: 'cambió presupuesto', editar: 'editó', estado: 'cambió estado',
};
const fmtDate = (s: string) => {
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function MetaAgenciaVsIA() {
  const client = useClient();
  const cur = client.currency;
  const { data, loading, error } = useMetaAgenciaVsIA(client.id);
  const [filter, setFilter] = useState<Owner | 'all'>('all');

  if (loading && !data) return <div className="card av-pad" style={{ textAlign: 'center', color: 'var(--t3)' }}>Cargando Meta…</div>;
  if (error || !data || !data.hasData) return <div className="card av-pad" style={{ textAlign: 'center', color: 'var(--t3)' }}>Aún no hay historial de Meta. Corre el ETL para empezar a acumular.</div>;

  const money = (v: number) => formatCurrency(v, cur);
  const vmDot = data.verdict.level === 'restando' ? 'dn' : data.verdict.level === 'bien' ? 'up' : 'warn';
  const changesF = filter === 'all' ? data.changes : data.changes.filter((c) => c.owner === filter);

  return (
    <>
      <style>{`
        .obj{display:inline-block;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;padding:2px 7px;border-radius:5px}
        .obj.ven{background:color-mix(in srgb,var(--up) 15%,transparent);color:var(--up)}
        .obj.wa{background:rgba(37,211,102,.14);color:#1a9e52}
        .obj.otro{background:var(--bg3);color:var(--t3)}
        .av-own.meta,.av-own.sin{background:var(--bg3);color:var(--t3)}
        .pz-ph,.pz-row{display:grid;grid-template-columns:80px 1fr 86px 150px 150px;gap:10px;align-items:center}
        .pz-ph{font-size:9px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--t3);padding-bottom:8px;border-bottom:1px solid var(--b1)}
        .pz-row{padding:9px 0;border-top:1px solid var(--b1);font-size:12px}
        .pz-row.neg{background:linear-gradient(90deg,color-mix(in srgb,var(--dn) 7%,transparent),transparent)}
        .pz-lvl{font-size:9px;font-weight:800;text-transform:uppercase;color:var(--t3)}
        .pz-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .pz-metric{font-weight:700;font-variant-numeric:tabular-nums}
        .pz-metric small{display:block;font-weight:400;color:var(--t3);font-size:10px}
        .pz-verd{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700}
        .pz-vb{width:20px;height:20px;border-radius:6px;display:grid;place-items:center;font-size:11px;font-weight:800;flex:none}
        .pz-vb.neg{background:color-mix(in srgb,var(--dn) 16%,transparent);color:var(--dn)}
        .pz-vb.pos{background:color-mix(in srgb,var(--up) 16%,transparent);color:var(--up)}
        .pz-vb.pend{background:color-mix(in srgb,var(--warn) 16%,transparent);color:var(--warn)}
        .pz-vb.neu{background:var(--bg3);color:var(--t3)}
        .mz-counts{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
        .mz-count{background:var(--bg2);border:1px solid var(--b1);border-radius:12px;padding:12px 14px;text-align:center}
        .mz-count .v{font-size:22px;font-weight:800;color:var(--t1)}.mz-count .v.dn{color:var(--dn)}
        .mz-count .l{font-size:10.5px;color:var(--t3);font-weight:600;margin-top:2px}
        @media(max-width:860px){
          .pz-ph,.pz-row{grid-template-columns:1fr 120px}
          .pz-ph>*:nth-child(1),.pz-row>*:nth-child(1),.pz-ph>*:nth-child(3),.pz-row>*:nth-child(3),.pz-ph>*:nth-child(4),.pz-row>*:nth-child(4){display:none}
          .mz-counts{grid-template-columns:repeat(2,1fr)}
        }
      `}</style>

      {/* Veredicto Meta */}
      <div className={'av-verdicthero ' + data.verdict.level}>
        <div className="vh-left">
          <span className={'vh-dot ' + vmDot} />
          <div className="vh-kicker">Meta · {data.verdict.level === 'restando' ? 'la IA está restando' : 'la IA en observación'}</div>
          <div className="vh-headline">{data.verdict.headline}</div>
        </div>
        <ul className="vh-points">{data.verdict.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
      </div>

      {/* Resumen de la IA */}
      <div className="av-sh"><h3>Resumen de la IA en Meta</h3><span className="hint">lo que movió Aura</span></div>
      <div className="mz-counts">
        <div className="mz-count"><div className={'v ' + (data.counts.iaPaused > 0 ? 'dn' : '')}>{data.counts.iaPaused}</div><div className="l">conjuntos/campañas pausadas</div></div>
        <div className="mz-count"><div className="v">{data.counts.iaPausedAds}</div><div className="l">anuncios pausados</div></div>
        <div className="mz-count"><div className="v">{data.counts.iaCreated}</div><div className="l">creó</div></div>
        <div className="mz-count"><div className="v">{data.counts.iaEdited}</div><div className="l">editó / presupuesto</div></div>
      </div>
      {(data.riskValue > 0 || data.riskConv > 0) && (
        <div className="av-verdict warn" style={{ marginTop: 14 }}>
          <span className="vk">En riesgo</span>
          Lo que la IA pausó y estaba funcionando: {data.riskValue > 0 && <><b>{money(data.riskValue)}</b> en ventas</>}{data.riskValue > 0 && data.riskConv > 0 && ' + '}{data.riskConv > 0 && <><b>{formatInt(Math.round(data.riskConv))}</b> conversaciones de WhatsApp</>}. Conviene <b>revertir</b> estos conjuntos.
        </div>
      )}

      {/* Lo que la IA pausó (hero) */}
      <div className="av-sh"><h3>Lo que la IA pausó</h3><span className="hint">cada conjunto/campaña juzgado por su objetivo (ventas = ROAS · WhatsApp = conversaciones)</span></div>
      <div className="card av-pad">
        {data.iaPaused.length === 0 ? <div className="av-empty">La IA no pausó conjuntos ni campañas en esta ventana.</div> : (
          <>
            <div className="pz-ph"><div>Nivel</div><div>Nombre</div><div>Objetivo</div><div>Rendimiento</div><div>Veredicto</div></div>
            {data.iaPaused.map((p, i) => {
              const im = IMPACT_META[p.impact];
              return (
                <div className={'pz-row ' + im.cls} key={i}>
                  <div className="pz-lvl">{p.level}</div>
                  <div className="pz-name" title={p.name}>{p.name}</div>
                  <div><span className={'obj ' + OBJ_META[p.objective].cls}>{OBJ_META[p.objective].label}</span></div>
                  <div className="pz-metric">
                    {p.objective === 'ventas'
                      ? <>{p.roas > 0 ? p.roas.toFixed(1) + '×' : '—'}<small>{money(p.value)} · {p.purchases} compras</small></>
                      : p.objective === 'whatsapp'
                        ? <>{formatInt(Math.round(p.conv))} conv<small>${Math.round(p.cpc)}/conv · {money(p.spend)}</small></>
                        : <>—<small>{money(p.spend)} gasto</small></>}
                  </div>
                  <div className="pz-verd"><span className={'pz-vb ' + im.cls}>{im.icon}</span>{p.reason || im.label}</div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Bitácora Meta */}
      <div className="av-sh"><h3>Bitácora de Meta</h3><span className="hint">quién tocó qué · {data.from}+</span></div>
      <div className="av-chips">
        {(['all', 'agencia', 'ia', 'meta'] as const).map((f) => (
          <button key={f} className={'av-chip' + (filter === f ? ' on' : '')} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Todos' : OWNER_META[f].label} <b>{f === 'all' ? data.changes.length : data.changes.filter((c) => c.owner === f).length}</b>
          </button>
        ))}
      </div>
      <div className="card av-pad">
        {changesF.slice(0, 120).map((c, i) => (
          <div className={'av-log' + (c.action === 'pausar' && c.owner === 'ia' ? ' touch' : '')} key={i}>
            <div className="av-logdt">{fmtDate(c.dt)}</div>
            <div className="av-logown"><span className={'av-own ' + OWNER_META[c.owner].cls}>{OWNER_META[c.owner].label}</span></div>
            <div className="av-logtxt"><b>{ACTION_LABEL[c.action] || c.action}</b> <span className="pz-lvl" style={{ fontSize: 9 }}>{c.level}</span> {c.name}
              {c.action === 'pausar' && c.oldV && <span className="av-status"> ({c.oldV} → {c.newV})</span>}
            </div>
          </div>
        ))}
        {changesF.length > 120 && <p className="av-foot">Mostrando 120 de {changesF.length} cambios.</p>}
      </div>

      <div className="av-users">
        {data.actors.map((a) => (
          <div className={'av-ucard ' + OWNER_META[a.owner].cls} key={a.name}>
            <span className={'av-own ' + OWNER_META[a.owner].cls}>{OWNER_META[a.owner].label}</span>
            <div className="av-uemail">{a.name}</div>
            <div className="av-umeta">{a.count} cambios</div>
          </div>
        ))}
      </div>
    </>
  );
}
