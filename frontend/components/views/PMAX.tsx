'use client';

import { GoogleAdsSegmentView } from './GoogleAdsSegmentView';

export function PMAX() {
  return (
    <GoogleAdsSegmentView
      segment="pmax"
      title="Performance Max"
      channelLabel="Performance Max"
      icon="🅿"
      pendingNote="El desglose por asset group, los search terms, los placements, el detalle producto a producto (zombies) y el Agente PMAX IA necesitan fuentes que aún no están en la base (gads_campaigns llega a nivel campaña, no de asset group). Por ahora esta vista muestra solo datos reales y verificables de tus campañas PMAX."
    />
  );
}
