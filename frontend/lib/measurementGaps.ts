// ============================================================
// Gaps de medición por cliente
// ============================================================
// Ventanas donde el tracking estuvo caído y los datos NO son confiables
// (p.ej. pixel/GTM caído → conversiones sub-contadas). La vista los usa para
// (a) excluirlos del "ritmo limpio"/proyección y (b) avisarlo con una nota,
// para no leer un bache de medición como caída de rendimiento.
//
// Fuente de verdad manual (la agencia sabe cuándo pasó). Clave = client.id.
// ============================================================

export interface MeasurementGap {
  from: string; // 'YYYY-MM-DD' inclusive
  to: string; // 'YYYY-MM-DD' inclusive
  reason: string;
}

const GAPS: Record<string, MeasurementGap[]> = {
  // Ofero Colombia
  '54623a86-bc4d-4ddb-ad45-be0919c8e1d4': [
    {
      from: '2026-08-30',
      to: '2026-09-02',
      reason:
        'Pixel de TikTok (vía GTM) caído: leads sub-contados y CPL inflado. Corregido el 3-sep.',
    },
  ],
};

export function getMeasurementGaps(clientId: string): MeasurementGap[] {
  return GAPS[clientId] ?? [];
}

/** ¿Esa fecha ('YYYY-MM-DD') cae dentro de algún gap? */
export function isInGap(date: string, gaps: MeasurementGap[]): boolean {
  return gaps.some((g) => date >= g.from && date <= g.to);
}

/** Los gaps que se solapan con el rango [from, to] visible (para decidir si mostrar la nota). */
export function gapsInRange(gaps: MeasurementGap[], from: string, to: string): MeasurementGap[] {
  return gaps.filter((g) => g.from <= to && g.to >= from);
}
