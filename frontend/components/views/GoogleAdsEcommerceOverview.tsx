'use client';

import { HeroHead } from '@/components/ui/BrandLogo';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import {
  useGadsEcommerce,
  gadsTypeLabel,
  type GadsEcomCampaign,
  type GadsEcomTypeBucket,
  type GadsCampaignType,
  type GadsEcomMetrics,
  type GadsOwner,
} from '@/lib/hooks/useGadsEcommerce';
import { GadsGeoCharts } from '@/components/views/GadsGeoCharts';
import { GadsProducts } from '@/components/views/GadsProducts';
import { GadsAssetGroups } from '@/components/views/GadsAssetGroups';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSortableTable, type SortAccessor } from '@/components/ui/useSortableTable';
import { formatCurrency, formatInt, formatROAS } from '@/lib/utils';

// ── Paleta ────────────────────────────────────────────────────
const GREEN = '#34d399';
const RED = '#f87171';
const MUTED = 'var(--mu)';
const AMBER = '#f59e0b';
// Color por tipo de campaña (consistente en treemap, tarjetas y dona).
const TYPE_COLORS: Record<GadsCampaignType, string> = {
  PERFORMANCE_MAX: '#f59e0b',
  SHOPPING: '#3b82f6',
  SEARCH: '#8b5cf6',
  VIDEO: '#ef4444',
  DISPLAY: '#10b981',
  OTHER: '#94a3b8',
};
// Chip de gestor (Agencia vs IA·Aura) para la tabla de campañas.
const OWNER_CHIP: Record<'agencia' | 'ia', { l: string; c: string }> = {
  agencia: { l: 'Agencia', c: '#0ea5e9' }, ia: { l: 'IA·Aura', c: '#8b5cf6' },
};
function ownerChip(o: GadsOwner) {
  if (o !== 'agencia' && o !== 'ia') return <span style={{ color: MUTED }}>—</span>;
  const x = OWNER_CHIP[o];
  return <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.02em', padding: '1px 6px', borderRadius: 5, color: x.c, border: `1px solid ${x.c}`, whiteSpace: 'nowrap' }}>{x.l}</span>;
}
const TYPE_ICON: Record<GadsCampaignType, string> = {
  PERFORMANCE_MAX: '⚡',
  SHOPPING: '🛍️',
  SEARCH: '🔎',
  VIDEO: '▶️',
  DISPLAY: '🖼️',
  OTHER: '◎',
};

function fmtPct(ratio: number | null, dec = 2): string {
  if (ratio == null || isNaN(ratio)) return '—';
  return `${(ratio * 100).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })} %`;
}

// ── Delta pill ────────────────────────────────────────────────
function Delta({ value, mode = 'pct', good = 'up' }: { value: number; mode?: 'pct' | 'abs'; good?: 'up' | 'down' }) {
  if (value == null || isNaN(value)) return null;
  const up = value >= 0;
  const positive = good === 'up' ? up : !up;
  const color = value === 0 ? MUTED : positive ? GREEN : RED;
  const txt = mode === 'abs' ? `${up ? '+' : ''}${value.toFixed(2)}×` : `${up ? '+' : ''}${value.toFixed(1)}%`;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, whiteSpace: 'nowrap' }}>
      {up ? '▲' : '▼'} {txt}
    </span>
  );
}

// ── 2. Termómetro de intención — stat-callouts grandes ────────
function BigStat({
  label,
  value,
  delta,
  deltaMode = 'pct',
  deltaGood = 'up',
  accent,
  hint,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaMode?: 'pct' | 'abs';
  deltaGood?: 'up' | 'down';
  accent?: string;
  hint?: string;
}) {
  return (
    <div className="card" style={{ flex: '1 1 200px', minWidth: 190 }}>
      <div style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.05, marginTop: 6, color: accent ?? 'var(--tx)' }}>
        {value}
      </div>
      <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {delta !== undefined && <Delta value={delta} mode={deltaMode} good={deltaGood} />}
        {hint && <span style={{ fontSize: 11, color: MUTED }}>{hint}</span>}
      </div>
    </div>
  );
}

