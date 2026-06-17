import { Agent } from '@/components/ui/Agent';
import { Card, Hero, HeroSimple, CardHeader } from '@/components/ui/Card';
import { KpiCard, HeroStat } from '@/components/ui/KpiCard';
import { Thumbnail, Hierarchy } from '@/components/ui/Thumbnail';
import { DimensionTable, MetricFilter, CmpCell } from '@/components/ui/DimensionTable';
import { ChartWithTooltip } from '@/components/ui/ChartWithTooltip';

export function Shopify() {
  return (
    <div className="view on">
<div className="hero">
        <div className="hero-title">Shopify · Tienda</div>
        <div className="hero-sub">Performance de la tienda · 30 días</div>
      </div>
      <div className="kpis">
        <div className="kpi k-shopify"><div className="kpi-lbl">Ingresos</div><div className="kpi-val">$587K MXN</div><div className="kpi-bot"><span className="kpi-delta tgu">+24.3%</span><span className="spark"><span className="spark-bar" style={{height:'45%'}}></span><span className="spark-bar" style={{height:'58%'}}></span><span className="spark-bar" style={{height:'72%'}}></span><span className="spark-bar" style={{height:'80%'}}></span><span className="spark-bar" style={{height:'92%'}}></span><span className="spark-bar" style={{height:'100%'}}></span></span></div></div>
        <div className="kpi k-shopify"><div className="kpi-lbl">Órdenes</div><div className="kpi-val">1,432</div><div className="kpi-bot"><span className="kpi-delta tgu">+18.7%</span></div></div>
        <div className="kpi k-shopify"><div className="kpi-lbl">AOV</div><div className="kpi-val">$410</div><div className="kpi-bot"><span className="kpi-delta tgu">+$18</span></div></div>
        <div className="kpi k-shopify"><div className="kpi-lbl">Conv. rate</div><div className="kpi-val">2.26%</div><div className="kpi-bot"><span className="kpi-delta tgu">+0.31pp</span></div></div>
      </div>

      <div className="r2" style={{marginTop:'20px'}}>
        <div className="card">
          <h3 style={{margin:'0 0 16px 0',fontSize:'15px'}}>Top productos vendidos</h3>
          <table className="t">
            <thead><tr><th>Producto</th><th>Marca</th><th>Unid.</th><th>Ingresos</th><th>ROAS</th></tr></thead>
            <tbody>
              <tr><td><b>Air Max 97 Silver Bullet</b></td><td><span className="pl pl-meta">Nike</span></td><td>142</td><td>$284,000</td><td><span className="tg tgu">5.82x</span></td></tr>
              <tr><td><b>Jordan 1 Retro Chicago</b></td><td><span className="pl pl-meta">Jordan</span></td><td>87</td><td>$261,000</td><td><span className="tg tgu">4.91x</span></td></tr>
              <tr><td><b>Samba Classic Black</b></td><td><span className="pl pl-shopify">Adidas</span></td><td>218</td><td>$218,000</td><td><span className="tg tgu">4.24x</span></td></tr>
              <tr><td><b>530 Silver Grey</b></td><td><span className="pl pl-n">New Balance</span></td><td>124</td><td>$148,800</td><td><span className="tg tgu">3.87x</span></td></tr>
              <tr><td><b>Superstar White</b></td><td><span className="pl pl-shopify">Adidas</span></td><td>98</td><td>$98,000</td><td><span className="tg tgm">3.12x</span></td></tr>
              <tr><td>Air Force 1 '07</td><td><span className="pl pl-meta">Nike</span></td><td>78</td><td>$93,600</td><td><span className="tg tgm">2.98x</span></td></tr>
              <tr><td>Yeezy Boost 350 V2</td><td><span className="pl pl-search">Yeezy</span></td><td>42</td><td>$147,000</td><td><span className="tg tgd">1.87x</span></td></tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3 style={{margin:'0 0 16px 0',fontSize:'15px'}}>Checkout funnel</h3>
          <div className="fn">
            <div className="fr"><div className="fw" style={{width:'100%',background:'linear-gradient(90deg,rgba(52,211,153,0.7),rgba(52,211,153,0.5))'}}><span className="fv">63,420 sesiones</span></div></div>
            <div className="fr"><div className="fw" style={{width:'72%',background:'linear-gradient(90deg,rgba(52,211,153,0.6),rgba(52,211,153,0.4))'}}><span className="fv">45,662 view product <span className="ff">72%</span></span></div></div>
            <div className="fr"><div className="fw" style={{width:'18%',background:'linear-gradient(90deg,rgba(52,211,153,0.55),rgba(52,211,153,0.35))'}}><span className="fv">11,415 add to cart <span className="ff">25%</span></span></div></div>
            <div className="fr"><div className="fw" style={{width:'7%',background:'linear-gradient(90deg,rgba(52,211,153,0.5),rgba(52,211,153,0.3))'}}><span className="fv">4,438 begin checkout <span className="ff">38.9%</span></span></div></div>
            <div className="fr"><div className="fw" style={{width:'2.26%',background:'linear-gradient(90deg,rgba(34,217,122,0.8),rgba(34,217,122,0.55))'}}><span className="fv">1,432 compras <span className="ff">32.3%</span></span></div></div>
          </div>
        </div>
      </div>

      {/* Agente Ecommerce Senior */}
      <div className="agent a-shopify">
        <div className="agent-header">
          <div className="agent-identity">
            <div className="agent-avatar">◐</div>
            <div>
              <div className="agent-role">Agente Ecommerce Senior</div>
              <div className="agent-sub">AOV · CR · checkout optimization · retention · Shopify expert</div>
            </div>
          </div>
          <div className="agent-meta">
            <span className="agent-sev hi">Prioridad alta</span>
            <span className="agent-time">Datos al 20 abril 14:00</span>
          </div>
        </div>
        <div className="agent-body">
          <div className="agent-section">
            <div className="agent-section-h">Diagnóstico</div>
            <div className="agent-diag">
              Revenue <b>+24.3%</b> con CR mejorando <b>+0.31pp</b> y AOV subiendo $18 · la tienda crece rentablemente. Pero el drop más grande del funnel está aquí: <b>add_to_cart → begin_checkout (25% → 38.9%)</b> = <b>61% abandono de carrito</b>, mucho peor que el 70% del benchmark industria ecommerce México. <b>Yeezy V2 con ROAS 1.87×</b> es el único producto que pierde dinero consistentemente — o reposicionar o descontinuar. <b>Air Max 97</b> y <b>Jordan 1 Chicago</b> son máquinas (ROAS &gt;5×).
            </div>
          </div>
          <div className="agent-section">
            <div className="agent-section-h">Oportunidades quirúrgicas</div>
            <div className="agent-opps">
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Implementar banner envío gratis desde $500</div>
                  <div className="agent-opp-sub">AOV sube $38 · reduce abandono de carrito 14pp (patrón validado)</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$34K</div><div className="agent-opp-impact-sub">mes siguiente</div></div>
                  <button className="agent-opp-btn">Ticket →</button>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Migrar a checkout one-page</div>
                  <div className="agent-opp-sub">Reducir fricción multi-step · CR potencial +0.5pp</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$24K</div><div className="agent-opp-impact-sub">mes siguiente</div></div>
                  <button className="agent-opp-btn">Plan →</button>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Descontinuar o reposicionar Yeezy V2</div>
                  <div className="agent-opp-sub">ROAS 1.87× · único producto que pierde · 42 unidades vendidas</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$4K</div><div className="agent-opp-impact-sub">mes siguiente</div></div>
                  <button className="agent-opp-btn">Revisar →</button>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Crear bundles con Air Max 97 como ancla</div>
                  <div className="agent-opp-sub">Producto top · AOV puede subir +$120 con cross-sell</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$18K</div><div className="agent-opp-impact-sub">mes siguiente</div></div>
                  <button className="agent-opp-btn">Plan →</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
