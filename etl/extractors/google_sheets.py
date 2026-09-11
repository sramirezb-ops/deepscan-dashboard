"""
Extractor: Google Sheets
Lee los 4 scripts via CSV público (sheets públicos, sin autenticación):
  1. PMAX Insights (Mike Rhodes v30) — r_camp, r_ag, r_prod_t, r_prod_t_180, r_ads, r_allads, zombies, r_placements_pmax, r_placements_detail
  2. Brand Analyzer (smec) — End Result
  3. PMAX Search Terms — categories, terms
  4. Flowboost Labelizer — Flowbelizer, productSummary
"""

import logging
import requests
import csv
import io
import os
from typing import Any

log = logging.getLogger(__name__)


def _read_sheet_csv(sheet_id: str, tab_name: str) -> list[dict]:
    """Lee una pestaña de un Google Sheet público via CSV."""
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&sheet={tab_name}"
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        if not resp.text or len(resp.text) < 10:
            log.warning(f"   Tab '{tab_name}': respuesta vacía")
            return []
        reader = csv.DictReader(io.StringIO(resp.text))
        rows = []
        for row in reader:
            normalized = {}
            for k, v in row.items():
                key = k.strip().lower()\
                    .replace(" ", "_").replace(".", "_")\
                    .replace("(", "").replace(")", "")\
                    .replace("/", "_").replace("-", "_")
                normalized[key] = v.strip()
            rows.append(normalized)
        return rows
    except requests.exceptions.HTTPError as e:
        log.error(f"   Tab '{tab_name}' HTTP {e.response.status_code}")
        return []
    except Exception as e:
        log.error(f"   Tab '{tab_name}' error: {type(e).__name__}: {e}")
        return []


def _safe_float(val: Any, default=0.0) -> float:
    # Quita separadores de miles y CUALQUIER símbolo de moneda ($, €, £, %, etc.):
    # algunos sheets (p.ej. FlowBoost) traen "€ 89.44" y antes devolvían 0.
    try:
        s = re.sub(r"[^0-9.\-]", "", str(val).replace(",", ""))
        return float(s or 0)
    except (ValueError, TypeError):
        return default


def _safe_int(val: Any, default=0) -> int:
    try:
        return int(float(str(val).replace(",", "").strip() or 0))
    except (ValueError, TypeError):
        return default


# ════════════════════════════════════════════════════════════════
# 1. PMAX INSIGHTS — Mike Rhodes v30
# ════════════════════════════════════════════════════════════════

