-- ============================================================
-- Migración 0014 — Tabla ga4_routes (exploración de ruta de 1 salto)
-- ============================================================
-- Guarda las transiciones "de qué página/fuente vino → a qué página llegó"
-- (1 salto), derivadas de la dimensión `pageReferrer` de GA4 (sin BigQuery).
-- El extractor (etl/extractors/ga4_shopify_gmc_clarity.py :: extract_ga4_routes)
-- clasifica cada transición:
--   · kind='internal' → el referrer es del propio sitio → from_label = su ruta
--     (ej. /vehiculos-electricos). Da los caminos de navegación.
--   · kind='external' → buscador/red social → from_label = "Google", "TikTok"…
--   · kind='direct'   → sin referrer → from_label = "(entrada directa)".
--
-- Agregada por VENTANA (no por fecha): el ETL borra y reinserta la foto del
-- cliente en cada corrida. El flujo multi-paso (Sankey 1→2→3) sí requiere
-- BigQuery; esto es 1 salto, que la API estándar de GA4 sí entrega.
-- Idempotente.
-- ============================================================

create table if not exists ga4_routes (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null,
  property_id  text,

  from_label   text not null,   -- ruta interna ("/x") o fuente externa ("Google")
  to_path      text not null,   -- página a la que llegó
  kind         text not null,   -- 'internal' | 'external' | 'direct'
  sessions     bigint default 0,
  views        bigint default 0,

  inserted_at  timestamptz default now(),
  unique (client_id, from_label, to_path, kind, property_id)
);

create index if not exists ga4_routes_client_idx on ga4_routes (client_id, sessions desc);

alter table ga4_routes enable row level security;
drop policy if exists "lectura_ga4_routes_temporal" on ga4_routes;
create policy "lectura_ga4_routes_temporal"
  on ga4_routes for select to anon, authenticated using (true);
