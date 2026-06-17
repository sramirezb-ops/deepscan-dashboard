import { Agent } from '@/components/ui/Agent';
import { Card, Hero, HeroSimple, CardHeader } from '@/components/ui/Card';
import { KpiCard, HeroStat } from '@/components/ui/KpiCard';
import { Thumbnail, Hierarchy } from '@/components/ui/Thumbnail';
import { DimensionTable, MetricFilter, CmpCell } from '@/components/ui/DimensionTable';
import { ChartWithTooltip } from '@/components/ui/ChartWithTooltip';

export function Clarity() {
  return (
    <div className="view on">
<div className="hero">
        <div className="hero-title">Clarity · CRO</div>
        <div className="hero-sub">Friction analysis · recomendaciones quirúrgicas por componente · sesiones grabadas</div>
      </div>

      <div className="kpis">
        <div className="kpi k-clarity"><div className="kpi-lbl">Sesiones analizadas</div><div className="kpi-val">63,420</div><div className="kpi-bot"><span className="dcmp">100% cobertura</span></div></div>
        <div className="kpi k-amber"><div className="kpi-lbl">Dead clicks</div><div className="kpi-val">18.3%</div><div className="kpi-bot"><span className="kpi-delta tgd">+2.1pp</span><span className="dcmp">alto vs 12% bench</span></div></div>
        <div className="kpi k-amber"><div className="kpi-lbl">Rage clicks</div><div className="kpi-val">4.7%</div><div className="kpi-bot"><span className="kpi-delta tgu">−0.8pp</span><span className="dcmp">mejora</span></div></div>
        <div className="kpi k-clarity"><div className="kpi-lbl">Quick-backs</div><div className="kpi-val">14.2%</div><div className="kpi-bot"><span className="kpi-delta tgd">+1.8pp</span><span className="dcmp">señal de confusión</span></div></div>
      </div>

      {/* Páginas con friction score */}
      <div className="card" style={{marginTop:'20px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
          <h3 style={{margin:'0',fontSize:'15px'}}>Friction score por página</h3>
          <span className="period-pill">Score = dead + rage + quick-back ponderado</span>
        </div>
        <table className="t">
          <thead><tr><th>Página</th><th>Sesiones</th><th>Dead</th><th>Rage</th><th>Quick-back</th><th>Friction</th></tr></thead>
          <tbody>
            <tr><td><b>/checkout</b></td><td>3,210</td><td><span className="tg tgd">31.8%</span></td><td><span className="tg tgd">12.4%</span></td><td><span className="tg tgd">24%</span></td><td><div className="hb"><span className="hb-fill" style={{width:'92%',background:'#ef4444'}}></span></div></td></tr>
            <tr><td><b>/carrito</b></td><td>4,180</td><td><span className="tg tgd">28.4%</span></td><td><span className="tg tgd">9.7%</span></td><td><span className="tg tgd">22%</span></td><td><div className="hb"><span className="hb-fill" style={{width:'78%',background:'#ef4444'}}></span></div></td></tr>
            <tr><td><b>/producto/nike-air-max</b></td><td>8,420</td><td><span className="tg tgd">24.1%</span></td><td><span className="tg tgd">7.2%</span></td><td><span className="tg tgm">18%</span></td><td><div className="hb"><span className="hb-fill" style={{width:'64%',background:'#fbbf24'}}></span></div></td></tr>
            <tr><td>/categoria/sneakers</td><td>12,840</td><td><span className="tg tgm">15.2%</span></td><td><span className="tg tgu">3.1%</span></td><td><span className="tg tgm">12%</span></td><td><div className="hb"><span className="hb-fill" style={{width:'32%',background:'#fbbf24'}}></span></div></td></tr>
            <tr><td>/home</td><td>18,240</td><td><span className="tg tgu">12.1%</span></td><td><span className="tg tgu">2.8%</span></td><td><span className="tg tgu">8%</span></td><td><div className="hb"><span className="hb-fill" style={{width:'18%',background:'#22d97a'}}></span></div></td></tr>
          </tbody>
        </table>
      </div>

      {/* Recomendaciones quirúrgicas por componente */}
      <div className="card" style={{marginTop:'20px'}}>
        <h3 style={{margin:'0 0 16px 0',fontSize:'15px'}}>Recomendaciones quirúrgicas · por componente</h3>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
          <div style={{padding:'14px',background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderLeft:'3px solid #ef4444',borderRadius:'8px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}><span className="pl pl-n" style={{background:'rgba(239,68,68,0.15)',color:'#ef4444'}}>CRÍTICO</span><span style={{fontSize:'10px',color:'var(--mu)'}}>/checkout</span></div>
            <div style={{fontSize:'13px',fontWeight:'600'}}>Input teléfono rechaza formatos válidos</div>
            <div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px',lineHeight:'1.5'}}>Rage clicks 12.4% concentrados en <code style={{background:'rgba(139,92,246,0.1)',padding:'1px 4px',borderRadius:'3px',fontSize:'10px'}}>#phone</code> · 420 sesiones abandonan en el campo · la regex exige formato +52 explícito</div>
            <div style={{marginTop:'8px'}}><button className="agent-opp-btn" style={{fontSize:'10px'}}>Ver 3 grabaciones →</button></div>
          </div>

          <div style={{padding:'14px',background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderLeft:'3px solid #ef4444',borderRadius:'8px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}><span className="pl pl-n" style={{background:'rgba(239,68,68,0.15)',color:'#ef4444'}}>CRÍTICO</span><span style={{fontSize:'10px',color:'var(--mu)'}}>/carrito</span></div>
            <div style={{fontSize:'13px',fontWeight:'600'}}>Botón "Continuar" se ve inactivo</div>
            <div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px',lineHeight:'1.5'}}>Dead clicks 28.4% apuntan al CTA principal · bajo contraste (2.1:1) · usuarios no perciben que es clickeable</div>
            <div style={{marginTop:'8px'}}><button className="agent-opp-btn" style={{fontSize:'10px'}}>Ver mockup fix →</button></div>
          </div>

          <div style={{padding:'14px',background:'rgba(251,191,36,0.06)',border:'1px solid rgba(251,191,36,0.2)',borderLeft:'3px solid #fbbf24',borderRadius:'8px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}><span className="pl" style={{background:'rgba(251,191,36,0.15)',color:'#fbbf24'}}>ALTO</span><span style={{fontSize:'10px',color:'var(--mu)'}}>/producto/*</span></div>
            <div style={{fontSize:'13px',fontWeight:'600'}}>Selector de talla no es sticky en móvil</div>
            <div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px',lineHeight:'1.5'}}>72% del tráfico es móvil · cuando el usuario scrollea a reviews, pierde el selector · quick-back del 18%</div>
            <div style={{marginTop:'8px'}}><button className="agent-opp-btn" style={{fontSize:'10px'}}>Ver recomendación →</button></div>
          </div>

          <div style={{padding:'14px',background:'rgba(251,191,36,0.06)',border:'1px solid rgba(251,191,36,0.2)',borderLeft:'3px solid #fbbf24',borderRadius:'8px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}><span className="pl" style={{background:'rgba(251,191,36,0.15)',color:'#fbbf24'}}>ALTO</span><span style={{fontSize:'10px',color:'var(--mu)'}}>/producto/*</span></div>
            <div style={{fontSize:'13px',fontWeight:'600'}}>CTA "añadir al carrito" debajo del fold</div>
            <div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px',lineHeight:'1.5'}}>Solo 12% ven el CTA final · scroll depth 68% promedio · subir a above-the-fold con talla inline</div>
            <div style={{marginTop:'8px'}}><button className="agent-opp-btn" style={{fontSize:'10px'}}>Ver wireframe →</button></div>
          </div>

          <div style={{padding:'14px',background:'rgba(56,189,248,0.06)',border:'1px solid rgba(56,189,248,0.2)',borderLeft:'3px solid #38bdf8',borderRadius:'8px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}><span className="pl pl-ga4">MEDIO</span><span style={{fontSize:'10px',color:'var(--mu)'}}>/checkout</span></div>
            <div style={{fontSize:'13px',fontWeight:'600'}}>Método de pago abre modal que se pierde</div>
            <div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px',lineHeight:'1.5'}}>Dead clicks 8.2% en área vacía después de modal de OXXO · cerrar modal no restaura scroll position</div>
            <div style={{marginTop:'8px'}}><button className="agent-opp-btn" style={{fontSize:'10px'}}>Ver grabación →</button></div>
          </div>

          <div style={{padding:'14px',background:'rgba(56,189,248,0.06)',border:'1px solid rgba(56,189,248,0.2)',borderLeft:'3px solid #38bdf8',borderRadius:'8px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}><span className="pl pl-ga4">MEDIO</span><span style={{fontSize:'10px',color:'var(--mu)'}}>/carrito</span></div>
            <div style={{fontSize:'13px',fontWeight:'600'}}>Cupón con campo de texto confuso</div>
            <div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px',lineHeight:'1.5'}}>142 sesiones intentaron pegar texto sin éxito · placeholder "INGRESA CÓDIGO" no indica formato</div>
            <div style={{marginTop:'8px'}}><button className="agent-opp-btn" style={{fontSize:'10px'}}>Sugerencia UX →</button></div>
          </div>
        </div>
      </div>

      {/* Agente CRO Senior */}
      <div className="agent a-clarity">
        <div className="agent-header">
          <div className="agent-identity">
            <div className="agent-avatar">◉</div>
            <div>
              <div className="agent-role">Agente CRO Senior</div>
              <div className="agent-sub">Quirúrgico · recomendaciones por componente · session replay analyst</div>
            </div>
          </div>
          <div className="agent-meta">
            <span className="agent-sev hi">Prioridad alta</span>
            <span className="agent-time">12 grabaciones revisadas</span>
          </div>
        </div>
        <div className="agent-body">
          <div className="agent-section">
            <div className="agent-section-h">Diagnóstico</div>
            <div className="agent-diag">
              <b>/checkout es el punto de mayor pérdida</b> (friction score 92%). El problema no es uno, son dos bugs de UX acumulados: <b>input de teléfono rechaza formatos válidos</b> (420 abandonos documentados) y <b>botón "Continuar" con contraste 2.1:1</b> se percibe como inactivo. Arreglar ambos destraba 36% del drop checkout. En móvil el <b>selector de talla no es sticky</b> y 72% del tráfico móvil pierde contexto.
            </div>
          </div>
          <div className="agent-section">
            <div className="agent-section-h">Oportunidades quirúrgicas</div>
            <div className="agent-opps">
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Arreglar regex de input teléfono en checkout</div>
                  <div className="agent-opp-sub">Aceptar +52, 52, 10 dígitos sin prefijo · 1-2 hrs de dev</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$18K</div><div className="agent-opp-impact-sub">inmediato</div></div>
                  <button className="agent-opp-btn">Ticket →</button>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Subir contraste CTA "Continuar" (2.1:1 → 7:1)</div>
                  <div className="agent-opp-sub">Color actual #A1A1A1 sobre blanco · cambiar a violeta principal</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$10K</div><div className="agent-opp-impact-sub">inmediato</div></div>
                  <button className="agent-opp-btn">Ticket →</button>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Hacer selector de talla sticky en móvil</div>
                  <div className="agent-opp-sub">Flotar al hacer scroll · 72% del tráfico es móvil</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$14K</div><div className="agent-opp-impact-sub">mes siguiente</div></div>
                  <button className="agent-opp-btn">Ticket →</button>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Subir CTA "añadir al carrito" al fold</div>
                  <div className="agent-opp-sub">Solo 12% ven el CTA actual · mover + talla inline</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$28K</div><div className="agent-opp-impact-sub">mes siguiente</div></div>
                  <button className="agent-opp-btn">Wireframe →</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
