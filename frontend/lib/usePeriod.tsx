'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  type DateRange,
  type PresetId,
  resolvePreset,
  previousMonthRange,
} from './period';

export type CompareMode = 'auto' | 'custom';

interface PeriodState {
  preset: PresetId;
  range: DateRange; // rango seleccionado
  previous: DateRange; // período de comparación efectivo (auto o personalizado)
  compareMode: CompareMode; // 'auto' = período anterior; 'custom' = fechas fijas
  customPrevious: DateRange | null; // comparación personalizada (si compareMode === 'custom')
  setPreset: (p: PresetId) => void;
  setCustomRange: (r: DateRange) => void;
  setCompareAuto: () => void;
  setCompareCustom: (r: DateRange) => void;
}

const PeriodContext = createContext<PeriodState | null>(null);
const STORAGE_KEY = 'deepscan.period';
const DEFAULT_PRESET: PresetId = '30d';

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [preset, setPresetState] = useState<PresetId>(DEFAULT_PRESET);
  const [range, setRange] = useState<DateRange>(() => resolvePreset(DEFAULT_PRESET));
  const [compareMode, setCompareMode] = useState<CompareMode>('auto');
  const [customPrevious, setCustomPrevious] = useState<DateRange | null>(null);
  const hydrated = useRef(false);

  // Recupera la última selección guardada (solo en el cliente, tras montar)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          preset?: PresetId;
          range?: DateRange;
          compareMode?: CompareMode;
          customPrevious?: DateRange | null;
        };
        if (saved.preset === 'custom' && saved.range) {
          setPresetState('custom');
          setRange(saved.range);
        } else if (saved.preset) {
          setPresetState(saved.preset);
          setRange(resolvePreset(saved.preset));
        }
        if (saved.compareMode === 'custom' && saved.customPrevious) {
          setCompareMode('custom');
          setCustomPrevious(saved.customPrevious);
        }
      }
    } catch {
      /* ignora storage corrupto */
    }
    hydrated.current = true;
  }, []);

  // Persiste cualquier cambio (después de hidratar, para no pisar lo guardado)
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ preset, range, compareMode, customPrevious })
      );
    } catch {
      /* almacenamiento no disponible */
    }
  }, [preset, range, compareMode, customPrevious]);

  function setPreset(p: PresetId) {
    setPresetState(p);
    if (p !== 'custom') setRange(resolvePreset(p));
  }

  function setCustomRange(r: DateRange) {
    setPresetState('custom');
    setRange(r);
  }

  function setCompareAuto() {
    setCompareMode('auto');
  }

  function setCompareCustom(r: DateRange) {
    setCompareMode('custom');
    setCustomPrevious(r);
  }

  const previous =
    compareMode === 'custom' && customPrevious ? customPrevious : previousMonthRange(range);

  const value: PeriodState = {
    preset,
    range,
    previous,
    compareMode,
    customPrevious,
    setPreset,
    setCustomRange,
    setCompareAuto,
    setCompareCustom,
  };

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export function usePeriod(): PeriodState {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error('usePeriod must be used within PeriodProvider');
  return ctx;
}
