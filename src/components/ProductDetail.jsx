import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, Star } from 'lucide-react';
import { ProdImg } from './ProdImg';
import { PCard } from './PCard';
import { SkelCard } from './Skeletons';
import { useProducts } from '../hooks/dataHooks';
import { supabase } from '../lib/supabaseClient';

// ── Product Detail Page (Module 5: Tailwind restyle — same product-fetch,
//    add-to-cart, and stock-guard logic as before. Only new *data* usage is
//    "related products", which reuses the exact same useProducts(categoryId)
//    hook the Shop page already calls elsewhere — no new query shape. ──
// Gallery images build karta hai: sort_order se sorted, phir admin ka ⭐ DEFAULT
// image PEHLI position par (taaki overview me default image pehli dikhe — beech me
// nahi). Baaki images apne sorted order me hi rehti hain (thumbnails/swipe).
function buildGalleryImages(product){
  const imgs=product.images&&product.images.length
    ?[...product.images].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))
    :(product.primary_image?[{image_url:product.primary_image,is_default:true,sort_order:0}]:[]);
  if(imgs.length<2) return imgs;
  const defIdx=imgs.findIndex(i=>i.is_default);
  if(defIdx>0){
    const def=imgs.splice(defIdx,1)[0];
    imgs.unshift(def); // default ko front par
  }
  return imgs;
}

