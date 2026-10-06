#!/usr/bin/env node
/*!
 * Bulk AI Product Image Generator — Rinku Kirana & General Store
 * ---------------------------------------------------------------
 * Ye script poora flow automate karti hai:
 *   1. Supabase se saare active products padhti hai (category ke saath)
 *   2. Har product ke liye AI (Gemini image models) se SQUARE product image generate karti hai
 *   3. Cloudinary par SIGNED upload se public_id = product name (slug) set karti hai
 *   4. Supabase `product_images` table me insert karti hai → site par image turant dikhti hai
 *
 * Zero dependencies — Node 18+ built-in fetch/FormData/crypto se chalta hai.
 *
 * IMAGE SOURCES:
 *   --source free    (DEFAULT) → Pollinations.ai (Flux) — BILKUL FREE, unlimited,
 *                                 koi API key nahi chahiye. ~1 request / 15s per IP.
 *   --source gemini             → Gemini image models (GEMINI_API_KEY chahiye)
 *   --source auto               → Gemini pehle try karo, fail ho to free par chalo
 *
 * REQUIRED env vars (.env.local me daalein):
 *   CLOUDINARY_API_KEY           → Cloudinary Dashboard → Settings → API Keys (FREE)
 *   CLOUDINARY_API_SECRET        → Cloudinary Dashboard → Settings → API Keys (FREE)
 *
 * OPTIONAL env vars:
 *   GEMINI_API_KEY               → Google AI Studio se (sirf --source gemini/auto ke liye)
 *   SUPABASE_SERVICE_ROLE_KEY    → Supabase Dashboard → Settings → API (insert ke liye,
 *                                  RLS bypass karta hai; nahi di to anon key se try hoga)
 *   SUPABASE_URL / SUPABASE_ANON_KEY  → default already set hain
 *   CLOUDINARY_CLOUD_NAME        → default 'delf8iyzt'
 *   CLOUDINARY_FOLDER            → default 'myshop/products'
 *   GEMINI_IMAGE_MODEL           → specific gemini model force karne ke liye
 *
 * USAGE:
 *   node scripts/generate-product-images.js                  # sab products (FREE source)
 *   node scripts/generate-product-images.js --limit 5        # sirf pehle 5
 *   node scripts/generate-product-images.js --category "Dairy" 
 *   node scripts/generate-product-images.js --dry-run        # bina generate kiye list
 *   node scripts/generate-product-images.js --force          # images already hon to bhi redo
 *   node scripts/generate-product-images.js --delay 15000    # free mode me requests ke beech rukna (ms)
 *   node scripts/generate-product-images.js --source gemini  # paid/better quality (GEMINI_API_KEY chahiye)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Defaults ─────────────────────────────────────────────────────────────
const SUPABASE_URL     = process.env.SUPABASE_URL     || 'https://pffaflasgwhydkmxwkky.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable__tFDYhkM3blZ0pIVT0YxLA_YvkKq79L';
const CLOUD_NAME        = process.env.CLOUDINARY_CLOUD_NAME || 'delf8iyzt';
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || 'myshop/products';
const OUTPUT_JSON       = path.join(__dirname, 'upload-results.json');

// ── Tiny .env loader (dotenv dependency ke bina) ─────────────────────────
function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    try {
      const txt = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
      for (const line of txt.split('\n')) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (m && !(m[1] in process.env)) {
          process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
        }
      }
    } catch (e) { /* file nahi mili — koi baat nahi */ }
  }
}

// ── CLI args ─────────────────────────────────────────────────────────────
function parseArgs() {
  const a = process.argv.slice(2);
  const get = (k, d) => { const i = a.indexOf(k); return i >= 0 ? (a[i + 1] || d) : d; };
  return {
    limit: parseInt(get('--limit', '0'), 10) || 0,
    category: get('--category', null),
    concurrency: parseInt(get('--concurrency', '0'), 10) || 0,
    source: get('--source', 'free'),
    delay: parseInt(get('--delay', '0'), 10) || 0,
    dryRun: a.includes('--dry-run'),
    force: a.includes('--force'),
    verbose: a.includes('--verbose'),
  };
}