def extract_mike_rhodes(sheet_id: str) -> dict:
    """Lee el Google Sheet de Mike Rhodes v30 via CSV público."""
    log.info(f"   Mike Rhodes sheet: {sheet_id}")

    result = {
        "campaigns":         [],
        "asset_groups":      [],
        "products_30d":      [],
        "products_180d":     [],
        "assets":            [],
        "zombies":           [],
        "placements_pmax":   [],
        "placements_detail": [],
    }

    # r_camp
    for r in _read_sheet_csv(sheet_id, "r_camp"):
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
            "video_views":   0,
            "avg_cpv":       0,
            "roas":          round(conv_value / cost, 4) if cost > 0 else 0,
        })
    log.info(f"   r_camp: {len(result['campaigns'])} filas")

    # r_ag
    for r in _read_sheet_csv(sheet_id, "r_ag"):
        cost = _safe_float(r.get("metrics_cost_micros", 0)) / 1_000_000
        conv_value = _safe_float(r.get("metrics_conversions_value", 0))
        if not r.get("segments_date"):
            continue
        result["asset_groups"].append({
            "date":             r.get("segments_date", ""),
            "campaign_name":    r.get("campaign_name", ""),
            "asset_group_name": r.get("asset_group_name", ""),
            "ad_strength":      r.get("asset_group_ad_strength", ""),
            "status":           r.get("asset_group_status", ""),
            "impressions":      _safe_int(r.get("metrics_impressions", 0)),
            "clicks":           _safe_int(r.get("metrics_clicks", 0)),
            "cost":             round(cost, 2),
            "conversions":      _safe_float(r.get("metrics_conversions", 0)),
            "conv_value":       round(conv_value, 2),
            "roas":             round(conv_value / cost, 4) if cost > 0 else 0,
        })
    log.info(f"   r_ag: {len(result['asset_groups'])} filas")

    # r_prod_t (30d)
    for r in _read_sheet_csv(sheet_id, "r_prod_t"):
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
    for r in _read_sheet_csv(sheet_id, "r_prod_t_180"):
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
    for r in _read_sheet_csv(sheet_id, "r_ads"):
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
    for r in _read_sheet_csv(sheet_id, "zombies"):
        if not r.get("segments_product_item_id"):
            continue
        result["zombies"].append({
            "product_item_id": r.get("segments_product_item_id", ""),
            "product_title":   r.get("segments_product_title", ""),
            "impressions":     _safe_int(r.get("metrics_impressions", 0)),
            "clicks":          0,
        })
    log.info(f"   zombies: {len(result['zombies'])} productos")

    # r_placements_pmax
    for r in _read_sheet_csv(sheet_id, "r_placements_pmax"):
        result["placements_pmax"].append({
            "campaign_name": r.get("campaign_name", ""),
            "display_name":  r.get("performance_max_placement_view_display_name", ""),
            "placement":     r.get("performance_max_placement_view_placement", ""),
            "placement_type":r.get("performance_max_placement_view_placement_type", ""),
            "target_url":    r.get("performance_max_placement_view_target_url", ""),
            "impressions":   _safe_int(r.get("metrics_impressions", 0)),
        })
    log.info(f"   r_placements_pmax: {len(result['placements_pmax'])} filas")

    # r_placements_detail
    for r in _read_sheet_csv(sheet_id, "r_placements_detail"):
        cost = _safe_float(r.get("metrics_cost_micros", 0)) / 1_000_000
        conv_value = _safe_float(r.get("metrics_conversions_value", 0))
        result["placements_detail"].append({
            "campaign_name":  r.get("campaign_name", ""),
            "channel_type":   r.get("campaign_advertising_channel_type", ""),
            "display_name":   r.get("detail_placement_view_display_name", ""),
            "placement":      r.get("detail_placement_view_placement", ""),
            "placement_type": r.get("detail_placement_view_placement_type", ""),
            "target_url":     r.get("detail_placement_view_target_url", ""),
            "impressions":    _safe_int(r.get("metrics_impressions", 0)),
            "clicks":         _safe_int(r.get("metrics_clicks", 0)),
            "cost":           round(cost, 2),
            "conversions":    _safe_float(r.get("metrics_conversions", 0)),
            "conv_value":     round(conv_value, 2),
        })
    log.info(f"   r_placements_detail: {len(result['placements_detail'])} filas")

    return result


# ════════════════════════════════════════════════════════════════
# 1b. PMAX CHANNEL SPLIT — pestaña "Campaigns" (Mike Rhodes)
# ════════════════════════════════════════════════════════════════
# La pestaña "Campaigns" del sheet de Mike Rhodes es una hoja de PRESENTACIÓN
# (calculada con fórmulas, no por el runReport del script) que descompone el
# gasto de cada campaña PMax por RED: Shop, Video, Display y Search*.
#
# Por qué importa: Google NO expone oficialmente el costo-por-red dentro de una
# campaña Performance Max ni por API ni por Script. Esta pestaña lo aproxima:
#   · Video y Display salen de datos REALES de emplazamientos (placements).
#   · Shop sale de shopping_performance_view.
#   · Search* es el RESIDUAL (Total − Video − Display − Shop). El asterisco
#     significa justamente eso: "lo que sobra", no un dato etiquetado por Google.
#
# Es la ÚNICA fuente de este split, por eso lo traemos del sheet aunque todo lo
# demás de PMax (assets, asset groups, imágenes) lo saquemos de la API.
#
# Devuelve formato LARGO: una fila por (campaña × red), lista para
# loader.upsert("gads_pmax_channels", ...). Las fracciones (%) las calculamos
# nosotros sobre el total para mantener la convención 0-1 del dashboard.

