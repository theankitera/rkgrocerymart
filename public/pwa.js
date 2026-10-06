/* ============================================
   RINKU KIRANA — PWA.JS
   Service worker registration, install prompt,
   iOS "Add to Home Screen" fallback, and the
   update-available banner. Include pwa.css +
   this file on every page (after auth.js if
   present — fully independent of it either way).
   ============================================ */
(function () {
  "use strict";

  if (window.__RK_PWA_INITIALIZED__) return;
  window.__RK_PWA_INITIALIZED__ = true;

  var DISMISS_KEY = "rk_pwa_install_dismissed_until";
  var DISMISS_DAYS = 7;

  // ── tiny DOM helper ──
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
  }

  function isDismissed() {
    try {
      var until = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
      return Date.now() < until;
    } catch (e) {
      return false;
    }
  }

  function dismissForDays(days) {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000));
    } catch (e) {}
  }

  /* ========== SERVICE WORKER REGISTRATION ========== */
  var waitingWorker = null;

  function showUpdateBanner() {
    if (document.getElementById("rkPwaUpdateBanner")) return;
    var banner = el(
      "div",
      "rk-pwa-update-banner",
      '<span>🔄 Naya version available hai</span>' +
        '<button class="rk-pwa-btn" id="rkPwaUpdateBtn">Refresh Karein</button>'
    );
    banner.id = "rkPwaUpdateBanner";
    document.body.appendChild(banner);
    requestAnimationFrame(function () {
      banner.classList.add("rk-pwa-show");
    });
    document.getElementById("rkPwaUpdateBtn").addEventListener("click", function () {
      if (waitingWorker) waitingWorker.postMessage("SKIP_WAITING");
    });
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/service-worker.js")
      .then(function (reg) {
        // A worker already controls the page AND a new one is waiting —
        // covers the case where the update happened while this tab was
        // closed/backgrounded.
        if (reg.waiting && navigator.serviceWorker.controller) {
          waitingWorker = reg.waiting;
          showUpdateBanner();
        }

        reg.addEventListener("updatefound", function () {
          var newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", function () {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller // i.e. not the very first install
            ) {
              waitingWorker = newWorker;
              showUpdateBanner();
            }
          });
        });

        // Check for an update whenever the tab regains focus, and every
        // few minutes while open — browsers only check on hard navigation
        // by default, this catches updates sooner.
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "visible") reg.update();
        });
        setInterval(function () {
          reg.update();
        }, 5 * 60 * 1000);
      })
      .catch(function (err) {
        console.warn("[RKPWA] Service worker register failed:", err);
      });

    // When the new worker takes control, reload once so the page picks up
    // the fresh assets.
    var reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }

  /* ========== INSTALL PROMPT (Android/Chrome/Edge) ========== */
  var deferredPrompt = null;

  function showInstallBanner() {
    if (isStandalone() || isDismissed()) return;
    if (document.getElementById("rkPwaInstallBanner")) return;

    var banner = el(
      "div",
      "rk-pwa-install-banner",
      '<div class="rk-pwa-install-icon">🛒</div>' +
        '<div class="rk-pwa-install-text">' +
        '<p class="rk-pwa-install-title">RK Grocery Mart App Install Karein</p>' +
        '<p class="rk-pwa-install-sub">Fast loading, offline access, home screen icon</p>' +
        "</div>" +
        '<div class="rk-pwa-install-actions">' +
        '<button class="rk-pwa-btn rk-pwa-btn-ghost" id="rkPwaInstallLater">Baad Mein</button>' +
        '<button class="rk-pwa-btn rk-pwa-btn-primary" id="rkPwaInstallNow">Install</button>' +
        "</div>"
    );
    banner.id = "rkPwaInstallBanner";
    document.body.appendChild(banner);

    // Mobile par actual header ki height le kar banner ki top position set karo
    var mobileHeader = document.querySelector(".header");
    if (mobileHeader && window.innerWidth < 768) {
      var h = mobileHeader.offsetHeight;
      banner.style.top = (h + 6) + "px";
    }

    requestAnimationFrame(function () {
      banner.classList.add("rk-pwa-show");
    });

    document.getElementById("rkPwaInstallLater").addEventListener("click", function () {
      dismissForDays(DISMISS_DAYS);
      hideInstallBanner();
    });
    document.getElementById("rkPwaInstallNow").addEventListener("click", function () {
      hideInstallBanner();
      if (isIOS()) {
        showIOSSheet();
        return;
      }
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function () {
        deferredPrompt = null;
      });
    });
  }

  function hideInstallBanner() {
    var b = document.getElementById("rkPwaInstallBanner");
    if (!b) return;
    b.classList.remove("rk-pwa-show");
    setTimeout(function () {
      b.remove();
    }, 320);
  }

  function showIOSSheet() {
    if (document.getElementById("rkPwaIosSheet")) return;
    var sheet = el(
      "div",
      "rk-pwa-ios-sheet",
      '<div class="rk-pwa-ios-card">' +
        "<h3>Home Screen Par Add Karein</h3>" +
        "<p>Safari ke Share button <strong>⬆️</strong> par tap karein, phir " +
        '<strong>"Add to Home Screen"</strong> chunein.</p>' +
        '<button class="rk-pwa-btn rk-pwa-btn-primary" id="rkPwaIosClose">Samajh Gaya</button>' +
        "</div>"
    );
    sheet.id = "rkPwaIosSheet";
    document.body.appendChild(sheet);
    requestAnimationFrame(function () {
      sheet.classList.add("rk-pwa-show");
    });
    document.getElementById("rkPwaIosClose").addEventListener("click", function () {
      sheet.classList.remove("rk-pwa-show");
      setTimeout(function () {
        sheet.remove();
      }, 250);
      dismissForDays(DISMISS_DAYS);
    });
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    hideInstallBanner();
    try { localStorage.removeItem(DISMISS_KEY); } catch (e) {}
  });

  // iOS never fires beforeinstallprompt — show our own banner after a
  // short delay if it's iOS Safari and not already installed/dismissed.
  function maybeShowIOSPrompt() {
    if (isIOS() && !isStandalone() && !isDismissed()) {
      setTimeout(showInstallBanner, 2500);
    }
  }

  /* ========== PUBLIC API ========== */
  window.RKPWA = {
    promptInstall: function () {
      if (deferredPrompt) {
        deferredPrompt.prompt();
      } else if (isIOS()) {
        showIOSSheet();
      }
    },
    isStandalone: isStandalone,
  };
  // alias for index.html compatibility
  window.RKPwa = window.RKPWA;

  /* ========== BOOT ========== */
  window.addEventListener("load", function () {
    registerSW();
    maybeShowIOSPrompt();
  });
})();
