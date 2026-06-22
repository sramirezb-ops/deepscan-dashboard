'use client';

import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useTikTok } from '@/lib/hooks/useTikTok';
import {
  formatCurrency,
  formatInt,
  formatNumber,
  formatPercent,
  formatDelta,
  deltaDirection,
} from '@/lib/utils';
import {
  TT_PINK,
  TT_CYAN,
  TikTokLoading,
  TikTokError,
  TikTokEmpty,
  TikTokHero,
  VideoStat,
  WatchTimeStat,
  RetentionCurve,
} from './tiktokShared';

// ============================================================
// TikTok Ads · OVERVIEW — resumen ejecutivo (Ofero, negocio de LEADS)
// ============================================================
// Vista 1 de 3. Aquí va lo macro: los KPIs del período (leads, inversión, CPL,
// CTR, alcance, frecuencia, etc.) y la curva de retención global de los videos.
// El desglose por campaña/conjunto/anuncio vive en "Resultados por campañas",
// y el detalle de creativos en "Retención de los anuncios". Nada se inventa.
// ============================================================

export function TikTok() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useTikTok(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const previousLabel = formatRangeLabel(previous);
  const cur = client.currency;

  if (loading && !data) return <TikTokLoading clientName={client.name} />;
  if (error) return <TikTokError error={error} />;
  if (!data || data.totals.spend === 0)
    return <TikTokEmpty data={data} clientName={client.name} rangeLabel={rangeLabel} />;

  const t = data.totals;
  const v = data.video;

  const cplCheaper = data.cplDelta <= 0;
  const cplDeltaLabel = (data.cplDelta >= 0 ? '+' : '−') + formatCurrency(Math.abs(data.cplDelta), cur);
  const ctrUp = data.ctrDelta >= 0;
  const ctrDeltaLabel = (data.ctrDelta >= 0 ? '+' : '−') + formatPercent(Math.abs(data.ctrDelta), 2);

  return (
    <div className="view on">
      <TikTokHero
        title="TikTok Ads · Overview"
        sub={
          <>
            {rangeLabel} · {client.name} · {formatInt(t.conversions)} leads ·{' '}
            {formatCurrency(t.spend, cur)} invertido · {formatCurrency(t.cpl, cur)} / lead
          </>
        }
      />

      {/* KPIs principales */}
      <div className="kpis">
        <div className="kpi k-green">
          <div className="kpi-lbl">Leads</div>
          <div className="kpi-val">{formatInt(t.conversions)}</div>
          <div className="kpi-bot">
            <span className={`kpi-delta ${deltaDirection(data.conversionsDelta) === 'up' ? 'tgu' : 'tgd'}`}>
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

      {/* Métricas secundarias: impresiones, alcance, frecuencia, conv. rate */}
      <div className="kpis" style={{ marginTop: 16 }}>
        <div className="kpi">
          <div className="kpi-lbl">Impresiones</div>
          <div className="kpi-val">{formatNumber(t.impressions)}</div>
          <div className="kpi-bot">
            <span className="dcmp">{formatInt(t.clicks)} clics</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Alcance</div>
          <div className="kpi-val">{formatNumber(t.reach)}</div>
          <div className="kpi-bot">
            <span className="dcmp">personas alcanzadas</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Frecuencia</div>
          <div className="kpi-val">{t.reach > 0 ? `${t.frequency.toFixed(2)}×` : '—'}</div>
          <div className="kpi-bot">
            <span className="dcmp">impresiones por persona</span>
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

      {/* Métricas de costo: CPC, CPM */}
      <div className="kpis" style={{ marginTop: 16 }}>
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
          <div className="kpi-lbl">Campañas activas</div>
          <div className="kpi-val">{formatInt(data.campaignCount)}</div>
          <div className="kpi-bot">
            <span className="dcmp">{formatInt(data.adgroupCount)} conjuntos · {formatInt(data.adCount)} anuncios</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Reproducciones</div>
          <div className="kpi-val">{formatNumber(v.views)}</div>
          <div className="kpi-bot">
            <span className="dcmp">vistas de video</span>
          </div>
        </div>
      </div>

      {/* Retención global de los videos */}
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
            <h3 style={{ margin: 0, fontSize: '15px' }}>Retención global de los videos</h3>
            <span className="period-pill">{formatNumber(v.views)} reproducciones</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 16, lineHeight: 1.5 }}>
            El <b>gancho (2s)</b> mide cuántos no se fueron en el primer segundo; la{' '}
            <b>retención (6s)</b>, cuántos siguen enganchados; y la <b>curva</b> (25→100 %) muestra
            dónde cae la atención. Es el promedio de todos los anuncios del período. El detalle por
            creativo está en <b>Retención de los anuncios</b>.
          </div>

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

          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', marginBottom: 10 }}>
              Curva de retención
            </div>
            <RetentionCurve v={v} />
          </div>
        </div>
      )}

      {/* Nota honesta */}
      <div className="card" style={{ marginTop: 20, borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Cómo leer esta vista</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Es el <b>resumen ejecutivo</b> de TikTok Ads como negocio de <b>leads</b>: la métrica que
          manda es <b>leads</b> (conversiones reales del píxel/evento de TikTok) y su <b>costo por
          lead (CPL)</b>. La <b>frecuencia</b> es impresiones ÷ alcance: si sube mucho, el público se
          satura. El desglose campaña → conjunto → anuncio está en <b>Resultados por campañas</b> y el
          rendimiento de cada creativo en <b>Retención de los anuncios</b>. Todo proviene de la tabla{' '}
          <code>tiktok_campaigns</code>, que la sincronización llena a diario desde la TikTok Marketing
          API.
        </div>
      </div>
    </div>
  );
}
