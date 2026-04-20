'use client'

interface NavItem {
  id:      string
  label:   string
  icon:    string
  badge?:  number
  section: string
}

const navItems: NavItem[] = [
  { id: 'overview',  label: 'Overview',          icon: '◈', section: 'Resumen' },
  { id: 'google',    label: 'Google Ads',         icon: '◎', section: 'Plataformas' },
  { id: 'meta',      label: 'Meta Ads',           icon: '◎', section: 'Plataformas' },
  { id: 'ga4',       label: 'Analytics',          icon: '◎', section: 'Plataformas' },
  { id: 'merchant',  label: 'Merchant Center',    icon: '◎', section: 'Plataformas' },
  { id: 'shopify',   label: 'Shopify',            icon: '◎', section: 'Ecommerce' },
  { id: 'clarity',   label: 'Clarity / CRO',      icon: '◎', section: 'UX' },
]

const accentBySection: Record<string, string> = {
  'Resumen':     '#00d97e',
  'Plataformas': '#378add',
  'Ecommerce':   '#f59e0b',
  'UX':          '#8b5cf6',
}

interface SidebarProps {
  active:   string
  onChange: (id: string) => void
  client?:  string
  alerts?:  Record<string, number>
}

export default function Sidebar({ active, onChange, client, alerts = {} }: SidebarProps) {
  const sections = [...new Set(navItems.map(i => i.section))]

  return (
    <div
      className="flex flex-col flex-shrink-0 min-h-screen"
      style={{
        width: '196px',
        background: 'var(--bg-card)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2 px-5 py-5"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div
          className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold"
          style={{ background: 'var(--accent)', color: '#0f1117' }}
        >
          DS
        </div>
        <span
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 600,
            fontSize: '14px',
            color: 'var(--text-1)',
            letterSpacing: '-0.02em',
          }}
        >
          deep<span style={{ color: 'var(--accent)' }}>scan</span>
        </span>
      </div>

      {/* Cliente */}
      {client && (
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div
            className="rounded-lg px-3 py-2.5"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
          >
            <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-1)' }} className="truncate">
              {client}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: 'var(--accent)', boxShadow: '0 0 4px var(--accent)' }}
              />
              <span style={{ fontSize: '10px', color: 'var(--accent)' }}>En vivo</span>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-2">
        {sections.map(section => (
          <div key={section} className="mb-1">
            <div
              className="px-5 pt-4 pb-1.5"
              style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-3)', textTransform: 'uppercase' }}
            >
              {section}
            </div>
            {navItems
              .filter(item => item.section === section)
              .map(item => {
                const isActive = active === item.id
                const accent = accentBySection[item.section]
                return (
                  <button
                    key={item.id}
                    onClick={() => onChange(item.id)}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-left transition-all relative"
                    style={{
                      fontSize: '12px',
                      fontWeight: isActive ? 500 : 400,
                      color: isActive ? 'var(--text-1)' : 'var(--text-2)',
                      background: isActive ? 'var(--bg-hover)' : 'transparent',
                      borderLeft: `2px solid ${isActive ? accent : 'transparent'}`,
                    }}
                  >
                    <span style={{ color: isActive ? accent : 'var(--text-3)', fontSize: '10px' }}>
                      {item.icon}
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {alerts[item.id] > 0 && (
                      <span
                        className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                        style={{ background: '#ff4d4d22', color: '#ff4d4d' }}
                      >
                        {alerts[item.id]}
                      </span>
                    )}
                  </button>
                )
              })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        className="px-4 py-4 flex items-center gap-2.5"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent)', fontFamily: "'Space Grotesk', sans-serif" }}
        >
          SR
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-1)' }}>DeepScan</div>
          <div style={{ fontSize: '10px', color: 'var(--text-3)' }}>Admin</div>
        </div>
      </div>
    </div>
  )
}
