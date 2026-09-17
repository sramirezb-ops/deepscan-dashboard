'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { HeroHead } from '@/components/ui/BrandLogo';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useGA4 } from '@/lib/hooks/useGA4';
import { useGA4Pages } from '@/lib/hooks/useGA4Pages';
import { useGA4Cities } from '@/lib/hooks/useGA4Cities';
import { useGA4Funnel } from '@/lib/hooks/useGA4Funnel';
import { useGA4Routes } from '@/lib/hooks/useGA4Routes';
import { EmptyState } from '@/components/ui/EmptyState';
import { ComparisonAreaChart } from '@/components/ui/ComparisonAreaChart';
import { GA4Funnel } from '@/components/views/GA4Funnel';
import { formatInt, formatNumber, formatPercentRaw } from '@/lib/utils';

// ============================================================
// Analytics · GA4 (rediseño "ojo quirúrgico")
// ============================================================
// Deja de ser un clon de Looker: da un VEREDICTO (el tráfico pago convierte
// peor que el orgánico, Cross-network es la joya, y hay fugas de medición) y
// un explorador con semáforo para diagnosticar a detalle:
//   ZONA 1 — Diagnóstico + KPIs + acciones (Escalar/Revisar/Arreglar medición).
//   ZONA 2 — Gráficas acumuladas (tráfico + eventos clave, actual vs anterior),
//            Funnel de leads a color, y explorador con pestañas Canales ·
//            Páginas (conv. por producto) · Entrada · Ciudades · Eventos.
// GA4 mide leads/engagement (no dinero: es lead-gen). Todo dinámico por fecha.
// ============================================================

