'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
// useMetaAgenciaVsIA — Meta: ¿la IA de Aura ayuda o resta? (objetivo-aware)
// ============================================================
// Firma por ACTOR del log de actividades (no por nombre de campaña):
//   IA (Aura) = "Christian Desarrollatech"; humanos = agencia; "Meta" = sistema.
// Cada objeto se juzga por SU objetivo:
//   · VENTAS   → ROAS de compra (purchase_value / spend)
//   · WHATSAPP → conversaciones + costo por conversación
// Niveles legacy de Meta: CAMPAIGN_GROUP=Campaña, CAMPAIGN=Conjunto, ADGROUP=Anuncio.
// Estado llega localizado ("Activo"/"Inactivo") → re-derivamos pausar/activar.
// ============================================================

const PAGE = 1000;
const n = (v: unknown) => Number(v || 0);
const FROM = '2026-09-01';
const IA_NAME = 'Christian Desarrollatech';
const IA_ID = '122341483712074578';
const WA_MIN_CONV = 20;   // conversaciones para considerar un conjunto de WhatsApp "que funcionaba"
const GOOD_ROAS = 2;

export type Owner = 'agencia' | 'ia' | 'meta';
export type Objective = 'ventas' | 'whatsapp' | 'otro';
export type Impact = 'pos' | 'neg' | 'pend' | 'neu';
const LEVEL: Record<string, string> = { CAMPAIGN_GROUP: 'Campaña', CAMPAIGN: 'Conjunto', ADGROUP: 'Anuncio', ACCOUNT: 'Cuenta' };

export interface PausedItem {
  level: string; name: string; objective: Objective;
  spend: number; roas: number; purchases: number; value: number; conv: number; cpc: number;
  impact: Impact; reason: string; dt: string;
}
export interface MetaChangeRow {
  dt: string; owner: Owner; actor: string; action: string; level: string; name: string;
  oldV: string | null; newV: string | null;
}
export interface Verdict { level: 'bien' | 'observacion' | 'restando'; headline: string; points: string[] }

