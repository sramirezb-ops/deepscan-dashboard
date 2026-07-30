'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DateRange } from '@/lib/period';

// ============================================================
// useLanding — páginas de ENTRADA (GA4 landingPage) de la propiedad de Shopify.
// ga4_landing trae varias propiedades GA4 etiquetadas con property_id. Aquí se
// detecta la de Shopify automáticamente (la que tiene más rutas nativas
// /products, /collections, /checkouts, /cart, /pages) y se aísla, para no sumar
// el tráfico del otro sitio. Métricas reales: sesiones → carrito → checkout →
// compra + ingresos y rebote, por página, comparables entre sí.
// ============================================================

const PAGE = 1000;
const n = (v: unknown) => Number(v || 0);
const r1 = (a: number, b: number) => (b ? +((100 * a) / b).toFixed(1) : 0);
const SHOP_RE = /^\/(products|collections|checkouts?|cart|pages|en\/)/i;

export interface LandingPage {
  path: string; label: string; kind: 'Home' | 'Producto' | 'Colección' | 'Otra';
  sessions: number; atc: number; chk: number; buy: number; rev: number; bounce: number;
  atc_r: number; chk_r: number; buy_r: number;
}
export interface LandingSite { sessions: number; atc: number; chk: number; buy: number; rev: number; atc_r: number; chk_r: number; buy_r: number; }
export interface LandingData {
  from: string; to: string;
  site: LandingSite;
  pages: LandingPage[]; // ordenadas por sesiones desc
  nPages: number;
  shopifyProperty: string | null;
  hasData: boolean;
}

function kindOf(p: string): LandingPage['kind'] {
  if (p === '/' || p === '(not set)' || p === '/home') return 'Home';
  if (/\/(product|producto)/i.test(p)) return 'Producto';
  if (/\/(coleccion|collection|categor)/i.test(p)) return 'Colección';
  return 'Otra';
}
function labelOf(p: string): string {
  if (p === '/') return 'Home /';
  const segs = p.split('/').filter(Boolean);
  const last = segs.length ? segs[segs.length - 1] : p;
  return last.replace(/-/g, ' ').slice(0, 40);
}

async function page<T>(cols: string, clientId: string, from: string, to: string): Promise<T[]> {
  const all: T[] = [];
  let off = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase.from('ga4_landing').select(cols)
      .eq('client_id', clientId).gte('date', from).lte('date', to).range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as T[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    off += PAGE;
  }
  return all;
}

export function useLanding(clientId: string, range: DateRange, minSessions = 12, topN = 20) {
  const [data, setData] = useState<LandingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const rows = await page<any>(
          'landing_page,property_id,sessions,add_to_cart,checkout,purchases,revenue,bounce_rate',
          clientId, range.from, range.to);

        // Detectar la propiedad de Shopify: la que más rutas nativas tiene.
        const score: Record<string, number> = {};
        const sessByProp: Record<string, number> = {};
        for (const r of rows) {
          const pid = r.property_id || '';
          sessByProp[pid] = (sessByProp[pid] || 0) + n(r.sessions);
          if (SHOP_RE.test(r.landing_page || '')) score[pid] = (score[pid] || 0) + 1;
        }
        const byScore = Object.entries(score).sort((a, b) => b[1] - a[1]);
        const bySess = Object.entries(sessByProp).sort((a, b) => b[1] - a[1]);
        const shopifyProperty = byScore[0]?.[0] ?? bySess[0]?.[0] ?? null;

        const shopRows = shopifyProperty != null ? rows.filter((r) => (r.property_id || '') === shopifyProperty) : rows;

        // Agregar por página.
        const acc: Record<string, any> = {};
        for (const r of shopRows) {
          const p = r.landing_page || '(not set)';
          const a = (acc[p] ||= { sessions: 0, atc: 0, chk: 0, buy: 0, rev: 0, _bw: 0 });
          a.sessions += n(r.sessions); a.atc += n(r.add_to_cart); a.chk += n(r.checkout);
          a.buy += n(r.purchases); a.rev += n(r.revenue); a._bw += n(r.bounce_rate) * n(r.sessions);
        }
        const pages: LandingPage[] = Object.entries(acc)
          .filter(([, a]) => a.sessions >= minSessions)
          .map(([p, a]) => ({
            path: p, label: labelOf(p), kind: kindOf(p),
            sessions: a.sessions, atc: a.atc, chk: a.chk, buy: a.buy, rev: Math.round(a.rev),
            bounce: a.sessions ? +(100 * a._bw / a.sessions).toFixed(1) : 0,
            atc_r: r1(a.atc, a.sessions), chk_r: r1(a.chk, a.sessions), buy_r: +(a.sessions ? (100 * a.buy) / a.sessions : 0).toFixed(2),
          }))
          .sort((a, b) => b.sessions - a.sessions);

        const tot = shopRows.reduce((s, r) => {
          s.sessions += n(r.sessions); s.atc += n(r.add_to_cart); s.chk += n(r.checkout); s.buy += n(r.purchases); s.rev += n(r.revenue); return s;
        }, { sessions: 0, atc: 0, chk: 0, buy: 0, rev: 0 });
        const site: LandingSite = {
          sessions: tot.sessions, atc: tot.atc, chk: tot.chk, buy: tot.buy, rev: Math.round(tot.rev),
          atc_r: r1(tot.atc, tot.sessions), chk_r: r1(tot.chk, tot.sessions), buy_r: +(tot.sessions ? (100 * tot.buy) / tot.sessions : 0).toFixed(2),
        };

        const out: LandingData = {
          from: range.from, to: range.to, site, pages: pages.slice(0, topN), nPages: pages.length,
          shopifyProperty, hasData: pages.length > 0,
        };
        if (alive) { setData(out); setLoading(false); }
      } catch (e: any) {
        if (alive) { setError(e?.message || 'error'); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [clientId, range.from, range.to, minSessions, topN]);

  return { data, loading, error };
}
