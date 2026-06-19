'use client';

import { useState } from 'react';
import { useGadsGeo, type GeoModel } from '@/lib/hooks/useGadsGeo';
import { PieChart, type PieSlice } from '@/components/ui/PieChart';
import type { DateRange } from '@/lib/period';

// ============================================================
// GadsGeoCharts — bloque visual de localizaciones de Google Ads.
// Cuatro tortas por modelo de negocio (venta / propietarios):
//   · Conversiones (leads) por ciudad
//   · Inversión por ciudad
//   · Impresiones por ciudad
//   · Coste por lead por ciudad
// 100% dato real desde gads_geo. Si aún no hay datos, muestra un
// estado honesto (no inventa ciudades).
// ============================================================

function fmtCOP(v: number): string {
  if (v == null || isNaN(v)) return '—';
  return `$ ${Math.round(v).toLocaleString('es-CO')}`;
}
function fmtInt(v: number): string {
  if (v == null || isNaN(v)) return '—';
  return Math.round(v).toLocaleString('es-CO');
}

// Tortas de un modelo de negocio (4 métricas por ciudad).
function ModelGeo({ model, label }: { model: GeoModel; label: string }) {
  const icon = model.key === 'propietarios' ? '🤝' : '🛒';

  if (model.cities.length === 0) {
    return (
      <div style={{ marginTop: 20 }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: 14 }}>
          {icon} {label}
        </h4>
        <div
          className="card"
          style={{ padding: 18, borderStyle: 'dashed', borderColor: 'var(--b2)', fontSize: 12, color: 'var(--mu)' }}
        >
          Sin datos de localización para este modelo en el período seleccionado.
        </div>
      </div>
    );
  }

  const convSlices: PieSlice[] = model.cities.map((c) => ({ label: c.city, value: c.conversions }));
  const costSlices: PieSlice[] = model.cities.map((c) => ({ label: c.city, value: c.cost }));
  const imprSlices: PieSlice[] = model.cities.map((c) => ({ label: c.city, value: c.impressions }));
  // Coste/lead por ciudad: solo ciudades con leads (el CPA exige conversiones>0).
  const cpaSlices: PieSlice[] = model.cities
    .filter((c) => c.conversions > 0)
    .map((c) => ({ label: c.city, value: c.cpa }));

  return (
    <div style={{ marginTop: 20 }}>
      <h4 style={{ margin: '0 0 10px 0', fontSize: 14 }}>
        {icon} {label}
      </h4>
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
        <PieChart title="Coste por lead por ciudad" slices={cpaSlices} formatValue={fmtCOP} />
      </div>
    </div>
  );
}

export function GadsGeoCharts({ clientId, range }: { clientId: string; range: DateRange }) {
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
            <>
              <ModelGeo model={data.venta} label="Venta de vehículos eléctricos" />
              <ModelGeo model={data.propietarios} label="Propietarios" />
            </>
          )}
        </>
      )}
    </div>
  );
}
