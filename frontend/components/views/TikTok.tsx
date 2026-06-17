import { Agent } from '@/components/ui/Agent';
import { Card, Hero, HeroSimple, CardHeader } from '@/components/ui/Card';
import { KpiCard, HeroStat } from '@/components/ui/KpiCard';
import { Thumbnail, Hierarchy } from '@/components/ui/Thumbnail';
import { DimensionTable, MetricFilter, CmpCell } from '@/components/ui/DimensionTable';
import { ChartWithTooltip } from '@/components/ui/ChartWithTooltip';

export function TikTok() {
  return (
    <div className="view on">
<div className="hero">
        <div className="hero-title">TikTok Ads</div>
        <div className="hero-sub">Spark Ads + In-feed · retención ACP · análisis de comentarios · tracking de objetivos</div>
      </div>

      <div className="kpis">
        <div className="kpi k-tiktok"><div className="kpi-lbl">Inversión</div><div className="kpi-val">$42K</div><div className="kpi-bot"><span className="kpi-delta tgu">+32%</span><span className="dcmp">YTD <b>$142K</b></span></div></div>
        <div className="kpi k-tiktok"><div className="kpi-lbl">Revenue</div><div className="kpi-val">$147K</div><div className="kpi-bot"><span className="kpi-delta tgu">+31%</span><span className="dcmp">YTD <b>$498K</b></span></div></div>
        <div className="kpi k-tiktok"><div className="kpi-lbl">ROAS</div><div className="kpi-val">3.50×</div><div className="kpi-bot"><span className="kpi-delta tgu">+0.12</span><span className="dcmp">objetivo <b>3.0×</b></span></div></div>
        <div className="kpi k-tiktok"><div className="kpi-lbl">VTR prom</div><div className="kpi-val">38.4%</div><div className="kpi-bot"><span className="kpi-delta tgu">+2.1pp</span><span className="dcmp">top 20%</span></div></div>
      </div>

      {/* Objetivos del mes vs real */}
      <div className="card" style={{marginTop:'20px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
          <h3 style={{margin:'0',fontSize:'15px'}}>Objetivos de abril · tracking diario</h3>
          <span className="period-pill">Día 20 de 30 · <b>67% del mes</b></span>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'12px'}}>
          <div style={{padding:'14px',background:'var(--bg)',border:'1px solid var(--br)',borderRadius:'10px'}}>
            <div style={{fontSize:'11px',color:'var(--mu)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:'600'}}>Revenue objetivo</div>
            <div style={{display:'flex',alignItems:'baseline',gap:'8px',marginTop:'6px'}}><div style={{fontFamily:'\'Space Grotesk\'',fontSize:'22px',fontWeight:'600'}}>$147K</div><div style={{fontSize:'12px',color:'var(--mu)'}}>/ $200K</div></div>
            <div style={{marginTop:'10px'}}><div className="hb"><span className="hb-fill" style={{width:'73.5%',background:'#22d97a'}}></span></div></div>
            <div style={{marginTop:'6px',fontSize:'10px',color:'#22d97a'}}>73.5% alcanzado · <b>on track</b> (67% del mes)</div>
          </div>
          <div style={{padding:'14px',background:'var(--bg)',border:'1px solid var(--br)',borderRadius:'10px'}}>
            <div style={{fontSize:'11px',color:'var(--mu)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:'600'}}>ROAS objetivo</div>
            <div style={{display:'flex',alignItems:'baseline',gap:'8px',marginTop:'6px'}}><div style={{fontFamily:'\'Space Grotesk\'',fontSize:'22px',fontWeight:'600'}}>3.50×</div><div style={{fontSize:'12px',color:'var(--mu)'}}>/ 3.00×</div></div>
            <div style={{marginTop:'10px'}}><div className="hb"><span className="hb-fill" style={{width:'100%',background:'#22d97a'}}></span></div></div>
            <div style={{marginTop:'6px',fontSize:'10px',color:'#22d97a'}}>116% alcanzado · <b>superando</b></div>
          </div>
          <div style={{padding:'14px',background:'var(--bg)',border:'1px solid var(--br)',borderRadius:'10px'}}>
            <div style={{fontSize:'11px',color:'var(--mu)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:'600'}}>Conversiones</div>
            <div style={{display:'flex',alignItems:'baseline',gap:'8px',marginTop:'6px'}}><div style={{fontFamily:'\'Space Grotesk\'',fontSize:'22px',fontWeight:'600'}}>168</div><div style={{fontSize:'12px',color:'var(--mu)'}}>/ 240</div></div>
            <div style={{marginTop:'10px'}}><div className="hb"><span className="hb-fill" style={{width:'70%',background:'#fbbf24'}}></span></div></div>
            <div style={{marginTop:'6px',fontSize:'10px',color:'#fbbf24'}}>70% alcanzado · <b>ligeramente atrás</b></div>
          </div>
          <div style={{padding:'14px',background:'var(--bg)',border:'1px solid var(--br)',borderRadius:'10px'}}>
            <div style={{fontSize:'11px',color:'var(--mu)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:'600'}}>CPA objetivo</div>
            <div style={{display:'flex',alignItems:'baseline',gap:'8px',marginTop:'6px'}}><div style={{fontFamily:'\'Space Grotesk\'',fontSize:'22px',fontWeight:'600'}}>$250</div><div style={{fontSize:'12px',color:'var(--mu)'}}>/ $275 max</div></div>
            <div style={{marginTop:'10px'}}><div className="hb"><span className="hb-fill" style={{width:'91%',background:'#22d97a'}}></span></div></div>
            <div style={{marginTop:'6px',fontSize:'10px',color:'#22d97a'}}>Por debajo del techo · <b>eficiente</b></div>
          </div>
        </div>
      </div>

      {/* Videos con jerarquía y retención */}
      <div className="card" style={{marginTop:'20px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px',flexWrap:'wrap',gap:'12px'}}>
          <div>
            <h3 style={{margin:'0',fontSize:'15px'}}>Videos · escalado e iteración</h3>
            <div style={{fontSize:'11px',color:'var(--mu)',marginTop:'4px'}}>Campaña › Ad Group › Video con curva retención individual</div>
          </div>
          <div className="vtoggle">
            <button className="on">☰ Tabla</button>
            <button>▦ Galería</button>
          </div>
        </div>
        <div id="ttok-tbl">
          <table className="t">
            <thead><tr><th></th><th>Jerarquía</th><th>VTR</th><th>Ret 25%</th><th>Ret 75%</th><th>Curva</th><th>ROAS</th><th>Acción</th></tr></thead>
            <tbody>
              <tr>
                <td><div className="thumb g1"></div></td>
                <td><div className="hier"><div className="hier-l1">Ecom MX › Interest Sneakers</div><div className="hier-l3">Spark Ad · Nike AM unboxing (@sofiakiks)</div></div></td>
                <td><span className="tg tgu"><b>52%</b></span></td><td>48%</td><td>28%</td>
                <td><svg width="100" height="28"><polyline points="2,4 27,12 52,17 77,22 98,24" fill="none" stroke="#22d97a" strokeWidth="2"/></svg></td>
                <td><span className="tg tgu"><b>3.82×</b></span></td>
                <td><span className="pl pl-shopify">Escalar</span></td>
              </tr>
              <tr>
                <td><div className="thumb g2"></div></td>
                <td><div className="hier"><div className="hier-l1">Ecom MX › Interest Sneakers</div><div className="hier-l3">In-feed · Jordan Retro review (@lucassneakers)</div></div></td>
                <td><span className="tg tgu"><b>42%</b></span></td><td>32%</td><td>22%</td>
                <td><svg width="100" height="28"><polyline points="2,4 27,16 52,20 77,25 98,26" fill="none" stroke="#fbbf24" strokeWidth="2"/></svg></td>
                <td><span className="tg tgm"><b>2.98×</b></span></td>
                <td><span className="pl pl-shopify">Mantener</span></td>
              </tr>
              <tr>
                <td><div className="thumb g3"></div></td>
                <td><div className="hier"><div className="hier-l1">Ecom MX › LAL 1% Buyers</div><div className="hier-l3">Spark Ad · Samba styling (@emilyoutfits)</div></div></td>
                <td><span className="tg tgm"><b>35%</b></span></td><td>28%</td><td>16%</td>
                <td><svg width="100" height="28"><polyline points="2,4 27,18 52,22 77,26 98,27" fill="none" stroke="#fbbf24" strokeWidth="2"/></svg></td>
                <td><b>2.82×</b></td>
                <td><span className="pl pl-shopify">Mantener</span></td>
              </tr>
              <tr>
                <td><div className="thumb g4"></div></td>
                <td><div className="hier"><div className="hier-l1">Ecom MX › Interest Sneakers</div><div className="hier-l3">In-feed · NB 530 hack <span style={{color:'#ef4444',fontSize:'10px'}}>· BAJO</span></div></div></td>
                <td><span className="tg tgd"><b>24%</b></span></td><td>18%</td><td>9%</td>
                <td><svg width="100" height="28"><polyline points="2,4 27,22 52,25 77,27 98,27" fill="none" stroke="#ef4444" strokeWidth="2"/></svg></td>
                <td style={{color:'#ef4444'}}><b>1.62×</b></td>
                <td><span className="pl pl-n">Pausar</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div id="ttok-gal" style={{display:'none'}}>
          <div className="cgrid">
            <div className="ccard"><div className="ccard-media"><div className="thumb g1"></div><div className="ccard-badge good">VTR 52%</div></div><div className="ccard-body"><div className="ccard-hier">Ecom MX · Interest</div><div className="ccard-title">Spark · Nike AM unboxing</div><svg viewBox="0 0 200 60" style={{width:'100%',height:'50px',marginBottom:'8px'}}><polyline points="5,8 55,24 105,32 155,44 195,46" fill="none" stroke="#22d97a" strokeWidth="2"/></svg><div className="ccard-metrics"><div className="ccard-m"><div className="ccard-m-lbl">Ret 75%</div><div className="ccard-m-val">28%</div></div><div className="ccard-m"><div className="ccard-m-lbl">ROAS</div><div className="ccard-m-val">3.82×</div></div></div></div></div>
            <div className="ccard"><div className="ccard-media"><div className="thumb g2"></div><div className="ccard-badge">VTR 42%</div></div><div className="ccard-body"><div className="ccard-hier">Ecom MX · Interest</div><div className="ccard-title">In-feed · Jordan review</div><svg viewBox="0 0 200 60" style={{width:'100%',height:'50px',marginBottom:'8px'}}><polyline points="5,8 55,32 105,40 155,50 195,52" fill="none" stroke="#fbbf24" strokeWidth="2"/></svg><div className="ccard-metrics"><div className="ccard-m"><div className="ccard-m-lbl">Ret 75%</div><div className="ccard-m-val">22%</div></div><div className="ccard-m"><div className="ccard-m-lbl">ROAS</div><div className="ccard-m-val">2.98×</div></div></div></div></div>
            <div className="ccard"><div className="ccard-media"><div className="thumb g3"></div><div className="ccard-badge">VTR 35%</div></div><div className="ccard-body"><div className="ccard-hier">Ecom MX · LAL 1%</div><div className="ccard-title">Spark · Samba styling</div><svg viewBox="0 0 200 60" style={{width:'100%',height:'50px',marginBottom:'8px'}}><polyline points="5,8 55,36 105,44 155,52 195,54" fill="none" stroke="#fbbf24" strokeWidth="2"/></svg><div className="ccard-metrics"><div className="ccard-m"><div className="ccard-m-lbl">Ret 75%</div><div className="ccard-m-val">16%</div></div><div className="ccard-m"><div className="ccard-m-lbl">ROAS</div><div className="ccard-m-val">2.82×</div></div></div></div></div>
            <div className="ccard"><div className="ccard-media"><div className="thumb g4"></div><div className="ccard-badge bad">VTR 24%</div></div><div className="ccard-body"><div className="ccard-hier">Ecom MX · Interest</div><div className="ccard-title">In-feed · NB 530 hack</div><svg viewBox="0 0 200 60" style={{width:'100%',height:'50px',marginBottom:'8px'}}><polyline points="5,8 55,44 105,50 155,54 195,54" fill="none" stroke="#ef4444" strokeWidth="2"/></svg><div className="ccard-metrics"><div className="ccard-m"><div className="ccard-m-lbl">Ret 75%</div><div className="ccard-m-val">9%</div></div><div className="ccard-m"><div className="ccard-m-lbl">ROAS</div><div className="ccard-m-val">1.62×</div></div></div></div></div>
          </div>
        </div>
      </div>
      <div className="card" style={{marginTop:'20px'}}>
        <div className="dim-tbl-head">
          <div className="dim-tbl-title">
            <div className="dim-tbl-ic">◒</div>
            <div>
              <div className="dim-tbl-label">Dimensión · Campañas</div>
              <div className="dim-tbl-h">Comparativa a nivel campaña TikTok</div>
            </div>
          </div>
        </div>
        <div className="metric-filter">
          <div className="metric-filter-lbl">Métricas</div>
          <button className="metric-chip on"><span className="metric-chip-ic">◉</span>Completo</button>
          <button className="metric-chip"><span className="metric-chip-ic">▤</span>Impresiones</button>
          <button className="metric-chip"><span className="metric-chip-ic">✓</span>Conversión</button>
          <button className="metric-chip"><span className="metric-chip-ic">$</span>Costo</button>
          <button className="metric-chip"><span className="metric-chip-ic">↑</span>Revenue</button>
        </div>
        <table className="t" id="ttok-camp-tbl">
          <thead><tr>
            <th data-cat="dim">Campaña</th>
            <th data-cat="impr">Impresiones</th>
            <th data-cat="impr">CTR</th>
            <th data-cat="impr">VTR prom</th>
            <th data-cat="cost">Inversión</th>
            <th data-cat="cost">CPM</th>
            <th data-cat="conv">Compras</th>
            <th data-cat="cost,conv">CPA</th>
            <th data-cat="rev">Revenue</th>
            <th data-cat="rev">ROAS</th>
          </tr></thead>
          <tbody>
            <tr>
              <td data-cat="dim"><b>Ecom MX · Catálogo Nike</b><br /><span style={{fontSize:'10px',color:'var(--mu)'}}>Conversion · Website</span></td>
              <td data-cat="impr">1.42M</td>
              <td data-cat="impr"><span className="tg tgu">1.8%</span></td>
              <td data-cat="impr"><span className="tg tgu">46%</span></td>
              <td data-cat="cost">$24,800</td>
              <td data-cat="cost">$17.5</td>
              <td data-cat="conv">98</td>
              <td data-cat="cost,conv">$253</td>
              <td data-cat="rev">$92K</td>
              <td data-cat="rev"><div className="cmp-cell"><span className="cmp-val tgu">3.71×</span><div className="cmp-bar"><div className="cmp-bar-fill g" style={{width:'100%'}}></div></div></div></td>
            </tr>
            <tr>
              <td data-cat="dim"><b>Ecom MX · Spark Ads Boost</b><br /><span style={{fontSize:'10px',color:'var(--mu)'}}>Conversion · App Promo</span></td>
              <td data-cat="impr">624K</td>
              <td data-cat="impr">1.4%</td>
              <td data-cat="impr">52%</td>
              <td data-cat="cost">$11,200</td>
              <td data-cat="cost">$17.9</td>
              <td data-cat="conv">48</td>
              <td data-cat="cost,conv">$233</td>
              <td data-cat="rev">$38K</td>
              <td data-cat="rev"><div className="cmp-cell"><span className="cmp-val tgu">3.39×</span><div className="cmp-bar"><div className="cmp-bar-fill g" style={{width:'91%'}}></div></div></div></td>
            </tr>
            <tr>
              <td data-cat="dim"><b>Awareness · Best Sellers</b><br /><span style={{fontSize:'10px',color:'var(--mu)'}}>Reach · Video</span></td>
              <td data-cat="impr">398K</td>
              <td data-cat="impr">1.1%</td>
              <td data-cat="impr">38%</td>
              <td data-cat="cost">$6,000</td>
              <td data-cat="cost">$15.1</td>
              <td data-cat="conv">22</td>
              <td data-cat="cost,conv">$273</td>
              <td data-cat="rev">$17K</td>
              <td data-cat="rev"><div className="cmp-cell"><span className="cmp-val tgm">2.83×</span><div className="cmp-bar"><div className="cmp-bar-fill a" style={{width:'76%'}}></div></div></div></td>
            </tr>
            <tr className="t-avg">
              <td data-cat="dim">Promedio / Total</td>
              <td data-cat="impr">2.44M</td>
              <td data-cat="impr">1.5%</td>
              <td data-cat="impr">46%</td>
              <td data-cat="cost">$42,000</td>
              <td data-cat="cost">$17.2</td>
              <td data-cat="conv">168</td>
              <td data-cat="cost,conv">$250</td>
              <td data-cat="rev">$147K</td>
              <td data-cat="rev"><b>3.50×</b></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="card" style={{marginTop:'20px'}}>
        <div className="dim-tbl-head">
          <div className="dim-tbl-title">
            <div className="dim-tbl-ic">◇</div>
            <div>
              <div className="dim-tbl-label">Dimensión · Ad Groups</div>
              <div className="dim-tbl-h">Comparativa a nivel ad group TikTok</div>
            </div>
          </div>
        </div>
        <div className="metric-filter">
          <div className="metric-filter-lbl">Métricas</div>
          <button className="metric-chip on"><span className="metric-chip-ic">◉</span>Completo</button>
          <button className="metric-chip"><span className="metric-chip-ic">▤</span>Impresiones</button>
          <button className="metric-chip"><span className="metric-chip-ic">✓</span>Conversión</button>
          <button className="metric-chip"><span className="metric-chip-ic">$</span>Costo</button>
          <button className="metric-chip"><span className="metric-chip-ic">↑</span>Revenue</button>
        </div>
        <table className="t" id="ttok-adset-tbl">
          <thead><tr>
            <th data-cat="dim">Ad Group</th>
            <th data-cat="dim">Campaña</th>
            <th data-cat="impr">Impr.</th>
            <th data-cat="impr">VTR</th>
            <th data-cat="cost">Inversión</th>
            <th data-cat="conv">Compras</th>
            <th data-cat="cost,conv">CPA</th>
            <th data-cat="rev">ROAS</th>
          </tr></thead>
          <tbody>
            <tr>
              <td data-cat="dim"><b>Interest Sneakers</b></td>
              <td data-cat="dim" style={{fontSize:'11px',color:'var(--mu)'}}>Catálogo Nike</td>
              <td data-cat="impr">842K</td>
              <td data-cat="impr"><span className="tg tgu">48%</span></td>
              <td data-cat="cost">$14,200</td>
              <td data-cat="conv">58</td>
              <td data-cat="cost,conv">$245</td>
              <td data-cat="rev"><div className="cmp-cell"><span className="cmp-val tgu">3.94×</span><div className="cmp-bar"><div className="cmp-bar-fill g" style={{width:'100%'}}></div></div></div></td>
            </tr>
            <tr>
              <td data-cat="dim"><b>LAL 1% Buyers</b></td>
              <td data-cat="dim" style={{fontSize:'11px',color:'var(--mu)'}}>Catálogo Nike</td>
              <td data-cat="impr">582K</td>
              <td data-cat="impr">44%</td>
              <td data-cat="cost">$10,600</td>
              <td data-cat="conv">40</td>
              <td data-cat="cost,conv">$265</td>
              <td data-cat="rev"><div className="cmp-cell"><span className="cmp-val tgu">3.48×</span><div className="cmp-bar"><div className="cmp-bar-fill g" style={{width:'88%'}}></div></div></div></td>
            </tr>
            <tr>
              <td data-cat="dim"><b>Spark Creators · @sofiakiks</b></td>
              <td data-cat="dim" style={{fontSize:'11px',color:'var(--mu)'}}>Spark Ads Boost</td>
              <td data-cat="impr">362K</td>
              <td data-cat="impr"><span className="tg tgu">52%</span></td>
              <td data-cat="cost">$6,800</td>
              <td data-cat="conv">32</td>
              <td data-cat="cost,conv">$213</td>
              <td data-cat="rev"><div className="cmp-cell"><span className="cmp-val tgu">3.82×</span><div className="cmp-bar"><div className="cmp-bar-fill g" style={{width:'97%'}}></div></div></div></td>
            </tr>
            <tr>
              <td data-cat="dim"><b>Spark Creators · @lucassneakers</b></td>
              <td data-cat="dim" style={{fontSize:'11px',color:'var(--mu)'}}>Spark Ads Boost</td>
              <td data-cat="impr">262K</td>
              <td data-cat="impr">42%</td>
              <td data-cat="cost">$4,400</td>
              <td data-cat="conv">16</td>
              <td data-cat="cost,conv">$275</td>
              <td data-cat="rev"><div className="cmp-cell"><span className="cmp-val tgm">2.98×</span><div className="cmp-bar"><div className="cmp-bar-fill a" style={{width:'76%'}}></div></div></div></td>
            </tr>
            <tr>
              <td data-cat="dim"><b>Afinidad Basket</b></td>
              <td data-cat="dim" style={{fontSize:'11px',color:'var(--mu)'}}>Awareness Best Sellers</td>
              <td data-cat="impr">398K</td>
              <td data-cat="impr">38%</td>
              <td data-cat="cost">$6,000</td>
              <td data-cat="conv">22</td>
              <td data-cat="cost,conv">$273</td>
              <td data-cat="rev"><div className="cmp-cell"><span className="cmp-val tgm">2.83×</span><div className="cmp-bar"><div className="cmp-bar-fill a" style={{width:'72%'}}></div></div></div></td>
            </tr>
            <tr className="t-avg">
              <td data-cat="dim">Promedio</td>
              <td data-cat="dim">—</td>
              <td data-cat="impr">489K</td>
              <td data-cat="impr">45%</td>
              <td data-cat="cost">$8,400</td>
              <td data-cat="conv">34</td>
              <td data-cat="cost,conv">$254</td>
              <td data-cat="rev"><b>3.41×</b></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="card" style={{marginTop:'20px'}}>
        <div className="dim-tbl-head">
          <div className="dim-tbl-title">
            <div className="dim-tbl-ic">▶</div>
            <div>
              <div className="dim-tbl-label">Dimensión · Videos</div>
              <div className="dim-tbl-h">Comparativa a nivel video con preview</div>
            </div>
          </div>
        </div>
        <div className="metric-filter">
          <div className="metric-filter-lbl">Métricas</div>
          <button className="metric-chip on"><span className="metric-chip-ic">◉</span>Completo</button>
          <button className="metric-chip"><span className="metric-chip-ic">▤</span>Views</button>
          <button className="metric-chip"><span className="metric-chip-ic">✓</span>Conversión</button>
          <button className="metric-chip"><span className="metric-chip-ic">$</span>Costo</button>
          <button className="metric-chip"><span className="metric-chip-ic">↑</span>Revenue</button>
        </div>
        <table className="t" id="ttok-ad-tbl">
          <thead><tr>
            <th data-cat="dim"></th>
            <th data-cat="dim">Video</th>
            <th data-cat="impr">Views</th>
            <th data-cat="impr">VTR</th>
            <th data-cat="impr">Ret 75%</th>
            <th data-cat="cost">Inversión</th>
            <th data-cat="conv">Compras</th>
            <th data-cat="cost,conv">CPA</th>
            <th data-cat="rev">ROAS</th>
          </tr></thead>
          <tbody>
            <tr>
              <td data-cat="dim"><div className="thumb g1" style={{width:'36px',height:'58px'}}></div></td>
              <td data-cat="dim"><b>Nike AM unboxing (@sofiakiks)</b><br /><span style={{fontSize:'10px',color:'var(--mu)'}}>Spark Ads · Ecom MX › Interest</span></td>
              <td data-cat="impr">362K</td>
              <td data-cat="impr"><span className="tg tgu">52%</span></td>
              <td data-cat="impr">28%</td>
              <td data-cat="cost">$6,800</td>
              <td data-cat="conv">32</td>
              <td data-cat="cost,conv">$213</td>
              <td data-cat="rev"><div className="cmp-cell"><span className="cmp-val tgu">3.82×</span><div className="cmp-bar"><div className="cmp-bar-fill g" style={{width:'100%'}}></div></div></div></td>
            </tr>
            <tr>
              <td data-cat="dim"><div className="thumb g2" style={{width:'36px',height:'58px'}}></div></td>
              <td data-cat="dim"><b>Jordan Retro review (@lucassneakers)</b><br /><span style={{fontSize:'10px',color:'var(--mu)'}}>In-feed · Ecom MX › Interest</span></td>
              <td data-cat="impr">262K</td>
              <td data-cat="impr">42%</td>
              <td data-cat="impr">22%</td>
              <td data-cat="cost">$4,400</td>
              <td data-cat="conv">16</td>
              <td data-cat="cost,conv">$275</td>
              <td data-cat="rev"><div className="cmp-cell"><span className="cmp-val tgm">2.98×</span><div className="cmp-bar"><div className="cmp-bar-fill a" style={{width:'78%'}}></div></div></div></td>
            </tr>
            <tr>
              <td data-cat="dim"><div className="thumb g3" style={{width:'36px',height:'58px'}}></div></td>
              <td data-cat="dim"><b>Samba styling (@emilyoutfits)</b><br /><span style={{fontSize:'10px',color:'var(--mu)'}}>Spark Ads · Ecom MX › LAL 1%</span></td>
              <td data-cat="impr">198K</td>
              <td data-cat="impr">35%</td>
              <td data-cat="impr">16%</td>
              <td data-cat="cost">$3,800</td>
              <td data-cat="conv">12</td>
              <td data-cat="cost,conv">$317</td>
              <td data-cat="rev"><div className="cmp-cell"><span className="cmp-val tgm">2.82×</span><div className="cmp-bar"><div className="cmp-bar-fill a" style={{width:'74%'}}></div></div></div></td>
            </tr>
            <tr>
              <td data-cat="dim"><div className="thumb g4" style={{width:'36px',height:'58px'}}></div></td>
              <td data-cat="dim"><b>NB 530 hack · BAJO</b><br /><span style={{fontSize:'10px',color:'var(--mu)'}}>In-feed · Ecom MX › Interest</span></td>
              <td data-cat="impr">78K</td>
              <td data-cat="impr"><span className="tg tgd">24%</span></td>
              <td data-cat="impr">9%</td>
              <td data-cat="cost">$1,820</td>
              <td data-cat="conv">3</td>
              <td data-cat="cost,conv">$607</td>
              <td data-cat="rev"><div className="cmp-cell"><span className="cmp-val tgd">1.62×</span><div className="cmp-bar"><div className="cmp-bar-fill r" style={{width:'42%'}}></div></div></div></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Análisis de comentarios con sentiment */}
      <div className="card" style={{marginTop:'20px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
          <h3 style={{margin:'0',fontSize:'15px'}}>Análisis de comentarios · top creativo</h3>
          <span className="period-pill">Nike AM unboxing · <b>1,284 comments</b></span>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:'20px'}}>
          <div>
            <div style={{fontSize:'11px',color:'var(--mu)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:'600',marginBottom:'10px'}}>Sentiment</div>
            <svg viewBox="0 0 200 200" style={{width:'100%',maxWidth:'180px'}}>
              <circle cx="100" cy="100" r="70" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="22"/>
              <circle cx="100" cy="100" r="70" fill="none" stroke="#22d97a" strokeWidth="22" strokeDasharray="307 440" transform="rotate(-90 100 100)" strokeLinecap="round"/>
              <circle cx="100" cy="100" r="70" fill="none" stroke="#fbbf24" strokeWidth="22" strokeDasharray="88 440" strokeDashoffset="-307" transform="rotate(-90 100 100)" strokeLinecap="round"/>
              <circle cx="100" cy="100" r="70" fill="none" stroke="#ef4444" strokeWidth="22" strokeDasharray="44 440" strokeDashoffset="-395" transform="rotate(-90 100 100)" strokeLinecap="round"/>
              <text x="100" y="95" textAnchor="middle" style={{fontFamily:'\'Space Grotesk\'',fontSize:'22px',fontWeight:'600',fill:'var(--tx)'}}>70%</text>
              <text x="100" y="115" textAnchor="middle" style={{fontSize:'10px',fill:'var(--mu)'}}>positivo</text>
            </svg>
            <div style={{marginTop:'14px',display:'flex',flexDirection:'column',gap:'6px',fontSize:'11px'}}>
              <div style={{display:'flex',justifyContent:'space-between'}}><span><span style={{display:'inline-block',width:'8px',height:'8px',background:'#22d97a',borderRadius:'2px',marginRight:'6px'}}></span>Positivo</span><b>898 · 70%</b></div>
              <div style={{display:'flex',justifyContent:'space-between'}}><span><span style={{display:'inline-block',width:'8px',height:'8px',background:'#fbbf24',borderRadius:'2px',marginRight:'6px'}}></span>Neutral</span><b>258 · 20%</b></div>
              <div style={{display:'flex',justifyContent:'space-between'}}><span><span style={{display:'inline-block',width:'8px',height:'8px',background:'#ef4444',borderRadius:'2px',marginRight:'6px'}}></span>Negativo</span><b>128 · 10%</b></div>
            </div>
          </div>

          <div>
            <div style={{fontSize:'11px',color:'var(--mu)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:'600',marginBottom:'10px'}}>Comentarios destacados · temas agrupados</div>
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              <div className="cmt"><div className="cmt-head"><span className="cmt-user">@maria_mtz</span><span className="cmt-sent pos">POSITIVO · Intención de compra</span></div><div className="cmt-txt">"Me quedé con las ganas de esos 97, alguien sabe si tienen la talla 25?" · <b>187 likes</b> · 12 respuestas</div></div>
              <div className="cmt"><div className="cmt-head"><span className="cmt-user">@kike.sneakers</span><span className="cmt-sent pos">POSITIVO · UGC potencial</span></div><div className="cmt-txt">"Yo compré los míos ahí, súper originales y el envío fue al día siguiente" · <b>142 likes</b></div></div>
              <div className="cmt"><div className="cmt-head"><span className="cmt-user">@danielaz</span><span className="cmt-sent neu">NEUTRAL · Duda frecuente</span></div><div className="cmt-txt">"¿Tienen modelos para mujer? Me encantó el contenido" · <b>98 likes</b> · pregunta común (42 similares)</div></div>
              <div className="cmt"><div className="cmt-head"><span className="cmt-user">@pedrorz</span><span className="cmt-sent neg">NEGATIVO · Objeción precio</span></div><div className="cmt-txt">"Muy caros para lo que son, en MercadoLibre los consigues más baratos" · <b>28 likes</b></div></div>
              <div className="cmt"><div className="cmt-head"><span className="cmt-user">@ana_cdmx</span><span className="cmt-sent pos">POSITIVO · Shoutout marca</span></div><div className="cmt-txt">"Basics es la única tienda confiable en México" · <b>78 likes</b> · top por engagement</div></div>
            </div>
          </div>
        </div>
      </div>

      {/* Agente TikTok Specialist */}
      <div className="agent a-tiktok">
        <div className="agent-header">
          <div className="agent-identity">
            <div className="agent-avatar">◒</div>
            <div>
              <div className="agent-role">Agente TikTok Specialist</div>
              <div className="agent-sub">Retention analysis · community sentiment · spark ad strategy</div>
            </div>
          </div>
          <div className="agent-meta">
            <span className="agent-sev me">Prioridad media</span>
            <span className="agent-time">Datos al 20 abril</span>
          </div>
        </div>
        <div className="agent-body">
          <div className="agent-section">
            <div className="agent-section-h">Diagnóstico</div>
            <div className="agent-diag">
              Vas <b>on-track en revenue (73.5% / 67% del mes)</b> y superando ROAS (3.50× vs objetivo 3.00×). El verdadero motor son los <b>Spark Ads con creators (VTR 52%)</b> vs In-feed producido (42%). El sentiment del top video es <b>70% positivo</b> con alta intención: 42 comentarios preguntando por modelos de mujer — hay una oportunidad de nicho sin atender. Objeción recurrente: <b>"precio vs MercadoLibre"</b> — reforzar autenticidad en el próximo lote de creativos.
            </div>
          </div>
          <div className="agent-section">
            <div className="agent-section-h">Oportunidades quirúrgicas</div>
            <div className="agent-opps">
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Escalar Spark Ad Nike AM +80%</div>
                  <div className="agent-opp-sub">VTR 52%, ROAS 3.82× · negociar whitelist recurrente con @sofiakiks</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$28K</div><div className="agent-opp-impact-sub">mes siguiente</div></div>
                  <button className="agent-opp-btn">Accionar →</button>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Lanzar creativo "sneakers mujer" (nicho detectado)</div>
                  <div className="agent-opp-sub">42 comments positivos pidiéndolo · demanda validada sin esfuerzo de ad</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$18K</div><div className="agent-opp-impact-sub">mes siguiente</div></div>
                  <button className="agent-opp-btn">Asignar →</button>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Pausar In-feed NB 530 hack</div>
                  <div className="agent-opp-sub">VTR 24% (debajo del 30%) · ROAS 1.62× · desperdicio de presupuesto</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$3K</div><div className="agent-opp-impact-sub">inmediato</div></div>
                  <button className="agent-opp-btn">Ejecutar →</button>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">Crear respuesta con review para objeción "precio vs ML"</div>
                  <div className="agent-opp-sub">Comments negativos se concentran en autenticidad · comparativa directa</div>
                </div>
                <div className="agent-opp-meta">
                  <button className="agent-opp-btn">Concepto →</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
