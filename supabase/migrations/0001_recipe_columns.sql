-- ============================================================
-- Migración 0001 — Dimensión de "receta" por cliente
-- Agrega a la tabla clients las columnas que definen qué piezas
-- (canales + objetivos) lleva el tablero de cada cliente.
-- Idempotente: se puede correr varias veces sin romper nada.
-- ============================================================

-- 1) Nuevas columnas de la receta
alter table clients add column if not exists country          text;
alter table clients add column if not exists enabled_channels jsonb not null default '[]'::jsonb;
alter table clients add column if not exists objectives       jsonb not null default '[]'::jsonb;

-- 2) Fila de Sneakers Store con su receta actual
--    (mismos valores que hoy tiene el DEMO_CLIENT hardcodeado)
insert into clients (id, name, slug, currency, country, enabled_channels, objectives)
values (
  'bae8c125-19e0-46b4-b0f6-462b642658ac',
  'Sneakers Store',
  'sneakers-store',
  'MXN',
  'México',
  '["ov2","week","gads","pmax","srch","shop","yt","meta","mili","wa","ig","ttok","ga4","cro","gsc","shp","gmc","ia","abtest","learn"]'::jsonb,
  '["ventas"]'::jsonb
)
on conflict (id) do update set
  name             = excluded.name,
  slug             = excluded.slug,
  currency         = excluded.currency,
  country          = excluded.country,
  enabled_channels = excluded.enabled_channels,
  objectives       = excluded.objectives;
