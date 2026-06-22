"""
DeepScan — Extractor Google Ads API
Extrae datos completos via GAQL para todos los clientes en Supabase.
Usa OAuth2 con refresh_token para autenticación.
"""

import os
import logging
from datetime import datetime, timedelta
from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ── Configuración ────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
DEVELOPER_TOKEN = os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"]
DAYS = int(os.environ.get("GADS_DAYS", "30"))

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_date_range(days: int):
    end = datetime.today() - timedelta(days=1)
    start = end - timedelta(days=days - 1)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


def get_clients():
    res = supabase.table("clients").select("id,name,google_ads_customer_id").execute()
    return [c for c in res.data if c.get("google_ads_customer_id")]


def build_client(customer_id: str) -> GoogleAdsClient:
    config = {
        "developer_token": DEVELOPER_TOKEN,
        "use_proto_plus": True,
        "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"],
        "refresh_token": os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
    }
    login_cid = os.environ.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID")
    if login_cid:
        config["login_customer_id"] = login_cid.replace("-", "")

    return GoogleAdsClient.load_from_dict(config)


def upsert(table: str, rows: list, conflict: str):
    if not rows:
        return 0
    BATCH = 500
    total = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i+BATCH]
        supabase.table(table).upsert(batch, on_conflict=conflict).execute()
        total += len(batch)
    return total


# ── QUERIES GAQL ─────────────────────────────────────────────────────────────

def extract_campaigns(client, customer_id, client_id, date_start, date_end):
    # Campos base (los que alimentan el Overview — NUNCA deben romperse).
    base_metrics = """
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks,
            metrics.conversions,
            metrics.conversions_value,
            metrics.ctr,
            metrics.average_cpc"""
    # Campos extra para la pestaña Search (cuota de impresiones de búsqueda).
    # Si la API los rechaza, reintentamos sin ellos para no perder el Overview.
    extra_metrics = """,
            metrics.search_impression_share,
            metrics.search_absolute_top_impression_share"""

    def build_query(with_extra: bool) -> str:
        return f"""
        SELECT
            campaign.id,
            campaign.name,
            campaign.advertising_channel_type,
            campaign.status,
            segments.date,
            {base_metrics}{extra_metrics if with_extra else ""}
        FROM campaign
        WHERE segments.date BETWEEN '{date_start}' AND '{date_end}'
            AND campaign.status != 'REMOVED'
        ORDER BY segments.date DESC, metrics.cost_micros DESC
    """

    rows = []
    # Intento 1: con los campos de cuota de impresiones. Si falla, intento 2 sin ellos.
    for with_extra in (True, False):
        rows = []
        try:
            response = client.get_service("GoogleAdsService").search(
                customer_id=customer_id, query=build_query(with_extra)
            )
            for row in response:
                cost = row.metrics.cost_micros / 1_000_000
                conv_value = row.metrics.conversions_value
                rows.append({
                    "client_id": client_id,
                    "date": row.segments.date,
                    "campaign_id": str(row.campaign.id),
                    "campaign_name": row.campaign.name,
                    "campaign_type": row.campaign.advertising_channel_type.name,
                    "status": row.campaign.status.name,
                    "cost": round(cost, 2),
                    "impressions": row.metrics.impressions,
                    "clicks": row.metrics.clicks,
                    "conversions": round(row.metrics.conversions, 2),
                    "conv_value": round(conv_value, 2),
                    "ctr": round(row.metrics.ctr, 4),
                    "cpc": round(row.metrics.average_cpc / 1_000_000, 2) if row.metrics.average_cpc else 0,
                    "roas": round(conv_value / cost, 4) if cost > 0 else 0,
                    # Campos no seleccionados quedan en su default protobuf (0.0) sin error.
                    "search_impression_share": round(row.metrics.search_impression_share, 4),
                    "search_abs_top_impression_share": round(row.metrics.search_absolute_top_impression_share, 4),
                })
            # Éxito: salimos del bucle de reintento.
            break
        except GoogleAdsException as e:
            if with_extra:
                log.warning(
                    f"Campaigns: campos de cuota de impresión rechazados para {customer_id}, "
                    f"reintentando sin ellos. {e}"
                )
                continue
            log.error(f"Campaigns error {customer_id}: {e}")
    return rows


