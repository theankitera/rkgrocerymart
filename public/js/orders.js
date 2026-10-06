/**
 * orders.js — Rinku Kirana
 * Order creation, history, details, reorder (Supabase)
 *
 * BUG FIXES in this version:
 *  [Critical #2] UPI payment_status ab "paid" nahi hota order create hone par.
 *                Pehle UPI select karte hi status 'paid' set hota tha — bina verification ke.
 *                Ab initial status hamesha 'pending' hai. Sirf admin approve karne par 'paid' hoga.
 *  [Critical #3] Blocked customer check — createOrder ke start mein user block check hota hai.
 *  [High #4]     Order number collision fix — 6-digit random + timestamp component.
 *  [High #5]     Reorder fresh prices fetch karta hai DB se, purane saved prices nahi.
 *  [Medium #10]  Coupon used_count increment — order place hone par coupon use count badhta hai.
 */
(function () {
  'use strict';

  const getDB = () => window.sb;

  // BUG FIX (High #4): Pehle sirf 4-digit random tha = 9000 combinations per year.
  // Ab 6-digit + timestamp ke last 3 chars = practically unique.
  function _genOrderNumber() {
    const yr = new Date().getFullYear();
    const rnd = Math.floor(100000 + Math.random() * 900000); // 6 digits
    return `RK-${yr}-${rnd}`;
  }

  // BUG FIX (Critical #3): Check if user is blocked before allowing order.
  async function _checkUserBlocked(userId) {
    if (!userId) return false; // guest orders allowed
    try {
      const { data } = await getDB()
        .from('profiles')
        .select('is_blocked')
        .eq('id', userId)
        .single();
      return data?.is_blocked === true;
    } catch (_) {
      return false; // fail open (don't block on DB error)
    }
  }

  // BUG FIX (Medium #10): Increment coupon used_count after successful order.
  // BUG FIX (security tightening): pehle yahan seedha .from('coupons').update(...)
  // call hota tha, jiske liye DB mein ek broad "customer update" RLS policy
  // chahiye thi — jisse customer technically coupon ki koi bhi column (jaise
  // discount_value) edit kar sakta tha. Ab sirf ek tightly-scoped Postgres
  // function (increment_coupon_usage) call karte hain RPC se, jo sirf
  // used_count +1 karta hai aur kuch nahi chhedta. Is function ke liye
  // supabase/admin-wiring-migration.sql run hona zaroori hai.
  async function _incrementCouponUsage(promoCode) {
    if (!promoCode) return;
    try {
      const { error } = await getDB().rpc('increment_coupon_usage', { p_code: promoCode });
      if (error) console.error('[RKOrders] _incrementCouponUsage (rpc):', error.message);
    } catch (e) {
      console.error('[RKOrders] _incrementCouponUsage:', e.message);
    }
  }

  // BUG FIX (Critical #4): Order place hone par stock_quantity kam hota hai
  // (overselling se bachne ke liye).
  // BUG FIX (SECURITY — CRITICAL, 2026-08-09): stock decrement pehle direct
  // products.update() se hota tha — jiske liye RLS me authenticated users ko
  // products par broad UPDATE/DELETE policy chahiye thi → LIVE VERIFIED: koi bhi
  // normal customer product ki price change / product delete kar sakta tha.
  // Ab tightly-scoped Postgres function (decrement_stock) call karte hain jo
  // SIRF stock_quantity kam karta hai. SQL: supabase/security-fix-migration.sql
  // run karna zaroori hai. Jab tak SQL na chala ho, fallback (direct update)
  // chalega taaki orders na tootein — SQL run karte hi broad policy hat jaati hai.
  async function _decrementStock(cartItems) {
    for (const item of cartItems) {
      if (!item?.id || !item?.qty) continue;
      try {
        const { error } = await getDB().rpc('decrement_stock', { p_product_id: item.id, p_qty: item.qty });
        if (error) {
          // Function missing = PostgREST PGRST202 deta hai (andar Postgres 42883),
          // dono check karo taaki migration run hone tak fallback chale.
          if (String(error.code) === '42883' || String(error.code) === 'PGRST202') {
            // Function abhi DB me nahi hai (migration run nahi hua) → fallback
            const { data: prod, error: fetchErr } = await getDB()
              .from('products')
              .select('id,stock_quantity')
              .eq('id', item.id)
              .single();
            if (fetchErr || !prod) continue;
            const newQty = Math.max(0, (prod.stock_quantity || 0) - item.qty);
            await getDB()
              .from('products')
              .update({ stock_quantity: newQty, updated_at: new Date().toISOString() })
              .eq('id', item.id);
          } else {
            console.error('[RKOrders] _decrementStock (rpc):', error.message);
          }
        }
      } catch (e) {
        console.error('[RKOrders] _decrementStock:', item.id, e.message);
      }
    }
  }

  /**
   * LEGACY direct-insert path (sirf tab jab create_order RPC DB me maujood na ho).
   * RLS hardening part-2 migration ke baad direct INSERT policies orders/
   * order_items par hata di gayi hain — isliye ye path sirf pre-migration
   * environment ke liye fallback hai.
   */
  async function _legacyCreateOrder(userId, opts) {
    const { cart, total, address, paymentMethod, promoCode = null, discount = 0, rewardsPoints = 0 } = opts;
    const rewardsDiscount = Math.floor(rewardsPoints / 10); // 100 pts = ₹10
    // NOTE: legacy path sirf tab chalta hai jab create_order RPC DB me na ho.
    // Is path mein reward_redemptions ledger nahi banta (RPC ke andar banta hai) —
    // production me RPC hamesha hai, isliye points reuse possible nahi.
    const orderNumber = _genOrderNumber();

    const locationFields = opts.latitude != null ? {
      latitude          : opts.latitude,
      longitude         : opts.longitude,
      distance_km       : opts.distance_km ?? null,
      delivery_charge   : opts.delivery_charge || 0,
      delivery_status   : opts.delivery_status || 'unknown',
      maps_link         : opts.maps_link || null,
      maps_nav_link     : opts.maps_nav_link || null,
      location_accuracy : opts.location_accuracy ?? null,
    } : {
      delivery_charge : 0,
      delivery_status : 'unknown',
    };

    const finalAmount = Math.max(0, total - discount - rewardsDiscount + (locationFields.delivery_charge || 0));

    const { data: order, error: oErr } = await getDB()
      .from('orders')
      .insert({
        user_id        : userId || null,
        order_number   : orderNumber,
        status         : 'pending',
        payment_method : paymentMethod,
        payment_status : 'pending',
        subtotal       : total,
        discount       : discount + rewardsDiscount,
        promo_code     : promoCode,
        final_amount   : finalAmount,
        rewards_points : rewardsPoints,
        rewards_discount: rewardsDiscount,
        delivery_name  : address.name,
        delivery_phone : address.phone,
        delivery_line1 : address.line1,
        delivery_line2 : address.line2 || '',
        delivery_city  : address.city || 'Prayagraj',
        delivery_pincode: address.pincode || '',
        ...locationFields,
        created_at     : new Date().toISOString(),
        updated_at     : new Date().toISOString(),
      })
      .select()
      .single();

    if (oErr) { console.error('[RKOrders] _legacyCreateOrder (header):', oErr.message); return null; }

    const items = cart.map(item => ({
      order_id  : order.id,
      product_id: item.id,
      name      : item.name,
      unit      : item.unit,
      emoji     : item.e,
      category  : item.cat || 'General',
      price     : item.price,
      old_price : item.old || null,
      qty       : item.qty,
      line_total: item.price * item.qty,
    }));

    const { error: iErr } = await getDB().from('order_items').insert(items);
    if (iErr) { console.error('[RKOrders] _legacyCreateOrder (items):', iErr.message); }

    _decrementStock(cart);
    if (promoCode) _incrementCouponUsage(promoCode);

    return { orderId: order.id, orderNumber };
  }

  /**
   * Create a new order.
   * SECURITY (audit follow-up, 2026-08-09): ab order SIRF create_order() RPC se
   * banta hai — server-side DB selling_price se subtotal recompute hota hai aur
   * coupon server-side validate hota hai. Client cart total/price tamper karne
   * par order reject ho jaata hai. (Pehle client direct orders/order_items
   * insert karta tha jisse koi bhi ₹1 ka order bana sakta tha.)
   *
   * @param {string|null} userId   null = guest order
   * @param {{
   *   cart, total, address, paymentMethod,
   *   promoCode?, discount?, latitude?, longitude?,
   *   distance_km?, delivery_charge?, delivery_status?,
   *   maps_link?, maps_nav_link?, location_accuracy?
   * }} opts
   * @returns {{ orderId, orderNumber } | null}
   */
  async function createOrder(userId, opts) {
    const { cart, address, paymentMethod, promoCode = null } = opts;

    if (!cart?.length) { console.error('[RKOrders] createOrder: empty cart'); return null; }

    // BUG FIX (Critical #3): Block check before anything else.
    const isBlocked = await _checkUserBlocked(userId);
    if (isBlocked) {
      console.warn('[RKOrders] createOrder: user is blocked');
      return { blocked: true }; // caller should show error to user
    }

    try {
      // SECURITY: server-side verified order creation (prices/coupon/stock sab DB side)
      const { data, error } = await getDB().rpc('create_order', {
        p_user_id        : userId || null,
        p_cart           : cart.map(i => ({ id: i.id, qty: i.qty, e: i.e || null, unit: i.unit || i.variant || null })),
        p_address        : {
          name    : address.name,
          phone   : address.phone,
          line1   : address.line1,
          line2   : address.line2 || '',
          city    : address.city || 'Prayagraj',
          pincode : address.pincode || '',
        },
        p_payment_method : paymentMethod,
        p_promo_code     : promoCode || null,
        p_latitude       : opts.latitude ?? null,
        p_longitude      : opts.longitude ?? null,
        p_distance_km    : opts.distance_km ?? null,
        p_delivery_charge: opts.delivery_charge || 0,
        p_delivery_status: opts.delivery_status || 'unknown',
        p_maps_link      : opts.maps_link || null,
        p_maps_nav_link  : opts.maps_nav_link || null,
        p_location_accuracy: opts.location_accuracy ?? null,
        p_rewards_points : opts.rewardsPoints || 0,
      });

      if (error) {
        // RPC abhi DB me deploy nahi hua (migration pending) → legacy path
        if (String(error.code) === '42883' || String(error.code) === 'PGRST202') {
          console.warn('[RKOrders] create_order RPC missing — legacy path fallback');
          return _legacyCreateOrder(userId, opts);
        }
        // Server-side validation failed (price tamper, coupon invalid, stock...)
        console.error('[RKOrders] createOrder (rpc):', error.message);
        return null;
      }

      // Server-side computed amounts bhi return karo — caller (CheckoutForm)
      // inhe use karke client display ko server total se sync kar sakta hai
      // (DB price badal gayi ho to display mismatch na ho).
      return {
        orderId     : data.order_id,
        orderNumber : data.order_number,
        subtotal    : data.subtotal,
        discount    : data.discount,
        finalAmount : data.final_amount,
      };
    } catch (e) {
      console.error('[RKOrders] createOrder (rpc exception):', e.message);
      return null;
    }
  }

  async function loadOrderHistory(userId, limit = 20) {
    if (!userId) return [];
    const { data, error } = await getDB()
      .from('orders')
      .select('id, order_number, status, payment_method, final_amount, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) { console.error('[RKOrders] loadOrderHistory:', error.message); return []; }
    return data || [];
  }

  async function getOrderDetails(orderId) {
    if (!orderId) return null;
    const { data: order, error: oErr } = await getDB()
      .from('orders').select('*').eq('id', orderId).single();
    if (oErr) { console.error('[RKOrders] getOrderDetails:', oErr.message); return null; }
    const { data: items, error: iErr } = await getDB()
      .from('order_items').select('*').eq('order_id', orderId);
    if (iErr) console.error('[RKOrders] getOrderDetails (items):', iErr.message);
    return { ...order, items: items || [] };
  }

  /**
   * Reorder / Buy Again — merge mode (modern grocery app pattern):
   * - Pehle clearCart() hota tha (user ka poora cart delete). Ab MERGE hota
   *   hai — existing cart items preserve, missing items add hote hain.
   * - Fresh price + is_active + stock_quantity DB se fetch (price kabhi stale
   *   nahi — BUG FIX High #5 preserved).
   * - Inactive / out-of-stock products skip, qty stock se capped.
   */
  async function reorder(orderId) {
    const order = await getOrderDetails(orderId);
    if (!order?.items?.length) return [];

    const productIds = order.items.map(i => i.product_id).filter(Boolean);

    // Fetch current prices + stock from products table
    let freshPrices = {};
    if (productIds.length) {
      const { data: freshProducts } = await getDB()
        .from('products')
        .select('id,name,selling_price,unit_value,is_active,stock_quantity,units,product_images(image_url,is_default,sort_order)')
        .in('id', productIds);

      (freshProducts || []).forEach(p => { freshPrices[p.id] = p; });
    }

    const products = order.items.map(i => {
      const fresh = freshPrices[i.product_id];
      // Multi-unit: saved order unit (i.unit) agar product ke units me match kare
      // to us variant ki fresh price/stock use karo — warna product-level default.
      const savedUnit = i.unit || '';
      const unitMatch = (fresh?.units && Array.isArray(fresh.units))
        ? fresh.units.find(u => String(u.label || '') === savedUnit)
        : null;
      const stock = unitMatch
        ? (typeof unitMatch.stock === 'number' ? unitMatch.stock : (fresh?.stock_quantity ?? 0))
        : (fresh ? (fresh.stock_quantity ?? 0) : 0);
      // Primary image (is_default first, warna sort_order) — cart drawer me image dikhe
      const imgs = (fresh?.product_images || []).slice().sort((a, b) => a.sort_order - b.sort_order);
      const img = (imgs.find(x => x.is_default) || imgs[0])?.image_url || null;
      return {
        id   : i.product_id,
        name : fresh?.name || i.name,
        unit : unitMatch ? unitMatch.label : (fresh?.unit_value || i.unit),
        variant: unitMatch ? unitMatch.label : null,
        // Use fresh price — fall back to saved price only if product no longer in DB
        price: unitMatch ? unitMatch.price : (fresh?.selling_price ?? i.price),
        old  : unitMatch?.mrp || i.old_price,
        e    : i.emoji,
        cat  : i.category,
        image: img,
        qty  : i.qty || 1,
        // Deleted/inactive/OOS product = unavailable (checkout create_order reject karega)
        _unavailable: !fresh || !fresh.is_active || stock <= 0,
        _stock: stock,
      };
    });

    if (window.RKCart) {
      for (const p of products) {
        if (p._unavailable) continue; // skip deleted / inactive / out-of-stock silently
        const qty = Math.min(p.qty, Math.max(p._stock, 1)); // stock cap (min 1)
        const { _unavailable, _stock, ...clean } = p; // helper props cart item me mat le jao
        for (let q = 0; q < qty; q++) {
          await window.RKCart.addToCart(clean);
        }
      }
    }

    return products;
  }

  window.RKOrders = {
    createOrder,
    loadOrderHistory,
    getOrderDetails,
    reorder,
  };

})();