// ── 3. Treemap de inversión (slice-and-dice: tipo → campaña) ──
function Treemap({ byType, cur, totalCost }: { byType: GadsEcomTypeBucket[]; cur: string; totalCost: number }) {
  const types = byType.filter((b) => b.cost > 0);
  if (types.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 4, height: 300, width: '100%' }}>
      {types.map((t) => (
        <div key={t.type} style={{ flexGrow: t.cost, flexBasis: 0, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 60 }}>
          {t.campaigns
            .filter((c) => c.cost > 0)
            .map((c) => {
              const eff = c.atcRoas; // borde por eficiencia de intención
              const border = c.cartValue > 0 ? (eff >= 1 ? GREEN : RED) : 'var(--b2)';
              return (
                <div
                  key={c.name}
                  title={`${c.name}\n${gadsTypeLabel(c.type)} · ${formatCurrency(c.cost, cur)} (${(c.spendShare * 100).toFixed(0)}%)\natcROAS ${c.cartValue > 0 ? formatROAS(c.atcRoas) : '—'} · ${formatInt(c.carts)} carritos`}
                  style={{
                    flexGrow: c.cost,
                    flexBasis: 0,
                    minHeight: 26,
                    background: TYPE_COLORS[c.type],
                    borderRadius: 6,
                    borderLeft: `3px solid ${border}`,
                    padding: '6px 8px',
                    overflow: 'hidden',
                    color: '#0b0f14',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.85 }}>
                    {formatCurrency(c.cost, cur)} · {c.cartValue > 0 ? formatROAS(c.atcRoas) : '—'}
                  </div>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}

// ── 4. Tarjeta por tipo de campaña ────────────────────────────
function TypeCard({ t, cur }: { t: GadsEcomTypeBucket; cur: string }) {
  const color = TYPE_COLORS[t.type];
  return (
    <div className="card" style={{ flex: '1 1 240px', minWidth: 230, borderTop: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          {TYPE_ICON[t.type]} {t.label}
        </div>
        <span style={{ fontSize: 11, color: MUTED }}>{(t.spendShare * 100).toFixed(0)}% del gasto</span>
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 12, marginBottom: 12, height: 6, borderRadius: 4, overflow: 'hidden', background: 'var(--b2)' }}>
        <div style={{ width: `${t.spendShare * 100}%`, background: color }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
        <Cell label="Inversión" value={formatCurrency(t.cost, cur)} />
        <Cell label="atcROAS" value={t.cartValue > 0 ? formatROAS(t.atcRoas) : '—'} accent={t.cartValue > 0 ? (t.atcRoas >= 1 ? GREEN : RED) : undefined} />
        <Cell label="Carritos" value={formatInt(t.carts)} />
        <Cell label="Valor carrito" value={formatCurrency(t.cartValue, cur)} />
        <Cell label="CTR" value={fmtPct(t.ctr, 1)} />
        <Cell label="CPC" value={formatCurrency(t.cpc, cur)} />
      </div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 12 }}>
        {t.campaignCount} campaña{t.campaignCount === 1 ? '' : 's'}
      </div>
    </div>
  );
}
function Cell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: MUTED }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ?? 'var(--tx)' }}>{value}</div>
    </div>
  );
}

// ── 5. Embudo de intención: impresiones → clics → carritos ────
function IntentFunnel({ m, cur }: { m: GadsEcomMetrics; cur: string }) {
  const stages = [
    { label: 'Impresiones', value: m.impressions, sub: null as string | null },
    { label: 'Clics', value: m.clicks, sub: `CTR ${fmtPct(m.ctr, 1)}` },
    { label: 'Carritos añadidos', value: m.carts, sub: `Tasa de carrito ${fmtPct(m.cartRate, 1)}` },
  ];
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {stages.map((s, i) => {
        const w = Math.max((s.value / max) * 100, 2);
        return (
          <div key={s.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: 'var(--tx)' }}>{s.label}</span>
              <span style={{ color: MUTED }}>
                <b style={{ color: 'var(--tx)' }}>{formatInt(s.value)}</b>
                {s.sub ? ` · ${s.sub}` : ''}
              </span>
            </div>
            <div style={{ height: 22, borderRadius: 6, background: 'var(--b2)', overflow: 'hidden' }}>
              <div style={{ width: `${w}%`, height: '100%', background: AMBER, opacity: 1 - i * 0.22, borderRadius: 6 }} />
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
        El embudo mide intención (carrito), no compra. Valor de carrito total: <b style={{ color: 'var(--tx)' }}>{formatCurrency(m.cartValue, cur)}</b>.
      </div>
    </div>
  );
}

// ── 8. Evolución diaria: barras = valor de carrito; línea = inversión ──
function DailyChart({ daily, cur }: { daily: { date: string; cost: number; cartValue: number }[]; cur: string }) {
  if (daily.length < 2) return null;
  const W = 720, H = 200, padL = 8, padR = 8, padT = 16, padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = daily.length;
  const maxVal = Math.max(...daily.map((d) => d.cartValue), 1);
  const maxCost = Math.max(...daily.map((d) => d.cost), 1);
  const step = innerW / n;
  const bw = step * 0.6;
  const linePts = daily
    .map((d, i) => `${(padL + step * i + step / 2).toFixed(1)},${(padT + innerH - (d.cost / maxCost) * innerH).toFixed(1)}`)
    .join(' ');
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: MUTED, marginBottom: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: GREEN }} /> Valor de carrito
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 2, background: AMBER }} /> Inversión (escala propia)
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        {daily.map((d, i) => {
          const h = (d.cartValue / maxVal) * innerH;
          const x = padL + step * i + (step - bw) / 2;
          return <rect key={d.date} x={x} y={padT + innerH - h} width={bw} height={h} rx={2} fill={GREEN} opacity={0.55} />;
        })}
        <polyline points={linePts} fill="none" stroke={AMBER} strokeWidth={2} />
        <text x={padL} y={H - 6} fontSize={10} fill={MUTED}>{daily[0].date.slice(5)}</text>
        <text x={W - padR} y={H - 6} fontSize={10} fill={MUTED} textAnchor="end">{daily[n - 1].date.slice(5)}</text>
      </svg>
    </div>
  );
}

