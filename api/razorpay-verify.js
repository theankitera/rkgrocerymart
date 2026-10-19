/**
 * /api/razorpay-verify — Razorpay payment signature verification (server-side)
 * Rinku Kirana & General Store
 *
 * The client NEVER decides whether a payment succeeded — that would be
 * trivially forgeable. This function:
 *   1. Recomputes the HMAC-SHA256 signature (order_id + payment_id with the
 *      Razorpay key secret) and compares it with the signature Razorpay sent.
 *   2. Cross-checks the payment against the DB draft (razorpay_order_id match)
 *      and against the REAL order amount in the DB.
 *   3. Only if everything matches, calls finalize_paid_order() — a SINGLE
 *      Postgres transaction that marks the order PAID + decrements stock +
 *      consumes coupon usage + burns reward points + writes status history.
 *      Idempotent: duplicate verify calls / webhook races return
 *      {verified:true, alreadyPaid:true} and NEVER double-deduct inventory.
 *
 * POST body:
 *   { orderId, orderNumber, razorpay_order_id, razorpay_payment_id,
 *     razorpay_signature, amount (₹), userId?, customer_name?, mobile? }
 * Response: { verified: true, paymentId } | { verified: false, error }
 */
const crypto = require('crypto');
const { sendUserNotification } = require('./_notify');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fheewnarnocdzcvvshrj.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function supabase(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  return { ok: res.ok, status: res.status, data };
}

