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


def extract_ga4_cities(
    property_id: str,
    credentials_path: str,
    date_from: date,
    date_to: date
) -> list[dict]:
    """
    Extrae el detalle diario por ciudad (país + ciudad) desde GA4.
    Una fila = (fecha × país × ciudad). Permite replicar el panel de Looker
    "¿Desde qué ciudades visitan la Web?" y su mapa. 100% dato real de GA4.

    Devuelve filas con: date, country, city, sessions, users, new_users, conversions.
    """
    import os
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path

    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (
        RunReportRequest, DateRange, Dimension, Metric, OrderBy
    )

    client = BetaAnalyticsDataClient()

    request = RunReportRequest(
        property=f"properties/{property_id}",
        dimensions=[
            Dimension(name="date"),
            Dimension(name="country"),
            Dimension(name="city"),
        ],
        metrics=[
            Metric(name="sessions"),
            Metric(name="activeUsers"),
            Metric(name="newUsers"),
            Metric(name="conversions"),
        ],
        date_ranges=[DateRange(start_date=str(date_from), end_date=str(date_to))],
        order_bys=[OrderBy(dimension=OrderBy.DimensionOrderBy(dimension_name="date"))],
        limit=100000,
    )

    resp = client.run_report(request)
    rows = []
    for row in resp.rows:
        dims = [d.value for d in row.dimension_values]
        mets = [m.value for m in row.metric_values]
        rows.append({
            "date":        dims[0],
            "country":     dims[1] or "(unknown)",
            "city":        dims[2] or "(unknown)",
            "sessions":    int(mets[0] or 0),
            "users":       int(mets[1] or 0),
            "new_users":   int(mets[2] or 0),
            "conversions": int(float(mets[3] or 0)),
        })

    log.info(f"   GA4 ciudades: {len(rows)} filas (fecha×país×ciudad)")
    return rows


def extract_ga4_items(
    property_id: str,
    credentials_path: str,
    date_from: date,
    date_to: date
) -> list[dict]:
    """
    Detalle diario POR PRODUCTO (item-scoped) desde GA4. Una fila =
    (fecha × nombre de producto). Permite ver, por par de tenis: cuántas veces
    se vio, cuántos se agregaron al carrito, cuántos llegaron a checkout,
    cuántos se compraron y su revenue. 100% dato real de GA4.

    Devuelve: date, item_name, items_viewed, items_added_to_cart,
    items_checked_out, items_purchased, item_revenue.
    """
    import os
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path

    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (
        RunReportRequest, DateRange, Dimension, Metric, OrderBy
    )

    client = BetaAnalyticsDataClient()

    request = RunReportRequest(
        property=f"properties/{property_id}",
        dimensions=[
            Dimension(name="date"),
            Dimension(name="itemName"),
        ],
        metrics=[
            Metric(name="itemsViewed"),
            Metric(name="itemsAddedToCart"),
            Metric(name="itemsCheckedOut"),
            Metric(name="itemsPurchased"),
            Metric(name="itemRevenue"),
        ],
        date_ranges=[DateRange(start_date=str(date_from), end_date=str(date_to))],
        order_bys=[OrderBy(dimension=OrderBy.DimensionOrderBy(dimension_name="date"))],
        limit=100000,
    )

    resp = client.run_report(request)
    rows = []
    for row in resp.rows:
        dims = [d.value for d in row.dimension_values]
        mets = [m.value for m in row.metric_values]
        item_name = dims[1] or "(not set)"
        if item_name == "(not set)":
            continue  # eventos sin producto asociado: no aportan al análisis por par
        rows.append({
            "date":                dims[0],
            "property_id":         str(property_id),  # separa las webs (Shopify vs otra)
            "item_name":           item_name,
            "items_viewed":        int(float(mets[0] or 0)),
            "items_added_to_cart": int(float(mets[1] or 0)),
            "items_checked_out":   int(float(mets[2] or 0)),
            "items_purchased":     int(float(mets[3] or 0)),
            "item_revenue":        round(float(mets[4] or 0), 2),
        })

    log.info(f"   GA4 productos (items): {len(rows)} filas (fecha×producto)")
    return rows


