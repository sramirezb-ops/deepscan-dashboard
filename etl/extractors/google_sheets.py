"""
Extractor: Google Sheets
Lee el sheet de Mike Rhodes y smec con mejor manejo de errores.
"""

import os
import json
import logging
from typing import Any
import gspread
from google.oauth2.service_account import Credentials

log = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly"
]


def _get_client() -> gspread.Client:
    """Autentica con la cuenta de servicio de Google."""
    creds_path = os.environ["GOOGLE_CREDENTIALS_PATH"]
    
    # Verificar que el archivo existe
    if not os.path.exists(creds_path):
        raise FileNotFoundError(f"Credentials file not found: {creds_path}")
    
    # Cargar y verificar el JSON
    with open(creds_path, 'r') as f:
        creds_data = json.load(f)
    
    log.info(f"   Credenciales cargadas para: {creds_data.get('client_email', 'unknown')}")
    log.info(f"   Project ID: {creds_data.get('project_id', 'unknown')}")
    
    # Usar google-auth directamente (más confiable que oauth2client)
    creds = Credentials.from_service_account_info(creds_data, scopes=SCOPES)
    return gspread.authorize(creds)


def _sheet_to_dicts(ws) -> list[dict]:
    """Convierte una hoja en lista de dicts."""
    rows = ws.get_all_values()
    if len(rows) < 2:
        return []
    headers = [h.strip().lower().replace(" ", "_").replace(".", "_") for h in rows[0]]
    return [dict(zip(headers, row)) for row in rows[1:] if any(row)]


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
    """Lee el Google Sheet de Mike Rhodes."""
    log.info(f"   Conectando a Sheet ID: {sheet_id}")
    gc = _get_client()
    
    try:
        sh = gc.open_by_key(sheet_id)
        log.info(f"   Sheet abierto: {sh.title}")
    except gspread.exceptions.APIError as e:
        log.error(f"   Error APIError: {e}")
        log.error(f"   Response status: {e.response.status_code if hasattr(e, 'response') else 'unknown'}")
        log.error(f"   Response text: {e.response.text if hasattr(e, 'response') else 'unknown'}")
        raise
    except Exception as e:
        log.error(f"   Error abriendo sheet: {type(e).__name__}: {e}")
        raise

    result = {
        "campaigns":    [],
        "asset_groups": [],
        "products_30d": [],
        "products_180d":[],
        "assets":       [],
        "zombies":      []
    }

    # r_camp
    try:
        ws = sh.worksheet("r_camp")
        rows = _sheet_to_dicts(ws)
        for r in rows:
            cost = _safe_float(r.get("metrics_cost_micros", 0)) / 1_000_000
            conv_value = _safe_float(r.get("metrics_conversions_value", 0))
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
    except Exception as e:
        log.error(f"   r_camp error: {e}")

    # r_ag
    try:
        ws = sh.worksheet("r_ag")
        rows = _sheet_to_dicts(ws)
        for r in rows:
            cost = _safe_float(r.get("metrics_cost_micros", 0)) / 1_000_000
            conv_value = _safe_float(r.get("metrics_conversions_value", 0))
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
    except Exception as e:
        log.error(f"   r_ag error: {e}")

    # r_prod_t
    try:
        ws = sh.worksheet("r_prod_t")
        rows = _sheet_to_dicts(ws)
        for r in rows:
            cost = _safe_float(r.get("metrics_cost_micros", 0)) / 1_000_000
            conv_value = _safe_float(r.get("metrics_conversions_value", 0))
            result["products_30d"].append({
                "period":           "30d",
                "campaign_name":    r.get("campaign_name", ""),
                "product_title":    r.get("segments_product_title", ""),
                "product_item_id":  r.get("segments_product_item_id", ""),
                "custom_label_0":   r.get("segments_product_custom_attribute0", ""),
                "custom_label_1":   r.get("segments_product_custom_attribute1", ""),
                "custom_label_2":   r.get("segments_product_custom_attribute2", ""),
                "custom_label_3":   r.get("segments_product_custom_attribute3", ""),
                "custom_label_4":   r.get("segments_product_custom_attribute4", ""),
                "cost":             round(cost, 2),
                "conversions":      _safe_float(r.get("metrics_conversions", 0)),
                "conv_value":       round(conv_value, 2),
                "impressions":      _safe_int(r.get("metrics_impressions", 0)),
                "roas":             round(conv_value / cost, 4) if cost > 0 else 0,
            })
        log.info(f"   r_prod_t: {len(result['products_30d'])} filas")
    except Exception as e:
        log.error(f"   r_prod_t error: {e}")

    # r_prod_t_180
    try:
        ws = sh.worksheet("r_prod_t_180")
        rows = _sheet_to_dicts(ws)
        for r in rows:
            cost = _safe_float(r.get("metrics_cost_micros", 0)) / 1_000_000
            conv_value = _safe_float(r.get("metrics_conversions_value", 0))
            result["products_180d"].append({
                "period":           "180d",
                "campaign_name":    r.get("campaign_name", ""),
                "product_title":    r.get("segments_product_title", ""),
                "product_item_id":  r.get("segments_product_item_id", ""),
                "custom_label_0":   r.get("segments_product_custom_attribute0", ""),
                "custom_label_1":   r.get("segments_product_custom_attribute1", ""),
                "custom_label_2":   r.get("segments_product_custom_attribute2", ""),
                "custom_label_3":   r.get("segments_product_custom_attribute3", ""),
                "custom_label_4":   r.get("segments_product_custom_attribute4", ""),
                "cost":             round(cost, 2),
                "conversions":      _safe_float(r.get("metrics_conversions", 0)),
                "conv_value":       round(conv_value, 2),
                "impressions":      _safe_int(r.get("metrics_impressions", 0)),
                "roas":             round(conv_value / cost, 4) if cost > 0 else 0,
            })
        log.info(f"   r_prod_t_180: {len(result['products_180d'])} filas")
    except Exception as e:
        log.error(f"   r_prod_t_180 error: {e}")

    # r_ads + r_allads
    try:
        ws_ads    = sh.worksheet("r_ads")
        ws_allads = sh.worksheet("r_allads")
        ads_rows    = _sheet_to_dicts(ws_ads)
        allads_rows = _sheet_to_dicts(ws_allads)
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
    except Exception as e:
        log.error(f"   r_ads error: {e}")

    # zombies
    try:
        ws = sh.worksheet("zombies")
        rows = _sheet_to_dicts(ws)
        for r in rows:
            result["zombies"].append({
                "product_item_id": r.get("segments_product_item_id", ""),
                "product_title":   r.get("segments_product_title", ""),
                "impressions":     _safe_int(r.get("metrics_impressions", 0)),
                "clicks":          0,
            })
        log.info(f"   zombies: {len(result['zombies'])} productos")
    except Exception as e:
        log.error(f"   zombies error: {e}")

    return result


