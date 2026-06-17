import type { AgentProps } from '@/lib/types';

export function Agent({
  role,
  subtitle,
  avatar,
  channel,
  severity = 'me',
  severityLabel,
  timestamp,
  diagnosis,
  opportunities = [],
  alerts = [],
}: AgentProps) {
  const channelClass = channel ? `a-${channel}` : '';
  const sevLabel =
    severityLabel ||
    (severity === 'hi' ? 'Prioridad alta' : severity === 'lo' ? 'Prioridad baja' : 'Prioridad media');

  return (
    <div className={`agent ${channelClass}`}>
      <div className="agent-header">
        <div className="agent-identity">
          <div className="agent-avatar">{avatar}</div>
          <div>
            <div className="agent-role">{role}</div>
            <div className="agent-sub">{subtitle}</div>
          </div>
        </div>
        <div className="agent-meta">
          <span className={`agent-sev ${severity}`}>{sevLabel}</span>
          {timestamp && <span className="agent-time">{timestamp}</span>}
        </div>
      </div>

      <div className="agent-body">
        <div className="agent-section">
          <div className="agent-section-h">Diagnóstico</div>
          <div className="agent-diag">{diagnosis}</div>
        </div>

        {opportunities.length > 0 && (
          <div className="agent-section">
            <div className="agent-section-h">Oportunidades quirúrgicas</div>
            <div className="agent-opps">
              {opportunities.map((opp, i) => (
                <div key={i} className="agent-opp">
                  <div className="agent-opp-body">
                    <div className="agent-opp-title">{opp.title}</div>
                    <div className="agent-opp-sub">{opp.sub}</div>
                  </div>
                  <div className="agent-opp-meta">
                    {opp.impact && (
                      <div>
                        <div className="agent-opp-impact">{opp.impact}</div>
                        {opp.impactSub && <div className="agent-opp-impact-sub">{opp.impactSub}</div>}
                      </div>
                    )}
                    <button className="agent-opp-btn" type="button">
                      {opp.cta}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {alerts.length > 0 && (
          <div className="agent-section">
            <div className="agent-section-h">Alertas</div>
            <div className="agent-alerts">
              {alerts.map((alert, i) => (
                <div
                  key={i}
                  className={`agent-alert ${alert.type === 'warn' ? 'warn' : ''}`}
                >
                  <span className="agent-alert-ic">{alert.icon}</span>
                  <span dangerouslySetInnerHTML={{ __html: alert.text }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
