/**
 * location-service.js
 * Rinku Kirana Store — Smart Delivery System
 * Handles GPS permission, coordinate retrieval, caching and fallback.
 */

'use strict';

(function (window) {

  const CACHE_KEY   = 'rk_user_location';
  const CACHE_TTL   = 10 * 60 * 1000; // 10 minutes

  const GEO_OPTIONS = {
    enableHighAccuracy: true,
    timeout           : 12000,
    maximumAge        : 60000,
  };

  /* ─── Internal helpers ─────────────────────────────────────────── */

  function _readCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (Date.now() - cached.timestamp > CACHE_TTL) {
        sessionStorage.removeItem(CACHE_KEY);
        return null;
      }
      return cached;
    } catch (_) {
      return null;
    }
  }

  function _writeCache(locationData) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        ...locationData,
        timestamp: Date.now(),
      }));
    } catch (_) {}
  }

  function _clearCache() {
    try { sessionStorage.removeItem(CACHE_KEY); } catch (_) {}
  }

  /* ─── Public API ───────────────────────────────────────────────── */

  const LocationService = {

    /**
     * Returns true when geolocation is available in this browser.
     */
    isSupported() {
      return 'geolocation' in navigator;
    },

    /**
     * Resolves to { lat, lng, accuracy } or rejects with { code, message }.
     * Tries the session cache first; re-fetches from GPS if stale/absent.
     */
    getCurrentPosition(forceRefresh = false) {
      return new Promise((resolve, reject) => {

        if (!this.isSupported()) {
          return reject({
            code   : 'UNSUPPORTED',
            message: 'Aapke browser mein GPS supported nahi hai.',
          });
        }

        if (!forceRefresh) {
          const cached = _readCache();
          if (cached) return resolve(cached);
        }

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const data = {
              lat     : pos.coords.latitude,
              lng     : pos.coords.longitude,
              accuracy: Math.round(pos.coords.accuracy),
            };
            _writeCache(data);
            resolve(data);
          },
          (err) => {
            const messages = {
              1: 'GPS permission deny ki gayi. Please browser settings mein location allow karein.',
              2: 'Location detect nahi ho pa rahi. Thodi der baad retry karein.',
              3: 'Location fetch karne mein time out ho gaya. Dobara try karein.',
            };
            reject({
              code   : err.code,
              message: messages[err.code] || 'Location fetch karne mein error aayi.',
            });
          },
          GEO_OPTIONS
        );
      });
    },

    /**
     * Check if permission is already granted without prompting.
     * Resolves to 'granted' | 'denied' | 'prompt' | 'unknown'.
     */
    async getPermissionState() {
      try {
        if (!navigator.permissions) return 'unknown';
        const result = await navigator.permissions.query({ name: 'geolocation' });
        return result.state;
      } catch (_) {
        return 'unknown';
      }
    },

    /**
     * Clears the session-level position cache (call after saving an order).
     */
    clearCache: _clearCache,

    /**
     * Returns the cached position synchronously, or null.
     */
    getCached: _readCache,
  };

  window.RKLocation = LocationService;

})(window);
