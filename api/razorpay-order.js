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
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pffaflasgwhydkmxwkky.supabase.co';
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

// ── SECURITY (2026-08-09): Order total server-side verify ──────────────────
// Client cart + order insert dono tamper karke "₹1 par ₹500 ka order" ka
// loophole bnd karna hai. Hum order_items ko products table ke CURRENT
// selling_price se recompute karte hain + coupon discount coupons table se
// + delivery charge order row se. Mismatch → order create reject.
async function verifyOrderTotal(orderId, requestedPaise) {
  const order = await fetchJson(`orders?select=subtotal,discount,promo_code,delivery_charge,final_amount,rewards_discount&id=eq.${encodeURIComponent(orderId)}`);
  const orderRow = Array.isArray(order) ? order[0] : null;
  if (!orderRow) return { ok: false, status: 404, error: 'Order not found' };

  const items = await fetchJson(`order_items?select=product_id,qty,price&order_id=eq.${encodeURIComponent(orderId)}`);
  const itemList = Array.isArray(items) ? items : [];
  const ids = itemList.map((i) => i.product_id).filter(Boolean);
  const priceMap = {};
  if (ids.length) {
    const prods = await fetchJson(`products?select=id,selling_price&id=in.(${ids.join(',')})`);
    (Array.isArray(prods) ? prods : []).forEach((p) => { priceMap[p.id] = Number(p.selling_price) || 0; });
  }

  // DB ka CURRENT selling_price source of truth hai (client-supplied price nahi)
  let subtotal = 0;
  itemList.forEach((it) => {
    const price = priceMap[it.product_id] != null ? priceMap[it.product_id] : Number(it.price) || 0;
    subtotal += price * (Number(it.qty) || 1);
  });

  // Coupon discount — coupons table se hi (client ka discount value ignore)
  let discount = 0;
  if (orderRow.promo_code) {
    const coupon = await fetchJson(`coupons?select=discount_type,discount_value,is_active&code=eq.${encodeURIComponent(orderRow.promo_code)}`);
    const row = Array.isArray(coupon) ? coupon[0] : null;
    if (row && row.is_active) {
      discount = row.discount_type === 'percent'
        ? Math.round(subtotal * (Number(row.discount_value) || 0) / 100)
        : (Number(row.discount_value) || 0);
      discount = Math.min(discount, subtotal);
    }
  }

  // Reward points discount — order par create_order RPC ne server-side compute
  // kiya tha (100 pts = ₹10). Client ka koi value trust nahi karte.
  const rewardsDiscount = Number(orderRow.rewards_discount) || 0;

  const expected = Math.max(0, subtotal - discount - rewardsDiscount + (Number(orderRow.delivery_charge) || 0));
  const expectedPaise = Math.round(expected * 100);
  if (Math.abs(expectedPaise - requestedPaise) > 1) {
    return { ok: false, status: 400, error: `Amount mismatch (expected ₹${(expectedPaise / 100).toFixed(2)}) — order total refresh karke dobara try karein` };
  }
  return { ok: true };
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

  // ── SECURITY: client-supplied amount par trust nahi — DB se verify ──
  const orderId = String(body.orderId || '');
  if (!orderId) {
    return res.status(400).json({ error: 'Missing order id' });
  }
  try {
    const check = await verifyOrderTotal(orderId, amount);
    if (!check.ok) {
      console.warn('[razorpay-order] total verify rejected:', check.error);
      return res.status(check.status).json({ error: check.error });
    }
  } catch (err) {
    console.error('[razorpay-order] total verify failed:', err?.message || err);
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
      return res.status(502).json({ error: data?.error?.description || 'Razorpay order create failed' });
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