def extract_ga4_events(
    property_id: str,
    credentials_path: str,
    date_from: date,
    date_to: date
) -> list[dict]:
    """
    Extrae el conteo diario de eventos por nombre desde GA4.
    Una fila = (fecha × nombre de evento). Permite construir el funnel de
    leads de Looker (Escribir Correo = escribir_correo, Descargar Catálogo =
    descargar_catálogo, Clics a WhatsApp = clic_whatsapp + whatsapp_flotante)
    y listar cualquier evento clave nombrado. 100% dato real de GA4.

    No filtramos por nombre: traemos TODOS los eventos y el dashboard decide
    qué nombres agrupar en cada paso. Así no hay que tocar el ETL si cambian
    los eventos clave del cliente.

    Devuelve filas con: date, event_name, event_count, total_users,
    is_key_event (1 si GA4 lo marca como conversión/evento clave).
    """
    import os
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path

    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (
        RunReportRequest, DateRange, Dimension, Metric, OrderBy
    )

    client = BetaAnalyticsDataClient()

    request = RunReportRequest(
        property=f"properties/{property_id}",
        dimensions=[
            Dimension(name="date"),
            Dimension(name="eventName"),
        ],
        metrics=[
            Metric(name="eventCount"),
            Metric(name="totalUsers"),
            Metric(name="conversions"),  # eventos clave (conversiones) del evento
        ],
        date_ranges=[DateRange(start_date=str(date_from), end_date=str(date_to))],
        order_bys=[OrderBy(dimension=OrderBy.DimensionOrderBy(dimension_name="date"))],
        limit=100000,
    )

    resp = client.run_report(request)
    rows = []
    for row in resp.rows:
        dims = [d.value for d in row.dimension_values]
        mets = [m.value for m in row.metric_values]
        key_events = float(mets[2] or 0)
        rows.append({
            "date":         dims[0],
            "property_id":  str(property_id),  # separa las webs (Shopify vs otra)
            "event_name":   dims[1] or "(unknown)",
            "event_count":  int(mets[0] or 0),
            "total_users":  int(mets[1] or 0),
            "is_key_event": 1 if key_events > 0 else 0,
        })

    log.info(f"   GA4 eventos: {len(rows)} filas (fecha×evento)")
    return rows


