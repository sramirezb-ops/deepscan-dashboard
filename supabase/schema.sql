-- ============================================================
-- DEEPSCAN DASHBOARD · SUPABASE SCHEMA
-- ============================================================
-- Ejecutar en orden en el SQL Editor de Supabase

-- ── EXTENSIONES ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── CLIENTES ─────────────────────────────────────────────────
-- Cada cliente de DeepScan tiene su propia fila
create table if not exists clients (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text unique not null,           -- usado en la URL /cliente/[slug]
  logo_url    text,
  timezone    text default 'America/Bogota',
  currency    text default 'COP',
  created_at  timestamptz default now()
);

-- ── META ADS ─────────────────────────────────────────────────
create table if not exists meta_campaigns (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid references clients(id) on delete cascade,
  date            date not null,
  campaign_id     text not null,
  campaign_name   text,
  adset_id        text,
  adset_name      text,
  ad_id           text,
  ad_name         text,
  status          text,                        -- ACTIVE | PAUSED
  spend           numeric(14,2) default 0,
  impressions     bigint default 0,
  clicks          bigint default 0,
  reach           bigint default 0,
  ctr             numeric(8,4) default 0,
  cpm             numeric(10,2) default 0,
  cpp             numeric(10,2) default 0,
  frequency       numeric(6,2) default 0,
  purchases       numeric(10,2) default 0,
  purchase_value  numeric(14,2) default 0,
  roas            numeric(8,4) default 0,
  add_to_cart     numeric(10,2) default 0,
  initiate_checkout numeric(10,2) default 0,
  view_content    numeric(10,2) default 0,
  cpa             numeric(10,2) default 0,
  thumb_url       text,                        -- URL miniatura del anuncio
  inserted_at     timestamptz default now(),
  unique (client_id, date, ad_id)
);

-- ── GOOGLE ADS / PMAX ─────────────────────────────────────────
-- Métricas diarias por campaña (r_camp del script Mike Rhodes)
create table if not exists gads_campaigns (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid references clients(id) on delete cascade,
  date            date not null,
  campaign_name   text not null,
  cost            numeric(14,2) default 0,     -- cost_micros / 1_000_000
  conversions     numeric(10,2) default 0,
  conv_value      numeric(14,2) default 0,
  impressions     bigint default 0,
  clicks          bigint default 0,
  video_views     bigint default 0,
  avg_cpv         numeric(10,4) default 0,
  roas            numeric(8,4) default 0,      -- calculado: conv_value / cost
  inserted_at     timestamptz default now(),
  unique (client_id, date, campaign_name)
);

-- Asset Groups (r_ag)
create table if not exists gads_asset_groups (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid references clients(id) on delete cascade,
  date            date not null,
  campaign_name   text not null,
  asset_group_name text not null,
  ad_strength     text,                        -- POOR | GOOD | EXCELLENT
  status          text,                        -- ENABLED | PAUSED
  impressions     bigint default 0,
  clicks          bigint default 0,
  cost            numeric(14,2) default 0,
  conversions     numeric(10,2) default 0,
  conv_value      numeric(14,2) default 0,
  roas            numeric(8,4) default 0,
  inserted_at     timestamptz default now(),
  unique (client_id, date, campaign_name, asset_group_name)
);

-- Productos / SKUs (r_prod_t y r_prod_t_180)
create table if not exists gads_products (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid references clients(id) on delete cascade,
  period          text not null,               -- '30d' | '180d'
  campaign_name   text not null,
  product_title   text,
  product_item_id text,                        -- SKU · join con Shopify
  custom_label_0  text,
  custom_label_1  text,
  custom_label_2  text,
  custom_label_3  text,
  custom_label_4  text,
  cost            numeric(14,2) default 0,
  conversions     numeric(10,2) default 0,
  conv_value      numeric(14,2) default 0,
  impressions     bigint default 0,
  roas            numeric(8,4) default 0,
  inserted_at     timestamptz default now(),
  unique (client_id, period, campaign_name, product_item_id)
);

-- Productos zombie (0 clics en 366 días)
create table if not exists gads_zombies (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid references clients(id) on delete cascade,
  product_item_id text not null,
  product_title   text,
  impressions     bigint default 0,
  clicks          bigint default 0,            -- siempre 0
  inserted_at     timestamptz default now(),
  unique (client_id, product_item_id)
);

