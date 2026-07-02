// ============================================================
// weekEcommerce.ts — "cerebro" de Esta Semana para ecommerce
// ============================================================
// Gemelo de week.ts pero para clientes de VENTA (Sneakers), no de leads. Sobre
// el dato consolidado de useOverview (los 3 mundos, ventana fija 7d vs 7d) más
// la venta confirmada de Shopify, deriva:
//   · buildEcommerceWeekActionables → accionables priorizados (el corazón)
//   · buildEcommerceWeekBrief       → resumen copiable de 3-4 líneas
//
// Principios heredados del overview (mismos que week.ts):
//   · 100% dato real: ninguna regla inventa números; cada una cita el dato que
//     la dispara. Sin nada que accionar → 'ok' honesto.
//   · Anti-mezcla: los 3 mundos (venta real GA4 / intención Google / compra
//     Meta) se evalúan por separado, nunca se suman.
//   · Honestidad de comparación: las reglas WoW solo aplican si hubo semana
//     previa con dato (deltas ya vienen calculados por useOverview).
// ============================================================

import { formatCurrency, formatInt, formatROAS, formatDelta } from './utils';
import type { OverviewData } from './hooks/useOverview';
import type { ShopifyTotals } from './hooks/useShopify';

// Reexport para que la vista tenga un único punto de importación de la cadencia.
export { weekRanges } from './week';
export type { WeekRanges } from './week';

export type Severity = 'critical' | 'warn' | 'info' | 'ok';

export interface EcomWeekAction {
  id: string;
  severity: Severity;
  icon: string;
  title: string; // la acción a tomar
  body: string; // la evidencia (dato real) + el porqué
  href?: string; // enlace al detalle
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warn: 1, info: 2, ok: 3 };

// ── Umbrales (centralizados y explícitos) ──
const ROAS_BREAKEVEN = 1; // punto de equilibrio
const ROAS_SCALE_OK = 1.5; // ROAS sano con margen para escalar
const REVENUE_DROP_WARN = -15; // % caída de revenue que merece revisión
const REVENUE_DROP_CRIT = -30; // % caída fuerte
const CONV_DROP_WARN_PP = -0.3; // caída de tasa de conversión (en puntos %)
const INV_ACCEL_PCT = 15; // % de subida de inversión que se considera aceleración
const CART_PURCHASE_RATIO = 2; // carritos > 2× compras → señal de abandono

export interface EcomWeekInput {
  data: OverviewData;
  shopifyNow: ShopifyTotals | null;
  shopifyPrev: ShopifyTotals | null;
  currency: string;
  implementationsCount: number;
}

/**
 * Lista de accionables ordenada por severidad. Reglas sobre dato real; cada una
 * cita el número que la dispara y propone la acción concreta para el lunes.
 */
