-- ============================================================
-- Migración 0009 — Desglose de gasto PMax por RED (Shop/Video/Display/Search*)
-- ============================================================
-- Objetivo: guardar la descomposición del gasto de cada campaña Performance Max
-- por red de Google, para responder la pregunta clave del cliente:
-- "¿en qué se está yendo la plata: Search, Video o Display?".
--
-- FUENTE: la pestaña "Campaigns" del sheet de Mike Rhodes — una hoja de
-- PRESENTACIÓN calculada con fórmulas, NO el runReport del script. Es la ÚNICA
-- fuente de este split, porque Google no expone oficialmente el costo-por-red
-- dentro de una campaña PMax ni por API ni por Script.
--
--   · Video y Display salen de datos REALES de emplazamientos (placements).
--   · Shop sale de shopping_performance_view.
--   · Search* es el RESIDUAL (Total − Video − Display − Shop). El asterisco y la
--     columna `is_residual` lo dejan explícito: es una aproximación, no un dato
--     etiquetado por Google.
--
-- FORMATO LARGO: una fila por (campaña × red). Las fracciones (cost_pct,
-- conv_pct) se calculan en el ETL sobre el total real, en convención 0-1.
--
-- SNAPSHOT, no serie diaria: la pestaña es un acumulado "últimos 30 días"
-- rodante. No hay columna `date`; cada corrida del ETL refresca la fila (mismo
-- conflicto client_id+campaign_name+channel). La vista debe aclarar al usuario
-- que es una foto de los últimos 30 días, no filtrable por el selector de fechas.
--
-- Idempotente: create table if not exists + unique para el upsert on_conflict.
-- ============================================================

create table if not exists gads_pmax_channels (
  id                   uuid primary key default uuid_generate_v4(),
  client_id            uuid references clients(id) on delete cascade,
  campaign_name        text not null,
  channel              text not null,              -- shop | video | display | search
  is_residual          boolean default false,      -- true solo para search (Search* = residual)
  -- Métricas de la red (datos reales del sheet, ya en moneda del cliente).
  cost                 numeric(14,2) default 0,
  conversions          numeric(10,2) default 0,
  conv_value           numeric(14,2) default 0,
  -- Fracciones 0-1 sobre el total de la campaña (calculadas en el ETL).
  cost_pct             numeric(8,4)  default 0,
  conv_pct             numeric(8,4)  default 0,
  roas                 numeric(8,4)  default 0,    -- value/cost; ~0 en negocios de leads
  -- Contexto de la campaña (denormalizado para el frontend).
  campaign_total_cost  numeric(14,2) default 0,
  campaign_total_conv  numeric(10,2) default 0,
  campaign_total_value numeric(14,2) default 0,
  inserted_at          timestamptz default now(),
  unique (client_id, campaign_name, channel)
);

-- El frontend filtra por client_id; el unique ya cubre el patrón de consulta.
create index if not exists gads_pmax_channels_client_idx
  on gads_pmax_channels (client_id);

-- ── RLS (Row Level Security) ──────────────────────────────────
-- Mismo patrón que el resto de tablas: el ETL escribe con service key (acceso
-- total) y el dashboard lee con la llave anon (solo SELECT). Sin esto, el ETL
-- inserta bien pero el frontend ve 0 filas.
alter table gads_pmax_channels enable row level security;

drop policy if exists "service_role_all" on gads_pmax_channels;
create policy "service_role_all" on gads_pmax_channels for all using (true) with check (true);

drop policy if exists "anon_read_own" on gads_pmax_channels;
create policy "anon_read_own" on gads_pmax_channels for select using (true);
