interface ThumbnailProps {
  variant?: 'g1' | 'g2' | 'g3' | 'g4' | 'g5' | 'g6' | 'g7' | 'g8';
  size?: 'sm' | 'md' | 'lg' | 'sq' | 'full';
  src?: string;
  alt?: string;
  className?: string;
}

const SIZE_MAP = {
  sm: { width: 36, height: 58 },
  md: { width: 44, height: 72 },
  lg: { width: 64, height: 104 },
  sq: { width: 52, height: 52 },
  full: null,
};

export function Thumbnail({ variant = 'g1', size = 'md', src, alt, className = '' }: ThumbnailProps) {
  const sizeStyle = SIZE_MAP[size];
  const cls = `thumb ${variant} ${src ? 'img' : ''} ${className}`.trim();
  const style: React.CSSProperties = {};

  if (sizeStyle) {
    style.width = sizeStyle.width;
    style.height = sizeStyle.height;
  } else if (size === 'full') {
    style.width = '100%';
    style.height = 'auto';
    style.aspectRatio = '9/16';
  }

  if (src) {
    return (
      <div className={cls} style={style}>
        <img src={src} alt={alt || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  return <div className={cls} style={style} aria-label={alt} />;
}

interface HierarchyProps {
  campaign: string;
  adSet?: string;
  ad?: string;
}

/**
 * Jerarquía Campaña › Ad Set › Anuncio
 * Usado en tablas de performance creativo
 */
export function Hierarchy({ campaign, adSet, ad }: HierarchyProps) {
  return (
    <div className="hier">
      <div className="hier-l1">
        {campaign}
        {adSet && ` › ${adSet}`}
      </div>
      {ad && <div className="hier-l3">{ad}</div>}
    </div>
  );
}
