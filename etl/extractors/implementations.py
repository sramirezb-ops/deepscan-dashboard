"""
Extractor: Bitácora de implementaciones (Google Sheet → tabla implementations)

Lee una pestaña de un Google Sheet PÚBLICO donde la agencia anota, a mano, lo
que fue haciendo en las cuentas: "subimos 3 creativos", "pausamos campaña X",
"bajamos presupuesto 30 %". Una fila del sheet = una implementación.

El dashboard cruza esas filas con la tendencia diaria y dibuja marcadores sobre
la curva, para ver la CAUSA detrás de cada cambio. El front solo lee; esta hoja
es la forma cómoda de que el equipo escriba sin tocar Supabase.

Columnas esperadas en la hoja (encabezados, sin acentos, en la fila 1):
    fecha     → 2026-05-20  ó  20/05/2026   (obligatoria)
    canal     → tiktok | meta | google | global   (default: global)
    titulo    → texto corto de la acción          (obligatorio)
    detalle   → descripción larga (opcional)
    tipo      → creativo | presupuesto | segmentacion | puja | pausa |
                activacion | landing | otro        (opcional)

Filas sin fecha o sin título se ignoran (líneas de relleno). Es best-effort: si
la hoja no existe o está vacía, devuelve [] y el ETL sigue sin romperse.
"""

import logging

# Reutilizamos el lector de CSV público ya probado del extractor de sheets.
from extractors.google_sheets import _read_sheet_csv

log = logging.getLogger(__name__)

# Canales válidos (lo demás se normaliza a 'global' para no perder la fila).
_VALID_CHANNELS = {"tiktok", "meta", "google", "global"}

# Tipos sugeridos (no se fuerza: cualquier otro texto se conserva como viene).
_DEFAULT_KIND = "otro"


def _first(row: dict, *keys: str) -> str:
    """Primer valor no vacío entre varias posibles claves (tolera acentos)."""
    for k in keys:
        v = row.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return ""


def _norm_date(raw: str) -> str | None:
    """Normaliza la fecha a ISO 'YYYY-MM-DD'. Acepta:
       · ISO ya formado:        2026-05-20
       · Día/Mes/Año (es-CO):   20/05/2026  ó  20-05-2026
    Devuelve None si no se puede interpretar (la fila se descarta)."""
    s = (raw or "").strip()
    if not s:
        return None

    # ISO directo: empieza por año de 4 dígitos.
    if len(s) >= 10 and s[4] == "-" and s[:4].isdigit():
        return s[:10]

    # DD/MM/YYYY o DD-MM-YYYY (convención colombiana).
    sep = "/" if "/" in s else "-" if "-" in s else None
    if sep:
        parts = s.split(sep)
        if len(parts) == 3:
            d, m, y = parts
            d, m, y = d.strip(), m.strip(), y.strip()
            if len(y) == 2:               # 26 → 2026
                y = "20" + y
            if d.isdigit() and m.isdigit() and y.isdigit():
                try:
                    return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
                except ValueError:
                    return None
    log.warning(f"   bitácora: fecha no reconocida '{raw}' — fila omitida")
    return None


def extract_implementations(sheet_id: str, tab_name: str = "Bitacora") -> list[dict]:
    """Lee la pestaña de la bitácora y devuelve filas listas para
       loader.upsert('implementations', ...). Devuelve [] si no hay datos."""
    log.info(f"   Bitácora de implementaciones: {sheet_id} · pestaña '{tab_name}'")
    rows = _read_sheet_csv(sheet_id, tab_name)
    if not rows:
        log.warning("   bitácora: sin datos en la hoja")
        return []

    result: list[dict] = []
    for r in rows:
        date_iso = _norm_date(_first(r, "fecha", "date"))
        title    = _first(r, "titulo", "título", "title", "accion", "acción")
        # Una implementación necesita, como mínimo, cuándo y qué.
        if not date_iso or not title:
            continue

        channel = (_first(r, "canal", "channel") or "global").lower()
        if channel not in _VALID_CHANNELS:
            channel = "global"

        kind = (_first(r, "tipo", "kind", "type") or _DEFAULT_KIND).lower()

        result.append({
            "date":    date_iso,
            "channel": channel,
            "title":   title,
            "detail":  _first(r, "detalle", "detail", "descripcion", "descripción") or None,
            "kind":    kind,
        })

    log.info(f"   bitácora: {len(result)} implementaciones")
    return result
