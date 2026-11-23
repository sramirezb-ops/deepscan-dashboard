#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
POC — Bot de respuestas a comentarios de anuncios de TikTok (cliente Ofero)
===========================================================================

Qué hace (y qué NO hace):
  ✅ A) PRUEBA DE VIABILIDAD: ¿este token/cuenta puede *responder* comentarios?
        Revisa identidades disponibles, lectura de comentarios y detecta el
        bloqueo conocido de cuentas autorizadas por Business Center (BC_AUTH_TT).
  ✅ B) BORRADORES: genera respuestas de borrador para N comentarios reales
        (plantillas FAQ + LLM con los guardrails de Ofero) y las guarda a disco.
  🚫 NO PUBLICA NADA EN TIKTOK. La función de publicar está deshabilitada a
        propósito (ver publish_reply()). La idea es revisar y aprobar primero.

Cómo correrlo (dummie-friendly):
  1) En una terminal, pega tus credenciales (las mismas del ETL de Ofero):
        export TIKTOK_ACCESS_TOKEN="<token de Ofero>"
        export TIKTOK_ADVERTISER_ID="<advertiser_id de Ofero>"
     (opcional, para mejores borradores con IA — si no, usa solo plantillas)
        export GROQ_API_KEY="<tu key de Groq>"
  2) Ejecuta:
        cd ~/Documents/deepscan-dashboard && python3 etl/poc_tiktok_reply.py
  3) Lee el veredicto en pantalla y abre los borradores en:
        etl/poc_tiktok_reply_drafts.csv   (para revisar/aprobar en Excel)
        etl/poc_tiktok_reply_drafts.json

Dependencias: solo `requests` (ya está en etl/requirements.txt). El LLM se llama
por HTTP (API de Groq compatible con OpenAI), sin instalar nada extra.

