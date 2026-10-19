/**
 * api/_notify.js — shared notification helper (underscore = Vercel endpoint nahi banta)
 *
 * Ek hi jagah dono kaam:
 *   1. `notifications` table me in-app notification row insert
 *      (Account → Alerts tab isi ko padhta hai).
 *   2. `push_subscriptions` se user ke subscriptions nikaal kar web-push
 *      bhejna (service-worker.js ka push handler payload ko showNotification
 *      me render karta hai). Stale subscriptions (404/410) delete ho jaati hain.
 *
 * Env (sab Vercel dashboard me set hain):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   VAPID_PUBLIC_KEY (fallback: VITE_VAPID_PUBLIC_KEY), VAPID_PRIVATE_KEY, VAPID_SUBJECT
 *
 * Ye function best-effort hai — notification fail hone par ORDER FLOW kabhi
 * fail nahi hona chahiye, isliye kabhi throw nahi karta.
 */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fheewnarnocdzcvvshrj.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@rkgrocerymart.com';

let webpush = null;
try { webpush = require('web-push'); } catch (e) { webpush = null; }

function rest(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=minimal',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
}

/**
 * sendUserNotification({ userId, title, message, type?, url? })
 * → { ok, inApp?, push? } — kabhi throw nahi karta.
 */
async function sendUserNotification({ userId, title, message, type = 'order', url = '/account.html?tab=orders' }) {
  const out = { ok: false };
  if (!userId || !title || !message) { out.reason = 'missing userId/title/message'; return out; }
  if (!SUPABASE_SERVICE_ROLE_KEY) { out.reason = 'service role key missing'; return out; }

  // ── 1) In-app notifications row ──────────────────────────────────
  try {
    const r = await rest('notifications', {
      method: 'POST',
      body: {
        user_id: userId,
        title: String(title).slice(0, 120),
        message: String(message).slice(0, 500),
        type, // offer | order | delivery | stock | system (AccountPage mapping)
        is_read: false,
        created_at: new Date().toISOString(),
      },
    });
    out.inApp = r.ok ? 'inserted' : `failed:${r.status}`;
  } catch (e) {
    out.inApp = `error:${e?.message || e}`;
  }

  // ── 2) Web push ──────────────────────────────────────────────────
  if (!webpush || !VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
    out.push = 'skipped (web-push/vapid missing)';
    out.ok = out.inApp === 'inserted';
    return out;
  }
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const subsRes = await rest(
      `push_subscriptions?select=endpoint,keys&user_id=eq.${encodeURIComponent(userId)}`
    );
    const subs = subsRes.ok ? await subsRes.json().catch(() => []) : [];
    if (!Array.isArray(subs) || !subs.length) {
      out.push = 'no subscriptions';
      out.ok = out.inApp === 'inserted';
      return out;
    }

    const payload = JSON.stringify({
      title: String(title).slice(0, 120),
      body: String(message).slice(0, 300),
      url,
    });

    let sent = 0, failed = 0;
    await Promise.all(subs.map(async (sub) => {
      if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
          payload
        );
        sent++;
      } catch (err) {
        failed++;
        // Subscription mar chuka hai (browser ne unsubscribe kiya) → clean up.
        const sc = err && err.statusCode;
        if (sc === 404 || sc === 410) {
          try { await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE' }); } catch (_) {}
        } else {
          console.warn('[notify] push send failed:', sc || err?.message || err);
        }
      }
    }));
    out.push = `sent:${sent},failed:${failed}`;
  } catch (e) {
    out.push = `error:${e?.message || e}`;
  }

  out.ok = true;
  return out;
}

module.exports = { sendUserNotification };
