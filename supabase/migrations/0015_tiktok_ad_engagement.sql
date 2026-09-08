-- ============================================================
-- Migración 0015 — Engagement social del anuncio en tiktok_campaigns
-- ============================================================
-- Agrega los corazones (likes), comentarios (comments) y compartidos (shares)
-- que TikTok reporta a nivel de anuncio. El extractor (tiktok_ads.py) ya los
-- pide; estas columnas los guardan (una fila = anuncio × día, así que el
-- all-time por anuncio es la suma sobre las fechas).
--
-- Alimenta la vista "Resultados por campañas": en cada ad se muestra ♥ likes y
-- 💬 comentarios (all-time) para leer la reacción de la audiencia a cada
-- creativo. El detalle de "qué se comenta" sale de tiktok_comments.
-- Idempotente.
-- ============================================================

alter table tiktok_campaigns
  add column if not exists likes    bigint default 0,
  add column if not exists comments bigint default 0,
  add column if not exists shares   bigint default 0;
