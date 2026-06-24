// ============================================================
// LOADER de cliente — lee la "receta" desde Supabase
// ============================================================
// Reemplaza el DEMO_CLIENT hardcodeado: dado un slug (ej. 'sneakers-store')
// trae la ficha real del cliente con sus canales y objetivos.
//
// Red de seguridad: si la consulta falla o no encuentra el cliente,
// devuelve DEMO_CLIENT para que el tablero nunca quede en blanco.
// ============================================================

import { supabase } from './supabase';
import { DEMO_CLIENT } from './useClient';
import type { Client } from './types';
import type { ChannelId } from './channels';
import type { ObjectiveId } from './objectives';

// Forma cruda de la fila tal como viene de la tabla `clients`
interface ClientRow {
  id: string;
  name: string;
  slug: string;
  currency: string | null;
  country: string | null;
  enabled_channels: unknown; // jsonb → array de strings
  objectives: unknown; // jsonb → array de strings
}

const CLIENT_COLUMNS = 'id,name,slug,currency,country,enabled_channels,objectives';

// Logos reales de cliente (slug → asset en /public/logos). Permite mostrar el
// logo de marca en el sidebar sin depender de una columna en Supabase. Cuando
// se sume un cliente nuevo, basta con dejar su SVG en /public/logos y mapearlo.
const CLIENT_LOGOS: Record<string, string> = {
  'ofero-colombia': '/logos/OFERO.jpg',
};

// Metas de negocio por cliente (slug → objetivos acordados). A diferencia de
// las métricas, una meta NO la entrega ninguna plataforma: la define la agencia
// con el cliente. Por eso vive aquí, en config, y no en una tabla de datos.
// Mientras no exista un editor en el tablero, este mapa es la fuente de verdad.
const CLIENT_TARGETS: Record<string, { cplTarget?: number }> = {
  'ofero-colombia': { cplTarget: 2800 },
};

function rowToClient(row: ClientRow): Client {
  const targets = CLIENT_TARGETS[row.slug] || {};
  return {
    id: row.id,
    name: row.name,
    currency: (row.currency as Client['currency']) || 'USD',
    country: row.country || '',
    logoUrl: CLIENT_LOGOS[row.slug] || undefined,
    activeChannels: (Array.isArray(row.enabled_channels) ? row.enabled_channels : []) as ChannelId[],
    objectives: (Array.isArray(row.objectives) ? row.objectives : []) as ObjectiveId[],
    cplTarget: targets.cplTarget,
  };
}

/** Trae un cliente por su slug (el identificador de la URL, ej. 'sneakers-store'). */
export async function getClientBySlug(slug: string): Promise<Client> {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select(CLIENT_COLUMNS)
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      console.warn(`[getClientBySlug] cliente '${slug}' no encontrado, usando DEMO_CLIENT`);
      return DEMO_CLIENT;
    }
    return rowToClient(data as ClientRow);
  } catch (e) {
    console.error('[getClientBySlug] error, fallback a DEMO_CLIENT:', e);
    return DEMO_CLIENT;
  }
}

// Resumen mínimo de cliente para el selector interno de la agencia
export interface ClientSummary {
  id: string;
  name: string;
  slug: string;
}

/** Lista todos los clientes (para el selector interno de la agencia). */
export async function listClients(): Promise<ClientSummary[]> {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('id,name,slug')
      .order('name');
    if (error) throw error;
    return (data || []) as ClientSummary[];
  } catch (e) {
    console.error('[listClients] error:', e);
    return [];
  }
}
