import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import AuthLayout, { BrandBar, MsgBox, FeatureChips } from './AuthLayout.jsx';

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [resending, setResending] = useState(false);
  const [resent,    setResent]    = useState(false);

  function friendly(err) {
    const m = err?.message || '';
    if (m.includes('rate limit') || m.includes('Too many')) return 'Zyada try kiya. 1 minute baad dobara karein.';
    if (m.includes('network') || m.includes('fetch'))       return 'Network error. Internet check karein.';
    return m || 'Kuch error hua. Dobara try karein.';
  }

  async function handleReset() {
    setError('');
    if (!email || !email.includes('@')) { setError('Sahi email address daalein!'); return; }
    setLoading(true);
    const redirectUrl = window.location.origin + '/reset-password.html';
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
    setLoading(false);
    if (err) { setError(friendly(err)); return; }
    setSent(true);
  }

  async function resendLink() {
    setResending(true);
    const redirectUrl = window.location.origin + '/reset-password.html';
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
    setResending(false);
    setResent(true);
    setTimeout(() => setResent(false), 4000);
  }

  return (
    <AuthLayout>
      <BrandBar badge1="🔒 Secure Reset" badge2="📧 Email Link"/>

      <div className="glass-card">
        {!sent ? (
          <>
            <div className="card-head">
              <div className="head-icon">🔓</div>
              <div className="card-title">Password Reset</div>
              <div className="card-subtitle">Apna registered email daalein.<br/>Hum ek reset link bhej denge.</div>
            </div>

            <div className="info-strip">
              <span className="is-icon">💡</span>
              <span>Reset link sirf <b>1 ghante</b> tak valid rahega. Email aate hi turant click karein!</span>
            </div>

            {error && <MsgBox type="error" html={error}/>}

            <form onSubmit={e => { e.preventDefault(); handleReset(); }}>
            <div className="field-group">
              <div className="field-label">📧 Registered Email</div>
              <div className="field-wrap">
                <span className="field-icon">✉️</span>
                <input className="field-input" type="email" inputMode="email" autoComplete="email" name="email"
                  placeholder="aapka@email.com" value={email} onChange={e => setEmail(e.target.value)}/>
              </div>
            </div>

            <button className="submit-btn" type="submit" disabled={loading}>
              {loading ? <><span className="spinner"/> Ek second…</> : '📧 Reset Link Bhejo'}
            </button>
            </form>

            <div className="secure-badge">🔒 Secure link • 1 ghante mein expire hota hai</div>
          </>
        ) : (
          <div className="email-sent-wrap">
            <div className="email-sent-icon">📬</div>
            <div className="email-sent-title">Link Bhej Diya!</div>
            <div className="email-sent-body">
              <b>{email}</b> par ek password reset link bheja gaya hai.<br/><br/>
              Link pe click karein → naya password set karein → wapas login karein.<br/>
              <span style={{color:'#94A3B8',fontSize:'.72rem'}}>Spam folder bhi zaroor check karein.</span>
            </div>
            <div className="email-badge">📩 1 ghante mein expire hoga</div>
            <button className="submit-btn" onClick={() => window.location.href = 'login.html'} style={{marginTop:8}}>
              🔑 Login Karein →
            </button>
            <div style={{marginTop:14}}>
              <span
                style={{fontSize:'.74rem',color:'var(--primary)',fontWeight:700,cursor:'pointer'}}
                onClick={resendLink}
              >
                {resending ? '⏳ Bhej rahe hain…' : resent ? '✅ Dobara bheja gaya!' : '🔄 Email nahi aaya? Dobara bhejo'}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="bottom-link">
        <a href="login.html" className="back-link">← Login Page Par Wapas Jao</a>
      </div>

      <FeatureChips chips={[
        {icon:'🔒',label:'Secure reset'},
        {icon:'⏱️',label:'1 ghante valid'},
        {icon:'📧',label:'Email link'},
      ]}/>
    </AuthLayout>
  );
}
