"""
Extractor: TikTok Ads (TikTok Marketing API v1.3)
Nivel: anuncio (AUCTION_AD) por día — el más granular disponible.

Ofero es un negocio de LEADS (prospectos a WhatsApp), por eso las métricas
estrella son: conversiones (leads), costo por lead (CPL) y CTR. NO se modela
ROAS de ventas. También se traen métricas de VIDEO (vistas y retención 2s/6s),
que en TikTok revelan qué tan bien "engancha" cada creativo.

Doc API: https://business-api.tiktok.com/portal/docs (Reporting > Get an integrated report)
Endpoint: GET /open_api/v1.3/report/integrated/get/
Auth: header "Access-Token: <token>"

Igual que meta_ads.py: una función pura que devuelve filas (list[dict]) listas
para loader.upsert("tiktok_campaigns", ...). Si la API responde error, lanza
excepción y el llamador en etl_main.py la captura sin tumbar el resto del ETL.
"""

import json
import logging
import time
from datetime import date
import requests

log = logging.getLogger(__name__)

BASE_URL = "https://business-api.tiktok.com/open_api/v1.3"

# Dimensiones del reporte: un registro = un anuncio × un día.
DIMENSIONS = ["ad_id", "stat_time_day"]

# Métricas BASE que pedimos a TikTok. Las derivadas (CTR, CPC, CPM, CPL,
# tasa de conversión) las calculamos nosotros para mantener consistencia
# con el resto del dashboard (fracciones 0-1) y no depender de si TikTok
# las devuelve en porcentaje o no.
METRICS = [
    # Identificación (en el reporte integrado, los nombres viajan como "métricas")
    "campaign_id", "campaign_name",
    "adgroup_id", "adgroup_name",
    "ad_name",
    # Inversión y alcance
    "spend", "impressions", "clicks", "reach",
    # Conversiones / leads
    "conversion",
    # Video — reproducciones y curva de retención
    "video_play_actions",   # reproducciones de video
    "video_watched_2s",     # llegaron a 2s (mide el "hook")
    "video_watched_6s",     # llegaron a 6s (retención temprana)
    "video_views_p25",      # llegaron al 25 % del video
    "video_views_p50",      # llegaron al 50 %
    "video_views_p75",      # llegaron al 75 %
    "video_views_p100",     # vieron el video completo
    # Video — tiempo de reproducción promedio (segundos, lo da TikTok directo)
    "average_video_play",            # promedio por reproducción
    "average_video_play_per_user",   # promedio por usuario
]

PAGE_SIZE = 1000


def _num(metrics: dict, key: str) -> float:
    """Lee una métrica numérica del bloque metrics, tolerante a '' / None."""
    v = metrics.get(key, 0)
    if v in (None, "", "-"):
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def extract_tiktok_ads(
    access_token: str,
    advertiser_id: str,
    date_from: date,
    date_to: date,
) -> list[dict]:
    """
    Extrae el rendimiento diario de TikTok Ads a nivel anuncio.
    Alimenta la tabla `tiktok_campaigns`. Devuelve [] si no hay actividad.
    """
    url = f"{BASE_URL}/report/integrated/get/"
    headers = {"Access-Token": access_token}

    rows: list[dict] = []
    page = 1
    total_pages = 1

    while page <= total_pages:
        params = {
            "advertiser_id": advertiser_id,
            "report_type":   "BASIC",
            "data_level":    "AUCTION_AD",
            "dimensions":    json.dumps(DIMENSIONS),
            "metrics":       json.dumps(METRICS),
            "start_date":    date_from.isoformat(),
            "end_date":      date_to.isoformat(),
            "page":          page,
            "page_size":     PAGE_SIZE,
        }

        resp = requests.get(url, headers=headers, params=params, timeout=60)
        resp.raise_for_status()
        payload = resp.json()

        # La Marketing API SIEMPRE responde HTTP 200; el error real va en code.
        if payload.get("code") != 0:
            raise RuntimeError(
                f"TikTok API code={payload.get('code')} msg={payload.get('message')}"
            )

        data = payload.get("data", {}) or {}
        page_info = data.get("page_info", {}) or {}
        total_pages = int(page_info.get("total_page", 1) or 1)

        for item in data.get("list", []):
            dims = item.get("dimensions", {}) or {}
            m = item.get("metrics", {}) or {}

            ad_id = str(dims.get("ad_id", "") or "")
            if not ad_id:
                continue

            # stat_time_day llega como "2024-01-01 00:00:00" → tomamos la fecha.
            day = str(dims.get("stat_time_day", "") or "")[:10]

            spend       = _num(m, "spend")
            impressions = int(_num(m, "impressions"))
            clicks      = int(_num(m, "clicks"))
            reach       = int(_num(m, "reach"))
            conversions = _num(m, "conversion")

            video_views     = int(_num(m, "video_play_actions"))
            video_2s        = int(_num(m, "video_watched_2s"))
            video_6s        = int(_num(m, "video_watched_6s"))
            video_p25       = int(_num(m, "video_views_p25"))
            video_p50       = int(_num(m, "video_views_p50"))
            video_p75       = int(_num(m, "video_views_p75"))
            video_completes = int(_num(m, "video_views_p100"))
            # Tiempo de reproducción promedio (segundos). TikTok lo da directo.
            avg_watch       = round(_num(m, "average_video_play"), 2)
            avg_watch_user  = round(_num(m, "average_video_play_per_user"), 2)

            # Derivadas (calculadas por nosotros, fracciones 0-1 donde aplica).
            ctr  = round(clicks / impressions, 4) if impressions > 0 else 0.0
            cpc  = round(spend / clicks, 2)        if clicks > 0      else 0.0
            cpm  = round(spend / (impressions / 1000), 2) if impressions > 0 else 0.0
            cpl  = round(spend / conversions, 2)   if conversions > 0 else 0.0
            cvr  = round(conversions / clicks, 4)  if clicks > 0      else 0.0

            rows.append({
                "date":                day,
                "campaign_id":         str(m.get("campaign_id", "") or ""),
                "campaign_name":       m.get("campaign_name", "") or "",
                "adgroup_id":          str(m.get("adgroup_id", "") or ""),
                "adgroup_name":        m.get("adgroup_name", "") or "",
                "ad_id":               ad_id,
                "ad_name":             m.get("ad_name", "") or "",
                "status":              "",  # el reporte no trae estado; queda vacío (honesto)
                "spend":               spend,
                "impressions":         impressions,
                "clicks":              clicks,
                "reach":               reach,
                "ctr":                 ctr,
                "cpc":                 cpc,
                "cpm":                 cpm,
                "conversions":         conversions,
                "cost_per_conversion": cpl,
                "conversion_rate":     cvr,
                "video_views":         video_views,
                "video_watched_2s":    video_2s,
                "video_watched_6s":    video_6s,
                "video_watched_p25":   video_p25,
                "video_watched_p50":   video_p50,
                "video_watched_p75":   video_p75,
                "video_completes":     video_completes,
                "avg_watch_time":          avg_watch,
                "avg_watch_time_per_user": avg_watch_user,
            })

        page += 1
        if page <= total_pages:
            time.sleep(0.3)

    log.info(f"   TikTok Ads: {len(rows)} filas ({total_pages} páginas)")
    return rows
