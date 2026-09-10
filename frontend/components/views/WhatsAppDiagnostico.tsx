'use client';

import { useMemo, useState } from 'react';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useMetaWhatsApp, type WaHierNode, type WaMetric } from '@/lib/hooks/useMetaWhatsApp';
import { formatCurrency, formatInt } from '@/lib/utils';

// Meta de costo por conversación que gobierna el semáforo. Lograda en agosto,
// así que es creíble, no aspiracional. TODO: leerla de la config del cliente.
const GOAL = 6;

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const moLabel = (m: string) => {
  const [, mm] = m.split('-');
  return MONTHS_ES[Number(mm) - 1] || m;
};

// En costo, MENOR es mejor: verde ≤ meta, ámbar hasta 1.5×, rojo arriba.
function semCls(cpc: number): 'wa-good' | 'wa-warn' | 'wa-bad' {
  if (cpc <= 0) return 'wa-warn';
  return cpc <= GOAL ? 'wa-good' : cpc <= GOAL * 1.5 ? 'wa-warn' : 'wa-bad';
}
const cpcOf = (m: WaMetric) => (m.conversations > 0 ? m.spend / m.conversations : 0);
const money = (v: number, cur: string) => formatCurrency(v, cur);
const cpcFmt = (v: number) => (v > 0 ? '$' + v.toFixed(1) : '—');

type SortKey = 'spend' | 'cpc' | 'conversations' | 'pct';
const COLS: { k: SortKey; l: string }[] = [
  { k: 'spend', l: 'Gasto' },
  { k: 'cpc', l: 'Costo/conv' },
  { k: 'conversations', l: 'Conv.' },
  { k: 'pct', l: '% gasto' },
];

