"""
Extractor: Comentarios de anuncios de Meta — vía INSTAGRAM (Graph API v19.0).

Trae los comentarios reales que la audiencia deja en el post de Instagram de cada
anuncio y los deja listos para loader.upsert("meta_comments", ...). Alimenta la
sección "💬 Comentarios" del modal de creativo en la hoja de Compras.

POR QUÉ SOLO INSTAGRAM (y no Facebook):
Leer el TEXTO de comentarios de un post de Facebook exige el permiso
`pages_read_user_content` con App Review de Meta sobre una app propia — el token
de ads no lo tiene y no es algo que se resuelva marcando una casilla. Instagram,
en cambio, sí se puede leer con `instagram_basic` + `instagram_manage_comments`
(que el token de sistema ya tiene) sobre la propia cuenta. Por eso arrancamos con
IG, que además concentra la mayor parte de la interacción.

Requisito de token: META_ACCESS_TOKEN debe incluir `instagram_basic` +
`instagram_manage_comments`. Si no, la API responde con error de permiso; el
cortacircuitos de abajo aborta la extracción sin tumbar el ETL (best-effort).

SENTIMIENTO: reutilizamos `score_sentiment` del extractor de TikTok (heurística
de léxico en español, transparente y claramente NUESTRA — no es dato de Meta).

Doc: GET /{ig-media-id}/comments?fields=id,text,username,timestamp,like_count
"""

import os
import logging
import time
import requests

from .tiktok_comments import score_sentiment

log = logging.getLogger(__name__)

BASE_URL = f"https://graph.facebook.com/{os.environ.get('META_GRAPH_VERSION', 'v19.0')}"

COMMENT_FIELDS = "id,text,username,timestamp,like_count"
PAGE_LIMIT = 50            # comentarios por página
MAX_PAGES_PER_MEDIA = 20   # tope defensivo (1.000 comentarios por post)
PAGE_PAUSE = 0.15          # pausa entre páginas del mismo post
MEDIA_PAUSE = 0.2          # pausa entre posts
# Errores de PERMISO de Meta: si el primer post ya los da, no tiene sentido
# seguir pidiendo el resto — abortamos la extracción de comentarios de una vez.
PERM_ERROR_CODES = {10, 190, 200, 2500, 2069032}
# Errores TRANSITORIOS / rate-limit: reintentamos con backoff.
TRANSIENT_CODES = {1, 2, 4, 17, 32, 341, 613}
MAX_RETRIES = 2


def _str(v) -> str:
    return "" if v is None else str(v).strip()


def _int(v) -> int:
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


def _api_get(url: str, params: dict) -> tuple[dict | None, dict | None]:
    """
    GET a Graph API. Devuelve (json, error). `error` es el dict de error de Meta
    si lo hubo (con 'code'), o None si salió bien. Reintenta los transitorios.
    Nunca lanza: best-effort.
    """
    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = requests.get(url, params=params, timeout=30)
            body = resp.json() if resp.content else {}
        except Exception as e:                       # red/timeout/JSON inválido
            if attempt < MAX_RETRIES:
                time.sleep(1.5 * (attempt + 1))
                continue
            return None, {"code": -1, "message": str(e)}
        err = body.get("error") if isinstance(body, dict) else None
        if err:
            code = err.get("code")
            if code in TRANSIENT_CODES and attempt < MAX_RETRIES:
                time.sleep(1.5 * (attempt + 1))
                continue
            return None, err
        return body, None
    return None, {"code": -1, "message": "sin respuesta"}


def extract_meta_comments(access_token: str, creatives: list[dict]) -> list[dict]:
    """
    Recorre los creativos que traen `instagram_media_id` y baja los comentarios
    de cada post de IG. Devuelve filas listas para loader.upsert("meta_comments").
    Best-effort: ante error de permiso aborta limpio; ante transitorio salta ese
    post. Dedup por comment_id (un comentario puede repetirse entre ads que usan
    el mismo post).
    """
    # (ad_id, media_id) únicos; nos quedamos con el ad_name para mostrarlo.
    seen_media: dict[str, dict] = {}
    for c in creatives or []:
        mid = _str(c.get("instagram_media_id"))
        if not mid:
            continue
        # Un mismo media puede estar en varios ads; el primero define ad_id/nombre.
        seen_media.setdefault(mid, {"ad_id": _str(c.get("ad_id")), "ad_name": _str(c.get("ad_name")), "media_id": mid})

    if not seen_media:
        log.info("   Meta comentarios (IG): ningún creativo con instagram_media_id → nada que pedir")
        return []

    by_id: dict[str, dict] = {}   # comment_id → fila (dedup)
    aborted = False
    n_media_ok = 0

    for mid, meta in seen_media.items():
        if aborted:
            break
        url = f"{BASE_URL}/{mid}/comments"
        params = {"fields": COMMENT_FIELDS, "limit": PAGE_LIMIT, "access_token": access_token}
        pages = 0
        while url and pages < MAX_PAGES_PER_MEDIA:
            data, err = _api_get(url, params)
            if err is not None:
                code = err.get("code")
                if code in PERM_ERROR_CODES:
                    log.warning(
                        f"   Meta comentarios (IG): error de permiso ({code}: "
                        f"{err.get('message','')[:80]}) → se omite esta corrida. "
                        f"Revisa que el token tenga instagram_manage_comments."
                    )
                    aborted = True
                else:
                    log.info(f"   Meta comentarios (IG): media {mid} sin datos ({code}) → se salta")
                break
            for it in (data.get("data", []) if data else []):
                cid = _str(it.get("id"))
                if not cid:
                    continue
                content = _str(it.get("text"))
                sentiment, sscore = score_sentiment(content)
                by_id[cid] = {
                    "comment_id":      cid,
                    "ad_id":           meta["ad_id"],
                    "ad_name":         meta["ad_name"],
                    "media_id":        mid,
                    "platform":        "instagram",
                    "author":          _str(it.get("username")),
                    "content":         content,
                    "likes":           _int(it.get("like_count")),
                    "created_at":      _str(it.get("timestamp")) or None,
                    "sentiment":       sentiment,
                    "sentiment_score": sscore,
                }
            pages += 1
            nxt = (data.get("paging", {}) or {}).get("next") if data else None
            url, params = nxt, {}      # el 'next' ya trae el token y cursor
            if url:
                time.sleep(PAGE_PAUSE)
        else:
            pass
        n_media_ok += 1
        time.sleep(MEDIA_PAUSE)

    rows = list(by_id.values())
    pos = sum(1 for r in rows if r["sentiment"] == "positive")
    neg = sum(1 for r in rows if r["sentiment"] == "negative")
    estado = " (abortado: falta permiso)" if aborted else ""
    log.info(
        f"   Meta comentarios (IG): {len(rows)} comentarios en {len(seen_media)} posts "
        f"(+{pos} positivos / -{neg} negativos / {len(rows)-pos-neg} neutrales){estado}"
    )
    return rows
