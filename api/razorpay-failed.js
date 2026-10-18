/**
 * /api/razorpay-failed — Razorpay payment FAILED / modal CANCELLED (server-side)
 * Rinku Kirana & General Store
 *
 * User jab Razorpay modal cancel karta hai ya payment fail hoti hai, to client
 * ye endpoint call karta hai. Server fail_order_payment() RPC call karta hai jo:
 *   • SIRF DRAFT order (status='pending_payment') ko 'failed'/'cancelled'
 *     state me le jaata hai — real/paid orders ko kabhi chhuta nahi.
 *   • PAID order par downgrade IMPOSSIBLE hai (DB guard) — agar user ne
 *     actually pay kiya tha to webhook/finalize usse paid hi rakhega.
 *   • Stock/coupon/rewards par koi asar nahi (draft par tha hi nahi).
 *
 * POST body: { orderId, razorpay_order_id?, reason?, event?: 'failed'|'cancelled' }
 * Response: { ok, state, paymentStatus }
 */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fheewnarnocdzcvvshrj.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

  const orderId = String(body.orderId || '');
  const event = body.event === 'cancelled' ? 'cancelled' : 'failed';
  if (!orderId) {
    return res.status(400).json({ ok: false, error: 'Missing order id' });
  }

  try {
    // Correlation guard: jo razorpay_order_id client ne payment ke waqt use
    // kiya wahi order row par attach hona chahiye — warna koi dusre user ke
    // draft ko cancel nahi kar payega (uuid + rzp order id dono chahiye).
    if (body.razorpay_order_id) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/orders?select=id,razorpay_order_id,payment_status,status&id=eq.${encodeURIComponent(orderId)}&limit=1`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          signal: AbortSignal.timeout(10000),
        }
      );
      const rows = await r.json().catch(() => []);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return res.status(404).json({ ok: false, error: 'Order not found' });
      if (row.payment_status === 'paid') {
        return res.status(200).json({ ok: true, state: 'paid', paymentStatus: 'paid', alreadyPaid: true });
      }
      if (row.razorpay_order_id && row.razorpay_order_id !== String(body.razorpay_order_id)) {
        return res.status(400).json({ ok: false, error: 'Razorpay order id does not match this order' });
      }
    }

    const out = await callRpc('fail_order_payment', {
      p_order_id: orderId,
      p_reason: String(body.reason || '').slice(0, 300) || null,
      p_event: event,
    });
    return res.status(200).json({
      ok: out?.ok !== false,
      state: out?.state || 'unknown',
      paymentStatus: out?.payment_status || null,
    });
  } catch (err) {
    console.error('[razorpay-failed] error:', err?.message || err);
    // Best-effort: order draft hi reh jaata hai (pending_payment) — wo customer
    // history se hide rehta hai aur retry par reuse hota hai. Hard fail mat dikhao.
    return res.status(200).json({ ok: false, state: 'unprocessed' });
  }
};
