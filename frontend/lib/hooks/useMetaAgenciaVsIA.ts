'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
// useMetaAgenciaVsIA — Meta: performance dashboard + Agencia vs IA (objetivo-aware)
// ============================================================
// Firma IA (Aura) = actor "Christian Desarrollatech". Cada objeto se juzga por
// SU objetivo: VENTAS → ROAS de compra · WHATSAPP → conversaciones / costo.
// Niveles legacy: CAMPAIGN_GROUP=Campaña, CAMPAIGN=Conjunto, ADGROUP=Anuncio.
// Entrega: KPIs, mejores campañas/conjuntos, rendimiento por gestor (quién creó),
// qué pausó la IA, y bitácora. Google va aparte (su propio hook).
// ============================================================

const PAGE = 1000;
const n = (v: unknown) => Number(v || 0);
const IA_NAME = 'Christian Desarrollatech';
const IA_ID = '122341483712074578';
const WA_MIN_CONV = 20;
const GOOD_ROAS = 2;

export type Owner = 'agencia' | 'ia' | 'meta' | 'sin';
export type Objective = 'ventas' | 'whatsapp' | 'otro';
export type Impact = 'pos' | 'neg' | 'pend' | 'neu';
const LEVEL: Record<string, string> = { CAMPAIGN_GROUP: 'Campaña', CAMPAIGN: 'Conjunto', ADGROUP: 'Anuncio', ACCOUNT: 'Cuenta' };

export interface RankRow {
  id: string; name: string; owner: Owner; objective: Objective; status: string | null;
  spend: number; purchases: number; value: number; roas: number; conv: number; cpc: number;
}
export interface PausedItem {
  level: string; name: string; objective: Objective;
  spend: number; roas: number; purchases: number; value: number; conv: number; cpc: number;
  impact: Impact; reason: string; dt: string;
}
export interface MetaChangeRow { dt: string; owner: Owner; actor: string; action: string; level: string; name: string; oldV: string | null; newV: string | null }
export interface Verdict { level: 'bien' | 'observacion' | 'restando'; headline: string; points: string[] }
export interface OwnerPerf { ventasSpend: number; purchases: number; value: number; roas: number; waSpend: number; conv: number; cpc: number; campaigns: number }
export interface RoasBucket { key: string; label: string; spend: number; value: number; purchases: number; roas: number; count: number }
export interface RoasRadiografia {
  total: RoasBucket;
  porEstado: RoasBucket[];   // activos / inactivos (según bitácora)
  porGestor: RoasBucket[];   // agencia / ia / sin atribuir
}

