-- Migración 0015 — Breakdowns de Meta (plataforma/segmento) + media de creativos
-- Para la hoja de Compras (segmentos, plataforma por conjunto/anuncio, grid+modal).
-- Ejecutar en Supabase (SQL Editor) ANTES de correr el ETL con el código nuevo.

-- 1) Breakdowns: una fila = (cliente × nivel × tipo × valor × entidad), snapshot del período
CREATE TABLE IF NOT EXISTS meta_breakdowns (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid        NOT NULL,
  level               text        NOT NULL,             -- 'adset' | 'ad'
  breakdown_type      text        NOT NULL,             -- 'publisher_platform' | 'user_segment_key'
  breakdown_value     text        NOT NULL,             -- facebook/instagram… | prospecting/engaged/existing…
  entity_id           text        NOT NULL DEFAULT '',  -- adset_id | ad_id
  entity_name         text        DEFAULT '',
  adset_name          text        DEFAULT '',
  campaign_name       text        DEFAULT '',
  spend               numeric     DEFAULT 0,
  impressions         numeric     DEFAULT 0,
  reach               numeric     DEFAULT 0,
  purchases           numeric     DEFAULT 0,
  purchase_value      numeric     DEFAULT 0,
  add_to_cart         numeric     DEFAULT 0,
  initiate_checkout   numeric     DEFAULT 0,
  landing_page_views  numeric     DEFAULT 0,
  link_clicks         numeric     DEFAULT 0,
  inserted_at         timestamptz DEFAULT now(),
  UNIQUE (client_id, level, breakdown_type, breakdown_value, entity_id)
);
CREATE INDEX IF NOT EXISTS meta_breakdowns_idx
  ON meta_breakdowns (client_id, level, breakdown_type);
ALTER TABLE meta_breakdowns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meta_breakdowns anon read" ON meta_breakdowns;
CREATE POLICY "meta_breakdowns anon read" ON meta_breakdowns FOR SELECT USING (true);

-- 2) Media + copy de creativos activos: una fila = (cliente × anuncio)
CREATE TABLE IF NOT EXISTS meta_ad_creatives (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid        NOT NULL,
  ad_id          text        NOT NULL,
  ad_name        text        DEFAULT '',
  adset_name     text        DEFAULT '',
  campaign_name  text        DEFAULT '',
  creative_id    text        DEFAULT '',
  is_video       boolean     DEFAULT false,
  image_url      text        DEFAULT '',
  thumbnail_url  text        DEFAULT '',
  video_id       text        DEFAULT '',
  title          text        DEFAULT '',
  body           text        DEFAULT '',
  cta            text        DEFAULT '',
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (client_id, ad_id)
);
CREATE INDEX IF NOT EXISTS meta_ad_creatives_idx ON meta_ad_creatives (client_id);
ALTER TABLE meta_ad_creatives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meta_ad_creatives anon read" ON meta_ad_creatives;
CREATE POLICY "meta_ad_creatives anon read" ON meta_ad_creatives FOR SELECT USING (true);
