'use client'
import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import KPICard from '@/components/ui/KPICard'
import Breakdown from '@/components/ui/Breakdown'
import Topbar from '@/components/ui/Topbar'
import AIInsights from '@/components/ui/AIInsights'
import { formatCurrency, formatROAS, formatPercent, formatNumber, type Period, type KPI } from '@/lib/utils'

interface GoogleAdsProps {
  data:     any
  period:   Period
  onPeriod: (p: Period) => void
  currency?: string
}

type MainTab = 'pmax' | 'search' | 'keywords' | 'geo' | 'ads'

const strengthColors: Record<string, string> = {
  EXCELLENT: 'text-green-600 bg-green-50',
  GOOD:      'text-blue-600 bg-blue-50',
  POOR:      'text-red-600 bg-red-50',
  PENDING:   'text-gray-500 bg-gray-100',
}

export default function GoogleAds({ data, period, onPeriod, currency = 'COP' }: GoogleAdsProps) {
  const [tab, setTab] = useState<MainTab>('pmax')
  const { gads, adGroups, keywords, searchTerms, geo, ads, assetGroups, products } = data

  // ── Totales campañas ──────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const t = { cost: 0, conv_value: 0, conv: 0, impressions: 0, clicks: 0 }
    gads.forEach((r: any) => {
      t.cost        += Number(r.cost || 0)
      t.conv_value  += Number(r.conv_value || 0)
      t.conv        += Number(r.conversions || 0)
      t.impressions += Number(r.impressions || 0)
      t.clicks      += Number(r.clicks || 0)
    })
    return t
  }, [gads])

  const roas = totals.cost > 0 ? totals.conv_value / totals.cost : 0
  const ctr  = totals.impressions > 0 ? totals.clicks / totals.impressions : 0

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const kpis: KPI[] = [
    {
      label:  'ROAS',
      value:  formatROAS(roas),
      delta:  6,
      goal:   `Objetivo: 3.5x · ${roas >= 3.5 ? '✓ superado' : 'por debajo'}`,
      status: roas >= 3.5 ? 'green' : roas >= 3.0 ? 'amber' : 'red',
    },
    {
      label:  'Inversión',
      value:  formatCurrency(totals.cost, currency),
      delta:  8,
      status: 'amber',
    },
    {
      label:  'Conversiones',
      value:  totals.conv.toFixed(0),
      delta:  14,
      status: 'green',
    },
    {
      label:  'CTR promedio',
      value:  formatPercent(ctr),
      delta:  2,
      status: ctr >= 0.05 ? 'green' : 'amber',
    },
  ]

  // ── Asset Groups agrupados ───────────────────────────────────────────────
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

  // ── Keywords agrupadas por keyword_text ──────────────────────────────────
  const kwSummary = useMemo(() => {
    const byKw: Record<string, any> = {}
    keywords.forEach((r: any) => {
      const key = `${r.keyword_text}__${r.match_type}`
      if (!byKw[key]) byKw[key] = {
        keyword_text: r.keyword_text,
        match_type: r.match_type,
        campaign_name: r.campaign_name,
        ad_group_name: r.ad_group_name,
        status: r.status,
        cost: 0, conv: 0, conv_value: 0, impressions: 0, clicks: 0,
        search_impression_share: r.search_impression_share || 0,
        search_top_impression_share: r.search_top_impression_share || 0,
      }
      byKw[key].cost        += Number(r.cost || 0)
      byKw[key].conv        += Number(r.conversions || 0)
      byKw[key].conv_value  += Number(r.conv_value || 0)
      byKw[key].impressions += Number(r.impressions || 0)
      byKw[key].clicks      += Number(r.clicks || 0)
    })
    return Object.values(byKw).map((kw: any) => ({
      ...kw,
      roas: kw.cost > 0 ? kw.conv_value / kw.cost : 0,
      ctr:  kw.impressions > 0 ? kw.clicks / kw.impressions : 0,
      cpc:  kw.clicks > 0 ? kw.cost / kw.clicks : 0,
    })).sort((a: any, b: any) => b.cost - a.cost)
  }, [keywords])

  // ── Search terms agrupados ───────────────────────────────────────────────
  const stSummary = useMemo(() => {
    const bySt: Record<string, any> = {}
    searchTerms.forEach((r: any) => {
      const key = `${r.search_term}__${r.campaign_id}`
      if (!bySt[key]) bySt[key] = {
        search_term: r.search_term,
        campaign_name: r.campaign_name,
        ad_group_name: r.ad_group_name,
        cost: 0, conv: 0, conv_value: 0, impressions: 0, clicks: 0,
      }
      bySt[key].cost        += Number(r.cost || 0)
      bySt[key].conv        += Number(r.conversions || 0)
      bySt[key].conv_value  += Number(r.conv_value || 0)
      bySt[key].impressions += Number(r.impressions || 0)
      bySt[key].clicks      += Number(r.clicks || 0)
    })
    return Object.values(bySt).map((st: any) => ({
      ...st,
      roas: st.cost > 0 ? st.conv_value / st.cost : 0,
      ctr:  st.impressions > 0 ? st.clicks / st.impressions : 0,
    })).sort((a: any, b: any) => b.cost - a.cost).slice(0, 100)
  }, [searchTerms])

  // ── Geo agrupado por ciudad ──────────────────────────────────────────────
  const geoSummary = useMemo(() => {
    const byCity: Record<string, any> = {}
    geo.forEach((r: any) => {
      const city = r.city || 'Desconocida'
      if (!byCity[city]) byCity[city] = {
        city, cost: 0, conv: 0, conv_value: 0, impressions: 0, clicks: 0,
      }
      byCity[city].cost        += Number(r.cost || 0)
      byCity[city].conv        += Number(r.conversions || 0)
      byCity[city].conv_value  += Number(r.conv_value || 0)
      byCity[city].impressions += Number(r.impressions || 0)
      byCity[city].clicks      += Number(r.clicks || 0)
    })
    return Object.values(byCity).map((c: any) => ({
      ...c,
      roas: c.cost > 0 ? c.conv_value / c.cost : 0,
      ctr:  c.impressions > 0 ? c.clicks / c.impressions : 0,
    })).sort((a: any, b: any) => b.cost - a.cost).slice(0, 30)
  }, [geo])

  // ── Inversión diaria por campaña (chart) ─────────────────────────────────
  const chartData = useMemo(() => {
    const byDate: Record<string, any> = {}
    gads.forEach((r: any) => {
      const d = r.date
      if (!byDate[d]) byDate[d] = { date: d, cost: 0, conv_value: 0 }
      byDate[d].cost       += Number(r.cost || 0)
      byDate[d].conv_value += Number(r.conv_value || 0)
    })
    return Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date))
  }, [gads])

  // ── Insights ─────────────────────────────────────────────────────────────
  const poorAGs = agSummary.filter((ag: any) => ag.ad_strength === 'POOR').length
  const topKw   = kwSummary[0]
  const insights = [
    {
      type: roas >= 3.5 ? 'good' as const : 'critical' as const,
      title: 'ROAS:',
      body:  `${formatROAS(roas)} — ${roas >= 3.5 ? 'por encima del objetivo 3.5x.' : 'por debajo del objetivo de 3.5x. Revisar distribución de presupuesto.'}`,
    },
    ...(poorAGs > 0 ? [{
      type: 'warning' as const,
      title: 'Asset Groups:',
      body:  `${poorAGs} asset group${poorAGs > 1 ? 's' : ''} con calidad POOR. Mejorar creativos para aumentar impresiones.`,
    }] : []),
    ...(topKw ? [{
      type: 'good' as const,
      title: 'Top keyword:',
      body:  `"${topKw.keyword_text}" genera ${formatCurrency(topKw.conv_value, currency)} con ROAS ${formatROAS(topKw.roas)}.`,
    }] : []),
  ]

  const tabs = [
    { id: 'pmax' as MainTab,     label: 'PMAX' },
    { id: 'search' as MainTab,   label: 'Search Terms' },
    { id: 'keywords' as MainTab, label: `Keywords (${kwSummary.length})` },
    { id: 'geo' as MainTab,      label: 'Geo' },
    { id: 'ads' as MainTab,      label: 'Anuncios' },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Topbar title="Google Ads" period={period} onPeriod={onPeriod} onCompare={() => {}} onExport={() => {}} />

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 bg-gray-50">

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          {kpis.map((kpi, i) => <KPICard key={i} kpi={kpi} />)}
        </div>

        {/* Gráfica inversión diaria */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-xs font-medium text-gray-700 mb-3">Inversión diaria</div>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={chartData} barGap={2}>
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#b4b2a9' }}
                tickFormatter={(d) => d.slice(8)} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                formatter={(v: any) => formatCurrency(Number(v), currency)}
                contentStyle={{ fontSize: 11, borderRadius: 6 }}
              />
              <Bar dataKey="cost" name="Inversión" fill="#1D9E75" radius={[2,2,0,0]} maxBarSize={10} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex border-b border-gray-100 px-4">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-xs border-b-2 transition-colors ${
                  tab === t.id
                    ? 'border-green-500 text-green-700 font-medium'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── PMAX ── */}
          {tab === 'pmax' && (
            <div className="p-4 flex flex-col gap-3">
              <div className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                PMAX no expone desglose por emplazamiento. Datos disponibles: Asset Groups y Productos por SKU.
              </div>

              {/* Asset Groups */}
              <div className="text-xs font-medium text-gray-700 mt-1">Asset Groups</div>
              {agSummary.length === 0 ? (
                <div className="text-xs text-gray-400 py-4 text-center">Sin datos en este período</div>
              ) : agSummary.map((ag: any, i: number) => (
                <div key={i} className="border border-gray-100 rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ag.status === 'ENABLED' ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div className="text-xs font-medium text-gray-800 flex-1 truncate">{ag.asset_group_name}</div>
                    <div className="text-[10px] text-gray-400 hidden sm:block">{ag.campaign_name}</div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${strengthColors[ag.ad_strength] || 'text-gray-400 bg-gray-100'}`}>
                      {ag.ad_strength || 'PENDING'}
                    </span>
                    <div className={`text-sm font-semibold ${ag.roas >= 3.5 ? 'text-green-600' : ag.roas >= 2 ? 'text-amber-600' : 'text-gray-400'}`}>
                      {formatROAS(ag.roas)}
                    </div>
                  </div>
                  <div className="px-4 py-2.5 grid grid-cols-4 gap-4">
                    <div>
                      <div className="text-[10px] text-gray-400">Inversión</div>
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
                      <div className="text-[10px] text-gray-400">CTR</div>
                      <div className="text-xs font-medium">{formatPercent(ag.ctr)}</div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Top Productos */}
              {products.length > 0 && (
                <>
                  <div className="text-xs font-medium text-gray-700 mt-2">Top Productos por SKU</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-3 py-2 text-gray-400 font-medium">Producto</th>
                          <th className="text-right px-3 py-2 text-green-600 font-medium">Inversión ▼</th>
                          <th className="text-right px-3 py-2 text-gray-400 font-medium">Conv.</th>
                          <th className="text-right px-3 py-2 text-gray-400 font-medium">ROAS</th>
                          <th className="text-left px-3 py-2 text-gray-400 font-medium">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.slice(0, 20).map((p: any, i: number) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <div className="font-medium text-gray-800 max-w-[200px] truncate">{p.product_title}</div>
                              <div className="text-[10px] text-gray-400 font-mono">{p.product_item_id}</div>
                            </td>
                            <td className="px-3 py-2 text-right font-medium">{formatCurrency(p.cost, currency)}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{Number(p.conversions).toFixed(0)}</td>
                            <td className={`px-3 py-2 text-right font-medium ${
                              p.roas >= 3.5 ? 'text-green-600' : p.roas >= 2 ? 'text-amber-600' : 'text-gray-300'
                            }`}>{p.roas > 0 ? formatROAS(p.roas) : '—'}</td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                p.conversions === 0 ? 'bg-red-50 text-red-600'
                                : p.roas >= 3.5 ? 'bg-green-50 text-green-700'
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
                </>
              )}
            </div>
          )}

          {/* ── SEARCH TERMS ── */}
          {tab === 'search' && (
            <div className="overflow-x-auto">
              {stSummary.length === 0 ? (
                <div className="text-xs text-gray-400 py-8 text-center">Sin search terms en este período</div>
              ) : (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-3 py-2 text-gray-400 font-medium">Término</th>
                      <th className="text-left px-3 py-2 text-gray-400 font-medium">Campaña</th>
                      <th className="text-right px-3 py-2 text-green-600 font-medium">Inversión ▼</th>
                      <th className="text-right px-3 py-2 text-gray-400 font-medium">Clicks</th>
                      <th className="text-right px-3 py-2 text-gray-400 font-medium">Conv.</th>
                      <th className="text-right px-3 py-2 text-gray-400 font-medium">ROAS</th>
                      <th className="text-right px-3 py-2 text-gray-400 font-medium">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stSummary.map((st: any, i: number) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-800 max-w-[220px]">{st.search_term}</div>
                          {st.ad_group_name && <div className="text-[10px] text-gray-400">{st.ad_group_name}</div>}
                        </td>
                        <td className="px-3 py-2 text-gray-500 max-w-[140px] truncate">{st.campaign_name}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatCurrency(st.cost, currency)}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{formatNumber(st.clicks)}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{st.conv.toFixed(1)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${
                          st.roas >= 3.5 ? 'text-green-600' : st.roas >= 2 ? 'text-amber-600' : 'text-gray-300'
                        }`}>{st.roas > 0 ? formatROAS(st.roas) : '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{formatPercent(st.ctr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── KEYWORDS ── */}
          {tab === 'keywords' && (
            <div className="overflow-x-auto">
              {kwSummary.length === 0 ? (
                <div className="text-xs text-gray-400 py-8 text-center">Sin keywords activas en este período</div>
              ) : (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-3 py-2 text-gray-400 font-medium">Keyword</th>
                      <th className="text-left px-3 py-2 text-gray-400 font-medium">Tipo</th>
                      <th className="text-right px-3 py-2 text-green-600 font-medium">Inversión ▼</th>
                      <th className="text-right px-3 py-2 text-gray-400 font-medium">Conv.</th>
                      <th className="text-right px-3 py-2 text-gray-400 font-medium">ROAS</th>
                      <th className="text-right px-3 py-2 text-gray-400 font-medium">IS%</th>
                      <th className="text-right px-3 py-2 text-gray-400 font-medium">Top%</th>
                      <th className="text-right px-3 py-2 text-gray-400 font-medium">CPC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kwSummary.map((kw: any, i: number) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-800 max-w-[200px]">{kw.keyword_text}</div>
                          <div className="text-[10px] text-gray-400">{kw.ad_group_name}</div>
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                            {kw.match_type === 'EXACT' ? 'Exacta' : kw.match_type === 'PHRASE' ? 'Frase' : 'Amplia'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{formatCurrency(kw.cost, currency)}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{kw.conv.toFixed(1)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${
                          kw.roas >= 3.5 ? 'text-green-600' : kw.roas >= 2 ? 'text-amber-600' : 'text-gray-300'
                        }`}>{kw.roas > 0 ? formatROAS(kw.roas) : '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-500">
                          {kw.search_impression_share > 0 ? formatPercent(kw.search_impression_share) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500">
                          {kw.search_top_impression_share > 0 ? formatPercent(kw.search_top_impression_share) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500">{formatCurrency(kw.cpc, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── GEO ── */}
          {tab === 'geo' && (
            <div className="p-4">
              {geoSummary.length === 0 ? (
                <div className="text-xs text-gray-400 py-8 text-center">Sin datos de geo en este período</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {geoSummary.map((c: any, i: number) => {
                    const maxCost = geoSummary[0].cost
                    const pct = maxCost > 0 ? c.cost / maxCost : 0
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-5 text-[10px] text-gray-400 text-right">{i + 1}</div>
                        <div className="w-32 text-xs font-medium text-gray-700 truncate">{c.city}</div>
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct * 100}%` }} />
                        </div>
                        <div className="w-24 text-right text-xs font-medium">{formatCurrency(c.cost, currency)}</div>
                        <div className="w-16 text-right text-xs text-gray-400">{c.conv.toFixed(0)} conv.</div>
                        <div className={`w-16 text-right text-xs font-medium ${c.roas >= 3.5 ? 'text-green-600' : c.roas >= 2 ? 'text-amber-600' : 'text-gray-400'}`}>
                          {c.roas > 0 ? formatROAS(c.roas) : '—'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── ADS ── */}
          {tab === 'ads' && (
            <div className="overflow-x-auto">
              {ads.length === 0 ? (
                <div className="text-xs text-gray-400 py-8 text-center">Sin anuncios en este período</div>
              ) : (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-3 py-2 text-gray-400 font-medium">Anuncio</th>
                      <th className="text-left px-3 py-2 text-gray-400 font-medium">Tipo</th>
                      <th className="text-left px-3 py-2 text-gray-400 font-medium">Estado</th>
                      <th className="text-right px-3 py-2 text-green-600 font-medium">Inversión ▼</th>
                      <th className="text-right px-3 py-2 text-gray-400 font-medium">Impr.</th>
                      <th className="text-right px-3 py-2 text-gray-400 font-medium">Conv.</th>
                      <th className="text-right px-3 py-2 text-gray-400 font-medium">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ads.slice(0, 50).map((ad: any, i: number) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-800 max-w-[180px] truncate">{ad.ad_name || `Ad ${ad.ad_id}`}</div>
                          <div className="text-[10px] text-gray-400">{ad.ad_group_name}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-500">{ad.ad_type?.replace('_AD', '').replace('_', ' ')}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${ad.status === 'ENABLED' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {ad.status === 'ENABLED' ? 'Activo' : 'Pausado'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{formatCurrency(ad.cost, currency)}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{formatNumber(ad.impressions)}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{Number(ad.conversions).toFixed(1)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${
                          ad.roas >= 3.5 ? 'text-green-600' : ad.roas >= 2 ? 'text-amber-600' : 'text-gray-300'
                        }`}>{ad.roas > 0 ? formatROAS(ad.roas) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <AIInsights insights={insights} updatedAt={`Período: ${period}`} />
      </div>
    </div>
  )
}