# Cada red: (clave_en_la_pestaña, código_interno, es_residual)
_PMAX_CHANNELS = [
    ("shop",     "shop",    False),
    ("video",    "video",   False),
    ("display",  "display", False),
    ("search*",  "search",  True),   # Search* = residual (Total − Video − Display − Shop)
]


def extract_pmax_channels(sheet_id: str) -> list[dict]:
    """
    Lee la pestaña "Campaigns" del sheet de Mike Rhodes y devuelve el desglose
    de gasto/leads por red (Shop/Video/Display/Search*) para cada campaña PMax.
    Formato largo: una fila por (campaña × red). Devuelve [] si no hay datos.
    """
    log.info(f"   PMAX Channel Split (pestaña Campaigns): {sheet_id}")
    rows = _read_sheet_csv(sheet_id, "Campaigns")
    if not rows:
        log.warning("   Campaigns: sin datos")
        return []

    result: list[dict] = []
    for r in rows:
        campaign = (r.get("campaign_last_30_days_data", "") or "").strip()
        total_cost = _safe_float(r.get("total_cost", 0))
        # Filtra filas vacías / de relleno: necesitamos nombre y gasto real.
        if not campaign or total_cost <= 0:
            continue

        total_conv  = _safe_float(r.get("conv", 0))
        total_value = _safe_float(r.get("conv_value", 0))

        for prefix, channel, is_residual in _PMAX_CHANNELS:
            cost  = _safe_float(r.get(f"{prefix}_cost", 0))
            conv  = _safe_float(r.get(f"{prefix}_conv", 0))
            value = _safe_float(r.get(f"{prefix}_value", 0))

            result.append({
                "campaign_name":       campaign,
                "channel":             channel,
                "is_residual":         is_residual,
                "cost":                round(cost, 2),
                "conversions":         conv,
                "conv_value":          round(value, 2),
                # Fracciones 0-1 calculadas por nosotros sobre el total real.
                "cost_pct":            round(cost / total_cost, 4) if total_cost > 0 else 0,
                "conv_pct":            round(conv / total_conv, 4) if total_conv > 0 else 0,
                "roas":                round(value / cost, 4) if cost > 0 else 0,
                # Contexto de la campaña (denormalizado para el frontend).
                "campaign_total_cost": round(total_cost, 2),
                "campaign_total_conv": total_conv,
                "campaign_total_value":round(total_value, 2),
            })

    log.info(f"   Campaigns: {len(result)} filas (campañas × red)")
    return result


# ════════════════════════════════════════════════════════════════
# 2. BRAND ANALYZER — smec
# ════════════════════════════════════════════════════════════════

def extract_smec_search_terms(sheet_id: str) -> list[dict]:
    """Lee el sheet de smec — pestaña End Result."""
    log.info(f"   smec sheet: {sheet_id}")
    rows = _read_sheet_csv(sheet_id, "End Result")
    if not rows:
        log.warning("   smec: sin datos")
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
            "conversions_nonbranded":     _safe_float(r.get("non_branded_conversions", 0)),
            "conv_value_nonbranded":      _safe_float(r.get("non_branded_conv_value", 0)),
            "clicks_nonbranded":          _safe_int(r.get("non_branded_clicks", 0)),
            "impressions_nonbranded":     _safe_int(r.get("non_branded_impressions", 0)),
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


# ════════════════════════════════════════════════════════════════
# 3. PMAX SEARCH TERMS
# ════════════════════════════════════════════════════════════════

