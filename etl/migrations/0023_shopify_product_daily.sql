-- 0023_shopify_product_daily.sql
-- Ventas de Shopify por (producto, día). Hasta ahora `shopify_products` guardaba
-- un snapshot de VENTANA COMPLETA (period_start/end ≈ últimos ~30 d), por lo que el
-- cruce tráfico×venta de la hoja de Clarity no podía respetar el rango de fechas
-- elegido (usaba el snapshot fijo). Esta tabla guarda una fila por producto y día
-- → el dashboard suma el rango EXACTO seleccionado.

CREATE TABLE IF NOT EXISTS shopify_product_daily (
  client_id       text     NOT NULL,
  date            date     NOT NULL,
  product_id      text     NOT NULL,
  title           text     NOT NULL DEFAULT '',
  sku             text     NOT NULL DEFAULT '',
  revenue         numeric  NOT NULL DEFAULT 0,
  units_sold      integer  NOT NULL DEFAULT 0,
  orders          integer  NOT NULL DEFAULT 0,
  avg_price       numeric  NOT NULL DEFAULT 0,
  revenue_paid    numeric  NOT NULL DEFAULT 0,
  revenue_pending numeric  NOT NULL DEFAULT 0,
  units_paid      integer  NOT NULL DEFAULT 0,
  units_pending   integer  NOT NULL DEFAULT 0,
  inserted_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shopify_product_daily_uniq UNIQUE (client_id, date, product_id)
);

CREATE INDEX IF NOT EXISTS shopify_product_daily_cd_idx ON shopify_product_daily (client_id, date);

-- RLS + lectura anónima (igual que las demás tablas del dashboard).
ALTER TABLE shopify_product_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shopify_product_daily anon read" ON shopify_product_daily;
CREATE POLICY "shopify_product_daily anon read" ON shopify_product_daily FOR SELECT USING (true);
