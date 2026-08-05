-- 0019_events_items_property.sql
-- Separar las propiedades GA4 en ga4_events y ga4_items (misma idea que la
-- migración 0018 para ga4_landing).
-- Antes se fusionaban (y SUMABAN) las filas de todas las propiedades por
-- (client_id, date, event_name) / (client_id, date, item_name). Cada propiedad
-- GA4 es una web distinta (p.ej. la tienda Shopify vs otro sitio de la marca),
-- así que sumarlas nublaba la interpretación (WhatsApp, pares, etc.). Ahora
-- cada fila lleva su property_id y la clave única lo incluye, para que la vista
-- pueda aislar una sola web (p.ej. la de Shopify) sin contaminar con la otra.

-- ── ga4_events ──────────────────────────────────────────────────────────────
ALTER TABLE ga4_events
  ADD COLUMN IF NOT EXISTS property_id text NOT NULL DEFAULT '';

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'ga4_events'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE ga4_events DROP CONSTRAINT %I', r.conname);
  END LOOP;
  FOR r IN
    SELECT i.relname FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
     WHERE x.indrelid = 'ga4_events'::regclass
       AND x.indisunique AND NOT x.indisprimary
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', r.relname);
  END LOOP;
END $$;

-- Limpiar las filas fusionadas viejas (sin propiedad); el ETL las repuebla ya
-- separadas por propiedad en la próxima corrida.
DELETE FROM ga4_events WHERE property_id = '';

ALTER TABLE ga4_events
  ADD CONSTRAINT ga4_events_prop_uniq UNIQUE (client_id, date, event_name, property_id);

-- ── ga4_items ───────────────────────────────────────────────────────────────
ALTER TABLE ga4_items
  ADD COLUMN IF NOT EXISTS property_id text NOT NULL DEFAULT '';

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'ga4_items'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE ga4_items DROP CONSTRAINT %I', r.conname);
  END LOOP;
  FOR r IN
    SELECT i.relname FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
     WHERE x.indrelid = 'ga4_items'::regclass
       AND x.indisunique AND NOT x.indisprimary
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', r.relname);
  END LOOP;
END $$;

DELETE FROM ga4_items WHERE property_id = '';

ALTER TABLE ga4_items
  ADD CONSTRAINT ga4_items_prop_uniq UNIQUE (client_id, date, item_name, property_id);
