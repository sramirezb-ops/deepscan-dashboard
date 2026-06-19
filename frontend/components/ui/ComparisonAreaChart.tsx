'use client';

import { useId } from 'react';
import { ChartWithTooltip, type ChartDataPoint } from '@/components/ui/ChartWithTooltip';

// ============================================================
// ComparisonAreaChart — dos series (actual vs período anterior)
// ============================================================
// Replica las curvas de Looker ("¿Cómo ha crecido el tráfico?"): una línea
// del período actual (color fuerte) y otra del período anterior (color claro).
// Por defecto dibuja el ACUMULADO (suma corrida), que es como crece la curva
// en Looker. Tooltip estilo Looker con ambos valores. 100% dato real.
// ============================================================

interface ComparisonAreaChartProps {
  title: string;
  headline: string; // total del período actual
  sub?: string;
  current: number[]; // valores diarios período actual (cronológico)
  previous: number[]; // valores diarios período anterior (cronológico)
  labelsCurrent: string[]; // fechas período actual (para tooltip)
  labelsPrevious: string[]; // fechas período anterior (para tooltip)
  color: string; // serie actual
  format: (n: number) => string;
  cumulative?: boolean; // default true
}

const VB_W = 320;
const VB_H = 150;
const X0 = 10;
const X1 = 310;
const Y_TOP = 16;
const Y_BOT = 120;

const COLOR_PREV = 'rgba(148, 163, 184, 0.55)'; // gris/claro para el período anterior

function toCumulative(arr: number[]): number[] {
  let acc = 0;
  return arr.map((v) => (acc += Number(v) || 0));
}

export function ComparisonAreaChart({
  title,
  headline,
  sub,
  current,
  previous,
  labelsCurrent,
  labelsPrevious,
  color,
  format,
  cumulative = true,
}: ComparisonAreaChartProps) {
  const uid = useId().replace(/:/g, '');
  const gradId = `cmp-grad-${uid}`;

  const cur = cumulative ? toCumulative(current) : current;
  const prev = cumulative ? toCumulative(previous) : previous;

  const n = Math.max(cur.length, prev.length);
  const max = Math.max(...cur, ...prev, 0.0001);

  const xAt = (i: number) => (n > 1 ? X0 + ((X1 - X0) * i) / (n - 1) : (X0 + X1) / 2);
  const yAt = (v: number) => Y_BOT - (v / max) * (Y_BOT - Y_TOP);

  const curCoords = cur.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const prevCoords = prev.map((v, i) => ({ x: xAt(i), y: yAt(v) }));

  const curLine = curCoords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const prevLine = prevCoords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const curArea =
    curCoords.length > 0
      ? `${curLine} ${curCoords[curCoords.length - 1].x.toFixed(1)},${Y_BOT} ${curCoords[0].x.toFixed(1)},${Y_BOT}`
      : '';

  // Tooltip: por cada índice mostramos valor actual + anterior
  const data: ChartDataPoint[] = Array.from({ length: n }, (_, i) => {
    const values: ChartDataPoint['values'] = [];
    if (i < cur.length) {
      values.push({
        lbl: `${labelsCurrent[i] ?? ''} · actual`,
        val: format(cur[i]),
        color,
        y: curCoords[i].y,
      });
    }
    if (i < prev.length) {
      values.push({
        lbl: `${labelsPrevious[i] ?? ''} · anterior`,
        val: format(prev[i]),
        color: COLOR_PREV,
        y: prevCoords[i].y,
      });
    }
    return { date: labelsCurrent[i] ?? labelsPrevious[i] ?? '', values };
  });

  const lastCur = curCoords[curCoords.length - 1];

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: 'var(--mu)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 3, borderRadius: 2, background: color }} /> Actual
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 3, borderRadius: 2, background: COLOR_PREV }} /> Anterior
          </span>
        </div>
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
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Grid */}
          <line x1={X0} y1={Y_TOP} x2={X1} y2={Y_TOP} stroke="rgba(255,255,255,0.04)" />
          <line x1={X0} y1={(Y_TOP + Y_BOT) / 2} x2={X1} y2={(Y_TOP + Y_BOT) / 2} stroke="rgba(255,255,255,0.04)" />
          <line x1={X0} y1={Y_BOT} x2={X1} y2={Y_BOT} stroke="rgba(255,255,255,0.08)" />

          <polygon points={curArea} fill={`url(#${gradId})`} />
          {/* Período anterior (debajo, claro, punteado) */}
          <polyline
            points={prevLine}
            fill="none"
            stroke={COLOR_PREV}
            strokeWidth="2"
            strokeDasharray="4 3"
            strokeLinejoin="round"
          />
          {/* Período actual (encima, fuerte) */}
          <polyline points={curLine} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
          {lastCur && <circle cx={lastCur.x} cy={lastCur.y} r="4" fill={color} />}

          <line className="chart-cursor" x1={0} y1={Y_TOP} x2={0} y2={Y_BOT} />
          {/* dos puntos: uno por serie */}
          <circle className="chart-point" cx={0} cy={0} />
          <circle className="chart-point" cx={0} cy={0} />
        </ChartWithTooltip>
      )}
    </div>
  );
}
