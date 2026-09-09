'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calcDelta } from '@/lib/utils';
import type { DateRange } from '@/lib/period';

// ============================================================
// useMetaCompras — campañas de COMPRAS de Meta (campaña + anuncio)
// ============================================================
// Lee meta_campaigns (nivel anuncio/día) y arma DOS tablas reales:
//   1. Por campaña — ROAS, vistas de producto, carritos, compras, costo/compra.
//   2. Por anuncio — el mismo detalle a nivel creativo (con miniatura cuando el
//      ETL la entregue; hoy thumb_url llega vacío).
//
// Para SEPARAR de verdad las campañas de mensajes (WhatsApp/Messenger/IG Direct)
// no adivinamos por el nombre: usamos una señal real → el set de campañas que
// aparecen en meta_messaging en el mismo rango. Esas se excluyen de Compras.
//
// Dentro de lo que queda, una campaña es de "compras" si tiene intención de
// compra real del píxel (compras, carritos, vistas de producto o checkout > 0).
// Las demás (alcance / visitas a perfil) se cuentan aparte y se reportan en la
// nota, sin contaminar la tabla de Compras.
// ============================================================

export interface ComprasCampaignRow {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number; // clicks / impresiones (fracción 0-1)
  reach: number;
  viewContent: number; // vistas de producto
  addToCart: number; // carritos
  initiateCheckout: number;
  purchases: number;
  purchaseValue: number; // revenue
  roas: number; // revenue / spend
  cpa: number; // spend / purchases (costo por compra)
}

export interface ComprasAdRow {
  adId: string;
  adName: string;
  campaignName: string;
  adsetName: string;
  thumbUrl: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  viewContent: number;
  addToCart: number;
  purchases: number;
  purchaseValue: number;
  roas: number;
  cpa: number;
}

export interface ComprasTotals {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  reach: number;
  viewContent: number;
  addToCart: number;
  initiateCheckout: number;
  purchases: number;
  purchaseValue: number;
  roas: number;
  cpa: number;
  aov: number; // ticket promedio = revenue / compras
}

export interface ComprasFunnel {
  viewContent: number;
  addToCart: number;
  initiateCheckout: number;
  purchases: number;
}

export interface ComprasDailyRow {
  date: string; // YYYY-MM-DD
  spend: number;
  addToCart: number;
  viewContent: number;
  purchases: number;
  purchaseValue: number;
  roas: number; // revenue / spend del día
  cpa: number; // spend / purchases del día
}

export interface MetaComprasData {
  campaigns: ComprasCampaignRow[]; // ordenadas por inversión desc
  ads: ComprasAdRow[]; // ordenados por inversión desc
  daily: ComprasDailyRow[]; // serie diaria (asc) de las campañas de compra
  totals: ComprasTotals;
  funnel: ComprasFunnel;
  campaignCount: number;
  adCount: number;
  withThumb: number; // cuántos anuncios traen miniatura
  // Transparencia sobre la clasificación
  messagingCampaignCount: number; // campañas de mensajes excluidas (van en WhatsApp)
  otherCampaignCount: number; // alcance / visitas a perfil (sin intención de compra)
  otherSpend: number; // inversión de esas campañas (no aparece en los totales)
  metaExistsEver: boolean;
  // ── Explorador jerárquico + contexto de los 3 objetivos de Meta ──
  hierarchy: ComprasHierNode[];   // campaña → conjunto → anuncio (solo compras)
  whatsappSpend: number;          // gasto de las campañas de mensajería
  waConversations: number;        // conversaciones (píxel) de esas campañas
  spendSplit: { sales: number; whatsapp: number; brand: number };
  monthlyRoas: { month: string; roas: number }[];
  // Deltas vs período anterior (mismo criterio de "compras")
  spendDelta: number;
  revenueDelta: number;
  roasDelta: number; // absoluto
  purchasesDelta: number;
  from: string;
  to: string;
}

