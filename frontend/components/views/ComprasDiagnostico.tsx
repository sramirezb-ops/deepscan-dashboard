'use client';

import { useMemo, useState } from 'react';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useMetaCompras, type ComprasHierNode, type ComprasMetric } from '@/lib/hooks/useMetaCompras';
import { formatCurrency, formatInt } from '@/lib/utils';

// Meta de ROAS que gobierna el semáforo. TODO: leerla de la config del cliente
// (como el target de Ofero); por ahora constante para Sneaker Store.
const GOAL = 6.5;

type Derived = {
  spend: number; purch: number; roas: number; atc: number; cpcart: number;
  ic: number; cpco: number; clicks: number; cpc: number; vc: number; cpvc: number;
  impr: number; reach: number; freq: number;
};
function derive(m: ComprasMetric): Derived {
  return {
    spend: m.spend, purch: m.purchases, roas: m.spend ? m.purchaseValue / m.spend : 0,
    atc: m.addToCart, cpcart: m.addToCart ? m.spend / m.addToCart : 0,
    ic: m.initiateCheckout, cpco: m.initiateCheckout ? m.spend / m.initiateCheckout : 0,
    clicks: m.clicks, cpc: m.clicks ? m.spend / m.clicks : 0,
    vc: m.viewContent, cpvc: m.viewContent ? m.spend / m.viewContent : 0,
    impr: m.impressions, reach: m.reach, freq: m.reach ? m.impressions / m.reach : 0,
  };
}

type ColT = 'm' | 'i' | 'x' | 'c' | 'f';
const COLS: { k: keyof Derived; l: string; t: ColT; sem?: boolean }[] = [
  { k: 'spend', l: 'Gasto', t: 'm' }, { k: 'purch', l: 'Compras', t: 'i' }, { k: 'roas', l: 'ROAS', t: 'x', sem: true },
  { k: 'atc', l: 'Carritos', t: 'i' }, { k: 'cpcart', l: '$/Carrito', t: 'c' },
  { k: 'ic', l: 'Checkouts', t: 'i' }, { k: 'cpco', l: '$/Checkout', t: 'c' },
  { k: 'clicks', l: 'Clics', t: 'i' }, { k: 'cpc', l: 'CPC', t: 'c' },
  { k: 'vc', l: 'Vista pág.', t: 'i' }, { k: 'cpvc', l: '$/Vista', t: 'c' },
  { k: 'impr', l: 'Impres.', t: 'i' }, { k: 'reach', l: 'Alcance', t: 'i' }, { k: 'freq', l: 'Frec.', t: 'f' },
];

function fmt(v: number, t: ColT, cur: string): string {
  if (!isFinite(v)) return '—';
  if (t === 'i') return formatInt(Math.round(v));
  if (t === 'x') return v > 0 ? v.toFixed(1) + '×' : '0×';
  if (t === 'f') return v > 0 ? v.toFixed(2) : '—';
  if (t === 'm') return formatCurrency(v, cur);
  if (t === 'c') return v > 0 ? (v >= 100 ? formatCurrency(v, cur) : '$' + v.toFixed(2)) : '—';
  return String(v);
}
function semCls(r: number): string {
  return r >= GOAL ? 'mc-good' : r >= GOAL * 0.7 ? 'mc-warn' : 'mc-bad';
}
function adKind(name: string): { c: string; i: string; t: string } {
  const n = (name || '').toLowerCase();
  if (/video|\breel/.test(n)) return { c: 'vid', i: '▶', t: 'Video' };
  if (/img|imagen|cat[aá]log|foto/.test(n)) return { c: 'img', i: '🖼', t: 'Imagen' };
  return { c: 'prd', i: '👟', t: 'Creativo' };
}