export interface MetaAgenciaVsIAData {
  verdict: Verdict;
  iaPaused: PausedItem[];           // conjuntos/campañas que la IA pausó (hero)
  riskValue: number;                // $ en ventas que pausó (ganadores)
  riskConv: number;                 // conversaciones que pausó (WhatsApp)
  counts: { iaPaused: number; iaPausedAds: number; iaCreated: number; iaEdited: number; agencyPaused: number };
  changes: MetaChangeRow[];
  actors: { name: string; owner: Owner; count: number }[];
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

const ownerOf = (actorName?: string | null, actorId?: string | null): Owner => {
  if (actorName === IA_NAME || String(actorId) === IA_ID) return 'ia';
  if (actorName === 'Meta' || !actorId || String(actorId) === '0') return 'meta';
  return 'agencia';
};
// Re-deriva pausar/activar desde el estado localizado; si no, usa la acción guardada.
const actionOf = (stored: string, oldV?: string | null, newV?: string | null): string => {
  const nv = String(newV || '').toLowerCase();
  if (nv.includes('inactiv') || nv.includes('paused')) return 'pausar';
  if ((nv.includes('activ') && !nv.includes('inactiv')) || nv.includes('active')) {
    return stored === 'estado' ? 'activar' : stored;
  }
  return stored;
};

export function useMetaAgenciaVsIA(clientId: string) {
  const [data, setData] = useState<MetaAgenciaVsIAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [chRows, campRows] = await Promise.all([
          pageAll<any>('meta_change_events',
            'change_dt, actor_name, actor_id, action, object_type, object_id, object_name, old_value, new_value, event_type',
            (q) => q.eq('client_id', clientId).order('change_dt', { ascending: true })),
          pageAll<any>('meta_campaigns',
            'campaign_id, adset_id, ad_id, spend, purchases, purchase_value, conversations',
            (q) => q.eq('client_id', clientId).gte('date', FROM)),
        ]);
        if (cancelled) return;

        // Rendimiento por nivel (conjunto = adset_id, campaña = campaign_id).
        const byAdset = new Map<string, { sp: number; pu: number; pv: number; cv: number }>();
        const byCamp = new Map<string, { sp: number; pu: number; pv: number; cv: number }>();
        const add = (m: Map<string, any>, k: string, r: any) => {
          if (!k) return; const a = m.get(k) || { sp: 0, pu: 0, pv: 0, cv: 0 };
          a.sp += n(r.spend); a.pu += n(r.purchases); a.pv += n(r.purchase_value); a.cv += n(r.conversations); m.set(k, a);
        };
        for (const r of campRows) { add(byAdset, String(r.adset_id || ''), r); add(byCamp, String(r.campaign_id || ''), r); }

        const perfFor = (objectType: string, objectId: string) => {
          if (objectType === 'CAMPAIGN') return byAdset.get(objectId);
          if (objectType === 'CAMPAIGN_GROUP') return byCamp.get(objectId);
          return undefined;
        };
        const objectiveOf = (p?: { pu: number; cv: number }): Objective =>
          !p ? 'otro' : p.pu > 0 ? 'ventas' : p.cv > 0 ? 'whatsapp' : 'otro';

        // Bitácora + conteos.
        const changes: MetaChangeRow[] = [];
        const counts = { iaPaused: 0, iaPausedAds: 0, iaCreated: 0, iaEdited: 0, agencyPaused: 0 };
        const iaPausedMap = new Map<string, PausedItem>(); // dedupe por objeto
        for (const e of chRows) {
          const owner = ownerOf(e.actor_name, e.actor_id);
          const action = actionOf(e.action || '', e.old_value, e.new_value);
          const level = LEVEL[e.object_type] || e.object_type || '—';
          changes.push({
            dt: e.change_dt, owner, actor: e.actor_name || '—', action, level,
            name: e.object_name || '—', oldV: e.old_value || null, newV: e.new_value || null,
          });
          if (action === 'pausar') {
            if (owner === 'ia') { if (e.object_type === 'ADGROUP') counts.iaPausedAds += 1; }
            if (owner === 'agencia') counts.agencyPaused += 1;
            // Hero: conjuntos y campañas que la IA pausó, con su objetivo/veredicto.
            if (owner === 'ia' && (e.object_type === 'CAMPAIGN' || e.object_type === 'CAMPAIGN_GROUP')) {
              const p = perfFor(e.object_type, String(e.object_id || ''));
              const obj = objectiveOf(p);
              const sp = p?.sp || 0, pu = p?.pu || 0, pv = p?.pv || 0, cv = p?.cv || 0;
              const roas = sp > 0 ? pv / sp : 0, cpc = cv > 0 ? sp / cv : 0;
              let impact: Impact = 'neu', reason = '';
              if (obj === 'ventas') {
                if (roas >= GOOD_ROAS) { impact = 'neg'; reason = `pausó un ganador de ventas (ROAS ${roas.toFixed(1)}×)`; }
                else if (roas >= 1) { impact = 'pend'; reason = `pausó ventas con ROAS ${roas.toFixed(1)}×`; }
                else { impact = 'pos'; reason = 'cortó ventas de bajo retorno'; }
              } else if (obj === 'whatsapp') {
                if (cv >= WA_MIN_CONV) { impact = 'neg'; reason = `pausó WhatsApp con ${Math.round(cv)} conversaciones a $${Math.round(cpc)} c/u`; }
                else { impact = 'neu'; reason = 'pausó WhatsApp con pocas conversaciones'; }
              } else {
                impact = sp > 0 ? 'neu' : 'pos'; reason = sp > 0 ? 'pausó un objeto sin resultado claro' : 'pausó algo sin gasto';
              }
              const key = String(e.object_id || e.object_name);
              const prev = iaPausedMap.get(key);
              if (!prev) iaPausedMap.set(key, { level, name: e.object_name || '—', objective: obj, spend: sp, roas, purchases: pu, value: pv, conv: cv, cpc, impact, reason, dt: e.change_dt });
            }
          } else if (action.startsWith('crear') && owner === 'ia') counts.iaCreated += 1;
          else if (owner === 'ia' && (action === 'editar' || action === 'cambio_presupuesto')) counts.iaEdited += 1;
        }
        counts.iaPaused = [...iaPausedMap.values()].length;
        const iaPaused = [...iaPausedMap.values()].sort((a, b) => {
          const w = (x: PausedItem) => (x.impact === 'neg' ? 2 : x.impact === 'pend' ? 1 : 0);
          return w(b) - w(a) || b.spend - a.spend;
        });
        const riskValue = iaPaused.filter((x) => x.objective === 'ventas' && x.impact === 'neg').reduce((s, x) => s + x.value, 0);
        const riskConv = iaPaused.filter((x) => x.objective === 'whatsapp' && x.impact === 'neg').reduce((s, x) => s + x.conv, 0);

        // Actores.
        const aAgg = new Map<string, { name: string; owner: Owner; count: number }>();
        for (const e of chRows) {
          const owner = ownerOf(e.actor_name, e.actor_id);
          const key = (e.actor_name || '?') + '|' + owner;
          const a = aAgg.get(key) || { name: e.actor_name || '(sistema)', owner, count: 0 };
          a.count += 1; aAgg.set(key, a);
        }
        const actors = [...aAgg.values()].sort((a, b) => b.count - a.count);

        // Veredicto.
        const winnersPaused = iaPaused.filter((x) => x.impact === 'neg').length;
        let verdict: Verdict;
        if (winnersPaused >= 1) {
          verdict = { level: 'restando', headline: `La IA pausó ${winnersPaused} conjunto(s) que estaban funcionando`, points: [] };
        } else if (counts.iaCreated > 0) {
          verdict = { level: 'observacion', headline: 'La IA está activa en Meta; sin daño claro todavía', points: [] };
        } else {
          verdict = { level: 'observacion', headline: 'La IA en observación en Meta', points: [] };
        }
        const pts: string[] = [];
        const ventasW = iaPaused.filter((x) => x.objective === 'ventas' && x.impact === 'neg');
        const waW = iaPaused.filter((x) => x.objective === 'whatsapp' && x.impact === 'neg');
        if (ventasW.length) pts.push(`Pausó ${ventasW.length} conjunto(s) de ventas que vendían — pone en riesgo ${Math.round(riskValue).toLocaleString('es-MX')} en ventas.`);
        if (waW.length) pts.push(`Pausó ${waW.length} conjunto(s) de WhatsApp — ${Math.round(riskConv).toLocaleString('es-MX')} conversaciones en riesgo.`);
        const okPaused = iaPaused.filter((x) => x.impact === 'pos').length;
        if (okPaused) pts.push(`Sí cortó ${okPaused} sin resultado (bien).`);
        if (counts.iaPausedAds) pts.push(`También pausó ${counts.iaPausedAds} anuncios.`);
        if (!pts.length) pts.push('Aún sin pausas relevantes en Meta.');
        verdict.points = pts;

        if (!cancelled) {
          setData({ verdict, iaPaused, riskValue, riskConv, counts, changes: changes.reverse(), actors, from: FROM, hasData: chRows.length > 0 });
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
