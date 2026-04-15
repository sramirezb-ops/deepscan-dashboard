"""
Extractores: GA4, Google Merchant Center, Shopify, Microsoft Clarity
"""

import csv
import logging
import time
from datetime import date, timedelta
from typing import Any

log = logging.getLogger(__name__)


# ════════════════════════════════════════════════════════════════
# GOOGLE ANALYTICS 4
# ════════════════════════════════════════════════════════════════

def extract_ga4(
    property_id: str,
    credentials_path: str,
    date_from: date,
    date_to: date
) -> tuple[list[dict], list[dict]]:
    """
    Extrae métricas diarias de GA4 y el funnel de conversión.
    Usa google-analytics-data SDK.
    """
    import os
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path

    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (
        RunReportRequest, DateRange, Dimension, Metric, OrderBy
    )

    client = BetaAnalyticsDataClient()

    # ── Métricas diarias ──────────────────────────────────────
    metrics_request = RunReportRequest(
        property=f"properties/{property_id}",
        dimensions=[
            Dimension(name="date"),
            Dimension(name="sessionDefaultChannelGrouping"),
        ],
        metrics=[
            Metric(name="sessions"),
            Metric(name="newUsers"),
            Metric(name="activeUsers"),
            Metric(name="bounceRate"),
            Metric(name="averageSessionDuration"),
            Metric(name="conversions"),
            Metric(name="sessionConversionRate"),
            Metric(name="totalRevenue"),
        ],
        date_ranges=[DateRange(
            start_date=str(date_from),
            end_date=str(date_to)
        )],
        order_bys=[OrderBy(dimension=OrderBy.DimensionOrderBy(dimension_name="date"))],
        limit=50000,
    )

    resp = client.run_report(metrics_request)
    metrics_rows = []
    for row in resp.rows:
        dims = [d.value for d in row.dimension_values]
        mets = [m.value for m in row.metric_values]
        metrics_rows.append({
            "date":                 dims[0],
            "source_medium":        dims[1],
            "sessions":             int(mets[0] or 0),
            "new_users":            int(mets[1] or 0),
            "active_users":         int(mets[2] or 0),
            "bounce_rate":          round(float(mets[3] or 0), 4),
            "avg_session_duration": round(float(mets[4] or 0), 2),
            "conversions":          int(float(mets[5] or 0)),
            "conv_rate":            round(float(mets[6] or 0), 4),
            "revenue":              round(float(mets[7] or 0), 2),
        })

    # ── Funnel de conversión (eventos clave) ──────────────────
    funnel_request = RunReportRequest(
        property=f"properties/{property_id}",
        dimensions=[Dimension(name="date")],
        metrics=[
            Metric(name="sessions"),
            Metric(name="ecommercePurchases"),
        ],
        date_ranges=[DateRange(
            start_date=str(date_from),
            end_date=str(date_to)
        )],
        limit=50000,
    )

    # Para el funnel completo usamos eventos específicos
    funnel_events = {
        "view_item":          "product_views",
        "add_to_cart":        "add_to_cart",
        "begin_checkout":     "checkout_start",
        "purchase":           "purchases",
    }

    # Agregar un reporte por evento para construir el funnel
    funnel_by_date: dict[str, dict] = {}

    for event_name, field_name in funnel_events.items():
        event_request = RunReportRequest(
            property=f"properties/{property_id}",
            dimensions=[Dimension(name="date")],
            metrics=[Metric(name="eventCount")],
            date_ranges=[DateRange(
                start_date=str(date_from),
                end_date=str(date_to)
            )],
            dimension_filter={
                "filter": {
                    "field_name": "eventName",
                    "string_filter": {"value": event_name, "match_type": "EXACT"}
                }
            },
            limit=50000,
        )
        try:
            ev_resp = client.run_report(event_request)
            for row in ev_resp.rows:
                d = row.dimension_values[0].value
                if d not in funnel_by_date:
                    funnel_by_date[d] = {}
                funnel_by_date[d][field_name] = int(row.metric_values[0].value or 0)
        except Exception as e:
            log.warning(f"   GA4 evento {event_name}: {e}")

    # Añadir sesiones al funnel
    funnel_resp = client.run_report(funnel_request)
    for row in funnel_resp.rows:
        d = row.dimension_values[0].value
        if d not in funnel_by_date:
            funnel_by_date[d] = {}
        funnel_by_date[d]["sessions"] = int(row.metric_values[0].value or 0)

    funnel_rows = []
    for d, vals in sorted(funnel_by_date.items()):
        funnel_rows.append({
            "date":           d,
            "sessions":       vals.get("sessions", 0),
            "product_views":  vals.get("product_views", 0),
            "add_to_cart":    vals.get("add_to_cart", 0),
            "checkout_start": vals.get("checkout_start", 0),
            "purchases":      vals.get("purchases", 0),
        })

    log.info(f"   GA4 métricas: {len(metrics_rows)} filas, funnel: {len(funnel_rows)} días")
    return metrics_rows, funnel_rows


