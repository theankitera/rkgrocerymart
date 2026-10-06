import { useState, useEffect, useRef } from 'react';
import { UpiPayCard } from './UpiPayCard';
import { useShopSettings, useCouponValidator } from '../hooks/dataHooks';
import { supabase } from '../lib/supabaseClient';

/* ══════════════════════════════════════════════════════════
   CheckoutForm (Module 8: Tailwind restyle)
   ALL state, handlers, validation rules, and backend calls below are
   UNCHANGED from before — window.RKProfile / window.RKOrders /
   window.RKPayment / window.RKLocation / window.RKDelivery / window.RKCart
   are called exactly as they were. Only markup/classnames changed.

   Protected classnames/ids KEPT exactly as-is (see risk analysis):
     .co-card, .co-card-title, .addr-card, .addr-add-btn, .place-order-btn,
     #addr-line1, #addr-city, #addr-pin
   checkout-location-react.js's DOM-injection path is NOT loaded on this
   page (see index.html comment near the script tags — it was superseded
   by the GPS logic already built directly into this component below), but
   these classes/ids are kept anyway since they're cheap to keep and other
   code (or a future re-enable) may still expect them.
══════════════════════════════════════════════════════════ */
export function CheckoutForm({cart,total:cartTotal,showToast,onSuccess,user,onLocationResolved}){
  const [pay,setPay]=useState('');
  const [f,setF]=useState({name:user?.name||'',phone:''});
  const [addresses,setAddresses]=useState([]);
  const [loadingAddrs,setLoadingAddrs]=useState(true);
  const [selectedAddrId,setSelectedAddrId]=useState(null);
  const [showNewForm,setShowNewForm]=useState(false);
  const [newAddr,setNewAddr]=useState({label:'Home',line1:'',line2:'',city:'Jaunpur',pincode:'222001',is_default:false});
  const [savingAddr,setSavingAddr]=useState(false);
  const [phoneTouched,setPhoneTouched]=useState(false);
  const [placing,setPlacing]=useState(false);
  const [orderError,setOrderError]=useState('');
  const [orderInfo,setOrderInfo]=useState(null);
  const [showVerifyForm,setShowVerifyForm]=useState(false);
  const [utr,setUtr]=useState('');
  const [screenshotFile,setScreenshotFile]=useState(null);
  const [screenshotPreview,setScreenshotPreview]=useState(null);
  const [submittingVerify,setSubmittingVerify]=useState(false);
  const [pendingOrder,setPendingOrder]=useState(null);
  // ── Razorpay online payment (server-side order + signature verify) ──
  const [rzpBusy,setRzpBusy]=useState(false);
  // VITE_RAZORPAY_KEY_ID = public key id (browser-safe). Secret sirf server par.
  const RZP_KEY_ID=import.meta.env.VITE_RAZORPAY_KEY_ID||'';
  // Retry par duplicate order na bane — pehli baar create hua order reuse karo.
  // Cart/amount badalne par ref invalidate ho jaata hai taaki purana (galat)
  // pending order dobara use na ho.
  const rzpOrderRef=useRef(null);
  const rzpAmountRef=useRef(0);
  useEffect(()=>{rzpOrderRef.current=null;rzpAmountRef.current=0;},[cart]);
  // GPS / delivery-radius state — GPS stays OPTIONAL. If the user denies or
  // it fails, checkout still works with the manually-entered/saved address.
  // It only auto-triggers (asks for permission) once an address is on screen.
  const [locState,setLocState]=useState('idle'); // idle | loading | success | denied | error
  const [deliveryInfo,setDeliveryInfo]=useState(null);
  const total=cartTotal;
  const COUNTDOWN_SEC=600;
  const REMINDER_AFTER_SEC=120;
  const [remainingSec,setRemainingSec]=useState(COUNTDOWN_SEC);
  useEffect(()=>{
    if(!showVerifyForm)return;
    setRemainingSec(COUNTDOWN_SEC);
    const t=setInterval(()=>setRemainingSec(s=>{
      if(s<=1){
        clearInterval(t);
        setShowVerifyForm(false);
        setPendingOrder(null);
        // Polish fix: timer expiry now keeps the user on the checkout form (so they can
        // retry payment / pick COD instead) rather than bouncing them all the way home
        // and risking the impression their cart got cleared.
        showToast('⏰ Time khatam ho gaya — dobara try karein');
        return 0;
      }
      return s-1;
    }),1000);
    return()=>clearInterval(t);
  },[showVerifyForm]);
  const fmtTime=s=>{const m=Math.floor(s/60);const ss=String(s%60).padStart(2,'0');return`${m}:${ss}`;};
  const showWaitHint=remainingSec<=COUNTDOWN_SEC-REMINDER_AFTER_SEC;
  // BUG FIX (Critical #1): UPI ID ab admin ki Settings se live aati hai, hardcoded nahi.
  const {settings:shopSettings}=useShopSettings();
  const UPI_ID=shopSettings.upi_id;
  // BUG FIX (Critical #3): Coupon code input — pehle checkout mein ye field tha hi nahi,
  // isliye admin ke banaye coupons kabhi customer use nahi kar paata tha.
  const {validate:validateCoupon,checking:couponChecking}=useCouponValidator();
  const [couponCode,setCouponCode]=useState('');
  const [appliedCoupon,setAppliedCoupon]=useState(null); // {code,discount}
  const [couponError,setCouponError]=useState('');
  // ── Reward points redeem: 100 pts = ₹10 (server-side create_order RPC validate karta hai) ──
  const [rewardBalance,setRewardBalance]=useState(0);   // redeemable points (server-computed)
  const [rewardApplied,setRewardApplied]=useState(0);   // user ne kitne points apply kiye
  const couponDiscount=appliedCoupon?.discount||0;
  const rewardDiscount=Math.floor(rewardApplied/10);    // 100 pts = ₹10
  const discount=couponDiscount+rewardDiscount;
  // Is order par max kitne points use ho sakte hain (subtotal − coupon tak) —
  // server bhi yahi cap karta hai, taaki chhote order par saare points na burn hon.
  const maxRewardPts=Math.min(rewardBalance,Math.max(0,Math.floor((total-couponDiscount)*10)));
  useEffect(()=>{
    let active=true;
    (async()=>{
      if(!user){setRewardBalance(0);setRewardApplied(0);return;}
      const {data}=await supabase.rpc('get_redeemable_points',{p_user_id:user.uid});
      if(active) setRewardBalance(Number(data)||0);
    })();
    return()=>{active=false;};
  },[user]);
  const handleApplyCoupon=async()=>{
    setCouponError('');
    const result=await validateCoupon(couponCode,cartTotal);
    if(!result.valid){setCouponError(result.reason);setAppliedCoupon(null);return;}
    setAppliedCoupon({code:result.code,discount:result.discount});
    showToast(`✅ Coupon applied — ₹${result.discount} OFF`);
  };
  const handleRemoveCoupon=()=>{setAppliedCoupon(null);setCouponCode('');setCouponError('');};
  const deliveryCharge=(deliveryInfo&&deliveryInfo.available)?deliveryInfo.charge:0;
  const finalAmount=Math.max(0,total-discount+deliveryCharge);
  useEffect(()=>{
    let active=true;
    (async()=>{
      if(!user||!window.RKProfile){setShowNewForm(true);setLoadingAddrs(false);return;}
      try{
        const [addrs,profile]=await Promise.all([window.RKProfile.loadAddresses(user.uid),window.RKProfile.loadProfile(user.uid)]);
        if(!active)return;
        setAddresses(addrs||[]);
        const def=(addrs||[]).find(a=>a.is_default)||(addrs||[])[0];
        // Bug fix: explicitly close the new-address form when a saved address is found.
        // Previously only the "no address" branch touched showNewForm, so if it had
        // been set true on an earlier run, the form stayed open even after a saved
        // address loaded — showing both the address card and the empty form together.
        if(def){setSelectedAddrId(def.id);setShowNewForm(false);}else setShowNewForm(true);
        setF(prev=>({name:prev.name||profile?.name||'',phone:prev.phone||profile?.phone||''}));
      }catch(err){if(active)setShowNewForm(true);}
      finally{if(active)setLoadingAddrs(false);}
    })();
    return()=>{active=false;};
  },[user]);

  // ── GPS: optional, best-effort delivery-distance check ──────────────
  // Never blocks checkout. If denied/unsupported/failed, user proceeds
  // with their saved/manual address exactly as before.
  const handleUseLocation=async()=>{
    if(!window.RKLocation||!window.RKDelivery){return;}
    setLocState('loading');
    try{
      // BUG FIX: admin ke Settings page se delivery radius/charge load hone ka wait
      // karte hain taaki hamesha latest values use ho, hardcoded values nahi.
      if(window.RKDelivery.ready)await window.RKDelivery.ready;
      const pos=await window.RKLocation.getCurrentPosition(locState==='success');
      const info=window.RKDelivery.calculate(pos.lat,pos.lng);
      setDeliveryInfo({...info,lat:pos.lat,lng:pos.lng});
      setLocState('success');
      // Bubble the resolved distance up to the header (App level). This never
      // triggers GPS itself — it only reacts to checkout's own optional fetch.
      if(onLocationResolved)onLocationResolved(info.distanceKm);
    }catch(err){
      setLocState(err && err.code===1?'denied':'error');
      setDeliveryInfo(null);
    }
  };

  // Auto-trigger the GPS prompt as soon as an address is on screen (either a
  // saved address card, or the new-address form) — mirrors the same
  // auto-trigger pattern used on the Account → Addresses page. Fires once;
  // if the user denies, we don't ask again automatically.
  useEffect(()=>{
    if(loadingAddrs)return;
    if(!selectedAddrId&&!showNewForm)return;
    if(locState!=='idle')return;
    handleUseLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[loadingAddrs,selectedAddrId,showNewForm]);

  const isPhoneValid=/^[6-9]\d{9}$/.test(f.phone.trim());
  const selectedAddr=addresses.find(a=>a.id===selectedAddrId)||null;
  const saveNewAddress=async()=>{
    if(!newAddr.line1.trim()||!newAddr.line2.trim()||!newAddr.city.trim()||!/^\d{6}$/.test(newAddr.pincode.trim())){showToast('Address, landmark, city aur 6-digit pincode zaroori hai!');return;}
    if(!window.RKProfile||!user){showToast('Login zaroori hai!');return;}
    setSavingAddr(true);
    try{
      const saved=await window.RKProfile.saveAddress(user.uid,newAddr);
      if(saved){setAddresses(prev=>{const next=newAddr.is_default?prev.map(a=>({...a,is_default:false})):prev;return[...next,saved];});setSelectedAddrId(saved.id);setShowNewForm(false);setNewAddr({label:'Home',line1:'',line2:'',city:'Jaunpur',pincode:'222001',is_default:false});showToast('Address save ho gaya! 📍');}
      else showToast('Address save nahi hua.');
    }catch(err){showToast('Error! Dobara try karo.');}
    finally{setSavingAddr(false);}
  };
  const handleScreenshotChange=e=>{
    const file=e.target.files?.[0];
    if(!file)return;
    if(file.size>5*1024*1024){showToast('Screenshot 5MB se chhota hona chahiye');return;}
    setScreenshotFile(file);
    const r=new FileReader();r.onload=()=>setScreenshotPreview(r.result);r.readAsDataURL(file);
  };
  // Razorpay checkout script ko ek baar load karo (cache karke)
  const loadRazorpayScript=()=>new Promise((resolve,reject)=>{
    if(window.Razorpay){resolve();return;}
    const s=document.createElement('script');
    s.src='https://checkout.razorpay.com/v1/checkout.js';
    s.onload=()=>resolve();
    s.onerror=()=>reject(new Error('Razorpay script load nahi hua'));
    document.head.appendChild(s);
  });
  const handleRazorpayOrder=async(addressPayload,locationPayload)=>{
    setRzpBusy(true);
    setOrderError('');
    try{
      if(!RZP_KEY_ID){setOrderError('⚠️ Online payment abhi setup nahi hua — UPI QR ya COD chunein.');setRzpBusy(false);return;}
      // Guest/session expired hone par order record ke bina payment na ho (paisa waste)
      if(!user){setOrderError('⚠️ Online payment ke liye login zaroori hai. Pehle login karein.');setRzpBusy(false);return;}
      await loadRazorpayScript();
      // 1) Order DB mein save karo (payment_status 'pending') — SIRF pehli baar.
      //    Retry/dismiss par wahi order reuse hota hai, duplicate rows nahi banti.
      // Pehle se bana order sirf tabhi reuse karo jab amount bilkul same ho
      // (cart ya delivery charge badal gaya ho to naya order banao).
      const wantAmount=Math.round(finalAmount*100);
      let result=(rzpAmountRef.current===wantAmount)?rzpOrderRef.current:null;
      if(!result){
        result=await window.RKOrders.createOrder(user.uid,{cart,total,address:addressPayload,paymentMethod:'razorpay',promoCode:appliedCoupon?.code||null,discount,rewardsPoints:rewardApplied,...locationPayload});
        if(!result){setRzpBusy(false);setOrderError('⚠️ Order save nahi hua. Kripya dobara try karein.');return;}
        rzpOrderRef.current={orderId:result.orderId,orderNumber:result.orderNumber};
        rzpAmountRef.current=wantAmount;
      }
      const {orderId,orderNumber}=result;
      // 2) Server se Razorpay order banao (secret server par hai)
      const r=await fetch('/api/razorpay-order',{
        method:'POST',headers:{'Content-Type':'application/json'},
        // orderId server ko bhi bhejo — server DB se total verify karta hai
        // (security: client cart/amount tamper hone par order reject hota hai)
        body:JSON.stringify({amount:Math.round(finalAmount*100),receipt:orderNumber,orderId,notes:{orderNumber,orderId:orderId||''}}),
      });
      const o=await r.json().catch(()=>({}));
      if(!r.ok||!o.orderId){setRzpBusy(false);setOrderError('⚠️ Online payment shuru nahi hua — thodi der baad try karein ya UPI/COD chunein.');return;}
      // 3) Razorpay checkout kholo
      const rzp=new window.Razorpay({
        key:o.keyId||RZP_KEY_ID,
        amount:o.amount,
        currency:o.currency||'INR',
        name:'RK Grocery Mart',
        description:`Order ${orderNumber}`,
        order_id:o.orderId,
        handler:async(resp)=>{
          // 4) Signature server par verify karo — sirf tabhi order PAID hoga
          const v=await fetch('/api/razorpay-verify',{
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              orderId,orderNumber,
              razorpay_order_id:resp.razorpay_order_id,
              razorpay_payment_id:resp.razorpay_payment_id,
              razorpay_signature:resp.razorpay_signature,
              amount:finalAmount,
              userId:user?.uid||null,
              customer_name:f.name.trim(),
              mobile:f.phone.trim(),
            }),
          });
          const vr=await v.json().catch(()=>({}));
          if(vr.verified){rzpOrderRef.current=null;rzpAmountRef.current=0;if(window.RKCart)window.RKCart.clearCart();setRzpBusy(false);onSuccess(orderNumber,'razorpay');}
          else{setRzpBusy(false);setOrderError('⚠️ Payment verify nahi hua — order pending hai, admin se confirm karwayein.');}
        },
        modal:{ondismiss:()=>{setRzpBusy(false);showToast('Payment window band hua — order pending hai, dobara try kar sakte hain');}},
        theme:{color:'#15803D'},
        prefill:{name:f.name.trim(),contact:f.phone.trim(),email:user?.email||''},
      });
      rzp.on('payment.failed',(resp)=>{setRzpBusy(false);setOrderError('⚠️ Payment fail hui — kripya dobara try karein.');});
      rzp.open();
    }catch(err){
      console.error('[CheckoutForm] razorpay:',err?.message||err);
      setRzpBusy(false);
      setOrderError('⚠️ Online payment mein error — UPI QR ya COD chunein.');
    }
  };
  const handlePlaceOrder=async()=>{
    setPhoneTouched(true);
    setOrderError('');
    if(!f.name.trim()){showToast('Naam zaroori hai!');return;}
    if(!isPhoneValid){showToast('Sahi 10-digit mobile number daalein!');return;}
    if(!pay){showToast('Payment method chunein!');return;}
    if(!selectedAddr){showToast('Delivery address chunein ya add karein!');return;}
    const addressPayload={name:f.name.trim(),phone:f.phone.trim(),line1:selectedAddr.line1,line2:selectedAddr.line2||'',city:selectedAddr.city||'Jaunpur',pincode:selectedAddr.pincode||''};
    // GPS is optional and never blocks checkout. If it resolved and the
    // location looks out of the normal delivery range, we don't stop the
    // order — we just flag it so the admin can verify and accept/reject.
    let locationPayload={};
    if(deliveryInfo){
      const validation=window.RKDelivery.validate(deliveryInfo.lat,deliveryInfo.lng);
      locationPayload={
        latitude:deliveryInfo.lat,longitude:deliveryInfo.lng,distance_km:deliveryInfo.distanceKm,
        // delivery_charge bhi store karo — server-side total verify (razorpay-order)
        // isi order row se delivery fee add karta hai, warna fee wale orders reject ho jaate
        delivery_charge:deliveryInfo.charge||0,
        delivery_status:deliveryInfo.tier.id,admin_review_needed:!validation.valid,
      };
      if(!validation.valid){
        showToast('📍 Out of service area — your order is confirmed after admin verification.',4500);
      }
    }
    if(pay==='razorpay'){
      return handleRazorpayOrder(addressPayload,locationPayload);
    }
    if(pay==='cod'){
      setPlacing(true);
      try{
        let result=null;
        if(window.RKOrders&&user)result=await window.RKOrders.createOrder(user.uid,{cart,total,address:addressPayload,paymentMethod:pay,promoCode:appliedCoupon?.code||null,discount,rewardsPoints:rewardApplied,...locationPayload});
        // Frontend-only fix: previously a failed/null createOrder() still showed the
        // success screen with a randomly-generated fake order number. Now we only
        // show success if the order actually saved (or if no backend hook exists at all,
        // which preserves old behaviour for environments without window.RKOrders).
        if(window.RKOrders&&user&&!result){
          setPlacing(false);
          setOrderError('⚠️ Order save nahi hua. Kripya dobara try karein ya thodi der baad try karein.');
          showToast('Order place nahi ho saka, dobara try karein');
          return;
        }
        const orderNumber=result?.orderNumber||('RK'+Math.floor(1000+Math.random()*9000));
        setPlacing(false);
        if(window.RKCart)window.RKCart.clearCart();
        onSuccess(orderNumber,'cod');
      }catch(err){
        setPlacing(false);
        setOrderError('⚠️ Kuch galat ho gaya. Kripya dobara try karein.');
        showToast('Order place nahi ho saka');
      }
      return;
    }
    // Bug fix #3: don't fabricate/display a fake order number before any order actually
    // exists. The QR/verification screen now shows "Pending" until createOrder() succeeds
    // inside handleSubmitVerification, avoiding the confusing temp-number swap.
    setPendingOrder({address:addressPayload,paymentMethod:pay,locationPayload});
    setOrderInfo({orderId:null,orderNumber:null});
    setShowVerifyForm(true);
  };
  const handleSubmitVerification=async()=>{
    const utrClean=utr.trim();
    if(!/^\d{12}$/.test(utrClean)){showToast('Sahi 12-digit UTR / Transaction ID daalein');return;}
    if(!screenshotFile){showToast('Payment screenshot upload karein');return;}
    if(!window.RKPayment){showToast('Verification system load nahi hua');return;}
    if(!pendingOrder){showToast('Order data missing');return;}
    setSubmittingVerify(true);
    let result=null;
    if(window.RKOrders&&user)result=await window.RKOrders.createOrder(user.uid,{cart,total,address:pendingOrder.address,paymentMethod:pendingOrder.paymentMethod,promoCode:appliedCoupon?.code||null,discount,rewardsPoints:rewardApplied,...(pendingOrder.locationPayload||{})});
    if(!result){setSubmittingVerify(false);showToast('Order create nahi hua');return;}
    const realOrderId=result.orderId;
    const realOrderNumber=result.orderNumber||('RK'+Math.floor(1000+Math.random()*9000));
    const screenshotUrl=await window.RKPayment.uploadScreenshot(screenshotFile,realOrderNumber);
    if(!screenshotUrl){setSubmittingVerify(false);showToast('Screenshot upload fail hua');return;}
    const saved=await window.RKPayment.submitVerification(user?.uid,{orderId:realOrderId,orderNumber:realOrderNumber,customerName:f.name.trim(),mobile:f.phone.trim(),utr:utrClean,screenshotUrl,amount:finalAmount});
    setSubmittingVerify(false);
    if(saved){if(window.RKCart)window.RKCart.clearCart();onSuccess(realOrderNumber,'upi');}
    else showToast('Verification submit nahi hua');
  };

  // Shared Tailwind field styles (kept purely presentational — no ids/classes
  // that any external script depends on are touched here).
  const cardCls="rounded-2xl p-4 mb-3.5";
  const cardStyle={background:'var(--card-bg)',boxShadow:'0 2px 10px rgba(0,0,0,0.05)'};
  const inputCls="w-full mt-1 mb-3 px-3.5 py-2.5 rounded-xl text-sm font-poppins outline-none";
  const inputStyle={background:'var(--light)',border:'1.5px solid var(--border)',color:'var(--dark)'};
  const labelCls="text-xs font-semibold font-poppins block";

  if(showVerifyForm){
    return(
      <div className="fixed inset-0 z-[90] flex flex-col" style={{background:'var(--page-bg)'}}>
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{borderBottom:'1px solid var(--border)',background:'var(--card-bg)'}}>
          <button aria-label="Band karein" onClick={()=>{setShowVerifyForm(false);setPendingOrder(null);}}
            className="w-8 h-8 rounded-full flex items-center justify-center" style={{color:'var(--gray)'}}>✕</button>
          <div className="font-extrabold font-poppins text-sm" style={{color:'var(--dark)'}}>Payment Karein</div>
          <div className={`font-poppins font-bold text-xs px-2.5 py-1 rounded-lg ${remainingSec<=60?'animate-pulse':''}`}
            style={{background:remainingSec<=60?'var(--tint-red-bg)':'var(--primary-light)',color:remainingSec<=60?'var(--tint-red-text)':'var(--primary-dark)'}}>⏱ {fmtTime(remainingSec)}</div>
        </div>
        {/* FIX (2026-08): scroll container ke saare children par `shrink-0` — pehle
            flexbox inhe chhote viewports par compress kar deta tha (UpiPayCard ka
            overflow-hidden uski min-height 0 kar deta hai, isliye wo sabse pehle
            shrink hota tha) → QR card clip hota tha aur content 'squeeze' hone se
            scrollHeight==clientHeight reh jata tha → screen 'frozen' lagti thi, scroll
            karna impossible. Ab content kabhi compress nahi hota — chhote screens par
            container proper scroll karta hai. + overscroll-contain (mobile par scroll
            chaining se page 'fixed' feel na ho) + -webkit-overflow-scrolling:touch. */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-5 flex flex-col items-center" style={{WebkitOverflowScrolling:'touch', paddingBottom:'calc(8rem + env(safe-area-inset-bottom, 0px))'}}>
          <div className="shrink-0 text-xs font-poppins font-semibold text-center" style={{color:'var(--gray)'}}>
            {orderInfo?.orderNumber?`Order #${orderInfo.orderNumber}`:'Order pending — verification ke baad confirm hoga'}
          </div>
          <div className="shrink-0 text-3xl font-extrabold font-poppins mt-1 mb-4" style={{color:'var(--dark)'}}>₹{finalAmount}</div>
          <div className="shrink-0 w-full flex justify-center"><UpiPayCard total={finalAmount} upiId={UPI_ID}/></div>
          {showWaitHint&&(
            <div className="shrink-0 flex items-center gap-2 rounded-xl px-3 py-2.5 mt-4 text-xs font-poppins font-semibold w-full max-w-sm" style={{background:'var(--tint-yellow-bg)',border:'1px solid var(--tint-yellow-border)',color:'var(--tint-yellow-text)'}}>
              <span>⏰</span><span>QR dobara scan karein ya UPI ID <b>{UPI_ID}</b> par manually pay karein</span>
            </div>
          )}
          <div className={`shrink-0 ${cardCls} w-full max-w-sm mt-3.5`} style={cardStyle}>
            <div className="font-extrabold font-poppins text-sm mb-2" style={{color:'var(--dark)'}}>🧾 Payment Verification</div>
            <label className={labelCls} htmlFor="utr-input" style={{color:'var(--gray)'}}>UTR / Transaction ID</label>
            <input id="utr-input" className={inputCls} style={inputStyle} placeholder="UTR / Transaction ID *" value={utr} onChange={e=>setUtr(e.target.value.replace(/\s/g,''))}/>
            <div className="text-[11px] font-poppins -mt-2 mb-3" style={{color:'var(--gray)'}}>UTR aapke UPI app ke payment history mein milega (12 digit number)</div>
            <label className="block rounded-xl p-4 text-center cursor-pointer" style={{border:`1.5px dashed var(--border)`,background:screenshotFile?'var(--primary-light)':'var(--light)'}}>
              <input type="file" accept="image/*" onChange={handleScreenshotChange} aria-label="Payment screenshot upload karein" className="hidden"/>
              {!screenshotPreview
                ?<>
                  <div className="text-3xl">📷</div>
                  <div className="font-bold font-poppins text-sm mt-1.5" style={{color:'var(--dark)'}}>Payment Screenshot Upload Karein</div>
                  <div className="text-[11px] font-poppins mt-0.5" style={{color:'var(--gray)'}}>JPG/PNG • Max 5MB</div>
                </>
                :<img className="max-h-40 rounded-lg mx-auto" src={screenshotPreview} alt="Screenshot preview"/>
              }
            </label>
          </div>
          <button className="shrink-0 place-order-btn w-full max-w-sm mt-3.5 text-white font-extrabold font-poppins rounded-2xl py-3.5 text-sm"
            style={{background:'linear-gradient(135deg, var(--primary), var(--primary-dark))'}}
            disabled={submittingVerify} onClick={handleSubmitVerification}>
            {submittingVerify?'⏳ Submitting...':'✅ Verification Submit Karein'}
          </button>
        </div>
      </div>
    );
  }

  return(
    <>
      <div className={`co-card ${cardCls}`} style={cardStyle}>
        <div className="co-card-title font-extrabold font-poppins text-sm mb-2.5" style={{color:'var(--dark)'}}>📋 Order Summary</div>
        {cart.slice(0,4).map(i=>(
          <div key={i.id} className="osi flex justify-between items-center gap-2 text-xs font-poppins py-1" style={{color:'var(--dark)'}}>
            <span className="flex items-center gap-2 min-w-0">
              {i.image
                ?<img src={i.image} alt={i.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" style={{background:'var(--light)'}}/>
                :<div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{background:'var(--light)'}}>🛒</div>}
              <span className="truncate">{i.name} ×{i.qty}</span>
            </span>
            <span className="flex-shrink-0"><b>₹{(i.price*i.qty).toFixed(0)}</b></span>
          </div>
        ))}
        {cart.length>4&&<div className="text-[11px] font-poppins" style={{color:'var(--gray)'}}>+{cart.length-4} more items</div>}
        {/* BUG FIX (Critical #3): coupon code input — admin ke banaye coupons ab yahan se apply ho sakte hain */}
        <div className="mt-2.5 pt-2 " style={{borderTop:'1px dashed var(--border)'}}>
          {!appliedCoupon?(
            <div className="flex gap-2">
              <input className="flex-1 px-3 py-2 rounded-xl text-xs font-poppins outline-none" style={inputStyle} placeholder="Coupon code (e.g. WELCOME50)" value={couponCode} onChange={e=>{setCouponCode(e.target.value.toUpperCase());setCouponError('');}}/>
              <button type="button" className="addr-add-btn px-3.5 rounded-xl text-xs font-bold font-poppins" style={{background:'var(--primary-light)',color:'var(--primary-dark)'}} disabled={couponChecking||!couponCode.trim()} onClick={handleApplyCoupon}>{couponChecking?'...':'Apply'}</button>
            </div>
          ):(
            <div className="flex justify-between items-center rounded-xl px-3 py-2 text-xs font-poppins" style={{background:'var(--light)'}}>
              <span>🎟️ <b>{appliedCoupon.code}</b> applied — ₹{appliedCoupon.discount} OFF</span>
              <button type="button" onClick={handleRemoveCoupon} style={{background:'none',border:'none',color:'var(--gray)',cursor:'pointer'}}>✕</button>
            </div>
          )}
          {couponError&&<div className="text-[11px] font-poppins font-semibold mt-1" style={{color:'var(--red)'}}>⚠️ {couponError}</div>}
        </div>
        {/* Reward points redeem — 100 pts = ₹10 (server-side validated) */}
        {user&&maxRewardPts>=100&&(
          <div className="mt-2 pt-2" style={{borderTop:'1px dashed var(--border)'}}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold font-poppins uppercase tracking-wide" style={{color:'var(--gray)'}}>⭐ Reward Points</span>
              <span className="text-[11px] font-poppins font-bold" style={{color:'var(--tint-yellow-text)'}}>{maxRewardPts} pts = ₹{Math.floor(maxRewardPts/10)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={rewardApplied<=0} onClick={()=>setRewardApplied(a=>Math.max(0,a-100))} aria-label="Points kam karo"
                className="w-9 h-9 rounded-lg font-black text-base disabled:opacity-30" style={{background:'var(--light)',color:'var(--primary-dark)',border:'1.5px solid var(--border)'}}>−</button>
              <div className="flex-1 text-center text-xs font-extrabold font-poppins rounded-lg py-2" style={{background:'var(--light)',color:'var(--dark)'}}>
                {rewardApplied>0?`${rewardApplied} pts (−₹${rewardDiscount})`:'Apply points karo'}
              </div>
              <button type="button" disabled={rewardApplied+100>maxRewardPts} onClick={()=>setRewardApplied(a=>Math.min(maxRewardPts,a+100))} aria-label="Points badhao"
                className="w-9 h-9 rounded-lg font-black text-base disabled:opacity-30" style={{background:'var(--light)',color:'var(--primary-dark)',border:'1.5px solid var(--border)'}}>+</button>
              <button type="button" onClick={()=>setRewardApplied(rewardApplied>0?0:Math.floor(maxRewardPts/100)*100)}
                className="px-3 py-2 rounded-lg text-[11px] font-bold font-poppins" style={{background:'var(--tint-yellow-bg)',color:'var(--tint-yellow-text)',border:'1px solid var(--tint-yellow-border)'}}>
                {rewardApplied>0?'Clear':'Apply All'}
              </button>
            </div>
            <div className="text-[10px] font-poppins mt-1" style={{color:'var(--muted)'}}>100 points = ₹10 discount • Is order par max {maxRewardPts} pts use ho sakte hain</div>
          </div>
        )}
        <div className="mt-2 text-xs font-poppins" style={{color:'var(--gray)'}}>
          <div className="flex justify-between"><span>Subtotal</span><span>₹{total.toFixed(0)}</span></div>
          {couponDiscount>0&&<div className="flex justify-between" style={{color:'var(--primary)'}}><span>Coupon Discount</span><span>−₹{couponDiscount.toFixed(0)}</span></div>}
          {rewardDiscount>0&&<div className="flex justify-between" style={{color:'var(--tint-yellow-text)'}}><span>⭐ Reward Discount</span><span>−₹{rewardDiscount.toFixed(0)}</span></div>}
          {deliveryCharge>0&&<div className="flex justify-between"><span>Delivery Charge</span><span>₹{deliveryCharge.toFixed(0)}</span></div>}
        </div>
        <div className="flex justify-between font-extrabold font-poppins text-sm mt-2 pt-2" style={{borderTop:'1px solid var(--border)'}}>
          <span>Total</span><span style={{color:'var(--primary)'}}>₹{finalAmount.toFixed(0)}</span>
        </div>
      </div>

      <div className={`co-card ${cardCls}`} style={cardStyle}>
        <div className="co-card-title font-extrabold font-poppins text-sm mb-2.5" style={{color:'var(--dark)'}}>🙋 Contact Details</div>
        <label className={labelCls} htmlFor="co-name" style={{color:'var(--gray)'}}>Aapka naam</label>
        <input id="co-name" className={inputCls} style={inputStyle} placeholder="Aapka naam *" value={f.name} onChange={e=>setF({...f,name:e.target.value})}/>
        <label className={labelCls} htmlFor="co-phone" style={{color:'var(--gray)'}}>Mobile number</label>
        <input id="co-phone" className={inputCls} style={inputStyle} type="tel" inputMode="numeric" maxLength="10" placeholder="10-digit mobile number *" value={f.phone} onChange={e=>setF({...f,phone:e.target.value.replace(/\D/g,'').slice(0,10)})} onBlur={()=>setPhoneTouched(true)}/>
        {phoneTouched&&!isPhoneValid&&<div className="text-[11px] font-poppins font-semibold -mt-2" style={{color:'var(--red)'}}>⚠️ Sahi 10-digit mobile number daalein (jaise 9876543210)</div>}
      </div>

      <div className={`co-card ${cardCls}`} style={cardStyle}>
        <div className="co-card-title font-extrabold font-poppins text-sm mb-2.5" style={{color:'var(--dark)'}}>📍 Delivery Address</div>
        {(selectedAddrId||showNewForm)&&(
          <div className="mb-2.5">
            <button type="button" disabled={locState==='loading'} onClick={handleUseLocation}
              className="w-full text-left rounded-xl px-3.5 py-2.5 text-xs font-bold font-poppins"
              style={{background:'var(--primary-light)',color:'var(--primary-dark)'}}>
              {locState==='loading'?'⏳ Location detect ho rahi hai…'
                :locState==='success'?'✅ Location Detected — Tap to refresh'
                :locState==='denied'?'🔓 Retry Location Access'
                :locState==='error'?'⚠️ Retry Location'
                :'📍 Use Current Location'}
            </button>
            {deliveryInfo&&(
              <div className="rounded-xl p-3 mt-2" style={{background:'var(--light)',border:'1px solid var(--border)'}}>
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{deliveryInfo.emoji}</span>
                  <div className="min-w-0">
                    <div className="font-bold font-poppins text-xs" style={{color:'var(--dark)'}}>{deliveryInfo.label}</div>
                    {deliveryInfo.available
                      ?<div className="text-[11px] font-poppins" style={{color:'var(--gray)'}}>Delivery charge: {deliveryInfo.charge===0?<span style={{color:'var(--primary)',fontWeight:700}}>FREE</span>:<span style={{fontWeight:700}}>₹{deliveryInfo.charge}</span>}</div>
                      :<div className="text-[11px] font-poppins font-semibold" style={{color:'var(--red)'}}>Hum is location par deliver nahi karte.</div>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2.5">
                  <div>
                    <div className="text-[10px] font-poppins" style={{color:'var(--gray)'}}>📍 Distance</div>
                    <div className="text-xs font-bold font-poppins" style={{color:'var(--dark)'}}>{deliveryInfo.distanceKm<1?Math.round(deliveryInfo.distanceKm*1000)+' m':deliveryInfo.distanceKm.toFixed(1)+' km'}</div>
                  </div>
                  {deliveryInfo.available&&<>
                    <div>
                      <div className="text-[10px] font-poppins" style={{color:'var(--gray)'}}>💰 Delivery</div>
                      <div className="text-xs font-bold font-poppins" style={{color:'var(--dark)'}}>{deliveryInfo.charge===0?'FREE':'₹'+deliveryInfo.charge}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-poppins" style={{color:'var(--gray)'}}>⏱️ ETA</div>
                      <div className="text-xs font-bold font-poppins" style={{color:'var(--dark)'}}>{deliveryInfo.eta}</div>
                    </div>
                  </>}
                </div>
                {!deliveryInfo.available&&(
                  <div className="text-[11px] font-poppins font-semibold mt-2" style={{color:'var(--red)'}}>
                    ❌ Sorry, aapka location hamari 8 km delivery range se bahar hai.
                    <br/>Abhi hum sirf Jaunpur aur aas-paas ke areas mein deliver karte hain.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {loadingAddrs?<div className="text-xs font-poppins py-2" style={{color:'var(--gray)'}}>Addresses load ho rahe hain…</div>
          :<>
            {addresses.map(a=>(
              <div key={a.id} onClick={()=>{setSelectedAddrId(a.id);setShowNewForm(false);}}
                className="addr-card rounded-xl p-3 mb-2 cursor-pointer"
                style={{border:`1.5px solid ${selectedAddrId===a.id?'var(--primary)':'var(--border)'}`,background:selectedAddrId===a.id?'var(--primary-light)':'transparent'}}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold font-poppins" style={{color:'var(--dark)'}}>{a.label}</span>
                  {a.is_default&&<span className="text-[9px] font-extrabold font-poppins px-1.5 py-0.5 rounded" style={{background:'var(--primary)',color:'#fff'}}>DEFAULT</span>}
                </div>
                <div className="text-xs font-poppins mt-0.5" style={{color:'var(--gray)'}}>{a.line1}{a.line2?', '+a.line2:''}<br/>{a.city}{a.pincode?' - '+a.pincode:''}</div>
              </div>
            ))}
            {!showNewForm&&<button className="addr-add-btn w-full text-center rounded-xl py-2.5 text-xs font-bold font-poppins" style={{border:'1.5px dashed var(--border)',color:'var(--primary)'}} onClick={()=>setShowNewForm(true)}>+ Naya Address Add Karo</button>}
          </>
        }
        {showNewForm&&(
          <div className="rounded-xl p-3 mt-1.5" style={{border:'1.5px dashed var(--border)'}}>
            <label className={labelCls} htmlFor="addr-label" style={{color:'var(--gray)'}}>Label</label>
            <input id="addr-label" className={inputCls} style={inputStyle} placeholder="Label (Home/Office)" value={newAddr.label} onChange={e=>setNewAddr({...newAddr,label:e.target.value})}/>
            <label className={labelCls} htmlFor="addr-line1" style={{color:'var(--gray)'}}>Pura pata *</label>
            <input id="addr-line1" className={inputCls} style={inputStyle} placeholder="Ghar ka pura pata, gali, makaan no. *" value={newAddr.line1} onChange={e=>setNewAddr({...newAddr,line1:e.target.value})} required/>
            <label className={labelCls} htmlFor="addr-line2" style={{color:'var(--gray)'}}>Landmark *</label>
            <input id="addr-line2" className={inputCls} style={inputStyle} placeholder="Mohalla / Landmark *" value={newAddr.line2} onChange={e=>setNewAddr({...newAddr,line2:e.target.value})} required/>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={labelCls} htmlFor="addr-city" style={{color:'var(--gray)'}}>City *</label>
                <input id="addr-city" className={inputCls} style={inputStyle} placeholder="City *" value={newAddr.city} onChange={e=>setNewAddr({...newAddr,city:e.target.value})} required/>
              </div>
              <div>
                <label className={labelCls} htmlFor="addr-pin" style={{color:'var(--gray)'}}>Pincode *</label>
                <input id="addr-pin" className={inputCls} style={inputStyle} placeholder="222001 *" value={newAddr.pincode} onChange={e=>setNewAddr({...newAddr,pincode:e.target.value.replace(/\D/g,'').slice(0,6)})} required/>
              </div>
            </div>
            <button className="addr-add-btn w-full rounded-xl py-2.5 text-xs font-bold font-poppins text-white" disabled={savingAddr} onClick={saveNewAddress} style={{background:'var(--primary)'}}>{savingAddr?'Saving…':'💾 Address Save Karke Use Karo'}</button>
            {addresses.length>0&&<button className="addr-add-btn w-full rounded-xl py-2.5 text-xs font-bold font-poppins mt-1.5" style={{color:'var(--gray)'}} onClick={()=>setShowNewForm(false)}>Cancel</button>}
          </div>
        )}
        {/* Polish fix: removed target="_blank" — opening a new tab for a simple address-manage
            link felt jarring on mobile. It now navigates in the same tab/flow. */}
        <a href="account.html?tab=addresses" rel="noopener" className="block text-center text-xs font-bold font-poppins mt-2.5" style={{color:'var(--primary)'}}>✏️ Saare Addresses Manage Karo →</a>
      </div>

      <div className={`co-card ${cardCls}`} style={cardStyle}>
        <div className="co-card-title font-extrabold font-poppins text-sm mb-2.5" style={{color:'var(--dark)'}}>💳 Payment Method</div>
        <div className="grid grid-cols-3 gap-2.5">
          <div onClick={()=>setPay('razorpay')} className="rounded-xl p-3 text-center cursor-pointer"
            style={{border:`1.5px solid ${pay==='razorpay'?'var(--primary)':'var(--border)'}`,background:pay==='razorpay'?'var(--primary-light)':'transparent'}}>
            <div className="text-2xl">💳</div>
            <div className="text-xs font-bold font-poppins mt-1" style={{color:'var(--dark)'}}>Online Payment</div>
            <div className="text-[10px] font-poppins" style={{color:'var(--gray)'}}>Card / UPI / NetBanking</div>
          </div>
          <div onClick={()=>setPay('upi')} className="rounded-xl p-3 text-center cursor-pointer"
            style={{border:`1.5px solid ${pay==='upi'?'var(--primary)':'var(--border)'}`,background:pay==='upi'?'var(--primary-light)':'transparent'}}>
            <div className="text-2xl">📱</div>
            <div className="text-xs font-bold font-poppins mt-1" style={{color:'var(--dark)'}}>UPI / QR Code</div>
            <div className="text-[10px] font-poppins" style={{color:'var(--gray)'}}>Scan karke pay karo</div>
          </div>
          <div onClick={()=>setPay('cod')} className="rounded-xl p-3 text-center cursor-pointer"
            style={{border:`1.5px solid ${pay==='cod'?'var(--primary)':'var(--border)'}`,background:pay==='cod'?'var(--primary-light)':'transparent'}}>
            <div className="text-2xl">💵</div>
            <div className="text-xs font-bold font-poppins mt-1" style={{color:'var(--dark)'}}>Cash on Delivery</div>
            <div className="text-[10px] font-poppins" style={{color:'var(--gray)'}}>Ghar pe cash dena</div>
          </div>
        </div>
        {pay==='razorpay'&&(
          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 mt-2.5 text-[11px] font-poppins font-semibold" style={{background:'var(--tint-blue-bg)',color:'var(--tint-blue-text)',border:'1px solid var(--tint-blue-border)'}}>
            🔒 Online payment Razorpay se — UPI, cards, netbanking. Payment confirm hote hi order confirm hoga.
          </div>
        )}
      </div>

      {orderError&&<div className="rounded-xl px-3.5 py-2.5 mb-3 text-xs font-poppins font-semibold" role="alert" style={{background:'var(--tint-red-bg)',color:'var(--tint-red-text)'}}>⚠️ {orderError.replace(/^⚠️\s*/,'')}</div>}
      {deliveryInfo&&!deliveryInfo.available&&(
        <div className="rounded-xl px-3.5 py-2.5 mb-3 text-xs font-poppins font-semibold" role="status" style={{background:'var(--tint-yellow-bg)',color:'var(--tint-yellow-text)'}}>
          📍 Aapka location hamari normal delivery area (8 km) se bahar lag raha hai.
          Aap order place kar sakte hain — admin location verify karke order confirm ya cancel karega.
        </div>
      )}
      <button className="place-order-btn w-full text-white font-extrabold font-poppins rounded-2xl py-3.5 text-sm"
        style={{background:'linear-gradient(135deg, var(--primary), var(--primary-dark))',boxShadow:'0 6px 16px rgba(22,163,74,0.35)'}}
        disabled={placing||rzpBusy} onClick={handlePlaceOrder}>
        {placing||rzpBusy?'⏳ Process Ho Raha Hai...':(pay==='razorpay'?'💳 Pay Now — Online':'📲 Order Confirm Karein')} →
      </button>
    </>
  );
}