def extract_ad_groups(client, customer_id, client_id, date_start, date_end):
    query = f"""
        SELECT
            campaign.id,
            campaign.name,
            campaign.advertising_channel_type,
            ad_group.id,
            ad_group.name,
            ad_group.status,
            segments.date,
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks,
            metrics.conversions,
            metrics.conversions_value,
            metrics.ctr,
            metrics.average_cpc
        FROM ad_group
        WHERE segments.date BETWEEN '{date_start}' AND '{date_end}'
            AND ad_group.status != 'REMOVED'
        ORDER BY segments.date DESC, metrics.cost_micros DESC
    """
    rows = []
    try:
        response = client.get_service("GoogleAdsService").search(
            customer_id=customer_id, query=query
        )
        for row in response:
            cost = row.metrics.cost_micros / 1_000_000
            conv_value = row.metrics.conversions_value
            rows.append({
                "client_id": client_id,
                "date_start": row.segments.date,
                "campaign_id": str(row.campaign.id),
                "campaign_name": row.campaign.name,
                "campaign_type": row.campaign.advertising_channel_type.name,
                "ad_group_id": str(row.ad_group.id),
                "ad_group_name": row.ad_group.name,
                "status": row.ad_group.status.name,
                "cost": round(cost, 2),
                "impressions": row.metrics.impressions,
                "clicks": row.metrics.clicks,
                "conversions": round(row.metrics.conversions, 2),
                "conv_value": round(conv_value, 2),
                "ctr": round(row.metrics.ctr, 4),
                "cpc": round(row.metrics.average_cpc / 1_000_000, 2) if row.metrics.average_cpc else 0,
                "roas": round(conv_value / cost, 4) if cost > 0 else 0,
            })
    except GoogleAdsException as e:
        log.error(f"Ad groups error {customer_id}: {e}")
    return rows


def extract_keywords(client, customer_id, client_id, date_start, date_end):
    query = f"""
        SELECT
            campaign.id,
            campaign.name,
            ad_group.id,
            ad_group.name,
            ad_group_criterion.criterion_id,
            ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type,
            ad_group_criterion.status,
            segments.date,
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks,
            metrics.conversions,
            metrics.conversions_value,
            metrics.ctr,
            metrics.average_cpc,
            metrics.search_impression_share,
            metrics.search_top_impression_share,
            metrics.search_absolute_top_impression_share
        FROM keyword_view
        WHERE segments.date BETWEEN '{date_start}' AND '{date_end}'
            AND ad_group_criterion.status != 'REMOVED'
        ORDER BY segments.date DESC, metrics.cost_micros DESC
    """
    rows = []
    try:
        response = client.get_service("GoogleAdsService").search(
            customer_id=customer_id, query=query
        )
        for row in response:
            cost = row.metrics.cost_micros / 1_000_000
            conv_value = row.metrics.conversions_value
            rows.append({
                "client_id": client_id,
                "date_start": row.segments.date,
                "campaign_id": str(row.campaign.id),
                "campaign_name": row.campaign.name,
                "ad_group_id": str(row.ad_group.id),
                "ad_group_name": row.ad_group.name,
                "keyword_id": str(row.ad_group_criterion.criterion_id),
                "keyword_text": row.ad_group_criterion.keyword.text,
                "match_type": row.ad_group_criterion.keyword.match_type.name,
                "status": row.ad_group_criterion.status.name,
                "cost": round(cost, 2),
                "impressions": row.metrics.impressions,
                "clicks": row.metrics.clicks,
                "conversions": round(row.metrics.conversions, 2),
                "conv_value": round(conv_value, 2),
                "ctr": round(row.metrics.ctr, 4),
                "cpc": round(row.metrics.average_cpc / 1_000_000, 2) if row.metrics.average_cpc else 0,
                "search_impression_share": round(row.metrics.search_impression_share or 0, 4),
                "search_top_impression_share": round(row.metrics.search_top_impression_share or 0, 4),
                "search_abs_top_impression_share": round(row.metrics.search_absolute_top_impression_share or 0, 4),
            })
    except GoogleAdsException as e:
        log.error(f"Keywords error {customer_id}: {e}")
    return rows


