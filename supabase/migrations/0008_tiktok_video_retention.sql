-- ============================================================
-- Migración 0008 — Retención de video en TikTok (curva + tiempo promedio)
-- ============================================================
-- Objetivo: ampliar `tiktok_campaigns` (una fila = anuncio × día) con las
-- métricas de VIDEO que faltaban para juzgar el creativo en TikTok, donde el
-- video ES el rendimiento. Hasta ahora guardábamos solo 2s, 6s y "completo"
-- (p100). Esta migración agrega:
--
--   · La CURVA DE RETENCIÓN completa: cuánta gente, de la que empezó a ver,
--     llegó al 25 %, 50 % y 75 % del video (p100 ya existía como
--     video_completes). Con esto se dibuja la caída del video segundo a segundo.
--
--   · El TIEMPO DE REPRODUCCIÓN PROMEDIO (average_video_play): cuántos segundos,
--     en promedio, se reproduce cada video. Es la métrica más directa de "qué
--     tan retenido" queda el espectador, sin que la calculemos nosotros.
--
-- NADA se inventa: son métricas que la TikTok Marketing API reporta tal cual.
-- El "gancho" (hook) y las tasas de retención se DERIVAN en el dashboard a
-- partir de estos conteos + impresiones, para mantener todo consistente.
--
-- Idempotente: usa ADD COLUMN IF NOT EXISTS, se puede re-correr sin error.
-- ============================================================

alter table tiktok_campaigns
  -- Curva de retención (conteos que la API da por separado).
  add column if not exists video_watched_p25      bigint        default 0,  -- llegaron al 25 % del video
  add column if not exists video_watched_p50      bigint        default 0,  -- llegaron al 50 %
  add column if not exists video_watched_p75      bigint        default 0,  -- llegaron al 75 %
  -- (video_completes = p100 ya existe desde la 0006)

  -- Tiempo de reproducción promedio (segundos). Lo reporta TikTok directo.
  add column if not exists avg_watch_time          numeric(10,2) default 0,  -- average_video_play
  add column if not exists avg_watch_time_per_user numeric(10,2) default 0;  -- average_video_play_per_user

-- No hacen falta índices nuevos: las consultas del dashboard ya filtran por
-- (client_id, date) con el índice existente tiktok_campaigns_client_date_idx,
-- y las columnas nuevas solo se leen, nunca se filtran.