def extract_ga4_pages(
    property_id: str,
    credentials_path: str,
    date_from: date,
    date_to: date
) -> tuple[list[dict], list[dict]]:
    """
    Extrae, desde GA4, dos reportes para entender la navegación web:

      1) top_pages   — páginas con más tráfico (fecha × ruta). Métricas:
         vistas, sesiones, usuarios, segundos de interacción, rebote y
         conversiones. Se agrega por ruta (colapsando títulos) guardando
         el título más visto y ponderando el rebote por sesiones.

      2) landing     — páginas de entrada (fecha × landing page): por dónde
         empiezan las sesiones, con rebote y conversiones (leads).

    100% dato real de GA4. NOTA: la exploración de ruta paso-a-paso (Sankey
    página→página) NO la expone la API estándar; requiere BigQuery a nivel
    evento, por eso no se incluye aquí.

    Devuelve (top_pages_rows, landing_rows).
    """
    import os
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path

    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (
        RunReportRequest, DateRange, Dimension, Metric, OrderBy
    )

    client = BetaAnalyticsDataClient()

    # ── 1) Páginas con más tráfico (fecha × ruta × título) ────────
    top_pages_rows: list[dict] = []
    try:
        req = RunReportRequest(
            property=f"properties/{property_id}",
            dimensions=[
                Dimension(name="date"),
                Dimension(name="pagePath"),
                Dimension(name="pageTitle"),
            ],
            metrics=[
                Metric(name="screenPageViews"),
                Metric(name="sessions"),
                Metric(name="activeUsers"),
                Metric(name="userEngagementDuration"),
                Metric(name="bounceRate"),
                Metric(name="conversions"),
            ],
            date_ranges=[DateRange(start_date=str(date_from), end_date=str(date_to))],
            order_bys=[OrderBy(dimension=OrderBy.DimensionOrderBy(dimension_name="date"))],
            limit=100000,
        )
        resp = client.run_report(req)

        # Agrega por (fecha, ruta): suma métricas, rebote ponderado por
        # sesiones y conserva el título con más vistas.
        agg: dict[tuple, dict] = {}
        for row in resp.rows:
            d = row.dimension_values[0].value
            path = row.dimension_values[1].value or "(not set)"
            title = row.dimension_values[2].value or ""
            m = [mv.value for mv in row.metric_values]
            views = int(m[0] or 0)
            sess = int(m[1] or 0)
            usrs = int(m[2] or 0)
            eng = float(m[3] or 0)
            bounce = float(m[4] or 0)
            conv = int(float(m[5] or 0))

            key = (d, path)
            g = agg.get(key)
            if g is None:
                g = {
                    "date": d, "page_path": path, "page_title": title,
                    "views": 0, "sessions": 0, "users": 0,
                    "engagement_seconds": 0.0, "_bounce_w": 0.0, "conversions": 0,
                    "_title_views": -1,
                }
                agg[key] = g
            g["views"] += views
            g["sessions"] += sess
            g["users"] += usrs
            g["engagement_seconds"] += eng
            g["_bounce_w"] += bounce * sess
            g["conversions"] += conv
            if views > g["_title_views"]:
                g["page_title"] = title
                g["_title_views"] = views

        for g in agg.values():
            sess = g["sessions"]
            top_pages_rows.append({
                "date": g["date"],
                "page_path": g["page_path"],
                "page_title": g["page_title"],
                "views": g["views"],
                "sessions": sess,
                "users": g["users"],
                "engagement_seconds": round(g["engagement_seconds"], 2),
                "bounce_rate": round(g["_bounce_w"] / sess, 4) if sess > 0 else 0,
                "conversions": g["conversions"],
            })
        log.info(f"   GA4 páginas top: {len(top_pages_rows)} filas (fecha×ruta)")
    except Exception as e:
        log.warning(f"   GA4 páginas top falló: {e}")

    # ── 2) Páginas de entrada (fecha × landing page) ──────────────
    landing_rows: list[dict] = []
    try:
        req = RunReportRequest(
            property=f"properties/{property_id}",
            dimensions=[
                Dimension(name="date"),
                Dimension(name="landingPage"),
            ],
            metrics=[
                Metric(name="sessions"),
                Metric(name="activeUsers"),
                Metric(name="bounceRate"),
                Metric(name="conversions"),
                # Embudo ecommerce por página de ENTRADA: cuántas de las sesiones
                # que empiezan en esta URL agregan al carrito, inician checkout y
                # compran. Permite comparar la conversión real entre landings.
                Metric(name="addToCarts"),
                Metric(name="checkouts"),
                Metric(name="ecommercePurchases"),
                Metric(name="purchaseRevenue"),
            ],
            date_ranges=[DateRange(start_date=str(date_from), end_date=str(date_to))],
            order_bys=[OrderBy(dimension=OrderBy.DimensionOrderBy(dimension_name="date"))],
            limit=100000,
        )
        resp = client.run_report(req)
        for row in resp.rows:
            d = row.dimension_values[0].value
            lp = row.dimension_values[1].value or "(not set)"
            m = [mv.value for mv in row.metric_values]
            landing_rows.append({
                "date": d,
                "landing_page": lp,
                "sessions": int(m[0] or 0),
                "users": int(m[1] or 0),
                "bounce_rate": round(float(m[2] or 0), 4),
                "conversions": int(float(m[3] or 0)),
                "add_to_cart": int(float(m[4] or 0)),
                "checkout": int(float(m[5] or 0)),
                "purchases": int(float(m[6] or 0)),
                "revenue": round(float(m[7] or 0), 2),
            })
        log.info(f"   GA4 landing: {len(landing_rows)} filas (fecha×landing)")
    except Exception as e:
        log.warning(f"   GA4 landing falló: {e}")

    return top_pages_rows, landing_rows


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

