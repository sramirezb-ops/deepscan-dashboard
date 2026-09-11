'use client';

import { useState } from 'react';
import { useClient } from '@/lib/useClient';
import { useGadsProductBible, type BibleTier, type BibleProduct } from '@/lib/hooks/useGadsProductBible';
import { formatCurrency, formatInt, formatPercent } from '@/lib/utils';

const TIER_META: Record<string, { color: string; icon: string }> = {
  'over-index': { color: 'var(--up)', icon: '🔥' },
  'index': { color: '#7bbf5a', icon: '' },
  'near-index': { color: 'var(--warn)', icon: '' },
  'under-index': { color: '#e0a94a', icon: '' },
  'no-index': { color: '#c9ccd4', icon: '💀' },
};
const roasColor = (r: number) => (r >= 5 ? 'var(--up)' : r > 0 ? 'var(--t2)' : 'var(--dn)');
const fmtRoas = (r: number) => (r > 0 ? Math.round(r) + '×' : '—');

function channelIcon(c: string): string {
  const k = c.toLowerCase();
  if (k.includes('shop')) return '🛍️';
  if (k.includes('search')) return '🔍';
  if (k.includes('display')) return '🖼️';
  if (k.includes('video')) return '▶️';
  return '•';
}

export function GadsProductBible() {
  const client = useClient();
  const { data, loading, error } = useGadsProductBible(client.id);
  const cur = client.currency;
  const [openTiers, setOpenTiers] = useState<Record<string, boolean>>({ 'over-index': true });

  if (loading && !data) {
    return <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--t3)', marginTop: 20 }}>Cargando la biblia de productos…</div>;
  }
  if (error || !data || !data.hasData) {
    return null; // sin datos de productos: no rompemos la vista, dejamos las demás secciones
  }

  const t = data.totals;
  const activePct = t.totalProducts > 0 ? t.activeProducts / t.totalProducts : 0;
  const dead = data.tiers.find((x) => x.tier === 'no-index');
  const chMax = Math.max(...data.channels.map((c) => c.costPct), 0.01);

  const money = (v: number) => formatCurrency(v, cur);
  const fresh = data.freshness ? new Date(data.freshness).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className="gb">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Tesis de concentración */}
      <div className="gb-tesis">
        <div className="t">
          <b style={{ color: 'var(--up)' }}>{formatInt(t.activeProducts)} productos</b> mueven la venta ·{' '}
          <b style={{ color: 'var(--dn)' }}>{formatInt(t.deadProducts)} están muertos</b>
        </div>
        <div className="s">Solo el {formatPercent(activePct, 0)} del feed recibe pauta real. Escalar = activar los modelos con demanda que hoy no corren.</div>
      </div>

      {/* REDES (fijo, costo absoluto) */}
      <div className="gb-sh"><h3>¿En qué red se va la plata?</h3><span className="hint">costo absoluto y % · solo Shopping convierte</span>
        {fresh && <span className="fresh"><span className="dot" />Actualizado {fresh}</span>}
      </div>
      <div className="card gb-pad">
        {data.channels.map((c) => (
          <div className="gb-net" key={c.channel}>
            <div className="nn">{channelIcon(c.channel)} {c.channel[0].toUpperCase() + c.channel.slice(1)}</div>
            <div className="nb"><i style={{ width: (c.costPct / chMax) * 100 + '%', background: c.roas >= 5 ? 'var(--up)' : c.cost > 50 ? 'var(--dn)' : 'var(--track)' }} /></div>
            <div className="nm">{money(c.cost)}<span className="u">costo</span></div>
            <div className="nm">{formatPercent(c.costPct, 1)}<span className="u">del total</span></div>
            <div className="nm" style={{ color: roasColor(c.roas) }}>{fmtRoas(c.roas)}<span className="u">ROAS</span></div>
          </div>
        ))}
      </div>

      {/* PRODUCTOS · LA BIBLIA (expandable por tier) */}
      <div className="gb-sh"><h3>Productos · la biblia del feed</h3><span className="hint">clic en cada categoría para ver los productos · nombre · impr · clics · conv · costo · ROAS</span></div>
      <div className="card gb-pad">
        {data.tiers.map((tier) => (
          <TierBlock key={tier.tier} tier={tier} open={!!openTiers[tier.tier]}
            onToggle={() => setOpenTiers((s) => ({ ...s, [tier.tier]: !s[tier.tier] }))}
            totalConv={t.conversions} money={money} />
        ))}
        {dead && (
          <p className="gb-note">💡 <b>{formatInt((data.tiers.find((x) => x.tier === 'over-index')?.count) || 0)} productos over-index concentran el {formatPercent((data.tiers.find((x) => x.tier === 'over-index')?.convShare) || 0, 0)} de las conversiones.</b> Cruzado con Merchant por nombre.</p>
        )}
      </div>

      {/* HACIA DÓNDE APUNTA (search categories) */}
      <div className="gb-sh"><h3>Hacia dónde apunta PMax</h3><span className="hint">categorías de búsqueda · CVR = calidad</span></div>
      <div className="card gb-pad">
        {data.searchCats.length > 0 ? (
          <>
            {data.searchCats.map((c, i) => {
              const cvrPct = c.cvr;
              const col = cvrPct >= 0.1 ? 'var(--up)' : cvrPct >= 0.03 ? 'var(--warn)' : 'var(--dn)';
              const w = Math.min(100, Math.round(cvrPct / 0.37 * 100));
              return (
                <div className="gb-cat" key={i}>
                  <div className="nm">{c.label}</div>
                  <div className="cw"><div className="bar"><i style={{ width: Math.max(2, w) + '%', background: col }} /></div><div className="lab">CVR {formatPercent(cvrPct, 1)}</div></div>
                  <div className="m">{formatInt(c.impressions)}<span className="u">impr</span></div>
                  <div className="m"><span className="pill" style={{ background: col + '22', color: col }}>{formatInt(c.conversions)}</span><span className="u">conv</span></div>
                </div>
              );
            })}
          </>
        ) : (
          <div className="gb-empty">📡 Acumulando categorías de búsqueda — el script de PMax recién se vinculó a la cuenta nueva. Se llenará en los próximos días.</div>
        )}
      </div>

      {/* ACCIONES */}
      <div className="gb-sh"><h3>Qué haría para escalar</h3><span className="hint">lente de agencia · fee $10k/mo</span></div>
      <div className="gb-acts">
        <div className="gb-act good"><div className="tag">🔥 Escalar over-index</div><div className="body">Los <b>{formatInt((data.tiers.find((x) => x.tier === 'over-index')?.count) || 0)} over-index</b> ya rinden. Subir presupuesto aquí es el escalado de menor riesgo.</div></div>
        <div className="gb-act warn"><div className="tag">🧟 Revivir el feed</div><div className="body"><b>{formatInt(dead?.count || 0)} productos "no-index"</b> sin impresiones. Revisar issues del Merchant y activar los modelos con demanda.</div></div>
        <div className="gb-act bad"><div className="tag">✂️ Cortar el residual</div><div className="body">Search+Display se llevan costo con <b>0 conversiones</b>. Limitar esas redes concentra el gasto en Shopping.</div></div>
      </div>
    </div>
  );
}

