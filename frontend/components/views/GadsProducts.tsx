'use client';

import { useClient } from '@/lib/useClient';
import { useGadsProducts, type GadsProductRow, type GadsZombieRow } from '@/lib/hooks/useGadsProducts';
import { formatCurrency, formatNumber, formatInt, formatROAS } from '@/lib/utils';
import { useSortableTable, type SortAccessor } from '@/components/ui/useSortableTable';

// ============================================================
// GadsProducts — detalle producto a producto de Google Ads
// ============================================================
// Se inyecta dentro de la vista PMAX. Lee dos FOTOS por período
// (no series diarias), por eso NO responde al filtro global de
// fechas: muestra una instantánea de los últimos 30 días.
//   · Top productos por revenue (datos reales de gads_products).
//   · Productos "zombie": impresiones sin un solo clic (gasto de
//     visibilidad sin retorno = candidatos a excluir del feed).
// Nada se inventa: si no hay datos, no se pinta la sección.
// ============================================================

function roasTone(roas: number): 'tgu' | 'tgm' | 'tgd' {
  if (roas >= 4) return 'tgu';
  if (roas >= 2.5) return 'tgm';
  return 'tgd';
}

const TOP_LIMIT = 12;
const ZOMBIE_LIMIT = 12;

export function GadsProducts() {
  const client = useClient();
  const { data, loading, error } = useGadsProducts(client.id, '30d');

  const topAccessors: SortAccessor<GadsProductRow>[] = [
    (p) => p.title,
    (p) => p.impressions,
    (p) => p.cost,
    (p) => p.conversions,
    (p) => p.revenue,
    (p) => p.roas,
  ];
  const { rows: topSorted, headerProps: topHeader } = useSortableTable(
    data?.topProducts ?? [],
    topAccessors,
  );

  const zombieAccessors: SortAccessor<GadsZombieRow>[] = [
    (z) => z.title,
    (z) => z.impressions,
  ];
  const { rows: zombieSorted, headerProps: zombieHeader } = useSortableTable(
    data?.zombies ?? [],
    zombieAccessors,
  );

  // Silencioso mientras carga: la vista PMAX ya muestra sus KPIs arriba.
  if (loading && !data) return null;
  // Si falla o no hay productos, no inventamos una sección vacía.
  if (error || !data || data.productCount === 0) return null;

  const cur = client.currency;
  const top = topSorted.slice(0, TOP_LIMIT);
  const zombies = zombieSorted.slice(0, ZOMBIE_LIMIT);

  return (
    <>
      {/* Top productos por revenue — datos reales de gads_products */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '4px',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <h3 style={{ margin: '0', fontSize: '15px' }}>Productos · top por revenue</h3>
          <span className="period-pill">
            {formatInt(data.productCount)} productos con actividad · <b>foto 30 días</b>
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: '14px', lineHeight: 1.5 }}>
          Instantánea de los últimos 30 días a nivel producto. No depende del filtro de fechas de
          arriba. Revenue total del período: <b>{formatCurrency(data.totalRevenue, cur)}</b> con
          una inversión de <b>{formatCurrency(data.totalCost, cur)}</b>.
        </div>
        <table className="t">
          <thead>
            <tr>
              <th {...topHeader(0)}>Producto</th>
              <th {...topHeader(1)}>Impr.</th>
              <th {...topHeader(2)}>Inversión</th>
              <th {...topHeader(3)}>Conv.</th>
              <th {...topHeader(4)}>Revenue</th>
              <th {...topHeader(5)}>ROAS</th>
            </tr>
          </thead>
          <tbody>
            {top.map((p) => (
              <tr key={p.itemId}>
                <td>
                  <b>{p.title}</b>
                  <span style={{ display: 'block', fontSize: 10, color: 'var(--mu)' }}>
                    {p.itemId}
                  </span>
                </td>
                <td>{formatNumber(p.impressions)}</td>
                <td>{formatCurrency(p.cost, cur)}</td>
                <td>{formatInt(p.conversions)}</td>
                <td>{formatCurrency(p.revenue, cur)}</td>
                <td>
                  <span className={`tg ${roasTone(p.roas)}`}>
                    <b>{p.cost > 0 ? formatROAS(p.roas) : '—'}</b>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Productos zombie — impresiones sin clics */}
      {zombies.length > 0 && (
        <div className="card" style={{ marginTop: '20px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '4px',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <h3 style={{ margin: '0', fontSize: '15px' }}>Productos zombie · impresiones sin clics</h3>
            <span className="period-pill">
              {formatInt(data.zombieCount)} zombies · {formatNumber(data.wastedImpressions)} impr.
              sin retorno
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: '14px', lineHeight: 1.5 }}>
            Productos que acumulan impresiones pero <b>cero clics</b>: gastan visibilidad sin generar
            tráfico. Son candidatos a revisar o excluir del feed. Foto de 30 días.
          </div>
          <table className="t">
            <thead>
              <tr>
                <th {...zombieHeader(0)}>Producto</th>
                <th {...zombieHeader(1)}>Impresiones sin clic</th>
              </tr>
            </thead>
            <tbody>
              {zombies.map((z) => (
                <tr key={z.itemId}>
                  <td>
                    <b>{z.title}</b>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--mu)' }}>
                      {z.itemId}
                    </span>
                  </td>
                  <td>
                    <span className="tg tgd">
                      <b>{formatNumber(z.impressions)}</b>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
