"""
Extractor: Google Merchant Center
Usa la nueva Merchant API (v1beta) en vez de la deprecated Content API for Shopping.
"""

import logging
import time
import os
from typing import Any

log = logging.getLogger(__name__)


def extract_gmc(merchant_id: str, credentials_path: str) -> list[dict]:
    """
    Extrae el estado del feed de productos desde Google Merchant Center
    usando la nueva Merchant API v1beta.
    """
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path

    from googleapiclient.discovery import build
    from google.oauth2 import service_account

    SCOPES = ["https://www.googleapis.com/auth/content"]
    creds = service_account.Credentials.from_service_account_file(
        credentials_path, scopes=SCOPES
    )

    # Intentar con la nueva Merchant API primero
    try:
        return _extract_with_merchant_api(merchant_id, creds)
    except Exception as e:
        log.warning(f"   Merchant API v1beta falló: {e} — intentando Content API")
        try:
            return _extract_with_content_api(merchant_id, creds)
        except Exception as e2:
            log.error(f"   Content API también falló: {e2}")
            return []


def _extract_with_merchant_api(merchant_id: str, creds) -> list[dict]:
    """Usa la nueva Merchant API v1beta."""
    from googleapiclient.discovery import build

    service = build(
        "merchantapi",
        "products_v1beta",
        credentials=creds,
        discoveryServiceUrl="https://merchantapi.googleapis.com/$discovery/rest?version=products_v1beta"
    )

    rows  = []
    token = None
    parent = f"accounts/{merchant_id}"

    while True:
        req = service.accounts().products().list(
            parent=parent,
            pageSize=250,
            pageToken=token
        )
        resp = req.execute()
        resources = resp.get("products", [])

        for p in resources:
            product_id = p.get("name", "").split("/")[-1]
            title      = p.get("title", "")

            # Estado del producto
            statuses = p.get("productStatus", {}).get("destinationStatuses", [])
            if any(s.get("status") == "approved" for s in statuses):
                status = "APPROVED"
            elif any(s.get("status") == "disapproved" for s in statuses):
                status = "DISAPPROVED"
            else:
                status = "PENDING"

            # Issues
            issues = [
                {
                    "code":        i.get("code", ""),
                    "description": i.get("description", ""),
                    "severity":    i.get("severity", ""),
                }
                for i in p.get("productStatus", {}).get("itemLevelIssues", [])
            ]

            # Precio
            price_info = p.get("price", {})
            try:
                price = float(price_info.get("amountMicros", 0)) / 1_000_000
            except (TypeError, ValueError):
                price = 0

            rows.append({
                "product_id": product_id,
                "title":      title,
                "brand":      p.get("brand", ""),
                "price":      round(price, 2),
                "status":     status,
                "issues":     issues,
                "clicks":     0,
                "impressions":0,
                "ctr":        0,
            })

        token = resp.get("nextPageToken")
        if not token:
            break
        time.sleep(0.2)

    log.info(f"   GMC (Merchant API): {len(rows)} productos")
    return rows


def _extract_with_content_api(merchant_id: str, creds) -> list[dict]:
    """Fallback: usa la Content API for Shopping (deprecated pero aún funciona)."""
    from googleapiclient.discovery import build

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

            if any(s.get("status") == "approved" for s in status_raw):
                status = "APPROVED"
            elif any(s.get("status") == "disapproved" for s in status_raw):
                status = "DISAPPROVED"
            else:
                status = "PENDING"

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
                "brand":      "",
                "price":      0,
                "status":     status,
                "issues":     issues,
                "clicks":     0,
                "impressions":0,
                "ctr":        0,
            })

        token = resp.get("nextPageToken")
        if not token:
            break
        time.sleep(0.2)

    log.info(f"   GMC (Content API): {len(rows)} productos")
    return rows