-- Assets con performance label (r_ads × r_allads)
create table if not exists gads_assets (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid references clients(id) on delete cascade,
  campaign_name   text,
  asset_group_name text,
  asset_group_id  text,
  asset_id        text,
  asset_type      text,                        -- IMAGE | TEXT | YOUTUBE_VIDEO | etc
  field_type      text,                        -- HEADLINE | DESCRIPTION | IMAGE | VIDEO | etc
  performance_label text,                      -- BEST | GOOD | LOW | PENDING | UNSPECIFIED
  ad_strength     text,
  status          text,
  source          text,                        -- ADVERTISER | AUTO (generado por Google)
  asset_text      text,                        -- para TEXT assets
  image_url       text,                        -- para IMAGE assets
  youtube_video_id text,                       -- para VIDEO assets
  youtube_title   text,
  final_url       text,
  inserted_at     timestamptz default now(),
  unique (client_id, asset_group_id, asset_id, field_type)
);

-- Términos de búsqueda PMAX (script smec · branded vs non-branded)
create table if not exists gads_search_terms (
  id                        uuid primary key default uuid_generate_v4(),
  client_id                 uuid references clients(id) on delete cascade,
  period_start              date not null,
  period_end                date not null,
  -- Branded
  conversions_branded       numeric(10,2) default 0,
  conv_value_branded        numeric(14,2) default 0,
  clicks_branded            bigint default 0,
  impressions_branded       bigint default 0,
  ctr_branded               numeric(8,6) default 0,
  conv_rate_branded         numeric(8,6) default 0,
  ratio_branded_conv        numeric(8,6) default 0,
  ratio_branded_conv_value  numeric(8,6) default 0,
  ratio_branded_clicks      numeric(8,6) default 0,
  ratio_branded_impressions numeric(8,6) default 0,
  -- Non-branded
  conversions_nonbranded    numeric(10,2) default 0,
  conv_value_nonbranded     numeric(14,2) default 0,
  clicks_nonbranded         bigint default 0,
  impressions_nonbranded    bigint default 0,
  ctr_nonbranded            numeric(8,6) default 0,
  conv_rate_nonbranded      numeric(8,6) default 0,
  -- Blank (no identificado)
  conversions_blank         numeric(10,2) default 0,
  conv_value_blank          numeric(14,2) default 0,
  clicks_blank              bigint default 0,
  impressions_blank         bigint default 0,
  ctr_blank                 numeric(8,6) default 0,
  conv_rate_blank           numeric(8,6) default 0,
  inserted_at               timestamptz default now(),
  unique (client_id, period_start, period_end)
);

-- ── GOOGLE ANALYTICS 4 ───────────────────────────────────────
create table if not exists ga4_metrics (
  id                uuid primary key default uuid_generate_v4(),
  client_id         uuid references clients(id) on delete cascade,
  date              date not null,
  sessions          bigint default 0,
  new_users         bigint default 0,
  active_users      bigint default 0,
  bounce_rate       numeric(6,4) default 0,
  avg_session_duration numeric(10,2) default 0, -- segundos
  conversions       bigint default 0,
  conv_rate         numeric(6,4) default 0,
  revenue           numeric(14,2) default 0,
  -- Fuente de tráfico
  source_medium     text,                       -- 'google / cpc', 'facebook / paid', etc
  inserted_at       timestamptz default now(),
  unique (client_id, date, source_medium)
);

-- Funnel GA4
create table if not exists ga4_funnel (
  id                uuid primary key default uuid_generate_v4(),
  client_id         uuid references clients(id) on delete cascade,
  date              date not null,
  sessions          bigint default 0,
  product_views     bigint default 0,
  add_to_cart       bigint default 0,
  checkout_start    bigint default 0,
  purchases         bigint default 0,
  inserted_at       timestamptz default now(),
  unique (client_id, date)
);

-- ── GOOGLE MERCHANT CENTER ───────────────────────────────────
create table if not exists gmc_products (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid references clients(id) on delete cascade,
  product_id      text not null,
  title           text,
  brand           text,
  price           numeric(14,2),
  status          text,                        -- APPROVED | PENDING | DISAPPROVED
  issues          jsonb,                       -- array de errores del feed
  clicks          bigint default 0,
  impressions     bigint default 0,
  ctr             numeric(8,6) default 0,
  inserted_at     timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (client_id, product_id)
);

