export const goLogin=()=>{ window.location.href='login.html'; };
export const goLoginForCheckout=()=>{ sessionStorage.setItem('rk_redirect','checkout'); window.location.href='login.html'; };

export const TICKER=['🎉 Sabzi par 15% OFF aaj!','⚡ Fast delivery — 1-2 ghante!','🛒 ₹500+ par FREE delivery!','📱 UPI & COD accepted!','🥚 Farm fresh ande daily!','🍦 Summer special ice cream deals!','🧹 Cleaning products par extra discount!'];

// ── Utility ──────────────────────────────────────────────
export const calcDiscount=(sp,op)=>op&&op>sp?Math.round((1-sp/op)*100):null;

// ── Category emoji fallback resolver ──────────────────────
// Priority: image_url (handled by caller) → category's own icon_emoji (from DB) → generic 🛒
export const catEmoji=c=>(c&&c.icon_emoji)?c.icon_emoji:'🛒';
