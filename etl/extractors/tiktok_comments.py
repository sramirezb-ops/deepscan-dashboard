"""
Extractor: Comentarios de anuncios TikTok (TikTok Marketing API v1.3)

Trae los comentarios que la audiencia deja en los anuncios de video (impresión
pagada y Spark Ads) y los deja listos para loader.upsert("tiktok_comments", ...).
Alimenta la hoja "TikTok Ads · Comentarios" del dashboard.

Doc API: https://business-api.tiktok.com/portal/docs?id=1738086301876225
Endpoint: GET /open_api/v1.3/comment/list/
Auth: header "Access-Token: <token>"

PARTICULARIDAD DEL ENDPOINT: NO existe "dame todos los comentarios de la cuenta".
La API obliga a buscar por GRUPO DE ANUNCIOS (search_field=ADGROUP_ID,
search_value=<adgroup_id>). Por eso este extractor recibe la lista de adgroup_ids
(los mismos que ya sacó tiktok_ads.py) e itera grupo por grupo, paginando.

SENTIMIENTO: la API NO devuelve sentimiento. Lo DERIVAMOS aquí con una heurística
transparente de léxico en español (palabras + emojis positivos/negativos, con
manejo simple de negaciones). Es una capa de análisis NUESTRA, claramente
etiquetada — no es una métrica oficial de TikTok ni un dato inventado. Si algún
día se quiere mayor precisión, se reemplaza `score_sentiment` por un modelo sin
tocar nada más.

Igual que tiktok_ads.py / meta_ads.py: una función que devuelve filas (list[dict]).
Best-effort: si la app no tiene permiso de gestión de comentarios, la API
responde code!=0; lo registramos y devolvemos lo resuelto, sin tumbar el ETL.
"""

import json
import logging
import time
import unicodedata
from datetime import date, datetime, timezone
import requests

log = logging.getLogger(__name__)

BASE_URL = "https://business-api.tiktok.com/open_api/v1.3"

PAGE_SIZE = 100          # máximo razonable por página
ADGROUP_PAUSE = 0.2      # pausa entre grupos para no saturar la API
PAGE_PAUSE = 0.15        # pausa entre páginas del mismo grupo
MAX_PAGES_PER_GROUP = 50 # tope defensivo (5.000 comentarios por grupo)

# Códigos del lado de TikTok (510xx) que conviene REINTENTAR, no abandonar:
# 51010 = "Internal Time out" → el backend de TikTok tardó demasiado y cortó.
# Es transitorio y suele resolverse al reintentar con una pequeña espera.
RETRYABLE_CODES = {51010}
MAX_RETRIES = 4          # 1 intento + 3 reintentos por petición
RETRY_BACKOFF = 1.5      # segundos base; crece exponencial (1.5, 3, 6…)

# search_field=ADGROUP_ID se codifica como "2" en la API (ver comment_list.yml).
SEARCH_FIELD_ADGROUP = "ADGROUP_ID"


# ─────────────────────────────────────────────────────────────────────────────
# Sentimiento (heurística de léxico en español) — capa de análisis NUESTRA
# ─────────────────────────────────────────────────────────────────────────────
# Listas compactas y editables. Todo se normaliza sin acentos y en minúsculas
# antes de comparar, así "rápido" y "rapido" cuentan igual.

POS_WORDS = {
    "bueno", "buena", "buenos", "buenas", "buenisimo", "buenisima",
    "excelente", "genial", "encanta", "encanto", "amo", "ame", "amor",
    "gracias", "perfecto", "perfecta", "maravilla", "maravilloso",
    "increible", "hermoso", "hermosa", "lindo", "linda", "bonito", "bonita",
    "mejor", "recomiendo", "recomendado", "recomendable", "calidad",
    "feliz", "contento", "contenta", "satisfecho", "satisfecha",
    "rapido", "rapida", "eficiente", "top", "brutal", "espectacular",
    "wow", "divino", "exito", "util", "funciona", "sirve", "vale",
    "gusta", "encanto", "bravo", "felicidades", "crack", "capo",
    "fenomenal", "fantastico", "fantastica", "buenazo", "chevere",
    "bacano", "bacana", "espectaculo", "grande", "exitos",
}

NEG_WORDS = {
    "malo", "mala", "malos", "malas", "pesimo", "pesima", "terrible",
    "horrible", "feo", "fea", "odio", "detesto", "estafa", "robo",
    "fraude", "mentira", "engano", "enganho", "basura", "porqueria",
    "decepcion", "decepcionado", "decepcionada", "lento", "lenta",
    "caro", "cara", "carisimo", "carisima", "problema", "problemas",
    "falla", "fallas", "defectuoso", "demora", "tarde", "peor",
    "asco", "asqueroso", "asquerosa", "vergonzoso", "vergonzosa",
    "ridiculo", "ridicula", "perdida", "spam", "horrendo", "horrenda",
    "nefasto", "nefasta", "pesimos", "pesimas", "incumplen", "incumplido",
}

