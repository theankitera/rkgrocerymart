import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { Search, ShoppingCart, User, Download, Home, ShoppingBag, SlidersHorizontal, X, Zap, Leaf, BadgePercent, ShieldCheck, Package, Headphones, Send, MessageCircle, ChevronLeft, ChevronRight, Store, Users, Star, Truck, Clock, MapPin, Wallet, RotateCcw, FileText, Lock, Phone, Mail, HelpCircle, CheckCircle2, ScrollText } from 'lucide-react';
import { supabase } from './lib/supabaseClient';
import { TICKER, calcDiscount, catEmoji } from './lib/helpers';
import { openAppDownload } from './lib/appDownload';
import { useCategories, useBanners, useProducts, useSearch, useHomeSections, useHomepageConfig, useReviews, useAdStrips, useShopSettings, DEFAULT_HOMEPAGE_SECTIONS } from './hooks/dataHooks';
import { SkelCard, SkelBanner } from './components/Skeletons';
import { PCard } from './components/PCard';
import { ProductDetail } from './components/ProductDetail';
import { CheckoutForm } from './components/CheckoutForm';
import AuthModal from './components/AuthModal';

// ── Universal CategoryRail (MobileCatRow + CategoryGrid ka merge) ───────────
// Ek hi component DO jagah (Module 13 pattern — module-level stable type, App
// re-render par scroll position reset nahi hoti):
//   • Home page  → premium header (icon badge + title + View All pill) + image-first rounded cards
//   • Shop page (mobile) → active category highlight, chhota rounded card, bina header
// Design: Blinkit-style image-first tiles — rounded-square card jisme category
// ka real image poora bhar jata hai (clean object-cover) + neeche chhota bold
// label. Hover par image zoom + card lift. Active category green ring se highlight.
// Scroll affordance: ◀ ▶ arrow buttons + right-edge fade SIRF tab dikhte hain
// jab rail actually scrollable ho (scrollWidth > clientWidth) — boundary par
// auto-hide. Pehle users ko pata hi nahi tha ki rail scroll hoti hai; ab fade/
// arrows se discoverability — saari 16 categories explore hongi.
function CategoryRail({cats,catsLoading,catEmoji,onClick,activeCatId=null,heading=null,onSeeAll=null,tileClass='w-16 md:w-20',labelClass='text-[10px] md:text-xs leading-tight',fadeColor='var(--page-bg)'}){
  const ref=useRef(null);
  const [canLeft,setCanLeft]=useState(false);
  const [canRight,setCanRight]=useState(false);
  const update=useCallback(()=>{
    const el=ref.current;
    if(!el)return;
    setCanLeft(el.scrollLeft>4);
    setCanRight(el.scrollLeft<el.scrollWidth-el.clientWidth-4);
  },[]);
  useEffect(()=>{
    const el=ref.current;
    if(!el)return;
    update();
    const ro=new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener('scroll',update,{passive:true});
    window.addEventListener('resize',update);
    return()=>{ro.disconnect();el.removeEventListener('scroll',update);window.removeEventListener('resize',update);};
  },[update]);
  // Cats load hone / loading state badalne par dobara measure (scrollWidth tabhi
  // settle hota hai jab tiles render ho jate hain).
  useEffect(()=>{update();},[cats.length,catsLoading,update]);
  const scrollBy=dir=>ref.current?.scrollBy({left:dir*250,behavior:'smooth'});
  const arrow=(dir,shown,edge)=>{
    if(!shown)return null;
    return(
      <button onClick={()=>scrollBy(dir)} aria-label={dir<0?'Pichli categories':'Agli categories'}
        className={`absolute top-1/2 -translate-y-1/2 z-10 w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center shadow-md transition-transform hover:scale-110 active:scale-90 ${edge}`}
        style={{background:'var(--card-bg)',color:'var(--primary)',border:'1px solid var(--border)'}}>
        {dir<0?'◀':'▶'}
      </button>
    );
  };
  return(
    <div>
      {heading&&(
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{background:'linear-gradient(135deg,var(--primary),var(--primary-dark))',boxShadow:'0 4px 12px rgba(22,163,74,0.35)'}}>
              <span className="text-lg md:text-xl">🛍️</span>
            </div>
            <h2 className="text-base md:text-xl font-extrabold font-poppins truncate leading-tight" style={{color:'var(--dark)'}}>{heading}</h2>
          </div>
          {onSeeAll&&(
            <button onClick={onSeeAll}
              className="flex-shrink-0 text-xs md:text-sm font-bold font-poppins flex items-center gap-1 px-3 md:px-4 py-1.5 md:py-2 rounded-full transition-all hover:scale-105 active:scale-95"
              style={{background:'var(--primary-light)',color:'var(--primary)'}}>
              View All <span className="text-[10px] md:text-xs">→</span>
            </button>
          )}
        </div>
      )}
      <div className="relative">
        {arrow(-1,canLeft,'left-0 md:-ml-3')}
        <div ref={ref} className="flex flex-nowrap gap-3 md:gap-4 overflow-x-auto pb-1 snap-x scrollbar-hide">
          {catsLoading
            ?[...Array(8)].map((_,i)=>(
              <div key={i} aria-hidden="true" className={`flex-shrink-0 ${tileClass} flex flex-col items-center gap-1.5`}>
                <div className="w-full aspect-square rounded-2xl animate-pulse" style={{background:'var(--light)'}}/>
                <div className="h-4 w-14 rounded-full animate-pulse" style={{background:'var(--light)'}}/>
              </div>
            ))
            :cats.map(c=>{
              const active=activeCatId===c.id;
              return(
                <button key={c.id} onClick={()=>onClick(c.id)} title={c.name}
                  className={`flex-shrink-0 ${tileClass} snap-start flex flex-col items-center gap-1.5 group outline-none`}>
                  {/* Blinkit-style image-first rounded card */}
                  <div className="relative w-full aspect-square rounded-2xl overflow-hidden transition-all duration-200 group-active:scale-95 group-hover:-translate-y-1 group-hover:shadow-lg"
                    style={{background:'var(--light)',border:'1px solid var(--border)',boxShadow:active?'0 0 0 2.5px var(--primary), 0 4px 14px rgba(22,163,74,0.25)':'0 2px 10px rgba(0,0,0,0.06)',transition:'box-shadow 0.2s ease, transform 0.2s ease'}}>
                    {(c.display_image||c.image_url)
                      ?<img src={c.display_image||c.image_url} alt={c.name} loading="lazy"
                           className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"/>
                      :<div className="w-full h-full flex items-center justify-center text-3xl md:text-4xl group-hover:scale-110 transition-transform duration-300"
                             style={{background:'var(--primary-light)'}}>{catEmoji(c)}</div>
                    }
                    {/* active ring overlay */}
                    {active&&<div className="absolute inset-0 pointer-events-none" style={{boxShadow:'inset 0 0 0 3px var(--primary)',borderRadius:16}}/>}
                  </div>
                  <span className={`${labelClass} font-poppins text-center leading-tight max-w-full font-semibold`}
                    style={{color:'var(--dark)'}}>{c.name}</span>
                </button>
              );
            })
          }
        </div>
        {canRight&&<div className="pointer-events-none absolute inset-y-0 right-0 w-8 md:w-12 rounded-r-2xl" style={{background:`linear-gradient(90deg,transparent,${fadeColor})`}}/>}
        {arrow(1,canRight,'right-0 md:-mr-3')}
      </div>
    </div>
  );
}

// ── Module 13: scroll-reset fix ─────────────────────────────
// These components were previously defined INSIDE App(). App re-renders every
// 4s (banner autoplay timer) and re-creates inner component types on every
// render — so React unmounted & remounted the whole homepage each time,
// wiping every horizontal section's scroll position back to 0 (swipe to item
// 5 → a few seconds later it snapped back to item 1). Moving them to module
// level (stable types, same pattern as FlashSale/WhyChooseUs) stops that
// remount. All state/handlers stay in App and come in as props.

const SORT_OPTIONS=[
  {v:'default',l:'Recommended'},
  {v:'price-low',l:'Price: Low to High'},
  {v:'price-high',l:'Price: High to Low'},
];

function HeroBanner({banners,bannersLoading,bannerIdx,setBannerIdx,wrapRef,handleBannerClick}){
  return(
    <div className="relative rounded-2xl overflow-hidden h-40 md:h-64">
      <div ref={wrapRef} className="flex h-full overflow-x-auto snap-x snap-mandatory scrollbar-hide">
        {bannersLoading
          ?<SkelBanner/>
          :banners.map(b=>(
            <div key={b.id} role="button" tabIndex={0} aria-label={b.title||'Banner'}
              className="relative w-full h-full flex-shrink-0 snap-start snap-always cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              style={{background:b.bg_gradient||'linear-gradient(135deg,#064E3B,#047857)'}}
              onClick={()=>handleBannerClick(b)}
              onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();handleBannerClick(b);}}}>
              {b.image_url&&<img src={b.image_url} alt={b.title} className="absolute inset-0 w-full h-full object-cover opacity-70"/>}
              {/* Fix #5 (preserved): decorative emoji only when there's no real banner image */}
              {!b.image_url&&<div className="absolute right-2 bottom-2 text-6xl opacity-20">🛒</div>}
              {/* NOTE: gradient overlay div par max-w-md NAHI lagana — woh inset-0 ke
                  saath conflict karke overlay ko sirf left 448px tak cap kar deta tha,
                  jisse large devices par ek vertical seam ban jaata tha (mobile par
                  width < 448px isliye kabhi dikhta nahi tha). Width cap ab andar ke
                  text wrapper par hai, gradient poore banner par uniform rahega. */}
              <div className="absolute inset-0 p-4 md:p-10 flex flex-col justify-end md:justify-center"
                style={{background:'linear-gradient(0deg, rgba(0,0,0,0.35), transparent 60%)'}}>
                <div className="w-full max-w-md">
                  <span className="inline-block bg-white/20 text-white text-[10px] md:text-xs font-bold font-poppins px-2 py-1 rounded-lg mb-1 w-fit">LIMITED OFFER</span>
                  <p className="text-white font-bold text-base md:text-3xl font-poppins leading-tight">{b.title}</p>
                  {b.subtitle&&<p className="text-white/80 text-xs md:text-base mt-0.5">{b.subtitle}</p>}
                  <button onClick={e=>{e.stopPropagation();handleBannerClick(b);}}
                    className="mt-2 md:mt-4 inline-flex w-fit items-center gap-1 bg-white text-charcoal text-xs md:text-sm font-bold font-poppins px-3 py-1.5 rounded-xl">
                    {b.button_text||'Shop Now'} →
                  </button>
                </div>
              </div>
            </div>
          ))
        }
      </div>
      {banners.length>1&&(
        <div className="absolute bottom-3 right-4 flex gap-1.5">
          {banners.map((_,i)=>(
            <button key={i} aria-label={`Banner ${i+1} dikhayein`} onClick={()=>setBannerIdx(i)}
              className={`h-1.5 rounded-full transition-all ${i===bannerIdx?'w-5 bg-white':'w-1.5 bg-white/50'}`}/>
          ))}
        </div>
      )}
    </div>
  );
}



// 🔤 MultiColorName — Blinkit-jaisa multicolor shop name: words alternate
// colors me (default orange/green — header jaisa). Dark surfaces par alag
// pair pass kar sakte hain (footer: yellow/white — green gradient background
// par green word gayab ho jata). Text size/typography parent ke classes se
// hi aati hai — yeh sirf color split karta hai.
function MultiColorName({name,colors=['var(--orange)','var(--primary)']}){
  const words=String(name||'').trim().split(/\s+/).filter(Boolean);
  return(
    <>
      {words.map((w,i)=>(
        <span key={i} style={{color:colors[i%colors.length]}}>
          {i>0?' ':''}{w}
        </span>
      ))}
    </>
  );
}

// 🎯 AdStripSection — homepage builder ki "Ad Images" strips.
// • Large devices (md+): 3 images ek saath (width bhar ke, flush) + dono
//   side circular arrows.
// • Small devices: ek time par EK puri ad center me + dono taraf halki
//   peek (aage/piche ad ki jhalak) — user ko pata chalta hai ki strip
//   aage-piche chalti hai aur ads limited hain.
// • Motion: right→left EK-EK karke (step by step) chalta hai; last ad par
//   pahunch kar wapas left→right EK HI animation me pura sweep hota hai
//   (sab ek sath) — isse saaf pata chalta hai ki strip aage-piche chal rahi
//   hai aur ads limited hain. Koi invisible/seamless reset nahi.
// • Har strip instance STAGGERED time par chalta hai (alag start delay +
//   alag speed) — saari strips ek saath sync hokar nahi chalti, warna poora
//   page ek saath hilta hua lagta tha.
// • Hover par pause, prefers-reduced-motion par auto-scroll band.
// Har image click karne par category ya product khulta hai.

// Module-level counter: strips ke stagger ke liye har instance ka unique
// sequence number (App re-render par stable rehta hai).
let AD_STRIP_SEQ=0;

function AdStripSection({strip,onAdClick}){
  const imgs=strip.images||[];
  const n=imgs.length;
  const seqRef=useRef(null);
  if(seqRef.current===null)seqRef.current=AD_STRIP_SEQ++;
  const GAP=12;   // do cards ke beech ka gap
  const PEEK=18;  // mobile: dono taraf itni si jhalak dikhe
  const wrapRef=useRef(null);
  const pausedRef=useRef(false);
  const posRef=useRef(0);
  // md (768px) = large-device cut. Breakpoint switch par visible window
  // 3 ↔ 1 ho jati hai aur position initial par reset.
  const [md,setMd]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(min-width:768px)').matches);
  const [W,setW]=useState(0);
  const [pos,setPos]=useState(0);
  const [tdur,setTdur]=useState(700); // transition: step vs full return sweep
  useEffect(()=>{
    const mq=window.matchMedia('(min-width:768px)');
    const apply=()=>{setMd(mq.matches);posRef.current=0;setTdur(700);setPos(0);};
    mq.addEventListener('change',apply);
    return()=>mq.removeEventListener('change',apply);
  },[]);
  // Container width naap lo — layout sab PX me calculate hota hai (edges
  // exact flush + dono taraf symmetric peek). useLayoutEffect + initial
  // getBoundingClientRect → first paint se pehle width mil jati hai,
  // isliye koi blank flash nahi dikhta.
  useLayoutEffect(()=>{
    const el=wrapRef.current;
    if(!el)return;
    setW(el.getBoundingClientRect().width);
    const ro=new ResizeObserver(entries=>setW(entries[0].contentRect.width));
    ro.observe(el);
    return()=>ro.disconnect();
  },[n]);
  const visible=md?3:1;
  const canScroll=n>visible;
  const maxPos=canScroll?n-visible:0;
  // Layout maths (sab px me):
  //  • static row (scroll nahi chahiye): saari cards evenly, flush.
  //  • md: 3 cards poori width bhar dete hain (inset 0, clone 0).
  //  • mobile: center card + dono taraf PEEK px jhalak — dono taraf ke
  //    neighbour ko edge tak fill karne ke liye start/end par 1-1 clone.
  const ready=W>4;
  const slotCount=Math.max(n,1);
  const cardW=Math.max(0,!canScroll
    ?(W-(slotCount-1)*GAP)/slotCount
    :md?(W-2*GAP)/3
       :W-2*(GAP+PEEK));
  const step=cardW+GAP;              // ek card + uska aage ka gap
  const inset=canScroll&&!md?GAP+PEEK:0;
  const clones=canScroll&&!md?1:0;
  const shift=ready?inset-(pos+clones)*step:0;
  // Images kam ho jayein (ya breakpoint badle) to position clamp.
  useEffect(()=>{
    if(posRef.current>maxPos){posRef.current=maxPos;setPos(maxPos);}
    if(posRef.current<0){posRef.current=0;setPos(0);}
  },[maxPos]);
  // Auto-scroll = right→left ek-ek karke + last ad par EK BAR ME puri
  // left→right sweep + stagger. Har strip alag delay aur alag speed se
  // start hota hai (seq) — saari strips ek saath sync nahi chalti.
  useEffect(()=>{
    if(!canScroll)return;
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const seq=seqRef.current||0;
    const delay=(seq%5)*1200;        // strips aage-piche start hon
    const dur=3500+(seq%3)*500;      // strips ka step-time bhi thoda alag
    let iv=null;
    const boot=setTimeout(()=>{
      iv=setInterval(()=>{
        if(pausedRef.current)return;
        // Last ad par ho to step nahi — ek hi animation me pos 0 par wapas
        // (poori list left→right ek sath), warna ek-ek step aage.
        const sweep=posRef.current>=maxPos;
        // Sweep duration distance ke hisaab se (thoda tez, par dikhe bhi).
        const sweepDur=Math.min(1500,Math.max(700,350*maxPos));
        const np=sweep?0:posRef.current+1;
        setTdur(sweep?sweepDur:700);
        posRef.current=np;
        setPos(np);
      },dur);
    },delay);
    return()=>{clearTimeout(boot);if(iv!==null)clearInterval(iv);};
  },[canScroll,maxPos]);
  // Manual arrows — user ko dono taraf ek-ek karke chalana hai; auto
  // sequence wahin se continue hota hai jahan user chhoda.
  const stepBy=dir=>{
    if(!canScroll)return;
    const np=Math.max(0,Math.min(maxPos,posRef.current+dir));
    posRef.current=np;
    setTdur(700);
    setPos(np);
  };
  if(n===0)return null;
  // Track: [start clones] + originals + [end clones] — mobile peeks ke
  // liye dono taraf ek-1 neighbour chahiye (start/end par blank na aaye).
  const track=[];
  for(let i=n-clones;i<n;i++)track.push({img:imgs[i],i,clone:true});
  for(let i=0;i<n;i++)track.push({img:imgs[i],i,clone:false});
  for(let i=0;i<clones;i++)track.push({img:imgs[i],i,clone:true});
  return(
    <div className="relative" onMouseEnter={()=>{pausedRef.current=true;}}
      onMouseLeave={()=>{pausedRef.current=false;}}>
      <div ref={wrapRef} className="overflow-hidden">
        <div className="flex" style={{transform:`translateX(${shift}px)`,
          transition:ready?`transform ${tdur}ms var(--ease-standard)`:'none',
          visibility:ready?'visible':'hidden'}}>
          {track.map(({img,i,clone})=>(
            <div key={`${clone?'c':'o'}-${i}`} aria-hidden={clone||undefined}
              className="h-24 md:h-32 shrink-0 grow-0"
              style={{flexBasis:`${step}px`,paddingRight:GAP}}>
              <button type="button" onClick={()=>onAdClick(img)} aria-label={strip.title||'Ad image'}
                tabIndex={clone?-1:0}
                className="w-full h-full rounded-2xl overflow-hidden group text-left"
                style={{border:'1.5px solid var(--border)',boxShadow:'0 2px 10px rgba(0,0,0,0.06)'}}>
                <img src={img.image_url} alt={strip.title} loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"/>
              </button>
            </div>
          ))}
        </div>
      </div>
      {/* Arrows — sirf large devices (md+) par, dono side (screenshot jaisa).
          Clip container ke BAHAR sibling hain isliye edge par overlay hote
          hain, overflow-hidden se clip nahi hote. Sirf tab dikhte hain jab
          actually scroll ho (n > visible). */}
      {canScroll&&(
        <>
          <button type="button" aria-label="Pichli ad" onClick={()=>stepBy(-1)}
            className="hidden md:flex absolute left-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full items-center justify-center shadow-md transition-transform hover:scale-110 active:scale-90"
            style={{background:'var(--card-bg)',color:'var(--text)',border:'1px solid var(--border)'}}>
            <ChevronLeft size={18}/>
          </button>
          <button type="button" aria-label="Agli ad" onClick={()=>stepBy(1)}
            className="hidden md:flex absolute right-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full items-center justify-center shadow-md transition-transform hover:scale-110 active:scale-90"
            style={{background:'var(--card-bg)',color:'var(--text)',border:'1px solid var(--border)'}}>
            <ChevronRight size={18}/>
          </button>
        </>
      )}
    </div>
  );
}

