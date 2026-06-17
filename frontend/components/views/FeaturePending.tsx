'use client';

import { useClient } from '@/lib/useClient';
import { EmptyState } from '@/components/ui/EmptyState';

// ============================================================
// FeaturePending — aviso honesto para FUNCIONES aún sin construir
// ============================================================
// A diferencia de ConnectorPending (que revisa una tabla/conector),
// esto es para funciones derivadas o de IA que todavía no existen
// (A/B tests, insights, aprendizajes, resumen semanal). No hay una
// tabla que consultar: simplemente avisamos que está en desarrollo,
// sin inventar números.
// ============================================================

interface FeaturePendingProps {
  title: string; // nombre de la función (ej. "Insights de IA")
  icon?: string;
  message: React.ReactNode; // qué hará esta función cuando exista
  hint?: React.ReactNode;
}

export function FeaturePending({ title, icon = '🛠️', message, hint }: FeaturePendingProps) {
  const client = useClient();
  return (
    <EmptyState
      icon={icon}
      title={`${title} · en desarrollo`}
      message={
        <>
          {message} Por ahora no mostramos cifras para {client.name}: preferimos no inventar nada
          hasta que la función trabaje sobre datos reales.
        </>
      }
      hint={hint ?? 'Se activará en una próxima etapa.'}
    />
  );
}
