-- ============================================================
-- Migración 0012 — Estado de pago en shopify_orders (Opción A)
-- ============================================================
-- Objetivo: desglosar los pedidos diarios por su financial_status de Shopify,
-- para poder distinguir en el dashboard cuántos pagos quedaron FINALIZADOS
-- (paid), cuántos PENDIENTES (pending — OXXO/SPEI/transferencia, clave en MXN)
-- y cuántos se CAYERON o revirtieron (refunded / voided).
--
-- Contexto: el extractor (etl/extractors/ga4_shopify_gmc_clarity.py) ya pedía
-- el campo financial_status a la Admin API pero no lo agregaba. Esta migración
-- crea las columnas y el ETL (edición acompañante) empieza a llenarlas.
--
-- 100% dato real de Shopify. Los conteos por estado son exactos. revenue_pending
-- es el total de los pedidos en estado 'pending' (dinero en el aire, aún sin
-- capturar). El monto exacto de reembolsos parciales requiere el sub-recurso
-- /refunds y NO se calcula aquí — por eso solo llevamos el CONTEO de refunded.
--
-- Idempotente: add column if not exists. Los pedidos históricos quedan en 0
-- hasta que se re-corra el ETL sobre ese rango de fechas.
-- ============================================================

alter table shopify_orders
  add column if not exists orders_paid       bigint        default 0,  -- financial_status = paid
  add column if not exists orders_pending    bigint        default 0,  -- financial_status = pending
  add column if not exists orders_authorized bigint        default 0,  -- authorized / partially_paid
  add column if not exists orders_refunded   bigint        default 0,  -- refunded / partially_refunded
  add column if not exists orders_voided     bigint        default 0,  -- voided (cancelado)
  add column if not exists revenue_pending   numeric(14,2) default 0;  -- total de los pedidos pending
