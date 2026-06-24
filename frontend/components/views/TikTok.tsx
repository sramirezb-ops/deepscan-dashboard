'use client';

import type { ReactNode } from 'react';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useTikTok } from '@/lib/hooks/useTikTok';
import type { TikTokCampaignRow, TikTokDailyPoint } from '@/lib/hooks/useTikTok';
import {
  formatCurrency,
  formatInt,
  formatNumber,
  formatPercent,
  formatDelta,
} from '@/lib/utils';
import { TrendChart } from '@/components/ui/TrendChart';
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
  SectionLabel,
  SummaryStat,
  BackToTop,
  summaryGridStyle,
} from './tiktokShared';

// ============================================================
// TikTok Ads · OVERVIEW — reporte ejecutivo y gerencial (Ofero, negocio de LEADS)
// ============================================================
// Vista 1 de 3. Pensada para responder de un vistazo: ¿cómo vamos vs. el período
// anterior, qué se movió y qué retos hay? Todo se DERIVA de datos reales del
// rango (tabla tiktok_campaigns) — nunca se inventan cifras ni superlativos que
// no podamos verificar. El desglose campaña → conjunto → anuncio vive en
// "Resultados por campañas" y el detalle de creativos en "Retención de los
// anuncios".
//
// Estructura (de lo macro a lo táctico):
//   1. Titular ejecutivo  — veredicto + frase con los números que mandan.
//   2. Leads + CPL grandes — la jerarquía: lo que importa, en grande.
//   3. Tira secundaria     — inversión, CTR, alcance, impresiones (con su delta).
//   4. Contexto            — frecuencia, CVR, CPC, CPM, reproducciones, estructura.
//   5. Tendencia diaria    — leads, CPL e inversión día a día.
//   6. Top movimientos     — qué campañas cambiaron más vs. el período anterior.
//   7. Retos detectados    — alertas derivadas del propio dato (sin opinar de más).
//   8. Retención de video  — lo más táctico, abajo.
// ============================================================

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Formatea un delta porcentual (escala 0-100, de calcDelta) acotándolo a
 *  ±1000 %: cuando el período anterior fue casi nulo, el % real se dispara
 *  (p.ej. +2643 %) y confunde más de lo que informa. Misma convención que
 *  `deltaParts` de tiktokShared. */
function fmtGrowth(pct: number): string {
  if (Math.abs(pct) >= 1000) return `${pct > 0 ? '+' : '−'}1000%+`;
  return formatDelta(pct);
}

/** 'YYYY-MM-DD' → '5 jun' (etiqueta corta para los tooltips de tendencia). */
function dayLabel(iso: string): string {
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  return `${d} ${MONTHS_ES[m - 1] ?? ''}`.trim();
}

/** Serie diaria del PERÍODO completo: suma spend/leads/impresiones de todas las
 *  campañas por fecha y re-deriva el CPL de ese día (nunca promedia promedios). */