// ── Supabase helpers ─────────────────────────────────────────────────────
async function supabaseGet(path, key) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Supabase GET ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function supabasePost(path, body, key) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const txt = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Supabase POST ${path} → ${res.status}: ${txt}`);
  }
}

// ── Gemini image generation ──────────────────────────────────────────────
const GEMINI_TIMEOUT_MS = 60000;
const IMAGEN_MODEL = 'imagen-3.0-generate-002';

function scoreImageModel(name) {
  let s = 0;
  if (/gemini-3/.test(name)) s += 100;
  if (/gemini-2\.5-flash-image/.test(name)) s += 80;
  if (/gemini-2\.0-flash/.test(name)) s += 60;
  if (/imagen/.test(name)) s += 40;
  if (/preview|exp|beta|dev|nano-1/.test(name)) s -= 15;
  return s;
}

async function discoverImageModels(apiKey) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || [])
      .map(m => m.name.replace(/^models\//, ''))
      .filter(n => /image|imagen|nano/i.test(n))
      .sort((a, b) => scoreImageModel(b) - scoreImageModel(a));
  } catch (e) {
    return [];
  }
}

// Response JSON me kahin bhi image dhundho — inlineData / fileData / interactions-style
function extractImage(json) {
  let out = null;
  (function walk(node, depth = 0) {
    if (out || depth > 7 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const n of node) walk(n, depth + 1); return; }
    const uri = node.fileData?.fileUri || node.file_uri || node.uri;
    const b64 = node.inlineData?.data || node.inline_data?.data || node.bytesBase64Encoded || node.data;
    if (typeof b64 === 'string' && b64.length > 100 && /^[A-Za-z0-9+/=]+$/.test(b64)) {
      out = { kind: 'b64', data: b64, mime: node.inlineData?.mimeType || node.inline_data?.mimeType || 'image/png' };
      return;
    }
    if (typeof uri === 'string' && /^https?:\/\//.test(uri)) {
      out = { kind: 'uri', uri };
      return;
    }
    for (const k of Object.keys(node)) walk(node[k], depth + 1);
  })(json);
  return out;
}

async function fetchFileData(uri, apiKey) {
  // Kuch models image ko file URL me dete hain — usse download karo
  const sep = uri.includes('?') ? '&' : '?';
  const res = await fetch(`${uri}${sep}key=${apiKey}`, { signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`fileData download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { kind: 'b64', data: buf.toString('base64'), mime: res.headers.get('content-type') || 'image/png' };
}

async function generateWithGemini(apiKey, model, prompt) {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    }
  );
  if (!res.ok) {
    const txt = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`${model} → ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const img = extractImage(data);
  if (!img) throw new Error(`${model}: response me image data nahi mila`);
  return img.kind === 'uri' ? await fetchFileData(img.uri, apiKey) : img;
}

// Naye Nano Banana (3.x image) models `interactions` endpoint use karte hain
async function generateWithInteractions(apiKey, model, prompt) {
  const body = {
    model,
    input: [{ type: 'text', text: prompt }],
    response_format: {
      type: 'image',
      mime_type: 'image/jpeg',
      aspect_ratio: '1:1',
      image_size: '1K',
    },
  };
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
  });
  if (!res.ok) {
    const txt = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`${model} (interactions) → ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const img = extractImage(data);
  if (!img) throw new Error(`${model} (interactions): response me image data nahi mila`);
  return img.kind === 'uri' ? await fetchFileData(img.uri, apiKey) : img;
}

