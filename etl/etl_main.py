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
    extract_pmax_channels,
    extract_smec_search_terms,
    extract_pmax_search_terms,
    extract_flowboost,
)
from extractors.aura            import extract_aura
from extractors.implementations   import extract_implementations
from extractors.meta_ads          import (
    extract_meta_ads, extract_meta_platform, extract_meta_messaging,
    extract_meta_breakdown, extract_meta_ad_creatives, extract_meta_placement,
    extract_meta_catalog_products, extract_meta_catalog_health,
    extract_meta_change_events,
    _fetch_catalog_products,
)
from extractors.tiktok_ads        import extract_tiktok_ads, extract_tiktok_creatives
from extractors.tiktok_comments   import extract_tiktok_comments
from extractors.meta_comments      import extract_meta_comments
from extractors.instagram_organic import extract_instagram_organic
from extractors.ga4             import (
    extract_ga4,
    extract_ga4_cities,
    extract_ga4_routes,
    extract_ga4_events,
    extract_ga4_pages,
    extract_ga4_items,
)
from extractors.shopify         import extract_shopify, extract_shopify_abandoned
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

    # ── 0. AURA · venta real (Google Sheet) ────────────────────
    # El id del Sheet vive en clients.aura_sheet_id (público de lectura). Solo los
    # clientes que lo tengan configurado (p.ej. Sneaker Store) corren este bloque.
    # Se sincroniza por reemplazo (delete + upsert) para reflejar cambios de estado
    # y bajas de la hoja. Best-effort: si falla, no tumba el resto del ETL.
    try:
        _c = loader.client.table("clients").select("aura_sheet_id").eq("id", client_id).limit(1).execute()
        aura_sheet_id = (_c.data[0].get("aura_sheet_id") if _c.data else "") or ""
    except Exception as e:
        log.warning(f"   AURA: no se pudo leer clients.aura_sheet_id: {e}")
        aura_sheet_id = ""
    if aura_sheet_id:
        log.info("── AURA (venta real · Google Sheet)")
        try:
            aura_rows = extract_aura(aura_sheet_id)
            if aura_rows:
                loader.delete_for_client("aura_sales", client_id)
                loader.upsert("aura_sales", aura_rows, client_id)
        except Exception as e:
            log.warning(f"   AURA: extracción/carga falló: {e}")

    # ── 1. PMAX INSIGHTS · Mike Rhodes v30 ─────────────────────
    # Fuente del script de Google Ads (Mike Rhodes) por Google Sheet. Es
    # OPCIONAL: los clientes de leads (p.ej. Ofero) no tienen este sheet, así
    # que si no hay MIKE_RHODES_SHEET_ID se salta en vez de tumbar el ETL.
    log.info("── PMAX Insights (Mike Rhodes v30)")
    mike_sheet_id = os.environ.get("MIKE_RHODES_SHEET_ID", "")
    if mike_sheet_id:
        try:
            mike_data = extract_mike_rhodes(mike_sheet_id)
            # gads_campaigns, gads_asset_groups y gads_assets YA NO se escriben
            # desde el sheet: los provee la API de Google Ads (bloque 10) para
            # TODOS los clientes, con campaign_id real, fechas frescas, métricas
            # exactas y ad_strength real cuando Google lo calcula. El sheet solo
            # conserva lo que la API no expone: productos, zombies y el split de
            # redes (placements). Así una sola fuente manda por tabla.
            # SNAPSHOT: el sheet es la foto actual del feed. Reemplazo total para
            # que productos/campañas de la cuenta ANTERIOR (o de meses viejos) no
            # se acumulen y contaminen los tiers over/index. Solo borramos si el
            # extract sí trajo datos, para no vaciar por un error transitorio.
            if mike_data["products_30d"] or mike_data["products_180d"]:
                loader.delete_for_client("gads_products", client_id)
                loader.upsert("gads_products",     mike_data["products_30d"],      client_id)
                loader.upsert("gads_products",     mike_data["products_180d"],     client_id)
            if mike_data["zombies"]:
                loader.delete_for_client("gads_zombies", client_id)
                loader.upsert("gads_zombies",      mike_data["zombies"],           client_id)
            placements = mike_data["placements_pmax"] + mike_data["placements_detail"]
            if placements:
                loader.delete_for_client("gads_placements", client_id)
                loader.upsert("gads_placements",   placements, client_id)
            log.info(f"   ✓ Productos 30d: {len(mike_data['products_30d'])} filas")
            log.info(f"   ✓ Zombies: {len(mike_data['zombies'])} filas")
            log.info(f"   ✓ Placements: {len(mike_data['placements_pmax']) + len(mike_data['placements_detail'])} filas")
        except Exception as e:
            log.error(f"   ✗ Mike Rhodes error: {e}")
    else:
        log.warning("   ⚠ Mike Rhodes sin MIKE_RHODES_SHEET_ID — saltando")

    # ── 1b. PMAX CHANNEL SPLIT · pestaña "Campaigns" ────────────
    # Desglose del gasto PMax por red (Shop/Video/Display/Search*). Es la ÚNICA
    # fuente de este split (Google no lo expone por API). Va en su propia
    # variable PMAX_CHANNELS_SHEET_ID para que un cliente de LEADS (p.ej. Ofero)
    # traiga SOLO el split sin el resto del sheet de Mike Rhodes; si no está,
    # cae al MIKE_RHODES_SHEET_ID (mismo sheet, pestaña "Campaigns").
    log.info("── PMAX Channel Split (pestaña Campaigns)")
    pmax_channels_sheet = os.environ.get("PMAX_CHANNELS_SHEET_ID", "") or mike_sheet_id
    if pmax_channels_sheet:
        try:
            channels = extract_pmax_channels(pmax_channels_sheet)
            # SNAPSHOT: reemplazo total. Sin esto, campañas viejas quedaban
            # sumándose al split de redes (Shopping/Search/Display/Video).
            if channels:
                loader.delete_for_client("gads_pmax_channels", client_id)
                loader.upsert("gads_pmax_channels", channels, client_id)
            log.info(f"   ✓ Redes PMax: {len(channels)} filas (campaña × red)")
        except Exception as e:
            log.error(f"   ✗ PMAX Channel Split error: {e}")
    else:
        log.warning("   ⚠ Sin PMAX_CHANNELS_SHEET_ID ni MIKE_RHODES_SHEET_ID — saltando")

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
        # Reemplazo total: el sheet es un snapshot del período actual. Sin esto,
        # datos viejos (de otra cuenta/mes) se acumulan y contaminan la vista.
        loader.delete_for_client("gads_search_categories", client_id)
        loader.delete_for_client("gads_search_term_details", client_id)
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
        # SNAPSHOT: reemplazo total para no acumular product_item_id de feeds viejos.
        if fb_data["products"]:
            loader.delete_for_client("gads_flowboost_products", client_id)
            loader.upsert("gads_flowboost_products", fb_data["products"], client_id)
        if fb_data["summary"]:
            loader.delete_for_client("gads_flowboost_summary", client_id)
            loader.upsert("gads_flowboost_summary",  fb_data["summary"],  client_id)
        log.info(f"   ✓ Flowboost productos: {len(fb_data['products'])} filas")
    else:
        log.warning("   ⚠ FLOWBOOST_SHEET_ID no configurado")

    # ── 4b. BITÁCORA DE IMPLEMENTACIONES ────────────────────────
    # Google Sheet que la agencia llena a mano con lo que fue haciendo en las
    # cuentas (subir creativos, pausar campañas, mover presupuesto). El
    # dashboard cruza estas filas con la tendencia diaria y dibuja marcadores.
    # Opcional: sin IMPLEMENTATIONS_SHEET_ID se salta (no rompe a nadie).
    log.info("── Bitácora de implementaciones")
    impl_sheet_id = os.environ.get("IMPLEMENTATIONS_SHEET_ID", "")
    if impl_sheet_id:
        try:
            impl_tab = os.environ.get("IMPLEMENTATIONS_SHEET_TAB", "Bitacora")
            implementations = extract_implementations(impl_sheet_id, impl_tab)
            loader.upsert("implementations", implementations, client_id)
            log.info(f"   ✓ Bitácora: {len(implementations)} implementaciones")
        except Exception as e:
            log.error(f"   ✗ Bitácora error: {e}")
    else:
        log.warning("   ⚠ Bitácora sin IMPLEMENTATIONS_SHEET_ID — saltando")

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

    # ── 5a2. META HISTORIAL DE CAMBIOS (Agencia vs IA) ───────────
    log.info("── Meta Ads historial de cambios (actividades)")
    try:
        meta_ch = extract_meta_change_events(
            access_token=os.environ["META_ACCESS_TOKEN"],
            ad_account_id=os.environ["META_AD_ACCOUNT_ID"],
            client_id=client_id,
        )
        loader.upsert("meta_change_events", meta_ch, client_id)  # ACUMULA (upsert por change_key)
        log.info(f"   ✓ Meta change events: {len(meta_ch)} filas")
    except Exception as e:
        log.error(f"   ✗ Meta change events error: {e}")

    # ── 5b. META ADS POR PLATAFORMA (Instagram / Facebook / etc.) ─
    log.info("── Meta Ads por plataforma (publisher_platform)")
    try:
        platform_rows = extract_meta_platform(
            access_token=os.environ["META_ACCESS_TOKEN"],
            ad_account_id=os.environ["META_AD_ACCOUNT_ID"],
            date_from=date_from,
            date_to=date_to
        )
        # meta_platform se keyea por nombre → un renombre deja huérfanos.
        # Reescribimos la ventana completa (solo si el pull trae datos, para no vaciar
        # por un fallo). Así los renombres no fragmentan y las campañas nuevas entran.
        if platform_rows:
            loader.delete_for_date_range("meta_platform", client_id, date_from, date_to)
        loader.upsert("meta_platform", platform_rows, client_id)
        log.info(f"   ✓ Meta Platform: {len(platform_rows)} filas")
    except Exception as e:
        log.error(f"   ✗ Meta Platform error: {e}")

    # ── 5b2. META BREAKDOWNS (segmento + plataforma, conjunto y anuncio) ─
    log.info("── Meta Ads breakdowns (segmento / plataforma)")
    try:
        _tok = os.environ["META_ACCESS_TOKEN"]; _acc = os.environ["META_AD_ACCOUNT_ID"]
        bd_all = []
        for _level, _bd in [("adset", "user_segment_key"), ("adset", "publisher_platform"),
                            ("ad", "publisher_platform")]:
            try:
                bd_all += extract_meta_breakdown(_tok, _acc, date_from, date_to, _level, _bd)
            except Exception as e:
                log.error(f"   ✗ breakdown {_level}×{_bd}: {e}")
        # Ubicación/formato por anuncio (publisher_platform + platform_position juntos)
        try:
            bd_all += extract_meta_placement(_tok, _acc, date_from, date_to)
        except Exception as e:
            log.error(f"   ✗ breakdown ad×placement: {e}")
        loader.upsert("meta_breakdowns", bd_all, client_id)
        log.info(f"   ✓ Meta Breakdowns: {len(bd_all)} filas")
    except Exception as e:
        log.error(f"   ✗ Meta Breakdowns error: {e}")

    # ── 5b3. META CATÁLOGO (entrega por producto + salud del feed) ──────
    # Id del catálogo Shopify por cliente. Se puede sobreescribir con META_CATALOG_ID
    # en el entorno; si no, se resuelve por client_id. Sin catálogo → se omite.
    _CATALOG_BY_CLIENT = {
        "bae8c125-19e0-46b4-b0f6-462b642658ac": "2076243159883599",  # Sneakers Store · "Shopify - Catálogo Sneakers Store"
    }
    _cat = os.environ.get("META_CATALOG_ID", "").strip() or _CATALOG_BY_CLIENT.get(str(client_id), "")
    if _cat:
        log.info("── Meta Ads catálogo (entrega por producto / salud)")
        _tok = os.environ["META_ACCESS_TOKEN"]; _acc = os.environ["META_AD_ACCOUNT_ID"]
        # Lectura del feed (nombres + salud). Puede fallar por permisos del token
        # sobre el catálogo → se registra y se sigue (la entrega no depende de esto).
        prod_map = {}
        try:
            prod_map = _fetch_catalog_products(_tok, _cat)
        except Exception as e:
            log.error(f"   ✗ Catálogo feed (nombres/salud) error: {e}")
        # Entrega por producto (insights de la cuenta — el nombre viene en el propio
        # product_id, así que NO depende del feed aunque esté bloqueado por permisos)
        try:
            cp = extract_meta_catalog_products(_tok, _acc, _cat, date_from, date_to, prod_map)
            loader.upsert("meta_catalog_products", cp, client_id)
            log.info(f"   ✓ Catálogo entrega: {len(cp)} productos con pauta")
        except Exception as e:
            log.error(f"   ✗ Catálogo entrega error: {e}")
        # Salud del feed (requiere haber leído el feed)
        if prod_map:
            try:
                ch = extract_meta_catalog_health(_tok, _cat, prod_map)
                loader.upsert("meta_catalog_health", ch, client_id)
                log.info(f"   ✓ Catálogo salud: {ch[0]}")
            except Exception as e:
                log.error(f"   ✗ Catálogo salud error: {e}")
    else:
        log.info("   · Meta Catálogo omitido (sin META_CATALOG_ID)")

    # ── 5b3. META CREATIVOS (media + copy de los anuncios que gastaron) ──
    log.info("── Meta Ads creativos (media)")
    cre_rows: list[dict] = []
    try:
        # ad_ids de los anuncios que corrieron con gasto en el período (activos o
        # pausados) → así el grid de Compras tiene media en todos, no solo activos.
        spent_ids = sorted({
            str(r.get("ad_id")) for r in (meta_rows if "meta_rows" in dir() else [])
            if r.get("ad_id") and (r.get("spend") or 0) > 0
        })
        cre_rows = extract_meta_ad_creatives(
            os.environ["META_ACCESS_TOKEN"], os.environ["META_AD_ACCOUNT_ID"],
            ad_ids=spent_ids or None)
        loader.upsert("meta_ad_creatives", cre_rows, client_id)
        log.info(f"   ✓ Meta creativos: {len(cre_rows)} filas (de {len(spent_ids)} con gasto)")
    except Exception as e:
        log.error(f"   ✗ Meta creativos error: {e}")

    # ── 5b-bis. META ADS · COMENTARIOS (Instagram) ──────────────
    # Lee los comentarios del post de IG de cada creativo (texto + sentimiento).
    # Best-effort: si el token no tiene instagram_manage_comments, aborta limpio.
    log.info("── Meta Ads · comentarios (Instagram)")
    try:
        mc_rows = extract_meta_comments(os.environ["META_ACCESS_TOKEN"], cre_rows)
        if mc_rows:
            loader.upsert("meta_comments", mc_rows, client_id)
        log.info(f"   ✓ Meta comentarios: {len(mc_rows)} comentarios")
    except Exception as e:
        log.error(f"   ✗ Meta comentarios error: {e}")

    # ── 5c. META ADS · MENSAJES / CONVERSACIONES ────────────────
    log.info("── Meta Ads · mensajes (conversaciones iniciadas)")
    try:
        messaging_rows = extract_meta_messaging(
            access_token=os.environ["META_ACCESS_TOKEN"],
            ad_account_id=os.environ["META_AD_ACCOUNT_ID"],
            date_from=date_from,
            date_to=date_to
        )
        # meta_messaging se keyea por nombre de campaña + adset → mismo problema
        # de huérfanos al renombrar. Reescribimos la ventana (guardado si hay datos).
        if messaging_rows:
            loader.delete_for_date_range("meta_messaging", client_id, date_from, date_to)
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

            # Creativos (portada + video) de los anuncios del rango. Best-effort:
            # si la API no da permiso, devuelve [] y el dashboard deja el marcador.
            try:
                ad_ids = [r["ad_id"] for r in tiktok_rows if r.get("ad_id")]
                creatives = extract_tiktok_creatives(
                    access_token=tiktok_token,
                    advertiser_id=tiktok_advertiser,
                    ad_ids=ad_ids,
                )
                loader.upsert("tiktok_creatives", creatives, client_id)
                log.info(f"   ✓ TikTok creativos: {len(creatives)} anuncios con portada")
            except Exception as e:
                log.error(f"   ✗ TikTok creativos error: {e}")

            # Comentarios de los anuncios (con sentiment derivado). Best-effort:
            # la API busca por grupo de anuncios, así que reusamos los adgroup_ids
            # del reporte. Si la app no tiene permiso de gestión de comentarios,
            # devuelve [] y la hoja mantiene su marcador honesto.
            try:
                adgroup_ids = sorted({
                    r["adgroup_id"] for r in tiktok_rows if r.get("adgroup_id")
                })
                comments = extract_tiktok_comments(
                    access_token=tiktok_token,
                    advertiser_id=tiktok_advertiser,
                    adgroup_ids=adgroup_ids,
                    date_from=date_from,
                    date_to=date_to,
                )
                loader.upsert("tiktok_comments", comments, client_id)
                log.info(f"   ✓ TikTok comentarios: {len(comments)} comentarios")
            except Exception as e:
                log.error(f"   ✗ TikTok comentarios error: {e}")
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

    # Conteo diario de eventos por nombre (fecha×evento). Alimenta el funnel
    # de leads del dashboard (Escribir Correo / Descargar Catálogo / Clics a
    # WhatsApp). Se mantiene SEPARADO por property_id: cada propiedad GA4 es una
    # web distinta (p.ej. la tienda Shopify vs otro sitio) y sumarlas nubla la
    # interpretación. La vista decide qué propiedad mostrar.
    ga4_events_merge: dict[tuple, dict] = {}
    for property_id in GA4_PROPERTIES:
        try:
            event_rows = extract_ga4_events(
                property_id=property_id,
                credentials_path=os.environ["GOOGLE_CREDENTIALS_PATH"],
                date_from=date_from,
                date_to=date_to
            )
            for r in event_rows:
                key = (r["date"], r["property_id"], r["event_name"])
                acc = ga4_events_merge.get(key)
                if acc is None:
                    ga4_events_merge[key] = dict(r)
                else:
                    acc["event_count"] += r["event_count"]
                    acc["total_users"] += r["total_users"]
                    acc["is_key_event"] = max(acc["is_key_event"], r["is_key_event"])
            log.info(f"   ✓ GA4 eventos {property_id}: {len(event_rows)} filas")
        except Exception as e:
            log.error(f"   ✗ GA4 eventos {property_id}: {e}")
    loader.upsert("ga4_events", list(ga4_events_merge.values()), client_id)

    # Páginas con más tráfico (fecha×ruta) y páginas de entrada (fecha×landing).
    # Se agregan entre propiedades sumando por la clave de conflicto.
    ga4_pages_merge: dict[tuple, dict] = {}
    ga4_landing_merge: dict[tuple, dict] = {}
    for property_id in GA4_PROPERTIES:
        try:
            top_rows, land_rows = extract_ga4_pages(
                property_id=property_id,
                credentials_path=os.environ["GOOGLE_CREDENTIALS_PATH"],
                date_from=date_from,
                date_to=date_to
            )
            for r in top_rows:
                key = (r["date"], r["page_path"])
                acc = ga4_pages_merge.get(key)
                if acc is None:
                    ga4_pages_merge[key] = dict(r)
                else:
                    acc["views"]              += r["views"]
                    acc["sessions"]           += r["sessions"]
                    acc["users"]              += r["users"]
                    acc["engagement_seconds"] += r["engagement_seconds"]
                    acc["conversions"]        += r["conversions"]
                    # Rebote: promedio ponderado por sesiones entre propiedades.
                    s1, s2 = acc["sessions"], r["sessions"]
                    if s1 + s2 > 0:
                        acc["bounce_rate"] = round(
                            (acc["bounce_rate"] * (s1 - s2) + r["bounce_rate"] * s2) / s1, 4
                        ) if s1 > 0 else r["bounce_rate"]
            for r in land_rows:
                # Etiquetamos la propiedad GA4 de origen y NO fusionamos entre
                # propiedades: así una hoja puede aislar una sola (p.ej. Shopify)
                # y no se suman rutas compartidas (como "/") de sitios distintos.
                r["property_id"] = str(property_id)
                key = (r["date"], r["landing_page"], str(property_id))
                acc = ga4_landing_merge.get(key)
                if acc is None:
                    ga4_landing_merge[key] = dict(r)
                else:
                    acc["sessions"]    += r["sessions"]
                    acc["users"]       += r["users"]
                    acc["conversions"] += r["conversions"]
                    acc["add_to_cart"] += r.get("add_to_cart", 0)
                    acc["checkout"]    += r.get("checkout", 0)
                    acc["purchases"]   += r.get("purchases", 0)
                    acc["revenue"]     += r.get("revenue", 0)
            log.info(f"   ✓ GA4 páginas {property_id}: {len(top_rows)} top, {len(land_rows)} landing")
        except Exception as e:
            log.error(f"   ✗ GA4 páginas {property_id}: {e}")
    loader.upsert("ga4_pages",   list(ga4_pages_merge.values()),   client_id)
    loader.upsert("ga4_landing", list(ga4_landing_merge.values()), client_id)

    # Exploración de RUTA de 1 salto (de qué página/fuente vino → a qué página
    # llegó), vía pageReferrer. Agregada sobre la ventana (sin fecha), separada
    # por property_id. Alimenta la sección "caminos más comunes" del dashboard.
    ga4_routes_merge: dict[tuple, dict] = {}
    for property_id in GA4_PROPERTIES:
        try:
            route_rows = extract_ga4_routes(
                property_id=property_id,
                credentials_path=os.environ["GOOGLE_CREDENTIALS_PATH"],
                date_from=date_from,
                date_to=date_to,
            )
            for r in route_rows:
                key = (r["from_label"], r["to_path"], r["kind"], r["property_id"])
                acc = ga4_routes_merge.get(key)
                if acc is None:
                    ga4_routes_merge[key] = dict(r)
                else:
                    acc["sessions"] += r["sessions"]
                    acc["views"] += r["views"]
            log.info(f"   ✓ GA4 rutas {property_id}: {len(route_rows)} transiciones")
        except Exception as e:
            log.error(f"   ✗ GA4 rutas {property_id}: {e}")
    # Reemplaza la foto anterior de rutas del cliente (agregado por ventana, no
    # por fecha): borramos y reinsertamos para no acumular ventanas viejas.
    # Best-effort: si la tabla ga4_routes aún no existe (migración sin aplicar),
    # no tumbamos el ETL.
    try:
        loader.delete_for_client("ga4_routes", client_id)
        loader.upsert("ga4_routes", list(ga4_routes_merge.values()), client_id)
    except Exception as e:
        log.warning(f"   GA4 rutas: no se pudo escribir (¿migración 0014 sin aplicar?): {e}")

    # Detalle POR PRODUCTO (item-scoped): vistas, add-to-cart, checkout, compras
    # y revenue por par de tenis. Alimenta el análisis "qué pares se ven y cuáles
    # convierten" de la hoja de Compras. Se mantiene SEPARADO por property_id
    # (cada propiedad GA4 = una web distinta); la vista aísla la que quiere ver.
    ga4_items_merge: dict[tuple, dict] = {}
    for property_id in GA4_PROPERTIES:
        try:
            item_rows = extract_ga4_items(
                property_id=property_id,
                credentials_path=os.environ["GOOGLE_CREDENTIALS_PATH"],
                date_from=date_from,
                date_to=date_to
            )
            for r in item_rows:
                key = (r["date"], r["property_id"], r["item_name"])
                acc = ga4_items_merge.get(key)
                if acc is None:
                    ga4_items_merge[key] = dict(r)
                else:
                    acc["items_viewed"]        += r["items_viewed"]
                    acc["items_added_to_cart"] += r["items_added_to_cart"]
                    acc["items_checked_out"]   += r["items_checked_out"]
                    acc["items_purchased"]     += r["items_purchased"]
                    acc["item_revenue"]        = round(acc["item_revenue"] + r["item_revenue"], 2)
            log.info(f"   ✓ GA4 productos {property_id}: {len(item_rows)} filas")
        except Exception as e:
            log.error(f"   ✗ GA4 productos {property_id}: {e}")
    loader.upsert("ga4_items", list(ga4_items_merge.values()), client_id)

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
            shop_orders, shop_products, shop_funnel, shop_prod_daily = extract_shopify(
                shop_url=shopify_shop_url,
                access_token=shopify_token,
                date_from=date_from,
                date_to=date_to
            )
            loader.upsert("shopify_orders",   shop_orders,   client_id)
            loader.upsert("shopify_products", shop_products, client_id)
            loader.upsert("shopify_funnel",   shop_funnel,   client_id)
            loader.upsert("shopify_product_daily", shop_prod_daily, client_id)
            log.info(f"   ✓ Shopify: {len(shop_orders)} días")

            # Checkouts abandonados (requiere scope read_checkouts). Best-effort:
            # si la app no tiene el permiso, la API responde 403 y se registra
            # como error SIN tumbar el resto de Shopify ni inventar filas.
            try:
                shop_abandoned = extract_shopify_abandoned(
                    shop_url=shopify_shop_url,
                    access_token=shopify_token,
                    date_from=date_from,
                    date_to=date_to
                )
                loader.upsert("shopify_abandoned_checkouts", shop_abandoned, client_id)
                log.info(f"   ✓ Shopify abandonados: {len(shop_abandoned)} días")
            except Exception as e:
                log.error(f"   ✗ Shopify abandonados error: {e}")
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

    # ── 11. UCHAT · DIAGNÓSTICO DEL BOT ─────────────────────────
    # Solo corre si el cliente tiene token de UChat en el entorno (p.ej. Ofero).
    if os.environ.get("UCHAT_API_TOKEN"):
        log.info("── UChat · diagnóstico del bot")
        try:
            from extractors.uchat_bot import extract_uchat_bot
            uchat_rows = extract_uchat_bot(client_id)
            if uchat_rows:
                loader.upsert("uchat_bot_diagnostics", uchat_rows, client_id)
        except Exception as e:
            log.error(f"   ✗ UChat bot error: {e}")

    log.info(f"✅ ETL completado para client_id={client_id}")


if __name__ == "__main__":
    import sys
    client_id = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("DEFAULT_CLIENT_ID")
    if not client_id:
        log.error("Debes pasar client_id como argumento o DEFAULT_CLIENT_ID en .env")
        sys.exit(1)
    run_etl(client_id)