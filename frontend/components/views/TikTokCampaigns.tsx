'use client';

import { useMemo, useState } from 'react';
import { useClient } from '@/lib/useClient';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';
import {
  useTikTok,
  type TikTokCampaignRow,
  type TikTokAdGroupRow,
  type TikTokAdRow,
} from '@/lib/hooks/useTikTok';
import { formatCurrency, formatInt, formatNumber, formatPercent } from '@/lib/utils';
import {
  TikTokLoading,
  TikTokError,
  TikTokEmpty,
  TikTokHero,
  CreativeThumb,
} from './tiktokShared';

// ============================================================
// TikTok Ads · RESULTADOS POR CAMPAÑAS
// ============================================================
// Vista 2 de 3. Desglose jerárquico real: Campaña → Conjunto de anuncios →
// Anuncio. Cada nivel se expande/colapsa. Por anuncio mostramos costos, leads,
// CTR, alcance, impresiones, frecuencia y tasa de conversión — todo dato real.
// La miniatura del creativo es por ahora un marcador honesto (ver Paso 2).
// ============================================================

export function TikTokCampaigns() {
  const client = useClient();
  const { range, previous } = usePeriod();
  const { data, loading, error } = useTikTok(client.id, range, previous);

  const rangeLabel = formatRangeLabel(range);
  const cur = client.currency;

  // Conjuntos agrupados por campaña, y anuncios agrupados por conjunto.
  const adgroupsByCampaign = useMemo(() => {
    const m = new Map<string, TikTokAdGroupRow[]>();
    for (const g of data?.adgroups ?? []) {
      const arr = m.get(g.campaignName) ?? [];
      arr.push(g);
      m.set(g.campaignName, arr);
    }
    return m;
  }, [data]);

  const adsByAdgroup = useMemo(() => {
    const m = new Map<string, TikTokAdRow[]>();
    for (const a of data?.ads ?? []) {
      const arr = m.get(a.adgroupId) ?? [];
      arr.push(a);
      m.set(a.adgroupId, arr);
    }
    return m;
  }, [data]);

  const [openCampaigns, setOpenCampaigns] = useState<Set<string>>(new Set());
  const [openAdgroups, setOpenAdgroups] = useState<Set<string>>(new Set());

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  if (loading && !data) return <TikTokLoading clientName={client.name} />;
  if (error) return <TikTokError error={error} />;
  if (!data || data.totals.spend === 0)
    return <TikTokEmpty data={data} clientName={client.name} rangeLabel={rangeLabel} />;

  const t = data.totals;

  return (
    <div className="view on">
      <TikTokHero
        title="TikTok Ads · Resultados por campañas"
        sub={
          <>
            {rangeLabel} · {client.name} · {formatInt(data.campaignCount)} campañas ·{' '}
            {formatInt(data.adgroupCount)} conjuntos · {formatInt(data.adCount)} anuncios
          </>
        }
      />

      <div style={{ fontSize: 12, color: 'var(--mu)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Haz clic en una <b>campaña</b> para ver sus <b>conjuntos de anuncios</b>, y en un conjunto
        para ver sus <b>anuncios</b>. Cada fila trae costo, leads, CPL, CTR, alcance, impresiones,
        frecuencia y tasa de conversión — todo real.
      </div>

      {/* Lista de campañas (acordeón) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.campaigns.map((c: TikTokCampaignRow) => {
          const open = openCampaigns.has(c.name);
          const groups = adgroupsByCampaign.get(c.name) ?? [];
          const share = t.spend > 0 ? c.spend / t.spend : 0;
          return (
            <div key={c.name} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Encabezado de campaña */}
              <button
                onClick={() => toggle(openCampaigns, c.name, setOpenCampaigns)}
                style={headerBtnStyle}
              >
                <span style={{ fontSize: 12, color: 'var(--mu)', width: 14, flexShrink: 0 }}>
                  {open ? '▾' : '▸'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={ellipsis}>
                    <b>{c.name}</b>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--mu)' }}>
                    {groups.length} conjuntos · {formatPercent(share, 1)} de la inversión
                  </div>
                </div>
                <HeaderMetrics
                  cur={cur}
                  spend={c.spend}
                  conversions={c.conversions}
                  cpl={c.cpl}
                  ctr={c.ctr}
                />
              </button>

              {/* Conjuntos de la campaña */}
              {open && (
                <div style={{ borderTop: '1px solid var(--b2)', background: 'var(--bg2)' }}>
                  {groups.map((g) => {
                    const gKey = g.adgroupId;
                    const gOpen = openAdgroups.has(gKey);
                    const ads = adsByAdgroup.get(g.adgroupId) ?? [];
                    return (
                      <div key={gKey} style={{ borderBottom: '1px solid var(--b2)' }}>
                        <button
                          onClick={() => toggle(openAdgroups, gKey, setOpenAdgroups)}
                          style={{ ...headerBtnStyle, paddingLeft: 30 }}
                        >
                          <span style={{ fontSize: 11, color: 'var(--mu)', width: 14, flexShrink: 0 }}>
                            {gOpen ? '▾' : '▸'}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ ...ellipsis, fontSize: 13 }}>{g.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--mu)' }}>
                              {ads.length} anuncios · frec. {g.frequency > 0 ? `${g.frequency.toFixed(2)}×` : '—'}
                            </div>
                          </div>
                          <HeaderMetrics
                            cur={cur}
                            spend={g.spend}
                            conversions={g.conversions}
                            cpl={g.cpl}
                            ctr={g.ctr}
                          />
                        </button>

                        {/* Anuncios del conjunto */}
                        {gOpen && (
                          <div style={{ padding: '4px 16px 14px 44px', overflowX: 'auto' }}>
                            <table className="t" style={{ minWidth: 760 }}>
                              <thead>
                                <tr>
                                  <th data-cat="dim">Anuncio</th>
                                  <th data-cat="cost">Inversión</th>
                                  <th data-cat="conv">Leads</th>
                                  <th data-cat="cost,conv">CPL</th>
                                  <th data-cat="impr">CTR</th>
                                  <th data-cat="impr">Alcance</th>
                                  <th data-cat="impr">Impr.</th>
                                  <th data-cat="impr">Frec.</th>
                                  <th data-cat="conv">Conv. rate</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ads.map((a) => (
                                  <tr key={a.adId}>
                                    <td data-cat="dim">
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <CreativeThumb name={a.name} />
                                        <span style={{ ...ellipsis, maxWidth: 240 }}>{a.name}</span>
                                      </div>
                                    </td>
                                    <td data-cat="cost">{formatCurrency(a.spend, cur)}</td>
                                    <td data-cat="conv">{formatInt(a.conversions)}</td>
                                    <td data-cat="cost,conv">
                                      {a.conversions > 0 ? formatCurrency(a.cpl, cur) : '—'}
                                    </td>
                                    <td data-cat="impr">{formatPercent(a.ctr, 1)}</td>
                                    <td data-cat="impr">{formatNumber(a.reach)}</td>
                                    <td data-cat="impr">{formatNumber(a.impressions)}</td>
                                    <td data-cat="impr">
                                      {a.frequency > 0 ? `${a.frequency.toFixed(2)}×` : '—'}
                                    </td>
                                    <td data-cat="conv">{formatPercent(a.cvr, 1)}</td>
                                  </tr>
                                ))}
                                {ads.length === 0 && (
                                  <tr>
                                    <td data-cat="dim" colSpan={9} style={{ color: 'var(--mu)' }}>
                                      Sin anuncios con actividad en este rango.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {groups.length === 0 && (
                    <div style={{ padding: '12px 30px', fontSize: 12, color: 'var(--mu)' }}>
                      Sin conjuntos con actividad en este rango.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Nota honesta */}
      <div className="card" style={{ marginTop: 20, borderStyle: 'dashed', borderColor: 'var(--b2)' }}>
        <div style={{ fontSize: 12, color: 'var(--mu)', lineHeight: 1.6 }}>
          La <b>frecuencia</b> es impresiones ÷ alcance (cuántas veces vio el anuncio cada persona, en
          promedio). El <b>alcance</b> es la suma del alcance diario reportado por TikTok, así que es
          una aproximación, no usuarios únicos del período completo. La miniatura del creativo es por
          ahora un marcador: la portada/video real se conecta en el siguiente paso.
        </div>
      </div>
    </div>
  );
}

// Métricas inline del encabezado (campaña o conjunto): inversión, leads, CPL, CTR.
function HeaderMetrics({
  cur,
  spend,
  conversions,
  cpl,
  ctr,
}: {
  cur: string;
  spend: number;
  conversions: number;
  cpl: number;
  ctr: number;
}) {
  return (
    <div style={{ display: 'flex', gap: 18, flexShrink: 0 }}>
      <Metric label="Inversión" value={formatCurrency(spend, cur)} />
      <Metric label="Leads" value={formatInt(conversions)} />
      <Metric label="CPL" value={conversions > 0 ? formatCurrency(cpl, cur) : '—'} />
      <Metric label="CTR" value={formatPercent(ctr, 1)} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'right', minWidth: 64 }}>
      <div style={{ fontSize: 10, color: 'var(--mu)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

const headerBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '12px 16px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  color: 'var(--t1)',
};

const ellipsis: React.CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
