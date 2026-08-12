"""
Extractor: Meta Ads API (Facebook Marketing API)
Nivel: anuncio (ad) por día — el más granular disponible
Métricas clave para ecommerce: spend, purchases, purchase_value, ROAS, add_to_cart, etc.
"""

from __future__ import annotations

import json
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
    "spend",
    "impressions", "clicks", "reach",
    "ctr", "cpm", "frequency",
    "actions",
    "action_values",
    # Video (para tasa de retención / hold rate por anuncio)
    "video_thruplay_watched_actions",
    "video_p100_watched_actions",
    "video_avg_time_watched_actions",
])


def _get_action(actions: list, action_type: str) -> float:
    if not actions:
        return 0.0
    for a in actions:
        if a.get("action_type") == action_type:
            return float(a.get("value", 0))
    return 0.0


def _get_video(row: dict, field: str) -> float:
    """Los campos de video llegan como lista [{action_type, value}]. Toma el valor."""
    v = row.get(field)
    if isinstance(v, list) and v:
        return float(v[0].get("value", 0) or 0)
    if isinstance(v, (int, float, str)) and v not in ("", None):
        try:
            return float(v)
        except (TypeError, ValueError):
            return 0.0
    return 0.0


# Campos para el desglose por plataforma (Facebook / Instagram / etc.).
# A nivel campaña para poder mostrar qué campañas corren en cada plataforma.
PLATFORM_FIELDS = ",".join([
    "campaign_name",
    "spend",
    "impressions", "clicks", "reach",
    "ctr",
    "actions",
    "action_values",
])


