import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import AuthLayout, { BrandBar, MsgBox, FeatureChips } from './AuthLayout.jsx';

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

export default function ResetPasswordPage() {
  // 'checking' | 'form' | 'invalid' | 'done'
  const [state,    setState]   = useState('checking');
  const [newPass,  setNewPass] = useState('');
  const [confirm,  setConfirm] = useState('');
  const [showPw1,  setShowPw1] = useState(false);
  const [showPw2,  setShowPw2] = useState(false);
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState('');
  const strength = getStrength(newPass);

  useEffect(() => {
    // Check if Supabase already embedded an error in the URL
    const qp = new URLSearchParams(window.location.search);
    const hp = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const errCode = qp.get('error_code') || hp.get('error_code') || qp.get('error') || hp.get('error');
    if (errCode) { setState('invalid'); return; }

    let resolved = false;

    // Primary: listen for PASSWORD_RECOVERY auth event (works for both PKCE + legacy flows)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && !resolved) {
        resolved = true;
        try { history.replaceState(null, '', window.location.pathname); } catch(e) {}
        setState('form');
      }
    });

    // Fallback: if event already fired, check session directly after grace period
    const timer = setTimeout(async () => {
      if (resolved) return;
      const looksLike = hp.get('type') === 'recovery' || hp.has('access_token') || qp.has('code');
      if (looksLike) {
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          resolved = true;
          try { history.replaceState(null, '', window.location.pathname); } catch(e) {}
          setState('form');
          return;
        }
      }
      setState('invalid');
    }, 2200);

    return () => { subscription?.unsubscribe(); clearTimeout(timer); };
  }, []);

  function friendly(err) {
    const m = err?.message || '';
    if (m.includes('Auth session missing') || m.includes('session missing'))
      return 'Reset link expire ho gaya ya pehle use ho chuka hai. Naya link mangwayein.';
    if (m.includes('Password should be')) return 'Password kam se kam 8 characters ka hona chahiye.';
    return m || 'Kuch error hua. Dobara try karein.';
  }

  async function handleNewPassword() {
    setError('');
    if (newPass.length < 6) { setError('Password kam se kam 6 characters ka hona chahiye!'); return; }
    if (newPass !== confirm) { setError('Dono passwords match nahi kar rahe!'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password: newPass });
    if (err) { setError(friendly(err)); setLoading(false); return; }
    // Kill the recovery session immediately so link can't be reused
    await supabase.auth.signOut();
    setLoading(false);
    setState('done');
    setTimeout(() => { window.location.href = 'login.html'; }, 2000);
  }

  return (
    <AuthLayout>
      <BrandBar badge1="🔒 Secure Reset" badge2="🔑 Set New Password"/>

      <div className="glass-card">
        {state === 'checking' && (
          <>
            <div className="card-head">
              <div className="head-icon">🔍</div>
              <div className="card-title">Link Verify Ho Raha Hai</div>
              <div className="card-subtitle">Ek second ruko, hum aapka reset link check kar rahe hain…</div>
            </div>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,padding:'22px 4px 8px'}}>
              <div style={{width:42,height:42,borderRadius:'50%',border:'3px solid rgba(148,163,184,0.25)',
                borderTopColor:'var(--primary)',animation:'rk-spin 0.8s linear infinite'}}/>
            </div>
          </>
        )}

        {state === 'invalid' && (
          <>
            <div className="card-head" style={{textAlign:'center'}}>
              <div style={{fontSize:'2.4rem',lineHeight:1,marginBottom:6}}>⚠️</div>
              <div className="card-title">Link Expired Ya Invalid Hai</div>
              <div className="card-subtitle">
                Yeh reset link kaam nahi kar raha — ho sakta hai ye 1 ghante se purana ho,
                pehle use ho chuka ho, ya kisi purane email se khula ho.
              </div>
            </div>
            <button className="submit-btn" onClick={() => window.location.href = 'forgot-password.html'}>
              🔄 Naya Link Mangwayein →
            </button>
          </>
        )}

        {state === 'form' && (
          <>
            <div className="card-head">
              <div className="head-icon">🔑</div>
              <div className="card-title">Naya Password Set Karein</div>
              <div className="card-subtitle">Apna naya strong password chunein</div>
            </div>

            {error && <MsgBox type="error" html={error}/>}

            <form onSubmit={e => { e.preventDefault(); handleNewPassword(); }}>
            <div className="field-group">
              <div className="field-label">🔒 Naya Password</div>
              <div className="field-wrap">
                <span className="field-icon">🔐</span>
                <input className="field-input" type={showPw1 ? 'text' : 'password'} autoComplete="new-password" name="newPassword"
                  placeholder="Naya strong password" value={newPass} onChange={e => setNewPass(e.target.value)}
                  style={{paddingRight:44}}/>
                <button className="pass-toggle" type="button" onClick={() => setShowPw1(v => !v)}>
                  {showPw1 ? '🙈' : '👁️'}
                </button>
              </div>
              {newPass && (
                <>
                  <div className="strength-bar-wrap" style={{marginTop:7}}>
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="strength-seg"
                        style={{background: i <= strength ? STR_COLORS[strength] : '#E2E8F0'}}/>
                    ))}
                  </div>
                  <div className="strength-label" style={{color: STR_COLORS[strength]}}>{STR_LABELS[strength]}</div>
                </>
              )}
            </div>

            <div className="field-group">
              <div className="field-label">✅ Password Confirm</div>
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

            <button className="submit-btn" type="submit" disabled={loading}>
              {loading ? <><span className="spinner"/> Ek second…</> : '✅ Password Update Karo'}
            </button>
            </form>
            <div className="secure-badge">🔒 Supabase secure update • Link sirf ek baar use hota hai</div>
          </>
        )}

        {state === 'done' && (
          <>
            <div style={{display:'flex',justifyContent:'center',padding:'6px 0 2px'}}>
              <div style={{width:64,height:64,borderRadius:'50%',background:'var(--primary)',
                display:'flex',alignItems:'center',justifyContent:'center',fontSize:'2rem',
                animation:'rk-pop 0.4s cubic-bezier(.34,1.56,.64,1)'}}>✅</div>
            </div>
            <div className="card-head" style={{textAlign:'center',marginTop:10}}>
              <div className="card-title">Password Update Ho Gaya! 🎉</div>
              <div className="card-subtitle">Login page par redirect ho rahe hain…</div>
            </div>
          </>
        )}
      </div>

      <div className="bottom-link">
        <a href="login.html" className="back-link">← Login Page Par Wapas Jao</a>
      </div>

      <FeatureChips chips={[
        {icon:'🔒',label:'Secure reset'},
        {icon:'🔁',label:'One-time link'},
        {icon:'📱',label:'Mobile + Desktop'},
      ]}/>

      <style>{`@keyframes rk-spin{to{transform:rotate(360deg)}} @keyframes rk-pop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </AuthLayout>
  );
}
