/**
 * appDownload.js — "Download App" single source of truth
 * -------------------------------------------------------
 * Website ke teeno jagah (bottom-nav Get App, desktop header Get App,
 * homepage download_app section) ek hi jagah se APK download karte hain.
 *
 * APK location: public/downloads/rkgrocerymart.apk (Vercel par /downloads/...)
 * serve hota hai — build ke time Vite public/ ko dist me copy karta hai.
 *
 * Fallback: APK file abhi upload nahi hui (404) to PWA install prompt /
 * "Add to Home Screen" hint dikhata hai — link kabhi dead nahi hoga.
 */
export const APP_APK_PATH = '/downloads/rkgrocerymart.apk';
export const APP_APK_URL = typeof window !== 'undefined'
  ? new URL(APP_APK_PATH, window.location.origin).href
  : APP_APK_PATH;

/** APK download kholo; agar file missing hai to PWA install fallback. */
export async function openAppDownload(showToast) {
  try {
    const res = await fetch(APP_APK_URL, { method: 'HEAD' });
    if (!res.ok) throw new Error('apk-missing');
    if (typeof showToast === 'function') showToast('⬇️ App download shuru ho rahi hai…');
    // location.href (target=_self) Android Chrome me direct file download
    // karta hai — window.open popup blockers me at sakta hai.
    window.location.href = APP_APK_URL;
  } catch (_) {
    if (window.RKPwa && typeof window.RKPwa.promptInstall === 'function') {
      window.RKPwa.promptInstall();
    } else if (typeof showToast === 'function') {
      showToast('App download abhi available nahi hai 🙏 — browser menu se "Add to Home Screen" chunein 📲');
    }
  }
}
