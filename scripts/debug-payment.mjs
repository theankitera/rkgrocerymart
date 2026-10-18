/**
 * scripts/debug-payment.mjs — Puppeteer debug for the Razorpay payment flow.
 * Usage: node scripts/debug-payment.mjs [baseURL]
 * Captures: console errors, page errors, failed/4xx-5xx requests, Razorpay
 * SDK availability, and the /api/razorpay-order + /api/razorpay-verify responses.
 */
import puppeteer from 'puppeteer';

const BASE = process.argv[2] || 'http://localhost:4173';

const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[console.${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} → ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.request().method()} ${r.url()}`); });

console.log('== goto', BASE);
const resp = await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 45000 });
console.log('page status:', resp?.status());

// ── 1. Razorpay SDK load check ───────────────────────────────
const sdk = await page.evaluate(async () => {
  const had = !!window.Razorpay;
  if (!had) {
    await new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = () => res();
      s.onerror = () => res();
      document.head.appendChild(s);
      setTimeout(res, 8000);
    });
  }
  return { before: had, after: !!window.Razorpay };
});
console.log('Razorpay SDK:', JSON.stringify(sdk));

// ── 2. API probes (same origin, browser context) ─────────────
const probes = {};
probes.order_noBody = await page.evaluate(async () => {
  const r = await fetch('/api/razorpay-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  return { status: r.status, body: (await r.text()).slice(0, 400) };
});
probes.order_amountOnly = await page.evaluate(async () => {
  const r = await fetch('/api/razorpay-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 1000 }) });
  return { status: r.status, body: (await r.text()).slice(0, 400) };
});
probes.order_fakeOrder = await page.evaluate(async () => {
  const r = await fetch('/api/razorpay-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 10000, orderId: '00000000-0000-0000-0000-000000000000' }) });
  return { status: r.status, body: (await r.text()).slice(0, 400) };
});
probes.verify = await page.evaluate(async () => {
  const r = await fetch('/api/razorpay-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: 'x', razorpay_order_id: 'o', razorpay_payment_id: 'p', razorpay_signature: 's' }) });
  return { status: r.status, body: (await r.text()).slice(0, 400) };
});
console.log('== API probes ==');
for (const [k, v] of Object.entries(probes)) console.log(`${k}: ${v.status} ${v.body}`);

// ── 3. App-level env sanity (bundle inlined key) ─────────────
const pageHasReact = await page.evaluate(() => !!document.querySelector('#root')?.children.length || !!document.querySelector('main'));
console.log('app rendered:', pageHasReact);

console.log('== browser issues ==');
console.log(logs.length ? logs.join('\n') : '(none)');

await browser.close();