// ============================================================
// Motor de diagnóstico de performance — COMPARTIDO (Overview + Compras).
// Usa SOLO señales confiables: CTR (enganche), spread de anuncios (creativo),
// spread de adsets (público), frecuencia (fatiga). El embudo
// carrito→checkout→compra NO se usa como factor: en Sneakers hoy está roto
// (tracking) y mentiría — por eso "post-clic (no medible)".
// "Cerca del objetivo: qué falta" = qué anuncios cortar para llegar a la meta.
// ============================================================

// Semáforo RELATIVO al objetivo ROAS del cliente.
export type PerfAction = 'escalar' | 'vigilar' | 'cortar';
export const WATCH_FLOOR = 0.6; // fracción del objetivo bajo la cual es 🔴
export function roasAction(roas: number, target: number): PerfAction {
  if (roas >= target) return 'escalar';
  if (roas >= target * WATCH_FLOOR) return 'vigilar';
  return 'cortar';
}

export type DiagFactor = 'ok' | 'fatiga' | 'creativo' | 'angulo' | 'publico' | 'postclic';
export interface AdLite { name: string; adset: string; spend: number; revenue: number; purchases: number; roas: number; ctr: number; thumb: string | null; }
export interface AdsetLite { name: string; spend: number; revenue: number; roas: number; ctr: number; }

/** "Qué falta para llegar a la meta": cortar los anuncios que arrastran. */
export interface NearTarget {
  gapX: number;      // cuánto falta de ROAS (target − roas actual)
  cutAds: number;    // nº de anuncios a cortar
  cutSpend: number;  // gasto de esos anuncios
  projRoas: number;  // ROAS proyectado tras cortarlos
  feasible: boolean; // true si cortando ≤50% del gasto se llega a meta
}

export interface Diagnosis {
  factor: DiagFactor;
  title: string;
  detail: string;
  ctr: number;
  benchCtr: number;
  freq: number;
  near: NearTarget | null; // solo cuando está bajo objetivo
}

const pct1 = (v: number) => `${v.toFixed(1)}%`;
const rx2 = (v: number) => `${v.toFixed(1)}×`;

/**
 * Palanca "cerca de la meta": corta greedily los anuncios que arrastran (ROAS
 * bajo el promedio) hasta que el ROAS del resto llegue a la meta. Devuelve
 * cuántos/qué gasto y el ROAS proyectado — la acción concreta para cerrar la
 * brecha. feasible=false si haría falta cortar demasiado (no es realista).
 */
export function nearTargetLever(ads: AdLite[], target: number): NearTarget | null {
  const all = ads.filter((a) => a.spend > 0);
  const tSpend = all.reduce((s, a) => s + a.spend, 0);
  const tRev = all.reduce((s, a) => s + a.revenue, 0);
  if (tSpend <= 0) return null;
  const roas = tRev / tSpend;
  if (roas >= target) return null;
  const gapX = target - roas;
  const sorted = [...all].sort((a, b) => a.roas - b.roas);
  let remS = tSpend, remR = tRev, cutAds = 0, cutSpend = 0;
  for (const a of sorted) {
    if (remS > 0 && remR / remS >= target) break;
    if (a.roas >= roas) break; // solo los que arrastran bajo el promedio
    remS -= a.spend; remR -= a.revenue; cutAds += 1; cutSpend += a.spend;
  }
  const projRoas = remS > 0 ? remR / remS : 0;
  const feasible = projRoas >= target - 0.05 && cutAds > 0 && cutSpend <= tSpend * 0.5;
  return { gapX, cutAds, cutSpend, projRoas, feasible };
}

export interface DiagInput { roas: number; ctr: number; freq: number; ads: AdLite[]; adsets: AdsetLite[]; }

/** Diagnóstico del factor de falla + "qué falta" para una campaña/entidad. */
export function diagnose(c: DiagInput, benchCtr: number, target: number): Diagnosis {
  const near = nearTargetLever(c.ads, target);
  const base = { ctr: c.ctr, benchCtr, freq: c.freq, near };
  if (c.roas >= target) {
    return { factor: 'ok', title: 'En o sobre objetivo', detail: 'Rinde a la meta o por encima. Candidata a escalar presupuesto mientras aguante la eficiencia.', ...base };
  }
  if (c.freq >= 3.5) {
    return { factor: 'fatiga', title: 'Fatiga de público', detail: `Frecuencia ${rx2(c.freq)}: el público ya vio mucho los anuncios. Refrescar creativos o ampliar la audiencia.`, ...base };
  }
  const engancheMalo = benchCtr > 0 && c.ctr < benchCtr * 0.75;
  if (engancheMalo) {
    const adsetsOk = c.adsets.filter((a) => a.spend > 500);
    if (adsetsOk.length >= 2) {
      const best = adsetsOk.reduce((a, b) => (b.roas > a.roas ? b : a));
      const worst = adsetsOk.reduce((a, b) => (b.roas < a.roas ? b : a));
      if (best.roas >= Math.max(worst.roas * 2, target) && worst.spend > 500) {
        return { factor: 'publico', title: 'Público que no engancha', detail: `El público "${worst.name}" rinde ${rx2(worst.roas)} (CTR ${pct1(worst.ctr)}) vs "${best.name}" ${rx2(best.roas)}. Pausar o ajustar ese público y mover presupuesto al que sí responde.`, ...base };
      }
    }
    const adsOk = c.ads.filter((a) => a.spend > 300);
    const ctrs = adsOk.map((a) => a.ctr).sort((x, y) => y - x);
    if (ctrs.length >= 2 && ctrs[0] >= benchCtr && ctrs[0] - ctrs[ctrs.length - 1] >= benchCtr * 0.5) {
      return { factor: 'creativo', title: 'Creativo: unos enganchan, otros no', detail: `El mejor anuncio va a CTR ${pct1(ctrs[0])} y el peor a ${pct1(ctrs[ctrs.length - 1])}. Cortar los que no enganchan y poner el presupuesto en los que sí.`, ...base };
    }
    return { factor: 'angulo', title: 'Ángulo/concepto flojo', detail: `CTR ${pct1(c.ctr)} muy por debajo del ${pct1(benchCtr)} de las ganadoras, parejo en todos los anuncios: el concepto no engancha. Probar un ángulo comunicativo distinto.`, ...base };
  }
  return { factor: 'postclic', title: 'Se pierde después del clic', detail: `Engancha bien (CTR ${pct1(c.ctr)} ≈ ganadoras) pero no convierte a la meta. Carrito/checkout/compra no son medibles hoy por el tracking roto — revisar oferta/precio/página y, sobre todo, arreglar la capa de datos para poder diagnosticarlo.`, ...base };
}

/** CTR benchmark (%) de las ganadoras (ROAS ≥ objetivo), ponderado por impresiones. */
export function benchmarkCtr(rows: { clicks: number; impressions: number; roas: number }[], target: number): number {
  let winC = 0, winI = 0, allC = 0, allI = 0;
  for (const r of rows) {
    allC += r.clicks; allI += r.impressions;
    if (r.roas >= target) { winC += r.clicks; winI += r.impressions; }
  }
  const ctr = (c: number, i: number) => (i > 0 ? (c / i) * 100 : 0);
  return winI > 0 ? ctr(winC, winI) : ctr(allC, allI);
}
