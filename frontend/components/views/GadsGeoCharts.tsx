'use client';

import { useState } from 'react';
import { useGadsGeo, type GeoModel } from '@/lib/hooks/useGadsGeo';
import { PieChart, type PieSlice } from '@/components/ui/PieChart';
import type { DateRange } from '@/lib/period';

// ============================================================
// GadsGeoCharts — bloque visual de localizaciones de Google Ads.
// Por el modelo de negocio "venta de vehículos" (Propietarios está desactivado):
//   · Conversiones (leads) por ciudad  (torta)
//   · Inversión por ciudad             (torta)
//   · Impresiones por ciudad           (torta)
//   · Ciudades que rinden              (tabla: CPL PONDERADO real por ciudad)
// El CPL por ciudad NO se muestra como torta: sumar los CPL de cada ciudad no
// tiene sentido (una micro-zona con 1 lead pesaría lo mismo que Bogotá). En su
// lugar mostramos el CPL ponderado (gasto ÷ leads) por ciudad, filtrando las
// zonas con muy pocos leads que distorsionan la lectura. 100% dato real.
// ============================================================

// Mínimo de leads para que una ciudad entre a la tabla de CPL ponderado.
const MIN_LEADS_CITY = 5;

function fmtCOP(v: number): string {
  if (v == null || isNaN(v)) return '—';
  return `$ ${Math.round(v).toLocaleString('es-CO')}`;
}
function fmtInt(v: number): string {
  if (v == null || isNaN(v)) return '—';
  return Math.round(v).toLocaleString('es-CO');
}
function fmtPct(ratio: number): string {
  if (ratio == null || isNaN(ratio)) return '—';
  return `${(ratio * 100).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

// Tabla honesta de CPL por ciudad: ponderado (gasto ÷ leads), no la suma de CPL.
function CityCplTable({ model, target }: { model: GeoModel; target?: number }) {
  const totalLeads = model.cities.reduce((s, c) => s + c.conversions, 0);
  const withLeads = model.cities
    .filter((c) => c.conversions >= MIN_LEADS_CITY)
    .sort((a, b) => b.conversions - a.conversions);

  if (withLeads.length === 0) {
    return (
      <div
        className="card"
        style={{ padding: 18, borderStyle: 'dashed', borderColor: 'var(--b2)', fontSize: 12, color: 'var(--mu)' }}
      >
        Ninguna ciudad supera {MIN_LEADS_CITY} leads en el período — muy poco volumen para un CPL por ciudad fiable.
      </div>
    );
  }

  const sumCost = withLeads.reduce((s, c) => s + c.cost, 0);
  const sumLeads = withLeads.reduce((s, c) => s + c.conversions, 0);
  const weightedCpl = sumLeads > 0 ? sumCost / sumLeads : 0;

  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Ciudades que rinden</div>
        <span className="period-pill">≥ {MIN_LEADS_CITY} leads</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="t">
          <thead>
            <tr>
              <th>Ciudad</th>
              <th>Inversión</th>
              <th>Leads</th>
              <th>CPL</th>
              <th>Participación</th>
            </tr>
          </thead>
          <tbody>
            {withLeads.map((c) => {
              const ok = target ? c.cpa <= target : true;
              return (
                <tr key={c.city}>
                  <td>
                    <b>{c.city}</b>
                  </td>
                  <td>{fmtCOP(c.cost)}</td>
                  <td>{fmtInt(c.conversions)}</td>
                  <td style={{ fontWeight: 800, color: target ? (ok ? 'var(--up)' : 'var(--dn)') : 'var(--t1)' }}>{fmtCOP(c.cpa)}</td>
                  <td>{totalLeads > 0 ? fmtPct(c.conversions / totalLeads) : '—'}</td>
                </tr>
              );
            })}
            <tr className="t-avg">
              <td>Top ciudades (ponderado)</td>
              <td>{fmtCOP(sumCost)}</td>
              <td>{fmtInt(sumLeads)}</td>
              <td style={{ fontWeight: 800 }}>{fmtCOP(weightedCpl)}</td>
              <td>{totalLeads > 0 ? fmtPct(sumLeads / totalLeads) : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 11, lineHeight: 1.5 }}>
        CPL <b>ponderado</b> (gasto ÷ leads), no la suma de los CPL de cada ciudad. Se excluyen zonas con &lt;{MIN_LEADS_CITY} leads
        (distorsionan el promedio).
      </div>
    </div>
  );
}

// Tortas + tabla del modelo "venta".
function ModelGeo({ model, label, target }: { model: GeoModel; label: string; target?: number }) {
  if (model.cities.length === 0) {
    return (
      <div style={{ marginTop: 20 }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: 14 }}>🛒 {label}</h4>
        <div
          className="card"
          style={{ padding: 18, borderStyle: 'dashed', borderColor: 'var(--b2)', fontSize: 12, color: 'var(--mu)' }}
        >
          Sin datos de localización para este período.
        </div>
      </div>
    );
  }

  const convSlices: PieSlice[] = model.cities.map((c) => ({ label: c.city, value: c.conversions }));
  const costSlices: PieSlice[] = model.cities.map((c) => ({ label: c.city, value: c.cost }));
  const imprSlices: PieSlice[] = model.cities.map((c) => ({ label: c.city, value: c.impressions }));

  return (
    <div style={{ marginTop: 20 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
        }}
      >
        <PieChart title="Conversiones (leads) por ciudad" slices={convSlices} formatValue={fmtInt} />
        <PieChart title="Inversión por ciudad" slices={costSlices} formatValue={fmtCOP} />
        <PieChart title="Impresiones por ciudad" slices={imprSlices} formatValue={fmtInt} />
        <CityCplTable model={model} target={target} />
      </div>
    </div>
  );
}

export function GadsGeoCharts({ clientId, range, target }: { clientId: string; range: DateRange; target?: number }) {
  const { data, loading, error } = useGadsGeo(clientId, range);
  const [open, setOpen] = useState(true);

  if (loading && !data) {
    return (
      <div className="card" style={{ marginTop: 24, padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--mu)' }}>
        Cargando localizaciones…
      </div>
    );
  }

  // Si falla la consulta (ej. tabla aún sin permisos) lo decimos sin romper la vista.
  if (error) {
    return (
      <div
        className="card"
        style={{ marginTop: 24, borderStyle: 'dashed', borderColor: 'var(--b2)', fontSize: 12, color: 'var(--mu)' }}
      >
        ℹ️ Las gráficas por ciudad aún no están disponibles ({error}).
      </div>
    );
  }

  return (
    <div style={{ marginTop: 28 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setOpen((o) => !o)}
      >
        <h3 style={{ margin: 0, fontSize: 17 }}>📍 Localizaciones · ¿de qué ciudades vienen los resultados?</h3>
        <span style={{ fontSize: 12, color: 'var(--mu)' }}>{open ? '▲ ocultar' : '▼ mostrar'}</span>
      </div>

      {open && (
        <>
          {!data || !data.hasAny ? (
            <div
              className="card"
              style={{ marginTop: 12, borderStyle: 'dashed', borderColor: 'var(--b2)', fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}
            >
              📍 Todavía no hay datos de localización para este período. En cuanto la sincronización de
              Google Ads traiga el desglose por ciudad, estas gráficas se llenarán automáticamente — sin
              inventar nada.
            </div>
          ) : (
            <ModelGeo model={data.venta} label="Venta de vehículos eléctricos" target={target} />
          )}
        </>
      )}
    </div>
  );
}