-- ── SHOPIFY ──────────────────────────────────────────────────
create table if not exists shopify_orders (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid references clients(id) on delete cascade,
  date            date not null,
  orders          bigint default 0,
  revenue         numeric(14,2) default 0,
  avg_order_value numeric(10,2) default 0,
  new_customers   bigint default 0,
  returning_customers bigint default 0,
  units_sold      bigint default 0,
  refunds         numeric(14,2) default 0,
  inserted_at     timestamptz default now(),
  unique (client_id, date)
);

create table if not exists shopify_products (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid references clients(id) on delete cascade,
  period_start    date not null,
  period_end      date not null,
  product_id      text not null,
  title           text,
  sku             text,                        -- join con gads_products.product_item_id
  revenue         numeric(14,2) default 0,
  units_sold      bigint default 0,
  orders          bigint default 0,
  avg_price       numeric(10,2) default 0,
  conv_rate       numeric(6,4) default 0,
  inserted_at     timestamptz default now(),
  unique (client_id, period_start, product_id)
);

-- Funnel Shopify
create table if not exists shopify_funnel (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid references clients(id) on delete cascade,
  date            date not null,
  sessions        bigint default 0,
  product_views   bigint default 0,
  add_to_cart     bigint default 0,
  checkout_start  bigint default 0,
  orders          bigint default 0,
  abandoned_cart_value numeric(14,2) default 0,
  inserted_at     timestamptz default now(),
  unique (client_id, date)
);

-- ── MICROSOFT CLARITY ────────────────────────────────────────
create table if not exists clarity_metrics (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid references clients(id) on delete cascade,
  date            date not null,
  sessions        bigint default 0,
  scroll_depth    numeric(6,4) default 0,      -- promedio 0–1
  dead_click_rate numeric(6,4) default 0,
  rage_click_rate numeric(6,4) default 0,
  quick_back_rate numeric(6,4) default 0,      -- rebote rápido
  inserted_at     timestamptz default now(),
  unique (client_id, date)
);

create table if not exists clarity_pages (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid references clients(id) on delete cascade,
  date            date not null,
  page_url        text not null,
  sessions        bigint default 0,
  scroll_depth    numeric(6,4) default 0,
  dead_clicks     bigint default 0,
  rage_clicks     bigint default 0,
  exit_rate       numeric(6,4) default 0,
  inserted_at     timestamptz default now(),
  unique (client_id, date, page_url)
);

-- ── VISTA: OVERVIEW CONSOLIDADO ──────────────────────────────
-- Vista que el frontend usa para el Overview general
create or replace view v_overview as
select
  c.id            as client_id,
  c.name          as client_name,
  c.currency,
  -- Meta Ads (últimos 30 días)
  coalesce(sum(m.spend), 0)           as meta_spend,
  coalesce(sum(m.purchases), 0)       as meta_purchases,
  coalesce(sum(m.purchase_value), 0)  as meta_revenue,
  case when sum(m.spend) > 0
    then sum(m.purchase_value) / sum(m.spend)
    else 0 end                         as meta_roas,
  -- Google Ads (últimos 30 días)
  coalesce(sum(g.cost), 0)            as gads_cost,
  coalesce(sum(g.conversions), 0)     as gads_conversions,
  coalesce(sum(g.conv_value), 0)      as gads_conv_value,
  case when sum(g.cost) > 0
    then sum(g.conv_value) / sum(g.cost)
    else 0 end                         as gads_roas,
  -- Total combinado
  coalesce(sum(m.spend), 0) + coalesce(sum(g.cost), 0) as total_spend,
  coalesce(sum(m.purchase_value), 0) + coalesce(sum(g.conv_value), 0) as total_revenue,
  case
    when (coalesce(sum(m.spend), 0) + coalesce(sum(g.cost), 0)) > 0
    then (coalesce(sum(m.purchase_value), 0) + coalesce(sum(g.conv_value), 0))
         / (coalesce(sum(m.spend), 0) + coalesce(sum(g.cost), 0))
    else 0
  end as combined_roas
from clients c
left join meta_campaigns m
  on m.client_id = c.id
  and m.date >= current_date - interval '30 days'
left join gads_campaigns g
  on g.client_id = c.id
  and g.date >= current_date - interval '30 days'
group by c.id, c.name, c.currency;

