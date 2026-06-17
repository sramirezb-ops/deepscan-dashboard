'use client';

import { ConnectorPending } from './ConnectorPending';

export function SearchConsole() {
  return (
    <ConnectorPending
      title="Search Console"
      channelLabel="Google Search Console"
      table="search_console"
      icon="🔎"
      note="Mostrará clics, impresiones, CTR y posición media de las consultas y páginas en búsqueda orgánica."
    />
  );
}
