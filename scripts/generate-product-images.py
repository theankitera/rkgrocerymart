#!/usr/bin/env python3
"""
Bulk AI Product Image Generator — Rinku Kirana & General Store (Python version)
-------------------------------------------------------------------------------
Ye script poora flow automate karti hai (generate-product-images.js ka Python mirror):
   1. Supabase se saare active products padhti hai (category ke saath)
   2. Har product ke liye AI (Gemini image models) se SQUARE product image generate karti hai
   3. Cloudinary par SIGNED upload se public_id = product name (slug) set karti hai
   4. Supabase `product_images` table me insert karti hai → site par image turant dikhti hai

Zero dependencies — Python 3.9+ standard library (urllib/hashlib/base64) se chalta hai.

IMAGE SOURCES:
  --source free    (DEFAULT) → Pollinations.ai (Flux) — BILKUL FREE, unlimited,
                                koi API key nahi chahiye. ~1 request / 15s per IP.
  --source gemini             → Gemini image models (GEMINI_API_KEY chahiye)
  --source auto               → Gemini pehle try karo, fail ho to free par chalo

REQUIRED env vars (.env.local me daalein):
  CLOUDINARY_API_KEY           → Cloudinary Dashboard → Settings → API Keys (FREE)
  CLOUDINARY_API_SECRET        → Cloudinary Dashboard → Settings → API Keys (FREE)

OPTIONAL env vars:
  GEMINI_API_KEY               → Google AI Studio se (sirf --source gemini/auto ke liye)
  SUPABASE_SERVICE_ROLE_KEY    → Supabase Dashboard → Settings → API (insert ke liye,
                                 RLS bypass karta hai; nahi di to anon key se try hoga)
  SUPABASE_URL / SUPABASE_ANON_KEY  → default already set hain
  CLOUDINARY_CLOUD_NAME        → default 'delf8iyzt'
  CLOUDINARY_FOLDER            → default 'myshop/products'
  GEMINI_IMAGE_MODEL           → specific gemini model force karne ke liye

USAGE:
  python scripts/generate-product-images.py                  # sab products (FREE source)
  python scripts/generate-product-images.py --limit 5        # sirf pehle 5
  python scripts/generate-product-images.py --category "Dairy"
  python scripts/generate-product-images.py --dry-run        # bina generate kiye list
  python scripts/generate-product-images.py --force          # images already hon to bhi redo
  python scripts/generate-product-images.py --delay 15000    # free mode me requests ke beech rukna (ms)
  python scripts/generate-product-images.py --source gemini  # paid/better quality (GEMINI_API_KEY chahiye)
"""

import argparse
import base64
import hashlib
import json
import os
import random
import re
import sys
import time
import unicodedata
import uuid
from concurrent.futures import ThreadPoolExecutor

import urllib.error
import urllib.parse
import urllib.request

# Windows console pe emoji / UTF-8 print ke liye (cp1252 par UnicodeEncodeError na aaye)
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# ── Defaults ─────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://pffaflasgwhydkmxwkky.supabase.co')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY', 'sb_publishable__tFDYhkM3blZ0pIVT0YxLA_YvkKq79L')
CLOUD_NAME = os.environ.get('CLOUDINARY_CLOUD_NAME', 'delf8iyzt')
CLOUDINARY_FOLDER = os.environ.get('CLOUDINARY_FOLDER', 'myshop/products')
OUTPUT_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'upload-results.json')


# ── Tiny .env loader (dotenv dependency ke bina) ─────────────────────────
def load_env():
    base = os.path.dirname(os.path.abspath(__file__))
    for fname in ('.env.local', '.env'):
        try:
            with open(os.path.join(base, '..', fname), 'r', encoding='utf-8') as f:
                for line in f:
                    m = re.match(r'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$', line)
                    if m and m.group(1) not in os.environ:
                        os.environ[m.group(1)] = m.group(2).strip().strip('\'"')
        except OSError:
            pass  # file nahi mili — koi baat nahi


