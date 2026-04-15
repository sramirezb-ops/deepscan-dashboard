'use client'
import type { KPI } from '@/lib/utils'

interface KPICardProps {
  kpi: KPI
}

const statusColors = {
  green: 'border-t-green-500',
  amber: 'border-t-amber-400',
  red:   'border-t-red-500',
}

const deltaColors = {
  positive: 'text-green-600',
  negative: 'text-red-500',
  neutral:  'text-gray-400',
}

export default function KPICard({ kpi }: KPICardProps) {
  const deltaColor = kpi.delta > 0
    ? deltaColors.positive
    : kpi.delta < 0
    ? deltaColors.negative
    : deltaColors.neutral

  const deltaSymbol = kpi.delta > 0 ? '▲' : kpi.delta < 0 ? '▼' : '—'

  return (
    <div className={`bg-white border border-gray-100 rounded-xl p-4 border-t-4 ${statusColors[kpi.status]}`}>
      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
        {kpi.label}
      </div>
      <div className="text-2xl font-medium tracking-tight text-gray-900 leading-none mb-1">
        {kpi.value}
      </div>
      <div className={`text-[11px] ${deltaColor} flex items-center gap-1`}>
        <span>{deltaSymbol}</span>
        <span>{Math.abs(kpi.delta).toFixed(1)}% vs período ant.</span>
      </div>
      {kpi.goal && (
        <div className="text-[10px] text-gray-300 mt-1">{kpi.goal}</div>
      )}
      {kpi.source && (
        <div className="text-[10px] text-gray-300 mt-1">{kpi.source}</div>
      )}
    </div>
  )
}