export function ProductDetail({product,cart,addToCart,updQty,onBack,onDetail,wishlistIds,onWishlist,priceAlerts,onToggleAlert}){
  // BUG FIX: overview HAMESHA admin ke ⭐ DEFAULT image se start hoti hai —
  // buildGalleryImages default ko pehli position par rakhti hai (isliye selImg 0).
  // Example: 'लहसुन' ke 6 images hain, default sort position 3 par thi → pehle
  // beech wali dikhti thi. Ab default pehli dikhti hai, baaki sorted order me.
  const [selImg,setSelImg]=useState(0);
  // Multi-unit (2026-08): products.units = [{label,price,mrp,stock}]. Chips se
  // unit choose hota hai — selected unit ki price/stock/add-use hoti hai.
  const units=(product.units&&Array.isArray(product.units)&&product.units.length)?product.units:null;
  const [selUnit,setSelUnit]=useState(0);
  const sel=units&&units[selUnit]?units[selUnit]:null;
  const lineKey=sel?`${product.id}::${sel.label}`:product.id;
  const inC=cart.find(i=>(i.k||i.id)===lineKey);
  const price=sel?sel.price:product.selling_price;
  const mrp=sel?sel.mrp:product.original_price;
  const unitLabel=sel?sel.label:product.unit_value;
  const stockQty=sel?(typeof sel.stock==='number'?sel.stock:product.stock_quantity):product.stock_quantity;
  const disc=product.discount;
  const oos=stockQty<=0;
  const atMax=inC&&typeof stockQty==='number'&&inC.qty>=stockQty;
  const savings=mrp&&mrp>price?mrp-price:0;
  const addPayload=sel?{...product,_variant:sel.label,selling_price:sel.price,unit_value:sel.label,original_price:sel.mrp??product.original_price,stock_quantity:stockQty}:product;
  const touchStartX=useRef(null);
  const touchStartY=useRef(null);
  const isDragging=useRef(false);

  // BUG FIX (safety net): kuch flows (purane data, kisi dusre page se click)
  // product.images nahi bhejte — sirf primary_image. Agar images khaali ho to
  // primary_image se ek single-image gallery bana do, taaki detail page par
  // kabhi bhi image missing na dikhe (🛒 placeholder). Default image front par.
  const images=buildGalleryImages(product);
  const mainSrc=images[selImg]?.image_url||null;
  const alerted=priceAlerts&&priceAlerts.includes(product.id);

  // Component is remounted (via key={product.id} at the call site) whenever a
  // different product is opened — e.g. from "Related products" below — so
  // this just scrolls back to the top on that fresh mount.
  useEffect(()=>{ window.scrollTo(0,0); },[]);

  // Related products: same category, same useProducts() hook already used by
  // the Shop page — no new backend query shape, just a different call site.
  const {products:relatedRaw,loading:relatedLoading}=useProducts({categoryId:product.category_id,pageSize:9});
  const related=(relatedRaw||[]).filter(p=>p.id!==product.id).slice(0,8);

  // ── Customer Reviews (list + submit) ───────────────────────────────
  const [reviews,setReviews]=useState([]);
  const [rvRating,setRvRating]=useState(5);
  const [rvComment,setRvComment]=useState('');
  const [rvSending,setRvSending]=useState(false);
  const loadReviews=useCallback(async (pid)=>{
    try{
      const {data}=await supabase.from('reviews')
        .select('customer_name,rating,comment,admin_reply,created_at')
        .eq('product_id',pid).eq('status','approved')
        .order('created_at',{ascending:false}).limit(20);
      setReviews(data||[]);
    }catch(_){/* ignore */}
  },[]);
  useEffect(()=>{ loadReviews(product.id); },[product.id,loadReviews]);

  const submitReview=async ()=>{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.user){ openLogin?.(); return; }
    const text=rvComment.trim();
    if(text.length<3){ return; }
    setRvSending(true);
    const meta=session.user.user_metadata||{};
    const {error}=await supabase.from('reviews').insert({
      product_id:product.id,
      user_id:session.user.id,
      customer_name:meta.name||session.user.email?.split('@')[0]||'Customer',
      rating:rvRating,
      comment:text,
      status:'pending',
    });
    setRvSending(false);
    if(error) return;
    setRvComment('');
    setTimeout(()=>loadReviews(product.id),2500);
  };

  // Touch (mobile)
  function handleTouchStart(e){
    touchStartX.current=e.touches[0].clientX;
    touchStartY.current=e.touches[0].clientY;
  }
  function handleTouchEnd(e){
    if(touchStartX.current===null)return;
    const dx=e.changedTouches[0].clientX-touchStartX.current;
    const dy=e.changedTouches[0].clientY-touchStartY.current;
    if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>40){
      if(dx<0&&selImg<images.length-1)setSelImg(s=>s+1);
      else if(dx>0&&selImg>0)setSelImg(s=>s-1);
    }
    touchStartX.current=null;touchStartY.current=null;
  }
  // Mouse (laptop/desktop)
  function handleMouseDown(e){
    touchStartX.current=e.clientX;
    touchStartY.current=e.clientY;
    isDragging.current=true;
  }
  function handleMouseUp(e){
    if(!isDragging.current)return;
    isDragging.current=false;
    if(touchStartX.current===null)return;
    const dx=e.clientX-touchStartX.current;
    const dy=e.clientY-touchStartY.current;
    if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>40){
      if(dx<0&&selImg<images.length-1)setSelImg(s=>s+1);
      else if(dx>0&&selImg>0)setSelImg(s=>s-1);
    }
    touchStartX.current=null;touchStartY.current=null;
  }
  function handleMouseLeave(){
    isDragging.current=false;
    touchStartX.current=null;touchStartY.current=null;
  }

  const AddToCartControl=({full})=>(
    inC
      ?<div className={`flex items-center rounded-xl overflow-hidden flex-shrink-0 ${full?'flex-1':''}`} style={{border:'2px solid var(--primary)'}}>
        <button aria-label="Quantity kam karein" onClick={()=>updQty(product.id,-1,null,lineKey)}
          className="w-11 h-11 flex items-center justify-center text-white flex-shrink-0" style={{background:'var(--primary)'}}>
          <Minus size={17}/>
        </button>
        <span className="flex-1 text-center font-extrabold font-poppins text-base" style={{color:'var(--dark)'}}>{inC.qty}</span>
        <button aria-label="Quantity badhayein" disabled={atMax} onClick={()=>!atMax&&updQty(product.id,1,stockQty,lineKey)}
          className="w-11 h-11 flex items-center justify-center text-white flex-shrink-0 disabled:opacity-40" style={{background:'var(--primary)'}}>
          <Plus size={17}/>
        </button>
      </div>
      :<button onClick={()=>addToCart(addPayload)}
        className={`font-bold font-poppins text-white rounded-xl px-6 py-3.5 flex items-center justify-center gap-2 ${full?'flex-1':''}`}
        style={{background:'linear-gradient(135deg, var(--primary), var(--primary-dark))'}}>
        🛒 Cart Mein Add Karo
      </button>
  );

  return(
    // pb-32 (128px) mobile: sticky add-to-cart bar (bottom:70px+bar height)
    // 'Aapko Ye Bhi Pasand Aa Sakta Hai' ke aakhri cards ko kabhi na chhupaye.
    // Desktop (md): normal pb-8 — wahan sticky bar hidden hai.
    <div className="max-w-site mx-auto px-4 md:px-8 pt-4 pb-32 md:pb-8">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-poppins font-semibold mb-3" style={{color:'var(--gray)'}}>
        <ChevronLeft size={16}/> Wapas Jao
      </button>

      <div className="grid md:grid-cols-2 gap-6 md:gap-10">
        {/* ── Gallery ── */}
        {/* Fix: grid child par min-w-0 (Tailwind default 'auto' nahi) — warna
            image ki intrinsic sizing grid track ko 440px tak kheench deti thi
            (grid 358px hota hua bhi), jisse detail page mobile par horizontal
            overflow hota tha aur poori page shrink ho jaati thi. */}
        <div className="min-w-0">
          <div className="relative aspect-square rounded-2xl overflow-hidden select-none"
            style={{background:'var(--light)',border:'1.5px solid var(--border)'}}
            onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave}>
            <ProdImg src={mainSrc} alt={product.name} className={oos?'grayscale':''}/>
            {disc&&!oos&&(
              <span className="absolute top-3 left-3 text-white text-xs font-bold font-poppins px-2.5 py-1 rounded-lg" style={{background:'var(--red)'}}>{disc}% OFF</span>
            )}
            {oos&&(
              <div className="absolute inset-0 flex items-center justify-center" style={{background:'rgba(0,0,0,0.45)'}}>
                <span className="bg-white text-sm font-bold font-poppins px-3 py-1.5 rounded-lg" style={{color:'var(--dark)'}}>Out of Stock</span>
              </div>
            )}
            {images.length>1&&(<>
              <button aria-label="Pichli image" disabled={selImg===0} onClick={()=>setSelImg(s=>s-1)}
                className="absolute top-1/2 left-2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-25"
                style={{background:'rgba(0,0,0,0.45)'}}><ChevronLeft size={18}/></button>
              <button aria-label="Agli image" disabled={selImg===images.length-1} onClick={()=>setSelImg(s=>s+1)}
                className="absolute top-1/2 right-2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-25"
                style={{background:'rgba(0,0,0,0.45)'}}><ChevronRight size={18}/></button>
            </>)}
          </div>

          {images.length>1&&(
            <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-hide">
              {images.map((img,i)=>(
                <button key={img.id||i} onClick={()=>setSelImg(i)}
                  className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0"
                  style={{border:`2px solid ${selImg===i?'var(--primary)':'var(--border)'}`}}>
                  {/* thumbnails: fixed h-14 + overflow-hidden — portrait images yahan bhi
                      container ko nahi kheench sakti */}
                  <div className="w-full h-full"><ProdImg src={img.image_url} alt={`${product.name} ${i+1}`}/></div>
                </button>
              ))}
            </div>
          )}

          {/* Trust badges — desktop only */}
          <div className="hidden md:grid grid-cols-3 gap-3 mt-6">
            {[{i:'⚡',t:'Fast delivery'},{i:'🌿',t:'100% Fresh guarantee'},{i:'↩️',t:'Easy returns'}].map((b,i)=>(
              <div key={i} className="flex flex-col items-center text-center gap-1.5 rounded-xl p-3" style={{background:'var(--card-bg)',border:'1px solid var(--border)'}}>
                <span className="text-lg">{b.i}</span>
                <p className="text-[11px] font-poppins leading-tight" style={{color:'var(--gray)'}}>{b.t}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Info ── */}
        <div className="min-w-0">
          {product.categories&&<div className="text-[11px] font-bold font-poppins uppercase tracking-wide mb-1.5" style={{color:'var(--primary)'}}>{product.categories.name}</div>}
          <h1 className="text-xl md:text-2xl font-extrabold font-poppins leading-snug" style={{color:'var(--dark)'}}>{product.name}</h1>
          <div className="text-xs font-poppins mt-1" style={{color:'var(--gray)'}}>{unitLabel}</div>

          {/* Unit selector — multi-unit products ke liye chips */}
          {units&&units.length>1&&(
            <div className="mt-4">
              <div className="text-xs font-bold font-poppins mb-2" style={{color:'var(--gray)'}}>Size / Pack chunein:</div>
              <div className="flex flex-wrap gap-2">
                {units.map((u,i)=>{
                  const uStock=typeof u.stock==='number'?u.stock:product.stock_quantity;
                  const active=i===selUnit;
                  const uOos=uStock<=0;
                  return(
                    <button key={i} disabled={uOos} onClick={()=>{setSelUnit(i);}}
                      className="rounded-xl px-3.5 py-2 text-left transition-all disabled:opacity-45"
                      style={active
                        ?{background:'var(--primary)',color:'#fff',boxShadow:'0 4px 12px rgba(22,163,74,0.3)'}
                        :{background:'var(--light)',color:'var(--dark)',border:'1.5px solid var(--border)'}}>
                      <div className="text-xs font-extrabold font-poppins">{u.label}</div>
                      <div className="text-[11px] font-bold font-poppins" style={{color:active?'rgba(255,255,255,0.9)':'var(--primary)'}}>
                        ₹{u.price}{u.mrp&&u.mrp>u.price?<span className="line-through ml-1 font-normal" style={{color:active?'rgba(255,255,255,0.7)':'var(--gray)'}}>₹{u.mrp}</span>:null}
                      </div>
                      {uOos&&<div className="text-[9px] font-bold mt-0.5" style={{color:active?'rgba(255,255,255,0.85)':'var(--red)'}}>Out of stock</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-baseline gap-2 mt-4 flex-wrap">
            <span className="text-2xl md:text-3xl font-extrabold font-poppins" style={{color:'var(--dark)'}}>₹{price}</span>
            {mrp&&mrp>price&&(
              <>
                <span className="text-sm font-poppins line-through" style={{color:'var(--gray)'}}>₹{mrp}</span>
                {savings>0&&<span className="text-sm font-bold font-poppins" style={{color:'var(--primary)'}}>Save ₹{savings}</span>}
              </>
            )}
          </div>
          <p className="text-xs font-poppins mt-1" style={{color:'var(--gray)'}}>Sabhi taxes included</p>

          <div className="mt-3">
            {oos
              ?<span className="text-xs font-bold font-poppins" style={{color:'var(--red)'}}>⚠️ Out of Stock</span>
              :<span className="text-xs font-bold font-poppins" style={{color:'var(--primary)'}}>✓ In Stock ({stockQty} left)</span>
            }
          </div>

          {/* 🔔 Price-drop / back-in-stock alert toggle (oos ho to bhi dikhta hai) */}
          {onToggleAlert&&(
            <button onClick={()=>onToggleAlert(product)} aria-pressed={!!alerted}
              className="mt-3 flex items-center gap-1.5 text-xs font-bold font-poppins rounded-xl px-3.5 py-2 transition-colors"
              style={alerted
                ?{background:'var(--tint-yellow-bg)',color:'var(--tint-yellow-text)',border:'1.5px solid var(--tint-yellow-border)'}
                :{background:'var(--light)',color:'var(--gray)',border:'1.5px solid var(--border)'}}>
              {alerted?'🔔 Price alert ON — tap to hatao':'🔔 Price drop par alert pao'}
            </button>
          )}

          {/* Add to cart — desktop inline */}
          {!oos&&(
            <div className="hidden md:flex items-center gap-3 mt-6">
              <AddToCartControl full/>
            </div>
          )}

          {product.description&&(
            <div className="mt-6 pt-6" style={{borderTop:'1px solid var(--border)'}}>
              <p className="text-sm font-bold font-poppins mb-2" style={{color:'var(--dark)'}}>Product Description</p>
              <p className="text-sm font-poppins leading-relaxed" style={{color:'var(--gray)'}}>{product.description}</p>
            </div>
          )}

          {/* ── Customer Reviews ── */}
          <div className="mt-6 pt-6" style={{borderTop:'1px solid var(--border)'}}>
            <p className="text-sm font-bold font-poppins mb-1" style={{color:'var(--dark)'}}>
              ⭐ Customer Reviews <span style={{color:'var(--gray)',fontWeight:600}}>({reviews.length})</span>
            </p>

            {/* Submit form (login required) */}
            <div className="rounded-2xl p-4 mt-3" style={{background:'var(--light)',border:'1.5px solid var(--border)'}}>
              <p className="text-xs font-bold font-poppins mb-2" style={{color:'var(--dark)'}}>Apna review likhein:</p>
              <div className="flex items-center gap-1 mb-2">
                {[1,2,3,4,5].map(s=>(
                  <button key={s} type="button" onClick={()=>setRvRating(s)} aria-label={`${s} star`}
                    className="transition-transform hover:scale-125 active:scale-90">
                    <Star size={20} style={{color:s<=rvRating?'#FFB800':'var(--border)',fill:s<=rvRating?'#FFB800':'transparent'}}/>
                  </button>
                ))}
                <span className="text-xs font-poppins ml-2" style={{color:'var(--gray)'}}>{rvRating}/5</span>
              </div>
              <textarea value={rvComment} onChange={e=>setRvComment(e.target.value)} rows={2}
                placeholder="Product ka experience share karein…"
                className="w-full rounded-xl px-3 py-2.5 text-sm font-poppins outline-none resize-none"
                style={{border:'1.5px solid var(--border)',background:'var(--card-bg)',color:'var(--dark)'}}/>
              <button onClick={submitReview} disabled={rvSending||rvComment.trim().length<3}
                className="mt-2.5 text-white text-xs font-bold font-poppins rounded-xl px-4 py-2.5 disabled:opacity-50 transition-transform hover:scale-[1.02] active:scale-95"
                style={{background:'linear-gradient(135deg,var(--primary),var(--primary-dark))'}}>
                {rvSending?'Bhej rahe hain…':'📨 Review Bhejein'}
              </button>
              <p className="text-[10px] font-poppins mt-1.5" style={{color:'var(--gray)'}}>
                Review admin approval ke baad public dikhta hai.
              </p>
            </div>

            {/* List */}
            {reviews.length
              ?reviews.map((r,i)=>(
                <div key={i} className="pt-4 mt-4" style={{borderTop:'1px solid var(--border)'}}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold font-poppins" style={{color:'var(--dark)'}}>{r.customer_name||'Customer'}</span>
                    <span className="text-[#FFB800] text-xs tracking-tight">{"★★★★★".slice(0,Math.max(1,Math.min(5,r.rating||5)))}{"☆".repeat(5-Math.max(1,Math.min(5,r.rating||5)))}</span>
                  </div>
                  <p className="text-sm font-poppins leading-relaxed mt-1.5" style={{color:'var(--text)'}}>{r.comment}</p>
                  {r.admin_reply&&(
                    <div className="rounded-xl px-3 py-2.5 mt-2" style={{background:'var(--primary-light)'}}>
                      <p className="text-[10px] font-bold font-poppins" style={{color:'var(--primary-dark)'}}>🛡️ Store ka reply:</p>
                      <p className="text-xs font-poppins mt-0.5" style={{color:'var(--text)'}}>{r.admin_reply}</p>
                    </div>
                  )}
                </div>
              ))
              :<p className="text-xs font-poppins text-center mt-4" style={{color:'var(--gray)'}}>Abhi koi review nahi — pehle aap likhein! ✍️</p>
            }
          </div>
        </div>
      </div>

      {/* ── Related products ── */}
      {(relatedLoading||related.length>0)&&(
        <div className="mt-10 pt-6" style={{borderTop:'1px solid var(--border)'}}>
          <p className="text-base font-bold font-poppins mb-4" style={{color:'var(--dark)'}}>Aapko Ye Bhi Pasand Aa Sakta Hai</p>
          <div className="flex gap-3 md:gap-4 overflow-x-auto pb-1 snap-x scrollbar-hide">
            {relatedLoading
              ?[...Array(4)].map((_,i)=><div key={i} className="flex-shrink-0 w-36 md:w-44 snap-start"><SkelCard/></div>)
              :related.map(p=>(
                <div key={p.id} className="flex-shrink-0 w-36 md:w-44 snap-start min-w-0">
                  <PCard p={p} cart={cart} addToCart={addToCart} updQty={updQty} onDetail={onDetail} wishlistIds={wishlistIds} onWishlist={onWishlist}/>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ── Sticky add-to-cart bar (mobile) — offset above the fixed bottom-nav,
           same "70px + safe-area" clearance the old .pdp-add-section used. ── */}
      {!oos&&(
        <div className="md:hidden fixed left-0 right-0 z-[900] flex items-center gap-3 px-4 py-3"
          style={{background:'var(--card-bg)',borderTop:'1px solid var(--border)',bottom:'max(70px, calc(70px + env(safe-area-inset-bottom, 0px)))',boxShadow:'0 -4px 16px rgba(0,0,0,0.08)'}}>
          <AddToCartControl full/>
          <div className="text-right flex-shrink-0">
            <div className="font-extrabold font-poppins text-base" style={{color:'var(--primary)'}}>₹{price}</div>
            {mrp&&mrp>price&&
              <div className="text-[10px] font-poppins line-through" style={{color:'var(--gray)'}}>₹{mrp}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
