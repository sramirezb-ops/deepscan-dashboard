// Formatea números como moneda
export function formatCurrency(value: number, currency = 'COP'): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// Formatea números grandes (1.2M, 450K, etc.)
export function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000)     return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString('es-CO')
}

// Formatea porcentajes
export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`
}

// Formatea ROAS
export function formatROAS(value: number): string {
  return `${value.toFixed(2)}x`
}

// Calcula delta entre dos valores
export function calcDelta(current: number, previous: number): number {
  if (previous === 0) return 0
  return ((current - previous) / previous) * 100
}

// Rango de fechas
export function getDateRange(days: number): { from: string; to: string } {
  const to   = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days)
  return {
    from: from.toISOString().split('T')[0],
    to:   to.toISOString().split('T')[0],
  }
}

// Tipos base
export type Period = '7d' | '30d' | '90d'

export interface KPI {
  label:    string
  value:    string
  delta:    number
  goal?:    string
  status:   'green' | 'amber' | 'red'
  source?:  string
}

export interface ChartDataPoint {
  date:   string
  meta?:  number
  google?:number
  prev?:  number
  value?: number
}
