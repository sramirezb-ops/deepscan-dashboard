"""
Extractor: Instagram Orgánico (Instagram Graph API)
====================================================
Trae lo "orgánico" de la cuenta de Instagram Business — NO anuncios:
  • Snapshot de la cuenta (seguidores, seguidos, # publicaciones).
  • Insights diarios de la cuenta: alcance, visitas al perfil, seguidores nuevos.
  • Publicaciones recientes (posts / reels / carruseles) con su engagement real:
    likes, comentarios, alcance, guardados, compartidos.

Reutiliza el MISMO token de Meta que el resto de extractores (META_ACCESS_TOKEN).
La única diferencia es que necesita permisos de Instagram:
  instagram_basic, instagram_manage_insights, pages_read_engagement.

Descubre solo la cuenta de Instagram Business detrás de la(s) Página(s) de
Facebook conectada(s); no hay que configurar IDs a mano.

Devuelve dos listas de filas:
  • account_daily  → tabla ig_account_daily  (1 fila por día)
  • media          → tabla ig_media          (1 fila por publicación)
"""

from __future__ import annotations

import logging
import time
from datetime import date
import requests

log = logging.getLogger(__name__)

BASE_URL = "https://graph.facebook.com/v19.0"

# Métricas de cuenta a nivel día. Son las clásicas y estables en v19.
ACCOUNT_DAY_METRICS = ["reach", "profile_views", "follower_count"]

# Campos de cada publicación (lo que NO necesita el endpoint /insights).
MEDIA_FIELDS = (
    "id,caption,media_type,media_product_type,media_url,thumbnail_url,"
    "permalink,timestamp,like_count,comments_count"
)

# Insights por publicación. Distintos tipos de media soportan distintas
# métricas, así que pedimos un set amplio y degradamos si la API se queja.
MEDIA_INSIGHT_METRICS = ["reach", "saved", "shares", "total_interactions"]
MEDIA_INSIGHT_FALLBACK = ["reach", "saved"]


def _graph_get(path: str, params: dict) -> dict:
    """GET a Graph API con manejo de errores legible."""
    url = f"{BASE_URL}/{path}"
    resp = requests.get(url, params=params)
    if resp.status_code != 200:
        # Mensaje de la API (incluye códigos de permiso #10/#100/#200).
        try:
            err = resp.json().get("error", {})
            msg = f"{err.get('message')} (code={err.get('code')}, type={err.get('type')})"
        except Exception:
            msg = resp.text[:300]
        raise RuntimeError(f"Graph API {resp.status_code}: {msg}")
    return resp.json()


def _discover_ig_account(
    access_token: str,
    page_ids: list[str] | None = None,
    ig_account_id: str | None = None,
) -> dict:
    """
    Devuelve {"id", "username"} de la cuenta de Instagram Business.

    Orden de descubrimiento:
      1. ig_account_id explícito (env META_IG_ACCOUNT_ID) → se valida.
      2. /me/accounts → primera Página con instagram_business_account.
      3. Cada page_id recibido → su instagram_business_account.
    """
    # 1. ID explícito
    if ig_account_id:
        data = _graph_get(ig_account_id, {
            "fields": "id,username,followers_count",
            "access_token": access_token,
        })
        return {"id": data.get("id"), "username": data.get("username", "")}

    # 2. /me/accounts (token de usuario / system user con páginas)
    try:
        data = _graph_get("me/accounts", {
            "fields": "name,instagram_business_account{id,username}",
            "limit": 100,
            "access_token": access_token,
        })
        for page in data.get("data", []):
            iga = page.get("instagram_business_account")
            if iga and iga.get("id"):
                return {"id": iga["id"], "username": iga.get("username", "")}
    except Exception as e:
        log.warning(f"   Instagram: /me/accounts no devolvió páginas ({e})")

    # 3. Páginas conocidas del ad account
    for pid in (page_ids or []):
        try:
            data = _graph_get(pid, {
                "fields": "instagram_business_account{id,username}",
                "access_token": access_token,
            })
            iga = data.get("instagram_business_account")
            if iga and iga.get("id"):
                return {"id": iga["id"], "username": iga.get("username", "")}
        except Exception as e:
            log.warning(f"   Instagram: página {pid} sin IG accesible ({e})")

    raise RuntimeError(
        "No se encontró ninguna cuenta de Instagram Business. Verifica que el "
        "token tenga permisos instagram_basic + instagram_manage_insights y que "
        "la Página tenga un Instagram profesional vinculado."
    )


