'use client';

import { FeaturePending } from './FeaturePending';

export function Week() {
  return (
    <FeaturePending
      title="Resumen semanal"
      icon="🗓️"
      message="Aquí se construirá el resumen semanal agregando los canales que ya tienen datos reales (Meta, Google Ads, GA4, Merchant Center) en una sola foto comparativa."
      hint="Se activará agregando los canales con datos reales ya conectados."
    />
  );
}
