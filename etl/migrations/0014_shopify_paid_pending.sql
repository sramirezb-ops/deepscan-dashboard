-- Migración 0014 — Desglose pagado/pendiente por par en shopify_products
-- Ejecutar en Supabase (SQL Editor) ANTES de correr el ETL con el código nuevo.

ALTER TABLE shopify_products
  ADD COLUMN IF NOT EXISTS revenue_paid    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_pending numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS units_paid      numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS units_pending   numeric DEFAULT 0;
