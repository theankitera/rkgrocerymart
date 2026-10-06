import { useState, useEffect } from 'react';
import { supabase, setRememberPreference } from '../../lib/supabaseClient';
import AuthLayout, { BrandBar, MsgBox, FeatureChips } from './AuthLayout.jsx';
import { GoogleIcon, FacebookIcon, useSocialProviders, SOCIAL_DISABLED_MSG, signInWithProvider } from '../../lib/socialAuth.jsx';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [socialLoading, setSocialLoading] = useState(null); // 'google' | 'facebook' | null
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const [productCount, setProductCount] = useState(null);
  const social = useSocialProviders();

  // Honest marketing: "150+ products" hardcode nahi — real active product count
  // se chip banati hai (fail hone par bina number ke label dikhta hai).
  useEffect(() => {
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true)
      .then(({ count }) => setProductCount(count));
  }, []);

  // V4.1: support page redirects here with ?next=support.html so the user lands
  // back on the chat after logging in (default stays index.html).
  // SECURITY (open-redirect fix): sirf relative paths allow — ?next=https://evil.com
  // ya //evil.com se login ke baad bahar redirect nahi hoga (phishing risk bnd).
  const _nextRaw = new URLSearchParams(window.location.search).get('next') || 'index.html';
  // SECURITY (open-redirect fix): sirf relative paths allow — ?next=https://evil.com
  // ya //evil.com se login ke baad bahar redirect nahi hoga (phishing risk bnd).
  // 'account.html' jaise bare relative paths bhi allow hain — account.html par
  // login ke baad wapas account page par land hota hai (destination lost nahi).
  const next = (!_nextRaw.includes('://') && !_nextRaw.startsWith('//') && !_nextRaw.startsWith('\\')) ? _nextRaw : 'index.html';

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) window.location.href = next;
    });
  }, []);

  function friendly(err) {
    const m = err?.message || '';
    if (m.includes('Invalid login credentials')) return 'Email ya password galat hai. Dobara try karein.';
    if (m.includes('Email not confirmed'))       return 'Pehle email verify karein. Inbox check karein.';
    if (m.includes('rate limit') || m.includes('Too many')) return 'Zyada try kiya. 1 minute baad dobara karein.';
    if (m.includes('network') || m.includes('fetch'))       return 'Network error. Internet check karein.';
    return m || 'Kuch error hua. Dobara try karein.';
  }

  async function handleLogin(e) {
    e?.preventDefault();
    setError(''); setSuccess('');
    if (!email || !email.includes('@')) { setError('Sahi email address daalein!'); return; }
    if (!password)                       { setError('Password daalein!'); return; }
    // Fix: remember preference ab sach mein storage choose karta hai (dead rk_user key hata di)
    try { setRememberPreference(remember); } catch(e) {}
    setLoading(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(friendly(err));
      setLoading(false);
      return;
    }
    setSuccess(`Welcome back, <b>${data.user?.user_metadata?.name || email.split('@')[0]}</b>! 🎉 Redirect ho rahe hain…`);
    setLoading(false);
    setTimeout(() => { window.location.href = next; }, 1200);
  }

  // Social (OAuth) login — browser redirect hoga, wapas aane par App.jsx ka
  // onAuthStateChange session utha lega (email login jaisa hi flow).
  async function handleOAuth(provider) {
    setError(''); setSuccess('');
    if (!social.ready) return; // preflight abhi chal raha hai — raw error page se bachne ke liye ruko
    if (!social[provider]) { setError(SOCIAL_DISABLED_MSG); return; }
    setSocialLoading(provider);
    // new URL() — next '/support.html' ho ya 'index.html', dono sahi resolve hote hain
    const msg = await signInWithProvider(provider, new URL(next, window.location.origin).href);
    setSocialLoading(null);
    if (msg) setError(msg);
  }

  return (
    <AuthLayout>
      <BrandBar badge1="⚡ Fast delivery" badge2="🔒 100% Secure"/>

      <div className="illus-strip">
        {[['🥦','Sabzi'],['🥛','Dairy'],['🌾','Atta'],['🍿','Snacks'],['🥤','Drinks']].map(([e,l]) => (
          <div key={l} className="illus-item"><div className="illus-emoji">{e}</div><div className="illus-label">{l}</div></div>
        ))}
      </div>

      <div className="glass-card">
        <div className="card-head">
          <div className="head-icon">🔑</div>
          <div className="card-title">Wapas Aao!</div>
          <div className="card-subtitle">Apne account mein login karein<br/>aur grocery order karo</div>
        </div>

        <div className="social-grid">
          <button className="social-btn" onClick={() => handleOAuth('google')} disabled={!!socialLoading || !social.ready}
            style={{ opacity: (!social.ready || (socialLoading && socialLoading !== 'google')) ? .55 : 1, cursor: socialLoading ? 'wait' : 'pointer' }}>
            <span className="social-icon"><GoogleIcon/></span> Google
          </button>
          <button className="social-btn" onClick={() => handleOAuth('facebook')} disabled={!!socialLoading || !social.ready}
            style={{ opacity: (!social.ready || (socialLoading && socialLoading !== 'facebook')) ? .55 : 1, cursor: socialLoading ? 'wait' : 'pointer' }}>
            <span className="social-icon"><FacebookIcon/></span> Facebook
          </button>
        </div>
        <div className="social-note">Google ya Facebook se 1-tap login • Koi password nahi chahiye</div>

        <div className="divider">
          <div className="divider-line"/><div className="divider-text">ya email se</div><div className="divider-line"/>
        </div>

        {error   && <MsgBox type="error"   html={error}/>}
        {success && <MsgBox type="success" html={success}/>}

        <form onSubmit={handleLogin}>
        <div className="field-group">
          <div className="field-label">📧 Email Address</div>
          <div className="field-wrap">
            <span className="field-icon">✉️</span>
            <input className="field-input" type="email" inputMode="email" autoComplete="email" name="email"
              placeholder="aapka@email.com" value={email} onChange={e => setEmail(e.target.value)}/>
          </div>
        </div>

        <div className="field-group">
          <div className="field-label">🔒 Password</div>
          <div className="field-wrap">
            <span className="field-icon">🔐</span>
            <input className="field-input" type={showPw ? 'text' : 'password'} autoComplete="current-password" name="password"
              placeholder="Apna password daalein" value={password} onChange={e => setPassword(e.target.value)} style={{paddingRight:44}}/>
            <button className="pass-toggle" type="button" onClick={() => setShowPw(v => !v)}>
              {showPw ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18,marginTop:-2}}>
          <label className="check-row" style={{marginBottom:0,cursor:'pointer'}}>
            <input type="checkbox" className="check-box" checked={remember} onChange={e => setRemember(e.target.checked)}/>
            <span className="check-label" style={{fontSize:'.74rem',color:'#64748B'}}>Yaad rakhein (30 din)</span>
          </label>
          <div className="forgot-link" style={{margin:0}}>
            <a href="forgot-password.html">🔄 Bhool gaye?</a>
          </div>
        </div>

        <button className="submit-btn" type="submit" disabled={loading}>
          {loading ? <><span className="spinner"/> Ek second…</> : '🔑 Login Karo'}
        </button>
        </form>

        <div className="secure-badge">🔒 256-bit SSL encrypted • Supabase Auth</div>
      </div>

      <div className="bottom-link">
        Naya account? <a href="signup.html">✨ Abhi Signup Karein →</a>
      </div>

      <FeatureChips chips={[
        {icon:'🚀',label:'Fast delivery'},
        {icon:'💳',label:'UPI & COD'},
        {icon:'🛡️',label:'Secure login'},
        {icon:'📦',label:productCount ? `${productCount}+ products` : 'Fresh groceries'},
      ]}/>
    </AuthLayout>
  );
}
