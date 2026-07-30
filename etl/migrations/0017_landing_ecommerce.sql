-- 0017_landing_ecommerce.sql
-- Embudo ecommerce por PÁGINA DE ENTRADA (landingPage) en ga4_landing.
-- El extractor de GA4 ahora trae, además de sesiones/rebote/conversiones, cuántas
-- de las sesiones que empiezan en cada URL agregan al carrito, inician checkout y
-- compran (+ ingresos). Permite comparar la conversión real entre landings.

ALTER TABLE ga4_landing
  ADD COLUMN IF NOT EXISTS add_to_cart integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checkout    integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchases   integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue     numeric   NOT NULL DEFAULT 0;