# Negadores: si aparecen justo antes de una palabra positiva, invierten su signo
# ("no sirve", "no funciona", "no recomiendo", "nunca mas").
NEGATORS = {"no", "nunca", "jamas", "tampoco", "ni", "sin"}

# Emojis frecuentes con carga clara (se cuentan aunque el texto sea solo emoji).
POS_EMOJI = {"\U0001F60D", "❤", "\U0001F970", "\U0001F618", "\U0001F44F",
             "\U0001F525", "\U0001F4AF", "\U0001F44D", "\U0001F64C", "\U0001F496",
             "\U0001F601", "\U0001F600", "\U0001F929", "\U0001F495"}
NEG_EMOJI = {"\U0001F621", "\U0001F92C", "\U0001F44E", "\U0001F4A9", "\U0001F620",
             "\U0001F92E", "\U0001F624", "\U0001F612", "\U0001F629", "\U0001F622",
             "\U0001F62D", "\U0001F644"}


def _strip_accents(s: str) -> str:
    """quita acentos para que 'rápido' y 'rapido' cuenten igual."""
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


def score_sentiment(text: str) -> tuple[str, float]:
    """
    Heurística transparente de sentimiento en español.
    Devuelve (label, score) con label ∈ {'positive','neutral','negative'} y
    score ∈ [-1, 1]. Sin dependencias externas. Nunca lanza.
    """
    if not text:
        return ("neutral", 0.0)

    # Conteo de emojis (sobre el texto crudo, antes de normalizar).
    pos = sum(text.count(e) for e in POS_EMOJI)
    neg = sum(text.count(e) for e in NEG_EMOJI)

    # Tokenización simple sobre texto sin acentos / minúsculas.
    norm = _strip_accents(text.lower())
    tokens = "".join(c if c.isalnum() or c.isspace() else " " for c in norm).split()

    for i, tok in enumerate(tokens):
        prev = tokens[i - 1] if i > 0 else ""
        if tok in POS_WORDS:
            # "no bueno" / "nunca funciona" → invierte a negativo.
            if prev in NEGATORS:
                neg += 1
            else:
                pos += 1
        elif tok in NEG_WORDS:
            # "no malo" es raro; lo dejamos neutralizando (no suma negativo).
            if prev in NEGATORS:
                pos += 0  # ni positivo ni negativo: evita falsos positivos
            else:
                neg += 1

    total = pos + neg
    if total == 0:
        return ("neutral", 0.0)

    score = round((pos - neg) / total, 3)
    if score > 0.05:
        return ("positive", score)
    if score < -0.05:
        return ("negative", score)
    return ("neutral", score)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers de parseo (tolerantes, igual que en tiktok_ads.py)
# ─────────────────────────────────────────────────────────────────────────────

def _int(v) -> int:
    if v in (None, "", "-"):
        return 0
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def _str(v) -> str:
    return str(v).strip() if v not in (None, "") else ""


def _created_at(v) -> str | None:
    """
    Normaliza create_time a ISO-8601 (timestamptz). TikTok puede entregarlo como
    epoch en segundos (número/str numérico) o como 'YYYY-MM-DD HH:MM:SS'.
    Devuelve None si no se puede interpretar (la columna queda NULL, honesto).
    """
    if v in (None, "", "-"):
        return None
    s = str(v).strip()
    # epoch en segundos
    if s.isdigit():
        try:
            return datetime.fromtimestamp(int(s), tz=timezone.utc).isoformat()
        except (ValueError, OSError, OverflowError):
            return None
    # 'YYYY-MM-DD HH:MM:SS' o ISO
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s[:19], fmt).replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    return None


def _api_get(url: str, headers: dict, params: dict) -> dict | None:
    """GET tolerante con reintentos: devuelve data dict, o None si tras agotar
    los reintentos la API sigue en error (permiso, parámetro o red).

    Los timeouts internos de TikTok (code 51010) y los fallos de red se
    reintentan con backoff exponencial; los errores no recuperables (p.ej. falta
    de permiso) se devuelven como None de una vez, sin gastar reintentos."""
    last = "sin detalle"
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, headers=headers, params=params, timeout=60)
            resp.raise_for_status()
            payload = resp.json()
        except Exception as e:
            last = f"red: {e}"
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_BACKOFF * (2 ** attempt))
                continue
            break

        code = payload.get("code")
        if code == 0:
            return payload.get("data", {}) or {}

        # Error transitorio del lado de TikTok → reintentar con espera creciente.
        if code in RETRYABLE_CODES and attempt < MAX_RETRIES - 1:
            log.warning(
                f"   TikTok comentarios: code={code} msg={payload.get('message')} "
                f"→ reintento {attempt + 1}/{MAX_RETRIES - 1}"
            )
            time.sleep(RETRY_BACKOFF * (2 ** attempt))
            last = f"code={code} msg={payload.get('message')}"
            continue

        # Error no recuperable (o ya agotados los reintentos del 51010).
        log.warning(
            f"   TikTok comentarios: {url} code={code} msg={payload.get('message')}"
        )
        return None

    log.warning(f"   TikTok comentarios: agotados los reintentos en {url} ({last})")
    return None


