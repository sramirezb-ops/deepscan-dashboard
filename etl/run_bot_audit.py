#!/usr/bin/env python3
"""
Runner semanal de la auditoría del bot con IA (Fase 1).
Lee una muestra de conversaciones de UChat, las hace auditar por el LLM y guarda
el resultado en uchat_bot_audit (una fila por cliente × semana ISO).

Se dispara desde .github/workflows/etl_bot_audit_weekly.yml (cron semanal).
Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, UCHAT_API_TOKEN, GROQ_API_KEY,
     DEFAULT_CLIENT_ID (o OFERO_CLIENT_ID).
"""
import logging
import os
import sys

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("bot_audit")


def main() -> int:
    client_id = (os.environ.get("DEFAULT_CLIENT_ID") or os.environ.get("OFERO_CLIENT_ID") or "").strip()
    if not client_id:
        log.error("Falta DEFAULT_CLIENT_ID / OFERO_CLIENT_ID"); return 1

    from extractors.uchat_bot_audit import run_bot_audit
    row = run_bot_audit(client_id)
    if not row:
        log.info("Sin auditoría (faltó key/token o muestra insuficiente). Nada que guardar.")
        return 0

    from supabase import create_client
    url = os.environ["SUPABASE_URL"]
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_KEY"]
    sb = create_client(url, key)
    sb.table("uchat_bot_audit").upsert(row, on_conflict="client_id,period").execute()
    p = row["payload"]
    log.info(f"✅ Guardado uchat_bot_audit · {row['period']} · {p['analyzed']} auditadas · "
             f"{p['prospectos']['count']} prospectos perdidos · {len(p['trabas'])} trabas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
