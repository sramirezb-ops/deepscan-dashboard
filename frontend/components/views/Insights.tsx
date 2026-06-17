import { Agent } from '@/components/ui/Agent';
import { Card, Hero, HeroSimple, CardHeader } from '@/components/ui/Card';
import { KpiCard, HeroStat } from '@/components/ui/KpiCard';
import { Thumbnail, Hierarchy } from '@/components/ui/Thumbnail';
import { DimensionTable, MetricFilter, CmpCell } from '@/components/ui/DimensionTable';
import { ChartWithTooltip } from '@/components/ui/ChartWithTooltip';

export function Insights() {
  return (
    <div className="view on">
<div className="card" style={{padding:'28px 32px',background:'linear-gradient(135deg,rgba(139,92,246,0.1),rgba(56,189,248,0.04))',borderColor:'rgba(139,92,246,0.25)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'24px',flexWrap:'wrap'}}>
          <div style={{flex:'1',minWidth:'300px'}}>
            <div style={{fontSize:'12px',color:'var(--acc2)',textTransform:'uppercase',letterSpacing:'1.5px',fontWeight:'600',marginBottom:'8px'}}>IA · Análisis de mes completo</div>
            <h2 style={{margin:'0',fontSize:'28px',fontFamily:'\'Space Grotesk\',sans-serif',fontWeight:'600'}}>Conclusiones de abril</h2>
            <div style={{color:'var(--mu)',marginTop:'8px',fontSize:'14px'}}>Oportunidades y alertas detectadas cross-canal · generado por Claude Sonnet 4.5</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontFamily:'\'Space Grotesk\'',fontSize:'32px',fontWeight:'600',color:'#22d97a'}}>+$187K</div>
            <div style={{fontSize:'11px',color:'var(--mu)'}}>upside potencial estimado</div>
          </div>
        </div>
      </div>

      <div className="r2" style={{marginTop:'20px'}}>
        <div className="card">
          <h3 style={{margin:'0 0 16px 0',fontSize:'15px',color:'#22d97a'}}>✦ Oportunidades (por impacto estimado)</h3>
          <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
            <div style={{padding:'14px',background:'rgba(34,217,122,0.06)',border:'1px solid rgba(34,217,122,0.2)',borderLeft:'4px solid #22d97a',borderRadius:'8px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'12px'}}><div style={{flex:'1'}}><div style={{fontSize:'13px',fontWeight:'600'}}>Escalar Advantage+ Best Sellers</div><div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>ROAS 4.82x · headroom de presupuesto · Meta</div></div><div style={{textAlign:'right'}}><div style={{fontSize:'18px',fontFamily:'\'Space Grotesk\'',fontWeight:'600',color:'#22d97a'}}>+$62K</div><div style={{fontSize:'10px',color:'var(--mu)'}}>mes siguiente</div></div></div>
            </div>
            <div style={{padding:'14px',background:'rgba(34,217,122,0.06)',border:'1px solid rgba(34,217,122,0.2)',borderLeft:'4px solid #22d97a',borderRadius:'8px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'12px'}}><div style={{flex:'1'}}><div style={{fontSize:'13px',fontWeight:'600'}}>Mover inversión CDMX → Monterrey</div><div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>MTY crece +24.3% con 12% del budget</div></div><div style={{textAlign:'right'}}><div style={{fontSize:'18px',fontFamily:'\'Space Grotesk\'',fontWeight:'600',color:'#22d97a'}}>+$34K</div><div style={{fontSize:'10px',color:'var(--mu)'}}>mes siguiente</div></div></div>
            </div>
            <div style={{padding:'14px',background:'rgba(34,217,122,0.06)',border:'1px solid rgba(34,217,122,0.2)',borderLeft:'4px solid #22d97a',borderRadius:'8px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'12px'}}><div style={{flex:'1'}}><div style={{fontSize:'13px',fontWeight:'600'}}>Excluir 311 zombies del feed GMC</div><div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>Liberar crawl budget PMAX · mejora ROAS +8-12%</div></div><div style={{textAlign:'right'}}><div style={{fontSize:'18px',fontFamily:'\'Space Grotesk\'',fontWeight:'600',color:'#22d97a'}}>+$28K</div><div style={{fontSize:'10px',color:'var(--mu)'}}>mes siguiente</div></div></div>
            </div>
            <div style={{padding:'14px',background:'rgba(34,217,122,0.06)',border:'1px solid rgba(34,217,122,0.2)',borderLeft:'4px solid #22d97a',borderRadius:'8px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'12px'}}><div style={{flex:'1'}}><div style={{fontSize:'13px',fontWeight:'600'}}>Reescribir meta tags top 10 con CTR bajo</div><div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>5 keywords posicionan pero no convierten</div></div><div style={{textAlign:'right'}}><div style={{fontSize:'18px',fontFamily:'\'Space Grotesk\'',fontWeight:'600',color:'#22d97a'}}>+$24K</div><div style={{fontSize:'10px',color:'var(--mu)'}}>mes siguiente</div></div></div>
            </div>
            <div style={{padding:'14px',background:'rgba(34,217,122,0.06)',border:'1px solid rgba(34,217,122,0.2)',borderLeft:'4px solid #22d97a',borderRadius:'8px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'12px'}}><div style={{flex:'1'}}><div style={{fontSize:'13px',fontWeight:'600'}}>Subir CTA ficha producto encima del fold</div><div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>Solo 12% ve CTA final · Clarity</div></div><div style={{textAlign:'right'}}><div style={{fontSize:'18px',fontFamily:'\'Space Grotesk\'',fontWeight:'600',color:'#22d97a'}}>+$21K</div><div style={{fontSize:'10px',color:'var(--mu)'}}>mes siguiente</div></div></div>
            </div>
            <div style={{padding:'14px',background:'rgba(34,217,122,0.06)',border:'1px solid rgba(34,217,122,0.2)',borderLeft:'4px solid #22d97a',borderRadius:'8px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'12px'}}><div style={{flex:'1'}}><div style={{fontSize:'13px',fontWeight:'600'}}>Automatizar respuestas WA "¿tienen talla?"</div><div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>41% cierre · 1,240 mensajes/mes</div></div><div style={{textAlign:'right'}}><div style={{fontSize:'18px',fontFamily:'\'Space Grotesk\'',fontWeight:'600',color:'#22d97a'}}>+$18K</div><div style={{fontSize:'10px',color:'var(--mu)'}}>mes siguiente</div></div></div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{margin:'0 0 16px 0',fontSize:'15px',color:'#ef4444'}}>⚠ Alertas que requieren acción</h3>
          <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
            <div style={{padding:'14px',background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderLeft:'4px solid #ef4444',borderRadius:'8px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}><div><div style={{fontSize:'13px',fontWeight:'600'}}>Caída de sesiones en CDMX</div><div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>−18.7% vs mes anterior · 18,420 sesiones</div></div><span className="pri pri-hi">Alto</span></div>
            </div>
            <div style={{padding:'14px',background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderLeft:'4px solid #ef4444',borderRadius:'8px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}><div><div style={{fontSize:'13px',fontWeight:'600'}}>218 productos con GTIN inválido</div><div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>Bloqueados en Shopping · GMC</div></div><span className="pri pri-hi">Alto</span></div>
            </div>
            <div style={{padding:'14px',background:'rgba(251,191,36,0.06)',border:'1px solid rgba(251,191,36,0.2)',borderLeft:'4px solid #fbbf24',borderRadius:'8px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}><div><div style={{fontSize:'13px',fontWeight:'600'}}>Hook "Ya no camino igual" saturado</div><div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>18 días en vivo · urge iterar MÁS</div></div><span className="pri pri-me">Medio</span></div>
            </div>
            <div style={{padding:'14px',background:'rgba(251,191,36,0.06)',border:'1px solid rgba(251,191,36,0.2)',borderLeft:'4px solid #fbbf24',borderRadius:'8px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}><div><div style={{fontSize:'13px',fontWeight:'600'}}>Rage clicks en /checkout 12.4%</div><div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>Frustración en paso de pago</div></div><span className="pri pri-me">Medio</span></div>
            </div>
            <div style={{padding:'14px',background:'rgba(251,191,36,0.06)',border:'1px solid rgba(251,191,36,0.2)',borderLeft:'4px solid #fbbf24',borderRadius:'8px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}><div><div style={{fontSize:'13px',fontWeight:'600'}}>Retargeting Meta 1.92x ROAS</div><div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>Canibaliza conversión orgánica · pausar</div></div><span className="pri pri-me">Medio</span></div>
            </div>
            <div style={{padding:'14px',background:'rgba(251,191,36,0.06)',border:'1px solid rgba(251,191,36,0.2)',borderLeft:'4px solid #fbbf24',borderRadius:'8px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}><div><div style={{fontSize:'13px',fontWeight:'600'}}>Yeezy Comparison bajo VTR 24%</div><div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>Debajo del umbral 30% · pausar o repensar</div></div><span className="pri pri-lo">Bajo</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Agente Strategic Lead */}
      <div className="agent">
        <div className="agent-header">
          <div className="agent-identity">
            <div className="agent-avatar">✦</div>
            <div>
              <div className="agent-role">Agente Strategic Lead</div>
              <div className="agent-sub">Ejecutivo mensual · síntesis cross-canal · plan de acción consolidado</div>
            </div>
          </div>
          <div className="agent-meta">
            <span className="agent-sev hi">Prioridad alta</span>
            <span className="agent-time">Cierre mensual · Abril 2026</span>
          </div>
        </div>
        <div className="agent-body">
          <div className="agent-section">
            <div className="agent-section-h">Resumen ejecutivo</div>
            <div className="agent-diag">
              Abril cerró con <b>ROAS consolidado 4.84×</b> (+0.42 vs marzo), el mejor del YTD · revenue $1.15M MXN (+24.3%). Las 3 oportunidades de mayor impacto suman <b>+$124K potencial</b>: escalar Meta Advantage+ Best Sellers, rebalancear geo (CDMX → Monterrey), limpiar feed GMC (311 zombies + 218 GTIN inválidos). El <b>ticket más rápido a upside es arreglar los GTIN</b> — son productos con demanda existente bloqueados por un problema de datos.
            </div>
          </div>
          <div className="agent-section">
            <div className="agent-section-h">Plan consolidado (Top 5 por impacto)</div>
            <div className="agent-opps">
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">1. Escalar Meta Advantage+ Best Sellers +40%</div>
                  <div className="agent-opp-sub">ROAS 4.82× con headroom · validado por Meta Ads Senior</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$62K</div></div>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">2. Rebalancear geo CDMX → Monterrey</div>
                  <div className="agent-opp-sub">Validado cross-canal (Performance, Google Ads, GA4)</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$34K</div></div>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">3. Limpiar feed GMC (zombies + GTIN inválidos)</div>
                  <div className="agent-opp-sub">Impacta PMAX y Shopping · Feed Quality Senior</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$28K</div></div>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">4. Fixes CRO en /checkout (teléfono + CTA)</div>
                  <div className="agent-opp-sub">Mejora conversión cross-canal · CRO Senior</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$28K</div></div>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">5. Pausar Search_Competitors · reasignar a NonBrand</div>
                  <div className="agent-opp-sub">Recuperar IS perdido · Paid Search Senior</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$21K</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
