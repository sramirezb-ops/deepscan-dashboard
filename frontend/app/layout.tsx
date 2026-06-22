import type { Metadata } from 'next';
import './globals.css';
import { ClientProvider } from '@/lib/useClient';
import { getClientBySlug } from '@/lib/getClient';
import { ChannelModalProvider } from '@/lib/useChannelModal';
import { PeriodProvider } from '@/lib/usePeriod';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { ChannelModal } from '@/components/layout/ChannelModal';

export const metadata: Metadata = {
  title: 'DEEPSCAN · Dashboard',
  description: 'Performance marketing dashboard para agencias',
};

// Cliente que se carga por defecto (hasta activar el ruteo por URL /[clientId]).
// Se puede cambiar con la variable NEXT_PUBLIC_DEFAULT_CLIENT_SLUG.
const DEFAULT_SLUG = process.env.NEXT_PUBLIC_DEFAULT_CLIENT_SLUG || 'sneakers-store';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Lee la "receta" del cliente desde Supabase (con fallback seguro interno)
  const client = await getClientBySlug(DEFAULT_SLUG);

  return (
    <html lang="es">
      <body>
        <ClientProvider client={client}>
          <PeriodProvider>
            <ChannelModalProvider>
              <div className="app" id="app">
                <div className="ov" id="ov" />
                <Sidebar />
                <main className="mn">
                  <Topbar />
                  <div className="ct" id="ctContent">
                    {children}
                  </div>
                </main>
              </div>
              <ChannelModal />
            </ChannelModalProvider>
          </PeriodProvider>
        </ClientProvider>
      </body>
    </html>
  );
}
