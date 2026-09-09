"""
Extractor: AURA (venta real cobrada) desde Google Sheet.

AURA es el sistema de ventas del cliente. Su export (CSV) se pega a diario en un
Google Sheet PÚBLICO de lectura y se reemplaza completo cada día. Este extractor
lee esa hoja por CSV público (gviz, sin credenciales), clasifica cada fila y
devuelve las filas listas para sincronizar en `aura_sales`.

Formato de la hoja (columnas fijas, idénticas al export de AURA):
  Tipo, Folio, Fecha, Estado, Canal, Cliente, Importe, Cobrado, Pendiente, Vendedor

Se ignoran filas que no sean VENTA/ABONO (fila TOTAL, vacías, etc.).

Clasificación (bucket) — misma lógica que la "visibilidad" que se entrega:
  · cambio    → canal exchange
  · cowmmerce → canal marketplace / mercadolibre
  · prueba    → importe <= 50 (órdenes de test)
  · medicion  → el resto (venta nueva cobrada, el north-star)

El ETL hace delete_for_client('aura_sales') + upsert, así que reemplazar la hoja
sincroniza (los cambios pendiente→pagado y las bajas se reflejan solos). Los
duplicados exactos (mismo Tipo|Folio|Fecha|Importe) colapsan por `row_key`.
"""

import csv
import io
import logging
from datetime import datetime

import requests

log = logging.getLogger(__name__)

_CAMBIO = {"exchange"}
_COWMMERCE = {"marketplace", "mercadolibre"}
_PRUEBA_MAX = 50.0


def _num(val) -> float:
    try:
        return float(str(val).replace(",", "").replace("$", "").strip() or 0)
    except (ValueError, TypeError):
        return 0.0


def _parse_fecha(raw: str):
    """AURA da 'YYYY-MM-DD H:MM' (hora sin cero a la izquierda) o solo fecha."""
    raw = (raw or "").strip()
    if not raw:
        return None, None
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(raw, fmt)
            return dt.isoformat(), dt.date().isoformat()
        except ValueError:
            continue
    # Último recurso: los primeros 10 chars como fecha.
    return raw, (raw[:10] if len(raw) >= 10 else None)


def _bucket(canal: str, importe: float) -> str:
    c = (canal or "").strip().lower()
    if c in _CAMBIO:
        return "cambio"
    if c in _COWMMERCE:
        return "cowmmerce"
    if importe <= _PRUEBA_MAX:
        return "prueba"
    return "medicion"


def _read_sheet_csv(sheet_id: str) -> list[dict]:
    """Lee la primera pestaña de un Google Sheet público como CSV (gviz)."""
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    text = resp.text
    if not text or len(text) < 10:
        return []
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for row in reader:
        # Normaliza claves: quita BOM y espacios, respeta los nombres originales.
        rows.append({(k or "").replace("﻿", "").strip(): (v or "").strip()
                     for k, v in row.items()})
    return rows


def extract_aura(sheet_id: str) -> list[dict]:
    """Devuelve las filas de venta AURA clasificadas, listas para `aura_sales`."""
    if not sheet_id:
        return []
    log.info(f"   AURA sheet: {sheet_id}")
    raw = _read_sheet_csv(sheet_id)
    out = []
    for r in raw:
        tipo = (r.get("Tipo") or "").strip().upper()
        if tipo not in ("VENTA", "ABONO"):
            continue  # ignora fila TOTAL, vacías, etc.
        folio = (r.get("Folio") or "").strip()
        importe = _num(r.get("Importe"))
        cobrado = _num(r.get("Cobrado"))
        pendiente = _num(r.get("Pendiente"))
        fecha_raw = (r.get("Fecha") or "").strip()
        fecha_iso, fecha_date = _parse_fecha(fecha_raw)
        canal = (r.get("Canal") or "").strip().lower()
        out.append({
            "row_key": f"{tipo}|{folio}|{fecha_raw}|{importe:.2f}",
            "folio": folio,
            "fecha": fecha_iso,
            "fecha_date": fecha_date,
            "tipo": tipo,
            "estado": (r.get("Estado") or "").strip(),
            "canal": canal,
            "cliente": (r.get("Cliente") or "").strip(),
            "importe": importe,
            "cobrado": cobrado,
            "pendiente": pendiente,
            "vendedor": (r.get("Vendedor") or "").strip(),
            "bucket": _bucket(canal, importe),
        })
    log.info(f"   AURA: {len(out)} filas de venta procesadas")
    return out
