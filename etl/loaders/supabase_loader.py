"""
Loader: Supabase — upsert por lotes
"""

import logging
from supabase import create_client, Client

log = logging.getLogger(__name__)
BATCH_SIZE = 500


class SupabaseLoader:
    def __init__(self, url: str, key: str):
        self.client: Client = create_client(url, key)

    def upsert(self, table: str, rows: list[dict], client_id: str):
        if not rows:
            return
        enriched = [{**row, "client_id": client_id} for row in rows]
        total, inserted, errors = len(enriched), 0, 0
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
        conflict_map = {
            # originales
            "meta_campaigns":           "client_id,date,ad_id",
            "gads_campaigns":           "client_id,date,campaign_name",
            "gads_asset_groups":        "client_id,date,campaign_name,asset_group_name",
            "gads_products":            "client_id,period,campaign_name,product_item_id",
            "gads_zombies":             "client_id,product_item_id",
            "gads_assets":              "client_id,asset_group_id,asset_id,field_type",
            "gads_search_terms":        "client_id,period_start,period_end",
            "ga4_metrics":              "client_id,date,source_medium",
            "ga4_funnel":               "client_id,date",
            "gmc_products":             "client_id,product_id",
            "shopify_orders":           "client_id,date",
            "shopify_products":         "client_id,period_start,product_id",
            "shopify_funnel":           "client_id,date",
            "clarity_metrics":          "client_id,date",
            "clarity_pages":            "client_id,date,page_url",
            # nuevas
            "gads_placements":          "client_id,campaign_name,placement",
            "gads_flowboost_products":  "client_id,product_item_id",
            "gads_flowboost_summary":   "client_id,label",
            "gads_search_categories":   "client_id,campaign_id,category_id",
            "gads_search_term_details": "client_id,campaign_id,search_term",
        }
        return conflict_map.get(table, "id")
