'use client';

import { useState, type ReactNode } from 'react';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useEcommerceWeb, type ProductLabel, type ShopLabel, type ShopProduct } from '@/lib/hooks/useEcommerceWeb';
import { formatCurrencyFull, formatInt, formatPercent } from '@/lib/utils';
import { FunnelChart } from '@/components/ui/FunnelChart';

// Etiquetas del catálogo GA4 (comportamiento)
const LABEL_META: Record<ProductLabel, { emoji: string; label: string; cls: string; desc: string }> = {
  potencial: { emoji: '🚀', label: 'Potencial', cls: 'pot', desc: 'buen % carrito, poco tráfico — escalar tráfico' },
  optimizar: { emoji: '🔧', label: 'Optimizar', cls: 'opt', desc: 'muchas vistas, poco carrito — arreglar PDP/precio' },
  baja: { emoji: '💤', label: 'Baja tracción', cls: 'baja', desc: 'casi sin vistas ni carrito — despriorizar o revivir' },
  mantener: { emoji: '✅', label: 'Mantener', cls: 'man', desc: 'estable' },
};
const CHIP_ORDER: ProductLabel[] = ['potencial', 'optimizar', 'mantener', 'baja'];
// Degradado del embudo (violeta → verde); el paso que se rompe se pinta en rojo aparte.
const FUNNEL_COLORS = ['#8b5cf6', '#6366f1', '#0ea5e9', '#f59e0b', '#16a34a'];
// Etiquetas del catálogo Shopify (venta real)
const SHOP_META: Record<ShopLabel, { emoji: string; label: string; cls: string }> = {
  hero: { emoji: '🏆', label: 'Hero', cls: 'hero' },
  cobrar: { emoji: '💸', label: 'Por cobrar', cls: 'opt' },
  solido: { emoji: '✅', label: 'Sólido', cls: 'man' },
};

// ============================================================
// EcommerceWeb — hoja 100% ecommerce (Sneaker Store). NO es de leads.
// Comparativa de webs (dónde invertir) + performance por PRODUCTO (tasa de
// carrito y conversión, para escalar/optimizar) + venta real Shopify
// (pagado vs pendiente) + embudo. Cruza GA4 (comportamiento) con Shopify (venta).
// ============================================================

