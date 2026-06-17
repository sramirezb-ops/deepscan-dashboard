'use client';

import { ConnectorPending } from './ConnectorPending';

export function Shopify() {
  return (
    <ConnectorPending
      title="Shopify · Tienda"
      channelLabel="Shopify"
      table="shopify_orders"
      icon="🛍️"
      note="Mostrará ingresos, órdenes, AOV, tasa de conversión, top de productos vendidos y el funnel de checkout."
    />
  );
}
