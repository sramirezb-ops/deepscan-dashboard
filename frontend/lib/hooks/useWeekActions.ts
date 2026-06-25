'use client';

import { useMemo } from 'react';
import { useClient } from '@/lib/useClient';
import { useLeadsOverview } from './useLeadsOverview';
import { useImplementations } from './useImplementations';
import { weekRanges, buildWeekActionables, countOpenActions } from '@/lib/week';

// ============================================================
// useWeekActionablesCount — nº REAL de accionables de "Esta semana"
// ============================================================
// Alimenta el badge dinámico del nav (antes era un 5 hardcodeado y mentiroso).
// Reutiliza exactamente el mismo motor que la vista (lib/week.ts) sobre la
// ventana fija de 7 días, así el badge y la vista nunca se contradicen.
// Devuelve 0 mientras carga o si no hay actividad → el badge simplemente no
// se pinta (cero ruido, honesto).
// ============================================================

export interface WeekActionsCount {
  count: number;
  loading: boolean;
}

export function useWeekActionablesCount(): WeekActionsCount {
  const client = useClient();
  const { range, previous } = useMemo(() => weekRanges(), []);
  const { data, loading } = useLeadsOverview(client.id, range, previous);
  const { items } = useImplementations(client.id, range, ['google', 'tiktok', 'global']);

  const count = useMemo(() => {
    if (!data || !data.hasAny) return 0;
    const actions = buildWeekActionables({
      data,
      cplTarget: client.cplTarget,
      currency: client.currency,
      implementationsCount: items.length,
    });
    return countOpenActions(actions);
  }, [data, items.length, client.cplTarget, client.currency]);

  return { count, loading };
}