export function EcommerceWeb() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useEcommerceWeb(client.id, range, previous);
  const cur = client.currency;
  const money = (v: number) => formatCurrencyFull(v, cur);
  const rps = (v: number) => `$${v.toFixed(2)}`;
  const [filter, setFilter] = useState<ProductLabel | 'all'>('all');
  const [expanded, setExpanded] = useState(false);
  // Orden por métrica (tabla Analytics). key 'label' = orden inteligente por defecto.
  const [ga4Sort, setGa4Sort] = useState<{ key: 'label' | 'views' | 'atc' | 'atcRate' | 'purchases' | 'cvr'; dir: 'asc' | 'desc' }>({ key: 'label', dir: 'desc' });
  const ga4SortBy = (key: typeof ga4Sort.key) => setGa4Sort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  // Filtro + orden por métrica (tabla Shopify).
  const [shopFilter, setShopFilter] = useState<ShopLabel | 'all'>('all');
  const [shopSort, setShopSort] = useState<{ key: 'compras' | 'pagadas' | 'pendientes' | 'ingreso' | 'pagpct'; dir: 'asc' | 'desc' }>({ key: 'ingreso', dir: 'desc' });
  const shopSortBy = (key: typeof shopSort.key) => setShopSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  const arrow = (active: boolean, dir: 'asc' | 'desc') => (active ? (dir === 'desc' ? ' ▾' : ' ▴') : '');

  if (loading && !data) return <div className="view on"><div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>Cargando analítica ecommerce…</div></div>;
  if (error || !data) return <div className="view on"><div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>Sin datos de ecommerce en este período.</div></div>;

  const win = data.webs[0];
  const investReason = !win ? '' : win.kind === 'shopify'
    ? `Más venta real por sesión (${rps(win.revPerSession)}). La pauta ya convierte ahí — escala, pero cobra lo pendiente.`
    : `Mejor retorno por sesión (${rps(win.revPerSession)}) y tráfico más sano. Base para escalar con menos riesgo.`;
  const maxRps = Math.max(...data.webs.map((w) => w.revPerSession), 0.01);

  return (
    <div className="view on">
      <div className="ec">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />

        {/* HEADER */}
        <div className="ec-hero">
          <div className="mk">🛍️</div>
          <div>
            <h1>Analítica ecommerce</h1>
            <div className="sub">Comportamiento (GA4) + venta real (Shopify) · {client.name} · {formatRangeLabel(range)}</div>
          </div>
        </div>

        {/* KPIs HERO — resumen ejecutivo de un vistazo */}
        <div className="ec-hkpis">
          <div className="ec-hk"><div className="hkl">💰 Venta bruta</div><div className="hkv">{money(data.revBruto)}</div><div className="hks">{formatInt(data.unitsPaid + data.unitsPending)} unidades vendidas</div></div>
          <div className="ec-hk"><div className="hkl">✅ Cobrado</div><div className="hkv up">{formatPercent(data.paidPct, 0)}</div><div className="hks">{money(data.revPaid)} · falta {money(data.revPending)}</div></div>
          <div className="ec-hk"><div className="hkl">👥 Sesiones</div><div className="hkv">{formatInt(data.sessions)}</div><div className={'hks ' + (data.sessionsDelta >= 0 ? 'up' : 'dn')}>{data.sessionsDelta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(data.sessionsDelta))}% vs. período anterior</div></div>
          <div className="ec-hk"><div className="hkl">🛒 Vista → carrito</div><div className="hkv">{formatPercent(data.siteAtcRate, 1)}</div><div className="hks">{formatInt(data.productViews)} vistas de producto</div></div>
        </div>

        {/* COMPARATIVA DE WEBS · DÓNDE INVERTIR */}
        <div className="ec-sh"><h3>¿Dónde meter la plata?</h3><span className="hint">las 2 webs, por retorno de tráfico</span></div>
        <div className="ec-webs">
          {data.webs.map((w) => (
            <div className={'ec-web' + (w === win ? ' win' : '')} key={w.property}>
              {w === win && <span className="wbadge">▲ Escalar aquí</span>}
              <div className="wtitle">{w.label}<span className={'wkind ' + w.kind}>{w.kind === 'shopify' ? 'Shopify' : 'principal'}</span></div>
              <div className="wrps"><b>{rps(w.revPerSession)}</b><span>venta real / sesión</span></div>
              <div className="wrpsbar"><i style={{ width: (w.revPerSession / maxRps) * 100 + '%' }} /></div>
              <div className="wgrid">
                <div><span className="k">Sesiones</span><span className="v">{formatInt(w.sessions)}</span></div>
                <div><span className="k">Venta real</span><span className="v">{money(w.realRevenue)}<small> {w.revSource}</small></span></div>
                <div><span className="k">Rebote</span><span className={'v ' + (w.bounce <= 0.35 ? 'good' : w.bounce >= 0.5 ? 'bad' : '')}>{formatPercent(w.bounce, 0)}</span></div>
                <div><span className="k">Dependencia pauta</span><span className={'v ' + (w.paidShare >= 0.6 ? 'bad' : '')}>{formatPercent(w.paidShare, 0)}</span></div>
              </div>
              {!w.ga4Tracks && <div className="wflag">⚠ GA4 no mide venta en esta web · dato de Shopify</div>}
            </div>
          ))}
        </div>
        {win && <div className="ec-verdict"><span className="vk">Veredicto</span><b>{data.investLabel}</b> — {investReason}</div>}

        {/* CATÁLOGO 1 · sneakerstore.com.mx (demanda GA4) */}
        <div className="ec-sh"><h3>Catálogo · sneakerstore.com.mx</h3><span className="hint">demanda del sitio principal (GA4) · {data.catalogGa4.length} productos · media {formatPercent(data.siteAtcRate, 1)} al carrito</span></div>
        <div className="ec-chips">
          <button className={'chip' + (filter === 'all' ? ' on' : '')} onClick={() => { setFilter('all'); setExpanded(false); }}>Todos <b>{data.catalogGa4.length}</b></button>
          {CHIP_ORDER.map((l) => (
            <button key={l} className={'chip ' + LABEL_META[l].cls + (filter === l ? ' on' : '')} onClick={() => { setFilter(l); setExpanded(false); }}>
              {LABEL_META[l].emoji} {LABEL_META[l].label} <b>{data.ga4LabelCounts[l]}</b>
            </button>
          ))}
        </div>
        {(() => {
          const ORD: Record<ProductLabel, number> = { potencial: 0, optimizar: 1, mantener: 2, baja: 3 };
          const base = filter === 'all' ? data.catalogGa4 : data.catalogGa4.filter((p) => p.label === filter);
          const sk = ga4Sort.key, sgn = ga4Sort.dir === 'desc' ? 1 : -1;
          const rows = [...base].sort((a, b) => {
            if (sk === 'label') return (ORD[a.label] - ORD[b.label]) || (b.views - a.views); // orden inteligente fijo
            return sgn * (((b as any)[sk] || 0) - ((a as any)[sk] || 0));
          });
          const shown = expanded ? rows : rows.slice(0, 15);
          const SH = ({ k, children }: { k: typeof ga4Sort.key; children: ReactNode }) => (
            <button className={'ec-th' + (ga4Sort.key === k ? ' on' : '')} onClick={() => ga4SortBy(k)}>{children}{arrow(ga4Sort.key === k, ga4Sort.dir)}</button>
          );
          return (
            <div className="card ec-pad">
              {filter !== 'all' && <p className="ec-lhint">{LABEL_META[filter].emoji} <b>{LABEL_META[filter].label}</b> — {LABEL_META[filter].desc}</p>}
              <div className="ec-cph ga4">
                <SH k="label">Producto</SH><SH k="views">Vistas</SH><SH k="atc">🛒 Carrito</SH>
                <SH k="atcRate">% carrito</SH><SH k="purchases">🛍️ Compras</SH><SH k="cvr">% venta</SH><div>Etiqueta</div>
              </div>
              {shown.map((p) => (
                <div className={'ec-crow ga4 ' + p.label} key={p.name}>
                  <div className="pn" title={p.name}>{p.name}</div>
                  <div className="nv">{formatInt(p.views)}</div>
                  <div className="nv">{p.atc || '—'}</div>
                  <div className="nv"><span className={'rate ' + (p.atcRate >= data.siteAtcRate * 1.6 ? 'hi' : p.atcRate < data.siteAtcRate * 0.8 && p.views >= 100 ? 'lo' : '')}>{formatPercent(p.atcRate, 1)}</span></div>
                  <div className="nv">{p.purchases ? <b>{p.purchases}</b> : <span className="z">—</span>}</div>
                  <div className="nv">{p.purchases ? formatPercent(p.cvr, 1) : <span className="z">—</span>}</div>
                  <div className="lb"><span className={'lbadge ' + LABEL_META[p.label].cls}>{LABEL_META[p.label].emoji} {LABEL_META[p.label].label}</span></div>
                </div>
              ))}
              {rows.length > 15 && (
                <button className="ec-more" onClick={() => setExpanded((x) => !x)}>
                  {expanded ? '▲ Ver menos' : `▼ Ver los ${rows.length} productos`}
                </button>
              )}
              <p className="ec-foot">🛍️ GA4 solo midió {formatInt(data.funnel[4]?.value || 0)} ventas (tracking incompleto) → la señal fiable es <b>% carrito</b>. La venta real está en Shopify ↓</p>
            </div>
          );
        })()}

        {/* EMBUDO VISUAL (GA4) */}
        <div className="ec-sh"><h3>Embudo del sitio</h3><span className="hint">GA4 · todo el tráfico</span>
          {data.breakLabel !== '—' && <span className="ec-break">⚠ se rompe en {data.breakLabel}</span>}
        </div>
        <div className="card ec-pad ec-funnelcard">
          <FunnelChart
            stages={data.funnel.map((s, i) => ({ label: s.label, value: s.value, color: s.isBreak ? '#e5384d' : FUNNEL_COLORS[i] }))}
            format={(v) => formatInt(v)}
          />
        </div>

        {/* GRÁFICO · CONCENTRACIÓN DE LA VENTA (pagado vs pendiente por producto) */}
        <div className="ec-sh"><h3>¿Dónde está la plata?</h3><span className="hint">venta por producto · ticket promedio {money(data.aovPaid)}</span>
          <span className="ec-pcount">🏆 <b className="e">{data.shopLabelCounts.hero}</b> hero · 💸 <b className="o">{data.shopLabelCounts.cobrar}</b> por cobrar</span>
        </div>
        <div className="card ec-pad ec-conc">
          <div className="ec-conchead"><span className="lg"><i className="d paid" />Pagado {money(data.revPaid)}</span><span className="lg"><i className="d pend" />Pendiente {money(data.revPending)}</span></div>
          {(() => {
            const top = [...data.products].sort((a, b) => (b.revPaid + b.revPending) - (a.revPaid + a.revPending)).slice(0, 8);
            const maxG = Math.max(...top.map((p) => p.revPaid + p.revPending), 1);
            return top.map((p) => (
              <div className="concrow" key={p.title}>
                <div className="cname" title={p.title}>{p.title}</div>
                <div className="cbar">
                  {p.revPaid > 0 && <i className="paid" style={{ width: (p.revPaid / maxG) * 100 + '%' }} />}
                  {p.revPending > 0 && <i className="pend" style={{ width: (p.revPending / maxG) * 100 + '%' }} />}
                </div>
                <div className="cval">{money(p.revPaid + p.revPending)}</div>
              </div>
            ));
          })()}
        </div>

        {/* CATÁLOGO 2 · Tienda Shopify (venta real, 100% Shopify) */}
        <div className="ec-sh"><h3>Catálogo · Tienda Shopify</h3><span className="hint">venta real de la tienda (Shopify) · {data.products.length} productos con venta · ordena por cualquier columna</span></div>
        <div className="ec-chips">
          <button className={'chip' + (shopFilter === 'all' ? ' on' : '')} onClick={() => setShopFilter('all')}>Todos <b>{data.products.length}</b></button>
          {(['hero', 'cobrar', 'solido'] as ShopLabel[]).map((l) => (
            <button key={l} className={'chip ' + SHOP_META[l].cls + (shopFilter === l ? ' on' : '')} onClick={() => setShopFilter(l)}>
              {SHOP_META[l].emoji} {SHOP_META[l].label} <b>{data.shopLabelCounts[l]}</b>
            </button>
          ))}
        </div>
        {(() => {
          const base = shopFilter === 'all' ? data.products : data.products.filter((p) => p.shopLabel === shopFilter);
          const sk = shopSort.key, sgn = shopSort.dir === 'desc' ? 1 : -1;
          const metric = (p: ShopProduct) => sk === 'compras' ? p.unitsPaid + p.unitsPending : sk === 'pagadas' ? p.unitsPaid
            : sk === 'pendientes' ? p.unitsPending : sk === 'ingreso' ? p.revPaid + p.revPending : p.paidPct;
          const rows = [...base].sort((a, b) => sgn * (metric(b) - metric(a)) || (b.revPaid + b.revPending) - (a.revPaid + a.revPending));
          const SH = ({ k, children }: { k: typeof shopSort.key; children: ReactNode }) => (
            <button className={'ec-th' + (shopSort.key === k ? ' on' : '')} onClick={() => shopSortBy(k)}>{children}{arrow(shopSort.key === k, shopSort.dir)}</button>
          );
          return (
            <div className="card ec-pad" style={{ marginTop: 14 }}>
              <p className="ec-lhint">🏆 <b>Hero</b> sostiene la caja (escalar) · 💸 <b>Por cobrar</b> plata atrapada en pendiente · ✅ <b>Sólido</b> paga limpio</p>
              <div className="ec-sph">
                <div>Producto</div>
                <SH k="compras">🛍️ Compras</SH><SH k="pagadas">✅ Pagadas</SH><SH k="pendientes">⏳ Pendientes</SH>
                <SH k="ingreso">💰 Ingreso</SH><SH k="pagpct">% pag.</SH><div>Etiqueta</div>
              </div>
              {rows.map((p) => (
                <div className="ec-sprow" key={p.title}>
                  <div className="pn" title={p.title}>{p.title}</div>
                  <div className="nv"><b>{p.unitsPaid + p.unitsPending}</b><span>unidades</span></div>
                  <div className="nv"><b className="pd-ok">{p.unitsPaid || '—'}</b></div>
                  <div className="nv">{p.unitsPending ? <b className="pd-wn">{p.unitsPending}</b> : <span className="z">—</span>}</div>
                  <div className="nv"><b>{money(p.revPaid + p.revPending)}</b><span>{money(p.revPaid)} cobrado</span></div>
                  <div className="nv"><span className={'rate ' + (p.paidPct >= 0.99 ? 'hi' : p.paidPct === 0 ? 'lo' : '')}>{formatPercent(p.paidPct, 0)}</span></div>
                  <div className="lb"><span className={'lbadge ' + SHOP_META[p.shopLabel].cls}>{SHOP_META[p.shopLabel].emoji} {SHOP_META[p.shopLabel].label}</span></div>
                </div>
              ))}
              <p className="ec-foot">🛍️ Compras, pagadas, pendientes e ingreso salen 100% de Shopify (venta real). Shopify no reporta vistas ni carritos por producto — esa demanda vive en la tabla de sneakerstore.com.mx ↑</p>
            </div>
          );
        })()}

        {/* ACCIONES — 3 palancas, corto */}
        <div className="ec-sh"><h3>Próximos pasos</h3><span className="hint">las 3 palancas de mayor retorno</span></div>
        <div className="ec-acts">
          <div className="ec-act warn"><div className="tag">1 · Cobrar {money(data.revPending)}</div><div className="body">Venta ya ganada, sin pagar. Flujo de recordatorio = caja inmediata.</div></div>
          <div className="ec-act good"><div className="tag">2 · Escalar {data.ga4LabelCounts.potencial} “Potencial”</div><div className="body">Buen % de carrito, poco tráfico. Más pauta y creativos propios.</div></div>
          <div className="ec-act bad"><div className="tag">3 · Arreglar cuello {formatPercent(data.siteAtcRate, 1)}</div><div className="body">{formatInt(data.productViews)} vistas → {formatInt(data.funnel[2]?.value || 0)} carritos. Revisar PDP/precio del tráfico caro.</div></div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.ec{margin-top:4px}
