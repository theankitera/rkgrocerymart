/*!
 * ANANYA AI - Smart Shopping Assistant
 * Rinku Kirana Store
 * Version: 4.0 — Gemini AI + Supabase Product Search Backend
 * UI untouched. Local intents stay instant; unmatched queries now route
 * through /api/chat (Gemini, with Supabase product lookups first).
 */
(function () {
  'use strict';

  const CONFIG = {
    storeName:      'RK Grocery Mart',
    whatsappNumber: '916393196765',
    supabaseUrl:    'https://pffaflasgwhydkmxwkky.supabase.co',
    supabaseKey:    'sb_publishable__tFDYhkM3blZ0pIVT0YxLA_YvkKq79L',

    storeInfo: {
      timings:   'Monday–Saturday: 8 AM – 9 PM | Sunday: 9 AM – 7 PM',
      phone:     '+91 63931 96765',
      whatsapp:  '6393196765',
      address:   'RK Grocery Mart, Uttar Pradesh, India',
      email:     'support@rkgrocerymart.com',
      delivery:  '5 km ke andar same-day delivery hoti hai',
      minOrder:  '₹200 minimum order delivery ke liye',
      freeDeliv: '₹200 se upar FREE delivery',
      payment:   'Cash, UPI (GPay, PhonePe, Paytm), Debit/Credit Cards',
      returns:   'Fresh items: 24 ghante | Packaged: 7 din',
      firstOffer:'First order par 10% OFF — code: WELCOME10',
      appOffer:  'App install karo aur weekly special offers paao!',
    },

    faqs: [
      { q: 'Store timings kya hain?',
        a: '🕐 Hamare store ke timings:\nMonday–Saturday: 8 AM – 9 PM\nSunday: 9 AM – 7 PM\n\nOnline order 24/7 place kar sakte hain! 😊' },
      { q: 'Delivery kitni door tak hoti hai?',
        a: '🚚 Hum 5 km ke andar same-day delivery karte hain.\n\n✅ ₹200 se upar FREE delivery\n⏱️ Delivery time: 2–4 ghante\n📦 Order track kar sakte hain account mein.' },
      { q: 'Kaunse payment methods accepted hain?',
        a: '💳 Hum ye payment methods accept karte hain:\n\n• Cash on Delivery\n• Google Pay (GPay)\n• PhonePe\n• Paytm\n• Debit/Credit Cards\n• Net Banking' },
      { q: 'Return policy kya hai?',
        a: '↩️ Return Policy:\n\n🥦 Fresh items (sabzi, fruits, dairy): 24 ghante\n📦 Packaged goods: 7 din\n\nReturn ke liye WhatsApp par contact karein order ID ke saath.' },
      { q: 'Order track kaise karein?',
        a: '🛒 Order track karne ke 2 tarike:\n\n1️⃣ Account → Orders section mein jaayein\n2️⃣ WhatsApp par order ID share karein\n\nHum jaldi update denge! 😊' },
      { q: 'Koi discount ya offer hai?',
        a: '🎉 Current Offers:\n\n🆕 WELCOME10 — First order par 10% OFF\n📱 App install karo — weekly special offers\n🛒 ₹500+ order par extra 5% off\n\nOffer use karne ke liye checkout pe apply karein!' },
      { q: 'Minimum order kya hai?',
        a: '📦 Delivery ke liye minimum order ₹200 hai.\n\nIn-store shopping ke liye koi minimum nahi.\n\n💡 Tip: ₹200+ order karo aur FREE delivery paao!' },
      { q: 'Organic products available hain?',
        a: '🌿 Haan! Hamare paas organic products available hain:\n\n• Organic fruits & vegetables\n• Organic dal & atta\n• Natural spices\n\n"Organic" filter use karke products search karein.' },
    ],

    infoCards: [
      { icon: '🕐', title: 'Store Timings',  body: 'Mon–Sat: 8 AM – 9 PM\nSun: 9 AM – 7 PM' },
      { icon: '🚚', title: 'Delivery',        body: 'Same-day within 5 km\nFREE delivery above ₹200' },
      { icon: '💳', title: 'Payment Methods', body: 'Cash · UPI · GPay\nPhonePe · Paytm · Cards' },
      { icon: '↩️', title: 'Return Policy',   body: 'Fresh items: 24 hours\nPackaged goods: 7 days' },
      { icon: '📞', title: 'Contact',         body: '+91 63931 96765\n(WhatsApp available)' },
      { icon: '🎁', title: 'Current Offer',   body: 'WELCOME10 — 10% OFF\non your first order!' },
    ],

    intents: [
      {
        keys: ['timing','time','open','close','band','kab khula','kab band','schedule','hours','khula'],
        reply: ({ storeInfo: s }) =>
          `🕐 *Store Timings:*\n\n📅 Monday–Saturday: 8 AM – 9 PM\n📅 Sunday: 9 AM – 7 PM\n\nOnline order 24/7 kar sakte hain! 😊`,
      },
      {
        keys: ['deliver','delivery','ship','door','ghar','kitna time','courier','home'],
        reply: ({ storeInfo: s }) =>
          `🚚 *Delivery Info:*\n\n📍 Area: ${s.delivery}\n✅ ${s.freeDeliv}\n⏱️ Time: 2–4 ghante\n\nOrder place karne ke baad track kar sakte hain account mein!`,
      },
      {
        keys: ['payment','pay','upi','gpay','google pay','cash','card','paytm','phonepe','online pay','paise'],
        reply: ({ storeInfo: s }) =>
          `💳 *Payment Methods:*\n\n✅ Cash on Delivery\n✅ Google Pay (GPay)\n✅ PhonePe\n✅ Paytm\n✅ Debit/Credit Cards\n✅ Net Banking\n\nSabse safe: UPI payment recommend karte hain! 😊`,
      },
      {
        keys: ['return','refund','wapas','vapas','exchange','damage','toot','kharab'],
        reply: ({ storeInfo: s }) =>
          `↩️ *Return Policy:*\n\n🥦 Fresh items: 24 ghante ke andar\n📦 Packaged goods: 7 din ke andar\n\nReturn ke liye WhatsApp par order ID bhejein:\n📲 ${s.phone}`,
      },
      {
        keys: ['contact','phone','call','number','email','helpline','support','help'],
        reply: ({ storeInfo: s }) =>
          `📞 *Contact Us:*\n\n📱 Phone/WhatsApp: ${s.phone}\n📧 Email: ${s.email}\n📍 ${s.address}\n\nHum 9 AM–8 PM available hain! 😊`,
      },
      {
        keys: ['address','location','where','kahan','shop','store','map','place','area'],
        reply: ({ storeInfo: s }) =>
          `📍 *Store Location:*\n\n${s.address}\n\nDirections ke liye WhatsApp par message karein — hum map share karenge! 🗺️`,
      },
      {
        keys: ['order','track','status','kahan hai','mera order','my order','order id'],
        reply: () =>
          `🛒 *Order Track Kaise Karein:*\n\n1️⃣ Website pe login karein\n2️⃣ Account → "My Orders" mein jaayein\n3️⃣ Order ID click karein\n\nYa WhatsApp par order ID bhejein — hum status batayenge! 📦`,
      },
      {
        keys: ['discount','offer','coupon','sale','promo','cashback','deal','off','scheme'],
        reply: ({ storeInfo: s }) =>
          `🎉 *Current Offers:*\n\n🆕 Code: WELCOME10 — ${s.firstOffer}\n📱 ${s.appOffer}\n🛒 ₹500+ order par extra 5% off\n\nCheckout pe code apply karein!`,
      },
      {
        keys: ['minimum','min order','kitna order','minimum order'],
        reply: ({ storeInfo: s }) =>
          `📦 *Minimum Order:*\n\nDelivery ke liye: ${s.minOrder}\nIn-store: Koi minimum nahi!\n\n💡 ₹200+ order karo → FREE delivery milegi! ✅`,
      },
      {
        keys: ['organic','natural','fresh','healthy','pesticide free','jaivik'],
        reply: () =>
          `🌿 *Organic Products:*\n\nHaan, hamare paas available hain:\n• Organic Fruits & Vegetables\n• Organic Dal, Atta, Chawal\n• Natural Spices & Masale\n\nWebsite par "Organic" category mein dekho! 🛒`,
      },
      {
        keys: ['price','rate','cost','kitne ka','kitna','mahenga','sasta','cheap'],
        reply: () =>
          `💰 *Pricing:*\n\nHamare prices market rate par hain — kabhi kabhi usse bhi saste!\n\n🛒 Products browse karne ke liye home page par jaayein.\n\n💡 Offers check karo — aur bhi savings milegi! 🎉`,
      },
      {
        keys: ['account','login','signup','password','register','profile'],
        reply: () =>
          `👤 *Account Help:*\n\nLogin/Signup: Website ke top-right corner mein\nPassword bhool gaye: Login page par "Forgot Password"\nProfile update: Account → Profile section\n\nKoi issue? WhatsApp karein! 📲`,
      },
      {
        keys: ['cart','wishlist','basket','add to cart','remove'],
        reply: () =>
          `🛒 *Cart & Wishlist:*\n\nCart: Top-right basket icon\nWishlist: Product page par ❤️ icon tap karein\n\nCart items automatically save hote hain! ✅`,
      },
      {
        keys: ['cancel','cancel order','order cancel'],
        reply: () =>
          `❌ *Order Cancel:*\n\nOrder cancel karne ke liye:\n1️⃣ Account → My Orders mein jaayein\n2️⃣ Order select karein\n3️⃣ "Cancel" button click karein\n\nYa turant WhatsApp karein: +91 63931 96765 📲`,
      },
      {
        keys: ['pwa','app','install','download','mobile app'],
        reply: () =>
          `📱 *App Install Karo:*\n\n1️⃣ Chrome mein website open karo\n2️⃣ Menu (⋮) → "Add to Home Screen"\n3️⃣ Install tap karo\n\nBilkul FREE hai — no Play Store needed! ✅\n\n🎁 App users ko weekly special offers milte hain!`,
      },
      {
        keys: ['namaste','hello','hi','hey','helo','namaskar','good morning','good evening','salam'],
        reply: () =>
          `Namaste! 🙏😊\n\nMain Ananya hoon — RK Grocery Mart ki smart assistant.\n\nMain in topics mein help kar sakti hoon:\n🚚 Delivery · 💳 Payment · ↩️ Returns\n🎁 Offers · 📞 Contact · 🛒 Orders\n\nKya poochna chahte hain? 😊`,
      },
      {
        keys: ['thanks','thank you','shukriya','dhanyawad','theek hai','ok','okay','achha'],
        reply: () =>
          `Bahut bahut shukriya! 🙏😊\n\nKoi aur sawaal ho toh zaroor poochein.\n\nRK Grocery Mart mein aapka swagat hai! 🌸`,
      },
      {
        keys: ['bye','goodbye','alvida','baad mein','later','tata'],
        reply: () =>
          `Alvida! 👋😊\n\nRK Grocery Mart par aate rahein.\n\nKoi zaroorat ho toh main hamesha yahaan hoon! 🌸`,
      },
    ],
  };

  /* ══════════════════════════════════════════
     STATE
  ══════════════════════════════════════════ */
  const state = {
    isOpen:        false,
    activeTab:     'chat',
    messages:      [],
    sessionId:     null,
    userId:        null,
    accessToken:   null,
    isTyping:      false,
    unread:        0,
    supabase:      null,
    initialized:   false,
    historyLoaded: false,
    realtimeChannel: null,
    pendingController: null,
    lastFailedText: null,
    // FEATURE: login-required chat — user ka naam/photo (profile se) yahan
    // cache hote hain taaki har apne message ke saath dikhaya ja sake.
    userName:      null,
    userAvatar:    null,
  };

  /* ══════════════════════════════════════════
     THEME
  ══════════════════════════════════════════ */
  function applyTheme() {
    const isDark = window.matchMedia('(prefers-color-scheme:dark)').matches;
    const el = document.getElementById('ananya-widget');
    if (el) el.setAttribute('data-ananya-theme', isDark ? 'dark' : 'light');
  }
  window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change', applyTheme);

  /* ══════════════════════════════════════════
     MOBILE KEYBOARD / VIEWPORT FIX
     dvh does not shrink when the on-screen keyboard opens, so on
     mobile the widget kept its full height while the visible area
     shrank — pushing the input box + send button behind the
     keyboard. We track the real visible height with the
     visualViewport API (falls back gracefully where unsupported)
     and write it to a CSS var the mobile media query consumes.
  ══════════════════════════════════════════ */
  function setupViewportFix() {
    const vv = window.visualViewport;
    if (!vv) return;

    const setHeight = () => {
      document.documentElement.style.setProperty('--ananya-vh', vv.height + 'px');
    };

    setHeight();
    vv.addEventListener('resize', setHeight);
    vv.addEventListener('scroll', setHeight);
  }

  /* ══════════════════════════════════════════
     SYNC SESSION DETECTION
     Supabase-js ka default storage key format:
     `sb-${projectRef}-auth-token` (projectRef = supabase URL ka pehla
     hostname part). src/lib/supabaseClient.js isi default key ke andar
     session save karta hai. Yahan hum localStorage se session ko
     SYNCHRONOUSLY padhte hain (bina async/CDN load ke) taaki logged-in
     user ko login-gate kabhi flash na ho — pehli paint se hi pata ho ki
     user logged in hai. Async initSupabase() baad mein hi ise refresh/
     validate karta hai.
  ══════════════════════════════════════════ */
  function getStoredSessionSync() {
    try {
      const host = CONFIG.supabaseUrl.replace(/^https?:\/\//, '').split('.')[0];
      const key = `sb-${host}-auth-token`;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // supabase-js v2 session object: { access_token, refresh_token, expires_at, user }
      if (data && data.access_token && data.user) return data;
      return null;
    } catch (e) {
      return null;
    }
  }

  /* ══════════════════════════════════════════
     SUPABASE
  ══════════════════════════════════════════ */
  async function initSupabase() {
    try {
      // BUG FIX: pehle ye widget hamesha ek NAYA, isolated Supabase client
      // banata tha (apne alag storageKey 'ananya-widget-auth' ke saath).
      // Ek naye client ko site ke real login session ke baare mein KABHI pata
      // nahi chal sakta — wo session toh window.sb (src/lib/supabaseClient.js)
      // ki storage mein hota hai. Isi wajah se state.userId hamesha null
      // rehta tha aur logged-in customer bhi admin panel mein "Guest User"
      // dikhta tha — sirf naye visitors ke liye nahi, HAR customer ke liye.
      //
      // Fix: site ka already-authenticated shared client (window.sb, jise
      // src/lib/supabaseClient.js banata/expose karta hai) reuse karo — isse
      // (a) real login session turant mil jaata hai, aur (b) "Multiple
      // GoTrueClient instances" warning bhi nahi aati kyunki ye same
      // instance hai, koi duplicate nahi.
      if (window.sb) {
        state.supabase = window.sb;
      } else {
        // Fallback: React app load nahi hua is page par (e.g. support.html,
        // offline.html) — apna khud ka client banao agar CDN library available
        // hai. IMPORTANT: custom storageKey use NAHI karte — site ke asli login
        // session (src/lib/supabaseClient.js default storage key ke andar) ko
        // detect karne ke liye wahi default storage chahiye. Pehle yahan
        // 'ananya-widget-auth' lagaya tha, isliye support.html par logged-in
        // user ko bhi hamesha guest/gate dikhta tha.
        const SB = window.supabase || window.supabaseJs;
        if (SB && typeof SB.createClient === 'function' && CONFIG.supabaseUrl !== 'YOUR_SUPABASE_URL') {
          state.supabase = SB.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
        }
      }

      if (state.supabase) {
        let session = null;
        try {
          const res = await state.supabase.auth.getSession();
          session = res?.data?.session || null;
        } catch (e) { /* auth optional */ }
        // IMPORTANT: session nahi mila to userId/accessToken CLEAR karo.
        // getStoredSessionSync() ne localStorage se userId pehle se set kar
        // diya hoga — agar wo session expired/revoked hai aur async check
        // kuch nahi deta, to stale userId ke saath gate galat chhupa rehta.
        // Async check hi authoritative hai: login-gate sirf tabhi hatna
        // chahiye jab real session confirm ho.
        if (session?.user) {
          state.userId = session.user.id;
          state.accessToken = session.access_token;
        } else {
          state.userId = null;
          state.accessToken = null;
        }
      }
    } catch (e) { /* supabase optional */ }
  }

  async function getOrCreateSession() {
    state.sessionId = localStorage.getItem('ananya-session-id');
    if (!state.sessionId) {
      state.sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('ananya-session-id', state.sessionId);
    }
    if (state.supabase) {
      try {
        // BUG FIX (Medium #11): pehle display_name kabhi set nahi hota tha jab
        // session banta tha, isliye logged-in customer bhi admin ke Support/Ai
        // page par hamesha "Guest User" dikhta tha. Ab agar user logged in hai,
        // unka naam (profiles.name, ya auth metadata full_name, ya email) bhejte hain.
        let displayName = null;
        let avatarUrl = null;
        if (state.userId) {
          try {
            const { data: profile } = await state.supabase.from('profiles').select('name,avatar_url').eq('id', state.userId).maybeSingle();
            displayName = profile?.name || null;
            avatarUrl = profile?.avatar_url || null;
          } catch (e) { /* profiles table optional */ }
          if (!displayName) {
            try {
              const { data: userRes } = await state.supabase.auth.getUser();
              displayName = userRes?.user?.user_metadata?.full_name || userRes?.user?.email || null;
            } catch (e) { /* auth optional */ }
          }
        }
        // Cache locally so appendMessage() can show the user's own DP next
        // to every message they send in this widget session.
        state.userName = displayName || null;
        state.userAvatar = avatarUrl || null;
        await state.supabase.from('ananya_chat_sessions').upsert({
          id: state.sessionId,
          user_id: state.userId || null,
          display_name: displayName || 'Guest User',
          page_url: window.location.pathname,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      } catch (e) { /* optional */ }
    }
  }

  async function saveMessage(role, text) {
    if (!state.supabase || !state.sessionId) return;
    try {
      await state.supabase.from('ananya_chat_messages').insert({
        session_id: state.sessionId,
        role,
        content: text,
        created_at: new Date().toISOString(),
      });
    } catch (e) { /* optional */ }
    try {
      const sessionPatch = {
        last_message: text.slice(0, 100),
        updated_at: new Date().toISOString(),
      };
      // BUG FIX: `unread` column session banate waqt sirf 0 par set hota tha
      // aur kabhi increment nahi hota tha, isliye admin panel ka "Unread"
      // filter/badge kabhi kaam hi nahi karta tha. Ab customer ('user' role)
      // ka message aane par unread ko +1 karte hain (admin ke reply / open
      // karne par Support.jsx already ise 0 par reset kar deta hai).
      if (role === 'user') {
        try {
          const { data: current } = await state.supabase
            .from('ananya_chat_sessions')
            .select('unread')
            .eq('id', state.sessionId)
            .maybeSingle();
          sessionPatch.unread = (current?.unread || 0) + 1;
        } catch (e) { /* best-effort */ }
      }
      await state.supabase.from('ananya_chat_sessions').update(sessionPatch).eq('id', state.sessionId);
    } catch (e) { /* optional */ }
  }

  async function loadHistory() {
    if (!state.supabase || !state.sessionId) return [];
    try {
      const { data } = await state.supabase
        .from('ananya_chat_messages')
        .select('*')
        .eq('session_id', state.sessionId)
        .order('created_at', { ascending: true })
        .limit(50);
      return data || [];
    } catch (e) {
      return [];
    }
  }

  /* ══════════════════════════════════════════
     REALTIME — pick up admin replies live
     This is what makes an admin's reply (typed
     in the admin panel) show up here without a
     page refresh.
  ══════════════════════════════════════════ */
  function subscribeToAdminReplies() {
    if (!state.supabase || !state.sessionId) return;
    if (state.realtimeChannel) {
      try { state.supabase.removeChannel(state.realtimeChannel); } catch (e) {}
      state.realtimeChannel = null;
    }
    state.realtimeChannel = state.supabase
      .channel('ananya-widget-' + state.sessionId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ananya_chat_messages',
        filter: `session_id=eq.${state.sessionId}`,
      }, payload => {
        const m = payload.new;
        // Only render messages that came from outside this tab (the admin).
        // Our own user/bot messages are already appended locally the
        // moment they're sent, so re-rendering them here would duplicate.
        if (m.role === 'admin') {
          appendMessage('bot', m.content, { senderLabel: '🛡️ Support Agent' });
        }
      })
      .subscribe();
  }

  /* ══════════════════════════════════════════
     SMART FREE AI
  ══════════════════════════════════════════ */
  function getSmartReply(userMsg) {
    const msg = userMsg.toLowerCase().trim();
    for (const intent of CONFIG.intents) {
      if (intent.keys.some(k => msg.includes(k))) {
        return intent.reply(CONFIG);
      }
    }
    return null; // no confident local match — caller should ask the AI backend
  }

  function getOfflineFallbackReply(userMsg) {
    const msg = userMsg.toLowerCase().trim();
    if (/ky[ao]|kaise|kab|kahan|kitna|kaun/.test(msg)) {
      return `Hmm, mujhe exactly samajh nahi aaya 🤔\n\nKya aap in topics mein se kuch pooch rahe hain?\n\n🕐 Timings  🚚 Delivery  💳 Payment\n↩️ Returns  📞 Contact  🎁 Offers\n\nYa seedha WhatsApp karein — hum help karenge! 😊`;
    }
    return `Mujhe is sawaal ka exact jawab abhi nahi pata 😊\n\nMain in topics mein help kar sakti hoon:\n🕐 Store Timings\n🚚 Delivery Info\n💳 Payment Methods\n↩️ Return Policy\n🎁 Offers & Discounts\n📞 Contact Us\n\nYa seedha hamare WhatsApp par poochein:\n📲 +91 63931 96765`;
  }

  /* ══════════════════════════════════════════
     BACKEND AI — /api/chat (Gemini + Supabase)
     Only called when no local intent matches,
     so store-policy FAQs stay instant & free —
     this keeps Gemini usage to the queries that
     actually need it (products, open-ended Qs).
  ══════════════════════════════════════════ */
  async function fetchBackendReply(text) {
    if (state.pendingController) {
      try { state.pendingController.abort(); } catch (e) {}
    }
    const controller = new AbortController();
    state.pendingController = controller;
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const history = state.messages.slice(-12).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId: state.sessionId,
          accessToken: state.accessToken,
          history,
        }),
        signal: controller.signal,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok && !data?.reply) {
        throw new Error('Backend error: ' + res.status);
      }

      return { ok: true, reply: data.reply || getOfflineFallbackReply(text) };
    } catch (err) {
      const isAbort = err && err.name === 'AbortError';
      return {
        ok: false,
        reply: isAbort
          ? 'Jawab dene mein thoda zyada time lag raha hai ⏳\n\nKripya dobara try karein.'
          : 'Sorry, abhi connect nahi ho pa raha 🙏\n\nKripya thodi der mein dobara try karein, ya WhatsApp par poochein.',
      };
    } finally {
      clearTimeout(timeoutId);
      if (state.pendingController === controller) state.pendingController = null;
    }
  }

  /* ══════════════════════════════════════════
     RENDER HELPERS
  ══════════════════════════════════════════ */
  function timeStr() {
    return new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  }

  // FEATURE: har user message ke saath uska DP dikhana — logged-in
  // customer ka profile photo (ya naam ka pehla letter, fallback ke roop
  // mein) modern chat apps (Intercom/Crisp) jaisa hi feel deta hai.
  function userInitial() {
    const src = state.userName || '';
    const ch = src.trim().charAt(0);
    return ch ? ch.toUpperCase() : '🙂';
  }

  function buildUserAvatarEl() {
    const av = document.createElement('div');
    av.className = 'ananya-msg-avatar user-avatar';
    if (state.userAvatar) {
      const img = document.createElement('img');
      img.src = state.userAvatar;
      img.alt = state.userName || 'You';
      av.appendChild(img);
    } else {
      av.textContent = userInitial();
    }
    return av;
  }

  function appendMessage(role, text, opts) {
    opts = opts || {};
    const container = document.getElementById('ananya-msgs');
    if (!container) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `ananya-msg ${role}`;

    if (role === 'bot') {
      const nameEl = document.createElement('div');
      nameEl.className = 'ananya-sender-name';
      nameEl.textContent = opts.senderLabel || '🌸 Ananya';
      msgDiv.appendChild(nameEl);
    }

    const content = document.createElement('div');
    content.className = 'ananya-msg-content';

    const bubble = document.createElement('div');
    bubble.className = 'ananya-bubble';
    bubble.style.whiteSpace = 'pre-wrap';
    bubble.textContent = text;
    content.appendChild(bubble);

    const meta = document.createElement('div');
    meta.className = 'ananya-msg-meta';

    const timeEl = document.createElement('span');
    timeEl.className = 'ananya-msg-time';
    timeEl.textContent = timeStr();
    meta.appendChild(timeEl);

    if (role === 'user') {
      const ticks = document.createElement('span');
      ticks.className = 'ananya-ticks';
      ticks.textContent = '✓';
      meta.appendChild(ticks);
      setTimeout(() => {
        ticks.textContent = '✓✓';
        ticks.classList.add('seen');
      }, 1200);
    }

    content.appendChild(meta);

    if (role === 'user') {
      // Row layout: bubble+meta on the left, the user's own DP on the right.
      const row = document.createElement('div');
      row.className = 'ananya-msg-user-row';
      row.appendChild(content);
      row.appendChild(buildUserAvatarEl());
      msgDiv.appendChild(row);
    } else {
      msgDiv.appendChild(content);
    }

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;

    state.messages.push({ role, text, time: Date.now() });

    if (role === 'bot' && !state.isOpen) {
      state.unread++;
      updateBadge();
    }
  }

  function showTyping() {
    removeTyping();
    const container = document.getElementById('ananya-msgs');
    if (!container) return;
    const el = document.createElement('div');
    el.id = 'ananya-typing-indicator';
    el.className = 'ananya-typing';
    el.innerHTML = `
      <div class="ananya-msg-avatar">🌸</div>
      <div class="ananya-typing-bubble">
        <div class="ananya-typing-dot"></div>
        <div class="ananya-typing-dot"></div>
        <div class="ananya-typing-dot"></div>
      </div>`;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  function removeTyping() {
    document.getElementById('ananya-typing-indicator')?.remove();
  }

  function updateBadge() {
    const badge = document.getElementById('ananya-badge');
    if (!badge) return;
    if (state.unread > 0) {
      badge.textContent = state.unread > 9 ? '9+' : state.unread;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  /* ══════════════════════════════════════════
     SEND MESSAGE
  ══════════════════════════════════════════ */
  async function sendMessage(text) {
    text = (text || '').trim();
    if (!text || state.isTyping) return;
    // FEATURE: guests bina login ke chat nahi kar sakte — UI already gate
    // dikhata hai, ye sirf extra safety hai (direct AnanyaAI.send() calls ke liye).
    if (!state.userId) { applyAuthGate(); return; }
    if (text.length > 800) text = text.slice(0, 800);

    const input = document.getElementById('ananya-input');
    if (input) { input.value = ''; input.style.height = 'auto'; }

    document.querySelector('.ananya-retry-row')?.remove();

    appendMessage('user', text);
    saveMessage('user', text);

    state.isTyping = true;
    showTyping();

    let reply;
    let failed = false;

    const localReply = getSmartReply(text);
    if (localReply) {
      await new Promise(r => setTimeout(r, 500 + Math.random() * 400));
      reply = localReply;
    } else {
      const result = await fetchBackendReply(text);
      reply = result.reply;
      failed = !result.ok;
    }

    removeTyping();
    state.isTyping = false;

    appendMessage('bot', reply);
    saveMessage('assistant', reply);

    if (failed) {
      state.lastFailedText = text;
      showRetryRow();
    }

    if (state.messages.filter(m => m.role === 'user').length >= 3
        && !document.querySelector('.ananya-whatsapp-banner-inline')) {
      showWhatsappBanner();
    }
  }

  function showRetryRow() {
    const container = document.getElementById('ananya-msgs');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'ananya-retry-row';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ananya-retry-btn';
    btn.textContent = '🔄 Retry';
    btn.addEventListener('click', () => {
      row.remove();
      if (state.lastFailedText) sendMessage(state.lastFailedText);
    });
    row.appendChild(btn);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
  }

  function showWhatsappBanner() {
    const container = document.getElementById('ananya-msgs');
    if (!container) return;
    const banner = document.createElement('a');
    banner.className = 'ananya-whatsapp-banner ananya-whatsapp-banner-inline';
    banner.href = `https://wa.me/${CONFIG.whatsappNumber}?text=Namaste! RK Grocery Mart se help chahiye.`;
    banner.target = '_blank';
    banner.rel = 'noopener noreferrer';
    banner.innerHTML = `
      <span class="ananya-whatsapp-icon">💬</span>
      <div class="ananya-whatsapp-text">
        <strong>Human se baat karein?</strong>
        <span>WhatsApp par seedha connect karein</span>
      </div>
      <span class="ananya-whatsapp-arrow">→</span>`;
    container.appendChild(banner);
    container.scrollTop = container.scrollHeight;
  }

  /* ══════════════════════════════════════════
     BUILD HTML WIDGET
  ══════════════════════════════════════════ */
  function buildWidget() {
    // V4.1 — Support-page-only widget: the floating round button is gone from
    // every page (modern shopping sites access support from a support page).
    // The chat now lives EMBEDDED on support.html inside #ananya-inline. If
    // that container is missing on any page, we simply don't mount anything.
    const inlineHost = document.getElementById('ananya-inline');
    if (!inlineHost) return;

    const faqHTML = CONFIG.faqs.map((f, i) => `
      <div class="ananya-faq-item" data-idx="${i}">
        <div class="ananya-faq-q">${f.q}<span class="faq-icon">+</span></div>
        <div class="ananya-faq-a">${f.a.replace(/\n/g, '<br>')}</div>
      </div>`).join('');

    const infoHTML = CONFIG.infoCards.map(c => `
      <div class="ananya-info-card">
        <div class="ananya-info-card-icon">${c.icon}</div>
        <div class="ananya-info-card-body">
          <strong>${c.title}</strong>
          <p>${c.body.replace(/\n/g, '<br>')}</p>
        </div>
      </div>`).join('');

    const widget = document.createElement('div');
    widget.id = 'ananya-widget';
    widget.setAttribute('role', 'dialog');
    widget.setAttribute('aria-label', 'Ananya AI Chat');
    widget.innerHTML = `
      <div class="ananya-header">
        <div class="ananya-header-avatar">🌸</div>
        <div class="ananya-header-info">
          <div class="ananya-header-name">Ananya AI</div>
          <div class="ananya-header-status">Online · Shopping Assistant</div>
        </div>
        <div class="ananya-header-actions">
          <button class="ananya-header-btn" id="ananya-close-btn" title="Close" aria-label="Close">✕</button>
        </div>
      </div>

      <div class="ananya-tabs" role="tablist">
        <button class="ananya-tab active" data-tab="chat" role="tab">
          <span class="tab-icon">💬</span>Chat
        </button>
        <button class="ananya-tab" data-tab="faq" role="tab">
          <span class="tab-icon">❓</span>FAQ
        </button>
        <button class="ananya-tab" data-tab="info" role="tab">
          <span class="tab-icon">ℹ️</span>Store Info
        </button>
      </div>

      <div class="ananya-panel active" data-panel="chat" role="tabpanel">
        <div class="ananya-messages" id="ananya-msgs"></div>
        <div class="ananya-login-gate" id="ananya-login-gate">
          <div class="ananya-login-gate-icon">🔒</div>
          <div class="ananya-login-gate-title">Chat karne ke liye login karein</div>
          <div class="ananya-login-gate-sub">Apne naam aur photo ke saath baat karein — bina login chat available nahi hai.</div>
          <button type="button" class="ananya-login-gate-btn" id="ananya-login-gate-btn">👤 Login / Signup</button>
        </div>
        <div class="ananya-input-area">
          <div class="ananya-input-row">
            <textarea
              id="ananya-input"
              class="ananya-input"
              placeholder="Message..."
              rows="1"
              aria-label="Message input"
            ></textarea>
            <button class="ananya-send-btn" id="ananya-send-btn" aria-label="Send">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div class="ananya-panel" data-panel="faq" role="tabpanel">
        <div class="ananya-faq-list">${faqHTML}</div>
      </div>

      <div class="ananya-panel" data-panel="info" role="tabpanel">
        <div class="ananya-info-panel">${infoHTML}</div>
        <a class="ananya-whatsapp-banner"
           href="https://wa.me/${CONFIG.whatsappNumber}?text=Namaste! RK Grocery Mart se help chahiye."
           target="_blank" rel="noopener noreferrer"
           style="margin:0 12px 12px; display:flex;">
          <span class="ananya-whatsapp-icon">💬</span>
          <div class="ananya-whatsapp-text">
            <strong>WhatsApp Support</strong>
            <span>+91 63931 96765 par connect karein</span>
          </div>
          <span class="ananya-whatsapp-arrow">→</span>
        </a>
      </div>`;

    inlineHost.appendChild(widget);
    widget.classList.add('ananya-open', 'ananya-inline-mode');
    state.isOpen = true;
  }

  /* ══════════════════════════════════════════
     LOGIN GATE — chat sirf logged-in users ke
     liye. FAQ/Store Info tabs guests ke liye
     bhi khule rehte hain.
  ══════════════════════════════════════════ */
  function applyAuthGate() {
    const widget = document.getElementById('ananya-widget');
    if (!widget) return;
    widget.classList.toggle('ananya-guest', !state.userId);
  }

  function goToLoginFromWidget() {
    try { localStorage.setItem('ananya-reopen', '1'); } catch (e) { /* storage optional */ }
    // Inline (support page) mode: come back to support.html after login.
    const next = document.getElementById('ananya-inline') ? 'support.html' : '';
    window.location.href = next ? 'login.html?next=' + next : 'login.html';
  }

  /* ══════════════════════════════════════════
     EVENTS
  ══════════════════════════════════════════ */
  function bindEvents() {
    // BUG FIX: buildWidget() inline host (#ananya-inline) na milne par early
    // return karta hai — isliye yahan bhi same guard zaroori hai. Pehle is
    // guard ke bina offline.html jaise pages par bindEvents() null elements
    // par addEventListener kar ke crash karta tha.
    if (!document.getElementById('ananya-inline')) return;
    const trigger = document.getElementById('ananya-trigger');
    if (trigger) trigger.addEventListener('click', toggleWidget);
    // Inline (support page) mode: ✕ ka matlab chat band karke main page
    // (shopping) par wapas jaana hai. Pehle ✕ sirf 'ananya-open' class hatata
    // tha, par inline-mode CSS us class ke visual effect ko override kar deti
    // hai — isliye ✕ par kuch nahi hota tha aur user wapas nahi ja paata tha.
    // Redirect yahan button handler mein rakha hai (closeWidget mein nahi)
    // taaki AnanyaAI.close() API se support page kabhi accidentally na khule.
    document.getElementById('ananya-close-btn').addEventListener('click', () => {
      if (document.getElementById('ananya-inline')) {
        window.location.href = 'index.html';
        return;
      }
      closeWidget();
    });
    document.getElementById('ananya-login-gate-btn')?.addEventListener('click', goToLoginFromWidget);

    document.addEventListener('click', e => {
      const w = document.getElementById('ananya-widget');
      const t = document.getElementById('ananya-trigger');
      if (state.isOpen && w && t && !w.contains(e.target) && !t.contains(e.target)) {
        closeWidget();
      }
    });

    document.querySelectorAll('.ananya-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    document.getElementById('ananya-send-btn').addEventListener('click', () => {
      sendMessage(document.getElementById('ananya-input').value);
    });

    document.getElementById('ananya-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(e.target.value);
      }
    });

    document.getElementById('ananya-input').addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });

    document.querySelectorAll('.ananya-faq-item').forEach(item => {
      item.querySelector('.ananya-faq-q').addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        document.querySelectorAll('.ananya-faq-item').forEach(i => i.classList.remove('open'));
        if (!isOpen) item.classList.add('open');
      });
    });

    document.addEventListener('keydown', e => {
      // Inline (support page) mode: Escape koi floating panel band nahi karta.
      if (e.key === 'Escape' && state.isOpen && !document.getElementById('ananya-inline')) closeWidget();
    });
  }

  /* ══════════════════════════════════════════
     OPEN / CLOSE / TABS
  ══════════════════════════════════════════ */
  function openWidget() {
    state.isOpen = true;
    document.getElementById('ananya-widget').classList.add('ananya-open');
    const trig = document.getElementById('ananya-trigger');
    if (trig) { trig.classList.add('ananya-trigger-hidden'); trig.setAttribute('aria-expanded', 'true'); }
    document.querySelector('.ananya-trigger-label')?.classList.remove('show');
    state.unread = 0;
    updateBadge();

    // Mobile: bottom nav ko hide karo taaki input box show ho (inline mode skip)
    if (!document.getElementById('ananya-inline') && window.innerWidth <= 480) {
      var bnav = document.querySelector('.bottom-nav');
      if (bnav) bnav.style.display = 'none';
      document.body.style.overflow = 'hidden';
    }

    // Guests dekhte hain sirf login-gate (koi history load karne ki zaroorat nahi).
    if (!state.historyLoaded && state.userId) {
      state.historyLoaded = true;
      loadInitialConversation();
    }

    setTimeout(() => document.getElementById('ananya-input')?.focus(), 420);
  }

  function closeWidget() {
    state.isOpen = false;
    document.getElementById('ananya-widget').classList.remove('ananya-open');
    const trig = document.getElementById('ananya-trigger');
    if (trig) { trig.classList.remove('ananya-trigger-hidden'); trig.setAttribute('aria-expanded', 'false'); }

    // Mobile: bottom nav wapas dikhao (inline mode skip)
    if (!document.getElementById('ananya-inline') && window.innerWidth <= 480) {
      var bnav = document.querySelector('.bottom-nav');
      if (bnav) bnav.style.display = '';
      document.body.style.overflow = '';
    }
  }

  function toggleWidget() { state.isOpen ? closeWidget() : openWidget(); }

  function switchTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll('.ananya-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === tabName));
    document.querySelectorAll('.ananya-panel').forEach(p =>
      p.classList.toggle('active', p.dataset.panel === tabName));
  }

  /* ══════════════════════════════════════════
     INITIAL CONVERSATION
  ══════════════════════════════════════════ */
  async function loadInitialConversation() {
    const history = await loadHistory();

    if (history.length > 0) {
      history.forEach(m => appendMessage(
        m.role === 'assistant' ? 'bot' : m.role === 'admin' ? 'bot' : 'user',
        m.content,
        m.role === 'admin' ? { senderLabel: '🛡️ Support Agent' } : {}
      ));
      return;
    }

    showTyping();
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 600));
    removeTyping();

    const welcome =
      `Namaste 👋\n\nMain Ananya hoon.\n\nRK Grocery Mart ki smart shopping assistant. 🌸\n\nMain products, orders, delivery aur support mein aapki madad kar sakti hoon.\n\nAaj main aapki kaise madad kar sakti hoon?`;
    appendMessage('bot', welcome);
    saveMessage('assistant', welcome);
  }

  function loadSupabaseLib() {
    return new Promise(resolve => {
      if (window.supabase) { resolve(); return; }
      const existing = document.querySelector('script[data-ananya-supabase]');
      if (existing) {
        existing.addEventListener('load', resolve);
        existing.addEventListener('error', resolve);
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.setAttribute('data-ananya-supabase', '1');
      s.onload = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
    });
  }

  /* ══════════════════════════════════════════
     INIT
  ══════════════════════════════════════════ */
  // BUG FIX (Critical #2): Admin Ai.jsx page ka "Disable AI Assistant" toggle
  // shop_settings.ai_enabled set karta tha, par customer site ka chatbot widget
  // ise kabhi check hi nahi karta tha — disable karne par bhi chatbot chalta rehta tha.
  // Ab init() shuru hone se pehle ye flag check karte hain. Agar table/column missing
  // ho (migration na chali ho) to fail-open karte hain — widget normally dikhega.
  // CDN UMD (window.supabase) sirf createClient deta hai, instance nahi —
  // isliye .from() se pehle ye resolve helper use karo (support.html case).
  function _getClient() {
    const direct = window.sb || window.supabase || window.supabaseJs;
    if (direct && typeof direct.from === 'function') return direct;
    const SB = window.supabase || window.supabaseJs;
    if (SB && typeof SB.createClient === 'function' && CONFIG.supabaseUrl && CONFIG.supabaseUrl !== 'YOUR_SUPABASE_URL') {
      return SB.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
    }
    return null;
  }

  async function isAiEnabled() {
    try {
      const SB = _getClient();
      if (!SB) return true;
      const { data, error } = await SB.from('shop_settings').select('ai_enabled').eq('id', 1).maybeSingle();
      if (error || !data) return true; // fail open
      return data.ai_enabled !== false;
    } catch (e) {
      return true; // fail open
    }
  }

  // BUG FIX (related to Critical #1): store timings/contact hardcoded the yahan —
  // admin Settings mein "Store Opening/Closing Time" badalne ka koi asar nahi padta tha.
  // Best-effort sync: agar shop_settings row mil jaye to CONFIG.storeInfo update kar dete hain.
  async function syncShopInfo() {
    try {
      const SB = _getClient();
      if (!SB) return;
      const { data } = await SB.from('shop_settings').select('shop_name,contact,whatsapp,open_time,close_time').eq('id', 1).maybeSingle();
      if (!data) return;
      if (data.open_time && data.close_time) {
        CONFIG.storeInfo.timings = `Daily: ${data.open_time} – ${data.close_time}`;
      }
      if (data.shop_name) CONFIG.storeName = data.shop_name;
      if (data.phone || data.contact) CONFIG.storeInfo.phone = data.contact || CONFIG.storeInfo.phone;
      if (data.whatsapp) { CONFIG.whatsappNumber = data.whatsapp.replace(/\D/g, ''); CONFIG.storeInfo.whatsapp = data.whatsapp; }
    } catch (e) { /* best-effort only */ }
  }

  async function init() {
    if (state.initialized) return;
    const enabled = await isAiEnabled();
    if (!enabled) { return; } // admin ne assistant band kiya hua hai — widget mount hi mat karo
    state.initialized = true;
    await syncShopInfo();

    // Pehli paint se hi sahi auth state: localStorage session ko synchronously
    // padho (async CDN/auth check ka wait kiye bina) — isse logged-in user ko
    // login-gate kabhi nahi dikhega, aur logout user ko turant gate milega.
    const storedSession = getStoredSessionSync();
    if (storedSession) {
      state.userId = storedSession.user.id || null;
      state.accessToken = storedSession.access_token || null;
    }

    buildWidget();
    bindEvents();
    applyTheme();
    setupViewportFix();
    applyAuthGate();

    await loadSupabaseLib();
    await initSupabase();
    if (state.userId) {
      await getOrCreateSession();
      subscribeToAdminReplies();
    }
    applyAuthGate();

    // Floating-mode behaviours (auto-open after login / first visit) only make
    // sense when the widget has a floating trigger. In inline (support page)
    // mode the panel is already open, so skip them entirely.
    if (!document.getElementById('ananya-inline')) {
      // Agar user login karke wapas laut aaya hai (login gate ke "Login" button
      // se), aur ab logged in hai, to chat widget khud-ba-khud khol dete hain.
      if (state.userId) {
        try {
          if (localStorage.getItem('ananya-reopen')) {
            localStorage.removeItem('ananya-reopen');
            setTimeout(() => { if (!state.isOpen) openWidget(); }, 400);
          }
        } catch (e) { /* storage optional */ }
      }

      setTimeout(() => {
        if (!state.isOpen) {
          const lbl = document.querySelector('.ananya-trigger-label');
          if (lbl) {
            lbl.classList.add('show');
            setTimeout(() => lbl.classList.remove('show'), 4000);
          }
        }
      }, 3000);

      if (!localStorage.getItem('ananya-visited')) {
        localStorage.setItem('ananya-visited', '1');
        setTimeout(() => { if (!state.isOpen) openWidget(); }, 6000);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AnanyaAI = {
    open: openWidget,
    close: closeWidget,
    toggle: toggleWidget,
    send: sendMessage,
  };

})();