async function generateWithImagen(apiKey, prompt) {
  const body = {
    instances: [{ prompt }],
    parameters: { sampleCount: 1, aspectRatio: '1:1', outputMimeType: 'image/jpeg' },
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    }
  );
  if (!res.ok) throw new Error(`${IMAGEN_MODEL} → ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = await res.json();
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error(`${IMAGEN_MODEL}: response me image nahi mili`);
  return { kind: 'b64', data: b64, mime: data.predictions[0].mimeType || 'image/jpeg' };
}

// ── Pollinations.ai — FREE, unlimited, koi API key nahi ──────────────────
// URL-based API: image.pollinations.ai/prompt/<prompt>?model=flux&width=..&height=..
// Returns raw image bytes (binary), not JSON.
const POLLINATIONS_URL = 'https://image.pollinations.ai/prompt/'; // alt: gen.pollinations.ai/image/
const POLLINATIONS_TIMEOUT_MS = 120000;

async function generateWithPollinations(prompt) {
  const params = new URLSearchParams({
    model: 'flux',
    width: '1024',
    height: '1024',
    nologo: 'true',
    seed: String(Math.floor(Math.random() * 1000000)),
  });
  const url = `${POLLINATIONS_URL}${encodeURIComponent(prompt)}?${params}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(POLLINATIONS_TIMEOUT_MS),
    headers: { Accept: 'image/*' },
  });
  if (!res.ok) {
    const txt = (await res.text().catch(() => '')).slice(0, 150);
    throw new Error(`Pollinations → ${res.status}: ${txt}`);
  }
  const ct = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());
  if (!ct.includes('image') || buf.length < 1000) {
    throw new Error(`Pollinations ne image nahi diya (${ct}, ${buf.length} bytes): ${buf.slice(0, 150).toString()}`);
  }
  return { buffer: buf, model: 'pollinations-flux' };
}

// Pehle preferred image models try karo, phir imagen fallback
// Har model ke liye: generateContent → (3.x par) interactions → agla model → imagen
async function generateProductImageGemini(apiKey, modelList, prompt, verbose) {
  const models = (modelList && modelList.length ? modelList : []);
  for (const model of models) {
    try {
      const img = await generateWithGemini(apiKey, model, prompt);
      if (verbose) console.log(`  ✅ Gemini model chala: ${model} (generateContent)`);
      return { img, model };
    } catch (e) {
      console.log(`  ⚠️  ${model} (generateContent) fail → ${e.message.split('\n')[0].slice(0, 90)}`);
      // 3.x image models naye interactions endpoint pe chalte hain — woh bhi try karo
      if (/gemini-3/.test(model)) {
        try {
          const img = await generateWithInteractions(apiKey, model, prompt);
          if (verbose) console.log(`  ✅ Gemini model chala: ${model} (interactions)`);
          return { img, model };
        } catch (e2) {
          console.log(`  ⚠️  ${model} (interactions) fail → ${e2.message.split('\n')[0].slice(0, 90)}`);
        }
      }
    }
  }
  try {
    const img = await generateWithImagen(apiKey, prompt);
    if (verbose) console.log('  ✅ imagen fallback chala');
    return { img, model: IMAGEN_MODEL };
  } catch (e) {
    throw new Error(`Saare Gemini image models fail: ${e.message.slice(0, 120)}`);
  }
}

// Unified: source ke hisaab se image generate karo, buffer return karo
async function generateProductImage(source, { apiKey, modelList, prompt, verbose }) {
  if (verbose) console.log(`  🎨 prompt: ${prompt.slice(0, 110)}…`);
  if (source === 'free') {
    return generateWithPollinations(prompt);
  }
  try {
    const { img, model } = await generateProductImageGemini(apiKey, modelList, prompt, verbose);
    const buffer = Buffer.from(img.data, 'base64');
    return { buffer, model };
  } catch (e) {
    if (source === 'auto') {
      console.log(`  ⚠️  Gemini fail → FREE Pollinations par chale: ${e.message.slice(0, 80)}`);
      return generateWithPollinations(prompt);
    }
    throw e;
  }
}

// ── Cloudinary signed upload (public_id = product name) ──────────────────
function slugify(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'product';
}

function cloudinarySignature(params, apiSecret) {
  const str = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(str + apiSecret).digest('hex');
}

async function uploadToCloudinary(buffer, publicId, apiKey, apiSecret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { timestamp, folder: CLOUDINARY_FOLDER, public_id: publicId, overwrite: 'true' };
  const signature = cloudinarySignature(params, apiSecret);

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/jpeg' }), `${publicId}.jpg`);
  form.append('timestamp', String(timestamp));
  form.append('folder', CLOUDINARY_FOLDER);
  form.append('public_id', publicId);
  form.append('overwrite', 'true');
  form.append('api_key', apiKey);
  form.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Cloudinary upload → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.secure_url || data.url || null;
}