# ── CLI args ─────────────────────────────────────────────────────────────
def parse_args():
    ap = argparse.ArgumentParser(
        description='Bulk AI product image generator (AI → Cloudinary → Supabase)'
    )
    ap.add_argument('--limit', type=int, default=0, help='sirf pehle N products')
    ap.add_argument('--category', default=None, help='category filter (substring)')
    ap.add_argument('--concurrency', type=int, default=0, help='parallel workers')
    ap.add_argument('--source', default='free', choices=['free', 'gemini', 'auto'],
                    help='image source: free (Pollinations), gemini, ya auto (fallback free)')
    ap.add_argument('--delay', type=int, default=0, help='requests ke beech delay (ms)')
    ap.add_argument('--dry-run', action='store_true', help='sirf list, kuch generate nahi')
    ap.add_argument('--force', action='store_true', help='images already hon to bhi redo')
    ap.add_argument('--verbose', action='store_true', help='prompts dikhao')
    return ap.parse_args()


# ── HTTP helper ──────────────────────────────────────────────────────────
def http_request(url, data=None, headers=None, timeout=30):
    """Simple GET/POST with timeout. Returns (body_bytes, headers_dict)."""
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.read(), dict(res.headers.items())
    except urllib.error.HTTPError as e:
        detail = e.read(300).decode('utf-8', 'replace') if e.fp else ''
        raise RuntimeError(f"{e.code}: {detail[:200]}") from None
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise RuntimeError(str(e)) from None


# ── Supabase helpers ─────────────────────────────────────────────────────
def supabase_get(path, key):
    body, _ = http_request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={'apikey': key, 'Authorization': f'Bearer {key}'},
        timeout=15,
    )
    return json.loads(body.decode('utf-8'))


def supabase_post(path, body_list, key):
    body, _ = http_request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        data=json.dumps(body_list).encode('utf-8'),
        headers={
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        },
        timeout=15,
    )
    return body


# ── Gemini image generation ──────────────────────────────────────────────
GEMINI_TIMEOUT_S = 60
IMAGEN_MODEL = 'imagen-3.0-generate-002'


def score_image_model(name):
    s = 0
    if re.search(r'gemini-3', name):
        s += 100
    if re.search(r'gemini-2\.5-flash-image', name):
        s += 80
    if re.search(r'gemini-2\.0-flash', name):
        s += 60
    if re.search(r'imagen', name):
        s += 40
    if re.search(r'preview|exp|beta|dev|nano-1', name):
        s -= 15
    return s


def discover_image_models(api_key):
    try:
        body, _ = http_request(
            f'https://generativelanguage.googleapis.com/v1beta/models?key={api_key}',
            timeout=10,
        )
        data = json.loads(body.decode('utf-8'))
        names = [m.get('name', '').replace('models/', '')
                 for m in data.get('models', []) if m.get('name')]
        models = [n for n in names if re.search(r'image|imagen|nano', n, re.I)]
        models.sort(key=score_image_model, reverse=True)
        return models
    except Exception:
        return []


# Response JSON me kahin bhi image dhundho — inlineData / fileData / interactions-style
def _extract_image(node, depth, out):
    if out[0] is not None or depth > 7 or not isinstance(node, (dict, list)):
        return
    if isinstance(node, list):
        for n in node:
            _extract_image(n, depth + 1, out)
            if out[0] is not None:
                return
        return

    fd = node.get('fileData') or {}
    id_ = node.get('inlineData') or {}
    id2 = node.get('inline_data') or {}
    uri = fd.get('fileUri') or node.get('file_uri') or node.get('uri')
    b64 = (id_.get('data') or id2.get('data')
           or node.get('bytesBase64Encoded') or node.get('data'))

    if isinstance(b64, str) and len(b64) > 100 and re.fullmatch(r'[A-Za-z0-9+/=]+', b64):
        mime = id_.get('mimeType') or id2.get('mimeType') or 'image/png'
        out[0] = {'kind': 'b64', 'data': b64, 'mime': mime}
        return
    if isinstance(uri, str) and uri.startswith('http'):
        out[0] = {'kind': 'uri', 'uri': uri}
        return
    for v in node.values():
        _extract_image(v, depth + 1, out)
        if out[0] is not None:
            return


