'use client';

import { useClient } from '@/lib/useClient';
import {
  useGadsAssets,
  type TextAsset,
  type AssetSource,
} from '@/lib/hooks/useGadsAssets';
import { formatInt, formatPercent } from '@/lib/utils';

// ============================================================
// GadsAssets — biblioteca creativa de Performance Max
// ============================================================
// Se inyecta en la vista PMAX. Lee gads_assets (foto del estado actual,
// sin fecha → no responde al filtro). El valor de esta hoja es saber, de un
// vistazo, QUÉ está creando Google por su cuenta vs. lo que subió el
// anunciante, para decidir qué conservar o reemplazar:
//   · Videos de YouTube con su miniatura real.
//   · Imágenes con su preview real cuando el script la exporta.
//   · Textos: headlines, long headlines y descriptions (copy real).
// Cada pieza trae su ORIGEN (🤖 Google auto vs ⬆️ subido por ti).
// Honestidad: Google NO expone el gasto por pieza en PMax (lo reparte
// dinámicamente entre los assets del grupo), así que no se inventa spend.
// ============================================================

const VIDEO_LIMIT = 12;
const TEXT_LIMIT = 18;
const IMAGE_LIMIT = 24;

const SRC_META: Record<AssetSource, { label: string; icon: string; cls: string }> = {
  auto: { label: 'Auto', icon: '🤖', cls: 'auto' },
  advertiser: { label: 'Tuyo', icon: '⬆️', cls: 'adv' },
  unknown: { label: '', icon: '', cls: 'unk' },
};

function SourceBadge({ source, mini }: { source: AssetSource; mini?: boolean }) {
  const m = SRC_META[source];
  if (source === 'unknown') return null;
  return (
    <span className={'ga-src ' + m.cls + (mini ? ' mini' : '')} title={source === 'auto' ? 'Creado automáticamente por Google' : 'Subido por ti'}>
      {m.icon}{!mini && ' ' + m.label}
    </span>
  );
}

