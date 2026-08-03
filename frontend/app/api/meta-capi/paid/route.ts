import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// ============================================================
// Ruta A — Conversión "CompraPagada" (Meta Conversions API)
// Shopify dispara el webhook `orders/paid` cuando el pedido se COBRA
// (financial_status = paid). Aquí verificamos la firma de Shopify y
// reenviamos un evento server-side `CompraPagada` a Meta, para que el
// algoritmo optimice/atribuya SOLO lo pagado (no los COD/pendientes).
//
// Requiere 3 variables de entorno (en Vercel y .env.local, NUNCA en git):
//   META_DATASET_ID        → id del Dataset en Events Manager
//   META_CAPI_TOKEN        → token de la Conversions API para ese Dataset
//   SHOPIFY_WEBHOOK_SECRET → secreto con el que Shopify firma el webhook
// Opcional:
//   META_TEST_EVENT_CODE   → para verlo en "Eventos de prueba" durante el setup
//   META_GRAPH_VERSION     → por defecto v19.0
// ============================================================

export const runtime = 'nodejs';         // crypto.createHmac necesita runtime Node
export const dynamic = 'force-dynamic';   // nunca cachear

const GRAPH = process.env.META_GRAPH_VERSION || 'v19.0';

// SHA-256 en hex de un valor normalizado (lo que Meta exige para el match).
function sha256(v: string): string {
  return crypto.createHash('sha256').update(v).digest('hex');
}
function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}
// email → trim+lowercase ; teléfono → solo dígitos (con lada) ; texto → sin espacios extra
function hashEmail(v?: string | null): string[] | undefined {
  const e = norm(v); return e ? [sha256(e)] : undefined;
}
function hashPhone(v?: string | null): string[] | undefined {
  const p = String(v ?? '').replace(/[^0-9]/g, ''); return p ? [sha256(p)] : undefined;
}
function hashText(v?: string | null): string[] | undefined {
  const t = norm(v).replace(/\s+/g, ' '); return t ? [sha256(t)] : undefined;
}
function hashCountry(v?: string | null): string[] | undefined {
  const c = norm(v).slice(0, 2); return c ? [sha256(c)] : undefined;
}

// Verifica que el webhook venga de Shopify (firma HMAC del cuerpo crudo).
function verifyShopify(rawBody: string, hmacHeader: string | null, secret: string): boolean {
  if (!hmacHeader) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Chequeo de salud sin revelar secretos: GET /api/meta-capi/paid
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'meta-capi/paid',
    configured: {
      dataset: !!process.env.META_DATASET_ID,
      capiToken: !!process.env.META_CAPI_TOKEN,
      shopifySecret: !!process.env.SHOPIFY_WEBHOOK_SECRET,
      testMode: !!process.env.META_TEST_EVENT_CODE,
    },
  });
}

export async function POST(req: NextRequest) {
  const DATASET = process.env.META_DATASET_ID;
  const TOKEN = process.env.META_CAPI_TOKEN;
  const SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;

  // Cuerpo CRUDO: la firma HMAC se calcula sobre el texto sin parsear.
  const rawBody = await req.text();

  // 1) Autenticidad del webhook.
  if (!SECRET || !verifyShopify(rawBody, req.headers.get('x-shopify-hmac-sha256'), SECRET)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  // 2) Config de Meta presente.
  if (!DATASET || !TOKEN) {
    console.error('[meta-capi] Falta META_DATASET_ID o META_CAPI_TOKEN');
    return NextResponse.json({ error: 'server not configured' }, { status: 500 });
  }

  let order: any;
  try { order = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }

  // 3) Solo pedidos realmente pagados (el topic orders/paid ya lo garantiza, doble-check).
  if (order.financial_status && order.financial_status !== 'paid') {
    return NextResponse.json({ skipped: 'not paid', financial_status: order.financial_status });
  }

  const cust = order.customer || {};
  const addr = order.billing_address || order.shipping_address || cust.default_address || {};
  const value = Number(order.current_total_price ?? order.total_price ?? 0);
  const numItems = Array.isArray(order.line_items)
    ? order.line_items.reduce((s: number, li: any) => s + Number(li.quantity || 0), 0)
    : undefined;

  const user_data: Record<string, string[]> = {};
  const put = (k: string, v?: string[]) => { if (v) user_data[k] = v; };
  put('em', hashEmail(order.email || cust.email));
  put('ph', hashPhone(order.phone || cust.phone || addr.phone));
  put('fn', hashText(cust.first_name || addr.first_name));
  put('ln', hashText(cust.last_name || addr.last_name));
  put('ct', hashText(addr.city));
  put('st', hashText(addr.province_code || addr.province));
  put('zp', hashText(addr.zip));
  put('country', hashCountry(addr.country_code || addr.country));
  if (cust.id) put('external_id', [sha256(String(cust.id))]);

  const payload: any = {
    data: [{
      event_name: 'CompraPagada',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_id: `paid_${order.id}`,               // dedup ante reintentos de Shopify
      event_source_url: order.order_status_url || undefined,
      user_data,
      custom_data: {
        currency: order.currency || 'MXN',
        value,
        order_id: String(order.id ?? ''),
        ...(numItems ? { num_items: numItems } : {}),
      },
    }],
  };
  if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;

  // 4) Enviar a la Conversions API de Meta.
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH}/${DATASET}/events?access_token=${encodeURIComponent(TOKEN)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Non-2xx → Shopify reintentará (hasta 48h). Registramos el motivo real.
      console.error('[meta-capi] Meta rechazó el evento', res.status, JSON.stringify(body).slice(0, 400));
      return NextResponse.json({ error: 'meta rejected', status: res.status, meta: body }, { status: 502 });
    }
    console.log(`[meta-capi] CompraPagada OK order=${order.id} value=${value} ${order.currency}`,
      body?.events_received != null ? `recibidos=${body.events_received}` : '');
    return NextResponse.json({ ok: true, order_id: String(order.id ?? ''), value, meta: body });
  } catch (e: any) {
    console.error('[meta-capi] Error de red hacia Meta', e?.message || e);
    return NextResponse.json({ error: 'network', detail: String(e?.message || e) }, { status: 502 });
  }
}
