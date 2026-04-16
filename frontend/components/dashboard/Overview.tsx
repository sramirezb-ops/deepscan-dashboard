'use client'
import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import KPICard from '@/components/ui/KPICard'
import AIInsights from '@/components/ui/AIInsights'
import Breakdown from '@/components/ui/Breakdown'
import Topbar from '@/components/ui/Topbar'
import { formatCurrency, formatROAS, formatNumber, type Period, type KPI } from '@/lib/utils'

interface OverviewProps {
  data:      any
  period:    Period
  onPeriod:  (p: Period) => void
  currency?: string
}

export default function Overview({ data, period, onPeriod, currency = 'COP' }: OverviewProps) {
  const { meta, gads, shopify } = data

  // Totales Meta
  const metaTotals = useMemo(() => ({
    spend:    meta.reduce((s: number, r: any) => s + Number(r.spend || 0), 0),
    revenue:  meta.reduce((s: number, r: any) => s + Number(r.purchase_value || 0), 0),
    purchases:meta.reduce((s: number, r: any) => s + Number(r.purchases || 0), 0),
  }), [meta])

  const metaROAS = metaTotals.spend > 0 ? metaTotals.revenue / metaTotals.spend : 0

  // Totales Google Ads
  const gadsTotals = useMemo(() => ({
    cost:       gads.reduce((s: number, r: any) => s + Number(r.cost || 0), 0),
    conv_value: gads.reduce((s: number, r: any) => s + Number(r.conv_value || 0), 0),
    conv:       gads.reduce((s: number, r: any) => s + Number(r.conversions || 0), 0),
  }), [gads])

  const gadsROAS = gadsTotals.cost > 0 ? gadsTotals.conv_value / gadsTotals.cost : 0

  // Totales Shopify
  const shopTotals = useMemo(() => ({
    revenue: shopify.reduce((s: number, r: any) => s + Number(r.revenue || 0), 0),
    orders:  shopify.reduce((s: number, r: any) => s + Number(r.orders || 0), 0),
  }), [shopify])

  // Combinado
  const totalSpend   = metaTotals.spend + gadsTotals.cost
  const totalRevenue = metaTotals.revenue + gadsTotals.conv_value
  const combinedROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0

  const kpis: KPI[] = [
    {
      label:  'ROAS combinado',
      value:  formatROAS(combinedROAS),
      delta:  12,
      goal:   `Objetivo: 3.5x · ${combinedROAS >= 3.5 ? 'superado' : 'por debajo'}`,
      status: combinedROAS >= 3.5 ? 'green' : combinedROAS >= 3.0 ? 'amber' : 'red',
    },
    {
      label:  'Ventas Shopify',
      value:  formatCurrency(shopTotals.revenue, currency),
      delta:  8,
      goal:   `${shopTotals.orders.toLocaleString('es-CO')} órdenes`,
      status: 'green',
      source: currency,
    },
    {
      label:  'Inversión total',
      value:  formatCurrency(totalSpend, currency),
      delta:  12,
      goal:   'Meta + Google Ads',
      status: 'amber',
    },
    {
      label:  'CPA promedio',
      value:  formatCurrency(
        (metaTotals.purchases + gadsTotals.conv) > 0
          ? totalSpend / (metaTotals.purchases + gadsTotals.conv)
          : 0,
        currency
      ),
      delta:  -3,
      goal:   'Costo por conversión',
      status: 'amber',
    },
  ]

  // Datos para la gráfica diaria
  const chartData = useMemo(() => {
    const byDate: Record<string, any> = {}
    meta.forEach((r: any) => {
      const d = r.date
      if (!byDate[d]) byDate[d] = { date: d, meta: 0, google: 0 }
      byDate[d].meta += Number(r.spend || 0)
    })
    gads.forEach((r: any) => {
      const d = r.date
      if (!byDate[d]) byDate[d] = { date: d, meta: 0, google: 0 }
      byDate[d].google += Number(r.cost || 0)
    })
    return Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date))
  }, [meta, gads])

  // ROAS breakdown
  const roasBreakdown = [
    { label: 'Meta Feed',   value: metaROAS,  display: formatROAS(metaROAS),  color: '#534AB7', delta: 1 },
    { label: 'Google Ads',  value: gadsROAS,  display: formatROAS(gadsROAS),  color: '#1D9E75', delta: 0 },
  ]

  const insights = [
    {
      type: 'warning' as const,
      title: 'Meta Ads:',
      body:  `ROAS ${formatROAS(metaROAS)} esta período. Revisa campañas con CTR bajo para optimizar presupuesto.`,
      action: 'Ver Meta Ads',
    },
    {
      type: combinedROAS >= 3.5 ? 'good' as const : 'critical' as const,
      title: 'ROAS combinado:',
      body:  combinedROAS >= 3.5
        ? `${formatROAS(combinedROAS)} — por encima del objetivo de 3.5x.`
        : `${formatROAS(combinedROAS)} — por debajo del objetivo de 3.5x. Revisar distribución de presupuesto.`,
      action: 'Ver Google Ads',
    },
    {
      type: 'good' as const,
      title: 'Shopify:',
      body:  `${shopTotals.orders} órdenes con ingresos de ${formatCurrency(shopTotals.revenue, currency)}.`,
      action: 'Ver Shopify',
    },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Topbar
        title="Overview general"
        period={period}
        onPeriod={onPeriod}
        onCompare={() => {}}
        onExport={() => {}}
      />

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 bg-gray-50">
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          {kpis.map((kpi, i) => <KPICard key={i} kpi={kpi} />)}
        </div>

        {/* Gráfica + ROAS */}
        <div className="grid grid-cols-5 gap-3">
          <div className="col-span-3 bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs font-medium text-gray-700 mb-3">
              Inversión diaria por canal
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={chartData} barGap={2}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: '#b4b2a9' }}
                  tickFormatter={(d) => d.slice(8)}
                  axisLine={false} tickLine={false}
                />
                <YAxis hide />
                <Tooltip
                  formatter={(v) => formatCurrency(Number(v), currency)}
                  labelFormatter={(l) => `Día ${l}`}
                  contentStyle={{ fontSize: 11, borderRadius: 6 }}
                />
                <Legend
                  iconType="square"
                  wrapperStyle={{ fontSize: 10, paddingTop: 6 }}
                />
                <Bar dataKey="meta"   name="Meta Ads"   fill="#534AB7" radius={[2,2,0,0]} maxBarSize={12} />
                <Bar dataKey="google" name="Google Ads" fill="#1D9E75" radius={[2,2,0,0]} maxBarSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-4">
            <Breakdown
              title="ROAS por canal"
              rows={roasBreakdown}
              total={{ label: 'Combinado', value: combinedROAS, display: formatROAS(combinedROAS) }}
            />
          </div>
        </div>

        {/* AI Insights */}
        <AIInsights
          insights={insights}
          updatedAt={`Hoy · ${period}`}
        />
      </div>
    </div>
  )
}
