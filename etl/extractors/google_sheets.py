"""
Extractor: Google Sheets
Lee sheets públicos via HTTP directo (CSV export) sin necesidad de autenticación.
Funciona porque los sheets de Mike Rhodes y smec son públicos (cualquiera con el link puede ver).
"""

import logging
import requests
from typing import Any
import csv
import io

log = logging.getLogger(__name__)


def _read_sheet_csv(sheet_id: str, tab_name: str) -> list[dict]:
    """
    Lee una pestaña de un Google Sheet público via exportación CSV.
    No requiere autenticación — funciona con sheets públicos.
    """
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&sheet={tab_name}"
    
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        
        if not resp.text or len(resp.text) < 10:
            log.warning(f"   Tab {tab_name}: respuesta vacía")
            return []
        
        reader = csv.DictReader(io.StringIO(resp.text))
        rows = []
        for row in reader:
            # Normalizar headers
            normalized = {}
            for k, v in row.items():
                key = k.strip().lower()\
                    .replace(" ", "_")\
                    .replace(".", "_")\
                    .replace("(", "")\
                    .replace(")", "")\
                    .replace("/", "_")
                normalized[key] = v.strip()
            rows.append(normalized)
        
        return rows
    except requests.exceptions.HTTPError as e:
        log.error(f"   Tab {tab_name} HTTP error: {e.response.status_code}")
        return []
    except Exception as e:
        log.error(f"   Tab {tab_name} error: {type(e).__name__}: {e}")
        return []


def _safe_float(val: Any, default=0.0) -> float:
    try:
        return float(str(val).replace(",", "").replace("$", "").strip() or 0)
    except (ValueError, TypeError):
        return default


def _safe_int(val: Any, default=0) -> int:
    try:
        return int(float(str(val).replace(",", "").strip() or 0))
    except (ValueError, TypeError):
        return default


