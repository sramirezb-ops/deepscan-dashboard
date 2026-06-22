'use client';

import { GoogleAdsSegmentView } from './GoogleAdsSegmentView';

export function YouTube() {
  return (
    <GoogleAdsSegmentView
      segment="video"
      title="YouTube / Video"
      channelLabel="YouTube / Video"
      icon="▶"
      brand="youtube"
      pendingNote="El desglose por video, vistas y audiencias necesita fuentes que aún no están en la base (gads_campaigns llega a nivel campaña). Por ahora esta vista muestra solo datos reales y verificables de tus campañas de Video."
    />
  );
}
