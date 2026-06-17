'use client';

import { GoogleAdsSegmentView } from './GoogleAdsSegmentView';

export function Search() {
  return (
    <GoogleAdsSegmentView
      segment="search"
      title="Search"
      channelLabel="Search"
      icon="🔎"
      pendingNote="El desglose por keyword, search terms y quality score necesita fuentes que aún no están en la base (gads_campaigns llega a nivel campaña). Por ahora esta vista muestra solo datos reales y verificables de tus campañas Search."
    />
  );
}
