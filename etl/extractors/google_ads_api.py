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
    query = f"""
        SELECT
            campaign.id,
            campaign.name,
            campaign.advertising_channel_type,
            campaign.status,
            segments.date,
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks,
            metrics.conversions,
            metrics.conversions_value,
            metrics.ctr,
            metrics.average_cpc
        FROM campaign
        WHERE segments.date BETWEEN '{date_start}' AND '{date_end}'
            AND campaign.status != 'REMOVED'
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
            })
    except GoogleAdsException as e:
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
        LIMIT 5000
    """
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
                "cost": round(cost, 2),                "impressions": row.metrics.impressions,
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
    return list(seen.values())


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
    rows = []
    try:
        response = client.get_service("GoogleAdsService").search(
            customer_id=customer_id, query=query
        )
        for row in response:
            cost = row.metrics.cost_micros / 1_000_000
            city = row.segments.geo_target_city or ""
            rows.append({
                "client_id": client_id,
                "date_start": row.segments.date,
                "campaign_id": str(row.campaign.id),
                "campaign_name": row.campaign.name,
                "city": city,
                "cost": round(cost, 2),
                "impressions": row.metrics.impressions,
                "clicks": row.metrics.clicks,
                "conversions": round(row.metrics.conversions, 2),
                "conv_value": round(row.metrics.conversions_value, 2),
            })
    except GoogleAdsException as e:
        log.error(f"Geo error {customer_id}: {e}")
    seen = {}
    for r in rows:
        key = (r["client_id"], r["date_start"], r["campaign_id"], r["city"])
        if key not in seen:
            seen[key] = r
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

        except Exception as e:
            log.error(f"   ✗ Error {name}: {e}")

    log.info("\n✅ Google Ads API extractor completado")


if __name__ == "__main__":
    run()