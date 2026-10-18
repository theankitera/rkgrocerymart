/**
 * /api/razorpay-order — Razorpay Online Payment (server-side order creation)
 * Rinku Kirana & General Store
 *
 * WHY server-side: Razorpay order creation needs RAZORPAY_KEY_SECRET which
 * must NEVER be exposed in browser code. This Vercel serverless function
 * creates the order using the secret from env vars and returns only the
 * public order id + key id that the checkout SDK needs.
 *
 * POST body: { amount (in paise, integer), receipt?, notes? }
 * Response:  { orderId, keyId, amount, currency }  (or 400/500 with error)
 */
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fheewnarnocdzcvvshrj.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function authHeader() {
  return 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
}

// Server-side Supabase fetch (service role — client ka data trust nahi karte)
async function fetchJson(path, opts = {}) {
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
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${String(data || '').slice(0, 120)}`);
  return data;
}

// ── SECURITY (2026-08-09 → 2026-10-18 refactor) ────────────────────────────
// Ab amount ka SOURCE OF TRUTH orders.final_amount hai, jo create_order_draft()
// (SECURITY DEFINER RPC, supabase/migrations/20261018_payment_lifecycle.sql)
// server-side products/coupons/loyalty se recompute karke likhta hai.
// Yahan sirf 3 cheezein verify hoti hain:
//   1. order DRAFT state me hai (pending_payment / paid nahi)
//   2. client ka requested amount = DB final_amount (±1 paise)
//   3. razorpay order id draft par attach (webhook correlation) + retry reset
// (Purana code dobara se prices recompute karta tha jo variant-priced items par
//  selling_price se mismatch karke legit orders reject kar deta tha.)
async function preparePaymentAttempt(orderId, requestedPaise) {
  const order = await fetchJson(
    `orders?select=final_amount,status,payment_status,razorpay_order_id&id=eq.${encodeURIComponent(orderId)}`
  );
  const orderRow = Array.isArray(order) ? order[0] : null;
  if (!orderRow) return { ok: false, status: 404, error: 'Order not found' };

  // State machine guard: sirf DRAFT orders payment ke liye eligible hain.
  // (COD/UPI wale real orders yahan se pay nahi karwa sakte, na hi paid order
  //  dobara initiate hoga — duplicate capture ka rasta band.)
  if (orderRow.status !== 'pending_payment') {
    return {
      ok: false,
      status: 409,
      error: `Order state invalid (${orderRow.status}/${orderRow.payment_status}) — naya checkout karein`,
    };
  }
  if (orderRow.payment_status === 'paid') {
    return { ok: false, status: 409, error: 'Order pehle se paid hai' };
  }

  const dbAmountPaise = Math.round(Number(orderRow.final_amount || 0) * 100);
  if (Math.abs(dbAmountPaise - requestedPaise) > 1) {
    return {
      ok: false,
      status: 400,
      error: `Amount mismatch (expected ₹${(dbAmountPaise / 100).toFixed(2)}) — order total refresh karke dobara try karein`,
    };
  }
  return { ok: true };
}

// Server-side Supabase RPC call (service role) — payment lifecycle functions
// (finalize/fail/init) sirf server se call ho sakte hain, client se nahi.
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
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) throw new Error(`rpc/${fn} ${res.status}: ${String(data || '').slice(0, 160)}`);
  return data;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: 'Razorpay keys not configured on server' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

  const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  // Razorpay minimum order amount = 100 paise (₹1)
  if (amount < 100) {
    return res.status(400).json({ error: 'Minimum amount is 100 paise (₹1)' });
  }

  // ── SECURITY: client-supplied amount par trust nahi — DB se verify ──
  const orderId = String(body.orderId || '');
  if (!orderId) {
    return res.status(400).json({ error: 'Missing order id' });
  }
  try {
    const check = await preparePaymentAttempt(orderId, amount);
    if (!check.ok) {
      console.warn('[razorpay-order] attempt rejected:', check.error);
      return res.status(check.status).json({ error: check.error });
    }
  } catch (err) {
    console.error('[razorpay-order] attempt verify failed:', err?.message || err);
    return res.status(500).json({ error: 'Order verify nahi ho paya — thodi der baad try karein' });
  }

  const payload = {
    amount,                          // already in paise (client sends ₹→paise)
    currency: 'INR',
    payment_capture: 1,
    receipt: String(body.receipt || `rcpt_${Date.now()}`).slice(0, 40),
  };
  if (body.notes && typeof body.notes === 'object') {
    payload.notes = Object.fromEntries(
      Object.entries(body.notes).map(([k, v]) => [k, String(v).slice(0, 250)])
    );
  }

  try {
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('[razorpay-order] upstream error:', r.status, JSON.stringify(data).slice(0, 300));
      // 401 = bad key id/secret → surface it distinctly (config problem, not server error)
      if (r.status === 401) {
        return res.status(401).json({ error: 'Razorpay authentication failed — check KEY_ID/KEY_SECRET' });
      }
      return res.status(502).json({ error: data?.error?.description || 'Razorpay order create failed' });
    }
    // Razorpay order bana — ABHI draft par attach karo (state guard ke saath).
    // init_payment_attempt:
    //   • orders.razorpay_order_id = rzp id  → webhook/payment yahi order se
    //     correlate karega (fake completion ka rasta band)
    //   • failed/cancelled draft retry par wapas 'pending' ho jaata hai
    //   • PAID / non-draft order par false laata hai → yahan hi reject
    const attempt = await callRpc('init_payment_attempt', {
      p_order_id: orderId,
      p_razorpay_order_id: data.id,
    });
    if (!attempt || attempt.ok !== true) {
      console.warn('[razorpay-order] init_payment_attempt rejected:', JSON.stringify(attempt));
      return res.status(409).json({ error: `Order state invalid (${attempt?.state || 'unknown'}) — naya checkout karein` });
    }

    return res.status(200).json({
      orderId: data.id,
      keyId: RAZORPAY_KEY_ID,
      amount: data.amount,
      currency: data.currency || 'INR',
      receipt: data.receipt,
    });
  } catch (err) {
    console.error('[razorpay-order] error:', err?.message || err);
    return res.status(500).json({ error: 'Razorpay order create failed' });
  }
};