def get_shopify_access_token(shop_url: str, client_id: str, client_secret: str) -> str:
    """
    Obtiene un access token del Admin API usando el client credentials grant.
    Las apps del Dev Dashboard ya no entregan un token estático; se pide uno
    fresco (válido ~24h) con Client ID + Client Secret. Devuelve un token
    'shpat_...' listo para el header X-Shopify-Access-Token.
    shop_url: mi-tienda.myshopify.com  (sin https://)
    """
    import requests as req

    url = f"https://{shop_url}/admin/oauth/access_token"
    resp = req.post(url, data={
        "grant_type":    "client_credentials",
        "client_id":     client_id,
        "client_secret": client_secret,
    })
    resp.raise_for_status()
    token = resp.json().get("access_token")
    if not token:
        raise RuntimeError("Shopify no devolvió access_token en el client credentials grant")
    return token


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
        # OJO: order.get("customer", {}) NO protege contra customer=None (pedidos
        # "sin cliente" / de prueba traen customer:null, no la clave ausente).
        # `or {}` sí lo cubre. Este era el bug que congelaba Shopify al toparse
        # con el primer pedido sin cliente.
        cust = order.get("customer") or {}
        is_new = not (cust.get("orders_count", 0) > 1)
        status = (order.get("financial_status") or "").lower()  # paid/pending/voided/...

        if d not in orders_by_date:
            orders_by_date[d] = {
                "orders": 0, "revenue": 0,
                "new_customers": 0, "returning_customers": 0,
                "units_sold": 0, "refunds": 0,
                # desglose por estado de pago (Opción A — migración 0012)
                "orders_paid": 0, "orders_pending": 0, "orders_authorized": 0,
                "orders_refunded": 0, "orders_voided": 0, "revenue_pending": 0,
            }
        orders_by_date[d]["orders"]   += 1
        orders_by_date[d]["revenue"]  += price
        if is_new:
            orders_by_date[d]["new_customers"] += 1
        else:
            orders_by_date[d]["returning_customers"] += 1

        # Estado de pago: conteos exactos. 'pending' además acumula su valor
        # (dinero en el aire). No inventamos monto de reembolso parcial aquí.
        if status == "paid":
            orders_by_date[d]["orders_paid"] += 1
        elif status == "pending":
            orders_by_date[d]["orders_pending"]  += 1
            orders_by_date[d]["revenue_pending"] += price
        elif status in ("authorized", "partially_paid"):
            orders_by_date[d]["orders_authorized"] += 1
        elif status in ("refunded", "partially_refunded"):
            orders_by_date[d]["orders_refunded"] += 1
        elif status == "voided":
            orders_by_date[d]["orders_voided"] += 1

        # Clasificación de pago del pedido para el desglose por par:
        # "paid" = cobrado; "pending" = pago pendiente (COD / sin cobrar aún).
        is_paid    = status == "paid"
        is_pending = status == "pending"

        for item in (order.get("line_items") or []):
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
                    # Desglose por estado de pago (por par)
                    "revenue_paid":    0,
                    "revenue_pending": 0,
                    "units_paid":      0,
                    "units_pending":   0,
                }
            product_sales[pid]["revenue"]    += item_price
            product_sales[pid]["units_sold"] += qty
            product_sales[pid]["orders"]     += 1
            if is_paid:
                product_sales[pid]["revenue_paid"] += item_price
                product_sales[pid]["units_paid"]   += qty
            elif is_pending:
                product_sales[pid]["revenue_pending"] += item_price
                product_sales[pid]["units_pending"]   += qty

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
            # desglose por estado de pago (Opción A — migración 0012)
            "orders_paid":         v["orders_paid"],
            "orders_pending":      v["orders_pending"],
            "orders_authorized":   v["orders_authorized"],
            "orders_refunded":     v["orders_refunded"],
            "orders_voided":       v["orders_voided"],
            "revenue_pending":     round(v["revenue_pending"], 2),
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
            # Desglose por estado de pago (por par): cobrado vs pendiente.
            "revenue_paid":    round(p["revenue_paid"], 2),
            "revenue_pending": round(p["revenue_pending"], 2),
            "units_paid":      p["units_paid"],
            "units_pending":   p["units_pending"],
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


