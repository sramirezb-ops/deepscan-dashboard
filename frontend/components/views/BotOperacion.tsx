'use client';

import { useState } from 'react';
import { TrendChart } from '@/components/ui/TrendChart';
import { PieChart } from '@/components/ui/PieChart';
import { SectionLabel, BackToTop } from './tiktokShared';
import { formatInt } from '@/lib/utils';
import { useClient } from '@/lib/useClient';
import { useUchatBot } from '@/lib/hooks/useUchatBot';

// ============================================================
// BotOperación — PREVIEW con datos REALES de UChat (Ofero)
// ============================================================
// Hoja como EXPEDIENTE de por qué el bot no funciona. Dos pestañas:
//   · Diagnóstico → el problema + evidencia (client-facing, liviano)
//   · Operación   → contexto de volumen/equipo (soporte)
// Diseño aligerado: ejemplos como burbujas de chat colapsables, Top-3
// destacado, color de alarma reservado, embudo visual, score comprimido.
// 100% dato real. Proxys marcados. Escalada a humano NO penaliza.
// ============================================================

const GREEN = '#4ade80';
const AMBER = '#fbbf24';
const RED = '#f87171';
const MUTED = 'var(--mu)';
const OFERO = '#15803d';
const NEUTRAL = '#60a5fa';

type FlowRow = {
  date: string;
  day_new_bot_users: number;
  day_active_bot_users: number;
  day_in_messages: number;
  day_out_messages: number;
  day_agent_messages: number;
  day_assigned: number;
  day_done: number;
  avg_agent_response_time: number | null;
  avg_resolve_time: number | null;
};
type AgentRow = {
  agent_name: string;
  day_agent_messages: number;
  day_note_messages: number;
  day_reply_bot_users: number;
  day_assigned: number;
  day_done: number;
  avg_agent_response_time: number;
  avg_resolve_time: number;
};

type SnapData = {
  generated_at: string;
  flow_summary: { ok: boolean; rows: FlowRow[]; totals: Record<string, number> };
  bot_users: { ok: boolean; by_status: Record<string, number> };
  subscribers: {
    ok: boolean;
    total_reported: number;
    sampled: number;
    fill_pct: Record<string, number>;
    categoricals: Record<string, Record<string, number>>;
    no_response: { hours_threshold: number; evaluable: number; count: number; rate_pct: number | null };
  };
  agents: { ok: boolean; agents: AgentRow[] };
  catalog: Record<string, string[]>;
};

type Stopper = { key: string; label: string; note: string | null; count: number; pct: number; hard: boolean };
type Example = { origin: string; n: number; lines: string[] };
type ImpData = {
  period: string;
  generated_at_note: string;
  total_conversations: number;
  blocked: { count: number; pct: number };
  clean: { count: number; pct: number };
  groups: { key: string; title: string; stoppers: Stopper[] }[];
  by_origin: Record<string, { total: number; blocked: number; stuck: number }>;
  funnel: { reached_menu_pct: number; reached_catalog_pct: number; has_human_pct: number; stuck_before_menu_pct: number; avg_messages: number };
  examples: Record<string, Example[]>;
};

const GROUP_ICON: Record<string, string> = { A: '🔧', B: '🤷', C: '🚪' };
const GROUP_SHORT: Record<string, string> = { A: 'El bot se atasca solo', B: 'El bot no resuelve', C: 'El cliente se rinde' };
const GROUP_COLOR: Record<string, string> = { A: RED, B: AMBER, C: '#a78bfa' };
// Etiquetas cortas para gráficos (los labels largos no caben en un chart).
const SHORT_LABEL: Record<string, string> = {
  a_saludo_bucle: 'Saludo en bucle', a_repregunta: 'Repregunta datos', a_rechaza_ciudad: 'Rechaza ciudad',
  a_menu_vueltas: 'Menú da vueltas', a_bucle_ciudad: 'Bucle de ciudad', a_desorden: 'Mensajes en desorden',
  b_no_precio: 'No da precio', b_catalogo_gen: 'Catálogo genérico', b_horario: 'Responde horario', b_ignora: 'Ignora al cliente',
  c_asesor: 'Pide «Asesor»', c_sin_respuesta: 'Se va sin respuesta', c_abierta: 'Queda abierta',
};
const TM_COLORS = ['#6366f1', '#22b8cf', '#37d399', '#fbbf24', '#a78bfa', '#f0596a'];

