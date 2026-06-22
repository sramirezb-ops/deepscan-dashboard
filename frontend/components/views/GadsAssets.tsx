'use client';

import { useClient } from '@/lib/useClient';
import { useGadsAssets, type AssetMetrics, type TextAsset } from '@/lib/hooks/useGadsAssets';
import { formatInt } from '@/lib/utils';

// Línea compacta de métricas reales por pieza (impresiones · clics · leads).
// Solo se pinta si la pieza tuvo actividad: nunca mostramos "0 leads" inventado.
function MetricLine({ m, style }: { m: AssetMetrics; style?: React.CSSProperties }) {
  if (m.impressions <= 0 && m.clicks <= 0 && m.conversions <= 0) return null;
  return (
    <div style={{ fontSize: 9, color: 'var(--mu)', display: 'flex', gap: 8, flexWrap: 'wrap', ...style }}>
      <span>{formatInt(m.impressions)} impr.</span>
      <span>{formatInt(m.clicks)} clics</span>
      {m.conversions > 0 && (
        <span style={{ color: 'var(--ok, #22d97a)', fontWeight: 600 }}>
          {formatInt(m.conversions)} leads
        </span>
      )}
    </div>
  );
}

// ============================================================
// GadsAssets — biblioteca creativa de Performance Max
// ============================================================
// Se inyecta en la vista PMAX. Lee gads_assets (foto del estado actual,
// sin fecha → no responde al filtro). Muestra lo que SÍ es real hoy:
//   · Videos de YouTube con su miniatura real (img.youtube.com/vi/ID).
//   · Textos: headlines, long headlines y descriptions (copy real).
//   · Imágenes: conteo por tipo (la URL de preview aún no la exporta el
//     script de Google Ads → se avisa con honestidad, no se inventa).
// El performance_label de Google llega vacío desde la fuente; cuando se
// exporte, esta sección lo mostrará automáticamente.
// ============================================================

const VIDEO_LIMIT = 12;
const TEXT_LIMIT = 18;
const IMAGE_LIMIT = 24;

