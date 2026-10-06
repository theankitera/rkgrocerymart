/**
 * checkout-location.js
 * Rinku Kirana Store — Checkout Location Integration
 *
 * Provides:
 *  - "Use Current Location" UI injection for checkout / address forms
 *  - Real-time delivery status widget
 *  - Checkout button gating based on delivery availability
 *  - Exposes window.RKCheckoutLocation for use in React checkout components
 *
 * Depends on: location-service.js, delivery-radius.js, maps-utils.js
 */

'use strict';

(function (window) {

  /* ─── State ──────────────────────────────────────────────────────── */
  let _currentDeliveryInfo = null;
  let _locationPinned      = false;

  /* ─── DOM helpers ────────────────────────────────────────────────── */

  function _el(id) { return document.getElementById(id); }

  function _showToast(msg, dur = 3000) {
    // Re-use the app's toast if available, else create one.
    const existing = _el('toastEl');
    if (existing) {
      existing.textContent = msg;
      existing.style.display = 'block';
      clearTimeout(existing._t);
      existing._t = setTimeout(() => { existing.style.display = 'none'; }, dur);
      return;
    }
    let t = _el('rk-location-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'rk-location-toast';
      t.style.cssText = `
        position:fixed;bottom:calc(88px + env(safe-area-inset-bottom,0px));
        left:50%;transform:translateX(-50%);
        background:#0F172A;color:#fff;
        padding:10px 22px;border-radius:50px;
        font-size:.82rem;font-weight:600;z-index:9999;
        white-space:nowrap;max-width:90vw;
        overflow:hidden;text-overflow:ellipsis;
        box-shadow:0 8px 32px rgba(0,0,0,.3);
        font-family:Inter,system-ui,sans-serif;
        transition:opacity .3s;
      `;
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._t);
    t._t = setTimeout(() => { t.style.opacity = '0'; }, dur);
  }

  /* ─── Location button UI state machine ──────────────────────────── */

  function _setButtonState(btn, state) {
    const states = {
      idle: {
        text    : '📍 Use Current Location',
        disabled: false,
        cls     : 'rk-loc-btn',
      },
      loading: {
        text    : '⏳ Getting Location…',
        disabled: true,
        cls     : 'rk-loc-btn rk-loc-btn--loading',
      },
      success: {
        text    : '✅ Location Detected',
        disabled: false,
        cls     : 'rk-loc-btn rk-loc-btn--success',
      },
      denied: {
        text    : '🔓 Retry Location Access',
        disabled: false,
        cls     : 'rk-loc-btn rk-loc-btn--denied',
      },
      error: {
        text    : '⚠️ Retry Location',
        disabled: false,
        cls     : 'rk-loc-btn rk-loc-btn--denied',
      },
    };
    const s = states[state] || states.idle;
    btn.textContent = s.text;
    btn.disabled    = s.disabled;
    btn.className   = s.cls;
  }

  /* ─── Delivery status widget ─────────────────────────────────────── */

  function _renderDeliveryStatus(containerId, deliveryInfo) {
    const wrap = _el(containerId);
    if (!wrap) return;

    const isAnimatingIn = !wrap.classList.contains('rk-ds-visible');
    wrap.innerHTML = window.RKDelivery
      ? window.RKDelivery.renderBadgeHTML(deliveryInfo)
      : _fallbackBadge(deliveryInfo);

    wrap.style.display = 'block';
    if (isAnimatingIn) {
      requestAnimationFrame(() => {
        wrap.classList.add('rk-ds-visible');
      });
    }
  }

  function _fallbackBadge(info) {
    const dist = info.distanceKm.toFixed(1);
    return `<div class="rk-ds-fallback">
      ${info.emoji} <strong>${info.label}</strong> — ${dist} km
      ${info.available ? ` | Delivery: ${info.charge === 0 ? 'FREE' : '₹' + info.charge}` : ''}
      ${info.eta ? ` | ETA: ${info.eta}` : ''}
    </div>`;
  }

  function _hideDeliveryStatus(containerId) {
    const wrap = _el(containerId);
    if (!wrap) return;
    wrap.classList.remove('rk-ds-visible');
    setTimeout(() => {
      wrap.style.display = 'none';
      wrap.innerHTML = '';
    }, 300);
  }

  /* ─── Checkout button gating ─────────────────────────────────────── */

  function _gateCheckoutButton(deliveryInfo) {
    // Try to find the order button in both vanilla and React render trees.
    const btns = document.querySelectorAll(
      '.place-order-btn, [data-rk-checkout-btn], #placeOrderBtn'
    );
    if (!btns.length) return;

    btns.forEach(btn => {
      if (!deliveryInfo || deliveryInfo.available) {
        // Remove gate — restore original text only if WE disabled it.
        if (btn.dataset.rkGated === '1') {
          btn.disabled = false;
          btn.dataset.rkGated = '0';
          btn.style.opacity = '';
          btn.style.cursor  = '';
          if (btn.dataset.rkOriginalText) {
            btn.textContent = btn.dataset.rkOriginalText;
          }
        }
      } else {
        // Gate it.
        if (!btn.dataset.rkOriginalText) {
          btn.dataset.rkOriginalText = btn.textContent;
        }
        btn.dataset.rkGated = '1';
        btn.disabled  = true;
        btn.style.opacity = '0.5';
        btn.style.cursor  = 'not-allowed';
        btn.textContent   = '❌ Delivery Not Available in Your Area';
      }
    });
  }

  /* ─── Core: trigger GPS fetch and update UI ──────────────────────── */

  async function _fetchAndRender(opts) {
    const {
      btn,
      statusContainerId,
      onSuccess,
      onError,
      forceRefresh = false,
    } = opts;

    _setButtonState(btn, 'loading');

    try {
      const pos  = await window.RKLocation.getCurrentPosition(forceRefresh);
      const info = window.RKDelivery.calculate(pos.lat, pos.lng);

      _currentDeliveryInfo = { ...info, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy };
      _locationPinned      = true;

      _setButtonState(btn, 'success');
      _renderDeliveryStatus(statusContainerId, info);
      _gateCheckoutButton(info);

      if (onSuccess) onSuccess(_currentDeliveryInfo);

      if (!info.available) {
        _showToast('❌ Delivery aapke location par available nahi hai.', 4500);
      } else if (info.charge === 0) {
        _showToast(`✅ Free delivery available! ETA: ${info.eta}`, 3000);
      } else {
        _showToast(`🚚 Delivery available — ₹${info.charge} charge. ETA: ${info.eta}`, 3500);
      }

    } catch (err) {
      const code  = err.code || 'UNKNOWN';
      const isPermDenied = code === 1;

      _setButtonState(btn, isPermDenied ? 'denied' : 'error');
      _currentDeliveryInfo = null;
      _locationPinned      = false;
      _gateCheckoutButton(null);

      // Show denial warning UI
      const statusWrap = _el(statusContainerId);
      if (statusWrap) {
        statusWrap.style.display = 'block';
        statusWrap.classList.add('rk-ds-visible');
        statusWrap.innerHTML = `
          <div class="dr-status-card dr-status-card--warn">
            <div class="dr-status-header">
              <span class="dr-status-emoji">⚠️</span>
              <div class="dr-status-text">
                <div class="dr-status-label">Location Access Failed</div>
                <div class="dr-status-sub dr-status-sub--warn">${err.message || 'GPS permission required.'}</div>
              </div>
            </div>
            ${isPermDenied ? `
            <div class="dr-perm-hint">
              Browser settings → Site settings → Location → Allow<br/>
              Ya neeche manually apna address fill karein.
            </div>` : ''}
          </div>`;
      }

      _showToast(err.message || 'Location fetch failed.', 4000);
      if (onError) onError(err);
    }
  }

  /* ─── Public API ─────────────────────────────────────────────────── */

  const CheckoutLocation = {

    /**
     * Inject a "Use Current Location" button + delivery status widget
     * into any container element.
     *
     * @param {Object} config
     * @param {string}   config.btnContainerId      — id of element to inject button into
     * @param {string}   config.statusContainerId   — id of element to render status card in
     * @param {Function} [config.onSuccess]         — cb(deliveryInfo) when location resolved
     * @param {Function} [config.onError]           — cb(err) when location fails
     */
    init(config) {
      const { btnContainerId, statusContainerId, onSuccess, onError } = config;

      const btnWrap = _el(btnContainerId);
      if (!btnWrap) return;

      // Avoid double-initialising.
      if (btnWrap.dataset.rkLocInit === '1') return;
      btnWrap.dataset.rkLocInit = '1';

      // Build button.
      const btn = document.createElement('button');
      btn.type      = 'button';
      btn.className = 'rk-loc-btn';
      btn.textContent = '📍 Use Current Location';

      btn.addEventListener('click', () => {
        _fetchAndRender({
          btn,
          statusContainerId,
          onSuccess,
          onError,
          forceRefresh: btn.className.includes('success') || btn.className.includes('denied'),
        });
      });

      btnWrap.appendChild(btn);

      // FIX: previously this only auto-triggered when a cached position
      // already existed, so first-time-this-session checkouts (the common
      // case) never got prompted automatically — the location button just
      // sat idle until the user noticed and tapped it themselves. Now we
      // always kick off the fetch as soon as the button mounts (it will
      // resolve instantly from cache if one exists, or prompt for a fresh
      // GPS permission/fix otherwise).
      _fetchAndRender({ btn, statusContainerId, onSuccess, onError, forceRefresh: false });
    },

    /**
     * Programmatic trigger (for React components — call from onSuccess hooks).
     */
    async fetchLocation(forceRefresh = false) {
      if (!window.RKLocation || !window.RKDelivery) {
        throw new Error('RKLocation or RKDelivery not loaded.');
      }
      const pos  = await window.RKLocation.getCurrentPosition(forceRefresh);
      const info = window.RKDelivery.calculate(pos.lat, pos.lng);
      _currentDeliveryInfo = { ...info, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy };
      _locationPinned      = true;
      return _currentDeliveryInfo;
    },

    /**
     * Returns the last calculated delivery info object, or null.
     */
    getDeliveryInfo() {
      return _currentDeliveryInfo;
    },

    /**
     * True if a GPS location has been successfully resolved this session.
     */
    isLocationPinned() {
      return _locationPinned;
    },

    /**
     * Validate before placing order. Returns { valid, reason, info }.
     */
    validate() {
      if (!_currentDeliveryInfo) {
        return {
          valid : false,
          reason: 'Location verify nahi hui. Pehle "Use Current Location" click karein.',
          info  : null,
        };
      }
      return window.RKDelivery.validate(
        _currentDeliveryInfo.lat,
        _currentDeliveryInfo.lng
      );
    },

    /**
     * Reset state (call after order is placed).
     */
    reset() {
      _currentDeliveryInfo = null;
      _locationPinned      = false;
      if (window.RKLocation) window.RKLocation.clearCache();
    },

    /** Show or hide the delivery status card. */
    renderStatus : _renderDeliveryStatus,
    hideStatus   : _hideDeliveryStatus,
    gateButton   : _gateCheckoutButton,
    showToast    : _showToast,
  };

  window.RKCheckoutLocation = CheckoutLocation;

})(window);