// 💎 TitlePill — category naam ke text ke around PREMIUM designer pill:
// layered gradient (theme-aware) + glass shine (diagonal white overlay) +
// soft glow + inner highlight + subtle border. Sirf text ka background,
// layout kuch nahi badalta. Module-level (Module 13 pattern).
function TitlePill({children, icon}){
  return(
    <span className="title-pill inline-block rounded-full font-extrabold font-poppins text-sm md:text-lg text-white leading-tight px-4 py-1.5 md:px-5 md:py-2"
      style={{
        background:'linear-gradient(115deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 45%, rgba(255,255,255,0) 100%), linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
        border:'1px solid rgba(255,255,255,0.18)',
        textShadow:'0 1px 3px rgba(0,0,0,0.22)',
        letterSpacing:'0.01em',
      }}>
      {icon&&<span className="mr-1.5 align-[-1px]">{icon}</span>}
      {children}
      <span className="title-pill-shine" aria-hidden="true"/>
    </span>
  );
}

// Category section titles: titlePill ho to sirf TITLE TEXT ke around designer
// gradient pill (baki layout bilkul same — See All right, products neeche).
function ProductRail({title,loading,products,onSeeAll,cart,addToCart,updQty,onDetail,titlePill,titleIcon,wishlistIds,onWishlist}){
  if(!loading&&(!products||products.length===0))return null;
  return(
    <div>
      <div className="flex items-center justify-between mb-3">
        {titlePill
          ?<h2><TitlePill icon={titleIcon}>{title}</TitlePill></h2>
          :<h2 className="text-base md:text-xl font-bold font-poppins" style={{color:'var(--dark)'}}>{title}</h2>}
        <button onClick={onSeeAll} className="text-xs md:text-sm font-semibold font-poppins flex items-center gap-0.5" style={{color:'var(--primary)'}}>See All →</button>
      </div>
      <div className="flex gap-3 md:gap-4 overflow-x-auto pb-1 snap-x scrollbar-hide">
        {loading||!products
          ?[...Array(4)].map((_,i)=><div key={i} className="flex-shrink-0 w-36 md:w-44 snap-start"><SkelCard/></div>)
          :products.map(p=>(
            <div key={p.id} className="flex-shrink-0 w-36 md:w-44 snap-start">
              <PCard p={p} cart={cart} addToCart={addToCart} updQty={updQty} onDetail={onDetail} wishlistIds={wishlistIds} onWishlist={onWishlist}/>
            </div>
          ))
        }
      </div>
    </div>
  );
}

