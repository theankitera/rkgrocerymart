import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import AuthLayout, { BrandBar, MsgBox, FeatureChips } from './AuthLayout.jsx';
import { GoogleIcon, FacebookIcon, useSocialProviders, SOCIAL_DISABLED_MSG, signInWithProvider } from '../../lib/socialAuth.jsx';

function getStrength(pw) {
  let s = 0;
  if (pw.length >= 6)  s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}
const STR_COLORS = ['#E2E8F0','#E63946','#FF6B35','#FFB800','#1BA672','#0EA86A'];
const STR_LABELS = ['','Bahut kamzor','Kamzor','Theek hai','Achha','Bahut achha'];

export default function SignupPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [phone,     setPhone]     = useState('');
  const [terms,     setTerms]     = useState(false);
  const [showPw1,   setShowPw1]   = useState(false);
  const [showPw2,   setShowPw2]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [socialLoading, setSocialLoading] = useState(null); // 'google' | 'facebook' | null
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');
  const social = useSocialProviders();
  const [emailSent, setEmailSent] = useState(false);
  const strength = getStrength(password);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) window.location.href = 'index.html';
    });
  }, []);

  function friendly(err) {
    const m = err?.message || '';
    if (m.includes('User already registered') || m.includes('already registered'))
      return 'Yeh email pehle se registered hai! <a href="login.html">Login karein →</a>';
    if (m.includes('Password should be')) return 'Password kam se kam 6 characters ka hona chahiye.';
    if (m.includes('rate limit') || m.includes('Too many')) return 'Zyada try kiya. 1 minute baad dobara karein.';
    return m || 'Kuch error hua. Dobara try karein.';
  }

  async function handleSignup() {
    setError(''); setSuccess('');
    if (!firstName.trim())          { setError('Pehla naam daalein!'); return; }
    if (!email || !email.includes('@')) { setError('Sahi email daalein!'); return; }
    if (password.length < 6)        { setError('Password kam se kam 6 characters ka hona chahiye!'); return; }
    if (password !== confirm)       { setError('Dono passwords match nahi kar rahe!'); return; }
    if (!terms)                     { setError('Terms & Conditions accept karein!'); return; }
    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
    // Fix: referral link (?ref=CODE) se aaya code user_metadata mein — DB trigger
    // signup par hi referral register kar deta hai (real referral system).
    const refCode = new URLSearchParams(window.location.search).get('ref') || '';
    setLoading(true);
    const { data, error: err } = await supabase.auth.signUp({
      email, password,
      options: {
        data: { name: fullName, ...(refCode.trim() ? { referral_code: refCode.trim().toUpperCase() } : {}) },
        emailRedirectTo: window.location.origin + '/email-verified.html',
      },
    });
    setLoading(false);
    if (err) { setError(friendly(err)); return; }
    if (data.user && !data.session) { setEmailSent(true); return; }
    if (data.session) {
      setSuccess(`Welcome <b>${fullName}</b>! Account ban gaya 🎉 Redirect ho rahe hain…`);
      setTimeout(() => { window.location.href = 'index.html'; }, 1200);
    }
  }

  // Social (OAuth) signup — pehli baar login par account khud ban jayega.
  async function handleOAuth(provider) {
    setError(''); setSuccess('');
    if (!social.ready) return; // preflight abhi chal raha hai
    if (!social[provider]) { setError(SOCIAL_DISABLED_MSG); return; }
    setSocialLoading(provider);
    const msg = await signInWithProvider(provider, window.location.origin + '/index.html');
    setSocialLoading(null);
    if (msg) setError(msg);
  }

  if (emailSent) {
    return (
      <AuthLayout>
        <BrandBar badge1="🎁 ₹50 OFF first order" badge2="⚡ Free signup"/>
        <div className="glass-card">
          <div className="email-sent-wrap">
            <div className="email-sent-icon">📧</div>
            <div className="email-sent-title">Email Verify Karein!</div>
            <div className="email-sent-body">
              <b>{email}</b> par ek verification link bheja gaya hai.<br/>
              Link pe click karein, phir wapas aayein aur login karein.
            </div>
            <div className="email-badge">📩 Inbox check karein (Spam bhi)</div>
            <button className="submit-btn" onClick={() => window.location.href = 'login.html'}>
              🔑 Login Karo →
            </button>
          </div>
        </div>
        <div className="bottom-link">
          Pehle se account hai? <a href="login.html">🔑 Login Karein →</a>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <BrandBar badge1="🎁 ₹50 OFF first order" badge2="⚡ Free signup"/>

      <div className="illus-strip">
        {[['🥭','Fruits'],['🧈','Dairy'],['🫙','Masale'],['🍞','Bread'],['🥚','Eggs']].map(([e,l]) => (
          <div key={l} className="illus-item"><div className="illus-emoji">{e}</div><div className="illus-label">{l}</div></div>
        ))}
      </div>

      <div className="glass-card">
        <div className="card-head">
          <div className="head-icon">✨</div>
          <div className="card-title">Account Banayein</div>
          <div className="card-subtitle">Bilkul free • 30 seconds mein ready<br/>Pehli order par ₹50 OFF!</div>
        </div>

        <div className="delivery-badge">
          <div className="db-icon">🚴</div>
          <div>
            <div className="db-title">10 Minute Delivery Guarantee!</div>
            <div className="db-sub">Signup karo, order karo — hum ghar pahuncha denge</div>
          </div>
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
        <div className="social-note">Google ya Facebook se 1-tap signup • Koi password nahi chahiye</div>

        <div className="divider">
          <div className="divider-line"/><div className="divider-text">ya email se</div><div className="divider-line"/>
        </div>

        {error   && <MsgBox type="error"   html={error}/>}
        {success && <MsgBox type="success" html={success}/>}

        <form onSubmit={e => { e.preventDefault(); handleSignup(); }}>
        <div className="field-row" style={{marginBottom:14}}>
          <div className="field-group" style={{marginBottom:0}}>
            <div className="field-label">👤 Pehla Naam</div>
            <div className="field-wrap">
              <span className="field-icon">🧑</span>
              <input className="field-input" type="text" autoComplete="given-name" name="firstName" placeholder="Rahul"
                value={firstName} onChange={e => setFirstName(e.target.value)}/>
            </div>
          </div>
          <div className="field-group" style={{marginBottom:0}}>
            <div className="field-label">👤 Aakhri Naam</div>
            <div className="field-wrap">
              <span className="field-icon">🧑</span>
              <input className="field-input" type="text" autoComplete="family-name" name="lastName" placeholder="Gupta"
                value={lastName} onChange={e => setLastName(e.target.value)}/>
            </div>
          </div>
        </div>

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
            <input className="field-input" type={showPw1 ? 'text' : 'password'} autoComplete="new-password" name="password"
              placeholder="Naya strong password" value={password} onChange={e => setPassword(e.target.value)}
              style={{paddingRight:44}}/>
            <button className="pass-toggle" type="button" onClick={() => setShowPw1(v => !v)}>
              {showPw1 ? '🙈' : '👁️'}
            </button>
          </div>
          {password && (
            <div className="strength-bar-wrap" style={{marginTop:7}}>
              {[1,2,3,4,5].map(i => (
                <div key={i} className="strength-seg"
                  style={{background: i <= strength ? STR_COLORS[strength] : '#E2E8F0'}}/>
              ))}
            </div>
          )}
          {password && (
            <div className="strength-label" style={{color: STR_COLORS[strength]}}>
              {STR_LABELS[strength]}
            </div>
          )}
        </div>

        <div className="field-group">
          <div className="field-label">🔒 Password Confirm</div>
          <div className="field-wrap">
            <span className="field-icon">✅</span>
            <input className="field-input" type={showPw2 ? 'text' : 'password'} autoComplete="new-password" name="confirmPassword"
              placeholder="Wahi password dobara" value={confirm} onChange={e => setConfirm(e.target.value)}
              style={{paddingRight:44}}/>
            <button className="pass-toggle" type="button" onClick={() => setShowPw2(v => !v)}>
              {showPw2 ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        <div className="field-group">
          <div className="field-label">📱 Mobile Number <span style={{fontSize:'.62rem',color:'#B0BDCC',fontWeight:400}}>(optional)</span></div>
          <div className="field-wrap">
            <span className="field-icon">📞</span>
            <input className="field-input" type="tel" inputMode="tel" autoComplete="tel" name="phone"
              placeholder="9876543210" value={phone} onChange={e => setPhone(e.target.value)}/>
          </div>
        </div>

        <label className="check-row" style={{cursor:'pointer'}}>
          <input type="checkbox" className="check-box" checked={terms} onChange={e => setTerms(e.target.checked)}/>
          <span className="check-label">
            Main <a href="#" onClick={e => {e.preventDefault();alert('Terms coming soon!');}}>Terms &amp; Conditions</a> aur{' '}
            <a href="#" onClick={e => {e.preventDefault();alert('Privacy Policy coming soon!');}}>Privacy Policy</a>{' '}
            se agree karta/karti hoon. WhatsApp updates bhi chahiye.
          </span>
        </label>

        <button className="submit-btn" type="submit" disabled={loading}>
          {loading ? <><span className="spinner"/> Ek second…</> : '🚀 Account Banao — Free!'}
        </button>
        </form>

        <div className="secure-badge">🔒 256-bit SSL • Supabase Auth • Data safe hai</div>
      </div>

      <div className="bottom-link">
        Pehle se account hai? <a href="login.html">🔑 Login Karein →</a>
      </div>

      <FeatureChips chips={[
        {icon:'🎁',label:'₹50 OFF pehli order'},
        {icon:'🚀',label:'Fast delivery'},
        {icon:'💳',label:'UPI & COD'},
        {icon:'🛡️',label:'100% safe'},
      ]}/>
    </AuthLayout>
  );
}
