'use client';

import { ConnectorPending } from './ConnectorPending';

export function Instagram() {
  return (
    <ConnectorPending
      title="Instagram"
      channelLabel="Instagram"
      table="meta_campaigns"
      icon="📸"
      note="Mostrará alcance, interacción y rendimiento de las campañas de Instagram dentro de Meta."
    />
  );
}