export function WhatsAppDiagnostico() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useMetaWhatsApp(client.id, range, previous);
  const cur = client.currency;
  const rangeLabel = formatRangeLabel(range);

  const [exp, setExp] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const withIds = useMemo(() => {
    const hier = data?.hierarchy ?? [];
    return hier.map((c, ci) => ({ ...c, _id: 'c' + ci }));
  }, [data]);

  if (loading && !data) {
    return <div className="view on"><div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--t3)' }}>Cargando WhatsApp de {client.name}…</div></div>;
  }
  if (error) {
    return <div className="view on"><div className="card" style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,.3)' }}><div style={{ color: '#ef4444', marginBottom: 8 }}>Error cargando datos</div><div style={{ fontSize: 12, color: 'var(--t3)' }}>{error}</div></div></div>;
  }
  if (!data || !data.messagingExistsEver) {
    return <div className="view on"><div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>Sin campañas de mensajería para el período.</div></div>;
  }

  const t = data.totals;
  const totalSpend = t.spend || 1;
  const pctOf = (v: number) => Math.round((v / totalSpend) * 100);
  const sem = semCls(t.cpc);
  const overGoal = t.cpc > GOAL ? Math.round(((t.cpc - GOAL) / GOAL) * 100) : 0;

  // Reasignación: si todo corriera al costo de la mejor campaña, ¿cuántas conv?
  const camps = data.hierarchy;
  const withConv = camps.filter((c) => c.m.conversations > 0);
  // Para benchmarks (reasignación) solo campañas con gasto relevante: una
  // micro-campaña de $8 con 2 conversaciones no es un "costo eficiente" escalable.
  const qualified = withConv.filter((c) => c.m.spend >= totalSpend * 0.03);
  const bestCamp = qualified.slice().sort((a, b) => cpcOf(a.m) - cpcOf(b.m))[0];
  const worstCamp = qualified.slice().sort((a, b) => cpcOf(b.m) - cpcOf(a.m))[0];
  const bestCpc = bestCamp ? cpcOf(bestCamp.m) : 0;
  const potentialConv = bestCpc > 0 ? Math.round(t.spend / bestCpc) : t.conversations;
  const upliftPct = t.conversations > 0 ? Math.round(((potentialConv - t.conversations) / t.conversations) * 100) : 0;

  // Peor conjunto (con gasto relevante) y mejor conjunto (motor).
  const allSets = camps.flatMap((c) => c.kids || []).filter((s) => s.m.spend >= 100 && s.m.conversations > 0);
  const worstSet = allSets.slice().sort((a, b) => cpcOf(b.m) - cpcOf(a.m))[0];
  const bestSet = allSets.slice().sort((a, b) => cpcOf(a.m) - cpcOf(b.m))[0];

  // Mejor mes histórico (menor costo/conv, con volumen).
  const monWithVol = data.monthly.filter((m) => m.conversations >= 50);
  const bestMonth = monWithVol.slice().sort((a, b) => a.cpc - b.cpc)[0];
  const maxCpc = Math.max(...data.monthly.map((m) => m.cpc), 1);

  const aura = data.aura;

  const sortNodes = <T extends { m: WaMetric }>(arr: T[]) => {
    const val = (m: WaMetric) => sortKey === 'cpc' ? cpcOf(m) : sortKey === 'pct' ? m.spend : (m as any)[sortKey] || 0;
    return arr.slice().sort((a, b) => sortDir * (val(a.m) - val(b.m)));
  };
  const onSort = (k: SortKey) => { if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1)); else { setSortKey(k); setSortDir(-1); } };
  const toggle = (id: string) => setExp((e) => ({ ...e, [id]: !e[id] }));

  type Row = { lvl: 1 | 2; id: string; node: WaHierNode };
  const rows: Row[] = [];
  sortNodes(withIds).forEach((c: any) => {
    rows.push({ lvl: 1, id: c._id, node: c });
    if (exp[c._id]) sortNodes(c.kids ?? []).forEach((s: any, si: number) => {
      rows.push({ lvl: 2, id: c._id + 's' + si, node: s });
    });
  });

  const cell = (m: WaMetric, k: SortKey) => {
    if (k === 'spend') return money(m.spend, cur);
    if (k === 'conversations') return formatInt(Math.round(m.conversations));
    if (k === 'pct') return pctOf(m.spend) + '%';
    const c = cpcOf(m);
    return <span className={'wa-pill ' + (semCls(c) === 'wa-good' ? 'wa-pg' : semCls(c) === 'wa-warn' ? 'wa-pw' : 'wa-pb')}>{cpcFmt(c)}</span>;
  };

  return (
    <div className="view on wa">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* HERO */}
      <div className={'wa-hero ' + sem}>
        <div>
          <div className="wa-eyebrow">Meta Ads · WhatsApp · {rangeLabel}</div>
          <div className="wa-thesis">
            Cada conversación cuesta <span className={'hl ' + sem}>{cpcFmt(t.cpc)}</span>. La meta es <span className="hl-goal">${GOAL.toFixed(2)}</span>.
          </div>
          <div className="wa-sub">
            Generaste <b>{formatInt(Math.round(t.conversations))} conversaciones</b> con <b>{money(t.spend, cur)}</b> de inversión.
            {bestMonth && t.cpc > bestMonth.cpc * 1.2 && <> El mejor mes fue <b>{moLabel(bestMonth.month)}</b> a <b>{cpcFmt(bestMonth.cpc)}</b> — hoy está más caro. La palanca no es gastar más, es <b>a dónde va el presupuesto</b>.</>}
          </div>
        </div>
        <div className="wa-north">
          <div className="k">Costo por conversación</div>
          <div className={'v ' + sem}>{cpcFmt(t.cpc)}</div>
          {overGoal > 0
            ? <div className="badge bad">▲ {overGoal}% sobre la meta</div>
            : <div className="badge good">✓ en meta</div>}
          <div className="row">
            <div><div className="l">Conversaciones</div><div className="rv">{formatInt(Math.round(t.conversations))}</div></div>
            <div><div className="l">Inversión</div><div className="rv">{money(t.spend, cur)}</div></div>
          </div>
        </div>
        <div className="wa-medi">
          <span className="tag">MEDICIÓN</span>
          <p><b>No hay atribución de venta a WhatsApp en la plataforma.</b> Meta reporta <b>conversaciones</b>, no compras. La venta cerrada por chat vive en AURA como canal <b>“manual”</b> — la conectamos abajo como contexto, no como atribución 1:1.</p>
        </div>
      </div>

      {/* BRIDGE a AURA */}
      {aura.hasAura && aura.manualCobrado > 0 && (
        <>
          <div className="wa-sh"><h2>El puente a la venta real</h2><span className="hint">de la conversación al cierre · AURA, canal “manual”</span></div>
          <div className="wa-bridge">
            <div className="wa-flow">
              <div className="wa-fcard wa">
                <div className="fk"><span className="dot" style={{ background: '#25d366' }} />Motor · Meta WhatsApp Ads</div>
                <div className="fv">{formatInt(Math.round(t.conversations))}</div>
                <div className="fl">conversaciones iniciadas · <b>{money(t.spend, cur)}</b> invertidos</div>
                <div className="frow">
                  <div className="c"><div className="nv">{cpcFmt(t.cpc)}</div><div className="tl">Costo / conv</div></div>
                  <div className="c"><div className="nv">{data.campaignCount}</div><div className="tl">Campañas</div></div>
                </div>
              </div>
              <div className="wa-arrow">→</div>
              <div className="wa-fcard au">
                <div className="fk"><span className="dot" style={{ background: 'var(--acc)' }} />Cierre · Ventas “manual” (AURA)</div>
                <div className="fv up">{money(aura.manualCobrado, cur)}</div>
                <div className="fl"><b>{aura.manualTickets} tickets</b> cobrados · cerrados por el equipo vía chat/DM</div>
                <div className="frow">
                  <div className="c"><div className="nv">{Math.round(aura.manualPct * 100)}%</div><div className="tl">de la venta nueva</div></div>
                  <div className="c"><div className="nv">{money(aura.manualTicket, cur)}</div><div className="tl">Ticket prom.</div></div>
                </div>
              </div>
            </div>
            <div className="wa-caveat">
              <span className="q">⚠️</span>
              <p><b>Contexto, no atribución.</b> El canal “manual” de AURA es donde el equipo registra los cierres por conversación, pero incluye también DM orgánico, referidos y recompra. La plataforma <b>no puede ligar una venta específica a una conversación específica</b>. Lo mostramos para dimensionar el rol del canal — el {Math.round(aura.manualPct * 100)}% de la venta nueva del período ({money(aura.totalMedicion, cur)}) se cierra por esta vía.</p>
            </div>
          </div>
        </>
      )}

      {/* TENDENCIA */}
      {data.monthly.length > 1 && (
        <>
          <div className="wa-sh"><h2>Tendencia del costo por conversación</h2><span className="hint">meta ${GOAL} · menor es mejor</span></div>
          <div className="card">
            <div className="wa-trend">
              {data.monthly.map((m) => {
                const s = semCls(m.cpc);
                const col = s === 'wa-good' ? 'rgba(34,217,122,.55)' : s === 'wa-warn' ? 'rgba(245,181,68,.5)' : 'rgba(244,88,106,.45)';
                const tc = s === 'wa-good' ? 'var(--up)' : s === 'wa-warn' ? 'var(--warn)' : 'var(--dn)';
                return (
                  <div className="tcol" key={m.month}>
                    <div className="bv" style={{ color: tc }}>{cpcFmt(m.cpc)}</div>
                    <div className="tbar" style={{ height: Math.max(6, (m.cpc / maxCpc) * 100) + '%', background: col }} />
                    <div className="bl">{moLabel(m.month)}</div>
                    <div className="bc">{formatInt(Math.round(m.conversations))} conv</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* SPLIT por campaña */}
      {withConv.length > 1 && (
        <>
          <div className="wa-sh"><h2>En qué se fue la inversión</h2><span className="hint">por campaña · el gasto debería ir a la más eficiente</span></div>
          <div className="card">
            <div className="wa-splitbar">
              {camps.map((c, i) => {
                const s = semCls(cpcOf(c.m));
                const col = s === 'wa-good' ? 'var(--up)' : s === 'wa-warn' ? 'var(--warn)' : 'var(--dn)';
                return <i key={i} style={{ width: (c.m.spend / totalSpend) * 100 + '%', background: col }} />;
              })}
            </div>
            <div className="wa-splitleg">
              {camps.slice(0, 4).map((c, i) => {
                const s = semCls(cpcOf(c.m));
                const col = s === 'wa-good' ? 'var(--up)' : s === 'wa-warn' ? 'var(--warn)' : 'var(--dn)';
                return (
                  <div className="it" key={i}>
                    <span className="sw" style={{ background: col }} />
                    <span>{c.name.length > 40 ? c.name.slice(0, 40) + '…' : c.name} <b>{money(c.m.spend, cur)}</b> <span className="cpc">· {cpcFmt(cpcOf(c.m))}</span></span>
                  </div>
                );
              })}
            </div>
            {bestCamp && worstCamp && bestCamp !== worstCamp && upliftPct > 5 && (
              <p className="wa-note">Si esos <b>{money(t.spend, cur)}</b> corrieran al costo de la campaña más eficiente ({cpcFmt(bestCpc)}), serían <b className="up">~{formatInt(potentialConv)} conversaciones</b> en vez de {formatInt(Math.round(t.conversations))} — <b className="up">+{upliftPct}%</b> al mismo gasto.</p>
            )}
          </div>
        </>
      )}

      {/* EXPLORADOR */}
      <div className="wa-sh"><h2>Explorador · campaña → conjunto</h2><span className="hint">clic para desplegar · ordena por cualquier métrica</span>
        <div className="wa-legend">
          <div className="lk"><span className="sq" style={{ background: 'var(--up)' }} />≤ ${GOAL}</div>
          <div className="lk"><span className="sq" style={{ background: 'var(--warn)' }} />${GOAL}–{GOAL * 1.5}</div>
          <div className="lk"><span className="sq" style={{ background: 'var(--dn)' }} />&gt; ${GOAL * 1.5}</div>
        </div>
      </div>
      <div className="wa-tscroll">
        <table className="wa-t">
          <thead><tr>
            <th>Campaña / Conjunto</th>
            {COLS.map((c) => (
              <th key={c.k} className={sortKey === c.k ? 'on' : ''} onClick={() => onSort(c.k)}>
                {c.l}{sortKey === c.k ? <span className="ar">{sortDir === 1 ? '▲' : '▼'}</span> : ''}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id + r.node.name} className={r.lvl === 1 ? 'wa-camp' : 'wa-set'} onClick={r.lvl === 1 ? () => toggle(r.id) : undefined}>
                <td>
                  <span className="nm">
                    {r.lvl === 1 ? <span className={'cx' + (exp[r.id] ? ' open' : '')}>▸</span> : <span className="cxsp" />}
                    {r.node.name}
                  </span>
                </td>
                {COLS.map((c) => <td key={c.k}>{cell(r.node.m, c.k)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ACCIONES */}
      <div className="wa-sh"><h2>Qué haría esta semana</h2><span className="hint">lente de agencia · fee $10k/mo</span></div>
      <div className="wa-acts">
        {bestCamp && worstCamp && bestCamp !== worstCamp && (
          <div className="wa-act good"><div className="tag"><span className="d" style={{ background: 'var(--up)' }} />Reasignar presupuesto</div><div className="body">Mover gasto de <b>{worstCamp.name.slice(0, 32)}</b> ({cpcFmt(cpcOf(worstCamp.m))}) hacia <b>{bestCamp.name.slice(0, 32)}</b> ({cpcFmt(cpcOf(bestCamp.m))}).{upliftPct > 5 && <> Potencial: <b>+{upliftPct}% de conversaciones</b> al mismo costo.</>}</div></div>
        )}
        {worstSet && cpcOf(worstSet.m) > GOAL * 1.5 && (
          <div className="wa-act bad"><div className="tag"><span className="d" style={{ background: 'var(--dn)' }} />Pausar / rehacer</div><div className="body">Conjunto <b>{worstSet.name.slice(0, 34)}</b> gasta <b>{money(worstSet.m.spend, cur)}</b> a <b>{cpcFmt(cpcOf(worstSet.m))}</b>/conv. Pausar o rehacer la segmentación.</div></div>
        )}
        {bestSet && (
          <div className="wa-act"><div className="tag"><span className="d" style={{ background: 'var(--acc)' }} />Escalar el motor</div><div className="body">Conjunto <b>{bestSet.name.slice(0, 34)}</b> corre a <b>{cpcFmt(cpcOf(bestSet.m))}</b> con {formatInt(Math.round(bestSet.m.conversations))} conv. Subir techo de presupuesto con tope de costo.</div></div>
        )}
        {bestMonth && (
          <div className="wa-act warn"><div className="tag"><span className="d" style={{ background: 'var(--warn)' }} />Recuperar {moLabel(bestMonth.month)}</div><div className="body">Volver al <b>{cpcFmt(bestMonth.cpc)}</b> de {moLabel(bestMonth.month)}. Ya se logró antes — es una meta probada, no aspiracional.</div></div>
        )}
      </div>

      <div className="wa-fn">Fuente: <b>meta_messaging</b> (conversaciones, gasto, costo/conv por conjunto·día){aura.hasAura && <> · puente con <b>aura_sales</b> (canal “manual”, bucket medición, cobrado)</>}. Período {rangeLabel}. Sin atribución 1:1 conversación→venta; el puente es dimensional. {cur}.</div>
    </div>
  );
}

const CSS = `
.wa{--good:var(--up);--bad:var(--dn)}
.wa-eyebrow{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--t3);margin-bottom:15px}
.wa-hero{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:34px;align-items:start;padding-bottom:26px;border-bottom:1px solid var(--b1)}
.wa-thesis{font-size:clamp(21px,2.9vw,32px);font-weight:800;letter-spacing:-.02em;line-height:1.17}
.wa-thesis .hl.wa-bad{color:var(--dn)}.wa-thesis .hl.wa-warn{color:var(--warn)}.wa-thesis .hl.wa-good{color:var(--up)}
.wa-thesis .hl-goal{color:var(--up)}
.wa-sub{font-size:13px;color:var(--t2);margin-top:14px;line-height:1.6;max-width:56ch}.wa-sub b{color:var(--t1)}
.wa-north{text-align:right}
.wa-north .k{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--t3);margin-bottom:8px}
.wa-north .v{font-size:clamp(30px,3.4vw,38px);font-weight:800;letter-spacing:-.03em;line-height:.95;font-family:'Space Grotesk',sans-serif}
.wa-north .v.wa-bad{color:var(--dn)}.wa-north .v.wa-warn{color:var(--warn)}.wa-north .v.wa-good{color:var(--up)}
.wa-north .badge{display:inline-block;margin-top:10px;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px}
.wa-north .badge.bad{color:var(--dn);background:rgba(244,88,106,.1)}
.wa-north .badge.good{color:var(--up);background:rgba(34,217,122,.1)}
.wa-north .row{display:flex;gap:22px;justify-content:flex-end;margin-top:18px}
.wa-north .row .l{font-size:9px;letter-spacing:.05em;text-transform:uppercase;color:var(--t3)}
.wa-north .row .rv{font-size:18px;font-weight:800;margin-top:3px;font-family:'Space Grotesk',sans-serif}
.wa-medi{grid-column:1/-1;margin-top:22px;display:flex;gap:10px;align-items:flex-start;background:rgba(245,181,68,.06);border:1px solid rgba(245,181,68,.18);border-radius:10px;padding:11px 14px}
.wa-medi .tag{font-size:9px;font-weight:800;letter-spacing:.06em;color:var(--warn);background:rgba(245,181,68,.14);padding:3px 7px;border-radius:5px;white-space:nowrap;margin-top:1px}
.wa-medi p{font-size:12px;color:var(--t2);line-height:1.55}.wa-medi b{color:var(--t1)}
.wa-sh{display:flex;align-items:baseline;gap:12px;margin:40px 0 16px}
.wa-sh h2{font-size:15px;font-weight:700;margin:0}.wa-sh .hint{font-size:11.5px;color:var(--t3)}
.wa-bridge{background:var(--bg1);border:1px solid var(--b1);border-radius:16px;padding:22px}
.wa-flow{display:grid;grid-template-columns:1fr 46px 1fr;align-items:stretch}
.wa-fcard{background:var(--bg2);border:1px solid var(--b1);border-radius:13px;padding:20px}
.wa-fcard.wa{border-color:rgba(37,211,102,.25)}.wa-fcard.au{border-color:rgba(139,92,246,.28)}
.wa-fcard .fk{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--t3);display:flex;align-items:center;gap:7px;margin-bottom:14px}
.wa-fcard .dot{width:8px;height:8px;border-radius:50%}
.wa-fcard .fv{font-size:29px;font-weight:800;letter-spacing:-.02em;line-height:1;font-family:'Space Grotesk',sans-serif}
.wa-fcard .fv.up{color:var(--up)}
.wa-fcard .fl{font-size:12px;color:var(--t2);margin-top:7px}.wa-fcard .fl b{color:var(--t1)}
.wa-fcard .frow{display:flex;gap:20px;margin-top:15px;padding-top:13px;border-top:1px solid var(--b1)}
.wa-fcard .frow .nv{font-size:15px;font-weight:800;font-family:'Space Grotesk',sans-serif}
.wa-fcard .frow .tl{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--t3);margin-top:2px}
.wa-arrow{display:grid;place-items:center;color:var(--t3);font-size:20px}
.wa-caveat{display:flex;gap:10px;align-items:flex-start;margin-top:16px;background:var(--bg2);border-radius:10px;padding:12px 15px}
.wa-caveat .q{font-size:15px;line-height:1;margin-top:1px}
.wa-caveat p{font-size:11.5px;color:var(--t3);line-height:1.55}.wa-caveat b{color:var(--t2)}
.wa-trend{display:flex;align-items:flex-end;gap:14px;height:150px;margin-top:4px}
.wa-trend .tcol{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:7px;height:100%}
.wa-trend .tbar{width:100%;max-width:58px;border-radius:6px 6px 0 0}
.wa-trend .bv{font-size:12px;font-weight:800;font-family:'Space Grotesk',sans-serif}
.wa-trend .bl{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.04em}
.wa-trend .bc{font-size:9.5px;color:var(--t3)}
.wa-splitbar{height:16px;border-radius:8px;overflow:hidden;display:flex;margin-top:4px}
.wa-splitbar>i{display:block;height:100%;min-width:2px}
.wa-splitleg{display:flex;gap:20px;flex-wrap:wrap;margin-top:14px;font-size:12px}
.wa-splitleg .it{display:flex;align-items:center;gap:8px}
.wa-splitleg .sw{width:10px;height:10px;border-radius:3px;flex:none}
.wa-splitleg b{font-weight:800}.wa-splitleg .cpc{color:var(--t3)}
.wa-note{font-size:12px;color:var(--t2);margin-top:16px;line-height:1.6}.wa-note b{color:var(--t1)}.wa-note .up{color:var(--up)}
.wa-legend{display:flex;align-items:center;gap:14px;font-size:11.5px;color:var(--t3);flex-wrap:wrap;margin-left:auto}
.wa-legend .lk{display:flex;align-items:center;gap:5px}.wa-legend .sq{width:9px;height:9px;border-radius:3px}
.wa-tscroll{overflow-x:auto;border:1px solid var(--b1);border-radius:14px}
table.wa-t{border-collapse:collapse;width:100%;min-width:640px;font-size:12.5px}
.wa-t th{background:var(--bg2);font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--t3);padding:11px 14px;text-align:right;white-space:nowrap;cursor:pointer;user-select:none;position:sticky;top:0}
.wa-t th:first-child,.wa-t td:first-child{text-align:left;position:sticky;left:0;background:var(--bg1);z-index:1;min-width:250px}
.wa-t th:first-child{background:var(--bg2);z-index:2}
.wa-t th.on{color:var(--acc)}.wa-t th .ar{margin-left:3px;font-size:9px}
.wa-t td{padding:12px 14px;text-align:right;border-top:1px solid var(--b1);white-space:nowrap}
.wa-t tr.wa-camp{cursor:pointer}
.wa-t tr.wa-camp td{background:var(--bg1);font-weight:700}
.wa-t tr.wa-camp:hover td{background:var(--bg2)}
.wa-t tr.wa-set td{color:var(--t2)}
.wa-t tr.wa-set td:first-child{background:var(--bg1);padding-left:16px;font-weight:500}
.wa-t .nm{display:flex;align-items:center;gap:9px}
.wa-t .cx{color:var(--t3);font-size:9px;flex:none;transition:transform .15s}.wa-t .cx.open{transform:rotate(90deg)}
.wa-t .cxsp{width:9px;flex:none}
.wa-pill{display:inline-block;padding:3px 9px;border-radius:7px;font-weight:800;font-size:12px;font-family:'Space Grotesk',sans-serif}
.wa-pg{color:var(--up);background:rgba(34,217,122,.1)}
.wa-pw{color:var(--warn);background:rgba(245,181,68,.1)}
.wa-pb{color:var(--dn);background:rgba(244,88,106,.1)}
.wa-acts{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.wa-act{background:var(--bg1);border:1px solid var(--b1);border-radius:14px;padding:18px 20px;border-left:3px solid var(--acc)}
.wa-act.good{border-left-color:var(--up)}.wa-act.bad{border-left-color:var(--dn)}.wa-act.warn{border-left-color:var(--warn)}
.wa-act .tag{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:800;margin-bottom:8px}
.wa-act .tag .d{width:9px;height:9px;border-radius:50%}
.wa-act .body{font-size:13px;color:var(--t2);line-height:1.55}.wa-act .body b{color:var(--t1)}
.wa-fn{margin-top:34px;font-size:11px;color:var(--t3);border-top:1px solid var(--b1);padding-top:16px;line-height:1.6}.wa-fn b{color:var(--t2)}
@media(max-width:760px){.wa-hero{grid-template-columns:1fr}.wa-north{text-align:left}.wa-north .row{justify-content:flex-start}.wa-flow{grid-template-columns:1fr}.wa-arrow{transform:rotate(90deg);height:38px}.wa-acts{grid-template-columns:1fr}}
`;
