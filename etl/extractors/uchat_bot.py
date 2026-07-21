"""
Extractor UChat · Diagnóstico del bot (Ofero) para el ETL diario.

Recorre las conversaciones del MES EN CURSO y produce UNA fila para
uchat_bot_diagnostics: {client_id, period, impediments, snapshot}, tal cual la
consume la hoja "Bot & Operación".

Fuente: API de UChat (Bearer token en UCHAT_API_TOKEN). Solo lectura.
Privacidad: los ejemplos de conversación se REDACTAN (nombre/tel/email/IDs)
antes de guardarse; el resto son agregados sin PII.

Config por entorno:
  UCHAT_API_TOKEN      (obligatorio) — si falta, el extractor se salta solo.
  UCHAT_MONTH_TARGET   (opcional, def 800) — conversaciones a analizar del mes.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone

log = logging.getLogger(__name__)

BASE = "https://www.uchat.com.au/api"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
MIN_MSGS = 3
EXAMPLES_PER = 3

EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
LONGNUM_RE = re.compile(r"(?<!\$)\b(?:\d[\s().-]?){7,}\d\b")

CATEGORICAL = [
    "channel", "status", "lead_source", "market", "opted_in_through",
    "last_message_type", "interest", "lead_status",
]

# ── Firmas de plantillas del bot (normalizadas) ──────────────
SIG_WELCOME = "te damos la bienvenida"
SIG_NAME = "regalarnos su nombre"
SIG_CITY_ASK = "en que municipio te encuentras"
SIG_LOCFAIL = "no pudimos comprobar tu ubicacion"
SIG_MENU = "en que te podemos ayudar"
SIG_CATALOG = "aqui tienes el catalogo"
SIG_THANKS = "es un gusto poder atenderte"
SIG_HOURS = "horario de atencion"
PRICE_WORDS = ("precio", "cuanto cuesta", "cuanto vale", "que vale", "cuanto sale", "cuesta la", "valor de")
MODEL_TOKENS = ("zyper", "ziper", "stareer", "ledo", "galax", "patineta", " y3", "scooter", "referencia", "modelo")
QUESTION_HINTS = ("?", "precio", "puedo", "se puede", "como ", "cuando", "donde", "tienen", "hay ", "quiero saber", "info")

STOPPERS = [
    ("a_saludo_bucle",   "A", "El bot repite el saludo de bienvenida una y otra vez", None),
    ("a_rechaza_ciudad", "A", "Rechaza una ciudad válida que el cliente escribió", None),
    ("a_bucle_ciudad",   "A", "Bucle de ciudad sin salida (la rechaza 3+ veces)", None),
    ("a_repregunta",     "A", "Vuelve a pedir el nombre o la ciudad que ya se dio", None),
    ("a_desorden",       "A", "Manda mensajes en desorden (responde antes de preguntar)", "aprox"),
    ("a_menu_vueltas",   "A", "El menú da vueltas: el cliente elige y vuelve al mismo menú", None),
    ("b_no_precio",      "B", "No da el precio cuando el cliente lo pide", None),
    ("b_catalogo_gen",   "B", "Manda el catálogo genérico en vez del modelo pedido", "IA"),
    ("b_horario",        "B", "Responde con el horario de atención en vez de resolver", None),
    ("b_ignora",         "B", "Ignora lo que el cliente escribe y sigue su guion", "IA"),
    ("c_asesor",         "C", "El cliente escribe «Asesor» para escapar del bot", None),
    ("c_sin_respuesta",  "C", "El cliente escribe lo último y el bot se queda mudo", None),
    ("c_abierta",        "C", "Queda abierta sin que ningún humano la retome", None),
]
GROUP_TITLES = {
    "A": "El bot se atasca solo · fallas técnicas",
    "B": "El bot no resuelve · no ayuda",
    "C": "El cliente se rinde · la consecuencia",
}
HARD = {"a_saludo_bucle", "a_rechaza_ciudad", "a_bucle_ciudad", "a_repregunta", "a_desorden",
        "a_menu_vueltas", "b_no_precio", "b_catalogo_gen", "b_ignora", "c_asesor"}
SIG_FOR = {
    "a_saludo_bucle": SIG_WELCOME, "a_rechaza_ciudad": SIG_LOCFAIL, "a_bucle_ciudad": SIG_LOCFAIL,
    "a_repregunta": SIG_NAME, "a_desorden": SIG_THANKS, "a_menu_vueltas": SIG_MENU,
    "b_no_precio": None, "b_catalogo_gen": SIG_CATALOG, "b_horario": SIG_HOURS, "b_ignora": SIG_WELCOME,
    "c_asesor": None, "c_sin_respuesta": None, "c_abierta": None,
}


def _norm(t) -> str:
    t = unicodedata.normalize("NFD", str(t))
    return "".join(c for c in t if unicodedata.category(c) != "Mn").lower()


def _get(token, path, params=None, _tries=8):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", USER_AGENT)
    for attempt in range(_tries):
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < _tries - 1:
                time.sleep(min(60, 3 * 2 ** attempt))
                continue
            return e.code, e.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            if attempt < _tries - 1:
                time.sleep(2 ** attempt)
                continue
            return -1, f"{type(e).__name__}: {e}"
    return -1, "sin respuesta"


def _is_filled(v) -> bool:
    if v is None:
        return False
    if isinstance(v, str):
        return v.strip() != ""
    if isinstance(v, (list, dict)):
        return len(v) > 0
    return True


def _lead_last_msg(lead):
    v = lead.get("last_message_at") or lead.get("last_interaction")
    if not v:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(str(v)[:19], fmt)
        except ValueError:
            continue
    return None


def _build_name_regex(*names):
    toks = set()
    for n in names:
        if not n:
            continue
        for t in re.split(r"\s+", str(n).strip()):
            if len(t) >= 3:
                toks.add(re.escape(t))
    if not toks:
        return None
    return re.compile(r"\b(" + "|".join(sorted(toks, key=len, reverse=True)) + r")\b", re.IGNORECASE)


def _redact(text, name_re):
    t = str(text or "")
    if name_re:
        t = name_re.sub("[NOMBRE]", t)
    t = EMAIL_RE.sub("[EMAIL]", t)
    return LONGNUM_RE.sub("[NUM]", t)


def _extract_messages(payload):
    if isinstance(payload, dict):
        d = payload.get("data")
        if isinstance(d, list):
            return d
        if isinstance(d, dict):
            return d.get("data") or []
    return payload if isinstance(payload, list) else []


def _msg_dir(m):
    if isinstance(m.get("agent_id"), int) and m["agent_id"] > 0:
        return "agent"
    v = m.get("type")
    if isinstance(v, str) and v.lower() in ("in", "out", "agent", "user", "bot"):
        return {"user": "in", "bot": "out"}.get(v.lower(), v.lower())
    sid = str(m.get("sender_id") or "").lower()
    if sid == "bot":
        return "out"
    return "in" if sid else "?"


def _msg_text(m):
    p = m.get("payload")
    if isinstance(p, dict) and isinstance(p.get("text"), str) and p["text"].strip():
        return p["text"]
    for k in ("content", "text", "message"):
        v = m.get(k)
        if isinstance(v, str) and v.strip():
            return v
    return f"[{m.get('msg_type') or m.get('type') or 'no-texto'}]"


def _analyze(msgs, status):
    c = {k: 0 for k in ("welcome", "name", "cityask", "locfail", "menu", "thanks", "hours", "catalog")}
    price_q = model_q = frustration = has_agent = desorden = ignora = False
    progress_seen = prev_lead_q = False
    for m in msgs:
        d, nt = m["t"], _norm(m["text"])
        if d == "agent":
            has_agent = True
        if d == "out":
            if SIG_WELCOME in nt: c["welcome"] += 1
            if SIG_NAME in nt: c["name"] += 1
            if SIG_CITY_ASK in nt: c["cityask"] += 1
            if SIG_LOCFAIL in nt: c["locfail"] += 1
            if SIG_MENU in nt: c["menu"] += 1
            if SIG_THANKS in nt: c["thanks"] += 1
            if SIG_HOURS in nt: c["hours"] += 1
            if SIG_CATALOG in nt: c["catalog"] += 1
            if SIG_THANKS in nt or SIG_MENU in nt:
                progress_seen = True
            if progress_seen and (SIG_NAME in nt or SIG_CITY_ASK in nt):
                desorden = True
            if prev_lead_q and (SIG_WELCOME in nt or SIG_NAME in nt):
                ignora = True
            prev_lead_q = False
        if d == "in":
            if any(w in nt for w in PRICE_WORDS): price_q = True
            if any(t in nt for t in MODEL_TOKENS): model_q = True
            if nt.strip() in ("asesor", "asesor?", "un asesor", "quiero un asesor", "asesor de servicio."):
                frustration = True
            txt = str(m["text"]).strip()
            prev_lead_q = len(txt) > 20 and any(h in nt for h in QUESTION_HINTS)

    last_in = bool(msgs) and msgs[-1]["t"] == "in"
    st = _norm(status or "")
    imps = set()
    if c["welcome"] >= 2: imps.add("a_saludo_bucle")
    if c["locfail"] >= 3: imps.add("a_bucle_ciudad")
    elif c["locfail"] >= 1: imps.add("a_rechaza_ciudad")
    if c["name"] >= 2 or c["cityask"] >= 2: imps.add("a_repregunta")
    if desorden: imps.add("a_desorden")
    if c["menu"] >= 3: imps.add("a_menu_vueltas")
    if price_q and not has_agent: imps.add("b_no_precio")
    if model_q and c["catalog"] >= 1 and not has_agent: imps.add("b_catalogo_gen")
    if c["hours"] >= 1: imps.add("b_horario")
    if ignora: imps.add("b_ignora")
    if frustration: imps.add("c_asesor")
    if last_in: imps.add("c_sin_respuesta")
    if st == "open" and last_in and not has_agent: imps.add("c_abierta")
    meta = {
        "reached_menu": c["menu"] >= 1, "reached_catalog": c["catalog"] >= 1,
        "has_agent": has_agent, "n": len(msgs), "blocked": bool(imps & HARD),
        "stuck_before_menu": c["menu"] == 0,
    }
    return imps, meta


def _snippet(msgs, name_re, sig):
    idx = 0
    if sig:
        for i, m in enumerate(msgs):
            if m["t"] == "out" and sig in _norm(m["text"]):
                idx = i
                break
    start = max(0, idx - 2)
    out = []
    for m in msgs[start:start + 6]:
        who = {"in": "LEAD", "out": "BOT", "agent": "HUMANO"}.get(m["t"], "?")
        out.append(f"{who}: {_redact(m['text'], name_re)[:120]}")
    return out


def _flow_summary(token):
    st, data = _get(token, "/flow-summary", {"range": "last_30_days"})
    if st != 200 or not isinstance(data, dict):
        return {"ok": False, "rows": [], "totals": {}}
    rows = sorted((data.get("data") or []), key=lambda r: r.get("summary_date", ""))
    by_day = defaultdict(lambda: defaultdict(float))
    avg_acc = defaultdict(lambda: defaultdict(list))
    sum_cols = ["day_new_bot_users", "day_active_bot_users", "day_in_messages",
                "day_out_messages", "day_agent_messages", "day_assigned", "day_done"]
    avg_cols = ["avg_agent_response_time", "avg_resolve_time"]
    for r in rows:
        d = r.get("summary_date", "")
        if not d:
            continue
        for c in sum_cols:
            try:
                by_day[d][c] += float(r.get(c) or 0)
            except (TypeError, ValueError):
                pass
        for c in avg_cols:
            v = r.get(c)
            if isinstance(v, (int, float)) and v > 0:
                avg_acc[d][c].append(float(v))
    daily = []
    for d in sorted(by_day):
        row = {"date": d}
        for c in sum_cols:
            row[c] = round(by_day[d][c])
        for c in avg_cols:
            vals = avg_acc[d].get(c) or []
            row[c] = round(sum(vals) / len(vals)) if vals else None
        daily.append(row)
    totals = {c: sum(x[c] for x in daily) for c in sum_cols}
    return {"ok": True, "rows": daily, "totals": totals}


def _bot_users(token):
    st, data = _get(token, "/flow/bot-users-count")
    out = {"ok": st == 200, "by_status": {}}
    if st == 200 and isinstance(data, dict):
        for d in (data.get("data") or []):
            out["by_status"][str(d.get("status"))] = d.get("num")
    return out


def _agents(token):
    st, data = _get(token, "/flow-agent-summary", {"range": "last_30_days"})
    if st != 200 or not isinstance(data, dict):
        return {"ok": False, "agents": []}
    agents = []
    for a in (data.get("data") or []):
        row = {k: a.get(k) for k in a.keys() if k not in ("agent_email", "agent")}
        ag = a.get("agent") or {}
        row["agent_name"] = (ag.get("name") or "").strip().split(" ")[0] if isinstance(ag, dict) else ""
        row["agent_id"] = ag.get("id") if isinstance(ag, dict) else a.get("agent_id")
        agents.append(row)
    return {"ok": True, "agents": agents}


def _catalog(token):
    out = {}
    for label, path in [("tags", "/flow/tags"), ("segments", "/flow/segments"),
                        ("user_fields", "/flow/user-fields"), ("custom_events", "/flow/custom-events")]:
        st, data = _get(token, path, {"limit": 100})
        names = []
        if st == 200 and isinstance(data, dict):
            for it in (data.get("data") or []):
                if it.get("name"):
                    names.append(it["name"])
        out[label] = names
    return out


def extract_uchat_bot(client_id: str) -> list[dict]:
    """Devuelve [{client_id, period, impediments, snapshot}] del mes en curso."""
    token = os.environ.get("UCHAT_API_TOKEN", "").strip()
    if not token:
        log.info("── UChat bot · sin UCHAT_API_TOKEN, se salta")
        return []

    target = int(os.environ.get("UCHAT_MONTH_TARGET", "800"))
    now = datetime.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    period = now.strftime("%Y-%m")
    log.info(f"── UChat bot · analizando mes {period} (objetivo {target} conversaciones)")

    # Catálogo/agregados baratos.
    flow = _flow_summary(token)
    bot_users = _bot_users(token)
    agents = _agents(token)
    catalog = _catalog(token)

    # Un solo recorrido de subscribers del mes: snapshot + impedimentos.
    fill = Counter()
    cats = defaultdict(Counter)
    no_resp = no_resp_eval = 0
    now_utc = datetime.now(timezone.utc)
    imp_counts = {k: 0 for k, *_ in STOPPERS}
    examples = {k: [] for k, *_ in STOPPERS}
    by_origin = {}
    stats = {"reached_menu": 0, "reached_catalog": 0, "has_agent": 0, "sum_msgs": 0, "blocked": 0, "clean": 0, "stuck": 0}
    analyzed = scanned = 0
    total_reported = None
    page = 1
    reached_old = False

    while analyzed < target and not reached_old:
        st, data = _get(token, "/subscribers", {"limit": 100, "page": page})
        if st != 200 or not isinstance(data, dict):
            log.warning(f"   subscribers page {page}: HTTP {st}")
            break
        if total_reported is None:
            total_reported = (data.get("meta") or {}).get("total")
        leads = data.get("data") or []
        if not leads:
            break
        for lead in leads:
            if analyzed >= target:
                break
            lm = _lead_last_msg(lead)
            if lm is not None and lm < month_start:
                reached_old = True
                break
            scanned += 1
            uns = lead.get("user_ns") or lead.get("ns") or lead.get("id")
            if not uns:
                continue
            # Snapshot: fill + categóricos + no-respuesta.
            for k, v in lead.items():
                if _is_filled(v):
                    fill[k] += 1
                    if k in CATEGORICAL:
                        cats[k][str(v)[:40]] += 1
            lmt = lead.get("last_message_type")
            lma = _lead_last_msg(lead)
            if lmt is not None and lma is not None:
                no_resp_eval += 1
                hrs = (now_utc - lma.replace(tzinfo=timezone.utc)).total_seconds() / 3600.0
                if str(lmt).lower() == "in" and hrs >= 24:
                    no_resp += 1
            # Impedimentos: transcripción.
            st2, mp = _get(token, "/subscriber/chat-messages", {"user_ns": uns, "include_bot": 1, "limit": 100})
            if st2 != 200:
                continue
            raw = _extract_messages(mp)
            if len(raw) < MIN_MSGS:
                continue
            msgs = [{"t": _msg_dir(m), "text": _msg_text(m), "ts": m.get("ts")} for m in raw if isinstance(m, dict)]
            msgs.sort(key=lambda x: x["ts"] if isinstance(x["ts"], (int, float)) else 0)
            imps, meta = _analyze(msgs, lead.get("status"))
            analyzed += 1
            origin = lead.get("lead_source") or "desconocido"
            o = by_origin.setdefault(origin, {"total": 0, "blocked": 0, "stuck": 0})
            o["total"] += 1
            o["blocked"] += 1 if meta["blocked"] else 0
            o["stuck"] += 1 if meta["stuck_before_menu"] else 0
            for k in imps:
                imp_counts[k] += 1
            for key in ("reached_menu", "reached_catalog", "has_agent"):
                stats[key] += 1 if meta[key] else 0
            stats["sum_msgs"] += meta["n"]
            stats["blocked"] += 1 if meta["blocked"] else 0
            stats["clean"] += 1 if not imps else 0
            stats["stuck"] += 1 if meta["stuck_before_menu"] else 0
            name_re = _build_name_regex(lead.get("name"), lead.get("first_name"), lead.get("last_name"))
            for k in imps:
                if len(examples[k]) < EXAMPLES_PER:
                    examples[k].append({"origin": origin, "n": meta["n"], "lines": _snippet(msgs, name_re, SIG_FOR[k])})
            time.sleep(1.0)  # ritmo suave para el rate-limit
        last_page = (data.get("meta") or {}).get("last_page") or 1
        if page >= last_page:
            break
        page += 1

    if analyzed == 0:
        log.warning("   UChat bot · 0 conversaciones analizadas — no se emite fila")
        return []

    def pct(x):
        return round(100 * x / analyzed, 1)

    groups = []
    for gk in ("A", "B", "C"):
        items = [{"key": k, "label": lab, "note": note, "count": imp_counts[k], "pct": pct(imp_counts[k]), "hard": k in HARD}
                 for k, g, lab, note in STOPPERS if g == gk]
        items.sort(key=lambda x: -x["count"])
        groups.append({"key": gk, "title": GROUP_TITLES[gk], "stoppers": items})

    impediments = {
        "period": period,
        "generated_at_note": "mes en curso · corrida diaria del ETL.",
        "total_conversations": analyzed,
        "leads_scanned": scanned,
        "blocked": {"count": stats["blocked"], "pct": pct(stats["blocked"])},
        "clean": {"count": stats["clean"], "pct": pct(stats["clean"])},
        "groups": groups,
        "by_origin": by_origin,
        "funnel": {
            "reached_menu_pct": pct(stats["reached_menu"]),
            "reached_catalog_pct": pct(stats["reached_catalog"]),
            "has_human_pct": pct(stats["has_agent"]),
            "stuck_before_menu_pct": pct(stats["stuck"]),
            "avg_messages": round(stats["sum_msgs"] / analyzed, 1),
        },
        "examples": examples,
    }

    snapshot = {
        "generated_at": now_utc.isoformat(),
        "flow_summary": flow,
        "bot_users": bot_users,
        "subscribers": {
            "ok": True,
            "total_reported": total_reported,
            "sampled": analyzed,
            "fill_pct": {k: round(100 * n / analyzed, 1) for k, n in fill.items()},
            "categoricals": {k: dict(c.most_common(12)) for k, c in cats.items() if c},
            "no_response": {
                "hours_threshold": 24, "evaluable": no_resp_eval, "count": no_resp,
                "rate_pct": round(100 * no_resp / no_resp_eval, 1) if no_resp_eval else None,
            },
        },
        "agents": agents,
        "catalog": catalog,
    }

    log.info(f"   ✓ UChat bot · {analyzed} conversaciones · trabadas {impediments['blocked']['pct']}%")
    return [{"client_id": client_id, "period": period, "impediments": impediments, "snapshot": snapshot}]
