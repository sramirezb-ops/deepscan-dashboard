'use client';

import type { ReactNode } from 'react';
import type { ChannelId } from '@/lib/channels';

// ============================================================
// Logos de marca (SVG inline)
// ============================================================
// Cada plataforma con su logo reconocible, dibujado en SVG para que se vea
// nítido a cualquier tamaño y sin depender de imágenes externas. Se usan para
// identificar la fuente de los datos (atribución de marca), tal como hacen
// Looker Studio o Porter Metrics. Colores de marca reales.
// ============================================================

export type Brand =
  | 'google-ads'
  | 'google-analytics'
  | 'meta'
  | 'tiktok'
  | 'instagram'
  | 'whatsapp'
  | 'youtube'
  | 'shopify'
  | 'clarity'
  | 'search-console'
  | 'merchant'
  | 'deepscan';

// Qué logo corresponde a cada canal/sub-vista del dashboard.
const CHANNEL_BRAND: Record<ChannelId, Brand> = {
  ov2: 'deepscan',
  week: 'deepscan',
  bot: 'whatsapp',
  gads: 'google-ads',
  pmax: 'google-ads',
  srch: 'google-ads',
  shop: 'google-ads',
  yt: 'youtube',
  prop: 'google-ads',
  avsia: 'google-ads',
  meta: 'meta',
  mili: 'meta',
  wa: 'whatsapp',
  ig: 'instagram',
  ttok: 'tiktok',
  ttkc: 'tiktok',
  ttkr: 'tiktok',
  ttkm: 'tiktok',
  ga4: 'google-analytics',
  cro: 'clarity',
  gsc: 'search-console',
  shp: 'shopify',
  gmc: 'merchant',
  ia: 'deepscan',
  abtest: 'deepscan',
  learn: 'deepscan',
};

export function brandForChannel(id: ChannelId): Brand {
  return CHANNEL_BRAND[id] ?? 'deepscan';
}

// Cabecera de hero reutilizable: logo de la plataforma + título en una fila.
// Da a cada vista el mismo tratamiento visual (como la captura de Looker).
export function HeroHead({ brand, children }: { brand: Brand; children: ReactNode }) {
  return (
    <div className="hero-head">
      <div className="hero-logo">
        <BrandLogo brand={brand} size={34} />
      </div>
      <div className="hero-title" style={{ margin: 0 }}>
        {children}
      </div>
    </div>
  );
}

// Nombre legible de la marca (para tooltips/alt).
export const BRAND_LABEL: Record<Brand, string> = {
  'google-ads': 'Google Ads',
  'google-analytics': 'Google Analytics',
  meta: 'Meta',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  youtube: 'YouTube',
  shopify: 'Shopify',
  clarity: 'Microsoft Clarity',
  'search-console': 'Search Console',
  merchant: 'Merchant Center',
  deepscan: 'DeepScan',
};

