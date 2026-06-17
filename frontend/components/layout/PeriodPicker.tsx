'use client';

import { useEffect, useRef, useState } from 'react';
import { usePeriod } from '@/lib/usePeriod';
import { PRESETS, formatRangeLabel, type PresetId } from '@/lib/period';

export function PeriodPicker() {
  const { preset, range, setPreset, setCustomRange } = usePeriod();
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(range.from);
  const [draftTo, setDraftTo] = useState(range.to);
  const ref = useRef<HTMLDivElement>(null);

  // Cierra al hacer clic afuera
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Sincroniza los inputs cuando cambia el rango desde afuera
  useEffect(() => {
    setDraftFrom(range.from);
    setDraftTo(range.to);
  }, [range.from, range.to]);

  function choosePreset(id: PresetId) {
    if (id === 'custom') return; // el custom se aplica con el botón
    setPreset(id);
    setOpen(false);
  }

  function applyCustom() {
    if (draftFrom && draftTo && draftFrom <= draftTo) {
      setCustomRange({ from: draftFrom, to: draftTo });
      setOpen(false);
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        className="btn hidm"
        role="button"
        onClick={() => setOpen((o) => !o)}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        suppressHydrationWarning
      >
        <span style={{ opacity: 0.6 }}>📅</span>
        <span suppressHydrationWarning>{formatRangeLabel(range)}</span>
        <span style={{ opacity: 0.5, fontSize: 10 }}>▾</span>
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 100,
            background: 'var(--bg2)',
            border: '1px solid var(--b2)',
            borderRadius: 'var(--r-lg, 12px)',
            boxShadow: 'var(--sh-lg, 0 12px 40px rgba(0,0,0,0.4))',
            padding: 8,
            minWidth: 230,
          }}
        >
          {/* Presets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {PRESETS.filter((p) => p.id !== 'custom').map((p) => {
              const active = preset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => choosePreset(p.id)}
                  style={{
                    textAlign: 'left',
                    padding: '7px 10px',
                    borderRadius: 'var(--r-sm, 6px)',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    background: active ? 'var(--acc-dim, rgba(139,92,246,0.12))' : 'transparent',
                    color: active ? 'var(--acc-hover, #a78bfa)' : 'var(--t1, #f3f4f8)',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Separador */}
          <div style={{ height: 1, background: 'var(--b1)', margin: '8px 4px' }} />

          {/* Rango personalizado */}
          <div style={{ padding: '2px 6px' }}>
            <div style={{ fontSize: 11, color: 'var(--t3, rgba(243,244,248,0.4))', marginBottom: 6 }}>
              Rango personalizado
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <input
                type="date"
                value={draftFrom}
                max={draftTo || undefined}
                onChange={(e) => setDraftFrom(e.target.value)}
                style={inputStyle}
              />
              <span style={{ color: 'var(--t3)', fontSize: 12 }}>→</span>
              <input
                type="date"
                value={draftTo}
                min={draftFrom || undefined}
                onChange={(e) => setDraftTo(e.target.value)}
                style={inputStyle}
              />
            </div>
            <button
              onClick={applyCustom}
              disabled={!draftFrom || !draftTo || draftFrom > draftTo}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 'var(--r-sm, 6px)',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                background: 'var(--acc, #8b5cf6)',
                color: '#fff',
                opacity: !draftFrom || !draftTo || draftFrom > draftTo ? 0.4 : 1,
              }}
            >
              Aplicar rango
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'var(--bg3, #1c1c28)',
  border: '1px solid var(--b1)',
  borderRadius: 'var(--r-sm, 6px)',
  color: 'var(--t1, #f3f4f8)',
  fontSize: 12,
  padding: '5px 7px',
  colorScheme: 'dark',
};
