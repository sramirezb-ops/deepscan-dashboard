'use client'
import { useMemo, useState } from 'react'
import KPICard from '@/components/ui/KPICard'
import Breakdown from '@/components/ui/Breakdown'
import Topbar from '@/components/ui/Topbar'
import AIInsights from '@/components/ui/AIInsights'
import { formatCurrency, formatROAS, formatPercent, formatNumber, type Period, type KPI } from '@/lib/utils'

interface GoogleAdsProps {
  data:     any
  period:   Period
  onPeriod: (p: Period) => void
  currency?:string
}

type SubTab = 'assetGroups' | 'productos' | 'searchTerms'

const strengthColors: Record<string, string> = {
  EXCELLENT: 'text-green-600 bg-green-50',
  GOOD:      'text-blue-600 bg-blue-50',
  POOR:      'text-red-600 bg-red-50',
  PENDING:   'text-gray-500 bg-gray-100',
}

const perfColors: Record<string, string> = {
  BEST:      'text-green-600 bg-green-50',
  GOOD:      'text-blue-600 bg-blue-50',
  LOW:       'text-red-600 bg-red-50',
  PENDING:   'text-gray-400 bg-gray-50',
  UNSPECIFIED:'text-gray-400 bg-gray-50',
}

export default function GoogleAds({ data, period, onPeriod, currency = 'COP' }: GoogleAdsProps) {
  const [subTab, setSubTab] = useState<SubTab>('assetGroups')
  const { gads, assetGroups, products, searchTerms } = data

  const totals = useMemo(() => ({
    cost:       gads.reduce((s: number, r: any) => s + Number(r.cost || 0), 0),
    conv_value: gads.reduce((s: number, r: any) => s + Number(r.conv_value || 0), 0),
    conv:       gads.reduce((s: number, r: any) => s + Number(r.conversions || 0), 0),
    impressions:gads.reduce((s: number, r: any) => s + Number(r.impressions || 0), 0),
    clicks:     gads.reduce((s: number, r: any) => s + Number(r.clicks || 0), 0),
  }), [gads])

  const roas = totals.cost > 0 ? totals.conv_value / totals.cost : 0

  const kpis: KPI[] = [
    {
      label:  'ROAS campaña',
      value:  formatROAS(roas),
      delta:  6,
      goal:   `Objetivo: 3.5x · ${roas >= 3.5 ? 'superado' : 'por debajo'}`,
      status: roas >= 3.5 ? 'green' : roas >= 3.0 ? 'amber' : 'red',
    },
    {
      label:  'Conversiones',
      value:  totals.conv.toFixed(0),
      delta:  14,
      status: 'green',
    },
    {
      label:  'Inversión PMAX',
      value:  formatCurrency(totals.cost, currency),
      delta:  8,
      status: 'amber',
    },
    {
      label:  'Costo / conv.',
      value:  formatCurrency(totals.conv > 0 ? totals.cost / totals.conv : 0, currency),
      delta:  -3,
      status: 'amber',
    },
  ]

  // Asset Groups agrupados
  const agSummary = useMemo(() => {
    const byAG: Record<string, any> = {}
    assetGroups.forEach((r: any) => {
      const key = `${r.campaign_name}__${r.asset_group_name}`
      if (!byAG[key]) byAG[key] = {
        campaign_name: r.campaign_name,
        asset_group_name: r.asset_group_name,
        ad_strength: r.ad_strength,
        status: r.status,
        cost: 0, conv: 0, conv_value: 0, impressions: 0, clicks: 0,
      }
      byAG[key].cost        += Number(r.cost || 0)
      byAG[key].conv        += Number(r.conversions || 0)
      byAG[key].conv_value  += Number(r.conv_value || 0)
      byAG[key].impressions += Number(r.impressions || 0)
      byAG[key].clicks      += Number(r.clicks || 0)
    })
    return Object.values(byAG).map((ag: any) => ({
      ...ag,
      roas: ag.cost > 0 ? ag.conv_value / ag.cost : 0,
      ctr:  ag.impressions > 0 ? ag.clicks / ag.impressions : 0,
    })).sort((a: any, b: any) => b.cost - a.cost)
  }, [assetGroups])

  // Branded vs non-branded (último período)
  const latestSearchTerms = searchTerms[0]

  const insights = [
    {
      type: roas >= 3.5 ? 'good' as const : 'critical' as const,
      title: 'ROAS PMAX:',
      body:  `${formatROAS(roas)} — ${roas >= 3.5 ? 'por encima del objetivo.' : 'por debajo del objetivo de 3.5x.'}`,
    },
    {
      type: 'warning' as const,
      title: 'Asset Groups:',
      body:  `${agSummary.filter((ag: any) => ag.ad_strength === 'POOR').length} grupos con calidad baja. Mejorar creativos para más impresiones.`,
    },
    {
      type: 'warning' as const,
      title: 'Nota PMAX:',
      body:  'El desglose por emplazamiento (Search/Shopping/YouTube) no está disponible en PMAX nativo.',
    },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Topbar title="Google Ads · PMAX" period={period} onPeriod={onPeriod} onCompare={() => {}} onExport={() => {}} />

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 bg-gray-50">
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          {kpis.map((kpi, i) => <KPICard key={i} kpi={kpi} />)}
        </div>

        {/* Aviso PMAX */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-3">
          <div className="w-5 h-5 rounded bg-blue-400 flex items-center justify-center text-white text-[10px] font-medium flex-shrink-0 mt-0.5">i</div>
          <div className="text-[11px] text-blue-700 leading-relaxed">
            <strong>Nota sobre PMAX:</strong> Google no expone el desglose por emplazamiento en campañas Performance Max.
            Los datos disponibles son: Asset Groups, Productos por SKU y categorías de búsqueda (muestra parcial ~35%).
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex border-b border-gray-100 px-4">
            {([
              { id: 'assetGroups', label: 'Asset Groups' },
              { id: 'productos',   label: 'Productos · SKU' },
              { id: 'searchTerms', label: 'Términos de búsqueda (~35%)' },
            ] as { id: SubTab; label: string }[]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id)}
                className={`px-4 py-3 text-xs border-b-2 transition-colors ${
                  subTab === tab.id
                    ? 'border-green-500 text-green-700 font-medium'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Asset Groups */}
          {subTab === 'assetGroups' && (
            <div className="p-4 flex flex-col gap-3">
              {agSummary.length === 0 ? (
                <div className="text-xs text-gray-400 py-4 text-center">Sin datos de Asset Groups en este período</div>
              ) : agSummary.map((ag: any, i: number) => (
                <div key={i} className="border border-gray-100 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${ag.status === 'ENABLED' ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div className="text-xs font-medium text-gray-800 flex-1">{ag.asset_group_name}</div>
                    <div className="text-[10px] text-gray-400">{ag.campaign_name}</div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${strengthColors[ag.ad_strength] || 'text-gray-400 bg-gray-100'}`}>
                      {ag.ad_strength || 'PENDING'}
                    </span>
                    <div className={`text-sm font-medium ${ag.roas >= 3.5 ? 'text-green-600' : ag.roas >= 2 ? 'text-amber-600' : 'text-gray-400'}`}>
                      {formatROAS(ag.roas)}
                    </div>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-4 gap-4">
                    <div>
                      <div className="text-[10px] text-gray-400">Inversión est.</div>
                      <div className="text-xs font-medium">{formatCurrency(ag.cost, currency)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400">Conversiones</div>
                      <div className="text-xs font-medium">{ag.conv.toFixed(0)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400">Impresiones</div>
                      <div className="text-xs font-medium">{formatNumber(ag.impressions)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400">CTR global</div>
                      <div className="text-xs font-medium">{formatPercent(ag.ctr)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Productos */}
          {subTab === 'productos' && (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-3 py-2 text-gray-400 font-medium">Producto</th>
                    <th className="text-left px-3 py-2 text-gray-400 font-medium">SKU</th>
                    <th className="text-right px-3 py-2 text-green-600 font-medium">Inversión ▼</th>
                    <th className="text-right px-3 py-2 text-gray-400 font-medium">Impr.</th>
                    <th className="text-right px-3 py-2 text-gray-400 font-medium">Conv.</th>
                    <th className="text-right px-3 py-2 text-gray-400 font-medium">ROAS</th>
                    <th className="text-left px-3 py-2 text-gray-400 font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p: any, i: number) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-800 max-w-[180px] truncate">{p.product_title}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-400 font-mono text-[10px]">{p.product_item_id}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(p.cost, currency)}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{formatNumber(p.impressions)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{Number(p.conversions).toFixed(0)}</td>
                      <td className={`px-3 py-2 text-right font-medium ${
                        p.roas >= 3.5 ? 'text-green-600' : p.roas >= 2 ? 'text-amber-600' : 'text-gray-300'
                      }`}>
                        {p.roas > 0 ? formatROAS(p.roas) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          p.conversions === 0
                            ? 'bg-red-50 text-red-600'
                            : p.roas >= 3.5
                            ? 'bg-green-50 text-green-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {p.conversions === 0 ? 'Sin conv.' : p.roas >= 3.5 ? 'Escalar' : 'Optimizar'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Search Terms */}
          {subTab === 'searchTerms' && (
            <div className="p-4">
              {!latestSearchTerms ? (
                <div className="text-xs text-gray-400 py-4 text-center">
                  Sin datos de términos de búsqueda. Verifica que el script de smec esté corriendo.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Breakdown
                      title="Distribución por tipo de tráfico"
                      rows={[
                        {
                          label:   'No-branded',
                          value:   latestSearchTerms.impressions_nonbranded,
                          display: formatNumber(latestSearchTerms.impressions_nonbranded),
                          color:   '#534AB7',
                        },
                        {
                          label:   'Branded',
                          value:   latestSearchTerms.impressions_branded,
                          display: formatNumber(latestSearchTerms.impressions_branded),
                          color:   '#1D9E75',
                        },
                        {
                          label:   'No identif.',
                          value:   latestSearchTerms.impressions_blank,
                          display: formatNumber(latestSearchTerms.impressions_blank),
                          color:   '#b4b2a9',
                        },
                      ]}
                    />
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-[10px] text-gray-400 mb-1">% tráfico branded</div>
                      <div className="text-xl font-medium text-gray-800">
                        {formatPercent(latestSearchTerms.ratio_branded_impressions)}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-[10px] text-gray-400 mb-1">CTR branded</div>
                      <div className="text-xl font-medium text-green-600">
                        {formatPercent(latestSearchTerms.ctr_branded)}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-[10px] text-gray-400 mb-1">CTR no-branded</div>
                      <div className="text-xl font-medium text-gray-700">
                        {formatPercent(latestSearchTerms.ctr_nonbranded)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <AIInsights insights={insights} updatedAt={`Período: ${period}`} />
      </div>
    </div>
  )
}
