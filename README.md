# myshop — Vite MPA (Multi-Page App)

Original `myshop` (vanilla HTML/CSS/JS + in-browser Babel React) ko **Vite MPA** mein convert kiya gaya hai. Functionality, design, backend connections — sab kuch 100% same hai. Sirf structure modular + properly bundled ho gaya hai.

## ⚠️ Judva bhai: `myshopadmin` (Admin Panel) — YAAD RAKHNA

**`myshop` ka ek judva bhai hai: `myshopadmin` — ek alag project/repo. Wahi Admin Panel hai.** Dono ek hi Supabase project share karte hain, bas kaam alag hai:

| Project | Kaam |
|---|---|
| **myshop** (ye repo) | Customer site — products dikhna, cart, checkout, orders, payment |
| **myshopadmin** (alag repo) | **Admin Panel** — products, **images**, categories, orders, settings, sab kuch yahi se manage hota hai |

- Products/images/categories/settings **myshopadmin se manage** hote hain — `myshop` unhe sirf **read** karta hai.
- Is repo ke comments me jo "admin panel" / "admin Settings page" likha hai (e.g. `src/components/CheckoutForm.jsx`, `src/hooks/dataHooks.js`), wo **myshopadmin** ko hi refer karta hai.
- `scripts/generate-product-images.js|py` jo images bana kar Cloudinary + Supabase `product_images` me daalte hain, wo images **myshopadmin ke image manager me turant dikhti hain** (wahi se edit/delete bhi ho sakti hain).
- Debugging tip: customer site par koi cheez nahi dikh rahi (naya product, image, coupon, UPI ID, delivery radius...) → pehle **myshopadmin** check karo — **wohi source of truth hai.**

## Kya badla
- `index.html` ka `<script type="text/babel">` block (1430+ lines, sab kuch ek jagah) ko proper React modules mein toda gaya: `src/App.jsx`, `src/hooks/`, `src/components/`, `src/lib/`.
- CDN se load ho rahe React/ReactDOM/Babel/Supabase-js scripts hata diye — ab npm packages (`react`, `react-dom`, `@supabase/supabase-js`) se Vite bundle karta hai.
- `account.html`, `login.html`, `signup.html`, `forgot-password.html`, `reset-password.html`, `email-verified.html`, `offline.html` — yeh sab **bilkul untouched** hain (byte-for-byte identical), kyunki yeh already vanilla JS the.
- Saare static assets (`js/`, `css/`, `icons/`, `images/`, `manifest.json`, `service-worker.js`, `pwa.js`, `auth.js`, `auth.css`, etc.) `public/` folder mein move kiye gaye — bilkul same content, sirf Vite convention ke hisaab se location.
- `api/chat.js` (Vercel serverless function / Ananya AI backend) — bilkul untouched.

## Setup

```bash
npm install
npm run dev      # local dev server
npm run build    # production build → dist/
npm run preview  # preview the production build
```

## Bulk Product Image Generator (AI → Cloudinary → Supabase)

Saare products ke liye AI se square product images generate karke Cloudinary par **product name se** upload karta hai, aur Supabase `product_images` table me link kar deta hai — site par images turant dikhti hain. Fully automated, ek command.

> 🐍 **Python version bhi available hai** — `python scripts/generate-product-images.py --help` (same flags, koi dependency nahi, sirf Python 3.9+).

### 🆓 FREE mode (default) — zero cost
Default source **Pollinations.ai (Flux)** hai — **bilkul free, unlimited, koi API key nahi** chahiye generation ke liye. Sirf 2 free Cloudinary keys chahiye (signed upload ke liye):

```bash
# .env.local me ye 2 daalo (dekho .env.example):
#   CLOUDINARY_API_KEY       → Cloudinary Dashboard → Settings → API Keys (FREE)
#   CLOUDINARY_API_SECRET    → Cloudinary Dashboard → Settings → API Keys (FREE)

node scripts/generate-product-images.js                # saare products (FREE 🆓)
node scripts/generate-product-images.js --limit 5      # sirf pehle 5 (test ke liye)
node scripts/generate-product-images.js --dry-run      # bina kuch kiye list dekho
node scripts/generate-product-images.js --category Dairy
node scripts/generate-product-images.js --force        # already hain to bhi redo
node scripts/generate-product-images.js --delay 15000  # free mode: requests ke beech gap (default 15s)
```

### ✨ Better quality (optional, paid) — Gemini
Agar free quality se zyada chahiye, to `--source gemini` ya `--source auto` (fail ho to free par chale):

```bash
# .env.local me aur ye daalo:
#   GEMINI_API_KEY            → aistudio.google.com/apikey
node scripts/generate-product-images.js --source gemini
node scripts/generate-product-images.js --source auto
```

### Details
- Images square (1:1) generate hoti hain — site ke cards ke aspect ratio se match.
- Cloudinary par `myshop/products/<product-slug>` par save hoti hai (slug = product name).
- Jo products ke paas pehle se image hai wo skip ho jaate hain — dobara chalane par sirf baaki ke retry hote hain.
- Result list `scripts/upload-results.json` me save hoti hai.
- Free mode me ~1 request/15s rate limit hai — 152 images ~35–40 min me ho jayengi (sab FREE).
- Cost: FREE mode = ₹0. Gemini mode = ~₹3–12 per image.

## Deploy (Vercel)
`vercel.json` already configured: `buildCommand: npm run build`, `outputDirectory: dist`. Environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY`) Vercel dashboard mein set karein — `.env.example` dekhein.

## Project Structure
```
index.html              # React home page entry (Vite + React)
account.html, login.html, ... # vanilla pages (untouched)
src/
  main.jsx              # React entry point
  App.jsx               # main Home page component (same logic as original)
  hooks/dataHooks.js     # useCategories, useBanners, useProducts, useSearch
  components/           # PCard, ProductDetail, CheckoutForm, UpiPayCard, etc.
  lib/                  # supabaseClient.js, helpers.js
public/                 # all static assets (js/, css/, icons/, images/, manifest, sw, etc.)
api/chat.js             # Ananya AI serverless backend (untouched)
scripts/generate-product-images.js  # Bulk AI product image generator
vite.config.js          # multi-page (MPA) entry configuration
```