-- ── RLS (Row Level Security) ──────────────────────────────────
-- Activar RLS en todas las tablas de datos
alter table clients            enable row level security;
alter table meta_campaigns     enable row level security;
alter table gads_campaigns     enable row level security;
alter table gads_asset_groups  enable row level security;
alter table gads_products      enable row level security;
alter table gads_zombies       enable row level security;
alter table gads_assets        enable row level security;
alter table gads_search_terms  enable row level security;
alter table ga4_metrics        enable row level security;
alter table ga4_funnel         enable row level security;
alter table gmc_products       enable row level security;
alter table shopify_orders     enable row level security;
alter table shopify_products   enable row level security;
alter table shopify_funnel     enable row level security;
alter table clarity_metrics    enable row level security;
alter table clarity_pages      enable row level security;

-- Policy: service role tiene acceso total (usado por el ETL)
create policy "service_role_all" on clients
  for all using (auth.role() = 'service_role');
create policy "service_role_all" on meta_campaigns
  for all using (auth.role() = 'service_role');
create policy "service_role_all" on gads_campaigns
  for all using (auth.role() = 'service_role');
create policy "service_role_all" on gads_asset_groups
  for all using (auth.role() = 'service_role');
create policy "service_role_all" on gads_products
  for all using (auth.role() = 'service_role');
create policy "service_role_all" on gads_zombies
  for all using (auth.role() = 'service_role');
create policy "service_role_all" on gads_assets
  for all using (auth.role() = 'service_role');
create policy "service_role_all" on gads_search_terms
  for all using (auth.role() = 'service_role');
create policy "service_role_all" on ga4_metrics
  for all using (auth.role() = 'service_role');
create policy "service_role_all" on ga4_funnel
  for all using (auth.role() = 'service_role');
create policy "service_role_all" on gmc_products
  for all using (auth.role() = 'service_role');
create policy "service_role_all" on shopify_orders
  for all using (auth.role() = 'service_role');
create policy "service_role_all" on shopify_products
  for all using (auth.role() = 'service_role');
create policy "service_role_all" on shopify_funnel
  for all using (auth.role() = 'service_role');
create policy "service_role_all" on clarity_metrics
  for all using (auth.role() = 'service_role');
create policy "service_role_all" on clarity_pages
  for all using (auth.role() = 'service_role');

-- Policy: anon puede leer (el frontend usa la anon key con client_id del JWT)
create policy "anon_read_own" on meta_campaigns
  for select using (true);
create policy "anon_read_own" on gads_campaigns
  for select using (true);
create policy "anon_read_own" on gads_asset_groups
  for select using (true);
create policy "anon_read_own" on gads_products
  for select using (true);
create policy "anon_read_own" on gads_zombies
  for select using (true);
create policy "anon_read_own" on gads_assets
  for select using (true);
create policy "anon_read_own" on gads_search_terms
  for select using (true);
create policy "anon_read_own" on ga4_metrics
  for select using (true);
create policy "anon_read_own" on ga4_funnel
  for select using (true);
create policy "anon_read_own" on gmc_products
  for select using (true);
create policy "anon_read_own" on shopify_orders
  for select using (true);
create policy "anon_read_own" on shopify_products
  for select using (true);
create policy "anon_read_own" on shopify_funnel
  for select using (true);
create policy "anon_read_own" on clarity_metrics
  for select using (true);
create policy "anon_read_own" on clarity_pages
  for select using (true);

-- ── ÍNDICES ───────────────────────────────────────────────────
create index if not exists idx_meta_client_date        on meta_campaigns(client_id, date desc);
create index if not exists idx_gads_camp_client_date   on gads_campaigns(client_id, date desc);
create index if not exists idx_gads_ag_client_date     on gads_asset_groups(client_id, date desc);
create index if not exists idx_gads_prod_client        on gads_products(client_id, product_item_id);
create index if not exists idx_ga4_client_date         on ga4_metrics(client_id, date desc);
create index if not exists idx_ga4_funnel_client_date  on ga4_funnel(client_id, date desc);
create index if not exists idx_shopify_orders_date     on shopify_orders(client_id, date desc);
create index if not exists idx_shopify_funnel_date     on shopify_funnel(client_id, date desc);
create index if not exists idx_clarity_client_date     on clarity_metrics(client_id, date desc);
create index if not exists idx_clarity_pages_date      on clarity_pages(client_id, date desc);
create index if not exists idx_gmc_client_status       on gmc_products(client_id, status);