export interface MetaAgenciaVsIAData {
  kpis: { spend: number; purchases: number; value: number; roas: number; conv: number; cpc: number; waSpend: number };
  topCampaignsVentas: RankRow[];
  topCampaignsWa: RankRow[];
  topAdsetsVentas: RankRow[];
  topAdsetsWa: RankRow[];
  ownerPerf: Record<'agencia' | 'ia', OwnerPerf>;
  roas: RoasRadiografia;
  sinCount: number;
  verdict: Verdict;
  iaPaused: PausedItem[];
  riskValue: number; riskConv: number;
  counts: { iaPaused: number; iaPausedAds: number; iaCreated: number; iaEdited: number; agencyPaused: number };
  changes: MetaChangeRow[];
  actors: { name: string; owner: Owner; count: number }[];
  from: string; hasData: boolean;
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

const ownerOf = (name?: string | null, id?: string | null): Owner => {
  if (name === IA_NAME || String(id) === IA_ID) return 'ia';
  if (name === 'Meta' || !id || String(id) === '0') return 'meta';
  return 'agencia';
};
const actionOf = (stored: string, oldV?: string | null, newV?: string | null): string => {
  const nv = String(newV || '').toLowerCase();
  if (nv.includes('inactiv') || nv.includes('paused')) return 'pausar';
  if ((nv.includes('activ') && !nv.includes('inactiv')) || nv.includes('active')) return stored === 'estado' ? 'activar' : stored;
  return stored;
};
const objOf = (pu: number, cv: number): Objective => (pu > 0 ? 'ventas' : cv > 0 ? 'whatsapp' : 'otro');

export function useMetaAgenciaVsIA(clientId: string, range?: { from: string; to: string }) {
  const [data, setData] = useState<MetaAgenciaVsIAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const FROM = range?.from;
  const TO = range?.to;

  useEffect(() => {
    if (!clientId || !FROM || !TO) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [chRows, campRows] = await Promise.all([
          pageAll<any>('meta_change_events',
            'change_dt, actor_name, actor_id, action, object_type, object_id, object_name, old_value, new_value',
            (q) => q.eq('client_id', clientId).order('change_dt', { ascending: true })),
          pageAll<any>('meta_campaigns',
            'campaign_id, campaign_name, adset_id, adset_name, status, spend, purchases, purchase_value, conversations',
            (q) => q.eq('client_id', clientId).gte('date', FROM).lte('date', TO)),
        ]);
        if (cancelled) return;

        // Creador por objeto (desde los crear_* del historial).
        const campCreator = new Map<string, Owner>();
        const adsetCreator = new Map<string, Owner>();
        for (const e of chRows) {
          const owner = ownerOf(e.actor_name, e.actor_id);
          const a = actionOf(e.action || '', e.old_value, e.new_value);
          if (!a.startsWith('crear')) continue;
          if (e.object_type === 'CAMPAIGN_GROUP' && e.object_id) campCreator.set(String(e.object_id), owner);
          if (e.object_type === 'CAMPAIGN' && e.object_id) adsetCreator.set(String(e.object_id), owner);
        }

        // Agregados de rendimiento.
        const agg = (keyId: string, keyName: string) => {
          const m = new Map<string, { name: string; status: string | null; sp: number; pu: number; pv: number; cv: number }>();
          for (const r of campRows) {
            const id = String(r[keyId] || ''); if (!id) continue;
            const a = m.get(id) || { name: r[keyName] || id, status: r.status || null, sp: 0, pu: 0, pv: 0, cv: 0 };
            a.sp += n(r.spend); a.pu += n(r.purchases); a.pv += n(r.purchase_value); a.cv += n(r.conversations);
            a.status = r.status || a.status; m.set(id, a);
          }
          return m;
        };
        const campM = agg('campaign_id', 'campaign_name');
        const adsetM = agg('adset_id', 'adset_name');

        const toRow = (id: string, a: any, creator: Map<string, Owner>): RankRow => {
          const roas = a.sp > 0 ? a.pv / a.sp : 0, cpc = a.cv > 0 ? a.sp / a.cv : 0;
          return {
            id, name: a.name, owner: creator.get(id) || 'sin', objective: objOf(a.pu, a.cv), status: a.status,
            spend: +a.sp.toFixed(2), purchases: a.pu, value: a.pv, roas, conv: a.cv, cpc,
          };
        };
        const campaigns = [...campM.entries()].map(([id, a]) => toRow(id, a, campCreator));
        const adsets = [...adsetM.entries()].map(([id, a]) => toRow(id, a, adsetCreator));

        // KPIs globales.
        const spend = campaigns.reduce((s, c) => s + c.spend, 0);
        const purchases = campaigns.reduce((s, c) => s + c.purchases, 0);
        const value = campaigns.reduce((s, c) => s + c.value, 0);
        const conv = campaigns.reduce((s, c) => s + c.conv, 0);
        const waSpend = campaigns.filter((c) => c.objective === 'whatsapp').reduce((s, c) => s + c.spend, 0);
        const venSpend = campaigns.filter((c) => c.objective === 'ventas').reduce((s, c) => s + c.spend, 0);
        const kpis = { spend, purchases, value, roas: venSpend > 0 ? value / venSpend : 0, conv, cpc: conv > 0 ? waSpend / conv : 0, waSpend };

        // Leaderboards.
        const topVentas = (arr: RankRow[]) => arr.filter((c) => c.objective === 'ventas' && c.spend > 0).sort((a, b) => b.roas - a.roas).slice(0, 7);
        const topWa = (arr: RankRow[]) => arr.filter((c) => c.objective === 'whatsapp' && c.conv > 0).sort((a, b) => b.conv - a.conv).slice(0, 7);

        // Rendimiento por gestor (campañas atribuidas).
        const mk = (): OwnerPerf => ({ ventasSpend: 0, purchases: 0, value: 0, roas: 0, waSpend: 0, conv: 0, cpc: 0, campaigns: 0 });
        const ownerPerf: Record<'agencia' | 'ia', OwnerPerf> = { agencia: mk(), ia: mk() };
        let sinCount = 0;
        for (const c of campaigns) {
          if (c.owner !== 'agencia' && c.owner !== 'ia') { sinCount += 1; continue; }
          const t = ownerPerf[c.owner]; t.campaigns += 1;
          if (c.objective === 'ventas') { t.ventasSpend += c.spend; t.purchases += c.purchases; t.value += c.value; }
          else if (c.objective === 'whatsapp') { t.waSpend += c.spend; t.conv += c.conv; }
        }
        (['agencia', 'ia'] as const).forEach((k) => {
          ownerPerf[k].roas = ownerPerf[k].ventasSpend > 0 ? ownerPerf[k].value / ownerPerf[k].ventasSpend : 0;
          ownerPerf[k].cpc = ownerPerf[k].conv > 0 ? ownerPerf[k].waSpend / ownerPerf[k].conv : 0;
        });

        // ── Radiografía de ROAS (conjuntos de ventas) ──────────────────────
        // Estado actual del conjunto: lo deriva del último evento de estado en la
        // bitácora (status no viene en meta_campaigns). Sin evento → activo.
        const adsetStatus = new Map<string, 'activo' | 'inactivo'>();
        for (const e of chRows) { // chRows asc → gana el último
          if (e.object_type !== 'CAMPAIGN' || !e.object_id) continue;
          const nv = String(e.new_value || '').toLowerCase();
          if (nv.includes('inactiv') || nv.includes('paused')) adsetStatus.set(String(e.object_id), 'inactivo');
          else if (nv.includes('activ') || nv.includes('active')) adsetStatus.set(String(e.object_id), 'activo');
        }
        const ventasAdsets = adsets.filter((a) => a.objective === 'ventas' && a.spend > 0);
        const bucket = (key: string, label: string, rows: RankRow[]): RoasBucket => {
          const sp = rows.reduce((s, r) => s + r.spend, 0);
          const pv = rows.reduce((s, r) => s + r.value, 0);
          const pu = rows.reduce((s, r) => s + r.purchases, 0);
          return { key, label, spend: +sp.toFixed(2), value: pv, purchases: pu, roas: sp > 0 ? pv / sp : 0, count: rows.length };
        };
        const roasRadiografia: RoasRadiografia = {
          total: bucket('total', 'Meta · todas', ventasAdsets),
          porEstado: [
            bucket('activo', 'Activos', ventasAdsets.filter((a) => (adsetStatus.get(a.id) || 'activo') === 'activo')),
            bucket('inactivo', 'Inactivos (pausados)', ventasAdsets.filter((a) => adsetStatus.get(a.id) === 'inactivo')),
          ],
          porGestor: [
            bucket('agencia', 'Creados por Agencia', ventasAdsets.filter((a) => a.owner === 'agencia')),
            bucket('ia', 'Creados por IA · Aura', ventasAdsets.filter((a) => a.owner === 'ia')),
            bucket('sin', 'Sin atribuir', ventasAdsets.filter((a) => a.owner === 'sin' || a.owner === 'meta')),
          ],
        };

        // Bitácora + pausas de la IA (lo que ya teníamos).
        const perfFor = (ot: string, id: string) => (ot === 'CAMPAIGN' ? adsetM.get(id) : ot === 'CAMPAIGN_GROUP' ? campM.get(id) : undefined);
        // Actividad (bitácora, conteos, pausas) acotada al periodo seleccionado;
        // la atribución de creador se mantiene con el historial completo (arriba).
        const inRange = (dt: string) => { const d = String(dt || '').slice(0, 10); return d >= FROM && d <= TO; };
        const chRowsR = chRows.filter((e) => inRange(e.change_dt));
        const changes: MetaChangeRow[] = [];
        const counts = { iaPaused: 0, iaPausedAds: 0, iaCreated: 0, iaEdited: 0, agencyPaused: 0 };
        const iaPausedMap = new Map<string, PausedItem>();
        for (const e of chRowsR) {
          const owner = ownerOf(e.actor_name, e.actor_id);
          const action = actionOf(e.action || '', e.old_value, e.new_value);
          const level = LEVEL[e.object_type] || e.object_type || '—';
          changes.push({ dt: e.change_dt, owner, actor: e.actor_name || '—', action, level, name: e.object_name || '—', oldV: e.old_value || null, newV: e.new_value || null });
          if (action === 'pausar') {
            if (owner === 'ia' && e.object_type === 'ADGROUP') counts.iaPausedAds += 1;
            if (owner === 'agencia') counts.agencyPaused += 1;
            if (owner === 'ia' && (e.object_type === 'CAMPAIGN' || e.object_type === 'CAMPAIGN_GROUP')) {
              const p = perfFor(e.object_type, String(e.object_id || ''));
              const sp = p?.sp || 0, pu = p?.pu || 0, pv = p?.pv || 0, cv = p?.cv || 0;
              const obj = objOf(pu, cv), roas = sp > 0 ? pv / sp : 0, cpc = cv > 0 ? sp / cv : 0;
              let impact: Impact = 'neu', reason = '';
              if (obj === 'ventas') {
                if (roas >= GOOD_ROAS) { impact = 'neg'; reason = `pausó un ganador de ventas (ROAS ${roas.toFixed(1)}×)`; }
                else if (roas >= 1) { impact = 'pend'; reason = `pausó ventas con ROAS ${roas.toFixed(1)}×`; }
                else { impact = 'pos'; reason = 'cortó ventas de bajo retorno'; }
              } else if (obj === 'whatsapp') {
                if (cv >= WA_MIN_CONV) { impact = 'neg'; reason = `pausó WhatsApp con ${Math.round(cv)} conversaciones a $${Math.round(cpc)} c/u`; }
                else { impact = 'neu'; reason = 'pausó WhatsApp con pocas conversaciones'; }
              } else { impact = sp > 0 ? 'neu' : 'pos'; reason = sp > 0 ? 'pausó un objeto sin resultado claro' : 'pausó algo sin gasto'; }
              const key = String(e.object_id || e.object_name);
              if (!iaPausedMap.has(key)) iaPausedMap.set(key, { level, name: e.object_name || '—', objective: obj, spend: sp, roas, purchases: pu, value: pv, conv: cv, cpc, impact, reason, dt: e.change_dt });
            }
          } else if (action.startsWith('crear') && owner === 'ia') counts.iaCreated += 1;
          else if (owner === 'ia' && (action === 'editar' || action === 'cambio_presupuesto')) counts.iaEdited += 1;
        }
        counts.iaPaused = iaPausedMap.size;
        const iaPaused = [...iaPausedMap.values()].sort((a, b) => {
          const w = (x: PausedItem) => (x.impact === 'neg' ? 2 : x.impact === 'pend' ? 1 : 0);
          return w(b) - w(a) || b.spend - a.spend;
        });
        const riskValue = iaPaused.filter((x) => x.objective === 'ventas' && x.impact === 'neg').reduce((s, x) => s + x.value, 0);
        const riskConv = iaPaused.filter((x) => x.objective === 'whatsapp' && x.impact === 'neg').reduce((s, x) => s + x.conv, 0);

        const aAgg = new Map<string, { name: string; owner: Owner; count: number }>();
        for (const e of chRowsR) {
          const owner = ownerOf(e.actor_name, e.actor_id);
          const key = (e.actor_name || '?') + '|' + owner;
          const a = aAgg.get(key) || { name: e.actor_name || '(sistema)', owner, count: 0 };
          a.count += 1; aAgg.set(key, a);
        }
        const actors = [...aAgg.values()].sort((a, b) => b.count - a.count);

        const winnersPaused = iaPaused.filter((x) => x.impact === 'neg').length;
        let verdict: Verdict = winnersPaused >= 1
          ? { level: 'restando', headline: `La IA pausó ${winnersPaused} conjunto(s)/campaña(s) que estaban funcionando`, points: [] }
          : { level: 'observacion', headline: 'La IA está activa en Meta; sin daño claro todavía', points: [] };
        const pts: string[] = [];
        const ventasW = iaPaused.filter((x) => x.objective === 'ventas' && x.impact === 'neg');
        const waW = iaPaused.filter((x) => x.objective === 'whatsapp' && x.impact === 'neg');
        if (ventasW.length) pts.push(`Pausó ${ventasW.length} de ventas que vendían — ${Math.round(riskValue).toLocaleString('es-MX')} en ventas en riesgo.`);
        if (waW.length) pts.push(`Pausó ${waW.length} de WhatsApp — ${Math.round(riskConv).toLocaleString('es-MX')} conversaciones en riesgo.`);
        const okPaused = iaPaused.filter((x) => x.impact === 'pos').length;
        if (okPaused) pts.push(`Sí cortó ${okPaused} sin resultado (bien).`);
        if (counts.iaPausedAds) pts.push(`También pausó ${counts.iaPausedAds} anuncios.`);
        if (!pts.length) pts.push('Aún sin pausas relevantes en Meta.');
        verdict.points = pts;

        if (!cancelled) {
          setData({
            kpis, topCampaignsVentas: topVentas(campaigns), topCampaignsWa: topWa(campaigns),
            topAdsetsVentas: topVentas(adsets), topAdsetsWa: topWa(adsets),
            ownerPerf, roas: roasRadiografia, sinCount, verdict, iaPaused, riskValue, riskConv, counts,
            changes: changes.reverse(), actors, from: FROM, hasData: campRows.length > 0 || chRows.length > 0,
          });
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) { setError(e?.message || 'error'); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, FROM, TO]);

  return { data, loading, error };
}
