'use client';

import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import {
  useTikTok,
  type TikTokCampaignRow,
  type TikTokAdGroupRow,
  type TikTokRetention,
} from '@/lib/hooks/useTikTok';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  formatCurrency,
  formatInt,
  formatNumber,
  formatPercent,
  formatDelta,
  deltaDirection,
} from '@/lib/utils';

// ============================================================
// TikTok Ads — vista orientada a LEADS (Ofero)
// ============================================================
// Lee tiktok_campaigns vía useTikTok (responde al filtro de fechas).
// Métrica estrella: leads (conversiones), costo por lead (CPL) y CTR.
// Además una tarjeta de VIDEO (hook 2s / retención 6s / completas), que
// es lo que de verdad mueve el rendimiento en TikTok. Nada se inventa:
// si no hay filas en el rango, se muestra el aviso honesto.
// ============================================================

const TT_PINK = '#ee1d52';
const TT_CYAN = '#69c9d0';

export function TikTok() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useTikTok(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const previousLabel = formatRangeLabel(previous);
  const cur = client.currency;

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Cargando campañas de TikTok de {client.name}…
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view on">
        <div
          className="card"
          style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}
        >
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>
            Error cargando TikTok Ads
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }

  // Sin datos en el rango: aviso honesto. Distinguimos "nunca conectado" de
  // "conectado pero sin actividad en estas fechas".
  if (!data || data.totals.spend === 0) {
    return (
      <EmptyState
        icon="🎵"
        title={data?.tiktokExistsEver ? 'Sin actividad en este período' : 'Esperando la conexión de TikTok Ads'}
        message={
          data?.tiktokExistsEver ? (
            <>
              No hubo inversión de TikTok para {client.name} entre <b>{rangeLabel}</b>. Prueba a
              ampliar el rango de fechas con el filtro de arriba.
            </>
          ) : (
            <>
              Aún no hay datos de TikTok Ads para {client.name}. En cuanto la sincronización escriba
              las campañas en la tabla <code>tiktok_campaigns</code>, esta vista mostrará leads, costo
              por lead, CTR y el rendimiento de los videos — todo con datos reales.
            </>
          )
        }
        hint="La conexión con TikTok depende de que la app de la Marketing API esté aprobada y sus credenciales cargadas."
      />
    );
  }

  const t = data.totals;
  const v = data.video;

  // CPL: más barato es mejor → baja = verde, sube = rojo.
  const cplCheaper = data.cplDelta <= 0;
  const cplDeltaLabel = (data.cplDelta >= 0 ? '+' : '−') + formatCurrency(Math.abs(data.cplDelta), cur);

  // CTR: más alto es mejor.
  const ctrUp = data.ctrDelta >= 0;
  const ctrDeltaLabel = (data.ctrDelta >= 0 ? '+' : '−') + formatPercent(Math.abs(data.ctrDelta), 2);

  return (
    <div className="view on">
      <div className="hero">
        <div className="hero-title">TikTok Ads · Leads</div>
        <div className="hero-sub" suppressHydrationWarning>
          {rangeLabel} · {client.name} · {formatInt(t.conversions)} leads ·{' '}
          {formatCurrency(t.spend, cur)} invertido · {formatCurrency(t.cpl, cur)} / lead
        </div>
      </div>

      {/* KPIs reales */}
      <div className="kpis">
        <div className="kpi k-green">
          <div className="kpi-lbl">Leads</div>
          <div className="kpi-val">{formatInt(t.conversions)}</div>
          <div className="kpi-bot">
            <span
              className={`kpi-delta ${deltaDirection(data.conversionsDelta) === 'up' ? 'tgu' : 'tgd'}`}
            >
              {formatDelta(data.conversionsDelta)}
            </span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Inversión</div>
          <div className="kpi-val">{formatCurrency(t.spend, cur)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${deltaDirection(data.spendDelta) === 'up' ? 'tgu' : 'tgd'}`}>
              {formatDelta(data.spendDelta)}
            </span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi k-green">
          <div className="kpi-lbl">Costo por lead (CPL)</div>
          <div className="kpi-val">{t.conversions > 0 ? formatCurrency(t.cpl, cur) : '—'}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${cplCheaper ? 'tgu' : 'tgd'}`}>{cplDeltaLabel}</span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">CTR</div>
          <div className="kpi-val">{formatPercent(t.ctr, 2)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${ctrUp ? 'tgu' : 'tgd'}`}>{ctrDeltaLabel}</span>
            <span className="dcmp">vs {previousLabel}</span>
          </div>
        </div>
      </div>

      {/* Métricas secundarias: clics, CPC, CPM, alcance */}
      <div className="kpis" style={{ marginTop: 16 }}>
        <div className="kpi">
          <div className="kpi-lbl">Impresiones</div>
          <div className="kpi-val">{formatNumber(t.impressions)}</div>
          <div className="kpi-bot">
            <span className="dcmp">{formatInt(t.clicks)} clics</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">CPC</div>
          <div className="kpi-val">{t.clicks > 0 ? formatCurrency(t.cpc, cur) : '—'}</div>
          <div className="kpi-bot">
            <span className="dcmp">costo por clic</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">CPM</div>
          <div className="kpi-val">{t.impressions > 0 ? formatCurrency(t.cpm, cur) : '—'}</div>
          <div className="kpi-bot">
            <span className="dcmp">costo por mil impresiones</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Tasa de conversión</div>
          <div className="kpi-val">{formatPercent(t.cvr, 2)}</div>
          <div className="kpi-bot">
            <span className="dcmp">leads ÷ clics</span>
          </div>
        </div>
      </div>

      {/* Rendimiento de video — lo distintivo de TikTok */}
      {v.views > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 4,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <h3 style={{ margin: 0, fontSize: '15px' }}>Rendimiento de los videos</h3>
            <span className="period-pill">{formatNumber(v.views)} reproducciones</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 16, lineHeight: 1.5 }}>
            En TikTok el creativo manda. El <b>gancho (2s)</b> mide cuántos no se fueron en el primer
            segundo; la <b>retención (6s)</b>, cuántos siguen enganchados; y la <b>curva</b> (25→100 %)
            muestra dónde cae la atención. El <b>tiempo promedio</b> es cuántos segundos, en promedio,
            se reproduce cada video. Todo son datos reales del reporte de TikTok.
          </div>

          {/* Resumen: gancho, retención 6s, completas y tiempo promedio */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 16,
            }}
          >
            <VideoStat label="Gancho (vieron 2s)" pct={v.hookRate} abs={v.watched2s} color={TT_PINK} />
            <VideoStat label="Retención (6s)" pct={v.holdRate} abs={v.watched6s} color={TT_CYAN} />
            <VideoStat label="Video completo" pct={v.completionRate} abs={v.completes} color="#22d97a" />
            <WatchTimeStat seconds={v.avgWatchTime} />
          </div>

          {/* Curva de retención completa: del 100 % de reproducciones, cuántos
              quedan en cada hito. Embudo monótono, 100 % dato real. */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', marginBottom: 10 }}>
              Curva de retención
            </div>
            <RetentionCurve v={v} />
          </div>
        </div>
      )}

      {/* Tabla por campaña — dato real */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="dim-tbl-head">
          <div className="dim-tbl-title">
            <div className="dim-tbl-ic">🎵</div>
            <div>
              <div className="dim-tbl-label">Campañas de TikTok</div>
              <div className="dim-tbl-h">Resultados por campaña · ordenado por inversión</div>
            </div>
          </div>
          <span className="period-pill">{data.campaignCount} campañas</span>
        </div>
        <table className="t">
          <thead>
            <tr>
              <th data-cat="dim">Campaña</th>
              <th data-cat="impr">Impr.</th>
              <th data-cat="impr">CTR</th>
              <th data-cat="cost">Inversión</th>
              <th data-cat="conv">Leads</th>
              <th data-cat="cost,conv">CPL</th>
              <th data-cat="conv">Conv. rate</th>
              <th data-cat="cost">Share inv.</th>
            </tr>
          </thead>
          <tbody>
            {data.campaigns.map((c: TikTokCampaignRow) => {
              const share = t.spend > 0 ? c.spend / t.spend : 0;
              return (
                <tr key={c.name}>
                  <td data-cat="dim">
                    <b>{c.name}</b>
                  </td>
                  <td data-cat="impr">{formatNumber(c.impressions)}</td>
                  <td data-cat="impr">{formatPercent(c.ctr, 1)}</td>
                  <td data-cat="cost">{formatCurrency(c.spend, cur)}</td>
                  <td data-cat="conv">{formatInt(c.conversions)}</td>
                  <td data-cat="cost,conv">{c.conversions > 0 ? formatCurrency(c.cpl, cur) : '—'}</td>
                  <td data-cat="conv">{formatPercent(c.cvr, 1)}</td>
                  <td data-cat="cost">
                    <span className="hb">
                      <span
                        className="hb-fill"
                        style={{
                          width: `${Math.max(2, Math.round(share * 100))}%`,
                          background: TT_PINK,
                        }}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr className="t-avg">
              <td data-cat="dim">Total</td>
              <td data-cat="impr">{formatNumber(t.impressions)}</td>
              <td data-cat="impr">{formatPercent(t.ctr, 1)}</td>
              <td data-cat="cost">{formatCurrency(t.spend, cur)}</td>
              <td data-cat="conv">{formatInt(t.conversions)}</td>
              <td data-cat="cost,conv">{t.conversions > 0 ? formatCurrency(t.cpl, cur) : '—'}</td>
              <td data-cat="conv">{formatPercent(t.cvr, 1)}</td>
              <td data-cat="cost" />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Conjuntos de anuncios — retención por ad set */}
      {data.adgroups.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="dim-tbl-head">
            <div className="dim-tbl-title">
              <div className="dim-tbl-ic">🎯</div>
              <div>
                <div className="dim-tbl-label">Conjuntos de anuncios</div>
                <div className="dim-tbl-h">Retención del video por conjunto · ordenado por inversión</div>
              </div>
            </div>
            <span className="period-pill">{data.adgroupCount} conjuntos</span>
          </div>
          <table className="t">
            <thead>
              <tr>
                <th data-cat="dim">Conjunto</th>
                <th data-cat="cost">Inversión</th>
                <th data-cat="conv">Leads</th>
                <th data-cat="cost,conv">CPL</th>
                <th data-cat="impr">Reprod.</th>
                <th data-cat="impr">Gancho 2s</th>
                <th data-cat="impr">Ret. 6s</th>
                <th data-cat="impr">Completo</th>
                <th data-cat="impr">T. prom.</th>
              </tr>
            </thead>
            <tbody>
              {data.adgroups.map((g: TikTokAdGroupRow) => (
                <tr key={g.adgroupId}>
                  <td data-cat="dim">
                    <b>{g.name}</b>
                    <div style={{ fontSize: 10, color: 'var(--mu)' }}>{g.campaignName}</div>
                  </td>
                  <td data-cat="cost">{formatCurrency(g.spend, cur)}</td>
                  <td data-cat="conv">{formatInt(g.conversions)}</td>
                  <td data-cat="cost,conv">{g.conversions > 0 ? formatCurrency(g.cpl, cur) : '—'}</td>
                  <td data-cat="impr">{formatNumber(g.videoViews)}</td>
                  <td data-cat="impr">{g.videoViews > 0 ? formatPercent(g.video.hookRate, 1) : '—'}</td>
                  <td data-cat="impr">{g.videoViews > 0 ? formatPercent(g.video.holdRate, 1) : '—'}</td>
                  <td data-cat="impr">{g.videoViews > 0 ? formatPercent(g.video.completionRate, 1) : '—'}</td>
                  <td data-cat="impr">{g.videoViews > 0 ? `${g.video.avgWatchTime.toFixed(1)} s` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 10, lineHeight: 1.5 }}>
            El <b>gancho (2s)</b> y la <b>retención (6s)</b> se miden sobre las reproducciones del
            conjunto. El <b>tiempo promedio</b> lo reporta TikTok directo. Donde no hubo video,
            aparece «—».
          </div>
        </div>
      )}

      {/* Nota honesta */}
      <div className="card" style={{ marginTop: 20, borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Cómo leer esta vista</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Son las campañas de <b>TikTok Ads</b> medidas como negocio de <b>leads</b>: la métrica que
          manda es <b>leads</b> (conversiones reales del píxel/evento de TikTok) y su <b>costo por lead
          (CPL)</b>. No se muestra ROAS de ventas porque Ofero no es ecommerce. El CTR, CPC y CPM salen
          de los datos crudos del reporte; las tasas de video miden qué tan bien engancha cada creativo.
          Todo proviene de la tabla <code>tiktok_campaigns</code>, que la sincronización llena a diario
          desde la TikTok Marketing API.
        </div>
      </div>
    </div>
  );
}

// Mini-tarjeta de una métrica de video: porcentaje grande + barra + absoluto.
function VideoStat({
  label,
  pct,
  abs,
  color,
}: {
  label: string;
  pct: number;
  abs: number;
  color: string;
}) {
  return (
    <div
      style={{
        background: 'var(--bg3)',
        border: '1px solid var(--b2)',
        borderRadius: 10,
        padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)' }}>{formatPercent(pct, 1)}</div>
      <div className="hb" style={{ marginTop: 8 }}>
        <span
          className="hb-fill"
          style={{ width: `${Math.max(2, Math.round(pct * 100))}%`, background: color }}
        />
      </div>
      <div style={{ fontSize: 10, color: 'var(--mu)', marginTop: 6 }}>
        {formatNumber(abs)} reproducciones
      </div>
    </div>
  );
}

// Tiempo de reproducción promedio (segundos). TikTok lo da directo; no es un
// porcentaje, así que lo mostramos como "X.X s".
function WatchTimeStat({ seconds }: { seconds: number }) {
  return (
    <div
      style={{
        background: 'var(--bg3)',
        border: '1px solid var(--b2)',
        borderRadius: 10,
        padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 6 }}>Tiempo promedio</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)' }}>
        {seconds > 0 ? `${seconds.toFixed(1)} s` : '—'}
      </div>
      <div style={{ fontSize: 10, color: 'var(--mu)', marginTop: 26 }}>
        por reproducción
      </div>
    </div>
  );
}

// Curva de retención: del 100 % de reproducciones, cuántos quedan en cada hito.
// Cada barra es una fracción de las reproducciones (dato real de TikTok).
function RetentionCurve({ v }: { v: TikTokRetention }) {
  const stages: { label: string; pct: number; abs: number }[] = [
    { label: 'Reproducciones', pct: 1, abs: v.views },
    { label: '2 segundos (gancho)', pct: v.hookRate, abs: v.watched2s },
    { label: '6 segundos', pct: v.holdRate, abs: v.watched6s },
    { label: '25 % del video', pct: v.p25Rate, abs: v.watchedP25 },
    { label: '50 % del video', pct: v.p50Rate, abs: v.watchedP50 },
    { label: '75 % del video', pct: v.p75Rate, abs: v.watchedP75 },
    { label: '100 % (completo)', pct: v.completionRate, abs: v.completes },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {stages.map((s) => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 150, fontSize: 11, color: 'var(--mu)', flexShrink: 0 }}>{s.label}</div>
          <div className="hb" style={{ flex: 1 }}>
            <span
              className="hb-fill"
              style={{
                width: `${Math.max(1, Math.round(s.pct * 100))}%`,
                background: `linear-gradient(90deg, ${TT_PINK}, ${TT_CYAN})`,
              }}
            />
          </div>
          <div
            style={{
              width: 96,
              textAlign: 'right',
              fontSize: 11,
              color: 'var(--t1)',
              flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatPercent(s.pct, 1)}
            <span style={{ color: 'var(--mu)', marginLeft: 6 }}>{formatNumber(s.abs)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