def extract_image(json_data):
    out = [None]
    _extract_image(json_data, 0, out)
    return out[0]


def fetch_file_data(uri, api_key):
    # Kuch models image ko file URL me dete hain — usse download karo
    sep = '&' if '?' in uri else '?'
    body, headers = http_request(f'{uri}{sep}key={api_key}', timeout=GEMINI_TIMEOUT_S)
    mime = headers.get('Content-Type') or headers.get('content-type') or 'image/png'
    return {'kind': 'b64', 'data': base64.b64encode(body).decode(), 'mime': mime}


def generate_with_gemini(api_key, model, prompt):
    body = {
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {'responseModalities': ['IMAGE', 'TEXT']},
    }
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}'
    raw, _ = http_request(
        url,
        data=json.dumps(body).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        timeout=GEMINI_TIMEOUT_S,
    )
    data = json.loads(raw.decode('utf-8'))
    img = extract_image(data)
    if img is None:
        raise RuntimeError(f'{model}: response me image data nahi mila')
    return fetch_file_data(img['uri'], api_key) if img['kind'] == 'uri' else img


# Naye Nano Banana (3.x image) models `interactions` endpoint use karte hain
def generate_with_interactions(api_key, model, prompt):
    body = {
        'model': model,
        'input': [{'type': 'text', 'text': prompt}],
        'response_format': {
            'type': 'image',
            'mime_type': 'image/jpeg',
            'aspect_ratio': '1:1',
            'image_size': '1K',
        },
    }
    raw, _ = http_request(
        'https://generativelanguage.googleapis.com/v1beta/interactions',
        data=json.dumps(body).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'x-goog-api-key': api_key},
        timeout=GEMINI_TIMEOUT_S,
    )
    data = json.loads(raw.decode('utf-8'))
    img = extract_image(data)
    if img is None:
        raise RuntimeError(f'{model} (interactions): response me image data nahi mila')
    return fetch_file_data(img['uri'], api_key) if img['kind'] == 'uri' else img


def generate_with_imagen(api_key, prompt):
    body = {
        'instances': [{'prompt': prompt}],
        'parameters': {'sampleCount': 1, 'aspectRatio': '1:1', 'outputMimeType': 'image/jpeg'},
    }
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{IMAGEN_MODEL}:predict?key={api_key}'
    raw, _ = http_request(
        url,
        data=json.dumps(body).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        timeout=GEMINI_TIMEOUT_S,
    )
    data = json.loads(raw.decode('utf-8'))
    preds = data.get('predictions') or []
    b64 = preds[0].get('bytesBase64Encoded') if preds else None
    if not b64:
        raise RuntimeError(f'{IMAGEN_MODEL}: response me image nahi mili')
    mime = preds[0].get('mimeType') or 'image/jpeg'
    return {'kind': 'b64', 'data': b64, 'mime': mime}


# ── Pollinations.ai — FREE, unlimited, koi API key nahi ──────────────────
# URL-based API: image.pollinations.ai/prompt/<prompt>?model=flux&width=..&height=..
# Returns raw image bytes (binary), not JSON.
POLLINATIONS_URL = 'https://image.pollinations.ai/prompt/'
POLLINATIONS_TIMEOUT_S = 120


def generate_with_pollinations(prompt):
    params = urllib.parse.urlencode({
        'model': 'flux',
        'width': '1024',
        'height': '1024',
        'nologo': 'true',
        'seed': str(random.randint(0, 999999)),
    })
    url = f'{POLLINATIONS_URL}{urllib.parse.quote(prompt, safe="")}?{params}'
    body, headers = http_request(
        url,
        headers={'Accept': 'image/*'},
        timeout=POLLINATIONS_TIMEOUT_S,
    )
    ct = headers.get('Content-Type') or headers.get('content-type') or ''
    if 'image' not in ct or len(body) < 1000:
        raise RuntimeError(f'Pollinations ne image nahi diya ({ct}, {len(body)} bytes): {body[:150]!r}')
    return body


