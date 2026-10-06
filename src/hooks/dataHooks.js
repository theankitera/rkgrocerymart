import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { calcDiscount } from '../lib/helpers';

// ── Data Hooks ────────────────────────────────────────────
export function useCategories(){
  const [cats,setCats]=useState([]);
  const [loading,setLoading]=useState(true);
  const instanceId=useRef(Math.random().toString(36).slice(2)).current;
  const fetch=useCallback(async()=>{
    const {data}=await supabase.from('categories').select('*,category_images(id,image_url,is_default,sort_order)').eq('is_active',true).order('sort_order');
    const enrichedCats=(data||[]).map(c=>{const imgs=(c.category_images||[]).slice().sort((a,b)=>a.sort_order-b.sort_order);const defImg=imgs.find(i=>i.is_default)||imgs[0];return{...c,display_image:defImg?.image_url||c.image_url||null};});
    setCats(enrichedCats);setLoading(false);
  },[]);
  useEffect(()=>{
    fetch();
    const ch=supabase.channel(`cats-rt-${instanceId}`).on('postgres_changes',{event:'*',schema:'public',table:'categories'},fetch).subscribe();
    return()=>supabase.removeChannel(ch);
  },[fetch]);
  return{cats,loading};
}

export function useBanners(){
  const [banners,setBanners]=useState([]);
  const [loading,setLoading]=useState(true);
  const instanceId=useRef(Math.random().toString(36).slice(2)).current;
  const fetch=useCallback(async()=>{
    const {data}=await supabase.from('banners').select('*').eq('is_active',true).order('sort_order');
    setBanners(data||[]);setLoading(false);
  },[]);
  useEffect(()=>{
    fetch();
    const ch=supabase.channel(`banners-rt-${instanceId}`).on('postgres_changes',{event:'*',schema:'public',table:'banners'},fetch).subscribe();
    return()=>supabase.removeChannel(ch);
  },[fetch]);
  return{banners,loading};
}

