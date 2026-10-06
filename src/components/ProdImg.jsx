import { useState } from 'react';

export const ProdImg=({src,alt,style,className=''})=>{
  const [err,setErr]=useState(false);
  if(!src||err) return <div className={`w-full h-full flex items-center justify-center text-3xl ${className}`} style={style}>🛒</div>;
  return <img src={src} alt={alt||''} style={style} className={`w-full h-full object-cover ${className}`} onError={()=>setErr(true)}/>;
};
