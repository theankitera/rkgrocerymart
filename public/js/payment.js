/**
 * payment.js — Rinku Kirana
 * UPI Payment Verification
 * ─────────────────────────────────────────────────────────────
 * Public API (window.RKPayment):
 *   uploadScreenshot(file, orderNumber)        → publicUrl | null
 *   submitVerification(userId, opts)           → row | null
 *   getVerificationStatus(orderId)             → row | null
 *   loadVerifications({status, search, limit}) → [row]   (admin)
 *   approvePayment(verificationId, orderId)    → boolean (admin)
 *   rejectPayment(verificationId, reason)      → boolean (admin)
 * ─────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  const getDB = () => window.sb;

  // ── Cloudinary Config ──────────────────────────────────────
  const CLOUD_NAME    = 'delf8iyzt';
  const UPLOAD_PRESET = 'myshop_preset';

  /* ══════════════════════════════════════════════════════════
     SCREENSHOT UPLOAD — Cloudinary
  ══════════════════════════════════════════════════════════ */
  async function uploadScreenshot(file, orderNumber) {
    if (!file) return null;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', UPLOAD_PRESET);
      formData.append('folder', `myshop/payment-screenshots/${orderNumber || 'misc'}`);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        { method: 'POST', body: formData }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.secure_url) return data.secure_url;
      throw new Error(data.error?.message || 'Upload fail ho gaya');
    } catch (err) {
      console.error('[RKPayment] uploadScreenshot (Cloudinary):', err);
      return null;
    }
  }

  /* ══════════════════════════════════════════════════════════
     SUBMIT VERIFICATION (customer side)
  ══════════════════════════════════════════════════════════ */
  async function submitVerification(userId, opts) {
    const { orderId, orderNumber, customerName, mobile, utr, screenshotUrl, amount } = opts;

    const { data, error } = await getDB()
      .from('payment_verifications')
      .insert({
        user_id: userId || null,
        order_id: orderId,
        order_number: orderNumber,
        customer_name: customerName,
        mobile,
        utr,
        screenshot_url: screenshotUrl || null,
        amount,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) { console.error('[RKPayment] submitVerification:', error.message); return null; }
    return data;
  }

  /* ══════════════════════════════════════════════════════════
     STATUS LOOKUP (customer side)
  ══════════════════════════════════════════════════════════ */
  async function getVerificationStatus(orderId) {
    if (!orderId) return null;
    const { data, error } = await getDB()
      .from('payment_verifications')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) { console.error('[RKPayment] getVerificationStatus:', error.message); return null; }
    return data;
  }

  /* ══════════════════════════════════════════════════════════
     ADMIN: LIST / SEARCH
  ══════════════════════════════════════════════════════════ */
  async function loadVerifications(filters = {}) {
    const { status = 'all', search = '', limit = 100 } = filters;
    let q = getDB()
      .from('payment_verifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status && status !== 'all') q = q.eq('status', status);
    if (search && search.trim()) {
      const s = search.trim();
      // BUG FIX: values double-quote wrap (PostgREST) — parentheses/commas wale
      // customer names ya UTR ke saath or() filter pehle toot jaata tha.
      q = q.or(`utr.ilike."%${s}%",order_number.ilike."%${s}%",mobile.ilike."%${s}%",customer_name.ilike."%${s}%"`);
    }

    const { data, error } = await q;
    if (error) { console.error('[RKPayment] loadVerifications:', error.message); return []; }
    return data || [];
  }

  /* ══════════════════════════════════════════════════════════
     ADMIN: APPROVE / REJECT
  ══════════════════════════════════════════════════════════ */
  async function approvePayment(verificationId, orderId) {
    const { error: e1 } = await getDB()
      .from('payment_verifications')
      .update({ status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', verificationId);

    if (e1) { console.error('[RKPayment] approvePayment (verification):', e1.message); return false; }

    const { error: e2 } = await getDB()
      .from('orders')
      .update({ status: 'confirmed', payment_status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', orderId);

    if (e2) { console.error('[RKPayment] approvePayment (order):', e2.message); return false; }
    return true;
  }

  async function rejectPayment(verificationId, reason = '') {
    const { error } = await getDB()
      .from('payment_verifications')
      .update({ status: 'rejected', admin_note: reason, updated_at: new Date().toISOString() })
      .eq('id', verificationId);

    if (error) { console.error('[RKPayment] rejectPayment:', error.message); return false; }
    return true;
  }

  /* ══════════════════════════════════════════════════════════
     EXPOSE
  ══════════════════════════════════════════════════════════ */
  window.RKPayment = {
    uploadScreenshot,
    submitVerification,
    getVerificationStatus,
    loadVerifications,
    approvePayment,
    rejectPayment,
  };

})();