.ec-hero{display:flex;align-items:center;gap:14px;margin-bottom:8px}
.ec-hero .mk{width:46px;height:46px;border-radius:12px;background:var(--bg2);display:grid;place-items:center;font-size:24px;border:1px solid var(--b1)}
.ec-hero h1{font-size:22px;font-weight:800;margin:0;letter-spacing:-.02em}
.ec-hero .sub{font-size:12px;color:var(--t3);margin-top:2px}
.ec-sh{display:flex;align-items:baseline;gap:11px;margin:26px 0 12px}.ec-sh h3{font-size:15px;font-weight:800;margin:0}.ec-sh .hint{font-size:11px;color:var(--t3)}
.ec-sh .ec-break{margin-left:auto;font-size:11px;color:var(--dn);font-weight:700;background:var(--dn-soft,rgba(229,56,77,.1));padding:3px 9px;border-radius:7px}
.ec-sh .ec-pcount{margin-left:auto;font-size:11px;color:var(--t3)}.ec-pcount b.e{color:var(--up)}.ec-pcount b.o{color:var(--dn)}
.ec-pad{padding:15px 18px}
.ec-note{font-size:11.5px;color:var(--t3);margin:12px 0 0;line-height:1.5}.ec-note b.e{color:var(--up)}.ec-note b.o{color:var(--dn)}
/* KPIs hero (resumen ejecutivo) */
.ec-hkpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0 4px}
.ec-hk{background:var(--bg1);border:1px solid var(--b1);border-radius:14px;padding:13px 15px}
.ec-hk .hkl{font-size:11px;color:var(--t3);font-weight:600}
.ec-hk .hkv{font-size:25px;font-weight:800;letter-spacing:-.025em;margin-top:4px;color:var(--t1)}.ec-hk .hkv.up{color:var(--up)}
.ec-hk .hks{font-size:10.5px;color:var(--t3);margin-top:3px}.ec-hk .hks.up{color:var(--up)}.ec-hk .hks.dn{color:var(--dn)}
/* embudo visual */
.ec-funnelcard{padding:18px 22px}
/* gráfico concentración de venta */
.ec-conc .ec-conchead{display:flex;gap:16px;justify-content:flex-end;font-size:10.5px;color:var(--t3);margin-bottom:12px}
.ec-conc .lg{display:inline-flex;align-items:center;gap:6px}
.ec-conc .lg .d{width:10px;height:10px;border-radius:3px;display:inline-block}.ec-conc .lg .d.paid{background:var(--up)}.ec-conc .lg .d.pend{background:var(--warn)}
.concrow{display:grid;grid-template-columns:180px 1fr 96px;gap:12px;align-items:center;padding:5px 0}
.concrow .cname{font-size:12px;font-weight:600;line-height:1.3;overflow-wrap:anywhere}
.concrow .cbar{display:flex;height:15px;background:var(--track);border-radius:5px;overflow:hidden}
.concrow .cbar i{display:block;height:100%}.concrow .cbar i.paid{background:var(--up)}.concrow .cbar i.pend{background:var(--warn)}
.concrow .cval{text-align:right;font-size:12.5px;font-weight:800;font-variant-numeric:tabular-nums}
/* comparativa webs */
.ec-webs{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.ec-web{position:relative;background:var(--bg1);border:1px solid var(--b1);border-radius:16px;padding:17px 18px}
.ec-web.win{border-color:var(--up);box-shadow:0 0 0 1px var(--up)}
.ec-web .wbadge{position:absolute;top:-9px;right:14px;background:var(--up);color:#fff;font-size:10px;font-weight:800;padding:2px 9px;border-radius:7px}
.ec-web .wtitle{font-size:15px;font-weight:800;display:flex;align-items:center;gap:8px}
.ec-web .wkind{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:2px 7px;border-radius:6px;background:var(--bg3);color:var(--t3)}
.ec-web .wkind.shopify{background:rgba(139,92,246,.12);color:var(--acc)}
.ec-web .wrps{margin-top:11px;display:flex;align-items:baseline;gap:8px}
.ec-web .wrps b{font-size:26px;font-weight:800;letter-spacing:-.02em;color:var(--t1)}
.ec-web.win .wrps b{color:var(--up)}
.ec-web .wrps span{font-size:11px;color:var(--t3)}
.ec-web .wrpsbar{height:6px;background:var(--track);border-radius:4px;overflow:hidden;margin:8px 0 14px}
.ec-web .wrpsbar i{display:block;height:100%;border-radius:4px;background:var(--t3)}
.ec-web.win .wrpsbar i{background:var(--up)}
.ec-web .wgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}
.ec-web .wgrid .k{display:block;font-size:10px;color:var(--t3);font-weight:600}
.ec-web .wgrid .v{display:block;font-size:15px;font-weight:800;margin-top:2px}
.ec-web .wgrid .v small{font-size:9px;color:var(--t3);font-weight:500}
.ec-web .wgrid .v.good{color:var(--up)}.ec-web .wgrid .v.bad{color:var(--dn)}
.ec-web .wflag{margin-top:12px;font-size:10.5px;color:var(--warn);background:rgba(234,179,8,.1);border-radius:7px;padding:6px 9px}
.ec-verdict{margin-top:14px;background:var(--bg1);border:1px solid var(--b1);border-left:3px solid var(--up);border-radius:12px;padding:13px 16px;font-size:12.5px;color:var(--t2);line-height:1.5}
.ec-verdict .vk{font-family:var(--mono,monospace);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--up);font-weight:700;margin-right:8px}
.ec-verdict b{color:var(--t1)}
/* catálogo inteligente */
.ec-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.ec-chips .chip{font-size:11.5px;font-weight:600;padding:6px 12px;border-radius:999px;border:1px solid var(--b1);background:var(--bg1);color:var(--t2);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.ec-chips .chip b{font-weight:800;color:var(--t1)}
.ec-chips .chip:hover{border-color:var(--b2)}
.ec-chips .chip.on{background:var(--t1);color:var(--bg0,#fff);border-color:var(--t1)}
.ec-chips .chip.on b{color:var(--bg0,#fff)}
.ec-chips .chip.hero.on{background:var(--up);border-color:var(--up)}.ec-chips .chip.pot.on{background:var(--acc);border-color:var(--acc)}
.ec-chips .chip.opt.on{background:var(--dn);border-color:var(--dn)}.ec-chips .chip.baja.on{background:var(--t3);border-color:var(--t3)}
.ec-lhint{font-size:11.5px;color:var(--t3);margin:0 0 10px}.ec-lhint b{color:var(--t1)}
.ec-cph,.ec-crow{display:grid;grid-template-columns:1fr 50px 54px 60px 60px 56px 124px;gap:8px;align-items:center}
.ec-cph{font-size:9px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--t3);padding-bottom:8px;border-bottom:1px solid var(--b1)}
.ec-cph>*:not(:first-child){text-align:right;justify-self:end}.ec-cph>*:last-child{text-align:left;justify-self:start;padding-left:8px}
.ec-th{background:none;border:none;padding:0;margin:0;font:inherit;color:inherit;text-transform:inherit;letter-spacing:inherit;cursor:pointer;white-space:nowrap}
.ec-th:first-child{text-align:left}.ec-th:hover{color:var(--t1)}.ec-th.on{color:var(--acc)}
.ec-foot{margin-top:11px;font-size:10.5px;color:var(--t3);line-height:1.5;border-top:1px dashed var(--b1);padding-top:9px}.ec-foot b{color:var(--t2)}
.ec-crow{padding:7px 0;border-top:1px solid var(--b1);font-size:12px;align-items:start}
.ec-crow .pn{font-weight:600;line-height:1.35;overflow-wrap:anywhere}
.ec-crow .nv{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.ec-crow .nv .rate.hi{color:var(--up)}.ec-crow .nv .rate.lo{color:var(--dn)}
.ec-crow .nv .pd-ok{color:var(--up);font-size:11px}.ec-crow .nv .z{color:var(--t3);font-weight:400}
.ec-crow .lb{text-align:left;padding-left:8px}
.lbadge{display:inline-block;font-size:10px;font-weight:800;padding:2px 8px;border-radius:6px;white-space:nowrap}
.lbadge.hero{background:rgba(34,217,122,.16);color:var(--up)}
.lbadge.pot{background:rgba(139,92,246,.14);color:var(--acc)}
.lbadge.opt{background:var(--dn-soft,rgba(229,56,77,.12));color:var(--dn)}
.lbadge.baja{background:var(--bg3);color:var(--t3)}
.lbadge.man{background:var(--bg3);color:var(--t2)}
.ec-crow.hero{background:linear-gradient(90deg,rgba(34,217,122,.05),transparent)}
.ec-more{margin-top:12px;width:100%;padding:9px;border:1px dashed var(--b2);background:transparent;border-radius:9px;color:var(--t2);font-size:12px;font-weight:600;cursor:pointer}
.ec-more:hover{background:var(--bg2)}
/* venta kpis */
.ec-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:13px}
.ec-kpi{background:var(--bg1);border:1px solid var(--b1);border-radius:14px;padding:14px 16px}
.ec-kpi .l{font-size:11.5px;color:var(--t3);font-weight:600}
.ec-kpi .v{font-size:23px;font-weight:800;letter-spacing:-.02em;margin-top:5px;color:var(--t1)}
.ec-kpi .s{font-size:11px;color:var(--t3);margin-top:4px}
.ec-kpi.paid{border-color:var(--up)}.ec-kpi.paid .v{color:var(--up)}
.ec-kpi.pend{border-color:var(--warn)}.ec-kpi.pend .v{color:var(--warn)}
.ec-splitbar{display:flex;height:12px;border-radius:6px;overflow:hidden;margin-top:12px;background:var(--track)}
.ec-splitbar i.paid{background:var(--up)}.ec-splitbar i.pend{background:var(--warn)}
.ec-sph,.ec-sprow{display:grid;grid-template-columns:1fr 60px 58px 66px 100px 50px 112px;gap:9px;align-items:start}
.ec-sph{font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--t3);padding-bottom:8px;border-bottom:1px solid var(--b1)}
.ec-sph>*:not(:first-child):not(:last-child){text-align:right;justify-self:end}.ec-sph>*:last-child{text-align:left;justify-self:start;padding-left:8px}
.ec-sprow{padding:9px 0;border-top:1px solid var(--b1);font-size:12.5px;align-items:start}
.ec-sprow .pn{font-weight:600;line-height:1.35;overflow-wrap:anywhere}
.ec-sprow .nv{text-align:right;font-variant-numeric:tabular-nums}
.ec-sprow .nv b{font-weight:800}.ec-sprow .nv span{display:block;font-size:9.5px;color:var(--t3)}
.ec-sprow .nv .pd-ok{color:var(--up)}.ec-sprow .nv .pd-wn{color:var(--warn)}
.ec-sprow .nv .rate.hi{color:var(--up)}.ec-sprow .nv .rate.lo{color:var(--dn)}
.ec-sprow .z{color:var(--t3)}
.ec-sprow .lb{text-align:left;padding-left:8px}
/* embudo */
.ec-fstep{display:grid;grid-template-columns:150px 1fr 74px 54px;gap:12px;align-items:center;padding:6px 0;border-top:1px solid var(--b1)}
.ec-fstep:first-child{border-top:none}
.ec-fstep .fl{font-size:12.5px;font-weight:600}
.ec-fstep .fbar{height:14px;background:var(--track);border-radius:5px;overflow:hidden}.ec-fstep .fbar i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,var(--acc),var(--up))}
.ec-fstep.brk .fbar i{background:linear-gradient(90deg,#b23c33,var(--dn))}
.ec-fstep .fv{text-align:right;font-size:13px;font-weight:800}
.ec-fstep .fr{text-align:right;font-size:11px;color:var(--t3)}.ec-fstep .fr .bad{color:var(--dn);font-weight:700}
/* acciones */
.ec-acts{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:4px}
.ec-act{background:var(--bg1);border:1px solid var(--b1);border-radius:13px;padding:14px 15px;border-left:3px solid var(--acc)}
.ec-act.good{border-left-color:var(--up)}.ec-act.bad{border-left-color:var(--dn)}.ec-act.warn{border-left-color:var(--warn)}.ec-act.info{border-left-color:var(--acc)}
.ec-act .tag{font-size:12px;font-weight:800;margin-bottom:5px}.ec-act .body{font-size:11.5px;color:var(--t2);line-height:1.5}
/* responsive · desktop angosto / tablet (preview de Cloud) */
@media(max-width:1024px){
  .ec-acts{grid-template-columns:1fr}
  .concrow{grid-template-columns:150px 1fr 88px;gap:10px}
}
/* tablas y comparativas colapsan antes de apretarse */
@media(max-width:900px){
  .ec-webs{grid-template-columns:1fr}.ec-hkpis{grid-template-columns:repeat(2,1fr)}
  .ec-sph,.ec-sprow{grid-template-columns:1fr 60px 100px 104px}
  .ec-sph>*:nth-child(3),.ec-sprow>*:nth-child(3),.ec-sph>*:nth-child(4),.ec-sprow>*:nth-child(4),.ec-sph>*:nth-child(6),.ec-sprow>*:nth-child(6){display:none}
  .ec-cph,.ec-crow{grid-template-columns:1fr 46px 60px 104px}
  .ec-cph>*:nth-child(3),.ec-crow>*:nth-child(3),.ec-cph>*:nth-child(5),.ec-crow>*:nth-child(5),.ec-cph>*:nth-child(6),.ec-crow>*:nth-child(6){display:none}
}
@media(max-width:560px){
  .ec-hkpis{grid-template-columns:1fr}
  .concrow{grid-template-columns:1fr 78px;grid-template-areas:'name val' 'bar bar';row-gap:5px}
  .concrow .cname{grid-area:name}.concrow .cval{grid-area:val}.concrow .cbar{grid-area:bar}
}
`;
