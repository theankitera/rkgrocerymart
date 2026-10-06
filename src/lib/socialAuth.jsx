import { useState, useEffect } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient';

// ── Social auth shared helpers (LoginPage / SignupPage / AuthModal) ─────
// Ek jagah rakha hai taaki teeno auth entries same icons + same provider
// preflight use karein (duplicate code avoid — AGENTS.md).

export const SOCIAL_DISABLED_MSG =
  'Google/Facebook login abhi enable nahi hua hai. Setup ke liye store admin se baat karein.';

/* ── Provider brand icons (inline SVG — koi extra dependency nahi) ── */
export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>
    </svg>
  );
}

export function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07z"/>
    </svg>
  );
}

// ── Provider availability preflight ────────────────────────────────────
// signInWithOAuth browser ko hard redirect karta hai (disabled provider par
// bhi) aur error return nahi karta — isliye Supabase ke raw error page se
// bachne ke liye /auth/v1/settings se pehle hi check kar lete hain.
// Fail-open: settings fetch fail ho to buttons kaam karte rahein.
const FAIL_OPEN = { google: true, facebook: true, ready: true };
export function useSocialProviders() {
  const [status, setStatus] = useState({ google: true, facebook: true, ready: false });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
          headers: { apikey: SUPABASE_ANON_KEY },
        });
        if (cancelled) return;
        if (!res.ok) { setStatus(FAIL_OPEN); return; }
        const j = await res.json();
        if (!cancelled) {
          setStatus({
            google: !!j?.external?.google,
            facebook: !!j?.external?.facebook,
            ready: true,
          });
        }
      } catch {
        if (!cancelled) setStatus(FAIL_OPEN);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return status;
}

// ── Shared OAuth call (LoginPage / SignupPage / AuthModal) ─────────────
// Redirect initiated ho to null return karta hai, warna friendly error
// message string. Teen jagah same logic — yahan ek baar rakha hai.
export async function signInWithProvider(provider, redirectTo) {
  const { error: err } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });
  if (!err) return null;
  const m = (err.message || '').toLowerCase();
  if (m.includes('provider') || m.includes('unsupported') || m.includes('disabled')) return SOCIAL_DISABLED_MSG;
  return err.message || 'Kuch error hua. Dobara try karein.';
}