function TierBlock({ tier, open, onToggle, totalConv, money }: {
  tier: BibleTier; open: boolean; onToggle: () => void; totalConv: number; money: (v: number) => string;
}) {
  const meta = TIER_META[tier.tier] || { color: 'var(--t3)', icon: '' };
  return (
    <div className="gb-tier">
      <div className={'gb-tierhead' + (open ? ' open' : '')} onClick={onToggle}>
        <span className="cx">▸</span>
        <div className="tl"><span className="tdot" style={{ background: meta.color }} />{tier.tier} {meta.icon}</div>
        <div className="tbar"><i style={{ width: Math.max(2, Math.round(tier.convShare * 100)) + '%', background: meta.color }} /></div>
        <div className="tm">{formatInt(tier.count)}<span className="u">productos</span></div>
        <div className="tm">{money(tier.cost)}<span className="u">costo</span></div>
        <div className="tm">{formatInt(tier.conversions)}<span className="u">conv</span></div>
        <div className="tm" style={{ color: meta.color }}>{formatPercent(tier.convShare, 0)}<span className="u">de la conv</span></div>
      </div>
      {open && (
        <div className="gb-prods">
          <div className="gb-prodh"><div>Producto</div><div>Impr.</div><div>Clics</div><div>Conv.</div><div>Costo</div><div>ROAS</div></div>
          {tier.products.map((p: BibleProduct) => (
            <div className="gb-prod" key={p.id}>
              <div className="pn" title={p.title}>{p.title}</div>
              <div className="mono">{formatInt(p.impressions)}</div>
              <div className="mono">{p.clicks > 0 ? formatInt(p.clicks) : '—'}</div>
              <div className="mono">{formatInt(p.conversions)}</div>
              <div className="mono">{money(p.cost)}</div>
              <div className="mono" style={{ color: roasColor(p.roas) }}>{fmtRoas(p.roas)}</div>
            </div>
          ))}
          {tier.count > tier.products.length && (
            <div className="gb-more">+ {formatInt(tier.count - tier.products.length)} productos más en este tier</div>
          )}
        </div>
      )}
    </div>
  );
}

