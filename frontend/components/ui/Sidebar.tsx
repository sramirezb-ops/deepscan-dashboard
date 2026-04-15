'use client'

interface NavItem {
  id:      string
  label:   string
  color:   string
  badge?:  number
  section: string
}

const navItems: NavItem[] = [
  { id: 'overview',    label: 'Overview',          color: '#534AB7', section: 'Resumen' },
  { id: 'meta',        label: 'Meta Ads',           color: '#534AB7', section: 'Plataformas' },
  { id: 'google',      label: 'Google Ads · PMAX',  color: '#1D9E75', section: 'Plataformas' },
  { id: 'ga4',         label: 'Google Analytics',   color: '#378ADD', section: 'Plataformas' },
  { id: 'merchant',    label: 'Google Merchant',    color: '#BA7517', section: 'Plataformas' },
  { id: 'shopify',     label: 'Shopify',            color: '#EF9F27', section: 'Ecommerce' },
  { id: 'clarity',     label: 'Clarity / Web',      color: '#D4537E', section: 'UX' },
]

interface SidebarProps {
  active:   string
  onChange: (id: string) => void
  client?:  string
  alerts?:  Record<string, number>
}

export default function Sidebar({ active, onChange, client, alerts = {} }: SidebarProps) {
  const sections = [...new Set(navItems.map(i => i.section))]

  return (
    <div className="w-48 bg-white border-r border-gray-100 flex flex-col flex-shrink-0 min-h-screen">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-50">
        <div className="text-[15px] font-medium tracking-tight text-gray-900">
          deep<span className="text-indigo-600">scan</span>
        </div>
      </div>

      {/* Cliente */}
      {client && (
        <div className="mx-3 my-2 px-3 py-2 bg-gray-50 rounded-lg">
          <div className="text-xs font-medium text-gray-800 truncate">{client}</div>
          <div className="flex items-center gap-1 mt-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <div className="text-[10px] text-green-700">Datos en vivo</div>
          </div>
        </div>
      )}

      {/* Nav */}
      <div className="flex-1 overflow-y-auto">
        {sections.map(section => (
          <div key={section}>
            <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-gray-300">
              {section}
            </div>
            {navItems
              .filter(item => item.section === section)
              .map(item => (
                <button
                  key={item.id}
                  onClick={() => onChange(item.id)}
                  className={`w-full flex items-center gap-2 px-4 py-1.5 text-xs text-left transition-colors border-l-2 ${
                    active === item.id
                      ? 'bg-indigo-50 text-indigo-800 font-medium border-indigo-500'
                      : 'text-gray-500 hover:bg-gray-50 border-transparent'
                  }`}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: item.color }}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {alerts[item.id] > 0 && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                      {alerts[item.id]}
                    </span>
                  )}
                </button>
              ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-50 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center text-[10px] font-medium text-indigo-600">
          DS
        </div>
        <div>
          <div className="text-xs font-medium text-gray-700">DeepScan</div>
          <div className="text-[10px] text-gray-300">Admin</div>
        </div>
      </div>
    </div>
  )
}
