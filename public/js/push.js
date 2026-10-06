/**
 * push.js — Web Push subscription registration
 * Rinku Kirana & General Store
 *
 * Service worker ke pass already `push` + `notificationclick` handlers hain —
 * bas koi subscription register nahi karta tha (isliye web push kabhi kaam
 * nahi karta tha). Ye module subscription bana kar push_subscriptions table
 * mein save karta hai (admin baad mein unhe push bhej sakta hai).
 *
 * Public API (window.RKPush):
 *   isSupported() → boolean
 *   subscribe()   → PushSubscription (permission + register + subscribe)
 *   save(userId)  → upsert into push_subscriptions (endpoint unique)
 *   unsave(userId)→ delete row + unsubscribe browser-side
 */
(function () {
  'use strict';

  // Vite ke VITE_VAPID_PUBLIC_KEY se inject hota hai (public key browser-safe)
  const VAPID_KEY = window.__RK_PUSH_VAPID__ || '';

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  function getDB() { return window.sb || window.supabase; }

  async function subscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('Push not supported in this browser');
    }
    if (!VAPID_KEY) throw new Error('VAPID key missing — push setup nahi hua');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      });
    }
    return sub;
  }

  async function save(userId) {
    const sub = await subscribe();
    const db = getDB();
    if (!db) throw new Error('Supabase client missing');
    const { error } = await db.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint: sub.endpoint,
      keys: (sub.toJSON() && sub.toJSON().keys) || {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    return true;
  }

  async function unsave(userId) {
    const db = getDB();
    let sub = null;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) sub = await reg.pushManager.getSubscription();
    } catch (_) { /* ignore */ }
    if (sub) {
      if (db) await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    return true;
  }

  window.RKPush = {
    isSupported: () => ('serviceWorker' in navigator && 'PushManager' in window && !!VAPID_KEY),
    subscribe,
    save,
    unsave,
  };
})();