def extract_shopify_abandoned(
    shop_url: str,
    access_token: str,
    date_from: date,
    date_to: date,
) -> list[dict]:
    """
    Extrae checkouts ABANDONADOS desde Shopify Admin API (REST).
    Endpoint: GET /admin/api/2024-01/checkouts.json  (requiere scope read_checkouts).

    Shopify considera "abandonado" un checkout que el cliente inició (dejó
    email/carrito) pero no terminó de pagar. El endpoint los lista con su
    created_at, total_price, currency y completed_at. Cuando completed_at no
    es nulo, ese checkout se recuperó después (se convirtió en orden).

    Agrega por día de creación:
      · abandoned_count  — cuántos checkouts se abandonaron ese día
      · abandoned_value  — valor total de esos checkouts (dinero que quedó en el aire)
      · recovered_count  — de esos, cuántos se completaron luego
      · currency         — moneda de la tienda

    100% dato real de Shopify. Nada estimado. Si la app no tiene el scope
    read_checkouts, la API responde 403 y el ETL lo registra como error (no
    inventa filas).
    """
    import requests as req

    headers = {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
    }
    base = f"https://{shop_url}/admin/api/2024-01"

    checkouts_raw = []
    url = f"{base}/checkouts.json"
    params = {
        "created_at_min": f"{date_from}T00:00:00-05:00",
        "created_at_max": f"{date_to}T23:59:59-05:00",
        "limit":          250,
    }

    while url:
        r = req.get(url, headers=headers, params=params)
        r.raise_for_status()
        data = r.json()
        checkouts_raw.extend(data.get("checkouts", []))

        # Paginación via Link header (igual patrón que las órdenes)
        link = r.headers.get("Link", "")
        if 'rel="next"' in link:
            next_url = [p.split(";")[0].strip(" <>") for p in link.split(",") if 'rel="next"' in p]
            url = next_url[0] if next_url else None
            params = {}
        else:
            url = None
        time.sleep(0.3)

    by_date: dict[str, dict] = {}
    for c in checkouts_raw:
        d = (c.get("created_at") or "")[:10]   # YYYY-MM-DD
        if not d:
            continue
        price     = float(c.get("total_price", 0) or 0)
        recovered = 1 if c.get("completed_at") else 0
        currency  = c.get("currency") or c.get("presentment_currency") or ""

        g = by_date.get(d)
        if g is None:
            g = {
                "date": d, "abandoned_count": 0, "abandoned_value": 0.0,
                "recovered_count": 0, "currency": currency,
            }
            by_date[d] = g
        g["abandoned_count"] += 1
        g["abandoned_value"] += price
        g["recovered_count"] += recovered
        if not g["currency"] and currency:
            g["currency"] = currency

    rows = []
    for d, v in sorted(by_date.items()):
        rows.append({
            "date":            v["date"],
            "abandoned_count": v["abandoned_count"],
            "abandoned_value": round(v["abandoned_value"], 2),
            "recovered_count": v["recovered_count"],
            "currency":        v["currency"],
        })

    log.info(f"   Shopify abandonados: {len(rows)} días, {len(checkouts_raw)} checkouts")
    return rows


# ════════════════════════════════════════════════════════════════
# MICROSOFT CLARITY
# ════════════════════════════════════════════════════════════════