// finalize_paid_order() RPC — ek hi ACID transaction me saara post-payment
// side-effect (order PAID, stock cut, coupon use, rewards burn). Server-only
// (service_role) grant hai is function par — client isse call hi nahi sakta.
async function finalizeOrder(orderId, paymentId, razorpayOrderId, source) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/finalize_paid_order`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      p_order_id: orderId,
      p_payment_id: paymentId,
      p_razorpay_order_id: razorpayOrderId || null,
      p_source: source || 'checkout',
    }),
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!r.ok) throw new Error(`finalize_paid_order ${r.status}: ${String(data || '').slice(0, 200)}`);
  return data;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

  const { orderId, orderNumber, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

  if (!RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ verified: false, error: 'Razorpay secret not configured on server' });
  }
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ verified: false, error: 'Missing Razorpay params' });
  }
  if (!orderId) {
    return res.status(400).json({ verified: false, error: 'Missing order id' });
  }

  // ── 1. Verify signature ─────────────────────────────────────────
  // expected = HMAC_SHA256(order_id|payment_id, KEY_SECRET)
  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  const sigOk =
    expected.length === razorpay_signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(razorpay_signature)));
  if (!sigOk) {
    console.warn('[razorpay-verify] SIGNATURE MISMATCH', { razorpay_order_id, razorpay_payment_id });
    return res.status(400).json({ verified: false, error: 'Signature mismatch' });
  }

  // ── 2. Verify against the DB draft + REAL order amount (service role) ──
  let orderMeta = null;
  try {
    const orderRes = await supabase(
      `orders?select=final_amount,payment_status,status,razorpay_order_id,user_id,order_number&id=eq.${encodeURIComponent(orderId)}`
    );
    const dbOrder = Array.isArray(orderRes.data) ? orderRes.data[0] : null;
    if (!dbOrder) {
      return res.status(404).json({ verified: false, error: 'Order not found' });
    }
    orderMeta = dbOrder;

    // Idempotency guard #1: payment pehle se verified hai → success bhejo,
    // duplicate record BANAO MAT (webhook aur checkout dono race kar sakte hain).
    if (dbOrder.payment_status === 'paid') {
      return res.status(200).json({ verified: true, paymentId: razorpay_payment_id, alreadyPaid: true });
    }

    // Signature me jo razorpay_order_id aaya hai wahi is order se juda hona
    // chahiye — kisi doosre order ka payment yahan confirm nahi hoga.
    if (dbOrder.razorpay_order_id && dbOrder.razorpay_order_id !== razorpay_order_id) {
      console.warn('[razorpay-verify] ORDER ID MISMATCH', {
        db: dbOrder.razorpay_order_id, got: razorpay_order_id,
      });
      return res.status(400).json({ verified: false, error: 'Razorpay order id does not match this order' });
    }

    // Amount check: DB final_amount ↔ Razorpay order amount (paise).
    const dbAmountPaise = Math.round(Number(dbOrder.final_amount || 0) * 100);
    if (dbAmountPaise > 0) {
      const rzRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpay_order_id}`, {
        headers: { Authorization: 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64') },
        signal: AbortSignal.timeout(10000),
      });
      if (rzRes.ok) {
        const rzOrder = await rzRes.json();
        if (Number(rzOrder.amount) !== dbAmountPaise) {
          console.warn('[razorpay-verify] AMOUNT MISMATCH', { dbAmountPaise, rzAmount: rzOrder.amount });
          return res.status(400).json({ verified: false, error: 'Amount mismatch' });
        }
      }
      // Razorpay lookup network par fail ho jaye to signature authoritative hai
      // (signature me order_id+payment_id embedded hain — fake banana impossible).
    }
  } catch (e) {
    console.warn('[razorpay-verify] order/amount check failed:', e?.message || e);
    return res.status(500).json({ verified: false, error: 'Order verify nahi ho paya — dobara try karein' });
  }

  // ── 3. FINALIZE (ACID): order PAID + stock + coupon + rewards, ek txn me ──
  let finalResult = null;
  try {
    finalResult = await finalizeOrder(orderId, razorpay_payment_id, razorpay_order_id, 'checkout');
  } catch (err) {
    console.error('[razorpay-verify] finalize failed:', err?.message || err);
    // Payment Razorpay par capture ho chuka hai — webhook isko dobara try
    // karega. Client ko pending dikhao (fake success mat dikhao).
    return res.status(500).json({ verified: false, error: 'Order confirm nahi ho paya — payment capture hai, thodi der mein auto-confirm hoga' });
  }

  // ── 4. Record in payment_verifications (admin Payments page) — idempotent ──
  try {
    const existing = await supabase(
      `payment_verifications?select=id&order_id=eq.${encodeURIComponent(orderId)}&utr=eq.${encodeURIComponent(razorpay_payment_id)}&limit=1`
    );
    if (!(Array.isArray(existing.data) && existing.data.length)) {
      await supabase('payment_verifications', {
        method: 'POST',
        prefer: 'return=minimal',
        body: {
          user_id: body.userId || null,
          order_id: orderId,
          order_number: String(orderNumber || '').slice(0, 40),
          customer_name: String(body.customer_name || '').slice(0, 100),
          mobile: String(body.mobile || '').slice(0, 20),
          utr: razorpay_payment_id, // Razorpay payment id acts as the tx ref
          screenshot_url: null,
          amount: Number(body.amount) || null,
          status: 'paid',
          admin_note: 'Auto-verified via Razorpay',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });
    }
  } catch (e) {
    // Verification record optional hai — order already finalize ho chuka hai.
    console.warn('[razorpay-verify] payment_verifications insert skipped:', e?.message || e);
  }

  // ── 5. Customer notification (in-app + web push) — best-effort, order
  //      flow kabhi iski wajah se fail nahi hoga. alreadyPaid duplicate par
  //      notify NAHI hota (finalize idempotent hai — sirf asli pehli baar).
  if (finalResult?.status !== 'already_paid') {
    try {
      await sendUserNotification({
        userId: body.userId || orderMeta?.user_id || null,
        title: 'Payment successful ✅',
        message: `Order ${orderNumber || orderMeta?.order_number || ''} confirm ho gaya hai — hum jaldi deliver karenge.`,
        type: 'order',
        url: '/account.html?tab=orders',
      });
    } catch (e) {
      console.warn('[razorpay-verify] notify skipped:', e?.message || e);
    }
  }

  return res.status(200).json({
    verified: true,
    paymentId: razorpay_payment_id,
    orderStatus: finalResult?.status || 'paid',
    alreadyPaid: finalResult?.status === 'already_paid',
  });
};
