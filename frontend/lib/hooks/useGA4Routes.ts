'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
// useGA4Routes — exploración de ruta de 1 salto (ga4_routes)
// ============================================================
// Lee las transiciones "de dónde vino → a qué página llegó" que el ETL derivó
// de la dimensión pageReferrer de GA4 (etl/extractors :: extract_ga4_routes).
// La tabla se agrega por VENTANA (no por fecha): es la foto de la última
// sincronización, así que esta hoja no filtra por rango — muestra los patrones
// de navegación vigentes. Si la tabla aún no existe (migración sin aplicar) o
// no hay filas, devuelve null → la vista muestra un aviso honesto.
// ============================================================

export type RouteKind = 'internal' | 'external' | 'direct';

export interface RouteRow {
  fromLabel: string;
  toPath: string;
  kind: RouteKind;
  sessions: number;
  views: number;
}

export interface GA4RoutesData {
  internal: RouteRow[]; // caminos página→página, por sesiones desc
  external: { source: string; sessions: number }[]; // entradas por fuente externa
  existsEver: boolean;
}

interface RawRoute {
  from_label: string | null;
  to_path: string | null;
  kind: string | null;
  sessions: number | null;
  views: number | null;
}

export function useGA4Routes(clientId: string) {
  const [data, setData] = useState<GA4RoutesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: rows, error: err } = await supabase
          .from('ga4_routes')
          .select('from_label, to_path, kind, sessions, views')
          .eq('client_id', clientId)
          .order('sessions', { ascending: false })
          .limit(2000);

        if (cancelled) return;
        // Tabla inexistente / sin permiso → estado "pendiente" honesto.
        if (err) {
          setData(null);
          return;
        }

        const all = (rows || []) as RawRoute[];
        if (all.length === 0) {
          setData({ internal: [], external: [], existsEver: false });
          return;
        }

        const internal: RouteRow[] = [];
        const extMap = new Map<string, number>();
        for (const r of all) {
          const kind = (r.kind || '') as RouteKind;
          const row: RouteRow = {
            fromLabel: (r.from_label || '').trim(),
            toPath: (r.to_path || '').trim(),
            kind,
            sessions: Number(r.sessions) || 0,
            views: Number(r.views) || 0,
          };
          if (kind === 'internal') internal.push(row);
          else if (kind === 'external') extMap.set(row.fromLabel, (extMap.get(row.fromLabel) ?? 0) + row.sessions);
        }
        const external = Array.from(extMap.entries())
          .map(([source, sessions]) => ({ source, sessions }))
          .sort((a, b) => b.sessions - a.sessions);

        setData({ internal, external, existsEver: true });
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || 'Error cargando rutas de GA4');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [clientId]);

  return { data, loading, error };
}