# ════════════════════════════════════════════════════════════════
# GOOGLE MERCHANT CENTER
# ════════════════════════════════════════════════════════════════

def extract_gmc(merchant_id: str, credentials_path: str) -> list[dict]:
    """
    Extrae el estado del feed de productos desde Google Merchant Center API.
    Requiere: google-api-python-client + credenciales de service account con
    acceso a Content API for Shopping.
    """
    import os
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path

    from googleapiclient.discovery import build
    from google.oauth2 import service_account

    SCOPES = ["https://www.googleapis.com/auth/content"]
    creds = service_account.Credentials.from_service_account_file(
        credentials_path, scopes=SCOPES
    )
    service = build("content", "v2.1", credentials=creds)

    rows  = []
    token = None

    while True:
        req = service.productstatuses().list(
            merchantId=merchant_id,
            maxResults=250,
            pageToken=token
        )
        resp = req.execute()
        resources = resp.get("resources", [])

        for p in resources:
            product_id = p.get("productId", "")
            title      = p.get("title", "")
            status_raw = p.get("destinationStatuses", [])

            # Determinar estado general del producto
            if any(s.get("status") == "approved" for s in status_raw):
                status = "APPROVED"
            elif any(s.get("status") == "disapproved" for s in status_raw):
                status = "DISAPPROVED"
            else:
                status = "PENDING"

            # Recopilar issues
            issues = [
                {
                    "code":        i.get("code", ""),
                    "description": i.get("description", ""),
                    "severity":    i.get("severity", ""),
                }
                for i in p.get("itemLevelIssues", [])
            ]

            rows.append({
                "product_id": product_id,
                "title":      title,
                "brand":      "",      # disponible en products().get() si se necesita
                "price":      0,
                "status":     status,
                "issues":     issues,
                "clicks":     0,       # se puede cruzar con Search Console o Shopping report
                "impressions":0,
                "ctr":        0,
            })

        token = resp.get("nextPageToken")
        if not token:
            break
        time.sleep(0.2)

    log.info(f"   GMC: {len(rows)} productos")
    return rows


# ════════════════════════════════════════════════════════════════
# SHOPIFY
# ════════════════════════════════════════════════════════════════

def extract_shopify(
    shop_url: str,
    access_token: str,
    date_from: date,
    date_to: date
) -> tuple[list[dict], list[dict], list[dict]]:
    """
    Extrae órdenes, productos top y funnel desde Shopify Admin API (REST).
    shop_url: mi-tienda.myshopify.com  (sin https://)
    """
    import requests as req

    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
    }
    base = f"https://{shop_url}/admin/api/2024-01"

    # ── Órdenes ───────────────────────────────────────────────
    orders_raw = []
    url = f"{base}/orders.json"
    params = {
        "status":       "any",
        "created_at_min": f"{date_from}T00:00:00-05:00",
        "created_at_max": f"{date_to}T23:59:59-05:00",
        "limit":        250,
        "fields":       "id,created_at,total_price,financial_status,customer,line_items",
    }

    while url:
        r = req.get(url, headers=headers, params=params)
        r.raise_for_status()
        data = r.json()
        orders_raw.extend(data.get("orders", []))

        # Paginación via Link header
        link = r.headers.get("Link", "")
        if 'rel="next"' in link:
            next_url = [p.split(";")[0].strip(" <>") for p in link.split(",") if 'rel="next"' in p]
            url = next_url[0] if next_url else None
            params = {}
        else:
            url = None
        time.sleep(0.3)

    # Agregar órdenes por día
    orders_by_date: dict[str, dict] = {}
    product_sales:  dict[str, dict] = {}

    for order in orders_raw:
        d = order["created_at"][:10]   # YYYY-MM-DD
        price = float(order.get("total_price", 0) or 0)
        is_new = not order.get("customer", {}).get("orders_count", 0) > 1

        if d not in orders_by_date:
            orders_by_date[d] = {
                "orders": 0, "revenue": 0,
                "new_customers": 0, "returning_customers": 0,
                "units_sold": 0, "refunds": 0
            }
        orders_by_date[d]["orders"]   += 1
        orders_by_date[d]["revenue"]  += price
        if is_new:
            orders_by_date[d]["new_customers"] += 1
        else:
            orders_by_date[d]["returning_customers"] += 1

        for item in order.get("line_items", []):
            pid = str(item.get("product_id", ""))
            qty = int(item.get("quantity", 0))
            item_price = float(item.get("price", 0) or 0) * qty
            orders_by_date[d]["units_sold"] += qty

            if pid not in product_sales:
                product_sales[pid] = {
                    "product_id": pid,
                    "title":      item.get("title", ""),
                    "sku":        item.get("sku", ""),
                    "revenue":    0,
                    "units_sold": 0,
                    "orders":     0,
                }
            product_sales[pid]["revenue"]    += item_price
            product_sales[pid]["units_sold"] += qty
            product_sales[pid]["orders"]     += 1

    orders_rows = []
    for d, v in sorted(orders_by_date.items()):
        avg = round(v["revenue"] / v["orders"], 2) if v["orders"] > 0 else 0
        orders_rows.append({
            "date":                d,
            "orders":              v["orders"],
            "revenue":             round(v["revenue"], 2),
            "avg_order_value":     avg,
            "new_customers":       v["new_customers"],
            "returning_customers": v["returning_customers"],
            "units_sold":          v["units_sold"],
            "refunds":             v["refunds"],
        })

    # Productos top (período completo)
    period_start = str(date_from)
    period_end   = str(date_to)
    product_rows = []
    for p in product_sales.values():
        avg_price = round(p["revenue"] / p["units_sold"], 2) if p["units_sold"] > 0 else 0
        product_rows.append({
            "period_start": period_start,
            "period_end":   period_end,
            "product_id":   p["product_id"],
            "title":        p["title"],
            "sku":           p["sku"],
            "revenue":       round(p["revenue"], 2),
            "units_sold":    p["units_sold"],
            "orders":        p["orders"],
            "avg_price":     avg_price,
            "conv_rate":     0,   # se calcula cruzando con GA4 si se necesita
        })

    # Funnel Shopify — estimado desde checkout API
    # (Shopify no expone funnel nativo via REST; usamos datos de órdenes + abandono)
    funnel_rows = []
    for d in sorted(orders_by_date.keys()):
        orders_count = orders_by_date[d]["orders"]
        # Estimaciones conservadoras basadas en promedios de Shopify ecommerce
        # Estas se reemplazarán con datos reales de GA4 cuando se crucen
        funnel_rows.append({
            "date":                  d,
            "sessions":              0,       # se rellena con GA4
            "product_views":         0,
            "add_to_cart":           0,
            "checkout_start":        0,
            "orders":                orders_count,
            "abandoned_cart_value":  0,       # disponible via Shopify AbandonedCheckouts API
        })

    log.info(f"   Shopify: {len(orders_rows)} días, {len(product_rows)} productos")
    return orders_rows, product_rows, funnel_rows


