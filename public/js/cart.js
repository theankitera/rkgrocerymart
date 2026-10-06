/**
 * cart.js — Rinku Kirana
 * Guest (localStorage) + Logged-in (Supabase) + Merge on login
 *
 * BUG FIX (High #6): Cart merge race condition fixed.
 * Pehle setUser() mein mergeGuestCart() ke baad dobara dbLoad() call hota
 * tha. Network slow ho to dbLoad() merge se pehle resolve ho jaata tha aur
 * merged items overwrite ho jaate the — user ka cart empty dikh sakta tha.
 * Ab mergeGuestCart() ke baad _cart ko wahi rehne dete hain.
 */
(function () {
  'use strict';

  const LS_KEY = 'rk_cart_v1';
  const getDB = () => window.sb;

  const listeners = [];
  function notify(cart) { listeners.forEach(fn => fn([...cart])); }

  let _cart = [];
  let _userId = null;

  // Multi-unit (2026-08): ek hi product ke alag units alag cart lines hain.
  // Line key = product.id (single-unit) ya product.id + '::' + variant label.
  function lineKey(item) {
    if (item && item.k) return item.k;
    if (item && item.variant) return item.id + '::' + item.variant;
    return item ? String(item.id) : '';
  }

  function lsSave(cart) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cart)); } catch (_) {}
  }
  function lsLoad() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (_) { return []; }
  }
  function lsClear() {
    try { localStorage.removeItem(LS_KEY); } catch (_) {}
  }

  async function dbLoad(userId) {
    const { data, error } = await getDB()
      .from('cart_items').select('*').eq('user_id', userId);
    if (error) { console.error('[RKCart] dbLoad:', error.message); return []; }
    return (data || []).map(r => ({
      id: r.product_id, name: r.name, unit: r.unit,
      price: r.price, old: r.old_price, e: r.emoji,
      cat: r.category, bg: r.bg_color, qty: r.qty,
      // BUG FIX (2026-08): cart drawer me product image refresh ke baad bhi
      // dikhe — pehle image DB me store nahi hoti thi, isliye logged-in cart
      // DB se load hote hi image gayab ho jati thi.
      image: r.image || null,
      // Multi-unit (2026-08): variant = products.units[].label; line key usi
      // par alag banta hai taaki 1/2kg aur 1kg ek saath cart me reh sakein.
      variant: r.variant || '',
      k: r.variant ? r.product_id + '::' + r.variant : r.product_id,
    }));
  }

  async function dbUpsert(userId, item) {
    const { error } = await getDB().from('cart_items').upsert({
      user_id: userId, product_id: item.id, name: item.name,
      unit: item.unit, price: item.price, old_price: item.old || null,
      emoji: item.e, category: item.cat, bg_color: item.bg || null,
      qty: item.qty, image: item.image || null,
      variant: item.variant || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,product_id,variant' });
    if (error) console.error('[RKCart] dbUpsert:', error.message);
    return error || null; // null = success
  }

  async function dbDelete(userId, productId, variant) {
    const { error } = await getDB().from('cart_items').delete()
      .eq('user_id', userId).eq('product_id', productId).eq('variant', variant || '');
    if (error) console.error('[RKCart] dbDelete:', error.message);
    return error || null; // null = success
  }

  async function dbClear(userId) {
    const { error } = await getDB().from('cart_items').delete().eq('user_id', userId);
    if (error) console.error('[RKCart] dbClear:', error.message);
    return error || null; // null = success
  }

  // Network drop = queue karo; baaki errors (RLS/validation) ko kabhi retry
  // mat karo — wo permanently fail honge aur queue ko rot karte rahenge.
  function _isNetworkError(err) {
    if (!err) return false;
    const m = String(err.message || '').toLowerCase();
    return m.includes('fetch') || m.includes('network') || m.includes('networkerror') ||
           m.includes('failed to fetch') || m.includes('typeerror') || m.includes('load failed');
  }

  /* ── BACKGROUND SYNC (offline cart replay) ──────────────────────────
   * Logged-in user offline ho to DB write fail hota hai — action ko
   * IndexedDB queue (sync-queue.js) mein daal do. Online hote hi:
   *   1. page 'online' event par flushQueue() — turant replay
   *   2. service worker 'sync-cart' background sync — replay (browser level)
   * Dono idempotent hain (upsert same data / delete / clear), isliye
   * concurrent replay safe hai.
   */
  async function _getSessionToken() {
    try {
      const { data: { session } } = await getDB().auth.getSession();
      return session?.access_token || null;
    } catch (_) { return null; }
  }

  async function _registerSync() {
    try {
      if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('sync-cart');
    } catch (_) { /* unsupported/denied — page flush fallback handle kar leta hai */ }
  }

  async function _queueAction(action) {
    try {
      if (!window.RKSyncQueue) return;
      const token = await _getSessionToken();
      if (!token) return; // bina token replay possible nahi — session refresh par dobara try
      await window.RKSyncQueue.enqueue('sync-cart', { ...action, userId: _userId, token });
      await _registerSync();
    } catch (e) { console.warn('[RKCart] queue:', e.message); }
  }

  // Queue mein baaki actions ko page se hi replay (browsers bina background
  // sync ke bhi kaam karein + turant sync ke liye).
  async function flushQueue() {
    try {
      if (!window.RKSyncQueue) return;
      const entries = await window.RKSyncQueue.list('sync-cart');
      if (!entries.length) return;
      const { data: { session } } = await getDB().auth.getSession();
      if (!session?.user) return;
      for (const entry of entries) {
        const p = entry.payload || {};
        if (p.userId !== session.user.id) continue;
        let ok = false;
        if (p.type === 'upsert' && p.item) ok = !(await dbUpsert(p.userId, p.item));
        else if (p.type === 'delete') ok = !(await dbDelete(p.userId, p.productId, p.variant || ''));
        else if (p.type === 'clear') ok = !(await dbClear(p.userId));
        if (ok) await window.RKSyncQueue.remove(entry.id);
      }
      await _registerSync();
    } catch (e) { console.warn('[RKCart] flush:', e.message); }
  }

  window.addEventListener('online', () => { flushQueue(); _registerSync(); });

  /**
   * BUG FIX (High #6): mergeGuestCart ab merged result return karta hai.
   * Pehle ye function sirf DB mein save karta tha, return kuch nahi karta tha.
   * setUser() phir separate dbLoad() karta tha jo race condition create karta tha.
   * Ab mergeGuestCart() hi final merged cart return karta hai — no extra dbLoad needed.
   */
  async function mergeGuestCart(userId) {
    const guestItems = lsLoad();

    // BUG FIX (2026-08): offline hone par DB read/write fail hoga — guest
    // items ko localStorage se mat hatana aur DB write queue kar do. Online
    // hote hi sync replay karega aur agla init proper merge karega.
    if (!navigator.onLine) {
      if (guestItems.length) {
        for (const g of guestItems) await _queueAction({ type: 'upsert', userId, item: g });
      }
      return guestItems;
    }

    const dbItems = await dbLoad(userId);

    if (!guestItems.length) return dbItems; // kuch merge nahi karna, bas DB items return

    const merged = [...dbItems];
    for (const g of guestItems) {
      // lineKey se merge — multi-unit me alag variants alag lines rehti hain
      const existing = merged.find(i => lineKey(i) === lineKey(g));
      if (existing) {
        existing.qty = Math.max(existing.qty, g.qty);
      } else {
        merged.push(g);
      }
    }

    // Save merged back to Supabase
    for (const item of merged) {
      await dbUpsert(userId, item);
    }

    lsClear();
    return merged; // return karo, dobara load mat karo
  }

  async function setUser(user) {
    if (user && user.uid) {
      _userId = user.uid;
      // BUG FIX (High #6): mergeGuestCart ka result seedha use karo.
      // Pehle: await mergeGuestCart(); _cart = await dbLoad(); ← race condition
      // Ab:    _cart = await mergeGuestCart(); ← single source of truth
      _cart = await mergeGuestCart(_userId);
      notify(_cart);
    } else {
      if (_cart.length) lsSave(_cart);
      _userId = null;
      _cart = lsLoad();
      notify(_cart);
    }
  }

  async function init() {
    const { data: { session } } = await getDB().auth.getSession();
    if (session?.user) {
      _userId = session.user.id;
      // Same fix here
      _cart = await mergeGuestCart(_userId);
    } else {
      _cart = lsLoad();
    }
    notify(_cart);
    // Pending queued actions ko replay karo (SW sync ke alawa — turant + fallback)
    flushQueue();
  }

  async function addToCart(product) {
    const k = lineKey(product);
    const idx = _cart.findIndex(i => lineKey(i) === k);
    if (idx > -1) {
      _cart[idx].qty += 1;
    } else {
      _cart = [..._cart, { ...product, k, qty: 1 }];
    }
    _persist(_userId ? _cart.find(i => lineKey(i) === k) : null, product.id);
    notify(_cart);
  }

  async function removeFromCart(productId, k) {
    const key = k || lineKey({ id: productId });
    const item = _cart.find(i => lineKey(i) === key);
    const variant = item && item.variant ? item.variant : '';
    _cart = _cart.filter(i => lineKey(i) !== key);
    if (_userId) {
      if (navigator.onLine) {
        const err = await dbDelete(_userId, productId, variant);
        if (err && _isNetworkError(err)) await _queueAction({ type: 'delete', userId: _userId, productId, variant });
      } else {
        await _queueAction({ type: 'delete', userId: _userId, productId, variant });
      }
    } else { lsSave(_cart); }
    notify(_cart);
  }

  async function updateQuantity(productId, delta, k) {
    const key = k || productId;
    const idx = _cart.findIndex(i => lineKey(i) === key);
    if (idx === -1) return;
    _cart[idx].qty += delta;
    if (_cart[idx].qty <= 0) { await removeFromCart(productId, key); return; }
    _persist(_cart[idx], productId);
    notify(_cart);
  }

  async function clearCart() {
    _cart = [];
    if (_userId) {
      if (navigator.onLine) {
        const err = await dbClear(_userId);
        if (err && _isNetworkError(err)) await _queueAction({ type: 'clear', userId: _userId });
      } else {
        await _queueAction({ type: 'clear', userId: _userId });
      }
    } else { lsClear(); }
    notify(_cart);
  }

  async function _persist(item, productId) {
    if (_userId) {
      if (navigator.onLine) {
        if (item) {
          const err = await dbUpsert(_userId, item);
          if (err && _isNetworkError(err)) await _queueAction({ type: 'upsert', userId: _userId, item });
        } else {
          const err = await dbDelete(_userId, productId, '');
          if (err && _isNetworkError(err)) await _queueAction({ type: 'delete', userId: _userId, productId, variant: '' });
        }
      } else {
        if (item) await _queueAction({ type: 'upsert', userId: _userId, item });
        else await _queueAction({ type: 'delete', userId: _userId, productId, variant: '' });
      }
    } else {
      lsSave(_cart);
    }
  }

  function getCart()  { return [..._cart]; }
  function getCount() { return _cart.reduce((s, i) => s + i.qty, 0); }
  function getTotal() { return _cart.reduce((s, i) => s + i.price * i.qty, 0); }

  function onCartChange(fn) {
    listeners.push(fn);
    fn([..._cart]);
    return () => { const i = listeners.indexOf(fn); if (i > -1) listeners.splice(i, 1); };
  }

  window.RKCart = {
    init, setUser, addToCart, removeFromCart,
    updateQuantity, clearCart, getCart, getCount, getTotal, onCartChange,
  };

})();
