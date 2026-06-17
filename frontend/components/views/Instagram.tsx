'use client';

import { ConnectorPending } from './ConnectorPending';

export function Instagram() {
  return (
    <ConnectorPending
      title="Instagram"
      channelLabel="Instagram"
      table="meta_platform"
      icon="📸"
      note="Mostrará la inversión, el alcance y el ROAS de tus anuncios de Meta que corren en Instagram, en cuanto la sincronización escriba el desglose por plataforma (publisher_platform) en la tabla meta_platform."
    />
  );
}
