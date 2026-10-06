import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { uploadToCloudinary } from '../../lib/cloudinary';

// Web push VAPID public key (browser-safe) — push.js ise read karta hai.
// Public key hi yahan aata hai; private key sirf server-side (Vercel env) hoti hai.
window.__RK_PUSH_VAPID__ = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';
import {
  Home, Package, MapPin, User, Heart, Bell, Star, Settings as SettingsIcon,
  ChevronLeft, ChevronRight, X, Camera, LogOut, Sun, Moon, Copy, Share2, ShoppingCart,
} from 'lucide-react';

/* ══════════════════════════════════════════════════════════
   AccountPage (Module 9: Tailwind restyle — layout only)
   ALL state, handlers, Supabase calls, and window.RKProfile /
   window.RKCart / window.RKOrders bridges below are UNCHANGED
   from before. Only markup/classnames changed to match the new
   design (rk-grocery-website AccountLayout: gradient hero +
   desktop sidebar / mobile tab strip).

   Protected classnames/ids KEPT exactly as-is (see risk analysis):
     .bottom-nav, #toastEl
   (account.css keeps every other old class too — nothing was
   deleted — but this file itself no longer references them.)
══════════════════════════════════════════════════════════ */

/* ─── helpers (unchanged) ─────────────────── */
const fmt      = n => '₹' + Number(n).toLocaleString('en-IN');
const fmtDate  = d => new Date(d).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
const fmtTime  = d => new Date(d).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
const memberSince = d => { const dt=new Date(d); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getMonth()]+' '+dt.getFullYear(); };
const loyaltyLevel = n => {
  if (n>=50) return { label:'🥇 Gold Member',  color:'#F59E0B' };
  if (n>=20) return { label:'🥈 Silver Member', color:'#94A3B8' };
  if (n>=5)  return { label:'🥉 Bronze Member', color:'#B45309' };
  return { label:'🌱 New Member', color:'#10B981' };
};
const statusLabel = s => ({ pending:'Pending', confirmed:'Confirmed', out_for_delivery:'Out for Delivery', delivered:'Delivered', cancelled:'Cancelled' }[s]||s);
const notifColor  = t => ({ offer:'var(--tint-orange-bg)', order:'var(--tint-blue-bg)', delivery:'var(--tint-purple-bg)', stock:'var(--tint-green-bg)', system:'var(--tint-neutral-bg)' }[t]||'var(--tint-neutral-bg)');
const notifIcon   = t => ({ offer:'🎁', order:'📦', delivery:'🚴', stock:'📢', system:'ℹ️' }[t]||'🔔');
const addrIcon    = l => { const s=(l||'').toLowerCase(); if(s.includes('home')) return '🏠'; if(s.includes('office')||s.includes('work')) return '🏢'; return '📍'; };

const TABS = [
  { id:'overview',      icon:Home,        label:'Overview' },
  { id:'orders',        icon:Package,     label:'Orders' },
  { id:'addresses',     icon:MapPin,      label:'Addresses' },
  { id:'profile',       icon:User,        label:'Profile' },
  { id:'wishlist',      icon:Heart,       label:'Wishlist' },
  { id:'notifications', icon:Bell,        label:'Alerts' },
  { id:'rewards',       icon:Star,        label:'Rewards' },
  { id:'settings',      icon:SettingsIcon,label:'Settings' },
];

/* ─── shared presentational helpers (Tailwind + CSS-var tokens,
       same convention as CheckoutForm.jsx / App.jsx) ─────────── */
const cardWrap  = "rounded-2xl mb-3.5 overflow-hidden";
const cardStyle = { background:'var(--card-bg)', boxShadow:'0 2px 10px rgba(0,0,0,0.05)', border:'1px solid var(--border)' };
const inputCls  = "w-full rounded-xl px-3.5 py-2.5 text-[15px] font-poppins outline-none";
const inputStyle= { background:'var(--light)', border:'1.5px solid var(--border)', color:'var(--dark)' };
const labelCls  = "text-[10px] font-bold font-poppins uppercase tracking-wide block mb-1.5";
const btnPrimaryStyle   = { background:'linear-gradient(135deg, var(--primary), var(--primary-dark))', boxShadow:'0 4px 16px rgba(22,163,74,0.3)' };
const btnSecondaryStyle = { background:'var(--light)', color:'var(--gray)', border:'1.5px solid var(--border)' };
const btnDangerStyle    = { background:'var(--tint-red-bg)', color:'var(--red)', border:'1.5px solid var(--tint-red-border)' };
// Product ka primary image (dataHooks.js jaisa hi logic): is_default first, warna sort_order se pehli
const primaryImgOf = p => {
  const imgs = (p?.product_images || []).slice().sort((a, b) => a.sort_order - b.sort_order);
  return (imgs.find(i => i.is_default) || imgs[0])?.image_url || null;
};

function Card({ title, icon, action, children, noBody }) {
  return (
    <div className={cardWrap} style={cardStyle}>
      {title && (
        <>
          <div className="flex items-center justify-between px-4 md:px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm font-extrabold font-poppins" style={{color:'var(--dark)'}}>
              {icon && <span className="text-base leading-none">{icon}</span>} {title}
            </div>
            {action}
          </div>
          <div className="h-px" style={{background:'var(--border)'}}/>
        </>
      )}
      {noBody ? children : <div className="p-4 md:p-5">{children}</div>}
    </div>
  );
}

function CardActionBtn({ onClick, children }) {
  return (
    <button onClick={onClick}
      className="text-[11px] font-bold font-poppins px-3 py-1.5 rounded-full transition-colors"
      style={{background:'var(--primary-light)', color:'var(--primary)'}}>
      {children}
    </button>
  );
}

function EmptyState({ icon, title, sub, cta, onCta }) {
  return (
    <div className="text-center py-10 px-5">
      <div className="text-5xl mb-2.5">{icon}</div>
      <div className="text-sm font-bold font-poppins" style={{color:'var(--dark)'}}>{title}</div>
      <div className="text-xs font-poppins mt-1" style={{color:'var(--muted)'}}>{sub}</div>
      {cta && (
        <button onClick={onCta}
          className="mt-4 inline-flex items-center gap-1 text-white rounded-full px-5 py-2.5 text-xs font-bold font-poppins"
          style={{background:'var(--primary)'}}>{cta}</button>
      )}
    </div>
  );
}

function Badge({ status }) {
  const map = {
    pending:          ['var(--badge-yellow-bg)','var(--badge-yellow-text)'],
    confirmed:        ['var(--badge-blue-bg)','var(--badge-blue-text)'],
    out_for_delivery: ['var(--badge-purple-bg)','var(--badge-purple-text)'],
    delivered:        ['var(--badge-green-bg)','var(--badge-green-text)'],
    cancelled:        ['var(--badge-red-bg)','var(--badge-red-text)'],
  };
  const [bg,text] = map[status]||['var(--light)','var(--gray)'];
  return <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold font-poppins tracking-wide mt-1" style={{background:bg,color:text}}>{statusLabel(status)}</span>;
}

function Toggle({ on, onClick }) {
  return (
    <div className="w-[46px] h-[26px] rounded-full relative cursor-pointer flex-shrink-0 transition-colors duration-300" style={{background:on?'var(--primary)':'#CBD5E1'}} onClick={onClick}>
      <div className="w-5 h-5 bg-white rounded-full absolute top-[3px] transition-all duration-300" style={{left:on?'23px':'3px', boxShadow:'0 1px 4px rgba(0,0,0,0.2)'}}/>
    </div>
  );
}

