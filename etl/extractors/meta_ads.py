"""
Extractor: Meta Ads API (Facebook Marketing API)
Nivel: anuncio (ad) por día — el más granular disponible
Métricas clave para ecommerce: spend, purchases, purchase_value, ROAS, add_to_cart, etc.
"""

import logging
import time
from datetime import date
import requests

log = logging.getLogger(__name__)

BASE_URL  = "https://graph.facebook.com/v19.0"
AD_FIELDS = ",".join([
    "campaign_id", "campaign_name",
    "adset_id", "adset_name",
    "ad_id", "ad_name",
    "status",
    "spend",
    "impressions", "clicks", "reach",
    "ctr", "cpm", "frequency",
    "actions",
    "action_values",
])


def _get_action(actions: list, action_type: str) -> float:
    if not actions:
        return 0.0
    for a in actions:
        if a.get("action_type") == action_type:
            return float(a.get("value", 0))
    return 0.0


def extract_meta_ads(
    access_token: str,
    ad_account_id: str,
    date_from: date,
    date_to: date
) -> list[dict]:
    params = {
        "level":          "ad",
        "fields":         AD_FIELDS,
        "time_increment": "1",
        "time_range":     f'{{"since":"{date_from}","until":"{date_to}"}}',
        "limit":          500,
        "access_token":   access_token,
    }

    url = f"{BASE_URL}/act_{ad_account_id}/insights"
    rows = []
    page = 0

    while url:
        page += 1
        resp = requests.get(url, params=params if page == 1 else {})
        resp.raise_for_status()
        data = resp.json()

        for r in data.get("data", []):
            actions       = r.get("actions", [])
            action_values = r.get("action_values", [])

            purchases      = _get_action(actions,       "purchase")
            purchase_value = _get_action(action_values, "purchase")
            add_to_cart    = _get_action(actions,       "add_to_cart")
            initiate_chk   = _get_action(actions,       "initiate_checkout")
            view_content   = _get_action(actions,       "view_content")

            spend = float(r.get("spend", 0) or 0)
            roas  = round(purchase_value / spend, 4) if spend > 0 else 0
            cpa   = round(spend / purchases, 2)      if purchases > 0 else 0

            rows.append({
                "date":              r.get("date_start", ""),
                "campaign_id":       r.get("campaign_id", ""),
                "campaign_name":     r.get("campaign_name", ""),
                "adset_id":          r.get("adset_id", ""),
                "adset_name":        r.get("adset_name", ""),
                "ad_id":             r.get("ad_id", ""),
                "ad_name":           r.get("ad_name", ""),
                "status":            r.get("status", ""),
                "spend":             spend,
                "impressions":       int(r.get("impressions", 0) or 0),
                "clicks":            int(r.get("clicks", 0) or 0),
                "reach":             int(r.get("reach", 0) or 0),
                "ctr":               float(r.get("ctr", 0) or 0),
                "cpm":               float(r.get("cpm", 0) or 0),
                "cpp":               0.0,
                "frequency":         float(r.get("frequency", 0) or 0),
                "purchases":         purchases,
                "purchase_value":    purchase_value,
                "roas":              roas,
                "add_to_cart":       add_to_cart,
                "initiate_checkout": initiate_chk,
                "view_content":      view_content,
                "cpa":               cpa,
                "thumb_url":         "",
            })

        paging = data.get("paging", {})
        next_url = paging.get("next")
        url = next_url if next_url else None
        params = {}

        if next_url:
            time.sleep(0.3)

    log.info(f"   Meta Ads: {len(rows)} filas ({page} páginas)")
    return rows