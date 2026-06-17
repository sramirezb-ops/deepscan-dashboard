'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
// useMerchantCenter — salud del feed de Google Merchant Center
// ============================================================
// La cuenta es AVANZADA (MCA) con dos subcuentas que viven en la
// misma tabla `gmc_products` bajo un único client_id. Se distinguen
// por el patrón del product_id:
//   · contiene "shopify"  → feed de Shopify
//   · no lo contiene      → feed de sneakerstore.com.mx
//
// Es una FOTO del estado actual del feed (no serie temporal), por eso
// NO se aplica el filtro global de tiempo. Todo sale de conteos reales.
// ============================================================

export interface FeedHealth {
  label: string; // "Shopify" | "sneakerstore.com.mx"
  total: number;
  approved: number;
  disapproved: number;
  approvalRate: number; // 0–1
}

export interface IssueRow {
  description: string;
  products: number; // nº de productos (en la muestra) que tienen este issue
}

export interface MerchantData {
  total: number;
  approved: number;
  disapproved: number;
  approvalRate: number; // 0–1
  feeds: FeedHealth[];
  topIssues: IssueRow[];
  issuesSampleSize: number; // cuántos productos rechazados se muestrearon para los issues
}

export interface UseMerchantResult {
  data: MerchantData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const TABLE = 'gmc_products';
const ISSUE_SAMPLE = 2000; // techo de filas a traer para el desglose de issues

// Cuenta filas que cumplen los filtros, sin traer los datos (head:true).
async function countWhere(
  clientId: string,
  status: 'APPROVED' | 'DISAPPROVED' | null,
  feed: 'shopify' | 'site' | null
): Promise<number> {
  let q = supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId);

  if (status) q = q.eq('status', status);
  if (feed === 'shopify') q = q.ilike('product_id', '%shopify%');
  if (feed === 'site') q = q.not('product_id', 'ilike', '%shopify%');

  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

interface IssueRaw {
  issues: { code?: string; description?: string }[] | null;
}

// Muestra de productos rechazados → top issues por nº de productos afectados.
async function fetchTopIssues(
  clientId: string
): Promise<{ rows: IssueRow[]; sampleSize: number }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('issues')
    .eq('client_id', clientId)
    .eq('status', 'DISAPPROVED')
    .limit(ISSUE_SAMPLE);
  if (error) throw error;

  const rows = (data || []) as IssueRaw[];
  const counter = new Map<string, number>();

  for (const r of rows) {
    if (!Array.isArray(r.issues)) continue;
    // Un producto cuenta una sola vez por cada descripción distinta.
    const seen = new Set<string>();
    for (const iss of r.issues) {
      const desc = (iss?.description || iss?.code || '').trim();
      if (!desc || seen.has(desc)) continue;
      seen.add(desc);
      counter.set(desc, (counter.get(desc) || 0) + 1);
    }
  }

  const out = Array.from(counter.entries())
    .map(([description, products]) => ({ description, products }))
    .sort((a, b) => b.products - a.products)
    .slice(0, 8);

  return { rows: out, sampleSize: rows.length };
}

function buildFeed(label: string, approved: number, disapproved: number): FeedHealth {
  const total = approved + disapproved;
  return {
    label,
    total,
    approved,
    disapproved,
    approvalRate: total > 0 ? approved / total : 0,
  };
}

export function useMerchantCenter(clientId: string): UseMerchantResult {
  const [data, setData] = useState<MerchantData | null>(null);
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
        const [
          shopifyApproved,
          shopifyDisapproved,
          siteApproved,
          siteDisapproved,
          issues,
        ] = await Promise.all([
          countWhere(clientId, 'APPROVED', 'shopify'),
          countWhere(clientId, 'DISAPPROVED', 'shopify'),
          countWhere(clientId, 'APPROVED', 'site'),
          countWhere(clientId, 'DISAPPROVED', 'site'),
          fetchTopIssues(clientId),
        ]);
        if (cancelled) return;

        const shopify = buildFeed('Shopify', shopifyApproved, shopifyDisapproved);
        const site = buildFeed('sneakerstore.com.mx', siteApproved, siteDisapproved);

        const approved = shopify.approved + site.approved;
        const disapproved = shopify.disapproved + site.disapproved;
        const total = approved + disapproved;

        setData({
          total,
          approved,
          disapproved,
          approvalRate: total > 0 ? approved / total : 0,
          // mayor feed primero
          feeds: [shopify, site].sort((a, b) => b.total - a.total),
          topIssues: issues.rows,
          issuesSampleSize: issues.sampleSize,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useMerchantCenter]', e);
        setError(e?.message || 'Error desconocido al cargar Merchant Center');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [clientId, tick]);

  return { data, loading, error, refresh: () => setTick((x) => x + 1) };
}
