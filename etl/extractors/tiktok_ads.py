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


# ─────────────────────────────────────────────────────────────────────────────
# Creativos: portada (cover) y video de cada anuncio
# ─────────────────────────────────────────────────────────────────────────────
# El reporte de rendimiento NO trae la imagen/video del anuncio, solo el nombre.
# Para tener la miniatura real hacemos:
#   1) /ad/get/             → mapea ad_id → video_id / image_ids / identidad
#   2) /file/video/ad/info  → resuelve video_id → portada + preview (video)
#   3) /file/image/ad/info  → fallback: image_id → url (anuncios sin video)
#   3.5) /identity/video/info → Spark Ads (posts orgánicos): portada vía
#        identity_id + tiktok_item_id (no tienen video subido al anunciante)
# Alimenta la tabla `tiktok_creatives` (una fila por anuncio). Best-effort: si la
# app no tiene permiso de gestión de anuncios, la API responde code!=0; lo
# registramos y devolvemos lo que se haya podido resolver, sin lanzar. Así el
# dashboard mantiene su marcador honesto en vez de romperse o inventar.

AD_IDS_PER_CALL    = 100   # límite de /ad/get/ filtering.ad_ids
VIDEO_IDS_PER_CALL = 60    # límite de /file/video/ad/info/
IMAGE_IDS_PER_CALL = 100   # límite de /file/image/ad/info/


def _identity_info(data: dict) -> dict:
    """Normaliza la respuesta de /identity/video/info/. La portada de un post
    orgánico (Spark Ad) viene en data.video_detail.video_info.poster_url; otras
    variantes la traen en `video`/`video_info` o como primer elemento de `list`.
    Devolvemos un dict combinado (detalle + video_info) que contenga la portada."""
    if isinstance(data.get("list"), list) and data["list"]:
        data = data["list"][0] or {}
    # Spark/post orgánico: el detalle envuelve el bloque de video.
    detail = data.get("video_detail") or data.get("video_details") or {}
    if isinstance(detail, dict) and isinstance(detail.get("video_info"), dict):
        return {**detail, **detail["video_info"]}
    for key in ("video", "video_info"):
        if isinstance(data.get(key), dict):
            return data[key]
    return data


def _chunks(seq: list, size: int):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


def _api_get(url: str, headers: dict, params: dict) -> dict | None:
    """GET tolerante: devuelve data dict o None si la API responde error."""
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=60)
        resp.raise_for_status()
        payload = resp.json()
    except Exception as e:
        log.warning(f"   TikTok creativos: fallo de red en {url}: {e}")
        return None
    if payload.get("code") != 0:
        log.warning(
            f"   TikTok creativos: {url} code={payload.get('code')} "
            f"msg={payload.get('message')}"
        )
        return None
    return payload.get("data", {}) or {}


def _first(d: dict, *keys: str) -> str:
    """Primer valor no vacío entre varias claves posibles del payload."""
    for k in keys:
        v = d.get(k)
        if v:
            return str(v)
    return ""


