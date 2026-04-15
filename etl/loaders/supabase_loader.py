"""
Loader: Supabase
Inserta o actualiza (upsert) datos en Supabase usando la REST API.
Usa lotes de 500 filas para no saturar la conexión.
"""

import logging
from typing import Any
from supabase import create_client, Client

log = logging.getLogger(__name__)

BATCH_SIZE = 500


class SupabaseLoader:
    def __init__(self, url: str, key: str):
        self.client: Client = create_client(url, key)

    def upsert(self, table: str, rows: list[dict], client_id: str):
        """
        Hace upsert en la tabla indicada.
        Agrega client_id a cada fila automáticamente.
        Procesa en lotes de BATCH_SIZE.
        """
        if not rows:
            log.debug(f"   {table}: 0 filas, saltando")
            return

        # Inyectar client_id en cada fila
        enriched = [{**row, "client_id": client_id} for row in rows]

        total    = len(enriched)
        inserted = 0
        errors   = 0

        for i in range(0, total, BATCH_SIZE):
            batch = enriched[i:i + BATCH_SIZE]
            try:
                self.client.table(table)\
                    .upsert(batch, on_conflict=self._conflict_columns(table))\
                    .execute()
                inserted += len(batch)
            except Exception as e:
                errors += len(batch)
                log.error(f"   {table} batch {i//BATCH_SIZE + 1} error: {e}")

        log.info(f"   ✓ {table}: {inserted}/{total} filas (errores: {errors})")

    def _conflict_columns(self, table: str) -> str:
        """
        Define las columnas de conflicto para upsert por tabla.
        Deben coincidir con las constraints UNIQUE del schema SQL.
        """
        conflict_map = {
            "meta_campaigns":    "client_id,date,ad_id",
            "gads_campaigns":    "client_id,date,campaign_name",
            "gads_asset_groups": "client_id,date,campaign_name,asset_group_name",
            "gads_products":     "client_id,period,campaign_name,product_item_id",
            "gads_zombies":      "client_id,product_item_id",
            "gads_assets":       "client_id,asset_group_id,asset_id,field_type",
            "gads_search_terms": "client_id,period_start,period_end",
            "ga4_metrics":       "client_id,date,source_medium",
            "ga4_funnel":        "client_id,date",
            "gmc_products":      "client_id,product_id",
            "shopify_orders":    "client_id,date",
            "shopify_products":  "client_id,period_start,product_id",
            "shopify_funnel":    "client_id,date",
            "clarity_metrics":   "client_id,date",
            "clarity_pages":     "client_id,date,page_url",
        }
        return conflict_map.get(table, "id")