def extract_search_terms(client, customer_id, client_id, date_start, date_end):
    query = f"""
        SELECT
            campaign.id,
            campaign.name,
            ad_group.id,
            ad_group.name,
            search_term_view.search_term,
            segments.keyword.info.text,
            segments.date,
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks,
            metrics.conversions,
            metrics.conversions_value,
            metrics.ctr,
            metrics.average_cpc
        FROM search_term_view
        WHERE segments.date BETWEEN '{date_start}' AND '{date_end}'
        ORDER BY segments.date DESC, metrics.cost_micros DESC
    """
    # Sin LIMIT: con 30 días y varias campañas hay más de 5000 términos. Un
    # tope dejaba fuera los días viejos (nunca se refrescaban → sin keyword).
    # La API pagina sola, así que recorremos todo el período honestamente.
    rows = []
    try:
        response = client.get_service("GoogleAdsService").search(
            customer_id=customer_id, query=query
        )
        for row in response:
            cost = row.metrics.cost_micros / 1_000_000
            rows.append({
                "client_id": client_id,
                "date_start": row.segments.date,
                "campaign_id": str(row.campaign.id),
                "campaign_name": row.campaign.name,
                "ad_group_id": str(row.ad_group.id),
                "ad_group_name": row.ad_group.name,
                "search_term": row.search_term_view.search_term,
                "keyword_text": row.segments.keyword.info.text or "",
                "cost": round(cost, 2),
                "impressions": row.metrics.impressions,
                "clicks": row.metrics.clicks,
                "conversions": round(row.metrics.conversions, 2),
                "conv_value": round(row.metrics.conversions_value, 2),
                "ctr": round(row.metrics.ctr, 4),
                "cpc": round(row.metrics.average_cpc / 1_000_000, 2) if row.metrics.average_cpc else 0,
            })
    except GoogleAdsException as e:
        log.error(f"Search terms error {customer_id}: {e}")
    # Deduplicar por clave única
    seen = {}
    for r in rows:
        key = (r["client_id"], r["date_start"], r["campaign_id"], r["search_term"])
        if key not in seen:
            seen[key] = r
        else:
            seen[key]["cost"] = round(seen[key]["cost"] + r["cost"], 2)
            seen[key]["impressions"] += r["impressions"]
            seen[key]["clicks"] += r["clicks"]
            seen[key]["conversions"] = round(seen[key]["conversions"] + r["conversions"], 2)
            seen[key]["conv_value"] = round(seen[key]["conv_value"] + r["conv_value"], 2)
            # Si la fila acumulada no tiene palabra clave pero esta sí, la tomamos.
            # Así mostramos la palabra clave siempre que algún grupo la reporte.
            if not seen[key].get("keyword_text") and r.get("keyword_text"):
                seen[key]["keyword_text"] = r["keyword_text"]
    return list(seen.values())


def _resolve_geo_names(client, customer_id, resource_names):
    """Mapea recursos 'geoTargetConstants/{id}' → nombre legible de ciudad.

    geographic_view solo devuelve el CÓDIGO de la ciudad (geo target constant),
    no su nombre. Aquí resolvemos esos códigos a nombres reales (Bogota, Cali,
    Medellín…) con una consulta extra a geo_target_constant."""
    ids = sorted({rn.split("/")[-1] for rn in resource_names if rn})
    names: dict[str, str] = {}
    if not ids:
        return names
    service = client.get_service("GoogleAdsService")
    BATCH = 500
    for i in range(0, len(ids), BATCH):
        chunk = ids[i:i + BATCH]
        id_list = ",".join(chunk)
        query = f"""
            SELECT geo_target_constant.id, geo_target_constant.name
            FROM geo_target_constant
            WHERE geo_target_constant.id IN ({id_list})
        """
        try:
            response = service.search(customer_id=customer_id, query=query)
            for row in response:
                names[str(row.geo_target_constant.id)] = row.geo_target_constant.name
        except GoogleAdsException as e:
            log.error(f"Geo names error {customer_id}: {e}")
    return names