def extract_tiktok_creatives(
    access_token: str,
    advertiser_id: str,
    ad_ids: list[str],
) -> list[dict]:
    """
    Resuelve portada + video de cada anuncio. Devuelve filas listas para
    loader.upsert("tiktok_creatives", ...). Nunca lanza.
    """
    headers = {"Access-Token": access_token}
    # Anuncios únicos y no vacíos.
    uniq = sorted({str(a).strip() for a in ad_ids if str(a).strip()})
    if not uniq:
        return []

    # ── 1) ad_id → video_id / image_ids ─────────────────────────────────────
    ad_meta: dict[str, dict] = {}   # ad_id → {video_id, image_ids, ad_name}
    url_ad = f"{BASE_URL}/ad/get/"
    for chunk in _chunks(uniq, AD_IDS_PER_CALL):
        page = 1
        total_pages = 1
        while page <= total_pages:
            data = _api_get(url_ad, headers, {
                "advertiser_id": advertiser_id,
                "filtering":     json.dumps({"ad_ids": chunk}),
                "fields":        json.dumps(
                    ["ad_id", "ad_name", "video_id", "image_ids", "ad_format",
                     "identity_id", "identity_type", "tiktok_item_id"]
                ),
                "page":      page,
                "page_size": AD_IDS_PER_CALL,
            })
            if data is None:
                break
            total_pages = int((data.get("page_info", {}) or {}).get("total_page", 1) or 1)
            for it in data.get("list", []):
                aid = str(it.get("ad_id", "") or "")
                if not aid:
                    continue
                ad_meta[aid] = {
                    "video_id":  str(it.get("video_id", "") or ""),
                    "image_ids": [str(x) for x in (it.get("image_ids") or []) if x],
                    "ad_name":   it.get("ad_name", "") or "",
                    # Spark Ads (posts orgánicos): apuntan a un post vía identidad.
                    "identity_id":   str(it.get("identity_id", "") or ""),
                    "identity_type": str(it.get("identity_type", "") or ""),
                    "item_id":       str(it.get("tiktok_item_id", "") or ""),
                }
            page += 1
            if page <= total_pages:
                time.sleep(0.2)

    if not ad_meta:
        log.warning("   TikTok creativos: /ad/get/ no devolvió datos (¿permiso de gestión de anuncios?)")
        return []

    # ── 2) video_id → portada + preview ─────────────────────────────────────
    video_ids = sorted({m["video_id"] for m in ad_meta.values() if m["video_id"]})
    video_map: dict[str, dict] = {}  # video_id → {cover, preview}
    url_vid = f"{BASE_URL}/file/video/ad/info/"
    for chunk in _chunks(video_ids, VIDEO_IDS_PER_CALL):
        data = _api_get(url_vid, headers, {
            "advertiser_id": advertiser_id,
            "video_ids":     json.dumps(chunk),
            "fields":        json.dumps(["video_id", "video_cover_url", "preview_url"]),
        })
        if data is None:
            continue
        for it in data.get("list", []):
            vid = str(it.get("video_id", "") or "")
            if not vid:
                continue
            video_map[vid] = {
                "cover":   _first(it, "video_cover_url", "poster_url"),
                "preview": _first(it, "preview_url"),
            }

    # ── 3) image_id → url (fallback para anuncios sin video) ────────────────
    need_images = sorted({
        m["image_ids"][0]
        for m in ad_meta.values()
        if not m["video_id"] and m["image_ids"]
    })
    image_map: dict[str, str] = {}   # image_id → url
    if need_images:
        url_img = f"{BASE_URL}/file/image/ad/info/"
        for chunk in _chunks(need_images, IMAGE_IDS_PER_CALL):
            data = _api_get(url_img, headers, {
                "advertiser_id": advertiser_id,
                "image_ids":     json.dumps(chunk),
                "fields":        json.dumps(["image_id", "image_url"]),
            })
            if data is None:
                continue
            for it in data.get("list", []):
                iid = str(it.get("image_id", "") or "")
                if iid:
                    image_map[iid] = _first(it, "image_url")

    # ── 3.5) Spark Ads (posts orgánicos): portada vía identidad + item_id ───
    # Un Spark Ad no tiene video subido a la biblioteca del anunciante (sin
    # video_id resoluble); apunta al post orgánico con identity_id + item_id.
    # Lo resolvemos con /identity/video/info/. Las identidades de Ofero son del
    # tipo BC_AUTH_TT (creadores autorizados vía Business Center): para esas la
    # API EXIGE el parámetro identity_authorized_bc_id (el bc_id del Business
    # Center). Como el token puede ver varios BC, probamos cada bc_id hasta que
    # uno responda. Best-effort: si nada resuelve, esos anuncios quedan con el
    # marcador honesto. Cacheamos por item_id para no repetir llamadas.
    spark_map: dict[str, dict] = {}   # ad_id → {cover, preview}
    spark_cache: dict[str, dict] = {} # item_id → {cover, preview}
    url_identity = f"{BASE_URL}/identity/video/info/"
    spark_ads = [
        (aid, m) for aid, m in ad_meta.items()
        if m.get("item_id") and m.get("identity_id")
        and not (m["video_id"] and m["video_id"] in video_map)
        and not m["image_ids"]
    ]

    # Business Centers visibles por el token (solo si hay identidades BC_AUTH_TT).
    bc_ids: list[str] = []
    if any((m.get("identity_type") == "BC_AUTH_TT") for _, m in spark_ads):
        bc_data = _api_get(f"{BASE_URL}/bc/get/", headers, {"page": 1, "page_size": 50})
        if bc_data:
            for b in (bc_data.get("list") or bc_data.get("bc_list") or []):
                inner = b.get("bc_info") or b
                bid = inner.get("bc_id") or b.get("bc_id")
                if bid:
                    bc_ids.append(str(bid))
    working_bc: str | None = None  # primer bc_id que funcionó (atajo de caché)

    def _resolve_spark(m: dict) -> dict | None:
        """Llama /identity/video/info/ resolviendo el bc_id correcto si aplica."""
        nonlocal working_bc
        base = {
            "advertiser_id": advertiser_id,
            "identity_id":   m["identity_id"],
            "identity_type": m["identity_type"] or "TT_USER",
            "item_id":       m["item_id"],
        }
        if m["identity_type"] == "BC_AUTH_TT" and bc_ids:
            # Prueba primero el bc_id que ya funcionó; luego el resto.
            order = ([working_bc] if working_bc else []) + [b for b in bc_ids if b != working_bc]
            for bid in order:
                d = _api_get(url_identity, headers, {**base, "identity_authorized_bc_id": bid})
                if d:
                    working_bc = bid
                    return d
            return None
        return _api_get(url_identity, headers, base)

    for aid, m in spark_ads:
        key = m["item_id"]
        if key not in spark_cache:
            data = _resolve_spark(m)
            if data:
                info = _identity_info(data)
                spark_cache[key] = {
                    "cover":   _first(info, "poster_url", "video_cover_url", "cover_url", "cover"),
                    "preview": _first(info, "preview_url", "embed_url", "share_url", "play_url"),
                }
            else:
                spark_cache[key] = {"cover": "", "preview": ""}
            time.sleep(0.1)
        res = spark_cache[key]
        if res["cover"] or res["preview"]:
            spark_map[aid] = res

    if spark_map:
        log.info(f"   TikTok creativos: {len(spark_map)} Spark Ads (post orgánico) resueltos")

    # ── 4) Ensamblar filas (solo las que tienen al menos una portada) ───────
    out: list[dict] = []
    for aid, m in ad_meta.items():
        cover = ""
        video_url = ""
        media_type = ""
        if m["video_id"] and m["video_id"] in video_map:
            cover = video_map[m["video_id"]]["cover"]
            video_url = video_map[m["video_id"]]["preview"]
            media_type = "video"
        elif m["image_ids"]:
            cover = image_map.get(m["image_ids"][0], "")
            media_type = "image" if cover else ""
        elif aid in spark_map:
            cover = spark_map[aid]["cover"]
            video_url = spark_map[aid]["preview"]
            media_type = "video"  # Spark Ad: video orgánico

        if not cover and not video_url:
            continue  # sin creativo resoluble → el dashboard deja el marcador

        out.append({
            "ad_id":      aid,
            "ad_name":    m["ad_name"],
            "video_id":   m["video_id"],
            "media_type": media_type,
            "cover_url":  cover,
            "video_url":  video_url,
        })

    log.info(
        f"   TikTok creativos: {len(out)}/{len(ad_meta)} anuncios con portada "
        f"({len(video_map)} videos, {len(image_map)} imágenes resueltas)"
    )
    return out
