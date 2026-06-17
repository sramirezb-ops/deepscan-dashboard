// ============================================================
// DIMENSIÓN DE OBJETIVOS — las "piezas Lego" de meta de negocio
// ============================================================
// Igual que channels.ts define los canales (Meta, TikTok, etc.),
// este archivo define los OBJETIVOS de un cliente (ventas, leads, etc.).
//
// Un cliente puede tener UNO o VARIOS objetivos a la vez. El objetivo
// decide qué métrica es la "estrella", qué se evalúa con semáforo y
// qué benchmarks aplican.
//
// En producción, los objetivos activos vienen de Supabase:
//   clients.objectives  (ej. ['ventas'] o ['ventas','leads'])
// ============================================================

export type ObjectiveId = 'ventas' | 'leads' | 'trafico' | 'awareness';

// Una métrica estrella de un objetivo: qué se mide y cómo se evalúa.
export interface ObjectiveKpi {
  key: string; // identificador interno de la métrica
  label: string; // cómo se muestra
  // dirección "buena": para ROAS más alto es mejor (up); para CPA más bajo (down)
  better: 'up' | 'down';
  format: 'currency' | 'multiplier' | 'percent' | 'number';
}

export interface ObjectiveMeta {
  id: ObjectiveId;
  icon: string;
  title: string;
  desc: string;
  // KPIs estrella que este objetivo coloca al frente del tablero
  heroKpis: ObjectiveKpi[];
  // color de acento del objetivo (variable CSS o hex)
  accent: string;
}

// ------------------------------------------------------------
// Registro de objetivos disponibles (la "caja de piezas")
// ------------------------------------------------------------
export const OBJECTIVE_META: Record<ObjectiveId, ObjectiveMeta> = {
  ventas: {
    id: 'ventas',
    icon: '🛒',
    title: 'Ventas (Ecommerce)',
    desc: 'Objetivo de ingresos directos. La estrella es el ROAS y los ingresos atribuibles.',
    accent: 'var(--ch-shopify)',
    heroKpis: [
      { key: 'roas', label: 'ROAS', better: 'up', format: 'multiplier' },
      { key: 'revenue', label: 'Ingresos', better: 'up', format: 'currency' },
      { key: 'aov', label: 'Ticket promedio (AOV)', better: 'up', format: 'currency' },
      { key: 'cpa', label: 'CPA', better: 'down', format: 'currency' },
      { key: 'conversionRate', label: 'Tasa de conversión', better: 'up', format: 'percent' },
    ],
  },
  leads: {
    id: 'leads',
    icon: '🎯',
    title: 'Generación de leads',
    desc: 'Objetivo de captación de prospectos. La estrella es el costo por lead y el volumen calificado.',
    accent: 'var(--ch-meta)',
    heroKpis: [
      { key: 'leads', label: 'Leads', better: 'up', format: 'number' },
      { key: 'cpl', label: 'Costo por lead (CPL)', better: 'down', format: 'currency' },
      { key: 'qualifiedRate', label: 'Tasa de leads calificados', better: 'up', format: 'percent' },
      { key: 'cpql', label: 'Costo por lead calificado', better: 'down', format: 'currency' },
    ],
  },
  trafico: {
    id: 'trafico',
    icon: '🚦',
    title: 'Tráfico',
    desc: 'Objetivo de llevar visitas de calidad al sitio. La estrella es el costo por sesión y el engagement.',
    accent: 'var(--ch-ga4)',
    heroKpis: [
      { key: 'sessions', label: 'Sesiones', better: 'up', format: 'number' },
      { key: 'cpc', label: 'Costo por clic (CPC)', better: 'down', format: 'currency' },
      { key: 'ctr', label: 'CTR', better: 'up', format: 'percent' },
      { key: 'engagementRate', label: 'Tasa de engagement', better: 'up', format: 'percent' },
    ],
  },
  awareness: {
    id: 'awareness',
    icon: '📣',
    title: 'Awareness / Alcance',
    desc: 'Objetivo de visibilidad de marca. La estrella es el alcance eficiente y la frecuencia controlada.',
    accent: 'var(--ch-tiktok)',
    heroKpis: [
      { key: 'reach', label: 'Alcance', better: 'up', format: 'number' },
      { key: 'impressions', label: 'Impresiones', better: 'up', format: 'number' },
      { key: 'cpm', label: 'CPM', better: 'down', format: 'currency' },
      { key: 'frequency', label: 'Frecuencia', better: 'down', format: 'number' },
    ],
  },
};

// Orden de presentación cuando un cliente tiene varios objetivos
export const OBJECTIVE_ORDER: ObjectiveId[] = ['ventas', 'leads', 'trafico', 'awareness'];

/**
 * Devuelve la metadata de los objetivos de un cliente, en orden de presentación.
 * Ej: getClientObjectives(['leads','ventas']) -> [ventas, leads]
 */
export function getClientObjectives(ids: ObjectiveId[]): ObjectiveMeta[] {
  return OBJECTIVE_ORDER.filter((id) => ids.includes(id)).map((id) => OBJECTIVE_META[id]);
}
