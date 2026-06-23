-- ============================================================
-- Migración 0010 — Tabla tiktok_comments (comentarios de anuncios TikTok)
-- ============================================================
-- Objetivo: guardar los comentarios que la audiencia deja en los anuncios de
-- video de TikTok (impresión pagada y Spark Ads), una fila = un comentario.
-- Esto enciende la hoja "TikTok Ads · Comentarios" del dashboard, que hasta
-- ahora mostraba un marcador honesto "esperando conexión".
--
-- El extractor (etl/extractors/tiktok_comments.py) llena esta tabla pidiendo
-- el endpoint /comment/list/ de la TikTok Marketing API (búsqueda por
-- adgroup_id). La API NO devuelve sentimiento: el campo `sentiment` lo DERIVAMOS
-- nosotros con una heurística transparente de léxico en español (ver el
-- extractor). Es una capa de análisis propia, claramente etiquetada como tal,
-- NO una métrica oficial de TikTok. Si algún día se quiere mayor precisión, se
-- reemplaza la heurística por un modelo sin tocar el esquema.
--
-- Mientras no haya filas, la hoja sigue mostrando su aviso honesto. En cuanto
-- el ETL escriba comentarios, la vista se enciende con datos en vivo.
-- Idempotente: se puede re-correr sin error.
-- ============================================================

create table if not exists tiktok_comments (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null,

  -- Identificador único del comentario en TikTok (clave de deduplicación).
  comment_id      text not null,

  -- A qué anuncio / grupo / campaña pertenece (jerarquía TikTok).
  ad_id           text,
  ad_name         text,
  adgroup_id      text,
  adgroup_name    text,
  campaign_id     text,
  campaign_name   text,

  -- Contenido del comentario.
  author          text,                         -- user_name del autor
  author_avatar   text,                         -- user_avatar_url
  content         text,                         -- texto del comentario (content)
  likes           bigint        default 0,      -- nº de likes del comentario
  replies         bigint        default 0,      -- nº de respuestas
  comment_type    text,                         -- COMMENT | REPLY
  comment_status  text,                         -- PUBLIC | HIDDEN
  created_at      timestamptz,                  -- create_time (cuándo se escribió)

  -- Sentimiento DERIVADO por nosotros (heurística de léxico ES), NO de TikTok.
  --   sentiment       → 'positive' | 'neutral' | 'negative'
  --   sentiment_score → [-1, 1], negativo = malo, positivo = bueno
  sentiment       text          default 'neutral',
  sentiment_score numeric(5,3)  default 0,

  inserted_at     timestamptz default now(),
  -- evita duplicados al re-sincronizar el mismo comentario
  unique (client_id, comment_id)
);

-- Índices para las consultas del dashboard: por cliente+fecha (orden temporal)
-- y por cliente+anuncio (filtro por creativo en la hoja de comentarios).
create index if not exists tiktok_comments_client_created_idx
  on tiktok_comments (client_id, created_at);

create index if not exists tiktok_comments_client_ad_idx
  on tiktok_comments (client_id, ad_id);

-- ------------------------------------------------------------
-- Permiso de lectura TEMPORAL (igual que el resto de tablas):
-- deja que el dashboard lea con la anon key. En la etapa de login se
-- reemplaza por una política por-cliente. Idempotente.
-- ------------------------------------------------------------
alter table tiktok_comments enable row level security;

drop policy if exists "lectura_tiktok_comments_temporal" on tiktok_comments;

create policy "lectura_tiktok_comments_temporal"
on tiktok_comments
for select
to anon, authenticated
using (true);

-- ------------------------------------------------------------
-- Escritura del ETL (service_role). El robot que carga los datos usa la
-- service key, que ignora RLS, pero dejamos la política explícita por
-- claridad y simetría con las demás tablas. Idempotente.
-- ------------------------------------------------------------
drop policy if exists "escritura_tiktok_comments_service" on tiktok_comments;

create policy "escritura_tiktok_comments_service"
on tiktok_comments
for all
to service_role
using (true)
with check (true);
