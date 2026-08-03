-- Migración 0019 — Catálogo de Meta: entrega por producto + salud del feed
-- Para la hoja de Compras (Cap 2): cruce "Meta empuja ↔ Shopify vende" y salud del catálogo.
-- Meta NO expone compras por producto; sí expone la ENTREGA (gasto/impresiones) por
-- producto de catálogo, que cruzamos con las ventas reales de Shopify (shopify_products).
-- Ejecutar en Supabase (SQL Editor) ANTES de correr el ETL con el código nuevo.

-- 1) Entrega por producto de catálogo: una fila = (cliente × producto), snapshot del período
CREATE TABLE IF NOT EXISTS meta_catalog_products (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid        NOT NULL,
  product_name  text        NOT NULL,             -- nombre del producto en el catálogo (clave de cruce con Shopify)
  retailer_id   text        DEFAULT '',           -- id del retailer (variante/SKU)
  availability  text        DEFAULT '',           -- 'in stock' | 'out of stock' | ...
  spend         numeric     DEFAULT 0,            -- gasto que Meta destinó a empujar el producto
  impressions   numeric     DEFAULT 0,            -- impresiones que Meta dio al producto
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (client_id, product_name)
);
CREATE INDEX IF NOT EXISTS meta_catalog_products_idx ON meta_catalog_products (client_id);
ALTER TABLE meta_catalog_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meta_catalog_products anon read" ON meta_catalog_products;
CREATE POLICY "meta_catalog_products anon read" ON meta_catalog_products FOR SELECT USING (true);

-- 2) Salud del feed: una fila = (cliente), snapshot
CREATE TABLE IF NOT EXISTS meta_catalog_health (
  client_id          uuid        PRIMARY KEY,
  product_count      integer     DEFAULT 0,       -- productos en el catálogo
  product_set_count  integer     DEFAULT 0,       -- conjuntos de producto
  oos_count          integer     DEFAULT 0,       -- agotados (no aparecen en ads dinámicos)
  no_image_count     integer     DEFAULT 0,       -- sin imagen (no se pueden mostrar)
  updated_at         timestamptz DEFAULT now()
);
ALTER TABLE meta_catalog_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meta_catalog_health anon read" ON meta_catalog_health;
CREATE POLICY "meta_catalog_health anon read" ON meta_catalog_health FOR SELECT USING (true);
