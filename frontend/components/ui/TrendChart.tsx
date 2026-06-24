'use client';

import { useId } from 'react';
import { ChartWithTooltip, type ChartDataPoint } from '@/components/ui/ChartWithTooltip';

// ============================================================
// TrendChart — mini gráfica de área (tendencia diaria) con dato real
// ============================================================
// Recibe una serie de valores en orden cronológico y dibuja un área + línea
// limpia, con tooltip estilo Looker al pasar el cursor. Baseline en 0 (honesto:
// la altura refleja la magnitud real). Pensada para una rejilla 2×2 ejecutiva.
// ============================================================

interface TrendChartProps {
  title: string;
  headline: string; // número grande del período (KPI)
  sub?: string; // texto pequeño bajo el headline
  points: number[]; // valores en orden de día
  labels: string[]; // etiquetas de fecha (para el tooltip)
  color: string;
  format: (n: number) => string; // formateo del valor en el tooltip
  // Línea de meta opcional (ej. CPL objetivo). Si se pasa, se dibuja una línea
  // horizontal punteada a esa altura con su etiqueta. La escala del gráfico la
  // incluye para que la meta siempre quede visible aunque supere a los puntos.
  goal?: number;
  goalLabel?: string;
  // Marcadores verticales (ej. implementaciones de la bitácora): cada uno se
  // ancla a un índice de la serie y muestra un número en un pin arriba. El
  // detalle (qué se hizo) se lista aparte, fuera del gráfico. `color` es
  // opcional: si no se pasa, el pin es morado (default). Permite colorear el
  // marcador por canal (ej. Google vs TikTok) en el overview consolidado.
  markers?: { index: number; n: number; color?: string }[];
}

const VB_W = 320;
const VB_H = 118;
const X0 = 10;
const X1 = 310;
const Y_TOP = 16;
const Y_BOT = 98;

export function TrendChart({ title, headline, sub, points, labels, color, format, goal, goalLabel, markers }: TrendChartProps) {
  const uid = useId().replace(/:/g, '');
  const gradId = `trend-grad-${uid}`;
  const n = points.length;
  const hasGoal = typeof goal === 'number' && goal > 0;
  // La meta entra en la escala para que su línea nunca quede fuera del lienzo.
  const max = Math.max(...points, hasGoal ? goal! : 0, 0.0001);

  const xAt = (i: number) => (n > 1 ? X0 + ((X1 - X0) * i) / (n - 1) : (X0 + X1) / 2);
  const yAt = (v: number) => Y_BOT - (v / max) * (Y_BOT - Y_TOP);

  const coords = points.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const linePts = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPts =
    coords.length > 0
      ? `${linePts} ${coords[coords.length - 1].x.toFixed(1)},${Y_BOT} ${coords[0].x.toFixed(1)},${Y_BOT}`
      : '';

  const data: ChartDataPoint[] = points.map((v, i) => ({
    date: labels[i] ?? '',
    values: [{ lbl: title, val: format(v), color, y: coords[i].y }],
  }));

  const last = coords[coords.length - 1];

  return (
    <div className="card" style={{ padding: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 4,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {title}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx)', lineHeight: 1.2 }}>
            {headline}
          </div>
          {sub && <div style={{ fontSize: 11, color: 'var(--mu)' }}>{sub}</div>}
        </div>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: color, marginTop: 4 }} />
      </div>

      {n < 2 ? (
        <div
          style={{
            height: VB_H,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            color: 'var(--mu)',
          }}
        >
          Necesitas ≥2 días con datos para ver la tendencia
        </div>
      ) : (
        <ChartWithTooltip data={data} xStart={X0} xEnd={X1} viewBox={`0 0 ${VB_W} ${VB_H}`} height={VB_H}>
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Grid */}
          <line x1={X0} y1={Y_TOP} x2={X1} y2={Y_TOP} stroke="rgba(255,255,255,0.04)" />
          <line x1={X0} y1={(Y_TOP + Y_BOT) / 2} x2={X1} y2={(Y_TOP + Y_BOT) / 2} stroke="rgba(255,255,255,0.04)" />
          <line x1={X0} y1={Y_BOT} x2={X1} y2={Y_BOT} stroke="rgba(255,255,255,0.08)" />

          <polygon points={areaPts} fill={`url(#${gradId})`} />
          <polyline points={linePts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
          {last && <circle cx={last.x} cy={last.y} r="4" fill={color} />}

          {/* Línea de meta (objetivo de negocio): punteada + etiqueta. */}
          {hasGoal && (
            <>
              <line
                x1={X0}
                y1={yAt(goal!)}
                x2={X1}
                y2={yAt(goal!)}
                stroke="#fbbf24"
                strokeWidth="1.25"
                strokeDasharray="4 3"
                opacity="0.85"
              />
              {goalLabel && (
                <text x={X1} y={yAt(goal!) - 4} textAnchor="end" fontSize="9" fill="#fbbf24" opacity="0.9">
                  {goalLabel}
                </text>
              )}
            </>
          )}

          {/* Marcadores de implementaciones: línea guía + pin numerado.
              El color por marcador permite distinguir el canal (ej. Google /
              TikTok / global) en el overview consolidado. */}
          {markers && markers.map((m, k) => {
            const mx = xAt(m.index);
            const mc = m.color ?? '#a78bfa';
            return (
              <g key={k}>
                <line x1={mx} y1={Y_TOP} x2={mx} y2={Y_BOT} stroke={mc} strokeWidth="1" strokeDasharray="2 2" opacity="0.55" />
                <circle cx={mx} cy={Y_TOP - 8} r="6.5" fill={mc} />
                <text x={mx} y={Y_TOP - 8} textAnchor="middle" dominantBaseline="central" fontSize="8" fontWeight="700" fill="#0b0b12">
                  {m.n}
                </text>
              </g>
            );
          })}

          <line className="chart-cursor" x1={0} y1={Y_TOP} x2={0} y2={Y_BOT} />
          <circle className="chart-point" cx={0} cy={0} />
        </ChartWithTooltip>
      )}
    </div>
  );
}
