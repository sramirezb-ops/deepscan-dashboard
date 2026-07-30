# DeepScan Dashboard · Next.js v7.1

Next.js 14 + Supabase. Overview conectado a datos reales.

## Setup

```bash
cd frontend/
npm install
npm run dev
# → http://localhost:3000
```

## Variables de entorno (.env.local)

Requeridas:

```
NEXT_PUBLIC_SUPABASE_URL=https://qlthcuzbjewtysotanze.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_CLIENT_ID=bae8c125-19e0-46b4-b0f6-462b642658ac
NEXT_PUBLIC_CLIENT_NAME=Basics Sneaker Store
NEXT_PUBLIC_CURRENCY=MXN
```

## Qué tiene datos reales (Supabase)

- ✅ `/overview` → hook `useOverview()` consulta `gads_campaigns` + `ga4_metrics` para los últimos 30 días, calcula revenue, ROAS, ventas, CPA, tasa conv., deltas vs 30d anteriores, y mix por canal.

## Qué queda con datos mockup (hardcoded del v7)

Todas las demás 18 vistas (Week, Google Ads, PMAX, Search, Shopping, YouTube, Meta, WhatsApp, Instagram, TikTok, GA4, Clarity, Search Console, Shopify, Merchant Center, Insights, ABTests, Learnings).

Cuando quieras conectar cada una, usá `useOverview` como patrón de referencia y creá un hook análogo en `lib/hooks/`.

## Tablas Supabase disponibles

- gads_campaigns · 9 filas Basics
- gads_ad_groups · 3 filas Basics
- gads_ads · 3 filas Basics
- gads_search_term_details · 5,000 filas Basics
- gads_geo · 2,870 filas Basics
- gads_asset_groups · 6 filas
- gads_products · ~6,000 filas
- gads_zombies · 311 productos sin clics
- ga4_metrics · 463 filas
- ga4_funnel · 30 días
- gmc_products · 14,038 productos

## Stack

- Next.js 14.2.5
- React 18.3.1
- @supabase/supabase-js 2.45
- SWR 2.2
- TypeScript 5.5
- Sin Tailwind (CSS custom en globals.css)

## Estructura

```
app/                      20 rutas (overview, week, meta, tiktok, ...)
components/
├── layout/               Sidebar, Topbar, ChannelModal
├── ui/                   Agent, KpiCard, Card, DimensionTable, ChartWithTooltip, etc.
└── views/                20 componentes de vistas
lib/
├── supabase.ts           Cliente Supabase singleton
├── utils.ts              Formatters + helpers de período
├── hooks/
│   └── useOverview.ts    Hook Overview conectado a Supabase
├── channels.ts
├── types.ts
├── useClient.tsx         Context con cliente actual (env vars)
└── useChannelModal.tsx
```

## Pendiente

- [ ] Crear hooks para las otras 19 vistas (`useGoogleAds`, `useGA4`, etc.)
- [ ] Conectar Meta Ads (token inválido)
- [ ] Conectar Shopify
- [ ] Multi-cliente con URLs tipo `/[clientId]/overview`
- [ ] Deploy a Vercel
- [ ] Actualizar Next.js a 14.2.32+ (security advisory)
