-- 0016_creatives_status.sql
-- Estado de entrega actual del anuncio en meta_ad_creatives.
-- El extractor extract_meta_ad_creatives trae los creativos por ad_id en lotes
-- (fiable en cuentas grandes) y ya pedía effective_status; ahora lo persistimos
-- para que la vista de WhatsApp separe anuncios ACTIVOS / PAUSADOS / RECHAZADOS
-- con el estado real de Meta (snapshot actual en cada corrida del ETL), en vez
-- de aproximarlo por "entrega reciente".

ALTER TABLE meta_ad_creatives
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT '';
