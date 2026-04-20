'use client'
import type { KPI } from '@/lib/utils'

const statusColor = {
  green: 'var(--accent)',
  amber: '#f59e0b',
  red:   '#ff4d4d',
}

const deltaColor = (delta: number) =>
  delta > 0 ? 'var(--accent)' : delta < 0 ? '#ff4d4d' : 'var(--text-3)'

export default function KPICard({ kpi }: { kpi: KPI }) {
  const color = statusColor[kpi.status]

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Label */}
      <div style={{ fontSize: '11px', color: 'var(--text-2)', fontWeight: 400 }}>
        {kpi.label}
      </div>

      {/* Value */}
      <div
        className="font-num"
        style={{
          fontSize: '24px',
          fontWeight: 600,
          color: 'var(--text-1)',
          letterSpacing: '-0.03em',
          lineHeight: 1,
        }}
      >
        {kpi.value}
      </div>

      {/* Delta + Goal */}
      <div className="flex items-center justify-between">
        {kpi.delta !== undefined && (
          <div
            className="flex items-center gap-1 text-[11px] font-medium"
            style={{ color: deltaColor(kpi.delta) }}
          >
            <span>{kpi.delta > 0 ? '↑' : kpi.delta < 0 ? '↓' : '→'}</span>
            <span>{Math.abs(kpi.delta).toFixed(1)}%</span>
          </div>
        )}
        {kpi.goal && (
          <div style={{ fontSize: '10px', color: 'var(--text-3)' }} className="truncate max-w-[120px]">
            {kpi.goal}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div
        className="h-0.5 rounded-full"
        style={{ background: 'var(--border)' }}
      >
        <div
          className="h-full rounded-full"
          style={{ background: color, width: kpi.status === 'green' ? '80%' : kpi.status === 'amber' ? '50%' : '25%' }}
        />
      </div>
    </div>
  )
}
