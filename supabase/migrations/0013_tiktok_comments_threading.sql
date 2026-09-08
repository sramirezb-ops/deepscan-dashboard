-- ============================================================
-- Migración 0013 — Threading de comentarios de TikTok
-- ============================================================
-- Objetivo: poder reconstruir los HILOS (respuestas colgadas de su comentario
-- padre) en la hoja "TikTok Ads · Comentarios".
--
-- La API de comment/list ya devuelve las respuestas (comment_type = 'REPLY')
-- mezcladas con los comentarios, y trae el id del padre en el campo
-- `original_comment_id`. Guardamos ese id como `parent_comment_id` para poder
-- anidar cada respuesta bajo su comentario raíz. También guardamos `is_pinned`
-- (comentario fijado por la marca) que la API entrega en el mismo item.
--
-- Idempotente: se puede re-correr sin error.
-- ============================================================

alter table tiktok_comments
  add column if not exists parent_comment_id text,
  add column if not exists is_pinned         boolean default false;

-- Índice para traer rápido las respuestas de un comentario (threading).
create index if not exists tiktok_comments_client_parent_idx
  on tiktok_comments (client_id, parent_comment_id);