/* ─── Overview Tab ────────────────────────── */
function OverviewTab({ state, switchTab }) {
  const p = state.profile;
  const totalOrders = state.orders.length;
  const savings     = state.orders.reduce((s,o)=>s+(o.discount||0),0);
  const unread      = state.notifications.filter(n=>!n.is_read).length;
  const recentOrders = state.orders.slice(0,3);

  return (
    <>
      <Card title="Recent Orders" icon="📦" action={<CardActionBtn onClick={()=>switchTab('orders')}>View All</CardActionBtn>} noBody>
        {recentOrders.length
          ? recentOrders.map(o=><OrderRow key={o.id} o={o}/>)
          : <EmptyState icon="🛒" title="Koi order nahi abhi tak" sub="Apna pehla order place karo!" cta="Shop Now →" onCta={()=>window.location.href='index.html'}/>}
      </Card>

      <Card title="Quick Actions" icon="⚡">
        <div className="grid grid-cols-2 gap-2.5">
          {[
            {i:'🛍️',t:'Shop Now',     s:'Browse products',    fn:()=>window.location.href='index.html'},
            {i:'📍',t:'Add Address',  s:'Save delivery spot', fn:()=>switchTab('addresses')},
            {i:'❤️',t:'My Wishlist',  s:'Saved products',     fn:()=>switchTab('wishlist')},
            {i:'🎁',t:'Refer & Earn', s:'Get ₹30 cashback',   fn:()=>switchTab('rewards')},
          ].map(a=>(
            <div key={a.t} onClick={a.fn} className="rounded-xl p-3.5 cursor-pointer transition-all hover:-translate-y-0.5"
              style={{background:'var(--light)', border:'1.5px solid var(--border)'}}>
              <div className="text-2xl mb-1.5">{a.i}</div>
              <div className="text-xs font-extrabold font-poppins" style={{color:'var(--dark)'}}>{a.t}</div>
              <div className="text-[10px] font-poppins mt-0.5" style={{color:'var(--muted)'}}>{a.s}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function OrderRow({ o, onClick, onReorder }) {
  return (
    <div onClick={onClick} className="flex gap-3 items-start px-4 md:px-5 py-3.5 cursor-pointer transition-colors last:border-b-0" style={{borderBottom:'1px solid var(--border)'}}>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{background:'var(--light)', border:'1.5px solid var(--border)'}}>🛒</div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-extrabold font-poppins" style={{color:'var(--dark)'}}>{o.order_number}</div>
        <div className="text-[11px] font-poppins mt-0.5" style={{color:'var(--muted)'}}>{o.delivery_name||''} • {o.delivery_city||'Jaunpur'}</div>
        <div className="text-[10px] font-poppins mt-0.5" style={{color:'var(--muted)'}}>{fmtTime(o.created_at)}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-sm font-extrabold font-poppins" style={{color:'var(--dark)'}}>{fmt(o.final_amount)}</div>
        <Badge status={o.status}/>
        {o.status==='delivered'&&onReorder&&(
          <button onClick={e=>{e.stopPropagation();onReorder(o.id);}}
            className="mt-2 text-white text-[10px] font-bold font-poppins rounded-md px-2.5 py-1.5" style={{background:'var(--primary)'}}>🔁 Buy Again</button>
        )}
      </div>
    </div>
  );
}

/* ─── Orders Tab ──────────────────────────── */
function OrdersTab({ state, showToast }) {
  const [modal, setModal] = useState(null);

  async function viewOrder(o) {
    const { data: items } = await supabase.from('order_items').select('*').eq('order_id', o.id);
    const statuses = ['pending','confirmed','out_for_delivery','delivered'];
    const curIdx   = statuses.indexOf(o.status);
    const tlSteps  = [
      { icon:'✅', label:'Order Placed',    sub:fmtTime(o.created_at) },
      { icon:'🏪', label:'Confirmed',        sub:'Store ne accept kiya' },
      { icon:'🚴', label:'Out for Delivery', sub:'Delivery boy on the way' },
      { icon:'🎉', label:'Delivered',        sub:'Order deliver ho gaya' },
    ];
    setModal({ o, items:items||[], tlSteps, curIdx });
  }

  async function reorder(orderId) {
    if (window.RKOrders) { await window.RKOrders.reorder(orderId); showToast('Items cart mein add ho gaye! 🛒'); setTimeout(()=>window.location.href='index.html',1600); }
  }

  return (
    <>
      <Card title={`My Orders (${state.orders.length})`} icon="📦" noBody>
        {state.orders.length
          ? state.orders.map(o=><OrderRow key={o.id} o={o} onClick={()=>viewOrder(o)} onReorder={reorder}/>)
          : <EmptyState icon="📦" title="Koi order nahi mila" sub="Pehla order place karo!" cta="Shop Now →" onCta={()=>window.location.href='index.html'}/>}
      </Card>

      {modal && (
        <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center" onClick={()=>setModal(null)}>
          <div className="absolute inset-0" style={{background:'rgba(15,23,42,0.55)'}}/>
          <div onClick={e=>e.stopPropagation()} className="relative w-full md:w-[520px] max-h-[88vh] overflow-y-auto rounded-t-2xl md:rounded-2xl" style={{background:'var(--card-bg)'}}>
            <div className="flex items-center justify-between px-5 py-4 sticky top-0 z-10" style={{background:'var(--card-bg)', borderBottom:'1px solid var(--border)'}}>
              <div className="text-sm font-extrabold font-poppins" style={{color:'var(--dark)'}}>Order {modal.o.order_number}</div>
              <button onClick={()=>setModal(null)} aria-label="Band karein" className="w-8 h-8 rounded-full flex items-center justify-center" style={{background:'var(--light)', color:'var(--gray)'}}><X size={16}/></button>
            </div>
            <div className="p-5">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <div className="text-[11px] font-poppins mb-0.5" style={{color:'var(--muted)'}}>Total Amount</div>
                  <div className="text-xl font-black font-poppins" style={{color:'var(--primary)'}}>{fmt(modal.o.final_amount)}</div>
                </div>
                <Badge status={modal.o.status}/>
              </div>

              <div className="text-[11px] font-bold font-poppins uppercase tracking-wide mb-2.5" style={{color:'var(--muted)'}}>Order Status</div>
              <div className="mb-5">
                {modal.tlSteps.map((step,i)=>{
                  let cls = i<modal.curIdx?'done':i===modal.curIdx?'active':'waiting';
                  if (modal.o.status==='cancelled') cls='waiting';
                  const dotStyle = cls==='done'?{background:'var(--primary-light)',color:'var(--primary)'}
                    :cls==='active'?{background:'var(--primary)',color:'#fff',boxShadow:'0 0 0 4px rgba(22,163,74,0.2)'}
                    :{background:'var(--light)',color:'var(--muted)'};
                  return (
                    <div key={i} className="flex gap-3 mb-2.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={dotStyle}>{step.icon}</div>
                      <div className="pt-1">
                        <div className="text-[13px] font-bold font-poppins" style={{color:cls==='waiting'?'var(--muted)':'var(--dark)'}}>{step.label}</div>
                        <div className="text-[11px] font-poppins mt-0.5" style={{color:'var(--muted)'}}>{cls!=='waiting'?step.sub:'Awaited'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="h-px mb-4" style={{background:'var(--border)'}}/>
              <div className="text-[11px] font-bold font-poppins uppercase tracking-wide mb-2.5" style={{color:'var(--muted)'}}>Items Ordered</div>
              {modal.items.map(it=>(
                <div key={it.id} className="flex items-center justify-between py-2.5 last:border-b-0" style={{borderBottom:'1px solid var(--border)'}}>
                  <div className="flex gap-2.5 items-center">
                    <span className="text-2xl">{it.emoji||'🛒'}</span>
                    <div><div className="text-[13px] font-bold font-poppins" style={{color:'var(--dark)'}}>{it.name}</div><div className="text-[11px] font-poppins" style={{color:'var(--muted)'}}>{it.unit} × {it.qty}</div></div>
                  </div>
                  <div className="text-sm font-extrabold font-poppins" style={{color:'var(--dark)'}}>{fmt(it.line_total)}</div>
                </div>
              ))}

              <div className="h-px my-3.5" style={{background:'var(--border)'}}/>
              <div className="text-[11px] font-bold font-poppins uppercase tracking-wide mb-2.5" style={{color:'var(--muted)'}}>Delivery To</div>
              <div className="text-[13px] font-poppins leading-relaxed" style={{color:'var(--text)'}}>
                <b>{modal.o.delivery_name}</b><br/>
                📞 {modal.o.delivery_phone}<br/>
                📍 {modal.o.delivery_line1}{modal.o.delivery_line2?', '+modal.o.delivery_line2:''}, {modal.o.delivery_city}{modal.o.delivery_pincode?' - '+modal.o.delivery_pincode:''}
              </div>

              <div className="grid grid-cols-2 gap-2.5 mt-5">
                {modal.o.status==='delivered'
                  ? <button className="w-full text-white font-extrabold font-poppins rounded-xl py-3 text-sm" style={btnPrimaryStyle} onClick={()=>{reorder(modal.o.id);setModal(null);}}>🔁 Reorder</button>
                  : <div/>}
                <button className="w-full font-bold font-poppins rounded-xl py-3 text-sm" style={btnSecondaryStyle} onClick={()=>setModal(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Addresses Tab ───────────────────────── */
function AddressesTab({ state, setState, showToast }) {
  const [form, setForm] = useState(null); // null = hidden, {} = new, {id,...} = edit

  async function saveAddr() {
    const line1 = form.line1?.trim();
    const line2 = form.line2?.trim();
    const city  = form.city?.trim();
    const pin   = form.pincode?.trim();
    if (!line1||!line2||!city||!/^\d{6}$/.test(pin)) { showToast('Address, landmark, city aur 6-digit pincode zaroori hai!'); return; }
    const payload = { label:form.label||'Home', line1, line2, city, pincode:pin, is_default:!!form.is_default, id:form.id||undefined };
    let saved;
    if (window.RKProfile) saved = await window.RKProfile.saveAddress(state.user.id, payload);
    if (!saved) {
      if (payload.is_default) await supabase.from('addresses').update({is_default:false}).eq('user_id',state.user.id);
      if (payload.id) { const {data}=await supabase.from('addresses').update(payload).eq('id',payload.id).select().single(); saved=data; }
      else { const {data}=await supabase.from('addresses').insert({...payload,user_id:state.user.id}).select().single(); saved=data; }
    }
    if (saved) {
      showToast('Address save ho gaya! 📍');
      const {data}=await supabase.from('addresses').select('*').eq('user_id',state.user.id).order('is_default',{ascending:false});
      setState(s=>({...s,addresses:data||[]}));
      setForm(null);
    } else { showToast('Error! Dobara try karo.'); }
  }

  async function deleteAddr(id) {
    if (!confirm('Yeh address delete karein?')) return;
    if (window.RKProfile) await window.RKProfile.deleteAddress(state.user.id, id);
    else await supabase.from('addresses').delete().eq('id',id).eq('user_id',state.user.id);
    setState(s=>({...s,addresses:s.addresses.filter(a=>a.id!==id)}));
    showToast('Address delete ho gaya!');
  }

  async function setDefault(id) {
    if (window.RKProfile) await window.RKProfile.setDefaultAddress(state.user.id, id);
    else {
      await supabase.from('addresses').update({is_default:false}).eq('user_id',state.user.id);
      await supabase.from('addresses').update({is_default:true}).eq('id',id);
    }
    const {data}=await supabase.from('addresses').select('*').eq('user_id',state.user.id).order('is_default',{ascending:false});
    setState(s=>({...s,addresses:data||[]}));
    showToast('Default address set ho gaya! ✅');
  }

  const f = form||{};
  const upd = v => setForm(s=>({...s,...v}));

  return (
    <>
      <Card title={`Saved Addresses (${state.addresses.length})`} icon="📍" action={<CardActionBtn onClick={()=>setForm({})}>+ Add New</CardActionBtn>} noBody>
        {state.addresses.length
          ? state.addresses.map(a=>(
            <div key={a.id} className="flex gap-3 items-start px-4 md:px-5 py-3.5 last:border-b-0" style={{borderBottom:'1px solid var(--border)'}}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{background:'var(--primary-light)'}}>{addrIcon(a.label)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[13px] font-extrabold font-poppins" style={{color:'var(--dark)'}}>{a.label}</span>
                  {a.is_default&&<span className="text-white text-[9px] font-extrabold font-poppins px-1.5 py-0.5 rounded-full" style={{background:'var(--primary)'}}>DEFAULT</span>}
                </div>
                <div className="text-[11px] font-poppins leading-snug" style={{color:'var(--gray)'}}>{a.line1}{a.line2?', '+a.line2:''}<br/>{a.city}{a.pincode?' - '+a.pincode:''}</div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  <button onClick={()=>setForm({...a})} className="text-[11px] font-bold font-poppins px-2.5 py-1 rounded-md" style={{background:'var(--tint-blue-bg)',color:'var(--tint-blue-text)'}}>✏️ Edit</button>
                  <button onClick={()=>deleteAddr(a.id)} className="text-[11px] font-bold font-poppins px-2.5 py-1 rounded-md" style={{background:'var(--tint-red-bg)',color:'var(--red)'}}>🗑️ Delete</button>
                  {!a.is_default&&<button onClick={()=>setDefault(a.id)} className="text-[11px] font-bold font-poppins px-2.5 py-1 rounded-md" style={{background:'var(--primary-light)',color:'var(--primary)'}}>✓ Set Default</button>}
                </div>
              </div>
            </div>
          ))
          : <EmptyState icon="📍" title="Koi address nahi" sub="Delivery ke liye address add karo" cta="+ Add Address" onCta={()=>setForm({})}/>}
      </Card>

      {form!==null && (
        <Card title={f.id?'✏️ Edit Address':'➕ New Address'}>
          <div className="mb-3">
            <label className={labelCls} style={{color:'var(--gray)'}}>Label</label>
            <input className={inputCls} style={inputStyle} placeholder="e.g. Home / Office" value={f.label||''} onChange={e=>upd({label:e.target.value})}/>
          </div>
          <div className="mb-3">
            <label className={labelCls} style={{color:'var(--gray)'}}>Address Line 1 *</label>
            <input className={inputCls} style={inputStyle} placeholder="House no., Street name" value={f.line1||''} onChange={e=>upd({line1:e.target.value})}/>
          </div>
          <div className="mb-3">
            <label className={labelCls} style={{color:'var(--gray)'}}>Address Line 2 (Landmark) *</label>
            <input className={inputCls} style={inputStyle} placeholder="Mohalla, Landmark" value={f.line2||''} onChange={e=>upd({line2:e.target.value})}/>
          </div>
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <div>
              <label className={labelCls} style={{color:'var(--gray)'}}>City *</label>
              <input className={inputCls} style={inputStyle} value={f.city||'Jaunpur'} onChange={e=>upd({city:e.target.value})}/>
            </div>
            <div>
              <label className={labelCls} style={{color:'var(--gray)'}}>Pincode *</label>
              <input className={inputCls} style={inputStyle} placeholder="222001" type="tel" value={f.pincode||''} onChange={e=>upd({pincode:e.target.value})}/>
            </div>
          </div>
          <div className="flex items-center gap-2.5 mb-4">
            <Toggle on={!!f.is_default} onClick={()=>upd({is_default:!f.is_default})}/>
            <span className="text-[13px] font-semibold font-poppins" style={{color:'var(--text)'}}>Set as default delivery address</span>
          </div>
          <button className="w-full text-white font-extrabold font-poppins rounded-xl py-3 text-sm" style={btnPrimaryStyle} onClick={saveAddr}>💾 Save Address</button>
          <div className="h-2.5"/>
          <button className="w-full font-bold font-poppins rounded-xl py-3 text-sm" style={btnSecondaryStyle} onClick={()=>setForm(null)}>Cancel</button>
        </Card>
      )}
    </>
  );
}

/* ─── Profile Tab ─────────────────────────── */
function ProfileTab({ state, setState, showToast }) {
  const [name, setName]    = useState(state.profile?.name||'');
  const [phone, setPhone]  = useState(state.profile?.phone||'');
  const [preview, setPreview] = useState(null);
  const [file, setFile]    = useState(null);
  const [saving, setSaving]= useState(false);

  const p = state.profile||{};

  function previewAvatar(e) {
    const f = e.target.files[0]; if (!f) return;
    setFile(f);
    const r = new FileReader(); r.onload=ev=>setPreview(ev.target.result); r.readAsDataURL(f);
  }

  async function saveProfile() {
    if (!name.trim()) { showToast('Naam zaroori hai!'); return; }
    setSaving(true);
    let avatar_url = p.avatar_url||null;
    if (file) {
      try {
        const { url, error: upErr } = await uploadToCloudinary(file, `myshop/avatars/${state.user.id}`);
        if (upErr || !url) showToast('⚠️ Photo upload fail');
        else avatar_url = url;
      } catch(err) { showToast('⚠️ Photo upload error'); }
    }
    let updated=null;
    try {
      if (window.RKProfile) updated=await window.RKProfile.updateProfile(state.user.id,{name:name.trim(),phone,avatar_url});
      if (!updated) {
        const {data,error}=await supabase.from('profiles').upsert({id:state.user.id,name:name.trim(),phone,avatar_url,email:state.user.email,updated_at:new Date().toISOString()}).select().single();
        if (error) showToast('⚠️ Save error: '+error.message); else updated=data;
      }
    } catch(err) { showToast('⚠️ Error: '+(err.message||err)); }
    setSaving(false);
    if (updated) { setState(s=>({...s,profile:updated})); showToast('Profile update ho gaya! ✅'); }
  }

  return (
    <Card title="Edit Profile" icon="👤">
      <label htmlFor="avatarInput">
        <div className="flex items-center gap-3.5 rounded-2xl p-4 mb-4 cursor-pointer transition-colors" style={{background:'var(--light)', border:'1.5px solid var(--border)'}}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl overflow-hidden flex-shrink-0" style={{background:'var(--primary-light)', border:'3px solid var(--primary)'}}>
            {preview ? <img src={preview} alt="" className="w-full h-full object-cover rounded-full"/> : p.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover rounded-full"/> : (p.name?p.name[0].toUpperCase():'👤')}
          </div>
          <div>
            <div className="text-[13px] font-bold font-poppins" style={{color:'var(--dark)'}}>📷 Photo Change Karo</div>
            <div className="text-[11px] font-poppins mt-0.5" style={{color:'var(--muted)'}}>JPG, PNG • Max 2MB</div>
          </div>
        </div>
      </label>
      <input type="file" id="avatarInput" accept="image/*" className="hidden" onChange={previewAvatar}/>

      <div className="mb-3">
        <label className={labelCls} style={{color:'var(--gray)'}}>Full Name *</label>
        <input className={inputCls} style={inputStyle} value={name} onChange={e=>setName(e.target.value)} placeholder="Aapka naam"/>
      </div>
      <div className="mb-3">
        <label className={labelCls} style={{color:'var(--gray)'}}>Email</label>
        <input className={inputCls} style={{...inputStyle, background:'var(--light)', color:'var(--gray)', cursor:'not-allowed'}} value={p.email||''} readOnly placeholder="Email"/>
      </div>
      <div className="mb-3">
        <label className={labelCls} style={{color:'var(--gray)'}}>Phone Number</label>
        <input className={inputCls} style={inputStyle} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="10-digit mobile" type="tel" maxLength={10}/>
      </div>
      <div className="rounded-xl px-3.5 py-3 text-[12px] font-poppins leading-relaxed mb-3.5" style={{background:'var(--tint-green-bg)', border:'1.5px solid var(--tint-green-border)', color:'var(--tint-green-text)'}}>
        📅 Member since: <b>{memberSince(p.created_at||state.user?.created_at)}</b>
        &nbsp;•&nbsp; 🆔 ID: <span className="text-[10px] opacity-60">{state.user?.id?.slice(0,8)}…</span>
      </div>
      <button className="w-full text-white font-extrabold font-poppins rounded-xl py-3 text-sm disabled:opacity-60" style={btnPrimaryStyle} onClick={saveProfile} disabled={saving}>{saving?'⏳ Saving...':'💾 Profile Save Karo'}</button>
    </Card>
  );
}

/* ─── Wishlist Tab ────────────────────────── */
function WishlistTab({ state, setState, showToast, priceAlerts, toggleAlert }) {
  async function addToCart(w) {
    if (!window.RKCart) return;
    // Wishlist snapshot me image nahi hoti — fresh product se primary image le lo
    // (taaki cart drawer me bhi product ka image dikhe, not 🛒 fallback).
    // Multi-unit: units ho to FIRST variant (units[0]) default unit/price use karo.
    let image=w.image||null;
    let unit=w.unit, price=w.price, variant=null;
    const {data}=await supabase.from('products').select('product_images(image_url,is_default,sort_order),units,unit_value,selling_price').eq('id',w.product_id).maybeSingle();
    image=image||primaryImgOf(data);
    const units=(data&&Array.isArray(data.units)&&data.units.length)?data.units:null;
    if(units){
      variant=units[0].label;
      unit=units[0].label;
      price=units[0].price??w.price;
    }else if(data){
      unit=data.unit_value||w.unit;
      price=data.selling_price??w.price;
    }
    await window.RKCart.addToCart({id:w.product_id,k:variant?`${w.product_id}::${variant}`:w.product_id,name:w.name,unit,price,e:w.emoji,cat:w.category,image,variant});
    showToast(`${w.name} cart mein add! 🛒`);
  }
  async function addAll() {
    if (!window.RKCart||!state.wishlist.length) return;
    const inCart = window.RKCart.getCart().map(i=>i.id);
    // Buy Again ki tarah FRESH data use karo — stale price/inactive/OOS items
    // cart me mat daalo (checkout ka create_order reject kar deta).
    const ids = state.wishlist.map(w=>w.product_id);
    // product_images + units bhi le lo taaki cart me product image bhi jaye
    // (drawer me dikhe) aur multi-unit products ka FIRST variant use ho.
    const {data:prods}=await supabase.from('products').select('id,name,selling_price,unit_value,is_active,stock_quantity,units,product_images(image_url,is_default,sort_order)').in('id',ids);
    const fresh={}; (prods||[]).forEach(p=>{fresh[p.id]=p;});
    let added=0, skipped=0;
    for (const w of state.wishlist) {
      const key=(f)=>{
        const units=(f&&Array.isArray(f.units)&&f.units.length)?f.units:null;
        if(units)return `${f.id}::${units[0].label}`;
        return f.id;
      };
      const f=fresh[w.product_id];
      if(inCart.includes(key(f))) continue; // pehle se cart mein hai
      if(!f||!f.is_active||(f.stock_quantity??0)<=0){ skipped++; continue; }
      const units=(f.units&&Array.isArray(f.units)&&f.units.length)?f.units:null;
      const variant=units?units[0].label:null;
      await window.RKCart.addToCart({id:w.product_id,k:key(f),name:f.name||w.name,unit:units?units[0].label:(f.unit_value||w.unit),price:units?(units[0].price??f.selling_price):(f.selling_price??w.price),e:w.emoji,cat:w.category,image:primaryImgOf(f),variant});
      added++;
    }
    showToast(added?`${added} items cart mein add! 🛒`:(skipped?`${skipped} items stock mein nahi hain`:'Sab items pehle se cart mein hain ✅'));
  }
  async function remove(w) {
    const {error}=await supabase.from('wishlist').delete().eq('id',w.id).eq('user_id',state.user.id);
    if (!error) { setState(s=>({...s,wishlist:s.wishlist.filter(x=>x.id!==w.id)})); showToast('Wishlist se hata diya'); }
  }
  return (
    <Card title={`My Wishlist (${state.wishlist.length})`} icon="❤️"
      action={state.wishlist.length>0&&<CardActionBtn onClick={addAll}>🛒 Add All to Cart</CardActionBtn>}
      noBody>
      {state.wishlist.length
        ? state.wishlist.map(w=>{
          const alerted=(priceAlerts||[]).includes(w.product_id);
          return (
            <div key={w.id} className="flex gap-3 items-center px-4 md:px-5 py-3.5 last:border-b-0" style={{borderBottom:'1px solid var(--border)'}}>
              <div className="w-[52px] h-[52px] rounded-xl flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden" style={{background:'var(--light)', border:'1.5px solid var(--border)'}}>
                {w.image
                  ?<img src={w.image} alt={w.name} className="w-full h-full object-cover"/>
                  :<span>{w.emoji||'🛒'}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold font-poppins" style={{color:'var(--dark)'}}>{w.name}</div>
                <div className="text-[11px] font-poppins mt-0.5" style={{color:'var(--muted)'}}>{w.unit||''}</div>
                <div className="text-sm font-extrabold font-poppins mt-0.5" style={{color:'var(--primary)'}}>₹{w.price}</div>
              </div>
              <div className="flex flex-col gap-1.5">
                <button onClick={()=>addToCart(w)} className="text-white text-[11px] font-bold font-poppins rounded-md px-3 py-1.5" style={{background:'var(--primary)'}}>🛒 Add</button>
                <button onClick={()=>toggleAlert(w.product_id)}
                  title={alerted?'Price alert hatao':'Price drop / back-in-stock alert set karo'}
                  className="text-[11px] font-bold font-poppins rounded-md px-2.5 py-1"
                  style={alerted?{background:'var(--tint-yellow-bg)', color:'var(--tint-yellow-text)', border:'1px solid var(--tint-yellow-border)'}:{background:'var(--light)', color:'var(--gray)', border:'1px solid var(--border)'}}>
                  {alerted?'🔔 On':'🔔 Alert'}
                </button>
                <button onClick={()=>remove(w)} className="text-[11px] font-bold font-poppins rounded-md px-2.5 py-1" style={{background:'var(--tint-red-bg)', color:'var(--red)'}}>🗑️ Remove</button>
              </div>
            </div>
          );
        })
        : <EmptyState icon="❤️" title="Wishlist khali hai" sub="Products par ❤️ tap karo" cta="Browse Products →" onCta={()=>window.location.href='index.html'}/>}
    </Card>
  );
}

/* ─── Notifications Tab ───────────────────── */
function NotificationsTab({ state, setState, showToast }) {
  async function markRead(n) {
    if (n.is_read) return;
    await supabase.from('notifications').update({is_read:true}).eq('id',n.id);
    setState(s=>({...s,notifications:s.notifications.map(x=>x.id===n.id?{...x,is_read:true}:x)}));
  }
  async function markAll() {
    await supabase.from('notifications').update({is_read:true}).eq('user_id',state.user.id).eq('is_read',false);
    setState(s=>({...s,notifications:s.notifications.map(n=>({...n,is_read:true}))}));
    showToast('Sab notifications read mark ho gaye ✅');
  }
  const unread = state.notifications.filter(n=>!n.is_read);
  return (
    <Card
      title={<span className="flex items-center gap-2">Notifications {unread.length>0&&<span className="w-5 h-5 rounded-full text-white text-[10px] font-extrabold flex items-center justify-center" style={{background:'var(--red)'}}>{unread.length}</span>}</span>}
      icon="🔔"
      action={unread.length>0&&<CardActionBtn onClick={markAll}>Mark All Read</CardActionBtn>}
      noBody
    >
      {state.notifications.length
        ? state.notifications.map(n=>(
          <div key={n.id} onClick={()=>markRead(n)} className="flex gap-3 items-start px-4 md:px-5 py-3.5 cursor-pointer last:border-b-0" style={{borderBottom:'1px solid var(--border)', background:!n.is_read?'var(--primary-light)':'transparent'}}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{background:notifColor(n.type)}}>{notifIcon(n.type)}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold font-poppins" style={{color:'var(--dark)'}}>{n.title||'Notification'}</div>
              <div className="text-[11px] font-poppins mt-0.5 leading-relaxed" style={{color:'var(--gray)'}}>{n.message||''}</div>
              <div className="text-[10px] font-poppins mt-1" style={{color:'var(--muted)'}}>{fmtTime(n.created_at)}</div>
            </div>
            {!n.is_read?<div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{background:'var(--primary)'}}/>:<div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{background:'var(--border)'}}/>}
          </div>
        ))
        : <EmptyState icon="🔔" title="Koi notification nahi" sub="Offers aur order updates yahan dikhenge"/>}
    </Card>
  );
}

/* ─── Rewards Tab ─────────────────────────── */
function RewardsTab({ state, showToast }) {
  const totalOrders    = state.orders.length;
  const deliveredCount = state.orders.filter(o=>o.status==='delivered').length;
  const savings        = state.orders.reduce((s,o)=>s+(o.discount||0),0);
  // ── Real referral + points data (fix 2026-08-13: pehle sab frontend-only fake tha) ──
  const [refCode,setRefCode]      = useState(state.profile?.referral_code||'');
  const [referredCount,setReferredCount] = useState(0);
  const [bonusPts,setBonusPts]    = useState(0);
  const [redeemable,setRedeemable]= useState(null);
  useEffect(()=>{
    let active=true;
    (async()=>{
      if(!state.user){return;}
      const uid=state.user.id;
      const [rpcR,codeR,refR,bonusR]=await Promise.allSettled([
        supabase.rpc('get_redeemable_points',{p_user_id:uid}),
        supabase.rpc('generate_referral_code'),
        supabase.from('referrals').select('id,status').eq('referrer_id',uid),
        supabase.from('reward_bonuses').select('points').eq('user_id',uid),
      ]);
      if(!active)return;
      if(rpcR.status==='fulfilled') setRedeemable(Number(rpcR.value.data)||0);
      if(codeR.status==='fulfilled'&&codeR.value.data) setRefCode(codeR.value.data);
      if(refR.status==='fulfilled') setReferredCount((refR.value.data||[]).length);
      if(bonusR.status==='fulfilled') setBonusPts((bonusR.value.data||[]).reduce((s,b)=>s+(b.points||0),0));
    })();
    return()=>{active=false;};
  },[state.user]);
  // Total points = delivered×10 + referral bonuses (single source of truth)
  const pts            = deliveredCount*10 + bonusPts;
  const nextTarget     = totalOrders<5?5:totalOrders<20?20:50;
  const progress       = Math.min((totalOrders/nextTarget)*100,100);
  const loyalty        = loyaltyLevel(totalOrders);

  function copy() { navigator.clipboard.writeText(refCode).then(()=>showToast('Code copy ho gaya! 📋')); }
  function share() {
    const txt=`RK Grocery Mart par order karo!\nMera referral code: ${refCode}\nSignup karte waqt code daalein — dono ko ₹30 cashback 🎉\n${window.location.origin}/signup.html?ref=${refCode}`;
    if (navigator.share) navigator.share({title:'RK Grocery Mart',text:txt});
    else window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`);
  }

  return (
    <>
      <div className="rounded-2xl p-5 mb-3.5 relative overflow-hidden" style={{background:'linear-gradient(135deg,#1E1B4B,#312E81,#4F46E5)', boxShadow:'0 8px 32px rgba(79,70,229,0.3)'}}>
        <div className="text-[11px] font-bold font-poppins uppercase tracking-wide mb-1" style={{color:'rgba(255,255,255,0.6)'}}>Your Points</div>
        <div className="text-4xl font-black font-poppins text-white" style={{letterSpacing:'-1px'}}>{pts}</div>
        <div className="text-xs font-semibold font-poppins mt-0.5" style={{color:'rgba(255,255,255,0.65)'}}>Total Reward Points</div>
        <div className="rounded-full h-[7px] mt-4" style={{background:'rgba(255,255,255,0.15)'}}>
          <div className="h-[7px] rounded-full transition-all duration-1000" style={{width:progress+'%', background:'linear-gradient(90deg,#FFB800,#FF6B35)'}}/>
        </div>
        <div className="flex justify-between text-[11px] font-poppins mt-1.5" style={{color:'rgba(255,255,255,0.6)'}}><span>{loyalty.label}</span><span>{totalOrders}/{nextTarget} orders</span></div>
        <div className="flex gap-2 mt-4 flex-wrap">
          {[[deliveredCount,'Delivered'],[fmt(savings),'Total Saved'],[pts,'Points']].map(([val,lbl])=>(
            <div key={lbl} className="flex-1 rounded-xl p-3 text-center" style={{minWidth:72, background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.15)'}}>
              <div className="text-sm font-black font-poppins text-white">{val}</div>
              <div className="text-[10px] font-poppins mt-0.5" style={{color:'rgba(255,255,255,0.65)'}}>{lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {redeemable!==null&&redeemable>0&&(
        <div className="rounded-2xl p-4 md:p-5 mb-3.5" style={{background:'linear-gradient(135deg,var(--tint-yellow-bg),var(--tint-yellow-border))', border:'1.5px solid var(--tint-yellow-border)'}}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-extrabold font-poppins" style={{color:'var(--tint-yellow-text)'}}>⭐ Redeemable Points</div>
              <div className="text-[11px] font-poppins mt-0.5" style={{color:'var(--tint-yellow-text)'}}>{redeemable} pts = <b>₹{Math.floor(redeemable/10)}</b> discount</div>
            </div>
            <div className="text-2xl font-black font-poppins" style={{color:'var(--tint-yellow-text)'}}>{redeemable}</div>
          </div>
          <div className="text-[11px] font-poppins mt-2.5" style={{color:'var(--tint-yellow-text)'}}>💡 Checkout par apply karo — 100 points = ₹10 OFF (coupon ke saath bhi chalega)</div>
        </div>
      )}

      <div className="rounded-2xl p-4 md:p-5 mb-3.5" style={{background:'linear-gradient(135deg,var(--tint-orange-bg),var(--tint-orange-border))', border:'1.5px solid var(--tint-orange-border)'}}>
        <div className="text-[13px] font-extrabold font-poppins" style={{color:'var(--tint-orange-text)'}}>🎁 Dost ko refer karo, dono ko ₹30 cashback!</div>
        <div className="rounded-xl px-3.5 py-2.5 flex items-center justify-between my-3" style={{background:'var(--card-bg)',border:'1.5px dashed var(--tint-orange-border)'}}>
          <span className="text-lg font-black font-poppins" style={{color:'var(--dark)', letterSpacing:'3px'}}>{refCode}</span>
          <button onClick={copy} className="text-white text-[11px] font-bold font-poppins rounded-md px-3 py-1.5 flex items-center gap-1" style={{background:'var(--orange)'}}><Copy size={12}/> Copy</button>
        </div>
        <div className="text-[11px] font-poppins mb-1" style={{color:'var(--tint-orange-text)'}}>
          {referredCount>0 ? `🎉 ${referredCount} dost refer kiye — pehla order confirm hote hi ₹30 milega` : 'Abhi tak koi dost refer nahi hua — link share karo!'}
        </div>
        <div className="text-[11px] font-poppins mb-2.5" style={{color:'var(--tint-orange-text)'}}>Dost signup karte waqt ye code daalein • dono ko pehla order confirm hone par ₹30 (300 pts)</div>
        <button onClick={share} className="w-full text-white rounded-xl py-3 font-extrabold font-poppins text-sm flex items-center justify-center gap-1.5" style={{background:'linear-gradient(135deg,#EA580C,#DC2626)'}}><Share2 size={15}/> WhatsApp Par Share Karo</button>
      </div>

      <Card title="Points Kaise Milenge?" icon="ℹ️">
        {[
          {i:'🛒',t:'Order Karo',  s:'Har delivered order = 10 points',        bg:'var(--tint-green-bg)'},
          {i:'👥',t:'Refer Karo',  s:'Dost ka pehla order confirm = ₹30 aapko + ₹30 dost ko',  bg:'var(--tint-blue-bg)'},
          {i:'⭐',t:'Redeem Karo', s:'100 points = ₹10 discount — checkout par apply karo', bg:'var(--tint-yellow-bg)'},
        ].map(r=>(
          <div key={r.t} className="flex gap-3 items-center py-2.5 last:border-b-0" style={{borderBottom:'1px solid var(--border)'}}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{background:r.bg}}>{r.i}</div>
            <div><div className="text-[13px] font-bold font-poppins" style={{color:'var(--dark)'}}>{r.t}</div><div className="text-[11px] font-poppins mt-0.5" style={{color:'var(--muted)'}}>{r.s}</div></div>
          </div>
        ))}
      </Card>
    </>
  );
}

/* ─── Change Password Modal (in-app, fix 2026-08-13) ──────────
   Pehle "Change Password" forgot-password.html par redirect karta tha
   (reset link wala flow) — ab logged-in user seedha yahin se password
   update kar sakta hai via supabase.auth.updateUser({password}). */
function ChangePasswordModal({ onClose, showToast }) {
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e?.preventDefault();
    setErr('');
    if (!cur)          { setErr('Current password daalein'); return; }
    if (pw.length < 6) { setErr('Naya password kam se kam 6 characters ka hona chahiye'); return; }
    if (pw !== pw2)    { setErr('Dono password match nahi kar rahe'); return; }
    setBusy(true);
    try {
      // Project me "current password required" setting ON hai — isliye
      // updateUser({ password, current_password }) dono bhejna zaroori hai
      // (nahi to server 'Current password required' error deta hai).
      const { error } = await supabase.auth.updateUser({ password: pw, current_password: cur });
      if (error) throw error;
      showToast('Password update ho gaya! ✅ Ab naya password use karein');
      onClose();
    } catch (e2) {
      const m = e2?.message || '';
      const code = e2?.code || '';
      if (code === 'current_password_mismatch' || m.includes('Current password')) {
        setErr('Current password galat hai — sahi password daalein');
      } else if (m.includes('recent login') || m.includes('session')) {
        setErr('Security ke liye dubara login karke try karein (session expiry). Forgot password link bhi use kar sakte hain.');
      } else {
        setErr(m || 'Password update nahi hua — dobara try karein');
      }
    } finally { setBusy(false); }
  }

  const inputStyle = { width:'100%', background:'var(--light)', border:'1.5px solid var(--border)', borderRadius:12, padding:'10px 12px', fontSize:13, fontFamily:'Poppins', color:'var(--dark)', outline:'none' };

  return (
    <div className="fixed inset-0 z-[95] flex items-end md:items-center justify-center" onClick={onClose}
      style={{ background:'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-sm p-5" style={{ background:'var(--card-bg)' }} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-extrabold font-poppins" style={{ color:'var(--dark)' }}>🔒 Change Password</div>
          <button onClick={onClose} aria-label="Band karein" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background:'var(--light)', color:'var(--gray)' }}><X size={16}/></button>
        </div>
        <form onSubmit={submit}>
          <div className="mb-3">
            <div className="text-[11px] font-bold font-poppins mb-1" style={{ color:'var(--muted)' }}>Current Password</div>
            <input type={showPw ? 'text' : 'password'} value={cur} onChange={e=>setCur(e.target.value)} placeholder="Abhi wala password" style={inputStyle} autoComplete="current-password"/>
          </div>
          <div className="mb-3">
            <div className="text-[11px] font-bold font-poppins mb-1" style={{ color:'var(--muted)' }}>Naya Password</div>
            <input type={showPw ? 'text' : 'password'} value={pw} onChange={e=>setPw(e.target.value)} placeholder="Kam se kam 6 characters" style={inputStyle} autoComplete="new-password"/>
          </div>
          <div className="mb-3">
            <div className="text-[11px] font-bold font-poppins mb-1" style={{ color:'var(--muted)' }}>Dobara Password</div>
            <input type={showPw ? 'text' : 'password'} value={pw2} onChange={e=>setPw2(e.target.value)} placeholder="Wahi password likhein" style={inputStyle} autoComplete="new-password"/>
          </div>
          <label className="flex items-center gap-2 mb-3 cursor-pointer" style={{ fontSize:12, color:'var(--muted)', fontFamily:'Poppins' }}>
            <input type="checkbox" checked={showPw} onChange={e=>setShowPw(e.target.checked)}/> Password dikhayein
          </label>
          {err && <div className="text-[11px] font-poppins mb-3" style={{ color:'#DC2626' }}>⚠️ {err}</div>}
          <button type="submit" disabled={busy} className="w-full text-white font-extrabold font-poppins rounded-xl py-3 text-sm"
            style={{ background:'linear-gradient(135deg,var(--primary),var(--primary-dark))', opacity: busy?0.6:1 }}>
            {busy ? 'Update ho raha hai…' : 'Password Update Karo'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── Settings Tab ────────────────────────── */
function SettingsTab({ switchTab, user, showToast }) {
  const [dark, setDark] = useState(document.documentElement.getAttribute('data-theme')==='dark');
  const [pwModal, setPwModal] = useState(false);
  // ── Web push notifications toggle (real, fix 2026-08-13) ──
  const [notifOn, setNotifOn] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);
  useEffect(()=>{
    if(!window.RKPush) return;
    (async()=>{
      try{
        if(typeof window.RKPush.isSupported==='function'&&!window.RKPush.isSupported()) return;
        const reg=await navigator.serviceWorker?.getRegistration();
        const sub=reg?await reg.pushManager.getSubscription():null;
        if(sub) setNotifOn(true);
      }catch(_){/* ignore */}
    })();
  },[]);
  async function toggleNotif(){
    if(!window.RKPush){showToast('Notifications setup nahi hua — page refresh karein');return;}
    if(!user){showToast('Login zaroori hai 🔐');return;}
    setNotifBusy(true);
    try{
      if(!notifOn){
        if(Notification&&Notification.permission==='denied'){showToast('Browser mein notification band hai — settings se allow karein 🔕');return;}
        await window.RKPush.save(user.id);
        setNotifOn(true);
        showToast('Notifications on! Offers aur order updates milenge 🔔');
      }else{
        await window.RKPush.unsave(user.id);
        setNotifOn(false);
        showToast('Notifications band kar diye 🔕');
      }
    }catch(err){
      showToast('Notification update nahi hua — '+(err?.message||'error'));
    }finally{
      setNotifBusy(false);
    }
  }

  function toggleTheme() {
    const t = dark?'light':'dark';
    document.documentElement.setAttribute('data-theme',t);
    try { localStorage.setItem('rk_theme',t); } catch(e){}
    const m=document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content',t==='dark'?'#0F1521':'#15803D');
    setDark(!dark);
  }

  async function logout() {
    if (!confirm('Logout karna chahte hain?')) return;
    await supabase.auth.signOut();
    window.location.href='index.html';
  }

  const rows = [
    {icon:'🔒',bg:'var(--tint-blue-bg)',label:'Change Password',   sub:'Password update karo',          fn:()=>setPwModal(true)},
    {icon:'🔔',bg:'var(--tint-orange-bg)',label:'Notifications',     sub:'Offers aur updates manage karo', fn:()=>switchTab('notifications')},
    {icon:'👤',bg:'var(--tint-green-bg)',label:'Edit Profile',      sub:'Name, phone update karo',        fn:()=>switchTab('profile')},
    {icon:'📍',bg:'var(--tint-purple-bg)',label:'Manage Addresses',  sub:'Delivery addresses',             fn:()=>switchTab('addresses')},
    {icon:'⭐',bg:'var(--tint-yellow-bg)',label:'Rewards & Referral',sub:'Points aur cashback',            fn:()=>switchTab('rewards')},
    {icon:'📦',bg:'var(--tint-green-bg)',label:'Order History',     sub:'Purane orders dekhein',          fn:()=>switchTab('orders')},
    {icon:'💬',bg:'var(--tint-green-bg)',label:'Help & Support',    sub:'Ananya AI — 24x7 assistant',      fn:()=>window.location.href='support.html'},
    {icon:'📱',bg:'var(--tint-neutral-bg)',label:'App Version',       sub:'v1.0.0 • RK Grocery Mart',        fn:null},
  ];

  return (
    <>
      <Card title="Settings" icon="⚙️" noBody>
        {rows.map(r=>(
          <div key={r.label} onClick={r.fn||undefined} className={`flex items-center justify-between px-4 md:px-5 py-3.5 last:border-b-0 ${r.fn?'cursor-pointer':''}`} style={{borderBottom:'1px solid var(--border)'}}>
            <div className="flex items-center gap-3">
              <div className="w-[38px] h-[38px] rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{background:r.bg}}>{r.icon}</div>
              <div><div className="text-[13px] font-bold font-poppins" style={{color:'var(--dark)'}}>{r.label}</div><div className="text-[11px] font-poppins mt-0.5" style={{color:'var(--muted)'}}>{r.sub}</div></div>
            </div>
            {r.fn&&<ChevronRight size={16} style={{color:'var(--muted)'}}/>}
          </div>
        ))}
      </Card>

      <Card title="Payment Methods" icon="💳" noBody>
        {[{icon:'💵',bg:'var(--tint-green-bg)',name:'Cash on Delivery',sub:'Ghar pe cash dena'},{icon:'📱',bg:'var(--tint-blue-bg)',name:'UPI / QR Code',sub:'QR scan karke pay karein'}].map(p=>(
          <div key={p.name} className="flex items-center gap-3 px-4 md:px-5 py-3.5 last:border-b-0" style={{borderBottom:'1px solid var(--border)'}}>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{background:p.bg}}>{p.icon}</div>
            <div className="flex-1"><div className="text-[13px] font-bold font-poppins" style={{color:'var(--dark)'}}>{p.name}</div><div className="text-[11px] font-poppins mt-0.5" style={{color:'var(--muted)'}}>{p.sub}</div></div>
            <span className="text-[10px] font-extrabold font-poppins px-2.5 py-1 rounded-full" style={{background:'var(--primary-light)', color:'var(--primary)'}}>Active</span>
          </div>
        ))}
      </Card>

      <Card title="Appearance" icon="🌗">
        <div className="flex items-center gap-2.5">
          <Toggle on={dark} onClick={toggleTheme}/>
          <span className="text-[13px] font-semibold font-poppins flex items-center gap-1.5" style={{color:'var(--text)'}}>{dark?<Moon size={14}/>:<Sun size={14}/>} Dark Mode</span>
        </div>
      </Card>

      <Card title="Notifications" icon="🔔">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold font-poppins" style={{color:'var(--text)'}}>Web Push Notifications</div>
            <div className="text-[11px] font-poppins mt-0.5" style={{color:'var(--muted)'}}>Offers, price-drop aur order updates — browser mein</div>
          </div>
          <Toggle on={notifOn} onClick={()=>!notifBusy&&toggleNotif()}/>
        </div>
      </Card>

      <Card>
        <button className="w-full font-extrabold font-poppins rounded-xl py-3 text-sm flex items-center justify-center gap-1.5" style={btnDangerStyle} onClick={logout}><LogOut size={15}/> Logout</button>
      </Card>

      <div className="text-center text-[11px] leading-relaxed pt-2.5 pb-5" style={{color:'var(--muted)'}}>
        🛒 RK Grocery Mart • Jaunpur<br/>
        📞 6393196765 • v1.0.0
      </div>

      {pwModal && <ChangePasswordModal onClose={()=>setPwModal(false)} showToast={showToast}/>}
    </>
  );
}

/* ─── Main AccountPage ────────────────────── */
export default function AccountPage() {
  const urlTab = new URLSearchParams(window.location.search).get('tab');
  const VALID  = TABS.map(t=>t.id);
  const [activeTab, setActiveTab] = useState(VALID.includes(urlTab)?urlTab:'overview');
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState('');
  const [state, setState]         = useState({
    user:null, profile:null,
    orders:[], addresses:[], wishlist:[], notifications:[], priceAlerts:[],
    cartCount:0,
  });

  function showToast(msg) {
    setToast(msg);
    setTimeout(()=>setToast(''),2600);
  }

  function switchTab(tab) {
    setActiveTab(tab);
    window.scrollTo({top:0,behavior:'smooth'});
  }

  useEffect(()=>{
    (async()=>{
      const {data:{session}}=await supabase.auth.getSession();
      // Fix (re-audit 2026-08-13): login ke baad wapas account par aaye — pehle
      // plain 'login.html' redirect hota tha aur user index.html par land hota tha.
      if (!session?.user) { window.location.href='login.html?next=account.html'; return; }
      const user = session.user;
      // FIX: account.html par App.jsx (RKCart.init caller) nahi chalta — isliye
      // RKCart guest mode me rehta tha aur wishlist→cart (Add / Add All) items
      // localStorage me jaate the, DB me nahi. Yahan user ko RKCart se bind
      // karte hain → guest cart merge + saare ops seedha user ke DB cart par.
      if (window.RKCart?.setUser) { window.RKCart.setUser({uid:user.id,email:user.email,name:user.user_metadata?.name}).catch(()=>{}); }

      const [profileR,ordersR,addrR,wishR,notifR,alertR] = await Promise.allSettled([        (async()=>{ // Fix: .single() 0-rows par HTTP 406 (PGRST116) aata tha. Ab maybeSingle
          // + insert fallback — purane users (bina trigger ke signup) ke liye bhi
          // profile row ban jaati hai, ghost profile nahi rehta.
          const { data } = await supabase.from('profiles').select('*').eq('id',user.id).maybeSingle();
          if (data) return data;
          const meta = user.user_metadata||{};
          const insert = { id:user.id, name:meta.name||user.email.split('@')[0], email:user.email, phone:meta.phone||'', avatar_url:null, created_at:user.created_at, updated_at:new Date().toISOString() };
          const { data: created } = await supabase.from('profiles').upsert(insert).select().maybeSingle();
          return created||insert;
        })(),
        (async()=>{ const {data}=await supabase.from('orders').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(25); return data||[]; })(),
        (async()=>{ if(window.RKProfile?.loadAddresses) return await window.RKProfile.loadAddresses(user.id); const {data}=await supabase.from('addresses').select('*').eq('user_id',user.id).order('is_default',{ascending:false}); return data||[]; })(),
        (async()=>{ const {data}=await supabase.from('wishlist').select('*').eq('user_id',user.id).order('created_at',{ascending:false}); return data||[]; })(),
        (async()=>{ const {data}=await supabase.from('notifications').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(30); return data||[]; })(),
        (async()=>{ const {data}=await supabase.from('price_alerts').select('product_id').eq('user_id',user.id); return (data||[]).map(d=>d.product_id); })(),
      ]);

      setState({
        user,
        profile:      profileR.status==='fulfilled'?profileR.value:{id:user.id,name:user.user_metadata?.name||user.email.split('@')[0],email:user.email},
        orders:       ordersR.status==='fulfilled'?ordersR.value:[],
        addresses:    addrR.status==='fulfilled'?addrR.value:[],
        wishlist:     wishR.status==='fulfilled'?wishR.value:[],
        notifications:notifR.status==='fulfilled'?notifR.value:[],
        priceAlerts:  alertR.status==='fulfilled'?alertR.value:[],
        cartCount:    window.RKCart?window.RKCart.getCount():0,
      });
      setLoading(false);
    })();
  },[]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center gap-3.5" style={{minHeight:'100vh', background:'var(--page-bg)'}}>
      <div className="w-12 h-12 rounded-full animate-spin" style={{border:'4px solid var(--primary-light)', borderTopColor:'var(--primary)'}}/>
      <div className="text-sm font-semibold font-poppins" style={{color:'var(--muted)'}}>Loading your account…</div>
    </div>
  );

  async function toggleAlert(productId) {
    if (!state.user) return;
    const has = state.priceAlerts.includes(productId);
    if (has) {
      const {error}=await supabase.from('price_alerts').delete().eq('user_id',state.user.id).eq('product_id',productId);
      if (!error) { setState(s=>({...s,priceAlerts:s.priceAlerts.filter(x=>x!==productId)})); showToast('Price alert band — hata diya 🔕'); }
      else showToast('Alert update nahi hua — dobara try karein');
    } else {
      const {error}=await supabase.from('price_alerts').insert({user_id:state.user.id,product_id:productId});
      if (!error) { setState(s=>({...s,priceAlerts:[...s.priceAlerts,productId]})); showToast('Price drop / back-in-stock par notify karenge 🔔'); }
      // 23505 = pehle se alert hai (double-tap race) — state sync karo, fail mat mano
      else if (error&&error.code==='23505') { setState(s=>({...s,priceAlerts:[...s.priceAlerts,productId]})); showToast('Price drop / back-in-stock par notify karenge 🔔'); }
      else showToast('Alert update nahi hua — dobara try karein');
    }
  }

  const tabProps = { state, setState, showToast, switchTab, priceAlerts:state.priceAlerts, toggleAlert };
  const p = state.profile;
  const totalOrders = state.orders.length;
  const savings = state.orders.reduce((s,o)=>s+(o.discount||0),0);
  const loyalty = loyaltyLevel(totalOrders);

  return (
    <div style={{background:'var(--page-bg)', minHeight:'100vh'}}>
      {/* Topnav */}
      <div className="sticky top-0 z-[200] flex items-center gap-2.5 px-4 h-[58px] backdrop-blur-md" style={{background:'var(--card-bg)', borderBottom:'1px solid var(--border)', opacity:0.98}}>
        <button onClick={()=>window.location.href='index.html'} aria-label="Back" className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:'var(--light)', border:'1.5px solid var(--border)', color:'var(--gray)'}}>
          <ChevronLeft size={18}/>
        </button>
        <span className="text-sm font-extrabold font-poppins flex-1" style={{color:'var(--dark)'}}>My Account</span>
        <a href="index.html" className="flex items-center gap-2 text-lg font-black font-poppins" style={{color:'var(--primary)'}}>
          <img src="/icons/rk-logo.svg" alt="RK Grocery Mart" style={{width:30,height:30,borderRadius:9}}/> RK Grocery Mart
        </a>
      </div>

      <div className="max-w-site mx-auto px-4 md:px-8 py-4 md:py-6 pb-28 md:pb-10">
        {/* Hero */}
        <div className="rounded-2xl p-5 md:p-6 relative overflow-hidden" style={{background:'linear-gradient(135deg,#064E3B 0%,#065F46 35%,#1BA672 80%,#34D399 100%)', boxShadow:'0 8px 32px rgba(6,78,59,0.35)'}}>
          <div className="absolute rounded-full pointer-events-none" style={{right:-50,top:-50,width:200,height:200,background:'rgba(255,255,255,0.06)'}}/>
          <div className="absolute rounded-full pointer-events-none" style={{right:40,bottom:-70,width:240,height:240,background:'rgba(255,255,255,0.04)'}}/>
          <div className="flex items-center gap-3.5 md:gap-4 relative z-[1]">
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center text-2xl md:text-3xl font-bold font-poppins overflow-hidden" style={{background:'rgba(255,255,255,0.2)', border:'3px solid rgba(255,255,255,0.5)', boxShadow:'0 4px 16px rgba(0,0,0,0.2)'}}>
                {p?.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover"/> : (p?.name?p.name[0].toUpperCase():'👤')}
              </div>
              <button onClick={()=>switchTab('profile')} aria-label="Change photo" className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center" style={{background:'var(--yellow)', border:'2px solid rgba(255,255,255,0.9)', boxShadow:'0 2px 6px rgba(0,0,0,0.15)'}}>
                <Camera size={12} className="text-white"/>
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold font-poppins uppercase tracking-wide" style={{color:'rgba(255,255,255,0.65)'}}>👋 Namaste,</div>
              <div className="text-xl md:text-2xl font-black font-poppins text-white truncate" style={{letterSpacing:'-.4px'}}>{p?.name||'User'}</div>
              <div className="text-xs font-poppins truncate mt-0.5" style={{color:'rgba(255,255,255,0.7)'}}>{p?.email||''}</div>
              <div className="inline-flex items-center gap-1 rounded-full px-3 py-1 mt-2" style={{background:'rgba(255,184,0,0.22)', border:'1.5px solid rgba(255,184,0,0.45)'}}>
                <span className="text-[11px] font-extrabold font-poppins" style={{color:'#FFD700'}}>{loyalty.label}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 md:gap-3 mt-5 relative z-[1]">
            {[[totalOrders,'Orders'],[fmt(savings),'Saved'],[memberSince(p?.created_at||state.user?.created_at),'Member Since']].map(([val,lbl])=>(
              <div key={lbl} className="rounded-xl p-2.5 md:p-3 text-center backdrop-blur-sm" style={{background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.15)'}}>
                <div className="text-sm md:text-base font-black font-poppins text-white" style={{letterSpacing:'-.5px'}}>{val}</div>
                <div className="text-[10px] font-poppins mt-0.5" style={{color:'rgba(255,255,255,0.65)'}}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-[220px_1fr] gap-5 md:gap-6 mt-5">
          {/* Desktop sidebar */}
          <aside className="hidden md:block">
            <nav className="rounded-2xl p-2 sticky top-24" style={{background:'var(--card-bg)', boxShadow:'0 2px 12px rgba(0,0,0,0.06)', border:'1px solid var(--border)'}}>
              {TABS.map(t=>{
                const Icon=t.icon; const active=activeTab===t.id;
                return (
                  <button key={t.id} onClick={()=>switchTab(t.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-poppins font-semibold transition-colors"
                    style={active?{background:'var(--primary-light)',color:'var(--primary)'}:{color:'var(--dark)'}}>
                    <Icon size={17}/> {t.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Mobile tab strip */}
          <nav className="md:hidden -mx-4 px-4 flex items-center gap-2 overflow-x-auto pb-1" style={{scrollbarWidth:'none'}}>
            {TABS.map(t=>{
              const Icon=t.icon; const active=activeTab===t.id;
              return (
                <button key={t.id} onClick={()=>switchTab(t.id)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-poppins font-bold whitespace-nowrap flex-shrink-0 transition-colors"
                  style={active?{background:'var(--primary)',color:'#fff'}:{background:'var(--card-bg)',color:'var(--dark)',border:'1px solid var(--border)'}}>
                  <Icon size={14}/> {t.label}
                </button>
              );
            })}
          </nav>

          <main className="min-w-0">
            {activeTab==='overview'      && <OverviewTab {...tabProps}/>}
            {activeTab==='orders'        && <OrdersTab {...tabProps}/>}
            {activeTab==='addresses'     && <AddressesTab {...tabProps}/>}
            {activeTab==='profile'       && <ProfileTab {...tabProps}/>}
            {activeTab==='wishlist'      && <WishlistTab {...tabProps}/>}
            {activeTab==='notifications' && <NotificationsTab {...tabProps}/>}
            {activeTab==='rewards'       && <RewardsTab {...tabProps}/>}
            {activeTab==='settings'      && <SettingsTab {...tabProps} user={state.user}/>}
          </main>
        </div>
      </div>

      {/* Mobile bottom nav — KEEPS the "bottom-nav" class (ananya-ai.js
          does querySelector('.bottom-nav') to position the chat widget). */}
      <nav className="bottom-nav flex" style={{background:'var(--card-bg)'}}>
        {/* Fix: index.html#shop / #cart ab App.jsx hash-routing se kaam karte hain (pehle dead links the) */}
        <a href="index.html" className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5" style={{color:'var(--gray)'}}><Home size={20} strokeWidth={1.8}/><span className="text-[10px] font-medium font-poppins">Home</span></a>
        <a href="index.html#shop" className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5" style={{color:'var(--gray)'}}><Package size={20} strokeWidth={1.8}/><span className="text-[10px] font-medium font-poppins">Shop</span></a>
        <a href="index.html#cart" className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5" style={{color:'var(--gray)'}}><ShoppingCart size={20} strokeWidth={1.8}/><span className="text-[10px] font-medium font-poppins">Cart</span></a>
        <a href="account.html" className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5" style={{color:'var(--primary)'}}><User size={20} strokeWidth={2.5}/><span className="text-[10px] font-bold font-poppins">Account</span></a>
      </nav>

      {/* Toast — KEEPS id="toastEl" (checkout-location.js / account-location-patch.js
          look up this exact id). */}
      <div id="toastEl" className="fixed left-1/2 z-[999] px-5 py-2.5 rounded-full text-sm font-semibold font-poppins text-white whitespace-nowrap max-w-[88vw] overflow-hidden text-ellipsis"
        style={{
          bottom:'calc(88px + env(safe-area-inset-bottom,0px))',
          transform:'translateX(-50%)',
          background:'#0F172A',
          boxShadow:'0 8px 32px rgba(0,0,0,0.25)',
          display:toast?'block':'none',
        }}>
        {toast}
      </div>
    </div>
  );
}
