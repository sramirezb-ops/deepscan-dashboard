-- 0022 · gads_campaigns: identidad por campaign_id (no por nombre)
-- ---------------------------------------------------------------------------
-- RAÍZ del bug de renames: la identidad canónica de una campaña-día es
-- (client_id, date, campaign_id). El campaign_id es ESTABLE; el NOMBRE cambia
-- (y puede repetirse). La unique por nombre hacía que, al renombrar, el upsert
-- intentara INSERT y chocara 23505 contra la unique por id → se caía todo el
-- bloque de Google del cliente (Sneakers congeló Google el 7-nov-2026).
--
-- Tras esta migración + el cambio en etl/extractors/google_ads_api.py
-- (on_conflict = client_id,date,campaign_id), renombrar una campaña solo
-- ACTUALIZA su fila; nunca vuelve a chocar. Idempotente: seguro en la base
-- viva (que ya tiene la columna y la unique por id) y en una DB fresca.

begin;

-- 1) La columna campaign_id ya existe en la base viva; en una DB fresca la crea.
alter table gads_campaigns add column if not exists campaign_id text;

-- 2) Unique por id = conflict target del upsert. En la base viva ya existe como
--    gads_campaigns_client_id_date_campaign_id_key (mismo nombre → no-op).
create unique index if not exists gads_campaigns_client_id_date_campaign_id_key
  on gads_campaigns (client_id, date, campaign_id);

-- 3) Quitar la unique por NOMBRE: los nombres no son identidad (cambian y pueden
--    repetirse). Esto elimina el choque 23505 de raíz, incluido el edge de dos
--    campañas con el mismo nombre el mismo día.
alter table gads_campaigns
  drop constraint if exists gads_campaigns_client_id_date_campaign_name_key;

commit;