function TextBlock({ title, items }: { title: string; items: TextAsset[] }) {
  if (items.length === 0) return null;
  const shown = items.slice(0, TEXT_LIMIT);
  return (
    <div style={{ marginBottom: '16px' }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--t1)',
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {title}
        <span style={{ fontSize: 10, color: 'var(--mu)', fontWeight: 400 }}>
          {formatInt(items.length)} únicos
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {shown.map((t) => (
          <span
            key={`${t.fieldType}-${t.text}`}
            title={t.groups.length ? `Usado en: ${t.groups.join(', ')}` : undefined}
            style={{
              fontSize: 12,
              color: 'var(--t1)',
              background: 'var(--bg3)',
              border: '1px solid var(--b2)',
              borderRadius: 8,
              padding: '6px 10px',
              maxWidth: '100%',
              display: 'inline-flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {t.text}
            <MetricLine m={t} />
          </span>
        ))}
        {items.length > TEXT_LIMIT && (
          <span style={{ fontSize: 11, color: 'var(--mu)', alignSelf: 'center' }}>
            +{formatInt(items.length - TEXT_LIMIT)} más
          </span>
        )}
      </div>
    </div>
  );
}

export function GadsAssets() {
  const client = useClient();
  const { data, loading, error } = useGadsAssets(client.id);

  // Silencioso mientras carga: la vista PMAX ya muestra sus KPIs arriba.
  if (loading && !data) return null;
  // Si falla o no hay assets, no inventamos una sección vacía.
  if (error || !data || data.assetCount === 0) return null;

  const videos = data.videos.slice(0, VIDEO_LIMIT);
  const images = data.images.slice(0, IMAGE_LIMIT);

  return (
    <div className="card" style={{ marginTop: '20px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '4px',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <h3 style={{ margin: '0', fontSize: '15px' }}>Resultados por Assets · biblioteca creativa</h3>
        <span className="period-pill">
          {formatInt(data.assetCount)} assets · {formatInt(data.videoCount)} videos ·{' '}
          {formatInt(data.textCount)} textos · {formatInt(data.imageCount)} imágenes
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: '16px', lineHeight: 1.5 }}>
        Inventario real de los assets que alimentan tus asset groups de Performance Max. Foto del
        estado actual (no depende del filtro de fechas).
        {data.hasAnyMetric && (
          <>
            {' '}
            Cada pieza muestra sus <b>métricas reales</b> de los últimos 30 días (impresiones, clics y
            leads) directo de la API de Google Ads, y se ordenan por las que más leads traen.{' '}
            <b>Ojo:</b> en PMax estas métricas son de <b>contribución</b> —una misma conversión se
            acredita a cada asset que participó en el anuncio—, así que sirven para comparar piezas
            entre sí pero <b>no se suman</b> (no son un reparto del total).
          </>
        )}
        {!data.hasAnyPerfLabel && (
          <>
            {' '}
            El <b>performance label</b> (Mejor / Buena / Baja) ya no está disponible: Google lo retiró
            de su API, por eso usamos las métricas reales en su lugar.
          </>
        )}
      </div>

      {/* Videos de YouTube — miniaturas reales */}
      {videos.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: '10px' }}>
            Videos de YouTube
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 12,
            }}
          >
            {videos.map((v) => (
              <a
                key={v.videoId}
                href={`https://www.youtube.com/watch?v=${v.videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div
                  style={{
                    position: 'relative',
                    borderRadius: 10,
                    overflow: 'hidden',
                    border: '1px solid var(--b2)',
                    aspectRatio: '16 / 9',
                    background: 'var(--bg3)',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg`}
                    alt={v.title}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      background: 'rgba(0,0,0,0.7)',
                      color: '#fff',
                      fontSize: 9,
                      padding: '2px 6px',
                      borderRadius: 6,
                    }}
                  >
                    ▶ YouTube
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    marginTop: 6,
                    lineHeight: 1.3,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {v.title}
                </div>
                <MetricLine m={v} style={{ marginTop: 3 }} />
                {v.groups.length > 0 && (
                  <div style={{ fontSize: 9, color: 'var(--mu)', marginTop: 2 }}>
                    {v.groups.length} {v.groups.length === 1 ? 'grupo' : 'grupos'}
                  </div>
                )}
              </a>
            ))}
          </div>
          {data.videoCount > VIDEO_LIMIT && (
            <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 8 }}>
              +{formatInt(data.videoCount - VIDEO_LIMIT)} videos más en la cuenta.
            </div>
          )}
        </div>
      )}

      {/* Textos — copy real por tipo */}
      <TextBlock title="Títulos (headlines)" items={data.headlines} />
      <TextBlock title="Títulos largos" items={data.longHeadlines} />
      <TextBlock title="Descripciones" items={data.descriptions} />
      <TextBlock title="Otros textos" items={data.otherTexts} />

      {/* Imágenes — conteo por tipo + miniaturas reales cuando existen */}
      {data.imageTypes.length > 0 && (
        <div style={{ marginTop: '4px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: '8px' }}>
            Imágenes ({formatInt(data.imageCount)})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '12px' }}>
            {data.imageTypes.map((it) => (
              <span
                key={it.fieldType}
                className="tg tgn"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <b>{it.count}</b> {it.fieldType.replace(/_/g, ' ').toLowerCase()}
              </span>
            ))}
          </div>

          {/* Miniaturas reales: el script ya exporta la URL de preview */}
          {images.length > 0 && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                  gap: 12,
                }}
              >
                {images.map((im) => (
                  <a
                    key={im.url}
                    href={im.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={
                      im.groups.length ? `Usada en: ${im.groups.join(', ')}` : undefined
                    }
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div
                      style={{
                        position: 'relative',
                        borderRadius: 10,
                        overflow: 'hidden',
                        border: '1px solid var(--b2)',
                        aspectRatio: '1 / 1',
                        background: 'var(--bg3)',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={im.url}
                        alt={im.fieldType.replace(/_/g, ' ').toLowerCase()}
                        loading="lazy"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    </div>
                    <MetricLine m={im} style={{ marginTop: 4 }} />
                    {im.groups.length > 0 && (
                      <div style={{ fontSize: 9, color: 'var(--mu)', marginTop: 2 }}>
                        {im.groups.length} {im.groups.length === 1 ? 'grupo' : 'grupos'}
                      </div>
                    )}
                  </a>
                ))}
              </div>
              {data.images.length > images.length && (
                <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 8 }}>
                  Mostrando {formatInt(images.length)} de {formatInt(data.images.length)} imágenes
                  con preview.
                </div>
              )}
            </>
          )}

          {!data.hasAnyImageUrl && (
            <div style={{ fontSize: 11, color: 'var(--mu)', lineHeight: 1.5 }}>
              Las miniaturas de las imágenes aún no se pueden mostrar: el script de Google Ads no
              está exportando la URL de preview (<code>asset_image_asset_full_size_url</code>). En
              cuanto el feed incluya esa columna, las imágenes aparecerán aquí igual que los videos.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
