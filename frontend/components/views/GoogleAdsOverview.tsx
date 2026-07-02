'use client';

import { useClient } from '@/lib/useClient';
import { GoogleAdsLeadsOverview } from './GoogleAdsLeadsOverview';
import { GoogleAdsEcommerceOverview } from './GoogleAdsEcommerceOverview';

// ── Router de "Google Ads · Overview" ───────────────────────
// Gemelo de OverviewSwitch/WeekSwitch: branch por COMPONENTE (no por hook),
// así el orden de hooks es estable. Un cliente "modelo de leads puro"
// (objetivo 'leads' y SIN 'ventas', ej. Ofero) ve la vista de leads
// (sin revenue/ROAS, dos modelos de negocio). El resto —ecommerce— ve la
// vista con valor de conversión, ROAS de plataforma y mezcla por tipo.
//
// Independencia total: cada variante vive en su propio archivo y su propio
// hook (useGadsLeads vs useGadsEcommerce). Tocar una jamás afecta a la otra.
export function GoogleAdsOverviewSwitch() {
  const client = useClient();
  const isLeadsModel =
    client.objectives.includes('leads') && !client.objectives.includes('ventas');
  return isLeadsModel ? <GoogleAdsLeadsOverview /> : <GoogleAdsEcommerceOverview />;
}