const CSS = `
.gb{margin-top:22px}
.gb .mono{font-family:'Space Grotesk',Inter,sans-serif;font-variant-numeric:tabular-nums}
.gb-tesis{background:linear-gradient(120deg,var(--bg1),var(--acc-faint,rgba(139,92,246,.05)));border:1px solid var(--b1);border-radius:14px;padding:16px 20px}
.gb-tesis .t{font-size:16px;font-weight:800;letter-spacing:-.01em}
.gb-tesis .s{font-size:12.5px;color:var(--t2);margin-top:6px;line-height:1.5}
.gb-sh{display:flex;align-items:baseline;gap:11px;margin:26px 0 12px}.gb-sh h3{font-size:15px;font-weight:800;margin:0}.gb-sh .hint{font-size:11px;color:var(--t3)}
.gb-sh .fresh{margin-left:auto;font-size:10.5px;color:var(--up);display:flex;align-items:center;gap:5px;font-weight:600}.gb-sh .fresh .dot{width:7px;height:7px;border-radius:50%;background:var(--up)}
.gb-pad{padding:16px 18px}
/* redes */
.gb-net{display:grid;grid-template-columns:120px 1fr 96px 66px 62px;gap:12px;align-items:center;padding:8px 0;border-top:1px solid var(--b1)}
.gb-net:first-child{border-top:none}
.gb-net .nn{font-size:12.5px;font-weight:700}
.gb-net .nb{height:10px;background:var(--track);border-radius:5px;overflow:hidden}.gb-net .nb i{display:block;height:100%;border-radius:5px}
.gb-net .nm{text-align:right;font-size:12.5px;font-weight:800}.gb-net .nm .u{font-size:8.5px;color:var(--t3);display:block;font-weight:500}
/* tiers */
.gb-tier{border-top:1px solid var(--b1)}.gb-tier:first-child{border-top:none}
.gb-tierhead{display:grid;grid-template-columns:18px 150px 1fr 84px 78px 60px 74px;gap:10px;align-items:center;padding:11px 4px;cursor:pointer}
.gb-tierhead:hover{background:var(--bg2)}
.gb-tierhead .cx{color:var(--t3);font-size:9px;transition:transform .15s}.gb-tierhead.open .cx{transform:rotate(90deg)}
.gb-tierhead .tl{font-size:13px;font-weight:800;display:flex;align-items:center;gap:8px;text-transform:capitalize}
.gb-tierhead .tdot{width:10px;height:10px;border-radius:3px}
.gb-tierhead .tbar{height:9px;background:var(--track);border-radius:5px;overflow:hidden}.gb-tierhead .tbar i{display:block;height:100%;border-radius:5px}
.gb-tierhead .tm{text-align:right;font-size:12.5px;font-weight:800;font-family:'Space Grotesk',sans-serif}.gb-tierhead .tm .u{font-size:8px;color:var(--t3);display:block;font-weight:500}
.gb-prods{background:var(--bg2);border-radius:10px;margin:0 0 8px;padding:4px 8px}
.gb-prodh,.gb-prod{display:grid;grid-template-columns:1fr 76px 58px 56px 76px 54px;gap:10px;align-items:center;padding:7px 8px}
.gb-prodh{font-size:8.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--t3);border-bottom:1px solid var(--b1)}
.gb-prodh div:not(:first-child),.gb-prod div:not(.pn){text-align:right}
.gb-prod{border-top:1px solid var(--b1);font-size:11.5px}
.gb-prod .pn{font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gb-prod .mono{font-weight:700}
.gb-more{text-align:center;font-size:11px;color:var(--t3);padding:8px}
.gb-note{font-size:12px;color:var(--t2);margin-top:12px;line-height:1.5}.gb-note b{color:var(--t1)}
/* categorias */
.gb-cat{display:grid;grid-template-columns:1fr 110px 84px 62px;gap:12px;align-items:center;padding:8px 0;border-top:1px solid var(--b1)}
.gb-cat:first-child{border-top:none}
.gb-cat .nm{font-size:12.5px;font-weight:700}
.gb-cat .cw .bar{height:8px;background:var(--track);border-radius:5px;overflow:hidden}.gb-cat .cw .bar i{display:block;height:100%;border-radius:5px}
.gb-cat .cw .lab{font-size:9px;color:var(--t3);margin-top:3px}
.gb-cat .m{text-align:right;font-size:12px;font-weight:700;font-family:'Space Grotesk',sans-serif}.gb-cat .m .u{font-size:8.5px;color:var(--t3);display:block;font-weight:500}
.gb-cat .pill{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:800}
.gb-empty{text-align:center;font-size:12.5px;color:var(--t3);padding:22px 16px;line-height:1.5}
/* acciones */
.gb-acts{display:grid;grid-template-columns:repeat(3,1fr);gap:13px}
.gb-act{background:var(--bg1);border:1px solid var(--b1);border-radius:13px;padding:15px 17px;border-left:3px solid var(--acc)}
.gb-act.good{border-left-color:var(--up)}.gb-act.bad{border-left-color:var(--dn)}.gb-act.warn{border-left-color:var(--warn)}
.gb-act .tag{font-size:12px;font-weight:800;margin-bottom:6px}.gb-act .body{font-size:12px;color:var(--t2);line-height:1.5}.gb-act .body b{color:var(--t1)}
@media(max-width:820px){.gb-net{grid-template-columns:90px 1fr 70px}.gb-net .nm:nth-child(n+4){display:none}.gb-tierhead{grid-template-columns:16px 1fr 60px}.gb-tierhead .tbar,.gb-tierhead .tm:nth-child(n+5){display:none}.gb-prodh div:nth-child(n+3),.gb-prod div:nth-child(n+3):not(.pn){display:none}.gb-prodh,.gb-prod{grid-template-columns:1fr 66px}.gb-acts{grid-template-columns:1fr}}
`;
