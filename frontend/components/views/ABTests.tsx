'use client';

import { FeaturePending } from './FeaturePending';

export function ABTests() {
  return (
    <FeaturePending
      title="A/B tests"
      icon="🧪"
      message="Aquí se listarán los experimentos en curso con sus variantes, tráfico asignado y significancia estadística, una vez conectado el motor de experimentos."
    />
  );
}