def _account_snapshot(access_token: str, ig_id: str) -> dict:
    data = _graph_get(ig_id, {
        "fields": "username,followers_count,follows_count,media_count",
        "access_token": access_token,
    })
    return {
        "username":        data.get("username", ""),
        "followers_count": int(data.get("followers_count", 0) or 0),
        "follows_count":   int(data.get("follows_count", 0) or 0),
        "media_count":     int(data.get("media_count", 0) or 0),
    }


def _account_daily(
    access_token: str, ig_id: str, date_from: date, date_to: date
) -> dict[str, dict]:
    """
    Mapa fecha(YYYY-MM-DD) → {reach, profile_views, new_followers}.
    Cada métrica viene como serie diaria; se cruzan por end_time.
    """
    by_date: dict[str, dict] = {}
    try:
        data = _graph_get(f"{ig_id}/insights", {
            "metric":       ",".join(ACCOUNT_DAY_METRICS),
            "period":       "day",
            "since":        str(date_from),
            "until":        str(date_to),
            "access_token": access_token,
        })
    except Exception as e:
        log.warning(f"   Instagram: insights de cuenta no disponibles ({e})")
        return by_date

    field_map = {
        "reach":          "reach",
        "profile_views":  "profile_views",
        "follower_count": "new_followers",
    }
    for metric in data.get("data", []):
        col = field_map.get(metric.get("name", ""))
        if not col:
            continue
        for v in metric.get("values", []):
            end = (v.get("end_time", "") or "")[:10]
            if not end:
                continue
            row = by_date.setdefault(end, {"reach": 0, "profile_views": 0, "new_followers": 0})
            row[col] = int(v.get("value", 0) or 0)
    return by_date


def _media_insights(access_token: str, media_id: str) -> dict:
    """Insights de una publicación; degrada si la métrica no aplica al tipo."""
    for metrics in (MEDIA_INSIGHT_METRICS, MEDIA_INSIGHT_FALLBACK):
        try:
            data = _graph_get(f"{media_id}/insights", {
                "metric":       ",".join(metrics),
                "access_token": access_token,
            })
            out = {}
            for m in data.get("data", []):
                vals = m.get("values", [])
                out[m.get("name")] = int(vals[0].get("value", 0)) if vals else 0
            return out
        except Exception:
            continue
    return {}


