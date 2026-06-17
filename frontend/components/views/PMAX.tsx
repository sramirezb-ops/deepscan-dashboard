'use client';

import { GoogleAdsSegmentView } from './GoogleAdsSegmentView';
import { GadsProducts } from './GadsProducts';

export function PMAX() {
  return (
    <GoogleAdsSegmentView
      segment="pmax"
      title="Performance Max"
      channelLabel="Performance Max"
      icon="🅿"
      extraSection={<GadsProducts />}
      pendingNote="El desglose por asset group, los search terms y los placements, junto con el Agente PMAX IA, necesitan fuentes que aún no están en la base (gads_campaigns llega a nivel campaña, no de asset group). El detalle producto a producto y los zombies que ves arriba sí salen de datos reales (gads_products / gads_zombies)."
    />
  );
}
