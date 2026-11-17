'use client';

import { useState, Fragment } from 'react';
import { LeadsOverview } from './LeadsOverview';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useEcommercePerf, roasAction, type PerfAction, type CampaignRow, type AdRow, type AdLite, type DiagFactor } from '@/lib/hooks/useEcommercePerf';
import { formatCurrency, formatInt, formatDelta, deltaDirection } from '@/lib/utils';

// ── Router del Overview ejecutivo ────────────────────────────
// Cliente "modelo de leads puro" (objetivo 'leads' y SIN 'ventas', ej. Ofero) →
// overview de leads. El resto (ecommerce, ej. Sneakers Store) → overview de
// RESULTADOS & ROAS de abajo. Branch por COMPONENTE para orden de hooks estable.
export function OverviewSwitch() {
  const client = useClient();
  const isLeadsModel =
    client.objectives.includes('leads') && !client.objectives.includes('ventas');
  return isLeadsModel ? <LeadsOverview /> : <Overview />;
}

// Semáforo de acción → color.
const ACT_COLOR: Record<PerfAction, string> = { escalar: 'var(--up)', vigilar: 'var(--warn)', cortar: '#ef4444' };
// Factor de falla → etiqueta corta + color (para el diagnóstico expandible).
const FACTOR: Record<DiagFactor, { label: string; color: string }> = {
  ok: { label: 'En objetivo', color: 'var(--up)' },
  fatiga: { label: 'Fatiga de público', color: '#ef4444' },
  creativo: { label: 'Creativo', color: 'var(--warn)' },
  angulo: { label: 'Ángulo', color: 'var(--warn)' },
  publico: { label: 'Público', color: 'var(--warn)' },
  postclic: { label: 'Post-clic (no medible)', color: 'var(--t2)' },
};

function roasCol(roas: number, target: number): string {
  return roas >= target ? 'var(--up)' : roas >= target * 0.6 ? 'var(--warn)' : '#ef4444';
}

function AdChip({ a, target, cfmt, rx }: { a: AdLite; target: number; cfmt: (v: number) => string; rx: (v: number) => string }) {
  return (
    <div className="ov-adchip">
      <div className="th" style={a.thumb ? { backgroundImage: `url(${a.thumb})` } : undefined} />
      <div style={{ minWidth: 0 }}>
        <div className="nm" title={a.name}>{a.name}</div>
        <div className="mx"><b style={{ color: roasCol(a.roas, target) }}>{rx(a.roas)}</b> · CTR {a.ctr.toFixed(1)}% · {cfmt(a.spend)}</div>
      </div>
    </div>
  );
}

