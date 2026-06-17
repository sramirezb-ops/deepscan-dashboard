import { Agent } from '@/components/ui/Agent';
import { Card, Hero, HeroSimple, CardHeader } from '@/components/ui/Card';
import { KpiCard, HeroStat } from '@/components/ui/KpiCard';
import { Thumbnail, Hierarchy } from '@/components/ui/Thumbnail';
import { DimensionTable, MetricFilter, CmpCell } from '@/components/ui/DimensionTable';
import { ChartWithTooltip } from '@/components/ui/ChartWithTooltip';

export function Week() {
  return (
    <div className="view on">
<div className="r4">
        <div className="kpi k-violet">
          <div className="kpi-lbl">Acciones totales</div>
          <div className="kpi-val">12</div>
          <div className="kpi-bot"><span className="kpi-delta mute">5 alta · 4 media · 3 baja</span></div>
        </div>
        <div className="kpi k-green">
          <div className="kpi-lbl">Impacto estimado</div>
          <div className="kpi-val">$203K</div>
          <div className="kpi-bot"><span className="kpi-delta up">MXN/mes</span></div>
        </div>
        <div className="kpi k-amber">
          <div className="kpi-lbl">En progreso</div>
          <div className="kpi-val">4</div>
          <div className="kpi-bot"><span className="kpi-delta mute">33% completado</span></div>
        </div>
        <div className="kpi k-sky">
          <div className="kpi-lbl">Resueltas · abril</div>
          <div className="kpi-val">27</div>
          <div className="kpi-bot"><span className="kpi-delta up">+$412K generados</span></div>
        </div>
      </div>

      <div className="card" style={{padding:'0'}}>
        <div className="ch" style={{padding:'20px 24px',marginBottom:'0',borderBottom:'1px solid var(--b1)'}}>
          <div className="ch-left">
            <div className="ct2">Bandeja de acciones</div>
            <div className="cs">Priorizadas por impacto esperado · semana del 20 abr</div>
          </div>
          <div className="ch-right">
            <button className="btn">Filtrar</button>
            <button className="btn">Ordenar</button>
          </div>
        </div>
        <div className="act" style={{border:'none',borderRadius:'0'}}>
          <div className="act-row">
            <div className="act-pri hi">01</div>
            <div className="act-body">
              <div className="act-title">Fix checkout mobile <span className="pl pl-web" style={{marginLeft:'6px'}}>Web</span></div>
              <div className="act-desc">12.4% dead clicks en <b>/checkout</b>. Botón "Pagar" queda debajo del fold en iPhone 13/14. Fix CSS + retest con Clarity.</div>
            </div>
            <div className="act-impact">
              <div className="act-impact-val">+$55K</div>
              <div className="act-impact-lbl">MXN/mes</div>
            </div>
            <button className="act-btn">Resolver →</button>
          </div>
          <div className="act-row">
            <div className="act-pri hi">02</div>
            <div className="act-body">
              <div className="act-title">Rotar creativos Ascensión WhatsApp <span className="pl pl-meta" style={{marginLeft:'6px'}}>Meta</span></div>
              <div className="act-desc">Frecuencia <b>5.1</b> (umbral 3.5). ROAS cayendo 12%. Activar fase <b>MÁS</b> del ACP: 5 variaciones de hook manteniendo body.</div>
            </div>
            <div className="act-impact">
              <div className="act-impact-val">+$45K</div>
              <div className="act-impact-lbl">MXN/mes</div>
            </div>
            <button className="act-btn">Resolver →</button>
          </div>
          <div className="act-row">
            <div className="act-pri hi">03</div>
            <div className="act-body">
              <div className="act-title">Escalar TikTok +$10K <span className="pl pl-tiktok" style={{marginLeft:'6px'}}>TikTok</span></div>
              <div className="act-desc">ROAS subió a 3.60× (+31%). Retención 62% en Unboxing Nike Drop. Aumentar presupuesto CBO 40% diario.</div>
            </div>
            <div className="act-impact">
              <div className="act-impact-val">+$36K</div>
              <div className="act-impact-lbl">MXN/mes</div>
            </div>
            <button className="act-btn">Resolver →</button>
          </div>
          <div className="act-row">
            <div className="act-pri hi">04</div>
            <div className="act-body">
              <div className="act-title">Excluir 311 zombies del feed GMC <span className="pl pl-google" style={{marginLeft:'6px'}}>Google</span></div>
              <div className="act-desc">Productos con 0 clics en 12 meses. Contaminan señal del algoritmo PMAX. Script de exclusión automática lista.</div>
            </div>
            <div className="act-impact">
              <div className="act-impact-val">ROAS +8%</div>
              <div className="act-impact-lbl">PMAX</div>
            </div>
            <button className="act-btn">Resolver →</button>
          </div>
          <div className="act-row">
            <div className="act-pri hi">05</div>
            <div className="act-body">
              <div className="act-title">Remarketing carritos abandonados <span className="pl pl-meta" style={{marginLeft:'6px'}}>Meta</span></div>
              <div className="act-desc">62% abandono Cart→Checkout. Crear audiencia 14d + video carrusel de productos + descuento 10%.</div>
            </div>
            <div className="act-impact">
              <div className="act-impact-val">+$32K</div>
              <div className="act-impact-lbl">MXN/mes</div>
            </div>
            <button className="act-btn">Resolver →</button>
          </div>
          <div className="act-row">
            <div className="act-pri me">06</div>
            <div className="act-body">
              <div className="act-title">Pausar Running General PMAX <span className="pl pl-google" style={{marginLeft:'6px'}}>Google</span></div>
              <div className="act-desc">ROAS 2.8× vs target 4.0×. Asset group con 32 conversiones pero CPA 3× sobre promedio. Reestructurar con mejores creatives.</div>
            </div>
            <div className="act-impact">
              <div className="act-impact-val">+$22K</div>
              <div className="act-impact-lbl">MXN/mes</div>
            </div>
            <button className="act-btn">Resolver →</button>
          </div>
          <div className="act-row">
            <div className="act-pri me">07</div>
            <div className="act-body">
              <div className="act-title">Subir puja "jordan retro méxico" <span className="pl pl-search" style={{marginLeft:'6px'}}>Search</span></div>
              <div className="act-desc">55% share of impressions, CTR 4.6%. Competencia dominando top 3. Aumentar puja 25% en keyword exact.</div>
            </div>
            <div className="act-impact">
              <div className="act-impact-val">+$18K</div>
              <div className="act-impact-lbl">MXN/mes</div>
            </div>
            <button className="act-btn">Resolver →</button>
          </div>
          <div className="act-row">
            <div className="act-pri me">08</div>
            <div className="act-body">
              <div className="act-title">Fix meta-title homepage <span className="pl pl-search" style={{marginLeft:'6px'}}>GSC</span></div>
              <div className="act-desc">48K impresiones, CTR 1.8% (benchmark 3.2%). Meta-title actual 68 chars, recortar + agregar "México" + "Envío gratis".</div>
            </div>
            <div className="act-impact">
              <div className="act-impact-val">+$12K</div>
              <div className="act-impact-lbl">MXN/mes</div>
            </div>
            <button className="act-btn">Resolver →</button>
          </div>
          <div className="act-row">
            <div className="act-pri lo">09</div>
            <div className="act-body">
              <div className="act-title">Geo-targeting Monterrey + Puebla <span className="pl pl-ga4" style={{marginLeft:'6px'}}>GA4</span></div>
              <div className="act-desc">Crecimiento orgánico +4.2% y +11.8%. Crear campañas paid con budget geo-segmentado para reforzar demanda.</div>
            </div>
            <div className="act-impact">
              <div className="act-impact-val">+$8K</div>
              <div className="act-impact-lbl">MXN/mes</div>
            </div>
            <button className="act-btn">Resolver →</button>
          </div>
        </div>
      </div>

      {/* Agregar acción inline */}
      <div className="act-add">
        <span style={{fontSize:'18px'}}>✎</span>
        <input type="text" placeholder="Agregar acción manual (ej: Llamar a proveedor Nike para stock Air Max 97)..." id="new-action-input"/>
        <button className="btn" style={{fontSize:'11px'}}>+ Agregar</button>
        <button className="act-add-claude">
          <span style={{fontSize:'14px'}}>✦</span>
          <span>Pedir recomendación a Claude</span>
        </button>
      </div>

      {/* Agente de Priorización */}
      <div className="agent">
        <div className="agent-header">
          <div className="agent-identity">
            <div className="agent-avatar">⚡</div>
            <div>
              <div className="agent-role">Agente de Priorización</div>
              <div className="agent-sub">Ranking por impacto × esfuerzo · revisa tu bandeja cada lunes</div>
            </div>
          </div>
          <div className="agent-meta">
            <span className="agent-sev hi">Prioridad alta</span>
            <span className="agent-time">Semana 16 · 14-20 abril</span>
          </div>
        </div>
        <div className="agent-body">
          <div className="agent-section">
            <div className="agent-section-h">Diagnóstico semanal</div>
            <div className="agent-diag">
              Tienes <b>9 acciones activas</b> con impacto proyectado de <b>+$287K MXN/mes</b>. Las <b>3 de alta urgencia suman +$136K</b> y todas caben en esta semana. El <b>fix de checkout</b> (2-4 hrs de dev) es el ROI más rápido y mejora la conversión de todos los canales simultáneamente — <b>debe ser el ticket #1 del lunes</b>.
            </div>
          </div>
          <div className="agent-section">
            <div className="agent-section-h">Secuencia recomendada esta semana</div>
            <div className="agent-opps">
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">LUN · Fix de checkout (subir CTA above-fold)</div>
                  <div className="agent-opp-sub">2-4 hrs de dev · impacta conversión de todos los canales</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$28K</div><div className="agent-opp-impact-sub">inmediato</div></div>
                  <button className="agent-opp-btn">Asignar →</button>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">MAR-MIÉ · Excluir 311 zombies del feed GMC</div>
                  <div className="agent-opp-sub">Mejora crawl budget PMAX · rebalance presupuesto Shopping</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$28K</div><div className="agent-opp-impact-sub">mes siguiente</div></div>
                  <button className="agent-opp-btn">Asignar →</button>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">JUE · Escalar Meta Advantage+ Best Sellers</div>
                  <div className="agent-opp-sub">+40% budget · activar MÁS (hooks nuevos) en paralelo</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$62K</div><div className="agent-opp-impact-sub">mes siguiente</div></div>
                  <button className="agent-opp-btn">Asignar →</button>
                </div>
              </div>
              <div className="agent-opp">
                <div className="agent-opp-body">
                  <div className="agent-opp-title">VIE · Reescribir 10 meta tags con CTR bajo</div>
                  <div className="agent-opp-sub">Keywords top 10 con CTR &lt;1.5% · SEO senior priorizó esto</div>
                </div>
                <div className="agent-opp-meta">
                  <div><div className="agent-opp-impact">+$18K</div><div className="agent-opp-impact-sub">2 semanas</div></div>
                  <button className="agent-opp-btn">Asignar →</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
