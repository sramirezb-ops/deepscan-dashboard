-- ============================================================
-- Migración 0006 — Tabla tiktok_campaigns (TikTok Ads, orientada a LEADS)
-- ============================================================
-- Objetivo: guardar el rendimiento diario de TikTok Ads a nivel anuncio,
-- igual que meta_campaigns hace para Meta. La unidad de cada fila es:
--   un día × un anuncio (ad_id), por cliente.
--
-- Ofero es un negocio de LEADS (prospectos a WhatsApp), NO e-commerce,
-- por eso la métrica estrella es: conversiones (leads), costo por lead
-- (CPL) y CTR. NO se modela ROAS de ventas; si algún día se quisiera
-- valor de conversión, se agrega aparte.
--
-- Se incluyen métricas de VIDEO porque en TikTok el video es el núcleo
-- del rendimiento (vistas y retención 2s/6s revelan el "hook" del creativo).
--
-- El extractor (etl/extractors/tiktok_ads.py) llena esta tabla pidiendo
-- el reporte de la TikTok Marketing API. Mientras no haya filas, la vista
-- TikTok del dashboard sigue mostrando el aviso honesto "no conectado".
-- Idempotente: se puede re-correr sin error.
-- ============================================================

create table if not exists tiktok_campaigns (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null,
  date                date not null,

  -- Jerarquía de TikTok: campaign → adgroup → ad
  campaign_id         text not null,
  campaign_name       text,
  adgroup_id          text,
  adgroup_name        text,
  ad_id               text not null,
  ad_name             text,
  status              text,                        -- ENABLE | DISABLE | DELETE

  -- Inversión y alcance
  spend               numeric(14,2) default 0,
  impressions         bigint        default 0,
  clicks              bigint        default 0,
  reach               bigint        default 0,
  ctr                 numeric(8,4)  default 0,     -- clicks / impressions (fracción 0-1)
  cpc                 numeric(12,2) default 0,     -- spend / clicks
  cpm                 numeric(12,2) default 0,     -- spend / (impressions/1000)

  -- Conversiones / LEADS (lo que importa en Ofero)
  conversions         numeric(12,2) default 0,     -- nº de leads/conversiones
  cost_per_conversion numeric(12,2) default 0,     -- CPL = spend / conversions
  conversion_rate     numeric(8,4)  default 0,     -- conversions / clicks (fracción 0-1)

  -- Video (el corazón del creativo en TikTok)
  video_views         bigint        default 0,     -- reproducciones
  video_watched_2s    bigint        default 0,     -- llegaron a 2s (mide el "hook")
  video_watched_6s    bigint        default 0,     -- llegaron a 6s (retención)
  video_completes     bigint        default 0,     -- vieron el video completo

  inserted_at         timestamptz default now(),
  -- evita duplicados al re-sincronizar el mismo día/anuncio
  unique (client_id, date, ad_id)
);

-- Índice para las consultas del dashboard (por cliente y fecha).
create index if not exists tiktok_campaigns_client_date_idx
  on tiktok_campaigns (client_id, date);

-- ------------------------------------------------------------
-- Permiso de lectura TEMPORAL (igual que el resto de tablas):
-- deja que el dashboard lea con la anon key. En la etapa de login se
-- reemplaza por una política por-cliente. Idempotente.
-- ------------------------------------------------------------
alter table tiktok_campaigns enable row level security;

drop policy if exists "lectura_tiktok_campaigns_temporal" on tiktok_campaigns;

create policy "lectura_tiktok_campaigns_temporal"
on tiktok_campaigns
for select
to anon, authenticated
using (true);

-- ------------------------------------------------------------
-- Escritura del ETL (service_role). El robot que carga los datos usa la
-- service key, que ignora RLS, pero dejamos la política explícita por
-- claridad y simetría con las demás tablas. Idempotente.
-- ------------------------------------------------------------
drop policy if exists "escritura_tiktok_campaigns_service" on tiktok_campaigns;

create policy "escritura_tiktok_campaigns_service"
on tiktok_campaigns
for all
to service_role
using (true)
with check (true);
