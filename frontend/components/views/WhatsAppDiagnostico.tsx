'use client';

import { useState, useMemo } from 'react';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { useWhatsAppDiag, type WaAd, type WaAdset } from '@/lib/hooks/useWhatsAppDiag';
import { EmptyState } from '@/components/ui/EmptyState';

const INK = '#171226', INK2 = '#2b2440', MUT = '#77718a', ACC = '#7c5cff', ACCD = '#5a37e0';
const RED = '#e5384d', AMBER = '#f5a524', GREEN = '#1faf6a', WA = '#25b86a', BLUE = '#5b9df9', LINE = '#ebe7f4';
const DCOL = [ACC, '#17b3c9', BLUE, '#c4b5fd', '#67e8f9', '#a78bfa'];

const money = (v: number | null | undefined) => {
  const x = Math.round(((v || 0) as number) * 100) / 100;
  if (x !== 0 && Math.abs(x) < 10 && Math.abs(x) % 1 !== 0) return (x < 0 ? '-$' : '$') + Math.abs(x).toFixed(2);
  return (x < 0 ? '-$' : '$') + Math.abs(Math.round(x)).toLocaleString('en-US');
};
const kfmt = (v: number) => Math.round(v || 0).toLocaleString('en-US');
const shortAdset = (nm: string) => (nm.split('|')[0] || nm).trim();
const stColor = (cls: string) => (cls === 'active' ? GREEN : cls === 'rejected' ? RED : MUT);

function posterUrl(a: WaAd): string {
  if (a.image_url) return a.image_url;
  const t = a.thumbnail_url || '';
  if (t.includes('url=') && decodeURIComponent(t).includes('/ads/image')) {
    try { const u = new URL(t); const inner = u.searchParams.get('url'); if (inner) return inner; } catch { /* noop */ }
  }
  return t;
}
function fbVideo(id: string) { return `https://www.facebook.com/sneakerstorecdmx/videos/${id}/`; }

function adTag(a: WaAd): [string, string] {
  if (a.conv >= 20 && a.cost_conv && a.cost_conv <= 12) return ['GANA', GREEN];
  if (a.spend >= 300 && (a.conv === 0 || a.cost_conv > 25)) return ['CARO', RED];
  if (a.conv > 0) return ['OK', AMBER];
  return ['—', MUT];
}

