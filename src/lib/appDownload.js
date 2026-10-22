/**
 * appDownload.js — "Get App" single source of truth
 * -------------------------------------------------------
 * Website ke teeno jagah (bottom-nav Get App, desktop header Get App,
 * homepage download_app section) ek hi jagah se app install hoti hai.
 *
 * STATUS: APK download abhi BAND hai — naya app (rkgrocerymart.apk)
 * abhi sahi se bana nahi hai aur Play Store par publish nahi hua.
 * Jab tak app Play Store par nahi aa jata, Get App button sirf
 * PWA install ("Add to Home Screen") karega — koi APK download nahi.
 *
 * Purani APK file public/downloads/ me rakhi hai (abhi koi link nahi
 * hai) — Play Store launch ke baad yahan wapas APK/Play Store link
 * laga denge.
 */

/** PWA install kholo; agar prompt available nahi hai to Add-to-Home-Screen hint. */
export async function openAppDownload(showToast) {
  const toast = typeof showToast === 'function' ? showToast : () => {};

  const standalone =
    window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  if (standalone || window.navigator.standalone) {
    toast('App already installed hai ✅');
    return;
  }

  if (window.RKPwa && typeof window.RKPwa.promptInstall === 'function') {
    const shown = window.RKPwa.promptInstall();
    if (shown) {
      toast('⬇️ Install prompt par "Install" tap karein 📲');
      return;
    }
  }
  toast('Browser menu (⋮) → "Add to Home Screen" chunein 📲');
}
