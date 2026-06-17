'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Client } from './types';
import type { ChannelId } from './channels';

const ClientContext = createContext<Client | null>(null);

export function ClientProvider({ client, children }: { client: Client; children: ReactNode }) {
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function useClient(): Client {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error('useClient must be used within ClientProvider');
  return ctx;
}

export function useIsChannelActive(channelId: ChannelId): boolean {
  const client = useClient();
  return client.activeChannels.includes(channelId);
}

/**
 * Cliente por defecto — lee de variables de entorno NEXT_PUBLIC_*
 * Fallback a valores hardcoded si no hay env.
 */
export const DEMO_CLIENT: Client = {
  id: process.env.NEXT_PUBLIC_CLIENT_ID || 'bae8c125-19e0-46b4-b0f6-462b642658ac',
  name: process.env.NEXT_PUBLIC_CLIENT_NAME || 'Sneakers Store',
  currency: (process.env.NEXT_PUBLIC_CURRENCY as 'MXN' | 'COP' | 'USD') || 'MXN',
  country: process.env.NEXT_PUBLIC_COUNTRY || 'México',
  activeChannels: [
    'ov2', 'week',
    'gads', 'pmax', 'srch', 'shop', 'yt',
    'meta', 'mili', 'wa', 'ig',
    'ttok',
    'ga4', 'cro', 'gsc',
    'shp', 'gmc',
    'ia', 'abtest', 'learn',
  ],
  // Sneakers Store es ecommerce puro → objetivo de ventas.
  // Un cliente con captación de prospectos llevaría ['ventas','leads'], etc.
  objectives: ['ventas'],
};
