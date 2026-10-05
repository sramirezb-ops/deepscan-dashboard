-- ============================================================
-- Migración 0020 — Meta Ads: historial de cambios por actor
-- ============================================================
-- Igual que en Google: para separar "Agencia vs IA (Aura)" en Meta no sirve el
-- nombre de la campaña/conjunto (la IA los renombra). La señal confiable es el
-- ACTOR del log de actividades de la cuenta (/act_/activities): quién creó,
-- PAUSÓ o editó cada objeto, con el antes/después — para cazar la pausa de
-- conjuntos con buen ROAS.
--
-- Guarda el nivel del objeto (object_type: CAMPAIGN / ADSET / AD) para poder
-- ver las pausas a nivel CONJUNTO. Meta solo expone una ventana de actividades,
-- así que esta tabla ACUMULA (upsert por change_key), no es snapshot.
-- Idempotente.
-- ============================================================

create table if not exists meta_change_events (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  change_key  text not null,          -- event_time|actor_id|object_id|event_type (único por cambio)
  change_dt   timestamptz,            -- cuándo ocurrió
  actor_id    text,                   -- quién lo hizo (se clasifica Agencia/IA con el diagnóstico)
  actor_name  text,
  event_type  text,                   -- update_ad_set_run_status | create_campaign | update_ad_set_budget | ...
  translated  text,                   -- descripción legible de Meta
  object_type text,                   -- CAMPAIGN | ADSET | AD | ACCOUNT
  object_id   text,
  object_name text,
  old_value   text,                   -- estado/valor anterior (si aplica)
  new_value   text,                   -- estado/valor nuevo
  action      text,                   -- pausar | activar | crear_* | cambio_presupuesto | eliminar | editar | estado
  inserted_at timestamptz default now(),
  unique (client_id, change_key)
);

create index if not exists meta_change_events_client_dt     on meta_change_events (client_id, change_dt);
create index if not exists meta_change_events_client_actor  on meta_change_events (client_id, actor_id);
create index if not exists meta_change_events_client_object on meta_change_events (client_id, object_id);

-- RLS: solo lectura para el frontend (anon/authenticated), como el resto de tablas.
alter table meta_change_events enable row level security;
drop policy if exists "lectura_meta_change_events" on meta_change_events;
create policy "lectura_meta_change_events"
  on meta_change_events for select to anon, authenticated using (true);
