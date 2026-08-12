-- 0021_meta_comments.sql
-- Comentarios de anuncios de Meta (por ahora, Instagram) para la sección
-- "💬 Comentarios" del modal de creativo en la hoja de Compras.
--
-- 1) Guardar el post subyacente de cada ad (para poder leer sus comentarios).
-- 2) Tabla de comentarios (una fila = un comentario), con sentimiento derivado.

-- ── 1) IDs del post por creativo ────────────────────────────────────────────
ALTER TABLE meta_ad_creatives
  ADD COLUMN IF NOT EXISTS instagram_media_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fb_post_id         text NOT NULL DEFAULT '';

-- ── 2) Comentarios ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_comments (
  client_id       text        NOT NULL,
  comment_id      text        NOT NULL,
  ad_id           text        NOT NULL DEFAULT '',
  ad_name         text        NOT NULL DEFAULT '',
  media_id        text        NOT NULL DEFAULT '',
  platform        text        NOT NULL DEFAULT 'instagram',
  author          text        NOT NULL DEFAULT '',
  content         text        NOT NULL DEFAULT '',
  likes           integer     NOT NULL DEFAULT 0,
  created_at      timestamptz,
  sentiment       text        NOT NULL DEFAULT 'neutral',
  sentiment_score real        NOT NULL DEFAULT 0,
  CONSTRAINT meta_comments_uniq UNIQUE (client_id, comment_id)
);

CREATE INDEX IF NOT EXISTS meta_comments_ad_idx ON meta_comments (client_id, ad_id);

-- RLS + lectura anónima (igual que las demás tablas del dashboard).
ALTER TABLE meta_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meta_comments anon read" ON meta_comments;
CREATE POLICY "meta_comments anon read" ON meta_comments FOR SELECT USING (true);
