'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { gadsStartDate } from '@/lib/dataFloors';

// ============================================================
// useAgenciaVsIA — Google Ads: quién gestiona qué (Agencia vs IA de Aura).
// ============================================================
// La firma confiable es el USUARIO + client_type del historial de cambios
// (gads_change_events): GOOGLE_ADS_API = IA (Aura), lo demás = humano (agencia).
// Inmune a renombres de campaña.
//
// Cruza tres fuentes:
//   · gads_change_events        → bitácora (quién creó/pausó/editó) + atribución
//   · gads_campaigns            → costo y conversiones (Google) por campaña
//   · gads_conversions_by_action→ aísla PURCHASE (ROAS de compra limpio)
// Solo Google por ahora (Meta se suma después).
// ============================================================

const PAGE = 1000;
const n = (v: unknown) => Number(v || 0);
const isIA = (clientType?: string | null) => clientType === 'GOOGLE_ADS_API';

export type Owner = 'agencia' | 'ia' | 'sin';

export interface ChangeRow {
  dt: string; owner: Owner; action: string; user: string | null;
  campaignId: string | null; campaignName: string;
  oldStatus: string | null; newStatus: string | null;
  touchesAgency: boolean; // IA tocó una campaña creada por la agencia
}
export interface CampaignRow {
  campaignId: string; name: string; owner: Owner; status: string | null;
  cost: number; convGoogle: number; valueGoogle: number;
  purchaseConv: number; purchaseValue: number; purchaseRoas: number;
}
export interface CategoryRow { category: string; name: string; allConv: number; allValue: number; primaryConv: number }
export interface OwnerTotals { cost: number; purchaseConv: number; purchaseValue: number; purchaseRoas: number; campaigns: number }

export interface AgenciaVsIAData {
  changes: ChangeRow[];
  campaigns: CampaignRow[];
  categories: CategoryRow[];
  totals: Record<Owner, OwnerTotals>;
  // medición
  convGoogleTotal: number;   // lo que Google cuenta como "Conversiones" (primarias)
  purchaseConvTotal: number; // compras reales
  purchaseValueTotal: number;
  // firmas detectadas
  users: { email: string; clientType: string; owner: Owner; count: number }[];
  from: string;
  hasData: boolean;
}

async function pageAll<T>(table: string, select: string, filter: (q: any) => any): Promise<T[]> {
  const all: T[] = []; let off = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await filter(supabase.from(table).select(select)).range(off, off + PAGE - 1);
    if (error) { if (off === 0) return []; break; }
    const b = (data || []) as T[]; all.push(...b);
    if (b.length < PAGE) break; off += PAGE;
  }
  return all;
}

