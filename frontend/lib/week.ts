// ============================================================
// week.ts — "cerebro" de la vista Esta semana (Accionables)
// ============================================================
// Funciones PURAS (sin React, sin red) que, sobre el dato real consolidado de
// leads (useLeadsOverview con ventana fija de 7 días), derivan:
//   · weekRanges()          → las dos ventanas: últimos 7 días vs. 7 previos
//   · buildWeekActionables  → lista priorizada de accionables (el corazón)
//   · buildWeekBrief        → resumen de 3 líneas copiable (WhatsApp al cliente)
//
// Principios de auditoría heredados del overview:
//   · 100% dato real: ninguna regla inventa números; todas citan el dato que
//     las dispara. Si no hay nada que accionar, se dice honestamente ('ok').
//   · Anti-mezcla: el CPL combinado se evalúa, pero la acción apunta al CANAL
//     concreto (el más caro), nunca a un promedio difuso.
//   · Honestidad de comparación: las reglas vs. semana previa solo aplican si
//     hubo inversión la semana pasada (hasPrev).
// ============================================================

import { resolvePreset, previousRange, type DateRange } from './period';
import { formatCurrency, formatInt, formatDelta } from './utils';
import type { LeadsOverviewData, ChannelLeads } from './hooks/useLeadsOverview';

// ── Ventanas de tiempo (fijas, independientes del date-picker global) ──
export interface WeekRanges {
  range: DateRange; // últimos 7 días (incluye hoy)
  previous: DateRange; // los 7 días inmediatamente anteriores
}
export function weekRanges(): WeekRanges {
  const range = resolvePreset('7d');
  return { range, previous: previousRange(range) };
}

// ── Accionables ─────────────────────────────────────────────
export type Severity = 'critical' | 'warn' | 'info' | 'ok';
export type ActionChannel = 'google' | 'tiktok' | 'global' | 'propietarios';

export interface WeekAction {
  id: string;
  severity: Severity;
  icon: string;
  title: string; // la acción a tomar
  body: string; // la evidencia (dato real) + el porqué
  href?: string; // enlace al detalle
  channel?: ActionChannel;
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warn: 1, info: 2, ok: 3 };

// Umbrales (en %). Centralizados para que la regla quede explícita y ajustable.
const LEADS_DROP_WARN = -15; // caída de leads que merece revisión
const LEADS_DROP_CRIT = -30; // caída fuerte
const CPL_OVER_CRIT = 15; // % por encima de la meta que se vuelve crítico
const PROP_CPL_JUMP = 40; // salto de CPL de Propietarios que se reporta

export interface WeekActionablesInput {
  data: LeadsOverviewData;
  cplTarget?: number;
  currency: string;
  implementationsCount: number; // implementaciones de la bitácora en la semana
}

/** El canal (con leads) de mayor / menor CPL dentro de Ventas. */
function pickByCpl(google: ChannelLeads, tiktok: ChannelLeads, mode: 'worse' | 'better'): ChannelLeads {
  const g = google.metrics;
  const t = tiktok.metrics;
  if (g.leads > 0 && t.leads > 0) {
    if (mode === 'worse') return g.cpl >= t.cpl ? google : tiktok;
    return g.cpl <= t.cpl ? google : tiktok;
  }
  return g.leads > 0 ? google : tiktok;
}

/**
 * Genera la lista de accionables ordenada por severidad. Reglas sobre dato real;
 * cada accionable cita el número que lo dispara y propone la acción concreta.
 */