def extract_tiktok_comments(
    access_token: str,
    advertiser_id: str,
    adgroup_ids: list[str],
    date_from: date,
    date_to: date,
) -> list[dict]:
    """
    Extrae los comentarios de los anuncios del rango, buscando grupo por grupo.
    Devuelve filas listas para loader.upsert("tiktok_comments", ...). El campo
    `sentiment` lo derivamos nosotros (ver score_sentiment). Nunca lanza:
    best-effort, si la API niega permiso devuelve lo que se haya podido traer.
    """
    headers = {"Access-Token": access_token}
    uniq = sorted({str(a).strip() for a in adgroup_ids if str(a).strip()})
    if not uniq:
        log.info("   TikTok comentarios: no hay adgroup_ids → nada que pedir")
        return []

    url = f"{BASE_URL}/comment/list/"
    # La API espera 'YYYY-MM-DD HH:MM:SS' (convención de la Ads Management API).
    start_time = f"{date_from.isoformat()} 00:00:00"
    end_time = f"{date_to.isoformat()} 23:59:59"

    by_id: dict[str, dict] = {}   # comment_id → fila (dedup entre grupos/páginas)

    for adgroup_id in uniq:
        page = 1
        total_pages = 1
        while page <= total_pages and page <= MAX_PAGES_PER_GROUP:
            # NO pedimos sort_field=LIKES: ordenar todos los comentarios por
            # likes en una ventana de 30 días hace que el backend de TikTok se
            # quede sin tiempo (code 51010). Usamos su orden por defecto (más
            # barato) y reordenamos por likes en la hoja del dashboard.
            data = _api_get(url, headers, {
                "advertiser_id": advertiser_id,
                "start_time":    start_time,
                "end_time":      end_time,
                "search_field":  SEARCH_FIELD_ADGROUP,
                "search_value":  adgroup_id,
                "comment_type":  json.dumps(["ALL"]),
                "comment_status": json.dumps(["ALL"]),
                "page":          page,
                "page_size":     PAGE_SIZE,
            })
            if data is None:
                break  # este grupo no resolvió (permiso/red) → siguiente

            page_info = data.get("page_info", {}) or {}
            total_pages = int(page_info.get("total_page", 1) or 1)

            # La API puede entregar la lista como 'comments' o 'comment_list'.
            items = data.get("comments")
            if items is None:
                items = data.get("comment_list", [])

            for it in items or []:
                cid = _str(it.get("comment_id"))
                if not cid:
                    continue
                content = _str(it.get("content"))
                sentiment, score = score_sentiment(content)
                by_id[cid] = {
                    "comment_id":     cid,
                    "ad_id":          _str(it.get("ad_id")),
                    "ad_name":        _str(it.get("ad_name")),
                    "adgroup_id":     _str(it.get("adgroup_id")) or adgroup_id,
                    "adgroup_name":   _str(it.get("adgroup_name")),
                    "campaign_id":    _str(it.get("campaign_id")),
                    "campaign_name":  _str(it.get("campaign_name")),
                    "author":         _str(it.get("user_name")),
                    "author_avatar":  _str(it.get("user_avatar_url")),
                    "content":        content,
                    "likes":          _int(it.get("likes")),
                    "replies":        _int(it.get("replies")),
                    "comment_type":   _str(it.get("comment_type")),
                    "comment_status": _str(it.get("comment_status")),
                    "created_at":     _created_at(it.get("create_time")),
                    "sentiment":      sentiment,
                    "sentiment_score": score,
                }

            page += 1
            if page <= total_pages and page <= MAX_PAGES_PER_GROUP:
                time.sleep(PAGE_PAUSE)
        time.sleep(ADGROUP_PAUSE)

    rows = list(by_id.values())
    pos = sum(1 for r in rows if r["sentiment"] == "positive")
    neg = sum(1 for r in rows if r["sentiment"] == "negative")
    log.info(
        f"   TikTok comentarios: {len(rows)} comentarios de {len(uniq)} grupos "
        f"(+{pos} positivos / -{neg} negativos / {len(rows)-pos-neg} neutrales)"
    )
    return rows
