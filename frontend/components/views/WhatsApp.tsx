'use client';

import { ConnectorPending } from './ConnectorPending';

export function WhatsApp() {
  return (
    <ConnectorPending
      title="WhatsApp"
      channelLabel="WhatsApp"
      table="meta_campaigns"
      icon="💬"
      note="Mostrará conversaciones iniciadas y campañas de click-to-WhatsApp cuando el conector traiga datos."
    />
  );
}
