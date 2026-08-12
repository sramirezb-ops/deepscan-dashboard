-- 0022_clarity_devices.sql
-- Split por dispositivo en clarity_metrics (señal CRO: % mobile).
-- El extractor de Clarity ahora hace una request extra (dimension1=Device)
-- y guarda las sesiones por dispositivo. Requiere re-correr el ETL para poblar.
ALTER TABLE clarity_metrics
  ADD COLUMN IF NOT EXISTS sessions_mobile integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sessions_pc     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sessions_tablet integer NOT NULL DEFAULT 0;
