'use client';

import { FeaturePending } from './FeaturePending';

export function Learnings() {
  return (
    <FeaturePending
      title="Aprendizajes acumulados"
      icon="📚"
      message="Aquí se irá guardando el histórico de aprendizajes validados (qué funcionó y qué no) a medida que se cierren experimentos y campañas."
    />
  );
}
