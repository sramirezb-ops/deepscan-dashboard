// ============================================================
// Piso de datos por cliente (Google Ads) — config de agencia
// ============================================================
// Cuando un cliente CAMBIA de cuenta de Google Ads, las filas anteriores al
// cambio pertenecen a la cuenta vieja y NO deben leerse: contaminan campañas,
// revenue, ROAS, geo, etc. Este "piso" es un dato de negocio que ninguna
// plataforma entrega — lo define la agencia — por eso vive en config, igual
// que las metas de cliente (ver CLIENT_TARGETS en getClient.ts).
//
// REUTILIZABLE: para sumar un cliente, agrega su `client_id` (uuid de la tabla
// `clients`) y la fecha de arranque de su cuenta nueva (YYYY-MM-DD). Cualquier
// hook de Google que use estos helpers respeta el piso automáticamente; los
// clientes sin piso no se ven afectados (los helpers son no-op).
//
// Nota: las tablas "snapshot" (gads_products, gads_flowboost_products,
// gads_pmax_channels, gads_search_categories, gads_zombies, gads_assets) no
// tienen fecha por fila y se limpian en el propio Google Ads Script con el mismo
// piso. Aquí solo pisamos las tablas particionadas por fecha.
// ============================================================

const GADS_START_BY_CLIENT: Record<string, string> = {
  // Sneakers Store — la cuenta nueva de Google Ads arranca el 26-sep-2026.
  // Todo lo anterior es de la cuenta vieja y no debe leerse.
  'bae8c125-19e0-46b4-b0f6-462b642658ac': '2026-09-26',
};

/** Fecha mínima (YYYY-MM-DD) de datos válidos de Google Ads para el cliente, o null si no aplica. */
export function gadsStartDate(clientId: string | undefined | null): string | null {
  if (!clientId) return null;
  return GADS_START_BY_CLIENT[clientId] ?? null;
}

/**
 * Recorta un `from` de rango de fechas para que nunca sea anterior al piso del
 * cliente. Úsalo en helpers que ya filtran por rango (fetchPaged con from/to).
 */
export function floorGadsFrom(from: string, clientId: string | undefined | null): string {
  const floor = gadsStartDate(clientId);
  return floor && floor > from ? floor : from;
}

/**
 * Aplica el piso de fecha a un query de Supabase (postgrest-js) sobre una tabla
 * gads_ con columna de fecha. Si el cliente no tiene piso, devuelve el query igual.
 *
 *   applyGadsFloor(supabase.from('gads_campaigns').select('*').eq('client_id', id), id)
 *   applyGadsFloor(q, id, 'date_start')  // tablas cuya columna de fecha es date_start
 */
export function applyGadsFloor<Q extends { gte(col: string, val: string): Q }>(
  q: Q,
  clientId: string | undefined | null,
  dateCol: string = 'date',
): Q {
  const floor = gadsStartDate(clientId);
  return floor ? q.gte(dateCol, floor) : q;
}
