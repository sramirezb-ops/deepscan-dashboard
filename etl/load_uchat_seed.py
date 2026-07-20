"""
Carga INICIAL del diagnóstico del bot a Supabase — de una sola vez.

Toma los JSON ya analizados localmente (impedimentos + snapshot) y los sube
a la tabla uchat_bot_diagnostics para el cliente Ofero. NO vuelve a llamar a
UChat (evita el rate-limit): reusa lo ya calculado.

Requiere en el entorno:
  SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SERVICE_KEY.

Uso:
  export $(grep -E '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_KEY)=' frontend/.env.local | xargs)
  python etl/load_uchat_seed.py
"""
from __future__ import annotations

import json
import os
import sys

from supabase import create_client

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMP_PATH = os.path.join(ROOT, "frontend", "lib", "preview", "ofero_impediments.json")
SNAP_PATH = os.path.join(ROOT, "frontend", "lib", "preview", "ofero_uchat.json")
OFERO_SLUG = "ofero-colombia"


def main():
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("FALTA SUPABASE_URL / SUPABASE_SERVICE_KEY en el entorno.", file=sys.stderr)
        sys.exit(2)

    sb = create_client(url, key)

    # client_id de Ofero (por slug)
    res = sb.table("clients").select("id,name,enabled_channels").eq("slug", OFERO_SLUG).single().execute()
    if not res.data:
        print(f"No encontré el cliente '{OFERO_SLUG}' en la tabla clients.", file=sys.stderr)
        sys.exit(1)
    client_id = res.data["id"]
    print(f"Cliente: {res.data.get('name')} ({client_id})")

    # Activa el canal 'bot' en el menú de Ofero (si no está).
    channels = res.data.get("enabled_channels") or []
    if isinstance(channels, list) and "bot" not in channels:
        sb.table("clients").update({"enabled_channels": channels + ["bot"]}).eq("id", client_id).execute()
        print("✓ Canal 'bot' activado en el menú de Ofero.")

    imp = json.load(open(IMP_PATH, encoding="utf-8"))
    snap = json.load(open(SNAP_PATH, encoding="utf-8"))
    period = imp.get("period")
    if not period:
        print("El JSON de impedimentos no trae 'period'.", file=sys.stderr)
        sys.exit(1)

    row = {"client_id": client_id, "period": period, "impediments": imp, "snapshot": snap}
    sb.table("uchat_bot_diagnostics").upsert(row, on_conflict="client_id,period").execute()
    print(f"✓ Cargado diagnóstico de {period} "
          f"({imp.get('total_conversations')} conversaciones) para Ofero.")


if __name__ == "__main__":
    main()
