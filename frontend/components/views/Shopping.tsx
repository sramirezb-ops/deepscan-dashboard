'use client';

import { GoogleAdsSegmentView } from './GoogleAdsSegmentView';

export function Shopping() {
  return (
    <GoogleAdsSegmentView
      segment="shopping"
      title="Shopping"
      channelLabel="Shopping"
      icon="🛍"
      pendingNote="El desglose a nivel producto, feed y pujas de Shopping necesita fuentes que aún no están en la base (gads_campaigns llega a nivel campaña). Por ahora esta vista muestra solo datos reales y verificables de tus campañas Shopping."
    />
  );
}
