'use client';

import { useId } from 'react';

// ============================================================
// FunnelChart — embudo real (trapecios que se angostan) en SVG
// ============================================================
// Cada etapa es un trapecio centrado cuyo ancho es proporcional al valor.
// El borde inferior se angosta hacia la etapa siguiente, dando la forma de
// embudo. Muestra el valor dentro de cada banda y la tasa de conversión de
// paso a paso a la derecha. Todo dato real.
// ============================================================

export interface FunnelStage {
  label: string;
  value: number;
  color: string;
}

interface FunnelChartProps {
  stages: FunnelStage[];
  format?: (n: number) => string;
}

const VB_W = 900;
const BAND_H = 60;
const GAP = 8;
const PAD_TOP = 6;
const CX = 430;
const MAX_W = 700;
const MIN_W = 70;

export function FunnelChart({ stages, format = (n) => Math.round(n).toLocaleString('es-ES') }: FunnelChartProps) {
  const uid = useId().replace(/:/g, '');
  const maxVal = Math.max(...stages.map((s) => s.value), 0.0001);
  const widthOf = (v: number) => Math.max(MIN_W, (MAX_W * v) / maxVal);
  const vbH = PAD_TOP * 2 + stages.length * BAND_H + (stages.length - 1) * GAP;

  return (
    <svg viewBox={`0 0 ${VB_W} ${vbH}`} style={{ width: '100%', height: 'auto' }}>
      <defs>
        {stages.map((s, i) => (
          <linearGradient key={i} id={`fn-${uid}-${i}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0.95" />
          </linearGradient>
        ))}
      </defs>

      {stages.map((s, i) => {
        const yTop = PAD_TOP + i * (BAND_H + GAP);
        const yBot = yTop + BAND_H;
        const topW = widthOf(s.value);
        const botW = widthOf(stages[i + 1]?.value ?? s.value);
        const pts = [
          `${CX - topW / 2},${yTop}`,
          `${CX + topW / 2},${yTop}`,
          `${CX + botW / 2},${yBot}`,
          `${CX - botW / 2},${yBot}`,
        ].join(' ');

        const prev = i > 0 ? stages[i - 1].value : null;
        const stepRate = prev && prev > 0 ? s.value / prev : null;
        const topRate = maxVal > 0 ? s.value / stages[0].value : null;

        return (
          <g key={s.label}>
            <polygon points={pts} fill={`url(#fn-${uid}-${i})`} stroke={s.color} strokeWidth="1" />
            {/* Etiqueta + valor dentro de la banda */}
            <text
              x={CX}
              y={yTop + 24}
              textAnchor="middle"
              style={{ fontSize: 12, fill: '#fff', opacity: 0.85 }}
            >
              {s.label}
            </text>
            <text
              x={CX}
              y={yTop + 46}
              textAnchor="middle"
              style={{ fontSize: 19, fontWeight: 700, fill: '#fff' }}
            >
              {format(s.value)}
            </text>
            {/* Conversión vs total a la derecha */}
            {topRate != null && (
              <text
                x={VB_W - 12}
                y={yTop + 30}
                textAnchor="end"
                style={{ fontSize: 13, fontWeight: 700, fill: 'var(--tx)' }}
              >
                {(topRate * 100).toFixed(topRate < 0.1 ? 1 : 0)}%
                <tspan style={{ fontSize: 10, fontWeight: 400, fill: 'var(--mu)' }}> del total</tspan>
              </text>
            )}
            {/* Tasa de paso a paso entre bandas */}
            {stepRate != null && (
              <text
                x={28}
                y={yTop + 30}
                textAnchor="start"
                style={{ fontSize: 11, fill: 'var(--mu)' }}
              >
                ↓ {(stepRate * 100).toFixed(stepRate < 0.1 ? 1 : 0)}%
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
