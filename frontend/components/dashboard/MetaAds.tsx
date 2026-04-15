'use client'
import { useMemo } from 'react'
import KPICard from '@/components/ui/KPICard'
import Funnel from '@/components/ui/Funnel'
import Topbar from '@/components/ui/Topbar'
import AIInsights from '@/components/ui/AIInsights'
import { formatCurrency, formatROAS, formatPercent, type Period, type KPI } from '@/lib/utils'

interface MetaAdsProps {
  data:     any
  period:   Period
  onPeriod: (p: Period) => void
  currency?:string
}

export default function MetaAds({ data, period, onPeriod, currency = 'COP' }: MetaAdsProps) {
  const { meta } = data

  const totals = useMemo(() => ({
    spend:            meta.reduce((s: number, r: any) => s + Number(r.spend || 0), 0),
    purchases:        meta.reduce((s: number, r: any) => s + Number(r.purchases || 0), 0),
    purchase_value:   meta.reduce((s: number, r: any) => s + Number(r.purchase_value || 0), 0),
    impressions:      meta.reduce((s: number, r: any) => s + Number(r.impressions || 0), 0),
    clicks:           meta.reduce((s: number, r: any) => s + Number(r.clicks || 0), 0),
    reach:            meta.reduce((s: number, r: any) => s + Number(r.reach || 0), 0),
    add_to_cart:      meta.reduce((s: number, r: any) => s + Number(r.add_to_cart || 0), 0),
    initiate_checkout:meta.reduce((s: number, r: any) => s + Number(r.initiate_checkout || 0), 0),
    view_content:     meta.reduce((s: number, r: any) => s + Number(r.view_content || 0), 0),
  }), [meta])

  const roas = totals.spend > 0 ? totals.purchase_value / totals.spend : 0
  const ctr  = totals.impressions > 0 ? totals.clicks / totals.impressions : 0
  const cpm  = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0
  const freq = totals.reach > 0 ? totals.impressions / totals.reach : 0

  const kpis: KPI[] = [
    {
      label:  'ROAS',
      value:  formatROAS(roas),
      delta:  10,
      goal:   `Objetivo: 3.5x · ${roas >= 3.5 ? 'superado' : 'por debajo'}`,
      status: roas >= 3.5 ? 'green' : roas >= 3.0 ? 'amber' : 'red',
    },
    {
      label:  'Inversión',
      value:  formatCurrency(totals.spend, currency),
      delta:  15,
      status: 'green',
    },
    {
      label:  'CTR promedio',
      value:  formatPercent(ctr),
      delta:  5,
      goal:   'Benchmark: 1.8%',
      status: ctr >= 0.018 ? 'green' : ctr >= 0.01 ? 'amber' : 'red',
    },
    {
      label:  'Frecuencia',
      value:  freq.toFixed(1),
      delta:  3,
      goal:   'Límite recomendado: 3.5',
      status: freq <= 3.5 ? 'green' : freq <= 4.5 ? 'amber' : 'red',
    },
  ]

  // Funnel Meta
  const funnelSteps = [
    {
      label: 'Adquisición · Impresiones',
      value: totals.impressions,
      color: '#EEEDFE',
      rate:  formatPercent(ctr) + ' CTR',
    },
    {
      label: 'Interacción · View Content',
      value: totals.view_content,
      color: '#AFA9EC',
      rate:  totals.impressions > 0
        ? formatPercent(totals.view_content / totals.impressions) + ' de impr.'
        : '—',
    },
    {
      label: 'Carritos añadidos',
      value: totals.add_to_cart,
      color: '#7F77DD',
      rate:  totals.view_content > 0
        ? formatPercent(totals.add_to_cart / totals.view_content) + ' de views'
        : '—',
    },
    {
      label: 'Pagos iniciados',
      value: totals.initiate_checkout,
      color: '#534AB7',
      rate:  totals.add_to_cart > 0
        ? formatPercent(totals.initiate_checkout / totals.add_to_cart) + ' de carritos'
        : '—',
    },
    {
      label: 'Compras',
      value: totals.purchases,
      color: '#1D9E75',
      rate:  totals.initiate_checkout > 0
        ? formatPercent(totals.purchases / totals.initiate_checkout) + ' de pagos'
        : '—',
      alert: totals.initiate_checkout > 0 && (totals.purchases / totals.initiate_checkout) < 0.05
        ? 'Tasa de compra baja — revisar proceso de pago y remarketing'
        : undefined,
    },
  ]

  // Tabla de anuncios — top 10 por gasto
  const adTable = useMemo(() => {
    const byAd: Record<string, any> = {}
    meta.forEach((r: any) => {
      const id = r.ad_id || r.ad_name
      if (!byAd[id]) byAd[id] = {
        ad_name: r.ad_name, campaign_name: r.campaign_name,
        status: r.status, thumb_url: r.thumb_url,
        spend: 0, purchases: 0, purchase_value: 0,
        impressions: 0, clicks: 0, add_to_cart: 0,
      }
      byAd[id].spend          += Number(r.spend || 0)
      byAd[id].purchases      += Number(r.purchases || 0)
      byAd[id].purchase_value += Number(r.purchase_value || 0)
      byAd[id].impressions    += Number(r.impressions || 0)
      byAd[id].clicks         += Number(r.clicks || 0)
      byAd[id].add_to_cart    += Number(r.add_to_cart || 0)
    })
    return Object.values(byAd)
      .map((a: any) => ({
        ...a,
        roas: a.spend > 0 ? a.purchase_value / a.spend : 0,
        ctr:  a.impressions > 0 ? a.clicks / a.impressions : 0,
      }))
      .sort((a: any, b: any) => b.spend - a.spend)
      .slice(0, 10)
  }, [meta])

  const insights = [
    {
      type: roas >= 3.5 ? 'good' as const : 'critical' as const,
      title: 'ROAS Meta:',
      body:  `${formatROAS(roas)} este período. ${roas >= 3.5 ? 'Por encima del objetivo.' : 'Por debajo del objetivo de 3.5x.'}`,
    },
    {
      type: freq > 3.5 ? 'warning' as const : 'good' as const,
      title: 'Frecuencia:',
      body:  `${freq.toFixed(1)}x — ${freq > 3.5 ? 'cerca de saturación, considera renovar creativos.' : 'dentro del rango sano.'}`,
    },
    {
      type: 'warning' as const,
      title: 'Optimización:',
      body:  `${adTable.filter((a: any) => a.purchases === 0).length} anuncios activos con 0 compras atribuidas.`,
    },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Topbar title="Meta Ads" period={period} onPeriod={onPeriod} onCompare={() => {}} onExport={() => {}} />

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 bg-gray-50">
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          {kpis.map((kpi, i) => <KPICard key={i} kpi={kpi} />)}
        </div>

        {/* Funnel */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <Funnel steps={funnelSteps} title="Funnel de conversión · Meta Ads" />
        </div>

        {/* Tabla anuncios */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <div className="text-xs font-medium text-gray-700">Resultados por anuncio</div>
            <div className="text-[10px] text-gray-300">Top 10 por inversión</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-3 py-2 text-gray-400 font-medium w-8">#</th>
                  <th className="text-left px-3 py-2 text-gray-400 font-medium w-8"></th>
                  <th className="text-left px-3 py-2 text-gray-400 font-medium">Anuncio</th>
                  <th className="text-left px-3 py-2 text-gray-400 font-medium">Estado</th>
                  <th className="text-right px-3 py-2 text-green-600 font-medium">Inversión</th>
                  <th className="text-right px-3 py-2 text-gray-400 font-medium">ROAS</th>
                  <th className="text-right px-3 py-2 text-gray-400 font-medium">Compras</th>
                  <th className="text-right px-3 py-2 text-gray-400 font-medium">CTR</th>
                  <th className="text-right px-3 py-2 text-gray-400 font-medium">Carritos</th>
                  <th className="text-left px-3 py-2 text-gray-400 font-medium">Diagnóstico</th>
                </tr>
              </thead>
              <tbody>
                {adTable.map((ad: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-300">{i + 1}</td>
                    <td className="px-3 py-2">
                      {ad.thumb_url
                        ? <img src={ad.thumb_url} className="w-8 h-8 rounded object-cover" alt="" />
                        : <div className="w-8 h-8 rounded bg-gray-100" />
                      }
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-800 max-w-[140px] truncate">{ad.ad_name}</div>
                      <div className="text-gray-300 max-w-[140px] truncate">{ad.campaign_name}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        ad.status === 'ACTIVE'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {ad.status === 'ACTIVE' ? 'Activo' : 'Pausado'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatCurrency(ad.spend, currency)}
                    </td>
                    <td className={`px-3 py-2 text-right font-medium ${
                      ad.roas >= 3.5 ? 'text-green-600' : ad.roas >= 2 ? 'text-amber-600' : 'text-gray-300'
                    }`}>
                      {ad.roas > 0 ? formatROAS(ad.roas) : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right ${ad.purchases === 0 ? 'text-gray-300' : 'text-gray-700'}`}>
                      {ad.purchases > 0 ? ad.purchases.toFixed(0) : '0'}
                    </td>
                    <td className={`px-3 py-2 text-right ${
                      ad.ctr >= 0.02 ? 'text-green-600 font-medium' : 'text-gray-600'
                    }`}>
                      {formatPercent(ad.ctr)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {ad.add_to_cart > 0 ? ad.add_to_cart.toFixed(0) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        ad.purchases === 0 && ad.spend > 0
                          ? 'bg-red-50 text-red-600'
                          : ad.roas >= 3.5
                          ? 'bg-green-50 text-green-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        {ad.purchases === 0 && ad.spend > 0
                          ? 'Sin atrib.'
                          : ad.roas >= 3.5 ? 'Escalar' : 'Optimizar'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <AIInsights insights={insights} updatedAt={`Período: ${period}`} />
      </div>
    </div>
  )
}
