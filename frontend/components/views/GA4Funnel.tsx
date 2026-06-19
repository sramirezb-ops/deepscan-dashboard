'use client';

import { useGA4Funnel, type GA4FunnelData } from '@/lib/hooks/useGA4Funnel';
import type { DateRange } from '@/lib/period';
import { calcDelta, formatInt, formatPercentRaw } from '@/lib/utils';

// Pasos del funnel de leads (réplica de los filtros de Looker).
// Cada paso suma uno o más nombres de evento de GA4.
const LEAD_STEPS: { label: string; icon: string; events: string[]; color: string }[] = [
  { label: 'Escribir Correo', icon: '✉️', events: ['escribir_correo'], color: '#38bdf8' },
  { label: 'Descargar Catálogo', icon: '📄', events: ['descargar_catálogo'], color: '#a78bfa' },
  { label: 'Clics a WhatsApp', icon: '💬', events: ['clic_whatsapp', 'whatsapp_flotante'], color: '#34d399' },
];

// Normaliza un nombre de evento: minúsculas y sin acentos (matching tolerante).
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

// Suma el conteo (actual y anterior) de todos los nombres de evento de un paso.
function sumStep(data: GA4FunnelData, events: string[]): { count: number; prevCount: number } {
  const targets = new Set(events.map(norm));
  let count = 0;
  let prevCount = 0;
  for (const [name, agg] of data.byName.entries()) {
    if (targets.has(norm(name))) {
      count += agg.count;
      prevCount += agg.prevCount;
    }
  }
  return { count, prevCount };
}

// Píldora de delta con flecha (verde sube / rojo baja).
function Delta({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: up ? '#34d399' : '#f87171', whiteSpace: 'nowrap' }}>
      {up ? '▲' : '▼'} {(up ? '+' : '') + value.toFixed(1)}%
    </span>
  );
}

export function GA4Funnel({
  clientId,
  range,
  previous,
  sessions,
}: {
  clientId: string;
  range: DateRange;
  previous: DateRange;
  sessions: number; // sesiones del período (para la tasa de conversión)
}) {
  const { data, loading, error } = useGA4Funnel(clientId, range, previous);

  if (loading && !data) {
    return (
      <div className="card" style={{ marginTop: 20, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--mu)' }}>Cargando funnel de leads…</div>
      </div>
    );
  }

  // Calcula los pasos (aunque haya error, mostramos aviso honesto).
  const steps = data
    ? LEAD_STEPS.map((s) => {
        const { count, prevCount } = sumStep(data, s.events);
        return { ...s, count, prevCount, delta: calcDelta(count, prevCount) };
      })
    : [];

  const totalLeads = steps.reduce((acc, s) => acc + s.count, 0);
  const totalPrev = steps.reduce((acc, s) => acc + s.prevCount, 0);
  const maxCount = Math.max(...steps.map((s) => s.count), 1);
  const leadRate = sessions > 0 ? (totalLeads / sessions) * 100 : 0;

  // Sin datos reales de eventos → aviso honesto, no rompemos la vista.
  if (error || !data || totalLeads === 0) {
    return (
      <div
        className="card"
        style={{ marginTop: 20, padding: 20, borderStyle: 'dashed', borderColor: 'var(--b2)' }}
      >
        <h3 style={{ margin: '0 0 6px 0', fontSize: 15 }}>Funnel de leads</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)' }}>
          {error
            ? `No se pudieron cargar los eventos: ${error}`
            : 'Aún no hay eventos de leads (Escribir Correo, Descargar Catálogo, Clics a WhatsApp) en este período.'}
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>Funnel de leads · eventos clave</h3>
          <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 4 }}>
            <b style={{ color: 'var(--tx)', fontSize: 14 }}>{formatInt(totalLeads)}</b> leads ·{' '}
            <Delta value={calcDelta(totalLeads, totalPrev)} /> vs período anterior ·{' '}
            {formatPercentRaw(leadRate, 2)} de las sesiones
          </div>
        </div>
        <span className="period-pill">Escribir Correo · Descargar Catálogo · WhatsApp</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {steps.map((s) => {
          const w = Math.max(2, Math.round((s.count / maxCount) * 100));
          const rate = sessions > 0 ? (s.count / sessions) * 100 : 0;
          return (
            <div key={s.label}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 5,
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--tx)' }}>
                  <span style={{ marginRight: 6 }}>{s.icon}</span>
                  {s.label}
                </span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <b style={{ fontSize: 15 }}>{formatInt(s.count)}</b>
                  <Delta value={s.delta} />
                  <span style={{ fontSize: 11, color: 'var(--mu)' }}>{formatPercentRaw(rate, 2)} sesiones</span>
                </span>
              </div>
              <div style={{ height: 10, background: 'var(--b2)', borderRadius: 5, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${w}%`,
                    height: '100%',
                    background: s.color,
                    borderRadius: 5,
                    minWidth: 2,
                    transition: 'width .3s',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--mu)', lineHeight: 1.5 }}>
        Cada paso suma los eventos GA4 correspondientes (Clics a WhatsApp = clic_whatsapp +
        whatsapp_flotante). La tasa es eventos ÷ sesiones del período. Dato real de GA4.
      </div>
    </div>
  );
}
