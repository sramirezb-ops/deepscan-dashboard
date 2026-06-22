'use client';

import { HeroHead } from '@/components/ui/BrandLogo';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useMetaCreatives, type MetaCreativeRow } from '@/lib/hooks/useMetaCreatives';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSortableTable, type SortAccessor } from '@/components/ui/useSortableTable';
import {
  formatCurrency,
  formatInt,
  formatNumber,
  formatROAS,
  formatPercent,
} from '@/lib/utils';

// ============================================================
// Milimetric — análisis a nivel anuncio/creativo de Meta
// ============================================================
// Datos reales de meta_campaigns agregados por ad_id. Respeta el filtro
// global de fechas. La fuente actual NO entrega miniaturas (thumb_url vacío)
// ni métricas de video (hook rate / retención), así que mostramos el
// rendimiento por anuncio con lo que sí existe y lo decimos claramente.
// ============================================================

function roasTone(roas: number): 'tgu' | 'tgm' | 'tgd' {
  if (roas >= 4) return 'tgu';
  if (roas >= 2.5) return 'tgm';
  return 'tgd';
}

const ROW_LIMIT = 30;

export function Milimetric() {
  const client = useClient();
  const { range } = usePeriod();
  const { data, loading, error } = useMetaCreatives(client.id, range);

  const rangeLabel = formatRangeLabel(range);
  const cur = client.currency;

  // Tabla por creativo: ordena sobre TODO el conjunto, luego pagina (slice).
  const creativesBase = data?.creatives ?? [];
  const creativeAccessors: SortAccessor<(typeof creativesBase)[number]>[] = [
    (r) => r.adName, // Anuncio
    (r) => r.impressions, // Impr.
    (r) => r.ctr, // CTR
    (r) => r.spend, // Inversión
    (r) => r.purchases, // Compras
    (r) => r.cpa, // CPA
    (r) => r.purchaseValue, // Revenue
    (r) => r.roas, // ROAS
    (r) => r.spend, // Share inv. — barra, ordena por inversión
  ];
  const { rows: creativeRows, headerProps: creativeHeader } = useSortableTable(
    creativesBase,
    creativeAccessors,
  );

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Cargando creativos de {client.name}…
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
            Error cargando creativos
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || data.creativeCount === 0) {
    return (
      <EmptyState
        icon="🎨"
        title="Sin creativos de Meta en este período"
        message={
          <>
            {client.name} no registró actividad de anuncios de Meta entre <b>{rangeLabel}</b>.
          </>
        }
        hint="Prueba ampliar el rango de fechas con el filtro de arriba."
      />
    );
  }

  const t = data.totals;
  const rows = creativeRows.slice(0, ROW_LIMIT);

  return (
    <div className="view on">
      <div className="hero">
        <HeroHead brand="meta">Análisis milimétrico · creativos</HeroHead>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {formatInt(data.creativeCount)} anuncios ·{' '}
          {formatCurrency(t.spend, cur)} invertido
        </div>
      </div>

      {/* KPIs reales del conjunto de creativos */}
      <div className="kpis">
        <div className="kpi k-meta">
          <div className="kpi-lbl">Inversión</div>
          <div className="kpi-val">{formatCurrency(t.spend, cur)}</div>
          <div className="kpi-bot">
            <span className="dcmp">{formatInt(data.creativeCount)} anuncios</span>
          </div>
        </div>
        <div className="kpi k-meta">
          <div className="kpi-lbl">Revenue</div>
          <div className="kpi-val">{formatCurrency(t.purchaseValue, cur)}</div>
          <div className="kpi-bot">
            <span className="dcmp">
              <b>{formatInt(t.purchases)}</b> compras
            </span>
          </div>
        </div>
        <div className="kpi k-green">
          <div className="kpi-lbl">ROAS</div>
          <div className="kpi-val">{formatROAS(t.roas)}</div>
          <div className="kpi-bot">
            <span className="dcmp">revenue / inversión</span>
          </div>
        </div>
        <div className="kpi k-meta">
          <div className="kpi-lbl">CTR</div>
          <div className="kpi-val">{formatPercent(t.ctr, 1)}</div>
          <div className="kpi-bot">
            <span className="dcmp">
              {formatNumber(t.clicks)} clics · {formatNumber(t.impressions)} impr.
            </span>
          </div>
        </div>
      </div>

      {/* Tabla por anuncio/creativo — datos reales */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <h3 style={{ margin: '0', fontSize: '15px' }}>Anuncios · performance por creativo</h3>
          <span className="period-pill">
            top {Math.min(ROW_LIMIT, data.creativeCount)} de {formatInt(data.creativeCount)} ·{' '}
            <b>por inversión</b>
          </span>
        </div>
        <table className="t">
          <thead>
            <tr>
              <th {...creativeHeader(0)}>Anuncio</th>
              <th {...creativeHeader(1)}>Impr.</th>
              <th {...creativeHeader(2)}>CTR</th>
              <th {...creativeHeader(3)}>Inversión</th>
              <th {...creativeHeader(4)}>Compras</th>
              <th {...creativeHeader(5)}>CPA</th>
              <th {...creativeHeader(6)}>Revenue</th>
              <th {...creativeHeader(7)}>ROAS</th>
              <th {...creativeHeader(8)}>Share inv.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c: MetaCreativeRow) => {
              const share = t.spend > 0 ? c.spend / t.spend : 0;
              return (
                <tr key={c.adId}>
                  <td>
                    <b>{c.adName}</b>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--mu)' }}>
                      {c.campaignName} · {c.adsetName}
                    </span>
                  </td>
                  <td>{formatNumber(c.impressions)}</td>
                  <td>{formatPercent(c.ctr, 1)}</td>
                  <td>{formatCurrency(c.spend, cur)}</td>
                  <td>{formatInt(c.purchases)}</td>
                  <td>{c.purchases > 0 ? formatCurrency(c.cpa, cur) : '—'}</td>
                  <td>{formatCurrency(c.purchaseValue, cur)}</td>
                  <td>
                    <span className={`tg ${roasTone(c.roas)}`}>
                      <b>{c.spend > 0 ? formatROAS(c.roas) : '—'}</b>
                    </span>
                  </td>
                  <td>
                    <span className="hb">
                      <span
                        className="hb-fill"
                        style={{
                          width: `${Math.max(2, Math.round(share * 100))}%`,
                          background: '#7c5cff',
                        }}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Aviso honesto sobre lo que la fuente actual NO entrega */}
      <div
        className="card"
        style={{ marginTop: '20px', borderStyle: 'dashed', borderColor: 'var(--b2)' }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Sobre estos datos</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          El desglose es real y llega a nivel de cada anuncio. La fuente actual de Meta{' '}
          <b>no está entregando miniaturas</b> de los creativos
          {data.withThumb === 0 ? '' : ` (solo ${data.withThumb} las traen)`} ni métricas de video
          como <b>hook rate</b> o <b>retención</b>, así que no las mostramos para no inventar nada.
          En cuanto la sincronización incluya esos campos, los sumamos aquí.
        </div>
      </div>
    </div>
  );
}