def extract_geo(client, customer_id, client_id, date_start, date_end):
    query = f"""
        SELECT
            campaign.id,
            campaign.name,
            segments.geo_target_city,
            segments.date,
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks,
            metrics.conversions,
            metrics.conversions_value
        FROM geographic_view
        WHERE segments.date BETWEEN '{date_start}' AND '{date_end}'
        ORDER BY segments.date DESC, metrics.cost_micros DESC
        LIMIT 3000
    """
    raw = []
    geo_resources: set[str] = set()
    try:
        response = client.get_service("GoogleAdsService").search(
            customer_id=customer_id, query=query
        )
        for row in response:
            cost = row.metrics.cost_micros / 1_000_000
            city_res = row.segments.geo_target_city or ""
            geo_resources.add(city_res)
            raw.append({
                "client_id": client_id,
                "date_start": row.segments.date,
                "campaign_id": str(row.campaign.id),
                "campaign_name": row.campaign.name,
                "city_res": city_res,
                "cost": round(cost, 2),
                "impressions": row.metrics.impressions,
                "clicks": row.metrics.clicks,
                "conversions": round(row.metrics.conversions, 2),
                "conv_value": round(row.metrics.conversions_value, 2),
            })
    except GoogleAdsException as e:
        log.error(f"Geo error {customer_id}: {e}")
        return []

    # Resolver los códigos a nombres legibles de ciudad.
    name_map = _resolve_geo_names(client, customer_id, geo_resources)

    # Reemplazar el código por el nombre y deduplicar por (cliente, fecha,
    # campaña, ciudad). Varios códigos que mapeen al mismo nombre se suman.
    seen: dict[tuple, dict] = {}
    for r in raw:
        rid = r["city_res"].split("/")[-1] if r["city_res"] else ""
        city = name_map.get(rid) or "(sin ciudad)"
        key = (r["client_id"], r["date_start"], r["campaign_id"], city)
        if key not in seen:
            seen[key] = {
                "client_id": r["client_id"],
                "date_start": r["date_start"],
                "campaign_id": r["campaign_id"],
                "campaign_name": r["campaign_name"],
                "city": city,
                "cost": r["cost"],
                "impressions": r["impressions"],
                "clicks": r["clicks"],
                "conversions": r["conversions"],
                "conv_value": r["conv_value"],
            }
        else:
            seen[key]["cost"] = round(seen[key]["cost"] + r["cost"], 2)
            seen[key]["impressions"] += r["impressions"]
            seen[key]["clicks"] += r["clicks"]
            seen[key]["conversions"] = round(seen[key]["conversions"] + r["conversions"], 2)
            seen[key]["conv_value"] = round(seen[key]["conv_value"] + r["conv_value"], 2)
    return list(seen.values())


def extract_ads(client, customer_id, client_id, date_start, date_end):
    query = f"""
        SELECT
            campaign.id,
            campaign.name,
            campaign.advertising_channel_type,
            ad_group.id,
            ad_group.name,
            ad_group_ad.ad.id,
            ad_group_ad.ad.name,
            ad_group_ad.ad.type,
            ad_group_ad.status,
            segments.date,
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks,
            metrics.conversions,
            metrics.conversions_value,
            metrics.ctr,
            metrics.average_cpc
        FROM ad_group_ad
        WHERE segments.date BETWEEN '{date_start}' AND '{date_end}'
            AND ad_group_ad.status != 'REMOVED'
        ORDER BY segments.date DESC, metrics.cost_micros DESC
    """
    rows = []
    try:
        response = client.get_service("GoogleAdsService").search(
            customer_id=customer_id, query=query
        )
        for row in response:
            cost = row.metrics.cost_micros / 1_000_000
            conv_value = row.metrics.conversions_value
            rows.append({
                "client_id": client_id,
                "date_start": row.segments.date,
                "campaign_id": str(row.campaign.id),
                "campaign_name": row.campaign.name,
                "campaign_type": row.campaign.advertising_channel_type.name,
                "ad_group_id": str(row.ad_group.id),
                "ad_group_name": row.ad_group.name,
                "ad_id": str(row.ad_group_ad.ad.id),
                "ad_name": row.ad_group_ad.ad.name or "",
                "ad_type": row.ad_group_ad.ad.type_.name,
                "status": row.ad_group_ad.status.name,
                "cost": round(cost, 2),
                "impressions": row.metrics.impressions,
                "clicks": row.metrics.clicks,
                "conversions": round(row.metrics.conversions, 2),
                "conv_value": round(conv_value, 2),
                "ctr": round(row.metrics.ctr, 4),
                "cpc": round(row.metrics.average_cpc / 1_000_000, 2) if row.metrics.average_cpc else 0,
                "roas": round(conv_value / cost, 4) if cost > 0 else 0,
            })
    except GoogleAdsException as e:
        log.error(f"Ads error {customer_id}: {e}")
    return rows


