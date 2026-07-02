'use client';

import { useClient } from '@/lib/useClient';
import { Week } from './Week';
import { WeekEcommerce } from './WeekEcommerce';

// ── Router de "Esta semana" ─────────────────────────────────
// Gemelo de OverviewSwitch: un cliente "modelo de leads puro" (objetivo 'leads'
// y SIN 'ventas', ej. Ofero) ve la semana de leads (Week); el resto ve la
// semana ecommerce (WeekEcommerce). Branch por COMPONENTE (no por hook): este
// router solo llama useClient, así el orden de hooks es estable.
export function WeekSwitch() {
  const client = useClient();
  const isLeadsModel =
    client.objectives.includes('leads') && !client.objectives.includes('ventas');
  return isLeadsModel ? <Week /> : <WeekEcommerce />;
}
