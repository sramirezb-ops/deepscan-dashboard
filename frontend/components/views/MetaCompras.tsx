'use client';

import { HeroHead } from '@/components/ui/BrandLogo';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import {
  useMetaCompras,
  type ComprasCampaignRow,
  type ComprasAdRow,
} from '@/lib/hooks/useMetaCompras';
import { EmptyState } from '@/components/ui/EmptyState';
import { TrendChart } from '@/components/ui/TrendChart';
import { FunnelChart } from '@/components/ui/FunnelChart';
import {
  formatCurrency,
  formatInt,
  formatNumber,
  formatROAS,
  formatPercent,
  formatDelta,
  deltaDirection,
} from '@/lib/utils';

// "2026-06-16" → "16 jun" (sin depender de zona horaria)
function fmtDayShort(iso: string): string {
  const [, m, d] = iso.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${Number(d)} ${meses[Number(m) - 1] ?? m}`;
}

// Color del ROAS según rentabilidad (verde / ámbar / rojo).
function roasTone(roas: number): 'tgu' | 'tgm' | 'tgd' {
  if (roas >= 4) return 'tgu';
  if (roas >= 2.5) return 'tgm';
  return 'tgd';
}
function roasBarColor(roas: number): 'g' | 'a' | 'r' {
  if (roas >= 4) return 'g';
  if (roas >= 2.5) return 'a';
  return 'r';
}

// Miniatura del anuncio — usa thumb_url real cuando el ETL lo entregue; mientras
// tanto, un cuadrito neutro con la inicial del anuncio (honesto, sin inventar).
function AdThumb({ url, name }: { url: string | null; name: string }) {
  const letter = (name.trim()[0] || '?').toUpperCase();
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt={name}
        width={40}
        height={40}
        loading="lazy"
        style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', display: 'block' }}
      />
    );
  }
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 6,
        background: 'var(--b2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--mu)',
        flexShrink: 0,
      }}
      title="Miniatura pendiente del conector"
    >
      {letter}
    </div>
  );
}

export function MetaCompras() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useMetaCompras(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const previousLabel = formatRangeLabel(previous);

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Cargando campañas de compras de {client.name}…
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view on">
        <div
          className="card"
          style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}
        >
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>
            Error cargando Compras de Meta
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || data.campaigns.length === 0) {
    if (!data?.metaExistsEver) {
      return (
        <EmptyState
          icon="📘"
          title="Sin datos de Meta Ads"
          message={
            <>
              {client.name} no tiene datos de <b>Meta Ads</b> conectados por el momento. En cuanto el
              conector traiga datos, aparecerán aquí automáticamente.
            </>
          }
        />
      );
    }
    return (
      <EmptyState
        icon="🛒"
        title="Sin campañas de compras en este período"
        message={
          <>
            {client.name} tiene actividad en Meta, pero entre <b>{rangeLabel}</b> no se registraron
            campañas con intención de compra (vistas de producto, carritos o compras del píxel).
            {data && data.messagingCampaignCount > 0 && (
              <>
                {' '}
                Las campañas de mensajes están en la pestaña <b>WhatsApp</b>.
              </>
            )}
          </>
        }
        hint="Prueba ampliar el rango de fechas con el filtro de arriba."
      />
    );
  }

  const t = data.totals;
  const f = data.funnel;
  const cur = client.currency;
  const maxRoas = Math.max(...data.campaigns.map((c) => c.roas), 0.0001);

  const funnelStages = [
    { label: 'Ver contenido', value: f.viewContent, color: '#4c8bf5' },
    { label: 'Agregar al carrito', value: f.addToCart, color: '#7c5cf5' },
    { label: 'Iniciar checkout', value: f.initiateCheckout, color: '#c14cf5' },
    { label: 'Compras', value: f.purchases, color: '#22d97a' },
  ];

  // Series diarias (dato real) para las mini-gráficas de tendencia.
  const dl = data.daily;
  const dayLabels = dl.map((d) => fmtDayShort(d.date));

  return (
    <div className="view on">
      <div className="hero">
        <HeroHead brand="meta">Meta Ads · Compras</HeroHead>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {data.campaignCount} campañas de compra ·{' '}
          {formatCurrency(t.spend, cur)} invertido · {formatROAS(t.roas)} ROAS
        </div>
      </div>

      {/* KPIs reales */}
      <div className="kpis">
        <div className="kpi k-meta">
          <div className="kpi-lbl">Inversión</div>
          <div className="kpi-val">{formatCurrency(t.spend, cur)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${deltaDirection(data.spendDelta) === 'up' ? 'tgu' : 'tgd'}`}>
              {formatDelta(data.spendDelta)}
            </span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-meta">
          <div className="kpi-lbl">Revenue</div>
          <div className="kpi-val">{formatCurrency(t.purchaseValue, cur)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${deltaDirection(data.revenueDelta) === 'up' ? 'tgu' : 'tgd'}`}>
              {formatDelta(data.revenueDelta)}
            </span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-meta">
          <div className="kpi-lbl">ROAS</div>
          <div className="kpi-val">{formatROAS(t.roas)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${data.roasDelta >= 0 ? 'tgu' : 'tgd'}`}>
              {(data.roasDelta >= 0 ? '+' : '') + data.roasDelta.toFixed(2)}
            </span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-meta">
          <div className="kpi-lbl">Compras</div>
          <div className="kpi-val">{formatInt(t.purchases)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${deltaDirection(data.purchasesDelta) === 'up' ? 'tgu' : 'tgd'}`}>
              {formatDelta(data.purchasesDelta)}
            </span>
            <span className="dcmp">CPA {t.purchases > 0 ? formatCurrency(t.cpa, cur) : '—'}</span>
          </div>
        </div>
      </div>

      {/* Tendencias diarias — dato real, rejilla ejecutiva 2×2 */}
      <div
        style={{
          marginTop: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 16,
        }}
      >
        <TrendChart
          title="Compras / día"
          headline={formatInt(t.purchases)}
          sub="total del período"
          points={dl.map((d) => d.purchases)}
          labels={dayLabels}
          color="#22d97a"
          format={(v) => formatInt(v)}
        />
        <TrendChart
          title="ROAS / día"
          headline={formatROAS(t.roas)}
          sub="revenue ÷ inversión"
          points={dl.map((d) => d.roas)}
          labels={dayLabels}
          color="#8b5cf6"
          format={(v) => formatROAS(v)}
        />
        <TrendChart
          title="Costo por compra / día"
          headline={t.purchases > 0 ? formatCurrency(t.cpa, cur) : '—'}
          sub="inversión ÷ compras"
          points={dl.map((d) => d.cpa)}
          labels={dayLabels}
          color="#f59e0b"
          format={(v) => formatCurrency(v, cur)}
        />
        <TrendChart
          title="Carritos / día"
          headline={formatInt(t.addToCart)}
          sub="add to cart"
          points={dl.map((d) => d.addToCart)}
          labels={dayLabels}
          color="#4c8bf5"
          format={(v) => formatInt(v)}
        />
      </div>

      {/* Funnel real — view_content → add_to_cart → checkout → compra */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h3 style={{ margin: '0', fontSize: '15px' }}>Funnel de conversión</h3>
          <span className="period-pill">eventos del píxel · {rangeLabel}</span>
        </div>
        <FunnelChart stages={funnelStages} format={(v) => formatInt(v)} />
      </div>

      {/* Tabla por campaña — datos reales */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div className="dim-tbl-head">
          <div className="dim-tbl-title">
            <div className="dim-tbl-ic">🛒</div>
            <div>
              <div className="dim-tbl-label">Campañas de compra</div>
              <div className="dim-tbl-h">Resultados por campaña · ordenado por inversión</div>
            </div>
          </div>
          <span className="period-pill">{data.campaignCount} campañas</span>
        </div>
        <table className="t" id="meta-compras-camp">
          <thead>
            <tr>
              <th data-cat="dim">Campaña</th>
              <th data-cat="impr">Impr.</th>
              <th data-cat="impr">CTR</th>
              <th data-cat="cost">Inversión</th>
              <th data-cat="conv">Vistas prod.</th>
              <th data-cat="conv">Carritos</th>
              <th data-cat="conv">Compras</th>
              <th data-cat="cost,conv">Costo/compra</th>
              <th data-cat="rev">Revenue</th>
              <th data-cat="rev">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {data.campaigns.map((c: ComprasCampaignRow) => (
              <tr key={c.name}>
                <td data-cat="dim">
                  <b>{c.name}</b>
                </td>
                <td data-cat="impr">{formatNumber(c.impressions)}</td>
                <td data-cat="impr">{formatPercent(c.ctr, 1)}</td>
                <td data-cat="cost">{formatCurrency(c.spend, cur)}</td>
                <td data-cat="conv">{formatInt(c.viewContent)}</td>
                <td data-cat="conv">{formatInt(c.addToCart)}</td>
                <td data-cat="conv">{formatInt(c.purchases)}</td>
                <td data-cat="cost,conv">{c.purchases > 0 ? formatCurrency(c.cpa, cur) : '—'}</td>
                <td data-cat="rev">{formatCurrency(c.purchaseValue, cur)}</td>
                <td data-cat="rev">
                  <div className="cmp-cell">
                    <span className={`cmp-val ${roasTone(c.roas)}`}>{formatROAS(c.roas)}</span>
                    <div className="cmp-bar">
                      <div
                        className={`cmp-bar-fill ${roasBarColor(c.roas)}`}
                        style={{ width: `${Math.max(6, Math.round((c.roas / maxRoas) * 100))}%` }}
                      />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            <tr className="t-avg">
              <td data-cat="dim">Total</td>
              <td data-cat="impr">{formatNumber(t.impressions)}</td>
              <td data-cat="impr">{formatPercent(t.ctr, 1)}</td>
              <td data-cat="cost">{formatCurrency(t.spend, cur)}</td>
              <td data-cat="conv">{formatInt(t.viewContent)}</td>
              <td data-cat="conv">{formatInt(t.addToCart)}</td>
              <td data-cat="conv">{formatInt(t.purchases)}</td>
              <td data-cat="cost,conv">{t.purchases > 0 ? formatCurrency(t.cpa, cur) : '—'}</td>
              <td data-cat="rev">{formatCurrency(t.purchaseValue, cur)}</td>
              <td data-cat="rev">
                <b>{formatROAS(t.roas)}</b>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Tabla por anuncio — datos reales (miniatura cuando el conector la entregue) */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div className="dim-tbl-head">
          <div className="dim-tbl-title">
            <div className="dim-tbl-ic">🎯</div>
            <div>
              <div className="dim-tbl-label">Anuncios de compra</div>
              <div className="dim-tbl-h">
                Rendimiento por creativo · top {data.adCount} por inversión
              </div>
            </div>
          </div>
          <span className="period-pill">{data.adCount} anuncios</span>
        </div>
        <table className="t" id="meta-compras-ads">
          <thead>
            <tr>
              <th data-cat="dim">Anuncio</th>
              <th data-cat="impr">CTR</th>
              <th data-cat="cost">Inversión</th>
              <th data-cat="conv">Carritos</th>
              <th data-cat="conv">Compras</th>
              <th data-cat="cost,conv">Costo/compra</th>
              <th data-cat="rev">Revenue</th>
              <th data-cat="rev">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {data.ads.map((a: ComprasAdRow) => (
              <tr key={a.adId}>
                <td data-cat="dim">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AdThumb url={a.thumbUrl} name={a.adName} />
                    <div style={{ minWidth: 0 }}>
                      <b
                        style={{
                          display: 'block',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: 320,
                        }}
                      >
                        {a.adName}
                      </b>
                      <span style={{ fontSize: 11, color: 'var(--mu)' }}>{a.campaignName}</span>
                    </div>
                  </div>
                </td>
                <td data-cat="impr">{formatPercent(a.ctr, 1)}</td>
                <td data-cat="cost">{formatCurrency(a.spend, cur)}</td>
                <td data-cat="conv">{formatInt(a.addToCart)}</td>
                <td data-cat="conv">{formatInt(a.purchases)}</td>
                <td data-cat="cost,conv">{a.purchases > 0 ? formatCurrency(a.cpa, cur) : '—'}</td>
                <td data-cat="rev">{formatCurrency(a.purchaseValue, cur)}</td>
                <td data-cat="rev">
                  <div className="cmp-cell">
                    <span className={`cmp-val ${roasTone(a.roas)}`}>{formatROAS(a.roas)}</span>
                    <div className="cmp-bar">
                      <div
                        className={`cmp-bar-fill ${roasBarColor(a.roas)}`}
                        style={{ width: `${Math.max(6, Math.round((a.roas / maxRoas) * 100))}%` }}
                      />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Nota honesta */}
      <div
        className="card"
        style={{ marginTop: '20px', borderStyle: 'dashed', borderColor: 'var(--b2)' }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Cómo leer esta vista</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Todos los números son <b>reales</b> (conector de Meta Ads, nivel anuncio/día). Aquí solo se
          muestran las campañas con <b>intención de compra</b> del píxel (vistas de producto, carritos
          o compras).{' '}
          {data.messagingCampaignCount > 0 && (
            <>
              <b>{data.messagingCampaignCount}</b> campañas de mensajes se excluyen y viven en la
              pestaña <b>WhatsApp</b>.{' '}
            </>
          )}
          {data.otherCampaignCount > 0 && (
            <>
              Otras <b>{data.otherCampaignCount}</b> campañas sin intención de compra (alcance /
              visitas a perfil, {formatCurrency(data.otherSpend, cur)}) se irán a su sección.{' '}
            </>
          )}
          Las <b>miniaturas</b> de los anuncios{' '}
          {data.withThumb > 0 ? (
            <>ya llegan en {data.withThumb} de {data.adCount}.</>
          ) : (
            <>se activarán cuando extendamos el conector (hoy aún no las entrega).</>
          )}
        </div>
      </div>
    </div>
  );
}
