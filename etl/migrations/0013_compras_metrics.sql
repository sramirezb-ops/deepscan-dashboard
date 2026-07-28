-- Migración 0013 — Métricas para la hoja unificada de Compras (Meta + Shopify)
-- Ejecutar en Supabase (SQL Editor) ANTES de correr el ETL con el código nuevo.

-- 1) Nuevas columnas en meta_campaigns (nivel anuncio) ----------------------
--    Embudo de enlace + landing + retención de video por anuncio.
ALTER TABLE meta_campaigns
  ADD COLUMN IF NOT EXISTS link_clicks         numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS landing_page_views  numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS thruplay            numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p100          numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_avg_watch_sec numeric DEFAULT 0;

-- 2) Tabla nueva: detalle por producto desde GA4 (item-scoped) --------------
--    Una fila = (cliente × fecha × nombre de producto).
CREATE TABLE IF NOT EXISTS ga4_items (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid        NOT NULL,
  date                date        NOT NULL,
  item_name           text        NOT NULL,
  items_viewed        numeric     DEFAULT 0,
  items_added_to_cart numeric     DEFAULT 0,
  items_checked_out   numeric     DEFAULT 0,
  items_purchased     numeric     DEFAULT 0,
  item_revenue        numeric     DEFAULT 0,
  inserted_at         timestamptz DEFAULT now(),
  UNIQUE (client_id, date, item_name)
);

CREATE INDEX IF NOT EXISTS ga4_items_client_date_idx
  ON ga4_items (client_id, date);

-- RLS + lectura anónima (igual que las demás tablas del dashboard)
ALTER TABLE ga4_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ga4_items anon read" ON ga4_items;
CREATE POLICY "ga4_items anon read" ON ga4_items
  FOR SELECT USING (true);
