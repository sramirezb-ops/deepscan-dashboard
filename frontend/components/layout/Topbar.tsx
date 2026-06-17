'use client';

import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { NAV_SECTIONS } from '@/lib/channels';
import { PeriodPicker } from './PeriodPicker';
import { usePeriod } from '@/lib/usePeriod';
import { formatRangeLabel } from '@/lib/period';

export function Topbar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const { crumb1, crumb2, title } = findRouteMeta(pathname);
  const { previous } = usePeriod();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const app = document.getElementById('app');
    if (app) app.classList.toggle('lm', !isDark);
  }, [isDark]);

  const openSidebar = () => {
    document.getElementById('sb')?.classList.add('open');
    document.getElementById('ov')?.classList.add('on');
  };

  return (
    <div className="tb">
      <div className="tbl">
        <div className="bmob" onClick={openSidebar} role="button" aria-label="Abrir menú">
          ☰
        </div>
        <div className="tb-title-wrap">
          <div className="tb-crumb" id="crumb">
            <span>{crumb1}</span>
            <span className="sep">›</span>
            <span>{crumb2}</span>
          </div>
          <div className="tbtitle">
            <span id="ttl">{title}</span>
            <span className="tbadge">
              <span className="tbadge-dot" />
              En vivo
            </span>
          </div>
        </div>
      </div>
      <div className="tbr">
        <PeriodPicker />
        <div className="btn hidm" suppressHydrationWarning title="Período anterior comparable">
          vs {formatRangeLabel(previous)}
        </div>
        <div className="btn btna">✦ Insight IA</div>
        <div
          className="btnm"
          id="mbtn"
          onClick={() => setIsDark((p) => !p)}
          role="button"
          aria-label="Cambiar tema"
          title="Cambiar tema"
          suppressHydrationWarning
        >
          {mounted ? (isDark ? '🌙' : '☀️') : '🌙'}
        </div>
      </div>
    </div>
  );
}

function findRouteMeta(pathname: string) {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.href === pathname) {
        return {
          crumb1: item.crumb1,
          crumb2: item.crumb2,
          title: item.label,
        };
      }
    }
  }
  return { crumb1: 'General', crumb2: 'Overview', title: 'Overview ejecutivo' };
}