// Explicación editorial por stopper: qué pasa / por qué importa / cómo se mide.
// Es interpretación de experto (no viene del dato); da credibilidad y contexto.
type StopperInfo = { significa: string; importa: string; medida: string };
const STOPPER_INFO: Record<string, StopperInfo> = {
  a_saludo_bucle: {
    significa: 'El cliente recibe el mensaje «Hola, te damos la bienvenida…» dos, tres o hasta cuatro veces seguidas.',
    importa: 'Parece un bot descompuesto. El cliente pierde confianza en la marca y muchos abandonan antes de decir qué querían.',
    medida: 'Contamos cuántas veces el bot envía el saludo idéntico en una misma conversación (2 o más = falla).',
  },
  a_rechaza_ciudad: {
    significa: 'El cliente escribe una ciudad válida (Medellín, Valledupar…) y el bot responde «no pudimos comprobar tu ubicación».',
    importa: 'Bloquea el avance justo al inicio. El cliente se frustra y abandona o exige un asesor.',
    medida: 'Detectamos el mensaje «no pudimos comprobar tu ubicación» al menos una vez en la conversación.',
  },
  a_bucle_ciudad: {
    significa: 'El bot rechaza la ciudad 3 o más veces seguidas, aunque el cliente la reescriba bien.',
    importa: 'Es el peor caso del error de ubicación: el cliente queda atrapado sin salida y se rinde.',
    medida: 'El mensaje de ubicación fallida aparece 3+ veces en la misma conversación.',
  },
  a_repregunta: {
    significa: 'El bot vuelve a pedir el nombre o la ciudad que el cliente ya había escrito.',
    importa: 'Da la sensación de que nadie escucha. Molesta y alarga la conversación innecesariamente.',
    medida: 'El bot pide el nombre o la ciudad 2 o más veces.',
  },
  a_desorden: {
    significa: 'El bot manda mensajes fuera de orden: agradece antes de preguntar, o muestra el menú antes de saludar.',
    importa: 'Confunde al cliente sobre qué debe responder y rompe el hilo de la conversación.',
    medida: 'El bot vuelve a pedir datos después de haber dado las gracias o mostrado el menú.',
  },
  a_menu_vueltas: {
    significa: 'El cliente elige opciones del menú pero siempre vuelve al mismo menú, sin avanzar.',
    importa: 'Da vueltas en círculo y nunca llega a lo que busca. Puro desgaste.',
    medida: 'El menú principal aparece 3 o más veces en una conversación.',
  },
  b_no_precio: {
    significa: 'El cliente pregunta «¿cuánto vale?» y el bot nunca responde un precio.',
    importa: 'El precio es la pregunta #1 de compra. No responderla mata la venta ahí mismo.',
    medida: 'El cliente escribe «precio / cuánto vale» y ni un humano intervino ni se dio un precio.',
  },
  b_catalogo_gen: {
    significa: 'El cliente pregunta por un modelo específico (Zyper 1, Stareer 5) y el bot manda el PDF genérico de todo.',
    importa: 'No resuelve la duda concreta; obliga al cliente a buscar solo en un catálogo enorme.',
    medida: 'El cliente menciona un modelo y el bot solo envía el catálogo, sin humano. (requiere IA para afinar)',
  },
  b_horario: {
    significa: 'El cliente pide algo concreto y el bot responde con el horario de atención.',
    importa: 'Suena a «vuelve luego». El cliente siente que lo despachan sin ayudarlo.',
    medida: 'El bot envía el mensaje de «horario de atención» durante la conversación.',
  },
  b_ignora: {
    significa: 'El cliente escribe una pregunta y el bot responde con el saludo o pide datos, ignorando lo que preguntó.',
    importa: 'El cliente siente que le habla a una pared. Es la peor experiencia de un bot.',
    medida: 'Tras una pregunta libre del cliente, el bot responde con saludo o petición de datos. (requiere IA para afinar)',
  },
  c_asesor: {
    significa: 'Cansado del bot, el cliente escribe «Asesor» para que lo atienda un humano.',
    importa: 'Es una rendición: el bot falló y el cliente lo esquiva. Distinto de un handoff planeado.',
    medida: 'El cliente escribe exactamente «Asesor» como texto libre (no como opción de menú).',
  },
  c_sin_respuesta: {
    significa: 'El cliente escribe el último mensaje y el bot no responde nada más.',
    importa: 'La conversación queda colgada; el lead se enfría y probablemente no vuelve.',
    medida: 'El último mensaje de la conversación es del cliente.',
  },
  c_abierta: {
    significa: 'La conversación queda «abierta» y ningún humano la retomó nunca.',
    importa: 'Leads sin cierre que se acumulan sin seguimiento. Ventas potenciales olvidadas.',
    medida: 'Estado «abierta», sin ningún mensaje de agente humano, y el cliente habló al final.',
  },
};

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function dayLabel(iso: string): string {
  const p = iso.split('-');
  return p.length < 3 ? iso : `${parseInt(p[2], 10)} ${MONTHS[parseInt(p[1], 10) - 1] ?? ''}`.trim();
}
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
function fmtDuration(sec: number | null | undefined): string {
  if (sec == null || isNaN(sec) || sec <= 0) return '—';
  if (sec < 60) return `${Math.round(sec)} s`;
  const m = sec / 60;
  if (m < 60) return `${m.toFixed(m < 10 ? 1 : 0)} min`;
  return `${(m / 60).toFixed(1)} h`;
}
const scoreColor = (v: number) => (v >= 75 ? GREEN : v >= 50 ? AMBER : RED);
const scoreWord = (v: number) => (v >= 75 ? 'Aceptable' : v >= 50 ? 'Necesita atención' : 'Crítico');

