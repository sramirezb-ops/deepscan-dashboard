'use client';

import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useInstagramOrganic, type IgMediaRow } from '@/lib/hooks/useInstagramOrganic';
import { EmptyState } from '@/components/ui/EmptyState';
import { TrendChart } from '@/components/ui/TrendChart';
import { formatInt, formatPercent, formatDelta } from '@/lib/utils';

const IG1 = '#F58529', IG2 = '#DD2A7B', FEEDC = '#405DE6';

function fmtDayShort(iso: string): string {
  const [, m, d] = iso.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${Number(d)} ${meses[Number(m) - 1] ?? m}`;
}
const isReels = (m: IgMediaRow) => (m.productType || '').toUpperCase() === 'REELS';
function shortCaption(c: string, max = 58): string {
  const clean = (c || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean || '(sin texto)';
}
interface Grp { n: number; reach: number; inter: number; saves: number; er: number }
function agg(arr: IgMediaRow[]): Grp {
  const g = { n: arr.length, reach: 0, inter: 0, saves: 0, er: 0 };
  for (const m of arr) { g.reach += m.reach; g.inter += m.interactions; g.saves += m.saved; g.er += m.engagementRate; }
  g.er = arr.length ? g.er / arr.length : 0;
  return g;
}

export function InstagramOrganic() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useInstagramOrganic(client.id, range, previous);
  const rangeLabel = formatRangeLabel(range);

  if (loading && !data) {
    return <div className="view on"><div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--t3)' }}>Cargando Instagram de {client.name}…</div></div>;
  }
  if (error) {
    return <div className="view on"><div className="card" style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}><div style={{ color: '#ef4444', marginBottom: 8 }}>Error cargando Instagram orgánico</div><div style={{ fontSize: 12, color: 'var(--t3)' }}>{error}</div></div></div>;
  }
  if (!data || (!data.hasAccountData && !data.hasMediaData)) {
    return <EmptyState icon="📸" title={data?.accountExistsEver ? 'Sin datos de Instagram en este rango' : 'Esperando los datos de Instagram'} message={<>En cuanto la sincronización escriba <code>ig_account_daily</code> y <code>ig_media</code>, esta vista mostrará seguidores, alcance y el engagement de cada post.</>} hint="Requiere permisos instagram_basic + instagram_manage_insights." />;
  }

  const t = data.totals;
  const media = data.media;
  const savesTotal = media.reduce((s, m) => s + m.saved, 0);

  // Reels vs Feed (todo lo que no es Reels)
  const reels = agg(media.filter(isReels));
  const feed = agg(media.filter((m) => !isReels(m)));
  const reelsWin = reels.er >= feed.er;

  // Series diarias (recortar ceros finales del lag de Instagram)
  const trim = <R,>(rows: R[], val: (r: R) => number): R[] => {
    let nn = rows.length;
    while (nn > 1 && val(rows[nn - 1]) === 0) nn--;
    return rows.slice(0, nn);
  };
  const reachRows = trim(data.daily, (d) => d.reach);
  const followerRows = trim(data.daily, (d) => d.newFollowers);

  // Top posts (grid)
  const top = [...media].sort((a, b) => b.interactions - a.interactions).slice(0, 6);

  const reachDown = data.reachDelta < 0;
  const reachAbs = Math.abs(Math.round(data.reachDelta));

  return (
    <div className="view on ig">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* HERO */}
      <div className="ig-hero">
        <div>
          <div className="ig-eyebrow"><span className="iglogo" />Instagram orgánico{data.username ? ` · @${data.username}` : ''} · {rangeLabel}</div>
          <div className="ig-thesis">
            {formatInt(t.followers)} seguidores y creciendo.{' '}
            {reachDown
              ? <>Pero el alcance cayó <span className="dn">−{reachAbs}%</span>.</>
              : <>Y el alcance subió <span className="up">+{reachAbs}%</span>.</>}
          </div>
          <div className="ig-sub">
            La comunidad está fuerte (<b>{(t.newFollowers >= 0 ? '+' : '−') + formatInt(Math.abs(t.newFollowers))} nuevos</b> en el período). El reto no es el público — es que el <b>contenido llegue a más gente</b>.
            {reelsWin && reels.n > 0 && <> Y ahí los <b>Reels rinden mejor de lo que se usan</b>.</>}
          </div>
        </div>
        <div className="ig-hstat">
          <div className="k">Alcance del período</div>
          <div className="v mono">{formatInt(t.reach)}</div>
          <div className={'d ' + (reachDown ? 'dn' : 'up')}>{formatDelta(data.reachDelta)} vs período anterior</div>
        </div>
      </div>

      {/* KPIs */}
      <div className="ig-kpis">
        <div className="ig-kpi"><div className="l">Seguidores</div><div className="v mono">{formatInt(t.followers)}</div><div className="b"><span className={t.newFollowers >= 0 ? 'up' : 'dn'}>{(t.newFollowers >= 0 ? '+' : '−') + formatInt(Math.abs(t.newFollowers))}</span> nuevos en el período</div></div>
        <div className="ig-kpi"><div className="l">Alcance</div><div className="v mono">{formatInt(t.reach)}</div><div className="b"><span className={reachDown ? 'dn' : 'up'}>{formatDelta(data.reachDelta)}</span> vs anterior</div></div>
        <div className="ig-kpi"><div className="l">Engagement</div><div className="v mono">{formatPercent(t.engagementRate, 1)}</div><div className="b">sobre alcance · {formatInt(Math.round(t.avgPerPost))} / post</div></div>
        <div className="ig-kpi"><div className="l">Guardados</div><div className="v mono">{formatInt(savesTotal)}</div><div className="b">saves = intención de compra</div></div>
      </div>
      <div className="ig-pvnote">Visitas al perfil: <b>{formatInt(t.profileViews)}</b> <span>(snapshot de hoy · Instagram no entrega histórico diario)</span></div>

      {/* REELS VS FEED */}
      {media.length > 0 && (
        <>
          <div className="ig-sh"><h2>¿Qué formato gana?</h2><span className="hint">Reels vs Feed en el período · engagement rate = calidad</span></div>
          <div className="card ig-pad">
            <div className="ig-verdict">
              <div className={'ig-fcell' + (!reelsWin ? ' win' : '')}>
                <div className="ft"><span className="fdot" style={{ background: FEEDC }} />Feed / Carrusel{!reelsWin && <span className="winbadge">MEJOR ER</span>}</div>
                <div className="fbig mono">{formatPercent(feed.er, 1)} <span className="fu">engagement</span></div>
                <div className="frow"><div><div className="n mono">{feed.n}</div><div className="u">posts</div></div><div><div className="n mono">{formatInt(feed.reach)}</div><div className="u">alcance</div></div><div><div className="n mono">{formatInt(feed.saves)}</div><div className="u">saves</div></div></div>
              </div>
              <div className={'ig-fcell' + (reelsWin ? ' win' : '')}>
                <div className="ft"><span className="fdot" style={{ background: IG2 }} />Reels{reelsWin && <span className="winbadge">MEJOR ER</span>}</div>
                <div className="fbig mono">{formatPercent(reels.er, 1)} <span className="fu">engagement</span></div>
                <div className="frow"><div><div className="n mono">{reels.n}</div><div className="u">posts</div></div><div><div className="n mono">{formatInt(reels.reach)}</div><div className="u">alcance</div></div><div><div className="n mono">{formatInt(reels.saves)}</div><div className="u">saves</div></div></div>
              </div>
              <div className="ig-vsay">
                {reelsWin && reels.n > 0 && feed.n > 0
                  ? <span>Los <b>Reels enganchan más</b> ({formatPercent(reels.er, 1)} vs {formatPercent(feed.er, 1)}) pero son solo <b>{reels.n} de {media.length} posts</b>. La palanca de alcance más clara: <b>más Reels</b>.</span>
                  : <span>El <b>Feed</b> lidera el engagement este período ({formatPercent(feed.er, 1)} vs {formatPercent(reels.er, 1)}). Mantener el formato que conecta y probar más Reels para alcance.</span>}
              </div>
            </div>
          </div>
        </>
      )}

      {/* CHARTS */}
      <div className="ig-sh"><h2>Tendencias diarias</h2><span className="hint">alcance y crecimiento de seguidores por día</span></div>
      <div className="ig-charts">
        <TrendChart title="Alcance / día" headline={formatInt(t.reach)} sub="cuentas alcanzadas" points={reachRows.map((d) => d.reach)} labels={reachRows.map((d) => fmtDayShort(d.date))} color={IG2} format={(v) => formatInt(v)} />
        <TrendChart title="Seguidores nuevos / día" headline={(t.newFollowers >= 0 ? '+' : '−') + formatInt(Math.abs(t.newFollowers))} sub="crecimiento neto" points={followerRows.map((d) => d.newFollowers)} labels={followerRows.map((d) => fmtDayShort(d.date))} color={IG1} format={(v) => formatInt(v)} />
      </div>

      {/* TOP POSTS GRID */}
      {top.length > 0 && (
        <>
          <div className="ig-sh"><h2>Mejores publicaciones</h2><span className="hint">lo que más conectó · clic para abrir en Instagram</span></div>
          <div className="ig-grid">
            {top.map((p) => {
              const rl = isReels(p);
              const card = (
                <>
                  <div className="ph">
                    {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt="" loading="lazy" /> : <span className="phe">{rl ? '🎬' : '🖼️'}</span>}
                    <span className="badge" style={{ background: rl ? IG2 : FEEDC }}>{rl ? 'Reels' : 'Feed'}</span>
                    {p.reach > 0 && <span className="er">{formatPercent(p.engagementRate, 1)} ER</span>}
                  </div>
                  <div className="body">
                    <div className="cap">{shortCaption(p.caption)}</div>
                    <div className="mrow">
                      <div className="m">Alcance<b>{formatInt(p.reach)}</b></div>
                      <div className="m">Likes<b>{formatInt(p.likes)}</b></div>
                      <div className="m sav">Saves<b>{formatInt(p.saved)}</b></div>
                    </div>
                  </div>
                </>
              );
              return p.permalink
                ? <a className="ig-post" key={p.mediaId} href={p.permalink} target="_blank" rel="noopener noreferrer">{card}</a>
                : <div className="ig-post" key={p.mediaId}>{card}</div>;
            })}
          </div>
        </>
      )}

      {/* ACCIONES */}
      <div className="ig-sh"><h2>Qué haría esta semana</h2><span className="hint">lente de agencia · social media</span></div>
      <div className="ig-acts">
        {reelsWin && reels.n > 0 && (
          <div className="ig-act win"><div className="tag">🎬 Más Reels</div><div className="body">Los Reels enganchan <b>{formatPercent(reels.er, 1)}</b> vs {formatPercent(feed.er, 1)} del Feed pero son solo <b>{reels.n} de {media.length}</b>. Subir la proporción de Reels es la palanca directa de alcance.</div></div>
        )}
        {reachDown && (
          <div className="ig-act warn"><div className="tag">📉 Recuperar alcance</div><div className="body">El alcance cayó <b>{formatDelta(data.reachDelta)}</b>. Probar horarios, hooks nuevos y colaboraciones — la comunidad crece pero no lo ve.</div></div>
        )}
        <div className="ig-act"><div className="tag">🔖 Explotar los saves</div><div className="body">Los <b>{formatInt(savesTotal)} guardados</b> son intención de compra. Repetir los ángulos que más guardan (preventas) y enlazar a WhatsApp para cerrar.</div></div>
      </div>

      <div className="ig-fn">Fuente: <b>ig_media</b> (reach, likes, saves, ER y miniatura por post) + <b>ig_account_daily</b> (alcance y seguidores por día). Seguidores = snapshot actual; crecimiento vía new_followers. Visitas al perfil = snapshot (sin histórico). {rangeLabel}.</div>
    </div>
  );
}

const CSS = `
.ig-eyebrow{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--t3);display:flex;align-items:center;gap:8px;margin-bottom:13px}
.ig-eyebrow .iglogo{width:20px;height:20px;border-radius:6px;background:linear-gradient(45deg,#F58529,#DD2A7B,#8134AF)}
.ig-hero{background:linear-gradient(120deg,var(--bg1),var(--acc-faint,rgba(139,92,246,.05)));border:1px solid var(--b1);border-radius:20px;padding:26px 28px;display:grid;grid-template-columns:1fr auto;gap:28px;align-items:center}
.ig-thesis{font-size:clamp(21px,2.8vw,30px);font-weight:800;letter-spacing:-.02em;line-height:1.15}
.ig-thesis .dn{color:var(--dn)}.ig-thesis .up{color:var(--up)}
.ig-sub{font-size:13.5px;color:var(--t2);margin-top:13px;line-height:1.6;max-width:58ch}.ig-sub b{color:var(--t1)}
.ig-hstat{text-align:right;padding-left:24px;border-left:1px solid var(--b1)}
.ig-hstat .k{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--t3)}
.ig-hstat .v{font-size:36px;font-weight:800;letter-spacing:-.03em;line-height:1;margin-top:6px;color:var(--t1)}
.ig-hstat .d{font-size:12px;font-weight:700;margin-top:8px}.ig-hstat .d.dn{color:var(--dn)}.ig-hstat .d.up{color:var(--up)}
.ig-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:16px}
.ig-kpi{background:var(--bg1);border:1px solid var(--b1);border-radius:14px;padding:16px 18px}
.ig-kpi .l{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--t3)}
.ig-kpi .v{font-size:27px;font-weight:800;letter-spacing:-.02em;margin-top:6px;color:var(--t1)}
.ig-kpi .b{font-size:11px;margin-top:7px;color:var(--t3)}.ig-kpi .b .up{color:var(--up);font-weight:700}.ig-kpi .b .dn{color:var(--dn);font-weight:700}
.ig-pvnote{font-size:11px;color:var(--t3);margin-top:9px}.ig-pvnote b{color:var(--t2)}.ig-pvnote span{opacity:.7}
.ig-sh{display:flex;align-items:baseline;gap:11px;margin:32px 0 14px}.ig-sh h2{font-size:16px;font-weight:800}.ig-sh .hint{font-size:11.5px;color:var(--t3)}
.ig-pad{padding:20px 22px}
.ig-verdict{display:grid;grid-template-columns:1fr 1fr auto;gap:16px;align-items:stretch}
.ig-fcell{border:1px solid var(--b1);border-radius:13px;padding:16px 18px}
.ig-fcell.win{border-color:rgba(221,42,123,.35);background:var(--acc-faint,rgba(221,42,123,.05))}
.ig-fcell .ft{font-size:12px;font-weight:800;display:flex;align-items:center;gap:8px}
.ig-fcell .fdot{width:9px;height:9px;border-radius:50%}
.ig-fcell .fbig{font-size:24px;font-weight:800;margin-top:10px;color:var(--t1)}.ig-fcell .fbig .fu{font-size:12px;font-weight:600;color:var(--t3)}
.ig-fcell .frow{display:flex;gap:18px;margin-top:12px;padding-top:11px;border-top:1px solid var(--b1)}
.ig-fcell .frow .n{font-size:14px;font-weight:800;color:var(--t1)}.ig-fcell .frow .u{font-size:9px;color:var(--t3);text-transform:uppercase;letter-spacing:.04em}
.ig-vsay{display:flex;flex-direction:column;justify-content:center;max-width:210px;font-size:12.5px;color:var(--t2);line-height:1.55}.ig-vsay b{color:var(--t1)}
.winbadge{font-size:9px;font-weight:800;color:#fff;background:#DD2A7B;padding:2px 8px;border-radius:20px;margin-left:6px}
.ig-charts{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.ig-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.ig-post{background:var(--bg1);border:1px solid var(--b1);border-radius:14px;overflow:hidden;display:block;text-decoration:none;color:inherit}
.ig-post .ph{aspect-ratio:1;background:var(--bg2);display:grid;place-items:center;position:relative;overflow:hidden}
.ig-post .ph img{width:100%;height:100%;object-fit:cover}
.ig-post .ph .phe{font-size:30px;color:var(--t3)}
.ig-post .badge{position:absolute;top:9px;left:9px;font-size:9px;font-weight:800;color:#fff;padding:3px 8px;border-radius:20px}
.ig-post .er{position:absolute;top:9px;right:9px;font-size:10px;font-weight:800;background:rgba(255,255,255,.92);color:#171226;padding:3px 8px;border-radius:20px}
.ig-post .body{padding:11px 13px}
.ig-post .cap{font-size:12px;font-weight:600;line-height:1.35;height:32px;overflow:hidden;color:var(--t1)}
.ig-post .mrow{display:flex;gap:14px;margin-top:9px}
.ig-post .mrow .m{font-size:9px;color:var(--t3);text-transform:uppercase;letter-spacing:.03em}
.ig-post .mrow .m b{display:block;font-size:13px;color:var(--t1);margin-top:1px}
.ig-post .mrow .m.sav b{color:#DD2A7B}
.ig-acts{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.ig-act{background:var(--bg1);border:1px solid var(--b1);border-radius:14px;padding:16px 18px;border-left:3px solid var(--acc)}
.ig-act.win{border-left-color:#DD2A7B}.ig-act.warn{border-left-color:var(--warn)}
.ig-act .tag{font-size:12px;font-weight:800;margin-bottom:7px}
.ig-act .body{font-size:12.5px;color:var(--t2);line-height:1.5}.ig-act .body b{color:var(--t1)}
.ig-fn{margin-top:32px;font-size:11px;color:var(--t3);border-top:1px solid var(--b1);padding-top:16px;line-height:1.6}.ig-fn b{color:var(--t2)}
.ig .mono{font-family:'Space Grotesk',Inter,sans-serif}
@media(max-width:760px){.ig-hero{grid-template-columns:1fr}.ig-hstat{text-align:left;border-left:none;padding-left:0}.ig-kpis{grid-template-columns:1fr 1fr}.ig-verdict,.ig-charts,.ig-acts{grid-template-columns:1fr}.ig-grid{grid-template-columns:1fr 1fr}}
`;
