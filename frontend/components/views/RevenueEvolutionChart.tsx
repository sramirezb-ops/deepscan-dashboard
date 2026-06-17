'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { ChartWithTooltip, type ChartDataPoint } from '@/components/ui/ChartWithTooltip';

export function RevenueEvolutionChart() {
  const data = useMemo<ChartDataPoint[]>(() => {
    const days = 30;
    const points: ChartDataPoint[] = [];
    for (let i = 0; i <= days; i++) {
      const abr = Math.round(40 + i * 37);
      const mar = Math.round(10 + i * 28);
      points.push({
        date: `${i + 1} abr`,
        values: [
          {
            lbl: 'Abril',
            val: `$${(abr * 1000).toLocaleString('en-US')}`,
            color: '#8b5cf6',
            y: 210 - (abr / 1200) * 180,
          },
          {
            lbl: 'Marzo',
            val: `$${(mar * 1000).toLocaleString('en-US')}`,
            color: '#64748b',
            y: 210 - (mar / 1200) * 180,
          },
        ],
      });
    }
    return points;
  }, []);

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
            Abril vs Marzo · acumulado diario
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 11, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 16, height: 2, background: '#8b5cf6', display: 'inline-block' }} />
            Abril $1.15M
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 16,
                height: 2,
                background: 'rgba(255,255,255,0.25)',
                display: 'inline-block',
              }}
            />
            Marzo $925K
          </div>
          <span className="period-ytd">YTD $4.48M · +17.3% vs 2025</span>
        </div>
      </div>

      <ChartWithTooltip data={data} xStart={40} xEnd={880} viewBox="0 0 900 240">
        <defs>
          <linearGradient id="gradCurr" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid */}
        <line x1="40" y1="30" x2="880" y2="30" stroke="rgba(255,255,255,0.04)" />
        <line x1="40" y1="90" x2="880" y2="90" stroke="rgba(255,255,255,0.04)" />
        <line x1="40" y1="150" x2="880" y2="150" stroke="rgba(255,255,255,0.04)" />
        <line x1="40" y1="210" x2="880" y2="210" stroke="rgba(255,255,255,0.08)" />

        {/* Y labels */}
        <text x="35" y="34" textAnchor="end" style={{ fontSize: 10, fill: 'var(--mu)' }}>$1.2M</text>
        <text x="35" y="94" textAnchor="end" style={{ fontSize: 10, fill: 'var(--mu)' }}>$800K</text>
        <text x="35" y="154" textAnchor="end" style={{ fontSize: 10, fill: 'var(--mu)' }}>$400K</text>
        <text x="35" y="214" textAnchor="end" style={{ fontSize: 10, fill: 'var(--mu)' }}>$0</text>

        {/* X labels */}
        <text x="40" y="230" style={{ fontSize: 10, fill: 'var(--mu)' }}>1</text>
        <text x="180" y="230" style={{ fontSize: 10, fill: 'var(--mu)' }}>7</text>
        <text x="320" y="230" style={{ fontSize: 10, fill: 'var(--mu)' }}>14</text>
        <text x="460" y="230" style={{ fontSize: 10, fill: 'var(--mu)' }}>21</text>
        <text x="600" y="230" style={{ fontSize: 10, fill: 'var(--mu)' }}>28</text>
        <text x="740" y="230" style={{ fontSize: 10, fill: 'var(--mu)' }}>30 abr</text>

        {/* Marzo */}
        <polyline
          points="40,210 68,205 96,200 124,195 152,188 180,180 208,172 236,163 264,154 292,146 320,138 348,130 376,122 404,115 432,108 460,100 488,94 516,88 544,83 572,78 600,73 628,68 656,63 684,58 712,53 740,48 768,44 796,41 824,39 852,38 880,38"
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        {/* Abril */}
        <polyline
          points="40,210 68,204 96,197 124,189 152,181 180,172 208,162 236,152 264,142 292,131 320,120 348,108 376,96 404,84 432,72 460,62 488,54 516,48 544,44 572,40 600,37 628,34 656,32 684,30 712,28 740,26 768,24 796,22 824,20 852,18 880,16"
          fill="none"
          stroke="#8b5cf6"
          strokeWidth="2.5"
        />
        <polygon
          points="40,210 68,204 96,197 124,189 152,181 180,172 208,162 236,152 264,142 292,131 320,120 348,108 376,96 404,84 432,72 460,62 488,54 516,48 544,44 572,40 600,37 628,34 656,32 684,30 712,28 740,26 768,24 796,22 824,20 852,18 880,16 880,210"
          fill="url(#gradCurr)"
        />
        {/* Último punto */}
        <circle cx="880" cy="16" r="5" fill="#8b5cf6" />
        <circle cx="880" cy="16" r="9" fill="#8b5cf6" opacity="0.3" />

        {/* Cursor + points para hover */}
        <line className="chart-cursor" x1="0" y1="20" x2="0" y2="210" />
        <circle className="chart-point" cx="0" cy="0" />
        <circle className="chart-point" cx="0" cy="0" />
      </ChartWithTooltip>
    </Card>
  );
}
