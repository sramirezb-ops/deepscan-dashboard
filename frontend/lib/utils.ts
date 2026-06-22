// Helpers de formato

// Separador de miles por país: Colombia (COP) usa punto → 6.000.000.
// El resto (México MXN, USD…) usa coma → 6,000,000.
// ClientProvider fija la moneda activa para los formateadores que no la reciben
// (formatNumber/formatInt), según el cliente seleccionado.
let _activeCurrency: string | undefined;

export function setActiveCurrency(currency?: string): void {
  _activeCurrency = currency;
}

function localeFor(currency?: string): string {
  const c = currency ?? _activeCurrency;
  return c === 'COP' ? 'es-CO' : 'en-US';
}

export function formatCurrency(value: number, currency = 'MXN'): string {
  if (value == null || isNaN(value)) return '—';
  // Número completo, sin abreviar y sin decimales. Separadores de miles
  // según el país: $6.000.000 (COP) o $6,000,000 (MXN).
  return `$${Math.round(value).toLocaleString(localeFor(currency))}`;
}

export function formatCurrencyFull(value: number, currency = 'MXN'): string {
  if (value == null || isNaN(value)) return '—';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number): string {
  if (value == null || isNaN(value)) return '—';
  // Número completo, sin abreviar (sin K/M): 1.234.567 (COP) o 1,234,567.
  return Math.round(value).toLocaleString(localeFor());
}

export function formatInt(value: number): string {
  if (value == null || isNaN(value)) return '—';
  return Math.round(value).toLocaleString(localeFor());
}

export function formatPercent(value: number, decimals = 2): string {
  if (value == null || isNaN(value)) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatPercentRaw(value: number, decimals = 1): string {
  // Ya viene como porcentaje (ej: 24.3 no 0.243)
  if (value == null || isNaN(value)) return '—';
  return `${value.toFixed(decimals)}%`;
}

export function formatROAS(value: number): string {
  if (value == null || isNaN(value)) return '—';
  return `${value.toFixed(2)}×`;
}

export function formatDelta(value: number, suffix = '%'): string {
  if (value == null || isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}${suffix}`;
}

export function deltaDirection(value: number): 'up' | 'down' | 'neutral' {
  if (value == null || isNaN(value) || value === 0) return 'neutral';
  return value > 0 ? 'up' : 'down';
}

export function calcDelta(current: number, previous: number): number {
  if (previous === 0 || previous == null) return 0;
  return ((current - previous) / previous) * 100;
}

// Rangos de fecha
export type Period = '7d' | '30d' | '90d' | 'mtd' | 'ytd';

export function getDateRange(period: Period = '30d'): { from: string; to: string } {
  const to = new Date();
  const from = new Date();

  if (period === 'mtd') {
    from.setDate(1);
  } else if (period === 'ytd') {
    from.setMonth(0, 1);
  } else {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    from.setDate(from.getDate() - days);
  }

  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

// Rango de período anterior (para comparación)
export function getPreviousRange(period: Period = '30d'): { from: string; to: string } {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const to = new Date();
  to.setDate(to.getDate() - days);
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}
