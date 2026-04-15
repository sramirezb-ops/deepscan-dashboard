"""
DeepScan Dashboard · ETL Principal
Lee: Google Sheets (Mike Rhodes + smec), Meta Ads API, GA4 API (x2), Shopify API, Clarity (CSV)
Escribe: Supabase (PostgreSQL)

Corre diario via GitHub Actions (gratis hasta 2000 min/mes)
"""

import os
import logging
from datetime import date, timedelta
from dotenv import load_dotenv

from extractors.google_sheets   import extract_mike_rhodes, extract_smec_search_terms
from extractors.meta_ads        import extract_meta_ads
from extractors.ga4             import extract_ga4
from extractors.shopify         import extract_shopify
from extractors.clarity         import extract_clarity
from extractors.gmc             import extract_gmc
from loaders.supabase_loader    import SupabaseLoader

load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger(__name__)

# ── Las dos propiedades de GA4 ─────────────────────────────────
GA4_PROPERTIES = [
    os.environ.get("GA4_PROPERTY_ID_CLIENTE1", "508597206"),
    os.environ.get("GA4_PROPERTY_ID_CLIENTE2", "523524806"),
]


def run_etl(client_id: str, days_back: int = 30):
    log.info(f"▶ Iniciando ETL para client_id={client_id}, días={days_back}")

    loader = SupabaseLoader(
        url=os.environ["SUPABASE_URL"],
        key=os.environ["SUPABASE_SERVICE_KEY"]
    )

    date_from = date.today() - timedelta(days=days_back)
    date_to   = date.today() - timedelta(days=1)

    # ── 1. GOOGLE ADS · Mike Rhodes Sheet ──────────────────────
    log.info("── Google Ads (Mike Rhodes Sheet)")
    sheet_id = os.environ["MIKE_RHODES_SHEET_ID"]
    mike_data = extract_mike_rhodes(sheet_id)

    loader.upsert("gads_campaigns",    mike_data["campaigns"],    client_id)
    loader.upsert("gads_asset_groups", mike_data["asset_groups"], client_id)
    loader.upsert("gads_products",     mike_data["products_30d"], client_id)
    loader.upsert("gads_products",     mike_data["products_180d"],client_id)
    loader.upsert("gads_zombies",      mike_data["zombies"],      client_id)
    loader.upsert("gads_assets",       mike_data["assets"],       client_id)
    log.info(f"   ✓ Campañas: {len(mike_data['campaigns'])} filas")
    log.info(f"   ✓ Asset Groups: {len(mike_data['asset_groups'])} filas")
    log.info(f"   ✓ Productos 30d: {len(mike_data['products_30d'])} filas")
    log.info(f"   ✓ Zombies: {len(mike_data['zombies'])} filas")

    # ── 2. GOOGLE ADS · smec Search Terms ──────────────────────
    log.info("── Google Ads (smec Branded vs Non-branded)")
    smec_sheet_id = os.environ["SMEC_SHEET_ID"]
    search_terms  = extract_smec_search_terms(smec_sheet_id)
    loader.upsert("gads_search_terms", search_terms, client_id)
    log.info(f"   ✓ Períodos: {len(search_terms)} filas")

    # ── 3. META ADS API ─────────────────────────────────────────
    log.info("── Meta Ads API")
    meta_rows = extract_meta_ads(
        access_token=os.environ["META_ACCESS_TOKEN"],
        ad_account_id=os.environ["META_AD_ACCOUNT_ID"],
        date_from=date_from,
        date_to=date_to
    )
    loader.upsert("meta_campaigns", meta_rows, client_id)
    log.info(f"   ✓ Anuncios Meta: {len(meta_rows)} filas")

    # ── 4. GOOGLE ANALYTICS 4 (dos propiedades) ─────────────────
    log.info("── Google Analytics 4 (2 propiedades)")
    all_ga4_rows   = []
    all_ga4_funnel = []

    for property_id in GA4_PROPERTIES:
        log.info(f"   Procesando GA4 property: {property_id}")
        try:
            ga4_rows, ga4_funnel = extract_ga4(
                property_id=property_id,
                credentials_path=os.environ["GOOGLE_CREDENTIALS_PATH"],
                date_from=date_from,
                date_to=date_to
            )
            # Agregar el property_id a cada fila para distinguirlas
            for row in ga4_rows:
                row["source_medium"] = f"{property_id} / {row.get('source_medium', 'direct')}"
            all_ga4_rows.extend(ga4_rows)
            all_ga4_funnel.extend(ga4_funnel)
            log.info(f"   ✓ GA4 {property_id}: {len(ga4_rows)} filas")
        except Exception as e:
            log.error(f"   ✗ GA4 {property_id} error: {e}")

    loader.upsert("ga4_metrics", all_ga4_rows,   client_id)
    loader.upsert("ga4_funnel",  all_ga4_funnel, client_id)

    # ── 5. GOOGLE MERCHANT CENTER ───────────────────────────────
    log.info("── Google Merchant Center")
    gmc_rows = extract_gmc(
        merchant_id=os.environ["GMC_MERCHANT_ID"],
        credentials_path=os.environ["GOOGLE_CREDENTIALS_PATH"]
    )
    loader.upsert("gmc_products", gmc_rows, client_id)
    log.info(f"   ✓ GMC productos: {len(gmc_rows)} filas")

    # ── 6. SHOPIFY ──────────────────────────────────────────────
    log.info("── Shopify")
    shop_orders, shop_products, shop_funnel = extract_shopify(
        shop_url=os.environ["SHOPIFY_SHOP_URL"],
        access_token=os.environ["SHOPIFY_ACCESS_TOKEN"],
        date_from=date_from,
        date_to=date_to
    )
    loader.upsert("shopify_orders",   shop_orders,   client_id)
    loader.upsert("shopify_products", shop_products, client_id)
    loader.upsert("shopify_funnel",   shop_funnel,   client_id)
    log.info(f"   ✓ Shopify órdenes: {len(shop_orders)} filas")

    # ── 7. MICROSOFT CLARITY (CSV export) ───────────────────────
    log.info("── Microsoft Clarity")
    clarity_csv_path = os.environ.get("CLARITY_CSV_PATH")
    if clarity_csv_path and os.path.exists(clarity_csv_path):
        clarity_metrics, clarity_pages = extract_clarity(clarity_csv_path)
        loader.upsert("clarity_metrics", clarity_metrics, client_id)
        loader.upsert("clarity_pages",   clarity_pages,   client_id)
        log.info(f"   ✓ Clarity métricas: {len(clarity_metrics)} filas")
    else:
        log.warning("   ⚠ Clarity CSV no encontrado — saltando")

    log.info(f"✅ ETL completado para client_id={client_id}")


if __name__ == "__main__":
    import sys
    client_id = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("DEFAULT_CLIENT_ID")
    if not client_id:
        log.error("Debes pasar client_id como argumento o DEFAULT_CLIENT_ID en .env")
        sys.exit(1)
    run_etl(client_id)