export interface UseMetaComprasResult {
  data: MetaComprasData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RawRow {
  date: string | null;
  ad_id: string | null;
  ad_name: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  thumb_url: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
  purchases: number | null;
  purchase_value: number | null;
  add_to_cart: number | null;
  initiate_checkout: number | null;
  view_content: number | null;
  conversations: number | null;
}

const SELECT =
  'date, ad_id, ad_name, campaign_name, adset_name, thumb_url, spend, impressions, clicks, reach, purchases, purchase_value, add_to_cart, initiate_checkout, view_content, conversations';

const PAGE = 1000;
const AD_LIMIT = 60; // top anuncios por inversión

/** Trae TODAS las filas del rango paginando (Meta nivel anuncio/día supera 1000 en 30 días). */
async function fetchRows(clientId: string, from: string, to: string): Promise<RawRow[]> {
  const all: RawRow[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('meta_campaigns')
      .select(SELECT)
      .eq('client_id', clientId)
      .gte('date', from)
      .lte('date', to)
      .range(offset, offset + PAGE - 1);

    if (error) throw error;
    const batch = (data || []) as RawRow[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

/** Set de nombres de campaña que son de mensajes (señal real desde meta_messaging). */
async function fetchMessagingCampaigns(
  clientId: string,
  from: string,
  to: string
): Promise<Set<string>> {
  const set = new Set<string>();
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('meta_messaging')
      .select('campaign_name')
      .eq('client_id', clientId)
      .gte('date', from)
      .lte('date', to)
      .range(offset, offset + PAGE - 1);

    if (error) throw error;
    const batch = (data || []) as { campaign_name: string | null }[];
    for (const r of batch) if (r.campaign_name) set.add(r.campaign_name);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return set;
}

/** ¿El cliente tiene ALGUNA fila de Meta, en cualquier fecha? */
async function fetchMetaExists(clientId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('meta_campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId);

  if (error) throw error;
  return (count || 0) > 0;
}

interface CampAgg {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  viewContent: number;
  addToCart: number;
  initiateCheckout: number;
  purchases: number;
  purchaseValue: number;
}

/** Una campaña es de COMPRAS si tiene intención de compra real del píxel. */
function hasPurchaseIntent(c: CampAgg): boolean {
  return c.purchases > 0 || c.addToCart > 0 || c.viewContent > 0 || c.initiateCheckout > 0;
}

/** Agrupa filas (anuncio/día) por campaña, excluyendo las de mensajes. */
function aggregateCampaigns(rows: RawRow[], messaging: Set<string>): CampAgg[] {
  const map = new Map<string, CampAgg>();
  for (const r of rows) {
    const name = r.campaign_name || '(sin nombre)';
    if (messaging.has(name)) continue; // las de mensajes van en WhatsApp
    let c = map.get(name);
    if (!c) {
      c = {
        name,
        spend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0,
        viewContent: 0,
        addToCart: 0,
        initiateCheckout: 0,
        purchases: 0,
        purchaseValue: 0,
      };
      map.set(name, c);
    }
    c.spend += Number(r.spend) || 0;
    c.impressions += Number(r.impressions) || 0;
    c.clicks += Number(r.clicks) || 0;
    c.reach += Number(r.reach) || 0;
    c.viewContent += Number(r.view_content) || 0;
    c.addToCart += Number(r.add_to_cart) || 0;
    c.initiateCheckout += Number(r.initiate_checkout) || 0;
    c.purchases += Number(r.purchases) || 0;
    c.purchaseValue += Number(r.purchase_value) || 0;
  }
  return Array.from(map.values());
}

function finalizeCampaign(c: CampAgg): ComprasCampaignRow {
  return {
    name: c.name,
    spend: c.spend,
    impressions: c.impressions,
    clicks: c.clicks,
    ctr: c.impressions > 0 ? c.clicks / c.impressions : 0,
    reach: c.reach,
    viewContent: c.viewContent,
    addToCart: c.addToCart,
    initiateCheckout: c.initiateCheckout,
    purchases: c.purchases,
    purchaseValue: c.purchaseValue,
    roas: c.spend > 0 ? c.purchaseValue / c.spend : 0,
    cpa: c.purchases > 0 ? c.spend / c.purchases : 0,
  };
}

/** Agrupa por anuncio (ad_id) las filas de las campañas de compras dadas. */
function aggregateAds(rows: RawRow[], purchaseCampaignNames: Set<string>): ComprasAdRow[] {
  const map = new Map<
    string,
    {
      adId: string;
      adName: string;
      campaignName: string;
      adsetName: string;
      thumbUrl: string | null;
      spend: number;
      impressions: number;
      clicks: number;
      viewContent: number;
      addToCart: number;
      purchases: number;
      purchaseValue: number;
    }
  >();

  for (const r of rows) {
    const camp = r.campaign_name || '(sin nombre)';
    if (!purchaseCampaignNames.has(camp)) continue;
    const adId = r.ad_id || `(sin id) ${r.ad_name || ''}`;
    let a = map.get(adId);
    if (!a) {
      a = {
        adId,
        adName: r.ad_name || '(sin nombre)',
        campaignName: camp,
        adsetName: r.adset_name || '(sin conjunto)',
        thumbUrl: r.thumb_url || null,
        spend: 0,
        impressions: 0,
        clicks: 0,
        viewContent: 0,
        addToCart: 0,
        purchases: 0,
        purchaseValue: 0,
      };
      map.set(adId, a);
    }
    if ((a.thumbUrl === null || a.thumbUrl === '') && r.thumb_url) a.thumbUrl = r.thumb_url;
    if (a.adName === '(sin nombre)' && r.ad_name) a.adName = r.ad_name;
    a.spend += Number(r.spend) || 0;
    a.impressions += Number(r.impressions) || 0;
    a.clicks += Number(r.clicks) || 0;
    a.viewContent += Number(r.view_content) || 0;
    a.addToCart += Number(r.add_to_cart) || 0;
    a.purchases += Number(r.purchases) || 0;
    a.purchaseValue += Number(r.purchase_value) || 0;
  }

  const list: ComprasAdRow[] = Array.from(map.values()).map((a) => ({
    adId: a.adId,
    adName: a.adName,
    campaignName: a.campaignName,
    adsetName: a.adsetName,
    thumbUrl: a.thumbUrl === '' ? null : a.thumbUrl,
    spend: a.spend,
    impressions: a.impressions,
    clicks: a.clicks,
    ctr: a.impressions > 0 ? a.clicks / a.impressions : 0,
    viewContent: a.viewContent,
    addToCart: a.addToCart,
    purchases: a.purchases,
    purchaseValue: a.purchaseValue,
    roas: a.spend > 0 ? a.purchaseValue / a.spend : 0,
    cpa: a.purchases > 0 ? a.spend / a.purchases : 0,
  }));

  list.sort((a, b) => b.spend - a.spend);
  return list;
}

/** Serie diaria de las campañas de compra (una fila por fecha). */
function buildDaily(rows: RawRow[], purchaseCampaignNames: Set<string>): ComprasDailyRow[] {
  const map = new Map<
    string,
    { spend: number; addToCart: number; viewContent: number; purchases: number; purchaseValue: number }
  >();

  for (const r of rows) {
    const camp = r.campaign_name || '(sin nombre)';
    if (!purchaseCampaignNames.has(camp)) continue;
    const d = r.date;
    if (!d) continue;
    let agg = map.get(d);
    if (!agg) {
      agg = { spend: 0, addToCart: 0, viewContent: 0, purchases: 0, purchaseValue: 0 };
      map.set(d, agg);
    }
    agg.spend += Number(r.spend) || 0;
    agg.addToCart += Number(r.add_to_cart) || 0;
    agg.viewContent += Number(r.view_content) || 0;
    agg.purchases += Number(r.purchases) || 0;
    agg.purchaseValue += Number(r.purchase_value) || 0;
  }

  return Array.from(map.entries())
    .map(([date, a]) => ({
      date,
      spend: a.spend,
      addToCart: a.addToCart,
      viewContent: a.viewContent,
      purchases: a.purchases,
      purchaseValue: a.purchaseValue,
      roas: a.spend > 0 ? a.purchaseValue / a.spend : 0,
      cpa: a.purchases > 0 ? a.spend / a.purchases : 0,
    }))
    .sort((x, y) => x.date.localeCompare(y.date));
}

/** Totales sobre las campañas de compras ya agregadas. */
function totalsFrom(campaigns: ComprasCampaignRow[]): ComprasTotals {
  const t = campaigns.reduce(
    (acc, c) => {
      acc.spend += c.spend;
      acc.impressions += c.impressions;
      acc.clicks += c.clicks;
      acc.reach += c.reach;
      acc.viewContent += c.viewContent;
      acc.addToCart += c.addToCart;
      acc.initiateCheckout += c.initiateCheckout;
      acc.purchases += c.purchases;
      acc.purchaseValue += c.purchaseValue;
      return acc;
    },
    {
      spend: 0,
      impressions: 0,
      clicks: 0,
      reach: 0,
      viewContent: 0,
      addToCart: 0,
      initiateCheckout: 0,
      purchases: 0,
      purchaseValue: 0,
    }
  );
  return {
    ...t,
    ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
    roas: t.spend > 0 ? t.purchaseValue / t.spend : 0,
    cpa: t.purchases > 0 ? t.spend / t.purchases : 0,
    aov: t.purchases > 0 ? t.purchaseValue / t.purchases : 0,
  };
}

// ── Jerarquía campaña → conjunto → anuncio, con TODAS las métricas ──────────
export interface ComprasMetric {
  spend: number; impressions: number; clicks: number; reach: number;
  viewContent: number; addToCart: number; initiateCheckout: number;
  purchases: number; purchaseValue: number;
}
export interface ComprasHierNode {
  name: string;
  adId?: string;             // solo anuncios
  thumbUrl?: string | null;  // solo anuncios
  m: ComprasMetric;
  kids?: ComprasHierNode[];  // campañas y conjuntos
}

const zeroM = (): ComprasMetric => ({
  spend: 0, impressions: 0, clicks: 0, reach: 0,
  viewContent: 0, addToCart: 0, initiateCheckout: 0, purchases: 0, purchaseValue: 0,
});
function addM(t: ComprasMetric, r: RawRow) {
  t.spend += Number(r.spend) || 0;
  t.impressions += Number(r.impressions) || 0;
  t.clicks += Number(r.clicks) || 0;
  t.reach += Number(r.reach) || 0;
  t.viewContent += Number(r.view_content) || 0;
  t.addToCart += Number(r.add_to_cart) || 0;
  t.initiateCheckout += Number(r.initiate_checkout) || 0;
  t.purchases += Number(r.purchases) || 0;
  t.purchaseValue += Number(r.purchase_value) || 0;
}

/** Árbol campaña→conjunto→anuncio para las campañas de compra dadas. */
function buildHierarchy(rows: RawRow[], salesNames: Set<string>): ComprasHierNode[] {
  const camps = new Map<
    string,
    { m: ComprasMetric; sets: Map<string, { m: ComprasMetric; ads: Map<string, ComprasHierNode> }> }
  >();
  for (const r of rows) {
    const cn = r.campaign_name || '(sin nombre)';
    if (!salesNames.has(cn)) continue;
    let c = camps.get(cn);
    if (!c) { c = { m: zeroM(), sets: new Map() }; camps.set(cn, c); }
    addM(c.m, r);
    const an = r.adset_name || '(sin conjunto)';
    let s = c.sets.get(an);
    if (!s) { s = { m: zeroM(), ads: new Map() }; c.sets.set(an, s); }
    addM(s.m, r);
    const adId = r.ad_id || `(sin id) ${r.ad_name || ''}`;
    let a = s.ads.get(adId);
    if (!a) { a = { name: r.ad_name || '(sin nombre)', adId, thumbUrl: r.thumb_url || null, m: zeroM() }; s.ads.set(adId, a); }
    if (!a.thumbUrl && r.thumb_url) a.thumbUrl = r.thumb_url;
    if (a.name === '(sin nombre)' && r.ad_name) a.name = r.ad_name;
    addM(a.m, r);
  }
  const bySpend = (x: { m: ComprasMetric }, y: { m: ComprasMetric }) => y.m.spend - x.m.spend;
  return Array.from(camps.entries())
    .map(([name, c]) => ({
      name, m: c.m,
      kids: Array.from(c.sets.entries())
        .map(([sn, s]) => ({ name: sn, m: s.m, kids: Array.from(s.ads.values()).sort(bySpend) }))
        .sort(bySpend),
    }))
    .sort(bySpend);
}

/** ROAS por mes de las campañas de compra. */
function monthlyRoasFrom(rows: RawRow[], salesNames: Set<string>): { month: string; roas: number }[] {
  const m = new Map<string, { s: number; v: number }>();
  for (const r of rows) {
    if (!salesNames.has(r.campaign_name || '')) continue;
    const mo = (r.date || '').slice(0, 7);
    if (!mo) continue;
    let a = m.get(mo);
    if (!a) { a = { s: 0, v: 0 }; m.set(mo, a); }
    a.s += Number(r.spend) || 0;
    a.v += Number(r.purchase_value) || 0;
  }
  return Array.from(m.entries())
    .map(([month, a]) => ({ month, roas: a.s > 0 ? a.v / a.s : 0 }))
    .sort((x, y) => x.month.localeCompare(y.month));
}

export function useMetaCompras(
  clientId: string,
  range: DateRange,
  previous: DateRange
): UseMetaComprasResult {
  const [data, setData] = useState<MetaComprasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [nowRows, prevRows, msgNow, msgPrev] = await Promise.all([
          fetchRows(clientId, range.from, range.to),
          fetchRows(clientId, previous.from, previous.to),
          fetchMessagingCampaigns(clientId, range.from, range.to),
          fetchMessagingCampaigns(clientId, previous.from, previous.to),
        ]);
        if (cancelled) return;

        // ── Período actual ──────────────────────────────────────
        const allAgg = aggregateCampaigns(nowRows, msgNow);
        const purchaseAgg = allAgg.filter(hasPurchaseIntent);
        const otherAgg = allAgg.filter((c) => !hasPurchaseIntent(c));

        const campaigns = purchaseAgg
          .map(finalizeCampaign)
          .sort((a, b) => b.spend - a.spend);
        const totals = totalsFrom(campaigns);
        const funnel: ComprasFunnel = {
          viewContent: totals.viewContent,
          addToCart: totals.addToCart,
          initiateCheckout: totals.initiateCheckout,
          purchases: totals.purchases,
        };

        const purchaseNames = new Set(purchaseAgg.map((c) => c.name));
        const ads = aggregateAds(nowRows, purchaseNames).slice(0, AD_LIMIT);
        const daily = buildDaily(nowRows, purchaseNames);

        // Explorador jerárquico + los tres objetivos de Meta (venta / WhatsApp / marca).
        const hierarchy = buildHierarchy(nowRows, purchaseNames);
        const monthlyRoas = monthlyRoasFrom(nowRows, purchaseNames);
        let whatsappSpend = 0;
        let waConversations = 0;
        for (const r of nowRows) {
          if (msgNow.has(r.campaign_name || '')) {
            whatsappSpend += Number(r.spend) || 0;
            waConversations += Number(r.conversations) || 0;
          }
        }
        const brandSpend = otherAgg.reduce((s, c) => s + c.spend, 0);

        // ── Período anterior (mismo criterio) ───────────────────
        const prevPurchase = aggregateCampaigns(prevRows, msgPrev)
          .filter(hasPurchaseIntent)
          .map(finalizeCampaign);
        const pt = totalsFrom(prevPurchase);
        const roasPrev = pt.roas;

        // ¿Existe Meta en cualquier fecha?
        let metaExistsEver = nowRows.length > 0;
        if (!metaExistsEver) {
          metaExistsEver = await fetchMetaExists(clientId);
          if (cancelled) return;
        }

        setData({
          campaigns,
          ads,
          daily,
          totals,
          funnel,
          campaignCount: campaigns.length,
          adCount: ads.length,
          withThumb: ads.filter((a) => !!a.thumbUrl).length,
          messagingCampaignCount: msgNow.size,
          otherCampaignCount: otherAgg.length,
          otherSpend: brandSpend,
          metaExistsEver,
          hierarchy,
          whatsappSpend,
          waConversations,
          spendSplit: { sales: totals.spend, whatsapp: whatsappSpend, brand: brandSpend },
          monthlyRoas,
          spendDelta: calcDelta(totals.spend, pt.spend),
          revenueDelta: calcDelta(totals.purchaseValue, pt.purchaseValue),
          roasDelta: totals.roas - roasPrev,
          purchasesDelta: calcDelta(totals.purchases, pt.purchases),
          from: range.from,
          to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useMetaCompras]', e);
        setError(e?.message || 'Error desconocido al cargar Compras de Meta');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [clientId, range.from, range.to, previous.from, previous.to, tick]);

  return { data, loading, error, refresh: () => setTick((x) => x + 1) };
}