function TextBlock({ title, items }: { title: string; items: TextAsset[] }) {
  if (items.length === 0) return null;
  const shown = items.slice(0, TEXT_LIMIT);
  return (
    <div className="ga-tblock">
      <div className="ga-tbh">
        {title}
        <span className="c">{formatInt(items.length)} únicos</span>
      </div>
      <div className="ga-chips">
        {shown.map((t) => (
          <span
            key={`${t.fieldType}-${t.text}`}
            className="ga-chip"
            title={t.groups.length ? `Usado en: ${t.groups.join(', ')}` : undefined}
          >
            <SourceBadge source={t.source} mini />
            {t.text}
          </span>
        ))}
        {items.length > TEXT_LIMIT && (
          <span className="ga-more">+{formatInt(items.length - TEXT_LIMIT)} más</span>
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

  const total = data.distinctCount || 1;
  const autoPct = data.autoCount / total;
  const advPct = data.advertiserCount / total;
  const unkPct = data.unknownCount / total;

  return (
    <div className="ga">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Tesis · origen de las piezas */}
      <div className="ga-sh"><h3>Biblioteca creativa · qué crea Google y qué subiste tú</h3>
        <span className="hint">{formatInt(data.videoCount)} videos · {formatInt(data.imageCount)} imágenes · {formatInt(data.textCount)} textos</span>
      </div>
      <div className="ga-tesis">
        <div className="t">
          <b style={{ color: 'var(--acc)' }}>{formatInt(data.autoCount)} piezas</b> las genera Google solo ·{' '}
          <b style={{ color: 'var(--up)' }}>{formatInt(data.advertiserCount)}</b> las subiste tú
        </div>
        <div className="ga-splitbar">
          {autoPct > 0 && <i className="auto" style={{ width: autoPct * 100 + '%' }} />}
          {advPct > 0 && <i className="adv" style={{ width: advPct * 100 + '%' }} />}
          {unkPct > 0 && <i className="unk" style={{ width: unkPct * 100 + '%' }} />}
        </div>
        <div className="ga-leg">
          <span><i className="d auto" /> 🤖 Auto de Google · {formatPercent(autoPct, 0)}</span>
          <span><i className="d adv" /> ⬆️ Subido por ti · {formatPercent(advPct, 0)}</span>
          {data.unknownCount > 0 && <span><i className="d unk" /> Sin origen declarado · {formatInt(data.unknownCount)}</span>}
        </div>
        <div className="s">
          Cada pieza trae su origen para que sepas qué está creando la plataforma por su cuenta y decidas
          qué conservar o reemplazar (se edita en el <b>asset group</b> dentro de Google Ads).{' '}
          <b>Ojo:</b> PMax <b>no</b> expone el gasto por pieza —reparte el presupuesto dinámicamente entre
          todos los assets del grupo—, así que aquí no verás "cuánto gastó cada video", eso no existe en la API.
        </div>
      </div>

      {/* Videos de YouTube — miniaturas reales */}
      {videos.length > 0 && (
        <>
          <div className="ga-sh"><h3>Videos de YouTube</h3><span className="hint">miniatura real · clic para abrir en YouTube</span></div>
          <div className="card ga-pad">
            <div className="ga-grid vid">
              {videos.map((v) => (
                <a
                  key={v.videoId}
                  href={`https://www.youtube.com/watch?v=${v.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ga-vcard"
                >
                  <div className="thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg`}
                      alt={v.title}
                      loading="lazy"
                    />
                    <span className="yt">▶ YouTube</span>
                    <SourceBadge source={v.source} />
                  </div>
                  <div className="cap">{v.title}</div>
                  {v.groups.length > 0 && (
                    <div className="grp">{v.groups.length} {v.groups.length === 1 ? 'grupo' : 'grupos'}</div>
                  )}
                </a>
              ))}
            </div>
            {data.videoCount > VIDEO_LIMIT && (
              <div className="ga-note">+{formatInt(data.videoCount - VIDEO_LIMIT)} videos más en la cuenta.</div>
            )}
          </div>
        </>
      )}

      {/* Imágenes — conteo por tipo + miniaturas reales cuando existen */}
      {data.imageTypes.length > 0 && (
        <>
          <div className="ga-sh"><h3>Imágenes</h3><span className="hint">{formatInt(data.imageCount)} en total · por tipo de espacio</span></div>
          <div className="card ga-pad">
            <div className="ga-imgtypes">
              {data.imageTypes.map((it) => (
                <span key={it.fieldType} className="ga-tg">
                  <b>{it.count}</b> {it.fieldType.replace(/_/g, ' ').toLowerCase()}
                </span>
              ))}
            </div>

            {images.length > 0 && (
              <>
                <div className="ga-grid img">
                  {images.map((im) => (
                    <a
                      key={im.url}
                      href={im.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ga-icard"
                      title={im.groups.length ? `Usada en: ${im.groups.join(', ')}` : undefined}
                    >
                      <div className="thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={im.url} alt={im.fieldType.replace(/_/g, ' ').toLowerCase()} loading="lazy" />
                        <SourceBadge source={im.source} />
                      </div>
                      {im.groups.length > 0 && (
                        <div className="grp">{im.groups.length} {im.groups.length === 1 ? 'grupo' : 'grupos'}</div>
                      )}
                    </a>
                  ))}
                </div>
                {data.images.length > images.length && (
                  <div className="ga-note">Mostrando {formatInt(images.length)} de {formatInt(data.images.length)} imágenes con preview.</div>
                )}
              </>
            )}

            {!data.hasAnyImageUrl && (
              <div className="ga-note soft">
                Las miniaturas de las imágenes aún no se pueden mostrar: el script de Google Ads no está
                exportando la URL de preview (<code>asset_image_asset_full_size_url</code>). En cuanto el
                feed incluya esa columna, aparecerán aquí igual que los videos.
              </div>
            )}
          </div>
        </>
      )}

      {/* Textos — copy real por tipo */}
      {(data.headlines.length + data.longHeadlines.length + data.descriptions.length + data.otherTexts.length) > 0 && (
        <>
          <div className="ga-sh"><h3>Títulos y descripciones</h3><span className="hint">copy real · 🤖 = lo escribió Google</span></div>
          <div className="card ga-pad">
            <TextBlock title="Títulos (headlines)" items={data.headlines} />
            <TextBlock title="Títulos largos" items={data.longHeadlines} />
            <TextBlock title="Descripciones" items={data.descriptions} />
            <TextBlock title="Otros textos" items={data.otherTexts} />
          </div>
        </>
      )}
    </div>
  );
}

const CSS = `
.ga{margin-top:22px}
.ga-sh{display:flex;align-items:baseline;gap:11px;margin:26px 0 12px}
.ga-sh h3{font-size:15px;font-weight:800;margin:0}
.ga-sh .hint{font-size:11px;color:var(--t3)}
.ga-pad{padding:16px 18px}
.ga-note{font-size:11px;color:var(--t3);margin-top:10px;line-height:1.5}
.ga-note.soft{background:var(--bg2);border-radius:8px;padding:10px 12px;margin-top:12px}
.ga-note code{font-size:10px;background:var(--bg3);padding:1px 5px;border-radius:4px}
/* tesis / origen */
.ga-tesis{background:linear-gradient(120deg,var(--bg1),var(--acc-faint,rgba(139,92,246,.05)));border:1px solid var(--b1);border-radius:14px;padding:16px 20px}
.ga-tesis .t{font-size:16px;font-weight:800;letter-spacing:-.01em}
.ga-splitbar{display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--track);margin:13px 0 9px}
.ga-splitbar i{display:block;height:100%}
.ga-splitbar i.auto{background:var(--acc)}
.ga-splitbar i.adv{background:var(--up)}
.ga-splitbar i.unk{background:var(--b2)}
.ga-leg{display:flex;flex-wrap:wrap;gap:16px;font-size:11.5px;color:var(--t2);font-weight:600}
.ga-leg .d{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px;vertical-align:middle}
.ga-leg .d.auto{background:var(--acc)}.ga-leg .d.adv{background:var(--up)}.ga-leg .d.unk{background:var(--b2)}
.ga-tesis .s{font-size:12px;color:var(--t2);margin-top:11px;line-height:1.55}.ga-tesis .s b{color:var(--t1)}
/* badge de origen */
.ga-src{display:inline-flex;align-items:center;gap:3px;font-size:9.5px;font-weight:800;padding:2px 7px;border-radius:6px;line-height:1;white-space:nowrap}
.ga-src.auto{background:var(--acc-faint,rgba(139,92,246,.14));color:var(--acc)}
.ga-src.adv{background:rgba(34,217,122,.14);color:var(--up)}
.ga-src.mini{padding:1px 5px;font-size:9px;margin-right:5px}
/* grids */
.ga-grid{display:grid;gap:12px}
.ga-grid.vid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}
.ga-grid.img{grid-template-columns:repeat(auto-fill,minmax(120px,1fr));margin-top:4px}
.ga-vcard,.ga-icard{text-decoration:none;color:inherit;display:block}
.ga-vcard .thumb,.ga-icard .thumb{position:relative;border-radius:10px;overflow:hidden;border:1px solid var(--b2);background:var(--bg3)}
.ga-vcard .thumb{aspect-ratio:16/9}.ga-icard .thumb{aspect-ratio:1/1}
.ga-vcard .thumb img,.ga-icard .thumb img{width:100%;height:100%;object-fit:cover;display:block}
.ga-vcard .yt{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.7);color:#fff;font-size:9px;padding:2px 6px;border-radius:6px}
.ga-vcard .thumb .ga-src,.ga-icard .thumb .ga-src{position:absolute;top:6px;left:6px;background:rgba(255,255,255,.95);box-shadow:0 1px 5px rgba(0,0,0,.35)}
.ga-vcard .thumb .ga-src.auto,.ga-icard .thumb .ga-src.auto{color:#7c3aed}
.ga-vcard .thumb .ga-src.adv,.ga-icard .thumb .ga-src.adv{color:#0f9d58}
.ga-vcard .cap{font-size:11px;margin-top:6px;line-height:1.3;color:var(--t1);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ga-vcard .grp,.ga-icard .grp{font-size:9px;color:var(--t3);margin-top:3px}
/* imagenes: tipos */
.ga-imgtypes{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.ga-tg{font-size:11px;color:var(--t2);background:var(--bg3);border:1px solid var(--b1);border-radius:8px;padding:5px 10px}.ga-tg b{color:var(--t1)}
/* textos */
.ga-tblock{margin-bottom:16px}.ga-tblock:last-child{margin-bottom:0}
.ga-tbh{font-size:12px;font-weight:700;color:var(--t1);margin-bottom:8px;display:flex;align-items:center;gap:8px}
.ga-tbh .c{font-size:10px;color:var(--t3);font-weight:400}
.ga-chips{display:flex;flex-wrap:wrap;gap:8px}
.ga-chip{font-size:12px;color:var(--t1);background:var(--bg3);border:1px solid var(--b2);border-radius:8px;padding:6px 10px;display:inline-flex;align-items:center;max-width:100%}
.ga-more{font-size:11px;color:var(--t3);align-self:center}
@media(max-width:820px){.ga-grid.vid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}.ga-grid.img{grid-template-columns:repeat(auto-fill,minmax(96px,1fr))}.ga-leg{gap:12px;font-size:11px}}
`;
