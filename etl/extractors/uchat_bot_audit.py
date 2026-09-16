"""
Auditoría del bot LEÍDA POR IA (Ofero) — Fase 1 del flujo semanal.

Muestrea conversaciones reales del bot (UChat), las REDACTA y las hace leer por
un LLM barato/gratis (Groq · Llama 3.3 70B por defecto) con la misma rúbrica que
usamos en la auditoría manual. Agrega el resultado en un payload JSON listo para
que la vista del dashboard lo renderice: trabas verificadas, prospectos perdidos
y conversaciones de ejemplo (redactadas).

Agnóstico de proveedor (formato OpenAI). Config por entorno:
  GROQ_API_KEY / LLM_API_KEY   (obligatorio; si falta, se salta)
  LLM_BASE_URL   (def https://api.groq.com/openai/v1)
  LLM_MODEL      (def llama-3.3-70b-versatile)
  UCHAT_API_TOKEN (obligatorio: reusa el fetch del diagnóstico)
  BOT_AUDIT_TARGET (def 120)  ·  BOT_AUDIT_BATCH (def 10)
Nada se inventa: solo se agrega lo que el LLM leyó de conversaciones reales.
"""
from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone

from .uchat_bot import (
    _get, _extract_messages, _msg_dir, _msg_text, _build_name_regex, _redact, MIN_MSGS,
)

log = logging.getLogger(__name__)

