"""
DeepScan Dashboard · ETL Principal v5
Fuentes: PMAX Insights, Brand Analyzer, PMAX Search Terms, Flowboost Labelizer,
         Meta Ads API, GA4 API (x2), Shopify API, GMC, Clarity,
         Google Ads API directa (campañas, keywords, search terms, geo, ads)
"""

import os
import logging
from datetime import date, timedelta
from dotenv import load_dotenv

from extractors.google_sheets   import (
    extract_mike_rhodes,
    extract_smec_search_terms,
    extract_pmax_search_terms,
    extract_flowboost,
)
from extractors.meta_ads        import extract_meta_ads, extract_meta_platform, extract_meta_messaging
from extractors.ga4             import extract_ga4
from extractors.shopify         import extract_shopify
from extractors.clarity         import extract_clarity
from extractors.gmc             import extract_gmc
from extractors.google_ads_api  import run as run_google_ads_api
from loaders.supabase_loader    import SupabaseLoader

load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger(__name__)

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

    # ── 1. PMAX INSIGHTS · Mike Rhodes v30 ─────────────────────
    log.info("── PMAX Insights (Mike Rhodes v30)")
    mike_sheet_id = os.environ["MIKE_RHODES_SHEET_ID"]
    mike_data = extract_mike_rhodes(mike_sheet_id)

    loader.upsert("gads_campaigns",    mike_data["campaigns"],         client_id)
    loader.upsert("gads_asset_groups", mike_data["asset_groups"],      client_id)
    loader.upsert("gads_products",     mike_data["products_30d"],      client_id)
    loader.upsert("gads_products",     mike_data["products_180d"],     client_id)
    loader.upsert("gads_zombies",      mike_data["zombies"],           client_id)
    loader.upsert("gads_assets",       mike_data["assets"],            client_id)
    loader.upsert("gads_placements",   mike_data["placements_pmax"] + mike_data["placements_detail"], client_id)
    log.info(f"   ✓ Campañas: {len(mike_data['campaigns'])} filas")
    log.info(f"   ✓ Asset Groups: {len(mike_data['asset_groups'])} filas")
    log.info(f"   ✓ Productos 30d: {len(mike_data['products_30d'])} filas")
    log.info(f"   ✓ Placements: {len(mike_data['placements_pmax']) + len(mike_data['placements_detail'])} filas")

    # ── 2. BRAND ANALYZER · smec ────────────────────────────────
    log.info("── Brand Analyzer (smec)")
    smec_sheet_id = os.environ["SMEC_SHEET_ID"]
    search_terms = extract_smec_search_terms(smec_sheet_id)
    loader.upsert("gads_search_terms", search_terms, client_id)
    log.info(f"   ✓ Períodos branded: {len(search_terms)} filas")

    # ── 3. PMAX SEARCH TERMS ────────────────────────────────────
    log.info("── PMAX Search Terms")
    pmax_st_sheet_id = os.environ.get("PMAX_SEARCH_TERMS_SHEET_ID", "")
    if pmax_st_sheet_id:
        pmax_st = extract_pmax_search_terms(pmax_st_sheet_id)
        loader.upsert("gads_search_categories", pmax_st["categories"], client_id)
        loader.upsert("gads_search_term_details", pmax_st["terms"],    client_id)
        log.info(f"   ✓ Categorías: {len(pmax_st['categories'])} · Términos: {len(pmax_st['terms'])} filas")
    else:
        log.warning("   ⚠ PMAX_SEARCH_TERMS_SHEET_ID no configurado")

    # ── 4. FLOWBOOST LABELIZER ──────────────────────────────────
    log.info("── Flowboost Labelizer")
    flowboost_sheet_id = os.environ.get("FLOWBOOST_SHEET_ID", "")
    if flowboost_sheet_id:
        fb_data = extract_flowboost(flowboost_sheet_id)
        loader.upsert("gads_flowboost_products", fb_data["products"], client_id)
        loader.upsert("gads_flowboost_summary",  fb_data["summary"],  client_id)
        log.info(f"   ✓ Flowboost productos: {len(fb_data['products'])} filas")
    else:
        log.warning("   ⚠ FLOWBOOST_SHEET_ID no configurado")

    # ── 5. META ADS API ─────────────────────────────────────────
    log.info("── Meta Ads API")
    try:
        meta_rows = extract_meta_ads(
            access_token=os.environ["META_ACCESS_TOKEN"],
            ad_account_id=os.environ["META_AD_ACCOUNT_ID"],
            date_from=date_from,
            date_to=date_to
        )
        loader.upsert("meta_campaigns", meta_rows, client_id)
        log.info(f"   ✓ Meta Ads: {len(meta_rows)} filas")
    except Exception as e:
        log.error(f"   ✗ Meta Ads error: {e}")

    # ── 5b. META ADS POR PLATAFORMA (Instagram / Facebook / etc.) ─
    log.info("── Meta Ads por plataforma (publisher_platform)")
    try:
        platform_rows = extract_meta_platform(
            access_token=os.environ["META_ACCESS_TOKEN"],
            ad_account_id=os.environ["META_AD_ACCOUNT_ID"],
            date_from=date_from,
            date_to=date_to
        )
        loader.upsert("meta_platform", platform_rows, client_id)
        log.info(f"   ✓ Meta Platform: {len(platform_rows)} filas")
    except Exception as e:
        log.error(f"   ✗ Meta Platform error: {e}")

    # ── 5c. META ADS · MENSAJES / CONVERSACIONES ────────────────
    log.info("── Meta Ads · mensajes (conversaciones iniciadas)")
    try:
        messaging_rows = extract_meta_messaging(
            access_token=os.environ["META_ACCESS_TOKEN"],
            ad_account_id=os.environ["META_AD_ACCOUNT_ID"],
            date_from=date_from,
            date_to=date_to
        )
        loader.upsert("meta_messaging", messaging_rows, client_id)
        log.info(f"   ✓ Meta Messaging: {len(messaging_rows)} filas")
    except Exception as e:
        log.error(f"   ✗ Meta Messaging error: {e}")

    # ── 6. GOOGLE ANALYTICS 4 ───────────────────────────────────
    log.info("── Google Analytics 4 (2 propiedades)")
    all_ga4_rows, all_ga4_funnel = [], []
    for property_id in GA4_PROPERTIES:
        try:
            ga4_rows, ga4_funnel = extract_ga4(
                property_id=property_id,
                credentials_path=os.environ["GOOGLE_CREDENTIALS_PATH"],
                date_from=date_from,
                date_to=date_to
            )
            for row in ga4_rows:
                row["source_medium"] = f"{property_id} / {row.get('source_medium', 'direct')}"
            all_ga4_rows.extend(ga4_rows)
            all_ga4_funnel.extend(ga4_funnel)
            log.info(f"   ✓ GA4 {property_id}: {len(ga4_rows)} filas")
        except Exception as e:
            log.error(f"   ✗ GA4 {property_id}: {e}")
    loader.upsert("ga4_metrics", all_ga4_rows,   client_id)
    loader.upsert("ga4_funnel",  all_ga4_funnel, client_id)

    # ── 7. GOOGLE MERCHANT CENTER ───────────────────────────────
    log.info("── Google Merchant Center")
    try:
        gmc_rows = extract_gmc(
            merchant_id=os.environ["GMC_MERCHANT_ID"],
            credentials_path=os.environ["GOOGLE_CREDENTIALS_PATH"]
        )
        loader.upsert("gmc_products", gmc_rows, client_id)
        log.info(f"   ✓ GMC: {len(gmc_rows)} productos")
    except Exception as e:
        log.error(f"   ✗ GMC error: {e}")

    # ── 8. SHOPIFY ──────────────────────────────────────────────
    log.info("── Shopify")
    shopify_token = os.environ.get("SHOPIFY_ACCESS_TOKEN", "")
    if shopify_token:
        try:
            shop_orders, shop_products, shop_funnel = extract_shopify(
                shop_url=os.environ["SHOPIFY_SHOP_URL"],
                access_token=shopify_token,
                date_from=date_from,
                date_to=date_to
            )
            loader.upsert("shopify_orders",   shop_orders,   client_id)
            loader.upsert("shopify_products", shop_products, client_id)
            loader.upsert("shopify_funnel",   shop_funnel,   client_id)
            log.info(f"   ✓ Shopify: {len(shop_orders)} días")
        except Exception as e:
            log.error(f"   ✗ Shopify error: {e}")
    else:
        log.warning("   ⚠ SHOPIFY_ACCESS_TOKEN no configurado — saltando")

    # ── 9. MICROSOFT CLARITY ────────────────────────────────────
    log.info("── Microsoft Clarity")
    clarity_csv_path = os.environ.get("CLARITY_CSV_PATH")
    if clarity_csv_path and os.path.exists(clarity_csv_path):
        try:
            from extractors.clarity import extract_clarity
            clarity_metrics, clarity_pages = extract_clarity(clarity_csv_path)
            loader.upsert("clarity_metrics", clarity_metrics, client_id)
            loader.upsert("clarity_pages",   clarity_pages,   client_id)
            log.info(f"   ✓ Clarity: {len(clarity_metrics)} días")
        except Exception as e:
            log.error(f"   ✗ Clarity error: {e}")
    else:
        log.warning("   ⚠ Clarity CSV no encontrado — saltando")

    # ── 10. GOOGLE ADS API DIRECTA ──────────────────────────────
    log.info("── Google Ads API (datos completos)")
    try:
        run_google_ads_api()
        log.info("   ✓ Google Ads API completado")
    except Exception as e:
        log.error(f"   ✗ Google Ads API error: {e}")

    log.info(f"✅ ETL completado para client_id={client_id}")


if __name__ == "__main__":
    import sys
    client_id = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("DEFAULT_CLIENT_ID")
    if not client_id:
        log.error("Debes pasar client_id como argumento o DEFAULT_CLIENT_ID en .env")
        sys.exit(1)
    run_etl(client_id)