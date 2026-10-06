import { useState, useRef, useEffect } from 'react';
import { X, Mail, Lock, Eye, EyeOff, User as UserIcon, Phone, Loader2 } from 'lucide-react';
import { supabase, setRememberPreference } from '../lib/supabaseClient';
import { GoogleIcon, FacebookIcon, useSocialProviders, SOCIAL_DISABLED_MSG, signInWithProvider } from '../lib/socialAuth.jsx';

// ── Auth Modal (Module 7) ──────────────────────────────────────────────
// This REPLACES the primary login/signup entry point inside the SPA
// (header "Login" button, bottom-nav "Login"/"Account", and the
// "Login & Checkout" gate) with an in-place overlay instead of a full
// navigation to login.html/signup.html.
//
// IMPORTANT — backend untouched: every Supabase call here
// (signInWithPassword / signUp) and every validation rule / friendly
// error message is copied as-is from the original src/pages/auth/
// LoginPage.jsx and SignupPage.jsx. Only the layout changed from a
// full standalone page to a compact modal. The rk-grocery-website
// design reference's AuthModal uses a MOCKED phone+OTP flow — this app's
// real backend is email+password Supabase Auth, so that mock flow was
// NOT ported; the real auth mechanism was kept and only re-skinned.
//
// login.html / signup.html / forgot-password.html / reset-password.html
// are left fully intact and still work as direct-link fallbacks (e.g.
// account.html redirects unauthenticated visitors to login.html, and
// password-reset emails link to reset-password.html) — this module does
// not remove them, it only stops the SPA from navigating to them for the
// common in-app case.
//
// Once supabase.auth.signInWithPassword / signUp resolves with a session,
// the EXISTING onAuthStateChange listener in App.jsx (unchanged) picks up
// the new session and sets `user` — this modal just closes itself and lets
// that existing effect (incl. the rk_redirect→checkout logic) do the rest.

function getStrength(pw) {
  let s = 0;
  if (pw.length >= 6)  s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}
const STR_COLORS = ['var(--border)','#E63946','#FF6B35','#FFB800','#1BA672','#0EA86A'];
const STR_LABELS = ['','Bahut kamzor','Kamzor','Theek hai','Achha','Bahut achha'];

function friendlyLogin(err) {
  const m = err?.message || '';
  if (m.includes('Invalid login credentials')) return 'Email ya password galat hai. Dobara try karein.';
  if (m.includes('Email not confirmed'))       return 'Pehle email verify karein. Inbox check karein.';
  if (m.includes('rate limit') || m.includes('Too many')) return 'Zyada try kiya. 1 minute baad dobara karein.';
  if (m.includes('network') || m.includes('fetch'))       return 'Network error. Internet check karein.';
  return m || 'Kuch error hua. Dobara try karein.';
}
function friendlySignup(err, switchToLogin) {
  const m = err?.message || '';
  if (m.includes('User already registered') || m.includes('already registered'))
    return { text: 'Yeh email pehle se registered hai!', link: true };
  if (m.includes('Password should be')) return { text: 'Password kam se kam 6 characters ka hona chahiye.' };
  if (m.includes('rate limit') || m.includes('Too many')) return { text: 'Zyada try kiya. 1 minute baad dobara karein.' };
  return { text: m || 'Kuch error hua. Dobara try karein.' };
}

function FieldWrap({ icon: Icon, children }) {
  return (
    <div className="relative flex items-center">
      <Icon size={16} className="absolute left-3 pointer-events-none" style={{ color: 'var(--gray)' }} />
      {children}
    </div>
  );
}
const inputCls = "w-full pl-9 pr-9 py-2.5 rounded-xl text-sm font-poppins outline-none";
const inputStyle = { background: 'var(--light)', border: '1.5px solid var(--border)', color: 'var(--dark)' };

