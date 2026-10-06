/**
 * /api/razorpay-verify — Razorpay payment signature verification (server-side)
 * Rinku Kirana & General Store
 *
 * The client NEVER decides whether a payment succeeded — that would be
 * trivially forgeable. This function:
 *   1. Recomputes the HMAC-SHA256 signature (order_id + payment_id with the
 *      Razorpay key secret) and compares it with the signature Razorpay sent.
 *   2. Only if it matches, marks the Supabase order as PAID (service role —
 *      bypasses RLS, server-only env var) and records the payment.
 *
 * POST body:
 *   { orderId, orderNumber, razorpay_order_id, razorpay_payment_id,
 *     razorpay_signature, amount (₹), customer_name?, mobile? }
 * Response: { verified: true } | { verified: false, error }
 */
const crypto = require('crypto');

const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pffaflasgwhydkmxwkky.supabase.co';
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
  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  if (expected !== razorpay_signature) {
    console.warn('[razorpay-verify] SIGNATURE MISMATCH', { razorpay_order_id, razorpay_payment_id });
    return res.status(400).json({ verified: false, error: 'Signature mismatch' });
  }

  // ── 2. Verify against the REAL order amount in the DB (service role) ──
  //    Client-supplied amounts are NOT trusted — the actual final_amount from
  //    the orders row is the source of truth. This closes the "paid ₹1 for a
  //    ₹500 order" loophole even if the client lies on both API calls.
  try {
    const orderRes = await supabase(`orders?select=final_amount,payment_status&id=eq.${encodeURIComponent(orderId)}`, {});
    const dbOrder = Array.isArray(orderRes.data) ? orderRes.data[0] : null;
    if (!dbOrder) {
      return res.status(404).json({ verified: false, error: 'Order not found' });
    }
    // Idempotency guard: payment pehle se verified hai to duplicate record mat banao.
    if (dbOrder.payment_status === 'paid') {
      return res.status(200).json({ verified: true, paymentId: razorpay_payment_id, alreadyPaid: true });
    }
    const dbAmountPaise = Math.round(Number(dbOrder.final_amount || 0) * 100);
    if (dbAmountPaise > 0) {
      const rzRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpay_order_id}`, {
        headers: { Authorization: 'Basic ' + Buffer.from(`${process.env.RAZORPAY_KEY_ID || ''}:${RAZORPAY_KEY_SECRET}`).toString('base64') },
        signal: AbortSignal.timeout(10000),
      });
      if (rzRes.ok) {
        const rzOrder = await rzRes.json();
        if (Number(rzOrder.amount) !== dbAmountPaise) {
          console.warn('[razorpay-verify] AMOUNT MISMATCH', { dbAmountPaise, rzAmount: rzOrder.amount });
          return res.status(400).json({ verified: false, error: 'Amount mismatch' });
        }
      }
      // If the Razorpay lookup fails (network), signature is still authoritative.
    }
  } catch (e) {
    console.warn('[razorpay-verify] amount check skipped:', e?.message || e);
  }

  // ── 3. Mark order paid (service role, bypasses RLS) ─────────────
  const now = new Date().toISOString();
  const upd = await supabase(`orders?id=eq.${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: {
      payment_status: 'paid',
      status: 'pending', // admin still confirms/dispatches the order
      payment_method: 'razorpay',
      notes: `Razorpay payment ${razorpay_payment_id}`,
      updated_at: now,
    },
  });
  if (!upd.ok) {
    console.error('[razorpay-verify] order update failed:', upd.status, String(upd.data || '').slice(0, 200));
    return res.status(500).json({ verified: false, error: 'Order update failed' });
  }

  // ── 4. Record in payment_verifications (admin Payments page) ────
  await supabase('payment_verifications', {
    method: 'POST',
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
      created_at: now,
      updated_at: now,
    },
  }).catch(() => {});

  return res.status(200).json({ verified: true, paymentId: razorpay_payment_id });
};