export function buildEcommerceWeekActionables(input: EcomWeekInput): EcomWeekAction[] {
  const { data, currency, implementationsCount } = input;
  const fmt = (n: number) => formatCurrency(n, currency);
  const out: EcomWeekAction[] = [];

  const hasSpend = data.investment > 0;
  const hasRevenue = data.revenue > 0;

  // ── 1) Gasto sin venta real (fuga total) ──
  if (hasSpend && !hasRevenue) {
    out.push({
      id: 'spend-no-revenue',
      severity: 'critical',
      icon: '🔥',
      title: 'Inversión sin venta real esta semana',
      body: `Se invirtieron ${fmt(data.investment)} (Google ${fmt(data.googleSpend)} · Meta ${fmt(
        data.metaSpend
      )}) pero GA4 no registró revenue de compra. Revisar tracking de compra o pausar lo que no convierte.`,
      href: '/overview',
    });
  }

  // ── 2) ROAS real bajo el punto de equilibrio ──
  if (hasSpend && hasRevenue && data.roas < ROAS_BREAKEVEN) {
    out.push({
      id: 'roas-below-breakeven',
      severity: 'critical',
      icon: '⚠️',
      title: 'ROAS real por debajo del equilibrio',
      body: `El ROAS real de compra fue ${formatROAS(data.roas)} (${fmt(data.revenue)} de venta sobre ${fmt(
        data.investment
      )} de inversión total). Cada peso invertido devuelve menos de uno; revisar pujas, segmentación y creativos.`,
      href: '/overview',
    });
  }

  // ── 3) Caída de revenue vs. semana previa ──
  if (hasRevenue && data.revenueDelta <= REVENUE_DROP_WARN) {
    out.push({
      id: 'revenue-drop',
      severity: data.revenueDelta <= REVENUE_DROP_CRIT ? 'critical' : 'warn',
      icon: '📉',
      title: 'Investigar la caída de ventas',
      body: `El revenue de compra cayó ${formatDelta(data.revenueDelta)} vs. la semana pasada (${fmt(
        data.revenue
      )} esta semana). Revisar pauta, presupuesto, stock y la bitácora de cambios recientes.`,
      href: '/overview',
    });
  }

  // ── 4) Brecha carrito → compra (abandono) ──
  // Fuentes distintas (Google cuenta add-to-cart; GA4 cuenta compra), pero una
  // brecha grande es señal honesta de abandono. Se citan ambos números.
  if (data.addToCart > 0 && data.addToCart > data.sales * CART_PURCHASE_RATIO && data.addToCart >= 10) {
    out.push({
      id: 'cart-abandon',
      severity: 'warn',
      icon: '🛒',
      title: 'Abandono de carrito alto',
      body: `Google registró ${formatInt(data.addToCart)} add-to-cart pero GA4 solo ${formatInt(
        data.sales
      )} compras esta semana. Aunque son fuentes distintas, la brecha sugiere fricción en el checkout: revisar costos de envío, métodos de pago y remarketing de carrito.`,
      href: '/overview',
    });
  }

  // ── 5) ROAS de Meta bajo, con gasto subiendo ──
  if (data.metaExists && data.metaSpend > 0 && data.metaRoas < ROAS_BREAKEVEN && data.metaSpendDelta > 0) {
    out.push({
      id: 'meta-roas-low',
      severity: 'warn',
      icon: '🔵',
      title: 'Rebalancear presupuesto de Meta',
      body: `Meta gastó ${fmt(data.metaSpend)} (${formatDelta(
        data.metaSpendDelta
      )} vs. semana pasada) con ROAS ${formatROAS(
        data.metaRoas
      )} según su propia atribución (que suele ser optimista). No recupera el gasto; considerar mover presupuesto al canal más eficiente.`,
      href: '/meta',
    });
  }

  // ── 6) Eficiencia deteriorándose: CPA ↑ y ventas ↓ ──
  if (data.cpaDelta > 0 && data.salesDelta < 0) {
    out.push({
      id: 'efficiency-down',
      severity: 'warn',
      icon: '📈',
      title: 'Eficiencia de adquisición deteriorándose',
      body: `El CPA subió ${formatDelta(data.cpaDelta)} mientras las compras cayeron ${formatDelta(
        data.salesDelta
      )} vs. la semana pasada. Cuesta más traer cada venta; revisar qué campañas subieron el costo.`,
      href: '/overview',
    });
  }

  // ── 7) Inversión acelerando sin retorno (ritmo de presupuesto) ──
  if (data.investmentDelta >= INV_ACCEL_PCT && data.revenueDelta <= 0) {
    out.push({
      id: 'inv-accel-no-return',
      severity: 'warn',
      icon: '⏱️',
      title: 'La inversión sube pero la venta no acompaña',
      body: `La inversión creció ${formatDelta(data.investmentDelta)} vs. la semana pasada y el revenue ${
        data.revenueDelta === 0 ? 'quedó plano' : `cayó ${formatDelta(data.revenueDelta)}`
      }. Rendimientos decrecientes: frenar el escalado hasta recuperar eficiencia.`,
      href: '/overview',
    });
  }

  // ── 8) Tasa de conversión cayendo ──
  if (data.conversionRateDelta <= CONV_DROP_WARN_PP) {
    out.push({
      id: 'convrate-drop',
      severity: 'warn',
      icon: '🎯',
      title: 'La tasa de conversión bajó',
      body: `La tasa de conversión cayó ${data.conversionRateDelta.toFixed(
        2
      )}pp vs. la semana pasada. El tráfico convierte peor: revisar landing, disponibilidad de tallas/stock y precio.`,
      href: '/overview',
    });
  }

  // ── 9) Seguimiento de implementaciones de la semana (info) ──
  if (implementationsCount > 0) {
    out.push({
      id: 'impl-follow-up',
      severity: 'info',
      icon: '🧪',
      title: `Vigilar el efecto de ${implementationsCount} implementación${implementationsCount > 1 ? 'es' : ''}`,
      body: `Se registraron ${implementationsCount} cambio${
        implementationsCount > 1 ? 's' : ''
      } en la bitácora esta semana. Dar 1–2 semanas para medir su impacto antes de nuevos ajustes.`,
    });
  }

  // ── 10) Margen para escalar (todo sano) ──
  const hasUrgent = out.some((a) => a.severity === 'critical' || a.severity === 'warn');
  if (hasRevenue && data.roas >= ROAS_SCALE_OK && !hasUrgent && data.revenueDelta >= 0) {
    out.push({
      id: 'room-to-scale',
      severity: 'info',
      icon: '🚀',
      title: 'Margen para escalar inversión',
      body: `El ROAS real (${formatROAS(data.roas)}) está sano y la venta no cae. Hay margen para subir presupuesto en el canal más eficiente sin sacrificar rentabilidad.`,
      href: '/overview',
    });
  }

  // ── Orden por severidad ──
  out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  // ── Nada que accionar → "semana en orden" honesto ──
  if (out.length === 0) {
    out.push({
      id: 'all-clear',
      severity: 'ok',
      icon: '✅',
      title: 'Semana en orden, sin acciones urgentes',
      body: 'No se detectaron desvíos relevantes en los últimos 7 días. Mantener el rumbo y revisar la próxima semana.',
    });
  }

  return out;
}

