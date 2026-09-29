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
  // Filtro por web + orden por métrica (tabla Landings · P3).
  const [landWeb, setLandWeb] = useState<'all' | string>('all');
  const [landExpanded, setLandExpanded] = useState(false);
  const [landSort, setLandSort] = useState<{ key: 'sessions' | 'bounce' | 'atcRate' | 'purchases' | 'revenue'; dir: 'asc' | 'desc' }>({ key: 'sessions', dir: 'desc' });
  const landSortBy = (key: typeof landSort.key) => setLandSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
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

        {/* CANALES POR WEB (P1) · de dónde viene el tráfico y la venta */}
        <div className="ec-sh"><h3>¿De dónde viene la venta?</h3><span className="hint">canales por web · GA4 · tráfico vs venta real · <i className="chleg"><i className="dot paid" />pauta</i> <i className="chleg"><i className="dot org" />orgánico/directo</i></span></div>
        <div className="ec-chwebs">
          {data.websChannels.map((w) => {
            const top = w.channels.slice(0, 7);
            const rest = w.channels.slice(7);
            const restS = rest.reduce((a, c) => a + c.sessions, 0);
            const restR = rest.reduce((a, c) => a + c.revenue, 0);
            const metricMax = w.ga4Tracks
              ? Math.max(...w.channels.map((c) => c.revenue), 1)
              : Math.max(...w.channels.map((c) => c.sessions), 1);
            const paidSess = w.channels.filter((c) => c.isPaid).reduce((a, c) => a + c.sessions, 0);
            return (
              <div className="ec-chcard" key={w.property}>
                <div className="chc-head">
                  <div className="chc-title">{w.label}<span className={'wkind ' + w.kind}>{w.kind === 'shopify' ? 'Shopify' : 'principal'}</span></div>
                  <div className="chc-tot">
                    <span>{formatInt(w.sessions)} sesiones</span>
                    {w.ga4Tracks ? <b>{money(w.revenue)} venta GA4</b> : <em>⚠ GA4 no valoriza · venta en Shopify</em>}
                  </div>
                </div>
                <div className="chc-list">
                  {top.map((c) => {
                    const val = w.ga4Tracks ? c.revenue : c.sessions;
                    return (
                      <div className="chc-row" key={c.channel}>
                        <div className="chc-name" title={c.channel}><i className={'dot ' + (c.isPaid ? 'paid' : 'org')} />{c.channel}</div>
                        <div className="chc-bar"><i className={c.isPaid ? 'paid' : 'org'} style={{ width: (val / metricMax) * 100 + '%' }} /></div>
                        <div className="chc-metric">
                          {w.ga4Tracks
                            ? <><b>{money(c.revenue)}</b><small>{rps(c.revPerSession)}/ses · {formatInt(c.sessions)} ses</small></>
                            : <><b>{formatInt(c.sessions)}</b><small>{formatPercent(c.sessPct, 0)} del tráfico</small></>}
                        </div>
                        <div className={'chc-delta ' + (c.sessDelta >= 0 ? 'up' : 'dn')} title="sesiones vs período anterior">{c.sessDelta >= 0 ? '▲' : '▼'}{Math.abs(Math.round(c.sessDelta))}%</div>
                      </div>
                    );
                  })}
                  {rest.length > 0 && (
                    <div className="chc-row rest">
                      <div className="chc-name"><i className="dot org" />Otros {rest.length} canales</div>
                      <div className="chc-bar"><i className="org" style={{ width: ((w.ga4Tracks ? restR : restS) / metricMax) * 100 + '%' }} /></div>
                      <div className="chc-metric"><b>{w.ga4Tracks ? money(restR) : formatInt(restS)}</b><small>&nbsp;</small></div>
                      <div className="chc-delta" />
                    </div>
                  )}
                </div>
                <div className="chc-foot">
                  {w.ga4Tracks
                    ? (w.topPaid || w.topOrganic
                      ? <>Pauta líder: <b>{w.topPaid ? `${w.topPaid.channel} ${money(w.topPaid.revenue)}` : '—'}</b> · Orgánico líder: <b>{w.topOrganic ? `${w.topOrganic.channel} ${money(w.topOrganic.revenue)}` : '—'}</b></>
                      : '—')
                    : <>Pauta que GA4 no puede valorizar aquí: <b>{formatInt(paidSess)}</b> sesiones. Su venta se mide en Shopify, no en GA4.</>}
                </div>
              </div>
            );
          })}
        </div>

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

        {/* CARRITOS ABANDONADOS + RECUPERACIÓN (P2) */}
        <div className="ec-sh"><h3>Carritos abandonados</h3><span className="hint">checkout iniciado sin pago · oportunidad de recupero (Shopify)</span></div>
        <div className="card ec-pad">
          <div className="abn-kpis">
            <div className="abn-k">
              <div className="l">🛒 Abandonados</div>
              <div className="v">{formatInt(data.abandon.count)}</div>
              <div className={'s ' + (data.abandon.countDelta <= 0 ? 'up' : 'dn')}>{data.abandon.countDelta <= 0 ? '▼' : '▲'} {Math.abs(Math.round(data.abandon.countDelta))}% vs. anterior</div>
            </div>
            <div className="abn-k">
              <div className="l">💸 Valor listado</div>
              <div className="v warn">{money(data.abandon.value)}</div>
              <div className="s">ticket prom. {money(data.abandon.avgValue)}</div>
            </div>
            <div className="abn-k">
              <div className="l">♻️ Recuperación</div>
              <div className={'v ' + (data.abandon.recoveryRate > 0 ? 'up' : 'dn')}>{formatPercent(data.abandon.recoveryRate, 0)}</div>
              <div className="s">{formatInt(data.abandon.recovered)} recuperados</div>
            </div>
            <div className="abn-k">
              <div className="l">🔻 Abandono vs compra</div>
              <div className="v">{data.abandon.purchases > 0 ? (data.abandon.count / data.abandon.purchases).toFixed(1) + '×' : '—'}</div>
              <div className="s">{formatInt(data.abandon.count)} abandonan · {formatInt(data.abandon.purchases)} compran</div>
            </div>
          </div>
          {data.abandon.series.length > 1 && (() => {
            const mx = Math.max(...data.abandon.series.map((s) => s.value), 1);
            return (
              <div className="abn-spark" title="valor abandonado por día">
                {data.abandon.series.map((s) => (
                  <div key={s.date} className="abn-bar" title={`${s.date}: ${money(s.value)} · ${formatInt(s.count)} carritos`}>
                    <i style={{ height: Math.max((s.value / mx) * 100, s.value > 0 ? 6 : 0) + '%' }} />
                  </div>
                ))}
              </div>
            );
          })()}
          <div className={'ec-verdict' + (data.abandon.hasFlow ? '' : ' warn')}>
            <span className="vk">Palanca</span>
            {data.abandon.hasFlow
              ? <>Ya recuperas <b>{formatPercent(data.abandon.recoveryRate, 0)}</b>. Sube la cadencia del flujo para capturar más de estos {money(data.abandon.value)} listados.</>
              : <><b>No hay flujo de recuperación activo</b> — 0 recuperados de {formatInt(data.abandon.count)} carritos. Un recordatorio por WhatsApp/email recupera parte de esta caja. Ojo honesto: el valor listado ({money(data.abandon.value)}) no es recuperable 1:1 — son tickets altos y multi-ítem.</>}
          </div>
        </div>

        {/* LANDING PAGES QUE CONVIERTEN (P3) */}
        <div className="ec-sh"><h3>Landing pages que convierten</h3><span className="hint">a dónde mandar la pauta · GA4 · señal fiable = % carrito + rebote</span></div>
        {(() => {
          const webLabel = (pid: string) => data.webs.find((w) => w.property === pid)?.label || pid;
          const props = Array.from(new Set(data.landings.map((l) => l.property)));
          const base = data.landings.filter((l) => landWeb === 'all' || l.property === landWeb);
          const sgn = landSort.dir === 'desc' ? 1 : -1;
          const rows = [...base].sort((a, b) => sgn * (((b as any)[landSort.key] || 0) - ((a as any)[landSort.key] || 0)));
          const shown = landExpanded ? rows : rows.slice(0, 12);
          const SH = ({ k, children }: { k: typeof landSort.key; children: ReactNode }) => (
            <button className={'ec-th' + (landSort.key === k ? ' on' : '')} onClick={() => landSortBy(k)}>{children}{arrow(landSort.key === k, landSort.dir)}</button>
          );
          const shortPath = (p: string) => (p.length > 44 ? p.slice(0, 42) + '…' : p);
          return (
            <>
              <div className="ec-chips">
                <button className={'chip' + (landWeb === 'all' ? ' on' : '')} onClick={() => { setLandWeb('all'); setLandExpanded(false); }}>Todas <b>{data.landings.length}</b></button>
                {props.map((pid) => (
                  <button key={pid} className={'chip' + (landWeb === pid ? ' on' : '')} onClick={() => { setLandWeb(pid); setLandExpanded(false); }}>{webLabel(pid)} <b>{data.landings.filter((l) => l.property === pid).length}</b></button>
                ))}
              </div>
              <div className="card ec-pad">
                <div className="ec-lph">
                  <div>Landing</div><div>Web</div>
                  <SH k="sessions">Sesiones</SH><SH k="bounce">Rebote</SH>
                  <SH k="atcRate">% carrito</SH><SH k="purchases">Compras</SH><SH k="revenue">Revenue</SH>
                </div>
                {shown.map((l) => (
                  <div className="ec-lrow" key={l.property + l.page}>
                    <div className="lp" title={l.page}>{shortPath(l.page)}</div>
                    <div className="lw"><span className={'wchip ' + l.kind}>{l.kind === 'shopify' ? 'Shopify' : 'principal'}</span></div>
                    <div className="nv">{formatInt(l.sessions)}</div>
                    <div className="nv"><span className={l.bounce <= 0.35 ? 'good' : l.bounce >= 0.55 ? 'bad' : ''}>{formatPercent(l.bounce, 0)}</span></div>
                    <div className="nv"><span className={'rate ' + (l.atcRate >= data.siteAtcRateLanding * 1.5 ? 'hi' : l.atcRate < data.siteAtcRateLanding * 0.6 && l.sessions >= 50 ? 'lo' : '')}>{formatPercent(l.atcRate, 1)}</span></div>
                    <div className="nv">{l.purchases ? <b>{formatInt(l.purchases)}</b> : <span className="z">—</span>}</div>
                    <div className="nv">{l.revenue ? money(l.revenue) : <span className="z">—</span>}</div>
                  </div>
                ))}
                {rows.length > 12 && (
                  <button className="ec-more" onClick={() => setLandExpanded((x) => !x)}>
                    {landExpanded ? '▲ Ver menos' : `▼ Ver las ${rows.length} landings`}
                  </button>
                )}
                <p className="ec-foot">🧭 GA4 sub-registra la compra por landing → la señal accionable es <b>% carrito</b> (intención) y <b>rebote</b>. La venta real por producto vive en Shopify. Las landings de <b>alto carrito + bajo rebote</b> son las mejores para mandar pauta.</p>
              </div>
            </>
          );
        })()}

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

        {/* SALUD DE VENTA Y CLIENTES (P4) */}
        <div className="ec-sh"><h3>Salud de venta y clientes</h3><span className="hint">pedidos reales · Shopify · ticket, recurrencia y reembolsos</span></div>
        <div className="card ec-pad">
          <div className="abn-kpis">
            <div className="abn-k">
              <div className="l">🧾 Pedidos</div>
              <div className="v">{formatInt(data.salesHealth.orders)}</div>
              <div className={'s ' + (data.salesHealth.ordersDelta >= 0 ? 'up' : 'dn')}>{data.salesHealth.ordersDelta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(data.salesHealth.ordersDelta))}% vs. anterior</div>
            </div>
            <div className="abn-k">
              <div className="l">🎟️ Ticket promedio</div>
              <div className="v">{money(data.salesHealth.aov)}</div>
              <div className="s">{formatInt(data.salesHealth.units)} unidades vendidas</div>
            </div>
            <div className="abn-k">
              <div className="l">👥 Recurrentes</div>
              <div className={'v ' + (data.salesHealth.returningPct > 0 ? 'up' : 'dn')}>{formatPercent(data.salesHealth.returningPct, 0)}</div>
              <div className="s">{formatInt(data.salesHealth.newCustomers)} nuevos · {formatInt(data.salesHealth.returningCustomers)} recurrentes</div>
            </div>
            <div className="abn-k">
              <div className="l">↩️ Reembolsos</div>
              <div className={'v ' + (data.salesHealth.refundsValue > 0 ? 'dn' : 'up')}>{money(data.salesHealth.refundsValue)}</div>
              <div className="s">venta neta {money(data.salesHealth.netRevenue)}</div>
            </div>
          </div>
          {(() => {
            const s = data.salesHealth;
            const segs = [
              { k: 'Pagados', n: s.ordersPaid, cls: 'paid' },
              { k: 'Autorizados', n: s.ordersAuthorized, cls: 'auth' },
              { k: 'Pendientes', n: s.ordersPending, cls: 'pend' },
              { k: 'Reembolsados', n: s.ordersRefunded, cls: 'ref' },
              { k: 'Anulados', n: s.ordersVoided, cls: 'void' },
            ].filter((x) => x.n > 0);
            const tot = segs.reduce((a, x) => a + x.n, 0) || 1;
            if (segs.length === 0) return null;
            return (
              <div className="sh-status">
                <div className="sh-statlabel">Estado de los {formatInt(s.orders)} pedidos</div>
                <div className="sh-statbar">
                  {segs.map((x) => <i key={x.k} className={x.cls} style={{ width: (x.n / tot) * 100 + '%' }} title={`${x.k}: ${x.n}`} />)}
                </div>
                <div className="sh-statleg">
                  {segs.map((x) => <span key={x.k}><i className={'d ' + x.cls} />{x.k} <b>{formatInt(x.n)}</b></span>)}
                </div>
              </div>
            );
          })()}
          <div className={'ec-verdict' + (data.salesHealth.returningPct > 0 ? '' : ' warn')}>
            <span className="vk">Lectura</span>
            {data.salesHealth.returningPct > 0
              ? <><b>{formatPercent(data.salesHealth.returningPct, 0)}</b> de recompra. Fidelizar a quien ya compró baja el CAC efectivo — post-venta y recompra son la palanca más barata.</>
              : <><b>100% clientes nuevos, 0 recompras</b> — todo es adquisición, nada de retención. Con ticket de {money(data.salesHealth.aov)}, un flujo de post-venta/fidelización sube el LTV sin gastar más en pauta.{data.salesHealth.ordersPending > 0 ? <> Además, <b>{formatInt(data.salesHealth.ordersPending)}</b> pedidos siguen pendientes de pago.</> : null}</>}
          </div>
        </div>

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
/* canales por web (P1) */
.ec-sh .chleg{font-style:normal;display:inline-flex;align-items:center;gap:4px;margin-left:8px;color:var(--t3)}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
.dot.paid{background:var(--acc)}.dot.org{background:#0ea5e9}
.ec-chwebs{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.ec-chcard{background:var(--bg1);border:1px solid var(--b1);border-radius:16px;padding:16px 18px;display:flex;flex-direction:column}
.chc-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.chc-title{font-size:14px;font-weight:800;display:flex;align-items:center;gap:8px}
.chc-tot{font-size:10.5px;color:var(--t3);text-align:right;display:flex;flex-direction:column;gap:1px}
.chc-tot b{font-size:12px;color:var(--up);font-weight:800}.chc-tot em{font-style:normal;color:var(--warn);font-weight:600}
.chc-list{display:flex;flex-direction:column;gap:2px}
.chc-row{display:grid;grid-template-columns:130px 1fr 96px 42px;gap:10px;align-items:center;padding:5px 0}
.chc-row.rest{opacity:.65}
.chc-name{font-size:11.5px;font-weight:600;display:flex;align-items:center;gap:7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chc-bar{height:14px;background:var(--track);border-radius:5px;overflow:hidden}
.chc-bar i{display:block;height:100%;border-radius:5px}.chc-bar i.paid{background:var(--acc)}.chc-bar i.org{background:#0ea5e9}
.chc-metric{text-align:right;line-height:1.2}
.chc-metric b{font-size:12.5px;font-weight:800;font-variant-numeric:tabular-nums}
.chc-metric small{display:block;font-size:9px;color:var(--t3)}
.chc-delta{text-align:right;font-size:10.5px;font-weight:700;font-variant-numeric:tabular-nums}
.chc-delta.up{color:var(--up)}.chc-delta.dn{color:var(--dn)}
.chc-foot{margin-top:12px;font-size:10.5px;color:var(--t3);line-height:1.5;border-top:1px dashed var(--b1);padding-top:9px}.chc-foot b{color:var(--t2)}
/* carritos abandonados (P2) */
.abn-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:13px}
.abn-k{background:var(--bg2);border:1px solid var(--b1);border-radius:12px;padding:12px 14px}
.abn-k .l{font-size:11px;color:var(--t3);font-weight:600}
.abn-k .v{font-size:22px;font-weight:800;letter-spacing:-.02em;margin-top:4px;color:var(--t1)}
.abn-k .v.warn{color:var(--warn)}.abn-k .v.up{color:var(--up)}.abn-k .v.dn{color:var(--dn)}
.abn-k .s{font-size:10px;color:var(--t3);margin-top:3px}.abn-k .s.up{color:var(--up)}.abn-k .s.dn{color:var(--dn)}
.abn-spark{display:flex;align-items:flex-end;gap:3px;height:52px;margin:16px 2px 4px;padding-top:4px}
.abn-bar{flex:1;height:100%;display:flex;align-items:flex-end}
.abn-bar i{display:block;width:100%;background:var(--warn);border-radius:3px 3px 0 0;opacity:.7;min-height:0}
.abn-bar:hover i{opacity:1}
.ec-verdict.warn{border-left-color:var(--warn)}.ec-verdict.warn .vk{color:var(--warn)}
/* salud de venta y clientes (P4) */
.sh-status{margin-top:16px}
.sh-statlabel{font-size:10.5px;color:var(--t3);font-weight:600;margin-bottom:7px}
.sh-statbar{display:flex;height:14px;border-radius:6px;overflow:hidden;background:var(--track)}
.sh-statbar i{display:block;height:100%}
.sh-statbar i.paid,.sh-statleg .d.paid{background:var(--up)}
.sh-statbar i.auth,.sh-statleg .d.auth{background:#0ea5e9}
.sh-statbar i.pend,.sh-statleg .d.pend{background:var(--warn)}
.sh-statbar i.ref,.sh-statleg .d.ref{background:var(--dn)}
.sh-statbar i.void,.sh-statleg .d.void{background:var(--t3)}
.sh-statleg{display:flex;flex-wrap:wrap;gap:14px;margin-top:9px;font-size:10.5px;color:var(--t3)}
.sh-statleg span{display:inline-flex;align-items:center;gap:5px}
.sh-statleg .d{width:9px;height:9px;border-radius:3px;display:inline-block}
.sh-statleg b{color:var(--t1);font-weight:800}
/* landing pages (P3) */
.ec-lph,.ec-lrow{display:grid;grid-template-columns:1fr 92px 74px 66px 76px 66px 96px;gap:8px;align-items:center}
.ec-lph{font-size:9px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--t3);padding-bottom:8px;border-bottom:1px solid var(--b1)}
.ec-lph>*:not(:first-child):not(:nth-child(2)){text-align:right;justify-self:end}
.ec-lph>*:nth-child(2){text-align:center;justify-self:center}
.ec-lrow{padding:8px 0;border-top:1px solid var(--b1);font-size:12px}
.ec-lrow .lp{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--t2)}
.ec-lrow .lw{text-align:center}
.ec-lrow .nv{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.ec-lrow .nv .good{color:var(--up)}.ec-lrow .nv .bad{color:var(--dn)}
.ec-lrow .nv .rate.hi{color:var(--up)}.ec-lrow .nv .rate.lo{color:var(--dn)}
.ec-lrow .nv .z{color:var(--t3);font-weight:400}
.wchip{font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;padding:2px 6px;border-radius:5px;background:var(--bg3);color:var(--t3)}
.wchip.shopify{background:rgba(139,92,246,.12);color:var(--acc)}
.wchip.main{background:rgba(14,165,233,.12);color:#0ea5e9}
/* responsive · desktop angosto / tablet (preview de Cloud) */
@media(max-width:1024px){
  .ec-acts{grid-template-columns:1fr}
  .concrow{grid-template-columns:150px 1fr 88px;gap:10px}
}
/* tablas y comparativas colapsan antes de apretarse */
@media(max-width:900px){
  .ec-webs{grid-template-columns:1fr}.ec-hkpis{grid-template-columns:repeat(2,1fr)}
  .ec-chwebs{grid-template-columns:1fr}
  .chc-row{grid-template-columns:100px 1fr 84px 40px;gap:8px}
  .abn-kpis{grid-template-columns:repeat(2,1fr)}
  .ec-sph,.ec-sprow{grid-template-columns:1fr 60px 100px 104px}
  .ec-sph>*:nth-child(3),.ec-sprow>*:nth-child(3),.ec-sph>*:nth-child(4),.ec-sprow>*:nth-child(4),.ec-sph>*:nth-child(6),.ec-sprow>*:nth-child(6){display:none}
  .ec-cph,.ec-crow{grid-template-columns:1fr 46px 60px 104px}
  .ec-cph>*:nth-child(3),.ec-crow>*:nth-child(3),.ec-cph>*:nth-child(5),.ec-crow>*:nth-child(5),.ec-cph>*:nth-child(6),.ec-crow>*:nth-child(6){display:none}
  .ec-lph,.ec-lrow{grid-template-columns:1fr 74px 64px 74px 92px}
  .ec-lph>*:nth-child(2),.ec-lrow>*:nth-child(2),.ec-lph>*:nth-child(4),.ec-lrow>*:nth-child(4){display:none}
}
@media(max-width:560px){
  .ec-hkpis{grid-template-columns:1fr}
  .concrow{grid-template-columns:1fr 78px;grid-template-areas:'name val' 'bar bar';row-gap:5px}
  .concrow .cname{grid-area:name}.concrow .cval{grid-area:val}.concrow .cbar{grid-area:bar}
}
`;
