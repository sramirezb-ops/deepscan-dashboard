'use client';

import { useRef, useState, useEffect, type ReactNode } from 'react';

export interface ChartDataPoint {
  date: string;
  values: Array<{
    lbl: string;
    val: string;
    color: string;
    y?: number;
  }>;
}

interface ChartWithTooltipProps {
  data: ChartDataPoint[];
  xStart: number;
  xEnd: number;
  viewBox: string;
  children: ReactNode;
  height?: number;
}

/**
 * Wrapper SVG con tooltip flotante estilo Looker Studio.
 * - Muestra línea vertical guía al hover
 * - Caja flotante con fecha + valor por serie
 * - Puntos activos en cada polyline
 *
 * Uso:
 * <ChartWithTooltip data={...} xStart={40} xEnd={880} viewBox="0 0 900 240">
 *   <polyline points="..." />
 *   <line className="chart-cursor" x1={0} y1={20} x2={0} y2={210} />
 *   <circle className="chart-point" cx={0} cy={0} />
 * </ChartWithTooltip>
 */
export function ChartWithTooltip({ data, xStart, xEnd, viewBox, children, height }: ChartWithTooltipProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    point: ChartDataPoint | null;
  }>({ visible: false, x: 0, y: 0, point: null });

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || data.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const vbox = svg.viewBox.baseVal;
    const xRatio = (e.clientX - rect.left) / rect.width;
    const svgX = xRatio * vbox.width;
    const usefulX = Math.max(xStart, Math.min(xEnd, svgX));
    const pct = (usefulX - xStart) / (xEnd - xStart);
    const idx = Math.round(pct * (data.length - 1));
    const point = data[idx];
    if (!point) return;

    setTooltip({
      visible: true,
      x: e.clientX,
      y: rect.top + window.scrollY + 20,
      point,
    });

    // Actualizar cursor + points
    const cursor = svg.querySelector<SVGLineElement>('.chart-cursor');
    if (cursor) {
      cursor.setAttribute('x1', String(usefulX));
      cursor.setAttribute('x2', String(usefulX));
      cursor.classList.add('on');
    }
    const points = svg.querySelectorAll<SVGCircleElement>('.chart-point');
    points.forEach((p, i) => {
      const serie = point.values[i];
      if (serie && serie.y !== undefined) {
        p.setAttribute('cx', String(usefulX));
        p.setAttribute('cy', String(serie.y));
        p.setAttribute('stroke', serie.color);
        p.classList.add('on');
      }
    });
  };

  const handleLeave = () => {
    setTooltip((t) => ({ ...t, visible: false }));
    const svg = svgRef.current;
    if (!svg) return;
    svg.querySelector('.chart-cursor')?.classList.remove('on');
    svg.querySelectorAll('.chart-point').forEach((p) => p.classList.remove('on'));
  };

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        viewBox={viewBox}
        style={{ width: '100%', height: height ? `${height}px` : 'auto', cursor: 'crosshair' }}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        {children}
      </svg>
      <ChartTooltip {...tooltip} />
    </div>
  );
}

function ChartTooltip({
  visible,
  x,
  y,
  point,
}: {
  visible: boolean;
  x: number;
  y: number;
  point: ChartDataPoint | null;
}) {
  if (!point) return null;
  return (
    <div
      className={`chart-tooltip ${visible ? 'on' : ''}`}
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      <div className="chart-tooltip-date">{point.date}</div>
      <div className="chart-tooltip-rows">
        {point.values.map((v, i) => (
          <div key={i} className="chart-tooltip-row">
            <div className="chart-tooltip-row-lbl">
              <span className="chart-tooltip-row-dot" style={{ background: v.color }} />
              {v.lbl}
            </div>
            <div className="chart-tooltip-row-val">{v.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
