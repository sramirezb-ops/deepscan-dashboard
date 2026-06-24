'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { DateRange } from '@/lib/period';

// ============================================================
// useImplementations — bitácora de implementaciones de la agencia
// ============================================================
// Lee la tabla `implementations` (una fila = una acción manual: "subimos
// creativos", "pausamos campaña X") que el ETL sincroniza desde un Google
// Sheet. Sirve para dibujar marcadores sobre la tendencia diaria y así explicar
// la CAUSA detrás de un cambio.
//
// Honestidad de estados (igual que useTikTokComments):
//   · Si la tabla aún no existe (migración sin aplicar) o no hay permiso, NO
//     rompemos: devolvemos lista vacía y la sección simplemente no aparece.
//   · Lista vacía en el rango → no se dibuja ningún marcador (cero ruido).
//
// `channel` filtra qué implementaciones aplican a una vista: 'tiktok' + las
// 'global' (que valen para todos los canales, ej. "cambiamos la landing").
// ============================================================

export interface ImplementationItem {
  date: string; // 'YYYY-MM-DD'
  channel: string; // tiktok | meta | google | global
  title: string;
  detail: string | null;
  kind: string; // creativo | presupuesto | segmentacion | ...
}

interface RawImplementation {
  date: string | null;
  channel: string | null;
  title: string | null;
  detail: string | null;
  kind: string | null;
}

const SELECT = 'date, channel, title, detail, kind';

export interface UseImplementationsResult {
  items: ImplementationItem[]; // ordenadas por fecha ascendente
  loading: boolean;
  error: string | null;
}

/**
 * Trae las implementaciones del rango para los canales indicados.
 * @param channels canales a incluir (ej. ['tiktok', 'global']).
 */
export function useImplementations(
  clientId: string,
  range: DateRange,
  channels: string[]
): UseImplementationsResult {
  const [items, setItems] = useState<ImplementationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Clave estable de los canales para no re-disparar el efecto en cada render.
  const channelKey = channels.join(',');

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: qErr } = await supabase
          .from('implementations')
          .select(SELECT)
          .eq('client_id', clientId)
          .in('channel', channelKey.split(','))
          .gte('date', range.from)
          .lte('date', range.to)
          .order('date', { ascending: true });

        if (cancelled) return;

        // Tabla inexistente / sin permiso → lista vacía (marcador honesto).
        if (qErr) {
          console.warn('[useImplementations] tabla no disponible aún:', qErr.message);
          setItems([]);
          return;
        }

        const rows = (data || []) as RawImplementation[];
        setItems(
          rows
            .filter((r) => r.date && r.title)
            .map((r) => ({
              date: r.date as string,
              channel: r.channel || 'global',
              title: r.title as string,
              detail: r.detail || null,
              kind: r.kind || 'otro',
            }))
        );
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useImplementations]', e);
        setError(e?.message || 'Error desconocido al cargar la bitácora');
        setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [clientId, range.from, range.to, channelKey]);

  return { items, loading, error };
}
