/* Overflow checker — headless Chrome via CDP (no puppeteer needed).
   Usage: node check-overflow.js <url> [viewportWidth] */
const { spawn } = require('child_process');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const url = process.argv[2] || 'http://localhost:5174/';
const vw = parseInt(process.argv[3], 10) || 390;
const PORT = 9229;

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--remote-debugging-address=127.0.0.1',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--user-data-dir=C:/tmp/rk-cdp-profile',
  `--window-size=${vw},844`,
  'about:blank',
]);
chrome.stderr.on('data', () => {});
chrome.stdout.on('data', () => {});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWS() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* not up yet */ }
    await sleep(400);
  }
  throw new Error('Chrome CDP not reachable');
}

async function main() {
  const wsUrl = await getWS();
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };

  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await new Promise((r) => ws.onopen = r);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: vw, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await send('Page.navigate', { url });
  await sleep(6000); // let React mount + data load

  const evalJS = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  const report = await evalJS(`(function(){
    var dw = document.documentElement.scrollWidth;
    var bw = document.body ? document.body.scrollWidth : 0;
    var iw = window.innerWidth;
    var cw = document.documentElement.clientWidth;
    var overflowing = [];
    if (dw > cw + 2) {
      var els = document.querySelectorAll('body *');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var r = el.getBoundingClientRect();
        if (r.right > cw + 2 && r.width > 0) {
          overflowing.push({
            tag: el.tagName,
            cls: (typeof el.className === 'string' ? el.className.split(' ').slice(0,4).join('.') : ''),
            right: Math.round(r.right),
            w: Math.round(r.width),
          });
        }
      }
      overflowing = overflowing.slice(0, 12);
    }
    return JSON.stringify({ scrollWidth: dw, bodyWidth: bw, innerWidth: iw, clientWidth: cw, overflow: dw - cw, elements: overflowing });
  })()`);

  console.log(report);
  ws.close();
  chrome.kill();
  process.exit(0);
}

main().catch((e) => { console.error('ERR', e.message); chrome.kill(); process.exit(1); });
