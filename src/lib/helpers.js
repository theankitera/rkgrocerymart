export const goLogin=()=>{ window.location.href='login.html'; };
export const goLoginForCheckout=()=>{ sessionStorage.setItem('rk_redirect','checkout'); window.location.href='login.html'; };

export const TICKER=['🎉 Aaj ke fresh deals — roz naye offers!','⚡ Fast delivery — 20-55 minute!','🛒 Minimum order sirf ₹499!','📱 Online payment aur COD accepted!','🥚 Farm fresh ande daily!','🍦 Ice cream aur cold drinks — thanda swaad!','🧹 Ghar ki safai ka poora saaman!'];

// ── Utility ──────────────────────────────────────────────
export const calcDiscount=(sp,op)=>op&&op>sp?Math.round((1-sp/op)*100):null;

// ── Category emoji fallback resolver ──────────────────────
// Priority: image_url (handled by caller) → category's own icon_emoji (from DB) → generic 🛒
export const catEmoji=c=>(c&&c.icon_emoji)?c.icon_emoji:'🛒';
