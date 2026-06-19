'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_SECTIONS, CHANNEL_META, type NavItem } from '@/lib/channels';
import { useClient } from '@/lib/useClient';
import { useChannelModal } from '@/lib/useChannelModal';
import type { MouseEvent } from 'react';

export function Sidebar() {
  const pathname = usePathname();
  const client = useClient();
  const { openModal } = useChannelModal();

  const handleNavClick = (e: MouseEvent, item: NavItem) => {
    const isBlockableChannel = CHANNEL_META[item.id] !== undefined;
    const isActive = client.activeChannels.includes(item.id);

    if (isBlockableChannel && !isActive) {
      e.preventDefault();
      openModal(item.id);
    }
    closeSidebar();
  };

  return (
    <aside className="sb" id="sb">
      <div className="sbt">
        <div className="sb-logo">
          <div className="sb-mark">D</div>
          <div className="sb-brand">DeepScan</div>
        </div>
        <div className="sb-client">
          <div className="sb-client-av">BS</div>
          <div className="sb-client-info">
            <div className="sb-client-name">{client.name}</div>
            <div className="sb-client-meta">{client.currency} · {client.country}</div>
          </div>
          <div className="sb-client-arrow">▾</div>
        </div>
      </div>

      <div className="sb-scroll">
        {NAV_SECTIONS.map((section) => {
          // Solo mostramos las visuales que el cliente tiene habilitadas
          // (clients.enabled_channels en Supabase). Si una sección entera
          // se queda sin items visibles, no la dibujamos.
          const visibleItems = section.items.filter((item) =>
            client.activeChannels.includes(item.id)
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.label} className="sbs">
              <div className="sbl">{section.label}</div>
              {visibleItems.map((item) => {
                const isCurrent = pathname === item.href;
                const itemClass = item.isSubItem ? 'ns' : 'ni';

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={(e) => handleNavClick(e, item)}
                    className={`${itemClass} ${isCurrent ? 'on' : ''}`}
                    style={{ textDecoration: 'none' }}
                  >
                    {item.icon && <span className="ni-ic">{item.icon}</span>}
                    <span className="ni-label">{item.label}</span>
                    {item.badge !== undefined && <span className="ni-badge">{item.badge}</span>}
                    {item.dotColor && <span className={`ni-dot ${item.dotColor}`} />}
                  </Link>
                );
              })}
            </div>
          );
        })}

        <div className="sb-foot">
          <span className="sb-foot-dot" />
          ETL sincronizado hoy · 11:02 UTC
        </div>
      </div>
    </aside>
  );
}

function closeSidebar() {
  if (typeof document === 'undefined') return;
  document.getElementById('sb')?.classList.remove('open');
  document.getElementById('ov')?.classList.remove('on');
}
