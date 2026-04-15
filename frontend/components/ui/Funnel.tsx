'use client'

interface FunnelStep {
  label:    string
  value:    number
  rate?:    string
  color:    string
  alert?:   string
}

interface FunnelProps {
  steps: FunnelStep[]
  title?: string
}

export default function Funnel({ steps, title }: FunnelProps) {
  const max = steps[0]?.value || 1

  return (
    <div>
      {title && (
        <div className="text-xs font-medium text-gray-700 mb-3">{title}</div>
      )}
      <div className="flex flex-col gap-0">
        {steps.map((step, i) => {
          const width = Math.max((step.value / max) * 100, 3)
          const isLast = i === steps.length - 1

          return (
            <div key={i}>
              <div className="flex items-center gap-3">
                {/* Barra */}
                <div className="w-48 flex-shrink-0">
                  <div
                    className="h-8 rounded flex items-center pl-3 transition-all"
                    style={{
                      width: `${width}%`,
                      minWidth: '48px',
                      background: step.color,
                    }}
                  >
                    <span className="text-[10px] font-medium text-white truncate">
                      {step.value.toLocaleString('es-CO')}
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1">
                  <div className="text-xs font-medium text-gray-800">{step.label}</div>
                </div>

                {/* Rate */}
                {step.rate && (
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-700">{step.rate}</div>
                  </div>
                )}
              </div>

              {/* Conector */}
              {!isLast && (
                <div className="ml-4 py-1">
                  <div className="text-[10px] text-gray-300 pl-2">
                    ↓ {steps[i + 1]?.value && step.value > 0
                      ? `${((steps[i + 1].value / step.value) * 100).toFixed(1)}% continúan`
                      : ''}
                  </div>
                </div>
              )}

              {/* Alerta */}
              {step.alert && (
                <div className="mt-1 mb-2 ml-2 bg-red-50 border border-red-100 rounded px-3 py-2 text-[10px] text-red-600">
                  {step.alert}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