function DiagPanel({ c, target, cfmt, rx }: { c: CampaignRow; target: number; cfmt: (v: number) => string; rx: (v: number) => string }) {
  const d = c.diag;
  const fx = FACTOR[d.factor];
  const ctrRatio = d.benchCtr > 0 ? Math.min(100, (d.ctr / d.benchCtr) * 100) : 0;
  const withSpend = c.ads.filter((a) => a.spend > 200);
  const best = withSpend.slice(0, 2);
  const nWorst = Math.min(2, Math.max(0, withSpend.length - 2));
  const worst = nWorst > 0 ? withSpend.slice(-nWorst).reverse() : [];
  const adsets = c.adsets.filter((a) => a.spend > 200);
  return (
    <div className="ov-diag">
      <div className="ov-diag-head">
        <span className="ov-diag-badge" style={{ background: fx.color }}>{fx.label}</span>
        <div><div className="t">{d.title}</div><div className="dt">{d.detail}</div></div>
      </div>
      <div className="ov-diag-grid">
        <div className="ov-diag-metric">
          <div className="l">Enganche · CTR</div>
          <div className="v">{d.ctr.toFixed(1)}% <span className="mu">vs {d.benchCtr.toFixed(1)}% ganadoras</span></div>
          <div className="bar"><div style={{ width: `${ctrRatio}%`, background: d.ctr >= d.benchCtr ? 'var(--up)' : 'var(--warn)' }} /></div>
        </div>
        <div className="ov-diag-metric">
          <div className="l">Frecuencia</div>
          <div className="v" style={{ color: c.freq >= 3.5 ? '#ef4444' : 'var(--t1)' }}>{c.freq.toFixed(1)}</div>
          <div className="mu">{c.freq >= 3.5 ? 'fatiga' : 'sana'}</div>
        </div>
      </div>
      {best.length > 0 && (
        <>
          <div className="ov-diag-sub">Creativos · mejor vs peor (por ROAS)</div>
          <div className="ov-diag-ads">
            {best.map((a) => <AdChip key={'b' + a.name} a={a} target={target} cfmt={cfmt} rx={rx} />)}
            {worst.length > 0 && <span className="ov-diag-vs">vs</span>}
            {worst.map((a) => <AdChip key={'w' + a.name} a={a} target={target} cfmt={cfmt} rx={rx} />)}
          </div>
        </>
      )}
      {adsets.length > 1 && (
        <>
          <div className="ov-diag-sub">Públicos · adsets</div>
          <div className="ov-diag-adsets">
            {adsets.slice(0, 4).map((s) => (
              <div className="ov-aset" key={s.name}>
                <span className="nm" title={s.name}>{s.name}</span>
                <span className="mu">CTR {s.ctr.toFixed(1)}%</span>
                <span style={{ color: roasCol(s.roas, target), fontWeight: 700 }}>{rx(s.roas)}</span>
                <span className="mu">{cfmt(s.spend)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
const ACT_LABEL: Record<PerfAction, string> = { escalar: 'Escalar', vigilar: 'Vigilar', cortar: 'Cortar' };

const CSS = `
.ov-root{--meta:#6a7cff;--aura:#a98cff}
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
.ov-thesis .hl{color:var(--up)}
.ov-thesis-sub{font-size:13.5px;color:var(--t2);margin-top:16px;max-width:58ch;line-height:1.6}
.ov-thesis-sub b{color:var(--t1)}
.ov-north .k{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--t3);margin-bottom:8px}
.ov-north .v{font-size:clamp(34px,4.6vw,50px);font-weight:800;letter-spacing:-.03em;line-height:.95}
.ov-north .r{display:flex;gap:22px;margin-top:16px;flex-wrap:wrap}
.ov-north .r .l{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--t3)}
.ov-north .r .rv{font-size:19px;font-weight:800;margin-top:2px}
.ov-sh{display:flex;align-items:baseline;gap:12px;margin:42px 0 18px}
.ov-sh h2{font-size:15px;font-weight:700;letter-spacing:-.01em;margin:0}
.ov-sh .hint{font-size:12px;color:var(--t3)}
.ov-strip{display:grid;grid-template-columns:repeat(5,1fr);border-top:1px solid var(--b1);border-bottom:1px solid var(--b1)}
.ov-cell{padding:20px 22px;border-left:1px solid var(--b1)}
.ov-cell:first-child{border-left:none;padding-left:2px}
.ov-cell .l{font-size:10.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--t3)}
.ov-cell .v{font-size:26px;font-weight:800;letter-spacing:-.02em;margin-top:7px}
.ov-cell .d{font-size:11px;margin-top:5px;color:var(--t3)}
.ov-cell .d.up{color:var(--up);font-weight:600}.ov-cell .d.dn{color:var(--warn);font-weight:600}
/* Tabla de campañas */
.ov-ctbl{width:100%;border-collapse:collapse;font-size:13px}
.ov-ctbl th{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--t3);text-align:right;padding:9px 12px;border-bottom:1px solid var(--b1)}
.ov-ctbl th:first-child{text-align:left}
.ov-ctbl td{padding:12px;border-bottom:1px solid var(--b1);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.ov-ctbl td:first-child{text-align:left;white-space:normal}
.ov-ctbl tr:hover td{background:var(--bg3)}
.ov-cname{font-weight:600;max-width:420px;overflow:hidden;text-overflow:ellipsis}
.ov-seg{display:inline-block;font-size:9.5px;font-weight:800;letter-spacing:.04em;padding:2px 7px;border-radius:999px;margin-left:8px;vertical-align:middle}
.ov-seg.aura{background:rgba(169,140,255,.16);color:var(--aura)}
.ov-roas{font-weight:800}
.ov-act{display:inline-flex;align-items:center;gap:7px;font-weight:700;font-size:12px}
.ov-act .dot{width:8px;height:8px;border-radius:50%}
/* Creativos */
.ov-crea{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.ov-card{background:var(--bg1);border:1px solid var(--b1);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
.ov-card .thumb{aspect-ratio:1/1;background:var(--bg3);background-size:cover;background-position:center;position:relative}
.ov-card .badge{position:absolute;top:10px;left:10px;background:rgba(0,0,0,.72);color:#fff;font-weight:800;font-size:15px;padding:4px 10px;border-radius:999px;backdrop-filter:blur(4px)}
.ov-card .seg2{position:absolute;top:10px;right:10px;font-size:9px;font-weight:800;letter-spacing:.04em;padding:3px 8px;border-radius:999px;background:rgba(169,140,255,.9);color:#fff}
.ov-card .meta{padding:13px 15px}
.ov-card .meta .nm{font-size:12.5px;font-weight:600;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:34px}
.ov-card .meta .st{display:flex;gap:14px;margin-top:9px;font-size:11px;color:var(--t3)}
.ov-card .meta .st b{color:var(--t1);font-weight:700}
/* Duo Agencia vs AURA */
.ov-duo{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.ov-mini{background:var(--bg1);border:1px solid var(--b1);border-radius:14px;padding:22px}
.ov-mini .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.ov-mini .top .t{font-size:13px;font-weight:700}
.ov-mini .chip{font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:3px 9px;border-radius:999px}
.ov-mini .chip.ag{background:rgba(23,184,119,.13);color:var(--up)}
.ov-mini .chip.au{background:rgba(169,140,255,.16);color:var(--aura)}
.ov-mini .big{display:flex;align-items:baseline;gap:10px}
.ov-mini .big .n{font-size:34px;font-weight:800;letter-spacing:-.02em}
.ov-mini .big .x{font-size:12px;color:var(--t2)}
.ov-mini .row3{display:flex;gap:22px;margin-top:14px}
.ov-mini .row3 .l{font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--t3)}
.ov-mini .row3 .rv{font-size:15px;font-weight:800;margin-top:3px}
.ov-fn{margin-top:38px;display:flex;gap:24px;flex-wrap:wrap;align-items:center;font-size:11.5px;color:var(--t3);border-top:1px solid var(--b1);padding-top:18px}
.ov-fn b{color:var(--t2);font-weight:800}
/* Fila expandible + diagnóstico */
.ov-ctbl th:nth-child(2),.ov-ctbl td:nth-child(2){text-align:left;white-space:normal}
.ov-crow{cursor:pointer}
.ov-crow:hover td{background:var(--bg3)}
.ov-chev{color:var(--t3);font-size:11px;width:16px;text-align:center}
.ov-fx{font-size:10.5px;font-weight:700;margin-top:3px;display:flex;align-items:center;gap:4px}
.ov-diagrow td{background:var(--bg3);padding:0!important}
.ov-diag{padding:18px 16px;border-left:3px solid var(--acc)}
.ov-diag-head{display:flex;gap:12px;align-items:flex-start;margin-bottom:16px}
.ov-diag-badge{flex:none;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#fff;padding:4px 10px;border-radius:999px;margin-top:2px}
.ov-diag-head .t{font-size:13.5px;font-weight:700}
.ov-diag-head .dt{font-size:12.5px;color:var(--t2);line-height:1.5;margin-top:3px;max-width:78ch}
.ov-diag-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:520px;margin-bottom:18px}
.ov-diag-metric .l{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--t3)}
.ov-diag-metric .v{font-size:16px;font-weight:800;margin-top:4px}
.ov-diag-metric .v .mu,.ov-diag-metric .mu{font-size:11px;font-weight:500;color:var(--t3)}
.ov-diag-metric .bar{height:6px;border-radius:3px;background:var(--b1);overflow:hidden;margin-top:7px}
.ov-diag-metric .bar>div{height:100%;border-radius:3px}
.ov-diag-sub{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--t3);margin:14px 0 9px}
.ov-diag-ads{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.ov-diag-vs{font-size:11px;color:var(--t3);font-weight:700;padding:0 2px}
.ov-adchip{display:flex;gap:9px;align-items:center;background:var(--bg1);border:1px solid var(--b1);border-radius:10px;padding:8px 11px 8px 8px;max-width:270px}
.ov-adchip .th{width:34px;height:34px;border-radius:7px;background:var(--bg3) center/cover no-repeat;flex:none}
.ov-adchip .nm{font-size:11.5px;font-weight:600;line-height:1.25;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ov-adchip .mx{font-size:10.5px;color:var(--t3);margin-top:2px}
.ov-diag-adsets{display:flex;flex-direction:column;gap:6px;max-width:560px}
.ov-aset{display:grid;grid-template-columns:1fr auto auto auto;gap:14px;font-size:11.5px;align-items:center;padding:6px 10px;background:var(--bg1);border:1px solid var(--b1);border-radius:8px}
.ov-aset .nm{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ov-aset .mu{color:var(--t3)}
@media(max-width:820px){.ov-hero{grid-template-columns:1fr;gap:26px;align-items:start}.ov-strip{grid-template-columns:1fr 1fr}.ov-cell:nth-child(3){border-left:none}.ov-duo{grid-template-columns:1fr}.ov-crea{grid-template-columns:1fr 1fr}.ov-cname{max-width:200px}.ov-diag-grid{grid-template-columns:1fr}}
@media(max-width:520px){.ov-crea{grid-template-columns:1fr}}
`;

export function Overview() {
  const client = useClient();
  const { range, previous } = usePeriod();
  // Objetivo ROAS de referencia (config por cliente en getClient · CLIENT_TARGETS).
  // Default 4 si no hay. Se pasa al hook para el benchmark y el diagnóstico.
  const target = client.roasTarget ?? 4;
  const { data, loading, error } = useEcommercePerf(client.id, range, previous, target);
  const [expanded, setExpanded] = useState<string | null>(null);

  const rangeLabel = formatRangeLabel(range);
  const cur = client.currency;
  const cfmt = (v: number) => formatCurrency(v, cur);
  const rx = (v: number) => `${v.toFixed(2)}×`;
  const txT = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}×`; // objetivo "limpio" (7×, no 7.00×)

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>Cargando resultados de {client.name}…</div>
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
  if (!data || data.meta.spend === 0) {
    return (
      <div className="view on">
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>Sin inversión registrada en el período.</div>
        </div>
      </div>
    );
  }

  const m = data.meta;
  const roasColor = (r: number) => (r >= target ? 'var(--up)' : r >= target * 0.6 ? 'var(--warn)' : '#ef4444');
  const onTarget = m.roas >= target;
  const enRitmo = m.roasDelta >= 0;
  const topCampaigns = data.campaigns.filter((c) => c.spend > 0).slice(0, 8);
  const topAds = data.ads.slice(0, 6);
  const ag = data.segments.agencia;
  const au = data.segments.aura;

  const seg = (c: CampaignRow | AdRow) => (c.segment === 'AURA' ? <span className="ov-seg aura">MOTOR AURA</span> : null);

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
              <div className="s">Overview · Resultados &amp; ROAS</div>
            </div>
          </div>
          <div className="ov-meta">
            <span className="st"><span className="dot" style={{ background: enRitmo ? 'var(--up)' : 'var(--warn)' }} />{enRitmo ? 'En ritmo' : 'Atención'}</span>
            <span>{rangeLabel}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{cur}</span>
          </div>
        </div>

        {/* HERO */}
        <div className="ov-hero">
          <div>
            <div className="ov-eyebrow" style={{ marginBottom: 18 }}>La lectura del período</div>
            <div className="ov-thesis">Revenue de compra <span className="hl">{cfmt(m.revenue)}</span> a ROAS <span style={{ color: roasColor(m.roas) }}>{rx(m.roas)}</span> · objetivo {txT(target)}.</div>
            <div className="ov-thesis-sub">
              Lo que rinde, lo que hay que <b>escalar</b> y con qué <b>creativos</b> — medido sobre la inversión en Meta Ads de {client.name}. {data.google ? 'Google PMAX se reporta aparte.' : ''}
            </div>
          </div>
          <div className="ov-north">
            <div className="k">Revenue · compra (Meta)</div>
            <div className="v" style={{ color: 'var(--up)' }}>{cfmt(m.revenue)}</div>
            <div className="r">
              <div><div className="l">ROAS</div><div className="rv" style={{ color: roasColor(m.roas) }}>{rx(m.roas)}</div></div>
              <div><div className="l">Objetivo</div><div className="rv" style={{ color: 'var(--t3)' }}>{txT(target)}</div></div>
              <div><div className="l">Inversión</div><div className="rv">{cfmt(m.spend)}</div></div>
              <div><div className="l">Compras</div><div className="rv">{formatInt(m.purchases)}</div></div>
            </div>
          </div>
        </div>

        {/* KPI STRIP */}
        <div className="ov-sh"><h2>Indicadores</h2><span className="hint">vs período anterior</span></div>
        <div className="ov-strip">
          <div className="ov-cell"><div className="l">Revenue compra</div><div className="v">{cfmt(m.revenue)}</div><div className={`d ${deltaDirection(m.revenueDelta)}`}>{formatDelta(m.revenueDelta)}</div></div>
          <div className="ov-cell"><div className="l">ROAS</div><div className="v" style={{ color: roasColor(m.roas) }}>{rx(m.roas)}</div><div className={`d ${deltaDirection(m.roasDelta)}`}>{formatDelta(m.roasDelta)} · obj {txT(target)}</div></div>
          <div className="ov-cell"><div className="l">Inversión</div><div className="v">{cfmt(m.spend)}</div><div className="d">Meta Ads{data.google ? ` · Google ${cfmt(data.google.spend)} aparte` : ''}</div></div>
          <div className="ov-cell"><div className="l">Compras</div><div className="v">{formatInt(m.purchases)}</div><div className={`d ${deltaDirection(m.purchasesDelta)}`}>{formatDelta(m.purchasesDelta)}</div></div>
          <div className="ov-cell"><div className="l">Costo por compra</div><div className="v">{cfmt(m.cpa)}</div><div className="d">CPA Meta</div></div>
        </div>

        {/* QUÉ ESCALAR */}
        <div className="ov-sh"><h2>Qué escalar</h2><span className="hint">clic en una campaña para ver el factor de falla · semáforo vs objetivo {txT(target)}</span></div>
        <table className="ov-ctbl">
          <thead><tr><th style={{ width: 16 }}></th><th>Campaña</th><th>Inversión</th><th>Revenue</th><th>ROAS</th><th>Compras</th><th>Acción</th></tr></thead>
          <tbody>
            {topCampaigns.map((c) => {
              const act = roasAction(c.roas, target);
              const open = expanded === c.name;
              const below = c.roas < target;
              const fx = FACTOR[c.diag.factor];
              return (
                <Fragment key={c.name}>
                  <tr className="ov-crow" onClick={() => setExpanded(open ? null : c.name)}>
                    <td className="ov-chev">{open ? '▾' : '▸'}</td>
                    <td>
                      <span className="ov-cname">{c.name}</span>{seg(c)}
                      {below && <div className="ov-fx" style={{ color: fx.color }}>⚠ {fx.label}</div>}
                    </td>
                    <td>{cfmt(c.spend)}</td>
                    <td>{cfmt(c.revenue)}</td>
                    <td className="ov-roas" style={{ color: ACT_COLOR[act] }}>{rx(c.roas)}</td>
                    <td>{formatInt(c.purchases)}</td>
                    <td><span className="ov-act" style={{ color: ACT_COLOR[act] }}><span className="dot" style={{ background: ACT_COLOR[act] }} />{ACT_LABEL[act]}</span></td>
                  </tr>
                  {open && (
                    <tr className="ov-diagrow"><td colSpan={7}><DiagPanel c={c} target={target} cfmt={cfmt} rx={rx} /></td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {/* CREATIVOS GANADORES */}
        {topAds.length > 0 && (
          <>
            <div className="ov-sh"><h2>Creativos ganadores</h2><span className="hint">anuncios por ROAS · la lógica que funciona</span></div>
            <div className="ov-crea">
              {topAds.map((a) => (
                <div className="ov-card" key={a.campaign + a.name}>
                  <div className="thumb" style={a.thumb ? { backgroundImage: `url(${a.thumb})` } : undefined}>
                    <span className="badge">{rx(a.roas)}</span>
                    {a.segment === 'AURA' && <span className="seg2">AURA</span>}
                  </div>
                  <div className="meta">
                    <div className="nm" title={a.name}>{a.name}</div>
                    <div className="st"><span>Revenue <b>{cfmt(a.revenue)}</b></span><span>CTR <b>{a.ctr.toFixed(1)}%</b></span><span>Compras <b>{formatInt(a.purchases)}</b></span></div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* AGENCIA VS MOTOR AURA */}
        <div className="ov-sh"><h2>Agencia vs Motor AURA</h2><span className="hint">quién mueve la aguja · Meta + Google</span></div>
        <div className="ov-duo">
          <div className="ov-mini">
            <div className="top"><div className="t">Agencia</div><div className="chip ag">Nosotros</div></div>
            <div className="big"><div className="n" style={{ color: roasColor(ag.roas) }}>{rx(ag.roas)}</div><div className="x">ROAS</div></div>
            <div className="row3">
              <div><div className="l">Revenue</div><div className="rv">{cfmt(ag.revenue)}</div></div>
              <div><div className="l">Inversión</div><div className="rv">{cfmt(ag.spend)}</div></div>
              <div><div className="l">Compras</div><div className="rv">{formatInt(ag.purchases)}</div></div>
            </div>
          </div>
          <div className="ov-mini">
            <div className="top"><div className="t">Motor AURA</div><div className="chip au">IA</div></div>
            <div className="big"><div className="n" style={{ color: au.spend > 0 ? roasColor(au.roas) : 'var(--t3)' }}>{au.spend > 0 ? rx(au.roas) : '—'}</div><div className="x">ROAS</div></div>
            <div className="row3">
              <div><div className="l">Revenue</div><div className="rv">{cfmt(au.revenue)}</div></div>
              <div><div className="l">Inversión</div><div className="rv">{cfmt(au.spend)}</div></div>
              <div><div className="l">Compras</div><div className="rv">{formatInt(au.purchases)}</div></div>
            </div>
          </div>
        </div>

        {/* GOOGLE PMAX */}
        {data.google && (
          <>
            <div className="ov-sh"><h2>Google · PMAX</h2><span className="hint">bloque aparte · conversión propia de Google</span></div>
            <div className="ov-strip" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
              <div className="ov-cell"><div className="l">Inversión</div><div className="v">{cfmt(data.google.spend)}</div></div>
              <div className="ov-cell"><div className="l">Revenue (Google)</div><div className="v">{cfmt(data.google.revenue)}</div></div>
              <div className="ov-cell"><div className="l">ROAS</div><div className="v">{data.google.revenue > 0 ? rx(data.google.roas) : '—'}</div></div>
              <div className="ov-cell"><div className="l">Conversiones</div><div className="v">{formatInt(data.google.purchases)}</div></div>
            </div>
          </>
        )}

        {/* FOOTNOTE */}
        <div className="ov-fn">
          <span>ROAS = <b>revenue de compra ÷ inversión</b>. Hero e indicadores = <b>Meta</b>; Google va aparte; <b>Agencia vs AURA</b> suma Meta + Google (revenue reportado por plataforma).</span>
          <span>Segmento <b>Motor AURA</b> = campañas que corre la IA (nombre <b>[MOTOR AURA]</b>) en <b>Meta + Google</b>.</span>
          <span style={{ marginLeft: 'auto' }}>{cur} · {rangeLabel}</span>
        </div>
      </div>
    </div>
  );
}