# Pehle preferred image models try karo, phir imagen fallback
def generate_product_image_gemini(api_key, model_list, prompt, verbose=False):
    for model in model_list or []:
        try:
            img = generate_with_gemini(api_key, model, prompt)
            if verbose:
                print(f'  ✅ Gemini model chala: {model} (generateContent)')
            return img, model
        except Exception as e:
            print(f"  ⚠️  {model} (generateContent) fail → {str(e).splitlines()[0][:90]}")
            # 3.x image models naye interactions endpoint pe chalte hain — woh bhi try karo
            if re.search(r'gemini-3', model):
                try:
                    img = generate_with_interactions(api_key, model, prompt)
                    if verbose:
                        print(f'  ✅ Gemini model chala: {model} (interactions)')
                    return img, model
                except Exception as e2:
                    print(f"  ⚠️  {model} (interactions) fail → {str(e2).splitlines()[0][:90]}")
    try:
        img = generate_with_imagen(api_key, prompt)
        if verbose:
            print('  ✅ imagen fallback chala')
        return img, IMAGEN_MODEL
    except Exception as e:
        raise RuntimeError(f'Saare Gemini image models fail: {str(e)[:120]}')


# Unified: source ke hisaab se image generate karo, raw bytes return karo
def generate_product_image(source, api_key, model_list, prompt, verbose=False):
    if verbose:
        print(f'  🎨 prompt: {prompt[:110]}…')
    if source == 'free':
        return generate_with_pollinations(prompt)
    try:
        img, _model = generate_product_image_gemini(api_key, model_list, prompt, verbose)
        return base64.b64decode(img['data'])
    except Exception as e:
        if source == 'auto':
            print(f"  ⚠️  Gemini fail → FREE Pollinations par chale: {str(e)[:80]}")
            return generate_with_pollinations(prompt)
        raise


# ── Cloudinary signed upload (public_id = product name) ──────────────────
def slugify(name):
    s = unicodedata.normalize('NFKD', str(name))
    s = ''.join(c for c in s if not unicodedata.combining(c))  # accents hatao
    s = re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:60]
    return s or 'product'


def cloudinary_signature(params, api_secret):
    s = '&'.join(f'{k}={params[k]}' for k in sorted(params))
    return hashlib.sha1((s + api_secret).encode('utf-8')).hexdigest()


def upload_to_cloudinary(image_bytes, public_id, api_key, api_secret):
    timestamp = int(time.time())
    params = {
        'timestamp': timestamp,
        'folder': CLOUDINARY_FOLDER,
        'public_id': public_id,
        'overwrite': 'true',
    }
    signature = cloudinary_signature(params, api_secret)

    boundary = '----PythonBoundary' + uuid.uuid4().hex
    body = b''
    for k, v in (('timestamp', str(timestamp)), ('folder', CLOUDINARY_FOLDER),
                 ('public_id', public_id), ('overwrite', 'true'),
                 ('api_key', api_key), ('signature', signature)):
        body += (f'--{boundary}\r\n'
                 f'Content-Disposition: form-data; name="{k}"\r\n\r\n'
                 f'{v}\r\n').encode('utf-8')
    body += (f'--{boundary}\r\n'
             f'Content-Disposition: form-data; name="file"; filename="{public_id}.jpg"\r\n'
             f'Content-Type: image/jpeg\r\n\r\n').encode('utf-8')
    body += image_bytes + b'\r\n'
    body += f'--{boundary}--\r\n'.encode('utf-8')

    raw, _ = http_request(
        f'https://api.cloudinary.com/v1_1/{CLOUD_NAME}/image/upload',
        data=body,
        headers={'Content-Type': f'multipart/form-data; boundary={boundary}'},
        timeout=30,
    )
    data = json.loads(raw.decode('utf-8'))
    return data.get('secure_url') or data.get('url')


