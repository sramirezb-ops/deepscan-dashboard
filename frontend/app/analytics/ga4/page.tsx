'use client';

import { useClient } from '@/lib/useClient';
import { GA4 } from '@/components/views/GA4';
import { EcommerceWeb } from '@/components/views/EcommerceWeb';

// Vista de GA4 según el OBJETIVO del cliente (clients.objectives):
//  - Ecommerce ('ventas', ej. Sneakers Store / CowCow) → EcommerceWeb:
//    comparativa de webs, performance por producto y venta real (Shopify).
//  - Lead-gen ('leads', ej. Ofero Colombia) → GA4:
//    tráfico, eventos clave, funnel, canales, ciudades y eventos de WhatsApp.
// Antes el route estaba fijo en <EcommerceWeb/>, lo que rompía la vista de
// Ofero (que NO es ecommerce). Ahora la elige según el cliente activo.
export default function Page() {
  const client = useClient();
  const isEcommerce = client.objectives.includes('ventas');
  return isEcommerce ? <EcommerceWeb /> : <GA4 />;
}
