'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
// useMetaPlacements — dónde convierte Meta (Compras, Cap 2)
// Lee meta_breakdowns (snapshot, sin fecha) a nivel ADSET para no doble-contar,
// filtra a las campañas de VENTA que le pasa la vista, y agrega por:
//   · publisher_platform  → Facebook vs Instagram vs Audience Network…
//   · platform_position   → placement específico (IG Reels, FB Feed, Stories…)
//   · user_segment_key    → prospecting / existing / engaged
// Responde la pregunta del cliente "¿solo convierte IG?" con dato duro.
// ============================================================

const PAGE = 1000;
const n = (v: unknown) => Number(v || 0);

export interface PlaceRow {
  key: string; spend: number; purchases: number; purchaseValue: number;
  atc: number; clicks: number; roas: number; cpa: number; share: number; // share = % del gasto del grupo
  cr: number;       // tasa de conversión = compras / clics (fracción)
  cartRate: number; // % de carritos = carritos / clics (fracción)
}
// Nodo del drilldown de plataforma (campaña → conjunto → anuncio).
export interface PlaceNode {
  name: string; spend: number; purchases: number; purchaseValue: number;
  atc: number; clicks: number; roas: number; cpa: number; cr: number; cartRate: number;
  kids?: PlaceNode[];
}
export interface PlacementsData {
  platforms: PlaceRow[];
  placements: PlaceRow[];
  segments: PlaceRow[];
  platTree: Record<string, PlaceNode[]>; // plataforma → campañas → conjuntos → anuncios
  hasData: boolean;
}

type Agg = { spend: number; purchases: number; pv: number; atc: number; clicks: number };
const newAgg = (): Agg => ({ spend: 0, purchases: 0, pv: 0, atc: 0, clicks: 0 });
const addAgg = (a: Agg, r: any) => { a.spend += n(r.spend); a.purchases += n(r.purchases); a.pv += n(r.purchase_value); a.atc += n(r.add_to_cart); a.clicks += n(r.link_clicks); };
function fin(name: string, a: Agg, kids?: PlaceNode[]): PlaceNode {
  return {
    name, spend: +a.spend.toFixed(2), purchases: a.purchases, purchaseValue: a.pv, atc: a.atc, clicks: a.clicks,
    roas: a.spend > 0 ? a.pv / a.spend : 0, cpa: a.purchases > 0 ? a.spend / a.purchases : 0,
    cr: a.clicks > 0 ? a.purchases / a.clicks : 0, cartRate: a.clicks > 0 ? a.atc / a.clicks : 0, kids,
  };
}
const byS = (x: PlaceNode, y: PlaceNode) => y.spend - x.spend;
// Árbol plataforma → campaña → conjunto → anuncio, desde publisher_platform a nivel ad.
function buildPlatTree(sales: any[]): Record<string, PlaceNode[]> {
  const P = new Map<string, { camps: Map<string, { a: Agg; sets: Map<string, { a: Agg; ads: Map<string, Agg> }> }> }>();
  for (const r of sales) {
    if (r.breakdown_type !== 'publisher_platform' || r.level !== 'ad') continue;
    const p = r.breakdown_value || 'unknown', c = r.campaign_name || '(sin campaña)', s = r.adset_name || '(sin conjunto)', a = r.entity_name || '(sin anuncio)';
    let pp = P.get(p); if (!pp) { pp = { camps: new Map() }; P.set(p, pp); }
    let cc = pp.camps.get(c); if (!cc) { cc = { a: newAgg(), sets: new Map() }; pp.camps.set(c, cc); } addAgg(cc.a, r);
    let ss = cc.sets.get(s); if (!ss) { ss = { a: newAgg(), ads: new Map() }; cc.sets.set(s, ss); } addAgg(ss.a, r);
    let aa = ss.ads.get(a); if (!aa) { aa = newAgg(); ss.ads.set(a, aa); } addAgg(aa, r);
  }
  const out: Record<string, PlaceNode[]> = {};
  for (const [p, pp] of P) {
    out[p] = [...pp.camps.entries()].map(([cn, cc]) =>
      fin(cn, cc.a, [...cc.sets.entries()].map(([sn, ss]) =>
        fin(sn, ss.a, [...ss.ads.entries()].map(([an, aa]) => fin(an, aa)).sort(byS))
      ).sort(byS))
    ).sort(byS);
  }
  return out;
}

async function pageAll<T>(filter: (q: any) => any): Promise<T[]> {
  const all: T[] = [];
  let off = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await filter(supabase.from('meta_breakdowns').select(
      'level,breakdown_type,breakdown_value,campaign_name,adset_name,entity_name,spend,purchases,purchase_value,add_to_cart,link_clicks'
    )).range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as T[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    off += PAGE;
  }
  return all;
}

function rollup(rows: any[], type: string, level: string): PlaceRow[] {
  const m = new Map<string, { spend: number; purchases: number; pv: number; atc: number; clicks: number }>();
  for (const r of rows) {
    if (r.breakdown_type !== type || r.level !== level) continue;
    const k = (r.breakdown_value || 'unknown') as string;
    const a = m.get(k) || { spend: 0, purchases: 0, pv: 0, atc: 0, clicks: 0 };
    a.spend += n(r.spend); a.purchases += n(r.purchases); a.pv += n(r.purchase_value); a.atc += n(r.add_to_cart); a.clicks += n(r.link_clicks);
    m.set(k, a);
  }
  const total = [...m.values()].reduce((s, a) => s + a.spend, 0) || 1;
  return [...m.entries()]
    .filter(([, a]) => a.spend > 1)
    .map(([key, a]) => ({
      key, spend: +a.spend.toFixed(2), purchases: a.purchases, purchaseValue: a.pv, atc: a.atc, clicks: a.clicks,
      roas: a.spend > 0 ? a.pv / a.spend : 0,
      cpa: a.purchases > 0 ? a.spend / a.purchases : 0,
      share: (a.spend / total) * 100,
      cr: a.clicks > 0 ? a.purchases / a.clicks : 0,
      cartRate: a.clicks > 0 ? a.atc / a.clicks : 0,
    }))
    .sort((x, y) => y.spend - x.spend);
}

export function useMetaPlacements(clientId: string, salesNames: string[]) {
  const [data, setData] = useState<PlacementsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = salesNames.join('\u0000');

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const rows = await pageAll<any>((q) => q.eq('client_id', clientId));
        const salesSet = new Set(salesNames);
        // Si aún no hay nombres de venta, no filtramos (evita pantalla vacía en el primer render).
        const sales = salesSet.size > 0 ? rows.filter((r) => salesSet.has(r.campaign_name)) : rows;
        // Cada breakdown vive en un nivel distinto: publisher_platform y
        // user_segment_key a nivel adset; platform_position solo a nivel ad.
        const out: PlacementsData = {
          platforms: rollup(sales, 'publisher_platform', 'ad'),
          placements: rollup(sales, 'platform_position', 'ad'),
          segments: rollup(sales, 'user_segment_key', 'adset'),
          platTree: buildPlatTree(sales),
          hasData: sales.length > 0,
        };
        if (alive) { setData(out); setLoading(false); }
      } catch (e: any) {
        if (alive) { setError(e?.message || 'error'); setLoading(false); }
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, key]);

  return { data, loading, error };
}