function periodDaily(campaigns: TikTokCampaignRow[]): TikTokDailyPoint[] {
  const map = new Map<string, { spend: number; conversions: number; impressions: number }>();
  for (const c of campaigns) {
    for (const d of c.daily) {
      const e = map.get(d.date) ?? { spend: 0, conversions: 0, impressions: 0 };
      e.spend += d.spend;
      e.conversions += d.conversions;
      e.impressions += d.impressions;
      map.set(d.date, e);
    }
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, e]) => ({
      date,
      spend: e.spend,
      conversions: e.conversions,
      impressions: e.impressions,
      cpl: e.conversions > 0 ? e.spend / e.conversions : 0,
      reach: 0,
      frequency: 0,
      ctr: 0,
      cpm: 0,
    }));
}

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

  // ¿Hay un período anterior real con el que comparar? (evita falsos "+∞" /
  // "CPL subió" cuando el período previo simplemente no tenía datos).
  const hasPrev = data.campaigns.some((c) => c.prev && c.prev.spend > 0);

  // ── Veredicto del titular: cuenta señales buenas vs. malas (leads y CPL) ──
  const leadsUp = data.conversionsDelta > 0;
  const leadsDown = data.conversionsDelta < 0;
  const cplCheaper = data.cplDelta < 0;
  const cplPricier = data.cplDelta > 0;
  const positives = (leadsUp ? 1 : 0) + (cplCheaper ? 1 : 0);
  const negatives = (leadsDown ? 1 : 0) + (cplPricier ? 1 : 0);

  let verdict: { label: string; color: string; bg: string };
  if (!hasPrev) {
    verdict = { label: 'Primer período', color: 'var(--mu)', bg: 'rgba(255,255,255,0.05)' };
  } else if (positives > negatives) {
    verdict = { label: 'Mejorando', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' };
  } else if (negatives > positives) {
    verdict = { label: 'Requiere atención', color: '#f87171', bg: 'rgba(248,113,113,0.12)' };
  } else {
    verdict = { label: 'Estable', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' };
  }

  const cplDeltaLabel = (data.cplDelta >= 0 ? '+' : '−') + formatCurrency(Math.abs(data.cplDelta), cur);
  const ctrUp = data.ctrDelta >= 0;
  const leadsDir = leadsUp ? 'subieron' : leadsDown ? 'bajaron' : 'se mantuvieron';
  const cplDir = cplCheaper ? 'bajó' : cplPricier ? 'subió' : 'se mantuvo';

  // ── Tendencia diaria del período (leads, CPL, inversión) ──
  const daily = periodDaily(data.campaigns);
  const labels = daily.map((d) => dayLabel(d.date));
  const leadsSeries = daily.map((d) => d.conversions);
  const cplSeries = daily.map((d) => d.cpl);
  const spendSeries = daily.map((d) => d.spend);

  // ── Top movimientos: campañas con mayor cambio de leads vs. período anterior ──
  const movers = hasPrev
    ? data.campaigns
        .filter((c) => c.prev && (c.prev.conversions > 0 || c.conversions > 0))
        .map((c) => {
          const prevLeads = c.prev!.conversions;
          const leadsChange = c.conversions - prevLeads;
          const leadsPct = prevLeads > 0 ? ((c.conversions - prevLeads) / prevLeads) * 100 : null;
          const cplChange = c.prev!.cpl > 0 && c.cpl > 0 ? c.cpl - c.prev!.cpl : null;
          return { c, leadsChange, leadsPct, cplChange };
        })
        .sort((a, b) => Math.abs(b.leadsChange) - Math.abs(a.leadsChange))
        .slice(0, 5)
    : [];

  // ── Retos detectados: alertas derivadas SOLO del dato real ──
  const challenges: { title: string; detail: ReactNode }[] = [];
  if (t.frequency >= 3) {
    challenges.push({
      title: 'Frecuencia alta',
      detail: (
        <>
          Cada persona vio el anuncio <b>{t.frequency.toFixed(2)} veces</b> en promedio (impresiones ÷
          alcance). Por encima de 3× el público empieza a saturarse: conviene refrescar creativos o
          ampliar la segmentación.
        </>
      ),
    });
  }
  if (hasPrev && cplPricier) {
    challenges.push({
      title: 'El costo por lead subió',
      detail: (
        <>
          El CPL pasó a <b>{formatCurrency(t.cpl, cur)}</b> ({cplDeltaLabel} vs. {previousLabel}). Vale
          la pena revisar qué conjuntos están encareciendo el lead.
        </>
      ),
    });
  }
  if (hasPrev && data.ctrDelta < 0) {
    challenges.push({
      title: 'El CTR cayó',
      detail: (
        <>
          El CTR bajó a <b>{formatPercent(t.ctr, 2)}</b> ({(data.ctrDelta >= 0 ? '+' : '−') +
            formatPercent(Math.abs(data.ctrDelta), 2)}{' '}
          vs. {previousLabel}). Suele ser señal de fatiga del creativo.
        </>
      ),
    });
  }
  if (hasPrev && leadsDown) {
    challenges.push({
      title: 'Los leads bajaron',
      detail: (
        <>
          Se generaron <b>{formatInt(t.conversions)} leads</b> ({fmtGrowth(data.conversionsDelta)} vs.{' '}
          {previousLabel}). Revisa si bajó la inversión o el rendimiento de las campañas clave.
        </>
      ),
    });
  }
  if (v.views > 0 && v.hookRate < 0.3) {
    challenges.push({
      title: 'Gancho débil en los videos',
      detail: (
        <>
          Solo el <b>{formatPercent(v.hookRate, 1)}</b> de las reproducciones pasó de los 2 segundos. Un
          gancho por debajo del 30 % deja mucho presupuesto en gente que se va al instante.
        </>
      ),
    });
  }
  if (daily.length < 2) {
    challenges.push({
      title: 'Pocos días con datos',
      detail: (
        <>
          El rango tiene <b>{daily.length === 1 ? '1 día' : 'menos de 2 días'}</b> con actividad; aún no
          alcanza para leer una tendencia confiable. Amplía el período para un panorama más estable.
        </>
      ),
    });
  }

  return (
    <div className="view on">
      <TikTokHero
        title="TikTok Ads · Overview"
        sub={
          <>
            {rangeLabel} · {client.name} · reporte ejecutivo del rendimiento como negocio de leads
          </>
        }
      />

      {/* 1 · Titular ejecutivo ───────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 4 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ flex: '1 1 320px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.25 }}>
              {formatInt(t.conversions)} leads a {t.conversions > 0 ? formatCurrency(t.cpl, cur) : '—'} por
              lead
            </div>
            <div style={{ fontSize: 13, color: 'var(--mu)', marginTop: 4 }}>
              {formatCurrency(t.spend, cur)} invertidos en {rangeLabel}
            </div>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 10, lineHeight: 1.55 }}>
              {hasPrev ? (
                <>
                  Frente a {previousLabel}, los leads <b>{leadsDir}</b> {fmtGrowth(data.conversionsDelta)}{' '}
                  y el costo por lead <b>{cplDir}</b> {cplDeltaLabel}.
                </>
              ) : (
                <>Es el primer período con datos: aún no hay un período anterior con el cual comparar.</>
              )}
            </div>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: verdict.color,
              background: verdict.bg,
              border: `1px solid ${verdict.color}`,
              borderRadius: 999,
              padding: '5px 13px',
              whiteSpace: 'nowrap',
            }}
          >
            {verdict.label}
          </span>
        </div>
      </div>

      {/* 2 · Leads + CPL en grande ───────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 12,
          marginTop: 12,
        }}
      >
        <BigKpi
          label="Leads generados"
          value={formatInt(t.conversions)}
          accent={TT_CYAN}
          deltaText={hasPrev ? `${fmtGrowth(data.conversionsDelta)} vs. ${previousLabel}` : 'sin período anterior'}
          deltaColor={!hasPrev ? 'var(--mu)' : leadsUp ? '#4ade80' : leadsDown ? '#f87171' : 'var(--mu)'}
        />
        <BigKpi
          label="Costo por lead (CPL)"
          value={t.conversions > 0 ? formatCurrency(t.cpl, cur) : '—'}
          accent={TT_PINK}
          deltaText={hasPrev ? `${cplDeltaLabel} vs. ${previousLabel}` : 'sin período anterior'}
          deltaColor={!hasPrev ? 'var(--mu)' : cplCheaper ? '#4ade80' : cplPricier ? '#f87171' : 'var(--mu)'}
        />
      </div>

      {/* 3 · Tira secundaria con delta (inversión, CTR, alcance, impresiones) ─ */}
      <div style={{ ...summaryGridStyle, marginTop: 12 }}>
        <SummaryStat
          label="Inversión"
          value={formatCurrency(t.spend, cur)}
          delta={hasPrev ? data.spendDelta / 100 : null}
          good="neutral"
        />
        <SummaryStat
          label="CTR"
          value={formatPercent(t.ctr, 2)}
          delta={hasPrev ? data.ctrDelta : null}
          good="up"
          fmtDelta={(x) => formatPercent(x, 2)}
        />
        <SummaryStat
          label="Alcance"
          value={formatNumber(t.reach)}
          delta={hasPrev ? data.reachDelta / 100 : null}
          good="up"
        />
        <SummaryStat
          label="Impresiones"
          value={formatNumber(t.impressions)}
          delta={hasPrev ? data.impressionsDelta / 100 : null}
          good="up"
        />
      </div>

      {/* 4 · Contexto (sin comparación: solo lectura del período) ─────────── */}
      <div className="kpis" style={{ marginTop: 12 }}>
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
          <div className="kpi-lbl">Reproducciones</div>
          <div className="kpi-val">{formatNumber(v.views)}</div>
          <div className="kpi-bot">
            <span className="dcmp">vistas de video</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Estructura activa</div>
          <div className="kpi-val">{formatInt(data.campaignCount)}</div>
          <div className="kpi-bot">
            <span className="dcmp">
              {formatInt(data.adgroupCount)} conjuntos · {formatInt(data.adCount)} anuncios
            </span>
          </div>
        </div>
      </div>

      {/* 5 · Tendencia diaria ────────────────────────────────────────────── */}
      <SectionLabel style={{ margin: '24px 0 10px' }}>Tendencia diaria</SectionLabel>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
        }}
      >
        <TrendChart
          title="Leads por día"
          headline={formatInt(t.conversions)}
          sub="total del período"
          points={leadsSeries}
          labels={labels}
          color={TT_CYAN}
          format={(n) => formatInt(n)}
        />
        <TrendChart
          title="CPL por día"
          headline={t.conversions > 0 ? formatCurrency(t.cpl, cur) : '—'}
          sub="promedio del período"
          points={cplSeries}
          labels={labels}
          color={TT_PINK}
          format={(n) => formatCurrency(n, cur)}
        />
        <TrendChart
          title="Inversión por día"
          headline={formatCurrency(t.spend, cur)}
          sub="total del período"
          points={spendSeries}
          labels={labels}
          color="#a78bfa"
          format={(n) => formatCurrency(n, cur)}
        />
      </div>

      {/* 6 · Top movimientos por campaña ──────────────────────────────────── */}
      <SectionLabel style={{ margin: '24px 0 10px' }}>Top movimientos por campaña</SectionLabel>
      {movers.length > 0 ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {movers.map(({ c, leadsChange, leadsPct, cplChange }, i) => {
            const up = leadsChange > 0;
            const flat = leadsChange === 0;
            const arrow = up ? '▲' : flat ? '■' : '▼';
            const color = flat ? 'var(--mu)' : up ? '#4ade80' : '#f87171';
            return (
              <div
                key={c.campaignId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--b2)',
                }}
              >
                <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--t1)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {c.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 2 }}>
                    {formatInt(c.conversions)} leads ·{' '}
                    {c.conversions > 0 ? `${formatCurrency(c.cpl, cur)} / lead` : 'sin leads'} ·{' '}
                    {formatCurrency(c.spend, cur)} invertido
                  </div>
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color }}>
                    {arrow} {up ? '+' : ''}
                    {formatInt(leadsChange)} leads
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 2 }}>
                    {leadsPct != null
                      ? Math.abs(leadsPct) >= 1000
                        ? `${leadsPct > 0 ? '+' : '−'}1000%+`
                        : `${leadsPct >= 0 ? '+' : ''}${leadsPct.toFixed(0)}%`
                      : 'campaña nueva'}
                    {cplChange != null && (
                      <>
                        {' · '}CPL {cplChange <= 0 ? '−' : '+'}
                        {formatCurrency(Math.abs(cplChange), cur)}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card" style={{ borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
          <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
            Sin período anterior con datos: cuando exista una comparación, aquí verás las campañas que
            más cambiaron en leads.
          </div>
        </div>
      )}

      {/* 7 · Retos detectados ─────────────────────────────────────────────── */}
      <SectionLabel style={{ margin: '24px 0 10px' }}>Retos detectados</SectionLabel>
      {challenges.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 12,
          }}
        >
          {challenges.map((ch, i) => (
            <div
              key={i}
              className="card"
              style={{ borderLeft: '3px solid #fbbf24', display: 'flex', gap: 10, alignItems: 'flex-start' }}
            >
              <span style={{ fontSize: 16, lineHeight: 1.2, color: '#fbbf24' }}>⚠</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>
                  {ch.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.55 }}>{ch.detail}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ borderLeft: '3px solid #4ade80', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 16, lineHeight: 1.2, color: '#4ade80' }}>✓</span>
          <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.55 }}>
            Sin alertas: frecuencia, CPL, CTR, leads y gancho de video están en rango saludable para el
            período.
          </div>
        </div>
      )}

      {/* 8 · Retención global de los videos (lo más táctico, abajo) ───────── */}
      {v.views > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
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
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Cómo leer este reporte</h3>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Es el <b>resumen ejecutivo</b> de TikTok Ads como negocio de <b>leads</b>: manda la cantidad de{' '}
          <b>leads</b> (conversiones reales del píxel/evento de TikTok) y su <b>costo por lead (CPL)</b>.
          El <b>titular</b>, los <b>movimientos</b> y los <b>retos</b> se calculan automáticamente a
          partir del propio dato del rango — no hay cifras inventadas ni superlativos que no podamos
          verificar. El desglose campaña → conjunto → anuncio está en <b>Resultados por campañas</b> y el
          rendimiento de cada creativo en <b>Retención de los anuncios</b>. Todo proviene de la tabla{' '}
          <code>tiktok_campaigns</code>, que la sincronización llena a diario desde la TikTok Marketing
          API.
        </div>
      </div>

      <BackToTop />
    </div>
  );
}

// KPI grande para la jerarquía Leads + CPL del reporte ejecutivo.
function BigKpi({
  label,
  value,
  accent,
  deltaText,
  deltaColor,
}: {
  label: string;
  value: string;
  accent: string;
  deltaText: string;
  deltaColor: string;
}) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${accent}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 12, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--t1)', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: deltaColor, fontVariantNumeric: 'tabular-nums' }}>
        {deltaText}
      </div>
    </div>
  );
}
