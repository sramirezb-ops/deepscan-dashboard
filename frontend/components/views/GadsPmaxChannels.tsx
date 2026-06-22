'use client';

import { useClient } from '@/lib/useClient';
import {
  useGadsPmaxChannels,
  type PmaxChannel,
  type PmaxChannelCampaign,
  type PmaxChannelRow,
} from '@/lib/hooks/useGadsPmaxChannels';
import { formatCurrency, formatInt, formatPercent, formatROAS } from '@/lib/utils';
import { useSortableTable, type SortAccessor } from '@/components/ui/useSortableTable';

// ============================================================
// GadsPmaxChannels — "¿En qué red se va la plata?" (PMax)
// ============================================================
// Descompone el gasto de cada campaña Performance Max por RED de Google:
// Shop / Video / Display / Search*. Lee gads_pmax_channels (hook
// useGadsPmaxChannels), cuya ÚNICA fuente es la pestaña "Campaigns" del sheet
// de Mike Rhodes — Google no expone el costo-por-red de PMax por API.
//
// Honestidad explícita en la UI:
//   · Es un SNAPSHOT "últimos 30 días", NO filtrable por el selector de fechas.
//   · Search* es el RESIDUAL (Total − Video − Display − Shop): se marca con
//     asterisco y nota al pie. No es un dato etiquetado por Google.
//   · ROAS solo se muestra si hay revenue real (negocios de venta); en leads
//     (donde valor = nº de leads) se omite por no ser significativo.
// Si la tabla está vacía, la sección no se pinta.
// ============================================================

const CHANNEL_META: Record<PmaxChannel, { label: string; color: string; hint: string }> = {
  video:   { label: 'Video',     color: '#ef4444', hint: 'YouTube y video partners' },
  display: { label: 'Display',   color: '#3b82f6', hint: 'Red de Display de Google' },
  search:  { label: 'Search*',   color: '#22d97a', hint: 'Búsqueda — residual' },
  shop:    { label: 'Shopping',  color: '#f59e0b', hint: 'Google Shopping' },
};

function meta(ch: PmaxChannel) {
  return CHANNEL_META[ch] || { label: ch, color: '#888', hint: '' };
}

function Campaign({ camp, currency, showRoas }: { camp: PmaxChannelCampaign; currency: string; showRoas: boolean }) {
  // Solo redes con gasto para la barra apilada (evita segmentos de 0%).
  const withCost = camp.channels.filter((c) => c.cost > 0);

  const chanAccessors: SortAccessor<PmaxChannelRow>[] = [
    (c) => meta(c.channel).label,
    (c) => c.cost,
    (c) => c.costPct,
    (c) => c.conversions,
    (c) => c.convPct,
    ...(showRoas ? [(c: PmaxChannelRow) => c.roas] : []),
  ];
  const { rows: chanRows, headerProps: chanHeader } = useSortableTable(camp.channels, chanAccessors);

  return (
    <div style={{ marginTop: '18px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: '10px',
        }}
      >
        <b style={{ fontSize: 13 }}>{camp.campaignName}</b>
        <span style={{ fontSize: 11, color: 'var(--mu)' }}>
          Inversión total <b style={{ color: 'var(--fg)' }}>{formatCurrency(camp.totalCost, currency)}</b>{' '}
          · {formatInt(camp.totalConv)} leads
        </span>
      </div>

      {/* Barra apilada del split de inversión */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 26,
          borderRadius: 6,
          overflow: 'hidden',
          background: 'var(--bg2, #1a1a1a)',
        }}
      >
        {withCost.map((c) => {
          const m = meta(c.channel);
          const pct = Math.round(c.costPct * 100);
          return (
            <div
              key={c.channel}
              title={`${m.label}: ${formatCurrency(c.cost, currency)} (${pct}%)`}
              style={{
                width: `${c.costPct * 100}%`,
                background: m.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
                color: '#0a0a0a',
                whiteSpace: 'nowrap',
              }}
            >
              {pct >= 8 ? `${pct}%` : ''}
            </div>
          );
        })}
      </div>

      {/* Tabla detalle por red */}
      <table className="t" style={{ marginTop: '12px' }}>
        <thead>
          <tr>
            <th {...chanHeader(0)}>Red</th>
            <th {...chanHeader(1)}>Inversión</th>
            <th {...chanHeader(2)}>% inv.</th>
            <th {...chanHeader(3)}>Leads</th>
            <th {...chanHeader(4)}>% leads</th>
            {showRoas && <th {...chanHeader(5)}>ROAS</th>}
          </tr>
        </thead>
        <tbody>
          {chanRows.map((c: PmaxChannelRow) => {
            const m = meta(c.channel);
            return (
              <tr key={c.channel}>
                <td>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 9,
                      height: 9,
                      borderRadius: 2,
                      background: m.color,
                      marginRight: 7,
                    }}
                  />
                  <b>{m.label}</b>
                  <span style={{ display: 'block', fontSize: 10, color: 'var(--mu)', marginLeft: 16 }}>
                    {m.hint}
                  </span>
                </td>
                <td>{formatCurrency(c.cost, currency)}</td>
                <td>{formatPercent(c.costPct, 0)}</td>
                <td>{formatInt(c.conversions)}</td>
                <td>{formatPercent(c.convPct, 0)}</td>
                {showRoas && <td>{c.cost > 0 ? formatROAS(c.roas) : '—'}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function GadsPmaxChannels() {
  const client = useClient();
  const { data, loading, error } = useGadsPmaxChannels(client.id);

  // Silencioso mientras carga; sin datos no inventamos una sección vacía.
  if (loading && !data) return null;
  if (error || !data || data.channelCount === 0) return null;

  // ROAS solo tiene sentido si hay revenue real (valor ≠ nº de conversiones).
  const showRoas = data.campaigns.some((c) => Math.abs(c.totalValue - c.totalConv) > 0.01 && c.totalValue > 0);

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
        <h3 style={{ margin: '0', fontSize: '15px' }}>¿En qué red se va la plata?</h3>
        <span className="period-pill">
          últimos 30 días · <b>snapshot</b>
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: '6px', lineHeight: 1.5 }}>
        Performance Max reparte el presupuesto solo entre <b>Video</b>, <b>Display</b>, <b>Search</b> y{' '}
        <b>Shopping</b>. Este desglose es un acumulado de los <b>últimos 30 días</b> (no responde al
        selector de fechas) y es la única forma de ver el reparto: Google no lo expone por API.
      </div>

      {data.campaigns.map((camp) => (
        <Campaign key={camp.campaignName} camp={camp} currency={client.currency} showRoas={showRoas} />
      ))}

      <div style={{ fontSize: 10, color: 'var(--mu)', marginTop: '16px', lineHeight: 1.5 }}>
        <b>*Search es un valor residual</b> (Inversión total − Video − Display − Shopping). Video y
        Display se calculan a partir de datos reales de emplazamientos; Shopping, de shopping
        performance. Google no etiqueta oficialmente el gasto de Search dentro de PMax, por eso se
        deduce como lo que sobra. Fuente: script de Google Ads (Mike Rhodes).
      </div>
    </div>
  );
}
