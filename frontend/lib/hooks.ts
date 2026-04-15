'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getDateRange, type Period } from '@/lib/utils'

export function useDashboardData(clientId: string, period: Period) {
  const [data, setData]       = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!clientId) return
    fetchAll()
  }, [clientId, period])

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  const { from, to } = getDateRange(days)

  async function fetchAll() {
    setLoading(true)
    setError(null)
    try {
      const [
        metaRes, gadsRes, ga4Res, shopifyRes,
        agRes, prodRes, searchRes, clarityRes, gmcRes
      ] = await Promise.all([
        // Meta Ads
        supabase.from('meta_campaigns')
          .select('date,spend,impressions,clicks,purchases,purchase_value,roas,add_to_cart,initiate_checkout,view_content,cpa,ad_name,campaign_name,status,thumb_url')
          .eq('client_id', clientId)
          .gte('date', from).lte('date', to)
          .order('date', { ascending: true }),

        // Google Ads campañas
        supabase.from('gads_campaigns')
          .select('date,campaign_name,cost,conversions,conv_value,impressions,clicks,roas')
          .eq('client_id', clientId)
          .gte('date', from).lte('date', to)
          .order('date', { ascending: true }),

        // GA4
        supabase.from('ga4_funnel')
          .select('date,sessions,product_views,add_to_cart,checkout_start,purchases')
          .eq('client_id', clientId)
          .gte('date', from).lte('date', to)
          .order('date', { ascending: true }),

        // Shopify órdenes
        supabase.from('shopify_orders')
          .select('date,orders,revenue,avg_order_value,new_customers,returning_customers,units_sold')
          .eq('client_id', clientId)
          .gte('date', from).lte('date', to)
          .order('date', { ascending: true }),

        // Asset Groups PMAX
        supabase.from('gads_asset_groups')
          .select('date,campaign_name,asset_group_name,ad_strength,status,impressions,clicks,cost,conversions,conv_value,roas')
          .eq('client_id', clientId)
          .gte('date', from).lte('date', to),

        // Productos PMAX
        supabase.from('gads_products')
          .select('product_title,product_item_id,cost,conversions,conv_value,impressions,roas,period')
          .eq('client_id', clientId)
          .eq('period', '30d')
          .order('cost', { ascending: false })
          .limit(20),

        // Search terms branded vs non-branded
        supabase.from('gads_search_terms')
          .select('*')
          .eq('client_id', clientId)
          .order('period_start', { ascending: false })
          .limit(6),

        // Clarity
        supabase.from('clarity_metrics')
          .select('date,sessions,scroll_depth,dead_click_rate,rage_click_rate')
          .eq('client_id', clientId)
          .gte('date', from).lte('date', to)
          .order('date', { ascending: true }),

        // GMC productos
        supabase.from('gmc_products')
          .select('product_id,title,status,issues,clicks,impressions,ctr')
          .eq('client_id', clientId)
          .order('clicks', { ascending: false })
          .limit(50),
      ])

      setData({
        meta:       metaRes.data    || [],
        gads:       gadsRes.data    || [],
        ga4:        ga4Res.data     || [],
        shopify:    shopifyRes.data || [],
        assetGroups:agRes.data      || [],
        products:   prodRes.data    || [],
        searchTerms:searchRes.data  || [],
        clarity:    clarityRes.data || [],
        gmc:        gmcRes.data     || [],
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return { data, loading, error, refetch: fetchAll }
}

// Hook específico para zombies
export function useZombies(clientId: string) {
  const [zombies, setZombies] = useState<any[]>([])

  useEffect(() => {
    if (!clientId) return
    supabase.from('gads_zombies')
      .select('product_item_id,product_title,impressions')
      .eq('client_id', clientId)
      .order('impressions', { ascending: false })
      .limit(20)
      .then(({ data }) => setZombies(data || []))
  }, [clientId])

  return zombies
}

// Hook para assets PMAX
export function useAssets(clientId: string) {
  const [assets, setAssets] = useState<any[]>([])

  useEffect(() => {
    if (!clientId) return
    supabase.from('gads_assets')
      .select('asset_group_name,asset_type,field_type,performance_label,ad_strength,source,asset_text,image_url,youtube_title')
      .eq('client_id', clientId)
      .order('performance_label', { ascending: false })
      .then(({ data }) => setAssets(data || []))
  }, [clientId])

  return assets
}