/** Nº de accionables que cuentan para el badge (todo lo que no sea 'ok'). */
export function countOpenActions(actions: EcomWeekAction[]): number {
  return actions.filter((a) => a.severity !== 'ok').length;
}

/**
 * Brief de 3-4 líneas listo para reenviar (dueño + operador). Texto plano, en
 * español, solo con datos ya calculados. Incluye la venta confirmada de Shopify
 * si hay dato (etiquetada, sin mezclarla con la estimación de GA4).
 */
export function buildEcommerceWeekBrief(
  input: EcomWeekInput,
  clientName: string,
  rangeLabel: string,
  openActions: number
): string {
  const { data, shopifyNow, currency } = input;
  const fmt = (n: number) => formatCurrency(n, currency);

  const deltaTxt =
    data.revenueDelta !== 0 ? `, ${formatDelta(data.revenueDelta)} vs. semana pasada` : '';

  const line1 = `🏷️ ${clientName} · resumen semana (${rangeLabel})`;
  const line2 = `Venta real (GA4): ${fmt(data.revenue)} a ROAS real ${formatROAS(data.roas)}${deltaTxt}.`;
  const line3 = `Inversión ${fmt(data.investment)} (Google ${fmt(data.googleSpend)} · Meta ${fmt(
    data.metaSpend
  )}). ${openActions > 0 ? `${openActions} punto(s) para revisar.` : 'Sin pendientes urgentes.'}`;

  const lines = [line1, line2, line3];
  if (shopifyNow && shopifyNow.orders > 0) {
    lines.push(
      `Shopify confirmado: ${fmt(shopifyNow.revenue)} en ${formatInt(shopifyNow.orders)} pedidos (excluye pendientes).`
    );
  }
  return lines.join('\n');
}
