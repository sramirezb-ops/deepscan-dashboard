import { Agent } from '@/components/ui/Agent';
import { Card, Hero, HeroSimple, CardHeader } from '@/components/ui/Card';
import { KpiCard, HeroStat } from '@/components/ui/KpiCard';
import { Thumbnail, Hierarchy } from '@/components/ui/Thumbnail';
import { DimensionTable, MetricFilter, CmpCell } from '@/components/ui/DimensionTable';
import { ChartWithTooltip } from '@/components/ui/ChartWithTooltip';

export function SearchConsole() {
  return (
    <div className="view on">
<div className="hero">
        <div className="hero-title">Search Console</div>
        <div className="hero-sub">Posicionamiento orgánico · últimos 90 días</div>
      </div>
      <div className="kpis">
        <div className="kpi k-search"><div className="kpi-lbl">Impresiones</div><div className="kpi-val">1.42M</div><div className="kpi-bot"><span className="kpi-delta tgu">+28.3%</span><span className="spark"><span className="spark-bar" style={{height:'40%'}}></span><span className="spark-bar" style={{height:'55%'}}></span><span className="spark-bar" style={{height:'65%'}}></span><span className="spark-bar" style={{height:'80%'}}></span><span className="spark-bar" style={{height:'90%'}}></span><span className="spark-bar" style={{height:'100%'}}></span></span></div></div>
        <div className="kpi k-search"><div className="kpi-lbl">Clicks</div><div className="kpi-val">42,180</div><div className="kpi-bot"><span className="kpi-delta tgu">+18.7%</span></div></div>
        <div className="kpi k-search"><div className="kpi-lbl">CTR promedio</div><div className="kpi-val">2.97%</div><div className="kpi-bot"><span className="kpi-delta tgd">−0.4pp</span><span style={{fontSize:'11px',color:'var(--mu)'}}>baja con volumen</span></div></div>
        <div className="kpi k-search"><div className="kpi-lbl">Posición prom</div><div className="kpi-val">18.4</div><div className="kpi-bot"><span className="kpi-delta tgu">−2.1</span><span style={{fontSize:'11px',color:'var(--mu)'}}>mejora</span></div></div>
      </div>

      <div className="r3" style={{marginTop:'20px'}}>
        <div className="card">
          <h3 style={{margin:'0 0 16px 0',fontSize:'14px',color:'#22d97a'}}>↑ Keywords ganando</h3>
          <table className="t t-compact">
            <thead><tr><th>Keyword</th><th>Pos</th><th>Δ</th></tr></thead>
            <tbody>
              <tr><td>nike air max mexico</td><td>8</td><td><span className="tg tgu">+14</span></td></tr>
              <tr><td>jordan retro precio</td><td>12</td><td><span className="tg tgu">+9</span></td></tr>
              <tr><td>adidas samba comprar</td><td>6</td><td><span className="tg tgu">+7</span></td></tr>
              <tr><td>sneakers originales</td><td>11</td><td><span className="tg tgu">+5</span></td></tr>
              <tr><td>new balance 530 mx</td><td>15</td><td><span className="tg tgu">+4</span></td></tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3 style={{margin:'0 0 16px 0',fontSize:'14px',color:'#ef4444'}}>↓ Keywords perdiendo</h3>
          <table className="t t-compact">
            <thead><tr><th>Keyword</th><th>Pos</th><th>Δ</th></tr></thead>
            <tbody>
              <tr><td>tenis deportivos</td><td>32</td><td><span className="tg tgd">−12</span></td></tr>
              <tr><td>yeezy mexico</td><td>28</td><td><span className="tg tgd">−8</span></td></tr>
              <tr><td>zapatillas baratas</td><td>45</td><td><span className="tg tgd">−6</span></td></tr>
              <tr><td>sneakers para hombre</td><td>22</td><td><span className="tg tgd">−4</span></td></tr>
              <tr><td>tenis casuales</td><td>38</td><td><span className="tg tgd">−3</span></td></tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3 style={{margin:'0 0 16px 0',fontSize:'14px',color:'#fbbf24'}}>⚡ Oportunidades CTR</h3>
          <table className="t t-compact">
            <thead><tr><th>Keyword</th><th>Pos</th><th>CTR</th></tr></thead>
            <tbody>
              <tr><td>nike air force 1</td><td><b>3</b></td><td><span className="tg tgd">1.2%</span></td></tr>
              <tr><td>adidas superstar</td><td><b>4</b></td><td><span className="tg tgd">0.8%</span></td></tr>
              <tr><td>jordan 1 chicago</td><td><b>5</b></td><td><span className="tg tgd">1.1%</span></td></tr>
              <tr><td>puma suede classic</td><td><b>6</b></td><td><span className="tg tgd">0.9%</span></td></tr>
              <tr><td>converse chuck 70</td><td><b>7</b></td><td><span className="tg tgd">0.7%</span></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Errores técnicos SEO */}
      <div className="card" style={{marginTop:'20px'}}>
        <h3 style={{margin:'0 0 16px 0',fontSize:'15px'}}>Errores técnicos detectados</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'12px'}}>
          <div style={{padding:'14px',background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderLeft:'3px solid #ef4444',borderRadius:'8px'}}>
            <div style={{display:'flex',justifyContent:'space-between'}}><div><div style={{fontSize:'13px',fontWeight:'600'}}>42 páginas 4xx en sitemap</div><div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>URLs incluidas en sitemap devuelven 404/410</div></div><span className="pri pri-hi">Crítico</span></div>
          </div>
          <div style={{padding:'14px',background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderLeft:'3px solid #ef4444',borderRadius:'8px'}}>
            <div style={{display:'flex',justifyContent:'space-between'}}><div><div style={{fontSize:'13px',fontWeight:'600'}}>18 canonicals apuntan a noindex</div><div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>Páginas se autocanonalizan a páginas no indexables</div></div><span className="pri pri-hi">Crítico</span></div>
          </div>
          <div style={{padding:'14px',background:'rgba(251,191,36,0.06)',border:'1px solid rgba(251,191,36,0.2)',borderLeft:'3px solid #fbbf24',borderRadius:'8px'}}>
            <div style={{display:'flex',justifyContent:'space-between'}}><div><div style={{fontSize:'13px',fontWeight:'600'}}>184 páginas sin meta description</div><div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>Google genera snippets automáticos · peor CTR</div></div><span className="pri pri-me">Alto</span></div>
          </div>
          <div style={{padding:'14px',background:'rgba(251,191,36,0.06)',border:'1px solid rgba(251,191,36,0.2)',borderLeft:'3px solid #fbbf24',borderRadius:'8px'}}>
            <div style={{display:'flex',justifyContent:'space-between'}}><div><div style={{fontSize:'13px',fontWeight:'600'}}>CLS en producto: 0.34</div><div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>Above-the-fold tiene layout shift · Core Web Vitals</div></div><span className="pri pri-me">Alto</span></div>
          </div>
          <div style={{padding:'14px',background:'rgba(56,189,248,0.06)',border:'1px solid rgba(56,189,248,0.2)',borderLeft:'3px solid #38bdf8',borderRadius:'8px'}}>
            <div style={{display:'flex',justifyContent:'space-between'}}><div><div style={{fontSize:'13px',fontWeight:'600'}}>62 títulos muy cortos (&lt;30 chars)</div><div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>Desperdicias caracteres útiles para CTR</div></div><span className="pri pri-lo">Medio</span></div>
          </div>
          <div style={{padding:'14px',background:'rgba(56,189,248,0.06)',border:'1px solid rgba(56,189,248,0.2)',borderLeft:'3px solid #38bdf8',borderRadius:'8px'}}>
            <div style={{display:'flex',justifyContent:'space-between'}}><div><div style={{fontSize:'13px',fontWeight:'600'}}>24 imágenes sin alt text</div><div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>Pierdes ranking en Google Images + accesibilidad</div></div><span className="pri pri-lo">Medio</span></div>
          </div>
        </div>
      </div>

      {/* Agente SEO Senior */}
      <div className="agent a-search">
        <div className="agent-header">
          <div className="agent-identity">
            <div className="agent-avatar">🔍</div>
            <div>
              <div className="agent-role">Agente SEO Senior</div>
              <div className="agent-sub">Technical SEO · content strategy · keyword research · Core Web Vitals</div>
            </div>
          </div>
          <div className="agent-meta">
            <span className="agent-sev hi">Prioridad alta</span>
            <span className="agent-time">Último crawl: hace 6 horas</span>
          </div>
        </div>
        <div className="agent-body">
          <div className="agent-section">
            <div className="agent-section-h">Diagnóstico</div>
            <div className="agent-diag">
              Tienes un caso de libro de texto: <b>5 keywords en top 10 con CTR &lt;1.5%</b>. Eso no es posicionamiento, es <b>meta tags débiles</b>. Reescribir títulos con precio + envío gratis + disponibilidad puede <b>duplicar clicks sin mover posición</b>. El problema urgente: <b>42 páginas 4xx en sitemap</b> te queman crawl budget y <b>18 canonicals rotos</b> desindexan contenido bueno. "tenis deportivos" cayó −12 posiciones — <b>probable cambio de intent del algoritmo</b>, revisa páginas que ahora rankean (¿shift a informacional?).
            </div>
          </div>
          <div className="agent-section">
            <div className="agent-section-h">Oportunidades quirúrgicas</div>
            <div className="agent-opps">
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Reescribir 5 meta tags con CTR &lt;1.5%</div>
                  <div className="agent-opp-sub">Fórmula: "[Modelo] · $[precio] · Envío gratis · Originales | Basics"</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$24K</div><div className="agent-opp-impact-sub">2 semanas</div></div>
                  <button className="agent-opp-btn">Asignar →</button>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Limpiar 42 URLs 4xx del sitemap</div>
                  <div className="agent-opp-sub">Recuperar crawl budget · script de limpieza automática</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$8K</div><div className="agent-opp-impact-sub">indirecto</div></div>
                  <button className="agent-opp-btn">Ejecutar →</button>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Auditar "tenis deportivos" (caída −12)</div>
                  <div className="agent-opp-sub">Investigar intent shift · posible necesidad de contenido info</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$14K</div><div className="agent-opp-impact-sub">1 mes</div></div>
                  <button className="agent-opp-btn">Investigar →</button>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Arreglar CLS 0.34 en ficha producto</div>
                  <div className="agent-opp-sub">Core Web Vitals impacta ranking · reservar alto de imagen</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$6K</div><div className="agent-opp-impact-sub">indirecto</div></div>
                  <button className="agent-opp-btn">Ticket →</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
