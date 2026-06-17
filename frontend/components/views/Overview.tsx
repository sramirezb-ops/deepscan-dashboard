'use client';

import { Hero, Card } from '@/components/ui/Card';
import { HeroStat } from '@/components/ui/KpiCard';
import { Agent } from '@/components/ui/Agent';
import { RevenueEvolutionChart } from './RevenueEvolutionChart';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import { useOverview } from '@/lib/hooks/useOverview';
import {
  formatCurrency,
  formatInt,
  formatROAS,
  formatDelta,
  formatPercent,
  deltaDirection,
} from '@/lib/utils';

export function Overview() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useOverview(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const previousLabel = formatRangeLabel(previous);

  // Estado de carga
  if (loading && !data) {
    return (
      <div className="view on">
        <div className="hero" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Cargando datos de {client.name}…
          </div>
        </div>
      </div>
    );
  }

  // Estado de error
  if (error) {
    return (
      <div className="view on">
        <div
          className="card"
          style={{ padding: 40, textAlign: 'center', borderColor: 'rgba(239,68,68,0.3)' }}
        >
          <div style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>
            Error cargando datos
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 16 }}>{error}</div>
          <div style={{ fontSize: 11, color: 'var(--mu)' }}>
            Revisá tu conexión a Supabase en <code>.env.local</code> y que las tablas tengan
            datos para el <code>client_id</code> de {client.name}.
          </div>
        </div>
      </div>
    );
  }

  // Sin datos
  if (!data) {
    return (
      <div className="view on">
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--mu)' }}>
            Sin datos disponibles para el período.
          </div>
        </div>
      </div>
    );
  }

  const hasAnyData = data.revenue > 0 || data.investment > 0 || data.sales > 0;

  return (
    <div className="view on">
      {/* HERO — narrativa + 6 stats */}
      <Hero
        label={`Resumen ejecutivo · ${rangeLabel}`}
        labelIcon="✦"
        title={
          hasAnyData ? (
            <>
              Revenue <em>{formatCurrency(data.revenue, client.currency)} {client.currency}</em>{' '}
              con ROAS <em>{formatROAS(data.roas)}</em> (
              {data.roasDelta >= 0 ? '+' : ''}
              {data.roasDelta.toFixed(2)}). Datos en vivo desde Supabase para {client.name}.
            </>
          ) : (
            <>Sin datos suficientes aún para {client.name}. Revisá que el ETL esté corriendo.</>
          )
        }
      >
        <HeroStat
          label="Revenue total"
          value={formatCurrency(data.revenue, client.currency)}
          delta={{
            value: formatDelta(data.revenueDelta),
            direction: deltaDirection(data.revenueDelta),
          }}
          ytd={`vs ${previousLabel}`}
        />
        <HeroStat
          label="Inversión total"
          value={formatCurrency(data.investment, client.currency)}
          delta={{
            value: formatDelta(data.investmentDelta),
            direction: deltaDirection(data.investmentDelta),
          }}
          ytd={`vs ${previousLabel}`}
        />
        <HeroStat
          label="ROAS combinado"
          value={formatROAS(data.roas)}
          delta={{
            value: (data.roasDelta >= 0 ? '+' : '') + data.roasDelta.toFixed(2),
            direction: deltaDirection(data.roasDelta),
          }}
          ytd={`vs ${previousLabel}`}
        />
        <HeroStat
          label="Ventas"
          value={formatInt(data.sales)}
          delta={{
            value: formatDelta(data.salesDelta),
            direction: deltaDirection(data.salesDelta),
          }}
          ytd={`vs ${previousLabel}`}
        />
        <HeroStat
          label="Costo por compra"
          value={formatCurrency(data.cpa, client.currency)}
          delta={{
            value: formatDelta(data.cpaDelta),
            direction: deltaDirection(-data.cpaDelta), // invertido: bajar CPA es bueno
          }}
          ytd={`CPA vs ${previousLabel}`}
        />
        <HeroStat
          label="Tasa conversión"
          value={formatPercent(data.conversionRate, 2)}
          delta={{
            value: `${data.conversionRateDelta >= 0 ? '+' : ''}${data.conversionRateDelta.toFixed(2)}pp`,
            direction: deltaDirection(data.conversionRateDelta),
          }}
          ytd={`vs ${previousLabel}`}
        />
      </Hero>

      {/* Evolución de revenue (por ahora con mock, próximamente con datos reales) */}
      <RevenueEvolutionChart />

      {/* Desempeño por canal + mix revenue */}
      <div className="r2" style={{ marginTop: 20 }}>
        <Card>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 15 }}>Desempeño por canal · {rangeLabel}</h3>
            <span className="period-pill">
              <b>{hasAnyData ? `${formatInt(data.sales)} ventas` : 'Sin datos'}</b>
            </span>
          </div>
          <table className="t">
            <thead>
              <tr>
                <th>Canal</th>
                <th>Inversión</th>
                <th>Revenue</th>
                <th>ROAS</th>
                <th>Ventas</th>
                <th>CPA</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span className="pl pl-google">Google Ads</span>
                </td>
                <td>{formatCurrency(data.investment, client.currency)}</td>
                <td>{formatCurrency(data.channelMix.google, client.currency)}</td>
                <td>
                  <span className="tg tgu">
                    <b>{formatROAS(data.roas)}</b>
                  </span>
                </td>
                <td>{formatInt(data.sales)}</td>
                <td>{formatCurrency(data.cpa, client.currency)}</td>
                <td>
                  <span className="tg tgu">Activo</span>
                </td>
              </tr>
              <tr>
                <td>
                  <span className="pl pl-meta">Meta Ads</span>
                </td>
                <td colSpan={5} style={{ color: 'var(--mu)', fontStyle: 'italic' }}>
                  Token de Meta inválido · ETL pendiente
                </td>
                <td>
                  <span className="tg tgd">Sin datos</span>
                </td>
              </tr>
              <tr>
                <td>
                  <span className="pl pl-tiktok">TikTok Ads</span>
                </td>
                <td colSpan={5} style={{ color: 'var(--mu)', fontStyle: 'italic' }}>
                  Integración TikTok Ads pendiente
                </td>
                <td>
                  <span className="tg tgd">Sin datos</span>
                </td>
              </tr>
              <tr>
                <td>
                  <span className="pl pl-search">Organic + Direct</span>
                </td>
                <td>—</td>
                <td>{formatCurrency(data.channelMix.organic, client.currency)}</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>
                  <span className="tg tgu">GA4</span>
                </td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 15 }}>Estado de integraciones</h3>
          <IntegrationsStatus />
        </Card>
      </div>

      {/* Agente Performance Senior */}
      <Agent
        role="Agente Performance Senior"
        subtitle={`Análisis · ${client.name} · ${rangeLabel}`}
        avatar="◈"
        severity="me"
        timestamp={`Datos del ${data.from} al ${data.to}`}
        diagnosis={
          hasAnyData ? (
            <>
              Los datos conectados en vivo desde Supabase muestran{' '}
              <b>{formatCurrency(data.revenue, client.currency)}</b> en revenue con{' '}
              <b>ROAS {formatROAS(data.roas)}</b> de Google Ads. {data.investment > 0 && (
                <>
                  Inversión total de <b>{formatCurrency(data.investment, client.currency)}</b>{' '}
                  generando <b>{formatInt(data.sales)}</b> ventas con CPA{' '}
                  <b>{formatCurrency(data.cpa, client.currency)}</b>.{' '}
                </>
              )}
              Para análisis completo cross-canal, conectar Meta Ads y TikTok Ads (actualmente sin
              ETL). El canal "Organic + Direct" de {formatCurrency(data.channelMix.organic, client.currency)}{' '}
              viene de GA4 y representa revenue no atribuido a Google.
            </>
          ) : (
            <>
              No hay datos suficientes en el período seleccionado. Verifica que el ETL esté
              corriendo correctamente y que existan registros en las tablas{' '}
              <code>gads_campaigns</code> y <code>ga4_metrics</code> para{' '}
              <code>client_id = {client.id}</code>.
            </>
          )
        }
        opportunities={
          hasAnyData
            ? [
                {
                  title: 'Conectar Meta Ads para análisis cross-canal',
                  sub: 'El token actual es inválido. Regenerarlo habilita 3 vistas: Meta Overview, Milimétrico, WhatsApp, Instagram.',
                  cta: 'Configurar →',
                },
                {
                  title: 'Conectar Shopify para revenue real E2E',
                  sub: 'Actualmente GA4 reporta revenue parcial. Shopify da el dato autoritativo.',
                  cta: 'Conectar →',
                },
              ]
            : []
        }
      />
    </div>
  );
}

function IntegrationsStatus() {
  const integrations = [
    { name: 'Google Ads', status: 'ok', note: 'ETL diario 11 UTC' },
    { name: 'Google Analytics 4', status: 'ok', note: 'ETL diario' },
    { name: 'Google Merchant Center', status: 'ok', note: '14,038 productos' },
    { name: 'Meta Ads', status: 'error', note: 'Token inválido' },
    { name: 'TikTok Ads', status: 'pending', note: 'Integración pendiente' },
    { name: 'Shopify', status: 'pending', note: 'Sin token' },
    { name: 'Microsoft Clarity', status: 'pending', note: 'Sin configurar' },
    { name: 'Search Console', status: 'pending', note: 'Sin configurar' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {integrations.map((i) => (
        <div
          key={i.name}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 0',
            borderBottom: '1px solid var(--b1)',
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background:
                  i.status === 'ok' ? '#22d97a' : i.status === 'error' ? '#ef4444' : 'rgba(255,255,255,0.25)',
              }}
            />
            <span>{i.name}</span>
          </div>
          <span style={{ color: 'var(--mu)', fontSize: 11 }}>{i.note}</span>
        </div>
      ))}
    </div>
  );
}
