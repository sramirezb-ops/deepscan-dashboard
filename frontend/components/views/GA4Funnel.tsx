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

// Nombres de evento GA4 que componen cada paso de leads.
const EV_ESCRIBIR = ['escribir_correo'];
const EV_CATALOGO = ['descargar_catálogo'];
const EV_WHATSAPP = ['clic_whatsapp', 'whatsapp_flotante'];

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}
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

function Delta({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: up ? 'var(--up)' : 'var(--dn)', whiteSpace: 'nowrap' }}>
      {up ? '▲ +' : '▼ '}{Math.abs(value).toFixed(1).replace('.', ',')}%
    </span>
  );
}

// Celda de un nivel: etiqueta + número grande (en el color del nivel) + delta.
function Cell({ label, value, delta, color }: { label: string; value: string; delta: number | null; color: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '2px 8px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 3, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1.1, fontFamily: "'Space Grotesk',sans-serif" }}>{value}</div>
      {delta != null && <div style={{ marginTop: 3 }}><Delta value={delta} /></div>}
    </div>
  );
}

// Nivel (caja con degradado según su color); `width` controla el angostamiento.
function Level({ width, color, goal, children }: { width: string; color: string; goal?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        width,
        margin: '0 auto',
        position: 'relative',
        background: `linear-gradient(165deg, color-mix(in srgb, ${color} 16%, var(--bg1)), color-mix(in srgb, ${color} 6%, var(--bg1)))`,
        border: `1px solid color-mix(in srgb, ${color} 34%, transparent)`,
        borderRadius: 12,
        padding: '15px 12px',
        display: 'flex',
        gap: 8,
      }}
    >
      {children}
      {goal && (
        <span style={{ position: 'absolute', right: -10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 800, color: '#fff', background: 'var(--up)', borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap', boxShadow: 'var(--sh)' }}>
          {goal}
        </span>
      )}
    </div>
  );
}
function Connector() {
  return <div style={{ width: 0, height: 14, borderLeft: '2px dashed var(--b2)', margin: '-4px auto' }} />;
}

const C1 = '#4285F4'; // sesiones (azul GA)
const C2 = 'var(--acc)'; // usuarios (violeta del dashboard)
const C3 = '#22c3d6'; // eventos email/catálogo (turquesa)
const C4 = '#34A853'; // WhatsApp / lead (verde = meta)

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

  const sessions = totals.sessions;
  const users = totals.users;
  const newUsers = totals.newUsers;
  const sessPerUser = users > 0 ? sessions / users : 0;
  const sessPerUserPrev = totalsPrev.users > 0 ? totalsPrev.sessions / totalsPrev.users : 0;
  const keyRate = sessions > 0 ? (totals.conversions / sessions) * 100 : 0;
  const keyRatePrev = totalsPrev.sessions > 0 ? (totalsPrev.conversions / totalsPrev.sessions) * 100 : 0;

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
          {error ? `No se pudieron cargar los eventos: ${error}` : 'Aún no hay eventos de leads (Escribir Correo · Descargar Catálogo · Clics a WhatsApp) en este período.'}
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 20, padding: '18px 20px' }}>
      <h3 style={{ margin: '0 0 4px 0', fontSize: 16 }}>Funnel de leads · vs período anterior</h3>
      <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 16 }}>
        Sesiones → usuarios → eventos clave (Escribir Correo · Descargar Catálogo · Clics a WhatsApp). Dato real de GA4.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 210px) 1fr', gap: 16, alignItems: 'center' }} className="ga4-funnel-grid">
        <div style={{ background: `linear-gradient(160deg, color-mix(in srgb, var(--acc) 12%, var(--bg1)), var(--bg1))`, border: '1px solid color-mix(in srgb, var(--acc) 26%, transparent)', borderRadius: 12, padding: '16px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 6 }}>Tasa de evento clave / sesión</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--t1)', lineHeight: 1.1, marginBottom: 6, fontFamily: "'Space Grotesk',sans-serif" }}>{fmtPct(keyRate)}</div>
          <Delta value={calcDelta(keyRate, keyRatePrev)} />
          <div style={{ marginTop: 12, fontSize: 18, color: 'var(--t3)' }}>↘</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <Level width="100%" color={C1}>
            <Cell label="Sesiones por usuario" value={fmtDec(sessPerUser)} delta={calcDelta(sessPerUser, sessPerUserPrev)} color={C1} />
            <Cell label="Sesiones" value={fmtInt(sessions)} delta={calcDelta(sessions, totalsPrev.sessions)} color={C1} />
          </Level>
          <Connector />
          <Level width="86%" color={C2}>
            <Cell label="Usuarios nuevos" value={fmtInt(newUsers)} delta={calcDelta(newUsers, totalsPrev.newUsers)} color={C2} />
            <Cell label="Total de usuarios" value={fmtInt(users)} delta={calcDelta(users, totalsPrev.users)} color={C2} />
          </Level>
          <Connector />
          <Level width="72%" color={C3}>
            <Cell label="Escribir Correo" value={fmtInt(escribir.count)} delta={calcDelta(escribir.count, escribir.prev)} color={C3} />
            <Cell label="Descargar Catálogo" value={fmtInt(catalogo.count)} delta={calcDelta(catalogo.count, catalogo.prev)} color={C3} />
          </Level>
          <Connector />
          <Level width="58%" color={C4} goal={`${fmtPct(keyRate, 1)} de sesiones → lead`}>
            <Cell label="Clics a WhatsApp" value={fmtInt(whatsapp.count)} delta={calcDelta(whatsapp.count, whatsapp.prev)} color={C4} />
          </Level>
        </div>
      </div>

      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--mu)', lineHeight: 1.5 }}>
        Clics a WhatsApp = clic_whatsapp + whatsapp_flotante. Tasa de evento clave = eventos clave ÷ sesiones. 100% dato real de GA4.
      </div>
    </div>
  );
}
