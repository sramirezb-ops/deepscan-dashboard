'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { gadsStartDate } from '@/lib/dataFloors';

// ============================================================
// useAgenciaVsIA — Google Ads: quién gestiona qué y si la IA ayuda o resta.
// ============================================================
// Firma confiable = usuario + client_type del historial (gads_change_events):
// GOOGLE_ADS_API = IA (Aura), lo demás = humano (agencia). Inmune a renombres.
// Cruza: change_events (bitácora + atribución) · gads_campaigns (costo/conv) ·
// gads_conversions_by_action (aísla PURCHASE → ROAS de compra limpio).
// Deriva: veredicto 🚦, impacto por cambio de la IA, y recomendaciones.
// ============================================================

const PAGE = 1000;
const n = (v: unknown) => Number(v || 0);
const isIA = (ct?: string | null) => ct === 'GOOGLE_ADS_API';
const GOOD_ROAS = 3;       // umbral "campaña que rinde" (compra real)
const OK_ROAS = 1;         // umbral "sostiene"

export type Owner = 'agencia' | 'ia' | 'sin';
export type Impact = 'pos' | 'neg' | 'pend' | 'neu';

export interface ChangeRow {
  dt: string; owner: Owner; action: string; user: string | null;
  campaignId: string | null; campaignName: string;
  oldStatus: string | null; newStatus: string | null;
  touchesAgency: boolean;
  impact: Impact; impactReason: string;
}
export interface CampaignRow {
  campaignId: string; name: string; owner: Owner; status: string | null;
  cost: number; convGoogle: number; valueGoogle: number;
  purchaseConv: number; purchaseValue: number; purchaseRoas: number;
  tag: 'escalar' | 'vigilar' | 'cortar' | 'nuevo';
}
export interface CategoryRow { category: string; name: string; allConv: number; allValue: number; primaryConv: number }
export interface OwnerTotals { cost: number; purchaseConv: number; purchaseValue: number; purchaseRoas: number; campaigns: number }
export interface Recommendation { kind: 'escalar' | 'frenar' | 'dejar' | 'ojo'; title: string; detail: string }
export interface Verdict { level: 'bien' | 'observacion' | 'restando'; headline: string; points: string[] }

export interface AgenciaVsIAData {
  verdict: Verdict;
  recommendations: Recommendation[];
  changes: ChangeRow[];
  iaChanges: ChangeRow[];
  campaigns: CampaignRow[];
  categories: CategoryRow[];
  totals: Record<Owner, OwnerTotals>;
  convGoogleTotal: number;
  purchaseConvTotal: number;
  purchaseValueTotal: number;
  users: { email: string; clientType: string; owner: Owner; count: number }[];
  windowDays: number;
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

        const nameById = new Map<string, string>();
        for (const c of campRows) if (c.campaign_id) nameById.set(String(c.campaign_id), c.campaign_name);

        const creatorByCampaign = new Map<string, Owner>();
        for (const e of chRows) if (e.action === 'crear_campana' && e.campaign_id)
          creatorByCampaign.set(String(e.campaign_id), isIA(e.client_type) ? 'ia' : 'agencia');

