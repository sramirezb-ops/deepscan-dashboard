// ============================================================
// MODELO DE RANGO DE TIEMPO — el "filtro global" estilo Looker
// ============================================================
// Define los presets de fecha, cómo se resuelven a un rango concreto,
// cómo se calcula el período anterior comparable, y cómo se etiquetan
// dinámicamente (para que los textos dejen de decir "Abril" a mano).
// ============================================================

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export type PresetId =
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | '90d'
  | '6m'
  | '12m'
  | 'mtd' // mes en curso
  | 'ytd' // año en curso
  | 'custom';

export interface PresetMeta {
  id: PresetId;
  label: string;
}

export const PRESETS: PresetMeta[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: '7d', label: 'Últimos 7 días' },
  { id: '30d', label: 'Últimos 30 días' },
  { id: '90d', label: 'Últimos 90 días' },
  { id: '6m', label: 'Últimos 6 meses' },
  { id: '12m', label: 'Últimos 12 meses' },
  { id: 'mtd', label: 'Este mes' },
  { id: 'ytd', label: 'Este año' },
  { id: 'custom', label: 'Personalizado' },
];

// Formatea una fecha a YYYY-MM-DD en hora LOCAL (evita el corrimiento de día
// que produce toISOString por usar UTC).
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parse(ymdStr: string): Date {
  return new Date(`${ymdStr}T00:00:00`);
}

/** Convierte un preset en un rango concreto {from, to} relativo a hoy. */
export function resolvePreset(preset: PresetId): DateRange {
  const today = new Date();
  const from = new Date(today);
  const to = new Date(today);

  switch (preset) {
    case 'today':
      break; // from = to = hoy
    case 'yesterday':
      from.setDate(from.getDate() - 1);
      to.setDate(to.getDate() - 1);
      break;
    case '7d':
      from.setDate(from.getDate() - 6); // 7 días inclusive
      break;
    case '30d':
      from.setDate(from.getDate() - 29);
      break;
    case '90d':
      from.setDate(from.getDate() - 89);
      break;
    case '6m':
      from.setMonth(from.getMonth() - 6);
      break;
    case '12m':
      from.setMonth(from.getMonth() - 12);
      break;
    case 'mtd':
      from.setDate(1);
      break;
    case 'ytd':
      from.setMonth(0, 1);
      break;
    case 'custom':
      break; // el rango lo provee el usuario aparte
  }

  return { from: ymd(from), to: ymd(to) };
}

/** Días inclusivos que cubre un rango. */
export function rangeLengthDays(range: DateRange): number {
  const from = parse(range.from);
  const to = parse(range.to);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

/**
 * Período anterior comparable: mismo número de días, inmediatamente antes.
 * Ej: 1–30 jun  ->  2–31 may.
 */
export function previousRange(range: DateRange): DateRange {
  const days = rangeLengthDays(range);
  const prevTo = parse(range.from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));
  return { from: ymd(prevFrom), to: ymd(prevTo) };
}

/**
 * Etiqueta dinámica de un rango, en español.
 *  - 1 día:        "16 jun 2026"
 *  - mismo mes:    "1 – 16 jun 2026"
 *  - mismo año:    "16 may – 16 jun 2026"
 *  - distinto año: "16 dic 2025 – 16 jun 2026"
 */
export function formatRangeLabel(range: DateRange): string {
  const f = parse(range.from);
  const t = parse(range.to);

  if (range.from === range.to) {
    return f.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const sameYear = f.getFullYear() === t.getFullYear();
  const sameMonth = sameYear && f.getMonth() === t.getMonth();

  const leftOpts: Intl.DateTimeFormatOptions = sameMonth
    ? { day: 'numeric' }
    : sameYear
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' };

  const left = f.toLocaleDateString('es-ES', leftOpts);
  const right = t.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${left} – ${right}`;
}