def extract_mike_rhodes(sheet_id: str) -> dict:
    """Lee el Google Sheet de Mike Rhodes via CSV público."""
    log.info(f"   Leyendo Sheet ID: {sheet_id} via CSV público")

    result = {
        "campaigns":    [],
        "asset_groups": [],
        "products_30d": [],
        "products_180d":[],
        "assets":       [],
        "zombies":      []
    }

    # r_camp
    rows = _read_sheet_csv(sheet_id, "r_camp")
    for r in rows:
        cost = _safe_float(r.get("metrics_cost_micros", 0)) / 1_000_000
        conv_value = _safe_float(r.get("metrics_conversions_value", 0))
        if not r.get("segments_date"):
            continue
        result["campaigns"].append({
            "date":          r.get("segments_date", ""),
            "campaign_name": r.get("campaign_name", ""),
            "cost":          round(cost, 2),
            "conversions":   _safe_float(r.get("metrics_conversions", 0)),
            "conv_value":    round(conv_value, 2),
            "impressions":   _safe_int(r.get("metrics_impressions", 0)),
            "clicks":        _safe_int(r.get("metrics_clicks", 0)),
            "video_views":   _safe_int(r.get("metrics_video_views", 0)),
            "avg_cpv":       _safe_float(r.get("metrics_average_cpv", 0)),
            "roas":          round(conv_value / cost, 4) if cost > 0 else 0,
        })
    log.info(f"   r_camp: {len(result['campaigns'])} filas")

    # r_ag
    rows = _read_sheet_csv(sheet_id, "r_ag")
    for r in rows:
        cost = _safe_float(r.get("metrics_cost_micros", 0)) / 1_000_000
        conv_value = _safe_float(r.get("metrics_conversions_value", 0))
        if not r.get("segments_date"):
            continue
        result["asset_groups"].append({
            "date":              r.get("segments_date", ""),
            "campaign_name":     r.get("campaign_name", ""),
            "asset_group_name":  r.get("asset_group_name", ""),
            "ad_strength":       r.get("asset_group_ad_strength", ""),
            "status":            r.get("asset_group_status", ""),
            "impressions":       _safe_int(r.get("metrics_impressions", 0)),
            "clicks":            _safe_int(r.get("metrics_clicks", 0)),
            "cost":              round(cost, 2),
            "conversions":       _safe_float(r.get("metrics_conversions", 0)),
            "conv_value":        round(conv_value, 2),
            "roas":              round(conv_value / cost, 4) if cost > 0 else 0,
        })
    log.info(f"   r_ag: {len(result['asset_groups'])} filas")

    # r_prod_t
    rows = _read_sheet_csv(sheet_id, "r_prod_t")
    for r in rows:
        cost = _safe_float(r.get("metrics_cost_micros", 0)) / 1_000_000
        conv_value = _safe_float(r.get("metrics_conversions_value", 0))
        result["products_30d"].append({
            "period":          "30d",
            "campaign_name":   r.get("campaign_name", ""),
            "product_title":   r.get("segments_product_title", ""),
            "product_item_id": r.get("segments_product_item_id", ""),
            "custom_label_0":  r.get("segments_product_custom_attribute0", ""),
            "custom_label_1":  r.get("segments_product_custom_attribute1", ""),
            "custom_label_2":  r.get("segments_product_custom_attribute2", ""),
            "custom_label_3":  r.get("segments_product_custom_attribute3", ""),
            "custom_label_4":  r.get("segments_product_custom_attribute4", ""),
            "cost":            round(cost, 2),
            "conversions":     _safe_float(r.get("metrics_conversions", 0)),
            "conv_value":      round(conv_value, 2),
            "impressions":     _safe_int(r.get("metrics_impressions", 0)),
            "roas":            round(conv_value / cost, 4) if cost > 0 else 0,
        })
    log.info(f"   r_prod_t: {len(result['products_30d'])} filas")

    # r_prod_t_180
    rows = _read_sheet_csv(sheet_id, "r_prod_t_180")
    for r in rows:
        cost = _safe_float(r.get("metrics_cost_micros", 0)) / 1_000_000
        conv_value = _safe_float(r.get("metrics_conversions_value", 0))
        result["products_180d"].append({
            "period":          "180d",
            "campaign_name":   r.get("campaign_name", ""),
            "product_title":   r.get("segments_product_title", ""),
            "product_item_id": r.get("segments_product_item_id", ""),
            "custom_label_0":  r.get("segments_product_custom_attribute0", ""),
            "custom_label_1":  r.get("segments_product_custom_attribute1", ""),
            "custom_label_2":  r.get("segments_product_custom_attribute2", ""),
            "custom_label_3":  r.get("segments_product_custom_attribute3", ""),
            "custom_label_4":  r.get("segments_product_custom_attribute4", ""),
            "cost":            round(cost, 2),
            "conversions":     _safe_float(r.get("metrics_conversions", 0)),
            "conv_value":      round(conv_value, 2),
            "impressions":     _safe_int(r.get("metrics_impressions", 0)),
            "roas":            round(conv_value / cost, 4) if cost > 0 else 0,
        })
    log.info(f"   r_prod_t_180: {len(result['products_180d'])} filas")

    # r_ads + r_allads
    ads_rows    = _read_sheet_csv(sheet_id, "r_ads")
    allads_rows = _read_sheet_csv(sheet_id, "r_allads")

    asset_lookup = {}
    for a in allads_rows:
        aid = a.get("asset_id", "")
        if aid:
            asset_lookup[aid] = {
                "asset_type":       a.get("asset_type", ""),
                "asset_text":       a.get("asset_text_asset_text", ""),
                "image_url":        a.get("asset_image_asset_full_size_url", ""),
                "youtube_video_id": a.get("asset_youtube_video_asset_youtube_video_id", ""),
                "youtube_title":    a.get("asset_youtube_video_asset_youtube_video_title", ""),
                "final_url":        a.get("asset_final_urls", ""),
                "source":           a.get("asset_source", ""),
            }

    for r in ads_rows:
        resource_name = r.get("asset_resource_name", "")
        asset_id = resource_name.split("/")[-1] if "/" in resource_name else resource_name
        asset_detail = asset_lookup.get(asset_id, {})
        result["assets"].append({
            "campaign_name":     r.get("campaign_name", ""),
            "asset_group_name":  r.get("asset_group_name", ""),
            "asset_group_id":    r.get("asset_group_id", ""),
            "asset_id":          asset_id,
            "asset_type":        asset_detail.get("asset_type", ""),
            "field_type":        r.get("asset_group_asset_field_type", ""),
            "performance_label": r.get("asset_group_asset_performance_label", ""),
            "ad_strength":       r.get("asset_group_ad_strength", ""),
            "status":            r.get("asset_group_status", ""),
            "source":            asset_detail.get("source", ""),
            "asset_text":        asset_detail.get("asset_text", ""),
            "image_url":         asset_detail.get("image_url", ""),
            "youtube_video_id":  asset_detail.get("youtube_video_id", ""),
            "youtube_title":     asset_detail.get("youtube_title", ""),
            "final_url":         asset_detail.get("final_url", ""),
        })
    log.info(f"   r_ads: {len(result['assets'])} assets")

    # zombies
    rows = _read_sheet_csv(sheet_id, "zombies")
    for r in rows:
        if not r.get("segments_product_item_id"):
            continue
        result["zombies"].append({
            "product_item_id": r.get("segments_product_item_id", ""),
            "product_title":   r.get("segments_product_title", ""),
            "impressions":     _safe_int(r.get("metrics_impressions", 0)),
            "clicks":          0,
        })
    log.info(f"   zombies: {len(result['zombies'])} productos")

    return result


