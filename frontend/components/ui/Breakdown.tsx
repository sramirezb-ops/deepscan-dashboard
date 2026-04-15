'use client'

interface BreakdownRow {
  label:  string
  value:  number
  display:string
  color:  string
  delta?: number
}

interface BreakdownProps {
  rows:   BreakdownRow[]
  title?: string
  total?: { label: string; display: string; value: number }
}

export default function Breakdown({ rows, title, total }: BreakdownProps) {
  const max = Math.max(...rows.map(r => r.value), 1)

  return (
    <div>
      {title && (
        <div className="text-xs font-medium text-gray-700 mb-3">{title}</div>
      )}
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="text-[11px] text-gray-500 w-20 flex-shrink-0 truncate">
              {row.label}
            </div>
            <div className="flex-1 h-4 bg-gray-50 rounded overflow-hidden">
              <div
                className="h-full rounded flex items-center pl-2 transition-all duration-500"
                style={{
                  width: `${(row.value / max) * 100}%`,
                  minWidth: row.value > 0 ? '24px' : '0',
                  background: row.color,
                }}
              >
                <span className="text-[9px] font-medium text-white">
                  {row.display}
                </span>
              </div>
            </div>
            <div className="text-[11px] font-medium text-gray-700 min-w-[40px] text-right">
              {row.display}
            </div>
            {row.delta !== undefined && (
              <div className={`text-[10px] min-w-[28px] text-right ${
                row.delta > 0 ? 'text-green-600' : row.delta < 0 ? 'text-red-500' : 'text-gray-400'
              }`}>
                {row.delta > 0 ? '▲' : row.delta < 0 ? '▼' : '—'}
              </div>
            )}
          </div>
        ))}

        {total && (
          <div className="border-t border-gray-100 pt-2 mt-1 flex items-center gap-2">
            <div className="text-[11px] font-medium text-gray-900 w-20 flex-shrink-0">
              {total.label}
            </div>
            <div className="flex-1 h-4 bg-gray-50 rounded overflow-hidden">
              <div
                className="h-full rounded flex items-center pl-2 bg-indigo-600"
                style={{ width: `${(total.value / max) * 100}%`, minWidth: '36px' }}
              >
                <span className="text-[9px] font-medium text-white">{total.display}</span>
              </div>
            </div>
            <div className="text-[11px] font-medium text-indigo-700 min-w-[40px] text-right">
              {total.display}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