def extract_ad_assets(client, customer_id, client_id, date_start, date_end):
    """Resultados POR ASSET (cada imagen, video o texto) y por día.

    Abre el rendimiento del anuncio adaptable pieza por pieza usando
    `ad_group_ad_asset_view`, unido al recurso `asset` para traer la URL de
    imagen, el video de YouTube y el texto. Responde, con dato real, "¿qué
    imagen / video / titular trae más impresiones, clics y leads?".

    OJO: Google NO atribuye costo por asset en anuncios adaptables (el costo
    vive a nivel anuncio). Por eso aquí solo se guardan métricas que Google sí
    reporta por asset: impresiones, clics y conversiones. Nada de costo/CPL por
    asset — sería inventado. `performance_label` es la calificación de Google.
    """
    # Campos de identidad/contenido del asset. Estos SÍ los soporta cualquier
    # tipo de campaña (Search, Display, PMax, App) en ad_group_ad_asset_view.
    asset_fields = """
            campaign.id,
            campaign.name,
            campaign.advertising_channel_type,
            ad_group.id,
            ad_group.name,
            ad_group_ad.ad.id,
            ad_group_ad_asset_view.field_type,
            ad_group_ad_asset_view.performance_label,
            asset.id,
            asset.type,
            asset.name,
            asset.text_asset.text,
            asset.image_asset.full_size.url,
            asset.youtube_video_asset.youtube_video_id,
            asset.youtube_video_asset.youtube_video_title"""

    # Tier 1 — con métricas por día. Google reporta métricas por asset en
    # Search (RSA), Performance Max y App. En DISPLAY (nuestro caso Propietarios)
    # la API normalmente NO segmenta métricas por asset y esta consulta puede
    # fallar o volver vacía → caemos al Tier 2.
    q_full = f"""
        SELECT {asset_fields},
            segments.date,
            metrics.impressions,
            metrics.clicks,
            metrics.conversions,
            metrics.conversions_value,
            metrics.ctr
        FROM ad_group_ad_asset_view
        WHERE segments.date BETWEEN '{date_start}' AND '{date_end}'
        ORDER BY segments.date DESC, metrics.impressions DESC
    """

    # Tier 2 — inventario de assets que están sirviendo, SIN métricas ni
    # segmento de fecha (lo que Display sí permite). No inventamos métricas:
    # quedan en 0, pero conservamos lo más valioso y 100% real por pieza: la
    # calificación de Google (performance_label: BEST/GOOD/LOW) y el contenido
    # (imagen / video / texto). El date_start se fija al fin del rango (snapshot).
    q_inv = f"""
        SELECT {asset_fields}
        FROM ad_group_ad_asset_view
        WHERE ad_group_ad_asset_view.enabled = TRUE
    """

    def parse(row, with_metrics):
        d = {
            "client_id": client_id,
            "date_start": row.segments.date if with_metrics else date_end,
            "campaign_id": str(row.campaign.id),
            "campaign_name": row.campaign.name,
            "campaign_type": row.campaign.advertising_channel_type.name,
            "ad_group_id": str(row.ad_group.id),
            "ad_group_name": row.ad_group.name,
            "ad_id": str(row.ad_group_ad.ad.id),
            "asset_id": str(row.asset.id),
            "field_type": row.ad_group_ad_asset_view.field_type.name,
            "asset_type": row.asset.type_.name,
            "performance_label": row.ad_group_ad_asset_view.performance_label.name,
            "asset_name": row.asset.name or "",
            "asset_text": row.asset.text_asset.text or "",
            "image_url": row.asset.image_asset.full_size.url or "",
            "youtube_video_id": row.asset.youtube_video_asset.youtube_video_id or "",
            "youtube_title": row.asset.youtube_video_asset.youtube_video_title or "",
            "impressions": row.metrics.impressions if with_metrics else 0,
            "clicks": row.metrics.clicks if with_metrics else 0,
            "conversions": round(row.metrics.conversions, 2) if with_metrics else 0,
            "conv_value": round(row.metrics.conversions_value, 2) if with_metrics else 0,
            "ctr": round(row.metrics.ctr, 4) if with_metrics else 0,
        }
        return d

    svc = client.get_service("GoogleAdsService")
    rows = []
    seen = set()  # identidad de pieza ya cubierta por Tier 1: (ad_id, asset_id, field_type)

    # Tier 1: métricas por día (Search/PMax/App). Cubre las piezas que Google sí
    # mide por asset.
    try:
        for row in svc.search(customer_id=customer_id, query=q_full):
            d = parse(row, True)
            rows.append(d)
            seen.add((d["ad_id"], d["asset_id"], d["field_type"]))
    except GoogleAdsException as e:
        log.warning(f"Ad assets con métricas no disponible {customer_id} (se completa con inventario): {e}")

    # Tier 2: inventario de las piezas que sirven pero que Tier 1 NO cubrió
    # (típicamente Display, donde Google no reparte métricas por asset). NO
    # inventamos métricas: quedan en 0, pero conservamos su contenido y la
    # calificación de Google (performance_label). Se corre SIEMPRE porque un
    # mismo cliente puede tener Search (con métricas) y Display (sin ellas).
    try:
        added = 0
        for row in svc.search(customer_id=customer_id, query=q_inv):
            d = parse(row, False)
            if (d["ad_id"], d["asset_id"], d["field_type"]) in seen:
                continue  # ya vino con métricas reales en Tier 1
            rows.append(d)
            added += 1
        if added:
            log.info(f"   ↪ ad_assets sin métricas por pieza (Display u otras): {added} piezas con calificación de Google")
    except GoogleAdsException as e:
        log.error(f"Ad assets inventario error {customer_id}: {e}")
    return rows


