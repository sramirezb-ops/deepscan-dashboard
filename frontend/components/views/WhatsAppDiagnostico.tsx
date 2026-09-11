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

type SortKey = 'spend' | 'cpc' | 'conversations' | 'impressions' | 'pct';
const COLS: { k: SortKey; l: string }[] = [
  { k: 'spend', l: 'Gasto' },
  { k: 'conversations', l: 'Mensajes' },
  { k: 'cpc', l: 'Costo/msg' },
  { k: 'impressions', l: 'Impres.' },
  { k: 'pct', l: '% gasto' },
];
const ST_LABEL: Record<string, [string, string]> = {
  active: ['Activo', 'wa-st-on'], paused: ['Pausado', 'wa-st-off'],
  rejected: ['Rechazado', 'wa-st-bad'], unknown: ['—', 'wa-st-off'],
};

export function WhatsAppDiagnostico() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useMetaWhatsApp(client.id, range, previous);
  const cur = client.currency;
  const rangeLabel = formatRangeLabel(range);

  const [exp, setExp] = useState<Record<string, boolean>>({});
  const [expPar, setExpPar] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const withIds = useMemo(() => {
    const hier = data?.adHierarchy ?? [];
    return hier.map((c, ci) => ({
      ...c, _id: 'c' + ci,
      kids: (c.kids ?? []).map((s, si) => ({ ...s, _id: 'c' + ci + 's' + si })),
    }));
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

  type Row = { lvl: 1 | 2 | 3; id: string; node: WaHierNode };
  const rows: Row[] = [];
  sortNodes(withIds).forEach((c: any) => {
    rows.push({ lvl: 1, id: c._id, node: c });
    if (exp[c._id]) sortNodes(c.kids ?? []).forEach((s: any) => {
      rows.push({ lvl: 2, id: s._id, node: s });
      if (exp[s._id]) sortNodes(s.kids ?? []).forEach((a: any, ai: number) => {
        rows.push({ lvl: 3, id: s._id + 'a' + ai, node: a });
      });
    });
  });

  const cell = (m: WaMetric, k: SortKey) => {
    if (k === 'spend') return money(m.spend, cur);
    if (k === 'conversations') return formatInt(Math.round(m.conversations));
    if (k === 'impressions') return formatInt(Math.round(m.impressions));
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
            {aura.advisors.length > 0 && (
              <div className="wa-adv">
                <div className="wa-adv-h">Cierres por asesor<span className="hint"> · quién cierra la venta manual</span></div>
                {(() => {
                  const maxc = Math.max(...aura.advisors.map((a) => a.cobrado), 1);
                  return aura.advisors.map((a) => (
                    <div className="wa-adv-row" key={a.name}>
                      <div className="an">{a.name}</div>
                      <div className="ab"><i style={{ width: (a.cobrado / maxc) * 100 + '%' }} /></div>
                      <div className="at">{a.tickets} <span className="mu">tks</span></div>
                      <div className="ac">{money(a.cobrado, cur)}</div>
                      <div className="ap">{Math.round((a.cobrado / aura.manualCobrado) * 100)}%</div>
                    </div>
                  ));
                })()}
              </div>
            )}
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

      {/* BALANCE DE PARES */}
      {data.pares.length > 0 && (() => {
        const P = data.pares;
        const totMsg = data.paresTotals.messages || 1;
        const maxMsg = Math.max(...P.map((p) => p.messages), 1);
        const parCpm = (p: typeof P[number]) => (p.messages > 0 ? p.spend / p.messages : 0);
        const cpmCls = (v: number) => (v <= 0 ? 'mid' : v < 5 ? 'cheap' : v <= 10 ? 'mid' : 'dear');
        const conc = data.concentration;
        const palette = ['#e08a00', '#f2a93b', '#7bbf5a', '#38bdf8', '#a78bfa'];
        const top = P.slice(0, 3);
        const restShare = 1 - top.reduce((s, p) => s + p.messages, 0) / totMsg;
        return (
          <>
            <div className="wa-sh"><h2>⚖️ Balance de pares</h2><span className="hint">concentración por modelo · clic en un par para ver sus anuncios</span></div>
            <div className="card">
              <div className="wa-conc">
                <div className="stat"><div className="k">Par top</div><div className="v mono">{Math.round(conc.topShare * 100)}%</div></div>
                <div className="stat"><div className="k">Top 3 pares</div><div className="v mono">{Math.round(conc.top3Share * 100)}%</div><div className="sub">de los mensajes</div></div>
                <div className="stat"><div className="k">Pares activos</div><div className="v mono">{conc.parCount}</div></div>
                <div className="wa-stack">
                  {top.map((p, i) => <i key={i} style={{ width: (p.messages / totMsg) * 100 + '%', background: palette[i] }}>{(p.messages / totMsg) >= 0.1 ? Math.round((p.messages / totMsg) * 100) + '%' : ''}</i>)}
                  {restShare > 0.001 && <i style={{ width: restShare * 100 + '%', background: 'var(--track)', color: 'var(--t2)' }}>{restShare >= 0.1 ? 'resto' : ''}</i>}
                </div>
              </div>

              {P.map((p, pi) => {
                const cpm = parCpm(p);
                const open = !!expPar['p' + pi];
                return (
                  <div key={p.model} className="wa-parwrap">
                    <div className={'wa-par' + (open ? ' open' : '')} onClick={() => setExpPar((e) => ({ ...e, ['p' + pi]: !e['p' + pi] }))}>
                      <span className="cx">▸</span>
                      {p.thumbUrl ? <img className="pthumb" src={p.thumbUrl} alt="" /> : <span className="pthumb ph">👟</span>}
                      <div className="pnm"><div className="t">{p.model}</div><div className="s">{p.ads.length} anuncio{p.ads.length !== 1 ? 's' : ''} · {formatInt(Math.round(p.impressions))} impr</div></div>
                      <div className="pbar"><i style={{ width: (p.messages / maxMsg) * 100 + '%' }} /></div>
                      <div className="pmsg"><div className="n mono">{formatInt(Math.round(p.messages))}</div><div className="pp">{Math.round((p.messages / totMsg) * 100)}%</div></div>
                      <div className={'pcpm mono ' + cpmCls(cpm)}>{cpcFmt(cpm)}<span className="u">/msg</span></div>
                    </div>
                    {open && (
                      <div className="wa-parads">
                        {p.ads.map((a) => {
                          const st = ST_LABEL[a.status];
                          return (
                            <div className="wa-parad" key={a.adId}>
                              {a.thumbUrl ? <img className="athumb" src={a.thumbUrl} alt="" /> : <span className="athumb ph">{a.isVideo ? '▶' : '👟'}</span>}
                              <div className="anm"><div className="t">{a.adName}</div><div className="s">{a.adsetName}</div></div>
                              <span className={'wa-st ' + st[1]}>{st[0]}</span>
                              <div className="av"><span className="mono">{formatInt(Math.round(a.messages))}</span><span className="u">msgs</span></div>
                              <div className="av"><span className="mono">{money(a.spend, cur)}</span><span className="u">gasto</span></div>
                              <div className="av"><span className="mono">{formatInt(Math.round(a.impressions))}</span><span className="u">impr</span></div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="wa-note" style={{ marginTop: 14 }}>💡 Un par que crece mucho no siempre es malo — pero conviene tenerlo <b>vigilado</b>. Ojo: un <b>costo/msg bajo</b> suele traer <b>más volumen pero peor lead</b>. Clic en cada par para ver qué anuncio está activo y cuánto consumió.</div>
            </div>
          </>
        );
      })()}

      {/* EXPLORADOR */}
      <div className="wa-sh"><h2>Explorador · campaña → conjunto → anuncio</h2><span className="hint">clic para desplegar hasta el anuncio · ordena por cualquier métrica</span>
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
            {rows.map((r) => {
              const cls = r.lvl === 1 ? 'wa-camp' : r.lvl === 2 ? 'wa-set' : 'wa-ad';
              const canToggle = r.lvl < 3;
              const st = r.node.status ? ST_LABEL[r.node.status] : null;
              return (
                <tr key={r.id + r.node.name} className={cls} onClick={canToggle ? () => toggle(r.id) : undefined}>
                  <td>
                    <span className="nm">
                      {canToggle
                        ? <span className={'cx' + (exp[r.id] ? ' open' : '')}>▸</span>
                        : (r.node.thumbUrl
                            ? <img className="wa-thmb" src={r.node.thumbUrl} alt="" />
                            : <span className="wa-thmb ph">{r.node.isVideo ? '▶' : '👟'}</span>)}
                      <span className="nmtxt">{r.node.name}</span>
                      {st && <span className={'wa-st ' + st[1]}>{st[0]}</span>}
                    </span>
                  </td>
                  {COLS.map((c) => <td key={c.k}>{cell(r.node.m, c.k)}</td>)}
                </tr>
              );
            })}
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
.wa-fcard .fv{font-size:29px;font-weight:800;letter-spacing:-.02em;line-height:1;font-family:'Space Grotesk',sans-serif;color:var(--t1)}
.wa-fcard .fv.up{color:var(--up)}
.wa-fcard .fl{font-size:12px;color:var(--t2);margin-top:7px}.wa-fcard .fl b{color:var(--t1)}
.wa-fcard .frow{display:flex;gap:20px;margin-top:15px;padding-top:13px;border-top:1px solid var(--b1)}
.wa-fcard .frow .nv{font-size:15px;font-weight:800;font-family:'Space Grotesk',sans-serif;color:var(--t1)}
.wa-fcard .frow .tl{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--t3);margin-top:2px}
.wa-arrow{display:grid;place-items:center;color:var(--t3);font-size:20px}
.wa-caveat{display:flex;gap:10px;align-items:flex-start;margin-top:16px;background:var(--bg2);border-radius:10px;padding:12px 15px}
.wa-caveat .q{font-size:15px;line-height:1;margin-top:1px}
.wa-caveat p{font-size:11.5px;color:var(--t3);line-height:1.55}.wa-caveat b{color:var(--t2)}
.wa-adv{margin-top:16px;background:var(--bg2);border-radius:10px;padding:14px 16px}
.wa-adv-h{font-size:12px;font-weight:800;color:var(--t1);margin-bottom:12px}.wa-adv-h .hint{font-weight:500;color:var(--t3)}
.wa-adv-row{display:grid;grid-template-columns:130px 1fr 52px 96px 40px;align-items:center;gap:12px;padding:5px 0}
.wa-adv-row .an{font-size:12px;font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wa-adv-row .ab{height:8px;background:var(--track,rgba(255,255,255,.06));border-radius:5px;overflow:hidden}
.wa-adv-row .ab i{display:block;height:100%;background:var(--up);border-radius:5px}
.wa-adv-row .at{font-size:11px;color:var(--t2);text-align:right;font-family:'Space Grotesk',sans-serif}.wa-adv-row .at .mu{color:var(--t3)}
.wa-adv-row .ac{font-size:12.5px;font-weight:800;text-align:right;font-family:'Space Grotesk',sans-serif}
.wa-adv-row .ap{font-size:11px;color:var(--t3);text-align:right}
@media(max-width:640px){.wa-adv-row{grid-template-columns:104px 1fr 78px;gap:8px}.wa-adv-row .at,.wa-adv-row .ap{display:none}}
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
/* ── Balance de pares ── */
.wa-conc{display:grid;grid-template-columns:auto auto auto 1fr;gap:26px;align-items:center;padding-bottom:16px;margin-bottom:6px;border-bottom:1px solid var(--b1)}
.wa-conc .stat .k{font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--t3)}
.wa-conc .stat .v{font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1;margin-top:4px;color:var(--t1)}
.wa-conc .stat .sub{font-size:9.5px;color:var(--t3);margin-top:3px}
.wa-stack{height:20px;border-radius:6px;overflow:hidden;display:flex;border:1px solid var(--b1)}
.wa-stack>i{height:100%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden}
.wa-parwrap{border-top:1px solid var(--b1)}
.wa-par{display:grid;grid-template-columns:12px 34px 1fr 110px 66px 66px;gap:12px;align-items:center;padding:9px 0;cursor:pointer}
.wa-par .cx{color:var(--t3);font-size:9px;transition:transform .15s}.wa-par.open .cx{transform:rotate(90deg)}
.pthumb{width:34px;height:34px;border-radius:8px;object-fit:cover;display:grid;place-items:center;font-size:15px;background:var(--bg3,#1c1c28)}
.pthumb.ph{color:var(--t3)}
.wa-par .pnm{min-width:0}
.wa-par .pnm .t{font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--t1)}
.wa-par .pnm .s{font-size:10.5px;color:var(--t3);margin-top:1px}
.wa-par .pbar{height:9px;background:var(--track);border-radius:5px;overflow:hidden}
.wa-par .pbar i{display:block;height:100%;background:var(--up);border-radius:5px}
.wa-par .pmsg{text-align:right}.wa-par .pmsg .n{font-size:14px;font-weight:800;font-family:'Space Grotesk',sans-serif;color:var(--t1)}.wa-par .pmsg .pp{font-size:9.5px;color:var(--t3)}
.wa-par .pcpm{text-align:right;font-size:12.5px;font-weight:800;font-family:'Space Grotesk',sans-serif}
.wa-par .pcpm.cheap{color:var(--up)}.wa-par .pcpm.mid{color:var(--t2)}.wa-par .pcpm.dear{color:var(--dn)}
.wa-par .pcpm .u{font-size:8.5px;color:var(--t3);font-weight:500}
.wa-parads{padding:2px 0 10px 58px;display:flex;flex-direction:column;gap:6px}
.wa-parad{display:grid;grid-template-columns:26px 1fr 74px 58px 78px 58px;gap:10px;align-items:center;background:var(--bg2);border-radius:8px;padding:7px 10px}
.athumb{width:26px;height:26px;border-radius:6px;object-fit:cover;display:grid;place-items:center;font-size:11px;background:var(--bg3,#1c1c28);color:var(--t3)}
.wa-parad .anm{min-width:0}.wa-parad .anm .t{font-size:11.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--t1)}.wa-parad .anm .s{font-size:9.5px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wa-parad .av{text-align:right}.wa-parad .av .mono{font-size:11.5px;font-weight:700;font-family:'Space Grotesk',sans-serif;color:var(--t1)}.wa-parad .av .u{font-size:8.5px;color:var(--t3);display:block}
.wa-st{font-size:9px;font-weight:800;padding:2px 7px;border-radius:20px;white-space:nowrap;letter-spacing:.02em}
.wa-st-on{color:var(--up);background:rgba(34,217,122,.12)}
.wa-st-off{color:var(--t3);background:var(--track)}
.wa-st-bad{color:var(--dn);background:rgba(244,88,106,.12)}
/* miniatura y fila de anuncio en el explorador */
.wa-thmb{width:24px;height:24px;border-radius:5px;object-fit:cover;flex:none;display:grid;place-items:center;font-size:11px;background:var(--bg3,#1c1c28);color:var(--t3)}
.wa-t tr.wa-ad td{color:var(--t2)}
.wa-t tr.wa-ad td:first-child{background:var(--bg1);padding-left:30px;font-weight:500}
.wa-t tr.wa-ad .nmtxt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:230px}
@media(max-width:760px){.wa-hero{grid-template-columns:1fr}.wa-north{text-align:left}.wa-north .row{justify-content:flex-start}.wa-flow{grid-template-columns:1fr}.wa-arrow{transform:rotate(90deg);height:38px}.wa-acts{grid-template-columns:1fr}.wa-conc{grid-template-columns:1fr 1fr;gap:14px}.wa-stack{grid-column:1/-1}.wa-parad{grid-template-columns:26px 1fr 60px}.wa-parad .av:nth-child(n+5){display:none}}
`;
