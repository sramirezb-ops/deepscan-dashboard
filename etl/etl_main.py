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
from extractors.meta_ads          import extract_meta_ads, extract_meta_platform, extract_meta_messaging
from extractors.tiktok_ads        import extract_tiktok_ads
from extractors.instagram_organic import extract_instagram_organic
from extractors.ga4             import extract_ga4, extract_ga4_cities
from extractors.shopify         import extract_shopify
from extractors.clarity         import extract_clarity
from extractors.gmc             import extract_gmc
# OJO: extractors.google_ads_api lee credenciales de la agencia (MCC) a nivel
# de módulo, así que su import se hace PEREZOSO dentro del bloque 10, solo
# cuando RUN_GOOGLE_ADS_API está activo. Importarlo aquí arriba haría fallar a
# los clientes de leads (p.ej. Ofero) que no tienen esas credenciales.
from loaders.supabase_loader    import SupabaseLoader

load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger(__name__)

# Propiedades GA4 a extraer en esta corrida. Todas se cargan bajo el mismo
# client_id, así que cada cliente corre con SUS propiedades.
#   · Preferido: GA4_PROPERTY_IDS = "485875757" (o varias separadas por coma).
#   · Compatibilidad: GA4_PROPERTY_ID_CLIENTE1/2 (cliente original de zapatos).
# Se filtran vacíos para que un cliente con una sola propiedad no arrastre la
# propiedad por defecto de otro.
_ga4_ids_env = os.environ.get("GA4_PROPERTY_IDS", "").strip()
if _ga4_ids_env:
    GA4_PROPERTIES = [p.strip() for p in _ga4_ids_env.split(",") if p.strip()]
