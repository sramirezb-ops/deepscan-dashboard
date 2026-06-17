-- ============================================================
-- Migración 0003 — Tabla meta_platform (Meta ads por plataforma)
-- ============================================================
-- Objetivo: tener el rendimiento de Meta Ads DESGLOSADO por plataforma
-- de publicación (Facebook / Instagram / Messenger / Audience Network),
-- que la tabla meta_campaigns NO trae (llega a nivel anuncio, sin plataforma).
--
-- Esto es el "contrato" que la sincronización debe llenar pidiéndole a la
-- API de Meta el breakdown `publisher_platform`. Una fila = un día × una
-- plataforma × (opcionalmente) una campaña, por cliente.
--
-- La vista Instagram lee esta tabla filtrando publisher_platform = 'instagram'.
-- Mientras no haya filas, el dashboard sigue mostrando el aviso honesto.
-- Idempotente: se puede re-correr sin error.
-- ============================================================

create table if not exists meta_platform (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null,
  date               date not null,
  -- 'facebook' | 'instagram' | 'messenger' | 'audience_network'
  publisher_platform text not null,
  -- opcional: si la sync trae el breakdown a nivel campaña, se guarda aquí;
  -- si solo trae el total por plataforma, dejar null.
  campaign_name      text,
  spend              numeric  default 0,
  impressions        bigint   default 0,
  clicks             bigint   default 0,
  reach              bigint   default 0,
  ctr                numeric  default 0,   -- clicks / impressions
  purchases          numeric  default 0,
  purchase_value     numeric  default 0,   -- revenue
  roas               numeric  default 0,   -- purchase_value / spend
  inserted_at        timestamptz default now(),
  -- evita duplicados al re-sincronizar el mismo día/plataforma/campaña
  unique (client_id, date, publisher_platform, campaign_name)
);

-- Índice para las consultas del dashboard (por cliente, plataforma y fecha).
create index if not exists meta_platform_client_platform_date_idx
  on meta_platform (client_id, publisher_platform, date);

-- ------------------------------------------------------------
-- Permiso de lectura TEMPORAL (igual que clients / resto de tablas):
-- deja que el dashboard lea con la anon key. En la etapa de login se
-- reemplaza por una política por-cliente. Idempotente.
-- ------------------------------------------------------------
alter table meta_platform enable row level security;

drop policy if exists "lectura_meta_platform_temporal" on meta_platform;

create policy "lectura_meta_platform_temporal"
on meta_platform
for select
to anon, authenticated
using (true);
