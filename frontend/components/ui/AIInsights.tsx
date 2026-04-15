'use client'

interface Insight {
  type:    'critical' | 'warning' | 'good'
  title:   string
  body:    string
  action?: string
  onAction?: () => void
}

interface AIInsightsProps {
  insights:  Insight[]
  updatedAt?: string
}

const typeStyles = {
  critical: {
    card:   'bg-red-50 border-red-100',
    tag:    'text-red-600',
    body:   'text-red-700',
    action: 'text-red-600',
    label:  'ACCIÓN URGENTE',
  },
  warning: {
    card:   'bg-amber-50 border-amber-100',
    tag:    'text-amber-700',
    body:   'text-amber-800',
    action: 'text-amber-700',
    label:  'OPORTUNIDAD',
  },
  good: {
    card:   'bg-green-50 border-green-100',
    tag:    'text-green-700',
    body:   'text-green-800',
    action: 'text-green-700',
    label:  'BUEN DESEMPEÑO',
  },
}

export default function AIInsights({ insights, updatedAt }: AIInsightsProps) {
  return (
    <div className="bg-white border border-indigo-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center text-[10px] font-medium text-indigo-600">
          AI
        </div>
        <div className="text-xs font-medium text-indigo-700">
          Análisis DeepScan IA
        </div>
        {updatedAt && (
          <div className="ml-auto text-[10px] text-gray-300">{updatedAt}</div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {insights.map((insight, i) => {
          const s = typeStyles[insight.type]
          return (
            <div key={i} className={`rounded-lg p-3 border ${s.card}`}>
              <div className={`text-[10px] font-medium mb-1 ${s.tag}`}>
                {s.label}
              </div>
              <div className={`text-[11px] leading-relaxed ${s.body}`}>
                <strong>{insight.title}</strong>{' '}
                {insight.body}
              </div>
              {insight.action && (
                <button
                  onClick={insight.onAction}
                  className={`text-[10px] font-medium mt-2 underline cursor-pointer ${s.action}`}
                >
                  {insight.action} →
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
