export default function AuthLayout({ children }) {
  return (
    <>
      <div className="auth-bg">
        <div className="grid-overlay"/>
        <div className="orb-3"/>
      </div>
      <div className="auth-page">
        <div className="auth-container">
          {children}
        </div>
      </div>
    </>
  );
}

export function BrandBar({ badge1, badge2 }) {
  return (
    <div className="brand-bar">
      <a href="index.html" className="brand-logo">
        <img src="/icons/rk-logo.svg" alt="RK Grocery Mart" style={{width:46,height:46,borderRadius:14}}/>
        <div>
          <div className="brand-name">RK Grocery Mart</div>
          <div className="brand-tagline">हर घर की पसंद · ONLINE GROCERY</div>
        </div>
      </a>
      <div className="trust-badges">
        {badge1 && <div className="badge-item">{badge1}</div>}
        {badge2 && <div className="badge-item">{badge2}</div>}
      </div>
    </div>
  );
}

export function MsgBox({ type, html }) {
  if (!html) return null;
  return (
    <div className={`msg-box ${type}`} style={{display:'flex'}}>
      <span className="msg-icon">{type === 'error' ? '⚠️' : '✅'}</span>
      <span dangerouslySetInnerHTML={{__html: html}}/>
    </div>
  );
}

export function FeatureChips({ chips }) {
  return (
    <div className="features-row">
      {chips.map(c => (
        <div key={c.label} className="feat-chip">
          <span className="fc-icon">{c.icon}</span> {c.label}
        </div>
      ))}
    </div>
  );
}