# ── Config LLM (formato OpenAI · Groq por defecto) ───────────────
LLM_KEY = (os.environ.get("GROQ_API_KEY") or os.environ.get("LLM_API_KEY") or "").strip()
LLM_BASE = os.environ.get("LLM_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
LLM_MODEL = os.environ.get("LLM_MODEL", "llama-3.3-70b-versatile")
TARGET = int(os.environ.get("BOT_AUDIT_TARGET", "120"))
BATCH = int(os.environ.get("BOT_AUDIT_BATCH", "10"))
MAX_SUB_PAGES = 30

# Taxonomía (las mismas claves de la auditoría manual) → etiqueta legible.
TRABAS = {
    "saludo_bucle": "Repite el saludo en bucle",
    "repregunta_datos": "Re-pregunta datos ya dados",
    "desorden": "Manda mensajes fuera de orden",
    "ignora_cliente": "Ignora la intención del cliente",
    "queda_abierta": "Queda abierta, nadie la retoma",
    "menu_vueltas": "El menú da vueltas",
    "rechaza_ciudad_valida": "Rechaza una ciudad válida",
    "responde_horario": "Responde con el horario en vez de resolver",
    "no_da_precio": "No da el precio pedido",
    "catalogo_generico": "Manda catálogo genérico en vez del modelo",
    "pide_asesor": "El cliente escribe «Asesor» para escapar",
    "bot_mudo": "El cliente escribe y el bot se queda mudo",
    "bucle_ciudad": "Bucle de ciudad sin salida",
}
HARD = {"saludo_bucle", "repregunta_datos", "desorden", "rechaza_ciudad_valida",
        "ignora_cliente", "no_da_precio", "catalogo_generico", "bucle_ciudad"}

SYSTEM = (
    "Eres un auditor de conversaciones de un bot de WhatsApp de OFERO Colombia, que vende "
    "vehículos eléctricos (modelos Stareer, Ledo, Galaxy, Zyper). El bot saluda, pide nombre y "
    "municipio, muestra un menú (Catálogo/Tiendas/Postventa/Opciones de pago) y a veces pasa a un "
    "asesor humano. LEE cada conversación completa y entiende el flujo (no clasifiques por palabras "
    "sueltas). Los datos personales ya están redactados como [NOMBRE], [EMAIL], [NUM].\n\n"
    "Para CADA conversación devuelve un objeto con:\n"
    "- id (string, el que se te da)\n"
    "- outcome: uno de {llego_a_catalogo, se_atasco_antes_de_menu, pidio_asesor, bot_mudo, "
    "atendido_por_humano, compro_o_avanzo_venta, otro}\n"
    "- trabas: lista (0+) SOLO con estas claves cuando de verdad ocurran: " + ", ".join(TRABAS) + "\n"
    "- entendio_cliente: 'si' | 'parcial' | 'no'\n"
    "- prospecto_perdido: true/false (true si mostró intención real —modelo, precio o financiación— y "
    "terminó sin respuesta útil y sin pasar a un asesor)\n"
    "- gravedad: 'alta' | 'media' | 'baja'\n"
    "- evidencia: 1 cita textual corta (redactada) de la traba principal\n"
    "- nota: 1 frase con lo más importante\n\n"
    "Si la conversación fluyó bien, deja trabas vacías y outcome positivo. Sé honesto y estricto.\n"
    "Responde SOLO un JSON válido: {\"convos\": [ ... ]}."
)


def _http_json(url: str, headers: dict, body: dict, tries: int = 5):
    data = json.dumps(body).encode("utf-8")
    for a in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            code = e.code
            if code in (429, 500, 502, 503, 504) and a < tries - 1:
                time.sleep(min(30, 4 * 2 ** a))  # backoff (rate-limit del tier gratis)
                continue
            log.warning(f"   LLM HTTP {code}: {e.read().decode('utf-8','replace')[:200]}")
            return None
        except Exception as e:  # noqa: BLE001
            if a < tries - 1:
                time.sleep(2 ** a)
                continue
            log.warning(f"   LLM error: {type(e).__name__}: {e}")
            return None
    return None


def _llm_audit(convs: list[dict]) -> list[dict]:
    """Envía un lote de conversaciones y devuelve la lista de findings."""
    blocks = []
    for c in convs:
        lines = "\n".join(f"[{m['rol']}] {m['txt']}" for m in c["conv"])
        blocks.append(f"### CONV {c['id']} (ciudad={c.get('ciudad') or '?'})\n{lines}")
    user = "Audita estas conversaciones:\n\n" + "\n\n".join(blocks)
    out = _http_json(
        f"{LLM_BASE}/chat/completions",
        {"Authorization": f"Bearer {LLM_KEY}", "Content-Type": "application/json",
         "Accept": "application/json",
         # UA de navegador: sin esto, Cloudflare bloquea a Python-urllib (403 · error 1010).
         "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")},
        {"model": LLM_MODEL, "temperature": 0, "response_format": {"type": "json_object"},
         "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}]},
    )
    if not out:
        return []
    try:
        txt = out["choices"][0]["message"]["content"]
        parsed = json.loads(txt)
        return parsed.get("convos") or (parsed if isinstance(parsed, list) else [])
    except Exception as e:  # noqa: BLE001
        log.warning(f"   LLM parse: {e}")
        return []


def _sample(token: str, target: int) -> list[dict]:
    """Muestra de conversaciones recientes, redactadas y en orden cronológico."""
    out = []
    page = 1
    while len(out) < target and page <= MAX_SUB_PAGES:
        st, data = _get(token, "/subscribers", {"limit": 100, "page": page})
        if st != 200 or not isinstance(data, dict):
            break
        leads = data.get("data") or []
        if not leads:
            break
        for lead in leads:
            if len(out) >= target:
                break
            uns = lead.get("user_ns") or lead.get("ns") or lead.get("id")
            if not uns:
                continue
            st2, mp = _get(token, "/subscriber/chat-messages", {"user_ns": uns, "include_bot": 1, "limit": 100})
            if st2 != 200:
                continue
            raw = _extract_messages(mp)
            raw = sorted(raw, key=lambda m: m.get("ts") or 0)
            nre = _build_name_regex(lead.get("name"), lead.get("first_name"), lead.get("last_name"))
            conv = []
            for m in raw:
                if not isinstance(m, dict):
                    continue
                txt = _redact(_msg_text(m), nre)
                if not txt or txt.startswith("[no-texto"):
                    continue
                conv.append({"rol": {"in": "cliente", "out": "bot", "agent": "asesor", "?": "bot"}.get(_msg_dir(m), "bot"),
                             "txt": txt})
            if len(conv) < MIN_MSGS:
                continue
            ciudad = None
            uf = lead.get("user_fields")
            if isinstance(uf, dict):
                ciudad = uf.get("Ciudad")
            out.append({"id": str(uns)[-6:], "ciudad": ciudad or lead.get("city"), "conv": conv})
            time.sleep(0.35)
        last_page = (data.get("meta") or {}).get("last_page") or 1
        if page >= last_page:
            break
        page += 1
    return out


def run_bot_audit(client_id: str) -> dict | None:
    """Devuelve {client_id, period, payload} o None si no se puede auditar."""
    if not LLM_KEY:
        log.info("── Bot audit IA · sin GROQ_API_KEY/LLM_API_KEY, se salta")
        return None
    token = os.environ.get("UCHAT_API_TOKEN", "").strip()
    if not token:
        log.info("── Bot audit IA · sin UCHAT_API_TOKEN, se salta")
        return None

    log.info(f"── Bot audit IA · muestreando hasta {TARGET} conversaciones…")
    sample = _sample(token, TARGET)
    if len(sample) < 10:
        log.warning(f"   Bot audit IA · muestra muy chica ({len(sample)}), no se emite fila")
        return None
    by_id = {c["id"]: c for c in sample}

    findings = []
    for i in range(0, len(sample), BATCH):
        batch = sample[i:i + BATCH]
        res = _llm_audit(batch)
        findings.extend(res)
        log.info(f"   lote {i//BATCH + 1}: {len(res)}/{len(batch)} auditadas")
        time.sleep(2.0)  # ritmo suave para el tier gratis
    if not findings:
        log.warning("   Bot audit IA · el LLM no devolvió nada, no se emite fila")
        return None

    n = len(findings)
    def pct(x): return round(100 * x / n, 1)
    tr = Counter()
    for f in findings:
        for t in (f.get("trabas") or []):
            if t in TRABAS:
                tr[t] += 1
    trabas = [{"key": k, "label": TRABAS[k], "count": tr[k], "pct": pct(tr[k]), "hard": k in HARD}
              for k in tr]
    trabas.sort(key=lambda x: -x["count"])

    perdidos = [f for f in findings if f.get("prospecto_perdido")]
    grav = Counter(f.get("gravedad") for f in perdidos)
    entendio = Counter((f.get("entendio_cliente") or "").lower() for f in findings)
    clean = sum(1 for f in findings if not (f.get("trabas") or []))

    # Ejemplos para renderizar: 1 conversación por cada traba top + 1 limpia.
    examples = []
    used = set()
    for tb in trabas[:4]:
        cand = next((f for f in findings
                     if tb["key"] in (f.get("trabas") or []) and f.get("id") in by_id
                     and f.get("id") not in used and f.get("gravedad") == "alta"), None)
        cand = cand or next((f for f in findings
                             if tb["key"] in (f.get("trabas") or []) and f.get("id") in by_id
                             and f.get("id") not in used), None)
        if not cand:
            continue
        used.add(cand["id"])
        examples.append({"kind": "fail", "key": tb["key"], "title": tb["label"],
                         "id": cand["id"], "conv": by_id[cand["id"]]["conv"],
                         "evidencia": cand.get("evidencia"), "nota": cand.get("nota")})
    clean_f = next((f for f in findings
                    if not (f.get("trabas") or []) and f.get("id") in by_id
                    and f.get("outcome") in ("atendido_por_humano", "compro_o_avanzo_venta", "llego_a_catalogo")), None)
    if clean_f:
        examples.append({"kind": "clean", "key": "fluye", "title": "Cómo fluye una conversación limpia",
                         "id": clean_f["id"], "conv": by_id[clean_f["id"]]["conv"], "nota": clean_f.get("nota")})

    period = datetime.now().strftime("%G-W%V")
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "period": period,
        "model": LLM_MODEL,
        "analyzed": n,
        "clean": {"count": clean, "pct": pct(clean)},
        "entendio_si_pct": pct(entendio.get("si", 0)),
        "entendio_parcial_pct": pct(entendio.get("parcial", 0)),
        "entendio_no_pct": pct(entendio.get("no", 0)),
        "prospectos": {"count": len(perdidos), "pct": pct(len(perdidos)),
                        "alta": grav.get("alta", 0), "media": grav.get("media", 0)},
        "trabas": trabas,
        "examples": examples,
    }
    log.info(f"   Bot audit IA · {n} auditadas · {len(perdidos)} prospectos perdidos · {len(trabas)} trabas")
    return {"client_id": client_id, "period": period, "payload": payload}
