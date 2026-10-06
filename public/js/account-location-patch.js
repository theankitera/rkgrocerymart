/**
 * account-location-patch.js
 * Rinku Kirana Store — Address Tab Location Integration
 *
 * Drop this script at the bottom of account.html (before </body>).
 * It patches the address form (showAddrForm) to include the
 * "Use Current Location" button and delivery status widget,
 * and saves lat/lng/distance_km to Supabase with each address.
 *
 * Depends on: location-service.js, delivery-radius.js,
 *             checkout-location.js (for shared UI helpers)
 */

(function () {
  'use strict';

  // ── Wait for RK modules ──────────────────────────────────────────
  function whenReady(cb) {
    if (window.RKLocation && window.RKDelivery) cb();
    else setTimeout(() => whenReady(cb), 120);
  }

  whenReady(function () {

    // Keep a reference to the original showAddrForm so we can wrap it.
    const _origShowAddrForm = window.showAddrForm;
    if (!_origShowAddrForm) {
      console.warn('[AccountLocation] showAddrForm not found — skipping patch.');
      return;
    }

    // ── Saved location state for this form session ───────────────
    let _detectedLat = null;
    let _detectedLng = null;
    let _detectedDistKm = null;

    // ── Patched showAddrForm ─────────────────────────────────────
    window.showAddrForm = function (editId) {
      // Reset detection state each time the form opens.
      _detectedLat = null;
      _detectedLng = null;
      _detectedDistKm = null;

      // Call original to render the form HTML.
      _origShowAddrForm(editId);

      // Now inject our location button after the form renders.
      requestAnimationFrame(() => _injectLocationButton(editId));
    };

    function _injectLocationButton(editId) {
      const formWrap = document.getElementById('addrFormWrap');
      if (!formWrap) return;

      // Don't double-inject.
      if (formWrap.dataset.rkLocInjected === '1') return;
      formWrap.dataset.rkLocInjected = '1';

      // Find label field — insert button above it.
      const labelInput = document.getElementById('af_label');
      if (!labelInput) return;

      const fieldGroup = labelInput.closest('.field-group') || labelInput.parentElement;
      if (!fieldGroup) return;

      // Build button.
      const btnWrap = document.createElement('div');
      btnWrap.style.marginBottom = '12px';

      const btn = document.createElement('button');
      btn.type      = 'button';
      btn.className = 'rk-loc-btn';
      btn.textContent = '📍 Use Current Location';

      // Build status container.
      const statusWrap = document.createElement('div');
      statusWrap.className = 'rk-ds-container';
      statusWrap.style.display = 'none';
      statusWrap.style.marginBottom = '12px';

      btnWrap.appendChild(btn);

      const cardBody = formWrap.querySelector('.card-body');
      if (cardBody) {
        cardBody.insertBefore(statusWrap, cardBody.firstChild);
        cardBody.insertBefore(btnWrap, cardBody.firstChild);
      } else {
        formWrap.insertBefore(statusWrap, fieldGroup);
        formWrap.insertBefore(btnWrap, statusWrap);
      }

      // ── Button click handler ─────────────────────────────────
      btn.addEventListener('click', async function () {
        _setButtonState(btn, 'loading');
        statusWrap.innerHTML = '';
        statusWrap.style.display = 'none';
        statusWrap.classList.remove('rk-ds-visible');

        try {
          const forceRefresh = btn.className.includes('success') || btn.className.includes('denied');
          const pos  = await window.RKLocation.getCurrentPosition(forceRefresh);
          const info = window.RKDelivery.calculate(pos.lat, pos.lng);

          _detectedLat    = pos.lat;
          _detectedLng    = pos.lng;
          _detectedDistKm = info.distanceKm;

          // Reverse-geocode the GPS fix into a best-effort address and fill
          // any empty fields (never overwrite something the user already typed).
          const line1Input = document.getElementById('af_line1');
          const cityInput  = document.getElementById('af_city');
          const pinInput   = document.getElementById('af_pin');

          if (window.RKDelivery?.reverseGeocode) {
            const addr = await window.RKDelivery.reverseGeocode(pos.lat, pos.lng);
            if (addr) {
              if (line1Input && !line1Input.value.trim() && addr.line1) {
                line1Input.value = addr.line1;
              }
              if (cityInput && addr.city && (!cityInput.value.trim() || cityInput.value.trim() === 'Jaunpur')) {
                cityInput.value = addr.city;
              }
              if (pinInput && addr.pincode && (!pinInput.value.trim() || pinInput.value.trim() === '222001')) {
                pinInput.value = addr.pincode;
              }
            }
          }

          // Fallback: if reverse geocoding didn't run/produce a city, keep the
          // previous behaviour of defaulting blank city to 'Jaunpur'.
          if (cityInput && !cityInput.value.trim()) {
            cityInput.value = 'Jaunpur';
          }

          _setButtonState(btn, 'success');

          statusWrap.innerHTML = window.RKDelivery.renderBadgeHTML(info);
          statusWrap.style.display = 'block';
          requestAnimationFrame(() => statusWrap.classList.add('rk-ds-visible'));

          _showToast(
            info.available
              ? info.charge === 0
                ? '✅ Location detect hua! Free delivery available.'
                : `🚚 Location detect hua! Delivery charge: ₹${info.charge}`
              : '⚠️ Yeh location hamari delivery range se bahar hai.',
            3500
          );

        } catch (err) {
          const isDenied = err.code === 1;
          _setButtonState(btn, isDenied ? 'denied' : 'error');
          _detectedLat = null;
          _detectedLng = null;
          _detectedDistKm = null;

          statusWrap.innerHTML = `
            <div class="dr-status-card dr-status-card--warn">
              <div class="dr-status-header">
                <span class="dr-status-emoji">⚠️</span>
                <div class="dr-status-text">
                  <div class="dr-status-label">Location Access Failed</div>
                  <div class="dr-status-sub dr-status-sub--warn">${err.message}</div>
                </div>
              </div>
              ${isDenied ? `<div class="dr-perm-hint">
                Browser settings → Site permissions → Location → Allow<br/>
                Ya manually apna address fill karein.
              </div>` : ''}
            </div>`;
          statusWrap.style.display = 'block';
          requestAnimationFrame(() => statusWrap.classList.add('rk-ds-visible'));

          _showToast(err.message, 4000);
        }
      });

      // Auto-trigger if cached.
      const cached = window.RKLocation.getCached();
      if (cached && editId === null) {
        btn.click();
      }
    }

    // ── Patch saveAddr to include location fields ─────────────────
    const _origSaveAddr = window.saveAddr;
    if (_origSaveAddr) {
      window.saveAddr = async function (editId) {
        // Inject detected coords before calling original save.
        // The original uses af_* field IDs to build the payload,
        // so we need to extend the RKProfile.saveAddress call.
        // We do this by temporarily patching RKProfile.saveAddress.

        if (!_detectedLat || !_detectedLng) {
          return _origSaveAddr(editId);
        }

        const _origSaveAddress = window.RKProfile && window.RKProfile.saveAddress;
        if (_origSaveAddress) {
          window.RKProfile.saveAddress = async function (userId, payload) {
            const enriched = {
              ...payload,
              latitude   : _detectedLat,
              longitude  : _detectedLng,
              distance_km: _detectedDistKm,
            };
            // Restore immediately so subsequent calls are unaffected.
            window.RKProfile.saveAddress = _origSaveAddress;
            return _origSaveAddress.call(window.RKProfile, userId, enriched);
          };
        }

        return _origSaveAddr(editId);
      };
    }
  });

  // ── Shared helpers ────────────────────────────────────────────────

  function _setButtonState(btn, state) {
    const map = {
      idle   : { text: '📍 Use Current Location',   cls: 'rk-loc-btn' },
      loading: { text: '⏳ Getting Location…',       cls: 'rk-loc-btn rk-loc-btn--loading', disabled: true },
      success: { text: '✅ Location Detected',        cls: 'rk-loc-btn rk-loc-btn--success' },
      denied : { text: '🔓 Retry Location Access',   cls: 'rk-loc-btn rk-loc-btn--denied' },
      error  : { text: '⚠️ Retry Location',          cls: 'rk-loc-btn rk-loc-btn--denied' },
    };
    const s = map[state] || map.idle;
    btn.textContent = s.text;
    btn.className   = s.cls;
    btn.disabled    = !!s.disabled;
  }

  function _showToast(msg, dur = 2800) {
    const existing = document.getElementById('toastEl');
    if (existing) {
      existing.textContent = msg;
      existing.style.display = 'block';
      clearTimeout(existing._t);
      existing._t = setTimeout(() => { existing.style.display = 'none'; }, dur);
    }
  }

})();