CLARITY_API_URL = "https://www.clarity.ms/export-data/api/v1/project-live-insights"


def _clarity_norm(s) -> str:
    """Normaliza un nombre de campo/métrica: minúsculas, solo alfanuméricos."""
    return "".join(ch for ch in str(s).lower() if ch.isalnum())


def _clarity_num(v):
    """Convierte un valor de la API a float, tolerando strings con comas."""
    if v is None:
        return None
    try:
        return float(str(v).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def _clarity_get(token: str, params: dict) -> list:
    """GET autenticado al endpoint project-live-insights de Clarity."""
    import requests as req
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    resp = req.get(CLARITY_API_URL, params=params, headers=headers, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    return data if isinstance(data, list) else []


def _clarity_metric(payload: list, *keywords: str) -> list[dict]:
    """Devuelve la lista 'information' de la primera métrica cuyo nombre
    normalizado contenga TODAS las keywords dadas. [] si no existe."""
    for metric in payload:
        name = _clarity_norm(metric.get("metricName", ""))
        if all(kw in name for kw in keywords):
            info = metric.get("information")
            return info if isinstance(info, list) else []
    return []


def _clarity_pick(rows: list[dict], *field_keywords: str):
    """Suma, sobre todas las filas, el primer campo numérico cuyo nombre
    normalizado contenga alguna de las keywords. None si no hay match."""
    total = 0.0
    found = False
    for row in rows:
        for k, v in row.items():
            nk = _clarity_norm(k)
            if any(fk in nk for fk in field_keywords):
                n = _clarity_num(v)
                if n is not None:
                    total += n
                    found = True
                break
    return total if found else None


def _clarity_log_schema(payload: list, label: str) -> None:
    """Loguea, de forma compacta, el esquema real: por cada métrica su nombre
    y la primera fila de ejemplo (campos + valores). Evita volcar las 1000
    filas; así el nombre exacto de cada campo es fácil de encontrar en los logs."""
    log.info(f"   ░░ CLARITY_SCHEMA [{label}] ░░ {len(payload)} métricas")
    for metric in payload:
        name = metric.get("metricName", "?")
        info = metric.get("information") or []
        sample = info[0] if info else {}
        log.info(f"   ░░ metric='{name}' filas={len(info)} ejemplo={sample}")


def extract_clarity_api(token: str, run_date: date, num_days: int = 1) -> tuple[list[dict], list[dict]]:
    """
    Microsoft Clarity · Data Export API (project-live-insights).

    A diferencia del CSV manual, trae datos solos vía API. Limitaciones de
    Microsoft: solo últimos 1–3 días (sin histórico), máx 10 req/proyecto/día,
    máx 1000 filas, zona horaria UTC. Por eso los datos se acumulan hacia
    adelante: cada corrida diaria agrega la ventana más reciente.

    Hace 2 requests:
      1. Agregado (sin dimensión)  → fila diaria en clarity_metrics.
      2. dimension1=URL            → detalle por página en clarity_pages.

    Devuelve (metrics_rows, pages_rows) con el mismo esquema que el extractor
    CSV, para que el loader y el dashboard no cambien.
    """
    d = run_date.isoformat()

    # ── 1. Agregado diario (sin dimensiones) ──────────────────────
    agg = _clarity_get(token, {"numOfDays": str(num_days)})
    _clarity_log_schema(agg, "agregado")

    # Esquema real de Clarity (confirmado en logs):
    #   Traffic        → totalSessionCount
    #   ScrollDepth    → averageScrollDepth (0–100)
    #   DeadClickCount / RageClickCount / QuickbackClick →
    #       sessionsWithMetricPercentage = % de sesiones CON el problema
    #       subTotal = total de eventos del clic (cuenta cruda)
    sessions = int(_clarity_pick(_clarity_metric(agg, "traffic"), "totalsessioncount") or 0)

    scroll_val = _clarity_pick(_clarity_metric(agg, "scrolldepth"), "averagescrolldepth")
    scroll_depth = round((scroll_val or 0) / 100, 4)  # 0–100 → 0–1

    # La "tasa" es la fracción de sesiones con el problema (lo que Clarity llama
    # sessionsWithMetricPercentage), no eventos/sesiones.
    dead = _clarity_pick(_clarity_metric(agg, "deadclick"), "sessionswithmetricpercentage")
    rage = _clarity_pick(_clarity_metric(agg, "rageclick"), "sessionswithmetricpercentage")
    quick = _clarity_pick(_clarity_metric(agg, "quickback"), "sessionswithmetricpercentage")

    metrics_rows = [{
        "date":             d,
        "sessions":         sessions,
        "scroll_depth":     scroll_depth,
        "dead_click_rate":  round((dead or 0) / 100, 4),
        "rage_click_rate":  round((rage or 0) / 100, 4),
        "quick_back_rate":  round((quick or 0) / 100, 4),
    }]

    # ── 2. Detalle por página (dimension1=URL) ────────────────────
    pages_rows = []
    try:
        per_url = _clarity_get(token, {"numOfDays": str(num_days), "dimension1": "URL"})
        _clarity_log_schema(per_url, "por URL")

        def url_path(row: dict) -> str:
            """URL de la fila, sin query string (colapsa variantes UTM/fbclid)."""
            for k, v in row.items():
                if _clarity_norm(k) in ("url", "pageurl", "page") and v:
                    return str(v).split("?", 1)[0]
            return ""

        # Acumular por ruta normalizada. Cada métrica trae su propio sessionsCount
        # y subTotal (eventos) por URL-variante; sumamos al colapsar variantes.
        buckets: dict[str, dict] = {}

        def bucket(u: str) -> dict:
            return buckets.setdefault(
                u, {"sessions": 0, "dead": 0, "rage": 0, "scroll_sum": 0.0, "scroll_n": 0}
            )

        for row in _clarity_metric(per_url, "deadclick"):
            u = url_path(row)
            if not u:
                continue
            b = bucket(u)
            b["sessions"] += int(_clarity_pick([row], "sessionscount") or 0)
            b["dead"]     += int(_clarity_pick([row], "subtotal") or 0)

        for row in _clarity_metric(per_url, "rageclick"):
            u = url_path(row)
            if u:
                bucket(u)["rage"] += int(_clarity_pick([row], "subtotal") or 0)

        for row in _clarity_metric(per_url, "scrolldepth"):
            u = url_path(row)
            if not u:
                continue
            s = _clarity_pick([row], "averagescrolldepth")
            if s is not None:
                b = bucket(u)
                b["scroll_sum"] += s
                b["scroll_n"]   += 1

        for u, b in buckets.items():
            scroll = (b["scroll_sum"] / b["scroll_n"] / 100) if b["scroll_n"] else 0
            pages_rows.append({
                "date":         d,
                "page_url":     u,
                "sessions":     b["sessions"],
                "scroll_depth": round(scroll, 4),
                "dead_clicks":  b["dead"],
                "rage_clicks":  b["rage"],
                "exit_rate":    0,  # Clarity no expone exit rate en este endpoint
            })

        # Solo las páginas con más tráfico, para no inflar la tabla.
        pages_rows.sort(key=lambda r: r["sessions"], reverse=True)
        pages_rows = pages_rows[:200]
    except Exception as e:
        log.warning(f"   Clarity API · detalle por URL falló: {e}")

    log.info(f"   Clarity API: {len(metrics_rows)} día(s), {len(pages_rows)} páginas, {sessions} sesiones")
    return metrics_rows, pages_rows


def extract_clarity(csv_path: str) -> tuple[list[dict], list[dict]]:
    """
    Fallback CSV: lee el export manual del panel de Clarity.
    Formato esperado: Date, Sessions, ScrollDepth, DeadClicks, RageClicks, QuickBack, Page
    Se usa solo si no hay CLARITY_API_TOKEN configurado.
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