export function ComprasDiagnostico() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useMetaCompras(client.id, range, previous);
  const cur = client.currency;
  const rangeLabel = formatRangeLabel(range);

  const [exp, setExp] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<keyof Derived>('spend');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [preview, setPreview] = useState<{ node: ComprasHierNode; cmp: string; set: string } | null>(null);

  // ids estables por posición en la jerarquía original.
  const withIds = useMemo(() => {
    const hier = data?.hierarchy ?? [];
    return hier.map((c, ci) => ({
      ...c, _id: 'c' + ci,
      kids: (c.kids ?? []).map((a, ai) => ({ ...a, _id: 'c' + ci + 'a' + ai })),
    }));
  }, [data]);

  if (loading && !data) {
    return <div className="view on"><div className="hero" style={{ textAlign: 'center', padding: 60 }}><div style={{ fontSize: 14, color: 'var(--mu)' }}>Cargando compras de {client.name}…</div></div></div>;
  }
  if (error) {
    return <div className="view on"><div className="card" style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,.3)' }}><div style={{ color: '#ef4444', marginBottom: 8 }}>Error cargando datos</div><div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div></div></div>;
  }
  if (!data || !data.metaExistsEver) {
    return <div className="view on"><div className="card" style={{ padding: 40, textAlign: 'center' }}><div style={{ fontSize: 14, color: 'var(--mu)' }}>Sin datos de Meta para el período.</div></div></div>;
  }

  const t = data.totals;
  const split = data.spendSplit;
  const totalMeta = split.sales + split.whatsapp + split.brand || 1;
  const naiveRoas = totalMeta > 0 ? t.purchaseValue / totalMeta : 0;
  const pct = (v: number) => Math.round((v / totalMeta) * 100);

  const sortNodes = (arr: (ComprasHierNode & { _id?: string })[]) => {
    const c = arr.slice();
    c.sort((a, b) => sortDir * (((derive(a.m) as any)[sortKey] || 0) - ((derive(b.m) as any)[sortKey] || 0)));
    return c;
  };

  // Filas a pintar (jerarquía ordenada, respetando expansión).
  type Row = { lvl: number; id: string; node: ComprasHierNode; cmp?: string; set?: string };
  const rows: Row[] = [];
  sortNodes(withIds).forEach((c: any) => {
    rows.push({ lvl: 1, id: c._id, node: c });
    if (exp[c._id]) sortNodes(c.kids ?? []).forEach((a: any) => {
      rows.push({ lvl: 2, id: a._id, node: a, cmp: c.name });
      if (exp[a._id]) sortNodes(a.kids ?? []).forEach((ad) => {
        rows.push({ lvl: 3, id: '', node: ad, cmp: c.name, set: a.name });
      });
    });
  });

  const toggle = (id: string) => setExp((e) => {
    const n = { ...e, [id]: !e[id] };
    if (!n[id]) Object.keys(n).forEach((k) => { if (k.startsWith(id) && k !== id) delete n[k]; });
    return n;
  });
  const onSort = (k: keyof Derived) => { if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1)); else { setSortKey(k); setSortDir(-1); } };
  const expandAll = () => { const n: Record<string, boolean> = {}; withIds.forEach((c: any) => { n[c._id] = true; (c.kids ?? []).forEach((a: any) => (n[a._id] = true)); }); setExp(n); };

  // Acciones derivadas.
  const flat: { name: string; d: Derived }[] = [];
  data.hierarchy.forEach((c) => flat.push({ name: c.name, d: derive(c.m) }));
  const best = flat.filter((x) => x.d.roas >= GOAL && x.d.spend > 0).sort((a, b) => b.d.roas - a.d.roas)[0];
  const zeros = data.hierarchy.filter((c) => c.m.spend > 0 && c.m.purchases === 0);
  const worstMonth = (data.monthlyRoas ?? []).filter((m) => m.roas > 0).sort((a, b) => a.roas - b.roas)[0];
  const maxMR = Math.max(...(data.monthlyRoas ?? []).map((m) => m.roas), 1);
  const MO: Record<string, string> = { '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic' };

  return (
    <div className="view on">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="mc">

        {/* HERO */}
        <div className="mc-eyebrow">Meta Ads · Compras · {rangeLabel}</div>
        <div className="mc-hero">
          <div>
            <div className="mc-thesis">Las campañas de venta rinden <span className="hl">ROAS {t.roas.toFixed(1)}×</span> — el número mezclado esconde lo bueno.</div>
            <div className="mc-sub">El ROAS "de todo Meta" (~{naiveRoas.toFixed(1)}×) mete el gasto de <b>WhatsApp</b> en el denominador. Separado, las {data.campaignCount} campañas de venta devuelven <b>{cur} {t.roas.toFixed(1)} por cada 1</b>: <b>{formatCurrency(t.spend, cur)} → {formatCurrency(t.purchaseValue, cur)}</b> en {formatInt(t.purchases)} compras.</div>
          </div>
          <div className="mc-north">
            <div className="k">ROAS · campañas de venta</div>
            <div className="v">{t.roas.toFixed(1)}×</div>
            <div className="old">no <s>{naiveRoas.toFixed(1)}×</s> — eso mezcla WhatsApp</div>
            <div className="r">
              <div><div className="l">Compras</div><div className="rv">{formatInt(t.purchases)}</div></div>
              <div><div className="l">AOV</div><div className="rv">{formatCurrency(t.aov, cur)}</div></div>
              <div><div className="l">CPA</div><div className="rv">{formatCurrency(t.cpa, cur)}</div></div>
            </div>
          </div>
        </div>

        {/* SPLIT */}
        <div className="mc-sh"><h2>En qué se fue la inversión de Meta</h2><span className="hint">tres objetivos que no se deben mezclar</span></div>
        <div className="mc-splitbar">
          <div style={{ width: pct(split.sales) + '%', background: 'var(--up)' }} />
          <div style={{ width: pct(split.whatsapp) + '%', background: '#12b76a' }} />
          <div style={{ width: pct(split.brand) + '%', background: 'var(--t3)' }} />
        </div>
        <div className="mc-splitlg">
          <span className="it"><span className="sw" style={{ background: 'var(--up)' }} />Venta <b>{formatCurrency(split.sales, cur)}</b> <span className="mut">· ROAS {t.roas.toFixed(1)}×</span></span>
          <span className="it"><span className="sw" style={{ background: '#12b76a' }} />WhatsApp <b>{formatCurrency(split.whatsapp, cur)}</b> <span className="mut">· {formatInt(data.waConversations)} conv.</span></span>
          <span className="it"><span className="sw" style={{ background: 'var(--t3)' }} />Marca <b>{formatCurrency(split.brand, cur)}</b> <span className="mut">· top-funnel</span></span>
        </div>

        {/* EXPLORADOR */}
        <div className="mc-sh"><h2>Campañas de venta · explorador</h2><span className="hint">clic para desplegar · clic en una métrica para ordenar · clic en un anuncio para su preview</span></div>
        <div className="mc-mttop">
          <div className="mc-legend">
            <span>Meta ROAS <b>{GOAL}×</b></span>
            <span><span className="sw" style={{ background: 'var(--up)' }} />cumple</span>
            <span><span className="sw" style={{ background: 'var(--warn)' }} />cerca</span>
            <span><span className="sw" style={{ background: 'var(--dn)' }} />debajo</span>
          </div>
          <div className="mc-tools"><button className="mc-btn" onClick={expandAll}>Expandir todo</button><button className="mc-btn" onClick={() => setExp({})}>Colapsar</button></div>
        </div>
        <div className="mc-wrap"><div className="mc-scroll">
          <table className="mc-t">
            <thead><tr>
              <th style={{ cursor: 'default' }}>Campaña · conjunto · anuncio</th>
              {COLS.map((c) => (
                <th key={c.k} className={sortKey === c.k ? 'on' : ''} onClick={() => onSort(c.k)}>{c.l}<span className="ar">{sortKey === c.k ? (sortDir < 0 ? '▼' : '▲') : '⇅'}</span></th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const d = derive(r.node.m);
                const hasKids = r.lvl < 3;
                const open = !!exp[r.id];
                const k = r.lvl === 3 ? adKind(r.node.name) : null;
                return (
                  <tr key={r.id || 'ad' + i} className={`mcr${r.lvl}`}
                    onClick={() => (r.lvl === 3 ? setPreview({ node: r.node, cmp: r.cmp || '', set: r.set || '' }) : toggle(r.id))}>
                    <td>
                      <div className="mc-nmcell" style={{ paddingLeft: (r.lvl - 1) * 20 }}>
                        {hasKids ? <span className={`mc-cx${open ? ' open' : ''}`}>▸</span> : <span style={{ width: 11, flex: 'none' }} />}
                        {k && (
                          <span className="mc-thwrap">
                            {r.node.thumbUrl
                              ? <img className="mc-thmb" src={r.node.thumbUrl} alt="" loading="lazy" />
                              : <span className={`mc-thmb mc-${k.c}`}>{k.i}</span>}
                            {r.node.isVideo && <span className="mc-vbadge">▶</span>}
                          </span>
                        )}
                        <span className="mc-nm" title={r.node.name}>{r.node.name}</span>
                        {r.lvl === 3 && <span className="mc-pvhint">🔍 preview</span>}
                      </div>
                    </td>
                    {COLS.map((c) => (
                      <td key={c.k} className={c.sem ? semCls((d as any)[c.k]) : ''}>{fmt((d as any)[c.k], c.t, cur)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div></div>

        {/* FUNNEL */}
        <div className="mc-sh"><h2>Embudo de compra web</h2><span className="hint">píxel de Meta</span></div>
        <Funnel t={t} />

        {/* TREND + BRIDGE */}
        <div className="mc-sh"><h2>Tendencia y la venta que no se ve</h2></div>
        <div className="mc-duo">
          <div className="mc-mini"><h3>ROAS de compras por mes</h3>
            <div className="mc-spark">
              {(data.monthlyRoas ?? []).map((m) => (
                <div className="col" key={m.month}>
                  <div className="bv" style={{ color: m.roas >= GOAL ? 'var(--up)' : m.roas >= GOAL * 0.7 ? 'var(--warn)' : 'var(--dn)' }}>{m.roas.toFixed(1)}×</div>
                  <div className="bb" style={{ height: Math.max(6, (m.roas / maxMR) * 100) + '%', background: m.roas >= GOAL ? 'var(--up)' : m.roas >= GOAL * 0.7 ? 'var(--warn)' : 'var(--dn)' }} />
                  <div className="bl">{MO[m.month.slice(5)] || m.month}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="mc-mini mc-bridge"><h3>Las compras web son la punta del iceberg</h3>
            <div className="big"><div className="n" style={{ color: '#12b76a' }}>{formatInt(data.waConversations)}</div><div className="x">conversaciones de WhatsApp que Meta también generó</div></div>
            <p>El píxel solo cuenta la compra <b>que cierra en la web</b>. La mayoría de la venta que Meta empuja se cierra <b>conversando por WhatsApp</b> y se cobra en <b>AURA</b>. El ROAS web subvalora el retorno real de Meta.</p>
          </div>
        </div>

        {/* ACCIONES */}
        <div className="mc-sh"><h2>Acciones</h2><span className="hint">lente de agencia</span></div>
        <div className="mc-acts">
          {best && <div className="mc-act"><div className="tag"><span className="dot" style={{ background: 'var(--up)' }} />Escalar</div><div className="body"><b>{best.name.split('·')[0].trim()}:</b> ROAS {best.d.roas.toFixed(1)}× con {formatCurrency(best.d.spend, cur)} de gasto. Es la campaña de mejor retorno — subir presupuesto es la palanca más clara.</div></div>}
          {worstMonth && worstMonth.roas < GOAL && <div className="mc-act"><div className="tag"><span className="dot" style={{ background: 'var(--warn)' }} />Investigar</div><div className="body"><b>{MO[worstMonth.month.slice(5)] || worstMonth.month} rindió {worstMonth.roas.toFixed(1)}×</b>, debajo de la meta. Revisar fatiga de creativo, audiencia o mezcla ese mes.</div></div>}
          {zeros.length > 0 && <div className="mc-act"><div className="tag"><span className="dot" style={{ background: 'var(--dn)' }} />Revisar tracking</div><div className="body"><b>{zeros.length} campaña{zeros.length > 1 ? 's' : ''} de venta</b> gastó {formatCurrency(zeros.reduce((s, c) => s + c.m.spend, 0), cur)} con <b>0 compras</b>. Probable píxel sin disparar — validar el tracking antes de seguir invirtiendo ahí.</div></div>}
        </div>

        <div className="mc-fn">Meta Ads · Compras · datos de meta_campaigns · {rangeLabel} · {cur}. El ROAS de venta excluye WhatsApp y marca. La tabla trae las métricas por campaña → conjunto → anuncio. Meta de ROAS {GOAL}× (configurable por cliente).</div>
      </div>

      {preview && <Preview p={preview} cur={cur} onClose={() => setPreview(null)} />}
    </div>
  );
}

function Funnel({ t }: { t: { impressions: number; clicks: number; viewContent: number; addToCart: number; initiateCheckout: number; purchases: number } }) {
  const max = Math.max(t.impressions, 1);
  const w = (v: number) => Math.max(6, (v / max) * 100);
  const steps: [string, number, string][] = [
    ['Impresiones', t.impressions, ''],
    ['Clics', t.clicks, t.impressions ? 'CTR ' + ((t.clicks / t.impressions) * 100).toFixed(1) + '%' : ''],
    ['View content', t.viewContent, t.clicks ? Math.round((t.viewContent / t.clicks) * 100) + '% de clics' : ''],
    ['Agregó al carrito', t.addToCart, t.viewContent ? ((t.addToCart / t.viewContent) * 100).toFixed(1) + '% de VC' : ''],
    ['Checkout', t.initiateCheckout, t.addToCart ? Math.round((t.initiateCheckout / t.addToCart) * 100) + '% del carrito' : ''],
    ['Compra', t.purchases, t.initiateCheckout ? ((t.purchases / t.initiateCheckout) * 100).toFixed(1) + '% del checkout' : ''],
  ];
  return (
    <div className="mc-funnel">
      {steps.map((s, i) => (
        <div className="mc-fstep" key={s[0]}>
          <div className="fl">{s[0]}</div>
          <div className="ft"><div className="ff" style={{ width: w(s[1]) + '%', background: i >= 3 && i < 5 ? 'var(--warn)' : i === 5 ? 'var(--up)' : '#5b6cff' }}>{formatInt(s[1])}</div></div>
          <div className="fp">{s[2]}</div>
        </div>
      ))}
    </div>
  );
}

function Preview({ p, cur, onClose }: { p: { node: ComprasHierNode; cmp: string; set: string }; cur: string; onClose: () => void }) {
  const k = adKind(p.node.name);
  const d = derive(p.node.m);
  const mm: [string, string][] = [
    ['Gasto', formatCurrency(d.spend, cur)], ['Compras', formatInt(d.purch)], ['ROAS', d.roas > 0 ? d.roas.toFixed(1) + '×' : '0×'],
    ['Carritos', formatInt(d.atc)], ['Checkouts', formatInt(d.ic)], ['CPC', d.cpc > 0 ? '$' + d.cpc.toFixed(2) : '—'],
  ];
  return (
    <div className="mc-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mc-card">
        <div className={`mc-media mc-${k.c}`}>
          <button className="mc-x" onClick={onClose}>✕</button>
          {p.node.thumbUrl
            ? <><img src={p.node.thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />{p.node.isVideo && <div className="mc-playbig">▶</div>}</>
            : <><div className="ico">{k.i}</div><div className="lbl">{k.t} · sin miniatura</div></>}
        </div>
        <div className="mc-body">
          <div className="mc-crumb">{p.cmp} › {p.set}</div>
          <div className="mc-name">{p.node.name}</div>
          <div className="mc-metrics">{mm.map((x) => <div className="m" key={x[0]}><div className="l">{x[0]}</div><div className="v">{x[1]}</div></div>)}</div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.mc{--good:var(--up);--bad:var(--dn)}
.mc-eyebrow{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--t3);margin-bottom:16px}
.mc-hero{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:36px;align-items:end;padding-bottom:32px;border-bottom:1px solid var(--b1)}
.mc-thesis{font-size:clamp(21px,2.9vw,32px);font-weight:800;letter-spacing:-.02em;line-height:1.17}
.mc-thesis .hl{color:var(--up)}
.mc-sub{font-size:13px;color:var(--t2);margin-top:14px;line-height:1.6}.mc-sub b{color:var(--t1)}
.mc-north .k{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--t3);margin-bottom:8px}
.mc-north .v{font-size:clamp(38px,5vw,54px);font-weight:800;letter-spacing:-.03em;line-height:.95;color:var(--up);font-family:'Space Grotesk',sans-serif}
.mc-north .old{font-size:12px;color:var(--t3);margin-top:8px}.mc-north .old s{color:var(--dn)}
.mc-north .r{display:flex;gap:20px;margin-top:14px}.mc-north .r .l{font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--t3)}
.mc-north .r .rv{font-size:17px;font-weight:800;margin-top:2px;font-family:'Space Grotesk',sans-serif}
.mc-sh{display:flex;align-items:baseline;gap:12px;margin:40px 0 16px}.mc-sh h2{font-size:14.5px;font-weight:700;margin:0}.mc-sh .hint{font-size:11.5px;color:var(--t3)}
.mc-splitbar{height:15px;border-radius:8px;overflow:hidden;display:flex;background:var(--bg3)}
.mc-splitlg{display:flex;gap:20px;flex-wrap:wrap;font-size:12px;margin-top:11px}.mc-splitlg .it{display:flex;align-items:center;gap:7px}
.mc-splitlg .sw{width:10px;height:10px;border-radius:3px}.mc-splitlg b{font-weight:800}.mc-splitlg .mut{color:var(--t3)}
.mc-mttop{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:11px}
.mc-legend{display:flex;align-items:center;gap:13px;font-size:11.5px;color:var(--t3);flex-wrap:wrap}.mc-legend b{color:var(--t1)}
.mc-legend .sw{width:9px;height:9px;border-radius:3px;display:inline-block;margin-right:5px;vertical-align:middle}
.mc-tools{display:flex;gap:8px}.mc-btn{font-size:11.5px;font-weight:600;color:var(--t2);background:var(--bg3);border:1px solid var(--b1);border-radius:8px;padding:6px 11px;cursor:pointer}
.mc-wrap{border:1px solid var(--b2);border-radius:14px;overflow:hidden;background:var(--bg1)}
.mc-scroll{overflow-x:auto}
table.mc-t{border-collapse:collapse;width:100%;min-width:1200px;font-size:12.5px}
.mc-t th{background:var(--bg2);font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--t3);padding:11px 12px;text-align:right;white-space:nowrap;cursor:pointer;user-select:none;border-bottom:1px solid var(--b2)}
.mc-t th:first-child{text-align:left;position:sticky;left:0;z-index:3;background:var(--bg2);min-width:280px;cursor:default}
.mc-t th.on{color:var(--acc)}.mc-t th .ar{margin-left:3px;font-size:9px;opacity:.35}.mc-t th.on .ar{opacity:1}
.mc-t td{padding:11px 12px;border-bottom:1px solid var(--b1);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--t2)}
.mc-t td:first-child{text-align:left;position:sticky;left:0;z-index:1;background:var(--bg1);box-shadow:1px 0 0 var(--b1)}
.mc-t tr:hover td{background:var(--bg2)}.mc-t tr:hover td:first-child{background:var(--bg2)}
.mc-t tr.mcr1{cursor:pointer;font-weight:600}.mc-t tr.mcr1 td{color:var(--t1)}
.mc-t tr.mcr2{cursor:pointer}.mc-t tr.mcr2 td:first-child{background:color-mix(in srgb,var(--acc) 4%,var(--bg1))}
.mc-t tr.mcr3{cursor:pointer}.mc-t tr.mcr3 td:first-child{background:color-mix(in srgb,var(--acc) 7%,var(--bg1))}
.mc-t td.mc-good{color:var(--up)!important;font-weight:700}.mc-t td.mc-warn{color:var(--warn)!important;font-weight:700}.mc-t td.mc-bad{color:var(--dn)!important;font-weight:700}
.mc-nmcell{display:flex;align-items:center;gap:9px;min-width:0}
.mc-cx{width:11px;color:var(--t3);font-size:9px;transition:transform .15s;flex:none}.mc-cx.open{transform:rotate(90deg)}
.mc-nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px}
.mc-thmb{width:28px;height:28px;border-radius:6px;flex:none;display:grid;place-items:center;font-size:12px;color:#fff;object-fit:cover}
.mc-thmb.mc-img{background:linear-gradient(135deg,#f0975b,#e0655b)}.mc-thmb.mc-vid{background:linear-gradient(135deg,#5b6cff,#8e5bff)}.mc-thmb.mc-prd{background:linear-gradient(135deg,#0f9d58,#12b877)}
.mc-thwrap{position:relative;flex:none;width:28px;height:28px;display:grid}
.mc-vbadge{position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:10px;text-shadow:0 1px 3px rgba(0,0,0,.7);pointer-events:none}
.mc-playbig{position:absolute;inset:0;display:grid;place-items:center;font-size:44px;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.6);pointer-events:none}
.mc-pvhint{margin-left:auto;font-size:10px;color:var(--acc);opacity:0;transition:opacity .12s;padding-left:8px}.mc-t tr.mcr3:hover .mc-pvhint{opacity:1}
.mc-funnel{display:flex;flex-direction:column;gap:7px}
.mc-fstep{display:grid;grid-template-columns:120px 1fr auto;gap:14px;align-items:center}.mc-fstep .fl{font-size:12.5px;font-weight:600;color:var(--t1)}
.mc-fstep .ft{position:relative;height:30px;background:var(--bg3);border-radius:7px;overflow:hidden}
.mc-fstep .ff{height:100%;border-radius:7px;display:flex;align-items:center;padding:0 11px;color:#fff;font-weight:800;font-size:12.5px}
.mc-fstep .fp{font-size:11.5px;color:var(--t3);white-space:nowrap;min-width:120px;text-align:right}
.mc-duo{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.mc-mini{background:var(--bg1);border:1px solid var(--b1);border-radius:14px;padding:22px}.mc-mini h3{font-size:13px;font-weight:700;margin:0 0 16px}
.mc-spark{display:flex;align-items:flex-end;gap:10px;height:96px}.mc-spark .col{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;justify-content:flex-end}
.mc-spark .bb{width:100%;border-radius:5px 5px 0 0;min-height:4px}.mc-spark .bl{font-size:10px;color:var(--t3)}.mc-spark .bv{font-size:11px;font-weight:800;font-family:'Space Grotesk',sans-serif}
.mc-bridge .big{display:flex;align-items:baseline;gap:10px;margin-bottom:4px}.mc-bridge .big .n{font-size:32px;font-weight:800;font-family:'Space Grotesk',sans-serif}.mc-bridge .big .x{font-size:12px;color:var(--t2)}
.mc-bridge p{font-size:12.5px;color:var(--t2);line-height:1.55;margin-top:10px}.mc-bridge p b{color:var(--t1)}
.mc-acts{display:flex;flex-direction:column;border-top:1px solid var(--b1)}
.mc-act{display:grid;grid-template-columns:150px 1fr;gap:20px;padding:18px 2px;border-bottom:1px solid var(--b1);align-items:baseline}
.mc-act .tag{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:700}.mc-act .tag .dot{width:9px;height:9px;border-radius:50%}
.mc-act .body{font-size:13px;color:var(--t2);line-height:1.55}.mc-act .body b{color:var(--t1)}
.mc-fn{margin-top:34px;font-size:11px;color:var(--t3);border-top:1px solid var(--b1);padding-top:16px;line-height:1.6}
.mc-ov{position:fixed;inset:0;background:rgba(10,8,20,.62);backdrop-filter:blur(3px);display:grid;place-items:center;z-index:200;padding:20px}
.mc-card{background:var(--bg1);border:1px solid var(--b2);border-radius:16px;width:min(430px,94vw);overflow:hidden;box-shadow:0 24px 70px -20px rgba(10,8,30,.5)}
.mc-media{aspect-ratio:16/10;display:grid;place-items:center;position:relative;gap:8px;overflow:hidden}
.mc-media.mc-img{background:linear-gradient(135deg,#f0975b,#e0655b)}.mc-media.mc-vid{background:linear-gradient(135deg,#5b6cff,#8e5bff)}.mc-media.mc-prd{background:linear-gradient(135deg,#0f9d58,#12b877)}
.mc-media .ico{font-size:44px}.mc-media .lbl{font-size:11.5px;color:rgba(255,255,255,.85);font-weight:600}
.mc-x{position:absolute;top:12px;right:14px;width:30px;height:30px;border-radius:50%;background:rgba(0,0,0,.4);color:#fff;border:none;font-size:16px;cursor:pointer;display:grid;place-items:center;z-index:2}
.mc-body{padding:18px 20px 20px}.mc-crumb{font-size:11px;color:var(--t3);margin-bottom:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mc-name{font-size:15px;font-weight:800;letter-spacing:-.01em;line-height:1.3}
.mc-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:16px}
.mc-metrics .m{background:var(--bg3);border-radius:10px;padding:10px 11px}.mc-metrics .m .l{font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--t3)}
.mc-metrics .m .v{font-size:16px;font-weight:800;font-family:'Space Grotesk',sans-serif;margin-top:3px}
@media(max-width:820px){.mc-hero{grid-template-columns:1fr;gap:22px;align-items:start}.mc-duo{grid-template-columns:1fr}.mc-fstep{grid-template-columns:92px 1fr}.mc-fstep .fp{display:none}.mc-act{grid-template-columns:1fr;gap:6px}.mc-t th:first-child,.mc-t td:first-child{min-width:200px}.mc-nm{max-width:150px}}
`;
