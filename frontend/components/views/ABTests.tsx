import { Agent } from '@/components/ui/Agent';
import { Card, Hero, HeroSimple, CardHeader } from '@/components/ui/Card';
import { KpiCard, HeroStat } from '@/components/ui/KpiCard';
import { Thumbnail, Hierarchy } from '@/components/ui/Thumbnail';
import { DimensionTable, MetricFilter, CmpCell } from '@/components/ui/DimensionTable';
import { ChartWithTooltip } from '@/components/ui/ChartWithTooltip';

export function ABTests() {
  return (
    <div className="view on">
<div className="hero">
        <div className="hero-title">A/B tests en curso</div>
        <div className="hero-sub">Experimentos vivos · creativos, landing, checkout</div>
      </div>
      <div className="kpis">
        <div className="kpi k-violet"><div className="kpi-lbl">Tests activos</div><div className="kpi-val">7</div><div className="kpi-bot"><span style={{fontSize:'11px',color:'var(--mu)'}}>3 creativo · 2 landing · 2 CRO</span></div></div>
        <div className="kpi k-green"><div className="kpi-lbl">Tests completados YTD</div><div className="kpi-val">34</div><div className="kpi-bot"><span style={{fontSize:'11px',color:'var(--mu)'}}>22 ganadores · 65% tasa</span></div></div>
        <div className="kpi k-sky"><div className="kpi-lbl">Sample size prom</div><div className="kpi-val">8,420</div><div className="kpi-bot"><span style={{fontSize:'11px',color:'var(--mu)'}}>por variante</span></div></div>
        <div className="kpi k-amber"><div className="kpi-lbl">Tiempo prom test</div><div className="kpi-val">14 días</div><div className="kpi-bot"><span style={{fontSize:'11px',color:'var(--mu)'}}>hasta significancia</span></div></div>
      </div>

      <div className="card" style={{marginTop:'20px'}}>
        <h3 style={{margin:'0 0 16px 0',fontSize:'15px'}}>Tests en curso</h3>
        <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
          {/* Test 1 */}
          <div style={{padding:'18px',background:'var(--bg)',border:'1px solid var(--br)',borderRadius:'10px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'12px',gap:'16px',flexWrap:'wrap'}}>
              <div style={{flex:'1',minWidth:'260px'}}>
                <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'4px'}}><span className="pl pl-meta">Meta</span><span className="pl pl-n">Creativo</span><span className="pri pri-hi">Alta prioridad</span></div>
                <div style={{fontSize:'14px',fontWeight:'600'}}>Hook UGC vs Hook Producto Hero</div>
                <div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>Hipótesis: UGC outperforma creativo de estudio en cold audience</div>
              </div>
              <div style={{textAlign:'right'}}><div style={{fontSize:'11px',color:'var(--mu)'}}>Día 8/14</div><div style={{fontSize:'18px',fontFamily:'\'Space Grotesk\'',fontWeight:'600',color:'#22d97a'}}>97%</div><div style={{fontSize:'10px',color:'var(--mu)'}}>confianza</div></div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
              <div style={{padding:'10px',background:'rgba(34,217,122,0.08)',borderLeft:'3px solid #22d97a',borderRadius:'6px'}}><div style={{fontSize:'11px',color:'#22d97a',fontWeight:'600'}}>GANANDO · Variante A</div><div style={{fontSize:'12px',marginTop:'4px'}}>UGC · "Ya no camino igual"</div><div style={{display:'flex',gap:'14px',marginTop:'6px',fontSize:'11px'}}><span>Hook <b>52.3%</b></span><span>CTR <b>3.4%</b></span><span>ROAS <b>5.12x</b></span></div></div>
              <div style={{padding:'10px',background:'rgba(255,255,255,0.02)',borderLeft:'3px solid var(--mu)',borderRadius:'6px'}}><div style={{fontSize:'11px',color:'var(--mu)',fontWeight:'600'}}>Variante B</div><div style={{fontSize:'12px',marginTop:'4px'}}>Studio · Producto hero</div><div style={{display:'flex',gap:'14px',marginTop:'6px',fontSize:'11px'}}><span>Hook <b>34.8%</b></span><span>CTR <b>2.1%</b></span><span>ROAS <b>3.41x</b></span></div></div>
            </div>
          </div>

          {/* Test 2 */}
          <div style={{padding:'18px',background:'var(--bg)',border:'1px solid var(--br)',borderRadius:'10px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'12px',gap:'16px',flexWrap:'wrap'}}>
              <div style={{flex:'1',minWidth:'260px'}}>
                <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'4px'}}><span className="pl pl-shopify">Shopify</span><span className="pl pl-n">Landing</span><span className="pri pri-me">Media</span></div>
                <div style={{fontSize:'14px',fontWeight:'600'}}>CTA encima del fold vs después de galería</div>
                <div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>Hipótesis: subir "añadir al carrito" aumenta conversión +15%</div>
              </div>
              <div style={{textAlign:'right'}}><div style={{fontSize:'11px',color:'var(--mu)'}}>Día 5/14</div><div style={{fontSize:'18px',fontFamily:'\'Space Grotesk\'',fontWeight:'600',color:'#fbbf24'}}>73%</div><div style={{fontSize:'10px',color:'var(--mu)'}}>confianza</div></div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
              <div style={{padding:'10px',background:'rgba(251,191,36,0.08)',borderLeft:'3px solid #fbbf24',borderRadius:'6px'}}><div style={{fontSize:'11px',color:'#fbbf24',fontWeight:'600'}}>VARIANTE A</div><div style={{fontSize:'12px',marginTop:'4px'}}>CTA above fold</div><div style={{display:'flex',gap:'14px',marginTop:'6px',fontSize:'11px'}}><span>CR <b>2.74%</b></span><span>AOV <b>$418</b></span></div></div>
              <div style={{padding:'10px',background:'rgba(255,255,255,0.02)',borderLeft:'3px solid var(--mu)',borderRadius:'6px'}}><div style={{fontSize:'11px',color:'var(--mu)',fontWeight:'600'}}>Control (original)</div><div style={{fontSize:'12px',marginTop:'4px'}}>CTA después de galería</div><div style={{display:'flex',gap:'14px',marginTop:'6px',fontSize:'11px'}}><span>CR <b>2.26%</b></span><span>AOV <b>$410</b></span></div></div>
            </div>
          </div>

          {/* Test 3 */}
          <div style={{padding:'18px',background:'var(--bg)',border:'1px solid var(--br)',borderRadius:'10px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'12px',gap:'16px',flexWrap:'wrap'}}>
              <div style={{flex:'1',minWidth:'260px'}}>
                <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'4px'}}><span className="pl pl-shopify">Shopify</span><span className="pl pl-n">Checkout</span><span className="pri pri-me">Media</span></div>
                <div style={{fontSize:'14px',fontWeight:'600'}}>Checkout una página vs multi-paso</div>
                <div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>Hipótesis: simplificar reduce abandono del 61% actual</div>
              </div>
              <div style={{textAlign:'right'}}><div style={{fontSize:'11px',color:'var(--mu)'}}>Día 3/14</div><div style={{fontSize:'18px',fontFamily:'\'Space Grotesk\'',fontWeight:'600',color:'var(--mu)'}}>42%</div><div style={{fontSize:'10px',color:'var(--mu)'}}>confianza</div></div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
              <div style={{padding:'10px',background:'rgba(255,255,255,0.02)',borderLeft:'3px solid var(--mu)',borderRadius:'6px'}}><div style={{fontSize:'11px',color:'var(--mu)',fontWeight:'600'}}>Variante A</div><div style={{fontSize:'12px',marginTop:'4px'}}>One-page</div><div style={{display:'flex',gap:'14px',marginTop:'6px',fontSize:'11px'}}><span>Comp <b>42.1%</b></span></div></div>
              <div style={{padding:'10px',background:'rgba(255,255,255,0.02)',borderLeft:'3px solid var(--mu)',borderRadius:'6px'}}><div style={{fontSize:'11px',color:'var(--mu)',fontWeight:'600'}}>Control</div><div style={{fontSize:'12px',marginTop:'4px'}}>Multi-step</div><div style={{display:'flex',gap:'14px',marginTop:'6px',fontSize:'11px'}}><span>Comp <b>39.4%</b></span></div></div>
            </div>
          </div>
        </div>
      </div>

      {/* Agente Experimentation Lead */}
      <div className="agent">
        <div className="agent-header">
          <div className="agent-identity">
            <div className="agent-avatar">🧪</div>
            <div>
              <div className="agent-role">Agente Experimentation Lead</div>
              <div className="agent-sub">Statistical rigor · test prioritization · velocity de aprendizaje</div>
            </div>
          </div>
          <div className="agent-meta">
            <span className="agent-sev me">Prioridad media</span>
            <span className="agent-time">7 tests activos</span>
          </div>
        </div>
        <div className="agent-body">
          <div className="agent-section">
            <div className="agent-section-h">Diagnóstico</div>
            <div className="agent-diag">
              Velocidad de experimentación saludable: <b>7 tests activos</b> con promedio de 14 días a significancia. La tasa de ganadores histórica <b>65%</b> está por encima de industria (30%) — buena señal de que priorizan bien las hipótesis. El test <b>Hook UGC vs Producto Hero está casi listo</b> (97% confianza día 8) — podrías cerrar y escalar ganador. <b>Checkout one-page vs multi-step</b> requiere más sample (día 3 con 42% confianza): al menos 10 días más para conclusión sólida.
            </div>
          </div>
          <div className="agent-section">
            <div className="agent-section-h">Recomendaciones</div>
            <div className="agent-opps">
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Cerrar test Hook UGC vs Producto Hero (97% conf.)</div>
                  <div className="agent-opp-sub">UGC gana por 5.12× vs 3.41× ROAS · escalar ganador</div>
                </div>
                <div className="agent-opp-meta">
                  <button className="agent-opp-btn">Declarar →</button>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Lanzar test de bundle "Air Max + Socks"</div>
                  <div className="agent-opp-sub">AOV potencial +$120 · hipótesis de cross-sell con anchor top 1</div>
                </div>
                <div className="agent-opp-meta">
                  <button className="agent-opp-btn">Diseñar →</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