export function WhatsAppDiagnostico() {
  const client = useClient();
  const { range } = usePeriod();
  const { data, loading, error } = useWhatsAppDiag(client.id, range);
  const [sel, setSel] = useState<number | null>(null);
  const [showInact, setShowInact] = useState<Record<number, boolean>>({});

  const view = useMemo(() => {
    if (!data) return null;
    const PR = data.phases['Presentación'];
    const EV = data.phases['Evaluación'];
    const eq = data.adsets.filter((a) => a.phase === 'Presentación');
    const imbal = eq.filter((a) => a.top >= 65);
    const rejected = data.adsets.filter((a) => a.nrejected > 0);
    const noDelivery = data.adsets.filter((a) => a.nactive === 0 && a.spend >= 200);
    const bestByConv = [...data.ads].sort((x, y) => y.conv - x.conv)[0];
    const bestAdset = eq.filter((a) => a.conv > 5).sort((x, y) => x.cost_conv - y.cost_conv)[0];
    const idxOf: Record<string, number> = {};
    data.ads.forEach((a, i) => (idxOf[a.ad_id] = i));

    type AI = { ic: string; pri: string; pc: string; t: string; h: string; hip: string; ac: string };
    const AI: AI[] = [];
    if (imbal.length) AI.push({
      ic: '⚖️', pri: 'ALTA', pc: RED, t: 'Ad sets donde un anuncio acapara el reparto',
      h: `En ${imbal.map((a) => shortAdset(a.name)).join(', ')} el anuncio top se lleva ${Math.max(...imbal.map((a) => a.top))}% de las impresiones — el resto casi no corre.`,
      hip: 'Meta concentra en el que arrancó mejor. Si el top ES el ganador (costo/conv bajo), está bien; si no, se están matando variaciones sin darles chance.',
      ac: 'Revisar: si el top tiene buen costo/conv, dejarlo; si no, pausarlo unos días o separar variaciones en ad sets de prueba.',
    });
    if (PR && EV && EV.cost_conv > PR.cost_conv && PR.cost_conv > 0) AI.push({
      ic: '💸', pri: 'ALTA', pc: RED, t: 'El tráfico tibio sale MÁS caro que el frío',
      h: `Presentación (frío) convierte a ${money(PR.cost_conv)}/conv vs Evaluación (tibio) a ${money(EV.cost_conv)}/conv.`,
      hip: 'El remarketing debería ser más barato. Que salga más caro sugiere audiencia tibia saturada (frecuencia alta) o creativos gastados.',
      ac: 'Refrescar creativos en Evaluación y revisar frecuencia. Si no baja el costo/conv, mover presupuesto al frío que rinde mejor.',
    });
    if (rejected.length) AI.push({
      ic: '🚫', pri: 'ALTA', pc: RED, t: 'Ad set con anuncios rechazados por Meta',
      h: `${rejected.map((a) => shortAdset(a.name)).join(', ')}: tienen anuncios rechazados → ${kfmt(rejected.reduce((s, a) => s + a.conv, 0))} conversación(es) con ${money(rejected.reduce((s, a) => s + a.spend, 0))} de gasto.`,
      hip: 'Los creativos fueron rechazados en revisión (política), así que casi no se entregaron. El gasto se fue sin conversaciones.',
      ac: 'Revisar el motivo del rechazo en Meta, corregir el creativo/copy y volver a subir; o pausar el ad set para no quemar presupuesto.',
    });
    if (!rejected.length && noDelivery.length) AI.push({
      ic: '🌙', pri: 'MEDIA', pc: AMBER, t: 'Ad set sin entrega reciente pese al gasto',
      h: `${noDelivery.map((a) => shortAdset(a.name)).join(', ')}: gastó ${money(noDelivery.reduce((s, a) => s + a.spend, 0))} en el período pero ningún anuncio entregó en los últimos días.`,
      hip: 'Puede estar pausado, con creativos rechazados, o Meta dejó de entregarlo por rendimiento/frecuencia. En cualquier caso ya no trae conversaciones.',
      ac: 'Confirmar en Meta si está activo; si sigue encendido y no entrega, refrescar creativo o revisar la segmentación.',
    });
    if (bestByConv && bestByConv.conv > 0) AI.push({
      ic: '🏆', pri: 'MEDIA', pc: GREEN, t: 'El creativo que más convierte',
      h: `«${shortAdset(bestByConv.name)}»: ${kfmt(bestByConv.conv)} conversaciones a ${money(bestByConv.cost_conv)}/conv.`,
      hip: 'Ese ángulo/oferta conecta. Es tu control a batir.',
      ac: 'Duplicarlo en los ad sets donde aún no corre y crear variaciones a partir de él.',
    });

    return { PR, EV, eq, AI, idxOf, bestAdset };
  }, [data]);

  if (loading) return <div className="ct-pad"><EmptyState title="Cargando WhatsApp…" message="Un momento…" /></div>;
  if (error || !data || !view || !data.hasData)
    return <div className="ct-pad"><EmptyState title="Sin datos de WhatsApp" message={error || 'No hay campañas de mensajería (Presentación / Evaluación) con actividad en este período.'} /></div>;

  const { PR, EV, AI } = view;
  const cpcAll = data.costConvAll;

  const duel: Array<[string, string, string, 0 | 1 | 2]> = [];
  if (PR && EV) {
    const w = (a: number, b: number, hi: boolean): 0 | 1 | 2 => (a === b ? 0 : (hi ? a > b : a < b) ? 1 : 2);
    duel.push(['Inversión', money(PR.spend), money(EV.spend), 0]);
    duel.push(['Conversaciones', kfmt(PR.conv), kfmt(EV.conv), w(PR.conv, EV.conv, true)]);
    duel.push(['Costo / conversación', money(PR.cost_conv), money(EV.cost_conv), w(PR.cost_conv, EV.cost_conv, false)]);
    duel.push(['CPM', money(PR.cpm), money(EV.cpm), w(PR.cpm, EV.cpm, false)]);
    duel.push(['Impresiones', kfmt(PR.impr), kfmt(EV.impr), 0]);
  }

  const balColor = (top: number, nactive: number) => (nactive === 0 ? RED : top >= 65 ? RED : top >= 45 ? AMBER : GREEN);
  const balLabel = (top: number, nactive: number) => (nactive === 0 ? 'SIN ACTIVOS' : top >= 65 ? 'DESBALANCE' : top >= 45 ? 'REVISAR' : 'EQUILIBRADO');

  const selAd = sel != null ? data.ads[sel] : null;

  return (
    <div className="wa">
      <header className="wa-hd">
        <div className="brand">DEEPSCAN <small>· {client.name.toUpperCase()}</small></div>
        <h1>WhatsApp · Diagnóstico de conversaciones <span className="pill">MENSAJERÍA</span></h1>
        <div className="sub">Presentación (tráfico frío) + Evaluación (tráfico tibio) · por campaña y ad set. {data.from} → {data.to}</div>
      </header>

      {/* Hero */}
      <div className="card hero">
        <div className="hbig">{money(cpcAll)}<span>COSTO / CONVERSACIÓN</span></div>
        <div className="hero-txt">
          <p><b>{kfmt(data.totalConv)} conversaciones</b> por <b>{money(data.totalSpend)}</b> en mensajería.{PR && EV && EV.cost_conv > PR.cost_conv ? <> El tráfico <b>frío convierte más barato ({money(PR.cost_conv)})</b> que el tibio ({money(EV.cost_conv)}) — señal a revisar.</> : null}</p>
          <div className="hstats">
            <div className="hstat"><b>{kfmt(data.totalConv)}</b><span>Conversaciones</span></div>
            <div className="hstat"><b>{money(data.totalSpend)}</b><span>Inversión</span></div>
            <div className="hstat"><b>{money(cpcAll)}</b><span>Costo/conv</span></div>
          </div>
        </div>
      </div>

      {/* IA */}
      {AI.length > 0 && (
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
      )}

      {/* Duelo */}
      {duel.length > 0 && (<>
        <h2><span className="nn">1</span>Duelo · Frío vs Tibio</h2>
        <div className="h2sub">Presentación (presenta la marca a quien no la conoce) vs Evaluación (remarketing a quien ya interactuó).</div>
        <div className="card">
          <table className="duel"><thead><tr><th></th><th style={{ color: BLUE }}>Presentación · frío</th><th style={{ color: AMBER }}>Evaluación · tibio</th></tr></thead>
            <tbody>{duel.map(([lbl, a, b, wn], i) => (
              <tr key={i}><td>{lbl}</td>
                <td className="dv">{wn === 1 ? <b style={{ color: GREEN }}>{a} ▲</b> : a}</td>
                <td className="dv">{wn === 2 ? <b style={{ color: GREEN }}>{b} ▲</b> : b}</td></tr>
            ))}</tbody></table>
          <div className="verdict">
            <div className="vc cold"><b style={{ color: BLUE }}>❄️ Presentación — el motor</b>{PR ? <>{kfmt(PR.conv)} conversaciones a {money(PR.cost_conv)} c/u. Trae volumen barato desde cero.</> : 'Sin datos en el período.'}</div>
            <div className="vc warm"><b style={{ color: AMBER }}>🔥 Evaluación — auditar</b>{EV ? <>{money(EV.cost_conv)} por conversación siendo remarketing. Refrescar creativos y revisar frecuencia.</> : 'Sin datos en el período.'}</div>
          </div>
        </div>
      </>)}

      {/* Equilibrio */}
      {view.eq.length > 0 && (<>
        <h2><span className="nn">2</span>⚖️ Equilibrio por ad set · ¿reparten o acaparan?</h2>
        <div className="h2sub">Cada ad set = una segmentación (emoji + número). La barra = reparto de impresiones entre sus anuncios (gris = inactivo). 🔴 si uno acapara &gt;65%.</div>
        <div className="card">
          {view.eq.map((A, gi) => {
            const tc = balColor(A.top, A.nactive);
            return (
              <div className="aset" key={gi}>
                <div className="aset-h">
                  <div><div className="aset-n">{shortAdset(A.name)}</div><div className="aset-s">{A.nactive} activos de {A.nads} · {A.conv} conversaciones{A.nrejected ? <span style={{ color: RED }}> · {A.nrejected} rechazado(s)</span> : null}</div></div>
                  <div className="aset-k"><b>{money(A.cost_conv)}</b><span>costo/conv</span></div>
                  <div className="aset-bal" style={{ background: tc + '1a', color: tc }}>{balLabel(A.top, A.nactive)}<br /><b>top {A.top}%</b></div>
                </div>
                <div className="dbar">{A.dist.map((s, i) => (
                  <div className="dseg" key={i} style={{ width: `${s.pct}%`, background: s.active ? DCOL[i % DCOL.length] : '#d9d3ea' }} title={`${s.name} · ${s.pct}% · ${s.conv} conv`} />
                ))}</div>
                <div className="dleg">Reparto de impresiones entre anuncios · {A.dist.slice(0, 4).map((s, i) => (
                  <span key={i}><span style={{ color: s.active ? DCOL[i % DCOL.length] : '#b7afce' }}>■</span> {s.pct}% </span>
                ))}{A.dist.length > 4 ? '· resto' : ''}</div>
              </div>
            );
          })}
          <div className="cinsight">Un solo anuncio acaparando no es malo <b>si es el ganador</b> (costo/conv bajo). Es malo cuando ahoga variaciones que podrían rendir. Revisa el detalle de cada anuncio abajo.</div>
        </div>
      </>)}

      {/* Anuncios por ad set */}
      <h2><span className="nn">3</span>Anuncios por ad set · sin mezclar</h2>
      <div className="h2sub">Cada ad set con sus propios anuncios. Se muestran los <b>activos</b> (● verde) primero; usa «mostrar inactivos» para ver pausados y rechazados. Clic en cualquiera para el detalle.</div>
      {data.adsets.map((A: WaAdset, gi) => {
        const ccol = A.phase === 'Presentación' ? BLUE : AMBER;
        const acts = A.ads.filter((a) => a.active);
        const inacts = A.ads.filter((a) => !a.active);
        const open = !!showInact[gi];
        return (
          <div className="agroup" key={gi}>
            <div className="gh">
              <div className="gh-l">
                <span className="gchip" style={{ background: ccol + '1a', color: ccol }}>{A.phase}</span>
                <span className="gname">{shortAdset(A.name)}</span>
                {A.nrejected ? <span className="gwarn">⚠️ {A.nrejected} rechazado(s)</span> : null}
              </div>
              <div className="gh-r"><b>{A.nactive}</b> activos · <b>{A.conv}</b> conv · <b>{money(A.cost_conv)}</b>/conv
                {inacts.length > 0 && (
                  <label className="gtoggle"><input type="checkbox" checked={open} onChange={(e) => setShowInact((s) => ({ ...s, [gi]: e.target.checked }))} /> mostrar inactivos ({inacts.length})</label>
                )}
              </div>
            </div>
            <div className="cgrid">
              {acts.length === 0 && <div className="gempty">Ningún anuncio activo ahora mismo — activa «mostrar inactivos» para ver los pausados/rechazados.</div>}
              {[...acts, ...(open ? inacts : [])].map((a) => {
                const [tl, tc] = adTag(a);
                const p = posterUrl(a);
                const scol = stColor(a.st_cls);
                return (
                  <figure className={`cc${a.active ? '' : ' dim'}`} key={a.ad_id} onClick={() => setSel(view.idxOf[a.ad_id])}>
                    <div className="cph">
                      {p ? <img src={p} loading="lazy" alt="" /> : <div className="noimg">{a.name.slice(0, 30)}</div>}
                      {a.is_video && a.video_id && <a className="play" href={fbVideo(a.video_id)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>▶</a>}
                      <span className={a.is_video ? 'vlabel' : 'ilabel'}>{a.is_video ? 'VIDEO' : 'IMG'}</span>
                      <span className="stbadge" style={{ background: scol }}>{a.st_cls === 'active' ? '● ' : ''}{a.st_label}</span>
                      <span className="cbadge" style={{ background: tc }}>{tl}</span>
                      <span className="cmore">＋ detalle</span>
                    </div>
                    <figcaption>
                      <div className="cn">{shortAdset(a.name).slice(0, 38)}</div>
                      <div className="cm"><b style={{ color: WA }}>{a.conv} conv</b><b>{money(a.cost_conv)}</b><span className="muted">{money(a.spend)} · CTR {a.ctr}%</span></div>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Plataforma */}
      {(data.plats['Presentación'] || data.plats['Evaluación']) && (<>
        <h2><span className="nn">4</span>Rendimiento por plataforma</h2>
        <div className="h2sub">Dónde se gasta en cada campaña (Facebook / Instagram).</div>
        <div className="card two">
          {(['Presentación', 'Evaluación'] as const).map((ph) => (
            <div className="pcol" key={ph}>
              <h4 style={{ color: ph === 'Presentación' ? BLUE : AMBER }}>{ph} · {ph === 'Presentación' ? 'frío' : 'tibio'}</h4>
              {(data.plats[ph] || []).map((p, i) => {
                const mx = Math.max(...(data.plats[ph] || []).map((q) => q.spend), 1);
                const col = p.key === 'facebook' ? '#1877f2' : p.key === 'instagram' ? '#e1306c' : ACC;
                return (
                  <div className="segrow" key={i}>
                    <div className="seglbl"><b>{p.key.charAt(0).toUpperCase() + p.key.slice(1)}</b><span>{p.pct}% del gasto</span></div>
                    <div className="segbarwrap"><div className="segbar" style={{ width: `${Math.max(Math.round((100 * p.spend) / mx), 5)}%`, background: col }} /><span className="segval">{money(p.spend)}</span></div>
                  </div>
                );
              })}
              {(!data.plats[ph] || data.plats[ph].length === 0) && <div className="muted" style={{ fontSize: 12, padding: '8px 0' }}>Sin datos de plataforma.</div>}
            </div>
          ))}
          <div className="cinsight" style={{ gridColumn: '1/3' }}>La conversación por plataforma aún no se guarda por separado (los breakdowns capturan compra, no «conversación iniciada»). Aquí se ve el <b>reparto de gasto</b>; el costo/conv por plataforma se agrega cuando el conector lo entregue.</div>
        </div>
      </>)}

      <div className="foot">Datos reales {data.from} → {data.to} · Meta, campañas de mensajería (Presentación / Evaluación). Conversación = mensaje iniciado (nivel anuncio). Equilibrio = reparto de impresiones entre anuncios del ad set. Estado = <b>effective_status actual de Meta</b> (Activo / Pausado / Rechazado); si un anuncio aún no lo trae, se marca «En entrega» según su gasto reciente. Los segmentos nuevos/activos de Meta no aplican a mensajería; los «segmentos» son los propios ad sets.</div>

      {/* Modal */}
      {selAd && (
        <div className="adm on" onClick={(e) => { if ((e.target as HTMLElement).classList.contains('adm')) setSel(null); }}>
          <div className="adm-box">
            <span className="adm-close" onClick={() => setSel(null)}>✕</span>
            <div className="adm-top">
              <div className="adm-media">
                {posterUrl(selAd) ? <img src={posterUrl(selAd)} alt="" /> : null}
                {selAd.is_video && selAd.video_id && <a className="play" href={fbVideo(selAd.video_id)} target="_blank" rel="noreferrer">▶</a>}
              </div>
              <div className="adm-head">
                {(() => { const [tl, tc] = adTag(selAd); return <span className="badge" style={{ background: tc }}>{tl}</span>; })()}
                <h3>{shortAdset(selAd.name)}</h3>
                <div className="adm-chips">
                  <span style={{ background: stColor(selAd.st_cls), color: '#fff' }}>{selAd.st_cls === 'active' ? '● ' : ''}{selAd.st_label}</span>
                  <span>Campaña: {selAd.phase}</span>
                  <span>Ad set: {shortAdset(selAd.adset)}</span>
                  <span>{selAd.is_video ? 'Video' : 'Imagen'}</span>
                </div>
                <div className="adm-big">
                  <div><b style={{ color: WA }}>{selAd.conv}</b><span>Conversaciones</span></div>
                  <div><b>{money(selAd.cost_conv)}</b><span>Costo/conv</span></div>
                  <div><b>{money(selAd.spend)}</b><span>Invertido</span></div>
                </div>
              </div>
            </div>
            <div className="adm-body">
              <div className="adm-sec">Métricas del anuncio</div>
              <div className="mtab">
                <div className="mcell"><b>{kfmt(selAd.impr)}</b><span>Impresiones</span></div>
                <div className="mcell"><b>{selAd.conv}</b><span>Conversaciones</span><small>{money(selAd.cost_conv)}/conv</small></div>
                <div className="mcell"><b>{selAd.ctr}%</b><span>CTR enlace</span></div>
                <div className="mcell"><b>{money(selAd.spend)}</b><span>Invertido</span></div>
                <div className="mcell"><b>{money(selAd.cpm)}</b><span>CPM</span></div>
                <div className="mcell"><b>{selAd.is_video ? 'Video' : 'Imagen'}</b><span>Formato</span></div>
              </div>
              <div className="adm-sec">Texto del anuncio</div>
              <div className="copybox">{(selAd.title ? selAd.title + '\n\n' : '') + (selAd.body || '') + (selAd.cta ? `\n\n[ ${selAd.cta.replace(/_/g, ' ')} ]` : '') || 'Sin copy disponible.'}</div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .wa { max-width: 1140px; margin: 0 auto; color: ${INK}; font-size: 13px; }
        .muted { color: ${MUT}; }
        .wa-hd { padding: 6px 0 2px; }
        .brand { font-weight: 800; letter-spacing: .5px; font-size: 12px; }
        .brand small { color: ${MUT}; font-weight: 600; letter-spacing: 1.5px; }
        .pill { display: inline-block; background: ${WA}; color: #fff; font-size: 9.5px; font-weight: 800; border-radius: 20px; padding: 3px 9px; margin-left: 8px; vertical-align: middle; }
        h1 { font-size: 23px; font-weight: 800; margin: 10px 0 3px; }
        .sub { color: ${MUT}; font-size: 12.5px; }
        h2 { font-size: 16px; font-weight: 800; margin: 28px 0 3px; display: flex; align-items: center; gap: 8px; }
        .nn { width: 22px; height: 22px; border-radius: 7px; background: ${ACC}; color: #fff; font-size: 12px; display: flex; align-items: center; justify-content: center; }
        .h2sub { color: ${MUT}; font-size: 12px; margin: 0 0 14px 30px; }
        .card { background: #fff; border: 1px solid ${LINE}; border-radius: 16px; box-shadow: 0 4px 18px rgba(60,40,120,.05); padding: 20px 22px; margin-top: 12px; }
        .hero { display: flex; gap: 26px; align-items: center; flex-wrap: wrap; background: linear-gradient(135deg,#fff,#f2fbf6); }
        .hbig { font-size: 46px; font-weight: 800; color: ${WA}; line-height: 1; }
        .hbig span { display: block; font-size: 11px; color: ${MUT}; font-weight: 600; letter-spacing: 1px; }
        .hero-txt { flex: 1; min-width: 260px; }
        .hero-txt p { font-size: 14px; color: ${INK2}; line-height: 1.55; }
        .hstats { display: flex; gap: 22px; flex-wrap: wrap; margin-top: 12px; }
        .hstat b { font-size: 20px; font-weight: 800; display: block; }
        .hstat span { font-size: 10px; color: ${MUT}; text-transform: uppercase; letter-spacing: .5px; }
        .ai-wrap { margin-top: 28px; }
        .aihead { background: linear-gradient(120deg,${INK},#14532d 55%,${WA}); color: #fff; border-radius: 14px 14px 0 0; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
        .aihead .l { display: flex; align-items: center; gap: 9px; font-weight: 800; font-size: 14px; }
        .spark { width: 24px; height: 24px; border-radius: 7px; background: rgba(255,255,255,.16); display: flex; align-items: center; justify-content: center; }
        .aihead .badge { font-size: 9px; font-weight: 700; letter-spacing: .5px; opacity: .85; border: 1px solid rgba(255,255,255,.3); border-radius: 20px; padding: 3px 10px; }
        .aigrid { background: #fff; border: 1px solid ${LINE}; border-top: 0; border-radius: 0 0 14px 14px; padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 13px; box-shadow: 0 4px 18px rgba(60,40,120,.05); }
        .aic { border: 1px solid ${LINE}; border-radius: 13px; padding: 13px 15px; }
        .aic-h { display: flex; align-items: center; gap: 9px; margin-bottom: 9px; }
        .aic-ic { font-size: 17px; }
        .aic-h b { flex: 1; font-size: 13px; line-height: 1.25; }
        .aic-pri { font-size: 8.5px; font-weight: 800; padding: 2px 8px; border-radius: 20px; }
        .aic-row { display: flex; gap: 9px; margin-bottom: 6px; }
        .aic-lbl { width: 64px; flex: none; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: ${MUT}; padding-top: 1px; }
        .aic-row p { font-size: 11.5px; line-height: 1.5; color: ${INK2}; margin: 0; }
        .duel { width: 100%; border-collapse: collapse; }
        .duel th { font-size: 12px; padding: 9px 10px; border-bottom: 2px solid ${LINE}; text-align: center; }
        .duel th:first-child { text-align: left; color: ${MUT}; font-weight: 600; }
        .duel td { padding: 8px 10px; border-bottom: 1px solid #f4f2f9; font-size: 12.5px; }
        .duel td:first-child { color: ${MUT}; }
        .duel td.dv { text-align: center; font-weight: 600; }
        .verdict { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
        .vc { border-radius: 12px; padding: 13px 15px; font-size: 12px; line-height: 1.5; }
        .vc b { display: block; margin-bottom: 3px; }
        .vc.cold { background: rgba(91,157,249,.08); border: 1px solid rgba(91,157,249,.3); }
        .vc.warm { background: rgba(245,165,36,.08); border: 1px solid rgba(245,165,36,.3); }
        .aset { border: 1px solid ${LINE}; border-radius: 14px; padding: 14px 16px; margin-bottom: 12px; }
        .aset-h { display: flex; align-items: center; gap: 14px; }
        .aset-h > div:first-child { flex: 1; }
        .aset-n { font-weight: 800; font-size: 14px; }
        .aset-s { font-size: 11px; color: ${MUT}; }
        .aset-k { text-align: right; }
        .aset-k b { font-size: 17px; font-weight: 800; display: block; }
        .aset-k span { font-size: 9px; color: ${MUT}; }
        .aset-bal { font-size: 9px; font-weight: 800; padding: 6px 10px; border-radius: 9px; text-align: center; line-height: 1.3; letter-spacing: .3px; }
        .aset-bal b { font-size: 12px; }
        .dbar { display: flex; height: 26px; border-radius: 7px; overflow: hidden; margin: 11px 0 6px; gap: 1px; background: #f2eff8; }
        .dseg { height: 100%; min-width: 2px; opacity: .9; }
        .dleg { font-size: 10.5px; color: ${MUT}; }
        .cinsight { background: #faf9ff; border: 1px solid #ece7fb; border-radius: 12px; padding: 12px 15px; font-size: 12px; color: ${INK2}; margin-top: 12px; line-height: 1.5; }
        .agroup { background: #fff; border: 1px solid ${LINE}; border-radius: 16px; box-shadow: 0 4px 18px rgba(60,40,120,.05); padding: 16px 18px; margin-top: 14px; }
        .gh { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 13px; padding-bottom: 11px; border-bottom: 1px solid ${LINE}; }
        .gh-l { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
        .gchip { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; padding: 3px 9px; border-radius: 20px; }
        .gname { font-size: 15px; font-weight: 800; }
        .gwarn { font-size: 10px; font-weight: 700; color: ${RED}; background: rgba(229,56,77,.08); padding: 2px 8px; border-radius: 20px; }
        .gh-r { font-size: 11.5px; color: ${MUT}; }
        .gh-r b { color: ${INK}; font-weight: 800; }
        .gtoggle { margin-left: 12px; font-size: 11px; color: ${ACCD}; font-weight: 700; cursor: pointer; user-select: none; white-space: nowrap; }
        .gtoggle input { vertical-align: -1px; margin-right: 4px; accent-color: ${ACC}; }
        .gempty { grid-column: 1/-1; font-size: 11.5px; color: ${MUT}; background: #faf9ff; border: 1px dashed ${LINE}; border-radius: 11px; padding: 14px; }
        .cgrid { display: grid; grid-template-columns: repeat(auto-fill,minmax(172px,1fr)); gap: 14px; }
        .cc { background: #fff; border: 1px solid ${LINE}; border-radius: 13px; overflow: hidden; box-shadow: 0 2px 10px rgba(60,40,120,.05); cursor: pointer; transition: .16s; min-width: 0; }
        .cc:hover { transform: translateY(-3px); box-shadow: 0 10px 24px rgba(37,184,106,.18); }
        .cc.dim .cph { opacity: .62; filter: grayscale(.35); }
        .cph { position: relative; width: 100%; aspect-ratio: 1/1; background: #0d0c16; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .cph img { width: 100%; height: 100%; object-fit: cover; max-width: 100%; }
        .noimg { background: linear-gradient(135deg,#14532d,${WA}); color: #fff; font-size: 12px; font-weight: 700; text-align: center; padding: 14px; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
        .play { position: absolute; inset: 0; margin: auto; width: 46px; height: 46px; border-radius: 50%; background: rgba(23,18,38,.62); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; text-decoration: none; border: 2px solid rgba(255,255,255,.75); }
        .vlabel, .ilabel { position: absolute; top: 7px; left: 7px; font-size: 8px; font-weight: 800; padding: 2px 6px; border-radius: 5px; color: #fff; }
        .vlabel { background: ${RED}; }
        .ilabel { background: rgba(23,18,38,.55); }
        .stbadge { position: absolute; bottom: 7px; left: 7px; font-size: 8px; font-weight: 800; color: #fff; padding: 2px 7px; border-radius: 20px; letter-spacing: .3px; }
        .cbadge { position: absolute; top: 7px; right: 7px; font-size: 8px; font-weight: 800; color: #fff; padding: 2px 7px; border-radius: 20px; }
        .cmore { position: absolute; bottom: 7px; right: 7px; font-size: 9px; font-weight: 800; color: #fff; background: rgba(23,18,38,.6); padding: 3px 8px; border-radius: 20px; opacity: 0; transition: .15s; }
        .cc:hover .cmore { opacity: 1; }
        .cc figcaption { padding: 9px 11px 11px; }
        .cn { font-weight: 700; font-size: 11.5px; line-height: 1.25; height: 29px; overflow: hidden; }
        .cm { display: flex; gap: 9px; align-items: baseline; font-size: 11px; font-weight: 700; flex-wrap: wrap; margin-top: 5px; }
        .cm span { font-weight: 600; font-size: 10px; }
        .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .pcol h4 { font-size: 12.5px; margin-bottom: 8px; }
        .segrow { display: flex; align-items: center; gap: 12px; padding: 7px 0; }
        .seglbl { width: 120px; flex: none; }
        .seglbl b { font-size: 12px; display: block; }
        .seglbl span { font-size: 10px; color: ${MUT}; }
        .segbarwrap { flex: 1; display: flex; align-items: center; gap: 9px; background: #f2eff8; border-radius: 7px; height: 22px; position: relative; }
        .segbar { height: 100%; border-radius: 7px; min-width: 10px; }
        .segval { position: absolute; right: 9px; font-size: 11px; font-weight: 800; }
        .foot { margin-top: 26px; font-size: 10px; color: ${MUT}; border-top: 1px solid ${LINE}; padding-top: 12px; line-height: 1.5; }
        .adm { position: fixed; inset: 0; background: rgba(15,12,26,.55); z-index: 99; display: flex; align-items: flex-start; justify-content: center; padding: 34px 16px; overflow: auto; }
        .adm-box { background: #fff; border-radius: 18px; max-width: 720px; width: 100%; box-shadow: 0 30px 80px rgba(20,10,50,.4); overflow: hidden; position: relative; }
        .adm-top { display: flex; }
        .adm-media { width: 240px; flex: none; background: #0d0c16; position: relative; aspect-ratio: 1/1; }
        .adm-media img { width: 100%; height: 100%; object-fit: cover; }
        .adm-media .play { }
        .adm-head { flex: 1; padding: 18px 20px; }
        .adm-head .badge { font-size: 9px; font-weight: 800; color: #fff; padding: 3px 9px; border-radius: 20px; }
        .adm-head h3 { font-size: 15px; font-weight: 800; margin: 9px 0 5px; }
        .adm-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
        .adm-chips span { font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 2px 7px; border-radius: 5px; background: #f0eef7; color: ${MUT}; }
        .adm-big { display: flex; gap: 18px; }
        .adm-big div b { font-size: 20px; font-weight: 800; display: block; }
        .adm-big div span { font-size: 9px; color: ${MUT}; text-transform: uppercase; }
        .adm-body { padding: 4px 20px 20px; }
        .adm-sec { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px; color: ${WA}; margin: 16px 0 8px; }
        .mtab { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .mcell { background: #faf9ff; border: 1px solid #eee; border-radius: 10px; padding: 9px 11px; }
        .mcell b { font-size: 15px; font-weight: 800; display: block; }
        .mcell span { font-size: 9.5px; color: ${MUT}; }
        .mcell small { font-size: 9.5px; color: ${ACCD}; font-weight: 700; display: block; }
        .copybox { background: #faf9fe; border: 1px solid #ece8f6; border-radius: 11px; padding: 11px 13px; font-size: 11.5px; color: ${INK2}; line-height: 1.5; white-space: pre-wrap; max-height: 200px; overflow: auto; }
        .adm-close { position: absolute; top: 8px; right: 10px; font-size: 20px; color: #fff; background: rgba(0,0,0,.35); width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 2; }
        @media (max-width: 720px) { .aigrid, .two, .verdict, .cgrid { grid-template-columns: 1fr; } .adm-top { flex-direction: column; } .adm-media { width: 100%; } }
      `}</style>
    </div>
  );
}
