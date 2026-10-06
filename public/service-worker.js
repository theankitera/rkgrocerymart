/* ============================================
   RINKU KIRANA — SERVICE WORKER

   BUG FIX (Info #13): CACHE_VERSION ab auto-bump ke liye ready hai.
   Build step ya Vercel deployment script se ye value inject kar sakte ho.

   OPTION A (Recommended) — Build script se inject karo:
     package.json script mein add karo:
       "prebuild": "node scripts/bump-sw-version.js"
     scripts/bump-sw-version.js mein:
       const fs = require('fs');
       const sw = fs.readFileSync('service-worker.js', 'utf8');
       const ts = Date.now();
       fs.writeFileSync('service-worker.js', sw.replace(/CACHE_VERSION = "v\d+[^"]*"/, `CACHE_VERSION = "v${ts}"`));

   OPTION B — Deploy hook (Vercel):
     Vercel settings > Git > Deploy Hooks se ek webhook banao,
     jo deployment ke baad is file ko rewrite kare.

   OPTION C (Manual — current) — Har deploy par neeche ki line mein
     version number manually badhao. Ye simple hai par bhoolne par
     users purana cached version dekhte rahenge.

   Ab current version:
   ============================================ */
"use strict";

// IndexedDB action queue (sync-cart replay) — page ke saath shared module
importScripts("/js/sync-queue.js");

// BUG FIX (Info #13): Version string ab comments mein clearly marked hai.
// Har deploy par yahan ka number badhao agar OPTION C use kar rahe ho.
const CACHE_VERSION = "v21"; // ← 2026-08-13: fixes bundle (auth.css precache fix, offline page cleanup, etc.)
const CACHE_NAME = `rk-cache-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

// Supabase REST replay ke liye (page ke against nahi — SW khud call karta hai)
const SUPABASE_URL = "https://pffaflasgwhydkmxwkky.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__tFDYhkM3blZ0pIVT0YxLA_YvkKq79L";

const PRECACHE_URLS = [
  "/offline.html",
  "/manifest.json",
  "/css/auth.css",
  "/pwa.css",
  "/icons/app-logo.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/rk-logo.svg",
  "/js/analytics.js",
  "/js/sync-queue.js",
  "/js/cart.js",
  "/js/orders.js",
  "/js/payment.js",
  "/js/profile.js",
];

// ── INSTALL ───────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
    )
  );
  // NOTE: skipWaiting() deliberately NOT called here.
  // pwa.js "Update available" banner user ko control deta hai.
});

// ── ACTIVATE — clean up old cache versions ────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("rk-cache-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Page se force-activate trigger
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// ── FETCH ──────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Supabase calls aur non-GET kabhi intercept nahi karo
  if (
    req.method !== "GET" ||
    url.hostname.endsWith("supabase.co") ||
    url.hostname.endsWith("supabase.in")
  ) {
    return;
  }

  // Cross-origin (CDN, fonts) pass through
  if (url.origin !== self.location.origin) return;

  // Page navigations: network-first → cache → offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// ── PUSH NOTIFICATIONS ─────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); }
  catch (e) { payload = { title: "RK Grocery Mart", body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(payload.title || "RK Grocery Mart", {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-96.png",
      data: payload.url || "/index.html",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data || "/index.html";
  event.waitUntil(self.clients.openWindow(url));
});

// ── BACKGROUND SYNC (offline cart actions replay) ────────────────────
// cart.js offline hone par upsert/delete/clear actions ko IndexedDB queue
// (RKSyncQueue, tag: 'sync-cart') mein daalta hai aur sync register karta
// hai. Connection wapas aate hi browser ye event fire karta hai — yahan
// queue ko Supabase REST se replay karte hain (SW khud fetch karta hai,
// isliye page ke supabase client ki zaroorat nahi).
//
// Idempotent: upsert (merge-duplicates), delete, clear — page ka flushQueue
// bhi concurrently chal sakta hai, koi harm nahi.
async function replayCartSync() {
  try {
    if (!self.RKSyncQueue) return;
    const entries = await self.RKSyncQueue.list("sync-cart");
    if (!entries.length) return;

    for (const entry of entries) {
      const p = entry.payload || {};
      if (!p.token || !p.userId) {
        await self.RKSyncQueue.remove(entry.id); // replay impossible — drop
        continue;
      }
      const headers = {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + p.token,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      };
      let res;
      try {
        if (p.type === "upsert" && p.item) {
          const it = p.item;
          res = await fetch(
            SUPABASE_URL + "/rest/v1/cart_items?on_conflict=user_id,product_id,variant",
            {
              method: "POST",
              headers: Object.assign({}, headers, { Prefer: "resolution=merge-duplicates,return=minimal" }),
              body: JSON.stringify([{
                user_id: p.userId,
                product_id: it.id,
                name: it.name,
                unit: it.unit,
                price: it.price,
                old_price: it.old || null,
                emoji: it.e,
                category: it.cat,
                bg_color: it.bg || null,
                qty: it.qty,
                image: it.image || null,
                variant: it.variant || "",
                updated_at: new Date().toISOString(),
              }]),
            }
          );
        } else if (p.type === "delete") {
          const q = new URLSearchParams({
            user_id: "eq." + p.userId,
            product_id: "eq." + p.productId,
            variant: "eq." + (p.variant || ""),
          });
          res = await fetch(SUPABASE_URL + "/rest/v1/cart_items?" + q.toString(), {
            method: "DELETE",
            headers: headers,
          });
        } else if (p.type === "clear") {
          res = await fetch(SUPABASE_URL + "/rest/v1/cart_items?user_id=eq." + p.userId, {
            method: "DELETE",
            headers: headers,
          });
        } else {
          await self.RKSyncQueue.remove(entry.id); // unknown type — drop
          continue;
        }

        if (res && res.ok) {
          await self.RKSyncQueue.remove(entry.id);
        } else if (res && (res.status === 401 || res.status === 403)) {
          // Token expire — drop nahi karte: page ka flushQueue fresh token ke
          // saath handle karega. Bas zyada retries par drop (queue bounded).
          const attempts = (p.attempts || 0) + 1;
          if (attempts > 5) await self.RKSyncQueue.remove(entry.id);
          else await self.RKSyncQueue.update(entry.id, { attempts: attempts });
        }
        // Network error / other 4xx: queue mein rehne do — next sync retry karega
      } catch (e) {
        // network failure — queue mein rehne do
      }
    }
  } catch (e) {
    console.warn("[RKSW] sync-cart:", e.message);
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-cart") {
    event.waitUntil(replayCartSync());
  }
});
