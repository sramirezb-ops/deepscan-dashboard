'use client';

import { useState } from 'react';
import { useClient } from '@/lib/useClient';
import { useAgenciaVsIA, type Owner, type Impact } from '@/lib/hooks/useAgenciaVsIA';
import { MetaAgenciaVsIA } from '@/components/views/MetaAgenciaVsIA';
import { formatCurrency, formatInt } from '@/lib/utils';
import { Pager } from '@/components/ui/Pager';

// ============================================================
// AgenciaVsIA — storytelling: ¿la IA de Aura ayuda o resta? qué escalar/frenar.
// Firma por usuario + client_type (inmune a renombres). Google por ahora.
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
const IMPACT_META: Record<Impact, { icon: string; cls: string; label: string }> = {
  pos: { icon: '✓', cls: 'pos', label: 'Benefició' },
  neg: { icon: '✕', cls: 'neg', label: 'Perjudicó' },
  pend: { icon: '⏳', cls: 'pend', label: 'En observación' },
  neu: { icon: '•', cls: 'neu', label: 'Neutro' },
};
const VERDICT_META = {
  bien: { dot: 'up', emoji: '🟢', kicker: 'La IA está sumando' },
  observacion: { dot: 'warn', emoji: '🟡', kicker: 'La IA está en observación' },
  restando: { dot: 'dn', emoji: '🔴', kicker: 'La IA está restando' },
} as const;
const REC_META = {
  escalar: { cls: 'esc', icon: '▲', label: 'Escalar' },
  frenar: { cls: 'fre', icon: '⏸', label: 'Vigilar / frenar' },
  dejar: { cls: 'dej', icon: '✓', label: 'Mantener' },
  ojo: { cls: 'ojo', icon: '⚠', label: 'Revisar' },
} as const;
const TAG_META = {
  escalar: { cls: 'esc', label: 'Escalar' }, vigilar: { cls: 'vig', label: 'Vigilar' },
  cortar: { cls: 'cor', label: 'Cortar' }, nuevo: { cls: 'nue', label: 'Nueva' },
} as const;

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
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  if (loading && !data) return <div className="view on"><div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>Cargando Agencia vs IA…</div></div>;
  if (error || !data || !data.hasData) return <div className="view on"><div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>Aún no hay historial de cambios. Corre el ETL de Google para empezar a acumular.</div></div>;

  const money = (v: number) => formatCurrency(v, cur);
  const purchasePct = data.convGoogleTotal > 0 ? data.purchaseConvTotal / data.convGoogleTotal : 0;
  const changesF = filter === 'all' ? data.changes : data.changes.filter((c) => c.owner === filter);
  const totalPages = Math.max(1, Math.ceil(changesF.length / pageSize));
  const curPage = Math.min(page, totalPages);
  const pagedCh = changesF.slice((curPage - 1) * pageSize, curPage * pageSize);
  const vm = VERDICT_META[data.verdict.level];
  const ag = data.totals.agencia, ia = data.totals.ia;
  // escala para barras head-to-head
  const bar = (v: number, max: number) => (max > 0 ? Math.max((v / max) * 100, v > 0 ? 4 : 0) : 0);
  const maxCost = Math.max(ag.cost, ia.cost, 1);
  const maxPur = Math.max(ag.purchaseConv, ia.purchaseConv, 1);
  const maxVal = Math.max(ag.purchaseValue, ia.purchaseValue, 1);
  const maxRoas = Math.max(ag.purchaseRoas, ia.purchaseRoas, 0.01);

  return (
    <div className="view on">
      <div className="av">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />

        {/* HEADER */}
        <div className="av-hero">
          <div className="mk">⚖️</div>
          <div>
            <h1>Agencia vs IA (Aura)</h1>
            <div className="sub">Quién gestiona qué y si la IA ayuda o resta · {client.name} · <b>Google</b> + <b>Meta</b> · plataformas independientes</div>
          </div>
        </div>

        {/* ◆ GOOGLE */}
        <div className="av-platform"><span className="pf-ic g">G</span> Google Ads</div>

        {/* 0 · VEREDICTO */}
        <div className={'av-verdicthero ' + data.verdict.level}>
          <div className="vh-left">
            <span className={'vh-dot ' + vm.dot} />
            <div className="vh-kicker">{vm.kicker}</div>
            <div className="vh-headline">{data.verdict.headline}</div>
          </div>
          <ul className="vh-points">
            {data.verdict.points.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>

        {/* 1 · MARCADOR Agencia vs IA */}
        <div className="av-sh"><h3>El marcador</h3><span className="hint">rendimiento con plata real (solo compras · PURCHASE)</span></div>
        <div className="av-score">
          <div className="sc-side ag">
            <OwnerChip owner="agencia" />
            <div className="sc-roas"><b>{ag.purchaseRoas > 0 ? ag.purchaseRoas.toFixed(1) + '×' : '—'}</b><span>ROAS compra</span></div>
            <div className="sc-sub">{ag.campaigns} campañas</div>
          </div>
          <div className="sc-mid">
            {([
              ['ROAS compra', ag.purchaseRoas, ia.purchaseRoas, maxRoas, (v: number) => (v > 0 ? v.toFixed(1) + '×' : '0')],
              ['Inversión', ag.cost, ia.cost, maxCost, (v: number) => money(v)],
              ['Compras', ag.purchaseConv, ia.purchaseConv, maxPur, (v: number) => formatInt(Math.round(v))],
              ['Valor compra', ag.purchaseValue, ia.purchaseValue, maxVal, (v: number) => money(v)],
            ] as [string, number, number, number, (v: number) => string][]).map(([label, a, b, mx, fmt]) => (
              <div className="sc-metric" key={label}>
                <div className="sc-val l">{fmt(a)}</div>
                <div className="sc-bars">
                  <div className="sc-label">{label}</div>
                  <div className="sc-track"><i className="ag" style={{ width: bar(a, mx) + '%' }} /></div>
                  <div className="sc-track"><i className="ia" style={{ width: bar(b, mx) + '%' }} /></div>
                </div>
                <div className="sc-val r">{fmt(b)}</div>
              </div>
            ))}
          </div>
          <div className="sc-side ia">
            <OwnerChip owner="ia" />
            <div className="sc-roas"><b>{ia.purchaseRoas > 0 ? ia.purchaseRoas.toFixed(1) + '×' : '—'}</b><span>ROAS compra</span></div>
            <div className="sc-sub">{ia.campaigns} campañas</div>
          </div>
        </div>

        {/* 2 · RECOMENDACIONES */}
        {data.recommendations.length > 0 && (
          <>
            <div className="av-sh"><h3>Qué hacer</h3><span className="hint">escalar lo que vende · frenar lo que no · revisar lo que la IA tocó</span></div>
            <div className="av-recs">
              {data.recommendations.map((r, i) => {
                const m = REC_META[r.kind];
                return (
                  <div className={'av-rec ' + m.cls} key={i}>
                    <div className="rec-head"><span className="rec-ic">{m.icon}</span><span className="rec-label">{m.label}</span></div>
                    <div className="rec-title">{r.title}</div>
                    <div className="rec-detail">{r.detail}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* 3 · QUÉ CAMBIÓ LA IA (impacto) */}
        <div className="av-sh"><h3>Qué cambió la IA</h3><span className="hint">cada movimiento de Aura y su efecto</span></div>
        <div className="card av-pad">
          {data.iaChanges.length === 0 ? <div className="av-empty">La IA no ha hecho cambios en esta ventana.</div> : data.iaChanges.map((c, i) => {
            const im = IMPACT_META[c.impact];
            return (
              <div className={'av-imp ' + im.cls} key={i}>
                <span className={'av-impbadge ' + im.cls} title={im.label}>{im.icon}</span>
                <div className="av-imptxt">
                  <b>{ACTION_LABEL[c.action] || c.action}</b> {c.campaignName}
                  {c.action === 'pausar' && c.oldStatus && <span className="av-status"> ({c.oldStatus} → {c.newStatus})</span>}
                  <div className="av-impreason">{c.impactReason || im.label}{c.touchesAgency && ' · campaña de la agencia'}</div>
                </div>
                <span className="av-impdt">{fmtDate(c.dt)}</span>
              </div>
            );
          })}
        </div>

        {/* 4 · CAMPAÑAS POR GESTOR */}
        <div className="av-sh"><h3>Campañas por gestor</h3><span className="hint">{data.campaigns.length} campañas · ROAS = compra real / inversión</span></div>
        <div className="card av-pad">
          <div className="av-cph">
            <div>Campaña</div><div>Gestor</div><div>Inversión</div><div>Compras</div><div>ROAS compra</div><div>Lectura</div>
          </div>
          {data.campaigns.map((c) => (
            <div className="av-crow" key={c.campaignId}>
              <div className="cn" title={c.name}>{c.name}</div>
              <div className="cm"><OwnerChip owner={c.owner} /></div>
              <div className="nv">{money(c.cost)}</div>
              <div className="nv">{c.purchaseConv > 0 ? <b>{formatInt(Math.round(c.purchaseConv))}</b> : <span className="z">0</span>}</div>
              <div className="nv"><b style={{ color: c.purchaseRoas >= 3 ? 'var(--up)' : c.purchaseRoas > 0 ? 'var(--warn)' : 'var(--t3)' }}>{c.purchaseRoas > 0 ? c.purchaseRoas.toFixed(1) + '×' : '—'}</b></div>
              <div className="cm"><span className={'av-tag ' + TAG_META[c.tag].cls}>{TAG_META[c.tag].label}</span></div>
            </div>
          ))}
        </div>

        {/* 5 · SALUD DE LA MEDICIÓN */}
        <div className="av-sh"><h3>Salud de la medición</h3><span className="hint">por qué el ROAS de compra es el número honesto</span></div>
        <div className="card av-pad">
          <div className="av-measrow">
            <div className="av-measkpi"><span className="l">“Conversiones” Google</span><span className="v">{formatInt(Math.round(data.convGoogleTotal))}</span></div>
            <div className="av-measarrow">de esas →</div>
            <div className="av-measkpi"><span className="l">compras reales</span><span className="v up">{formatInt(Math.round(data.purchaseConvTotal))}</span></div>
            <div className="av-measkpi"><span className="l">% que es compra</span><span className={'v ' + (purchasePct < 0.3 ? 'dn' : '')}>{(purchasePct * 100).toFixed(1)}%</span></div>
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
          <p className="av-measnote">Google cuenta <b>view item</b> (vistas de producto) como conversión → infla conversiones y ROAS. Por eso medimos solo <b>PURCHASE</b>, al margen de qué marque la IA como primaria.</p>
        </div>

        {/* 6 · BITÁCORA */}
        <div className="av-sh"><h3>Bitácora completa</h3><span className="hint">auditoría · quién tocó qué, cuándo</span></div>
        <div className="av-chips">
          {(['all', 'agencia', 'ia'] as const).map((f) => (
            <button key={f} className={'av-chip' + (filter === f ? ' on' : '')} onClick={() => { setFilter(f); setPage(1); }}>
              {f === 'all' ? 'Todos' : OWNER_META[f].label} <b>{f === 'all' ? data.changes.length : data.changes.filter((c) => c.owner === f).length}</b>
            </button>
          ))}
        </div>
        <div className="card av-pad">
          {changesF.length === 0 ? <div className="av-empty">Sin cambios en este filtro.</div> : (<>
            {pagedCh.map((c, i) => (
              <div className={'av-log' + (c.touchesAgency ? ' touch' : '')} key={(curPage - 1) * pageSize + i}>
                <div className="av-logdt">{fmtDate(c.dt)}</div>
                <div className="av-logown"><OwnerChip owner={c.owner} /></div>
                <div className="av-logtxt">
                  <b>{ACTION_LABEL[c.action] || c.action}</b> {c.campaignName}
                  {c.action === 'pausar' && c.oldStatus && <span className="av-status"> ({c.oldStatus} → {c.newStatus})</span>}
                  {c.touchesAgency && <span className="av-tflag"> · tocó una campaña de la agencia</span>}
                </div>
              </div>
            ))}
            <Pager total={changesF.length} page={curPage} pageSize={pageSize}
              onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} label="cambios" />
          </>)}
        </div>

        <div className="av-users">
          {data.users.map((u) => (
            <div className={'av-ucard ' + OWNER_META[u.owner].cls} key={u.email + u.clientType}>
              <OwnerChip owner={u.owner} />
              <div className="av-uemail">{u.email}</div>
              <div className="av-umeta">{u.clientType} · {u.count} cambios</div>
            </div>
          ))}
        </div>
        {/* ◆ META */}
        <div className="av-platform meta"><span className="pf-ic m">M</span> Meta Ads</div>
        <MetaAgenciaVsIA />

        <p className="av-foot">Firmas: Google <b>GOOGLE_ADS_API = IA (Aura)</b> · Meta <b>actor “Christian Desarrollatech” = IA (Aura)</b>; humanos = Agencia. Ambas plataformas guardan ventana corta de historial; esta vista <b>acumula</b>, así que los veredictos se afinan con cada corrida.</p>
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
.av-hero .soon{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;background:var(--bg3);color:var(--t3);padding:2px 7px;border-radius:6px}
.av-platform{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:800;letter-spacing:-.01em;margin:34px 0 4px;padding-bottom:10px;border-bottom:2px solid var(--b1)}
.av-platform:first-of-type{margin-top:16px}
.av-platform .pf-ic{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;font-size:13px;font-weight:900;color:#fff}
.av-platform .pf-ic.g{background:#4285F4}.av-platform .pf-ic.m{background:#0866FF}
.av-sh{display:flex;align-items:baseline;gap:11px;margin:28px 0 12px;flex-wrap:wrap}.av-sh h3{font-size:15px;font-weight:800;margin:0}.av-sh .hint{font-size:11px;color:var(--t3)}
.av-pad{padding:16px 18px}
.card{background:var(--bg1);border:1px solid var(--b1);border-radius:16px}
.av-own{display:inline-block;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;padding:3px 9px;border-radius:6px}
.av-own.ia{background:rgba(139,92,246,.14);color:var(--acc)}
.av-own.ag{background:rgba(14,165,233,.14);color:#0ea5e9}
.av-own.sin{background:var(--bg3);color:var(--t3)}
/* 0 · veredicto hero */
.av-verdicthero{display:grid;grid-template-columns:1fr 1.1fr;gap:20px;background:var(--bg1);border:1px solid var(--b1);border-radius:18px;padding:22px 24px;margin-top:14px;position:relative;overflow:hidden}
.av-verdicthero::before{content:"";position:absolute;inset:0 auto 0 0;width:5px}
.av-verdicthero.bien::before{background:var(--up)}.av-verdicthero.observacion::before{background:var(--warn)}.av-verdicthero.restando::before{background:var(--dn)}
.vh-dot{width:13px;height:13px;border-radius:50%;display:inline-block}
.vh-dot.up{background:var(--up);box-shadow:0 0 0 4px color-mix(in srgb,var(--up) 20%,transparent)}
.vh-dot.warn{background:var(--warn);box-shadow:0 0 0 4px color-mix(in srgb,var(--warn) 20%,transparent)}
.vh-dot.dn{background:var(--dn);box-shadow:0 0 0 4px color-mix(in srgb,var(--dn) 20%,transparent)}
.vh-kicker{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--t3);margin:12px 0 6px}
.vh-headline{font-size:19px;font-weight:800;letter-spacing:-.01em;line-height:1.2}
.vh-points{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:9px;align-self:center}
.vh-points li{font-size:12.5px;color:var(--t2);line-height:1.45;padding-left:18px;position:relative}
.vh-points li::before{content:"›";position:absolute;left:3px;color:var(--t3);font-weight:800}
/* 1 · marcador */
.av-score{display:grid;grid-template-columns:150px 1fr 150px;gap:16px;align-items:stretch;background:var(--bg1);border:1px solid var(--b1);border-radius:16px;padding:18px}
.sc-side{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;border-radius:12px;padding:10px}
.sc-side.ag{background:rgba(14,165,233,.06)}.sc-side.ia{background:rgba(139,92,246,.06)}
.sc-roas b{font-size:32px;font-weight:800;letter-spacing:-.02em}
.sc-roas{display:flex;flex-direction:column}.sc-roas span{font-size:10px;color:var(--t3)}
.sc-sub{font-size:11px;color:var(--t3)}
.sc-mid{display:flex;flex-direction:column;gap:10px;justify-content:center}
.sc-metric{display:grid;grid-template-columns:78px 1fr 78px;gap:10px;align-items:center}
.sc-val{font-size:12.5px;font-weight:800;font-variant-numeric:tabular-nums}.sc-val.l{text-align:right;color:#0ea5e9}.sc-val.r{text-align:left;color:var(--acc)}
.sc-label{font-size:9.5px;color:var(--t3);text-align:center;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px}
.sc-track{height:7px;background:var(--track);border-radius:4px;overflow:hidden;margin-top:3px}
.sc-track i{display:block;height:100%;border-radius:4px}.sc-track i.ag{background:#0ea5e9}.sc-track i.ia{background:var(--acc)}
/* 2 · recomendaciones */
.av-recs{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
.av-rec{background:var(--bg1);border:1px solid var(--b1);border-radius:13px;padding:14px 15px;border-left:3px solid var(--t3)}
.av-rec.esc{border-left-color:var(--up)}.av-rec.fre{border-left-color:var(--warn)}.av-rec.dej{border-left-color:#0ea5e9}.av-rec.ojo{border-left-color:var(--dn)}
.rec-head{display:flex;align-items:center;gap:7px;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;margin-bottom:7px}
.av-rec.esc .rec-head{color:var(--up)}.av-rec.fre .rec-head{color:var(--warn)}.av-rec.dej .rec-head{color:#0ea5e9}.av-rec.ojo .rec-head{color:var(--dn)}
.rec-ic{font-size:12px}
.rec-title{font-size:13px;font-weight:700;line-height:1.25;margin-bottom:5px}
.rec-detail{font-size:11.5px;color:var(--t2);line-height:1.45}
/* 3 · qué cambió la IA (impacto) */
.av-imp{display:grid;grid-template-columns:28px 1fr 70px;gap:11px;align-items:center;padding:10px 0;border-top:1px solid var(--b1)}
.av-imp:first-child{border-top:none}
.av-impbadge{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;font-size:12px;font-weight:800}
.av-impbadge.pos{background:color-mix(in srgb,var(--up) 16%,transparent);color:var(--up)}
.av-impbadge.neg{background:color-mix(in srgb,var(--dn) 16%,transparent);color:var(--dn)}
.av-impbadge.pend{background:color-mix(in srgb,var(--warn) 16%,transparent);color:var(--warn)}
.av-impbadge.neu{background:var(--bg3);color:var(--t3)}
.av-imptxt{font-size:12.5px;color:var(--t1);overflow-wrap:anywhere}.av-imptxt b{font-weight:700}
.av-impreason{font-size:11px;color:var(--t3);margin-top:2px}
.av-imp.neg .av-impreason{color:var(--dn)}
.av-impdt{font-size:11px;color:var(--t3);text-align:right;font-variant-numeric:tabular-nums}
.av-status{color:var(--warn);font-weight:600}
/* 4 · tabla campañas */
.av-cph,.av-crow{display:grid;grid-template-columns:1fr 92px 96px 72px 96px 82px;gap:8px;align-items:center}
.av-cph{font-size:9px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--t3);padding-bottom:8px;border-bottom:1px solid var(--b1)}
.av-cph>*:not(:first-child){text-align:right;justify-self:end}
.av-cph>*:nth-child(2),.av-cph>*:last-child{text-align:center;justify-self:center}
.av-crow{padding:8px 0;border-top:1px solid var(--b1);font-size:12px}
.av-crow .cn{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.av-crow .cm{text-align:center}
.av-crow .nv{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.av-crow .nv .z{color:var(--t3);font-weight:400}
.av-tag{font-size:9px;font-weight:800;text-transform:uppercase;padding:2px 7px;border-radius:5px}
.av-tag.esc{background:color-mix(in srgb,var(--up) 15%,transparent);color:var(--up)}
.av-tag.vig{background:color-mix(in srgb,var(--warn) 15%,transparent);color:var(--warn)}
.av-tag.cor{background:color-mix(in srgb,var(--dn) 14%,transparent);color:var(--dn)}
.av-tag.nue{background:rgba(139,92,246,.14);color:var(--acc)}
/* 5 · medición */
.av-measrow{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:14px}
.av-measkpi .l{display:block;font-size:10.5px;color:var(--t3);font-weight:600}
.av-measkpi .v{display:block;font-size:22px;font-weight:800;letter-spacing:-.02em;margin-top:2px;color:var(--t1)}
.av-measkpi .v.up{color:var(--up)}.av-measkpi .v.dn{color:var(--dn)}
.av-measarrow{font-size:11px;color:var(--t3)}
.av-catrow{display:grid;grid-template-columns:1fr 90px 54px;gap:10px;align-items:center;padding:4px 0}
.av-catname{font-size:11.5px;color:var(--t2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.av-catbar{height:13px;background:var(--track);border-radius:5px;overflow:hidden}
.av-catbar i{display:block;height:100%;border-radius:5px;background:var(--t3)}.av-catbar i.pur{background:var(--up)}
.av-catval{text-align:right;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}
.av-measnote{font-size:11.5px;color:var(--t3);margin:12px 0 0;line-height:1.5;border-top:1px dashed var(--b1);padding-top:10px}.av-measnote b{color:var(--t2)}
/* 6 · bitácora */
.av-chips{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.av-chip{font-size:12px;font-weight:600;padding:6px 12px;border-radius:999px;border:1px solid var(--b1);background:var(--bg1);color:var(--t2);cursor:pointer}
.av-chip.on{background:var(--acc);border-color:var(--acc);color:#fff}.av-chip b{margin-left:4px}
.av-log{display:grid;grid-template-columns:96px 92px 1fr;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--b1);font-size:12.5px}
.av-log:first-child{border-top:none}
.av-log.touch{background:linear-gradient(90deg,color-mix(in srgb,var(--warn) 7%,transparent),transparent)}
.av-logdt{font-size:11px;color:var(--t3);font-variant-numeric:tabular-nums}
.av-logtxt{color:var(--t1);overflow-wrap:anywhere}.av-logtxt b{font-weight:700}
.av-tflag{color:var(--warn);font-weight:600}
.av-empty{text-align:center;color:var(--t3);padding:18px;font-size:12px}
.av-users{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}
.av-ucard{background:var(--bg1);border:1px solid var(--b1);border-radius:12px;padding:12px 14px}
.av-ucard.ia{border-color:color-mix(in srgb,var(--acc) 35%,var(--b1))}.av-ucard.ag{border-color:color-mix(in srgb,#0ea5e9 35%,var(--b1))}
.av-uemail{font-size:12.5px;font-weight:700;margin-top:7px;overflow-wrap:anywhere}
.av-umeta{font-size:10px;color:var(--t3);font-family:var(--mono,monospace);margin-top:2px}
.av-foot{margin-top:14px;font-size:11px;color:var(--t3);line-height:1.6}.av-foot b{color:var(--t2)}
@media(max-width:860px){
  .av-verdicthero{grid-template-columns:1fr;gap:12px}
  .av-score{grid-template-columns:1fr}
  .sc-side{flex-direction:row;justify-content:space-between}
  .av-users{grid-template-columns:1fr}
  .av-cph,.av-crow{grid-template-columns:1fr 84px 64px 84px}
  .av-cph>*:nth-child(3),.av-crow>*:nth-child(3),.av-cph>*:last-child,.av-crow>*:last-child{display:none}
  .av-measrow{gap:12px}
}
`;
