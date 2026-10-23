/**
 * favicon.js — Admin Settings → Branding (favicon_url) ko LIVE apply karna
 * ----------------------------------------------------------------------------
 * BUG: Admin Cloudinary par favicon upload karke shop_settings.favicon_url me
 * save karta tha, par har HTML page me <link rel="icon"> STATIC tha — browser
 * tab icon kabhi badalta nahi tha.
 *
 * Ye script:
 *   1. Load par shop_settings (id=1) se favicon_url padhti hai (anon REST —
 *      koi supabase CDN/client ki zaroorat nahi) aur saare icon links par
 *      apply kar deti hai.
 *   2. `window.RKSetFavicon(url)` expose karti hai — React (App.jsx) ise
 *      realtime update ke liye call karta hai: admin ne save kiya → customer
 *      ke khule tab me turant badal gaya.
 *   3. URL empty ho to ORIGINAL (page ke hardcoded) icons restore ho jaate hain.
 *
 * apple-touch-icon / PWA manifest icons jaan-boojh kar skip kiye — wo fixed
 * size (180/192/512) chahiye, favicon_url koi bhi square ho sakta hai.
 * Config missing (offline.html jaisi) ho to silently skip — static icon rehta hai.
 */
(function () {
  'use strict';

  var DEFAULTS = null; // [{ link, href }] — pehli apply par capture

  function iconLinks() {
    return Array.prototype.slice.call(
      document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
    );
  }

  function captureDefaults() {
    if (DEFAULTS) return;
    DEFAULTS = iconLinks().map(function (l) {
      return { link: l, href: l.getAttribute('href') || '' };
    });
  }

  /** url = ''/null → page ke original icons wapas; warna sabhi icon links par url. */
  function applyFavicon(url) {
    captureDefaults();
    var href = url || '';
    DEFAULTS.forEach(function (d) {
      if (!d.link.isConnected) return; // head se koi link hat chuka ho
      d.link.setAttribute('href', href || d.href);
    });
    // Page par koi icon link hi nahi tha (edge) → ek dynamically banao
    if (href && !iconLinks().length) {
      var l = document.createElement('link');
      l.rel = 'icon';
      l.href = href;
      document.head.appendChild(l);
      DEFAULTS.push({ link: l, href: '' });
    }
  }

  // React (App.jsx) realtime ke liye isi ko call karta hai — pehle se defined
  // rakho taaki initial fetch se pehle call ho jaye to bhi safely kaam kare.
  window.RKSetFavicon = applyFavicon;

  function fetchAndApply() {
    var cfg = window.__RK_CONFIG__;
    if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      captureDefaults(); // config nahi → static icon, helper ready
      return;
    }
    fetch(cfg.supabaseUrl + '/rest/v1/shop_settings?select=favicon_url&id=eq.1', {
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: 'Bearer ' + cfg.supabaseAnonKey,
      },
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) {
        var url = (rows && rows[0] && rows[0].favicon_url) || '';
        applyFavicon(url);
      })
      .catch(function () { captureDefaults(); }); // offline/RLS fail → static
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchAndApply);
  } else {
    fetchAndApply();
  }
})();
