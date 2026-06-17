'use client';

import { useClient } from '@/lib/useClient';
import { useHasData } from '@/lib/hooks/useHasData';
import { EmptyState } from '@/components/ui/EmptyState';

// ============================================================
// ConnectorPending — vista honesta para canales aún sin datos reales
// ============================================================
// Pieza reutilizable: revisa EN VIVO si la tabla del conector ya trae
// filas para el cliente. Mientras no haya datos, muestra un aviso claro
// en vez de números inventados. Si algún día llegan datos, lo detecta
// solo (y mostrará el aviso de "datos disponibles" para construir la vista).
// ============================================================

interface ConnectorPendingProps {
  title: string; // título grande de la vista (ej. "Meta Ads · Overview")
  channelLabel: string; // nombre del canal para los textos (ej. "Meta Ads")
  table: string; // tabla Supabase que alimenta esta vista
  icon?: string;
  note?: string; // detalle de qué mostrará la vista cuando haya datos
}

export function ConnectorPending({
  title,
  channelLabel,
  table,
  icon = '🔌',
  note,
}: ConnectorPendingProps) {
  const client = useClient();
  const { exists, hasData, count, loading, error } = useHasData(table, client.id);

  if (loading) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Revisando el conector de {channelLabel}…
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view on">
        <div
          className="card"
          style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}
        >
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>
            Error consultando {channelLabel}
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  // Caso raro pero posible: ya hay datos en la tabla → avisamos para construir la vista real.
  if (hasData) {
    return (
      <EmptyState
        icon="✅"
        title={`${channelLabel}: datos disponibles`}
        message={
          <>
            El conector de <b>{channelLabel}</b> ya trae <b>{count.toLocaleString('es')}</b>{' '}
            registros para {client.name}. Esta vista todavía no está construida con datos reales —
            es el siguiente paso.
          </>
        }
        hint="Avísame y la conecto con datos reales como hicimos con Google Ads, GA4 y Merchant Center."
      />
    );
  }

  // Sin datos: distinguimos "conectado, esperando" vs "aún sin conectar".
  if (exists) {
    return (
      <EmptyState
        icon={icon}
        title={`Sin datos de ${channelLabel} por ahora`}
        message={
          <>
            El conector de <b>{channelLabel}</b> está enlazado pero todavía no ha traído datos para{' '}
            {client.name}.{note ? ` ${note}` : ''}
          </>
        }
        hint="En cuanto la sincronización traiga los primeros registros, aparecerán aquí automáticamente."
      />
    );
  }

  return (
    <EmptyState
      icon={icon}
      title={`${channelLabel} aún no está conectado`}
      message={
        <>
          Todavía no hay una fuente de datos de <b>{channelLabel}</b> en la base para {client.name}.
          {note ? ` ${note}` : ''} Por eso esta vista no muestra cifras: preferimos no inventar
          nada.
        </>
      }
      hint="Cuando se conecte el origen de datos, esta vista se activará sola."
    />
  );
}
