/**
 * maps-utils.js
 * Rinku Kirana Store — Maps & Link Utilities
 * Generates Google Maps links, displays maps buttons, admin navigation helpers.
 */

'use strict';

(function (window) {

  const SHOP_LAT = 25.7388984;
  const SHOP_LNG = 82.6638101;

  const MapsUtils = {

    /* ── Link builders ─────────────────────────────────────────────── */

    /** Directions from shop to customer (for delivery navigation). */
    navLink(lat, lng) {
      return `https://www.google.com/maps/dir/${SHOP_LAT},${SHOP_LNG}/${lat},${lng}`;
    },

    /** Drop a pin on the customer's location. */
    pinLink(lat, lng, label = '') {
      const q = label ? encodeURIComponent(label) : `${lat},${lng}`;
      return `https://www.google.com/maps/search/?api=1&query=${q}&center=${lat},${lng}`;
    },

    /** Standard Maps destination link (what the spec calls "View on Google Maps"). */
    destinationLink(lat, lng) {
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    },

    /** Street-view link. */
    streetViewLink(lat, lng) {
      return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
    },

    /* ── HTML button builders (for admin panel) ────────────────────── */

    /**
     * Returns the HTML string for a pair of admin-panel map buttons.
     * Inject into any table cell / card.
     */
    adminButtonsHTML(lat, lng, label = '') {
      if (!lat || !lng) {
        return `<span style="color:var(--gray);font-size:.7rem;">No GPS data</span>`;
      }
      const viewHref = this.pinLink(lat, lng, label);
      const navHref  = this.navLink(lat, lng);
      return `
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        <a href="${viewHref}" target="_blank" rel="noopener" class="mu-btn mu-btn--view" title="Google Maps par dekho">
          🗺️ View Map
        </a>
        <a href="${navHref}" target="_blank" rel="noopener" class="mu-btn mu-btn--nav" title="Navigation shuru karo">
          🧭 Navigate
        </a>
      </div>`;
    },

    /**
     * Returns the HTML string for a compact distance badge (used in admin order rows).
     */
    distanceBadgeHTML(distanceKm, charge, available) {
      if (distanceKm == null) return `<span class="mu-dist-unknown">–</span>`;
      const cls = !available
        ? 'mu-dist--unavail'
        : charge === 0
          ? 'mu-dist--free'
          : 'mu-dist--paid';
      const chargeLabel = !available
        ? '❌ Out of range'
        : charge === 0
          ? '✅ FREE'
          : `🚚 ₹${charge}`;
      return `
      <div class="mu-dist-badge ${cls}">
        <div class="mu-dist-km">${Number(distanceKm).toFixed(1)} km</div>
        <div class="mu-dist-charge">${chargeLabel}</div>
      </div>`;
    },

    /**
     * Render a small static map thumbnail using OpenStreetMap tiles (free, no API key).
     * Returns an <img> tag string.
     */
    staticMapImageHTML(lat, lng, zoom = 14, w = 320, h = 180) {
      // Uses the free openstreetmap-based staticmap endpoint (no key required).
      const url = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${w}x${h}&markers=${lat},${lng},red-pushpin`;
      return `<img src="${url}" alt="Customer location map" class="mu-static-map" loading="lazy" width="${w}" height="${h}" onerror="this.style.display='none'"/>`;
    },

    /* ── Coordinate formatter ──────────────────────────────────────── */

    formatCoords(lat, lng) {
      return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
    },
  };

  window.RKMaps = MapsUtils;

})(window);
