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
        gadsRes,
        gadsAdGroupsRes,
        gadsKeywordsRes,
        gadsSearchTermsRes,
        gadsGeoRes,
        gadsAdsRes,
        ga4MetricsRes,
        ga4FunnelRes,
        gmcRes,
        assetGroupsRes,
        productsRes,
        zombiesRes,
        assetsRes,
      ] = await Promise.all([

        // Google Ads — campañas
        supabase.from('gads_campaigns')
          .select('date,campaign_id,campaign_name,campaign_type,status,cost,impressions,clicks,conversions,conv_value,roas,ctr,cpc')
          .eq('client_id', clientId)
          .gte('date', from).lte('date', to)
          .order('date', { ascending: true }),

        // Google Ads — ad groups
        supabase.from('gads_ad_groups')
          .select('date_start,campaign_id,campaign_name,campaign_type,ad_group_id,ad_group_name,status,cost,impressions,clicks,conversions,conv_value,roas,ctr,cpc')
          .eq('client_id', clientId)
          .gte('date_start', from).lte('date_start', to)
          .order('date_start', { ascending: true }),

        // Google Ads — keywords
        supabase.from('gads_keywords')
          .select('date_start,campaign_id,campaign_name,ad_group_id,ad_group_name,keyword_id,keyword_text,match_type,status,cost,impressions,clicks,conversions,conv_value,ctr,cpc,search_impression_share,search_top_impression_share,search_abs_top_impression_share')
          .eq('client_id', clientId)
          .gte('date_start', from).lte('date_start', to)
          .order('cost', { ascending: false })
          .limit(200),

        // Google Ads — search terms
        supabase.from('gads_search_term_details')
          .select('date_start,campaign_id,campaign_name,ad_group_id,ad_group_name,search_term,cost,impressions,clicks,conversions,conv_value,ctr,cpc')
          .eq('client_id', clientId)
          .gte('date_start', from).lte('date_start', to)
          .order('cost', { ascending: false })
          .limit(500),

        // Google Ads — geo
        supabase.from('gads_geo')
          .select('date_start,campaign_id,campaign_name,city,cost,impressions,clicks,conversions,conv_value')
          .eq('client_id', clientId)
          .gte('date_start', from).lte('date_start', to)
          .order('cost', { ascending: false })
          .limit(300),

        // Google Ads — ads individuales
        supabase.from('gads_ads')
          .select('date_start,campaign_id,campaign_name,campaign_type,ad_group_id,ad_group_name,ad_id,ad_name,ad_type,status,cost,impressions,clicks,conversions,conv_value,roas,ctr,cpc')
          .eq('client_id', clientId)
          .gte('date_start', from).lte('date_start', to)
          .order('cost', { ascending: false })
          .limit(200),

        // GA4 — métricas por canal
        supabase.from('ga4_metrics')
          .select('date,source_medium,sessions,active_users,new_users,bounce_rate,avg_session_duration,conversions,revenue,conv_rate')
          .eq('client_id', clientId)
          .gte('date', from).lte('date', to)
          .order('date', { ascending: true }),

        // GA4 — funnel de conversión
        supabase.from('ga4_funnel')
          .select('date,sessions,product_views,add_to_cart,checkout_start,purchases')
          .eq('client_id', clientId)
          .gte('date', from).lte('date', to)
          .order('date', { ascending: true }),

        // Google Merchant Center
        supabase.from('gmc_products')
          .select('product_id,title,status,issues,clicks,impressions,ctr,price,brand')
          .eq('client_id', clientId)
          .order('clicks', { ascending: false })
          .limit(100),

        // PMAX — asset groups
        supabase.from('gads_asset_groups')
          .select('date,campaign_name,asset_group_name,ad_strength,status,impressions,clicks,cost,conversions,conv_value,roas')
          .eq('client_id', clientId)
          .gte('date', from).lte('date', to)
          .order('cost', { ascending: false }),

        // PMAX — productos
        supabase.from('gads_products')
          .select('product_title,product_item_id,cost,conversions,conv_value,impressions,roas,period,campaign_name,custom_label_0,custom_label_1,custom_label_2,custom_label_3,custom_label_4')
          .eq('client_id', clientId)
          .eq('period', '30d')
          .order('cost', { ascending: false })
          .limit(50),

        // Zombies (productos sin impresiones)
        supabase.from('gads_zombies')
          .select('product_item_id,product_title,impressions,clicks')
          .eq('client_id', clientId)
          .order('impressions', { ascending: true })
          .limit(50),

        // Assets PMAX
        supabase.from('gads_assets')
          .select('asset_group_name,campaign_name,asset_type,field_type,performance_label,ad_strength,status,source,asset_text,image_url,youtube_title,youtube_video_id,final_url')
          .eq('client_id', clientId)
          .order('performance_label', { ascending: false }),
      ])

      setData({
        gads:        gadsRes.data        || [],
        adGroups:    gadsAdGroupsRes.data || [],
        keywords:    gadsKeywordsRes.data || [],
        searchTerms: gadsSearchTermsRes.data || [],
        geo:         gadsGeoRes.data      || [],
        ads:         gadsAdsRes.data      || [],
        ga4Metrics:  ga4MetricsRes.data   || [],
        ga4Funnel:   ga4FunnelRes.data    || [],
        gmc:         gmcRes.data          || [],
        assetGroups: assetGroupsRes.data  || [],
        products:    productsRes.data     || [],
        zombies:     zombiesRes.data      || [],
        assets:      assetsRes.data       || [],
        // Placeholders para fuentes pendientes
        meta:        [],
        shopify:     [],
        clarity:     [],
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
      .select('product_item_id,product_title,impressions,clicks')
      .eq('client_id', clientId)
      .order('impressions', { ascending: false })
      .limit(50)
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
      .select('asset_group_name,campaign_name,asset_type,field_type,performance_label,ad_strength,status,source,asset_text,image_url,youtube_title,youtube_video_id,final_url')
      .eq('client_id', clientId)
      .order('performance_label', { ascending: false })
      .then(({ data }) => setAssets(data || []))
  }, [clientId])

  return assets
}

// Hook para keywords con impression share
export function useKeywords(clientId: string, period: Period) {
  const [keywords, setKeywords] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  const { from, to } = getDateRange(days)

  useEffect(() => {
    if (!clientId) return
    setLoading(true)
    supabase.from('gads_keywords')
      .select('*')
      .eq('client_id', clientId)
      .gte('date_start', from).lte('date_start', to)
      .order('cost', { ascending: false })
      .limit(300)
      .then(({ data }) => {
        setKeywords(data || [])
        setLoading(false)
      })
  }, [clientId, period])

  return { keywords, loading }
}

// Hook para geo
export function useGeo(clientId: string, period: Period) {
  const [geo, setGeo]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  const { from, to } = getDateRange(days)

  useEffect(() => {
    if (!clientId) return
    setLoading(true)
    supabase.from('gads_geo')
      .select('date_start,campaign_id,campaign_name,city,cost,impressions,clicks,conversions,conv_value')
      .eq('client_id', clientId)
      .gte('date_start', from).lte('date_start', to)
      .order('cost', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setGeo(data || [])
        setLoading(false)
      })
  }, [clientId, period])

  return { geo, loading }
}
