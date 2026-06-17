import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  message: ReactNode;
  hint?: ReactNode;
}

/**
 * Aviso limpio y reutilizable para cuando una vista no tiene datos que mostrar.
 * Se usa, por ejemplo, cuando un cliente no tiene cierto tipo de campaña, o
 * cuando no hubo actividad en el rango de fechas seleccionado.
 */
export function EmptyState({ icon = '◦', title, message, hint }: EmptyStateProps) {
  return (
    <div className="view on">
      <div
        className="card"
        style={{
          padding: '52px 32px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            background: 'var(--bg3, rgba(255,255,255,0.04))',
            border: '1px solid var(--b1)',
            color: 'var(--mu)',
            marginBottom: 4,
          }}
        >
          {icon}
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--tx, #f3f4f8)' }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--mu)', maxWidth: 440, lineHeight: 1.6 }}>
          {message}
        </div>
        {hint && (
          <div style={{ fontSize: 12, color: 'var(--t3, rgba(243,244,248,0.4))', marginTop: 4 }}>
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}