# ════════════════════════════════════════════════════════════════
# MICROSOFT CLARITY
# ════════════════════════════════════════════════════════════════

def extract_clarity(csv_path: str) -> tuple[list[dict], list[dict]]:
    """
    Microsoft Clarity no tiene API pública robusta.
    Lee el CSV exportado manualmente desde el panel de Clarity.
    Formato esperado: Date, Sessions, ScrollDepth, DeadClicks, RageClicks, QuickBack, Page
    """
    metrics_by_date: dict[str, list] = {}
    pages_rows = []

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Normalizar headers
            r = {k.strip().lower().replace(" ", "_"): v.strip() for k, v in row.items()}

            d     = r.get("date", "")
            page  = r.get("page", r.get("url", ""))

            if not d:
                continue

            try:
                sessions     = int(r.get("sessions", 0) or 0)
                scroll       = float(r.get("scroll_depth", r.get("scrolldepth", 0)) or 0) / 100
                dead_clicks  = float(r.get("dead_clicks", r.get("deadclicks", 0)) or 0) / 100
                rage_clicks  = float(r.get("rage_clicks", r.get("rageclicks", 0)) or 0) / 100
                quick_back   = float(r.get("quick_back", r.get("quickback", 0)) or 0) / 100
                exit_rate    = float(r.get("exit_rate", r.get("exitrate", 0)) or 0) / 100
            except (ValueError, TypeError):
                continue

            # Agregar por fecha
            if d not in metrics_by_date:
                metrics_by_date[d] = []
            metrics_by_date[d].append({
                "sessions":       sessions,
                "scroll_depth":   scroll,
                "dead_click_rate":dead_clicks,
                "rage_click_rate":rage_clicks,
                "quick_back_rate":quick_back,
            })

            # Por página
            if page:
                pages_rows.append({
                    "date":           d,
                    "page_url":       page,
                    "sessions":       sessions,
                    "scroll_depth":   scroll,
                    "dead_clicks":    int(dead_clicks * sessions),
                    "rage_clicks":    int(rage_clicks * sessions),
                    "exit_rate":      exit_rate,
                })

    # Consolidar métricas diarias como promedio ponderado
    metrics_rows = []
    for d, items in sorted(metrics_by_date.items()):
        total_sessions = sum(i["sessions"] for i in items) or 1
        metrics_rows.append({
            "date":             d,
            "sessions":         total_sessions,
            "scroll_depth":     round(
                sum(i["scroll_depth"] * i["sessions"] for i in items) / total_sessions, 4
            ),
            "dead_click_rate":  round(
                sum(i["dead_click_rate"] * i["sessions"] for i in items) / total_sessions, 4
            ),
            "rage_click_rate":  round(
                sum(i["rage_click_rate"] * i["sessions"] for i in items) / total_sessions, 4
            ),
            "quick_back_rate":  round(
                sum(i["quick_back_rate"] * i["sessions"] for i in items) / total_sessions, 4
            ),
        })

    log.info(f"   Clarity: {len(metrics_rows)} días, {len(pages_rows)} páginas")
    return metrics_rows, pages_rows
