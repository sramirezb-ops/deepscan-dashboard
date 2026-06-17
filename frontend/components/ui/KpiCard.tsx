import type { KpiData } from '@/lib/types';

interface KpiCardProps extends KpiData {
  className?: string;
}

export function KpiCard({
  label,
  value,
  delta,
  ytd,
  ytdValue,
  comparison,
  spark,
  variant = 'violet',
  className = '',
}: KpiCardProps) {
  const variantClass = `k-${variant}`;

  return (
    <div className={`kpi ${variantClass} ${className}`}>
      <div className="kpi-lbl">{label}</div>
      <div className="kpi-val">{value}</div>
      <div className="kpi-bot">
        {delta && (
          <span
            className={`kpi-delta ${
              delta.direction === 'up' ? 'tgu' : delta.direction === 'down' ? 'tgd' : 'tgm'
            }`}
          >
            {delta.value}
          </span>
        )}
        {ytd && (
          <span className="dcmp">
            {ytd} {ytdValue && <b>{ytdValue}</b>}
          </span>
        )}
        {comparison && !ytd && <span className="dcmp">{comparison}</span>}
        {spark && spark.length > 0 && (
          <span className="spark">
            {spark.map((h, i) => (
              <span key={i} className="spark-bar" style={{ height: `${h}%` }} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

// Versión Hero-stat para la tarjeta grande de Overview
interface HeroStatProps {
  label: string;
  value: string;
  delta?: { value: string; direction: 'up' | 'down' | 'neutral' };
  comparison?: string;
  ytd?: string;
  ytdValue?: string;
}

export function HeroStat({ label, value, delta, comparison, ytd, ytdValue }: HeroStatProps) {
  return (
    <div>
      <div className="hero-stat-lbl">{label}</div>
      <div className="hero-stat-val">{value}</div>
      <div className="hero-stat-sub">
        {delta && (
          <span
            className={`tg ${
              delta.direction === 'up' ? 'tgu' : delta.direction === 'down' ? 'tgd' : 'tgm'
            }`}
          >
            {delta.value}
          </span>
        )}{' '}
        {(ytd || comparison) && (
          <span className="dcmp">
            {ytd && `${ytd} `}
            {ytdValue && <b>{ytdValue}</b>}
            {comparison && comparison}
          </span>
        )}
      </div>
    </div>
  );
}