Marca Ofero (guardrails críticos): los productos NUNCA se llaman "moto" — son
VELMPU (Vehículos Eléctricos Livianos de Movilidad Personal). Diferencial legal
(ley 2486/2025): no requieren SOAT, matrícula ni licencia.
"""

import csv
import json
import os
import sys
import time
from datetime import date, timedelta
import requests

BASE_URL = "https://business-api.tiktok.com/open_api/v1.3"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# Cuántos borradores generar como máximo en el POC.
MAX_DRAFTS = 8
# Cuántos grupos de anuncios revisar (acota la carga y evita timeouts 51010).
MAX_ADGROUPS = 12
PAGE_SIZE = 50

WA_NUMBER = "573024094822"  # WhatsApp nacional de Ofero
WA_LINK = f"https://wa.me/{WA_NUMBER}"


# ─────────────────────────────────────────────────────────────────────────────
# Infra mínima
# ─────────────────────────────────────────────────────────────────────────────
def _env(name, required=True, default=None):
    v = os.environ.get(name, default)
    if required and not v:
        print(f"❌ Falta la variable de entorno {name}. Mira el encabezado del archivo.")
        sys.exit(1)
    return v


def api_get(path, token, params):
    """GET a la Marketing API con el header Access-Token. Devuelve (code, data, msg)."""
    try:
        r = requests.get(f"{BASE_URL}{path}", headers={"Access-Token": token},
                         params=params, timeout=60)
        j = r.json()
        return int(j.get("code", -1)), (j.get("data") or {}), j.get("message", "")
    except Exception as e:
        return -1, {}, f"excepción local: {e}"


def _s(x):
    return str(x if x is not None else "").strip()


def _i(x):
    try:
        return int(x)
    except Exception:
        return 0


# ─────────────────────────────────────────────────────────────────────────────
# A) PRUEBA DE VIABILIDAD
# ─────────────────────────────────────────────────────────────────────────────
def check_identities(token, adv):
    """Lista las identidades con las que se podría responder. Para responder,
    TikTok exige una identidad TT_USER o CUSTOMIZED_USER con permiso de
    'comment management'. Las identidades BC_AUTH_TT (autorizadas por Business
    Center) suelen NO poder responder por API: lo marcamos."""
    code, data, msg = api_get("/identity/get/", token, {"advertiser_id": adv})
    ids = data.get("identity_list", []) if code == 0 else []
    print("\n── A1. Identidades disponibles para responder ──")
    if code != 0:
        print(f"   ⚠ No se pudo leer /identity/get/ (code={code}): {msg}")
        return {"ok": False, "identities": [], "has_repliable": False, "all_bc": False}
    if not ids:
        print("   ⚠ No hay identidades listadas. Sin identidad NO se puede responder.")
        return {"ok": True, "identities": [], "has_repliable": False, "all_bc": False}
    repliable_types = {"TT_USER", "CUSTOMIZED_USER"}
    has_repliable = False
    all_bc = True
    for it in ids:
        t = _s(it.get("identity_type"))
        name = _s(it.get("display_name")) or _s(it.get("identity_id"))
        if t in repliable_types:
            has_repliable = True
        if t != "BC_AUTH_TT":
            all_bc = False
        flag = "✅ puede responder" if t in repliable_types else \
               ("⛔ BC_AUTH_TT (probable bloqueo)" if t == "BC_AUTH_TT" else "❔ revisar")
        print(f"   • {name}  [{t}]  {flag}")
    return {"ok": True, "identities": ids, "has_repliable": has_repliable, "all_bc": all_bc}


def get_adgroup_ids(token, adv):
    code, data, msg = api_get("/adgroup/get/", token,
                              {"advertiser_id": adv, "page": 1, "page_size": 100})
    if code != 0:
        print(f"   ⚠ No se pudieron leer grupos de anuncios (code={code}): {msg}")
        return []
    rows = data.get("list", []) or []
    # Preferimos grupos activos (más probable que tengan comentarios recientes).
    active = [r for r in rows if _s(r.get("operation_status")).upper() in ("ENABLE", "")]
    ids = [_s(r.get("adgroup_id")) for r in (active or rows) if r.get("adgroup_id")]
    return ids[:MAX_ADGROUPS]


def fetch_comments(token, adv, adgroup_ids):
    """Trae comentarios de los primeros grupos (1 página por grupo para el POC).
    El endpoint EXIGE start_time/end_time (formato YYYY-MM-DD). Usamos una ventana
    corta de 7 días para traer comentarios recientes sin saturar la API (51010)."""
    end_time = date.today().isoformat()
    start_time = (date.today() - timedelta(days=7)).isoformat()
    out = {}
    for ag in adgroup_ids:
        code, data, msg = api_get("/comment/list/", token, {
            "advertiser_id": adv,
            "search_field": "ADGROUP_ID",
            "search_value": ag,
            "start_time": start_time,
            "end_time": end_time,
            "page": 1,
            "page_size": PAGE_SIZE,
        })
        if code != 0:
            # 51010 = timeout transitorio del backend de TikTok.
            print(f"   ⚠ /comment/list/ grupo {ag}: code={code} {msg}")
            continue
        items = data.get("comments") or data.get("comment_list") or []
        for it in items:
            cid = _s(it.get("comment_id"))
            if not cid:
                continue
            out[cid] = {
                "comment_id": cid,
                "ad_id": _s(it.get("ad_id")),
                "adgroup_id": _s(it.get("adgroup_id")) or ag,
                "campaign_name": _s(it.get("campaign_name")),
                "author": _s(it.get("user_name")),
                "content": _s(it.get("content")),
                "likes": _i(it.get("likes")),
                "replies": _i(it.get("replies")),
                "parent_comment_id": _s(it.get("original_comment_id")),
                "comment_status": _s(it.get("comment_status")),
            }
        time.sleep(0.2)
    return list(out.values())


# ─────────────────────────────────────────────────────────────────────────────
# B) GENERACIÓN DE BORRADORES (plantillas + LLM con guardrails Ofero)
# ─────────────────────────────────────────────────────────────────────────────
def classify(text):
    """Clasificación simple por intención para decidir plantilla vs IA vs ocultar."""
    t = text.lower()
    spam = any(w in t for w in ("http://", "https://", "www.", "telegram", "whatsapp +",
                                "gana dinero", "inversion", "invierte", "casino", "loteria"))
    insulto = any(w in t for w in ("estafa", "ladron", "robo", "basura", "porqueria",
                                   "idiota", "estupido", "mierda"))
    if spam:
        return "spam"
    if insulto:
        return "queja"
    if any(w in t for w in ("precio", "cuanto", "cuánto", "vale", "valor", "cuesta", "$")):
        return "precio"
    if any(w in t for w in ("tienda", "donde", "dónde", "ciudad", "ubicacion", "ubicación",
                            "direccion", "dirección", "local")):
        return "tienda"
    if any(w in t for w in ("licencia", "soat", "placa", "matricula", "matrícula",
                            "papeles", "pico y placa", "multa")):
        return "legal"
    if any(w in t for w in ("hay", "disponible", "stock", "envio", "envío", "domicilio",
                            "financi", "cuota", "credito", "crédito")):
        return "disponibilidad"
    return "otro"


TEMPLATES = {
    "precio": f"¡Hola! 🙌 Con gusto te pasamos precios y promos al día. Escríbenos a WhatsApp {WA_LINK} y te atiende un asesor de tu ciudad.",
    "tienda": f"¡Hola! 📍 Tenemos tiendas en varias ciudades. ¿De dónde nos escribes? Cuéntanos por WhatsApp {WA_LINK} y te decimos la más cercana.",
    "legal": f"¡Hola! 👌 Nuestros vehículos eléctricos livianos (VELMPU) NO requieren licencia, SOAT ni matrícula (ley 2486). Te explicamos todo por WhatsApp {WA_LINK}.",
    "disponibilidad": f"¡Hola! ✅ Sí manejamos disponibilidad y opciones de financiación. Escríbenos a WhatsApp {WA_LINK} y un asesor te ayuda.",
}

# Acciones sugeridas por intención (el humano decide; aquí solo se propone).
ACTION = {
    "spam": "ocultar",
    "queja": "responder con tacto / escalar",
}


def groq_reply(groq_key, model, comment):
    """Pide al LLM un borrador respetando los guardrails de Ofero. Devuelve str o None."""
    system = (
        "Eres el community manager de Ofero (Colombia), marca de VEHÍCULOS ELÉCTRICOS "
        "LIVIANOS (VELMPU) y scooters. Respondes comentarios de anuncios en TikTok.\n"
        "REGLAS INQUEBRANTABLES:\n"
        "1) NUNCA digas 'moto' ni 'motocicleta'. Son 'vehículos eléctricos' o 'VELMPU'.\n"
        "2) Diferencial legal: no requieren SOAT, matrícula ni licencia (ley 2486). "
        "Puedes mencionarlo si viene al caso.\n"
        "3) NO inventes precios ni especificaciones. Si preguntan precio/stock, invita a "
        f"WhatsApp {WA_LINK} para hablar con un asesor de su ciudad.\n"
        "4) Tono cálido, colombiano, cercano y BREVE (máx ~250 caracteres). Máx 1 emoji.\n"
        "5) Si el comentario es ofensivo o spam, responde con tacto o sugiere ignorar; "
        "nunca discutas.\n"
        "Devuelve SOLO el texto de la respuesta, sin comillas ni explicaciones."
    )
    try:
        r = requests.post(GROQ_URL,
            headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "temperature": 0.4,
                "max_tokens": 160,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": f"Comentario del usuario: «{comment}»\nRedacta la respuesta:"},
                ],
            }, timeout=40)
        j = r.json()
        txt = j["choices"][0]["message"]["content"].strip()
        # Red de seguridad por si el modelo se salta la regla #1.
        if "moto" in txt.lower():
            txt = txt.replace("motocicletas", "vehículos").replace("motocicleta", "vehículo")
            txt = txt.replace("Motos", "Vehículos").replace("motos", "vehículos")
            txt = txt.replace("moto", "vehículo")
        return txt
    except Exception as e:
        print(f"   ⚠ Groq falló para un comentario: {e}")
        return None


def build_drafts(comments, groq_key, model):
    # Solo comentarios de PRIMER NIVEL (sin padre) y SIN responder aún.
    candidates = [c for c in comments
                  if not c["parent_comment_id"] and c["replies"] == 0
                  and c["content"] and c["comment_status"].lower() not in ("hidden", "deleted")]
    candidates.sort(key=lambda c: c["likes"], reverse=True)  # primero los más visibles
    drafts = []
    for c in candidates[:MAX_DRAFTS]:
        intent = classify(c["content"])
        action = ACTION.get(intent, "responder")
        if intent == "spam":
            draft = ""  # no se responde al spam, se oculta
        elif intent in TEMPLATES:
            draft = TEMPLATES[intent]
        elif groq_key:
            draft = groq_reply(groq_key, model, c["content"]) or \
                    f"¡Hola! 🙌 Gracias por tu comentario. Escríbenos a WhatsApp {WA_LINK} y te ayudamos."
        else:
            draft = f"¡Hola! 🙌 Gracias por escribir. Cuéntanos más por WhatsApp {WA_LINK} y un asesor te atiende."
        drafts.append({**c, "intent": intent, "suggested_action": action, "draft_reply": draft})
    return drafts


# ─────────────────────────────────────────────────────────────────────────────
# 🚫 PUBLICAR — DESHABILITADO A PROPÓSITO
# ─────────────────────────────────────────────────────────────────────────────
def publish_reply(*args, **kwargs):
    """NO IMPLEMENTADO EN EL POC. Publicar en comentarios públicos es una acción
    de cara al público: se activa solo después de (1) confirmar el endpoint
    oficial de respuesta en el portal de TikTok, (2) pasar la prueba de
    viabilidad, y (3) definir el flujo de aprobación humana. La operación de
    respuesta de TikTok NO es idempotente: nunca reintentar a ciegas."""
    raise NotImplementedError("Publicar está deshabilitado en el POC (ver guardrails).")


# ─────────────────────────────────────────────────────────────────────────────
def main():
    token = _env("TIKTOK_ACCESS_TOKEN")
    adv = _env("TIKTOK_ADVERTISER_ID")
    groq_key = _env("GROQ_API_KEY", required=False)
    model = _env("LLM_MODEL", required=False, default="llama-3.3-70b-versatile")

    print("=" * 70)
    print("POC · Bot de respuestas a comentarios de TikTok (Ofero) — NO PUBLICA")
    print("=" * 70)

    # A) Viabilidad
    idinfo = check_identities(token, adv)

    print("\n── A2. Lectura de comentarios ──")
    adgroups = get_adgroup_ids(token, adv)
    if not adgroups:
        print("   ⚠ No se hallaron grupos de anuncios. Sin ellos no hay comentarios que leer.")
    comments = fetch_comments(token, adv, adgroups) if adgroups else []
    print(f"   • Grupos revisados: {len(adgroups)} · comentarios leídos: {len(comments)}")

    print("\n── A3. VEREDICTO DE VIABILIDAD ──")
    if idinfo["has_repliable"]:
        print("   ✅ Hay una identidad TT_USER/CUSTOMIZED_USER → responder por API es PROBABLE.")
    elif idinfo["all_bc"] and idinfo["identities"]:
        print("   ⛔ Todas las identidades son BC_AUTH_TT (autorizadas por Business Center).")
        print("      TikTok suele BLOQUEAR responder por API en este caso. Alternativas:")
        print("      - Pedir permiso de 'comment management' re-autorizando la app, o")
        print("      - Responder desde una identidad propia (TT_USER) de la cuenta de Ofero, o")
        print("      - Gestionar comentarios desde TikTok Ads Manager (manual/semi-manual).")
    else:
        print("   ❔ No se confirmó una identidad apta. Revisa permisos de la app")
        print("      ('comment management') y vuelve a correr la prueba.")
    print("   Nota: la confirmación 100% definitiva es UNA respuesta de prueba")
    print("   controlada (que publica), a aprobar aparte. El POC no la hace.")

    # B) Borradores (aunque responder esté bloqueado, sirve para ver la calidad)
    print("\n── B. BORRADORES DE RESPUESTA (no se publican) ──")
    if not comments:
        print("   (sin comentarios para redactar)")
        drafts = []
    else:
        drafts = build_drafts(comments, groq_key, model)
        if not groq_key:
            print("   (sin GROQ_API_KEY → solo plantillas FAQ; agrega la key para borradores con IA)")
        for i, d in enumerate(drafts, 1):
            print(f"\n   {i}. 💬 [{d['intent']}] @{d['author'] or 'usuario'}: {d['content'][:120]}")
            if d["draft_reply"]:
                print(f"      → ✍️  {d['draft_reply']}")
            print(f"      → acción sugerida: {d['suggested_action']}")

    # Guardar para revisión/aprobación
    here = os.path.dirname(os.path.abspath(__file__))
    if drafts:
        with open(os.path.join(here, "poc_tiktok_reply_drafts.json"), "w", encoding="utf-8") as f:
            json.dump(drafts, f, ensure_ascii=False, indent=2)
        cols = ["comment_id", "author", "content", "intent", "suggested_action",
                "draft_reply", "likes", "campaign_name", "ad_id", "adgroup_id"]
        with open(os.path.join(here, "poc_tiktok_reply_drafts.csv"), "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
            w.writeheader()
            for d in drafts:
                w.writerow(d)
        print(f"\n✅ Borradores guardados en etl/poc_tiktok_reply_drafts.csv y .json "
              f"({len(drafts)} filas) — revísalos y aprueba antes de publicar nada.")
    print("\nListo. Nada se publicó en TikTok.")


if __name__ == "__main__":
    main()
