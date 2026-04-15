'use client'
import type { Period } from '@/lib/utils'

interface TopbarProps {
  title:     string
  period:    Period
  onPeriod:  (p: Period) => void
  onExport?: () => void
  onCompare?:() => void
}

const periods: { value: Period; label: string }[] = [
  { value: '7d',  label: '7 días' },
  { value: '30d', label: 'Este mes' },
  { value: '90d', label: '90 días' },
]

export default function Topbar({ title, period, onPeriod, onExport, onCompare }: TopbarProps) {
  return (
    <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between gap-4 flex-shrink-0">
      <div className="text-sm font-medium text-gray-900">{title}</div>

      <div className="flex items-center gap-2">
        {/* Selector de período */}
        <div className="flex gap-0.5 bg-gray-50 rounded-md p-0.5">
          {periods.map(p => (
            <button
              key={p.value}
              onClick={() => onPeriod(p.value)}
              className={`px-3 py-1.5 rounded text-[11px] transition-colors ${
                period === p.value
                  ? 'bg-white text-gray-900 font-medium border border-gray-100'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {onCompare && (
          <button
            onClick={onCompare}
            className="px-3 py-1.5 rounded-md text-[11px] border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
          >
            + Comparar período
          </button>
        )}

        {onExport && (
          <button
            onClick={onExport}
            className="px-3 py-1.5 rounded-md text-[11px] border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            ↓ Exportar
          </button>
        )}
      </div>
    </div>
  )
}
