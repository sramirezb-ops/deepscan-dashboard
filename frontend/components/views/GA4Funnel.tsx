'use client';

import { useGA4Funnel, type GA4FunnelData } from '@/lib/hooks/useGA4Funnel';
import type { GA4Totals } from '@/lib/hooks/useGA4';
import type { DateRange } from '@/lib/period';
import { calcDelta } from '@/lib/utils';

// ── Formateadores en español (96.092 · 1,55 · 6,73 %) ──────────
function fmtInt(n: number): string {
  if (n == null || isNaN(n)) return '—';
  return Math.round(n).toLocaleString('es-ES');
}
function fmtDec(n: number, d = 2): string {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(n: number, d = 2): string {
  if (n == null || isNaN(n)) return '—';
  return `${fmtDec(n, d)} %`;
}

// Nombres de evento GA4 que componen cada paso de leads (filtros de Looker).
const EV_ESCRIBIR = ['escribir_correo'];
const EV_CATALOGO = ['descargar_catálogo'];
const EV_WHATSAPP = ['clic_whatsapp', 'whatsapp_flotante'];

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Suma conteo actual y anterior de los nombres de evento de un paso.
function sumStep(data: GA4FunnelData, events: string[]): { count: number; prev: number } {
  const targets = new Set(events.map(norm));
  let count = 0;
  let prev = 0;
  for (const [name, agg] of data.byName.entries()) {
    if (targets.has(norm(name))) {
      count += agg.count;
      prev += agg.prevCount;
    }
  }
  return { count, prev };
}

// Píldora de delta con flecha (verde sube / rojo baja), estilo Looker.
function Delta({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: up ? '#34d399' : '#f87171', whiteSpace: 'nowrap' }}>
      {up ? '▲' : '▼'} {(up ? '+' : '') + value.toFixed(1).replace('.', ',')}%
    </span>
  );
}

// Una métrica dentro de un nivel del funnel: etiqueta + número grande + delta.
function Cell({ label, value, delta }: { label: string; value: string; delta: number }) {
  return (
    <div style={{ textAlign: 'center', padding: '4px 8px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--tx)', lineHeight: 1.1, marginBottom: 4 }}>
        {value}
      </div>
      <Delta value={delta} />
    </div>
  );
}

// Un nivel (caja oscura) del funnel; `width` controla el angostamiento.
function Level({ width, children }: { width: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        width,
        margin: '0 auto',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
        border: '1px solid var(--b2)',
        borderRadius: 12,
        padding: '16px 12px',
        display: 'flex',
        gap: 8,
      }}
    >
      {children}
    </div>
  );
}

export function GA4Funnel({
  clientId,
  range,
  previous,
  totals,
  totalsPrev,
}: {
  clientId: string;
  range: DateRange;
  previous: DateRange;
  totals: GA4Totals;
  totalsPrev: GA4Totals;
}) {
  const { data, loading, error } = useGA4Funnel(clientId, range, previous);

  // ── Métricas GA4 (sesiones, usuarios) y sus deltas ──────────
  const sessions = totals.sessions;
  const users = totals.users;
  const newUsers = totals.newUsers;
  const sessPerUser = users > 0 ? sessions / users : 0;
  const sessPerUserPrev = totalsPrev.users > 0 ? totalsPrev.sessions / totalsPrev.users : 0;
  const keyRate = sessions > 0 ? (totals.conversions / sessions) * 100 : 0;
  const keyRatePrev = totalsPrev.sessions > 0 ? (totalsPrev.conversions / totalsPrev.sessions) * 100 : 0;

  // ── Eventos de leads ────────────────────────────────────────
  const escribir = data ? sumStep(data, EV_ESCRIBIR) : { count: 0, prev: 0 };
  const catalogo = data ? sumStep(data, EV_CATALOGO) : { count: 0, prev: 0 };
  const whatsapp = data ? sumStep(data, EV_WHATSAPP) : { count: 0, prev: 0 };
  const totalLeads = escribir.count + catalogo.count + whatsapp.count;

  if (loading && !data) {
    return (
      <div className="card" style={{ marginTop: 20, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--mu)' }}>Cargando funnel de leads…</div>
      </div>
    );
  }

  if (error || !data || totalLeads === 0) {
    return (
      <div className="card" style={{ marginTop: 20, padding: 20, borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
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
      <h3 style={{ margin: '0 0 4px 0', fontSize: 16 }}>¿Cómo se comporta el Funnel de leads? · vs período anterior</h3>
      <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 18 }}>
        Sesiones → usuarios → eventos clave (Escribir Correo · Descargar Catálogo · Clics a WhatsApp). Dato real de GA4.
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(170px, 230px) 1fr',
          gap: 16,
          alignItems: 'center',
        }}
      >
        {/* Callout: tasa de evento clave de sesión */}
        <div
          style={{
            background: 'var(--bg3, rgba(255,255,255,0.04))',
            border: '1px solid var(--b2)',
            borderRadius: 12,
            padding: '16px 14px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 6 }}>
            Tasa de evento clave de sesión
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--tx)', lineHeight: 1.1, marginBottom: 6 }}>
            {fmtPct(keyRate)}
          </div>
          <Delta value={calcDelta(keyRate, keyRatePrev)} />
          <div style={{ marginTop: 14, fontSize: 18, color: 'var(--mu)' }}>↘</div>
        </div>

        {/* Cascada del funnel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Level width="100%">
            <Cell label="Sesiones por usuario" value={fmtDec(sessPerUser)} delta={calcDelta(sessPerUser, sessPerUserPrev)} />
            <Cell label="Sesiones" value={fmtInt(sessions)} delta={calcDelta(sessions, totalsPrev.sessions)} />
          </Level>
          <Level width="86%">
            <Cell label="Usuarios nuevos" value={fmtInt(newUsers)} delta={calcDelta(newUsers, totalsPrev.newUsers)} />
            <Cell label="Total de usuarios" value={fmtInt(users)} delta={calcDelta(users, totalsPrev.users)} />
          </Level>
          <Level width="72%">
            <Cell label="Escribir Correo" value={fmtInt(escribir.count)} delta={calcDelta(escribir.count, escribir.prev)} />
            <Cell label="Descargar Catálogo" value={fmtInt(catalogo.count)} delta={calcDelta(catalogo.count, catalogo.prev)} />
          </Level>
          <Level width="58%">
            <Cell label="Clics a WhatsApp" value={fmtInt(whatsapp.count)} delta={calcDelta(whatsapp.count, whatsapp.prev)} />
          </Level>
        </div>
      </div>

      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--mu)', lineHeight: 1.5 }}>
        Clics a WhatsApp = clic_whatsapp + whatsapp_flotante. Tasa de evento clave = eventos clave ÷ sesiones.
        Cada cifra se compara con el período anterior. 100% dato real de GA4.
      </div>
    </div>
  );
}
