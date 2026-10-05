'use client';

import { useState } from 'react';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { useMetaAgenciaVsIA, type Owner, type Objective, type Impact, type RankRow, type RoasBucket } from '@/lib/hooks/useMetaAgenciaVsIA';
import { formatCurrency, formatInt } from '@/lib/utils';
import { Pager } from '@/components/ui/Pager';

const OWNER_META: Record<Owner, { label: string; cls: string }> = {
  agencia: { label: 'Agencia', cls: 'ag' }, ia: { label: 'IA · Aura', cls: 'ia' },
  meta: { label: 'Meta (auto)', cls: 'sin' }, sin: { label: 'Sin atribuir', cls: 'sin' },
};
const OBJ_META: Record<Objective, { label: string; cls: string }> = {
  ventas: { label: 'Ventas', cls: 'ven' }, whatsapp: { label: 'WhatsApp', cls: 'wa' }, otro: { label: 'Otro', cls: 'otro' },
};
const IMPACT_META: Record<Impact, { icon: string; cls: string }> = {
  pos: { icon: '✓', cls: 'pos' }, neg: { icon: '✕', cls: 'neg' }, pend: { icon: '⏳', cls: 'pend' }, neu: { icon: '•', cls: 'neu' },
};
const ACTION_LABEL: Record<string, string> = {
  crear_campaign: 'creó campaña', crear_adgroup: 'creó anuncio', pausar: 'pausó', activar: 'activó',
  eliminar: 'eliminó', cambio_presupuesto: 'cambió presupuesto', editar: 'editó', estado: 'cambió estado',
};
const fmtDate = (s: string) => { const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const Chip = ({ owner }: { owner: Owner }) => <span className={'av-own ' + OWNER_META[owner].cls}>{OWNER_META[owner].label}</span>;

export function MetaAgenciaVsIA() {
  const client = useClient();
  const cur = client.currency;
  const { range } = usePeriod();
  const { data, loading, error } = useMetaAgenciaVsIA(client.id, range);
  const [filter, setFilter] = useState<Owner | 'all'>('all');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  if (loading && !data) return <div className="card av-pad" style={{ textAlign: 'center', color: 'var(--t3)' }}>Cargando Meta…</div>;
  if (error || !data || !data.hasData) return <div className="card av-pad" style={{ textAlign: 'center', color: 'var(--t3)' }}>Aún no hay datos de Meta. Corre el ETL.</div>;
  // Guard de forma: durante un Fast Refresh el estado del hook puede quedar con una
  // forma vieja (sin kpis/ownerPerf) un instante. Evita el crash hasta el re-render limpio.
  if (!data.kpis || !data.ownerPerf || !data.roas) return <div className="card av-pad" style={{ textAlign: 'center', color: 'var(--t3)' }}>Cargando Meta…</div>;

  const money = (v: number) => formatCurrency(v, cur);
  const vmDot = data.verdict.level === 'restando' ? 'dn' : data.verdict.level === 'bien' ? 'up' : 'warn';
  const changesF = filter === 'all' ? data.changes : data.changes.filter((c) => c.owner === filter);
  const totalPages = Math.max(1, Math.ceil(changesF.length / pageSize));
  const curPage = Math.min(page, totalPages);
  const pagedCh = changesF.slice((curPage - 1) * pageSize, curPage * pageSize);
  const k = data.kpis;

  const Leader = ({ rows, kind }: { rows: RankRow[]; kind: 'ventas' | 'wa' }) => {
    if (rows.length === 0) return <div className="av-empty">Sin datos.</div>;
    const max = Math.max(...rows.map((r) => (kind === 'ventas' ? r.roas : r.conv)), 0.01);
    return (
      <div className="lb">
        {rows.map((r) => {
          const val = kind === 'ventas' ? r.roas : r.conv;
          return (
            <div className="lb-row" key={r.id}>
              <div className="lb-name" title={r.name}><Chip owner={r.owner} /><span className="lb-nm">{r.name}</span></div>
              <div className="lb-bar"><i className={kind} style={{ width: Math.max((val / max) * 100, 3) + '%' }} /></div>
              <div className="lb-val">
                {kind === 'ventas' ? <><b>{r.roas.toFixed(1)}×</b><small>{money(r.value)}</small></> : <><b>{formatInt(Math.round(r.conv))}</b><small>${Math.round(r.cpc)}/conv</small></>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const op = data.ownerPerf;

  const rz = data.roas;
  const maxRoas = Math.max(rz.total.roas, ...rz.porEstado.map((b) => b.roas), ...rz.porGestor.map((b) => b.roas), 0.01);
  const roasColor = (b: RoasBucket) => (b.key === 'inactivo' && b.roas >= 2 ? 'var(--dn)' : b.roas >= 2 ? 'var(--up)' : 'var(--t1)');
  const RzRow = ({ b, hl }: { b: RoasBucket; hl?: boolean }) => {
    const col = roasColor(b);
    return (
      <div className={'rz-row' + (hl ? ' hl' : '')}>
        <div className="rz-lab">{b.label}<small>{b.count} conjunto{b.count === 1 ? '' : 's'}</small></div>
        <div className="rz-bar"><i style={{ width: Math.max((b.roas / maxRoas) * 100, 2) + '%', background: col }} /></div>
        <div className="rz-roas" style={{ color: col }}>{b.roas > 0 ? b.roas.toFixed(1) + '×' : '—'}</div>
        <div className="rz-fig">{money(b.spend)}<small>inversión</small></div>
        <div className="rz-fig">{money(b.value)}<small>revenue</small></div>
      </div>
    );
  };

  return (
    <>
      <style>{`
        .obj{display:inline-block;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;padding:2px 7px;border-radius:5px}
        .obj.ven{background:color-mix(in srgb,var(--up) 15%,transparent);color:var(--up)}
        .obj.wa{background:rgba(37,211,102,.14);color:#1a9e52}.obj.otro{background:var(--bg3);color:var(--t3)}
        .av-own.meta,.av-own.sin{background:var(--bg3);color:var(--t3)}
        .mk-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:11px}
        .mk-kpi{background:var(--bg1);border:1px solid var(--b1);border-radius:13px;padding:13px 14px}
        .mk-kpi .l{font-size:10px;color:var(--t3);font-weight:600}
        .mk-kpi .v{font-size:21px;font-weight:800;letter-spacing:-.02em;margin-top:3px;color:var(--t1)}
        .mk-kpi .v.up{color:var(--up)}
        .mz-vs{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .mz-vscard{background:var(--bg1);border:1px solid var(--b1);border-radius:16px;padding:16px 18px}
        .mz-vscard.ia{border-color:color-mix(in srgb,var(--acc) 35%,var(--b1))}.mz-vscard.ag{border-color:color-mix(in srgb,#0ea5e9 35%,var(--b1))}
        .mz-vshead{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
        .mz-vscount{font-size:11px;color:var(--t3)}
        .mz-vsmetrics{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .mz-vsm .k{font-size:10px;color:var(--t3);font-weight:600}
        .mz-vsm .v{font-size:20px;font-weight:800;letter-spacing:-.02em;margin-top:1px}
        .mz-vsm .s{font-size:10px;color:var(--t3)}
        .lb-wrap{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .lb-card{background:var(--bg1);border:1px solid var(--b1);border-radius:14px;padding:14px 16px}
        .lb-card h4{margin:0 0 10px;font-size:13px;font-weight:800;display:flex;align-items:center;gap:7px}
        .lb-row{display:grid;grid-template-columns:1fr 70px 78px;gap:9px;align-items:center;padding:5px 0}
        .lb-name{display:flex;align-items:center;gap:7px;min-width:0}
        .lb-nm{font-size:11.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .lb-bar{height:9px;background:var(--track);border-radius:5px;overflow:hidden}
        .lb-bar i{display:block;height:100%;border-radius:5px}.lb-bar i.ventas{background:var(--up)}.lb-bar i.wa{background:#1a9e52}
        .lb-val{text-align:right;line-height:1.1}.lb-val b{font-size:12.5px;font-weight:800;font-variant-numeric:tabular-nums}.lb-val small{display:block;font-size:9px;color:var(--t3)}
        .pz-ph,.pz-row{display:grid;grid-template-columns:80px 1fr 86px 150px 150px;gap:10px;align-items:center}
        .pz-ph{font-size:9px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--t3);padding-bottom:8px;border-bottom:1px solid var(--b1)}
        .pz-row{padding:9px 0;border-top:1px solid var(--b1);font-size:12px}
        .pz-row.neg{background:linear-gradient(90deg,color-mix(in srgb,var(--dn) 7%,transparent),transparent)}
        .pz-lvl{font-size:9px;font-weight:800;text-transform:uppercase;color:var(--t3)}
        .pz-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .pz-metric{font-weight:700;font-variant-numeric:tabular-nums}.pz-metric small{display:block;font-weight:400;color:var(--t3);font-size:10px}
        .pz-verd{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700}
        .pz-vb{width:20px;height:20px;border-radius:6px;display:grid;place-items:center;font-size:11px;font-weight:800;flex:none}
        .pz-vb.neg{background:color-mix(in srgb,var(--dn) 16%,transparent);color:var(--dn)}.pz-vb.pos{background:color-mix(in srgb,var(--up) 16%,transparent);color:var(--up)}
        .pz-vb.pend{background:color-mix(in srgb,var(--warn) 16%,transparent);color:var(--warn)}.pz-vb.neu{background:var(--bg3);color:var(--t3)}
        .rz-grp{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--t3);margin:12px 0 2px;padding-top:12px;border-top:1px solid var(--b1)}
        .rz-grp:first-child{border-top:none;padding-top:0;margin-top:0}
        .rz-grp small{font-weight:600;text-transform:none;letter-spacing:0;opacity:.75;margin-left:6px}
        .rz-row{display:grid;grid-template-columns:168px 1fr 58px 118px 118px;gap:12px;align-items:center;padding:8px 0}
        .rz-row.hl{background:color-mix(in srgb,var(--acc) 8%,transparent);border-radius:10px;padding:11px 12px;margin:2px -12px 4px}
        .rz-lab{font-size:12px;font-weight:700;color:var(--t1)}.rz-lab small{display:block;font-size:9px;color:var(--t3);font-weight:500}
        .rz-bar{height:10px;background:var(--track);border-radius:5px;overflow:hidden}
        .rz-bar i{display:block;height:100%;border-radius:5px}
        .rz-roas{font-size:16px;font-weight:800;text-align:right;font-variant-numeric:tabular-nums}
        .rz-fig{text-align:right;font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--t1)}
        .rz-fig small{display:block;font-size:9px;color:var(--t3);font-weight:500}
        @media(max-width:860px){.rz-row{grid-template-columns:1fr 50px 96px}.rz-bar,.rz-row>.rz-fig:nth-child(5){display:none}}
        .mz-counts{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
        .mz-count{background:var(--bg2);border:1px solid var(--b1);border-radius:12px;padding:12px 14px;text-align:center}
        .mz-count .v{font-size:22px;font-weight:800;color:var(--t1)}.mz-count .v.dn{color:var(--dn)}.mz-count .l{font-size:10.5px;color:var(--t3);font-weight:600;margin-top:2px}
        @media(max-width:860px){
          .mk-kpis{grid-template-columns:repeat(3,1fr)}.mz-vs,.lb-wrap{grid-template-columns:1fr}
          .pz-ph,.pz-row{grid-template-columns:1fr 120px}
          .pz-ph>*:nth-child(1),.pz-row>*:nth-child(1),.pz-ph>*:nth-child(3),.pz-row>*:nth-child(3),.pz-ph>*:nth-child(4),.pz-row>*:nth-child(4){display:none}
          .mz-counts{grid-template-columns:repeat(2,1fr)}
        }
      `}</style>

      {/* KPIs · resultados */}
      <div className="av-sh"><h3>Resultados</h3><span className="hint">Meta · {data.from} → {range.to} · ventas y WhatsApp</span></div>
      <div className="mk-kpis">
        <div className="mk-kpi"><div className="l">Inversión</div><div className="v">{money(k.spend)}</div></div>
        <div className="mk-kpi"><div className="l">Compras</div><div className="v">{formatInt(Math.round(k.purchases))}</div></div>
        <div className="mk-kpi"><div className="l">Revenue</div><div className="v">{money(k.value)}</div></div>
        <div className="mk-kpi"><div className="l">ROAS ventas</div><div className="v up">{k.roas > 0 ? k.roas.toFixed(1) + '×' : '—'}</div></div>
        <div className="mk-kpi"><div className="l">Conversaciones</div><div className="v">{formatInt(Math.round(k.conv))}</div></div>
        <div className="mk-kpi"><div className="l">Costo / conv</div><div className="v">{k.cpc > 0 ? money(k.cpc) : '—'}</div></div>
      </div>

      {/* Agencia vs IA · rendimiento */}
      <div className="av-sh"><h3>Rendimiento: Agencia vs IA</h3><span className="hint">campañas atribuidas por su creador{data.sinCount > 0 ? ` · ${data.sinCount} sin atribuir` : ''}</span></div>
      <div className="mz-vs">
        {(['agencia', 'ia'] as const).map((o) => (
          <div className={'mz-vscard ' + OWNER_META[o].cls} key={o}>
            <div className="mz-vshead"><Chip owner={o} /><span className="mz-vscount">{op[o].campaigns} campañas · {money(op[o].ventasSpend + op[o].waSpend)} inv.</span></div>
            <div className="mz-vsmetrics">
              <div className="mz-vsm"><div className="k">ROAS ventas</div><div className="v" style={{ color: op[o].roas >= 2 ? 'var(--up)' : 'var(--t1)' }}>{op[o].roas > 0 ? op[o].roas.toFixed(1) + '×' : '—'}</div><div className="s">{money(op[o].value)} · {Math.round(op[o].purchases)} compras</div></div>
              <div className="mz-vsm"><div className="k">WhatsApp</div><div className="v">{op[o].conv > 0 ? formatInt(Math.round(op[o].conv)) : '—'}</div><div className="s">{op[o].conv > 0 ? `$${Math.round(op[o].cpc)}/conv` : 'sin conversaciones'}</div></div>
            </div>
          </div>
        ))}
      </div>

      {/* Radiografía de ROAS */}
      <div className="av-sh"><h3>Radiografía de ROAS</h3><span className="hint">conjuntos de ventas · ROAS = revenue ÷ inversión</span></div>
      <div className="card av-pad">
        <RzRow b={rz.total} hl />
        <div className="rz-grp">Por estado<small>estado actual según la bitácora</small></div>
        {rz.porEstado.map((b) => <RzRow key={b.key} b={b} />)}
        <div className="rz-grp">Por gestor<small>quién creó el conjunto</small></div>
        {rz.porGestor.map((b) => <RzRow key={b.key} b={b} />)}
        {rz.porEstado[1].roas >= 2 && rz.porEstado[1].count > 0 && (
          <div className="av-verdict warn" style={{ marginTop: 12 }}>
            <span className="vk">Ojo</span>{' '}
            Los conjuntos <b>pausados</b> traían ROAS <b>{rz.porEstado[1].roas.toFixed(1)}×</b> ({money(rz.porEstado[1].value)} en revenue). Revisar si conviene reactivarlos.
          </div>
        )}
      </div>

      {/* Mejores campañas */}
      <div className="av-sh"><h3>Mejores campañas</h3><span className="hint">ventas por ROAS · WhatsApp por conversaciones</span></div>
      <div className="lb-wrap">
        <div className="lb-card"><h4><span className="obj ven">Ventas</span> por ROAS de compra</h4><Leader rows={data.topCampaignsVentas} kind="ventas" /></div>
        <div className="lb-card"><h4><span className="obj wa">WhatsApp</span> por conversaciones</h4><Leader rows={data.topCampaignsWa} kind="wa" /></div>
      </div>

      {/* Mejores conjuntos */}
      <div className="av-sh"><h3>Mejores conjuntos</h3><span className="hint">los ad sets que mejor rinden por objetivo</span></div>
      <div className="lb-wrap">
        <div className="lb-card"><h4><span className="obj ven">Ventas</span> por ROAS de compra</h4><Leader rows={data.topAdsetsVentas} kind="ventas" /></div>
        <div className="lb-card"><h4><span className="obj wa">WhatsApp</span> por conversaciones</h4><Leader rows={data.topAdsetsWa} kind="wa" /></div>
      </div>

      {/* Veredicto IA */}
      <div className={'av-verdicthero ' + data.verdict.level} style={{ marginTop: 26 }}>
        <div className="vh-left">
          <span className={'vh-dot ' + vmDot} />
          <div className="vh-kicker">La IA en Meta</div>
          <div className="vh-headline">{data.verdict.headline}</div>
        </div>
        <ul className="vh-points">{data.verdict.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
      </div>

      {/* Resumen IA */}
      <div className="av-sh"><h3>Lo que movió la IA</h3><span className="hint">actividad de Aura</span></div>
      <div className="mz-counts">
        <div className="mz-count"><div className={'v ' + (data.counts.iaPaused > 0 ? 'dn' : '')}>{data.counts.iaPaused}</div><div className="l">conjuntos/campañas pausadas</div></div>
        <div className="mz-count"><div className="v">{data.counts.iaPausedAds}</div><div className="l">anuncios pausados</div></div>
        <div className="mz-count"><div className="v">{data.counts.iaCreated}</div><div className="l">creó</div></div>
        <div className="mz-count"><div className="v">{data.counts.iaEdited}</div><div className="l">editó / presupuesto</div></div>
      </div>
      {(data.riskValue > 0 || data.riskConv > 0) && (
        <div className="av-verdict warn" style={{ marginTop: 14 }}>
          <span className="vk">En riesgo</span>{' '}
          Lo que pausó y estaba funcionando: {data.riskValue > 0 && <><b>{money(data.riskValue)}</b> en ventas</>}{data.riskValue > 0 && data.riskConv > 0 && ' + '}{data.riskConv > 0 && <><b>{formatInt(Math.round(data.riskConv))}</b> conversaciones</>}. Conviene <b>revertir</b>.
        </div>
      )}

      {/* Lo que la IA pausó */}
      <div className="av-sh"><h3>Lo que la IA pausó</h3><span className="hint">cada uno juzgado por su objetivo</span></div>
      <div className="card av-pad">
        {data.iaPaused.length === 0 ? <div className="av-empty">La IA no pausó conjuntos ni campañas.</div> : (
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
                    {p.objective === 'ventas' ? <>{p.roas > 0 ? p.roas.toFixed(1) + '×' : '—'}<small>{money(p.value)} · {p.purchases} compras</small></>
                      : p.objective === 'whatsapp' ? <>{formatInt(Math.round(p.conv))} conv<small>${Math.round(p.cpc)}/conv · {money(p.spend)}</small></>
                        : <>—<small>{money(p.spend)} gasto</small></>}
                  </div>
                  <div className="pz-verd"><span className={'pz-vb ' + im.cls}>{im.icon}</span>{p.reason}</div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Bitácora */}
      <div className="av-sh"><h3>Bitácora de Meta</h3><span className="hint">quién tocó qué</span></div>
      <div className="av-chips">
        {(['all', 'agencia', 'ia', 'meta'] as const).map((f) => (
          <button key={f} className={'av-chip' + (filter === f ? ' on' : '')} onClick={() => { setFilter(f); setPage(1); }}>
            {f === 'all' ? 'Todos' : OWNER_META[f].label} <b>{f === 'all' ? data.changes.length : data.changes.filter((c) => c.owner === f).length}</b>
          </button>
        ))}
      </div>
      <div className="card av-pad">
        {pagedCh.map((c, i) => (
          <div className={'av-log' + (c.action === 'pausar' && c.owner === 'ia' ? ' touch' : '')} key={(curPage - 1) * pageSize + i}>
            <div className="av-logdt">{fmtDate(c.dt)}</div>
            <div className="av-logown"><Chip owner={c.owner} /></div>
            <div className="av-logtxt"><b>{ACTION_LABEL[c.action] || c.action}</b> <span className="pz-lvl" style={{ fontSize: 9 }}>{c.level}</span> {c.name}
              {c.action === 'pausar' && c.oldV && <span className="av-status"> ({c.oldV} → {c.newV})</span>}</div>
          </div>
        ))}
        <Pager total={changesF.length} page={curPage} pageSize={pageSize}
          onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} label="cambios" />
      </div>
    </>
  );
}