def _fetch_media(
    access_token: str, ig_id: str, max_posts: int = 50
) -> list[dict]:
    """Trae las publicaciones más recientes con su engagement por publicación."""
    rows: list[dict] = []
    url = f"{BASE_URL}/{ig_id}/media"
    params = {
        "fields":       MEDIA_FIELDS,
        "limit":        50,
        "access_token": access_token,
    }
    fetched = 0
    page = 0
    while url and fetched < max_posts:
        page += 1
        # En la 1ª página pasamos params; el `next` ya los lleva embebidos.
        resp = requests.get(url, params=params if page == 1 else {})
        if resp.status_code != 200:
            try:
                err = resp.json().get("error", {})
                raise RuntimeError(f"{err.get('message')} (code={err.get('code')})")
            except Exception as e:
                raise RuntimeError(f"Graph media error: {e}")
        data = resp.json()

        for m in data.get("data", []):
            mid = m.get("id")
            if not mid:
                continue
            ins = _media_insights(access_token, mid)
            likes    = int(m.get("like_count", 0) or 0)
            comments = int(m.get("comments_count", 0) or 0)
            saved    = int(ins.get("saved", 0) or 0)
            shares   = int(ins.get("shares", 0) or 0)
            reach    = int(ins.get("reach", 0) or 0)
            interactions = int(ins.get("total_interactions", 0) or 0) or (
                likes + comments + saved + shares
            )
            eng_rate = round(interactions / reach, 4) if reach > 0 else 0.0

            rows.append({
                "media_id":           mid,
                "timestamp":          (m.get("timestamp", "") or "")[:10],
                "media_type":         m.get("media_type", ""),
                "media_product_type": m.get("media_product_type", ""),
                "caption":            (m.get("caption", "") or "")[:500],
                "permalink":          m.get("permalink", ""),
                "thumbnail_url":      m.get("thumbnail_url") or m.get("media_url") or "",
                "like_count":         likes,
                "comments_count":     comments,
                "saved":              saved,
                "shares":             shares,
                "reach":              reach,
                "interactions":       interactions,
                "engagement_rate":    eng_rate,
            })
            fetched += 1
            if fetched >= max_posts:
                break

        nxt = data.get("paging", {}).get("next")
        url = nxt
        if nxt:
            time.sleep(0.3)

    return rows


def extract_instagram_organic(
    access_token: str,
    date_from: date,
    date_to: date,
    page_ids: list[str] | None = None,
    ig_account_id: str | None = None,
    max_posts: int = 50,
) -> dict:
    """
    Punto de entrada. Devuelve:
      {
        "account_daily": [ {date, username, followers_count, follows_count,
                            media_count, reach, profile_views, new_followers}, ... ],
        "media":         [ {media_id, timestamp, media_type, ...}, ... ],
        "ig_username":   str,
      }
    El snapshot de seguidores (followers_count) es un valor "hoy", se graba en
    la fila del último día del rango para tener la serie de crecimiento real.
    """
    ig = _discover_ig_account(access_token, page_ids, ig_account_id)
    ig_id = ig["id"]
    log.info(f"   Instagram: cuenta @{ig['username']} (id={ig_id})")

    snap = _account_snapshot(access_token, ig_id)
    daily_map = _account_daily(access_token, ig_id, date_from, date_to)

    last_day = str(date_to)
    account_daily = []
    for day, vals in sorted(daily_map.items()):
        account_daily.append({
            "date":            day,
            "username":        snap["username"],
            # El snapshot total solo es válido "hoy"; se escribe en el último día.
            "followers_count": snap["followers_count"] if day == last_day else 0,
            "follows_count":   snap["follows_count"]   if day == last_day else 0,
            "media_count":     snap["media_count"]     if day == last_day else 0,
            "reach":           vals.get("reach", 0),
            "profile_views":   vals.get("profile_views", 0),
            "new_followers":   vals.get("new_followers", 0),
        })

    # Si la API de insights no devolvió series pero sí tenemos snapshot,
    # garantizamos al menos la fila de hoy con los seguidores totales.
    if not any(r["date"] == last_day for r in account_daily):
        account_daily.append({
            "date":            last_day,
            "username":        snap["username"],
            "followers_count": snap["followers_count"],
            "follows_count":   snap["follows_count"],
            "media_count":     snap["media_count"],
            "reach":           0,
            "profile_views":   0,
            "new_followers":   0,
        })

    try:
        media = _fetch_media(access_token, ig_id, max_posts=max_posts)
    except Exception as e:
        log.warning(f"   Instagram: no se pudieron traer publicaciones ({e})")
        media = []

    log.info(
        f"   Instagram Orgánico: {len(account_daily)} días de cuenta, "
        f"{len(media)} publicaciones"
    )
    return {
        "account_daily": account_daily,
        "media":         media,
        "ig_username":   snap["username"],
    }
