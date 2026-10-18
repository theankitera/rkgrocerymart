import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// MPA mode: har HTML file ek alag Vite entry point hai.
// Build hone par Vite har page ko independently bundle karta hai —
// sirf index.html React (src/) use karta hai, baaki pages apne
// original vanilla JS (public/js/*.js) ke saath jaise the waise hi chalte hain.
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = __dirname;
const require = createRequire(import.meta.url);

// ── /api/* local dev support ─────────────────────────────────────────────
// FIX (payment bug): `npm run dev` / `npm run preview` mein Vercel ke
// serverless functions (api/*.js) load hi nahi hote the → /api/razorpay-order
// 404 → frontend "Online payment shuru nahi hua" dikhata tha. Ye middleware
// wahi Vercel-style handler(req, res) locally chalata hai (serve-dist.mjs
// jaisa), taaki dev flow production ke bilkul same ho.
function loadLocalEnv() {
  // Vite/12-factor convention: .env baseline, .env.local override kare.
  // Shell/CI se aayi env vars kabhi override nahi hoti.
  const preexisting = new Set(Object.keys(process.env));
  for (const f of ['.env', '.env.local']) {
    const p = resolve(root, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!preexisting.has(m[1])) process.env[m[1]] = v;
    }
  }
}

function readBody(req) {
  return new Promise((resolveBody) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolveBody(data));
    req.on('error', () => resolveBody(data));
  });
}

function apiMiddleware() {
  return async (req, res, next) => {
    const pathname = (req.url || '').split('?')[0];
    if (!pathname.startsWith('/api/')) return next();
    const name = pathname.replace(/^\/api\/|\.js$/g, '');
    const file = resolve(root, 'api', `${name}.js`);
    if (!fs.existsSync(file)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      return res.end('{"error":"FUNCTION_NOT_FOUND"}');
    }
    try {
      loadLocalEnv(); // handler top-level par env padhta hai — pehle load
      const body = await readBody(req);
      if (req.headers['content-type']?.includes('application/json') && body) {
        try { req.body = JSON.parse(body); } catch { req.body = body; }
      } else { req.body = body || {}; }
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (obj) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(obj));
        return res;
      };
      const handler = require(file);
      await handler(req, res);
    } catch (err) {
      console.error(`[api/${name}]`, err);
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: String(err?.message || err) }));
      }
    }
  };
}

const apiFunctionsPlugin = () => ({
  name: 'local-serverless-api',
  configureServer(server) { server.middlewares.use(apiMiddleware()); },
  configurePreviewServer(server) { server.middlewares.use(apiMiddleware()); },
});

export default defineConfig({
  plugins: [react(), apiFunctionsPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        account: resolve(__dirname, 'account.html'),
        login: resolve(__dirname, 'login.html'),
        signup: resolve(__dirname, 'signup.html'),
        forgotPassword: resolve(__dirname, 'forgot-password.html'),
        resetPassword: resolve(__dirname, 'reset-password.html'),
        emailVerified: resolve(__dirname, 'email-verified.html'),
        support: resolve(__dirname, 'support.html'),
        offline: resolve(__dirname, 'offline.html'),
      },
    },
  },
});
