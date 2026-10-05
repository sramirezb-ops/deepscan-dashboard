-- ============================================================
-- Migración 0018 — Google Ads: historial de cambios por usuario
-- ============================================================
-- Para comparar "Agencia vs IA (Aura)" NO sirve el nombre de la campaña (la IA
-- las renombra para parecerse a las nuestras). La señal confiable es QUIÉN tocó
-- cada campaña: el recurso `change_event` de la API de Google trae, por cada
-- cambio, el usuario (`user_email`), el tipo de cliente que lo hizo
-- (`client_type`: GOOGLE_ADS_WEB_CLIENT = humano, GOOGLE_ADS_API = automatización)
-- y el antes/después (para detectar pausas de campañas con buen rendimiento).
--
-- IMPORTANTE: `change_event` solo cubre ~30 días y exige LIMIT. Por eso esta tabla
-- ACUMULA (upsert por change_id único), no es snapshot: cada corrida agrega los
-- cambios nuevos y la historia va creciendo más allá de la ventana de 30 días.
-- Idempotente.
-- ============================================================

create table if not exists gads_change_events (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  change_id      text not null,          -- change_event.resource_name (único por cambio)
  change_dt      timestamptz,            -- cuándo ocurrió el cambio
  user_email     text,                   -- quién lo hizo
  client_type    text,                   -- GOOGLE_ADS_WEB_CLIENT | GOOGLE_ADS_API | GOOGLE_ADS_EDITOR | ...
  campaign_id    text,                   -- campaña afectada (se cruza con gads_campaigns para el nombre)
  resource_type  text,                   -- CAMPAIGN | CAMPAIGN_BUDGET
  operation      text,                   -- CREATE | UPDATE | REMOVE
  action         text,                   -- crear_campana | pausar | activar | eliminar | cambio_presupuesto | editar
  old_status     text,                   -- estado anterior si cambió el status (ENABLED/PAUSED/REMOVED)
  new_status     text,                   -- estado nuevo
  changed_fields text,                   -- campos tocados (coma-separados)
  inserted_at    timestamptz default now(),
  unique (client_id, change_id)
);

create index if not exists gads_change_events_client_campaign on gads_change_events (client_id, campaign_id);
create index if not exists gads_change_events_client_dt       on gads_change_events (client_id, change_dt);
create index if not exists gads_change_events_client_user     on gads_change_events (client_id, user_email);

-- RLS: solo lectura para el frontend (anon/authenticated), como el resto de tablas.
alter table gads_change_events enable row level security;
drop policy if exists "lectura_gads_change_events" on gads_change_events;
create policy "lectura_gads_change_events"
  on gads_change_events for select to anon, authenticated using (true);