else:
    GA4_PROPERTIES = [
        p for p in [
            os.environ.get("GA4_PROPERTY_ID_CLIENTE1", "508597206"),
            os.environ.get("GA4_PROPERTY_ID_CLIENTE2", "523524806"),
        ] if p and p.strip()
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
    # Fuente del script de Google Ads (Mike Rhodes) por Google Sheet. Es
    # OPCIONAL: los clientes de leads (p.ej. Ofero) no tienen este sheet, así
    # que si no hay MIKE_RHODES_SHEET_ID se salta en vez de tumbar el ETL.
    log.info("── PMAX Insights (Mike Rhodes v30)")
    mike_sheet_id = os.environ.get("MIKE_RHODES_SHEET_ID", "")
    if mike_sheet_id:
        try:
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
        except Exception as e:
            log.error(f"   ✗ Mike Rhodes error: {e}")
    else:
        log.warning("   ⚠ Mike Rhodes sin MIKE_RHODES_SHEET_ID — saltando")

    # ── 2. BRAND ANALYZER · smec ────────────────────────────────
    # También opcional (Google Sheet de términos branded). Sin SMEC_SHEET_ID
    # se salta, para no romper a clientes que no usan este script.
    log.info("── Brand Analyzer (smec)")
    smec_sheet_id = os.environ.get("SMEC_SHEET_ID", "")
    if smec_sheet_id:
        try:
            search_terms = extract_smec_search_terms(smec_sheet_id)
            loader.upsert("gads_search_terms", search_terms, client_id)
            log.info(f"   ✓ Períodos branded: {len(search_terms)} filas")
        except Exception as e:
            log.error(f"   ✗ Brand Analyzer (smec) error: {e}")
    else:
        log.warning("   ⚠ Brand Analyzer sin SMEC_SHEET_ID — saltando")

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

    # ── 5d. TIKTOK ADS API ──────────────────────────────────────
    # Solo corre si el cliente tiene credenciales de TikTok configuradas.
    # Así los clientes sin TikTok (p.ej. los que solo usan Meta) no fallan.
    tiktok_token       = os.environ.get("TIKTOK_ACCESS_TOKEN")
    tiktok_advertiser  = os.environ.get("TIKTOK_ADVERTISER_ID")
    if tiktok_token and tiktok_advertiser:
        log.info("── TikTok Ads API")
        try:
            tiktok_rows = extract_tiktok_ads(
                access_token=tiktok_token,
                advertiser_id=tiktok_advertiser,
                date_from=date_from,
                date_to=date_to
            )
            loader.upsert("tiktok_campaigns", tiktok_rows, client_id)
            log.info(f"   ✓ TikTok Ads: {len(tiktok_rows)} filas")
        except Exception as e:
            log.error(f"   ✗ TikTok Ads error: {e}")
    else:
        log.info("── TikTok Ads API · sin credenciales (TIKTOK_ACCESS_TOKEN / TIKTOK_ADVERTISER_ID) → omitido")

    # ── 5d. INSTAGRAM ORGÁNICO (Instagram Graph API) ────────────
    # Reutiliza META_ACCESS_TOKEN (necesita permisos instagram_basic +
    # instagram_manage_insights). Descubre la cuenta IG detrás de las Páginas
    # conectadas; se puede forzar con META_IG_ACCOUNT_ID / META_PAGE_IDS.
    log.info("── Instagram orgánico (cuenta + publicaciones)")
    try:
        page_ids_env = os.environ.get("META_PAGE_IDS", "1449409705114971,304959279376335")
        page_ids = [p.strip() for p in page_ids_env.split(",") if p.strip()]
        ig_data = extract_instagram_organic(
            access_token=os.environ["META_ACCESS_TOKEN"],
            date_from=date_from,
            date_to=date_to,
            page_ids=page_ids,
            ig_account_id=os.environ.get("META_IG_ACCOUNT_ID") or None,
        )
        loader.upsert("ig_account_daily", ig_data["account_daily"], client_id)
        loader.upsert("ig_media",         ig_data["media"],         client_id)
        log.info(
            f"   ✓ Instagram @{ig_data['ig_username']}: "
            f"{len(ig_data['account_daily'])} días, {len(ig_data['media'])} posts"
        )
    except Exception as e:
        log.error(f"   ✗ Instagram orgánico error: {e}")

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

    # Detalle por ciudad (fecha×país×ciudad). Se agrega entre propiedades
    # sumando por la clave de conflicto, para no perder filas si un cliente
    # tiene varias propiedades GA4 (p.ej. Sneakers usa 2).
    ga4_cities_merge: dict[tuple, dict] = {}
    for property_id in GA4_PROPERTIES:
        try:
            city_rows = extract_ga4_cities(
                property_id=property_id,
                credentials_path=os.environ["GOOGLE_CREDENTIALS_PATH"],
                date_from=date_from,
                date_to=date_to
            )
            for r in city_rows:
                key = (r["date"], r["country"], r["city"])
                acc = ga4_cities_merge.get(key)
                if acc is None:
                    ga4_cities_merge[key] = dict(r)
                else:
                    acc["sessions"]    += r["sessions"]
                    acc["users"]       += r["users"]
                    acc["new_users"]   += r["new_users"]
                    acc["conversions"] += r["conversions"]
            log.info(f"   ✓ GA4 ciudades {property_id}: {len(city_rows)} filas")
        except Exception as e:
            log.error(f"   ✗ GA4 ciudades {property_id}: {e}")
    loader.upsert("ga4_cities", list(ga4_cities_merge.values()), client_id)

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
    shopify_shop_url = os.environ.get("SHOPIFY_SHOP_URL", "")
    shopify_token    = os.environ.get("SHOPIFY_ACCESS_TOKEN", "")
    if shopify_shop_url and shopify_token:
        try:
            # Token offline permanente obtenido vía authorization code grant
            # (el client credentials grant no funciona en tiendas pagas).
            shop_orders, shop_products, shop_funnel = extract_shopify(
                shop_url=shopify_shop_url,
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
        log.warning("   ⚠ Shopify sin credenciales (SHOPIFY_SHOP_URL / SHOPIFY_ACCESS_TOKEN) — saltando")

    # ── 9. MICROSOFT CLARITY ────────────────────────────────────
    log.info("── Microsoft Clarity")
    clarity_api_token = os.environ.get("CLARITY_API_TOKEN", "")
    clarity_csv_path  = os.environ.get("CLARITY_CSV_PATH")
    if clarity_api_token:
        # Fuente preferida: Data Export API (datos automáticos, sin CSV manual).
        # Solo trae los últimos 1–3 días en UTC → los datos se acumulan hacia
        # adelante en cada corrida diaria.
        try:
            from extractors.clarity import extract_clarity_api
            clarity_metrics, clarity_pages = extract_clarity_api(
                token=clarity_api_token,
                run_date=date_to,   # etiqueta la ventana con el día más reciente cerrado
                num_days=1,
            )
            loader.upsert("clarity_metrics", clarity_metrics, client_id)
            # Las URLs cambian entre corridas → limpiar la fecha antes de reinsertar
            # para no acumular filas huérfanas (incl. las viejas con query strings).
            loader.delete_for_date("clarity_pages", client_id, date_to.isoformat())
            loader.upsert("clarity_pages",   clarity_pages,   client_id)
            log.info(f"   ✓ Clarity (API): {len(clarity_metrics)} día(s), {len(clarity_pages)} páginas")
        except Exception as e:
            log.error(f"   ✗ Clarity API error: {e}")
    elif clarity_csv_path and os.path.exists(clarity_csv_path):
        try:
            from extractors.clarity import extract_clarity
            clarity_metrics, clarity_pages = extract_clarity(clarity_csv_path)
            loader.upsert("clarity_metrics", clarity_metrics, client_id)
            loader.upsert("clarity_pages",   clarity_pages,   client_id)
            log.info(f"   ✓ Clarity (CSV): {len(clarity_metrics)} días")
        except Exception as e:
            log.error(f"   ✗ Clarity error: {e}")
    else:
        log.warning("   ⚠ Clarity sin CLARITY_API_TOKEN ni CSV — saltando")

    # ── 10. GOOGLE ADS API DIRECTA ──────────────────────────────
    # El extractor de Google Ads es MULTI-cliente: se auto-itera sobre todos
    # los clientes con google_ads_customer_id usando las credenciales de la
    # agencia (MCC). Por eso basta con que UN solo workflow lo dispare.
    # Los workflows secundarios (p.ej. Ofero) lo desactivan con
    # RUN_GOOGLE_ADS_API=0 para no jalar dos veces lo mismo.
    if os.environ.get("RUN_GOOGLE_ADS_API", "1") not in ("0", "false", "False", ""):
        log.info("── Google Ads API (datos completos)")
        try:
            # Import perezoso: solo aquí se cargan las credenciales MCC de la agencia.
            from extractors.google_ads_api import run as run_google_ads_api
            run_google_ads_api()
            log.info("   ✓ Google Ads API completado")
        except Exception as e:
            log.error(f"   ✗ Google Ads API error: {e}")
    else:
        log.info("── Google Ads API · desactivado (RUN_GOOGLE_ADS_API=0) — lo cubre el workflow principal")

    log.info(f"✅ ETL completado para client_id={client_id}")


if __name__ == "__main__":
    import sys
    client_id = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("DEFAULT_CLIENT_ID")
    if not client_id:
        log.error("Debes pasar client_id como argumento o DEFAULT_CLIENT_ID en .env")
        sys.exit(1)
    run_etl(client_id)