export function buildWeekActionables(input: WeekActionablesInput): WeekAction[] {
  const { data, cplTarget, currency, implementationsCount } = input;
  const fmt = (n: number) => formatCurrency(n, currency);
  const out: WeekAction[] = [];

  const venta = data.venta;
  const v = venta.combined;
  const google = venta.google;
  const tiktok = venta.tiktok;

  // ── 1) CPL combinado vs. meta (la acción apunta al canal más caro) ──
  const hasTarget = typeof cplTarget === 'number' && cplTarget > 0 && v.leads > 0;
  if (hasTarget && v.cpl > cplTarget!) {
    const overPct = Math.round(((v.cpl - cplTarget!) / cplTarget!) * 100);
    const worse = pickByCpl(google, tiktok, 'worse');
    out.push({
      id: 'cpl-over-meta',
      severity: overPct > CPL_OVER_CRIT ? 'critical' : 'warn',
      icon: '🎯',
      title: `Bajar el CPL de ${worse.label}`,
      body: `El CPL combinado de la semana (${fmt(v.cpl)}) está ${overPct}% por encima de la meta de ${fmt(
        cplTarget!
      )}. ${worse.label} es el canal más caro (${fmt(worse.metrics.cpl)}); concentrar ahí la optimización.`,
      href: worse.channel === 'tiktok' ? '/tiktok' : '/google-ads',
      channel: worse.channel,
    });
  }

  // ── 2) Caída de leads vs. semana previa (solo si hubo semana previa) ──
  if (venta.hasPrev) {
    const d = venta.combinedDeltas.leads;
    if (d <= LEADS_DROP_WARN) {
      out.push({
        id: 'leads-drop',
        severity: d <= LEADS_DROP_CRIT ? 'critical' : 'warn',
        icon: '📉',
        title: 'Investigar la caída de leads',
        body: `Los leads de Ventas cayeron ${formatDelta(d)} vs. la semana pasada (${formatInt(
          v.leads
        )} esta semana). Revisar pauta, presupuesto y la bitácora de cambios recientes.`,
        href: '/overview',
        channel: 'global',
      });
    }
  }

  // ── 3) Gasto sin conversiones, por canal (fuga de presupuesto) ──
  for (const ch of [google, tiktok]) {
    if (ch.metrics.cost > 0 && ch.metrics.leads === 0) {
      out.push({
        id: `spend-no-conv-${ch.channel}`,
        severity: 'critical',
        icon: '🔥',
        title: `${ch.label}: gasto sin leads`,
        body: `${ch.label} gastó ${fmt(ch.metrics.cost)} esta semana sin registrar un solo lead. Revisar seguimiento de conversiones o pausar lo que no convierte.`,
        href: ch.channel === 'tiktok' ? '/tiktok' : '/google-ads',
        channel: ch.channel,
      });
    }
  }

  // ── 4) Canal esperado sin actividad (posible pauta apagada / ETL caído) ──
  // Solo si el canal EXISTIÓ alguna vez (configurado): si nunca existió, no se alerta.
  const channelOff = (ch: ChannelLeads, existsEver: boolean, sev: Severity) => {
    if (existsEver && ch.metrics.cost === 0 && ch.metrics.impressions === 0) {
      out.push({
        id: `channel-off-${ch.channel}`,
        severity: sev,
        icon: '⚠️',
        title: `${ch.label}: sin actividad esta semana`,
        body: `${ch.label} no registró inversión ni impresiones en los últimos 7 días, pero sí tuvo datos antes. Confirmar si la pauta está apagada a propósito o si falló la sincronización.`,
        href: ch.channel === 'tiktok' ? '/tiktok' : '/google-ads',
        channel: ch.channel,
      });
    }
  };
  channelOff(google, data.googleExistsEver, 'critical'); // Google es el motor de Ventas
  channelOff(tiktok, data.tiktokExistsEver, 'warn'); // TikTok es volumen secundario

  // ── 5) Salto fuerte de CPL en Propietarios (sin meta, pero relevante) ──
  const prop = data.propietarios;
  if (prop.hasPrev && prop.metrics.leads > 0 && prop.deltas.cpl >= PROP_CPL_JUMP) {
    out.push({
      id: 'prop-cpl-jump',
      severity: 'warn',
      icon: '🏠',
      title: 'Propietarios: el CPL subió fuerte',
      body: `El CPL de Propietarios subió ${formatDelta(prop.deltas.cpl)} vs. la semana pasada (${fmt(
        prop.metrics.cpl
      )}). Objetivo aparte y sin meta, pero conviene revisar su eficiencia.`,
      href: '/google-ads/propietarios',
      channel: 'propietarios',
    });
  }

  // ── 6) Seguimiento de implementaciones de la semana (info) ──
  if (implementationsCount > 0) {
    out.push({
      id: 'impl-follow-up',
      severity: 'info',
      icon: '🧪',
      title: `Vigilar el efecto de ${implementationsCount} implementación${
        implementationsCount > 1 ? 'es' : ''
      }`,
      body: `Se registraron ${implementationsCount} cambio${
        implementationsCount > 1 ? 's' : ''
      } en la bitácora esta semana. Dar 1–2 semanas para medir su impacto antes de nuevos ajustes.`,
      href: undefined,
      channel: 'global',
    });
  }

  // ── 7) Margen para escalar (si todo está sano y dentro de meta) ──
  const hasUrgent = out.some((a) => a.severity === 'critical' || a.severity === 'warn');
  if (hasTarget && v.cpl <= cplTarget! && !hasUrgent && v.leads > 0) {
    const better = pickByCpl(google, tiktok, 'better');
    out.push({
      id: 'room-to-scale',
      severity: 'info',
      icon: '🚀',
      title: `Margen para escalar ${better.label}`,
      body: `El CPL combinado (${fmt(v.cpl)}) está dentro de la meta de ${fmt(cplTarget!)}. ${
        better.label
      } trae los leads más baratos (${fmt(better.metrics.cpl)}); hay margen para subir su presupuesto.`,
      href: better.channel === 'tiktok' ? '/tiktok' : '/google-ads',
      channel: better.channel,
    });
  }

  // ── Orden por severidad (critical → warn → info) ──
  out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  // ── Sin nada que accionar → mensaje honesto de "semana en orden" ──
  if (out.length === 0) {
    out.push({
      id: 'all-clear',
      severity: 'ok',
      icon: '✅',
      title: 'Semana en orden, sin acciones urgentes',
      body: 'No se detectaron desvíos relevantes en los últimos 7 días. Mantener el rumbo y revisar de nuevo la próxima semana.',
      channel: 'global',
    });
  }

  return out;
}