export function useProducts(options={}){
  const {categoryId,featured,search,page=1,pageSize=24}=options;
  const [products,setProducts]=useState([]);
  const [loading,setLoading]=useState(true);
  const [total,setTotal]=useState(0);
  const instanceId=useRef(Math.random().toString(36).slice(2)).current;
  // BUG FIX: stale-response guard — search/category jaldi badalne par purana
  // (dheema) response naye response ko overwrite nahi karega (admin Products.jsx
  // jaisa hi pattern).
  const loadId=useRef(0);
  const fetch=useCallback(async()=>{
    const fid=++loadId.current;
    setLoading(true);
    let q=supabase.from('products')
      .select('*,categories(id,name,slug),product_images(id,image_url,is_default,sort_order)',{count:'exact'})
      .eq('is_active',true).order('created_at',{ascending:false});
    if(categoryId&&categoryId!=='all') q=q.eq('category_id',categoryId);
    if(featured) q=q.eq('is_featured',true);
    if(search&&search.trim().length>1)
      // BUG FIX: double-quote wrap (PostgREST) — parentheses wale naam (e.g. "Adrak (Ginger)")
      // pehle or() parser ko tod dete the → product search me nahi aata tha.
      q=q.or(`name.ilike."%${search.trim()}%",description.ilike."%${search.trim()}%"`);
    const from=(page-1)*pageSize;
    q=q.range(from,from+pageSize-1);
    const {data,count}=await q;
    if(fid!==loadId.current) return; // purana response — ignore
    const enriched=(data||[]).map(p=>({
      ...p,
      discount:calcDiscount(p.selling_price,p.original_price),
      images:(p.product_images||[]).sort((a,b)=>a.sort_order-b.sort_order),
      // primary_image = admin ka ⭐ DEFAULT image (is_default flag) — wahi image
      // home page cards + overview par dikhti hai. Default nahi hai to pehli
      // (sort_order se) image fallback.
      primary_image:(()=>{const imgs=(p.product_images||[]).slice().sort((a,b)=>a.sort_order-b.sort_order);return(imgs.find(i=>i.is_default)||imgs[0])?.image_url||null;})(),
    }));
    setProducts(enriched);setTotal(count||0);setLoading(false);
  },[categoryId,featured,search,page,pageSize]);
  useEffect(()=>{
    fetch();
   const ch=supabase.channel(`prods-rt-${instanceId}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'products'},fetch)
      .on('postgres_changes',{event:'*',schema:'public',table:'product_images'},fetch)
      .subscribe();
    return()=>supabase.removeChannel(ch);
  },[fetch]);
  return{products,loading,total,totalPages:Math.ceil(total/pageSize),refetch:fetch};
}

// BUG FIX (Critical #1): Admin Settings page (UPI ID, shop name, contact, timings)
// pehle sirf DB mein save hota tha — customer site kabhi padhta hi nahi tha
// (UPI ID checkout mein hardcoded thi). Ye hook live shop_settings row deta hai,
// jise CheckoutForm aur baaki jagah use kiya ja sakta hai.
// Ab branding + social + footer + legal fields bhi isi se aate hain (admin Settings).
const SHOP_SETTINGS_DEFAULTS = {
  shop_name: 'RK Grocery Mart',
  contact: '',
  whatsapp: '',
  upi_id: 'Q025544077@ybl', // fallback agar admin ne settings save na ki ho
  delivery_radius: 8,
  delivery_charge: 30,
  open_time: '08:00',
  close_time: '21:00',
  logo_url: '',
  favicon_url: '',
  theme_color: '',
  social_facebook: '',
  social_instagram: '',
  social_whatsapp: '',
  social_youtube: '',
  footer_text: '',
  about_text: '',
  privacy_policy: '',
  terms_text: '',
  shipping_rules: '',
  announcement: '',
};
export function useShopSettings(){
  const [settings,setSettings]=useState(SHOP_SETTINGS_DEFAULTS);
  const [loading,setLoading]=useState(true);
  // BUG FIX: channel name per-mount unique hona zaroori hai — ye hook App.jsx aur
  // CheckoutForm.jsx DONO mein ek saath mount hota hai. Supabase same-topic channel
  // ko reuse karta hai, isliye static naam par 2nd hook .on() ko subscribe() ke baad
  // call karta tha → 'cannot add postgres_changes callbacks after subscribe()' crash.
  const instanceId=useRef(Math.random().toString(36).slice(2)).current;
  const fetch=useCallback(async()=>{
    const {data}=await supabase.from('shop_settings').select('*').eq('id',1).maybeSingle();
    if(data){
      setSettings({
        ...SHOP_SETTINGS_DEFAULTS,
        shop_name:data.shop_name||SHOP_SETTINGS_DEFAULTS.shop_name,
        contact:data.contact||'',
        whatsapp:data.whatsapp||'',
        upi_id:data.upi_id||SHOP_SETTINGS_DEFAULTS.upi_id,
        delivery_radius:data.delivery_radius??SHOP_SETTINGS_DEFAULTS.delivery_radius,
        delivery_charge:data.delivery_charge??SHOP_SETTINGS_DEFAULTS.delivery_charge,
        open_time:data.open_time||SHOP_SETTINGS_DEFAULTS.open_time,
        close_time:data.close_time||SHOP_SETTINGS_DEFAULTS.close_time,
        logo_url:data.logo_url||'',
        favicon_url:data.favicon_url||'',
        theme_color:data.theme_color||'',
        social_facebook:data.social_facebook||'',
        social_instagram:data.social_instagram||'',
        social_whatsapp:data.social_whatsapp||'',
        social_youtube:data.social_youtube||'',
        footer_text:data.footer_text||'',
        about_text:data.about_text||'',
        privacy_policy:data.privacy_policy||'',
        terms_text:data.terms_text||'',
        shipping_rules:data.shipping_rules||'',
        announcement:data.announcement||'',
      });
    }
    setLoading(false);
  },[]);
  useEffect(()=>{
    fetch();
    const ch=supabase.channel(`shop-settings-rt-${instanceId}`).on('postgres_changes',{event:'*',schema:'public',table:'shop_settings'},fetch).subscribe();
    return()=>supabase.removeChannel(ch);
  },[fetch]);
  return{settings,loading};
}

// BUG FIX (Critical #3): Coupon validation hook — customer checkout mein pehle
// koi coupon code input hi nahi tha. Ye hook ek code ko coupons table ke against
// validate karta hai (active, expiry, min_order, usage_limit) aur discount value deta hai.
// Ab customer/product/category-specific targeting bhi check hota hai (admin Coupons page).
// `ctx` = { userId, productIds[] } — checkout se milta hai.
export function useCouponValidator(){
  const [checking,setChecking]=useState(false);
  const validate=useCallback(async(code,orderTotal,ctx={})=>{
    const clean=(code||'').trim().toUpperCase();
    if(!clean) return{valid:false,reason:'Coupon code daalein'};
    setChecking(true);
    const {data,error}=await supabase.from('coupons').select('*').eq('code',clean).eq('is_active',true).maybeSingle();
    setChecking(false);
    if(error||!data) return{valid:false,reason:'Coupon code valid nahi hai'};
    if(data.expiry_date&&new Date(data.expiry_date)<new Date(new Date().toDateString())) return{valid:false,reason:'Coupon expire ho chuka hai'};
    if(data.usage_limit!=null&&(data.used_count||0)>=data.usage_limit) return{valid:false,reason:'Coupon ki usage limit khatam ho gayi'};
    if(data.min_order&&orderTotal<data.min_order) return{valid:false,reason:`Minimum order ₹${data.min_order} hona chahiye`};

    // ── Targeting (customer / product / category specific) ──
    const customerIds=data.customer_ids||[];
    if(customerIds.length){
      if(!ctx.userId||!customerIds.includes(ctx.userId)) return{valid:false,reason:'Ye coupon aapke account ke liye nahi hai'};
    }
    const productIds=ctx.productIds||[];
    const catIds=[];
    if((data.product_ids||[]).length||(data.category_ids||[]).length){
      if(!productIds.length) return{valid:false,reason:'Ye coupon specific products ke liye hai — cart mein kuch daalein'};
      if((data.category_ids||[]).length){
        const {data:prods}=await supabase.from('products').select('id,category_id').in('id',productIds);
        (prods||[]).forEach(p=>{if(p.category_id)catIds.push(p.category_id);});
      }
      const inProducts=(data.product_ids||[]).length?productIds.some(id=>(data.product_ids||[]).includes(id)):true;
      const inCats=(data.category_ids||[]).length?catIds.some(id=>(data.category_ids||[]).includes(id)):true;
      if(!inProducts||!inCats) return{valid:false,reason:'Ye coupon aapke cart ke items par nahi chalta'};
    }

    const discount=data.discount_type==='percent'?Math.round(orderTotal*(data.discount_value/100)):data.discount_value;
    const finalDiscount=Math.min(discount,orderTotal);
    return{valid:true,code:data.code,discount:finalDiscount,coupon:data};
  },[]);
  return{validate,checking};
}

// ── Homepage premium sections (Module 12) ──────────────────────────────
// Derives Flash Sale / Today's Deals / Best Sellers / New Arrivals from ONE
// products batch so the homepage never fans out into 4 parallel queries.
// Sections are computed client-side from REAL product data (discount from
// original vs selling price, stock, created_at) — no fake numbers anywhere.
export function useHomeSections(){
  const [sections,setSections]=useState({flash:[],deals:[],bestSellers:[],newArrivals:[]});
  const [loading,setLoading]=useState(true);
  const fetch=useCallback(async()=>{
    try{
      const {data}=await supabase.from('products')
        .select('*,categories(id,name,slug),product_images(id,image_url,is_default,sort_order)')
        .eq('is_active',true)
        .order('is_featured',{ascending:false})
        .order('created_at',{ascending:false})
        .limit(80);
      const enriched=(data||[]).map(p=>{
        const imgs=(p.product_images||[]).slice().sort((a,b)=>a.sort_order-b.sort_order);
        return{
          ...p,
          discount:calcDiscount(p.selling_price,p.original_price),
          images:imgs,
          // primary_image = admin ka ⭐ DEFAULT image (is_default) — fallback imgs[0].
          primary_image:(imgs.find(i=>i.is_default)||imgs[0])?.image_url||null,
        };
      });
      const inStock=enriched.filter(p=>p.stock_quantity>0);
      // Flash Sale: admin ke is_flash_sale flag wale products (preferred);
      // agar koi flag nahi to purana behaviour — 20%+ discount wale.
      const flaggedFlash=inStock.filter(p=>p.is_flash_sale);
      const flashSource=flaggedFlash.length?flaggedFlash:inStock.filter(p=>p.discount>=20);
      setSections({
        flash:flashSource.sort((a,b)=>b.discount-a.discount).slice(0,8),
        deals:inStock.filter(p=>p.discount>0).sort((a,b)=>b.discount-a.discount).slice(0,8),
        bestSellers:inStock.filter(p=>p.is_bestseller||p.is_trending).length?[...inStock.filter(p=>p.is_bestseller||p.is_trending),...inStock].slice(0,8):inStock.slice(0,8),
        newArrivals:(enriched.some(p=>p.is_new_arrival)?enriched.filter(p=>p.is_new_arrival):enriched).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,8),
      });
    }catch(e){/* keep previous sections; just stop the loader */}
    setLoading(false);
  },[]);
  useEffect(()=>{fetch();},[fetch]);
  return{sections,loading};
}

// ── Homepage Builder (Module: admin control) ─────────────────────────────
// Admin ka Homepage Builder page `homepage_sections` table se sections ka
// order/visibility control karta hai. Ye hook wahi config deta hai — agar
// table missing/empty ho to DEFAULT order (sab sections on) fallback hota hai,
// taaki site kabhi tooti na dikhe.
export const DEFAULT_HOMEPAGE_SECTIONS = [
  'hero','flash_sale','today_deals','categories','featured','best_sellers',
  'new_arrivals','category_sections','why_choose_us','reviews',
  'download_app','newsletter','how_it_works',
];
export function useHomepageConfig(){
  const [sections,setSections]=useState(DEFAULT_HOMEPAGE_SECTIONS);
  const [configured,setConfigured]=useState(false);
  const [loading,setLoading]=useState(true);
  const instanceId=useRef(Math.random().toString(36).slice(2)).current;
  const fetch=useCallback(async()=>{
    try{
      // Saare rows (enabled + disabled) — taaki aggregate fallback ko pata ho ki
      // kis category ka apna row hai (disabled category ko fallback mein dobara
      // nahi dikhna chahiye). Rendering App.jsx me enabled filter karta hai.
      const {data,error}=await supabase.from('homepage_sections')
        .select('section_key,enabled,sort_order,ad_strip_id,category_id')
        .order('sort_order');
      if(!error&&data&&data.length){
        // Har section ab object hai (key + ad_strip_id + category_id + enabled) —
        // taaki Ad Strips aur HAR CATEGORY dono Section Order ke andar hi
        // position/visibility control ho sakein (admin har category ko alag se
        // drag karke kahin bhi rakh sakta hai — ad strips categories ke beech bhi).
        setSections(data.map(s=>({key:s.section_key,ad_strip_id:s.ad_strip_id||null,category_id:s.category_id||null,enabled:s.enabled!==false})));
        setConfigured(true);
      }else{
        setSections(DEFAULT_HOMEPAGE_SECTIONS);
        setConfigured(false);
      }
    }catch(_){
      setSections(DEFAULT_HOMEPAGE_SECTIONS);
      setConfigured(false);
    }
    setLoading(false);
  },[]);
  useEffect(()=>{
    fetch();
    const ch=supabase.channel(`homepage-sections-rt-${instanceId}`).on('postgres_changes',{event:'*',schema:'public',table:'homepage_sections'},fetch).subscribe();
    return()=>supabase.removeChannel(ch);
  },[fetch]);
  return{sections,configured,loading};
}

// ── Customer Reviews (admin approved) ────────────────────────────────────
// Admin ke Reviews page par APPROVED reviews hi public dikhte hain.
export function useReviews(){
  const [reviews,setReviews]=useState([]);
  const [loading,setLoading]=useState(true);
  const fetch=useCallback(async()=>{
    try{
      const {data,error}=await supabase.from('reviews')
        .select('customer_name,rating,comment,admin_reply,products(name)')
        .eq('status','approved')
        .order('created_at',{ascending:false})
        .limit(12);
      if(!error)setReviews(data||[]);
    }catch(_){/* keep [] */}
    setLoading(false);
  },[]);
  useEffect(()=>{fetch();},[fetch]);
  return{reviews,loading};
}

/* ── Homepage Ad Strips (mid-page auto-scrolling image strips, no text/dots) ── */
export function useAdStrips(){
  const [strips,setStrips]=useState([]);
  const [loading,setLoading]=useState(true);
  const fetch=useCallback(async()=>{
    try{
      const {data,error}=await supabase.from('homepage_ad_sections')
        .select('id,title,position,homepage_ad_images(id,image_url,link_type,link_value,sort_order)')
        .eq('is_active',true)
        .order('position',{ascending:true});
      if(error)return;
      const out=(data||[])
        .map(s=>({
          ...s,
          images:(s.homepage_ad_images||[]).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)),
        }))
        .filter(s=>s.images.length>0);
      setStrips(out);
    }catch(_){/* keep [] */}
    setLoading(false);
  },[]);
  useEffect(()=>{fetch();},[fetch]);
  return{strips,loading,refetch:fetch};
}

export function useSearch(query,active){
  const [results,setResults]=useState([]);
  const [loading,setLoading]=useState(false);
  const timer=useRef(null);
  useEffect(()=>{
    // Bug fix #4: don't run search queries at all when the search UI isn't active
    // (e.g. checkout/detail/success pages) — avoids needless background Supabase calls.
    if(!active||!query||query.trim().length<2){setResults([]);return;}
    clearTimeout(timer.current);
    timer.current=setTimeout(async()=>{
      setLoading(true);
      const {data}=await supabase.from('products')
        .select('*,categories(name),product_images(id,image_url,is_default,sort_order)')
        .eq('is_active',true)
        // BUG FIX: double-quote wrap (PostgREST) — parentheses wale naam sahi search ho sakein
        .or(`name.ilike."%${query.trim()}%",description.ilike."%${query.trim()}%"`)
        .limit(40);
      setResults((data||[]).map(p=>({
        ...p,
        discount:calcDiscount(p.selling_price,p.original_price),
        images:(p.product_images||[]).slice().sort((a,b)=>a.sort_order-b.sort_order),
        // primary_image = admin ka ⭐ DEFAULT image (is_default) — fallback imgs[0].
        primary_image:(()=>{const imgs=(p.product_images||[]).slice().sort((a,b)=>a.sort_order-b.sort_order);return(imgs.find(i=>i.is_default)||imgs[0])?.image_url||null;})(),
      })));
      setLoading(false);
    },350);
    return()=>clearTimeout(timer.current);
  },[query,active]);
  return{results,loading};
}