const GOOD = 'var(--up)';
const WARN = 'var(--warn)';
const BAD = 'var(--dn)';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ''}`;
}
// "485875757 / Organic Search" → "Organic Search"
const cleanChannel = (s: string) => s.replace(/^\d+\s*\/\s*/, '').trim() || s;
const convDot = (cr: number, avg: number) => (cr >= avg * 1.2 ? GOOD : cr >= avg * 0.8 ? WARN : BAD);
const bounceDot = (b: number) => (b < 40 ? GOOD : b < 60 ? WARN : BAD);

type Tab = 'ch' | 'pg' | 'ld' | 'ci' | 'ev';
type SortDir = 'asc' | 'desc';

export function GA4() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useGA4(client.id, range, previous);
  const pagesR = useGA4Pages(client.id, range, previous);
  const citiesR = useGA4Cities(client.id, range, previous);
  const funnelR = useGA4Funnel(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);

  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>Cargando datos de GA4 de {client.name}…</div>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="view on">
        <div className="card" style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}>
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>Error cargando GA4</div>
          <div style={{ fontSize: 12, color: 'var(--mu)' }}>{error}</div>
        </div>
      </div>
    );
  }
  if (!data || data.totals.sessions === 0) {
    return (
      <EmptyState icon="📊" title="Sin datos de GA4 en este período"
        message={<>No hay datos de Google Analytics 4 para {client.name} entre <b>{rangeLabel}</b>.</>}
        hint="Prueba ampliar el rango de fechas con el filtro de arriba." />
    );
  }

  const t = data.totals;
  const labels = data.series.map((p) => shortDate(p.date));
  const labelsPrev = data.seriesPrev.map((p) => shortDate(p.date));
  const avgConv = t.sessions > 0 ? (t.conversions / t.sessions) * 100 : 0;
  const newPct = t.users > 0 ? (t.newUsers / t.users) * 100 : 0;

  // ── Diagnóstico de canales ──
  const channels = data.sources.map((s) => ({
    name: cleanChannel(s.sourceMedium),
    sessions: s.sessions,
    conversions: s.conversions,
    cr: s.sessions > 0 ? (s.conversions / s.sessions) * 100 : 0,
  }));
  // El "canal a escalar" debe ser uno PAGABLE (donde se puede meter presupuesto),
  // no "Unassigned" ni "Direct" ni "(not set)" que son huecos de atribución.
  const scalable = [...channels]
    .filter((c) => /paid|cross-network|display|\bads\b|cpc|video/i.test(c.name) && c.sessions >= 1000)
    .sort((a, b) => b.cr - a.cr);
  const bestChannel = scalable[0];
  const organic = channels.find((c) => /organic search/i.test(c.name));
  const worstPaid = [...channels].filter((c) => /paid/i.test(c.name)).sort((a, b) => a.cr - b.cr)[0];

  // Fuga de medición: clics a WhatsApp NO marcados como evento clave.
  let nonKeyWhatsApp = 0;
  if (funnelR.data) {
    for (const [name, agg] of funnelR.data.byName.entries()) {
      if (/whatsapp/i.test(name) && !/flotante/i.test(name) && name !== 'clic_whatsapp' && !agg.isKeyEvent) {
        nonKeyWhatsApp += agg.count;
      }
    }
  }
  const brokenLanding = (pagesR.data?.landings ?? []).find((l) => /not set|no definido|\(/.test(l.landing) && l.bounceRate > 0.9);

  return (
    <div className="view on">
      <div className="hero">
        <HeroHead brand="google-analytics">Google Analytics 4</HeroHead>
        <div className="hero-sub" suppressHydrationWarning>
          Comportamiento web · {client.name} · {rangeLabel} · {formatNumber(t.sessions)} sesiones
        </div>
      </div>

      {/* ═══ ZONA 1 · DIAGNÓSTICO ═══ */}
      <div className="card ttc-z1" style={{ padding: '20px 22px', marginTop: 4 }}>
        <div className="ttc-head">
          <div>
            <div style={slabel}>Diagnóstico del período</div>
            <div style={headline}>
              {formatPercentRaw(avgConv, 1)} de las sesiones llegan a lead
              {organic && worstPaid && worstPaid.cr < organic.cr ? (
                <> — pero el <span style={{ color: BAD }}>tráfico pago convierte peor</span> que el orgánico</>
              ) : null}
            </div>
            <div style={headSub}>
              {organic ? <>Organic ({formatPercentRaw((organic.sessions / t.sessions) * 100, 0)} del tráfico) convierte {formatPercentRaw(organic.cr, 1)}. </> : null}
              {bestChannel ? <><b>{bestChannel.name} ({formatPercentRaw(bestChannel.cr, 1)}) es el canal pago más eficiente</b>. </> : null}
              Y hay fugas de medición que esconden leads reales.
            </div>
          </div>
          <div className="ret-kpis">
            <Kpi label="Sesiones" value={formatNumber(t.sessions)} delta={data.sessionsDelta} good />
            <Kpi label="Usuarios" value={formatNumber(t.users)} delta={data.usersDelta} good />
            <Kpi label="Eventos clave" value={formatInt(t.conversions)} delta={data.conversionsDelta} good />
            <Kpi label="Conv. a lead" value={formatPercentRaw(avgConv, 1)} sub="evento/sesión" />
            <Kpi label="Rebote" value={formatPercentRaw(t.bounceRate * 100, 1)} sub="ponderado" />
            <Kpi label="Nuevos" value={formatPercentRaw(newPct, 0)} sub="del total" />
          </div>
        </div>
        <div className="ttc-acts">
          <ActionStrip color={GOOD} title="Escalar" big={bestChannel ? `${bestChannel.name}` : '—'} lab={bestChannel ? `${formatPercentRaw(bestChannel.cr, 1)} conv · súbele presupuesto` : ''} small />
          <ActionStrip color={WARN} title="Revisar" big={worstPaid ? `${worstPaid.name}` : 'Landing de pago'} lab={worstPaid ? `${formatPercentRaw(worstPaid.cr, 1)} conv · alinear página` : 'rebote alto'} small />
          <ActionStrip color={BAD} title="Arreglar medición" big={nonKeyWhatsApp > 0 ? formatInt(nonKeyWhatsApp) : '—'} lab="clics WhatsApp sin marcar como clave" />
        </div>
      </div>

      {/* ═══ GRÁFICAS ACUMULADAS ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 16 }}>
        <ComparisonAreaChart
          title="Crecimiento del tráfico (acumulado)" headline={formatNumber(t.sessions)}
          sub={`Sesiones · ${rangeLabel} vs anterior`}
          current={data.series.map((p) => p.sessions)} previous={data.seriesPrev.map((p) => p.sessions)}
          labelsCurrent={labels} labelsPrevious={labelsPrev} color="#4285F4" format={formatNumber} />
        <ComparisonAreaChart
          title="Eventos clave · leads (acumulado)" headline={formatInt(t.conversions)}
          sub={`Eventos clave · ${rangeLabel} vs anterior`}
          current={data.series.map((p) => p.conversions)} previous={data.seriesPrev.map((p) => p.conversions)}
          labelsCurrent={labels} labelsPrevious={labelsPrev} color="#34A853" format={formatInt} />
      </div>

      {/* ═══ FUNNEL ═══ */}
      <GA4Funnel clientId={client.id} range={range} previous={previous} totals={t} totalsPrev={data.totalsPrev} />

      {/* ═══ EXPLORADOR ═══ */}
      <div style={{ ...slabel, margin: '24px 0 10px' }}>El desglose quirúrgico</div>
      <Explorer
        avgConv={avgConv}
        channels={channels}
        pages={pagesR.data?.pages ?? []}
        landings={pagesR.data?.landings ?? []}
        cities={citiesR.data?.cities ?? []}
        events={funnelR.data ? Array.from(funnelR.data.byName.entries()).map(([name, a]) => ({ name, count: a.count, key: a.isKeyEvent })) : []}
        totalSessions={t.sessions}
      />

      {/* ═══ EXPLORACIÓN DE RUTA (1 salto) ═══ */}
      <div style={{ ...slabel, margin: '24px 0 10px' }}>Exploración de ruta · patrones de navegación</div>
      <RoutesSection clientId={client.id} />

      <div className="card" style={{ marginTop: 16, borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          Dato real de GA4, dinámico por fecha. GA4 mide <b>leads/engagement</b>, no dinero (es lead-gen; el clic a WhatsApp es el evento clave). El <b>semáforo</b> compara la conversión de cada fila contra el promedio de la cuenta ({formatPercentRaw(avgConv, 1)}). Los hallazgos de <b>medición</b> (eventos sin marcar como clave, "(not set)", "Unassigned") son de configuración de GA4.
          {brokenLanding ? <> Ojo: la entrada <code>{brokenLanding.landing}</code> rebota {formatPercentRaw(brokenLanding.bounceRate * 100, 0)} — probable tracking roto.</> : null}
        </div>
      </div>
    </div>
  );
}

// ── Explorador con pestañas ──────────────────────────────────────────────────
interface ChRow { name: string; sessions: number; conversions: number; cr: number; }
function Explorer({
  avgConv, channels, pages, landings, cities, events, totalSessions,
}: {
  avgConv: number;
  channels: ChRow[];
  pages: { path: string; title: string; views: number; sessions: number; bounceRate: number; conversions: number }[] | any[];
  landings: { landing: string; sessions: number; bounceRate: number; conversions: number }[] | any[];
  cities: { city: string; sessions: number; conversions: number }[] | any[];
  events: { name: string; count: number; key: boolean }[];
  totalSessions: number;
}) {
  const [tab, setTab] = useState<Tab>('ch');
  const [sortCol, setSortCol] = useState<string>('');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const onSort = (col: string) => {
    if (col === sortCol) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('desc'); }
  };
  const changeTab = (n: Tab) => { setTab(n); setSortCol(''); setSortDir('desc'); };
  const sortBy = <T,>(arr: T[], get: (r: T) => number, defaultDesc = true): T[] => {
    if (!sortCol) return arr;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...arr].sort((a, b) => (get(a) - get(b)) * dir);
  };

  const meta: Record<Tab, { label: string; legend: string }> = {
    ch: { label: 'Canales', legend: `Semáforo conv. vs promedio ${formatPercentRaw(avgConv, 1)}` },
    pg: { label: 'Páginas (conv. por producto)', legend: 'Conv % = eventos ÷ vistas · semáforo por rebote' },
    ld: { label: 'Entrada', legend: 'Semáforo por rebote' },
    ci: { label: 'Ciudades', legend: `Semáforo conv. vs promedio ${formatPercentRaw(avgConv, 1)}` },
    ev: { label: 'Eventos', legend: '★ = evento clave · rojo = clic a WhatsApp NO contado como clave' },
  };

  return (
    <>
      <div style={expHead}>
        <div style={tabsWrap}>
          {(Object.keys(meta) as Tab[]).map((k) => (
            <button key={k} onClick={() => changeTab(k)} style={tabBtn(tab === k)}>{meta[k].label}</button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: 'var(--mu)' }}>{meta[tab].legend}</span>
      </div>
      <div style={tblWrap}>
        <table className="t ttc-table" style={{ minWidth: 720 }}>
          {tab === 'ch' && <ChannelsTable rows={channels} avgConv={avgConv} total={totalSessions} sortBy={sortBy} sortCol={sortCol} sortDir={sortDir} onSort={onSort} />}
          {tab === 'pg' && <PagesTable rows={pages} sortBy={sortBy} sortCol={sortCol} sortDir={sortDir} onSort={onSort} avgConv={avgConv} />}
          {tab === 'ld' && <LandingsTable rows={landings} sortBy={sortBy} sortCol={sortCol} sortDir={sortDir} onSort={onSort} avgConv={avgConv} />}
          {tab === 'ci' && <CitiesTable rows={cities} avgConv={avgConv} total={totalSessions} sortBy={sortBy} sortCol={sortCol} sortDir={sortDir} onSort={onSort} />}
          {tab === 'ev' && <EventsTable rows={events} sortBy={sortBy} sortCol={sortCol} sortDir={sortDir} onSort={onSort} />}
        </table>
      </div>
      <div style={{ fontSize: 11, color: 'var(--mu)', margin: '10px 2px 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span><Dot c={GOOD} /> mejor</span><span><Dot c={WARN} /> promedio</span><span><Dot c={BAD} /> peor</span>
        <span>· clic en una columna para ordenar</span>
      </div>
    </>
  );
}

type SortFn = <T,>(arr: T[], get: (r: T) => number) => T[];
interface TP { sortBy: SortFn; sortCol: string; sortDir: SortDir; onSort: (c: string) => void; }
function Th({ col, sortCol, sortDir, onSort, children, first }: { col?: string; sortCol: string; sortDir: SortDir; onSort: (c: string) => void; children: ReactNode; first?: boolean }) {
  if (!col) return <th className="nos" style={{ textAlign: first ? 'left' : 'right' }}>{children}</th>;
  return (
    <th className="th-sort" data-sort={sortCol === col ? sortDir : 'none'} role="button" tabIndex={0}
      style={{ textAlign: first ? 'left' : 'right' }}
      onClick={() => onSort(col)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(col); } }}>
      {children}
    </th>
  );
}
function NameCell({ name, dot, sub, flag, flagColor }: { name: string; dot: string; sub?: string; flag?: string; flagColor?: string }) {
  return (
    <td>
      <div style={nameCell}>
        <span style={{ ...dotStyle, background: dot }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ ...ellipsis, fontWeight: 600, maxWidth: 300 }} title={name}>
            {name}{flag ? <span style={{ fontSize: 9, fontWeight: 700, color: flagColor || BAD, border: `1px solid ${flagColor || BAD}`, borderRadius: 5, padding: '1px 5px', marginLeft: 6 }}>{flag}</span> : null}
          </div>
          {sub ? <div style={subStyle}>{sub}</div> : null}
        </div>
      </div>
    </td>
  );
}
function Bar({ v, max }: { v: number; max: number }) {
  return (
    <td className="num" style={{ position: 'relative' }}>
      <span style={{ position: 'relative', zIndex: 1 }}>{formatNumber(v)}</span>
      <div style={{ position: 'absolute', left: 10, bottom: 3, height: 3, width: `calc((100% - 20px) * ${max > 0 ? v / max : 0})`, background: 'var(--acc)', opacity: 0.5, borderRadius: 2, zIndex: 0 }} />
    </td>
  );
}

function ChannelsTable({ rows, avgConv, total, sortBy, sortCol, sortDir, onSort }: TP & { rows: ChRow[]; avgConv: number; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.sessions));
  const sorted = sortBy(rows, (r) => (sortCol === 'cr' ? r.cr : sortCol === 'ev' ? r.conversions : r.sessions));
  const view = sortCol ? sorted : [...rows].sort((a, b) => b.sessions - a.sessions);
  return (
    <>
      <thead><tr>
        <Th first sortCol={sortCol} sortDir={sortDir} onSort={onSort}>Canal</Th>
        <Th col="s" sortCol={sortCol} sortDir={sortDir} onSort={onSort}>Sesiones</Th>
        <th className="nos" style={{ textAlign: 'right' }}>Share</th>
        <Th col="ev" sortCol={sortCol} sortDir={sortDir} onSort={onSort}>Eventos</Th>
        <Th col="cr" sortCol={sortCol} sortDir={sortDir} onSort={onSort}>Conv %</Th>
      </tr></thead>
      <tbody>
        {view.map((r) => {
          const flag = /unassigned/i.test(r.name) ? 'sin UTM' : undefined;
          return (
            <tr key={r.name}>
              <NameCell name={r.name} dot={convDot(r.cr, avgConv)} flag={flag} flagColor={WARN} />
              <Bar v={r.sessions} max={max} />
              <td className="num">{formatPercentRaw((r.sessions / total) * 100, 1)}</td>
              <td className="num">{formatInt(r.conversions)}</td>
              <td className="num" style={{ color: convDot(r.cr, avgConv), fontWeight: 800 }}>{formatPercentRaw(r.cr, 1)}</td>
            </tr>
          );
        })}
      </tbody>
    </>
  );
}
function PagesTable({ rows, sortBy, sortCol, sortDir, onSort, avgConv }: TP & { rows: any[]; avgConv: number }) {
  const max = Math.max(1, ...rows.map((r) => r.views));
  const get = (r: any) => (sortCol === 'cr' ? (r.views > 0 ? r.conversions / r.views * 100 : 0) : sortCol === 'ev' ? r.conversions : sortCol === 'b' ? r.bounceRate : r.views);
  const view = sortCol ? sortBy(rows, get) : [...rows].sort((a, b) => b.views - a.views);
  return (
    <>
      <thead><tr>
        <Th first sortCol={sortCol} sortDir={sortDir} onSort={onSort}>Página</Th>
        <Th col="v" sortCol={sortCol} sortDir={sortDir} onSort={onSort}>Vistas</Th>
        <Th col="ev" sortCol={sortCol} sortDir={sortDir} onSort={onSort}>Eventos</Th>
        <Th col="cr" sortCol={sortCol} sortDir={sortDir} onSort={onSort}>Conv % (ev/vista)</Th>
        <Th col="b" sortCol={sortCol} sortDir={sortDir} onSort={onSort}>Rebote</Th>
      </tr></thead>
      <tbody>
        {view.slice(0, 25).map((r) => {
          const cr = r.views > 0 ? (r.conversions / r.views) * 100 : 0;
          const b = r.bounceRate * 100;
          return (
            <tr key={r.path}>
              <NameCell name={r.path} dot={bounceDot(b)} sub={r.title} />
              <Bar v={r.views} max={max} />
              <td className="num">{formatInt(r.conversions)}</td>
              <td className="num" style={{ color: convDot(cr, avgConv), fontWeight: 800 }}>{formatPercentRaw(cr, 1)}</td>
              <td className="num" style={{ color: bounceDot(b), fontWeight: 700 }}>{formatPercentRaw(b, 0)}</td>
            </tr>
          );
        })}
      </tbody>
    </>
  );
}
function LandingsTable({ rows, sortBy, sortCol, sortDir, onSort, avgConv }: TP & { rows: any[]; avgConv: number }) {
  const max = Math.max(1, ...rows.map((r) => r.sessions));
  const get = (r: any) => (sortCol === 'cr' ? (r.sessions > 0 ? r.conversions / r.sessions * 100 : 0) : sortCol === 'b' ? r.bounceRate : r.sessions);
  const view = sortCol ? sortBy(rows, get) : [...rows].sort((a, b) => b.sessions - a.sessions);
  return (
    <>
      <thead><tr>
        <Th first sortCol={sortCol} sortDir={sortDir} onSort={onSort}>Entrada</Th>
        <Th col="s" sortCol={sortCol} sortDir={sortDir} onSort={onSort}>Sesiones</Th>
        <Th col="cr" sortCol={sortCol} sortDir={sortDir} onSort={onSort}>Conv %</Th>
        <Th col="b" sortCol={sortCol} sortDir={sortDir} onSort={onSort}>Rebote</Th>
      </tr></thead>
      <tbody>
        {view.slice(0, 25).map((r) => {
          const cr = r.sessions > 0 ? (r.conversions / r.sessions) * 100 : 0;
          const b = r.bounceRate * 100;
          const flag = b > 90 ? 'roto' : undefined;
          return (
            <tr key={r.landing}>
              <NameCell name={r.landing} dot={bounceDot(b)} flag={flag} />
              <Bar v={r.sessions} max={max} />
              <td className="num" style={{ color: convDot(cr, avgConv), fontWeight: 800 }}>{formatPercentRaw(cr, 1)}</td>
              <td className="num" style={{ color: bounceDot(b), fontWeight: 700 }}>{formatPercentRaw(b, 0)}</td>
            </tr>
          );
        })}
      </tbody>
    </>
  );
}
function CitiesTable({ rows, avgConv, total, sortBy, sortCol, sortDir, onSort }: TP & { rows: any[]; avgConv: number; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.sessions));
  const get = (r: any) => (sortCol === 'cr' ? (r.sessions > 0 ? r.conversions / r.sessions * 100 : 0) : r.sessions);
  const view = sortCol ? sortBy(rows, get) : [...rows].sort((a, b) => b.sessions - a.sessions);
  return (
    <>
      <thead><tr>
        <Th first sortCol={sortCol} sortDir={sortDir} onSort={onSort}>Ciudad</Th>
        <Th col="s" sortCol={sortCol} sortDir={sortDir} onSort={onSort}>Sesiones</Th>
        <th className="nos" style={{ textAlign: 'right' }}>Share</th>
        <Th col="cr" sortCol={sortCol} sortDir={sortDir} onSort={onSort}>Conv %</Th>
      </tr></thead>
      <tbody>
        {view.slice(0, 25).map((r) => {
          const cr = r.sessions > 0 ? (r.conversions / r.sessions) * 100 : 0;
          return (
            <tr key={r.city}>
              <NameCell name={r.city} dot={convDot(cr, avgConv)} />
              <Bar v={r.sessions} max={max} />
              <td className="num">{formatPercentRaw((r.sessions / total) * 100, 1)}</td>
              <td className="num" style={{ color: convDot(cr, avgConv), fontWeight: 800 }}>{formatPercentRaw(cr, 1)}</td>
            </tr>
          );
        })}
      </tbody>
    </>
  );
}
function EventsTable({ rows, sortBy, sortCol, sortDir, onSort }: TP & { rows: { name: string; count: number; key: boolean }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const view = sortCol ? sortBy(rows, (r) => r.count) : [...rows].sort((a, b) => b.count - a.count);
  return (
    <>
      <thead><tr>
        <Th first sortCol={sortCol} sortDir={sortDir} onSort={onSort}>Evento</Th>
        <Th col="c" sortCol={sortCol} sortDir={sortDir} onSort={onSort}>Conteo</Th>
        <th className="nos" style={{ textAlign: 'right' }}>¿Clave?</th>
      </tr></thead>
      <tbody>
        {view.slice(0, 30).map((r) => {
          const isWa = /whatsapp/i.test(r.name);
          const flag = isWa && !r.key ? 'NO clave' : undefined;
          return (
            <tr key={r.name}>
              <NameCell name={r.name} dot={r.key ? GOOD : isWa ? BAD : 'var(--mu)'} sub={isWa ? 'clic a WhatsApp' : undefined} flag={flag} />
              <Bar v={r.count} max={max} />
              <td className="num" style={{ color: r.key ? GOOD : isWa ? BAD : 'var(--t2)', fontWeight: 800 }}>{r.key ? '★ Sí' : '✗ No'}</td>
            </tr>
          );
        })}
      </tbody>
    </>
  );
}

// ── Exploración de ruta (1 salto) ────────────────────────────────────────────
function RoutesSection({ clientId }: { clientId: string }) {
  const { data, loading } = useGA4Routes(clientId);

  if (loading && !data) {
    return <div className="card" style={{ padding: 20, fontSize: 12, color: 'var(--mu)' }}>Cargando rutas…</div>;
  }
  if (!data || !data.existsEver) {
    return (
      <div className="card" style={{ padding: '18px 20px', borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Ruta de 1 salto — esperando datos</div>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.5 }}>
          El extractor ya deriva las transiciones "de dónde vino → a qué página" con la dimensión <code>pageReferrer</code> de GA4 (sin BigQuery). En cuanto el ETL escriba en <code>ga4_routes</code>, aquí verás los <b>caminos internos más comunes</b> y las <b>entradas por fuente</b>. El flujo multi-paso (Sankey 1→2→3) sí requiere BigQuery.
        </div>
      </div>
    );
  }

  const maxInt = Math.max(1, ...data.internal.map((r) => r.sessions));
  const maxExt = Math.max(1, ...data.external.map((r) => r.sessions));
  const short = (p: string) => (p.length > 30 ? p.slice(0, 29) + '…' : p);

  return (
    <div className="cmt-grid2">
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 10 }}>Caminos internos · página → página</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {data.internal.slice(0, 10).map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, ...ellipsis }} title={`${r.fromLabel} → ${r.toPath}`}>
                <b style={{ color: 'var(--t1)' }}>{short(r.fromLabel)}</b>
                <span style={{ color: 'var(--acc)' }}>→</span>
                <b style={{ color: 'var(--t1)' }}>{short(r.toPath)}</b>
              </span>
              <span style={{ position: 'relative', width: 70, flex: 'none', textAlign: 'right', fontWeight: 800, fontFamily: "'Space Grotesk',sans-serif" }}>
                {formatNumber(r.sessions)}
              </span>
            </div>
          ))}
          {data.internal.length === 0 && <div style={{ fontSize: 12, color: 'var(--mu)' }}>Sin caminos internos detectados.</div>}
        </div>
      </div>
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 10 }}>Entradas por fuente externa</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.external.slice(0, 8).map((r) => (
            <div key={r.source} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ width: 110, flex: 'none', fontSize: 12, fontWeight: 600, ...ellipsis }} title={r.source}>{r.source}</div>
              <div style={{ flex: 1, height: 16, background: 'var(--track)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(r.sessions / maxExt) * 100}%`, borderRadius: 6, background: '#4285F4' }} />
              </div>
              <div style={{ width: 56, flex: 'none', textAlign: 'right', fontSize: 12, fontWeight: 800, fontFamily: "'Space Grotesk',sans-serif" }}>{formatNumber(r.sessions)}</div>
            </div>
          ))}
          {data.external.length === 0 && <div style={{ fontSize: 12, color: 'var(--mu)' }}>Sin entradas externas detectadas.</div>}
        </div>
      </div>
    </div>
  );
}

