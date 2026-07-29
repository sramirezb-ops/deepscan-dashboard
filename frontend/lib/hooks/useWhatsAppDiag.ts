'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DateRange } from '@/lib/period';

// ============================================================
// useWhatsAppDiag — hoja WhatsApp (diagnóstico de conversaciones)
// ------------------------------------------------------------
// Campañas de MENSAJERÍA divididas en dos fases:
//   • Presentación (tráfico frío)   • Evaluación (tráfico tibio)
// Fuente ÚNICA de conversaciones/gasto: meta_campaigns a nivel anuncio
// (internamente consistente: el gasto cuadra con la suma de anuncios).
// meta_ad_creatives → media por anuncio. meta_breakdowns → plataforma.
//
// Estado del anuncio (activo / pausado / rechazado) = effective_status más
// reciente por anuncio (Meta lo guarda por fecha; tomamos la fecha máxima con
// estado no vacío). Los anuncios se agrupan POR AD SET, activos primero, sin
// mezclar conjuntos. Nada se inventa: si no hay filas, la vista lo dice.
// ============================================================

const PAGE = 1000;
const n = (v: unknown) => Number(v || 0);
const div = (a: number, b: number, d = 2) => (b ? +(a / b).toFixed(d) : 0);

export type WaPhase = 'Presentación' | 'Evaluación';
function phaseOf(camp: string | null): WaPhase | null {
  const c = camp || '';
  if (/^\s*presentaci/i.test(c)) return 'Presentación';
  if (/^\s*evaluaci/i.test(c)) return 'Evaluación';
  return null;
}

export type WaStCls = 'active' | 'paused' | 'rejected';
// effective_status de Meta (solo se usa si el conector lo trae FRESCO dentro del período).
const ST: Record<string, [string, WaStCls]> = {
  ACTIVE: ['Activo', 'active'],
  PAUSED: ['Pausado', 'paused'],
  ADSET_PAUSED: ['Conjunto en pausa', 'paused'],
  CAMPAIGN_PAUSED: ['Campaña en pausa', 'paused'],
  DISAPPROVED: ['Rechazado', 'rejected'],
  WITH_ISSUES: ['Con problemas', 'rejected'],
  IN_PROCESS: ['En revisión', 'paused'],
  PENDING_REVIEW: ['En revisión', 'paused'],
  PENDING_BILLING_INFO: ['Falta pago', 'paused'],
};
function stInfo(s: string): [string, WaStCls] {
  if (ST[s]) return ST[s];
  return s ? [s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' '), 'paused'] : ['Sin estado', 'paused'];
}

// Resta n días a una fecha YYYY-MM-DD (en UTC, sin líos de zona horaria).
function daysBefore(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export interface WaAd {
  ad_id: string; name: string; phase: WaPhase; adset: string;
  status: string; st_label: string; st_cls: WaStCls; active: boolean;
  spend: number; impr: number; conv: number; cost_conv: number; ctr: number; cpm: number;
  is_video: boolean; video_id: string; image_url: string; thumbnail_url: string;
  title: string; body: string; cta: string;
}
export interface WaDist { name: string; pct: number; conv: number; active: boolean; }
export interface WaAdset {
  name: string; phase: WaPhase; spend: number; conv: number; impr: number; cost_conv: number;
  nads: number; nactive: number; nrejected: number; top: number; dist: WaDist[]; ads: WaAd[];
}
export interface WaPhaseTotals { spend: number; impr: number; conv: number; cost_conv: number; cpm: number; }
export interface WaPlat { key: string; spend: number; pct: number; }
export interface WaDaily { date: string; conv: number; spend: number; cost_conv: number; }

export interface WhatsAppData {
  from: string; to: string;
  phases: Record<string, WaPhaseTotals>;
  totalConv: number; totalSpend: number; costConvAll: number;
  adsets: WaAdset[];
  ads: WaAd[];
  plats: Record<string, WaPlat[]>;
  daily: WaDaily[];
  hasData: boolean;
}

async function page<T>(table: string, cols: string, clientId: string, extra?: (q: any) => any): Promise<T[]> {
  const all: T[] = [];
  let off = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase.from(table).select(cols).eq('client_id', clientId).range(off, off + PAGE - 1);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data || []) as T[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    off += PAGE;
  }
  return all;
}

interface AdAcc {
  ad_id: string; name: string; phase: WaPhase; adset: string;
  spend: number; impr: number; link: number; conv: number;
  stDate: string; status: string; lastSpend: string;
}

