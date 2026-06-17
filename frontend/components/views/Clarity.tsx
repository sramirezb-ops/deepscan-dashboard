'use client';

import { ConnectorPending } from './ConnectorPending';

export function Clarity() {
  return (
    <ConnectorPending
      title="Clarity · CRO"
      channelLabel="Microsoft Clarity"
      table="clarity_metrics"
      icon="🔬"
      note="Mostrará sesiones, scroll depth, dead clicks, rage clicks y el detalle de comportamiento por página."
    />
  );
}
