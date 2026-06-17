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
    """Devuelve (etiqueta_legible, destination_type_crudo)."""
    dt = (cfg.get("destination_type") or "").upper()
    if dt in DEST_LABELS:
        return DEST_LABELS[dt], dt
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
            cfg           = cfg_map.get(adset_id, {})
            opt_goal      = cfg.get("optimization_goal", "")

            # solo campañas de mensajes: meta=CONVERSATIONS o con conversaciones reales
            is_messaging = (opt_goal == MESSAGING_OPT_GOAL) or (conversations > 0)
            if not is_messaging:
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
                "status":            "",
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