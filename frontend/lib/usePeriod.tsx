'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  type DateRange,
  type PresetId,
  resolvePreset,
  previousRange,
} from './period';

interface PeriodState {
  preset: PresetId;
  range: DateRange; // rango seleccionado
  previous: DateRange; // período anterior comparable
  setPreset: (p: PresetId) => void;
  setCustomRange: (r: DateRange) => void;
}

const PeriodContext = createContext<PeriodState | null>(null);
const STORAGE_KEY = 'deepscan.period';
const DEFAULT_PRESET: PresetId = '30d';

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [preset, setPresetState] = useState<PresetId>(DEFAULT_PRESET);
  const [range, setRange] = useState<DateRange>(() => resolvePreset(DEFAULT_PRESET));

  // Recupera la última selección guardada (solo en el cliente, tras montar)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { preset?: PresetId; range?: DateRange };
      if (saved.preset === 'custom' && saved.range) {
        setPresetState('custom');
        setRange(saved.range);
      } else if (saved.preset) {
        setPresetState(saved.preset);
        setRange(resolvePreset(saved.preset));
      }
    } catch {
      /* ignora storage corrupto */
    }
  }, []);

  function persist(p: PresetId, r: DateRange) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ preset: p, range: r }));
    } catch {
      /* almacenamiento no disponible */
    }
  }

  function setPreset(p: PresetId) {
    setPresetState(p);
    if (p !== 'custom') {
      const r = resolvePreset(p);
      setRange(r);
      persist(p, r);
    }
  }

  function setCustomRange(r: DateRange) {
    setPresetState('custom');
    setRange(r);
    persist('custom', r);
  }

  const value: PeriodState = {
    preset,
    range,
    previous: previousRange(range),
    setPreset,
    setCustomRange,
  };

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export function usePeriod(): PeriodState {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error('usePeriod must be used within PeriodProvider');
  return ctx;
}