// ── piezas ───────────────────────────────────────────────────────────────────
function Kpi({ label, value, delta, good, sub }: { label: string; value: string; delta?: number; good?: boolean; sub?: string }) {
  const showDelta = typeof delta === 'number';
  const up = (delta ?? 0) >= 0;
  return (
    <div style={{ padding: '9px 11px', borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--b1)' }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--mu)' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2, color: 'var(--t1)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 9.5, marginTop: 1, color: showDelta ? (up === !!good ? GOOD : up ? GOOD : BAD) : 'var(--t3)' }}>
        {showDelta ? `${up ? '▲ +' : '▼ '}${Math.abs(delta!).toFixed(1)}%` : sub}
      </div>
    </div>
  );
}
function ActionStrip({ color, title, big, lab, small }: { color: string; title: string; big: string; lab: string; small?: boolean }) {
  return (
    <div className="ttc-acol">
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase', color, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />{title}
      </div>
      <div style={{ fontSize: small ? 16 : 22, fontWeight: 800, fontFamily: "'Space Grotesk',sans-serif", lineHeight: 1.15, color, ...ellipsis }} title={big}>{big}</div>
      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 1, lineHeight: 1.3 }}>{lab}</div>
    </div>
  );
}
function Dot({ c }: { c: string }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: c, verticalAlign: 1, marginRight: 4 }} />;
}

const slabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)' };
const headline: React.CSSProperties = { fontSize: 'clamp(18px,2.2vw,24px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, marginTop: 4 };
const headSub: React.CSSProperties = { fontSize: 12.5, color: 'var(--t2)', marginTop: 9, lineHeight: 1.5 };
const expHead: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 11 };
const tabsWrap: React.CSSProperties = { display: 'inline-flex', background: 'var(--bg3)', border: '1px solid var(--b1)', borderRadius: 10, padding: 3, gap: 2, flexWrap: 'wrap' };
function tabBtn(on: boolean): React.CSSProperties {
  return { fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 8, cursor: 'pointer', border: 'none', background: on ? 'var(--bg1)' : 'transparent', color: on ? 'var(--t1)' : 'var(--t2)', boxShadow: on ? '0 1px 2px rgba(0,0,0,0.12)' : 'none' };
}
const tblWrap: React.CSSProperties = { overflowX: 'auto', border: '1px solid var(--b1)', borderRadius: 14, background: 'var(--bg1)' };
const nameCell: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 };
const dotStyle: React.CSSProperties = { flex: 'none', width: 8, height: 8, borderRadius: '50%', display: 'inline-block' };
const subStyle: React.CSSProperties = { fontSize: 9.5, color: 'var(--mu)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300 };
const ellipsis: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
