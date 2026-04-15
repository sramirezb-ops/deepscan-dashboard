'use client'
import { useMemo } from 'react'
import KPICard from '@/components/ui/KPICard'
import Funnel from '@/components/ui/Funnel'
import Breakdown from '@/components/ui/Breakdown'
import Topbar from '@/components/ui/Topbar'
import AIInsights from '@/components/ui/AIInsights'
import { formatCurrency, formatPercent, formatNumber, type Period, type KPI } from '@/lib/utils'

// ════════════════════════════════════════════
// GOOGLE ANALYTICS 4
// ════════════════════════════════════════════
export function GA4View({ data, period, onPeriod, currency = 'COP' }: any) {
  const { ga4 } = data

  const totals = useMemo(() => ({
    sessions:      ga4.reduce((s: number, r: any) => s + Number(r.sessions || 0), 0),
    product_views: ga4.reduce((s: number, r: any) => s + Number(r.product_views || 0), 0),
    add_to_cart:   ga4.reduce((s: number, r: any) => s + Number(r.add_to_cart || 0), 0),
    checkout:      ga4.reduce((s: number, r: any) => s + Number(r.checkout_start || 0), 0),
    purchases:     ga4.reduce((s: number, r: any) => s + Number(r.purchases || 0), 0),
  }), [ga4])

  const convRate = totals.sessions > 0 ? totals.purchases / totals.sessions : 0

  const kpis: KPI[] = [
    { label: 'Tasa de conv.', value: formatPercent(convRate), delta: 14, goal: 'Benchmark: 2.5%', status: convRate >= 0.025 ? 'green' : 'amber' },
    { label: 'Sesiones',      value: formatNumber(totals.sessions), delta: 11, status: 'green' },
    { label: 'Vista producto',value: formatNumber(totals.product_views), delta: 8, status: 'green' },
    { label: 'Compras',       value: formatNumber(totals.purchases), delta: 14, status: 'green' },
  ]

  const funnelSteps = [
    { label: 'Sesiones',         value: totals.sessions,      color: '#E6F1FB' },
    { label: 'Vista de producto',value: totals.product_views, color: '#85B7EB' },
    { label: 'Añadir al carrito',value: totals.add_to_cart,   color: '#378ADD' },
    { label: 'Inicio checkout',  value: totals.checkout,      color: '#185FA5' },
    { label: 'Compra',           value: totals.purchases,     color: '#0C447C' },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Topbar title="Google Analytics 4" period={period} onPeriod={onPeriod} onCompare={() => {}} onExport={() => {}} />
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 bg-gray-50">
        <div className="grid grid-cols-4 gap-3">
          {kpis.map((kpi, i) => <KPICard key={i} kpi={kpi} />)}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <Funnel steps={funnelSteps} title="Funnel GA4 · Sesión → Compra" />
        </div>
        <AIInsights insights={[
          { type: convRate >= 0.025 ? 'good' : 'warning', title: 'Tasa de conversión:', body: `${formatPercent(convRate)} — ${convRate >= 0.025 ? 'por encima del benchmark.' : 'por debajo del benchmark de 2.5%.'}` },
          { type: 'warning', title: 'Funnel:', body: `${totals.checkout > 0 ? formatPercent((totals.purchases / totals.checkout)) : '—'} de los checkouts iniciados completan la compra.` },
        ]} updatedAt={`Período: ${period}`} />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════
// GOOGLE MERCHANT CENTER
// ════════════════════════════════════════════
export function MerchantView({ data, period, onPeriod }: any) {
  const { gmc } = data

  const approved    = gmc.filter((p: any) => p.status === 'APPROVED').length
  const disapproved = gmc.filter((p: any) => p.status === 'DISAPPROVED').length
  const pending     = gmc.filter((p: any) => p.status === 'PENDING').length
  const total       = gmc.length

  const kpis: KPI[] = [
    { label: 'Productos activos',   value: approved.toString(),    delta: 0, status: 'green' },
    { label: 'Con error',           value: disapproved.toString(), delta: 0, status: disapproved > 0 ? 'red' : 'green' },
    { label: 'Pendientes',          value: pending.toString(),     delta: 0, status: pending > 0 ? 'amber' : 'green' },
    { label: 'Cobertura del feed',  value: total > 0 ? formatPercent(approved / total) : '—', delta: 0, goal: 'Objetivo: 95%+', status: approved / total >= 0.95 ? 'green' : 'amber' },
  ]

  const topProducts = gmc
    .filter((p: any) => p.status === 'APPROVED')
    .sort((a: any, b: any) => b.clicks - a.clicks)
    .slice(0, 10)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Topbar title="Google Merchant Center" period={period} onPeriod={onPeriod} onExport={() => {}} />
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 bg-gray-50">
        <div className="grid grid-cols-4 gap-3">
          {kpis.map((kpi, i) => <KPICard key={i} kpi={kpi} />)}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 text-xs font-medium text-gray-700">Top productos · clics</div>
            <table className="w-full text-[11px]">
              <thead><tr className="bg-gray-50"><th className="text-left px-3 py-2 text-gray-400 font-medium">Producto</th><th className="text-right px-3 py-2 text-gray-400 font-medium">Clics</th><th className="text-right px-3 py-2 text-gray-400 font-medium">CTR</th><th className="text-left px-3 py-2 text-gray-400 font-medium">Estado</th></tr></thead>
              <tbody>
                {topProducts.map((p: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800 max-w-[160px] truncate">{p.title}</td>
                    <td className="px-3 py-2 text-right">{p.clicks}</td>
                    <td className="px-3 py-2 text-right">{formatPercent(p.ctr)}</td>
                    <td className="px-3 py-2"><span className="px-2 py-0.5 rounded text-[10px] bg-green-50 text-green-700">OK</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <Breakdown
              title="Estado del feed"
              rows={[
                { label: 'Aprobados',    value: approved,    display: approved.toString(),    color: '#1D9E75' },
                { label: 'Pendientes',   value: pending,     display: pending.toString(),     color: '#EF9F27' },
                { label: 'Con error',    value: disapproved, display: disapproved.toString(), color: '#E24B4A' },
              ]}
            />
            {disapproved > 0 && (
              <div className="mt-3 bg-red-50 border border-red-100 rounded-lg p-3 text-[11px] text-red-700">
                <strong>{disapproved} productos desaprobados</strong> impactan tus impresiones en Shopping.
                Revisa el feed en Merchant Center para corregir errores de imagen, precio o GTIN.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════
// SHOPIFY
// ════════════════════════════════════════════
export function ShopifyView({ data, period, onPeriod, currency = 'MXN' }: any) {
  const { shopify } = data

  const totals = useMemo(() => ({
    revenue:    shopify.reduce((s: number, r: any) => s + Number(r.revenue || 0), 0),
    orders:     shopify.reduce((s: number, r: any) => s + Number(r.orders || 0), 0),
    new_cust:   shopify.reduce((s: number, r: any) => s + Number(r.new_customers || 0), 0),
    ret_cust:   shopify.reduce((s: number, r: any) => s + Number(r.returning_customers || 0), 0),
    units:      shopify.reduce((s: number, r: any) => s + Number(r.units_sold || 0), 0),
  }), [shopify])

  const avgOrder = totals.orders > 0 ? totals.revenue / totals.orders : 0

  const kpis: KPI[] = [
    { label: 'Ingresos totales', value: formatCurrency(totals.revenue, currency), delta: 8,  status: 'green' },
    { label: 'Órdenes',          value: totals.orders.toLocaleString('es'),       delta: 5,  status: 'green' },
    { label: 'Ticket promedio',  value: formatCurrency(avgOrder, currency),       delta: 3,  status: 'green' },
    { label: 'Clientes nuevos',  value: totals.new_cust.toLocaleString('es'),     delta: 12, status: 'green' },
  ]

  const sourceRows = [
    { label: 'Meta Ads',   value: 62, display: '62%', color: '#534AB7' },
    { label: 'Google Ads', value: 24, display: '24%', color: '#1D9E75' },
    { label: 'Orgánico',   value: 10, display: '10%', color: '#378ADD' },
    { label: 'Directo',    value: 4,  display: '4%',  color: '#b4b2a9' },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Topbar title="Shopify / Ventas" period={period} onPeriod={onPeriod} onCompare={() => {}} onExport={() => {}} />
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 bg-gray-50">
        <div className="grid grid-cols-4 gap-3">
          {kpis.map((kpi, i) => <KPICard key={i} kpi={kpi} />)}
        </div>
        <div className="grid grid-cols-5 gap-3">
          <div className="col-span-3 bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs font-medium text-gray-700 mb-3">Ingresos diarios</div>
            <div className="flex flex-col gap-1">
              {shopify.slice(-14).map((r: any, i: number) => {
                const maxRev = Math.max(...shopify.map((s: any) => Number(s.revenue || 0)), 1)
                const pct = (Number(r.revenue || 0) / maxRev) * 100
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div className="text-[10px] text-gray-300 w-16">{r.date?.slice(5)}</div>
                    <div className="flex-1 h-4 bg-gray-50 rounded overflow-hidden">
                      <div className="h-full bg-amber-400 rounded flex items-center pl-2" style={{ width: `${pct}%`, minWidth: pct > 0 ? '8px' : '0' }}>
                        <span className="text-[9px] text-white font-medium">{formatCurrency(Number(r.revenue || 0), currency)}</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-500 w-8 text-right">{r.orders}</div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-4">
            <Breakdown title="Fuente de ventas" rows={sourceRows} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] text-gray-400">Nuevos</div>
                <div className="text-sm font-medium text-gray-800">{totals.new_cust}</div>
                <div className="text-[10px] text-gray-400">{totals.orders > 0 ? formatPercent(totals.new_cust / totals.orders) : '—'}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] text-gray-400">Recurrentes</div>
                <div className="text-sm font-medium text-gray-800">{totals.ret_cust}</div>
                <div className="text-[10px] text-gray-400">{totals.orders > 0 ? formatPercent(totals.ret_cust / totals.orders) : '—'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════
// MICROSOFT CLARITY
// ════════════════════════════════════════════
export function ClarityView({ data, period, onPeriod }: any) {
  const { clarity } = data

  const totals = useMemo(() => ({
    sessions:   clarity.reduce((s: number, r: any) => s + Number(r.sessions || 0), 0),
    dead:       clarity.reduce((s: number, r: any) => s + Number(r.dead_click_rate || 0), 0) / Math.max(clarity.length, 1),
    rage:       clarity.reduce((s: number, r: any) => s + Number(r.rage_click_rate || 0), 0) / Math.max(clarity.length, 1),
    scroll:     clarity.reduce((s: number, r: any) => s + Number(r.scroll_depth || 0), 0) / Math.max(clarity.length, 1),
  }), [clarity])

  const kpis: KPI[] = [
    { label: 'Sesiones grabadas', value: formatNumber(totals.sessions), delta: 12, status: 'green' },
    { label: 'Dead clicks',        value: formatPercent(totals.dead),   delta: 0,  status: totals.dead > 0.1 ? 'red' : 'amber' },
    { label: 'Rage clicks',        value: formatPercent(totals.rage),   delta: 0,  status: totals.rage > 0.05 ? 'red' : 'amber' },
    { label: 'Scroll depth prom.', value: formatPercent(totals.scroll), delta: 7,  status: totals.scroll >= 0.5 ? 'green' : 'amber' },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Topbar title="Microsoft Clarity" period={period} onPeriod={onPeriod} onExport={() => {}} />
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 bg-gray-50">
        <div className="grid grid-cols-4 gap-3">
          {kpis.map((kpi, i) => <KPICard key={i} kpi={kpi} />)}
        </div>

        {clarity.length === 0 ? (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700">
            Sin datos de Clarity. Exporta el CSV desde clarity.microsoft.com y agrésgalo como secret CLARITY_CSV_BASE64 en GitHub.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs font-medium text-gray-700 mb-3">Tendencia diaria</div>
            <div className="flex flex-col gap-1">
              {clarity.slice(-14).map((r: any, i: number) => (
                <div key={i} className="flex items-center gap-3 text-[11px]">
                  <div className="text-gray-300 w-16">{r.date?.slice(5)}</div>
                  <div className="flex-1 flex gap-2">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-pink-400" />
                      <span className="text-gray-500">Rage: {formatPercent(r.rage_click_rate)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className="text-gray-500">Dead: {formatPercent(r.dead_click_rate)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-blue-400" />
                      <span className="text-gray-500">Scroll: {formatPercent(r.scroll_depth)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <AIInsights insights={[
          { type: totals.rage > 0.05 ? 'critical' : 'warning', title: 'Rage clicks:', body: `${formatPercent(totals.rage)} promedio. ${totals.rage > 0.05 ? 'Nivel alto — revisar elementos problemáticos.' : 'Dentro del rango normal.'}` },
          { type: totals.dead > 0.1 ? 'critical' : 'warning',  title: 'Dead clicks:', body: `${formatPercent(totals.dead)} de clics en elementos no interactivos. Usuarios esperan interacción donde no la hay.` },
        ]} updatedAt="Datos desde CSV exportado" />
      </div>
    </div>
  )
}
