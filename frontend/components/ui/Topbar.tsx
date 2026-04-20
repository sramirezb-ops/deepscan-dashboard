'use client'
import type { Period } from '@/lib/utils'

interface TopbarProps {
  title:     string
  period:    Period
  onPeriod:  (p: Period) => void
  onCompare?: () => void
  onExport?:  () => void
}

const periods: { id: Period; label: string }[] = [
  { id: '7d',  label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
]

export default function Topbar({ title, period, onPeriod }: TopbarProps) {
  return (
    <div
      className="flex items-center justify-between px-6 py-4 flex-shrink-0"
      style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 600,
          fontSize: '15px',
          color: 'var(--text-1)',
          letterSpacing: '-0.02em',
        }}
      >
        {title}
      </div>

      <div className="flex items-center gap-2">
        {/* Period selector */}
        <div
          className="flex rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--border)' }}
        >
          {periods.map(p => (
            <button
              key={p.id}
              onClick={() => onPeriod(p.id)}
              className="px-3 py-1.5 text-xs transition-all"
              style={{
                background: period === p.id ? 'var(--accent)' : 'transparent',
                color: period === p.id ? '#0f1117' : 'var(--text-2)',
                fontWeight: period === p.id ? 600 : 400,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
