/**
 * /api/razorpay-webhook — Razorpay Webhook (server-to-server, idempotent)
 * Rinku Kirana & General Store
 *
 * Ye endpoint tab bhi order confirm karta hai jab USER ka tab band ho jaye
 * payment ke turant baad (checkout handler kabhi call na kare) — yaani
 * "payment ho gaya par order pending hi reh gaya" wala bug khatm.
 *
 * SECURITY (fake payment completion rokne ke liye):
 *   ① x-razorpay-signature = HMAC_SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)
 *      verify HOTIME HI hota hai (timingSafeEqual). Galat → 401.
 *   ② Vercel par kabhi raw body na mile to (sirf mismatch hone par) fallback:
 *      payment ko Razorpay ki khud ki API se fetch karke status/amount/order_id
 *      verify kiya jaata hai (Basic auth KEY_ID:SECRET) — yeh bhi gateway-
 *      authoritative hai, client-forgery nahi.
 *   ③ Uske baad bhi DB finalize_paid_order() me razorpay_order_id ↔ order match
 *      aur amount checks chalte hain.
 *
 * EVENTS:
 *   payment.captured / order.paid → finalize_paid_order() (ACID):
 *       order PAID + stock decrement + coupon use + reward burn (IDEMPOTENT —
 *       duplicate webhook hits pehle se paid order ko chhoo te nahi).
 *   payment.failed                 → fail_order_payment() → status 'failed'
 *   baaki events                   → 200 ignored (Razorpay retry band rakho)
 *
 * IDEMPOTENCY: orders.razorpay_payment_id UNIQUE + finalize ka paid-guard.
 * Duplicate delivery kabhi double stock-cut NAHI kar sakti.
 *
 * Env: RAZORPAY_WEBHOOK_SECRET (Razorpay Dashboard → Settings → Webhooks)
 */
const crypto = require('crypto');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fheewnarnocdzcvvshrj.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

async function callRpc(fn, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) throw new Error(`rpc/${fn} ${res.status}: ${String(data || '').slice(0, 200)}`);
  return data;
}

