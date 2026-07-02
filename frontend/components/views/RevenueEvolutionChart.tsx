'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { ChartWithTooltip, type ChartDataPoint } from '@/components/ui/ChartWithTooltip';
import { formatCurrency } from '@/lib/utils';

// ============================================================
// RevenueEvolutionChart — evolución diaria de revenue con dato REAL
// ============================================================
// Antes: curva hardcodeada ("Abril vs Marzo", "$1.15M"). Ahora consume la
// serie diaria de useOverview (período actual vs anterior, alineados por índice
// de día) y auto-escala. Baseline en 0 (honesto), moneda del cliente, y estado
// vacío explícito cuando no hay ≥2 días con datos.
// ============================================================

interface RevenueEvolutionChartProps {
  points: { date: string; current: number; previous: number | null }[];
  currency: string;
  curLabel: string;
  prevLabel: string;
}

// Geometría del lienzo (coincide con el resto de charts del tablero)
const VB_W = 900;
const VB_H = 240;
const X0 = 40;
const X1 = 880;
const Y_TOP = 30;
const Y_BOT = 210;

// Abreviatura para el eje Y: $1.2M / $925K / $0. Mantiene el símbolo del
// cliente (todas las monedas del tablero usan $, el código va aparte).
function abbrev(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

// "2026-04-30" → "30 abr"
function shortDate(ymd: string): string {
  if (!ymd) return '';
  const d = new Date(`${ymd}T00:00:00`);
  if (isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

const CUR_COLOR = '#8b5cf6';
const PREV_COLOR = 'rgba(255,255,255,0.28)';

export function RevenueEvolutionChart({ points, currency, curLabel, prevLabel }: RevenueEvolutionChartProps) {
  const model = useMemo(() => {
    const n = points.length;
    const curVals = points.map((p) => p.current);
    const prevVals = points.map((p) => (p.previous == null ? 0 : p.previous));
    const hasPrev = points.some((p) => p.previous != null);

    const max = Math.max(...curVals, ...prevVals, 0.0001);
    const curTotal = curVals.reduce((a, b) => a + b, 0);
    const prevTotal = prevVals.reduce((a, b) => a + b, 0);

    const xAt = (i: number) => (n > 1 ? X0 + ((X1 - X0) * i) / (n - 1) : (X0 + X1) / 2);
    const yAt = (v: number) => Y_BOT - (v / max) * (Y_BOT - Y_TOP);

    const curCoords = curVals.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
    const prevCoords = prevVals.map((v, i) => ({ x: xAt(i), y: yAt(v) }));

    const curLine = curCoords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const prevLine = prevCoords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const curArea =
      curCoords.length > 0
        ? `${curLine} ${curCoords[curCoords.length - 1].x.toFixed(1)},${Y_BOT} ${curCoords[0].x.toFixed(1)},${Y_BOT}`
        : '';

    // Tooltip: ambas series con su valor real
    const data: ChartDataPoint[] = points.map((p, i) => {
      const values = [
        { lbl: curLabel, val: formatCurrency(p.current, currency), color: CUR_COLOR, y: curCoords[i].y },
      ];
      if (p.previous != null) {
        values.push({ lbl: prevLabel, val: formatCurrency(p.previous, currency), color: '#c9cbd4', y: prevCoords[i].y });
      }
      return { date: shortDate(p.date), values };
    });

    // Etiquetas del eje Y en 4 niveles (0, 1/3, 2/3, max)
    const yTicks = [0, 1 / 3, 2 / 3, 1].map((f) => ({
      y: yAt(max * f),
      label: abbrev(max * f),
    }));

    // Etiquetas del eje X: primera, ~1/4, mitad, ~3/4, última
    const xTickIdx =
      n <= 1
        ? [0]
        : [0, Math.floor((n - 1) * 0.25), Math.floor((n - 1) * 0.5), Math.floor((n - 1) * 0.75), n - 1];
    const xTicks = Array.from(new Set(xTickIdx)).map((i) => ({ x: xAt(i), label: shortDate(points[i].date) }));

    return { n, hasPrev, max, curTotal, prevTotal, curLine, prevLine, curArea, curCoords, data, yTicks, xTicks };
  }, [points, currency, curLabel, prevLabel]);

  const delta = model.prevTotal > 0 ? ((model.curTotal - model.prevTotal) / model.prevTotal) * 100 : null;
  const last = model.curCoords[model.curCoords.length - 1];

  return (
    <Card style={{ marginTop: 20 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 18,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>Evolución de revenue</h3>
          <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 4 }}>
            {curLabel} vs {prevLabel} · acumulado diario · {currency}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 11, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 16, height: 2, background: CUR_COLOR, display: 'inline-block' }} />
            {curLabel} {formatCurrency(model.curTotal, currency)}
          </div>
          {model.hasPrev && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 16, height: 2, background: PREV_COLOR, display: 'inline-block' }} />
              {prevLabel} {formatCurrency(model.prevTotal, currency)}
            </div>
          )}
          {delta != null && (
            <span className="period-ytd">
              {delta >= 0 ? '+' : ''}
              {delta.toFixed(1)}% vs {prevLabel}
            </span>
          )}
        </div>
      </div>

      {model.n < 2 ? (
        <div
          style={{
            height: VB_H,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            color: 'var(--mu)',
          }}
        >
          Se necesitan ≥2 días con datos para trazar la evolución.
        </div>
      ) : (
        <ChartWithTooltip data={model.data} xStart={X0} xEnd={X1} viewBox={`0 0 ${VB_W} ${VB_H}`}>
          <defs>
            <linearGradient id="gradCurr" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={CUR_COLOR} stopOpacity="0.4" />
              <stop offset="100%" stopColor={CUR_COLOR} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid + etiquetas Y (auto-escaladas) */}
          {model.yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={X0}
                y1={t.y}
                x2={X1}
                y2={t.y}
                stroke={i === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}
              />
              <text x={X0 - 5} y={t.y + 4} textAnchor="end" style={{ fontSize: 10, fill: 'var(--mu)' }}>
                {t.label}
              </text>
            </g>
          ))}

          {/* Etiquetas X (fechas reales) */}
          {model.xTicks.map((t, i) => (
            <text key={i} x={t.x} y={Y_BOT + 20} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--mu)' }}>
              {t.label}
            </text>
          ))}

          {/* Serie anterior (punteada, tenue) */}
          {model.hasPrev && (
            <polyline points={model.prevLine} fill="none" stroke={PREV_COLOR} strokeWidth="1.5" strokeDasharray="4 3" />
          )}

          {/* Serie actual (área + línea) */}
          <polygon points={model.curArea} fill="url(#gradCurr)" />
          <polyline points={model.curLine} fill="none" stroke={CUR_COLOR} strokeWidth="2.5" strokeLinejoin="round" />
          {last && (
            <>
              <circle cx={last.x} cy={last.y} r="5" fill={CUR_COLOR} />
              <circle cx={last.x} cy={last.y} r="9" fill={CUR_COLOR} opacity="0.3" />
            </>
          )}

          {/* Cursor + puntos para hover */}
          <line className="chart-cursor" x1={0} y1={Y_TOP} x2={0} y2={Y_BOT} />
          <circle className="chart-point" cx={0} cy={0} />
          <circle className="chart-point" cx={0} cy={0} />
        </ChartWithTooltip>
      )}
    </Card>
  );
}
