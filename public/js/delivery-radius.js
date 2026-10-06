/**
 * delivery-radius.js
 * Rinku Kirana Store — Smart Delivery Radius Engine
 * Haversine-formula distance calculation + tiered delivery rules.
 */

'use strict';

(function (window) {

  /* ─── Shop origin ──────────────────────────────────────────────── */
  const SHOP = {
    lat : 25.7388984,
    lng : 82.6638101,
    name: 'RK Grocery Mart',
  };

  /* ─── Delivery tier config ─────────────────────────────────────── */
  const TIERS = [
    {
      id         : 'free',
      maxKm      : 5,
      charge     : 0,
      label      : 'FREE Delivery',
      emoji      : '✅',
      badgeClass : 'dr-badge--free',
      eta        : '20–35 minutes',
      available  : true,
    },
    {
      id         : 'paid',
      maxKm      : 8,
      charge     : 30,
      label      : 'Delivery Available',
      emoji      : '🚚',
      badgeClass : 'dr-badge--paid',
      eta        : '35–55 minutes',
      available  : true,
    },
    {
      id         : 'unavailable',
      maxKm      : Infinity,
      charge     : 0,
      label      : 'Delivery Not Available',
      emoji      : '❌',
      badgeClass : 'dr-badge--unavail',
      eta        : null,
      available  : false,
    },
  ];

  /* ─── Haversine formula ────────────────────────────────────────── */
  function _haversine(lat1, lng1, lat2, lng2) {
    const R  = 6371;          // Earth radius km
    const dL = _rad(lat2 - lat1);
    const dN = _rad(lng2 - lng1);
    const a  =
      Math.sin(dL / 2) * Math.sin(dL / 2) +
      Math.cos(_rad(lat1)) * Math.cos(_rad(lat2)) *
      Math.sin(dN / 2) * Math.sin(dN / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function _rad(deg) { return deg * (Math.PI / 180); }

  /* ─── Public API ───────────────────────────────────────────────── */

  const DeliveryRadius = {

    SHOP,
    TIERS,

    /**
     * BUG FIX (Critical #1): pehle delivery radius (8km) aur delivery charge (₹30)
     * hamesha hardcoded the — admin Settings page mein "Delivery Radius" aur
     * "Delivery Charge" badalne ka koi asar customer site par nahi padta tha.
     * Ab shop_settings table se ye dono values load karke "paid" tier ko
     * dynamically configure karte hain. Free tier (0-5km) wahi default rehta
     * hai jab tak admin ka radius usse chhota na ho.
     */
    ready: null,
    // BUG FIX: account.html par script parse-time par window.sb (React module)
    // ready nahi hota, aur CDN window.supabase UMD sirf createClient deta hai
    // (instance nahi) — isliye pehle .from() wala client dhoondho, nahi to
    // createClient se khud instance banao, aur agar abhi kuch bhi ready na ho
    // to window.sb ke aa jaane ka poll karo (max ~4s).
    _getClient() {
      const direct = window.sb || window.supabase || window.supabaseJs;
      if (direct && typeof direct.from === 'function') return direct;
      const SB = window.supabase || window.supabaseJs;
      const cfg = window.__RK_CONFIG__;
      if (SB && typeof SB.createClient === 'function' && cfg && cfg.supabaseUrl && cfg.supabaseAnonKey) {
        return SB.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      }
      return null;
    },
    async _loadFromShopSettings() {
      try {
        // Poll window.sb (React bundle account.html par async load hota hai)
        let sb = this._getClient();
        for (let i = 0; i < 14 && !sb; i++) {
          await new Promise(r => setTimeout(r, 300));
          sb = this._getClient();
        }
        if (!sb) return;
        const { data } = await sb.from('shop_settings').select('delivery_radius,delivery_charge').eq('id', 1).maybeSingle();
        if (!data) return;
        const radius = Number(data.delivery_radius);
        const charge = Number(data.delivery_charge);
        const paidTier = TIERS.find(t => t.id === 'paid');
        const freeTier = TIERS.find(t => t.id === 'free');
        if (radius > 0 && paidTier) {
          paidTier.maxKm = radius;
          if (freeTier) freeTier.maxKm = Math.min(freeTier.maxKm, radius);
        }
        if (!Number.isNaN(charge) && charge >= 0 && paidTier) {
          paidTier.charge = charge;
        }
      } catch (err) {
        console.error('[RKDelivery] shop_settings load failed, using defaults:', err);
      }
    },

    calculate(lat, lng) {
      const raw  = _haversine(SHOP.lat, SHOP.lng, lat, lng);
      const dist = Math.round(raw * 10) / 10;

      const tier = TIERS.find(t => dist <= t.maxKm) || TIERS[TIERS.length - 1];

      return {
        distanceKm  : dist,
        distanceRaw : raw,
        charge      : tier.charge,
        available   : tier.available,
        tier,
        label       : tier.label,
        emoji       : tier.emoji,
        eta         : tier.eta,
        badgeClass  : tier.badgeClass,
        mapsLink    : this.mapsLink(lat, lng),
        mapsNavLink : this.mapsNavLink(lat, lng),
      };
    },

    /**
     * Validate before order creation (second-layer server-side-style check).
     * Returns { valid, reason }.
     */
    validate(lat, lng) {
      const info = this.calculate(lat, lng);
      if (!info.available) {
        return {
          valid : false,
          reason: `Aapka location hamari delivery range se bahar hai (${info.distanceKm} km). Hum sirf 8 km tak deliver karte hain.`,
          info,
        };
      }
      return { valid: true, reason: null, info };
    },

    /**
     * Reverse-geocode coordinates into an address using OpenStreetMap's free
     * Nominatim API (no API key required). Returns a best-effort guess for
     * line1 (area/locality), city, and pincode — the customer should still
     * be able to edit these, since reverse geocoding is never 100% precise.
     *
     * @param {number} lat
     * @param {number} lng
     * @returns {Promise<{line1:string, city:string, pincode:string, raw:Object}|null>}
     */
    async reverseGeocode(lat, lng) {
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
        const res = await fetch(url, {
          headers: {
            // Nominatim's usage policy asks for a descriptive Accept-Language;
            // a custom User-Agent can't be set from browser fetch, but this is
            // still within their free public-usage terms for light client use.
            'Accept-Language': 'en,hi',
          },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const a = data.address || {};

        // Build a human-friendly line1 from the most specific parts available.
        const line1Parts = [
          a.house_number,
          a.road || a.pedestrian || a.neighbourhood,
          a.suburb || a.locality,
        ].filter(Boolean);

        const line1 = line1Parts.join(', ') || data.display_name || '';
        const city  = a.city || a.town || a.village || a.county || '';
        const pincode = a.postcode || '';

        return { line1, city, pincode, raw: data };
      } catch (err) {
        console.error('[RKDelivery] reverseGeocode failed:', err);
        return null;
      }
    },

    /** Google Maps destination link. */
    mapsLink(lat, lng) {
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    },

    /** Google Maps navigation link from shop to customer. */
    mapsNavLink(lat, lng) {
      return `https://www.google.com/maps/dir/${SHOP.lat},${SHOP.lng}/${lat},${lng}`;
    },

    /** Human-readable distance string. */
    distanceLabel(km) {
      return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
    },

    /**
     * Build the HTML for the delivery status badge card.
     * Ready to inject into any container.
     */
    renderBadgeHTML(info) {
      const distLabel = this.distanceLabel(info.distanceKm);
      const chargeLabel = info.charge === 0
        ? '<span class="dr-free-tag">FREE</span>'
        : `<span class="dr-charge-val">₹${info.charge}</span>`;

      return `
      <div class="dr-status-card ${info.badgeClass}">
        <div class="dr-status-header">
          <span class="dr-status-emoji">${info.emoji}</span>
          <div class="dr-status-text">
            <div class="dr-status-label">${info.label}</div>
            ${info.available
              ? `<div class="dr-status-sub">
                  Delivery charge: ${chargeLabel}
                </div>`
              : `<div class="dr-status-sub dr-status-sub--warn">
                  Hum is location par deliver nahi karte.
                </div>`
            }
          </div>
        </div>
        <div class="dr-meta-row">
          <div class="dr-meta-item">
            <span class="dr-meta-icon">📍</span>
            <div>
              <div class="dr-meta-label">Distance</div>
              <div class="dr-meta-val">${distLabel}</div>
            </div>
          </div>
          ${info.available ? `
          <div class="dr-meta-item">
            <span class="dr-meta-icon">💰</span>
            <div>
              <div class="dr-meta-label">Delivery</div>
              <div class="dr-meta-val">${info.charge === 0 ? 'FREE' : '₹' + info.charge}</div>
            </div>
          </div>
          <div class="dr-meta-item">
            <span class="dr-meta-icon">⏱️</span>
            <div>
              <div class="dr-meta-label">ETA</div>
              <div class="dr-meta-val">${info.eta}</div>
            </div>
          </div>` : ''}
        </div>
        ${!info.available ? `
        <div class="dr-unavail-msg">
          ❌ Sorry, aapka location hamari 8 km delivery range se bahar hai.
          <br/>Abhi hum sirf Jaunpur aur aas-paas ke areas mein deliver karte hain.
        </div>` : ''}
      </div>`;
    },
  };

  window.RKDelivery = DeliveryRadius;
  DeliveryRadius.ready = DeliveryRadius._loadFromShopSettings();

})(window);