def extract_smec_search_terms(sheet_id: str) -> list[dict]:
    """Lee el sheet de smec via CSV público."""
    log.info(f"   Leyendo smec Sheet ID: {sheet_id}")

    rows = _read_sheet_csv(sheet_id, "End Result")
    if not rows:
        log.warning("   smec: sin datos en End Result")
        return []

    result = []
    for r in rows:
        period_start = r.get("timeframe_start_date", "")
        period_end   = r.get("timeframe_end_date", "")
        if not period_start or not period_end:
            continue
        result.append({
            "period_start":               period_start,
            "period_end":                 period_end,
            "conversions_branded":        _safe_float(r.get("branded_conversions", 0)),
            "conv_value_branded":         _safe_float(r.get("branded_conv_value", 0)),
            "clicks_branded":             _safe_int(r.get("branded_clicks", 0)),
            "impressions_branded":        _safe_int(r.get("branded_impressions", 0)),
            "ctr_branded":                _safe_float(r.get("ctrbranded", 0)),
            "conv_rate_branded":          _safe_float(r.get("convrate_branded", 0)),
            "ratio_branded_conv":         _safe_float(r.get("ratiobranded_conversions", 0)),
            "ratio_branded_conv_value":   _safe_float(r.get("ratiobranded_conv_value", 0)),
            "ratio_branded_clicks":       _safe_float(r.get("ratiobranded_clicks", 0)),
            "ratio_branded_impressions":  _safe_float(r.get("ratiobranded_impressions", 0)),
            "conversions_nonbranded":     _safe_float(r.get("non-branded_conversions", 0)),
            "conv_value_nonbranded":      _safe_float(r.get("non-branded_conv_value", 0)),
            "clicks_nonbranded":          _safe_int(r.get("non-branded_clicks", 0)),
            "impressions_nonbranded":     _safe_int(r.get("non-branded_impressions", 0)),
            "ctr_nonbranded":             _safe_float(r.get("ctrnonbranded", 0)),
            "conv_rate_nonbranded":       _safe_float(r.get("convrate_nonbranded", 0)),
            "conversions_blank":          _safe_float(r.get("blank_conversions", 0)),
            "conv_value_blank":           _safe_float(r.get("blank_conv_value", 0)),
            "clicks_blank":               _safe_int(r.get("blank_clicks", 0)),
            "impressions_blank":          _safe_int(r.get("blank_impressions", 0)),
            "ctr_blank":                  _safe_float(r.get("ctrblank", 0)),
            "conv_rate_blank":            _safe_float(r.get("convrate_blank", 0)),
        })

    log.info(f"   smec: {len(result)} períodos")
    return result