export function useAgenciaVsIA(clientId: string) {
  const [data, setData] = useState<AgenciaVsIAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    const floor = gadsStartDate(clientId) || '2000-01-01';
    (async () => {
      setLoading(true); setError(null);
      try {
        const [chRows, campRows, convRows] = await Promise.all([
          pageAll<any>('gads_change_events',
            'change_dt, action, user_email, client_type, campaign_id, old_status, new_status',
            (q) => q.eq('client_id', clientId).order('change_dt', { ascending: true })),
          pageAll<any>('gads_campaigns',
            'campaign_id, campaign_name, cost, conversions, conv_value, status, date',
            (q) => q.eq('client_id', clientId).gte('date', floor)),
          pageAll<any>('gads_conversions_by_action',
            'date, campaign_id, campaign_name, conv_action_name, conv_action_category, all_conversions, all_conv_value, conversions, conv_value',
            (q) => q.eq('client_id', clientId).gte('date', floor)),
        ]);
        if (cancelled) return;

        // Nombre de campaña por id (de gads_campaigns, el más fiable).
        const nameById = new Map<string, string>();
        for (const c of campRows) if (c.campaign_id) nameById.set(String(c.campaign_id), c.campaign_name);

        // Creador por campaña (evento crear_campana).
        const creatorByCampaign = new Map<string, Owner>();
        for (const e of chRows) {
          if (e.action === 'crear_campana' && e.campaign_id) {
            creatorByCampaign.set(String(e.campaign_id), isIA(e.client_type) ? 'ia' : 'agencia');
          }
        }

        // Bitácora.
        const changes: ChangeRow[] = chRows.map((e) => {
          const owner: Owner = isIA(e.client_type) ? 'ia' : 'agencia';
          const cid = e.campaign_id ? String(e.campaign_id) : null;
          const creator = cid ? creatorByCampaign.get(cid) : undefined;
          return {
            dt: e.change_dt, owner, action: e.action, user: e.user_email || null,
            campaignId: cid, campaignName: cid ? (nameById.get(cid) || `(id ${cid})`) : '—',
            oldStatus: e.old_status || null, newStatus: e.new_status || null,
            touchesAgency: owner === 'ia' && creator === 'agencia',
          };
        }).reverse(); // más reciente primero

        // Compras (PURCHASE) por campaña, desde el desglose.
        const purchaseByCampaign = new Map<string, { conv: number; value: number }>();
        const catAgg = new Map<string, CategoryRow>();
        let purchaseConvTotal = 0, purchaseValueTotal = 0, convGoogleTotal = 0;
        for (const r of convRows) {
          const cat = r.conv_action_category || '(sin categoría)';
          const key = cat + '|' + (r.conv_action_name || '');
          const cr = catAgg.get(key) || { category: cat, name: r.conv_action_name || '', allConv: 0, allValue: 0, primaryConv: 0 };
          cr.allConv += n(r.all_conversions); cr.allValue += n(r.all_conv_value); cr.primaryConv += n(r.conversions);
          catAgg.set(key, cr);
          convGoogleTotal += n(r.conversions);
          if (cat === 'PURCHASE') {
            purchaseConvTotal += n(r.all_conversions); purchaseValueTotal += n(r.all_conv_value);
            const cid = r.campaign_id ? String(r.campaign_id) : '';
            if (cid) {
              const p = purchaseByCampaign.get(cid) || { conv: 0, value: 0 };
              p.conv += n(r.all_conversions); p.value += n(r.all_conv_value);
              purchaseByCampaign.set(cid, p);
            }
          }
        }
        const categories = [...catAgg.values()].sort((a, b) => b.allConv - a.allConv);

        // Rendimiento por campaña (costo/conv de gads_campaigns + compras del desglose).
        const perf = new Map<string, { name: string; cost: number; conv: number; value: number; status: string | null }>();
        for (const c of campRows) {
          const cid = String(c.campaign_id || ''); if (!cid) continue;
          const p = perf.get(cid) || { name: c.campaign_name, cost: 0, conv: 0, value: 0, status: c.status || null };
          p.cost += n(c.cost); p.conv += n(c.conversions); p.value += n(c.conv_value); p.status = c.status || p.status;
          perf.set(cid, p);
        }
        const campaigns: CampaignRow[] = [...perf.entries()].map(([cid, p]) => {
          const owner: Owner = creatorByCampaign.get(cid) || 'sin';
          const pur = purchaseByCampaign.get(cid) || { conv: 0, value: 0 };
          return {
            campaignId: cid, name: p.name, owner, status: p.status,
            cost: +p.cost.toFixed(2), convGoogle: p.conv, valueGoogle: p.value,
            purchaseConv: pur.conv, purchaseValue: pur.value,
            purchaseRoas: p.cost > 0 ? pur.value / p.cost : 0,
          };
        }).sort((a, b) => b.cost - a.cost);

        // Totales por gestor.
        const mkTot = (): OwnerTotals => ({ cost: 0, purchaseConv: 0, purchaseValue: 0, purchaseRoas: 0, campaigns: 0 });
        const totals: Record<Owner, OwnerTotals> = { agencia: mkTot(), ia: mkTot(), sin: mkTot() };
        for (const c of campaigns) {
          const t = totals[c.owner];
          t.cost += c.cost; t.purchaseConv += c.purchaseConv; t.purchaseValue += c.purchaseValue; t.campaigns += 1;
        }
        (Object.keys(totals) as Owner[]).forEach((k) => {
          totals[k].purchaseRoas = totals[k].cost > 0 ? totals[k].purchaseValue / totals[k].cost : 0;
          totals[k].cost = +totals[k].cost.toFixed(2);
        });

        // Firmas (usuarios) detectadas.
        const uAgg = new Map<string, { email: string; clientType: string; owner: Owner; count: number }>();
        for (const e of chRows) {
          const key = (e.user_email || '?') + '|' + (e.client_type || '?');
          const u = uAgg.get(key) || { email: e.user_email || '(desconocido)', clientType: e.client_type || '?', owner: isIA(e.client_type) ? 'ia' : 'agencia', count: 0 };
          u.count += 1; uAgg.set(key, u);
        }
        const users = [...uAgg.values()].sort((a, b) => b.count - a.count);

        if (!cancelled) {
          setData({
            changes, campaigns, categories, totals,
            convGoogleTotal, purchaseConvTotal, purchaseValueTotal,
            users, from: floor,
            hasData: chRows.length > 0 || campaigns.length > 0,
          });
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) { setError(e?.message || 'error'); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  return { data, loading, error };
}
