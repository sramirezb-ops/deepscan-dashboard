import type { ReactNode, CSSProperties } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Card({ children, className = '', style }: CardProps) {
  return (
    <div className={`card ${className}`} style={style}>
      {children}
    </div>
  );
}

interface HeroProps {
  label?: string;
  labelIcon?: string;
  title: ReactNode;
  subtitle?: string;
  children?: ReactNode;
}

export function Hero({ label, labelIcon, title, subtitle, children }: HeroProps) {
  return (
    <div className="hero">
      {label && (
        <div className="hero-lbl">
          {labelIcon && <span>{labelIcon}</span>}
          <span>{label}</span>
        </div>
      )}
      <div className="hero-title">{title}</div>
      {subtitle && <div className="hero-sub">{subtitle}</div>}
      {children && <div className="hero-stats">{children}</div>}
    </div>
  );
}

interface HeroSimpleProps {
  title: string;
  sub: string;
}

// Variante simple para vistas que no son Overview
export function HeroSimple({ title, sub }: HeroSimpleProps) {
  return (
    <div className="hero">
      <div className="hero-title">{title}</div>
      <div className="hero-sub">{sub}</div>
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  sub?: string;
  right?: ReactNode;
}

export function CardHeader({ title, sub, right }: CardHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px',
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontSize: '15px' }}>{title}</h3>
        {sub && <div style={{ fontSize: '12px', color: 'var(--mu)', marginTop: '4px' }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}