# ── Prompt builder ───────────────────────────────────────────────────────
def build_prompt(p):
    cat = p.get('categories') or {}
    cat_part = f", {cat.get('name')}" if cat.get('name') else ''
    unit = f" ({p.get('unit_value')})" if p.get('unit_value') else ''
    return (
        f'Professional e-commerce product photograph of {p.get("name")}{unit}{cat_part}. '
        'Clean light-grey studio background, soft even lighting, sharp focus, realistic, '
        'square 1:1 composition, product centered in frame, no text, no watermark, '
        'no brand logo, no hands.'
    )


# Duplicate product names (e.g. "Amul Dahi" 500g & 1kg) same slug bana sakte
# hain — overwrite:true se ek dusre ki image replace ho jayegi. Isliye pehle
# detect karo aur duplicate walon me product id append karo.
def build_unique_public_ids(products):
    seen = {}
    out = []
    for p in products:
        base = slugify(p['name'])
        count = seen.get(base, 0) + 1
        seen[base] = count
        out.append(base if count == 1 else f'{base}-{p["id"]}')
    return out


# ── Main ─────────────────────────────────────────────────────────────────
def main():
    load_env()
    args = parse_args()

    api_key = os.environ.get('GEMINI_API_KEY')
    c_api_key = os.environ.get('CLOUDINARY_API_KEY')
    c_api_secret = os.environ.get('CLOUDINARY_API_SECRET')
    service_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or SUPABASE_ANON_KEY

    source = args.source if args.source in ('free', 'gemini', 'auto') else 'free'

    print('🔍 Supabase se products load ho rahe hain…')
    products = supabase_get(
        'products?select=id,name,description,unit_value,category_id,'
        'categories(name),product_images(image_url,is_default,sort_order)&is_active=eq.true',
        SUPABASE_ANON_KEY,
    )
    print(f'📦 Total active products: {len(products)}')

    todo = products if args.force else [p for p in products if not (p.get('product_images') or [])]
    print(f'🖼️  Images already wale skip: {len(products) - len(todo)} | Generate karne wale: {len(todo)}')

    if args.category:
        cat = args.category.lower()
        todo = [p for p in todo if cat in ((p.get('categories') or {}).get('name') or '').lower()]
        print(f'📁 Category filter ("{args.category}") ke baad: {len(todo)}')
    if args.limit > 0:
        todo = todo[:args.limit]
        print(f'✂️  Limit {args.limit} → {len(todo)}')

    if not todo:
        print('🎉 Kuch bhi generate karne ko nahi bacha — sab ke paas images hain (--force se redo kar sakte ho).')
        return

    if args.dry_run:
        print('\n── DRY RUN (sirf list, kuch generate/upload nahi hoga) ──')
        dry_ids = build_unique_public_ids(todo)
        for i, p in enumerate(todo):
            unit = f" ({p.get('unit_value')})" if p.get('unit_value') else ''
            print(f'  {i + 1}. {p["name"]}{unit} → {CLOUDINARY_FOLDER}/{dry_ids[i]}')
        print(f'\nTotal: {len(todo)} images generate + upload hongi.')
        print(f"\n(Source: {'Pollinations — FREE 🆓' if source == 'free' else source} | "
              'Sirf is source ke credentials chahiye honge)')
        return

    # FREE source (default) → koi Gemini key nahi chahiye!
    if source != 'free' and not api_key:
        print(f'❌ --source {source} ke liye GEMINI_API_KEY chahiye. '
              'FREE ke liye --source free use karo (default).', file=sys.stderr)
        sys.exit(1)
    if not c_api_key or not c_api_secret:
        print('❌ CLOUDINARY_API_KEY aur CLOUDINARY_API_SECRET chahiye '
              '(product name se save karne ke liye signed upload zaroori hai).', file=sys.stderr)
        print('   → Cloudinary Dashboard → Settings → API Keys se copy karo (FREE). '
              '.env.local me daalo.', file=sys.stderr)
        sys.exit(1)

    # Gemini source ke liye model discovery; free ke liye zaroori nahi
    model_list = []
    if source != 'free':
        print('🛰️  Gemini image models discover ho rahe hain…')
        if os.environ.get('GEMINI_IMAGE_MODEL'):
            model_list = [os.environ['GEMINI_IMAGE_MODEL']]
        else:
            model_list = discover_image_models(api_key)
            if model_list:
                shown = ', '.join(model_list[:4]) + ('…' if len(model_list) > 4 else '')
                print(f'🧠 Image models mili: {shown}')
            else:
                print('⚠️  Auto-discovery khali — hardcoded fallback try hoga (gemini-2.5-flash-image → imagen)')
            if not model_list:
                model_list = ['gemini-2.5-flash-image', 'gemini-2.0-flash']

    # FREE mode: Pollinations ~1 req/15s per IP — hamesha sequential + delay default 15s
    # (concurrency override bhi ignore hota hai free mode me — rate limit na toote)
    concurrency = args.concurrency
    delay_ms = args.delay
    if source == 'free':
        concurrency = 1
        if not delay_ms:
            delay_ms = 15000
    elif not concurrency:
        concurrency = 2
    if delay_ms:
        print(f'⏱️  Requests ke beech delay: {delay_ms / 1000:.1f}s | Concurrency: {concurrency}')

    print(f"\n🚀 {len(todo)} images generate + upload ho rahi hain… "
          f"(source: {'POLLINATIONS — FREE 🆓' if source == 'free' else source})\n")

    public_ids = build_unique_public_ids(todo)
    ok_list = [None] * len(todo)
    failed_list = [None] * len(todo)

    def worker(item):
        i, p = item
        label = f'[{i + 1}/{len(todo)}] {p["name"]}'
        try:
            print(f'{label} → AI generate…')
            image_bytes = generate_product_image(source, api_key, model_list,
                                                 build_prompt(p), args.verbose)

            public_id = public_ids[i]
            print(f'{label} → Cloudinary upload ({public_id})…')
            url = upload_to_cloudinary(image_bytes, public_id, c_api_key, c_api_secret)
            if not url:
                raise RuntimeError('Cloudinary ne URL nahi diya')

            existing = len(p.get('product_images') or [])
            supabase_post('product_images', [{
                'product_id': p['id'],
                'image_url': url,
                'is_default': existing == 0,
                'sort_order': existing,
            }], service_key)

            ok_list[i] = {'name': p['name'], 'product_id': p['id'],
                          'public_id': public_id, 'url': url}
            print(f'✅ {label} → DONE ({url[:80]}…)')
        except Exception as e:
            msg = str(e).splitlines()[0][:200]
            failed_list[i] = {'name': p['name'], 'product_id': p['id'], 'error': msg}
            print(f'❌ {label} → FAIL: {msg}', file=sys.stderr)
        finally:
            # FREE mode rate-limit ke liye requests ke beech ruko (aakhri item ke baad nahi)
            if delay_ms and i < len(todo) - 1:
                time.sleep(delay_ms / 1000.0)

    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as ex:
        list(ex.map(worker, enumerate(todo)))

    results = {
        'ok': [x for x in ok_list if x is not None],
        'failed': [x for x in failed_list if x is not None],
        'skipped': [],
    }
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f'\n📄 Results: {OUTPUT_JSON}')

    print('\n══════════════════ SUMMARY ══════════════════')
    print(f'✅ Success: {len(results["ok"])}')
    print(f'❌ Failed : {len(results["failed"])}')
    if results['failed']:
        print('\nFailed products (dobara chalane par sirf yehi retry honge):')
        for fl in results['failed']:
            print(f'  • {fl["name"]}: {fl["error"]}')
    print('\n💡 Tip: Script dobara chalao → jo already upload ho gayi hain wo skip ho jayengi.')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f'FATAL: {e}', file=sys.stderr)
        sys.exit(1)
