import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL      = 'https://pffaflasgwhydkmxwkky.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable__tFDYhkM3blZ0pIVT0YxLA_YvkKq79L';

// ── Remember-me (real behavior, fix 2026-08-13) ──────────────────────────
// "Yaad rakhein" checkbox ab sach mein kaam karta hai:
//   • checked  → session localStorage mein (persistent, 30 din+)
//   • unchecked→ session sessionStorage mein (tab/बंद browser = logout)
// Flag localStorage mein rehta hai taaki agle page load par bhi sahi storage
// chune. Pehle ye checkbox sirf ek dead `rk_user` key likhta tha jise koi
// padhta hi nahi tha.
const REMEMBER_KEY = 'rk_remember';
function pickStorage() {
  try { return localStorage.getItem(REMEMBER_KEY) === '0' ? sessionStorage : localStorage; }
  catch (e) { return localStorage; }
}
const hybridStorage = {
  getItem:    k => { try { return pickStorage().getItem(k); } catch (e) { return null; } },
  setItem:    (k, v) => { try { pickStorage().setItem(k, v); } catch (e) {} },
  removeItem: k => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {} },
};

/** Login se pehle call karo — preference save + purana token doosre storage se hatao. */
export function setRememberPreference(remember) {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
    const host = SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0];
    const key  = `sb-${host}-auth-token`;
    if (remember) sessionStorage.removeItem(key); // purana session-only token
    else          localStorage.removeItem(key);   // purana persistent token
  } catch (e) { /* storage optional */ }
}

// Reuse existing client if already created (avoids duplicate realtime subscriptions)
export const supabase = window.sb || createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: hybridStorage,
    autoRefreshToken: true,
    persistSession: true,
  },
});

// Expose on window so vanilla JS scripts (cart.js, profile.js, ananya-ai.js) can find it
window.sb         = supabase;
window.supabase   = supabase;   // ananya-ai.js checks window.supabase
window.supabaseJs = supabase;   // fallback alias also used by ananya-ai.js
