-- ============================================================
-- Migración 0019 — Google Ads: conversiones por ACCIÓN de conversión
-- ============================================================
-- Problema: la columna "Conversiones" de Google suma TODO lo que esté marcado
-- como primario (purchase + add_to_cart + view_item + ...). Si la IA (Aura) sube
-- acciones secundarias a primarias, el número —y el ROAS— se inflan.
--
-- Solución de fondo: traer las conversiones DESGLOSADAS por acción, por campaña y
-- día. Con el desglose aislamos `PURCHASE` (la compra real) y calculamos un ROAS
-- de compra limpio, sin que importe cómo esté marcada cada acción.
--   · all_conversions / all_conv_value → todas las acciones (incluye secundarias)
--   · conversions / conv_value         → lo que Google cuenta hoy como "Conversiones"
--
-- Datos diarios: upsert por (cliente, día, campaña, acción). Idempotente.
-- ============================================================

create table if not exists gads_conversions_by_action (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references clients(id) on delete cascade,
  date                 date not null,
  campaign_id          text,
  campaign_name        text,
  conv_action_name     text not null,        -- nombre de la acción de conversión
  conv_action_category text,                 -- PURCHASE | ADD_TO_CART | PAGE_VIEW | BEGIN_CHECKOUT | ...
  all_conversions      numeric default 0,    -- todas (incluye secundarias)
  all_conv_value       numeric default 0,
  conversions          numeric default 0,    -- las que Google cuenta hoy como "Conversiones"
  conv_value           numeric default 0,
  inserted_at          timestamptz default now(),
  unique (client_id, date, campaign_id, conv_action_name)
);

create index if not exists gads_conv_action_client_date on gads_conversions_by_action (client_id, date);
create index if not exists gads_conv_action_client_cat  on gads_conversions_by_action (client_id, conv_action_category);

-- RLS: solo lectura para el frontend (anon/authenticated), como el resto de tablas.
alter table gads_conversions_by_action enable row level security;
drop policy if exists "lectura_gads_conversions_by_action" on gads_conversions_by_action;
create policy "lectura_gads_conversions_by_action"
  on gads_conversions_by_action for select to anon, authenticated using (true);