/** Nº de accionables que cuentan para el badge (todo lo que no sea 'ok'). */
export function countOpenActions(actions: WeekAction[]): number {
  return actions.filter((a) => a.severity !== 'ok').length;
}

/**
 * Brief de 3 líneas listo para copiar y reenviar (ej. WhatsApp al cliente).
 * Texto plano, en español, solo con datos ya calculados.
 */
export function buildWeekBrief(
  data: LeadsOverviewData,
  cplTarget: number | undefined,
  currency: string,
  rangeLabel: string,
  openActions: number
): string {
  const fmt = (n: number) => formatCurrency(n, currency);
  const v = data.venta.combined;
  const g = data.venta.google.metrics;
  const t = data.venta.tiktok.metrics;
  const hasPrev = data.venta.hasPrev;
  const hasTarget = typeof cplTarget === 'number' && cplTarget > 0 && v.leads > 0;

  const metaTxt = hasTarget
    ? v.cpl <= cplTarget!
      ? ` (dentro de meta ${fmt(cplTarget!)})`
      : ` (sobre meta ${fmt(cplTarget!)})`
    : '';
  const deltaTxt = hasPrev ? `, ${formatDelta(data.venta.combinedDeltas.leads)} en leads vs. semana pasada` : '';

  const line1 = `📊 Ofero · resumen semana (${rangeLabel})`;
  const line2 = `Ventas de vehículos: ${formatInt(v.leads)} leads a ${fmt(v.cpl)}/lead${metaTxt}${deltaTxt}.`;
  const line3 = `Reparto: Google ${formatInt(g.leads)} leads (${fmt(g.cpl)}) · TikTok ${formatInt(
    t.leads
  )} leads (${fmt(t.cpl)}). ${openActions > 0 ? `${openActions} punto(s) para revisar.` : 'Sin pendientes urgentes.'}`;

  return `${line1}\n${line2}\n${line3}`;
}
