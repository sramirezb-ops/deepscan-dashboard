'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Diagnóstico del bot (UChat) para un cliente. Trae la fila más reciente
// (último mes) de uchat_bot_diagnostics: impedimentos + snapshot como JSONB.
export interface UchatBotData {
  period: string;
  impediments: unknown;
  snapshot: unknown;
}

export function useUchatBot(clientId: string) {
  const [data, setData] = useState<UchatBotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    supabase
      .from('uchat_bot_diagnostics')
      .select('period, impediments, snapshot')
      .eq('client_id', clientId)
      .order('period', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data: row, error: err }) => {
        if (!alive) return;
        if (err) {
          setError(err.message);
          setData(null);
        } else {
          setData((row as UchatBotData) ?? null);
        }
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [clientId]);

  return { data, loading, error };
}