        // ── Compras (PURCHASE) por campaña + categorías ──
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
            if (cid) { const p = purchaseByCampaign.get(cid) || { conv: 0, value: 0 }; p.conv += n(r.all_conversions); p.value += n(r.all_conv_value); purchaseByCampaign.set(cid, p); }
          }
        }
        const categories = [...catAgg.values()].sort((a, b) => b.allConv - a.allConv);

        // ── Rendimiento por campaña ──
        const perf = new Map<string, { name: string; cost: number; conv: number; value: number; status: string | null }>();
        for (const c of campRows) {
          const cid = String(c.campaign_id || ''); if (!cid) continue;
          const p = perf.get(cid) || { name: c.campaign_name, cost: 0, conv: 0, value: 0, status: c.status || null };
          p.cost += n(c.cost); p.conv += n(c.conversions); p.value += n(c.conv_value); p.status = c.status || p.status;
          perf.set(cid, p);
        }
        const createdIds = new Set(creatorByCampaign.keys());
        const campaigns: CampaignRow[] = [...perf.entries()].map(([cid, p]) => {
          const owner: Owner = creatorByCampaign.get(cid) || 'sin';
          const pur = purchaseByCampaign.get(cid) || { conv: 0, value: 0 };
          const roas = p.cost > 0 ? pur.value / p.cost : 0;
          let tag: CampaignRow['tag'];
          if (pur.conv === 0 && createdIds.has(cid)) tag = 'nuevo';
          else if (roas >= GOOD_ROAS) tag = 'escalar';
          else if (roas >= OK_ROAS || pur.conv > 0) tag = 'vigilar';
          else tag = 'cortar';
          return {
            campaignId: cid, name: p.name, owner, status: p.status,
            cost: +p.cost.toFixed(2), convGoogle: p.conv, valueGoogle: p.value,
            purchaseConv: pur.conv, purchaseValue: pur.value, purchaseRoas: roas, tag,
          };
        }).sort((a, b) => b.cost - a.cost);
        const campById = new Map(campaigns.map((c) => [c.campaignId, c]));

        // ── Bitácora con impacto (solo juzgamos acciones de la IA) ──
        const impactOf = (owner: Owner, action: string, cid: string | null, touchesAgency: boolean): { impact: Impact; reason: string } => {
          if (owner !== 'ia') return { impact: 'neu', reason: '' };
          const c = cid ? campById.get(cid) : null;
          if (action === 'pausar') {
            if (c && c.purchaseRoas >= GOOD_ROAS) return { impact: 'neg', reason: `pausó una campaña que vendía (ROAS ${c.purchaseRoas.toFixed(1)}×)` };
            if (c && c.purchaseConv > 0) return { impact: 'neg', reason: 'pausó una campaña con compras' };
            return { impact: 'neu', reason: 'pausó una campaña sin compras' };
          }
          if (action === 'crear_campana') {
            if (c && c.purchaseConv > 0) return { impact: 'pos', reason: 'creó una campaña que ya trae compras' };
            return { impact: 'pend', reason: 'creó una campaña — aún sin compras' };
          }
          if (action === 'cambio_presupuesto') return { impact: touchesAgency ? 'neu' : 'pend', reason: touchesAgency ? 'cambió el presupuesto de una campaña de la agencia' : 'cambió un presupuesto' };
          if (action === 'editar') return { impact: 'neu', reason: touchesAgency ? 'editó una campaña de la agencia' : 'editó una campaña' };
          return { impact: 'neu', reason: '' };
        };

        const changesAsc: ChangeRow[] = chRows.map((e) => {
          const owner: Owner = isIA(e.client_type) ? 'ia' : 'agencia';
          const cid = e.campaign_id ? String(e.campaign_id) : null;
          const creator = cid ? creatorByCampaign.get(cid) : undefined;
          const touchesAgency = owner === 'ia' && creator === 'agencia';
          const { impact, reason } = impactOf(owner, e.action, cid, touchesAgency);
          return {
            dt: e.change_dt, owner, action: e.action, user: e.user_email || null,
            campaignId: cid, campaignName: cid ? (nameById.get(cid) || `(id ${cid})`) : '—',
            oldStatus: e.old_status || null, newStatus: e.new_status || null,
            touchesAgency, impact, impactReason: reason,
          };
        });
        const changes = [...changesAsc].reverse();
        const iaChanges = changes.filter((c) => c.owner === 'ia');

        // ── Totales por gestor ──
        const mkTot = (): OwnerTotals => ({ cost: 0, purchaseConv: 0, purchaseValue: 0, purchaseRoas: 0, campaigns: 0 });
        const totals: Record<Owner, OwnerTotals> = { agencia: mkTot(), ia: mkTot(), sin: mkTot() };
        for (const c of campaigns) { const t = totals[c.owner]; t.cost += c.cost; t.purchaseConv += c.purchaseConv; t.purchaseValue += c.purchaseValue; t.campaigns += 1; }
        (Object.keys(totals) as Owner[]).forEach((k) => { totals[k].purchaseRoas = totals[k].cost > 0 ? totals[k].purchaseValue / totals[k].cost : 0; totals[k].cost = +totals[k].cost.toFixed(2); });

        // ── Usuarios / firmas ──
        const uAgg = new Map<string, { email: string; clientType: string; owner: Owner; count: number }>();
        for (const e of chRows) {
          const key = (e.user_email || '?') + '|' + (e.client_type || '?');
          const u = uAgg.get(key) || { email: e.user_email || '(desconocido)', clientType: e.client_type || '?', owner: isIA(e.client_type) ? 'ia' : 'agencia', count: 0 };
          u.count += 1; uAgg.set(key, u);
        }
        const users = [...uAgg.values()].sort((a, b) => b.count - a.count);

        // ── Ventana (días con datos) ──
        const days = new Set(campRows.map((c) => c.date).filter(Boolean));
        const windowDays = days.size;

        // ── Veredicto 🚦 ──
        const negatives = iaChanges.filter((c) => c.impact === 'neg');
        const iaWorking = campaigns.filter((c) => c.owner === 'ia' && c.purchaseConv > 0);
        const iaNoSales = campaigns.filter((c) => c.owner === 'ia' && c.cost > 0 && c.purchaseConv === 0);
        let verdict: Verdict;
        if (negatives.length > 0) {
          verdict = { level: 'restando', headline: 'La IA frenó campañas que estaban vendiendo', points: [] };
        } else if (iaWorking.length > 0 && totals.ia.purchaseRoas >= totals.agencia.purchaseRoas) {
          verdict = { level: 'bien', headline: 'La IA está aportando ventas con buen retorno', points: [] };
        } else {
          verdict = { level: 'observacion', headline: 'La IA está en observación: pocos días, sin daño visible pero aún sin aportar ventas', points: [] };
        }
        const pts: string[] = [];
        if (negatives.length) pts.push(`${negatives.length} cambio(s) de la IA perjudicaron (ej. ${negatives[0].impactReason}).`);
        if (iaChanges.some((c) => c.action === 'crear_campana')) {
          const created = campaigns.filter((c) => c.owner === 'ia');
          const cTxt = created.map((c) => `${c.name.slice(0, 28)} (${c.purchaseConv > 0 ? c.purchaseConv + ' compras' : '0 compras'})`).join(', ');
          if (cTxt) pts.push(`Creó: ${cTxt}.`);
        }
        const touched = iaChanges.filter((c) => c.touchesAgency).length;
        if (touched) pts.push(`Editó/ajustó ${touched} cambio(s) sobre campañas tuyas — vigila que no las desoptimice.`);
        if (!negatives.length) pts.push('No ha pausado nada que estuviera vendiendo (en Google, esta ventana).');
        verdict.points = pts;

        // ── Recomendaciones ──
        const recommendations: Recommendation[] = [];
        campaigns.filter((c) => c.tag === 'escalar').slice(0, 2).forEach((c) =>
          recommendations.push({ kind: 'escalar', title: `Escalar: ${c.name}`, detail: `ROAS de compra ${c.purchaseRoas.toFixed(1)}× (${OWNER_LABEL(c.owner)}). Es la que trae ventas — súbele con cuidado.` }));
        iaNoSales.slice(0, 2).forEach((c) =>
          recommendations.push({ kind: 'frenar', title: `Vigilar: ${c.name}`, detail: `Creada por la IA · gastó ${c.cost.toLocaleString('es-MX')} y 0 compras. Dale unos días; si no vende, frenar.` }));
        iaChanges.filter((c) => c.touchesAgency).slice(0, 1).forEach((c) =>
          recommendations.push({ kind: 'ojo', title: `Revisar: la IA tocó ${c.campaignName.slice(0, 34)}`, detail: `La IA ${c.impactReason}. Verifica que no haya desoptimizado una campaña que rinde.` }));
        campaigns.filter((c) => c.tag === 'vigilar' && c.purchaseConv > 0).slice(0, 1).forEach((c) =>
          recommendations.push({ kind: 'dejar', title: `Mantener: ${c.name}`, detail: `Trae ${c.purchaseConv} compra(s), ROAS ${c.purchaseRoas.toFixed(1)}×. Sostiene la caja; mantener.` }));

        if (!cancelled) {
          setData({
            verdict, recommendations, changes, iaChanges, campaigns, categories, totals,
            convGoogleTotal, purchaseConvTotal, purchaseValueTotal, users, windowDays,
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

function OWNER_LABEL(o: Owner) { return o === 'ia' ? 'IA' : o === 'agencia' ? 'Agencia' : 'sin atribuir'; }