export function GoogleAdsEcommerceOverview() {
  const client = useClient();
  const cur = client.currency;
  const { range, previous } = usePeriod();
  const { data, loading, error } = useGadsEcommerce(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const previousLabel = formatRangeLabel(previous);

  const campAccessors: SortAccessor<GadsEcomCampaign>[] = [
    (c) => c.name,
    (c) => c.type,
    (c) => c.cost,
    (c) => c.impressions,
    (c) => c.clicks,
    (c) => c.ctr,
    (c) => c.cpc,
    (c) => c.carts,
    (c) => c.cartValue,
    (c) => c.atcRoas,
    (c) => c.purchaseRoas,
    (c) => c.owner,
  ];
  const { rows: campRows, headerProps: campHeader } = useSortableTable(data?.campaigns ?? [], campAccessors);

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: MUTED }}>Cargando campañas de Google Ads de {client.name}…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view on">
        <div className="card" style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}>
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>Error cargando Google Ads</div>
          <div style={{ fontSize: 12, color: MUTED }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || !data.hasAny) {
    if (!data?.existsEver) {
      return (
        <EmptyState
          icon="🟢"
          title="Sin campañas de Google Ads"
          message={
            <>
              {client.name} no tiene campañas de <b>Google Ads</b> conectadas por el momento. En cuanto haya
              actividad, aparecerá aquí automáticamente.
            </>
          }
        />
      );
    }
    return (
      <EmptyState
        icon="📅"
        title="Sin actividad en este período"
        message={
          <>
            {client.name} tiene campañas de Google Ads, pero no registraron actividad entre <b>{rangeLabel}</b>.
          </>
        }
        hint="Prueba ampliar el rango de fechas con el filtro de arriba."
      />
    );
  }

  const m = data.metrics;
  const d = data.deltas;
  const hasIS = m.searchImprShare != null;

  return (
    <div className="view on">
      {/* 1. Hero honesto — intención */}
      <div className="hero">
        <HeroHead brand="google-ads">Google Ads · Overview</HeroHead>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {formatCurrency(m.cost, cur)} invertido →{' '}
          <b style={{ color: 'var(--tx)' }}>{formatInt(m.carts)} carritos</b> ·{' '}
          atcROAS <b style={{ color: m.atcRoas >= 1 ? GREEN : RED }}>{formatROAS(m.atcRoas)}</b>
        </div>
        <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <span style={{ fontSize: 12 }}>🛒</span>
          <span style={{ fontSize: 12, color: 'var(--tx)' }}>
            <b>Intención de compra</b>, no venta. Google mide <b>carritos añadidos</b>. La venta real vive en Overview.
          </span>
        </div>
      </div>

      {/* 2. Termómetro de intención */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4 }}>
        <BigStat label="Inversión" value={formatCurrency(m.cost, cur)} delta={d.cost} deltaGood="down" hint={`vs ${previousLabel}`} />
        <BigStat label="Carritos añadidos" value={formatInt(m.carts)} delta={d.carts} hint={`vs ${previousLabel}`} />
        <BigStat label="Valor de carrito" value={formatCurrency(m.cartValue, cur)} delta={d.cartValue} hint={`vs ${previousLabel}`} />
        <BigStat label="atcROAS (intención)" value={formatROAS(m.atcRoas)} delta={d.atcRoas} deltaMode="abs" accent={m.atcRoas >= 1 ? GREEN : RED} hint={`vs ${previousLabel}`} />
      </div>

      {/* 2b. Compra real (PURCHASE) + Agencia vs IA */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>🛍️ Compra real & gestión</div>
          <div style={{ fontSize: 11, color: MUTED }}>El ROAS de compra aísla la conversión <b>PURCHASE</b> (ignora view item / carrito, que inflan)</div>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <BigStat label="ROAS de compra (real)" value={m.purchaseConv > 0 ? formatROAS(m.purchaseRoas) : '—'} accent={m.purchaseRoas >= 1 ? GREEN : RED} hint="revenue PURCHASE ÷ inversión" />
          <BigStat label="Compras" value={formatInt(Math.round(m.purchaseConv))} hint="conversión PURCHASE" />
          <BigStat label="Valor de compra" value={formatCurrency(m.purchaseValue, cur)} hint="PURCHASE · all_conv_value" />
        </div>
        {data.ownerSplit.ia.count > 0 && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14, alignItems: 'stretch' }}>
            {([['nosotros', 'Nosotros', '#0ea5e9'], ['ia', 'IA · Aura', '#8b5cf6']] as const).map(([k, lbl, col]) => {
              const s = data.ownerSplit[k];
              return (
                <div key={k} className="card" style={{ flex: '1 1 230px', minWidth: 210, borderLeft: `3px solid ${col}`, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em', color: col }}>{lbl}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 3 }}>
                    <span style={{ fontSize: 22, fontWeight: 800 }}>{s.purchaseConv > 0 ? formatROAS(s.purchaseRoas) : '—'}</span>
                    <span style={{ fontSize: 11, color: MUTED }}>ROAS compra · {s.count} camp. · {formatCurrency(s.cost, cur)} · {formatInt(Math.round(s.purchaseConv))} compras</span>
                  </div>
                </div>
              );
            })}
            <div style={{ alignSelf: 'center', fontSize: 11, color: MUTED, maxWidth: 230 }}>Quién creó cada campaña. "Nosotros" incluye lo histórico sin registro de creación.</div>
          </div>
        )}
      </div>

      {/* 3. Mapa de inversión por tipo (treemap) */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>🗺️ Mapa de inversión por campaña</div>
          <div style={{ fontSize: 11, color: MUTED }}>Tamaño = gasto · color = tipo · borde = atcROAS (verde ≥ 1×)</div>
        </div>
        <Treemap byType={data.byType} cur={cur} totalCost={m.cost} />
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
          {data.byType.filter((b) => b.cost > 0).map((b) => (
            <span key={b.type} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: TYPE_COLORS[b.type] }} />
              <span style={{ color: 'var(--tx)' }}>{b.label}</span>
              <span style={{ color: MUTED }}>{(b.spendShare * 100).toFixed(0)}%</span>
            </span>
          ))}
        </div>
      </div>

      {/* 4. Tarjetas por tipo de campaña */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 16 }}>
        {data.byType.filter((b) => b.cost > 0).map((b) => (
          <TypeCard key={b.type} t={b} cur={cur} />
        ))}
      </div>

      {/* 5. Embudo de intención + 6. Impression share (lado a lado en desktop) */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
        <div className="card" style={{ flex: '1 1 340px', minWidth: 300 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>🔻 Embudo de intención</div>
          <IntentFunnel m={m} cur={cur} />
        </div>
        {hasIS && (
          <div className="card" style={{ flex: '1 1 300px', minWidth: 280 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>🎯 Cuota de impresiones</div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 14 }}>Search / Shopping · cuánto mercado capturas</div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, color: MUTED }}>Impression Share</div>
                <div style={{ fontSize: 30, fontWeight: 800 }}>{fmtPct(m.searchImprShare, 1)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: MUTED }}>Abs. Top (1ª pos.)</div>
                <div style={{ fontSize: 30, fontWeight: 800 }}>{fmtPct(m.searchAbsTopShare, 1)}</div>
              </div>
            </div>
            <div style={{ height: 10, borderRadius: 6, background: 'var(--b2)', overflow: 'hidden', marginTop: 14 }}>
              <div style={{ width: `${(m.searchImprShare ?? 0) * 100}%`, height: '100%', background: AMBER }} />
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
              Pierdes <b style={{ color: RED }}>{fmtPct(1 - (m.searchImprShare ?? 0), 1)}</b> del mercado disponible. PMAX no reporta cuota y no entra en este cálculo.
            </div>
          </div>
        )}
      </div>

      {/* 7. PMAX profundo — productos + asset groups (se auto-ocultan si no hay datos) */}
      <GadsProducts />
      <GadsAssetGroups />

      {/* 8. Evolución diaria */}
      {data.daily.length >= 2 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>📈 Evolución diaria de intención</div>
          <DailyChart daily={data.daily} cur={cur} />
        </div>
      )}

      {/* Tabla completa de campañas */}
      <details className="card" style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 700, listStyle: 'none' }}>
          ▸ Tabla completa de campañas ({data.campaigns.length})
        </summary>
        <div style={{ overflowX: 'auto', marginTop: 14 }}>
          <table className="t">
            <thead>
              <tr>
                <th {...campHeader(0)}>Campaña</th>
                <th {...campHeader(1)}>Tipo</th>
                <th {...campHeader(2)}>Gasto</th>
                <th {...campHeader(3)}>Impresiones</th>
                <th {...campHeader(4)}>Clics</th>
                <th {...campHeader(5)}>CTR</th>
                <th {...campHeader(6)}>CPC</th>
                <th {...campHeader(7)}>Carritos</th>
                <th {...campHeader(8)}>Valor carrito</th>
                <th {...campHeader(9)}>atcROAS</th>
                <th {...campHeader(10)}>ROAS compra</th>
                <th {...campHeader(11)}>Gestor</th>
              </tr>
            </thead>
            <tbody>
              {campRows.map((c: GadsEcomCampaign) => (
                <tr key={c.name}>
                  <td>
                    <b>{c.name}</b>
                    <div style={{ fontSize: 10, color: MUTED }}>{(c.spendShare * 100).toFixed(0)}% del gasto</div>
                  </td>
                  <td><span className="pl pl-google">{gadsTypeLabel(c.type)}</span></td>
                  <td>{formatCurrency(c.cost, cur)}</td>
                  <td>{formatInt(c.impressions)}</td>
                  <td>{formatInt(c.clicks)}</td>
                  <td>{fmtPct(c.ctr, 0)}</td>
                  <td>{formatCurrency(c.cpc, cur)}</td>
                  <td>{formatInt(c.carts)}</td>
                  <td>{formatCurrency(c.cartValue, cur)}</td>
                  <td style={{ color: c.cartValue > 0 ? (c.atcRoas >= 1 ? GREEN : RED) : MUTED, fontWeight: 600 }}>
                    {c.cartValue > 0 ? formatROAS(c.atcRoas) : '—'}
                  </td>
                  <td style={{ color: c.purchaseConv > 0 ? (c.purchaseRoas >= 1 ? GREEN : RED) : MUTED, fontWeight: 600 }}>
                    {c.purchaseConv > 0 ? formatROAS(c.purchaseRoas) : '—'}
                  </td>
                  <td>{ownerChip(c.owner)}</td>
                </tr>
              ))}
              <tr className="t-avg">
                <td>Total</td>
                <td>—</td>
                <td>{formatCurrency(m.cost, cur)}</td>
                <td>{formatInt(m.impressions)}</td>
                <td>{formatInt(m.clicks)}</td>
                <td>{fmtPct(m.ctr, 0)}</td>
                <td>{formatCurrency(m.cpc, cur)}</td>
                <td>{formatInt(m.carts)}</td>
                <td>{formatCurrency(m.cartValue, cur)}</td>
                <td style={{ color: m.atcRoas >= 1 ? GREEN : RED, fontWeight: 600 }}>{formatROAS(m.atcRoas)}</td>
                <td style={{ color: m.purchaseRoas >= 1 ? GREEN : RED, fontWeight: 600 }}>{m.purchaseConv > 0 ? formatROAS(m.purchaseRoas) : '—'}</td>
                <td>—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      {/* Geo */}
      <GadsGeoCharts clientId={client.id} range={range} />

      {/* Nota honesta de cierre */}
      <div className="card" style={{ marginTop: 24, borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
          ℹ️ Datos 100% reales de <b>Google Ads</b> ({data.campaigns.length} campañas). La conversión que mide
          esta cuenta es <b>añadir al carrito</b>, así que carritos, valor de carrito y <b>atcROAS</b> son
          <b> intención de compra</b> (atribución de plataforma), no venta confirmada. La venta real se
          concilia en Overview (GA4/Shopify). La cuota de impresiones aplica solo a Search/Shopping, no a PMAX.
        </div>
      </div>
    </div>
  );
}
