'use client';

import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { TT_PINK, TT_CYAN, TikTokHero, SectionLabel } from './tiktokShared';

// ============================================================
// TikTok Ads · COMENTARIOS  (vista en preparación — placeholder honesto)
// ============================================================
// Vista 4 de TikTok. El objetivo es monitorear los comentarios de los anuncios
// (y su SENTIMENT) para entender la reacción real de la audiencia al creativo.
//
// IMPORTANTE: hoy NO existe la fuente de datos. No hay tabla `tiktok_comments`
// en Supabase y la API de comentarios aún no está conectada. Por eso esta hoja
// muestra un estado honesto de "esperando conexión" + un preview de cómo se
// verá, en lugar de inventar comentarios falsos. En cuanto el ETL escriba los
// comentarios reales, se reemplaza el preview por datos en vivo.
// ============================================================

// Colores de sentiment (se usarán también cuando haya datos reales).
const SENT = {
  pos: '#22d97a',
  neu: '#9aa3b2',
  neg: '#f87171',
};

export function TikTokComments() {
  const client = useClient();
  const { range } = usePeriod();
  const rangeLabel = formatRangeLabel(range);

  return (
    <div className="view on">
      <TikTokHero
        title="TikTok Ads · Comentarios"
        sub={
          <>
            {rangeLabel} · {client.name} · función en preparación
          </>
        }
      />

      {/* Aviso honesto: no hay datos todavía */}
      <div
        className="card"
        style={{
          borderStyle: 'dashed',
          borderColor: `${TT_PINK}66`,
          background: `linear-gradient(180deg, ${TT_PINK}0d, transparent)`,
        }}
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div
            aria-hidden
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              background: `linear-gradient(150deg, ${TT_PINK}22, ${TT_CYAN}22)`,
              border: '1px solid var(--b2)',
            }}
          >
            💬
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)', marginBottom: 6 }}>
              Esperando la conexión de los comentarios de TikTok
            </div>
            <div style={{ fontSize: 13, color: 'var(--mu)', lineHeight: 1.6, maxWidth: 640 }}>
              Esta hoja monitoreará los <b>comentarios de tus anuncios</b> y su <b>sentiment</b>{' '}
              (positivo / neutral / negativo) para entender cómo reacciona la audiencia a cada
              creativo. Todavía <b>no hay datos reales que mostrar</b>: la sincronización de
              comentarios aún no está conectada, así que preferimos decirlo con honestidad antes que
              inventar comentarios. En cuanto el ETL escriba los comentarios en{' '}
              <code>tiktok_comments</code>, esta vista se encenderá automáticamente con datos en
              vivo.
            </div>
          </div>
        </div>
      </div>

      {/* Preview de cómo se verá (claramente marcado como maqueta, sin datos) */}
      <SectionLabel style={{ marginTop: 22 }}>
        Así se verá cuando lleguen los datos reales · vista previa
      </SectionLabel>

      {/* Resumen de sentiment (placeholder) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10,
          opacity: 0.55,
        }}
      >
        <SentimentPreview label="Comentarios" value="—" color="var(--t1)" hint="total del período" />
        <SentimentPreview label="Positivos" value="—" color={SENT.pos} hint="% sobre el total" />
        <SentimentPreview label="Neutrales" value="—" color={SENT.neu} hint="% sobre el total" />
        <SentimentPreview label="Negativos" value="—" color={SENT.neg} hint="% sobre el total" />
      </div>

      {/* Lista de comentarios (skeleton) */}
      <div className="card" style={{ marginTop: 12, opacity: 0.55 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>
          Comentarios destacados
        </div>
        <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 14 }}>
          Cada comentario aparecerá con su autor, el anuncio al que pertenece, sus likes y su
          sentiment. Por ahora es solo una maqueta.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <CommentSkeleton dot={SENT.pos} w="82%" />
          <CommentSkeleton dot={SENT.neu} w="68%" />
          <CommentSkeleton dot={SENT.neg} w="74%" />
        </div>
      </div>

      {/* Qué se necesita para encender la hoja (documentación honesta) */}
      <SectionLabel style={{ marginTop: 22 }}>Qué se necesita para encender esta hoja</SectionLabel>
      <div className="card">
        <div style={{ fontSize: 13, color: 'var(--mu)', lineHeight: 1.7 }}>
          <div style={{ marginBottom: 10 }}>
            Para mostrar datos reales hacen falta dos piezas, en orden:
          </div>
          <div style={{ marginBottom: 12 }}>
            <b style={{ color: 'var(--t1)' }}>1. Origen de datos (backend / ETL).</b> Un proceso que
            traiga los comentarios desde la API de TikTok y los guarde en una tabla nueva en Supabase
            (p. ej. <code>tiktok_comments</code>) con, al menos:
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--t2)' }}>
              <li><code>comment_id</code> · <code>ad_id</code> (a qué anuncio pertenece)</li>
              <li><code>author</code> · <code>text</code> · <code>likes</code> · <code>created_at</code></li>
              <li><code>sentiment</code> (positivo / neutral / negativo) y un puntaje opcional</li>
            </ul>
          </div>
          <div>
            <b style={{ color: 'var(--t1)' }}>2. La hoja (frontend).</b> Una vez exista esa tabla con
            datos reales, conectamos esta vista al mismo hook de TikTok y reemplazamos el preview por:
            resumen de sentiment, filtro por anuncio, búsqueda, y los comentarios destacados — con la
            misma estética de Campañas y Retención.
          </div>
        </div>
      </div>
    </div>
  );
}

// Tarjeta de resumen de sentiment (maqueta, sin dato real).
function SentimentPreview({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color: string;
  hint: string;
}) {
  return (
    <div
      style={{
        background: 'var(--bg3)',
        border: '1px solid var(--b2)',
        borderRadius: 10,
        padding: '11px 13px 9px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--mu)' }}>{hint}</div>
    </div>
  );
}

// Fila vacía estilo "skeleton" de un comentario (maqueta).
function CommentSkeleton({ dot, w }: { dot: string; w: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 8,
        background: 'var(--bg3)',
        border: '1px solid var(--b2)',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ height: 8, width: '34%', borderRadius: 4, background: 'var(--b2)' }} />
        <span style={{ height: 8, width: w, borderRadius: 4, background: 'var(--b1, var(--b2))' }} />
      </div>
    </div>
  );
}
