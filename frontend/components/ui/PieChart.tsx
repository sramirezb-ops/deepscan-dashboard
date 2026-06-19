'use client';

// ============================================================
// PieChart — torta/donut en SVG puro (sin librerías), estilo Looker.
// Recibe slices {label, value}, ordena desc, agrupa la cola en "Otros"
// y dibuja la dona con leyenda + porcentajes. 100% dato real.
// ============================================================

export interface PieSlice {
  label: string;
  value: number;
}

// Paleta verde (modelo Ofero) + acentos, con gris para "Otros".
const PALETTE = [
  '#15803d',
  '#cfe9d4',
  '#4ade80',
  '#dbe94d',
  '#7a7a2e',
  '#65a30d',
  '#9ca3af',
  '#22d3ee',
  '#ec4899',
  '#fb923c',
];
const OTHER_COLOR = '#cbd5e1';
const MAX_SLICES = 9; // top 9 + "Otros"

// Convierte un ángulo (grados, 0 = arriba) a coordenadas en un círculo r.
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

// Path de un sector de dona entre startDeg y endDeg.
function arcPath(cx: number, cy: number, rOut: number, rIn: number, startDeg: number, endDeg: number): string {
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const [x1, y1] = polar(cx, cy, rOut, startDeg);
  const [x2, y2] = polar(cx, cy, rOut, endDeg);
  const [x3, y3] = polar(cx, cy, rIn, endDeg);
  const [x4, y4] = polar(cx, cy, rIn, startDeg);
  return [
    `M ${x1} ${y1}`,
    `A ${rOut} ${rOut} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rIn} ${rIn} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

export function PieChart({
  title,
  slices,
  formatValue,
}: {
  title: string;
  slices: PieSlice[];
  formatValue: (v: number) => string;
}) {
  // Ordena desc y descarta valores no positivos.
  const clean = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const total = clean.reduce((acc, s) => acc + s.value, 0);

  if (total <= 0) {
    return (
      <div className="card" style={{ borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <h3 style={{ margin: '0 0 6px 0', fontSize: 14 }}>{title}</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)' }}>Aún no hay datos para este período.</div>
      </div>
    );
  }

  // Top 9 + "Otros".
  const head = clean.slice(0, MAX_SLICES);
  const tail = clean.slice(MAX_SLICES);
  const display: { label: string; value: number; color: string }[] = head.map((s, i) => ({
    label: s.label,
    value: s.value,
    color: PALETTE[i % PALETTE.length],
  }));
  if (tail.length > 0) {
    display.push({
      label: 'Otros',
      value: tail.reduce((acc, s) => acc + s.value, 0),
      color: OTHER_COLOR,
    });
  }

  const SIZE = 180;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const rOut = 84;
  const rIn = 46;

  let cursor = 0;
  const arcs = display.map((d) => {
    const frac = d.value / total;
    const start = cursor * 360;
    const end = (cursor + frac) * 360;
    cursor += frac;
    // Para una sola tajada (100%) dibujamos un anillo completo.
    const path =
      frac >= 0.999
        ? `M ${cx} ${cy - rOut} A ${rOut} ${rOut} 0 1 1 ${cx - 0.01} ${cy - rOut} Z ` +
          `M ${cx} ${cy - rIn} A ${rIn} ${rIn} 0 1 0 ${cx - 0.01} ${cy - rIn} Z`
        : arcPath(cx, cy, rOut, rIn, start, end);
    return { ...d, path, pct: frac * 100 };
  });

  return (
    <div className="card">
      <h3 style={{ margin: '0 0 12px 0', fontSize: 14 }}>{title}</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ flexShrink: 0 }}>
          {arcs.map((a, i) => (
            <path key={i} d={a.path} fill={a.color} fillRule="evenodd" stroke="var(--bg)" strokeWidth={1} />
          ))}
        </svg>
        <div style={{ flex: '1 1 160px', minWidth: 160, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {arcs.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span
                style={{ width: 10, height: 10, borderRadius: 2, background: a.color, flexShrink: 0 }}
              />
              <span style={{ flex: 1, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.label}
              </span>
              <b style={{ color: 'var(--tx)' }}>{a.pct.toFixed(1)}%</b>
              <span style={{ color: 'var(--mu)', whiteSpace: 'nowrap' }}>{formatValue(a.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