def extract_pmax_search_terms(sheet_id: str) -> dict:
    """
    Lee el sheet de PMAX Search Terms.
    Pestañas: categories, terms
    """
    log.info(f"   PMAX Search Terms sheet: {sheet_id}")
    result = {"categories": [], "terms": []}

    for r in _read_sheet_csv(sheet_id, "categories"):
        result["categories"].append({
            "campaign_name":  r.get("campaign_name", ""),
            "campaign_id":    r.get("campaign_id", ""),
            "category_label": r.get("category_label", ""),
            "category_id":    r.get("category_id", ""),
            "clicks":         _safe_int(r.get("clicks", 0)),
            "impressions":    _safe_int(r.get("impr", 0)),
            "conversions":    _safe_float(r.get("conv", 0)),
            "conv_value":     _safe_float(r.get("value", 0)),
            "ctr":            r.get("ctr", "0%").replace("%", ""),
            "cvr":            r.get("cvr", "0%").replace("%", ""),
            "aov":            _safe_float(r.get("aov", 0)),
        })
    log.info(f"   categories: {len(result['categories'])} filas")

    for r in _read_sheet_csv(sheet_id, "terms"):
        result["terms"].append({
            "campaign_name":  r.get("campaign_name", ""),
            "campaign_id":    r.get("campaign_id", ""),
            "category_label": r.get("category_label", ""),
            "search_term":    r.get("search_term", ""),
            "clicks":         _safe_int(r.get("clicks", 0)),
            "impressions":    _safe_int(r.get("impr", 0)),
            "conversions":    _safe_float(r.get("conv", 0)),
            "conv_value":     _safe_float(r.get("value", 0)),
            "ctr":            r.get("ctr", "0%").replace("%", ""),
            "cvr":            r.get("cvr", "0%").replace("%", ""),
            "aov":            _safe_float(r.get("aov", 0)),
        })
    log.info(f"   terms: {len(result['terms'])} filas")

    return result


# ════════════════════════════════════════════════════════════════
# 4. FLOWBOOST LABELIZER
# ════════════════════════════════════════════════════════════════

def extract_flowboost(sheet_id: str) -> dict:
    """
    Lee el sheet de Flowboost Labelizer.
    Pestañas: Flowbelizer, productSummary
    """
    log.info(f"   Flowboost sheet: {sheet_id}")
    result = {"products": [], "summary": []}

    # Flowbelizer — producto por producto con label.
    # Columnas reales del sheet (headers normalizados por _read_sheet_csv):
    #   id · impressions · clicks · costs · conversions · conv_value · roas · custom_label_1
    # Se mantienen los nombres viejos como fallback por si otro cliente usa otro layout.
    for r in _read_sheet_csv(sheet_id, "Flowbelizer"):
        product_id = r.get("id") or r.get("offer_id") or r.get("segments_product_item_id", "")
        if not product_id:
            continue
        result["products"].append({
            "product_item_id": product_id,
            "impressions":     _safe_int(r.get("impressions", 0)),
            "clicks":          _safe_int(r.get("clicks", 0)),
            "cost":            _safe_float(r.get("costs", r.get("cost", 0))),
            "conversions":     _safe_float(r.get("conversions", 0)),
            "conv_value":      _safe_float(r.get("conv_value", r.get("conversionvalue", r.get("conversion_value", 0)))),
            "roas":            _safe_float(r.get("roas", r.get("convvaluepercostvp", r.get("conv_value_per_cost", 0)))),
            "label":           r.get("custom_label_1", r.get("isproducttype", r.get("label", ""))),  # over-index, index, near-index, under-index, no-index
        })
    log.info(f"   Flowbelizer: {len(result['products'])} productos")

    # productSummary — resumen por label (columnas: custom_label_1 · amount · impressions · clicks · costs · conv_value · roas)
    for r in _read_sheet_csv(sheet_id, "productSummary"):
        result["summary"].append({
            "label":       r.get("custom_label_1", r.get("label", r.get("isproducttype", ""))),
            "count":       _safe_int(r.get("amount", r.get("count", 0))),
            "impressions": _safe_int(r.get("impressions", 0)),
            "clicks":      _safe_int(r.get("clicks", 0)),
            "cost":        _safe_float(r.get("costs", r.get("cost", 0))),
            "conversions": _safe_float(r.get("conversions", 0)),
            "conv_value":  _safe_float(r.get("conv_value", 0)),
            "roas":        _safe_float(r.get("roas", 0)),
        })
    log.info(f"   productSummary: {len(result['summary'])} filas")

    return result
