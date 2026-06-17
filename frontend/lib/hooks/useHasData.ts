'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
// useHasData — ¿este conector ya trae datos reales?
// ============================================================
// Cuenta filas (head:true, sin traer datos) de una tabla para un cliente.
// Distingue tres estados que el tablero usa para mostrar avisos honestos:
//   · exists=false           → la tabla no existe aún (conector sin conectar)
//   · exists=true, count=0   → conectado pero sin datos todavía
//   · count>0                → hay datos reales (la vista puede pintarlos)
// ============================================================

export interface HasDataResult {
  exists: boolean; // la tabla existe en la base
  count: number; // filas para este cliente
  hasData: boolean; // count > 0
  loading: boolean;
  error: string | null;
}

export function useHasData(table: string, clientId: string): HasDataResult {
  const [exists, setExists] = useState(true);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId || !table) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const { count: c, error: err } = await supabase
          .from(table)
          .select('id', { count: 'exact', head: true })
          .eq('client_id', clientId);

        if (cancelled) return;

        if (err) {
          // 42P01 / PGRST205 → la tabla no existe. Lo tratamos como "no conectado".
          const code = (err as any)?.code || '';
          const msg = err.message || '';
          if (
            code === '42P01' ||
            code === 'PGRST205' ||
            /does not exist|could not find the table/i.test(msg)
          ) {
            setExists(false);
            setCount(0);
          } else {
            setError(msg || 'Error consultando el conector');
          }
          return;
        }

        setExists(true);
        setCount(c || 0);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || 'Error consultando el conector');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [table, clientId]);

  return { exists, count, hasData: count > 0, loading, error };
}