def extract_meta_platform(
    access_token: str,
    ad_account_id: str,
    date_from: date,
    date_to: date
) -> list[dict]:
    """
    Extrae Meta Ads DESGLOSADO por plataforma de publicación
    (publisher_platform: facebook / instagram / messenger / audience_network),
    a nivel campaña × plataforma × día. Alimenta la tabla `meta_platform`,
    que es lo que la vista Instagram lee filtrando publisher_platform='instagram'.

    Reutiliza el mismo token y cuenta que extract_meta_ads: no requiere
    credenciales nuevas, solo el parámetro breakdowns=publisher_platform.
    """
    params = {
        "level":          "campaign",
        "fields":         PLATFORM_FIELDS,
        "breakdowns":     "publisher_platform",
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

            spend = float(r.get("spend", 0) or 0)
            roas  = round(purchase_value / spend, 4) if spend > 0 else 0

            rows.append({
                "date":               r.get("date_start", ""),
                "publisher_platform": r.get("publisher_platform", ""),
                "campaign_name":      r.get("campaign_name", ""),
                "spend":              spend,
                "impressions":        int(r.get("impressions", 0) or 0),
                "clicks":             int(r.get("clicks", 0) or 0),
                "reach":              int(r.get("reach", 0) or 0),
                "ctr":                float(r.get("ctr", 0) or 0),
                "purchases":          purchases,
                "purchase_value":     purchase_value,
                "roas":               roas,
            })

        paging = data.get("paging", {})
        next_url = paging.get("next")
        url = next_url if next_url else None
        params = {}

        if next_url:
            time.sleep(0.3)

    log.info(f"   Meta Platform: {len(rows)} filas ({page} páginas)")
    return rows


# ── BREAKDOWNS (plataforma / segmento) por conjunto o anuncio ──
def extract_meta_breakdown(
    access_token: str,
    ad_account_id: str,
    date_from: date,
    date_to: date,
    level: str = "adset",          # 'adset' o 'ad'
    breakdown: str = "publisher_platform",  # 'publisher_platform' o 'user_segment_key'
) -> list[dict]:
    """
    Insights de Meta desglosados por `breakdown` a nivel `level`, agregados en
    el período (sin time_increment: una fila por entidad × valor de breakdown).
    Alimenta la tabla `meta_breakdowns`, que la hoja de Compras usa para:
      - Segmentos de público (breakdown=user_segment_key)  → nuevos/activos/existing
      - Rendimiento por plataforma (breakdown=publisher_platform) → FB/IG…
    a nivel conjunto y a nivel anuncio (para el modal por creativo).
    """
    ent = "adset_name,adset_id" if level == "adset" else "ad_name,ad_id,adset_name"
    fields = f"campaign_name,{ent},spend,impressions,reach,actions,action_values"
    params = {
        "level":        level,
        "fields":       fields,
        "breakdowns":   breakdown,
        "time_range":   f'{{"since":"{date_from}","until":"{date_to}"}}',
        "limit":        500,
        "access_token": access_token,
    }
    url = f"{BASE_URL}/act_{ad_account_id}/insights"
    rows, page = [], 0
    while url:
        page += 1
        resp = requests.get(url, params=params if page == 1 else {})
        resp.raise_for_status()
        data = resp.json()
        for r in data.get("data", []):
            actions = r.get("actions", []); avals = r.get("action_values", [])
            spend = float(r.get("spend", 0) or 0)
            rows.append({
                "level":            level,
                "breakdown_type":   breakdown,
                "breakdown_value":  r.get(breakdown, "") or "unknown",
                "campaign_name":    r.get("campaign_name", ""),
                "entity_name":      r.get("adset_name" if level == "adset" else "ad_name", ""),
                "entity_id":        r.get("adset_id" if level == "adset" else "ad_id", ""),
                "adset_name":       r.get("adset_name", ""),
                "spend":            round(spend, 2),
                "impressions":      int(r.get("impressions", 0) or 0),
                "reach":            int(r.get("reach", 0) or 0),
                "purchases":        _get_action(actions, "purchase"),
                "purchase_value":   _get_action(avals,   "purchase"),
                "add_to_cart":      _get_action(actions, "add_to_cart"),
                "initiate_checkout": _get_action(actions, "initiate_checkout"),
                "landing_page_views": _get_action(actions, "landing_page_view"),
                "link_clicks":      _get_action(actions, "link_click"),
            })
        nxt = data.get("paging", {}).get("next")
        url = nxt; params = {}
        if nxt: time.sleep(0.3)
    log.info(f"   Meta Breakdown {level}×{breakdown}: {len(rows)} filas")
    return rows


# ── UBICACIÓN / FORMATO por anuncio (Feed / Reels / Stories · FB/IG) ─
# El endpoint de insights (v19) RECHAZA platform_position solo → hay que pedirlo
# emparejado con publisher_platform. Combinamos ambos en un label legible y lo
# guardamos en meta_breakdowns con breakdown_type='platform_position'.
_PUB_LABEL = {
    "facebook": "Facebook", "instagram": "Instagram", "messenger": "Messenger",
    "audience_network": "Audience Network", "threads": "Threads",
}
_POS_LABEL = {
    "feed": "Feed", "profile_feed": "Feed perfil",
    "facebook_reels": "Reels", "instagram_reels": "Reels", "reels": "Reels",
    "story": "Stories", "instagram_stories": "Stories", "facebook_stories": "Stories",
    "instagram_explore": "Explorar", "instagram_explore_grid_home": "Explorar",
    "instagram_search": "Búsqueda", "right_hand_column": "Columna derecha",
    "marketplace": "Marketplace", "video_feeds": "Video feed",
    "instream_video": "Video in-stream", "facebook_reels_overlay": "Reels overlay",
    "instagram_profile_reels": "Reels perfil", "instagram_reels_overlay": "Reels overlay",
    "an_classic": "Audience Network", "rewarded_video": "Video con premio",
    "search": "Búsqueda", "instagram_shop": "Shop", "biz_disco_feed": "Descubrimiento",
}


def _placement_label(pub: str, pos: str) -> str:
    p  = _PUB_LABEL.get((pub or "").lower(), (pub or "otros").title())
    q  = _POS_LABEL.get((pos or "").lower(), (pos or "otros").replace("_", " ").title())
    return f"{p} · {q}"


def extract_meta_placement(
    access_token: str,
    ad_account_id: str,
    date_from: date,
    date_to: date,
) -> list:
    """Ubicación/formato por anuncio, pidiendo publisher_platform + platform_position
    JUNTOS (Meta rechaza platform_position solo). Alimenta meta_breakdowns con
    breakdown_type='platform_position' y breakdown_value = label combinado."""
    fields = "campaign_name,ad_name,ad_id,adset_name,spend,impressions,reach,actions,action_values"
    params = {
        "level":        "ad",
        "fields":       fields,
        "breakdowns":   "publisher_platform,platform_position",
        "time_range":   f'{{"since":"{date_from}","until":"{date_to}"}}',
        "limit":        500,
        "access_token": access_token,
    }
    url = f"{BASE_URL}/act_{ad_account_id}/insights"
    rows, page = [], 0
    while url:
        page += 1
        resp = requests.get(url, params=params if page == 1 else {})
        if not resp.ok:
            log.error(f"   placement HTTP {resp.status_code}: {resp.text[:250]}")
        resp.raise_for_status()
        data = resp.json()
        for r in data.get("data", []):
            actions = r.get("actions", []); avals = r.get("action_values", [])
            rows.append({
                "level":              "ad",
                "breakdown_type":     "platform_position",
                "breakdown_value":    _placement_label(r.get("publisher_platform", ""),
                                                        r.get("platform_position", "")),
                "campaign_name":      r.get("campaign_name", ""),
                "entity_name":        r.get("ad_name", ""),
                "entity_id":          r.get("ad_id", ""),
                "adset_name":         r.get("adset_name", ""),
                "spend":              round(float(r.get("spend", 0) or 0), 2),
                "impressions":        int(r.get("impressions", 0) or 0),
                "reach":              int(r.get("reach", 0) or 0),
                "purchases":          _get_action(actions, "purchase"),
                "purchase_value":     _get_action(avals,   "purchase"),
                "add_to_cart":        _get_action(actions, "add_to_cart"),
                "initiate_checkout":  _get_action(actions, "initiate_checkout"),
                "landing_page_views": _get_action(actions, "landing_page_view"),
                "link_clicks":        _get_action(actions, "link_click"),
            })
        url = data.get("paging", {}).get("next"); params = {}
        if url:
            time.sleep(0.3)
    log.info(f"   Meta Placement ad×(pub+pos): {len(rows)} filas")
    return rows


# ── CATÁLOGO: entrega por producto + salud del feed ─────────────────
# Meta NO expone compras por producto (confirmado hasta nivel campaña).
# Lo que sí da: la ENTREGA por producto (gasto/impresiones) vía breakdown
# product_id. En la vista de Compras cruzamos eso con las ventas reales de
# Shopify (shopify_products) → "Meta empuja ↔ Shopify vende".
_OOS_VALS = {"out of stock", "out_of_stock", "oos", "discontinued"}


def _fetch_catalog_products(access_token: str, catalog_id: str) -> dict:
    """Mapa {product_id → {name, retailer_id, availability, has_image}} del catálogo.
    Sirve para (a) ponerle nombre a la entrega por product_id y (b) contar salud."""
    fields = "id,name,retailer_id,availability,image_url"
    url = f"{BASE_URL}/{catalog_id}/products"
    params = {"fields": fields, "limit": 200, "access_token": access_token}
    out, page = {}, 0
    while url:
        page += 1
        resp = requests.get(url, params=params if page == 1 else {})
        if not resp.ok:
            log.error(f"   catálogo /products HTTP {resp.status_code}: {resp.text[:280]}")
        resp.raise_for_status()
        data = resp.json()
        for p in data.get("data", []):
            pid = str(p.get("id", "") or "")
            if not pid:
                continue
            out[pid] = {
                "name":         p.get("name", "") or "",
                "retailer_id":  p.get("retailer_id", "") or "",
                "availability": (p.get("availability", "") or "").strip().lower(),
                "has_image":    bool(p.get("image_url")),
            }
        url = data.get("paging", {}).get("next"); params = {}
        if url:
            time.sleep(0.3)
    log.info(f"   Catálogo {catalog_id}: {len(out)} productos")
    return out


def extract_meta_catalog_products(
    access_token: str,
    ad_account_id: str,
    catalog_id: str,
    date_from: str,
    date_to: str,
    prod_map: dict | None = None,
) -> list:
    """Entrega (gasto/impresiones) por producto de catálogo. El breakdown product_id
    de insights devuelve el valor como '<retailer_id>, <NOMBRE>', así que el nombre
    sale directo del insight (NO depende de leer el feed del catálogo, que puede estar
    bloqueado por permisos del token). Agrega por NOMBRE para sumar variantes y cruzar
    con Shopify por título. `prod_map` (opcional) solo enriquece con disponibilidad."""
    ravail = {v.get("retailer_id", ""): v.get("availability", "")
              for v in (prod_map or {}).values() if v.get("retailer_id")}
    params = {
        "level":        "account",
        "fields":       "spend,impressions",
        "breakdowns":   "product_id",
        "time_range":   f'{{"since":"{date_from}","until":"{date_to}"}}',
        "limit":        500,
        "access_token": access_token,
    }
    url = f"{BASE_URL}/act_{ad_account_id}/insights"
    agg: dict = {}   # name → {spend, impr, retailer_id, availability}
    page = 0
    while url:
        page += 1
        resp = requests.get(url, params=params if page == 1 else {})
        if not resp.ok:
            log.error(f"   catálogo product_id HTTP {resp.status_code}: {resp.text[:250]}")
        resp.raise_for_status()
        data = resp.json()
        for r in data.get("data", []):
            raw = str(r.get("product_id", "") or "").strip()
            if not raw or raw.lower() == "unknown":
                continue
            # formato '<retailer_id>, <NOMBRE>'  (p.ej. '42923391352868, TENIS JORDAN 3…')
            rid, name = raw.split(", ", 1) if ", " in raw else ("", raw)
            name = name.strip()
            if not name:
                continue
            a = agg.setdefault(name, {"spend": 0.0, "impr": 0, "retailer_id": rid,
                                      "availability": ravail.get(rid, "")})
            a["spend"] += float(r.get("spend", 0) or 0)
            a["impr"]  += int(r.get("impressions", 0) or 0)
        url = data.get("paging", {}).get("next"); params = {}
        if url:
            time.sleep(0.3)
    rows = [{
        "product_name": name,
        "retailer_id":  v["retailer_id"],
        "availability": v["availability"],
        "spend":        round(v["spend"], 2),
        "impressions":  v["impr"],
    } for name, v in agg.items()]
    log.info(f"   Meta Catálogo entrega: {len(rows)} productos con pauta")
    return rows


def extract_meta_catalog_health(
    access_token: str,
    catalog_id: str,
    prod_map: dict | None = None,
) -> list:
    """Salud del feed: total, sets, agotados, sin imagen. OOS/sin-imagen se
    derivan de los productos (fiable) en vez del endpoint diagnostics (frágil)."""
    det = requests.get(f"{BASE_URL}/{catalog_id}", params={
        "fields": "product_count,product_set_count", "access_token": access_token})
    det.raise_for_status()
    d = det.json()
    if prod_map is None:
        prod_map = _fetch_catalog_products(access_token, catalog_id)
    oos    = sum(1 for p in prod_map.values() if p["availability"] in _OOS_VALS)
    no_img = sum(1 for p in prod_map.values() if not p["has_image"])
    row = {
        "product_count":     int(d.get("product_count", 0) or 0),
        "product_set_count": int(d.get("product_set_count", 0) or 0),
        "oos_count":         oos,
        "no_image_count":    no_img,
    }
    log.info(f"   Meta Catálogo salud: {row}")
    return [row]


# ── MEDIA DE CREATIVOS (imagen / video / copy) por anuncio ──
def _creative_row(a: dict) -> dict:
    cr = a.get("creative", {}) or {}
    return {
        "ad_id":          a.get("id", ""),
        "ad_name":        a.get("name", ""),
        "adset_name":     (a.get("adset", {}) or {}).get("name", ""),
        "campaign_name":  (a.get("campaign", {}) or {}).get("name", ""),
        # Estado real de entrega del anuncio (ACTIVE / PAUSED / ADSET_PAUSED /
        # DISAPPROVED …). Se trae por ad_id en lotes (fiable en cuentas grandes,
        # a diferencia del edge /ads masivo), así que es un snapshot ACTUAL por
        # corrida del ETL. La vista de WhatsApp lo usa para separar activo/pausado.
        "status":         a.get("effective_status", "") or "",
        "creative_id":    cr.get("id", ""),
        "is_video":       cr.get("object_type") == "VIDEO" or bool(cr.get("video_id")),
        "image_url":      cr.get("image_url", "") or "",
        "thumbnail_url":  cr.get("thumbnail_url", "") or "",
        "video_id":       cr.get("video_id", "") or "",
        "title":          cr.get("title", "") or "",
        "body":           cr.get("body", "") or "",
        "cta":            cr.get("call_to_action_type", "") or "",
        # IDs del post subyacente → permiten leer sus comentarios (IG) por ad.
        "instagram_media_id": cr.get("effective_instagram_media_id", "") or "",
        "fb_post_id":         cr.get("effective_object_story_id", "") or "",
    }


def extract_meta_ad_creatives(
    access_token: str,
    ad_account_id: str,
    ad_ids: list[str] | None = None,
) -> list[dict]:
    """
    Media + copy de creativos. Si se pasan `ad_ids` (los anuncios que corrieron
    con gasto en el período, activos o pausados), pide ESOS por ID en lotes —
    para que el grid de Compras tenga imagen/video en todos, no solo activos.
    Si no, cae al filtro de anuncios ACTIVOS. Guarda URLs (no base64); las URLs
    firmadas de Meta se refrescan en cada corrida diaria del ETL.
    """
    CFIELDS = ("id,name,effective_status,adset{name},campaign{name},"
               "creative{object_type,image_url,thumbnail_url,video_id,title,body,call_to_action_type,"
               "effective_instagram_media_id,effective_object_story_id}")
    rows: list[dict] = []

    ids = sorted({str(a) for a in (ad_ids or []) if a})
    if ids:
        # Pedir por ID en lotes (el batch del edge /ads con filtering ad.id IN).
        BATCH = 50
        for i in range(0, len(ids), BATCH):
            chunk = ids[i:i + BATCH]
            flt = json.dumps([{"field": "ad.id", "operator": "IN", "value": chunk}])
            params = {"fields": CFIELDS, "filtering": flt, "limit": 100, "access_token": access_token}
            url = f"{BASE_URL}/act_{ad_account_id}/ads"
            while url:
                resp = requests.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
                for a in data.get("data", []):
                    rows.append(_creative_row(a))
                url = data.get("paging", {}).get("next"); params = {}
                if url: time.sleep(0.3)
            time.sleep(0.2)
        log.info(f"   Meta creativos: {len(rows)} de {len(ids)} anuncios (por ID)")
        return rows

    # Fallback: solo activos.
    params = {
        "fields":       CFIELDS,
        "filtering":    '[{"field":"ad.effective_status","operator":"IN","value":["ACTIVE"]}]',
        "limit":        200,
        "access_token": access_token,
    }
    url = f"{BASE_URL}/act_{ad_account_id}/ads"
    while url:
        resp = requests.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
        for a in data.get("data", []):
            rows.append(_creative_row(a))
        url = data.get("paging", {}).get("next"); params = {}
        if url: time.sleep(0.3)
    log.info(f"   Meta creativos: {len(rows)} anuncios activos")
    return rows


# ── MENSAJES / CONVERSACIONES ───────────────────────────────
# Campañas de mensajes (optimization_goal = CONVERSATIONS). Métrica real:
# "conversaciones con mensaje iniciadas". El destino (WhatsApp / Messenger /
# Instagram Direct) sale del destination_type del adset, no del publisher_platform.

MESSAGING_OPT_GOAL = "CONVERSATIONS"

# action_types de la API Graph que representan conversaciones iniciadas,
# por orden de preferencia (ventana de atribución 7d primero).
MSG_ACTION_TYPES = [
    "onsite_conversion.messaging_conversation_started_7d",
    "onsite_conversion.messaging_conversation_started",
    "onsite_conversion.total_messaging_connection",
]

# destination_type crudo → etiqueta legible
DEST_LABELS = {
    "WHATSAPP":         "WhatsApp",
    "MESSENGER":        "Messenger",
    "INSTAGRAM_DIRECT": "Instagram Direct",
}


def _fetch_adset_config(access_token: str, ad_account_id: str) -> dict:
    """
    Mapa adset_id → {destination_type, optimization_goal, promoted_object}.
    Es configuración del adset (no depende de fechas), se consulta una vez
    y se cruza luego con los insights por adset_id.
    """
    url = f"{BASE_URL}/act_{ad_account_id}/adsets"
    params = {
        "fields":       "id,destination_type,optimization_goal,promoted_object",
        "limit":        500,
        "access_token": access_token,
    }
    cfg: dict = {}
    page = 0
    while url:
        page += 1
        resp = requests.get(url, params=params if page == 1 else {})
        resp.raise_for_status()
        data = resp.json()
        for a in data.get("data", []):
            cfg[a.get("id")] = {
                "destination_type":  a.get("destination_type", "") or "",
                "optimization_goal": a.get("optimization_goal", "") or "",
                "promoted_object":   a.get("promoted_object", {}) or {},
            }
        next_url = data.get("paging", {}).get("next")
        url = next_url if next_url else None
        params = {}
        if next_url:
            time.sleep(0.3)
    return cfg


def _classify_destination(cfg: dict) -> tuple[str, str]:
    """
    Devuelve (etiqueta_legible, destination_type_crudo).
    Maneja destinos exactos (WHATSAPP / MESSENGER / INSTAGRAM_DIRECT) y los
    combinados de Meta (p.ej. MESSAGING_INSTAGRAM_DIRECT_WHATSAPP), que son
    anuncios de mensajes que ofrecen varias apps; se etiquetan por las apps
    que incluyen, p.ej. "WhatsApp + Instagram Direct".
    """
    dt = (cfg.get("destination_type") or "").upper()

    # destino exacto
    if dt in DEST_LABELS:
        return DEST_LABELS[dt], dt

    # destino combinado de mensajería: construir etiqueta por apps presentes
    if "WHATSAPP" in dt or "MESSENGER" in dt or "INSTAGRAM_DIRECT" in dt:
        parts = []
        if "WHATSAPP" in dt:
            parts.append("WhatsApp")
        if "INSTAGRAM_DIRECT" in dt:
            parts.append("Instagram Direct")
        if "MESSENGER" in dt:
            parts.append("Messenger")
        if parts:
            return " + ".join(parts), dt

    # respaldo: promoted_object con número de WhatsApp ⇒ es WhatsApp
    po = cfg.get("promoted_object") or {}
    if po.get("whatsapp_phone_number") or po.get("whatsapp_number"):
        return "WhatsApp", "WHATSAPP"

    return "Sin clasificar", dt


def _msg_conversations(actions: list) -> float:
    """Primera coincidencia entre los action_types de conversación."""
    for at in MSG_ACTION_TYPES:
        v = _get_action(actions, at)
        if v > 0:
            return v
    return 0.0


def extract_meta_messaging(
    access_token: str,
    ad_account_id: str,
    date_from: date,
    date_to: date
) -> list[dict]:
    """
    Extrae las campañas de MENSAJES desglosadas por destino. Alimenta la tabla
    `meta_messaging`, que la vista "Mensajes" lee y agrega por destino y campaña.

    Estrategia:
      1) Trae la config de los adsets (destination_type + optimization_goal).
      2) Pide insights a nivel adset × día con `actions`.
      3) Se queda solo con adsets de mensajería (optimization_goal=CONVERSATIONS
         o que registren conversaciones reales), clasifica el destino y calcula
         el costo por conversación. No inventa: si no hay conversaciones, queda 0.
    """
    cfg_map = _fetch_adset_config(access_token, ad_account_id)

    params = {
        "level":          "adset",
        "fields":         "campaign_name,adset_id,adset_name,spend,actions",
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
            conversations = _msg_conversations(actions)
            adset_id      = r.get("adset_id", "")
            cfg           = cfg_map.get(adset_id)

            # Solo campañas de MENSAJES (optimization_goal = CONVERSATIONS).
            # Esto excluye campañas de visitas al perfil, web/compras, etc. que
            # podrían registrar alguna conexión de mensajería de forma incidental.
            if cfg is None:
                # Sin config del adset (p.ej. archivado): lo incluimos solo si
                # registró conversaciones reales, marcándolo como Sin clasificar.
                if conversations <= 0:
                    continue
                opt_goal = ""
                destination, dtype = "Sin clasificar", ""
            else:
                opt_goal = cfg.get("optimization_goal", "")
                if opt_goal != MESSAGING_OPT_GOAL:
                    continue
                destination, dtype = _classify_destination(cfg)

            spend = float(r.get("spend", 0) or 0)

            rows.append({
                "date":                  r.get("date_start", ""),
                "campaign_name":         r.get("campaign_name", ""),
                "adset_name":            r.get("adset_name", ""),
                "destination":           destination,
                "destination_type":      dtype,
                "optimization_goal":     opt_goal,
                "conversations":         conversations,
                "spend":                 spend,
                "cost_per_conversation": round(spend / conversations, 2) if conversations > 0 else 0,
            })

        paging = data.get("paging", {})
        next_url = paging.get("next")
        url = next_url if next_url else None
        params = {}

        if next_url:
            time.sleep(0.3)

    log.info(f"   Meta Messaging: {len(rows)} filas ({page} páginas)")
    return rows


def _fetch_ad_creatives(
    access_token: str,
    ad_account_id: str,
    width: int = 120,
    height: int = 120,
) -> dict:
    """
    Mapa ad_id → {"thumb": thumbnail_url, "status": effective_status}.

    Una sola consulta paginada al edge /ads con field expansion
    `creative{thumbnail_url}` + `effective_status`. Ambas cosas son configuración
    del anuncio (no dependen de fechas), así que se traen una vez y se cruzan por
    ad_id con los insights — igual que _fetch_adset_config hace con los adsets.

    `effective_status` es el estado REAL de entrega (ACTIVE / PAUSED /
    ADSET_PAUSED / CAMPAIGN_PAUSED / ARCHIVED…), lo que permite marcar en la vista
    si el anuncio sigue activo o está pausado.

    Pedimos miniatura 120×120 (nítida en Retina); se muestra a 40px. Tolerante:
    si algo falla, el llamador lo envuelve en try/except y los anuncios quedan sin
    miniatura ni estado, sin romper el resto del ETL.
    """
    url = f"{BASE_URL}/act_{ad_account_id}/ads"
    params = {
        "fields":           "id,effective_status,creative{thumbnail_url}",
        "thumbnail_width":  width,
        "thumbnail_height": height,
        "limit":            500,
        "access_token":     access_token,
    }
    info: dict = {}
    page = 0
    while url:
        page += 1
        resp = requests.get(url, params=params if page == 1 else {})
        resp.raise_for_status()
        data = resp.json()
        for a in data.get("data", []):
            creative = a.get("creative") or {}
            info[a.get("id")] = {
                "thumb":  creative.get("thumbnail_url") or "",
                "status": a.get("effective_status", "") or "",
            }
        next_url = data.get("paging", {}).get("next")
        url = next_url if next_url else None
        params = {}
        if next_url:
            time.sleep(0.3)
    return info


def extract_meta_ads(
    access_token: str,
    ad_account_id: str,
    date_from: date,
    date_to: date
) -> list[dict]:
    # Creativos por ad_id (miniatura + estado real de entrega) — una consulta
    # aparte; si falla, seguimos sin esos campos en vez de tumbar todo el ETL.
    try:
        ad_info = _fetch_ad_creatives(access_token, ad_account_id)
        log.info(f"   Meta Ads: {len(ad_info)} creativos (miniatura + estado)")
    except Exception as e:
        log.warning(f"   Meta Ads: no se pudieron traer creativos ({e})")
        ad_info = {}

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
            # Clics en el enlace y visitas a la página destino (landing) — para el
            # embudo de Compras (CPC/CTR de enlace y costo por visita a landing).
            link_clicks    = _get_action(actions,       "link_click")
            landing_views  = _get_action(actions,       "landing_page_view")
            # Retención de video por anuncio (hold rate). ThruPlay = vio ≥15s o
            # completo; p100 = lo vio entero; avg_watch = segundos promedio vistos.
            thruplay       = _get_video(r, "video_thruplay_watched_actions")
            video_p100     = _get_video(r, "video_p100_watched_actions")
            video_avg_sec  = _get_video(r, "video_avg_time_watched_actions")
            # Conversaciones iniciadas a nivel anuncio (mismo dato real que la
            # mensajería usa por ad set). Permite la tabla "anuncios por conjunto"
            # de la vista de WhatsApp con resultados por creativo.
            conversations  = _msg_conversations(actions)

            spend = float(r.get("spend", 0) or 0)
            roas  = round(purchase_value / spend, 4) if spend > 0 else 0
            cpa   = round(spend / purchases, 2)      if purchases > 0 else 0
            cost_per_conversation = round(spend / conversations, 2) if conversations > 0 else 0

            rows.append({
                "date":              r.get("date_start", ""),
                "campaign_id":       r.get("campaign_id", ""),
                "campaign_name":     r.get("campaign_name", ""),
                "adset_id":          r.get("adset_id", ""),
                "adset_name":        r.get("adset_name", ""),
                "ad_id":             r.get("ad_id", ""),
                "ad_name":           r.get("ad_name", ""),
                "status":            ad_info.get(r.get("ad_id", ""), {}).get("status", ""),
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
                "link_clicks":       link_clicks,
                "landing_page_views": landing_views,
                "thruplay":          thruplay,
                "video_p100":        video_p100,
                "video_avg_watch_sec": video_avg_sec,
                "cpa":               cpa,
                "conversations":          conversations,
                "cost_per_conversation":  cost_per_conversation,
                "thumb_url":         ad_info.get(r.get("ad_id", ""), {}).get("thumb", ""),
            })

        paging = data.get("paging", {})
        next_url = paging.get("next")
        url = next_url if next_url else None
        params = {}

        if next_url:
            time.sleep(0.3)

    log.info(f"   Meta Ads: {len(rows)} filas ({page} páginas)")
    return rows