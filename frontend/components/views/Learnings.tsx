import { Agent } from '@/components/ui/Agent';
import { Card, Hero, HeroSimple, CardHeader } from '@/components/ui/Card';
import { KpiCard, HeroStat } from '@/components/ui/KpiCard';
import { Thumbnail, Hierarchy } from '@/components/ui/Thumbnail';
import { DimensionTable, MetricFilter, CmpCell } from '@/components/ui/DimensionTable';
import { ChartWithTooltip } from '@/components/ui/ChartWithTooltip';

export function Learnings() {
  return (
    <div className="view on">
<div className="hero">
        <div className="hero-title">Aprendizajes acumulados</div>
        <div className="hero-sub">Biblioteca de insights validados por cliente · 47 aprendizajes YTD</div>
      </div>

      <div className="r4">
        <div className="kpi k-violet"><div className="kpi-lbl">Total aprendizajes</div><div className="kpi-val">47</div></div>
        <div className="kpi k-green"><div className="kpi-lbl">Validados</div><div className="kpi-val">34</div></div>
        <div className="kpi k-amber"><div className="kpi-lbl">Refutados</div><div className="kpi-val">8</div></div>
        <div className="kpi k-sky"><div className="kpi-lbl">En proceso</div><div className="kpi-val">5</div></div>
      </div>

      <div className="r2" style={{marginTop:'20px'}}>
        <div className="card">
          <h3 style={{margin:'0 0 16px 0',fontSize:'15px'}}>Top insights validados · creativos</h3>
          <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
            <div style={{padding:'12px',background:'rgba(139,92,246,0.06)',border:'1px solid rgba(139,92,246,0.2)',borderRadius:'8px'}}>
              <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'6px'}}><span className="pl pl-meta">Meta</span><span style={{fontSize:'11px',color:'#22d97a',fontWeight:'600'}}>✓ VALIDADO · 99% conf.</span></div>
              <div style={{fontSize:'12px',fontWeight:'600'}}>UGC en primeros 3s mejora hook rate +18pp</div>
              <div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>Muestra: 8 anuncios · confirmado en 3 cuentas distintas</div>
            </div>
            <div style={{padding:'12px',background:'rgba(139,92,246,0.06)',border:'1px solid rgba(139,92,246,0.2)',borderRadius:'8px'}}>
              <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'6px'}}><span className="pl pl-meta">Meta</span><span style={{fontSize:'11px',color:'#22d97a',fontWeight:'600'}}>✓ VALIDADO · 95% conf.</span></div>
              <div style={{fontSize:'12px',fontWeight:'600'}}>Videos 15s superan 30s en retención 75%</div>
              <div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>28.4% vs 18.2% · muestra 15 anuncios</div>
            </div>
            <div style={{padding:'12px',background:'rgba(139,92,246,0.06)',border:'1px solid rgba(139,92,246,0.2)',borderRadius:'8px'}}>
              <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'6px'}}><span className="pl pl-tiktok">TikTok</span><span style={{fontSize:'11px',color:'#22d97a',fontWeight:'600'}}>✓ VALIDADO</span></div>
              <div style={{fontSize:'12px',fontWeight:'600'}}>Spark Ads superan In-feed en VTR (+20pp)</div>
              <div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>52% vs 32% · formato nativo gana</div>
            </div>
            <div style={{padding:'12px',background:'rgba(139,92,246,0.06)',border:'1px solid rgba(139,92,246,0.2)',borderRadius:'8px'}}>
              <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'6px'}}><span className="pl pl-meta">Meta</span><span style={{fontSize:'11px',color:'#22d97a',fontWeight:'600'}}>✓ VALIDADO · 99% conf.</span></div>
              <div style={{fontSize:'12px',fontWeight:'600'}}>CTA "Ver colección" &gt; "Comprar ahora" en cold</div>
              <div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>+24% CTR · 12 anuncios</div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{margin:'0 0 16px 0',fontSize:'15px'}}>Top insights validados · ecommerce</h3>
          <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
            <div style={{padding:'12px',background:'rgba(139,92,246,0.06)',border:'1px solid rgba(139,92,246,0.2)',borderRadius:'8px'}}>
              <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'6px'}}><span className="pl pl-google">Google Ads</span><span style={{fontSize:'11px',color:'#22d97a',fontWeight:'600'}}>✓ VALIDADO</span></div>
              <div style={{fontSize:'12px',fontWeight:'600'}}>Best Sellers en asset group aislado +32% ROAS</div>
              <div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>PMAX con separación de catálogo</div>
            </div>
            <div style={{padding:'12px',background:'rgba(139,92,246,0.06)',border:'1px solid rgba(139,92,246,0.2)',borderRadius:'8px'}}>
              <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'6px'}}><span className="pl pl-shopify">Shopify</span><span style={{fontSize:'11px',color:'#22d97a',fontWeight:'600'}}>✓ VALIDADO</span></div>
              <div style={{fontSize:'12px',fontWeight:'600'}}>Envío gratis desde $500 reduce abandono 14pp</div>
              <div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>AOV sube $38 · rentable</div>
            </div>
            <div style={{padding:'12px',background:'rgba(139,92,246,0.06)',border:'1px solid rgba(139,92,246,0.2)',borderRadius:'8px'}}>
              <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'6px'}}><span className="pl pl-clarity">CRO</span><span style={{fontSize:'11px',color:'#22d97a',fontWeight:'600'}}>✓ VALIDADO</span></div>
              <div style={{fontSize:'12px',fontWeight:'600'}}>Selector de talla sticky móvil +18% add-to-cart</div>
              <div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>Clarity detectó dead clicks en componente estático</div>
            </div>
            <div style={{padding:'12px',background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:'8px'}}>
              <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'6px'}}><span className="pl pl-meta">Meta</span><span style={{fontSize:'11px',color:'#ef4444',fontWeight:'600'}}>✗ REFUTADO</span></div>
              <div style={{fontSize:'12px',fontWeight:'600'}}>Precio tachado NO aumenta CTR en esta categoría</div>
              <div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>Efecto −3.2pp · audiencia percibe "descuento agresivo"</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{marginTop:'20px'}}>
        <h3 style={{margin:'0 0 16px 0',fontSize:'15px'}}>Timeline de aprendizajes 2026</h3>
        <div style={{display:'flex',gap:'8px',alignItems:'flex-end',height:'120px',overflowX:'auto',padding:'12px 0'}}>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'6px',minWidth:'60px'}}><div style={{width:'32px',background:'linear-gradient(180deg,#8b5cf6,#a78bfa)',height:'30%',borderRadius:'4px'}}></div><div style={{fontSize:'10px',color:'var(--mu)'}}>Ene</div><div style={{fontSize:'11px',fontWeight:'600'}}>3</div></div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'6px',minWidth:'60px'}}><div style={{width:'32px',background:'linear-gradient(180deg,#8b5cf6,#a78bfa)',height:'50%',borderRadius:'4px'}}></div><div style={{fontSize:'10px',color:'var(--mu)'}}>Feb</div><div style={{fontSize:'11px',fontWeight:'600'}}>5</div></div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'6px',minWidth:'60px'}}><div style={{width:'32px',background:'linear-gradient(180deg,#8b5cf6,#a78bfa)',height:'70%',borderRadius:'4px'}}></div><div style={{fontSize:'10px',color:'var(--mu)'}}>Mar</div><div style={{fontSize:'11px',fontWeight:'600'}}>8</div></div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'6px',minWidth:'60px'}}><div style={{width:'32px',background:'linear-gradient(180deg,#8b5cf6,#a78bfa)',height:'100%',borderRadius:'4px',boxShadow:'0 0 0 2px var(--acc)'}}></div><div style={{fontSize:'10px',color:'var(--acc2)',fontWeight:'600'}}>Abr</div><div style={{fontSize:'11px',fontWeight:'600'}}>12</div></div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'6px',minWidth:'60px',opacity:'.4'}}><div style={{width:'32px',background:'rgba(255,255,255,0.1)',height:'20%',borderRadius:'4px'}}></div><div style={{fontSize:'10px',color:'var(--mu)'}}>May</div><div style={{fontSize:'11px',color:'var(--mu)'}}>—</div></div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'6px',minWidth:'60px',opacity:'.4'}}><div style={{width:'32px',background:'rgba(255,255,255,0.1)',height:'20%',borderRadius:'4px'}}></div><div style={{fontSize:'10px',color:'var(--mu)'}}>Jun</div><div style={{fontSize:'11px',color:'var(--mu)'}}>—</div></div>
        </div>
        <div style={{marginTop:'8px',fontSize:'12px',color:'var(--mu)'}}>Velocidad de aprendizaje creciendo · abril récord con 12 aprendizajes validados</div>
      </div>

      {/* Agente Insights Librarian */}
      <div className="agent">
        <div className="agent-header">
          <div className="agent-identity">
            <div className="agent-avatar">📚</div>
            <div>
              <div className="agent-role">Agente Insights Librarian</div>
              <div className="agent-sub">Curador de aprendizajes · aplica patrones cross-cliente · detecta duplicados</div>
            </div>
          </div>
          <div className="agent-meta">
            <span className="agent-sev lo">Prioridad baja</span>
            <span className="agent-time">47 insights catalogados</span>
          </div>
        </div>
        <div className="agent-body">
          <div className="agent-section">
            <div className="agent-section-h">Diagnóstico</div>
            <div className="agent-diag">
              La biblioteca está <b>65% activa</b> — 34 de 47 aprendizajes validados se están aplicando actualmente. Los <b>8 refutados</b> son igual de valiosos: evitan que la agencia repita tests perdidos. Patrón emergente cross-cliente: <b>UGC en primeros 3 segundos gana en sneakers, calzado deportivo y apparel</b> — formalizar como regla estándar de briefings creativos.
            </div>
          </div>
          <div className="agent-section">
            <div className="agent-section-h">Próximas acciones</div>
            <div className="agent-opps">
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Formalizar "Regla UGC 3s" como playbook</div>
                  <div className="agent-opp-sub">Validada en 3 cuentas distintas · aplicar a todos los briefings</div>
                </div>
                <div className="agent-opp-meta">
                  <button className="agent-opp-btn">Documentar →</button>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Re-testear "Videos 15s&gt;30s" en Demand Gen</div>
                  <div className="agent-opp-sub">Validado en Meta/TikTok · falta confirmar en YouTube</div>
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
