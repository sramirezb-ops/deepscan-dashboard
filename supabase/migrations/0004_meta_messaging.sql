-- ============================================================
-- Migración 0004 — Tabla meta_messaging (conversaciones por mensaje)
-- ============================================================
-- Objetivo: medir las CAMPAÑAS DE MENSAJES de Meta — las que optimizan por
-- "Conversaciones" (optimization_goal = CONVERSATIONS) — con su métrica real
-- "conversaciones con mensaje iniciadas" y el desglose por DESTINO:
-- WhatsApp / Messenger / Instagram Direct.
--
-- El destino NO se puede deducir de publisher_platform (un anuncio
-- click-to-WhatsApp puede mostrarse en Instagram y aun así la conversación
-- cae en WhatsApp). El destino real vive en el `destination_type` del
-- conjunto de anuncios (adset), por eso lo guardamos explícito.
--
-- Una fila = un día × campaña × adset, por cliente. La vista "Mensajes"
-- (antes WhatsApp) lee esta tabla y agrega por destino y por campaña.
-- Mientras no haya filas, el dashboard muestra el aviso honesto.
-- Idempotente: se puede re-correr sin error.
-- ============================================================

create table if not exists meta_messaging (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null,
  date                  date not null,
  campaign_name         text,
  adset_name            text,
  -- etiqueta legible del destino: 'WhatsApp' | 'Messenger' | 'Instagram Direct' | 'Sin clasificar'
  destination           text,
  -- valor crudo de Meta: 'WHATSAPP' | 'MESSENGER' | 'INSTAGRAM_DIRECT' | ...
  destination_type      text,
  -- meta de optimización del adset, p.ej. 'CONVERSATIONS'
  optimization_goal     text,
  -- conversaciones con mensaje iniciadas (métrica real de Meta)
  conversations         numeric  default 0,
  spend                 numeric  default 0,
  -- spend / conversations
  cost_per_conversation numeric  default 0,
  inserted_at           timestamptz default now(),
  -- evita duplicados al re-sincronizar el mismo día/campaña/adset
  unique (client_id, date, campaign_name, adset_name)
);

-- Índice para las consultas del dashboard (por cliente, destino y fecha).
create index if not exists meta_messaging_client_dest_date_idx
  on meta_messaging (client_id, destination, date);

-- ------------------------------------------------------------
-- Permiso de lectura TEMPORAL (igual que el resto de tablas):
-- deja que el dashboard lea con la anon key. En la etapa de login se
-- reemplaza por una política por-cliente. Idempotente.
-- ------------------------------------------------------------
alter table meta_messaging enable row level security;

drop policy if exists "lectura_meta_messaging_temporal" on meta_messaging;

create policy "lectura_meta_messaging_temporal"
on meta_messaging
for select
to anon, authenticated
using (true);
