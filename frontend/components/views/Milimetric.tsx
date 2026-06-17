import { Agent } from '@/components/ui/Agent';
import { Card, Hero, HeroSimple, CardHeader } from '@/components/ui/Card';
import { KpiCard, HeroStat } from '@/components/ui/KpiCard';
import { Thumbnail, Hierarchy } from '@/components/ui/Thumbnail';
import { DimensionTable, MetricFilter, CmpCell } from '@/components/ui/DimensionTable';
import { ChartWithTooltip } from '@/components/ui/ChartWithTooltip';

export function Milimetric() {
  return (
    <div className="view on">
<div className="hero">
        <div className="hero-title">Análisis milimétrico · creativos</div>
        <div className="hero-sub">Hook rate + curva retención por anuncio · identificación de jerarquía completa</div>
      </div>

      <div className="kpis">
        <div className="kpi k-violet"><div className="kpi-lbl">Hook rate prom</div><div className="kpi-val">34.2%</div><div className="kpi-bot"><span className="kpi-delta tgu">+5.8pp</span><span className="dcmp">umbral <b>30%</b></span></div></div>
        <div className="kpi k-sky"><div className="kpi-lbl">Retención 50%</div><div className="kpi-val">54.8%</div><div className="kpi-bot"><span className="kpi-delta tgu">+3.2pp</span><span className="dcmp">bench <b>50%</b></span></div></div>
        <div className="kpi k-amber"><div className="kpi-lbl">Retención 75%</div><div className="kpi-val">28.4%</div><div className="kpi-bot"><span className="kpi-delta tgd">−1.1pp</span><span className="dcmp">crítico</span></div></div>
        <div className="kpi k-green"><div className="kpi-lbl">Creativos analizados</div><div className="kpi-val">47</div><div className="kpi-bot"><span className="dcmp">16 Meta · 18 TikTok · 13 YouTube</span></div></div>
      </div>

      {/* Toggle tabla/galería + curva global */}
      <div className="card" style={{marginTop:'20px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px',flexWrap:'wrap',gap:'12px'}}>
          <div>
            <h3 style={{margin:'0',fontSize:'15px'}}>Creativos con jerarquía completa</h3>
            <div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>Campaña › Ad Set › Anuncio con curva de retención individual</div>
          </div>
          <div className="vtoggle">
            <button className="on">☰ Tabla</button>
            <button>▦ Galería</button>
          </div>
        </div>

        {/* Tabla con retención embebida */}
        <div id="mili-tbl">
          <table className="t">
            <thead><tr><th></th><th>Jerarquía</th><th>Hook</th><th>Ret 25%</th><th>Ret 50%</th><th>Ret 75%</th><th>Curva</th><th>ROAS</th></tr></thead>
            <tbody>
              <tr>
                <td><div className="thumb g1"></div></td>
                <td><div className="hier"><div className="hier-l1">Meta · Ecom Best Sellers › Advantage+ Shopping</div><div className="hier-l3">Nike AM UGC · "Ya no camino igual"</div></div></td>
                <td><span className="tg tgu"><b>52%</b></span></td><td>48%</td><td>32%</td><td>28%</td>
                <td><svg width="100" height="28"><polyline points="2,4 27,12 52,15 77,21 98,23" fill="none" stroke="#22d97a" strokeWidth="2"/></svg></td>
                <td><span className="tg tgu"><b>5.12×</b></span></td>
              </tr>
              <tr>
                <td><div className="thumb g2"></div></td>
                <td><div className="hier"><div className="hier-l1">Meta · Ecom Best Sellers › Advantage+ Shopping</div><div className="hier-l3">Jordan Retro · "Sin filas, sin reseller"</div></div></td>
                <td><span className="tg tgu"><b>42%</b></span></td><td>36%</td><td>22%</td><td>15%</td>
                <td><svg width="100" height="28"><polyline points="2,4 27,16 52,20 77,24 98,26" fill="none" stroke="#22d97a" strokeWidth="2"/></svg></td>
                <td><span className="tg tgu"><b>4.21×</b></span></td>
              </tr>
              <tr>
                <td><div className="thumb g3"></div></td>
                <td><div className="hier"><div className="hier-l1">Meta · Prospecting › Cold 18-35</div><div className="hier-l3">Adidas Samba · "Mismo precio, original"</div></div></td>
                <td><span className="tg tgm"><b>38%</b></span></td><td>28%</td><td>19%</td><td>10%</td>
                <td><svg width="100" height="28"><polyline points="2,4 27,18 52,22 77,25 98,27" fill="none" stroke="#fbbf24" strokeWidth="2"/></svg></td>
                <td><b>3.12×</b></td>
              </tr>
              <tr>
                <td><div className="thumb g4"></div></td>
                <td><div className="hier"><div className="hier-l1">Meta · Prospecting › Cold 25-45</div><div className="hier-l3">NB 530 · "Por fin entiendo el hype"</div></div></td>
                <td><span className="tg tgm"><b>31%</b></span></td><td>22%</td><td>14%</td><td>9%</td>
                <td><svg width="100" height="28"><polyline points="2,4 27,20 52,23 77,26 98,27" fill="none" stroke="#fbbf24" strokeWidth="2"/></svg></td>
                <td><b>2.87×</b></td>
              </tr>
              <tr>
                <td><div className="thumb g5"></div></td>
                <td><div className="hier"><div className="hier-l1">TikTok · Ecom MX › Interest Sneakers</div><div className="hier-l3">Spark Ad · Nike AM unboxing (creator @sofiakiks)</div></div></td>
                <td><span className="tg tgu"><b>52%</b></span></td><td>38%</td><td>28%</td><td>22%</td>
                <td><svg width="100" height="28"><polyline points="2,4 27,12 52,17 77,22 98,24" fill="none" stroke="#22d97a" strokeWidth="2"/></svg></td>
                <td><span className="tg tgu"><b>3.82×</b></span></td>
              </tr>
              <tr>
                <td><div className="thumb g6"></div></td>
                <td><div className="hier"><div className="hier-l1">TikTok · Ecom MX › Interest Sneakers</div><div className="hier-l3">In-feed · Jordan Retro review</div></div></td>
                <td><span className="tg tgm"><b>42%</b></span></td><td>32%</td><td>22%</td><td>14%</td>
                <td><svg width="100" height="28"><polyline points="2,4 27,16 52,20 77,25 98,26" fill="none" stroke="#fbbf24" strokeWidth="2"/></svg></td>
                <td><b>2.98×</b></td>
              </tr>
              <tr>
                <td><div className="thumb g7"></div></td>
                <td><div className="hier"><div className="hier-l1">YouTube · Awareness Jordan › Afinidad Basket</div><div className="hier-l3">Hero spot 15s · Jordan drop</div></div></td>
                <td><span className="tg tgm"><b>41%</b></span></td><td>34%</td><td>21%</td><td>16%</td>
                <td><svg width="100" height="28"><polyline points="2,4 27,15 52,19 77,24 98,25" fill="none" stroke="#fbbf24" strokeWidth="2"/></svg></td>
                <td><b>2.87×</b></td>
              </tr>
              <tr>
                <td><div className="thumb g8"></div></td>
                <td><div className="hier"><div className="hier-l1">Meta · Prospecting › Cold 18-24</div><div className="hier-l3">Yeezy · "Lo mismo por menos" <span style={{color:'#ef4444',fontSize:'10px'}}>· BAJO</span></div></div></td>
                <td><span className="tg tgd"><b>22%</b></span></td><td>15%</td><td>8%</td><td>4%</td>
                <td><svg width="100" height="28"><polyline points="2,4 27,22 52,25 77,27 98,27" fill="none" stroke="#ef4444" strokeWidth="2"/></svg></td>
                <td style={{color:'#ef4444'}}><b>1.42×</b></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Galería con curva expandida por card */}
        <div id="mili-gal" style={{display:'none'}}>
          <div className="cgrid">
            <div className="ccard"><div className="ccard-media"><div className="thumb g1"></div><div className="ccard-badge good">Hook 52%</div></div><div className="ccard-body"><div className="ccard-hier">Meta · Best Sellers › Adv+</div><div className="ccard-title">Nike AM UGC · "Ya no camino igual"</div><svg viewBox="0 0 200 60" style={{width:'100%',height:'50px',marginBottom:'8px'}}><polyline points="5,8 55,24 105,30 155,42 195,46" fill="none" stroke="#22d97a" strokeWidth="2"/><text x="5" y="58" style={{fontSize:'9px',fill:'var(--mu)'}}>0%</text><text x="195" y="58" style={{fontSize:'9px',fill:'var(--mu)'}} textAnchor="end">95%</text></svg><div className="ccard-metrics"><div className="ccard-m"><div className="ccard-m-lbl">Ret 75%</div><div className="ccard-m-val">32%</div></div><div className="ccard-m"><div className="ccard-m-lbl">ROAS</div><div className="ccard-m-val">5.12×</div></div></div></div></div>
            <div className="ccard"><div className="ccard-media"><div className="thumb g2"></div><div className="ccard-badge good">Hook 42%</div></div><div className="ccard-body"><div className="ccard-hier">Meta · Best Sellers › Adv+</div><div className="ccard-title">Jordan Retro · "Sin filas, sin reseller"</div><svg viewBox="0 0 200 60" style={{width:'100%',height:'50px',marginBottom:'8px'}}><polyline points="5,8 55,32 105,40 155,48 195,52" fill="none" stroke="#22d97a" strokeWidth="2"/><text x="5" y="58" style={{fontSize:'9px',fill:'var(--mu)'}}>0%</text><text x="195" y="58" style={{fontSize:'9px',fill:'var(--mu)'}} textAnchor="end">95%</text></svg><div className="ccard-metrics"><div className="ccard-m"><div className="ccard-m-lbl">Ret 75%</div><div className="ccard-m-val">22%</div></div><div className="ccard-m"><div className="ccard-m-lbl">ROAS</div><div className="ccard-m-val">4.21×</div></div></div></div></div>
            <div className="ccard"><div className="ccard-media"><div className="thumb g3"></div><div className="ccard-badge">Hook 38%</div></div><div className="ccard-body"><div className="ccard-hier">Meta · Prospecting › Cold 18-35</div><div className="ccard-title">Adidas Samba · "Mismo precio, original"</div><svg viewBox="0 0 200 60" style={{width:'100%',height:'50px',marginBottom:'8px'}}><polyline points="5,8 55,36 105,44 155,50 195,54" fill="none" stroke="#fbbf24" strokeWidth="2"/><text x="5" y="58" style={{fontSize:'9px',fill:'var(--mu)'}}>0%</text><text x="195" y="58" style={{fontSize:'9px',fill:'var(--mu)'}} textAnchor="end">95%</text></svg><div className="ccard-metrics"><div className="ccard-m"><div className="ccard-m-lbl">Ret 75%</div><div className="ccard-m-val">19%</div></div><div className="ccard-m"><div className="ccard-m-lbl">ROAS</div><div className="ccard-m-val">3.12×</div></div></div></div></div>
            <div className="ccard"><div className="ccard-media"><div className="thumb g5"></div><div className="ccard-badge good">Hook 52%</div></div><div className="ccard-body"><div className="ccard-hier">TikTok · Ecom MX › Interest</div><div className="ccard-title">Spark Ad · Nike AM unboxing</div><svg viewBox="0 0 200 60" style={{width:'100%',height:'50px',marginBottom:'8px'}}><polyline points="5,8 55,24 105,34 155,44 195,48" fill="none" stroke="#f472b6" strokeWidth="2"/><text x="5" y="58" style={{fontSize:'9px',fill:'var(--mu)'}}>0%</text><text x="195" y="58" style={{fontSize:'9px',fill:'var(--mu)'}} textAnchor="end">95%</text></svg><div className="ccard-metrics"><div className="ccard-m"><div className="ccard-m-lbl">Ret 75%</div><div className="ccard-m-val">28%</div></div><div className="ccard-m"><div className="ccard-m-lbl">ROAS</div><div className="ccard-m-val">3.82×</div></div></div></div></div>
            <div className="ccard"><div className="ccard-media"><div className="thumb g7"></div><div className="ccard-badge">Hook 41%</div></div><div className="ccard-body"><div className="ccard-hier">YouTube · Awareness Jordan</div><div className="ccard-title">Hero spot 15s · Jordan drop</div><svg viewBox="0 0 200 60" style={{width:'100%',height:'50px',marginBottom:'8px'}}><polyline points="5,8 55,30 105,38 155,48 195,50" fill="none" stroke="#fbbf24" strokeWidth="2"/><text x="5" y="58" style={{fontSize:'9px',fill:'var(--mu)'}}>0%</text><text x="195" y="58" style={{fontSize:'9px',fill:'var(--mu)'}} textAnchor="end">95%</text></svg><div className="ccard-metrics"><div className="ccard-m"><div className="ccard-m-lbl">Ret 75%</div><div className="ccard-m-val">21%</div></div><div className="ccard-m"><div className="ccard-m-lbl">ROAS</div><div className="ccard-m-val">2.87×</div></div></div></div></div>
            <div className="ccard"><div className="ccard-media"><div className="thumb g8"></div><div className="ccard-badge bad">Hook 22%</div></div><div className="ccard-body"><div className="ccard-hier">Meta · Prospecting › Cold 18-24</div><div className="ccard-title">Yeezy · "Lo mismo por menos"</div><svg viewBox="0 0 200 60" style={{width:'100%',height:'50px',marginBottom:'8px'}}><polyline points="5,8 55,44 105,50 155,54 195,54" fill="none" stroke="#ef4444" strokeWidth="2"/><text x="5" y="58" style={{fontSize:'9px',fill:'var(--mu)'}}>0%</text><text x="195" y="58" style={{fontSize:'9px',fill:'var(--mu)'}} textAnchor="end">95%</text></svg><div className="ccard-metrics"><div className="ccard-m"><div className="ccard-m-lbl">Ret 75%</div><div className="ccard-m-val">8%</div></div><div className="ccard-m"><div className="ccard-m-lbl">ROAS</div><div className="ccard-m-val">1.42×</div></div></div></div></div>
          </div>
        </div>
      </div>

      {/* Agente Creative Performance Analyst */}
      <div className="agent a-meta">
        <div className="agent-header">
          <div className="agent-identity">
            <div className="agent-avatar">◉</div>
            <div>
              <div className="agent-role">Agente Creative Performance Analyst</div>
              <div className="agent-sub">Hook rate · curva retención · ACP methodology · cross-canal</div>
            </div>
          </div>
          <div className="agent-meta">
            <span className="agent-sev me">Prioridad media</span>
            <span className="agent-time">47 creativos analizados</span>
          </div>
        </div>
        <div className="agent-body">
          <div className="agent-section">
            <div className="agent-section-h">Diagnóstico</div>
            <div className="agent-diag">
              El patrón cross-canal es claro: <b>drop crítico entre Ret50% y Ret75%</b> (promedio −26pp). Los usuarios entienden la propuesta pero no llegan al CTA. El ganador absoluto es <b>Nike AM UGC</b> (Ret75% 32%) porque mueve el producto hero al segundo 8 — el resto deja el CTA para el final. <b>Spark Ads de TikTok compiten con lo mejor de Meta</b> (52% hook ambos) — confirma que el formato nativo supera al producido.
            </div>
          </div>
          <div className="agent-section">
            <div className="agent-section-h">Oportunidades quirúrgicas</div>
            <div className="agent-opps">
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Recortar todos los anuncios &gt;20s a 15s o menos</div>
                  <div className="agent-opp-sub">Benchmark validado: 15s mantiene Ret75% 28%, 30s cae a 18%</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$24K</div><div className="agent-opp-impact-sub">mes siguiente</div></div>
                  <button className="agent-opp-btn">Asignar →</button>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Mover CTA + producto hero al segundo 8 en todos los ads</div>
                  <div className="agent-opp-sub">Replicar fórmula de Nike AM UGC (Ret75% 32% vs prom 19%)</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$18K</div><div className="agent-opp-impact-sub">mes siguiente</div></div>
                  <button className="agent-opp-btn">Asignar →</button>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Pausar Yeezy "Lo mismo por menos"</div>
                  <div className="agent-opp-sub">Hook 22% (debajo umbral 30%) · ROAS 1.42× · pérdida clara</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$4K</div><div className="agent-opp-impact-sub">inmediato</div></div>
                  <button className="agent-opp-btn">Ejecutar →</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
