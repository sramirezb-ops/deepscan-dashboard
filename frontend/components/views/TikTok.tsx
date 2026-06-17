'use client';

import { ConnectorPending } from './ConnectorPending';

export function TikTok() {
  return (
    <ConnectorPending
      title="TikTok Ads"
      channelLabel="TikTok Ads"
      table="tiktok_campaigns"
      icon="🎵"
      note="Mostrará inversión, vistas, CTR, conversiones y ROAS de las campañas de TikTok."
    />
  );
}