// ── Prompt builder ───────────────────────────────────────────────────────
function buildPrompt(p) {
  const cat = p.categories?.name ? `, ${p.categories.name}` : '';
  const unit = p.unit_value ? ` (${p.unit_value})` : '';
  return `Professional e-commerce product photograph of ${p.name}${unit}${cat}. ` +
    `Clean light-grey studio background, soft even lighting, sharp focus, realistic, ` +
    `square 1:1 composition, product centered in frame, no text, no watermark, no brand logo, no hands.`;
}

// ── Small concurrency pool ───────────────────────────────────────────────
async function mapLimit(items, limit, fn) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────
// Duplicate product names (e.g. "Amul Dahi" 500g & 1kg) same slug bana sakte
// hain — overwrite:true se ek dusre ki image replace ho jayegi. Isliye pehle
// detect karo aur duplicate walon me product id append karo.
function buildUniquePublicIds(products) {
  const seen = new Map();
  return products.map(p => {
    const base = slugify(p.name);
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${p.id}`;
  });
}

async function main() {
  loadEnv();
  const args = parseArgs();

  const apiKey = process.env.GEMINI_API_KEY;
  const cApiKey = process.env.CLOUDINARY_API_KEY;
  const cApiSecret = process.env.CLOUDINARY_API_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

  const source = ['free', 'gemini', 'auto'].includes(args.source) ? args.source : 'free';

  console.log('🔍 Supabase se products load ho rahe hain…');
  const products = await supabaseGet(
    `products?select=id,name,description,unit_value,category_id,categories(name),product_images(image_url,is_default,sort_order)&is_active=eq.true`,
    SUPABASE_ANON_KEY
  );
  console.log(`📦 Total active products: ${products.length}`);

  let todo = args.force
    ? products
    : products.filter(p => !(p.product_images || []).length);
  console.log(`🖼️  Images already wale skip: ${products.length - todo.length} | Generate karne wale: ${todo.length}`);

  if (args.category) {
    const cat = args.category.toLowerCase();
    todo = todo.filter(p => (p.categories?.name || '').toLowerCase().includes(cat));
    console.log(`📁 Category filter ("${args.category}") ke baad: ${todo.length}`);
  }
  if (args.limit > 0) { todo = todo.slice(0, args.limit); console.log(`✂️  Limit ${args.limit} → ${todo.length}`); }

  if (!todo.length) { console.log('🎉 Kuch bhi generate karne ko nahi bacha — sab ke paas images hain (--force se redo kar sakte ho).'); return; }

  if (args.dryRun) {
    console.log('\n── DRY RUN (sirf list, kuch generate/upload nahi hoga) ──');
    const dryIds = buildUniquePublicIds(todo);
    todo.forEach((p, i) => console.log(`  ${i + 1}. ${p.name}${p.unit_value ? ' (' + p.unit_value + ')' : ''} → ${CLOUDINARY_FOLDER}/${dryIds[i]}`));
    console.log(`\nTotal: ${todo.length} images generate + upload hongi.`);
    console.log(`\n(Source: ${source === 'free' ? 'Pollinations — FREE 🆓' : source} | Sirf is source ke credentials chahiye honge)`);
    return;
  }

  // FREE source (default) → koi Gemini key nahi chahiye!
  // NOTE: process.exit() ki jagah exitCode + return — Windows par pending timers
  // (AbortSignal.timeout) ke saath process.exit() se libuv assertion ho jata hai.
  if (source !== 'free' && !apiKey) {
    console.error(`❌ --source ${source} ke liye GEMINI_API_KEY chahiye. FREE ke liye --source free use karo (default).`);
    process.exitCode = 1;
    return;
  }
  if (!cApiKey || !cApiSecret) {
    console.error('❌ CLOUDINARY_API_KEY aur CLOUDINARY_API_SECRET chahiye (product name se save karne ke liye signed upload zaroori hai).');
    console.error('   → Cloudinary Dashboard → Settings → API Keys se copy karo (FREE). .env.local me daalo.');
    process.exitCode = 1;
    return;
  }

  // Gemini source ke liye model discovery; free ke liye zaroori nahi
  let modelList = [];
  if (source !== 'free') {
    console.log('🛰️  Gemini image models discover ho rahe hain…');
    if (process.env.GEMINI_IMAGE_MODEL) {
      modelList = [process.env.GEMINI_IMAGE_MODEL];
    } else {
      modelList = await discoverImageModels(apiKey);
      if (modelList.length) console.log(`🧠 Image models mili: ${modelList.slice(0, 4).join(', ')}${modelList.length > 4 ? '…' : ''}`);
      else console.log('⚠️  Auto-discovery khali — hardcoded fallback try hoga (gemini-2.5-flash-image → imagen)');
      if (!modelList.length) modelList = ['gemini-2.5-flash-image', 'gemini-2.0-flash'];
    }
  }

  // FREE mode: Pollinations ~1 req/15s per IP — hamesha sequential + delay default 15s
  // (concurrency override bhi ignore hota hai free mode me — rate limit na toote)
  let concurrency = args.concurrency;
  let delayMs = args.delay;
  if (source === 'free') {
    concurrency = 1;
    if (!delayMs) delayMs = 15000;
  } else if (!concurrency) {
    concurrency = 2;
  }
  if (delayMs) console.log(`⏱️  Requests ke beech delay: ${(delayMs / 1000).toFixed(1)}s | Concurrency: ${concurrency}`);

  const results = { ok: [], failed: [], skipped: [] };
  console.log(`\n🚀 ${todo.length} images generate + upload ho rahi hain… (source: ${source === 'free' ? 'POLLINATIONS — FREE 🆓' : source})\n`);

  const publicIds = buildUniquePublicIds(todo);

  await mapLimit(todo, concurrency, async (p, i) => {
    const label = `[${results.ok.length + results.failed.length + 1}/${todo.length}] ${p.name}`;
    try {
      console.log(`${label} → AI generate…`);
      const { buffer } = await generateProductImage(source, { apiKey, modelList, prompt: buildPrompt(p), verbose: args.verbose });

      const publicId = publicIds[i];
      console.log(`${label} → Cloudinary upload (${publicId})…`);
      const url = await uploadToCloudinary(buffer, publicId, cApiKey, cApiSecret);
      if (!url) throw new Error('Cloudinary ne URL nahi diya');

      const existing = (p.product_images || []).length;
      await supabasePost(
        'product_images',
        [{ product_id: p.id, image_url: url, is_default: existing === 0, sort_order: existing }],
        serviceKey
      );

      results.ok.push({ name: p.name, product_id: p.id, public_id: publicId, url });
      console.log(`✅ ${label} → DONE (${url.slice(0, 80)}…)`);
    } catch (e) {
      results.failed.push({ name: p.name, product_id: p.id, error: e.message.slice(0, 200) });
      console.error(`❌ ${label} → FAIL: ${e.message.slice(0, 200)}`);
    } finally {
      // FREE mode rate-limit ke liye requests ke beech ruko (aakhri item ke baad nahi)
      if (delayMs && i < todo.length - 1) await new Promise(r => setTimeout(r, delayMs));
    }
  });

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(results, null, 2));
  console.log(`\n📄 Results: ${OUTPUT_JSON}`);

  console.log('\n══════════════════ SUMMARY ══════════════════');
  console.log(`✅ Success: ${results.ok.length}`);
  console.log(`❌ Failed : ${results.failed.length}`);
  if (results.failed.length) {
    console.log('\nFailed products (dobara chalane par sirf yehi retry honge):');
    results.failed.forEach(f => console.log(`  • ${f.name}: ${f.error}`));
  }
  console.log('\n💡 Tip: Script dobara chalao → jo already upload ho gayi hain wo skip ho jayengi.');
}

main().catch(e => { console.error('FATAL:', e); process.exitCode = 1; });