function DesktopSidebar({allCats,activeCatId,catEmoji,onPick,counts}){
  return(
    <div className="sticky rounded-2xl p-3 mr-4 my-4 flex-shrink-0"
      style={{width:200,background:'var(--card-bg)',top:'var(--header-h)',boxShadow:'0 2px 10px rgba(0,0,0,0.06)',maxHeight:'calc(100vh - var(--header-h) - 20px)',overflowY:'auto'}}>
      <div className="text-[11px] font-bold font-poppins uppercase tracking-wide pb-2 mb-1.5" style={{color:'var(--gray)',borderBottom:'1px solid var(--border)'}}>Categories</div>
      {allCats.map(c=>{
        const active=activeCatId===c.id;
        return(
          <div key={c.id} onClick={()=>onPick(c.id)}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer text-[13px] font-semibold font-poppins active:scale-[0.97] hover:bg-black/[0.03] transition-colors"
            style={{color:active?'var(--primary)':'var(--dark)',background:active?'var(--primary-light)':'transparent'}}>
            {(c.display_image||c.image_url)
              ?<img src={c.display_image||c.image_url} alt={c.name} className="w-7 h-7 rounded-lg object-cover flex-shrink-0"/>
              :<div className="w-7 h-7 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{background:'var(--primary-light)'}}>{catEmoji(c)}</div>
            }
            <span className="truncate flex-1">{c.name}</span>
            {counts&&typeof counts[c.id]==='number'&&(
              <span className="text-[10px] font-bold font-poppins rounded-full px-1.5 py-0.5 flex-shrink-0" style={{background:'var(--primary-light)',color:'var(--primary-dark)'}}>{counts[c.id]}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Footer({shopSettings,onNav}){
  const s=shopSettings;
  const socials=[
    s.social_facebook&&{href:s.social_facebook,icon:'📘',label:'Facebook'},
    s.social_instagram&&{href:s.social_instagram,icon:'📸',label:'Instagram'},
    s.social_whatsapp&&{href:s.social_whatsapp,icon:'💬',label:'WhatsApp'},
    s.social_youtube&&{href:s.social_youtube,icon:'▶️',label:'YouTube'},
  ].filter(Boolean);
  const legal=[{k:'about',l:'About Us'},{k:'privacy',l:'Privacy Policy'},{k:'terms',l:'Terms'},{k:'shipping',l:'Shipping'},{k:'support',l:'Help & Support'}];
  return(
    <div className="text-center font-poppins px-5 py-6 md:px-6 md:py-8 rounded-none md:rounded-2xl mb-0 md:mb-4"
      style={{background:`linear-gradient(135deg, var(--primary), var(--primary-dark))`,color:'rgba(255,255,255,0.85)',fontSize:'0.78rem',lineHeight:2}}>
      <div className="flex items-center justify-center gap-2.5" style={{marginBottom:8}}>
        <img src={s.logo_url||'/icons/rk-logo.svg'} alt={s.shop_name||'RK Grocery Mart'} style={{width:38,height:38,borderRadius:12}}/>
        <div className="text-left">
          <div className="text-white font-extrabold font-poppins" style={{fontSize:'1.15rem',lineHeight:1.1}}><MultiColorName name={s.shop_name||'RK Grocery Mart'} colors={['var(--yellow)','#FFFFFF']}/></div>
          <div className="text-white/75 font-poppins" style={{fontSize:'0.7rem'}}>{s.footer_text||'हर घर की पसंद'}</div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-4 flex-wrap" style={{margin:'8px 0'}}>
        <span className="flex items-center gap-1"><span>⚡</span><span className="text-xs">Fast delivery</span></span>
        <span className="flex items-center gap-1"><span>🌿</span><span className="text-xs">Aapke mohalle ki dukaan</span></span>
      </div>
      {s.contact&&<div>📞 Call/WhatsApp: {s.contact}</div>}
      <div>⏰ {s.open_time||'7:00 AM'} – {s.close_time||'10:00 PM'}</div>
      {socials.length>0&&(
        <div className="flex items-center justify-center gap-3" style={{margin:'6px 0'}}>
          {socials.map(x=>(
            <a key={x.label} href={x.href} target="_blank" rel="noopener noreferrer" aria-label={x.label}
              style={{color:'#fff',background:'rgba(255,255,255,0.14)',width:34,height:34,borderRadius:'50%',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:'0.95rem'}}>{x.icon}</a>
          ))}
        </div>
      )}
      <div className="flex items-center justify-center gap-3 flex-wrap" style={{margin:'6px 0'}}>
        {legal.map(x=>x.k==='support'
          ?<a key={x.k} href="support.html" style={{color:'#fff',textDecoration:'underline'}}>{x.l}</a>
          :<button key={x.k} onClick={()=>onNav(x.k)} style={{color:'#fff',textDecoration:'underline',background:'none'}}>{x.l}</button>)}
      </div>
      <a href="support.html"
        style={{display:'inline-flex',alignItems:'center',gap:7,color:'#fff',background:'rgba(255,255,255,0.16)',padding:'9px 20px',borderRadius:50,fontWeight:700,fontSize:'.78rem',textDecoration:'none',marginTop:10,transition:'transform .15s'}}>
        <MessageCircle size={15}/> Help &amp; Support — Ananya AI
      </a>
      <div style={{marginTop:8,opacity:0.7}}>© {new Date().getFullYear()} {s.shop_name||'RK Grocery Mart'} — {s.footer_text||'हर घर की पसंद'}</div>
    </div>
  );
}

function HomeContent({homepageSections,banners,bannersLoading,bannerIdx,setBannerIdx,bannerWrapRef,handleBannerClick,homeSections,homeLoading,cart,addToCart,updQty,onDetail,cats,catsLoading,catEmoji,sectionProds,sectionProdsReady,featLoading,featuredProds,dbReviews,shopSettings,showToast,setPage,onPickCategory,wishlistIds,onWishlist,adStrips,onAdClick}){
  return(
    <div className="max-w-site mx-auto px-2 md:px-8 pt-4 pb-6 md:pb-8">
      {/* Admin Homepage Builder: sections configured order mein + sirf enabled walay */}
      {(() => {
        // Hook ab saare rows (enabled + disabled) deta hai — yahan rendering ke
        // liye sirf enabled sections filter karo. ownCatIds ko saare rows se
        // banao taaki hidden category ko aggregate fallback mein dobara na dikhaye.
        const ordered=(homepageSections.length?homepageSections:DEFAULT_HOMEPAGE_SECTIONS).filter(s=>typeof s==='string'||s?.enabled!==false);
        // Category Sections: har category ka apna Section Order row hota hai
        // (admin drag karke kahin bhi rakh sakta hai — ad strips categories ke
        // beech bhi). ownCatIds = jinke apne row hain (hidden wale bhi).
        // Aggregate entry sirf un categories ko dikhati hai jinka apna row NAHI
        // bana (nayi category banne par turant dikhti hai, jab tak admin "Sync
        // Categories" na dabaye).
        const ownCatIds=new Set((homepageSections||[]).filter(s=>typeof s==='object'&&s?.key==='category_sections'&&s?.category_id).map(s=>s.category_id));
        const catRail=(c)=>{
          const items=sectionProds[c.id];
          if(sectionProdsReady&&(!items||items.length===0)){
            return(
              <div key={c.id}>
                <h2 className="mb-3"><TitlePill>{c.name}</TitlePill></h2>
                <div className="rounded-2xl p-5 text-center" style={{background:'var(--card-bg)'}}>
                  <p className="text-xs font-poppins" style={{color:'var(--gray)'}}>Is category ke products jald aa rahe hain 🛒</p>
                </div>
              </div>
            );
          }
          return(
            <ProductRail key={c.id} title={c.name} loading={!sectionProdsReady} products={items}
              onSeeAll={()=>onPickCategory(c.id)} cart={cart} addToCart={addToCart} updQty={updQty} onDetail={onDetail}
              titlePill wishlistIds={wishlistIds} onWishlist={onWishlist}/>
          );
        };
        const sectionsMap = {
          hero: <HeroBanner banners={banners} bannersLoading={bannersLoading} bannerIdx={bannerIdx} setBannerIdx={setBannerIdx} wrapRef={bannerWrapRef} handleBannerClick={handleBannerClick}/>,
          flash_sale: <FlashSale prods={homeSections.flash} loading={homeLoading} cart={cart} addToCart={addToCart} updQty={updQty} onDetail={onDetail} wishlistIds={wishlistIds} onWishlist={onWishlist}/>,
          today_deals: <ProductRail title="🔥 Today's Deals" loading={homeLoading} products={homeSections.deals} onSeeAll={()=>setPage('shop')} cart={cart} addToCart={addToCart} updQty={updQty} onDetail={onDetail} wishlistIds={wishlistIds} onWishlist={onWishlist}/>,
          categories: <CategoryRail heading="Shop by Category" cats={cats} catsLoading={catsLoading} catEmoji={catEmoji} onClick={onPickCategory} onSeeAll={()=>setPage('shop')} tileClass="w-20 md:w-24"/>,
          featured: <ProductRail title="⭐ Featured Products" loading={featLoading} products={featuredProds} onSeeAll={()=>setPage('shop')} cart={cart} addToCart={addToCart} updQty={updQty} onDetail={onDetail} wishlistIds={wishlistIds} onWishlist={onWishlist}/>,
          best_sellers: <ProductRail title="🏆 Best Sellers" loading={homeLoading} products={homeSections.bestSellers} onSeeAll={()=>setPage('shop')} cart={cart} addToCart={addToCart} updQty={updQty} onDetail={onDetail} wishlistIds={wishlistIds} onWishlist={onWishlist}/>,
          new_arrivals: <ProductRail title="✨ New Arrivals" loading={homeLoading} products={homeSections.newArrivals} onSeeAll={()=>setPage('shop')} cart={cart} addToCart={addToCart} updQty={updQty} onDetail={onDetail} wishlistIds={wishlistIds} onWishlist={onWishlist}/>,
          // Aggregate fallback: sirf wo categories jinka apna Section Order row
          // NAHI hai (nayi categories — admin sync na karne tak yahan dikhti hain).
          category_sections: cats.filter(c=>!ownCatIds.has(c.id)).map(catRail),

          why_choose_us: <WhyChooseUs productCount={sectionProdsReady?Object.values(sectionProds).reduce((s,l)=>s+(l||[]).length,0):0} catCount={cats.length}/>,
          reviews: <CustomerReviews reviews={dbReviews}/>,
          download_app: <DownloadApp onInstall={()=>openAppDownload(showToast)}/>,
          newsletter: <Newsletter showToast={showToast}/>,
          how_it_works: (
            <div className="rounded-2xl p-5 md:p-6" style={{background:'var(--card-bg)'}}>
              <div className="font-extrabold font-poppins text-sm md:text-base" style={{color:'var(--dark)'}}>How It Works</div>
              <div className="grid grid-cols-3 gap-3 md:gap-6 mt-4">
                {[{i:'📱',t:'Open the app',s:'Search what you need'},{i:'🛒',t:'Place an order',s:'Add items to cart & checkout'},{i:'🚴',t:'Get fast delivery',s:'Delivered in 1-2 hours'}].map((h,i)=>(
                  <div key={i} className="text-center">
                    <div className="text-2xl md:text-3xl mb-1.5">{h.i}</div>
                    <div className="font-bold font-poppins text-xs md:text-sm" style={{color:'var(--dark)'}}>{h.t}</div>
                    <div className="text-[10px] md:text-xs font-poppins mt-0.5" style={{color:'var(--gray)'}}>{h.s}</div>
                  </div>
                ))}
              </div>
            </div>
          ),
        };
        let firstSection=true;
        const out=[];
        // Ad strips ab Section Order ke andar hi hain (homepage_sections me
        // section_key='ad_strip' + ad_strip_id) — isliye yahan position-based
        // interleave nahi, seedha order ke hisaab se render hota hai. Admin
        // Section Order list me drag karke upar-niche kar sakta hai.
        ordered.forEach((sec)=>{
          const key=typeof sec==='string'?sec:sec?.key;
          const stripId=typeof sec==='object'?(sec?.ad_strip_id||null):null;
          const catId=typeof sec==='object'?(sec?.category_id||null):null;
          if(key==='ad_strip'){
            const strip=(adStrips||[]).find(s=>s.id===stripId);
            if(strip){
              const cls=firstSection?'':'mt-6 md:mt-8';
              firstSection=false;
              out.push(<div key={`ad-${strip.id}`} className={cls}><AdStripSection strip={strip} onAdClick={onAdClick}/></div>);
            }
            return;
          }
          // Per-category section: sirf us category ka rail (Section Order me
          // har category ka apna row hota hai — ad strips categories ke beech bhi)
          if(key==='category_sections'&&catId){
            const c=cats.find(x=>x.id===catId);
            if(c){
              const cls=firstSection?'':'mt-6 md:mt-8';
              firstSection=false;
              out.push(<div key={`cat-${c.id}`} className={cls}>{catRail(c)}</div>);
            }
            return;
          }
          const el=sectionsMap[key];
          if(!el)return;
          const items=Array.isArray(el)?el:[el];
          items.forEach((item,idx)=>{
            const cls=firstSection?'':'mt-6 md:mt-8 empty:hidden';
            firstSection=false;
            out.push(<div key={`${key}-${idx}`} className={cls}>{item}</div>);
          });
        });
        return out;
      })()}

      <div className="mt-6 md:mt-8"><Footer shopSettings={shopSettings} onNav={setPage}/></div>
    </div>
  );
}

function DesktopShop({allCats,activeCatId,catEmoji,catCounts,visibleShopProds,shopIsLoading,isSearchActive,searchResults,shopTotal,inStockOnly,search,sortBy,setSortBy,cart,addToCart,updQty,onDetail,totalPages,shopPage,setShopPage,onSidebarPick,wishlistIds,onWishlist}){
  const prods=visibleShopProds;
  const isLoading=shopIsLoading;
  const activeCatName=allCats.find(c=>c.id===activeCatId)?.name||'All Products';
  const countLabel=isLoading?'Loading…':(inStockOnly?`${prods.length} in stock`:`${isSearchActive?searchResults.length:shopTotal} Products`);
  return(
    <div className="flex items-start max-w-site mx-auto px-4 md:px-7">
      <DesktopSidebar allCats={allCats} activeCatId={activeCatId} catEmoji={catEmoji} counts={catCounts} onPick={onSidebarPick}/>
      <div className="flex-1 min-w-0 py-4">
        <div className="rounded-2xl p-4 md:p-5" style={{background:'var(--card-bg)'}}>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="min-w-0">
              <div className="font-extrabold font-poppins text-sm" style={{color:'var(--dark)'}}>{countLabel}</div>
              <div className="text-xs font-poppins truncate" style={{color:'var(--gray)'}}>{activeCatName}{search?` • "${search}"`:''}</div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <select value={sortBy} onChange={e=>setSortBy(e.target.value)} aria-label="Sort products"
                className="text-xs font-poppins font-semibold rounded-xl px-3 py-2 outline-none"
                style={{border:'1.5px solid var(--border)',background:'var(--page-bg)',color:'var(--dark)'}}>
                {SORT_OPTIONS.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs font-semibold font-poppins cursor-pointer select-none" style={{color:'var(--dark)'}}>
                <input type="checkbox" checked={inStockOnly} onChange={e=>setInStockOnly(e.target.checked)} style={{accentColor:'var(--primary)',width:15,height:15}}/>
                In stock only
              </label>
            </div>
          </div>
          {isLoading
            ?<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4" aria-busy="true" aria-label="Products load ho rahe hain">{[...Array(8)].map((_,i)=><SkelCard key={i}/>)}</div>
            :prods.length===0
              ?<div className="text-center py-16">
                <div style={{fontSize:'3rem'}}>🔍</div>
                <p className="mt-2.5 font-semibold font-poppins text-sm" style={{color:'var(--gray)'}}>"{search||activeCatName}" mein koi product nahi mila</p>
                {inStockOnly&&<button onClick={()=>setInStockOnly(false)} className="text-xs font-bold font-poppins mt-2" style={{color:'var(--primary)'}}>"In stock only" filter hataayein</button>}
              </div>
              :<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">{prods.map(p=><PCard key={p.id} p={p} cart={cart} addToCart={addToCart} updQty={updQty} onDetail={onDetail} wishlistIds={wishlistIds} onWishlist={onWishlist}/>)}</div>
          }
          {!search&&totalPages>1&&(
            <div className="flex justify-center flex-wrap gap-2 mt-6">
              {[...Array(totalPages)].map((_,i)=>{
                const on=shopPage===i+1;
                return(
                  <button key={i} onClick={()=>setShopPage(i+1)}
                    className="w-8 h-8 rounded-lg text-[13px] font-bold font-poppins flex items-center justify-center"
                    style={{border:`1.5px solid ${on?'var(--primary)':'var(--border)'}`,background:on?'var(--primary)':'transparent',color:on?'#fff':'var(--gray)'}}>
                    {i+1}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Module 12: Premium homepage sections ────────────────────
// All standalone (stable component types, like CategoryRail) so their
// internal timers/state never remount when App re-renders.

function useCountdownToMidnight(){
  const [left,setLeft]=useState(()=>{const n=new Date();const e=new Date(n);e.setHours(24,0,0,0);return Math.max(0,e-n);});
  useEffect(()=>{
    const tick=()=>{const n=new Date();const e=new Date(n);e.setHours(24,0,0,0);setLeft(Math.max(0,e-n));};
    const t=setInterval(tick,1000);
    return()=>clearInterval(t);
  },[]);
  return left;
}

// ⚡ Flash Sale — real discounted products from useHomeSections, countdown to midnight
function FlashSale({prods,loading,cart,addToCart,updQty,onDetail,wishlistIds,onWishlist}){
  const left=useCountdownToMidnight();
  if(!loading&&prods.length===0)return null;
  const pad=n=>String(n).padStart(2,'0');
  const h=Math.floor(left/3.6e6),m=Math.floor(left%3.6e6/6e4),s=Math.floor(left%6e4/1e3);
  const chips=[{v:h,l:'Hours'},{v:m,l:'Min'},{v:s,l:'Sec'}];
  return(
    <div className="rounded-3xl p-4 md:p-6"
      style={{background:'linear-gradient(120deg,#14532D,#15803D 55%,#166534)',boxShadow:'0 10px 30px rgba(21,128,61,0.35)'}}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xl md:text-2xl animate-pulse">⚡</span>
          <h2 className="text-white font-extrabold font-poppins text-base md:text-xl">Flash Sale</h2>
          <span className="hidden sm:inline-block text-white/70 text-xs font-poppins">Sirf aaj ke liye!</span>
        </div>
        <div className="flex items-center gap-1.5" role="timer" aria-label="Flash sale countdown">
          <span className="text-white/80 text-[10px] md:text-xs font-bold font-poppins mr-1">Ends in</span>
          {chips.map(t=>(
            <div key={t.l} className="flex flex-col items-center bg-white/15 backdrop-blur rounded-xl px-2 py-1 md:px-3 md:py-1.5 min-w-[50px]">
              <span className="text-white font-black font-poppins text-sm md:text-lg tabular-nums">{pad(t.v)}</span>
              <span className="text-white/70 text-[8px] md:text-[9px] font-poppins uppercase tracking-wide">{t.l}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-3 md:gap-4 overflow-x-auto pb-1 mt-4 snap-x scrollbar-hide">
        {loading
          ?[...Array(4)].map((_,i)=><div key={i} className="flex-shrink-0 w-36 md:w-44 snap-start"><SkelCard/></div>)
          :prods.map(p=>(
            <div key={p.id} className="flex-shrink-0 w-36 md:w-44 snap-start">
              <PCard p={p} cart={cart} addToCart={addToCart} updQty={updQty} onDetail={onDetail} wishlistIds={wishlistIds} onWishlist={onWishlist}/>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// 💚 Why Choose Us — static premium feature grid (product/category count real data se)
function WhyChooseUs({productCount=0,catCount=0}){
  const feats=[
    {icon:Zap,title:'Lightning Delivery',desc:'1-2 ghante mein order aapke ghar tak'},
    {icon:Leaf,title:'Fresh & Natural',desc:'Roz subah mandi se fresh fruits-sabziyan'},
    {icon:BadgePercent,title:'Best Prices',desc:'Market se saste — daily deals & coupons'},
    {icon:ShieldCheck,title:'100% Safe Payments',desc:'UPI, cards, netbanking — secure checkout'},
    {icon:Package,title:'Wide Selection',desc:productCount>0?`${productCount}+ products, ${catCount>0?catCount+' categories':''} — sab kuch ek jagah`:'Sab kuch ek jagah — grocery, dairy, snacks'},
    {icon:Headphones,title:'24x7 Support',desc:'Ananya AI + WhatsApp — kabhi bhi help'},
  ];
  return(
    <div>
      <h2 className="text-base md:text-xl font-bold font-poppins" style={{color:'var(--dark)'}}>Why Choose <span style={{color:'var(--primary)'}}>RK Grocery Mart?</span></h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mt-4">
        {feats.map(f=>{
          const Icon=f.icon;
          return(
            <div key={f.title} className="rounded-2xl p-4 md:p-5 transition-transform hover:-translate-y-1"
              style={{background:'var(--card-bg)',boxShadow:'0 2px 10px rgba(0,0,0,0.06)'}}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:'var(--primary-light)'}}>
                <Icon size={20} style={{color:'var(--primary)'}}/>
              </div>
              <div className="mt-2.5 font-bold font-poppins text-xs md:text-sm" style={{color:'var(--dark)'}}>{f.title}</div>
              <div className="mt-0.5 text-[10px] md:text-xs font-poppins leading-snug" style={{color:'var(--gray)'}}>{f.desc}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ⭐ Customer Reviews — admin-approved reviews (reviews table) with fallback grid
// Fix 2026-08-13: hardcoded "4.8/5" + fake "✓ Verified" hata diya — ab average
// approved reviews se compute hota hai aur sirf tab dikhta hai jab real reviews hon.
function CustomerReviews({reviews=[]}){
  const fallback=[
    {name:'Priya Sharma',place:'Jaunpur',stars:5,text:'Roj ka saman ab online — fresh sabziyan aur 1-2 ghante mein delivery! Bahut badhiya service.'},
    {name:'Rahul Verma',place:'Safiabad',stars:5,text:'Rate market se kam hain aur coupons se aur bachat. UPI payment ekdum aasaan.'},
    {name:'Sunita Devi',place:'Shahganj',stars:4,text:'Ananya AI se pooch kar order kiya — bilkul sahi product mila. Highly recommended!'},
    {name:'Amit Yadav',place:'Machhlishahr',stars:5,text:'COD option hone se ghar walon ko bhi bharosa hai. RK Grocery Mart = ghar ki dukaan.'},
  ];
  const realAvg = reviews.length
    ? (reviews.reduce((s,r)=>s+(Number(r.rating)||0),0)/reviews.length).toFixed(1)
    : null;
  // Admin ke Reviews page par APPROVED reviews hi yahan aate hain; agar koi
  // nahi hai to purana curated fallback dikhta hai (khaali section kabhi nahi).
  const list=reviews.length
    ?reviews.map(r=>({name:r.customer_name||'Customer',place:'Admin-approved ✓',stars:Math.max(1,Math.min(5,r.rating||5)),text:r.comment||'',reply:r.admin_reply}))
    :fallback;
  return(
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base md:text-xl font-bold font-poppins" style={{color:'var(--dark)'}}>Kya Kehte Hain <span style={{color:'var(--primary)'}}>Hamare Customers?</span></h2>
        {realAvg&&(
          <span className="hidden md:flex items-center gap-1 text-xs font-bold font-poppins px-3 py-1.5 rounded-full" style={{background:'var(--primary-light)',color:'var(--primary-dark)'}}>⭐ {realAvg}/5 average ({reviews.length} reviews)</span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {list.map((r,idx)=>(
          <div key={r.name+idx} className="rounded-2xl p-4 md:p-5" style={{background:'var(--card-bg)',boxShadow:'0 2px 10px rgba(0,0,0,0.06)'}}>
            <div className="text-[#FFB800] text-sm tracking-tight">{"★★★★★".slice(0,r.stars)}{"☆".repeat(5-r.stars)}</div>
            <p className="mt-2.5 text-xs md:text-[13px] font-poppins leading-relaxed" style={{color:'var(--text)'}}>“{r.text}”</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{background:'linear-gradient(135deg,var(--primary),var(--orange))'}}>{r.name[0]}</div>
              <div>
                <div className="text-xs font-bold font-poppins" style={{color:'var(--dark)'}}>{r.name}</div>
                <div className="text-[10px] font-poppins" style={{color:'var(--gray)'}}>{r.place}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 📱 Download App — PWA install CTA
function DownloadApp({onInstall}){
  return(
    <div className="rounded-3xl p-5 md:p-8 flex flex-col md:flex-row items-center gap-5 md:gap-8"
      style={{background:'linear-gradient(135deg,#16A34A,#15803D)'}}>
      <div className="flex-1 text-center md:text-left">
        <h2 className="text-white font-extrabold font-poppins text-lg md:text-2xl">App Install Karein 📱</h2>
        <p className="text-white/80 text-xs md:text-sm font-poppins mt-1.5 leading-relaxed">Fast loading, offline access aur home screen se ek-tap shopping — bilkul free!</p>
        <ul className="mt-3 space-y-1.5 text-left inline-block">
          {['Offline mein bhi browse karein','Weekly app-exclusive offers','1-tap reorder & notifications'].map(t=>(
            <li key={t} className="flex items-center gap-2 text-white/90 text-xs md:text-[13px] font-poppins"><span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[9px]">✓</span>{t}</li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2.5 justify-center md:justify-start">
          <button onClick={onInstall} className="flex items-center gap-2 bg-white text-[#15803D] font-extrabold font-poppins text-xs md:text-sm px-4 md:px-5 py-2.5 rounded-xl shadow-lg hover:scale-[1.03] active:scale-95 transition-transform">
            <Download size={16}/> Download App
          </button>
          <span className="text-white/70 text-[10px] md:text-xs font-poppins self-center">Android APK • Free • 1-tap install</span>
        </div>
      </div>
      <div className="text-7xl md:text-8xl select-none" aria-hidden="true">🛒</div>
    </div>
  );
}

// 📬 Newsletter — real subscribe (newsletter_subscribers table; pehle sirf toast tha)
function Newsletter({showToast}){
  const [email,setEmail]=useState('');
  const [busy,setBusy]=useState(false);
  const submit=async e=>{
    e.preventDefault();
    const em=email.trim();
    if(!em||!/\S+@\S+\.\S+/.test(em)){showToast('Sahi email daalein 🙏');return;}
    if(busy)return;
    setBusy(true);
    try{
      const {error}=await supabase.from('newsletter_subscribers').insert({email:em});
      if(error&&error.code==='23505'){showToast('Ye email pehle se subscribed hai ✅');}
      else if(error){showToast('Subscribe nahi hua — dobara try karein 🙏');}
      else{showToast('Subscribe ho gaye! Offers aapke inbox mein 🎉');setEmail('');}
    }catch(_){showToast('Subscribe nahi hua — dobara try karein 🙏');}
    setBusy(false);
  };
  return(
    <div className="rounded-3xl p-5 md:p-8 text-center" style={{background:'var(--primary-light)'}}>
      <h2 className="font-extrabold font-poppins text-base md:text-xl" style={{color:'var(--primary-dark)'}}>Weekly Offers &amp; Deals 📬</h2>
      <p className="text-xs md:text-sm font-poppins mt-1" style={{color:'var(--gray)'}}>Register karein — har hafte naye coupons aur flash sale alerts seedha inbox mein.</p>
      <form onSubmit={submit} className="mt-4 flex flex-col sm:flex-row gap-2.5 max-w-md mx-auto">
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="aapka@email.com" aria-label="Newsletter email"
          className="flex-1 rounded-xl px-4 py-3 text-sm font-poppins outline-none"
          style={{border:'1.5px solid var(--border)',background:'var(--card-bg)',color:'var(--dark)'}}/>
        <button type="submit" className="text-white font-bold font-poppins text-sm rounded-xl px-5 py-3 flex items-center justify-center gap-2"
          style={{background:'linear-gradient(135deg,var(--primary),var(--primary-dark))'}}>
          <Send size={15}/> Subscribe
        </button>
      </form>
    </div>
  );
}

// ── InfoPage building blocks ─────────────────────────────────
function IHead({icon:Icon,children}){
  return(
    <h2 className="flex items-center gap-2 font-extrabold font-poppins text-sm md:text-base mt-7 mb-2 first:mt-0" style={{color:'var(--dark)'}}>
      {Icon&&<span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{background:'var(--primary-light)'}}><Icon size={15} style={{color:'var(--primary)'}}/></span>}
      <span>{children}</span>
    </h2>
  );
}
function IP({children}){
  return <p className="text-[13px] md:text-sm font-poppins leading-relaxed mb-2.5" style={{color:'var(--text)'}}>{children}</p>;
}
function IBullets({items}){
  return(
    <ul className="my-2 space-y-1.5">
      {items.map((it,i)=>(
        <li key={i} className="flex gap-2.5 text-[13px] md:text-sm font-poppins leading-relaxed" style={{color:'var(--text)'}}>
          <span className="mt-1 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold" style={{background:'var(--primary)',color:'#fff'}}>✓</span>
          <span dangerouslySetInnerHTML={{__html:it}}/>
        </li>
      ))}
    </ul>
  );
}
function IFeatures({items}){
  return(
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
      {items.map(x=>(
        <div key={x.t} className="rounded-2xl p-4" style={{background:'var(--page-bg)',border:'1px solid var(--border)'}}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg mb-2" style={{background:'var(--primary-light)'}}>{x.e}</div>
          <div className="font-bold font-poppins text-[13px] md:text-sm" style={{color:'var(--dark)'}}>{x.t}</div>
          <div className="font-poppins text-[11px] md:text-xs leading-snug mt-0.5" style={{color:'var(--gray)'}}>{x.d}</div>
        </div>
      ))}
    </div>
  );
}
function IStats({items}){
  return(
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
      {items.map(x=>(
        <div key={x.l} className="rounded-2xl p-3.5 text-center" style={{background:'var(--page-bg)',border:'1px solid var(--border)'}}>
          <div className="font-extrabold font-poppins text-lg md:text-xl" style={{color:'var(--primary)'}}>{x.v}</div>
          <div className="text-[10px] md:text-xs font-poppins font-medium mt-0.5" style={{color:'var(--gray)'}}>{x.l}</div>
        </div>
      ))}
    </div>
  );
}
function ITable({head,rows}){
  return(
    <div className="rounded-2xl overflow-hidden my-3" style={{border:'1px solid var(--border)'}}>
      <div className="grid grid-cols-3 text-[11px] md:text-xs font-bold font-poppins" style={{background:'var(--primary-light)',color:'var(--primary-dark)'}}>
        {head.map(h=><div key={h} className="px-3 py-2.5">{h}</div>)}
      </div>
      {rows.map((r,i)=>(
        <div key={i} className="grid grid-cols-3 text-[11px] md:text-[13px] font-poppins" style={{borderTop:'1px solid var(--border)',background:'var(--card-bg)',color:'var(--text)'}}>
          {r.map((c,j)=><div key={j} className="px-3 py-2.5">{c}</div>)}
        </div>
      ))}
    </div>
  );
}
function ICall({title,children,icon:Icon=HelpCircle}){
  return(
    <div className="rounded-2xl p-4 mt-4 flex gap-3" style={{background:'var(--primary-light)',border:'1px solid var(--border)'}}>
      <span className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center" style={{background:'var(--primary)'}}><Icon size={16} color="#fff"/></span>
      <div>
        <div className="font-bold font-poppins text-xs md:text-sm" style={{color:'var(--primary-dark)'}}>{title}</div>
        <div className="font-poppins text-[12px] md:text-[13px] leading-relaxed mt-0.5" style={{color:'var(--text)'}}>{children}</div>
      </div>
    </div>
  );
}

// ── Default page content (admin shop_settings se override hota hai) ──
function AboutBody(){
  return(
    <div>
      <IP><strong style={{color:'var(--dark)'}}>RK Grocery Mart</strong> ek modern online grocery store hai — jahan aapke mahine ke sabzi-fruits se lekar daily dairy, atta-dal, snacks aur ghar ke zaroori saman tak, sab kuch ek hi jagah milta hai aur seedha aapke ghar tak pahunchta hai. Humari maan-na hai ki grocery shopping boring nahi honi chahiye — na lambi queues, na bhaari bags uthana, na expiry date ka darr.</IP>
      <IP>2024 mein ek chhoti si local kirana store se shuru hua hamara safar, aaj hazaron families ki monthly routine ban chuka hai. Rozana hazaron orders deliver karke hum sirf saman nahi bhejte — ek bharosa bhejte hain jo har fresh item, har on-time delivery aur har fair price ke saath mazboot hota hai.</IP>

      <IHead icon={Store}>Hamari Kahani (Our Story)</IHead>
      <IP>Sabki tarah hamari bhi shuruaat ek chhoti si problem se hui: mohalle ki dukaan band ho jaati thi, bazaar jaane ka time nahi milta tha, aur jo milta tha uski quality check karne ka mauka nahi milta. Isi problem ka solution banne ke liye RK Grocery Mart ka janam hua.</IP>
      <IP>Humne decide kiya ki technology sirf bade logon ke liye nahi — har mohalle ki family ke liye honi chahiye. Aaj hamara platform aapko Blinkit-speed delivery nahi, balki <strong style={{color:'var(--dark)'}}>apne mohalle wali dukaan ka bharosa</strong> deta hai, sirf ek app-tap ki doori par.</IP>

      <IHead icon={Star}>Jis Par Hamara Bharosa Hai (Our Values)</IHead>
      <IFeatures items={[
        {e:'🌿',t:'100% Fresh Promise',d:'Sabzi, fruits aur dairy daily fresh — 24 ghante ke andar kharab item free replacement.'},
        {e:'🏷️',t:'Fair & Transparent Pricing',d:'Jo price dikhe wahi pay karo — koi hidden charge, koi last-minute surprise nahi.'},
        {e:'⚡',t:'Lightning-Fast Delivery',d:'7 AM se 10 PM tak — average 60-90 minute mein order aapke darwaze par.'},
      ]}/>

      <IHead icon={Users}>Hamari Khaas Baat (Why Families Love Us)</IHead>
      <IBullets items={[
        '<strong style="color:var(--dark)">Har ghar ke liye poora store</strong> — 16 categories mein 5,000+ products: fresh fruits & vegetables, dairy & eggs, staples (atta, rice, dal), snacks, beverages, chocolates, personal care, home cleaning aur baby care.',
        '<strong style="color:var(--dark)">Quality check har order par</strong> — har picking se pehle hamari team expiry date, packaging aur freshness verify karti hai.',
        '<strong style="color:var(--dark)">Local vendors ka saath</strong> — jitna ho sakein hum local farmers aur distributors se leta hai, taaki aapko taaza samaan mile aur unhein fair price mile.',
        '<strong style="color:var(--dark)">Easy payment</strong> — UPI, cards, netbanking, cash on delivery aur wallet — jo aapko convenient lage.',
        '<strong style="color:var(--dark)">Ananya AI support</strong> — 24x7 chat assistant jo order status, products aur offers ka turant jawab deta hai.',
      ]}/>

      <IHead icon={Zap}>Numbers Mein</IHead>
      <IStats items={[
        {v:'5,000+',l:'Products'},
        {v:'16',l:'Categories'},
        {v:'60-90 min',l:'Avg. Delivery'},
        {v:'7 AM–10 PM',l:'Daily Open'},
      ]}/>

      <IHead icon={ShieldCheck}>Hamara Waada (Our Promise)</IHead>
      <IBullets items={[
        'Har order par freshness ki guarantee — pasand na aaye to 24 ghante mein replacement ya full refund.',
        'Kabhi bhi koi delivery charge ka surprise nahi — charges order confirm karne se pehle clearly dikhaye jaate hain.',
        'Aapka data sirf order process karne ke liye — kabhi becha nahi jaata (details: Privacy Policy).',
        'Koi bhi issue ho, hum 24x7 available hain — WhatsApp, call ya email, jaise aapko convenient ho.',
      ]}/>

      <ICall title="Hamse Baat Karein" icon={MessageCircle}>
        Koi sawaal, feedback ya suggestion? Hamari team sunna chahti hai. 📞 <strong>+91 63931 96765</strong> · 📧 <strong>support@rkgrocerymart.com</strong> · ya seedha <a href="support.html" style={{color:'var(--primary)',fontWeight:700,textDecoration:'underline'}}>Help &amp; Support</a> page par Ananya AI se baat karein.
      </ICall>
    </div>
  );
}

function PrivacyBody(){
  return(
    <div>
      <IP><strong style={{color:'var(--dark)'}}>RK Grocery Mart</strong> ("hum", "hamara") aapki privacy ko seriously leta hai. Yeh Privacy Policy batati hai ki aapki site/app use karte waqt kaun si jaankari collect hoti hai, usse kaise use karte hain, aur usse kaise protect karte hain. Yeh policy har visitor, customer aur vendor par laagu hoti hai.</IP>

      <IHead icon={Lock}>1. Hum Kaun Si Jaankari Collect Karte Hain</IHead>
      <IBullets items={[
        '<strong style="color:var(--dark)">Account details</strong> — naam, mobile number, email address, delivery address (jab aap sign up ya order karte hain).',
        '<strong style="color:var(--dark)">Order information</strong> — aapne kya order kiya, order value, delivery slot, order history aur preferences.',
        '<strong style="color:var(--dark)">Payment details</strong> — hum sirf payment status aur reference number rakhte hain. Card number, CVV ya UPI PIN humare servers par kabhi store nahi hote — payments trusted third-party payment gateways ke through process hote hain.',
        '<strong style="color:var(--dark)">Technical data</strong> — device type, browser, IP address, app version aur crash logs (performance behtar karne ke liye).',
        '<strong style="color:var(--dark)">Communications</strong> — WhatsApp, call, email ya chat (Ananya AI) par aapki humse hui baatcheet, taaki hum aapki history yaad rakhein aur behtar help kar sakein.',
      ]}/>

      <IHead icon={FileText}>2. Hum Jaankari Kaise Use Karte Hain</IHead>
      <IBullets items={[
        'Aapka order process karne, deliver karne aur status update dene ke liye.',
        'Payment verify karne, refunds process karne aur invoice dene ke liye.',
        'Account create karne, login karne aur fraud/unauthorized activity rokne ke liye.',
        'Customer support dene — koi complaint ya refund request ho to hum aapka record dekh sakein.',
        'Offers, coupons aur naye deals personalize karne (aap inbox se opt-out kar sakte hain).',
        'Site/app ki performance, safety aur usability improve karne ke liye analytics.',
        'Kanooni zarooraton ko poora karne ke liye (jaise taxation ya consumer law).',
      ]}/>

      <IHead icon={Wallet}>3. Payment Security</IHead>
      <IP>Har payment PCI-DSS compliant payment partners ke through encrypted (SSL/TLS) hota hai. Hum aapke card ya UPI credentials apne system mein nahi rakhte — na hi hum unhein dekh sakte hain. UPI ID se pay karne par bhi hum sirf transaction reference store karte hain.</IP>

      <IHead icon={ShieldCheck}>4. Cookies aur Local Storage</IHead>
      <IP>Hum cookies aur browser local storage use karte hain taaki: login session, cart contents, theme preference (dark/light) aur location/area yaad rakha ja sake. Aap browser settings se cookies block kar sakte hain, lekin usse cart, login aur checkout jahi features kaam karna band kar sakte hain.</IP>

      <IHead icon={Users}>5. Jaankari Kise Share Hoti Hai</IHead>
      <IP>Hum aapki jaankari sirf in limited cases mein share karte hain:</IP>
      <IBullets items={[
        '<strong style="color:var(--dark)">Delivery partners</strong> — sirf naam, address aur phone number, taaki order deliver ho sake.',
        '<strong style="color:var(--dark)">Payment gateways</strong> — payment process karne ke liye.',
        '<strong style="color:var(--dark)">Analytics & hosting</strong> — service improve karne ke liye, anonymized data ke saath.',
        '<strong style="color:var(--dark)">Kanoon</strong> — agar kisi court order ya kanooni process ke tehat jaankari maangi jaye.',
      ]}/>
      <IP>Hum aapki jaankari <strong style={{color:'var(--dark)'}}>kabhi bechte nahi</strong> ya spam ke liye third parties ko nahi dete.</IP>

      <IHead icon={Clock}>6. Data Kitne Din Rakha Jaata Hai</IHead>
      <IP>Order aur transaction records hum tax/compliance ke liye required samay tak (aam taur par 5 saal tak) rakhte hain. Account delete karne par aapki personal details 30 din ke andar deactivate/delete kar di jaati hain (jo records kanooni rup se rakhne zaroori hain, wo chhod kar).</IP>

      <IHead icon={CheckCircle2}>7. Aapke Adhikar (Your Rights)</IHead>
      <IBullets items={[
        'Humare paas aapki kya jaankari hai uski copy maangna.',
        'Galat details theek karwana.',
        'Account aur associated personal data delete karwana.',
        'Marketing emails/SMS se opt-out karna.',
        'Koi bhi request: <strong style="color:var(--dark)">support@rkgrocerymart.com</strong> par email karein — hum 7 working days mein jawab dete hain.',
      ]}/>

      <IHead icon={ShieldCheck}>8. Bacchon Ki Privacy</IHead>
      <IP>Hamari services 18 saal se kam bacchon ke liye nahi hain. Hum jaan-boojh kar bacchon se jaankari collect nahi karte. Agar aapko lagta hai ki humne galti se bacche ki jaankari le li hai, to humein batayein — hum turant delete kar denge.</IP>

      <IHead icon={FileText}>9. Is Policy Mein Badlav</IHead>
      <IP>Kabhi kabhi hum is policy ko update kar sakte hain. Bade badlav par hum site par prominent notice ya SMS se inform karenge. Continue karne ka matlab hai aap updated policy se sehmat hain.</IP>

      <ICall title="Privacy Se Judi Koi Bhi Baat" icon={Mail}>
        Data access, correction ya deletion chahiye? 📧 <strong>support@rkgrocerymart.com</strong> par likhein ya 📞 <strong>+91 63931 96765</strong> par call karein. Hum aapki request ka jawab 7 working days denge.
      </ICall>
    </div>
  );
}

function TermsBody(){
  return(
    <div>
      <IP>Yeh Terms &amp; Conditions ("Terms") <strong style={{color:'var(--dark)'}}>RK Grocery Mart</strong> ki website, app aur services ke use ko control karti hai. Site use karte ya koi order place karne se, aap in Terms se sehmat hote hain. Agar aap sehmat nahi hain, to kripya site/service use na karein.</IP>

      <IHead icon={Users}>1. Account &amp; Registration</IHead>
      <IBullets items={[
        'Order place karne ke liye aapko valid mobile number aur delivery address dena zaroori hai.',
        'Aapka account sirf aapke personal use ke liye hai — credentials share karna ya account transfer karna allowed nahi hai.',
        'Aap responsible hain apne account par hone wali har activity ke liye. Koi suspicious activity dikhe to turant humein batayein.',
        'Galat ya misleading jaankari (naam, number, address) dene par order cancel ho sakta hai.',
      ]}/>

      <IHead icon={Store}>2. Products &amp; Availability</IHead>
      <IBullets items={[
        'Humare product images representative hain — actual packaging/brand ka look thoda alag ho sakta hai (weight/quantity hamesha wahi hota hai jo order kiya hai).',
        'Fresh items (sabzi, fruits, dairy) availability season aur daily stock par depend karti hai. Stock khatam hone par hum substitute ya refund dete hain — aapko pehle inform kiya jaata hai.',
        'Hum kisi bhi order ko stock issue, pricing error ya suspected fraud ke kaaran cancel karne ka adhikar rakhte hain — us case mein full refund milta hai.',
      ]}/>

      <IHead icon={Wallet}>3. Pricing &amp; Payment</IHead>
      <IBullets items={[
        'Saari prices Indian Rupees (₹) mein hain aur GST include karti hain (jahan laagu ho).',
        'Price order confirm karne par lock hoti hai. Pricing error ki wajah se cancel hone par full refund diya jaata hai.',
        'Accepted: UPI, debit/credit cards, net banking, wallets aur Cash on Delivery (COD).',
        'COD orders ke liye exact change ready rakhein — delivery partner change dene ki capacity mein nahi ho sakta.',
        'Coupon/discount offers ke apne terms hote hain aur kabhi kabhi ek dusre ke saath combine nahi hote.',
      ]}/>

      <IHead icon={CheckCircle2}>4. Order Confirmation &amp; Cancellation</IHead>
      <IBullets items={[
        'Order place karte hi aapko confirmation milta hai — lekin order tab confirm hota hai jab hum stock verify karke accept karein.',
        'Delivery se pehle tak aap kabhi bhi order cancel kar sakte hain — full refund, bina kisi charges ke.',
        'Refund usually 3-5 working days mein original payment method par reflect hota hai (bank ke hisaab se).',
        'Baar-baar orders cancel karne ya fake orders karne par account restrict ho sakta hai.',
      ]}/>

      <IHead icon={Truck}>5. Delivery</IHead>
      <IBullets items={[
        'Delivery time slots 7:00 AM se 10:00 PM (daily) available hain — slots aapke area ke hisaab se dikhte hain.',
        'Estimated time ETA hota hai, guarantee nahi — traffic, weather ya rush mein delay ho sakta hai.',
        'Ghar par koi na mile to delivery partner aapko call karega; 2 attempts ke baad order return ho jaata hai aur refund process hota hai.',
        'Delivery charges aur free-delivery threshold <a href="index.html#shipping" style="color:var(--primary);font-weight:700;text-decoration:underline">Delivery &amp; Shipping</a> page par diye gaye hain.',
      ]}/>

      <IHead icon={RotateCcw}>6. Returns, Refunds &amp; Replacements</IHead>
      <IBullets items={[
        '<strong style="color:var(--dark)">Freshness guarantee:</strong> koi bhi sabzi, fruit ya dairy product kharab/milawati lage to delivery ke 24 ghante ke andar photo bhejein — 100% replacement ya refund.',
        '<strong style="color:var(--dark)">Wrong/missing item:</strong> hum turant sahi item deliver karte hain ya uska paisa wapas dete hain.',
        '<strong style="color:var(--dark)">Sealed personal care &amp; baby products:</strong> unused, seal intact condition mein 7 din ke andar return.',
        'Kuch items returnable nahi hain: perishable fresh items (agar quality theek ho), personal care items jo open ho chuke ho, medicines aur innerwear.',
        'Refund ya to replacement, ya original payment method par — jaisa aap choose karein.',
      ]}/>

      <IHead icon={ShieldCheck}>7. Acceptable Use</IHead>
      <IBullets items={[
        'Site/app ka use kisi illegal, fraudulent ya dusron ko nuksaan pahunchane wale tarike se nahi karein.',
        'Automated bots, scraping, ya bina permission data extract karna strictly prohibited hai.',
        'Reviews sirf genuine purchases par diye jaayein — fake reviews par action le sakte hain.',
        'Humare logos, content ya branding bina written permission ke use karna allowed nahi hai.',
      ]}/>

      <IHead icon={ScrollText}>8. Intellectual Property</IHead>
      <IP>Is site ka poora content — naam, logo, design, images, product descriptions, code aur graphics — RK Grocery Mart ki property hai ya licensed hai. Bina written permission ke copy, modify ya redistribute karna strictly prohibited hai.</IP>

      <IHead icon={ShieldCheck}>9. Limitation of Liability</IHead>
      <IBullets items={[
        'Hum site aur services ko "jaisa hai" basis par provide karte hain — koi guarantee nahi ki hamesha bina ruke ya error-free chalegi.',
        'Humari maximum liability hamesha us order value tak limited hogi jise aapne us specific order ke liye pay kiya hai.',
        'Hum indirect, incidental ya consequential loss (jaise business loss, data loss) ke liye zimmedaar nahi honge.',
        'Kuch cheezein humare control se bahar hain: network outage, natural disaster, strikes ya government restrictions — inmein delay ke liye hum zimmedaar nahi, lekin hum aapke paise hamesha safe rakhte hain.',
      ]}/>

      <IHead icon={FileText}>10. Termination</IHead>
      <IP>Agar aap in Terms ka ulanghan karein, to hum bina notice ke aapka account aur orders suspend/terminate kar sakte hain. Aap bhi kabhi bhi apna account delete kar sakte hain (jo outstanding orders/refunds hain wo pehle settle ho jaayenge).</IP>

      <IHead icon={FileText}>11. Governing Law &amp; Disputes</IHead>
      <IP>Yeh Terms Bharat ke kanoon ke mutabik chalengi. Koi bhi dispute pehle friendly discussion se solve karne ki koshish hogi — humse <strong style={{color:'var(--dark)'}}>support@rkgrocerymart.com</strong> par contact karein. Settlement na ho to dispute jurisdiction ke relevant Indian courts mein jayega.</IP>

      <IHead icon={FileText}>12. Changes in Terms</IHead>
      <IP>Hum in Terms ko kabhi bhi update kar sakte hain. Naye changes site par publish hote hi laagu ho jaate hain. "Last updated" date dekh kar aap hamesha latest version check kar sakte hain. Continued use = updated Terms ki sehmati.</IP>

      <ICall title="Terms Se Judi Koi Shak?" icon={HelpCircle}>
        Koi bhi sawaal ho to order place karne se pehle poochh lein — hum khushi se explain karenge. 📞 <strong>+91 63931 96765</strong> · 📧 <strong>support@rkgrocerymart.com</strong> · ya <a href="support.html" style={{color:'var(--primary)',fontWeight:700,textDecoration:'underline'}}>Help &amp; Support</a>.
      </ICall>
    </div>
  );
}

function ShippingBody(){
  return(
    <div>
      <IP>RK Grocery Mart par hum chahte hain ki aapka samaan <strong style={{color:'var(--dark)'}}>time par, safe aur bilkul fresh</strong> pahunche. Yeh page hamari poori delivery policy clearly explain karta hai — charges se lekar tracking tak, sab kuch.</IP>

      <IHead icon={Truck}>Delivery At A Glance</IHead>
      <ITable
        head={['Service','Details','Charges']}
        rows={[
          ['⏱️ Standard Delivery','60-90 min (avg.), 7 AM – 10 PM','Free above ₹499'],
          ['🚀 Express Delivery','Jaldi chahiye? Slot select karein','₹29 flat'],
          ['🛒 Below ₹499 orders','Any slot, same day delivery','₹29 handling'],
          ['📅 Scheduled Delivery','Apna pasandeeda time slot chunein','Free above ₹499'],
        ]}
      />
      <p className="text-[11px] font-poppins" style={{color:'var(--gray)'}}>Note: Charges aapke area, order value aur ongoing offers par depend kar sakte hain. Checkout par final amount clearly dikhaya jaata hai — koi hidden charge nahi.</p>

      <IHead icon={Clock}>Order Kaise Process Hota Hai</IHead>
      <IBullets items={[
        '<strong style="color:var(--dark)">Step 1 — Order place:</strong> aap cart se order confirm karte hain aur payment ya COD select karte hain.',
        '<strong style="color:var(--dark)">Step 2 — Smart picking:</strong> hamari trained team har item ka expiry date, batch aur freshness check karke pick karti hai.',
        '<strong style="color:var(--dark)">Step 3 — Quality check &amp; packing:</strong> order double-check hokar insulated/safe packaging mein pack hota hai (dairy aur frozen ke liye alag handling).',
        '<strong style="color:var(--dark)">Step 4 — On the way:</strong> delivery partner assign hota hai — aapko live status aur rider details milti rehti hain.',
        '<strong style="color:var(--dark)">Step 5 — Delivered:</strong> OTP ya hand-to-hand delivery ke saath order aapke darwaze par. Invoice SMS/email par mil jaata hai.',
      ]}/>

      <IHead icon={MapPin}>Delivery Areas &amp; Slots</IHead>
      <IBullets items={[
        'Hum apne poore service area mein deliver karte hain — aap checkout par apna PIN code/area daal kar check kar sakte hain.',
        'Daily slots: <strong style="color:var(--dark)">7:00 AM se 10:00 PM</strong> (subah, dopahar, shaam aur raat ke slots available).',
        'Rush hours (shaam 6-9 PM aur weekend) mein slight delay ho sakta hai — hum aapko pehle inform karte hain.',
        'Naye area mein shift ho rahe hain? WhatsApp karein — agar aapka area abhi list mein nahi hai to hum jaldi add karne ki koshish karenge.',
      ]}/>

      <IHead icon={Star}>Order Tracking</IHead>
      <IBullets items={[
        'Order confirm hote hi confirmation SMS/WhatsApp aata hai.',
        'Picking → packed → out for delivery → delivered — har step par notification.',
        'Koi delay dikhe to seedha <a href="support.html" style="color:var(--primary);font-weight:700;text-decoration:underline">Help &amp; Support</a> par jaake Ananya AI se live status poochhein, ya call karein.',
      ]}/>

      <IHead icon={ShieldCheck}>Agar Delivery Fail Ho Jaaye</IHead>
      <IBullets items={[
        'Delivery partner pehle aapko call karega — reachable rahiye assigned slot ke dauraan.',
        'Ghar par koi na mile to partner dobara try karega (same slot ya agle slot mein).',
        'Do attempts ke baad bhi delivery na ho paaye to order cancel ho jaata hai aur <strong style="color:var(--dark)">full refund 3-5 working days</strong> mein process ho jaata hai.',
        'Agar aap order cancel karna chahte hain delivery se pehle to bina kisi charges ke kar sakte hain.',
      ]}/>

      <IHead icon={Leaf}>Freshness &amp; Substitutions</IHead>
      <IBullets items={[
        'Fresh items (sabzi, fruits, dairy) order ke waqt ya usse pehle hi select ki jaati hain — cold chain maintain rehta hai.',
        'Agar koi item stock mein na ho to hum aapko <strong style="color:var(--dark)">pehle inform karte hain</strong> — aap substitute accept kar sakte hain, skip kar sakte hain ya refund le sakte hain.',
        'Koi item pasand na aaye (quality, packaging, expiry) to delivery ke <strong style="color:var(--dark)">24 ghante</strong> ke andar bataayein — instant replacement ya full refund.',
      ]}/>

      <IHead icon={Clock}>Delay Kab Ho Sakti Hai</IHead>
      <IBullets items={[
        'Monsoon, heavy rain, traffic jams ya road blocks.',
        'Festive season ya weekend rush (extra orders).',
        'Extreme weather ya local bandh/jaat-aarandh.',
        'Address galat ya phone unreachable hone par.',
      ]}/>
      <IP>Is tarah ki situations mein hum SMS/WhatsApp se update karte hain aur jaise hi normal hota hai, order priority par deliver hota hai. Bade delay par aap refund bhi le sakte hain — no questions asked.</IP>

      <IHead icon={Wallet}>Cancellation &amp; Refund Policy</IHead>
      <IBullets items={[
        'Delivery se pehle cancel: <strong style="color:var(--dark)">full refund</strong>, zero charges.',
        'Partial delivery: sirf delivered items ka pay karte hain, baaki ka refund turant.',
        'Refund mode: original payment method (UPI/card/wallet) — COD orders ke liye bank transfer/UPI.',
        'Refund timeline: <strong style="color:var(--dark)">3-5 working days</strong> (UPI usually same day).',
      ]}/>

      <ICall title="Delivery Se Judi Madad Chahiye?" icon={Truck}>
        Order status, address change ya slot reschedule — sab kuch. 📞 <strong>+91 63931 96765</strong> · 📧 <strong>support@rkgrocerymart.com</strong> · 24x7 <a href="support.html" style={{color:'var(--primary)',fontWeight:700,textDecoration:'underline'}}>Ananya AI chat</a> par bhi poochh sakte hain.
      </ICall>
    </div>
  );
}

// ℹ️ Static pages (About / Privacy / Terms / Shipping) — content admin
// shop_settings (about_text / privacy_policy / terms_text / shipping_rules)
// se aaye to wahi dikhega, warna neeche diya gaya rich default content.
const LEGAL_TABS=[{k:'about',l:'About Us'},{k:'privacy',l:'Privacy Policy'},{k:'terms',l:'Terms & Conditions'},{k:'shipping',l:'Delivery & Shipping'}];
function InfoPage({title,subtitle,body,fallback,onNav,activeKey,children}){
  return(
    <div className="max-w-site mx-auto px-4 md:px-8 py-6 md:py-8">
      <button onClick={()=>onNav&&onNav('home')} aria-label="Back to home"
        className="inline-flex items-center gap-1.5 mb-4 text-xs md:text-sm font-poppins font-bold rounded-xl px-3.5 py-2 transition-transform active:scale-95"
        style={{background:'var(--card-bg)',color:'var(--primary-dark)',border:'1px solid var(--border)'}}>
        <ChevronLeft size={15}/> Back to Home
      </button>

      {/* Legal tabs — in pages ke beech quick switching */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-1 -mx-1 px-1" style={{scrollbarWidth:'none'}}>
        {LEGAL_TABS.map(t=>(
          <button key={t.k} onClick={()=>onNav&&onNav(t.k)}
            className="whitespace-nowrap rounded-full px-4 py-2 text-[11px] md:text-xs font-poppins font-bold transition-all"
            style={activeKey===t.k
              ?{background:'var(--primary)',color:'#fff',boxShadow:'0 4px 12px rgba(0,0,0,0.12)'}
              :{background:'var(--card-bg)',color:'var(--text)',border:'1px solid var(--border)'}}>
            {t.l}
          </button>
        ))}
      </div>

      <div className="rounded-3xl p-5 md:p-10 mt-2" style={{background:'var(--card-bg)',boxShadow:'0 2px 10px rgba(0,0,0,0.06)'}}>
        <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 mb-3 text-[10px] md:text-xs font-bold font-poppins uppercase tracking-wide"
          style={{background:'var(--primary-light)',color:'var(--primary-dark)'}}>
          RK Grocery Mart · Official
        </div>
        <h1 className="font-extrabold font-poppins text-xl md:text-3xl leading-tight" style={{color:'var(--dark)'}}>{title}</h1>
        {subtitle&&<p className="text-xs md:text-sm font-poppins mt-1.5 mb-5 leading-relaxed" style={{color:'var(--gray)'}}>{subtitle}</p>}
        <div className="mt-5 pt-6" style={{borderTop:'1px solid var(--border)'}}>
          {body
            ?<div className="text-sm font-poppins leading-relaxed whitespace-pre-wrap" style={{color:'var(--text)'}}>{body}</div>
            :fallback}
        </div>
        <div className="mt-8 pt-4 text-[11px] font-poppins leading-relaxed" style={{borderTop:'1px solid var(--border)',color:'var(--gray)'}}>
          Last updated: 19 October 2026 · Is page ko time-samay par update kiya ja sakta hai — continue karne ka matlab hai aap latest version se sehmat hain.
        </div>
      </div>

      {children}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────
export default function App(){
  const [page,setPage]=useState('home');
  const [cart,setCart]=useState([]);
  const [cartOpen,setCartOpen]=useState(false);
  const [activeCatId,setActiveCatId]=useState('all');
  const [search,setSearch]=useState('');
  const [toast,setToast]=useState('');
  const [bannerIdx,setBannerIdx]=useState(0);
  const bannerWrapRef=useRef(null);
  const [success,setSuccess]=useState(null);
  const [user,setUser]=useState(null);
  const [detailProduct,setDetailProduct]=useState(null);
  const [shopPage,setShopPage]=useState(1);
  // Module 4: listing-page sort + in-stock filter. These are purely
  // display-layer — they re-order/filter the products array that
  // useProducts() already fetched for the current page. They do NOT touch
  // the Supabase query in dataHooks.js, so pagination/category/search logic
  // is 100% unchanged. (Trade-off: since pagination is server-side, "Price:
  // Low to High" etc. sorts within the current page of results, not across
  // the entire catalog — flagged here for the next session.)
  const [sortBy,setSortBy]=useState('default');
  const [inStockOnly,setInStockOnly]=useState(false);
  const [filterDrawerOpen,setFilterDrawerOpen]=useState(false);
  const sortFilterProds=(list)=>{
    let out=inStockOnly?list.filter(p=>!(p.stock_quantity<=0)):list;
    if(sortBy==='price-low') out=[...out].sort((a,b)=>a.selling_price-b.selling_price);
    else if(sortBy==='price-high') out=[...out].sort((a,b)=>b.selling_price-a.selling_price);
    return out;
  };
  const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true || document.referrer.includes('android-app://');
  const [theme,setTheme]=useState(()=>{
    try{const s=localStorage.getItem('rk_theme');if(s==='dark'||s==='light')return s;}catch(e){}
    return window.matchMedia?.('(prefers-color-scheme:dark)').matches?'dark':'light';
  });

  // Pages where the search field should not auto-redirect away from the current flow
  const SEARCH_LOCKED_PAGES=['checkout','detail','success'];
  const searchDisabled=SEARCH_LOCKED_PAGES.includes(page);

  // Header height measurement (fix #10): keep desktop sidebar's sticky offset in sync
  // with the *actual* rendered header height instead of a hardcoded 80px, so a wrapped
  // ticker or taller header never gets overlapped by the sidebar.
  const desktopHeaderRef=useRef(null);
  useLayoutEffect(()=>{
    const el=desktopHeaderRef.current;
    if(!el)return;
    const setVar=()=>document.documentElement.style.setProperty('--header-h',(el.offsetHeight+8)+'px');
    setVar();
    const ro=new ResizeObserver(setVar);
    ro.observe(el);
    return()=>ro.disconnect();
  },[]);

  // Data hooks
  const {cats,loading:catsLoading}=useCategories();
  const {banners,loading:bannersLoading}=useBanners();
  // Bug fix #4: only let the search hook run while the search UI is actually active/visible
  const {results:searchResults,loading:searchLoading}=useSearch(search,!searchDisabled);

  // Bug fix #4 (continued): clear stale search text when navigating to a page where
  // search is locked, so re-opening shop/home doesn't silently resume an old query.
  useEffect(()=>{
    if(searchDisabled&&search) setSearch('');
  },[page]);

  // Page change par window ko TOP par le jao. Home se "Shop by Category" ke
  // kisi tile par tap karne par (user neeche scroll kiya hua tha) shop page
  // khul jata tha, lekin scroll position wahi rehne se products on-screen
  // nahi dikhte the — ab har page switch par top se shuru hota hai.
  useEffect(()=>{
    window.scrollTo({top:0,left:0,behavior:'auto'});
  },[page]);

  // Fix: account.html bottom-nav ke "Shop" link (index.html#shop) ab kaam
  // karta hai — hash routing. Home par aane par #shop hash ho to shop page
  // khul jata hai (pehle ye hash ignore hota tha, hamesha home state).
  useEffect(()=>{
    if(window.location.hash==='#shop'){setPage('shop');setActiveCatId('all');setSearch('');setShopPage(1);}
    if(window.location.hash==='#cart'){setCartOpen(true);}
    // Legal/info pages bhi deep-link ho sakte hain (index.html#about etc.)
    const legalHash=window.location.hash.replace('#','');
    if(['about','privacy','terms','shipping'].includes(legalHash)) setPage(legalHash);
  },[]);

  // Shop products (filtered)
  const shopOpts={
    categoryId:activeCatId==='all'?null:activeCatId,
    search:search.trim().length>1?search:'',
    page:shopPage,pageSize:24
  };
  const {products:shopProds,loading:shopLoading,total:shopTotal,totalPages}=useProducts(shopOpts);

  // Module 4: shared derived state for the listing page (desktop + mobile
  // both read from this so sort/filter/search logic isn't duplicated).
  const isSearchActive=search.trim().length>1;
  const rawShopProds=isSearchActive?searchResults:shopProds;
  const shopIsLoading=isSearchActive?searchLoading:shopLoading;
  const visibleShopProds=sortFilterProds(rawShopProds);

  // Featured products for home
  const {products:featuredProds,loading:featLoading}=useProducts({featured:true,pageSize:8});

  // Module 12: premium homepage sections (flash sale / deals / best sellers / new arrivals)
  const {sections:homeSections,loading:homeLoading}=useHomeSections();
  // Admin Homepage Builder: section order/visibility + approved reviews + live shop settings
  const {sections:homepageSections}=useHomepageConfig();
  const {reviews:dbReviews}=useReviews();
  const {strips:adStrips}=useAdStrips();
  const {settings:shopSettings}=useShopSettings();

  // Ad strip image click → category ya product par redirect
  const handleAdClick=async (img)=>{
    if(img.link_type==='category'&&img.link_value){
      setActiveCatId(img.link_value);
      setSearch('');
      setShopPage(1);
      setPage('shop');
      window.scrollTo(0,0);
    }else if(img.link_type==='product'&&img.link_value){
      try{
        const {data}=await supabase.from('products')
          .select('*,categories(id,name,slug),product_images(id,image_url,is_default,sort_order)')
          .eq('id',img.link_value).maybeSingle();
        if(data){
          const imgs=(data.product_images||[]).slice().sort((a,b)=>a.sort_order-b.sort_order);
          setDetailProduct({...data,discount:calcDiscount(data.selling_price,data.original_price),images:imgs,primary_image:(imgs.find(i=>i.is_default)||imgs[0])?.image_url||null});
          setPage('detail');
          window.scrollTo(0,0);
        }
      }catch(_){/* ignore */}
    }
  };

  // Section products per category — SABHI categories + har category ke SABHI
  // products (pehle sirf 6 cats × 8 items dikhte the). Ek hi query me saare
  // active products lo aur client-side category_id se group karo (16 alag
  // queries ki jagah 1) — home page par scroll karte hi har category ka pura
  // section apne saare products ke saath dikhta hai.
  const [sectionProds,setSectionProds]=useState({});
  // Ready flag: query complete hone par true — iske bina 0-products wali category
  // par `items` undefined rehta aur rail hamesha skeleton dikhati thi. Ab ready
  // hone par undefined/[] dono ko empty state milta hai.
  const [sectionProdsReady,setSectionProdsReady]=useState(false);
  useEffect(()=>{
    if(!cats.length)return;
    let cancelled=false;
    (async()=>{
      // try/catch: query fail hone par bhi ready=true set hota hai — warna saari
      // category rails hamesha skeleton dikhati rehti thin (useHomeSections jaisa
      // pattern). limit(1000): PostgREST/Supabase ka default cap — catalog 1000
      // se zyada ho to yahan pagination chahiye (aaj 150 products hain).
      let data=null;
      try{
        const res=await supabase.from('products')
          .select('*,product_images(image_url,is_default,sort_order)')
          .eq('is_active',true)
          .order('is_featured',{ascending:false})
          .order('created_at',{ascending:false})
          .limit(1000);
        data=res.data;
      }catch(e){data=null;}
      if(cancelled)return;
      const map={};
      for(const pr of (data||[])){
        // BUG FIX: images sorted by sort_order; primary_image = admin ka ⭐ DEFAULT
        // (is_default flag) — dataHooks.js jaisa hi shape. Default nahi hai to
        // pehli sorted image fallback.
        const imgs=(pr.product_images||[]).slice().sort((a,b)=>a.sort_order-b.sort_order);
        const enriched={
          ...pr,
          discount:calcDiscount(pr.selling_price,pr.original_price),
          // `images` array + primary_image dono — ProductDetail gallery/thumbnails
          // aur cards ke liye (dataHooks.js jaisa hi shape).
          images:imgs,
          primary_image:(imgs.find(i=>i.is_default)||imgs[0])?.image_url||null,
        };
        if(!map[pr.category_id])map[pr.category_id]=[];
        map[pr.category_id].push(enriched);
      }
      setSectionProds(map);
      setSectionProdsReady(true);
    })();
    return()=>{cancelled=true;};
  },[cats]);

  // Desktop sidebar category counts — sectionProds (home ke liye pehle se ek
  // hi query me loaded) se derived, koi EXTRA query nahi. Sirf ACTIVE products
  // count hote hain (jo customers ko dikhte hain). 'all' = total.
  // sectionProdsReady gate: load hone tak keys undefined rehti hain → badge
  // hidden (0 ka flash nahi aata), ready hone par real count aa jata hai.
  const catCounts={};
  if(sectionProdsReady){
    catCounts.all=0;
    for(const c of cats){const n=(sectionProds[c.id]||[]).length;catCounts[c.id]=n;catCounts.all+=n;}
  }

  // Auto-advance: har 4s next slide. Lekin jab user touch/swipe kar raha ho to interval
  // PAUSE ho jaata hai (warna JS smooth-scroll user ke haath se ladta hai aur carousel
  // bhaag ke aakhri slide tak chala jaata hai). touchend par fresh interval shuru.
  useEffect(()=>{
    if(!banners.length)return;
    let t=setInterval(()=>setBannerIdx(i=>(i+1)%banners.length),4000);
    const el=bannerWrapRef.current;
    const pause=()=>clearInterval(t);
    const resume=()=>{clearInterval(t);t=setInterval(()=>setBannerIdx(i=>(i+1)%banners.length),4000);};
    if(el){
      el.addEventListener('touchstart',pause,{passive:true});
      el.addEventListener('touchend',resume,{passive:true});
      el.addEventListener('touchcancel',resume,{passive:true});
    }
    return()=>{clearInterval(t);if(el){el.removeEventListener('touchstart',pause);el.removeEventListener('touchend',resume);el.removeEventListener('touchcancel',resume);}};
  },[banners.length]);

  // Keep carousel scroll position in sync with bannerIdx (fixes auto-rotate not scrolling).
  // Frontend-only fix: scrollIntoView() used to scroll the *whole page* vertically back up
  // to bring an off-screen banner into view every 4s. Scoping the scroll to just this
  // container (scrollTo on el, not scrollIntoView on the child) stops that page-jump bug.
  useEffect(()=>{
    const el=bannerWrapRef.current;
    const child=el&&el.children[bannerIdx];
    if(!el||!child)return;
    el.scrollTo({left:child.offsetLeft,behavior:'smooth'});
  },[bannerIdx]);

  // Frontend-only fix: when the user manually swipes the banner carousel, detect which
  // card is now closest to the scroll position and sync bannerIdx to it. This makes the
  // 4-second auto-rotate continue from where the user actually swiped to, instead of
  // jumping from a stale index. Debounced so it only fires once scrolling settles.
  const bannerScrollTimer=useRef(null);
  useEffect(()=>{
    const el=bannerWrapRef.current;
    if(!el)return;
    const onScroll=()=>{
      clearTimeout(bannerScrollTimer.current);
      bannerScrollTimer.current=setTimeout(()=>{
        const children=Array.from(el.children);
        if(!children.length)return;
        let closest=0,minDist=Infinity;
        children.forEach((c,i)=>{
          const dist=Math.abs(c.offsetLeft-el.scrollLeft);
          if(dist<minDist){minDist=dist;closest=i;}
        });
        setBannerIdx(closest);
      },60);
    };
    el.addEventListener('scroll',onScroll,{passive:true});
    return()=>{el.removeEventListener('scroll',onScroll);clearTimeout(bannerScrollTimer.current);};
  },[banners.length]);

  useEffect(()=>{
    document.documentElement.setAttribute('data-theme',theme);
    try{localStorage.setItem('rk_theme',theme);}catch(e){}
    // Admin Settings se theme color (agar set ho to) site accent par apply karo
    if(shopSettings.theme_color&&/^#[0-9a-fA-F]{6}$/.test(shopSettings.theme_color)){
      document.documentElement.style.setProperty('--primary',shopSettings.theme_color);
    }
    const m=document.querySelector('meta[name="theme-color"]');
    if(m)m.setAttribute('content',theme==='dark'?'#0F1521':(shopSettings.theme_color||'#15803D'));
  },[theme,shopSettings.theme_color]);

  useEffect(()=>{
    if(window.RKCart)window.RKCart.init();
    supabase.auth.getSession().then(({data:{session}})=>{
      if(session?.user){
        const meta=session.user.user_metadata;
        const u={uid:session.user.id,email:session.user.email,name:meta?.name||session.user.email.split('@')[0]};
        setUser(u);
        if(window.RKCart)window.RKCart.setUser(u);
        if(window.RKProfile)window.RKProfile.loadProfile(session.user.id);
      }
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{
      if(session?.user){
        const meta=session.user.user_metadata;
        const u={uid:session.user.id,email:session.user.email,name:meta?.name||session.user.email.split('@')[0]};
        setUser(u);
        if(window.RKCart)window.RKCart.setUser(u);
      } else {setUser(null);if(window.RKCart)window.RKCart.setUser(null);}
    });
    return()=>subscription.unsubscribe();
  },[]);



  useEffect(()=>{
    if(!window.RKCart)return;
    return window.RKCart.onCartChange(c=>setCart(c));
  },[]);

  useEffect(()=>{
    if(user){const r=sessionStorage.getItem('rk_redirect');if(r==='checkout'){sessionStorage.removeItem('rk_redirect');setPage('checkout');}}
  },[user]);

  const showToast=msg=>{setToast(msg);setTimeout(()=>setToast(''),2200);};
  // V4.1: dark-mode toggle moved to Account → Settings → Appearance (see
  // AccountPage.jsx SettingsTab). The main page keeps the saved theme applied
  // via the useEffect above, but no longer shows the header switch.

  // Build a quick id → product lookup across everything we've already fetched, so the
  // cart drawer (and anywhere else) can resolve a live stock_quantity for stock-guarding.
  const productById=useRef({});
  useEffect(()=>{
    const all=[...shopProds,...featuredProds,...Object.values(sectionProds).flat()];
    all.forEach(p=>{ if(p&&p.id) productById.current[p.id]=p; });
  },[shopProds,featuredProds,sectionProds]);

  const addToCart=p=>{
    // Multi-unit (2026-08): PDP unit-selector se aane par p._variant + p.selling_price/
    // p.unit_value us selected variant ke hote hain. k = line key (variant ke saath).
    const variant=p._variant||null;
    const k=variant?`${p.id}::${variant}`:p.id;
    if(window.RKCart)window.RKCart.addToCart({id:p.id,k,name:p.name,price:p.selling_price,unit:p.unit_value,image:p.primary_image,e:p.emoji||null,cat:p.categories?.name||null,old:p.original_price||null,variant});
    else setCart(prev=>{const ex=prev.find(i=>(i.k||i.id)===k);return ex?prev.map(i=>(i.k||i.id)===k?{...i,qty:i.qty+1}:i):[...prev,{id:p.id,k,name:p.name,price:p.selling_price,unit:p.unit_value,image:p.primary_image,e:p.emoji||null,cat:p.categories?.name||null,old:p.original_price||null,variant,qty:1}];});
    showToast(`${p.name} cart mein add hua! 🛒`);
  };

  // ── Wishlist (heart on every product card) ─────────────────────────
  // Logged-in user ki wishlist rows Supabase 'wishlist' table se load hoti
  // hain (user_id ke andar). Guest ke liye heart tap par login modal khulta
  // hai — guest wishlist localStorage me nahi rakhte (Account page wahi
  // source of truth hai). toggleWishlist() optimistic nahi hai — DB ke baad
  // state update hoti hai, taaki Account → Wishlist aur cards hamesha sync
  // rahein.
  const [wishlist,setWishlist]=useState([]);
  const [wishlistBusy,setWishlistBusy]=useState(false);
  useEffect(()=>{
    if(!user){setWishlist([]);return;}
    let cancelled=false;
    (async()=>{
      const {data}=await supabase.from('wishlist').select('*').eq('user_id',user.uid).order('created_at',{ascending:false});
      if(!cancelled)setWishlist(data||[]);
    })();
    return()=>{cancelled=true;};
  },[user]);
  const wishlistIds=new Set(wishlist.map(w=>w.product_id));
  const toggleWishlist=async p=>{
    if(!user){openLogin();showToast('Wishlist ke liye login karein 🔐');return;}
    if(wishlistBusy)return;
    setWishlistBusy(true);
    try{
      const existing=wishlist.find(w=>w.product_id===p.id);
      if(existing){
        const {error}=await supabase.from('wishlist').delete().eq('id',existing.id).eq('user_id',user.uid);
        if(!error){setWishlist(l=>l.filter(w=>w.id!==existing.id));showToast('Wishlist se hata diya 💔');}
        else showToast('Wishlist update nahi hua — dobara try karein');
      }else{
        // .select() zaroori: insert ke baad REAL DB id chahiye (delete/state sync
        // ke liye). Pehle 'tmp-' id use karte the — delete par DB me match nahi
        // hota tha aur heart remove nahi hota tha.
        const {data,error}=await supabase.from('wishlist').insert({
          user_id:user.uid,product_id:p.id,name:p.name,unit:p.unit_value,
          price:p.selling_price,emoji:null,category:p.categories?.name||null,
          // Wishlist rows me product ka image bhi (Account → Wishlist me dikhe)
          image:p.primary_image||null,
        }).select();
        if(!error&&data&&data[0]){setWishlist(l=>[...l,data[0]]);showToast(`${p.name} wishlist mein add ho gaya ❤️`);}
        else showToast('Wishlist update nahi hua — dobara try karein');
      }
    }finally{setWishlistBusy(false);}
  };

  // ── Price-drop / back-in-stock alerts (🔔) ──────────────────────────────
  // price_alerts table (user_id, product_id) + DB trigger notify_price_alerts:
  // admin price kam kare ya stock 0->>0 ho to notifications table me insert.
  const [priceAlerts,setPriceAlerts]=useState([]);
  useEffect(()=>{
    if(!user){setPriceAlerts([]);return;}
    let cancelled=false;
    (async()=>{
      const {data}=await supabase.from('price_alerts').select('product_id').eq('user_id',user.uid);
      if(!cancelled)setPriceAlerts((data||[]).map(d=>d.product_id));
    })();
    return()=>{cancelled=true;};
  },[user]);
  const toggleAlert=async p=>{
    if(!user){openLogin();showToast('Price alerts ke liye login karein 🔐');return;}
    const id=p.id||p;
    const has=priceAlerts.includes(id);
    if(has){
      const {error}=await supabase.from('price_alerts').delete().eq('user_id',user.uid).eq('product_id',id);
      if(!error){setPriceAlerts(l=>l.filter(x=>x!==id));showToast('Price alert band — hata diya 🔕');}
      else showToast('Alert update nahi hua — dobara try karein');
    }else{
      const {error}=await supabase.from('price_alerts').insert({user_id:user.uid,product_id:id});
      if(!error){setPriceAlerts(l=>[...l,id]);showToast('Price drop / back-in-stock par notify karenge 🔔');}
      // 23505 = pehle se alert hai (double-tap race) — state sync karo, fail mat mano
      else if(error&&error.code==='23505'){setPriceAlerts(l=>[...l,id]);showToast('Price drop / back-in-stock par notify karenge 🔔');}
      else showToast('Alert update nahi hua — dobara try karein');
    }
  };

  // ── Save for Later (cart drawer): item cart se nikal kar wishlist me ──
  const saveForLater=async item=>{
    if(!user){openLogin();showToast('Wishlist ke liye login karein 🔐');return;}
    const existing=wishlist.find(w=>w.product_id===item.id);
    if(existing){
      if(window.RKCart)await window.RKCart.removeFromCart(item.id,item.k||item.id);
      showToast('Cart se nikal kar wishlist mein save ho gaya 🔖');
      return;
    }
    const {data,error}=await supabase.from('wishlist').insert({
      user_id:user.uid,product_id:item.id,name:item.name,unit:item.unit,
      price:item.price,emoji:item.e||null,category:item.cat||null,
      // Save for Later se wishlist me jane par image bhi store karo
      image:item.image||null,
    }).select();
    if(!error&&data&&data[0]){
      setWishlist(l=>[...l,data[0]]);
      if(window.RKCart)await window.RKCart.removeFromCart(item.id,item.k||item.id);
      showToast('Cart se nikal kar wishlist mein save ho gaya 🔖');
    }else{
      showToast('Wishlist mein save nahi hua — dobara try karein');
    }
  };

  // Frontend-only stock guard: prevents qty from exceeding available stock when known.
  // Bug fix #1: when no explicit stockLimit is passed (as from the cart drawer's '+'
  // button), fall back to looking up the known stock_quantity for that product id so the
  // same guard applies everywhere quantity can be changed, not just on product cards/PDP.
  const updQty=(id,d,stockLimit,k)=>{
    const key=k||id;
    // Multi-unit: line key me variant ho to us variant ka stock limit (taaki
    // create_order ke variant stock check ke saath consistent rahe).
    let varStock;
    if(key&&String(key).includes('::')){
      const variant=String(key).split('::')[1];
      const prod=productById.current[id];
      if(prod&&Array.isArray(prod.units)){
        const u=prod.units.find(x=>x.label===variant);
        varStock=typeof u?.stock==='number'?u.stock:undefined;
      }
    }
    const limit=typeof stockLimit==='number'?stockLimit:(typeof varStock==='number'?varStock:productById.current[id]?.stock_quantity);
    if(d>0&&typeof limit==='number'){
      const existing=cart.find(i=>(i.k||i.id)===key);
      if(existing&&existing.qty>=limit){
        showToast(`Sirf ${limit} stock mein hai`);
        return;
      }
    }
    if(window.RKCart)window.RKCart.updateQuantity(id,d,key);
    else setCart(prev=>prev.map(i=>(i.k||i.id)===key?{...i,qty:i.qty+d}:i).filter(i=>i.qty>0));
  };

  const total=cart.reduce((s,i)=>s+(i.price||0)*(i.qty||1),0);
  const count=cart.reduce((s,i)=>s+(i.qty||1),0);

  // Module 7: auth is now an in-place modal instead of a full navigation to
  // login.html/signup.html. `rk_redirect` sessionStorage + the existing
  // `useEffect(()=>{...},[user])` above (unchanged) still does the actual
  // "land on checkout after login" redirect once `user` updates via the
  // existing onAuthStateChange listener — this just decides when to show it.
  const [authModal,setAuthModal]=useState(null); // null | 'login' | 'signup'
  const openLogin=()=>setAuthModal('login');
  const openLoginForCheckout=()=>{sessionStorage.setItem('rk_redirect','checkout');setAuthModal('login');};

  const goToCheckout=()=>{setCartOpen(false);if(user)setPage('checkout');else openLoginForCheckout();};

  const openDetail=p=>{setDetailProduct(p);setPage('detail');};

  // "All" virtual category
  const allCats=[{id:'all',name:'All',image_url:null,icon_emoji:'🛍️',slug:'all'},...cats];

  // BUG FIX: admin ke Banners page mein "Link URL" field save hota tha, par customer
  // site par banner click hamesha generic "shop" page kholta tha — link_url kabhi
  // padha hi nahi jaata tha. Ab is_url ko resolve karte hain:
  //  • "/category/<slug>"  → us category ke products dikhao
  //  • pura URL (http/https) → naye tab mein wahi page kholo
  //  • blank ya unresolved  → fallback: generic shop page
  const handleBannerClick=useCallback((b)=>{
    const link=(b?.link_url||'').trim();
    if(!link){setPage('shop');setShopPage(1);return;}
    if(/^https?:\/\//i.test(link)){window.open(link,'_blank','noopener');return;}
    const catMatch=link.match(/^\/?category\/([\w-]+)\/?$/i);
    if(catMatch){
      const key=catMatch[1];
      const found=cats.find(c=>c.slug===key||String(c.id)===key);
      if(found){setActiveCatId(found.id);setPage('shop');setShopPage(1);setSearch('');return;}
    }
    // Unrecognised path — safe fallback so the click never feels broken
    setPage('shop');setShopPage(1);
  },[cats]);

  // HeroBanner & CategoryRail → hoisted to module level (Module 13: scroll-reset fix).

  // ProductRail & DesktopSidebar → hoisted to module level (Module 13).

  // Footer & HomeContent → hoisted to module level (Module 13).

  // DesktopShop → hoisted to module level (Module 13).

  return(
    <div style={{background:'var(--page-bg)',minHeight:'100vh'}}>
      {/* ── HEADER (Module 2: unified Tailwind header, same look on mobile+desktop
           as the new design — replaces the old separate desktop-header/.header
           blocks). All state/handlers below are UNCHANGED from before: setPage,
           showToast, search/setSearch/setShopPage, toggleTheme, isPWA, user,
           openLogin (Module 7: opens AuthModal in place of the old goLogin
           full-page nav), setCartOpen, count. desktopHeaderRef stays attached so the
           --header-h ResizeObserver (used by the desktop sidebar's sticky
           offset) keeps working. */}
      <header className="sticky top-0 z-50" ref={desktopHeaderRef}
        style={{background:'var(--card-bg)',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
        <div className="max-w-site mx-auto px-4 md:px-8 pt-3 md:pt-4 pb-3">
          <div className="flex items-center justify-between gap-3 md:gap-6">
            {/* Logo + location */}
            <div className="min-w-0">
              <button onClick={()=>setPage('home')} className="flex items-center gap-2 text-left" style={{background:'none'}}>
                <img src={shopSettings.logo_url||'/icons/rk-logo.svg'} alt={shopSettings.shop_name||'RK Grocery Mart'} className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex-shrink-0"/>
                <span className="flex flex-col min-w-0">
                  <span className="text-[13px] sm:text-base md:text-lg font-extrabold font-poppins leading-none truncate" style={{color:'var(--dark)'}}><MultiColorName name={shopSettings.shop_name||'RK Grocery Mart'}/></span>
                  <span className="text-[8px] sm:text-[9px] md:text-[10px] font-poppins font-medium mt-0.5 truncate" style={{color:'var(--primary)'}}>{shopSettings.footer_text||'हर घर की पसंद'}</span>
                </span>
              </button>
            </div>

            {/* Search — desktop only, center (mobile gets a full-width row below) */}
            <div className="hidden md:block flex-1 max-w-xl mx-auto">
              <div className="w-full flex items-center gap-3 rounded-2xl p-2.5"
                style={{background:'var(--light)',border:'1.5px solid var(--border)',opacity:searchDisabled?0.5:1}}>
                <Search size={18} style={{color:'var(--gray)'}} className="flex-shrink-0"/>
                <input placeholder="Search groceries, snacks, dairy..." value={search} disabled={searchDisabled}
                  onFocus={()=>{if(searchDisabled)showToast('Pehle yeh kaam poora karein 🙏');}}
                  onChange={e=>{setSearch(e.target.value);setPage('shop');setShopPage(1);}}
                  className="flex-1 bg-transparent text-sm font-poppins outline-none" style={{color:'var(--dark)'}}/>
                {search&&!searchDisabled&&<button onClick={()=>setSearch('')} style={{color:'#A0AEC0',background:'none'}}>✕</button>}
              </div>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {!isPWA&&(
                <button onClick={()=>openAppDownload(showToast)}
                  className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold font-poppins whitespace-nowrap"
                  style={{background:'var(--primary-light)',color:'var(--primary-dark)'}}>
                  <Download size={14}/> Get App
                </button>
              )}

              <button onClick={()=>setCartOpen(true)} aria-label={count?`Cart, ${count} items, ₹${total}`:'Cart is empty'}
                className="relative flex items-center gap-1.5 px-3 h-9 rounded-xl text-white font-poppins font-bold text-sm"
                style={{background:`linear-gradient(135deg, var(--primary), var(--primary-dark))`, boxShadow:'0 4px 12px rgba(22,163,74,0.3)'}}>
                <ShoppingCart size={17}/>
                <span className="hidden md:inline">Cart</span>
                {count>0&&<span className="hidden lg:inline text-[10px] font-semibold opacity-90 border-l border-white/25 pl-1.5">₹{total}</span>}
                {count>0&&<span className="absolute -top-1.5 -right-1.5 w-4 h-4 text-white text-[9px] font-bold rounded-full flex items-center justify-center font-poppins" style={{background:'var(--orange)'}}>{count>9?'9+':count}</span>}
              </button>

              {user?
                <button onClick={()=>window.location.href='account.html'} aria-label="Account"
                  className="flex items-center gap-1.5 h-9 px-2.5 rounded-xl font-poppins font-bold text-xs"
                  style={{background:'var(--primary-light)',color:'var(--primary-dark)'}}>
                  <User size={16}/> <span className="max-w-[64px] truncate">{user.name.split(' ')[0]}</span>
                </button>
                :<button onClick={openLogin} className="flex items-center gap-1.5 h-9 px-3 rounded-xl font-poppins font-bold text-xs text-white"
                  style={{background:'var(--primary)'}}>
                  <User size={16}/> Login
                </button>
              }
            </div>
          </div>

          {/* Mobile search — full width row below logo/actions */}
          <div className="md:hidden w-full mt-3">
            <div className="w-full flex items-center gap-3 rounded-2xl p-3"
              style={{background:'var(--light)',border:'1.5px solid var(--border)',opacity:searchDisabled?0.5:1}}>
              <Search size={16} style={{color:'var(--gray)'}} className="flex-shrink-0"/>
              <input placeholder="Search groceries, snacks, dairy..." value={search} disabled={searchDisabled}
                onFocus={()=>{if(searchDisabled)showToast('Pehle yeh kaam poora karein 🙏');}}
                onChange={e=>{setSearch(e.target.value);setPage('shop');setShopPage(1);}}
                className="flex-1 bg-transparent text-sm font-poppins outline-none" style={{color:'var(--dark)',fontSize:16}}/>
              {search&&!searchDisabled&&<button onClick={()=>setSearch('')} style={{color:'#A0AEC0',background:'none'}}>✕</button>}
            </div>
          </div>
        </div>
      </header>
      {/* Ticker */}
      <div className="ticker">
        <div className="ticker-track">
          {(shopSettings.announcement
            ?[shopSettings.announcement,shopSettings.announcement]
            :[...TICKER,...TICKER]
          ).map((t,i)=><span key={i} className="ticker-item">✦ {t}</span>)}
        </div>
      </div>

      {/* A quiet service-proof strip gives shoppers the reassurance they need
          before browsing, without competing with the promotional ticker. */}
      <div className="hidden sm:block" style={{background:'var(--card-bg)',borderBottom:'1px solid var(--border)'}}>
        <div className="max-w-site mx-auto px-4 md:px-8 py-2 flex items-center justify-center gap-x-7 gap-y-1 flex-wrap text-[11px] font-semibold font-poppins" style={{color:'var(--gray)'}}>
          <span className="flex items-center gap-1.5"><span aria-hidden="true">⚡</span> Fast local delivery</span>
          <span className="flex items-center gap-1.5"><span aria-hidden="true">🥬</span> Freshness checked before dispatch</span>
          <span className="flex items-center gap-1.5"><ShieldCheck size={13} style={{color:'var(--primary)'}}/> Secure payments</span>
        </div>
      </div>

      <div className="page-pad">
        {/* A11y: single document h1 — screen readers ke liye page ka main heading
             (logo button visual heading hai; h1 visually hidden rahta hai) */}
        <h1 className="sr-only">{shopSettings.shop_name||'RK Grocery Mart'} — online grocery store</h1>

        {/* ── HOME (Module 3: single unified Tailwind homepage, no more
             separate mobile/desktop markup — see HomeContent above) ── */}
        {page==='home'&&<HomeContent
          homepageSections={homepageSections}
          banners={banners} bannersLoading={bannersLoading}
          bannerIdx={bannerIdx} setBannerIdx={setBannerIdx}
          bannerWrapRef={bannerWrapRef} handleBannerClick={handleBannerClick}
          homeSections={homeSections} homeLoading={homeLoading}
          cart={cart} addToCart={addToCart} updQty={updQty} onDetail={openDetail}
          cats={cats} catsLoading={catsLoading} catEmoji={catEmoji}
          sectionProds={sectionProds} sectionProdsReady={sectionProdsReady} featLoading={featLoading} featuredProds={featuredProds}
          dbReviews={dbReviews} shopSettings={shopSettings} showToast={showToast}
          setPage={setPage}
          onPickCategory={(id)=>{setActiveCatId(id);setPage('shop');setShopPage(1);setSearch('');}}
          wishlistIds={wishlistIds} onWishlist={toggleWishlist}
          adStrips={adStrips} onAdClick={handleAdClick}
        />}
        {page==='about'&&<InfoPage title="About Us" activeKey="about" onNav={setPage}
          subtitle="Hamari kahani, mission aur woh promises jo har order ke saath poore hote hain."
          body={shopSettings.about_text} fallback={<AboutBody/>}>
          <div className="mt-6 md:mt-8"><Footer shopSettings={shopSettings} onNav={setPage}/></div>
        </InfoPage>}
        {page==='privacy'&&<InfoPage title="Privacy Policy" activeKey="privacy" onNav={setPage}
          subtitle="Aapki jaankari hamari zimmedari hai — hum kya collect karte hain, kaise use aur protect karte hain."
          body={shopSettings.privacy_policy} fallback={<PrivacyBody/>}>
          <div className="mt-6 md:mt-8"><Footer shopSettings={shopSettings} onNav={setPage}/></div>
        </InfoPage>}
        {page==='terms'&&<InfoPage title="Terms & Conditions" activeKey="terms" onNav={setPage}
          subtitle="Order, payment, delivery aur returns — RK Grocery Mart ke saath shopping ke saare niyam."
          body={shopSettings.terms_text} fallback={<TermsBody/>}>
          <div className="mt-6 md:mt-8"><Footer shopSettings={shopSettings} onNav={setPage}/></div>
        </InfoPage>}
        {page==='shipping'&&<InfoPage title="Delivery & Shipping" activeKey="shipping" onNav={setPage}
          subtitle="Delivery time, charges, tracking aur refund — sab kuch clearly explain kiya gaya hai."
          body={shopSettings.shipping_rules} fallback={<ShippingBody/>}>
          <div className="mt-6 md:mt-8"><Footer shopSettings={shopSettings} onNav={setPage}/></div>
        </InfoPage>}

        {/* ── SHOP ── */}
        {page==='shop'&&(
          <>
            <div className="d-view"><DesktopShop
              allCats={allCats} activeCatId={activeCatId} catEmoji={catEmoji} catCounts={catCounts}
              visibleShopProds={visibleShopProds} shopIsLoading={shopIsLoading}
              isSearchActive={isSearchActive} searchResults={searchResults} shopTotal={shopTotal}
              inStockOnly={inStockOnly} search={search}
              sortBy={sortBy} setSortBy={setSortBy}
              cart={cart} addToCart={addToCart} updQty={updQty} onDetail={openDetail}
              totalPages={totalPages} shopPage={shopPage} setShopPage={setShopPage}
              onSidebarPick={(id)=>{setActiveCatId(id);setShopPage(1);setSearch('');}}
              wishlistIds={wishlistIds} onWishlist={toggleWishlist}
            /></div>
            <div className="m-view">
              <div className="px-2 pt-3" style={{background:'var(--card-bg)'}}>
                {/* BUG FIX: labelClass me line-clamp-1 tha — "Dairy Products & Milk"
                    jaise lambi category names cut ho jaate the (… dikhta tha). Ab koi
                    clamp nahi — naam pura wrap hokar dikhta hai, user ko koi problem nahi. */}
                <CategoryRail cats={allCats} catsLoading={catsLoading} activeCatId={activeCatId} catEmoji={catEmoji} fadeColor="var(--card-bg)" tileClass="w-[68px]" labelClass="text-[10px] leading-tight" onClick={id=>{setActiveCatId(id);setShopPage(1);setSearch('');}}/>
              </div>
              <div className="px-2 pt-3 pb-2" style={{background:'var(--card-bg)'}}>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="min-w-0">
                    <div className="font-extrabold font-poppins text-sm" style={{color:'var(--dark)'}}>
                      {shopIsLoading?'Loading…':(inStockOnly?`${visibleShopProds.length} in stock`:`${isSearchActive?searchResults.length:shopTotal} products`)}
                    </div>
                    <div className="text-[11px] font-poppins truncate" style={{color:'var(--gray)'}}>{allCats.find(c=>c.id===activeCatId)?.name||'All'}{search?` • "${search}"`:''}</div>
                  </div>
                  <button onClick={()=>setFilterDrawerOpen(true)}
                    className="flex-shrink-0 flex items-center gap-1.5 text-xs font-bold font-poppins rounded-xl px-3 py-2"
                    style={{border:'1.5px solid var(--border)',background:(sortBy!=='default'||inStockOnly)?'var(--primary-light)':'transparent',color:(sortBy!=='default'||inStockOnly)?'var(--primary-dark)':'var(--dark)'}}>
                    <SlidersHorizontal size={14}/> Filters
                  </button>
                </div>
                {shopIsLoading
                  ?<div className="grid grid-cols-2 gap-2.5" aria-busy="true" aria-label="Products load ho rahe hain">{[...Array(6)].map((_,i)=><SkelCard key={i}/>)}</div>
                  :<>
                    {visibleShopProds.length>0
                      ?<div className="grid grid-cols-2 gap-2.5">
                        {visibleShopProds.map(p=><PCard key={p.id} p={p} cart={cart} addToCart={addToCart} updQty={updQty} onDetail={openDetail} wishlistIds={wishlistIds} onWishlist={toggleWishlist}/>)}
                      </div>
                      :<div className="text-center py-10">
                        <div style={{fontSize:'3rem'}}>🔍</div>
                        <p className="mt-2 text-[0.88rem] font-semibold font-poppins" style={{color:'var(--gray)'}}>Koi product nahi mila</p>
                        {inStockOnly&&<button onClick={()=>setInStockOnly(false)} className="text-xs font-bold font-poppins mt-2" style={{color:'var(--primary)'}}>"In stock only" filter hataayein</button>}
                      </div>
                    }
                  </>
                }
                {!search&&totalPages>1&&(
                  <div className="flex justify-center gap-2 py-3">
                    {shopPage>1&&<button onClick={()=>setShopPage(p=>p-1)} className="px-4 py-2 rounded-lg font-bold font-poppins text-sm" style={{border:'1.5px solid var(--border)',background:'transparent',color:'var(--dark)'}}>← Prev</button>}
                    <span className="px-4 py-2 font-bold font-poppins text-sm" style={{color:'var(--gray)'}}>Page {shopPage} of {totalPages}</span>
                    {shopPage<totalPages&&<button onClick={()=>setShopPage(p=>p+1)} className="px-4 py-2 rounded-lg font-bold font-poppins text-sm text-white" style={{border:'1.5px solid var(--primary)',background:'var(--primary)'}}>Next →</button>}
                  </div>
                )}
              </div>
            </div>
            <style>{`.d-view{display:none}.m-view{display:block}@media(min-width:768px){.d-view{display:block}.m-view{display:none}}`}</style>

            {/* Mobile filter/sort bottom sheet (Module 4) */}
            {filterDrawerOpen&&(
              <div className="fixed inset-0 z-[70] flex items-end md:hidden" onClick={()=>setFilterDrawerOpen(false)}>
                <div className="absolute inset-0" style={{background:'rgba(0,0,0,0.4)'}}/>
                <div className="relative w-full rounded-t-2xl p-4" style={{background:'var(--card-bg)',maxHeight:'80vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm font-bold font-poppins" style={{color:'var(--dark)'}}>Filters &amp; Sort</div>
                    <button onClick={()=>setFilterDrawerOpen(false)} aria-label="Band karein"><X size={20} style={{color:'var(--gray)'}}/></button>
                  </div>
                  <div className="mb-5">
                    <div className="text-xs font-bold font-poppins mb-2 uppercase tracking-wide" style={{color:'var(--gray)'}}>Sort by</div>
                    <div className="flex flex-col gap-1.5">
                      {SORT_OPTIONS.map(o=>(
                        <button key={o.v} onClick={()=>setSortBy(o.v)}
                          className="text-left text-sm font-poppins px-3 py-2.5 rounded-xl"
                          style={{background:sortBy===o.v?'var(--primary-light)':'transparent',color:sortBy===o.v?'var(--primary-dark)':'var(--dark)',fontWeight:sortBy===o.v?700:500}}>
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-poppins cursor-pointer mb-6" style={{color:'var(--dark)'}}>
                    <input type="checkbox" checked={inStockOnly} onChange={e=>setInStockOnly(e.target.checked)} style={{accentColor:'var(--primary)',width:16,height:16}}/>
                    In stock only
                  </label>
                  <button onClick={()=>setFilterDrawerOpen(false)}
                    className="w-full text-white font-bold font-poppins py-3 rounded-xl" style={{background:'var(--primary)'}}>
                    {visibleShopProds.length} results dikhayein
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── PRODUCT DETAIL ── */}
        {page==='detail'&&detailProduct&&(
          <ProductDetail key={detailProduct.id} product={detailProduct} cart={cart} addToCart={addToCart} updQty={updQty} onBack={()=>setPage('shop')} onDetail={openDetail} wishlistIds={wishlistIds} onWishlist={toggleWishlist} priceAlerts={priceAlerts} onToggleAlert={toggleAlert}/>
        )}

        {/* ── CHECKOUT ── */}
        {page==='checkout'&&(
          <div className="checkout-page">
            <button className="pdp-back" style={{marginBottom:6}} onClick={()=>setPage('home')}>← Checkout se Bahar Jao</button>
            <h2>🚚 Checkout</h2>
            <CheckoutForm cart={cart} total={total} showToast={showToast} user={user}
              onSuccess={(id,pay)=>{setSuccess({id,pay});setPage('success');}}/>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {page==='success'&&success&&(
          <div className="success-page">
            <div className="success-anim">🎉</div>
            <h2>Order Place Ho Gaya!</h2>
            <div className="order-pill">Order #{success.id}</div>
            <p>{success.pay==='cod'?'💵 Delivery par cash dena':success.pay==='razorpay'?'💳 Online payment successful — order confirm ho gaya!':'⏳ Payment verify ho rahi hai — 10-15 min mein confirm ho jayega'}</p>
            <p>⏰ 1-2 ghante mein delivery hogi</p>
            <div className="flex gap-2.5 mt-4 justify-center">
              <button className="home-btn" style={{margin:0}} onClick={()=>{setSuccess(null);setPage('home');}}>🏠 Home Par Jao</button>
              <a className="home-btn" style={{margin:0,textDecoration:'none',display:'inline-flex',alignItems:'center',gap:6}}
                href="account.html" onClick={()=>{setSuccess(null);}}>📦 Track Order</a>
            </div>
          </div>
        )}
      </div>

      {/* ── CART DRAWER (Module 6: Tailwind restyle) ──
           NOTE: ".drawer-bg" and ".cart-drawer" class names are KEPT — their
           CSS (position:fixed, the bottom-sheet slideUp animation, z-index
           stacking above the bottom-nav, dark-mode background) already
           works and isn't worth re-deriving in Tailwind. ".total-row" is
           ALSO kept exactly — checkout-location-react.js does
           `querySelectorAll('.total-row')` to inject a delivery-charge line
           above it once a location is picked, so removing/renaming it would
           silently break that. Only the inner item markup/colors changed. ── */}
      {cartOpen&&(
        <>
          <div className="drawer-bg" onClick={()=>setCartOpen(false)}/>
          <div className="cart-drawer flex flex-col" style={{background:'var(--card-bg)'}}>
            <div className="w-10 h-1 rounded-full mx-auto mt-3 flex-shrink-0" style={{background:'var(--border)'}}/>
            <div className="flex items-center justify-between px-5 pt-3 pb-2.5 flex-shrink-0" style={{borderBottom:'1px solid var(--border)'}}>
              <div className="font-extrabold font-poppins text-base" style={{color:'var(--dark)'}}>🛒 Mera Cart ({count} items)</div>
              <button aria-label="Cart band karein" onClick={()=>setCartOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-lg" style={{color:'var(--gray)'}}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {cart.length===0
                ?<div className="text-center py-10">
                  <div className="text-5xl animate-bounce">🛒</div>
                  <p className="mt-3 text-sm font-bold font-poppins" style={{color:'var(--gray)'}}>Cart khali hai!</p>
                </div>
                :cart.map(i=>{
                  // Bug fix #1 (preserved): resolve a known stock_quantity for this cart
                  // line so the '+' button here respects the same stock ceiling as the
                  // product card / PDP.
                  // Multi-unit: line ka variant hain to us variant ka stock use karo
                  // (product-level stock se nahi — create_order bhi variant stock check
                  // karta hai, dono consistent rahein).
                  const prod=productById.current[i.id];
                  const varStock=i.variant&&prod&&Array.isArray(prod.units)
                    ?(prod.units.find(u=>u.label===i.variant)?.stock)
                    :undefined;
                  const knownStock=typeof varStock==='number'?varStock:prod?.stock_quantity;
                  const atMax=typeof knownStock==='number'&&i.qty>=knownStock;
                  return(
                    <div key={i.k||i.id} className="flex items-center gap-3 py-2.5" style={{borderBottom:'1px solid var(--border)'}}>
                      {i.image
                        ?<img src={i.image} alt={i.name} className="w-11 h-11 rounded-xl object-cover flex-shrink-0" style={{background:'var(--light)'}}/>
                        :<div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{background:'var(--light)'}}>🛒</div>}
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-bold font-poppins truncate" style={{color:'var(--dark)'}}>{i.name} <span className="font-normal" style={{color:'var(--gray)',fontSize:'0.7rem'}}>({i.unit})</span></div>
                        <div className="text-xs font-poppins font-semibold mt-0.5" style={{color:'var(--primary)'}}>₹{i.price} × {i.qty} = <b>₹{(i.price*i.qty).toFixed(0)}</b></div>
                        {atMax&&<div className="text-[10px] font-poppins font-semibold mt-0.5" style={{color:'var(--red)'}}>Sirf {knownStock} stock mein hai</div>}
                        <button onClick={()=>saveForLater(i)} className="text-[10px] font-semibold font-poppins mt-1 flex items-center gap-0.5 rounded-md px-2 py-1 transition-colors" style={{color:'var(--gray)',background:'var(--light)',border:'1px solid var(--border)'}}>🔖 Save for Later</button>
                      </div>
                      <div className="flex items-center rounded-lg overflow-hidden flex-shrink-0" style={{border:'1.5px solid var(--primary)'}}>
                        <button aria-label="Quantity kam karein" onClick={()=>updQty(i.id,-1,null,i.k||i.id)}
                          className="w-7 h-7 flex items-center justify-center text-white font-bold" style={{background:'var(--primary)'}}>−</button>
                        <span className="w-6 text-center text-xs font-bold font-poppins" style={{color:'var(--dark)'}}>{i.qty}</span>
                        <button aria-label="Quantity badhayein" disabled={atMax} onClick={()=>!atMax&&updQty(i.id,1,knownStock,i.k||i.id)}
                          className="w-7 h-7 flex items-center justify-center text-white font-bold disabled:opacity-40" style={{background:'var(--primary)'}}>+</button>
                      </div>
                    </div>
                  );
                })
              }
            </div>
            {cart.length>0&&(
              <div className="px-5 flex-shrink-0" style={{borderTop:'1.5px solid var(--border)',paddingTop:14,paddingBottom:'calc(env(safe-area-inset-bottom,0px) + 16px)'}}>
                {!user&&
                  <div className="flex items-center gap-2 rounded-xl px-2.5 py-2 mb-2.5 text-xs font-semibold font-poppins" style={{background:'var(--tint-yellow-bg)',border:'1px solid var(--tint-yellow-border)',color:'var(--tint-yellow-text)'}}>
                    🔐 Checkout se pehle login zaroori hai
                  </div>
                }
                <div className="total-row font-poppins" style={{color:'var(--dark)'}}><span>Total</span><span style={{color:'var(--primary)'}}>₹{total.toFixed(0)}</span></div>
                <button onClick={goToCheckout}
                  className="w-full text-white font-extrabold font-poppins rounded-2xl py-3.5 text-sm"
                  style={{background:'linear-gradient(135deg, var(--primary), var(--primary-dark))',boxShadow:'0 6px 16px rgba(22,163,74,0.35)'}}>
                  {user?`Checkout — ₹${total.toFixed(0)} →`:'Login & Checkout →'}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── BOTTOM NAV (Module 2: Tailwind + lucide restyle) ──
           NOTE: the outer element KEEPS the "bottom-nav" class — ananya-ai.js
           does `querySelector('.bottom-nav')` to position the chat widget
           above it, so this class name must never be removed. */}
      <div className="bottom-nav flex" style={{background:'var(--card-bg)'}}>
        {[
          {id:'home',icon:Home,l:'Home'},
          {id:'shop',icon:ShoppingBag,l:'Shop'},
        ].map(n=>{
          const Icon=n.icon;const active=page===n.id;
          return(
            <div key={n.id} className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5"
              onClick={()=>setPage(n.id)}>
              <Icon size={21} strokeWidth={active?2.5:1.8} style={{color:active?'var(--primary)':'var(--gray)'}}/>
              <span className="text-[10px] font-medium font-poppins" style={{color:active?'var(--primary)':'var(--gray)'}}>{n.l}</span>
            </div>
          );
        })}
        <div className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5"
          onClick={()=>window.location.href='support.html'}>
          <Headphones size={21} strokeWidth={1.8} style={{color:'var(--gray)'}}/>
          <span className="text-[10px] font-medium font-poppins" style={{color:'var(--gray)'}}>Help</span>
        </div>
        {!isPWA&&(
          <div className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5" onClick={()=>openAppDownload(showToast)}>
            <Download size={21} strokeWidth={1.8} style={{color:'var(--primary)'}}/>
            <span className="text-[10px] font-bold font-poppins" style={{color:'var(--primary)'}}>Get App</span>
          </div>
        )}
        <div className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5" onClick={()=>setCartOpen(true)}>
          {count>0&&<span className="absolute top-1 right-1/4 w-4 h-4 text-white text-[9px] font-bold rounded-full flex items-center justify-center font-poppins" style={{background:'var(--orange)'}}>{count>9?'9+':count}</span>}
          <ShoppingCart size={21} strokeWidth={page==='cart'?2.5:1.8} style={{color:page==='cart'?'var(--primary)':'var(--gray)'}}/>
          <span className="text-[10px] font-medium font-poppins" style={{color:page==='cart'?'var(--primary)':'var(--gray)'}}>Cart</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5"
          onClick={()=>{if(user)window.location.href='account.html';else openLogin();}}>
          <User size={21} strokeWidth={page===(user?'account':'login')?2.5:1.8} style={{color:page===(user?'account':'login')?'var(--primary)':'var(--gray)'}}/>
          <span className="text-[10px] font-medium font-poppins" style={{color:page===(user?'account':'login')?'var(--primary)':'var(--gray)'}}>{user?'Account':'Login'}</span>
        </div>
      </div>

      {toast&&<div className="toast" role="status" aria-live="polite">{toast}</div>}

      {/* ── AUTH MODAL (Module 7) ── */}        {authModal&&(
          <AuthModal mode={authModal} onClose={()=>setAuthModal(null)} onSwitchMode={m=>setAuthModal(m)}/>
        )}
    </div>
  );
}