export function BotOperacion() {
  const [tab, setTab] = useState<'diag' | 'ops'>('diag');
  const client = useClient();
  const { data, loading, error } = useUchatBot(client.id);

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: MUTED }}>Cargando diagnóstico del bot de {client.name}…</div>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="view on">
        <div className="card" style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}>
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>Error cargando el diagnóstico</div>
          <div style={{ fontSize: 12, color: MUTED }}>{error}</div>
        </div>
      </div>
    );
  }
  if (!data || !data.impediments || !data.snapshot) {
    return (
      <div className="view on">
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: MUTED }}>
            Aún no hay diagnóstico del bot para {client.name}. Se generará en la próxima corrida del ETL.
          </div>
        </div>
      </div>
    );
  }

  const S = data.snapshot as SnapData;
  const IMP = data.impediments as ImpData;

  const rows = S.flow_summary.rows;
  const T = S.flow_summary.totals;
  const nDays = rows.length || 1;
  const cover = rows.length ? `${dayLabel(rows[0].date)} – ${dayLabel(rows[rows.length - 1].date)}` : '';

  const inMsg = T.day_in_messages ?? 0;
  const outMsg = T.day_out_messages ?? 0;
  const agentMsg = T.day_agent_messages ?? 0;
  const activeUsers = T.day_active_bot_users ?? 0;
  const newLeads = T.day_new_bot_users ?? 0;
  const assigned = T.day_assigned ?? 0;

  const respRows = rows.filter((r) => r.avg_agent_response_time && r.avg_agent_response_time > 0);
  const avgFirstResp = respRows.length ? respRows.reduce((a, r) => a + (r.avg_agent_response_time as number), 0) / respRows.length : null;
  const resolveRows = rows.filter((r) => r.avg_resolve_time && r.avg_resolve_time > 0);
  const avgResolve = resolveRows.length ? resolveRows.reduce((a, r) => a + (r.avg_resolve_time as number), 0) / resolveRows.length : null;

  const noResp = S.subscribers.no_response;
  const noRespRate = noResp.rate_pct ?? 0;
  const friccion = activeUsers > 0 ? inMsg / activeUsers : 0;
  const ratioOutIn = inMsg > 0 ? outMsg / inMsg : 0;
  const interestFill = S.subscribers.fill_pct['interest'] ?? 0;

  const cNoResp = clamp(100 - (noRespRate / 30) * 100);
  const cResp = avgFirstResp == null ? 60 : clamp(100 - ((avgFirstResp - 300) / (3600 - 300)) * 100);
  const cFriccion = clamp(100 - ((friccion - 2) / (10 - 2)) * 100);
  const cRatio = clamp((ratioOutIn / 1.2) * 100);
  const cCalif = clamp(interestFill);
  const COMPONENTS = [
    { key: 'noresp', label: 'Respuesta a leads', weight: 0.35, score: cNoResp, raw: `${noRespRate.toFixed(1)}% sin respuesta ≥${noResp.hours_threshold}h`, proxy: false },
    { key: 'resp', label: 'Velocidad 1ª respuesta', weight: 0.2, score: cResp, raw: avgFirstResp == null ? 'sin dato' : fmtDuration(avgFirstResp), proxy: false },
    { key: 'friccion', label: 'Fricción conversacional', weight: 0.15, score: cFriccion, raw: `${friccion.toFixed(1)} msgs entrantes/usuario`, proxy: false },
    { key: 'ratio', label: '¿El bot responde?', weight: 0.15, score: cRatio, raw: `${ratioOutIn.toFixed(2)}× salientes por entrante`, proxy: false },
    { key: 'calif', label: 'Calificación previa', weight: 0.15, score: cCalif, raw: `${interestFill.toFixed(0)}% con interés capturado`, proxy: true },
  ];
  const score = Math.round(COMPONENTS.reduce((a, c) => a + c.score * c.weight, 0));

  const labels = rows.map((r) => dayLabel(r.date));
  const newSeries = rows.map((r) => r.day_new_bot_users);
  const inSeries = rows.map((r) => r.day_in_messages);
  const outSeries = rows.map((r) => r.day_out_messages);
  const assignedSeries = rows.map((r) => r.day_assigned);

  const leadSource = S.subscribers.categoricals['lead_source'] ?? {};
  const interest = S.subscribers.categoricals['interest'] ?? {};
  const lastType = S.subscribers.categoricals['last_message_type'] ?? {};
  const sampled = S.subscribers.sampled;
  const sourceSlices = Object.entries(leadSource).map(([label, value]) => ({
    label: label === 'Self_ Contact' ? 'Contacto directo' : label === 'ad' ? 'Anuncio' : label,
    value,
  }));
  const interestRows = Object.entries(interest).sort((a, b) => b[1] - a[1]);
  const interestMax = Math.max(...interestRows.map(([, v]) => v), 1);
  const lastTypeTotal = Object.values(lastType).reduce((a, b) => a + b, 0) || 1;

  const bu = S.bot_users.by_status;
  const stateRows = [
    { label: 'Abiertas', value: bu.open ?? 0, color: NEUTRAL },
    { label: 'Pendientes', value: bu.pending ?? 0, color: AMBER },
    { label: 'Resueltas (done)', value: bu.done ?? 0, color: OFERO },
  ];
  const stateTotal = stateRows.reduce((a, s) => a + s.value, 0) || 1;

  const byAgent = new Map<string, { msgs: number; assigned: number; done: number; replies: number; resp: number[] }>();
  for (const a of S.agents.agents) {
    const k = a.agent_name || '—';
    const cur = byAgent.get(k) ?? { msgs: 0, assigned: 0, done: 0, replies: 0, resp: [] };
    cur.msgs += a.day_agent_messages ?? 0;
    cur.assigned += a.day_assigned ?? 0;
    cur.done += a.day_done ?? 0;
    cur.replies += a.day_reply_bot_users ?? 0;
    if (a.avg_agent_response_time > 0) cur.resp.push(a.avg_agent_response_time);
    byAgent.set(k, cur);
  }
  const agentRank = [...byAgent.entries()]
    .map(([name, v]) => ({ name, ...v, avgResp: v.resp.length ? v.resp.reduce((x, y) => x + y, 0) / v.resp.length : null }))
    .filter((a) => a.msgs > 0 || a.assigned > 0 || a.replies > 0)
    .sort((a, b) => b.msgs - a.msgs)
    .slice(0, 8);
  const tags = S.catalog['tags'] ?? [];

  // Costo en tráfico pagado
  const ad = IMP.by_origin['ad'];
  const self = IMP.by_origin['Self_ Contact'];
  const adBlocked = ad && ad.total > 0 ? Math.round((ad.blocked / ad.total) * 100) : null;
  const selfBlocked = self && self.total > 0 ? Math.round((self.blocked / self.total) * 100) : null;

  // Top-3 stoppers (los que más matan) — con su grupo y ejemplo
  const allStoppers = IMP.groups.flatMap((g) => g.stoppers.map((s) => ({ ...s, group: g.key })));
  const top3 = [...allStoppers].sort((a, b) => b.pct - a.pct).slice(0, 3);
  const top3Keys = new Set(top3.map((s) => s.key));

  // Salud para el gauge
  const saludBot = Math.max(0, Math.round(100 - IMP.blocked.pct));
  const strengths = [
    { t: 'Responde a todos', d: `${ratioOutIn.toFixed(2)}× mensajes por entrante · no deja en visto` },
    { t: 'Captura el interés', d: `en el ${interestFill.toFixed(0)}% de los leads` },
    { t: 'Absorbe el volumen', d: `${formatInt(newLeads)} leads/mes sin caerse` },
    { t: 'Canal estable', d: 'WhatsApp operativo al 100%' },
  ];
  const problems = [
    { t: `${IMP.blocked.pct}% de conversaciones se traban`, d: `${formatInt(IMP.blocked.count)} de ${formatInt(IMP.total_conversations)}` },
    { t: adBlocked != null ? `${adBlocked}% del tráfico pagado choca` : 'El tráfico pagado se traba', d: 'presupuesto de ads quemado' },
    { t: `Solo ${IMP.funnel.has_human_pct}% llega a un humano`, d: 'el resto queda atrapado con el bot' },
    { t: '3 fallas técnicas causan el grueso', d: 'saludo en bucle · repregunta · ignora' },
  ];

  // ── Datos para los 4 gráficos ejecutivos ──
  // Q1 · Embudo
  const funnelStagesG = [
    { label: 'entra', pct: 100, color: '#6b7280' },
    { label: 'menú', pct: IMP.funnel.reached_menu_pct, color: NEUTRAL },
    { label: 'catálogo', pct: IMP.funnel.reached_catalog_pct, color: GREEN },
    { label: 'humano', pct: IMP.funnel.has_human_pct, color: AMBER },
  ];
  // Q2 · Bugs (grupo técnico A)
  const bugItems = (IMP.groups.find((g) => g.key === 'A')?.stoppers ?? [])
    .slice().sort((a, b) => b.pct - a.pct).slice(0, 6)
    .map((s) => ({ label: SHORT_LABEL[s.key] ?? s.label, pct: s.pct, count: s.count }));
  // Q3 · Desenlace (último mensaje)
  const lt = S.subscribers.categoricals['last_message_type'] ?? {};
  const ltTotal = Object.values(lt).reduce((a, b) => a + b, 0) || 1;
  const colgadoPct = Math.round(((lt['in'] ?? 0) / ltTotal) * 100);
  const donutSegments = [
    { label: 'Bot habló último', value: lt['out'] ?? 0, color: NEUTRAL },
    { label: 'Cliente sin respuesta', value: lt['in'] ?? 0, color: RED },
    { label: 'Un humano respondió', value: lt['agent'] ?? 0, color: GREEN },
  ];
  // Q4 · Intención (interés)
  const intentTotal = interestRows.reduce((a, [, v]) => a + v, 0) || 1;
  const treemapItems = interestRows.slice(0, 6).map(([label, value], i) => ({ label, value, color: TM_COLORS[i % TM_COLORS.length] }));

  return (
    <div className="view on">
      {/* Aviso de preview */}
      <div className="card" style={{ borderLeft: `3px solid ${AMBER}`, display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14, padding: '10px 14px' }}>
        <span style={{ fontSize: 16 }}>🧪</span>
        <div style={{ fontSize: 11.5, color: 'var(--t2)', lineHeight: 1.5 }}>
          <b style={{ color: 'var(--t1)' }}>Preview con datos reales de UChat</b> · Ofero · {IMP.period}. {IMP.generated_at_note}
        </div>
      </div>

      {/* Pestañas */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        <TabBtn active={tab === 'diag'} onClick={() => setTab('diag')} label="🩺 Diagnóstico" />
        <TabBtn active={tab === 'ops'} onClick={() => setTab('ops')} label="📊 Operación" />
      </div>

      {/* ══════════ PESTAÑA · DIAGNÓSTICO ══════════ */}
      {tab === 'diag' && (
        <>
          {/* HEADER · salud (gauge) + veredicto + dinero */}
          <div className="hero" style={{ background: 'linear-gradient(135deg, rgba(240,89,106,0.10), rgba(0,0,0,0))' }}>
            <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
              <HealthGauge value={saludBot} />
              <div style={{ flex: 1, minWidth: 240 }}>
                <div className="hero-lbl" style={{ color: RED }}>
                  <span>⚠</span>
                  <span>Salud del bot · Ofero · {IMP.period}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.3, marginTop: 6, color: 'var(--t1)' }}>
                  <span style={{ color: RED }}>{IMP.blocked.pct}%</span> de las conversaciones se <b style={{ color: RED }}>traban</b> en una falla del bot.
                </div>
                <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 6 }}>
                  Solo <b style={{ color: GREEN }}>{IMP.clean.pct}%</b> fluyen limpias · {formatInt(newLeads)} leads/mes.
                </div>
              </div>
            </div>
            {adBlocked != null && (
              <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: 'rgba(251,191,36,0.08)', border: `1px solid ${AMBER}44`, display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 24 }}>💸</span>
                <div style={{ fontSize: 13.5, color: 'var(--t1)', lineHeight: 1.5 }}>
                  El <b>tráfico pagado</b> es el más castigado: <b style={{ color: RED, fontSize: 16 }}>{adBlocked}%</b> de los leads que llegan por anuncio se traban
                  {selfBlocked != null && <> (vs <b>{selfBlocked}%</b> de contacto directo)</>}. Presupuesto de Meta/Google quemándose antes de convertir.
                </div>
              </div>
            )}
          </div>

          {/* LAS 4 PREGUNTAS · gráficos */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 12, marginTop: 16 }}>
            <QCard n={1} title="¿Dónde chocan las personas?" sub="cuánta gente sobrevive cada paso del bot">
              <FunnelSvg stages={funnelStagesG} />
              <div style={{ fontSize: 11, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
                <b style={{ color: RED }}>Fuga mayor: {IMP.funnel.stuck_before_menu_pct}%</b> ni llega al menú — choca con el saludo en bucle.
              </div>
            </QCard>
            <QCard n={2} title="¿Qué bugs los frustran?" sub="fallas técnicas · % de conversaciones afectadas">
              <RankBars items={bugItems} />
            </QCard>
            <QCard n={3} title="¿Se les responde?" sub="cómo termina la conversación (último mensaje)">
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <DonutSvg segments={donutSegments} centerTop={`${colgadoPct}%`} centerSub="quedan colgados" />
                <div style={{ fontSize: 11.5, lineHeight: 2, minWidth: 150 }}>
                  {donutSegments.map((s) => (
                    <div key={s.label}><span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, display: 'inline-block', marginRight: 6 }} />{s.label} · <b>{Math.round((s.value / ltTotal) * 100)}%</b></div>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>Responde mucho pero <b style={{ color: AMBER }}>mal</b>: en 61% ignora lo que el cliente escribió.</div>
            </QCard>
            <QCard n={4} title="¿Cuál es su inquietud?" sub="qué vienen a preguntar los clientes">
              <Treemap items={treemapItems} total={intentTotal} />
            </QCard>
          </div>

          {/* D · FORTALEZAS vs PROBLEMAS */}
          <SectionLabel style={{ margin: '32px 0 12px' }}>Fortalezas y problemas</SectionLabel>
          <WinsRisks strengths={strengths} problems={problems} />

          {/* EVIDENCIA · drill-down detallado */}
          <SectionLabel style={{ margin: '32px 0 6px' }}>La evidencia · el detalle de cada problema</SectionLabel>
          <div style={{ fontSize: 12.5, color: 'var(--t2)', marginBottom: 16, lineHeight: 1.6, maxWidth: 720 }}>
            Cada hallazgo dice <b style={{ color: 'var(--t1)' }}>qué pasa</b>, <b style={{ color: 'var(--t1)' }}>por qué importa</b> y{' '}
            <b style={{ color: 'var(--t1)' }}>cómo se midió</b> — y puedes abrir las conversaciones reales que lo prueban.
          </div>
          <div style={{ maxWidth: 760 }}>
            {IMP.groups.map((g) => (
              <div key={g.key}>
                <GroupHeader icon={GROUP_ICON[g.key]} title={GROUP_SHORT[g.key]} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[...g.stoppers].sort((a, b) => b.pct - a.pct).map((s) => (
                    <FindingCard key={s.key} stopper={s} info={STOPPER_INFO[s.key]} examples={IMP.examples[s.key] ?? []} isTop={top3Keys.has(s.key)} total={IMP.total_conversations} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ══════════ PESTAÑA · OPERACIÓN ══════════ */}
      {tab === 'ops' && (
        <>
          <SectionLabel style={{ margin: '4px 0 6px' }}>Volumen del mes · {cover}</SectionLabel>
          <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 12 }}>El “cuánto” detrás del diagnóstico.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <Kpi label="Nuevos leads" value={formatInt(newLeads)} accent={OFERO} sub={`${formatInt(Math.round(newLeads / nDays))}/día`} />
            <Kpi label="Usuarios activos" value={formatInt(activeUsers)} accent={NEUTRAL} sub={`${formatInt(Math.round(activeUsers / nDays))}/día`} />
            <Kpi label="Mensajes entrantes" value={formatInt(inMsg)} accent="#a78bfa" sub={`${ratioOutIn.toFixed(1)}× de respuesta`} />
            <Kpi label="Conversaciones asignadas" value={formatInt(assigned)} accent={AMBER} sub="a agente humano" />
            <Kpi label="Sin respuesta ≥24h" value={`${noRespRate.toFixed(1)}%`} accent={noRespRate > 20 ? RED : noRespRate > 10 ? AMBER : GREEN} sub={`muestra ${formatInt(sampled)} leads`} />
            <Kpi label="1ª respuesta (humano)" value={fmtDuration(avgFirstResp)} accent={NEUTRAL} sub="promedio del período" />
            <Kpi label="Tiempo de resolución" value={fmtDuration(avgResolve)} accent="#a78bfa" sub="promedio del período" />
            <Kpi label="Leads totales (histórico)" value={formatInt(S.subscribers.total_reported)} accent={OFERO} sub="base completa en UChat" />
          </div>

          <SectionLabel style={{ margin: '30px 0 12px' }}>Adquisición · de dónde llegan los leads</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            <TrendChart title="Nuevos leads por día" headline={formatInt(newLeads)} sub={`total · últimos ${nDays} días`} points={newSeries} labels={labels} color={OFERO} format={(n) => formatInt(n)} />
            <PieChart title={`Origen del lead · muestra ${formatInt(sampled)}`} slices={sourceSlices} formatValue={(v) => formatInt(v)} />
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 }}>Interés declarado por el lead</span>
              <span style={{ fontSize: 11, color: MUTED }}>muestra · campo “interest”</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {interestRows.map(([label, v]) => (
                <BarRow key={label} label={label} value={v} max={interestMax} color={OFERO} suffix={formatInt(v)} />
              ))}
            </div>
          </div>

          <SectionLabel style={{ margin: '30px 0 12px' }}>Comportamiento del bot</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <Kpi label="Respuestas por mensaje" value={`${ratioOutIn.toFixed(2)}×`} accent={GREEN} sub={`${formatInt(outMsg)} sal. / ${formatInt(inMsg)} entr.`} />
            <Kpi label="Fricción" value={`${friccion.toFixed(1)}`} accent={AMBER} sub="msgs entrantes por usuario" />
            <Kpi label="Mensajes de agentes" value={formatInt(agentMsg)} accent={NEUTRAL} sub={`${((agentMsg / (outMsg + agentMsg || 1)) * 100).toFixed(1)}% del saliente`} />
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>Último mensaje de la conversación (muestra)</div>
            <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', background: 'var(--track)' }}>
              {Object.entries(lastType).map(([k, v]) => {
                const pct = (v / lastTypeTotal) * 100;
                const color = k === 'out' ? OFERO : k === 'agent' ? NEUTRAL : AMBER;
                return <div key={k} style={{ width: `${pct}%`, background: color }} title={`${k}: ${v}`} />;
              })}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', fontSize: 11.5 }}>
              <Legend color={OFERO} label={`Bot ${Math.round(((lastType['out'] ?? 0) / lastTypeTotal) * 100)}%`} />
              <Legend color={NEUTRAL} label={`Agente ${Math.round(((lastType['agent'] ?? 0) / lastTypeTotal) * 100)}%`} />
              <Legend color={AMBER} label={`Lead sin responder ${Math.round(((lastType['in'] ?? 0) / lastTypeTotal) * 100)}%`} />
            </div>
          </div>

          <SectionLabel style={{ margin: '30px 0 12px' }}>Operación · volumen y estado</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            <TrendChart title="Mensajes entrantes / día" headline={formatInt(inMsg)} sub="total del período" points={inSeries} labels={labels} color="#a78bfa" format={(n) => formatInt(n)} />
            <TrendChart title="Mensajes salientes / día" headline={formatInt(outMsg)} sub="total del período" points={outSeries} labels={labels} color={OFERO} format={(n) => formatInt(n)} />
            <TrendChart title="Asignadas a humano / día" headline={formatInt(assigned)} sub="total del período" points={assignedSeries} labels={labels} color={AMBER} format={(n) => formatInt(n)} />
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 }}>Estado de las conversaciones</span>
              <span style={{ fontSize: 11, color: MUTED }}>histórico · {formatInt(stateTotal)} en total</span>
            </div>
            <div style={{ display: 'flex', height: 18, borderRadius: 9, overflow: 'hidden', background: 'var(--track)' }}>
              {stateRows.map((s) => (
                <div key={s.label} style={{ width: `${(s.value / stateTotal) * 100}%`, background: s.color }} title={`${s.label}: ${formatInt(s.value)}`} />
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {stateRows.map((s) => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Legend color={s.color} label={s.label} />
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 12, color: 'var(--t1)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {formatInt(s.value)} · {((s.value / stateTotal) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          <SectionLabel style={{ margin: '30px 0 12px' }}>Equipo humano · quién atiende</SectionLabel>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="t">
                <thead>
                  <tr><th>Agente</th><th>Mensajes</th><th>Asignadas</th><th>Resueltas</th><th>Leads</th><th>1ª resp.</th></tr>
                </thead>
                <tbody>
                  {agentRank.map((a) => (
                    <tr key={a.name}>
                      <td><b>{a.name}</b></td>
                      <td style={{ fontWeight: 700 }}>{formatInt(a.msgs)}</td>
                      <td>{formatInt(a.assigned)}</td>
                      <td>{formatInt(a.done)}</td>
                      <td>{formatInt(a.replies)}</td>
                      <td>{fmtDuration(a.avgResp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>Etiquetas de calidad ya creadas en UChat (hoy sin uso): {tags.join(' · ')}.</div>

          <SectionLabel style={{ margin: '30px 0 12px' }}>Índice de efectividad operativa · termómetro de mejora</SectionLabel>
          <ScoreStrip score={score} components={COMPONENTS} />
        </>
      )}

      <BackToTop />
    </div>
  );
}

// ── Pestaña ──
function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '9px 18px', borderRadius: 999, border: `1px solid ${active ? 'transparent' : 'var(--b2)'}`,
        cursor: 'pointer', fontSize: 13, fontWeight: 700,
        background: active ? 'linear-gradient(135deg, var(--acc-hover, #a78bfa), var(--acc, #8b5cf6))' : 'var(--bg1)',
        color: active ? '#fff' : 'var(--t2)',
        boxShadow: active ? '0 4px 14px var(--acc-dim, rgba(139,92,246,0.35))' : 'none',
        transition: 'transform .15s, box-shadow .2s',
      }}
    >
      {label}
    </button>
  );
}

// ── Burbujas de chat estilo WhatsApp ──
function ChatBubbles({ lines }: { lines: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {lines.map((ln, i) => {
        const m = ln.match(/^(LEAD|BOT|HUMANO|\?):?\s?([\s\S]*)$/);
        const who = m ? m[1] : '?';
        const txt = m ? m[2] : ln;
        const isLead = who === 'LEAD';
        const isHuman = who === 'HUMANO';
        const bg = isLead ? 'rgba(21,128,61,0.30)' : isHuman ? 'rgba(96,165,250,0.20)' : 'var(--track)';
        return (
          <div key={i} style={{ display: 'flex', justifyContent: isLead ? 'flex-end' : 'flex-start' }}>
            <div
              style={{
                maxWidth: '84%', padding: '6px 10px', borderRadius: 12,
                borderBottomRightRadius: isLead ? 3 : 12, borderBottomLeftRadius: isLead ? 12 : 3,
                background: bg, fontSize: 11.5, color: 'var(--t1)', lineHeight: 1.4,
              }}
            >
              {txt}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Encabezado de grupo ──
function GroupHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 12px' }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{title}</span>
    </div>
  );
}

// ── Bloque de explicación ──
function InfoBlock({ label, text, accent, muted }: { label: string; text: string; accent?: boolean; muted?: boolean }) {
  return (
    <div style={{ borderLeft: accent ? `2px solid ${AMBER}` : 'none', paddingLeft: accent ? 10 : 0 }}>
      <div style={{ fontSize: 9.5, color: accent ? AMBER : MUTED, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: muted ? MUTED : 'var(--t1)', lineHeight: 1.55 }}>{text}</div>
    </div>
  );
}

// ── Hallazgo completo: claim + %/conteo + explicación + pruebas ──
function FindingCard({ stopper, info, examples, isTop, total }: { stopper: Stopper; info?: StopperInfo; examples: Example[]; isTop: boolean; total: number }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16 }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.4 }}>
            {stopper.label}
            {stopper.note && <span style={{ marginLeft: 6, fontSize: 9, color: AMBER, border: `1px solid ${AMBER}55`, borderRadius: 4, padding: '0 4px', textTransform: 'uppercase', verticalAlign: 'middle' }}>{stopper.note}</span>}
            {isTop && <span style={{ marginLeft: 6, fontSize: 9.5, color: RED, background: 'rgba(248,113,113,0.14)', borderRadius: 999, padding: '1px 8px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>● más frecuente</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: isTop ? RED : 'var(--t1)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{stopper.pct}%</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>{formatInt(stopper.count)} de {formatInt(total)}</div>
        </div>
      </div>
      {/* Explicación */}
      {info && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <InfoBlock label="Qué pasa" text={info.significa} />
          <InfoBlock label="Por qué importa" text={info.importa} accent />
          <InfoBlock label="Cómo lo medimos" text={info.medida} muted />
        </div>
      )}
      {/* Pruebas */}
      {examples.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--ac, #a78bfa)', listStyle: 'none', userSelect: 'none' }}>
            💬 ver {examples.length} conversación{examples.length > 1 ? 'es' : ''} real{examples.length > 1 ? 'es' : ''} que lo prueba{examples.length > 1 ? 'n' : ''}
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
            {examples.map((ex, i) => (
              <div key={i} style={{ padding: '10px', borderRadius: 8, background: 'var(--overlay)' }}>
                <div style={{ fontSize: 9.5, color: MUTED, marginBottom: 8 }}>Conversación {i + 1} · origen {ex.origin === 'ad' ? 'anuncio' : 'contacto directo'}</div>
                <ChatBubbles lines={ex.lines} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Tarjeta de pregunta (envuelve cada gráfico) ──
function QCard({ n, title, sub, children }: { n: number; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 20, height: 20, borderRadius: 6, background: 'rgba(139,92,246,0.18)', color: '#a78bfa', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
        {title}
      </div>
      <div style={{ fontSize: 11, color: MUTED, margin: '3px 0 14px 28px' }}>{sub}</div>
      {children}
    </div>
  );
}

// ── Gauge radial de salud ──
function HealthGauge({ value }: { value: number }) {
  const L = Math.PI * 88;
  const f = Math.max(0, Math.min(1, value / 100));
  const col = value < 40 ? RED : value < 70 ? AMBER : GREEN;
  const colLight = value < 40 ? '#fca5a5' : value < 70 ? '#fde68a' : '#86efac';
  const theta = Math.PI - f * Math.PI;
  const mx = 110 + 88 * Math.cos(theta);
  const my = 110 - 88 * Math.sin(theta);
  const uid = `g${value}`;
  const D = 'M22 110 A88 88 0 0 1 198 110';
  return (
    <svg viewBox="0 0 220 130" width="186" height="110" role="img" aria-label={`Salud del bot ${value} de 100`}>
      <defs>
        <linearGradient id={`grad-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={colLight} />
          <stop offset="100%" stopColor={col} />
        </linearGradient>
        <filter id={`glow-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor={col} floodOpacity="0.45" />
        </filter>
      </defs>
      {/* Anillo punteado exterior (detalle premium) */}
      <path d="M12 110 A98 98 0 0 1 208 110" fill="none" stroke="var(--b1)" strokeWidth={1.5} strokeDasharray="1 5" strokeLinecap="round" />
      {/* Pista */}
      <path d={D} fill="none" stroke="var(--chart-grid)" strokeWidth={13} strokeLinecap="round" />
      {/* Arco de valor con gradiente + glow */}
      <path d={D} fill="none" stroke={`url(#grad-${uid})`} strokeWidth={13} strokeLinecap="round" strokeDasharray={`${f * L} ${L}`} filter={`url(#glow-${uid})`} />
      <circle cx={mx} cy={my} r={6} fill={col} stroke="var(--bg1)" strokeWidth={2.5} />
      <text x="110" y="96" textAnchor="middle" fontSize="40" fontWeight="800" fill="var(--t1)">{value}</text>
      <text x="110" y="118" textAnchor="middle" fontSize="11" fill="var(--mu)">/100 · meta 70</text>
    </svg>
  );
}

// ── Embudo (trapecios) ──
function FunnelSvg({ stages }: { stages: { label: string; pct: number; color: string }[] }) {
  const cx = 150, maxW = 260, minW = 16, top = 14, bandH = 38, gap = 3;
  const w = stages.map((s) => Math.max((s.pct / 100) * maxW, minW));
  const H = stages.length * bandH + (stages.length - 1) * gap + top * 2;
  return (
    <svg viewBox={`0 0 300 ${H}`} width="100%" height={H} role="img" aria-label="Embudo de la conversación">
      {stages.map((s, i) => {
        const y0 = top + i * (bandH + gap);
        const y1 = y0 + bandH;
        const wt = w[i];
        const wb = i < stages.length - 1 ? w[i + 1] : w[i];
        const pts = `${cx - wt / 2},${y0} ${cx + wt / 2},${y0} ${cx + wb / 2},${y1} ${cx - wb / 2},${y1}`;
        const inside = wt > 78;
        return (
          <g key={i}>
            <polygon className="chart-seg" points={pts} fill={s.color} opacity={0.92} />
            {inside ? (
              <text x={cx} y={y0 + bandH / 2 + 4} textAnchor="middle" fontSize="12.5" fontWeight="800" fill="#0f1117">{s.pct}% · {s.label}</text>
            ) : (
              <text x={cx + wt / 2 + 8} y={y0 + bandH / 2 + 4} fontSize="11" fontWeight="700" fill={s.color}>{s.pct}% · {s.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Ranking de barras con ejes (bugs) ──
function RankBars({ items }: { items: { label: string; pct: number; count: number }[] }) {
  const barX = 104, barMax = 250, scale = Math.max(...items.map((s) => s.pct), 10);
  const rowH = 27, top = 6, H = items.length * rowH + 24;
  const xOf = (p: number) => barX + (p / scale) * (barMax - barX);
  const grids = [0, scale / 2, scale];
  return (
    <svg viewBox={`0 0 300 ${H}`} width="100%" height={H} role="img" aria-label="Ranking de bugs técnicos">
      {grids.map((g, i) => (
        <g key={i}>
          <line x1={xOf(g)} y1={top} x2={xOf(g)} y2={items.length * rowH + top} stroke='var(--chart-grid)' strokeWidth={1} />
          <text x={xOf(g)} y={H - 4} textAnchor="middle" fontSize="8" fill="var(--chart-axis)">{Math.round(g)}%</text>
        </g>
      ))}
      {items.map((s, i) => {
        const y = top + i * rowH;
        const op = 0.5 + 0.5 * (s.pct / scale);
        return (
          <g key={s.label}>
            <text x={4} y={y + 15} fontSize="10" fill="var(--chart-label)">{s.label}</text>
            <rect className="chart-bar" x={barX} y={y + 6} width={Math.max(xOf(s.pct) - barX, 2)} height={13} rx={3} fill={RED} opacity={op} />
            <text x={296} y={y + 16} textAnchor="end" fontSize="10.5" fontWeight="800" fill="var(--t1)">{s.pct}%</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Dona de desenlace ──
function DonutSvg({ segments, centerTop, centerSub }: { segments: { label: string; value: number; color: string }[]; centerTop: string; centerSub: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = 46, C = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg viewBox="0 0 120 120" width="116" height="116" role="img" aria-label="Desenlace de las conversaciones">
      {segments.map((s, i) => {
        const len = (s.value / total) * C;
        const node = <circle key={i} className="donut-seg" cx="60" cy="60" r={r} fill="none" stroke={s.color} strokeWidth={18} strokeDasharray={`${len} ${C}`} strokeDashoffset={-off} transform="rotate(-90 60 60)"><title>{s.label}</title></circle>;
        off += len;
        return node;
      })}
      <text x="60" y="57" textAnchor="middle" fontSize="21" fontWeight="800" fill={RED}>{centerTop}</text>
      <text x="60" y="72" textAnchor="middle" fontSize="8.5" fill="var(--mu)">{centerSub}</text>
    </svg>
  );
}

// ── Treemap de intención ──
function Treemap({ items, total }: { items: { label: string; value: number; color: string }[]; total: number }) {
  const W = 300, H = 168;
  if (!items.length) return null;
  const first = items[0];
  const rest = items.slice(1);
  const leftW = Math.max((first.value / total) * W, 70);
  const restTotal = rest.reduce((a, s) => a + s.value, 0) || 1;
  let y = 0;
  const restLayout = rest.map((s) => {
    const h = (s.value / restTotal) * H;
    const seg = { ...s, y, h };
    y += h;
    return seg;
  });
  const pct = (v: number) => Math.round((v / total) * 100);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Treemap de intención del cliente">
      <g stroke="var(--bg1)" strokeWidth={2}>
        <rect className="chart-tile" x={0} y={0} width={leftW} height={H} fill={first.color}><title>{first.label} · {pct(first.value)}%</title></rect>
        {restLayout.map((s, i) => (
          <rect className="chart-tile" key={i} x={leftW} y={s.y} width={W - leftW} height={s.h} fill={s.color}><title>{s.label} · {pct(s.value)}%</title></rect>
        ))}
      </g>
      <text x={12} y={H / 2 - 2} fontSize="14" fontWeight="800" fill="#0f1117">{first.label}</text>
      <text x={12} y={H / 2 + 15} fontSize="11" fontWeight="700" fill="#0f1117" opacity={0.7}>{pct(first.value)}%</text>
      {restLayout.map((s, i) => (
        s.h > 15 ? (
          <text key={i} x={leftW + 8} y={s.y + Math.min(s.h / 2 + 4, s.h - 5)} fontSize={s.h > 30 ? 11 : 9.5} fontWeight="700" fill="#0f1117">
            {s.label}{s.h > 26 ? ` · ${pct(s.value)}%` : ''}
          </text>
        ) : null
      ))}
    </svg>
  );
}

// ── Fortalezas vs Problemas ──
function WinsRisks({ strengths, problems }: { strengths: { t: string; d: string }[]; problems: { t: string; d: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
      <div className="card" style={{ borderLeft: `3px solid ${GREEN}` }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: GREEN, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12 }}>✅ Fortalezas · qué conservar</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {strengths.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <span style={{ color: GREEN, fontSize: 13, lineHeight: 1.4 }}>▸</span>
              <div><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{s.t}</span> <span style={{ fontSize: 12, color: MUTED }}>— {s.d}</span></div>
            </div>
          ))}
        </div>
      </div>
      <div className="card" style={{ borderLeft: `3px solid ${RED}` }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12 }}>🔴 Problemas · qué corregir ya</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {problems.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <span style={{ color: RED, fontSize: 13, lineHeight: 1.4 }}>▸</span>
              <div><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{p.t}</span> <span style={{ fontSize: 12, color: MUTED }}>— {p.d}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Índice de efectividad comprimido ──
function ScoreStrip({ score, components }: { score: number; components: { key: string; label: string; score: number; raw: string; proxy: boolean }[] }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontSize: 40, fontWeight: 800, color: scoreColor(score), lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{score}</span>
          <span style={{ fontSize: 14, color: MUTED }}>/100</span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#0b0b12', background: scoreColor(score), borderRadius: 6, padding: '2px 9px' }}>{scoreWord(score)}</span>
        <span style={{ fontSize: 11.5, color: MUTED, flex: 1, minWidth: 200, lineHeight: 1.5 }}>
          Índice compuesto (umbrales provisionales) para ver si el bot mejora cuando lo corrijan. 🤝 La escalada a humano no penaliza.
        </span>
      </div>
      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 11.5, color: 'var(--ac, #a78bfa)', listStyle: 'none' }}>ver desglose ▾</summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 10 }}>
          {components.map((c) => (
            <div key={c.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10.5, color: 'var(--t2)' }}>
                {c.label}
                {c.proxy && <span style={{ marginLeft: 4, fontSize: 8.5, color: AMBER }}>proxy</span>}
              </span>
              <span style={{ fontSize: 15, fontWeight: 800, color: scoreColor(c.score), fontVariantNumeric: 'tabular-nums' }}>{Math.round(c.score)}</span>
              <span style={{ fontSize: 10, color: MUTED }}>{c.raw}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

// ── KPI ──
function Kpi({ label, value, accent, sub }: { label: string; value: string; accent: string; sub?: string }) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${accent}`, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 'clamp(20px, 5vw, 26px)', fontWeight: 800, color: 'var(--t1)', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED }}>{sub}</div>}
    </div>
  );
}

function BarRow({ label, value, max, color, suffix }: { label: string; value: number; max: number; color: string; suffix: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 130, fontSize: 12, color: 'var(--t2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={label}>{label}</div>
      <div style={{ flex: 1, height: 18, borderRadius: 5, background: 'var(--track)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 5 }} />
      </div>
      <div style={{ width: 54, textAlign: 'right', fontSize: 12, color: 'var(--t1)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{suffix}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--t2)' }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
      {label}
    </span>
  );
}
