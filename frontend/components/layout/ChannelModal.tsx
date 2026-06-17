'use client';

import { useEffect } from 'react';
import { CHANNEL_META } from '@/lib/channels';
import { useChannelModal } from '@/lib/useChannelModal';

export function ChannelModal() {
  const { activeChannel, closeModal } = useChannelModal();
  const meta = activeChannel ? CHANNEL_META[activeChannel] : null;

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeModal]);

  if (!meta) return null;

  return (
    <div
      className={`modal-overlay ${activeChannel ? 'on' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-icon">{meta.icon}</div>
        <div className="modal-title">{meta.title}</div>
        <div
          className="modal-desc"
          dangerouslySetInnerHTML={{ __html: meta.desc }}
        />
        <div className="modal-benefits">
          {meta.benefits.map((b, i) => (
            <div className="modal-benefit" key={i}>
              <span className="modal-benefit-ic">✓</span>
              <span>{b}</span>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="modal-btn" type="button" onClick={closeModal}>
            Cerrar
          </button>
          <button
            className="modal-btn primary"
            type="button"
            onClick={() => {
              alert('Redirigiendo a configuración de integraciones...');
              closeModal();
            }}
          >
            Conectar ahora →
          </button>
        </div>
      </div>
    </div>
  );
}
