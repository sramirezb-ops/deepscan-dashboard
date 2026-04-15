'use client'
import { useState } from 'react'
import Sidebar from '@/components/ui/Sidebar'
import Overview from '@/components/dashboard/Overview'
import MetaAds from '@/components/dashboard/MetaAds'
import GoogleAds from '@/components/dashboard/GoogleAds'
import { GA4View, MerchantView, ShopifyView, ClarityView } from '@/components/dashboard/OtherViews'
import { useDashboardData } from '@/lib/hooks'
import type { Period } from '@/lib/utils'

const CLIENT_ID = process.env.NEXT_PUBLIC_CLIENT_ID || ''
const CLIENT_NAME = process.env.NEXT_PUBLIC_CLIENT_NAME || 'Cliente'
const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || 'COP'

export default function DashboardPage() {
  const [page, setPage]     = useState('overview')
  const [period, setPeriod] = useState<Period>('30d')
  const { data, loading, error } = useDashboardData(CLIENT_ID, period)

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm text-gray-400">Cargando datos...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="bg-red-50 border border-red-100 rounded-xl p-6 max-w-md text-center">
          <div className="text-sm font-medium text-red-700 mb-1">Error al cargar datos</div>
          <div className="text-xs text-red-500">{error}</div>
        </div>
      </div>
    )
  }

  if (!data) return null

  const alerts = {
    merchant: data.gmc.filter((p: any) => p.status === 'DISAPPROVED').length,
    clarity:  data.clarity.some((c: any) => c.rage_click_rate > 0.05) ? 1 : 0,
  }

  const pageProps = { data, period, onPeriod: setPeriod, currency: CURRENCY }

  return (
    <div className="flex h-screen overflow-hidden font-sans">
      <Sidebar
        active={page}
        onChange={setPage}
        client={CLIENT_NAME}
        alerts={alerts}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {page === 'overview' && <Overview  {...pageProps} />}
        {page === 'meta'     && <MetaAds   {...pageProps} />}
        {page === 'google'   && <GoogleAds {...pageProps} />}
        {page === 'ga4'      && <GA4View   {...pageProps} />}
        {page === 'merchant' && <MerchantView {...pageProps} />}
        {page === 'shopify'  && <ShopifyView  {...pageProps} />}
        {page === 'clarity'  && <ClarityView  {...pageProps} />}
      </div>
    </div>
  )
}
