-- 0018_landing_property.sql
-- Separar las propiedades GA4 en ga4_landing.
-- Antes se fusionaban (y sumaban) las filas de todas las propiedades por
-- (client_id, date, landing_page). Ahora cada fila lleva su property_id y la
-- clave única lo incluye, para que una hoja pueda aislar una sola propiedad
-- (p.ej. la de Shopify) sin contaminar con la otra.

ALTER TABLE ga4_landing
  ADD COLUMN IF NOT EXISTS property_id text NOT NULL DEFAULT '';

-- Reemplazar la clave única de 3 columnas por una de 4 (incluye property_id).
-- Se hace dinámico porque el nombre del constraint/índice puede variar.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'ga4_landing'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE ga4_landing DROP CONSTRAINT %I', r.conname);
  END LOOP;
  FOR r IN
    SELECT i.relname FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
     WHERE x.indrelid = 'ga4_landing'::regclass
       AND x.indisunique AND NOT x.indisprimary
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', r.relname);
  END LOOP;
END $$;

-- Limpiar las filas fusionadas viejas (sin propiedad); el ETL las repuebla ya
-- separadas por propiedad en la próxima corrida.
DELETE FROM ga4_landing WHERE property_id = '';

ALTER TABLE ga4_landing
  ADD CONSTRAINT ga4_landing_prop_uniq UNIQUE (client_id, date, landing_page, property_id);
