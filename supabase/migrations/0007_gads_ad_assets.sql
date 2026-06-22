-- ============================================================
-- Migración 0007 — Tabla gads_ad_assets (resultados POR ASSET / día)
-- ============================================================
-- Objetivo: guardar el rendimiento diario de cada ASSET individual
-- (cada imagen, video o texto) dentro de un anuncio adaptable. La unidad
-- de cada fila es:  un día × un anuncio (ad_id) × un asset × un field_type.
--
-- Hasta ahora gads_ads daba el rendimiento AGREGADO del anuncio entero.
-- Esta tabla lo abre por pieza creativa para responder, con dato real:
--   "¿qué imagen / video / titular trae más impresiones, clics y leads?"
--
-- Fuente: GAQL `ad_group_ad_asset_view` (rendimiento por asset) unido al
-- recurso `asset` (para traer la URL de imagen, el video de YouTube y el
-- texto). La vista "Propietarios" del dashboard usará esta tabla para su
-- sección "Resultados por imagen / video".
--
-- OJO con el costo: Google NO atribuye `cost_micros` por asset en anuncios
-- adaptables (el costo vive a nivel anuncio, no por pieza). Por eso aquí
-- NO se modela costo ni CPL por asset — sería un dato inventado. Solo se
-- guardan métricas que Google sí reporta por asset: impresiones, clics y
-- conversiones (leads). El `performance_label` (BEST/GOOD/LOW…) es la propia
-- calificación de Google a cada pieza.
--
-- Mientras el ETL no llene esta tabla, la sección del dashboard sigue
-- mostrando el aviso honesto "Próximamente". Idempotente: re-corre sin error.
-- ============================================================

create table if not exists gads_ad_assets (
  id                uuid primary key default uuid_generate_v4(),
  client_id         uuid references clients(id) on delete cascade,
  date_start        date not null,

  -- Jerarquía: campaign → ad_group → ad → asset
  campaign_id       text not null,
  campaign_name     text,
  campaign_type     text,
  ad_group_id       text,
  ad_group_name     text,
  ad_id             text not null,

  -- Identidad del asset y su rol dentro del anuncio
  asset_id          text not null,
  field_type        text not null,               -- MARKETING_IMAGE | SQUARE_MARKETING_IMAGE | YOUTUBE_VIDEO | HEADLINE | DESCRIPTION | LOGO | etc
  asset_type        text,                         -- IMAGE | YOUTUBE_VIDEO | TEXT | MEDIA_BUNDLE | etc
  performance_label text,                         -- BEST | GOOD | LOW | LEARNING | PENDING | UNKNOWN
  asset_name        text,

  -- Contenido del asset (según su tipo; los demás quedan vacíos)
  asset_text        text,                         -- para assets de TEXTO (titulares, descripciones)
  image_url         text,                         -- para assets de IMAGEN (URL full-size)
  youtube_video_id  text,                         -- para assets de VIDEO (id de YouTube)
  youtube_title     text,

  -- Métricas que Google SÍ reporta por asset (sin costo, ver nota arriba)
  impressions       bigint        default 0,
  clicks            bigint        default 0,
  conversions       numeric(14,2) default 0,      -- leads
  conv_value        numeric(16,2) default 0,
  ctr               numeric(8,4)  default 0,      -- clicks / impressions (fracción 0-1)

  inserted_at       timestamptz default now(),
  -- Un asset puede servir en más de un rol → field_type entra en la clave.
  unique (client_id, date_start, ad_id, asset_id, field_type)
);

-- Índice para las consultas del dashboard (por cliente y fecha).
create index if not exists idx_gads_ad_assets_client_date
  on gads_ad_assets (client_id, date_start desc);
-- Índice secundario por anuncio (la vista agrupa por ad_id).
create index if not exists idx_gads_ad_assets_ad
  on gads_ad_assets (client_id, ad_id);

-- ------------------------------------------------------------
-- RLS — mismo patrón que gads_ads: el ETL escribe con service_role
-- (ignora RLS, política explícita por simetría) y el dashboard lee con
-- la anon key. Idempotente.
-- ------------------------------------------------------------
alter table gads_ad_assets enable row level security;

drop policy if exists "service_role_all" on gads_ad_assets;
create policy "service_role_all" on gads_ad_assets for all using (true) with check (true);

drop policy if exists "anon_read_own" on gads_ad_assets;
create policy "anon_read_own" on gads_ad_assets for select using (true);
