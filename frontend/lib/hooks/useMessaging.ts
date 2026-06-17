'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DateRange } from '@/lib/period';

// ============================================================
// useMessaging — campañas de MENSAJES de Meta (conversaciones iniciadas)
// ============================================================
// Lee meta_messaging (adsets con optimization_goal=CONVERSATIONS), que trae
// la métrica real "conversaciones con mensaje iniciadas" y el destino real
// (WhatsApp / Messenger / Instagram Direct) tomado del destination_type del
// adset. Una fila = campaña × adset × día → agregamos por destino y por
// campaña, respetando el filtro global de fechas. Si no hay filas, no se
// inventa nada.
// ============================================================

export interface MessagingCampaignRow {
  campaign: string;
  destination: string;
  conversations: number;
  spend: number;
  costPerConversation: number; // spend / conversations
}

export interface MessagingDestinationRow {
  destination: string;
  conversations: number;
  spend: number;
  costPerConversation: number;
}

export interface MessagingTotals {
  conversations: number;
  spend: number;
  costPerConversation: number;
}

export interface MessagingData {
  campaigns: MessagingCampaignRow[]; // ordenadas por conversaciones desc
  destinations: MessagingDestinationRow[]; // ordenadas por conversaciones desc
  totals: MessagingTotals;
  campaignCount: number;
  from: string;
  to: string;
}

export interface UseMessagingResult {
  data: MessagingData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RawRow {
  campaign_name: string | null;
  destination: string | null;
  conversations: number | null;
  spend: number | null;
}

const SELECT = 'campaign_name, destination, conversations, spend';
const PAGE = 1000;

async function fetchRows(clientId: string, from: string, to: string): Promise<RawRow[]> {
  const all: RawRow[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('meta_messaging')
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

/** Agrupa por campaña + destino (una campaña puede tener varios adsets/días). */
function groupByCampaign(rows: RawRow[]): MessagingCampaignRow[] {
  const map = new Map<string, MessagingCampaignRow>();

  for (const r of rows) {
    const campaign = r.campaign_name || '(sin nombre)';
    const destination = r.destination || 'Sin clasificar';
    const key = `${campaign}__${destination}`;
    let c = map.get(key);
    if (!c) {
      c = { campaign, destination, conversations: 0, spend: 0, costPerConversation: 0 };
      map.set(key, c);
    }
    c.conversations += Number(r.conversations) || 0;
    c.spend += Number(r.spend) || 0;
  }

  const list = Array.from(map.values());
  for (const c of list) {
    c.costPerConversation = c.conversations > 0 ? c.spend / c.conversations : 0;
  }
  list.sort((a, b) => b.conversations - a.conversations || b.spend - a.spend);
  return list;
}

/** Agrupa por destino (WhatsApp / Messenger / Instagram Direct / Sin clasificar). */
function groupByDestination(rows: RawRow[]): MessagingDestinationRow[] {
  const map = new Map<string, MessagingDestinationRow>();

  for (const r of rows) {
    const destination = r.destination || 'Sin clasificar';
    let d = map.get(destination);
    if (!d) {
      d = { destination, conversations: 0, spend: 0, costPerConversation: 0 };
      map.set(destination, d);
    }
    d.conversations += Number(r.conversations) || 0;
    d.spend += Number(r.spend) || 0;
  }

  const list = Array.from(map.values());
  for (const d of list) {
    d.costPerConversation = d.conversations > 0 ? d.spend / d.conversations : 0;
  }
  list.sort((a, b) => b.conversations - a.conversations || b.spend - a.spend);
  return list;
}

function sumTotals(rows: RawRow[]): MessagingTotals {
  let conversations = 0;
  let spend = 0;
  for (const r of rows) {
    conversations += Number(r.conversations) || 0;
    spend += Number(r.spend) || 0;
  }
  return {
    conversations,
    spend,
    costPerConversation: conversations > 0 ? spend / conversations : 0,
  };
}

export function useMessaging(clientId: string, range: DateRange): UseMessagingResult {
  const [data, setData] = useState<MessagingData | null>(null);
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
        const rows = await fetchRows(clientId, range.from, range.to);
        if (cancelled) return;

        const campaigns = groupByCampaign(rows);
        const destinations = groupByDestination(rows);
        const totals = sumTotals(rows);

        setData({
          campaigns,
          destinations,
          totals,
          campaignCount: campaigns.length,
          from: range.from,
          to: range.to,
        });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useMessaging]', e);
        setError(e?.message || 'Error desconocido al cargar mensajes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [clientId, range.from, range.to, tick]);

  return { data, loading, error, refresh: () => setTick((x) => x + 1) };
}
