import { ProdImg } from './ProdImg';

// ── Product Card (Module 3: Tailwind restyle — same props/logic as before) ──
// wishlistIds (Set of product ids already in wishlist) + onWishlist(p) toggle
// are optional — cards outside the store (none today) simply skip the heart.
export function PCard({p,cart,addToCart,updQty,onDetail,wishlistIds,onWishlist}){
  // Multi-unit (2026-08): products.units = [{label,price,mrp,stock}]. Card par
  // sabse sasta/pehla unit dikhta hai + "Multiple sizes" chip; ADD pehla unit
  // add karta hai. Line key = `id::label` (alag units alag cart lines).
  const units=(p.units&&Array.isArray(p.units)&&p.units.length>1)?p.units:null;
  const first=units?units[0]:null;
  const lineKey=first?`${p.id}::${first.label}`:p.id;
  const inC=cart.find(i=>(i.k||i.id)===lineKey);
  const displayPrice=first?first.price:p.selling_price;
  const displayUnit=first?first.label:p.unit_value;
  const displayMrp=first?first.mrp:p.original_price;
  const displayStock=first?(typeof first.stock==='number'?first.stock:p.stock_quantity):p.stock_quantity;
  const disc=p.discount;
  const oos=displayStock<=0;
  const atMax=inC&&typeof displayStock==='number'&&inC.qty>=displayStock;
  const wished=wishlistIds&&wishlistIds.has(p.id);
  // ADD payload — selected variant ke saath (App.jsx addToCart _variant padhta hai)
  const addPayload=first?{...p,_variant:first.label,selling_price:first.price,unit_value:first.label,original_price:first.mrp??p.original_price,stock_quantity:displayStock}:p;
  return(
    <div className="rounded-2xl overflow-hidden cursor-pointer flex flex-col h-full"
      style={{background:'var(--card-bg)',boxShadow:'0 2px 10px rgba(0,0,0,0.06)'}}
      onClick={()=>onDetail&&onDetail(p)}>
      {/* Fix: overflow-hidden — image apni natural aspect-ratio se container ko
          kheench kar non-square (144x151/144x199) na bana de. Iske bina 3:4
          portrait images se cards alag-size dikhte the + detail page par
          horizontal overflow hota tha. */}
      <div className="relative aspect-square overflow-hidden" style={{background:'var(--light)'}}>
        {/* Fix #7 (preserved): no discount tag on a card already covered by the out-of-stock overlay */}
        {disc&&!oos&&(
          <span className="absolute top-2 left-2 z-10 text-white text-[10px] font-bold font-poppins px-1.5 py-0.5 rounded-md"
            style={{background:'var(--red)'}}>{disc}% OFF</span>
        )}
        {oos&&(
          <div className="absolute inset-0 z-10 flex items-center justify-center text-xs font-bold font-poppins text-white"
            style={{background:'rgba(0,0,0,0.45)'}}>Out of Stock</div>
        )}
        {/* ❤️ Wishlist heart — top-right. Guest par login modal khulta hai
            (App.jsx me onWishlist decide karta hai). stopPropagation taaki
            card ka detail-open click na chale. */}
        {onWishlist&&(
          <button
            aria-label={wished?'Wishlist se hatao':'Wishlist mein jodo'}
            onClick={e=>{e.stopPropagation();onWishlist(p);}}
            className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-transform active:scale-90 hover:scale-110"
            style={{
              background: wished?'var(--tint-red-bg)':'var(--card-bg)',
              border:'1px solid '+ (wished?'var(--tint-red-border)':'var(--border)'),
              boxShadow:'0 2px 8px rgba(0,0,0,0.14)',
              fontSize:16,lineHeight:1,
              color: wished?'var(--tint-red-text)':'var(--gray)',
            }}>
            {wished?'❤️':'🤍'}
          </button>
        )}
        <ProdImg src={p.primary_image} alt={p.name}/>
      </div>
      <div className="p-2.5 flex-1 flex flex-col">
        <div className="text-xs font-semibold font-poppins line-clamp-2 leading-snug" style={{color:'var(--dark)'}}>{p.name}</div>
        <div className="text-[10px] font-poppins mt-0.5" style={{color:'var(--gray)'}}>
          {displayUnit}
          {units&&<span className="ml-1 font-bold px-1.5 py-0.5 rounded-md" style={{background:'var(--primary-light)',color:'var(--primary-dark)'}}>{units.length} sizes</span>}
        </div>
        <div className="flex items-end justify-between mt-auto pt-2 gap-1">
          <div className="min-w-0">
            {displayMrp&&<div className="text-[10px] line-through font-poppins" style={{color:'var(--gray)'}}>₹{displayMrp}</div>}
            <div className="text-sm font-extrabold font-poppins" style={{color:'var(--dark)'}}>₹{displayPrice}</div>
          </div>
          {!oos&&(!inC
            ?<button onClick={e=>{e.stopPropagation();addToCart(addPayload);}}
              className="flex-shrink-0 text-[10px] font-bold font-poppins px-3 py-1.5 rounded-lg text-white"
              style={{background:'var(--primary)'}}>ADD</button>
            :<div className="flex-shrink-0 flex items-center gap-1.5 rounded-lg px-1.5 py-1" style={{background:'var(--primary-light)'}} onClick={e=>e.stopPropagation()}>
              <button aria-label="Quantity kam karein" onClick={()=>updQty(p.id,-1,null,lineKey)}
                className="w-5 h-5 flex items-center justify-center font-bold text-sm" style={{color:'var(--primary-dark)'}}>−</button>
              <span className="text-xs font-bold font-poppins w-3 text-center" style={{color:'var(--primary-dark)'}}>{inC.qty}</span>
              <button aria-label="Quantity badhayein" disabled={atMax} onClick={()=>!atMax&&updQty(p.id,1,displayStock,lineKey)}
                className="w-5 h-5 flex items-center justify-center font-bold text-sm disabled:opacity-40" style={{color:'var(--primary-dark)'}}>+</button>
            </div>
          )}
        </div>
        {atMax&&<div className="text-[10px] font-semibold font-poppins mt-1" style={{color:'var(--red)'}}>Sirf {displayStock} stock mein hai</div>}
      </div>
    </div>
  );
}