export function BrandLogo({
  brand,
  size = 22,
  className,
}: {
  brand: Brand;
  size?: number;
  className?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    xmlns: 'http://www.w3.org/2000/svg',
    role: 'img' as const,
    'aria-label': BRAND_LABEL[brand],
    className,
    style: { display: 'block', flexShrink: 0 },
  };

  switch (brand) {
    case 'google-ads':
      return (
        <svg {...common}>
          {/* Dos barras (amarilla + azul) que forman la "Λ" partiendo del vértice
              superior, más el círculo verde al pie. Pivote en (12,5) para que las
              barras roten sin salirse del viewBox (antes se recortaban abajo). */}
          <rect x="9.4" y="4" width="5.2" height="17" rx="2.6" fill="#FBBC04"
            transform="rotate(22 12 5)" />
          <rect x="9.4" y="4" width="5.2" height="17" rx="2.6" fill="#4285F4"
            transform="rotate(-22 12 5)" />
          <circle cx="7" cy="18.2" r="2.95" fill="#34A853" />
        </svg>
      );

    case 'google-analytics':
      return (
        <svg {...common}>
          <rect x="15.4" y="2.5" width="5" height="19" rx="2.5" fill="#F9AB00" />
          <rect x="9.4" y="8.5" width="5" height="13" rx="2.5" fill="#E37400" opacity="0.92" />
          <circle cx="6" cy="18.6" r="2.85" fill="#E37400" />
        </svg>
      );

    case 'meta':
      return (
        <svg {...common}>
          <defs>
            <linearGradient id="bl-meta" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#0099FF" />
              <stop offset="0.6" stopColor="#0064E1" />
              <stop offset="1" stopColor="#0052CC" />
            </linearGradient>
          </defs>
          <path
            d="M3.2 14.7c0-3.6 1.9-6.9 4.5-6.9 1.6 0 2.8 1.2 4.3 3.6 1.5-2.4 2.7-3.6 4.3-3.6 2.6 0 4.5 3.3 4.5 6.9 0 1.9-1 3.1-2.5 3.1-1.5 0-2.4-1-3.6-3-.5-.9-1.1-1.9-1.7-2.9l-1 1.7-1 1.7C13.6 17.1 13 18 11.7 18c-1.4 0-2.4-1.2-3.6-3-.6-1-1.2-2-1.7-2.9-.6 1-.9 2.1-.9 3.1 0 1.1.5 1.8 1.3 1.8.7 0 1.2-.5 2-1.8l1 1.7C9 18.6 8 19.4 6.6 19.4c-2 0-3.4-1.9-3.4-4.7z"
            fill="url(#bl-meta)"
          />
        </svg>
      );

    case 'tiktok': {
      const note =
        'M14.2 3c.35 2.2 1.85 3.85 3.95 4.2v2.5c-1.45.05-2.85-.4-3.95-1.25v6.55a4.45 4.45 0 1 1-2.65-4.07V12.5a1.95 1.95 0 1 0 1.35 1.85V3h1.3z';
      return (
        <svg {...common}>
          <path d={note} fill="#FE2C55" transform="translate(1.1 1.1)" />
          <path d={note} fill="#25F4EE" transform="translate(-1.1 -1.1)" />
          <path d={note} fill="#F1F1F1" />
        </svg>
      );
    }

    case 'instagram':
      return (
        <svg {...common}>
          <defs>
            <radialGradient id="bl-ig" cx="0.3" cy="1" r="1.1">
              <stop offset="0" stopColor="#FED576" />
              <stop offset="0.35" stopColor="#F47133" />
              <stop offset="0.65" stopColor="#BC3081" />
              <stop offset="1" stopColor="#4C63D2" />
            </radialGradient>
          </defs>
          <rect x="2.2" y="2.2" width="19.6" height="19.6" rx="5.6" fill="url(#bl-ig)" />
          <circle cx="12" cy="12" r="4.6" fill="none" stroke="#fff" strokeWidth="1.9" />
          <circle cx="17.4" cy="6.6" r="1.25" fill="#fff" />
        </svg>
      );

    case 'whatsapp':
      return (
        <svg {...common}>
          <path
            d="M12 2.2a9.8 9.8 0 0 0-8.36 14.9L2.2 21.8l4.84-1.4A9.8 9.8 0 1 0 12 2.2z"
            fill="#25D366"
          />
          <path
            d="M9.05 7.2c-.2-.46-.36-.47-.56-.48l-.48-.01a.92.92 0 0 0-.66.31c-.23.25-.87.85-.87 2.07s.89 2.4 1.01 2.57c.13.16 1.74 2.78 4.29 3.79 2.12.84 2.55.67 3.01.62.46-.04 1.48-.6 1.69-1.19.21-.58.21-1.08.15-1.18-.06-.1-.23-.16-.48-.29-.25-.12-1.48-.73-1.71-.81-.23-.08-.4-.12-.56.13-.16.25-.64.81-.79.98-.14.16-.29.18-.54.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.14-.25-.02-.39.11-.51.11-.11.25-.29.38-.43.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.55-1.36-.77-1.85z"
            fill="#fff"
          />
        </svg>
      );

    case 'youtube':
      return (
        <svg {...common}>
          <rect x="1.6" y="5" width="20.8" height="14" rx="4.2" fill="#FF0000" />
          <path d="M10 8.6l5.4 3.4L10 15.4z" fill="#fff" />
        </svg>
      );

    case 'shopify':
      return (
        <svg {...common}>
          <path
            d="M15.6 4.2c-.1-.05-.95-.1-.95-.1s-.63-.62-.78-.74c-.06-.05-.13-.08-.2-.1l-.5 13.1 4.55-.98s-1.78-12.02-1.79-12.1c-.02-.08-.08-.1-.13-.1-.05 0-.99-.02-.99-.02l.78.04z"
            fill="#95BF47"
          />
          <path
            d="M13.3 2.85c-.06-.02-.13-.02-.2-.02-.02 0-.36.1-.9.27-.53-1.53-1.47-2.93-3.12-2.93h-.14C8.5-.39 8 .1 8 .1 5.96.74 4.98 3.27 4.69 4.55c-.79.24-1.35.42-1.42.44-.44.14-.45.15-.51.56C2.71 5.86 1.5 15.2 1.5 15.2l9.42 1.77.5-13.1c-.05-.02-.1-.02-.16-.02-.7 0-1.32.7-1.74 1.55l-.95.3c.35-1.18 1.02-1.92 1.6-2.2-.42-.45-.92-.55-1.36-.55-1.8 0-2.66 2.26-2.93 3.4l-1.3.4C4.6 5.86 5.5 3.1 8 2.55c.08-.02.16-.03.24-.03 1.6 0 2.55 1.45 3.05 2.95.5-.15.86-.26.9-.27.42-.13.4-.12.45.27z"
            fill="#5E8E3E"
          />
          <path
            d="M13.1 3.83s-.94-.02-.94-.02-.78.76-.86.84c-.03.03-.07.05-.11.06l.5 13.06 4.55-.98s-1.78-12.02-1.79-12.1c-.02-.08-.08-.1-.13-.1z"
            fill="#fff"
            opacity="0.0"
          />
          <text x="9" y="14" fontSize="8.5" fontWeight="700" fill="#fff"
            fontFamily="Arial, sans-serif" textAnchor="middle">S</text>
        </svg>
      );

    case 'clarity':
      return (
        <svg {...common}>
          <defs>
            <linearGradient id="bl-clarity" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#3BA3F2" />
              <stop offset="1" stopColor="#1E63D0" />
            </linearGradient>
          </defs>
          <circle cx="12" cy="12" r="9.6" fill="url(#bl-clarity)" />
          <circle cx="12" cy="12" r="4.6" fill="#fff" />
          <circle cx="12" cy="12" r="2.1" fill="#1E63D0" />
        </svg>
      );

    case 'search-console':
      return (
        <svg {...common}>
          <circle cx="10.2" cy="10.2" r="6.3" fill="none" stroke="#4285F4" strokeWidth="2.4" />
          <circle cx="10.2" cy="10.2" r="6.3" fill="none" stroke="#34A853" strokeWidth="2.4"
            strokeDasharray="9.9 29.7" strokeLinecap="round" transform="rotate(40 10.2 10.2)" />
          <line x1="15" y1="15" x2="20.4" y2="20.4" stroke="#FBBC04" strokeWidth="2.6"
            strokeLinecap="round" />
        </svg>
      );

    case 'merchant':
      return (
        <svg {...common}>
          <path d="M4 8h16l-1 4H5L4 8z" fill="#4285F4" />
          <rect x="5" y="11.5" width="14" height="9" rx="1.6" fill="#4285F4" opacity="0.18"
            stroke="#4285F4" strokeWidth="1.6" />
          <path d="M8.3 8c0-2 1.6-3.6 3.7-3.6S15.7 6 15.7 8" fill="none" stroke="#34A853"
            strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );

    case 'deepscan':
    default:
      // Logo real DeepScan (/logos/DEEPSCAN.svg). En ese archivo el "DS" son
      // recortes transparentes sobre un cuadrado negro, así que ponemos fondo
      // blanco detrás para que las letras se lean blancas sobre negro.
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/logos/DEEPSCAN.svg"
          width={size}
          height={size}
          alt={BRAND_LABEL[brand]}
          className={className}
          style={{
            display: 'block',
            flexShrink: 0,
            borderRadius: Math.round(size * 0.22),
            background: '#fff',
          }}
        />
      );
  }
}