# ── Main ─────────────────────────────────────────────────────────────────────

def run():
    date_start, date_end = get_date_range(DAYS)
    log.info(f"Google Ads API extractor — {date_start} → {date_end}")

    clients = get_clients()
    log.info(f"Clientes con Google Ads: {len(clients)}")

    for c in clients:
        cid = c["id"]
        customer_id = c["google_ads_customer_id"]
        name = c["name"]
        log.info(f"\n── {name} ({customer_id})")

        try:
            gads = build_client(customer_id)

            rows = extract_campaigns(gads, customer_id, cid, date_start, date_end)
            n = upsert("gads_campaigns", rows, "client_id,date,campaign_id")
            log.info(f"   ✓ gads_campaigns: {n} filas")

            rows = extract_ad_groups(gads, customer_id, cid, date_start, date_end)
            n = upsert("gads_ad_groups", rows, "client_id,date_start,ad_group_id")
            log.info(f"   ✓ gads_ad_groups: {n} filas")

            rows = extract_keywords(gads, customer_id, cid, date_start, date_end)
            n = upsert("gads_keywords", rows, "client_id,date_start,keyword_id")
            log.info(f"   ✓ gads_keywords: {n} filas")

            rows = extract_search_terms(gads, customer_id, cid, date_start, date_end)
            n = upsert("gads_search_term_details", rows, "client_id,date_start,campaign_id,search_term")
            log.info(f"   ✓ gads_search_term_details: {n} filas")

            rows = extract_geo(gads, customer_id, cid, date_start, date_end)
            n = upsert("gads_geo", rows, "client_id,date_start,campaign_id,city")
            log.info(f"   ✓ gads_geo: {n} filas")

            rows = extract_ads(gads, customer_id, cid, date_start, date_end)
            n = upsert("gads_ads", rows, "client_id,date_start,ad_id")
            log.info(f"   ✓ gads_ads: {n} filas")

            rows = extract_ad_assets(gads, customer_id, cid, date_start, date_end)
            n = upsert("gads_ad_assets", rows, "client_id,date_start,ad_id,asset_id,field_type")
            log.info(f"   ✓ gads_ad_assets: {n} filas")

        except Exception as e:
            log.error(f"   ✗ Error {name}: {e}")

    log.info("\n✅ Google Ads API extractor completado")


if __name__ == "__main__":
    run()