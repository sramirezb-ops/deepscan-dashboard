-- ============================================================
-- Migración 0005 — Instagram Orgánico (cuenta + publicaciones)
-- ============================================================
-- Objetivo: guardar lo ORGÁNICO de Instagram (no anuncios), que ninguna
-- tabla traía. Alimenta la vista "Instagram orgánico" tipo social media
-- manager: seguidores, alcance, visitas al perfil y engagement por post.
--
-- Fuente: Instagram Graph API (extractor instagram_organic.py), reutilizando
-- el token de Meta con permisos instagram_basic + instagram_manage_insights.
--
-- Dos tablas:
--   • ig_account_daily → 1 fila por día (serie de crecimiento y alcance)
--   • ig_media         → 1 fila por publicación (engagement real por post)
--
-- Idempotente: se puede re-correr sin error.
-- ============================================================

-- ── Cuenta por día ──────────────────────────────────────────
create table if not exists ig_account_daily (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null,
  date            date not null,
  username        text,
  -- snapshot total "hoy" (solo se llena en el último día del rango);
  -- en días anteriores va 0 para no falsear la serie.
  followers_count bigint  default 0,
  follows_count   bigint  default 0,
  media_count     bigint  default 0,
  -- series diarias reales de insights de la cuenta
  reach           bigint  default 0,   -- cuentas únicas alcanzadas ese día
  profile_views   bigint  default 0,   -- visitas al perfil ese día
  new_followers   bigint  default 0,   -- seguidores nuevos ese día
  inserted_at     timestamptz default now(),
  unique (client_id, date)
);

create index if not exists ig_account_daily_client_date_idx
  on ig_account_daily (client_id, date);

-- ── Publicaciones (posts / reels / carruseles) ──────────────
create table if not exists ig_media (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null,
  media_id           text not null,
  timestamp          date,             -- fecha de publicación
  media_type         text,             -- IMAGE | VIDEO | CAROUSEL_ALBUM
  media_product_type text,             -- FEED | REELS | STORY
  caption            text,
  permalink          text,
  thumbnail_url      text,
  like_count         bigint  default 0,
  comments_count     bigint  default 0,
  saved              bigint  default 0,
  shares             bigint  default 0,
  reach              bigint  default 0,
  interactions       bigint  default 0,  -- total de interacciones del post
  engagement_rate    numeric default 0,  -- interactions / reach
  inserted_at        timestamptz default now(),
  unique (client_id, media_id)
);

create index if not exists ig_media_client_ts_idx
  on ig_media (client_id, timestamp);

-- ── Lectura temporal con anon key (igual que el resto de tablas) ──
alter table ig_account_daily enable row level security;
drop policy if exists "lectura_ig_account_daily_temporal" on ig_account_daily;
create policy "lectura_ig_account_daily_temporal"
on ig_account_daily for select to anon, authenticated using (true);

alter table ig_media enable row level security;
drop policy if exists "lectura_ig_media_temporal" on ig_media;
create policy "lectura_ig_media_temporal"
on ig_media for select to anon, authenticated using (true);
