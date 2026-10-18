/** One-off debug probe — POST /api/razorpay-order with a REAL pending DB order. */
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:4173';
const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.on('response', (r) => { if (r.url().includes('localhost:4173/api/')) console.log('[NET]', r.request().method(), r.url(), '→', r.status()); });
page.on('console', (m) => { if (m.type() === 'error') console.log('[CONSOLE.ERR]', m.text().slice(0, 200)); });

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 45000 });

// amount ₹15 = 1500 paise (final_amount of pending orders)
const res = await page.evaluate(async () => {
  const r = await fetch('/api/razorpay-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 1500, receipt: 'RK-2026-425272', orderId: '14fccb94-95c6-4353-aa51-7077434eea38', notes: { orderNumber: 'RK-2026-425272' } }),
  });
  return { status: r.status, body: (await r.text()).slice(0, 400) };
});
console.log('[PROBE real order] →', JSON.stringify(res, null, 2));

await browser.close();