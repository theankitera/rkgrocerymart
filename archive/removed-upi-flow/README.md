# Removed UPI flow — archive

Manual UPI / QR-code payment flow hata diya gaya hai — ab sirf **Cash on Delivery
(COD)** aur **Online Payment via Razorpay** chalte hain (CheckoutForm.jsx:337
comment dekho: "UPI-QR/UTR verification flow hata diya gaya — ab sirf Razorpay + COD").

## Kya hataya gaya (2026-11-28, Batch 1 — S-m2)

- `public/images/payment-qr.png` (75,594 bytes) — UPI QR image; poore repo mein
  **0 references** (grep verify kiya). Yahan move ki gayi, delete nahi ki gayi.

## Kya yahan NAHI hai (aur kyun)

- `public/js/payment.js` — poora UPI screenshot-verification flow abhi bhi repo
  mein hai (`public/js/payment.js`), kyunki uska **1 reference bacha hai**:
  `public/service-worker.js:54` (PRECACHE_URLS list). Move karne se pehle SW
  precache list se entry hatani hogi + SW version bump karna hoga — ye Batch 1
  ke scope se bahar tha, isliye file ko chheda nahi gaya. Koi HTML/JS usko
  load nahi karta (sirf SW precache karta hai).