def extract_smec_search_terms(sheet_id: str) -> list[dict]:
    """Lee el sheet de smec."""
    log.info(f"   Conectando a smec Sheet ID: {sheet_id}")
    gc = _get_client()

    try:
        sh  = gc.open_by_key(sheet_id)
        ws  = sh.worksheet("End Result")
        rows = _sheet_to_dicts(ws)
    except Exception as e:
        log.error(f"   smec error: {e}")
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
            "conv_value_branded":         _safe_float(r.get("branded_conv__value", 0)),
            "clicks_branded":             _safe_int(r.get("branded_clicks", 0)),
            "impressions_branded":        _safe_int(r.get("branded_impressions", 0)),
            "ctr_branded":                _safe_float(r.get("ctrbranded", 0)),
            "conv_rate_branded":          _safe_float(r.get("convrate_branded", 0)),
            "ratio_branded_conv":         _safe_float(r.get("ratiobranded_conversions", 0)),
            "ratio_branded_conv_value":   _safe_float(r.get("ratiobranded_conv_value", 0)),
            "ratio_branded_clicks":       _safe_float(r.get("ratiobranded_clicks", 0)),
            "ratio_branded_impressions":  _safe_float(r.get("ratiobranded_impressions", 0)),
            "conversions_nonbranded":     _safe_float(r.get("non-branded_conversions", 0)),
            "conv_value_nonbranded":      _safe_float(r.get("non-branded_conv__value", 0)),
            "clicks_nonbranded":          _safe_int(r.get("non-branded_clicks", 0)),
            "impressions_nonbranded":     _safe_int(r.get("non-branded_impressions", 0)),
            "ctr_nonbranded":             _safe_float(r.get("ctrnonbranded", 0)),
            "conv_rate_nonbranded":       _safe_float(r.get("convrate_nonbranded", 0)),
            "conversions_blank":          _safe_float(r.get("blank_conversions", 0)),
            "conv_value_blank":           _safe_float(r.get("blank_conv__value", 0)),
            "clicks_blank":               _safe_int(r.get("blank_clicks", 0)),
            "impressions_blank":          _safe_int(r.get("blank_impressions", 0)),
            "ctr_blank":                  _safe_float(r.get("ctrblank", 0)),
            "conv_rate_blank":            _safe_float(r.get("convrate_blank", 0)),
        })

    log.info(f"   smec: {len(result)} períodos")
    return result