export function useWhatsAppDiag(clientId: string, range: DateRange) {
  const [data, setData] = useState<WhatsAppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const from = range.from, to = range.to;
        // Creativos: intentamos traer `status` (estado ACTUAL de Meta, snapshot por
        // corrida del ETL). Si la columna aún no existe (migración 0016 sin correr),
        // degradamos con elegancia y usamos "entrega reciente" como señal.
        const fetchCreatives = async () => {
          try {
            return await page<any>('meta_ad_creatives',
              'ad_id,ad_name,is_video,image_url,thumbnail_url,video_id,title,body,cta,status', clientId);
          } catch {
            return await page<any>('meta_ad_creatives',
              'ad_id,ad_name,is_video,image_url,thumbnail_url,video_id,title,body,cta', clientId);
          }
        };
        const [mc, cr, bd, msg] = await Promise.all([
          page<any>('meta_campaigns',
            'date,campaign_name,adset_name,ad_id,ad_name,status,spend,impressions,link_clicks,clicks,conversations',
            clientId, (q) => q.gte('date', from).lte('date', to)),
          fetchCreatives(),
          page<any>('meta_breakdowns',
            'level,breakdown_type,breakdown_value,campaign_name,spend', clientId),
          // sólo las campañas de MENSAJERÍA (optimización = conversaciones) viven en
          // meta_messaging; las usamos para no confundir otras campañas que empiezan
          // con "Presentación/Evaluación" (visitas al perfil, web, etc.).
          page<any>('meta_messaging', 'campaign_name', clientId, (q) => q.gte('date', from).lte('date', to)),
        ]);

        const msgCamps = new Set<string>(msg.map((r: any) => r.campaign_name).filter(Boolean));

        // "Entrega reciente" = gastó en los últimos días del período. Es la señal
        // honesta de qué anuncio está corriendo AHORA (el effective_status de Meta
        // dejó de sincronizarse y estaría obsoleto). Ventana = últimos 4 días.
        const deliverCut = daysBefore(to, 3);

        // ---- anuncios de mensajería agregados por ad_id ----
        const adAcc: Record<string, AdAcc> = {};
        const daily: Record<string, { conv: number; spend: number }> = {};
        const phaseAcc: Record<string, { spend: number; impr: number; conv: number }> = {};
        for (const r of mc) {
          const ph = phaseOf(r.campaign_name);
          if (!ph || !msgCamps.has(r.campaign_name)) continue;
          const id = r.ad_id || `(sin id) ${r.ad_name || ''}`;
          const A = (adAcc[id] ||= {
            ad_id: id, name: r.ad_name || '', phase: ph, adset: r.adset_name || '(sin conjunto)',
            spend: 0, impr: 0, link: 0, conv: 0, stDate: '', status: '', lastSpend: '',
          });
          A.spend += n(r.spend); A.impr += n(r.impressions);
          A.link += n(r.link_clicks) || n(r.clicks); A.conv += n(r.conversations);
          if (n(r.spend) > 0 && (r.date || '') > A.lastSpend) A.lastSpend = r.date || '';
          // estado de Meta más reciente (fecha máxima con estado no vacío)
          if (r.status && (r.date || '') >= A.stDate) { A.stDate = r.date || ''; A.status = r.status; }
          // diario y fase
          const dd = (daily[r.date] ||= { conv: 0, spend: 0 });
          dd.conv += n(r.conversations); dd.spend += n(r.spend);
          const P = (phaseAcc[ph] ||= { spend: 0, impr: 0, conv: 0 });
          P.spend += n(r.spend); P.impr += n(r.impressions); P.conv += n(r.conversations);
        }

        // media por anuncio
        const media: Record<string, any> = {};
        for (const c of cr) media[c.ad_id] = c;

        // construir anuncios (solo los que gastaron o convirtieron en el rango)
        const ads: WaAd[] = Object.values(adAcc)
          .filter((A) => A.spend > 0 || A.conv > 0)
          .map((A) => {
            const c = media[A.ad_id] || {};
            // Estado ACTUAL de Meta desde meta_ad_creatives (snapshot fiable por
            // corrida). Si no está (migración/ETL sin correr), caemos a "entrega
            // reciente" para no mostrar nada obsoleto.
            const curStatus: string = (c.status || '').toUpperCase();
            const delivering = !!A.lastSpend && A.lastSpend >= deliverCut;
            let active: boolean, st_label: string, st_cls: WaStCls;
            if (curStatus) {
              const [lbl, cls] = stInfo(curStatus);
              active = curStatus === 'ACTIVE'; st_label = lbl; st_cls = cls;
            } else {
              active = delivering;
              st_label = delivering ? 'En entrega' : 'Sin entrega reciente';
              st_cls = delivering ? 'active' : 'paused';
            }
            return {
              ad_id: A.ad_id, name: A.name || c.ad_name || '', phase: A.phase, adset: A.adset,
              status: curStatus, st_label, st_cls, active,
              spend: +A.spend.toFixed(2), impr: A.impr, conv: A.conv,
              cost_conv: div(A.spend, A.conv), ctr: div(100 * A.link, A.impr), cpm: div(1000 * A.spend, A.impr),
              is_video: !!c.is_video, video_id: c.video_id || '', image_url: c.image_url || '',
              thumbnail_url: c.thumbnail_url || '', title: c.title || '', body: c.body || '', cta: c.cta || '',
            };
          });

        // ---- agrupar por ad set ----
        const byAdset: Record<string, WaAd[]> = {};
        for (const a of ads) (byAdset[a.adset] ||= []).push(a);
        const adsets: WaAdset[] = Object.entries(byAdset).map(([name, list]) => {
          const phase = list[0].phase;
          const spend = list.reduce((s, a) => s + a.spend, 0);
          const conv = list.reduce((s, a) => s + a.conv, 0);
          const impr = list.reduce((s, a) => s + a.impr, 0);
          const byImpr = [...list].sort((x, y) => y.impr - x.impr);
          const tot = impr || 1;
          const dist: WaDist[] = byImpr.slice(0, 6).map((a) => ({
            name: a.name, pct: Math.round((100 * a.impr) / tot), conv: a.conv, active: a.active,
          }));
          const resto = byImpr.slice(6).reduce((s, a) => s + a.impr, 0);
          if (resto > 0) dist.push({ name: `+${byImpr.length - 6} más`, pct: Math.round((100 * resto) / tot), conv: byImpr.slice(6).reduce((s, a) => s + a.conv, 0), active: false });
          const ordered = [...list].sort((x, y) => Number(y.active) - Number(x.active) || y.conv - x.conv || y.spend - x.spend);
          return {
            name, phase, spend: +spend.toFixed(2), conv, impr, cost_conv: div(spend, conv),
            nads: list.length, nactive: list.filter((a) => a.active).length,
            nrejected: list.filter((a) => a.st_cls === 'rejected').length,
            top: byImpr.length ? Math.round((100 * byImpr[0].impr) / tot) : 0,
            dist, ads: ordered,
          };
        }).sort((a, b) => (a.phase === 'Presentación' ? 0 : 1) - (b.phase === 'Presentación' ? 0 : 1) || b.spend - a.spend);

        // ---- totales por fase ----
        const phases: Record<string, WaPhaseTotals> = {};
        for (const [ph, P] of Object.entries(phaseAcc)) {
          phases[ph] = { spend: +P.spend.toFixed(2), impr: P.impr, conv: P.conv, cost_conv: div(P.spend, P.conv), cpm: div(1000 * P.spend, P.impr) };
        }
        const totalSpend = Object.values(phaseAcc).reduce((s, P) => s + P.spend, 0);
        const totalConv = Object.values(phaseAcc).reduce((s, P) => s + P.conv, 0);

        // ---- plataforma por fase (gasto; los breakdowns capturan compra, no conversación) ----
        const platAcc: Record<string, Record<string, number>> = {};
        for (const r of bd) {
          if (r.level !== 'adset' || r.breakdown_type !== 'publisher_platform') continue;
          const ph = phaseOf(r.campaign_name);
          if (!ph || !msgCamps.has(r.campaign_name)) continue;
          const P = (platAcc[ph] ||= {});
          P[r.breakdown_value] = (P[r.breakdown_value] || 0) + n(r.spend);
        }
        const plats: Record<string, WaPlat[]> = {};
        for (const [ph, P] of Object.entries(platAcc)) {
          const tot = Object.values(P).reduce((s, v) => s + v, 0) || 1;
          plats[ph] = Object.entries(P).filter(([, v]) => v >= 1)
            .map(([key, v]) => ({ key, spend: Math.round(v), pct: Math.round((100 * v) / tot) }))
            .sort((a, b) => b.spend - a.spend);
        }

        const out: WhatsAppData = {
          from, to, phases, totalConv, totalSpend: +totalSpend.toFixed(2),
          costConvAll: div(totalSpend, totalConv),
          adsets,
          ads: [...ads].sort((x, y) => Number(y.active) - Number(x.active) || y.conv - x.conv),
          plats,
          daily: Object.entries(daily).map(([date, d]) => ({ date, conv: d.conv, spend: +d.spend.toFixed(2), cost_conv: div(d.spend, d.conv) })).sort((a, b) => a.date.localeCompare(b.date)),
          hasData: ads.length > 0,
        };
        if (alive) { setData(out); setLoading(false); }
      } catch (e: any) {
        if (alive) { setError(e?.message || 'error'); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [clientId, range.from, range.to]);

  return { data, loading, error };
}
