'use client';

import { useMemo, useState } from 'react';
import { useClient } from '@/lib/useClient';

// ============================================================
// WeekEcommerce — "Esta semana" para Sneaker Store, reconvertida en el
// RECOPILATORIO SEMANAL DE PENDIENTES que se comparte con el equipo.
// Cada pendiente lleva estado (✅ hecho / ❔ en espera) + explicación.
// Para actualizar cada semana: editar WEEK_LABEL y el arreglo PENDIENTES.
// ============================================================

type PendStatus = 'done' | 'wait';
interface Pendiente { title: string; status: PendStatus; note: string; area?: string; extern?: boolean }

const WEEK_LABEL = '15 – 21 septiembre 2026';

const PENDIENTES: Pendiente[] = [
  { title: 'Artes de Cowmmerce', status: 'done', area: 'Creativo', note: 'Hechas — imágenes por secciones.' },
  { title: 'Seguir apelando Google', status: 'done', area: 'Google Ads', note: 'Enviada una nueva apelación el viernes.' },
  { title: 'Data de influencers y grupos de FB para AURA', status: 'wait', area: 'AURA', extern: true, note: 'Tema de scamming: solo hay opciones pagas y todas poco confiables. Sin fuente sólida por ahora.' },
  { title: 'Más videos para dar confianza', status: 'done', area: 'Creativo', note: 'Reenfocados a producto: 5 en total, con mucho foco en los nuevos lanzamientos.' },
  { title: 'Artes llamativas y más premium de lanzamientos', status: 'done', area: 'Creativo', note: 'Migradas a video principalmente (antes solo llegaban de 2 pares).' },
  { title: 'Seguir trabajando artes de AURA', status: 'done', area: 'AURA', note: 'Enviados 1 video y 4 artes.' },
  { title: 'Estrategia inicial Cowmmerce', status: 'done', area: 'Estrategia', note: 'Enviada y publicada.' },
  { title: 'Pruebas semanales en el sitio (verificar que todo esté OK)', status: 'wait', area: 'Operación', extern: true, note: 'Depende de ustedes: tienen el control de las pasarelas de pago. Falta definir qué día de la semana se hará.' },
  { title: 'Nueva estrategia de campañas y presupuesto para SS', status: 'done', area: 'Estrategia', note: 'Entregada.' },
  { title: 'Activar Jordan 9 con segmentación estratégica y seguimiento', status: 'done', area: 'Meta Ads', note: 'Activa desde el día de la reunión — de hecho ya viene vendiendo.' },
];

const STATUS_META: Record<PendStatus, { emoji: string; label: string; cls: string }> = {
  done: { emoji: '✅', label: 'Hecho', cls: 'done' },
  wait: { emoji: '❔', label: 'En espera', cls: 'wait' },
};

type Filter = 'all' | PendStatus;

