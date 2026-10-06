/* ==========================================================================
   analytics.js — RK Grocery Mart visitor tracking (lightweight, no CDN)
   ==========================================================================
   Admin Dashboard ke "Visitors" aur "Conversion Rate" cards ke liye page
   views record karta hai. Kaise kaam karta hai:

   • Har page load par ek row `page_views` table mein insert hota hai.
   • `visitor_id` = anonymous, stable browser fingerprint (localStorage).
     Koi personal data nahi — sirf ek random id.
   • Refresh spam se bachne ke liye ek visitor sirf har 30 min mein ek baar
     (per path) count hota hai.
   • Supabase REST API directly call hota hai (fetch), isliye supabase-js
     CDN ya npm bundle ki zaroorat nahi. window.__RK_CONFIG__ se keys milti hain.
   • 100% fire-and-forget — fail ho to silently ignore (site kabhi nahi rukti).
   ========================================================================== */
(function () {
  try {
    var cfg = window.__RK_CONFIG__;
    if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

    // ── Stable anonymous visitor id (localStorage) ──────────────────────
    var VK = 'rk_visitor_id';
    var visitorId = null;
    try { visitorId = localStorage.getItem(VK); } catch (e) { /* ignore */ }
    if (!visitorId) {
      visitorId = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem(VK, visitorId); } catch (e) { /* ignore */ }
    }

    // ── Throttle: har path par ek visitor 30 min mein ek baar ──────────
    var TK = 'rk_pv_' + (location.pathname || '/');
    var last = 0;
    try { last = parseInt(localStorage.getItem(TK), 10) || 0; } catch (e) { /* ignore */ }
    var THROTTLE_MS = 30 * 60 * 1000;
    var now = Date.now();
    if (now - last < THROTTLE_MS) return;
    try { localStorage.setItem(TK, String(now)); } catch (e) { /* ignore */ }

    // ── Insert page view (fire-and-forget) ─────────────────────────────
    var payload = {
      visitor_id: visitorId,
      path: location.pathname,
      referrer: document.referrer || null,
    };
    var url = cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/page_views';
    fetch(url, {
      method: 'POST',
      headers: {
        'apikey': cfg.supabaseAnonKey,
        'Authorization': 'Bearer ' + cfg.supabaseAnonKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(function () { /* silently ignore */ });
  } catch (e) { /* never break the site */ }
})();
