// Shaped skeleton placeholders (Module 3: Tailwind pulse) that mirror real content
// layout (PCard, hero banner, category chip) so loading states don't cause layout
// shift and look intentional, not like blank flashes.

export const SkelCard=()=>(
  <div className="rounded-2xl overflow-hidden flex flex-col h-full" style={{background:'var(--card-bg)'}} aria-hidden="true">
    <div className="aspect-square animate-pulse" style={{background:'var(--light)'}}/>
    <div className="p-2.5 flex flex-col gap-2">
      <div className="h-3 w-4/5 rounded animate-pulse" style={{background:'var(--light)'}}/>
      <div className="h-2.5 w-2/5 rounded animate-pulse" style={{background:'var(--light)'}}/>
      <div className="flex items-center justify-between mt-1">
        <div className="h-3.5 w-10 rounded animate-pulse" style={{background:'var(--light)'}}/>
        <div className="h-6 w-12 rounded-lg animate-pulse" style={{background:'var(--light)'}}/>
      </div>
    </div>
  </div>
);

export const SkelBanner=()=>(
  <div className="w-full h-full flex-shrink-0 rounded-2xl animate-pulse" style={{background:'var(--light)'}} aria-hidden="true"/>
);

// Module 4: restyled to match MobileCatRow's new Tailwind chip (was the last
// skeleton still on the old plain-CSS .cat-chip/.skel-cat classes).
export const SkelCat=()=>(
  <div className="flex flex-col items-center gap-1 flex-shrink-0 w-[60px]" aria-hidden="true">
    <div className="w-full aspect-square rounded-2xl animate-pulse" style={{background:'var(--light)'}}/>
    <div className="h-2 w-8 rounded animate-pulse" style={{background:'var(--light)'}}/>
  </div>
);
