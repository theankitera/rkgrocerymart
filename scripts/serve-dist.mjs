/**
 * scripts/serve-dist.mjs — DEBUG helper (not deployed)
 * Vercel-jaisa local server: dist/ static serve + /api/*.js serverless handlers
 * with .env.local loaded, taaki Razorpay flow locally bilkul production jaisa chale.
 * Usage: node scripts/serve-dist.mjs [port]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const PORT = Number(process.argv[2] || 4173);

// load .env + .env.local
// FIX (payment bug): pehle .env load hota tha aur "pehle define = usi ki chale"
// rule se .env ka PURANA/invalid Razorpay pair (.env.local ke working pair se
// alag) server par jeet jaata tha → /api/razorpay-order hamesha Razorpay se
// 401 "Authentication failed" laata tha. Ab Vite/12-factor convention: .env
// baseline, .env.local OVERRIDE kare. Shell/CI se aayi env kabhi override nahi.
const preexisting = new Set(Object.keys(process.env));
for (const f of ['.env', '.env.local']) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!preexisting.has(m[1])) process.env[m[1]] = v; // .env.local (doosri line) override karegi
  }
}

const require = createRequire(import.meta.url);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  // ── /api/* → Vercel-style function ──────────────────────────
  if (pathname.startsWith('/api/')) {
    const name = pathname.replace(/^\/api\/|\.js$/g, '');
    const file = path.join(root, 'api', `${name}.js`);
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('{"error":"FUNCTION_NOT_FOUND"}'); }
    try {
      const body = await readBody(req);
      if (req.headers['content-type']?.includes('application/json') && body) {
        try { req.body = JSON.parse(body); } catch { req.body = body; }
      } else { req.body = body || {}; }
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
      const handler = require(file);
      await handler(req, res);
    } catch (err) {
      console.error(`[api/${name}]`, err);
      if (!res.writableEnded) { res.statusCode = 500; res.end(JSON.stringify({ error: String(err?.message || err) })); }
    }
    return;
  }

  // ── static from dist/ ───────────────────────────────────────
  let file = path.join(dist, pathname);
  if (!file.startsWith(dist)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = path.join(dist, 'index.html'); // MPA fallback
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => console.log(`[serve-dist] http://localhost:${PORT}`));