export function WeekEcommerce() {
  const client = useClient();
  const [filter, setFilter] = useState<Filter>('all');

  const done = useMemo(() => PENDIENTES.filter((p) => p.status === 'done').length, []);
  const wait = PENDIENTES.length - done;
  const pct = Math.round((done / PENDIENTES.length) * 100);
  const rows = filter === 'all' ? PENDIENTES : PENDIENTES.filter((p) => p.status === filter);

  // Donut de progreso
  const R = 52, C = 2 * Math.PI * R, dash = (pct / 100) * C;

  return (
    <div className="view on">
      <div className="wk">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />

        {/* HEADER */}
        <div className="wk-hero">
          <div className="mk">🗂️</div>
          <div>
            <div className="eyebrow">Recopilatorio semanal · pendientes</div>
            <h1>Estatus de la semana</h1>
            <div className="sub">{client.name} · {WEEK_LABEL}</div>
          </div>
        </div>

        <p className="wk-lead">Equipo, este es el estatus completo de los pendientes de la semana. Cada punto con su estado y explicación.</p>

        {/* RESUMEN + DONUT */}
        <div className="wk-summary card">
          <div className="wk-donut">
            <svg viewBox="0 0 130 130" width="118" height="118" aria-label={`${pct}% completado`}>
              <circle cx="65" cy="65" r={R} fill="none" stroke="var(--track, rgba(128,128,128,.15))" strokeWidth="12" />
              <circle cx="65" cy="65" r={R} fill="none" stroke="var(--up)" strokeWidth="12" strokeLinecap="round"
                strokeDasharray={`${dash} ${C - dash}`} transform="rotate(-90 65 65)" />
              <text x="65" y="60" textAnchor="middle" className="d-pct">{pct}%</text>
              <text x="65" y="80" textAnchor="middle" className="d-lbl">avance</text>
            </svg>
          </div>
          <div className="wk-stats">
            <div className="wk-stat"><span className="n up">{done}</span><span className="l">✅ Hechos</span></div>
            <div className="wk-stat"><span className="n warn">{wait}</span><span className="l">❔ En espera</span></div>
            <div className="wk-stat"><span className="n">{PENDIENTES.length}</span><span className="l">Total</span></div>
            <p className="wk-note">Los {wait} en espera dependen de terceros (proveedores de data y pasarelas de pago), no de ejecución nuestra.</p>
          </div>
        </div>

        {/* FILTROS */}
        <div className="wk-chips">
          <button className={'chip' + (filter === 'all' ? ' on' : '')} onClick={() => setFilter('all')}>Todos <b>{PENDIENTES.length}</b></button>
          <button className={'chip done' + (filter === 'done' ? ' on' : '')} onClick={() => setFilter('done')}>✅ Hechos <b>{done}</b></button>
          <button className={'chip wait' + (filter === 'wait' ? ' on' : '')} onClick={() => setFilter('wait')}>❔ En espera <b>{wait}</b></button>
        </div>

        {/* LISTA */}
        <div className="wk-list">
          {rows.map((p, i) => (
            <div className={'wk-item ' + STATUS_META[p.status].cls} key={i}>
              <div className="wk-badge">{STATUS_META[p.status].emoji}</div>
              <div className="wk-body">
                <div className="wk-top">
                  <span className="wk-title">{p.title}</span>
                  {p.area && <span className="wk-area">{p.area}</span>}
                  {p.extern && <span className="wk-tag">depende de terceros</span>}
                </div>
                <p className="wk-desc">{p.note}</p>
              </div>
              <div className={'wk-state ' + STATUS_META[p.status].cls}>{STATUS_META[p.status].label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.wk{margin-top:4px;max-width:900px}
.wk-hero{display:flex;align-items:center;gap:14px;margin-bottom:6px}
.wk-hero .mk{width:46px;height:46px;border-radius:12px;background:var(--bg2);display:grid;place-items:center;font-size:24px;border:1px solid var(--b1)}
.wk-hero .eyebrow{font-size:10.5px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:var(--acc)}
.wk-hero h1{font-size:22px;font-weight:800;margin:2px 0 0;letter-spacing:-.02em}
.wk-hero .sub{font-size:12px;color:var(--t3);margin-top:2px}
.wk-lead{font-size:13px;color:var(--t2);margin:12px 0 16px;line-height:1.55;max-width:64ch}

/* resumen */
.wk-summary{display:flex;align-items:center;gap:24px;padding:20px 22px;flex-wrap:wrap}
.wk-donut{flex:0 0 auto}
.d-pct{font-size:26px;font-weight:800;fill:var(--t1)}
.d-lbl{font-size:10px;fill:var(--t3);text-transform:uppercase;letter-spacing:.08em}
.wk-stats{display:flex;gap:26px;align-items:center;flex-wrap:wrap;flex:1;min-width:220px}
.wk-stat{display:flex;flex-direction:column;gap:2px}
.wk-stat .n{font-size:30px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.wk-stat .n.up{color:var(--up)}.wk-stat .n.warn{color:var(--warn)}
.wk-stat .l{font-size:11px;color:var(--t3)}
.wk-note{flex-basis:100%;font-size:11.5px;color:var(--t3);margin:4px 0 0;line-height:1.5}

/* chips */
.wk-chips{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0 12px}
.wk-chips .chip{font-size:12px;font-weight:600;padding:7px 13px;border-radius:999px;border:1px solid var(--b1);background:var(--bg1);color:var(--t2);cursor:pointer;transition:.12s}
.wk-chips .chip b{margin-left:5px;color:var(--t1)}
.wk-chips .chip:hover{border-color:var(--b2)}
.wk-chips .chip.on{background:var(--t1);color:var(--bg0);border-color:var(--t1)}.wk-chips .chip.on b{color:var(--bg0)}
.wk-chips .chip.done.on{background:var(--up);border-color:var(--up);color:#052e16}.wk-chips .chip.done.on b{color:#052e16}
.wk-chips .chip.wait.on{background:var(--warn);border-color:var(--warn);color:#3a2a00}.wk-chips .chip.wait.on b{color:#3a2a00}

/* lista */
.wk-list{display:flex;flex-direction:column;gap:10px}
.wk-item{display:grid;grid-template-columns:34px 1fr auto;gap:14px;align-items:start;background:var(--bg1);border:1px solid var(--b1);border-radius:14px;padding:15px 17px;border-left:3px solid var(--b2)}
.wk-item.done{border-left-color:var(--up)}
.wk-item.wait{border-left-color:var(--warn)}
.wk-badge{font-size:20px;line-height:1.4}
.wk-body{min-width:0}
.wk-top{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.wk-title{font-size:14px;font-weight:700;color:var(--t1);line-height:1.35}
.wk-area{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--acc);background:var(--acc-dim);padding:2px 7px;border-radius:6px}
.wk-tag{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--warn);background:rgba(251,191,36,.14);padding:2px 7px;border-radius:6px}
.wk-desc{font-size:12.5px;color:var(--t2);margin:5px 0 0;line-height:1.5}
.wk-state{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;padding:5px 10px;border-radius:999px;white-space:nowrap;align-self:center}
.wk-state.done{color:var(--up);background:rgba(34,217,122,.14)}
.wk-state.wait{color:var(--warn);background:rgba(251,191,36,.14)}

@media(max-width:640px){
  .wk-item{grid-template-columns:28px 1fr;gap:11px}
  .wk-state{grid-column:2;justify-self:start;margin-top:2px}
  .wk-summary{gap:16px}
}
`;