export default function AuthModal({ mode, onClose, onSwitchMode }) {
  // ── Login state ──
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPw, setShowPw]     = useState(false);

  // ── Signup state ──
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [suEmail,   setSuEmail]   = useState('');
  const [suPassword,setSuPassword]= useState('');
  const [confirm,   setConfirm]   = useState('');
  const [phone,     setPhone]     = useState('');
  const [terms,     setTerms]     = useState(false);
  const [showPw1,   setShowPw1]   = useState(false);
  const [showPw2,   setShowPw2]   = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const strength = getStrength(suPassword);

  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(null); // 'google' | 'facebook' | null
  const [error,   setError]   = useState(null); // string | {text,link}
  const [success, setSuccess] = useState('');
  const social = useSocialProviders();

  const isLogin = mode === 'login';

  async function handleLogin(e) {
    e?.preventDefault();
    setError(null); setSuccess('');
    if (!email || !email.includes('@')) { setError('Sahi email address daalein!'); return; }
    if (!password)                       { setError('Password daalein!'); return; }
    // Fix: remember preference ab sach mein storage choose karta hai (dead rk_user key hata di)
    try { setRememberPreference(remember); } catch (e) {}
    setLoading(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(friendlyLogin(err));
      setLoading(false);
      return;
    }
    setSuccess(`Welcome back, ${data.user?.user_metadata?.name || email.split('@')[0]}! 🎉`);
    setLoading(false);
    setTimeout(() => onClose(), 700);
  }

  async function handleSignup(e) {
    e?.preventDefault();
    setError(null); setSuccess('');
    if (!firstName.trim())              { setError('Pehla naam daalein!'); return; }
    if (!suEmail || !suEmail.includes('@')) { setError('Sahi email daalein!'); return; }
    if (suPassword.length < 6)          { setError('Password kam se kam 6 characters ka hona chahiye!'); return; }
    if (suPassword !== confirm)         { setError('Dono passwords match nahi kar rahe!'); return; }
    if (!terms)                         { setError('Terms & Conditions accept karein!'); return; }
    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
    // Fix: referral link (?ref=CODE) user_metadata mein — DB trigger register karta hai
    const refCode = new URLSearchParams(window.location.search).get('ref') || '';
    setLoading(true);
    const { data, error: err } = await supabase.auth.signUp({
      email: suEmail, password: suPassword,
      options: {
        data: { name: fullName, ...(refCode.trim() ? { referral_code: refCode.trim().toUpperCase() } : {}) },
        emailRedirectTo: window.location.origin + '/email-verified.html',
      },
    });
    setLoading(false);
    if (err) { setError(friendlySignup(err)); return; }
    if (data.user && !data.session) { setEmailSent(true); return; }
    if (data.session) {
      setSuccess(`Welcome ${fullName}! Account ban gaya 🎉`);
      setTimeout(() => onClose(), 700);
    }
  }

  // Social (OAuth) login/signup — browser redirect hoga, wapas aane par
  // App.jsx ka onAuthStateChange session utha lega (email flow jaisa hi).
  async function handleOAuth(provider) {
    setError(null); setSuccess('');
    if (!social.ready) return; // preflight abhi chal raha hai
    if (!social[provider]) { setError(SOCIAL_DISABLED_MSG); return; }
    setSocialLoading(provider);
    const msg = await signInWithProvider(provider, window.location.origin + '/index.html');
    setSocialLoading(null);
    if (msg) setError(msg);
  }

  const switchTo = (m) => { setError(null); setSuccess(''); setEmailSent(false); onSwitchMode(m); };

  // Scroll container ko mode change par top par le aao — signup form (lambi)
  // khulte hi user ko uski shuruaat dikhe, beech/bottom se nahi.
  const scrollRef = useRef(null);
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0, left: 0 });
  }, [mode, emailSent]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }} role="dialog" aria-modal="true" aria-label={isLogin ? 'Login' : 'Signup'}
      onClick={onClose}>
      <div ref={scrollRef} className="w-full sm:max-w-sm max-h-[92vh] overflow-y-auto overscroll-contain rounded-t-2xl sm:rounded-2xl"
        style={{ background: 'var(--card-bg)' }} onClick={e => e.stopPropagation()}>

        {/* Login/Signup Tabs — signup hamesha ek tap door (mobile par bhi) */}
        <div className="grid grid-cols-2 gap-1.5 px-5 pt-4 pb-3 sticky top-0 z-10" style={{ background: 'var(--card-bg)', borderBottom: '1px solid var(--border)' }}>
          <button type="button" onClick={() => switchTo('login')}
            className={`rounded-xl py-2 text-xs font-extrabold font-poppins transition-colors ${isLogin ? '' : 'opacity-60'}`}
            style={{ background: isLogin ? 'var(--primary-light)' : 'transparent', color: isLogin ? 'var(--primary-dark)' : 'var(--gray)' }}>
            🔑 Login
          </button>
          <button type="button" onClick={() => switchTo('signup')}
            className={`rounded-xl py-2 text-xs font-extrabold font-poppins transition-colors ${!isLogin ? '' : 'opacity-60'}`}
            style={{ background: !isLogin ? 'var(--primary-light)' : 'transparent', color: !isLogin ? 'var(--primary-dark)' : 'var(--gray)' }}>
            ✨ Signup
          </button>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: 'var(--primary-light)' }}>
              {isLogin ? '🔑' : '✨'}
            </div>
            <p className="font-extrabold font-poppins text-sm" style={{ color: 'var(--dark)' }}>
              {isLogin ? 'Wapas Aao!' : (emailSent ? 'Email Verify Karein!' : 'Account Banayein')}
            </p>
          </div>
          <button onClick={onClose} aria-label="Band karein" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ color: 'var(--gray)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pt-4 pb-6">
          {error && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 mb-3 text-xs font-poppins font-semibold" style={{ background: 'var(--tint-red-bg)', color: 'var(--tint-red-text)' }}>
              <span>⚠️</span>
              <span>{typeof error === 'string' ? error : (
                <>{error.text} {error.link && <button type="button" onClick={() => switchTo('login')} className="underline font-bold">Login karein →</button>}</>
              )}</span>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-3 text-xs font-poppins font-semibold" style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
              <span>✅</span><span>{success}</span>
            </div>
          )}

          {/* ── LOGIN ── */}
          {isLogin && (
            <>
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <button type="button" disabled={!!socialLoading || !social.ready} onClick={() => handleOAuth('google')}
                className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold font-poppins transition-all hover:-translate-y-px"
                style={{ background:'#fff', border:'1.5px solid var(--border)', color:'var(--dark)', opacity: (!social.ready || (socialLoading && socialLoading !== 'google')) ? .55 : 1, cursor: socialLoading ? 'wait' : 'pointer' }}>
                <GoogleIcon /> Google
              </button>
              <button type="button" disabled={!!socialLoading || !social.ready} onClick={() => handleOAuth('facebook')}
                className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold font-poppins transition-all hover:-translate-y-px"
                style={{ background:'#fff', border:'1.5px solid var(--border)', color:'var(--dark)', opacity: (!social.ready || (socialLoading && socialLoading !== 'facebook')) ? .55 : 1, cursor: socialLoading ? 'wait' : 'pointer' }}>
                <FacebookIcon /> Facebook
              </button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px" style={{ background:'var(--border)' }} />
              <span className="text-[10px] font-poppins uppercase tracking-wide" style={{ color:'var(--gray)' }}>ya email se</span>
              <div className="flex-1 h-px" style={{ background:'var(--border)' }} />
            </div>
            <form onSubmit={handleLogin} className="space-y-3">
              <FieldWrap icon={Mail}>
                <input type="email" inputMode="email" autoComplete="email" placeholder="aapka@email.com"
                  value={email} onChange={e => setEmail(e.target.value)} className={inputCls} style={inputStyle} />
              </FieldWrap>
              <FieldWrap icon={Lock}>
                <input type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder="Password"
                  value={password} onChange={e => setPassword(e.target.value)} className={inputCls} style={inputStyle} />
                <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3" style={{ color: 'var(--gray)' }}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </FieldWrap>
              <div className="flex items-center justify-between text-xs font-poppins">
                <label className="flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--gray)' }}>
                  <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                  Yaad rakhein
                </label>
                <a href="forgot-password.html" className="font-semibold" style={{ color: 'var(--primary)' }}>Bhool gaye?</a>
              </div>
              <button type="submit" disabled={loading}
                className="w-full text-white font-extrabold font-poppins rounded-2xl py-3 text-sm flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))' }}>
                {loading ? <><Loader2 size={16} className="animate-spin" /> Ek second…</> : '🔑 Login Karo'}
              </button>
              <p className="text-center text-xs font-poppins" style={{ color: 'var(--gray)' }}>
                Naya account? <button type="button" onClick={() => switchTo('signup')} className="font-bold" style={{ color: 'var(--primary)' }}>Signup Karein →</button>
              </p>
            </form>
            </>
          )}

          {/* ── SIGNUP: email-sent confirmation ── */}
          {!isLogin && emailSent && (
            <div className="text-center py-2">
              <div className="text-4xl mb-3">📧</div>
              <p className="text-sm font-poppins" style={{ color: 'var(--dark)' }}>
                <b>{suEmail}</b> par verification link bheja gaya hai.<br />Link pe click karke wapas login karein.
              </p>
              <button type="button" onClick={() => switchTo('login')}
                className="mt-4 w-full text-white font-extrabold font-poppins rounded-2xl py-3 text-sm"
                style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))' }}>
                🔑 Login Karo →
              </button>
            </div>
          )}

          {/* ── SIGNUP: form ── */}
          {!isLogin && !emailSent && (
            <>
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <button type="button" disabled={!!socialLoading || !social.ready} onClick={() => handleOAuth('google')}
                className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold font-poppins transition-all hover:-translate-y-px"
                style={{ background:'#fff', border:'1.5px solid var(--border)', color:'var(--dark)', opacity: (!social.ready || (socialLoading && socialLoading !== 'google')) ? .55 : 1, cursor: socialLoading ? 'wait' : 'pointer' }}>
                <GoogleIcon /> Google
              </button>
              <button type="button" disabled={!!socialLoading || !social.ready} onClick={() => handleOAuth('facebook')}
                className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold font-poppins transition-all hover:-translate-y-px"
                style={{ background:'#fff', border:'1.5px solid var(--border)', color:'var(--dark)', opacity: (!social.ready || (socialLoading && socialLoading !== 'facebook')) ? .55 : 1, cursor: socialLoading ? 'wait' : 'pointer' }}>
                <FacebookIcon /> Facebook
              </button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px" style={{ background:'var(--border)' }} />
              <span className="text-[10px] font-poppins uppercase tracking-wide" style={{ color:'var(--gray)' }}>ya email se</span>
              <div className="flex-1 h-px" style={{ background:'var(--border)' }} />
            </div>
            <form onSubmit={handleSignup} className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <FieldWrap icon={UserIcon}>
                  <input type="text" autoComplete="given-name" placeholder="Pehla naam"
                    value={firstName} onChange={e => setFirstName(e.target.value)} className={inputCls.replace('pr-9','pr-3')} style={inputStyle} />
                </FieldWrap>
                <FieldWrap icon={UserIcon}>
                  <input type="text" autoComplete="family-name" placeholder="Aakhri naam"
                    value={lastName} onChange={e => setLastName(e.target.value)} className={inputCls.replace('pr-9','pr-3')} style={inputStyle} />
                </FieldWrap>
              </div>
              <FieldWrap icon={Mail}>
                <input type="email" inputMode="email" autoComplete="email" placeholder="aapka@email.com"
                  value={suEmail} onChange={e => setSuEmail(e.target.value)} className={inputCls.replace('pr-9','pr-3')} style={inputStyle} />
              </FieldWrap>
              <div>
                <FieldWrap icon={Lock}>
                  <input type={showPw1 ? 'text' : 'password'} autoComplete="new-password" placeholder="Naya strong password"
                    value={suPassword} onChange={e => setSuPassword(e.target.value)} className={inputCls} style={inputStyle} />
                  <button type="button" onClick={() => setShowPw1(v => !v)} className="absolute right-3" style={{ color: 'var(--gray)' }}>
                    {showPw1 ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </FieldWrap>
                {suPassword && (
                  <div className="flex gap-1 mt-1.5">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= strength ? STR_COLORS[strength] : 'var(--border)' }} />
                    ))}
                  </div>
                )}
                {suPassword && <div className="text-[10px] font-poppins font-semibold mt-1" style={{ color: STR_COLORS[strength] }}>{STR_LABELS[strength]}</div>}
              </div>
              <FieldWrap icon={Lock}>
                <input type={showPw2 ? 'text' : 'password'} autoComplete="new-password" placeholder="Password dobara"
                  value={confirm} onChange={e => setConfirm(e.target.value)} className={inputCls} style={inputStyle} />
                <button type="button" onClick={() => setShowPw2(v => !v)} className="absolute right-3" style={{ color: 'var(--gray)' }}>
                  {showPw2 ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </FieldWrap>
              <FieldWrap icon={Phone}>
                <input type="tel" inputMode="tel" autoComplete="tel" placeholder="Mobile (optional)"
                  value={phone} onChange={e => setPhone(e.target.value)} className={inputCls.replace('pr-9','pr-3')} style={inputStyle} />
              </FieldWrap>
              <label className="flex items-start gap-2 cursor-pointer text-[11px] font-poppins" style={{ color: 'var(--gray)' }}>
                <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} className="mt-0.5" />
                <span>Main Terms &amp; Conditions aur Privacy Policy se agree karta/karti hoon.</span>
              </label>
              <button type="submit" disabled={loading}
                className="w-full text-white font-extrabold font-poppins rounded-2xl py-3 text-sm flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))' }}>
                {loading ? <><Loader2 size={16} className="animate-spin" /> Ek second…</> : '🚀 Account Banao — Free!'}
              </button>
              <p className="text-center text-xs font-poppins" style={{ color: 'var(--gray)' }}>
                Pehle se account hai? <button type="button" onClick={() => switchTo('login')} className="font-bold" style={{ color: 'var(--primary)' }}>Login Karein →</button>
              </p>
            </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
