import { useState } from 'react';

export const ProdImg=({src,alt,style,className=''})=>{
  const [err,setErr]=useState(false);
  // #33 fix: emoji fallback ki jagah saaf "Photo nahi hai" placeholder
  if(!src||err) return <div className={`w-full h-full flex flex-col items-center justify-center gap-1 ${className}`} style={{...style,background:'var(--light)'}}><span className="text-2xl" aria-hidden="true">🖼️</span><span className="text-[10px] font-semibold font-poppins" style={{color:'var(--muted)'}}>Photo nahi hai</span></div>;
  return <img src={src} alt={alt||''} width={600} height={600} loading="lazy" decoding="async" style={style} className={`w-full h-full object-cover ${className}`} onError={()=>setErr(true)}/>;
};
