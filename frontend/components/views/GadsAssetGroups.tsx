'use client';

import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { useGadsAssetGroups, type AssetGroupRow } from '@/lib/hooks/useGadsAssetGroups';
import {
  formatCurrency,
  formatNumber,
  formatInt,
  formatROAS,
  formatPercent,
} from '@/lib/utils';

// ============================================================
// GadsAssetGroups — performance por ASSET GROUP de Performance Max
// ============================================================
// En PMAX no existen los "ad groups" tradicionales: la unidad real de
// optimización es el ASSET GROUP. Esta sección lee gads_asset_groups
// (métricas diarias reales) a través del hook useGadsAssetGroups, que
// responde al filtro global de fechas y agrega por campaña + grupo.
//   · Tabla ordenada por ROAS con semáforos.
//   · Ad strength que Google calcula para cada grupo (POOR→EXCELLENT).
//   · Distribución de ad strength (cuántos grupos en cada nivel).
// Nada se inventa: si no hay filas en el rango, la sección no se pinta.
// ============================================================

function roasTone(roas: number): 'tgu' | 'tgm' | 'tgd' {
  if (roas >= 4) return 'tgu';
  if (roas >= 2.5) return 'tgm';
  return 'tgd';
}

// Ad strength de Google → semáforo + etiqueta legible.
function strengthTone(s: string): 'tgu' | 'tgm' | 'tgd' | 'tgn' {
  switch (s.toUpperCase()) {
    case 'EXCELLENT':
      return 'tgu';
    case 'GOOD':
      return 'tgu';
    case 'AVERAGE':
      return 'tgm';
    case 'POOR':
      return 'tgd';
    default:
      return 'tgn';
  }
}

function strengthLabel(s: string): string {
  switch (s.toUpperCase()) {
    case 'EXCELLENT':
      return 'Excelente';
    case 'GOOD':
      return 'Buena';
    case 'AVERAGE':
      return 'Media';
    case 'POOR':
      return 'Pobre';
    default:
      return 'Sin dato';
  }
}

// Orden visual de la distribución (mejor → peor → desconocido).
const STRENGTH_ORDER = ['EXCELLENT', 'GOOD', 'AVERAGE', 'POOR', 'UNKNOWN'];

export function GadsAssetGroups() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useGadsAssetGroups(client.id, range, previous);

  // Silencioso mientras carga: la vista PMAX ya muestra sus KPIs arriba.
  if (loading && !data) return null;
  // Si falla o no hay grupos en el rango, no inventamos una sección vacía.
  if (error || !data || data.groupCount === 0) return null;

  const cur = client.currency;
  const t = data.totals;

  // Distribución de ad strength en orden, solo niveles con grupos.
  const strengthEntries = STRENGTH_ORDER.filter((k) => data.strengthCounts[k] > 0).map((k) => ({
    key: k,
    count: data.strengthCounts[k],
  }));

  return (
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
        <h3 style={{ margin: '0', fontSize: '15px' }}>Asset groups · performance</h3>
        <span className="period-pill">
          {formatInt(data.groupCount)} grupos · <b>ordenados por ROAS</b>
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: '14px', lineHeight: 1.5 }}>
        En Performance Max la unidad de optimización es el <b>asset group</b>, no el ad group
        tradicional. Métricas reales agregadas en el rango seleccionado. El <b>ad strength</b> es la
        calificación que Google da a cada grupo según la variedad y calidad de sus assets.
      </div>

      {/* Distribución de ad strength */}
      {strengthEntries.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: '16px',
          }}
        >
          {strengthEntries.map((e) => (
            <span
              key={e.key}
              className={`tg ${strengthTone(e.key)}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <b>{e.count}</b> {strengthLabel(e.key)}
            </span>
          ))}
        </div>
      )}

      <table className="t">
        <thead>
          <tr>
            <th>Asset group</th>
            <th>Ad strength</th>
            <th>Impr.</th>
            <th>CTR</th>
            <th>Inversión</th>
            <th>Conv.</th>
            <th>CPA</th>
            <th>Revenue</th>
            <th>ROAS</th>
            <th>Share inv.</th>
          </tr>
        </thead>
        <tbody>
          {data.groups.map((g: AssetGroupRow) => {
            const share = t.cost > 0 ? g.cost / t.cost : 0;
            const key = `${g.campaign}␟${g.assetGroup}`;
            return (
              <tr key={key}>
                <td>
                  <b>{g.assetGroup}</b>
                  <span style={{ display: 'block', fontSize: 10, color: 'var(--mu)' }}>
                    {g.campaign}
                    {g.status && g.status.toUpperCase() !== 'ENABLED'
                      ? ` · ${g.status.toLowerCase()}`
                      : ''}
                  </span>
                </td>
                <td>
                  <span className={`tg ${strengthTone(g.adStrength)}`}>
                    {strengthLabel(g.adStrength)}
                  </span>
                </td>
                <td>{formatNumber(g.impressions)}</td>
                <td>{formatPercent(g.ctr, 1)}</td>
                <td>{formatCurrency(g.cost, cur)}</td>
                <td>{formatInt(g.conversions)}</td>
                <td>{g.conversions > 0 ? formatCurrency(g.cpa, cur) : '—'}</td>
                <td>{formatCurrency(g.revenue, cur)}</td>
                <td>
                  <span className={`tg ${roasTone(g.roas)}`}>
                    <b>{g.cost > 0 ? formatROAS(g.roas) : '—'}</b>
                  </span>
                </td>
                <td>
                  <span className="hb">
                    <span
                      className="hb-fill"
                      style={{
                        width: `${Math.max(2, Math.round(share * 100))}%`,
                        background: '#22d97a',
                      }}
                    />
                  </span>
                </td>
              </tr>
            );
          })}
          <tr className="t-avg">
            <td>Total</td>
            <td>—</td>
            <td>{formatNumber(t.impressions)}</td>
            <td>{formatPercent(t.ctr, 1)}</td>
            <td>{formatCurrency(t.cost, cur)}</td>
            <td>{formatInt(t.conversions)}</td>
            <td>{t.conversions > 0 ? formatCurrency(t.cpa, cur) : '—'}</td>
            <td>{formatCurrency(t.revenue, cur)}</td>
            <td>
              <b>{formatROAS(t.roas)}</b>
            </td>
            <td>—</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
