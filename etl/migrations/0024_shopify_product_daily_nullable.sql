-- 0024_shopify_product_daily_nullable.sql
-- Fix: la mayoría de line items de Shopify traen sku (y a veces title) = null.
-- La 0023 puso sku/title NOT NULL → el loader rechazaba ~21 de 23 filas
-- ("null value in column sku violates not-null constraint"), dejando la tabla
-- casi vacía. `shopify_products` ya tiene estas columnas nullable; alineamos.
-- (El extractor además ya manda '' en vez de null, esto es el cinturón extra.)

ALTER TABLE shopify_product_daily ALTER COLUMN sku   DROP NOT NULL;
ALTER TABLE shopify_product_daily ALTER COLUMN title DROP NOT NULL;
