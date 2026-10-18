/**
 * scripts/rzp-flow.mjs — Puppeteer E2E for the Razorpay checkout flow.
 * Creates a temporary Supabase auth user, logs in through the real UI,
 * adds a product to cart, opens checkout, picks Online Payment and clicks
 * Pay Now — capturing every console error, failed request and API response.
 * Usage: node scripts/rzp-flow.mjs [baseURL]
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const BASE = process.argv[2] || 'http://localhost:4173';

function loadEnv(file) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] ??= v;
  }
}
loadEnv('.env');
loadEnv('.env.local');

const SU = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = `rzpdebug${Date.now()}@example.com`;
const PASSWORD = 'RzpDebug#12345';

// ── 0. temporary test user (cleaned up at the end) ───────────
let userId = null;
{
  const r = await fetch(`${SU}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  });
  const j = await r.json().catch(() => ({}));
  userId = j.id;
  console.log('temp user:', r.status, EMAIL, userId || JSON.stringify(j).slice(0, 150));
  if (!userId) process.exit(1);
}

const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions(BASE, ['geolocation']);

const page = await browser.newPage();
await page.setViewport({ width: 420, height: 900 }); // mobile-ish
await page.setGeolocation({ latitude: 25.83, longitude: 82.75 }); // Jaunpur

const issues = [];
const api = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) issues.push(`[console.${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => issues.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => issues.push(`[requestfailed] ${r.url()} → ${r.failure()?.errorText}`));
page.on('request', (req) => { if (req.url().includes('/api/')) console.log('[REQ]', req.method(), req.url().replace(BASE, '')); });
page.on('response', async (r) => {
  const u = r.url();
  const tracked = u.includes('/api/razorpay') || u.includes('razorpay.com') || (u.includes('supabase') && (r.request().method() === 'POST' || r.request().method() === 'PATCH'));
  // FIX: status TURANT console par log karo — pehle r.text() ka await pehle
  // tha, jo /api/razorpay-order response par hang hone se entry ko kabhi
  // api[] mein push hone hi nahi deta tha (localhost call log se gayab rehta tha)
  if (tracked) console.log('[NET]', r.status(), r.request().method(), u.replace(BASE, '').slice(0, 110));
  if (tracked) {
    let body = '';
    try { body = (await Promise.race([r.text(), new Promise((res) => setTimeout(() => res('<body-timeout>'), 3000))])).slice(0, 300); } catch {}
    api.push(`[HTTP ${r.status()}] ${r.request().method()} ${u.replace(BASE, '')}\n    → ${body}`);
  }
  if (r.status() >= 400) issues.push(`[http ${r.status()}] ${r.request().method()} ${u}`);
});

const step = async (label, fn) => { console.log('→', label); try { await fn(); } catch (e) { issues.push(`[step failed: ${label}] ${e.message}`); throw e; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // ── 1. login ───────────────────────────────────────────────
  await step('open login page', () => page.goto(`${BASE}/login.html`, { waitUntil: 'networkidle2', timeout: 45000 }));
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.type('input[type="email"]', EMAIL, { delay: 10 });
  await page.type('input[type="password"]', PASSWORD, { delay: 10 });
  await step('submit login', async () => {
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForFunction(() => {
        const has = (s) => { try { return Object.keys(s).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token')); } catch { return false; } };
        return has(localStorage) || has(sessionStorage);
      }, { timeout: 30000 }),
    ]);
  });
  console.log('   logged in ✓');

  // ── 2. home → add-to-cart ──────────────────────────────────
  await step('open home', () => page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 45000 }));
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /add/i.test(b.textContent || '')), { timeout: 30000 });
  await step('click Add to cart', async () => {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /add/i.test(b.textContent || '') && !/address/i.test(b.textContent || ''));
      btn.click();
    });
    await sleep(1200);
  });
  const cartBtnText = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent).filter((t) => /checkout/i.test(t)));
  console.log('   cart/checkout buttons:', JSON.stringify(cartBtnText).slice(0, 200));

  // ── 3. open checkout ──────────────────────────────────────
  await step('open cart drawer', async () => {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('[aria-label]')].find((e) => /^Cart[, ]/.test(e.getAttribute('aria-label') || ''));
      if (el) el.click();
      else location.hash = '#cart';
    });
    await sleep(900);
  });
  await step('go to checkout', async () => {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /checkout/i.test(b.textContent || ''));
      btn?.click();
    });
    await page.waitForSelector('#co-name', { timeout: 20000 });
  });

  // ── 4. contact details + address ──────────────────────────
  await step('fill contact', async () => {
    await page.click('#co-name', { clickCount: 3 });
    await page.type('#co-name', 'RZP Debug User', { delay: 5 });
    await page.click('#co-phone', { clickCount: 3 });
    await page.type('#co-phone', '9876543210', { delay: 5 });
  });
  await step('fill address', async () => {
    const hasAddr = await page.$('.addr-card');
    if (!hasAddr) {
      await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Naya Address/i.test(b.textContent || ''))?.click());
      await page.waitForSelector('#addr-line1', { timeout: 10000 });
      await page.type('#addr-line1', '123 Test Street');
      await page.type('#addr-line2', 'Near Chowk');
      await page.click('#addr-pin');
      await page.type('#addr-pin', '222001', { delay: 5 });
      await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Address Save/i.test(b.textContent || ''))?.click());
      await sleep(1500);
    }
  });

  // ── 5. pick Online Payment + place order ──────────────────
  await step('select Online Payment', async () => {
    const clicked = await page.evaluate(() => {
      // FIX (pichhle selector ki bug): outer card ka textContent bhi 💳 se shuru
      // hota hai aur uske bhi ≤4 children hain → card click ho jaata tha, option nahi.
      // Ab precise: wahi div dhoondho jiske DIRECT child ka text 'Online Payment' ho.
      const el = [...document.querySelectorAll('div')].find((d) =>
        [...d.children].some((c) => c.textContent.trim() === 'Online Payment'));
      if (!el) return false;
      el.click();
      return true;
    });
    console.log('   option div found & clicked:', clicked);
    await sleep(400);
    // Verify: React state set hua ya nahi (button ka label badalna chahiye)
    const label = await page.evaluate(() => document.querySelector('.place-order-btn')?.textContent?.trim() || '');
    console.log('   button label after select:', JSON.stringify(label));
  });
  const toastsSeen = new Set();
  let realAlert = null;
  await step('click Pay Now', async () => {
    // (1) Purana toast (2.2s auto-clear) click se pehle jaane do — warna woh
    //     fixed z-index overlay button ke center par baith kar tap kha jaata hai.
    const tw0 = Date.now();
    while (await page.evaluate(() => !!document.querySelector('.toast')) && Date.now() - tw0 < 4000) await sleep(200);
    // (2) Button ko viewport ke centre mein lao (small mobile viewport par yeh
    //     seedha niche bahar reh jaata hai: btnRect.y=884, center=908 > 900).
    await page.evaluate(() => document.querySelector('.place-order-btn')?.scrollIntoView({ block: 'center' }));
    await sleep(300);
    // (3) Overlay diagnose: abhi button ke center par asli kaun sa element hai?
    const diag = await page.evaluate(() => {
      const b = document.querySelector('.place-order-btn');
      const r = b?.getBoundingClientRect();
      if (!r) return null;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const t = document.querySelector('.toast');
      const tr = t?.getBoundingClientRect();
      return {
        hitTestId: top ? `${top.tagName}.${String(top.className).slice(0, 60)} ` : '(null)',
        hitIsButton: top === b || b?.contains(top),
        btnRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        toastRect: tr ? { x: Math.round(tr.x), y: Math.round(tr.y), w: Math.round(tr.width), h: Math.round(tr.height) } : null,
        toastText: t?.textContent || null,
      };
    });
    console.log('== CLICK DIAG ==:', JSON.stringify(diag));
    await page.click('.place-order-btn');
    // showToast 2.2s mein clear ho jaata hai — poll karke turant pakdo,
    // warna 8s baad padhne par static delivery-warning div pakad aata tha.
    const t0 = Date.now();
    while (Date.now() - t0 < 7000) {
      const s = await page.evaluate(() => ({
        toast: document.querySelector('.toast')?.textContent || null,
        alert: document.querySelector('[role="alert"]')?.textContent || null,
        btn: document.querySelector('.place-order-btn')?.textContent?.trim() || '',
        modal: !!document.querySelector('iframe[src*="razorpay"], .razorpay-container, #razorpay-payment-blanket'),
      }));
      if (s.toast) toastsSeen.add(s.toast);
      if (s.alert && !realAlert) realAlert = s.alert;
      if (s.modal) break;
      await sleep(250);
    }
    await sleep(2000);
  });
  console.log('== TOASTS SEEN ==:', JSON.stringify([...toastsSeen]));
  console.log('== IMMEDIATE ALERT ==:', realAlert || '(none)');

  const orderError = await page.evaluate(() => document.querySelector('[role="alert"]')?.textContent || null);
  // FIX: pehle `.map(d=>d.textContent).find((t)=>… d.className)` mein d scope se bahar
  // tha → "d is not defined" throw hokar pura report maar deta tha. Ab divs par hi filter.
  const payInfo = await page.evaluate(() => ({
    buttonLabel: document.querySelector('.place-order-btn')?.textContent?.trim() || null,
    razorpayNotice: !![...document.querySelectorAll('div')].find((d) => /Online payment Razorpay se/.test(d.textContent || '')),
    rzpKeyConfigured: !!(window.__VITE_RAZORPAY_KEY_PRESENT__ || /rzp_[a-zA-Z0-9]+/.test(document.documentElement.innerHTML)),
  }));
  console.log('== PAY STATE ==:', JSON.stringify(payInfo));
  const toast = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => d.className && d.textContent && d.textContent.length < 160 && /try|fail|error|zaroori|nahi|chunein/i.test(d.textContent));
    return el ? el.textContent : null;
  });
  const rzpSel = await page.evaluate(() => {
    const sels = ['iframe[src*="razorpay"]', '.razorpay-container', '#razorpay-payment-blanket', 'iframe[title*="Razorpay"]'];
    for (const s of sels) { const el = document.querySelector(s); if (el) return { sel: s, src: (el.getAttribute('src') || '').slice(0, 120) }; }
    return null;
  });
  const rzpModal = !!rzpSel;
  console.log('== RAZORPAY DOM ==:', JSON.stringify(rzpSel));
  console.log('\n== ORDER ERROR ==:', orderError || '(none)');
  console.log('== RAZORPAY MODAL OPEN ==:', rzpModal);
  console.log('== TOAST-LIKE ==:', toast || '(none)');
  await page.screenshot({ path: path.join(root, 'scripts', 'rzp-flow-shot.png'), fullPage: false });
} catch (e) {
  console.log('FLOW FAILED:', e.message);
  try { await page.screenshot({ path: path.join(root, 'scripts', 'rzp-flow-shot.png') }); } catch {}
}

console.log('\n== API / SUPABASE CALLS ==');
console.log(api.join('\n') || '(none)');
console.log('\n== ISSUES ==');
console.log(issues.join('\n') || '(none)');

await browser.close();

// ── cleanup: drop temp user + any test rows he created ──────
try {
  const del = await fetch(`${SU}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: { apikey: SK, Authorization: `Bearer ${SK}` } });
  console.log('\ncleanup temp user:', del.status);
} catch (e) { console.log('cleanup failed:', e.message); }