// DB me razorpay_order_id se order dhoondho (draft hi eligible hota hai)
async function findOrderByRzpOrder(razorpayOrderId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/orders?select=id,order_number,razorpay_order_id,payment_status,status,final_amount` +
      `&razorpay_order_id=eq.${encodeURIComponent(razorpayOrderId)}&limit=1`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      signal: AbortSignal.timeout(10000),
    }
  );
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function razorpayApi(path) {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64') },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!RAZORPAY_WEBHOOK_SECRET) {
    console.error('[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // ── RAW BODY (signature isi par compute hota hai) ──────────────────────
  // Vercel: req.rawBody milta hai. Local dev middleware: string body.
  // Fallback: parsed object ko dobara serialize karo (dev-only safety net).
  let raw = req.rawBody;
  if (raw == null) {
    raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? '');
  }
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');

  const signature = req.headers['x-razorpay-signature'] || req.headers['X-Razorpay-Signature'];
  if (!signature) {
    return res.status(401).json({ error: 'Missing signature' });
  }

  const expected = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
  let verified = safeEqual(expected, signature);

  let event = null;
  try {
    const parsed = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    event = parsed && typeof parsed === 'object' ? parsed : JSON.parse(raw);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  // ── FALLBACK: raw body dobara-serialize hone se mismatch ho sakta hai.
  //    Tab Razorpay ki API se payment khud fetch karke authoritative check.
  if (!verified) {
    const paymentId = event?.payload?.payment?.entity?.id;
    const orderIdRzp = event?.payload?.payment?.entity?.order_id || event?.payload?.order?.entity?.id;
    if (paymentId) {
      const pay = await razorpayApi(`/payments/${paymentId}`);
      if (pay && pay.id === paymentId && pay.order_id === orderIdRzp) {
        verified = true;
        console.warn('[razorpay-webhook] signature mismatch — verified via Razorpay API lookup instead');
      }
    } else if (orderIdRzp) {
      const order = await razorpayApi(`/orders/${orderIdRzp}`);
      if (order && order.id === orderIdRzp) verified = true;
    }
  }

  if (!verified) {
    console.warn('[razorpay-webhook] REJECTED — invalid signature', { event: event?.event });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // ── EVENT DISPATCH ─────────────────────────────────────────────────────
  const type = event?.event;
  try {
    if (type === 'payment.captured' || type === 'payment.failed') {
      const p = event.payload?.payment?.entity || {};
      const rzpOrderId = p.order_id;
      const paymentId = p.id;

      if (!rzpOrderId || !paymentId) {
        return res.status(200).json({ ok: true, ignored: 'no ids' });
      }
      const order = await findOrderByRzpOrder(rzpOrderId);
      if (!order) {
        // Hamari order hi nahi — koi aur environment/merchant flow. Ignore (200).
        return res.status(200).json({ ok: true, ignored: 'unknown order' });
      }

      if (type === 'payment.captured') {
        // Extra guard: amount mismatch = tampered/incorrect capture → flag, na ki silently paid.
        const dbPaise = Math.round(Number(order.final_amount || 0) * 100);
        if (dbPaise > 0 && Number(p.amount) !== dbPaise) {
          console.error('[razorpay-webhook] AMOUNT MISMATCH', { orderId: order.id, dbPaise, captured: p.amount });
          return res.status(500).json({ error: 'amount mismatch — manual review needed' }); // Razorpay retry karega
        }
        const out = await callRpc('finalize_paid_order', {
          p_order_id: order.id,
          p_payment_id: paymentId,
          p_razorpay_order_id: rzpOrderId,
          p_source: 'webhook',
        });
        console.log('[razorpay-webhook] payment.captured →', out?.status, order.order_number);
        return res.status(200).json({ ok: true, status: out?.status });
      }

      // payment.failed → draft ko 'failed' mark (guard: paid kabhi downgrade nahi)
      const reason = p.error_description || p.error_reason || 'Payment failed via Razorpay';
      const out = await callRpc('fail_order_payment', {
        p_order_id: order.id,
        p_reason: String(reason).slice(0, 300),
        p_event: 'failed',
      });
      console.log('[razorpay-webhook] payment.failed →', out?.state, order.order_number);
      return res.status(200).json({ ok: true, state: out?.state });
    }

    if (type === 'order.paid') {
      // order.paid = payment successful (dusra notification). Payment details
      // API se le kar wahi idempotent finalize path chalao.
      const rzpOrderId = event.payload?.order?.entity?.id;
      if (!rzpOrderId) return res.status(200).json({ ok: true, ignored: 'no order id' });
      const order = await findOrderByRzpOrder(rzpOrderId);
      if (!order) return res.status(200).json({ ok: true, ignored: 'unknown order' });
      if (order.payment_status === 'paid') return res.status(200).json({ ok: true, status: 'already_paid' });

      const pays = await razorpayApi(`/orders/${rzpOrderId}/payments`);
      const captured = (Array.isArray(pays?.items) ? pays.items : []).find((x) => x.status === 'captured');
      if (!captured) return res.status(200).json({ ok: true, ignored: 'no captured payment yet' });

      const out = await callRpc('finalize_paid_order', {
        p_order_id: order.id,
        p_payment_id: captured.id,
        p_razorpay_order_id: rzpOrderId,
        p_source: 'webhook:order.paid',
      });
      console.log('[razorpay-webhook] order.paid →', out?.status, order.order_number);
      return res.status(200).json({ ok: true, status: out?.status });
    }

    // Unknown/unsupported event — 200 bhejo taaki Razorpay retry na kare.
    return res.status(200).json({ ok: true, ignored: type || 'unknown event' });
  } catch (err) {
    // Processing failure → 500, Razorpay khud retry karega (eventual consistency).
    console.error('[razorpay-webhook] processing error:', err?.message || err);
    return res.status(500).json({ error: 'processing failed' });
  }
};
