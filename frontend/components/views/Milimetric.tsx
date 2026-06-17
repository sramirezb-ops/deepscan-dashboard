'use client';

import { ConnectorPending } from './ConnectorPending';

export function Milimetric() {
  return (
    <ConnectorPending
      title="Análisis milimétrico · creativos"
      channelLabel="Análisis de creativos"
      table="meta_campaigns"
      icon="🎨"
      note="Mostrará el rendimiento a nivel anuncio/creativo (thumbnail, hook rate, retención) cuando se active el desglose por creativo de Meta."
    />
  );
}
