# Gray Family Photos - Image Worker

A Cloudflare Worker that serves on-demand image transforms for photos stored
in R2. Routes on `photos.grayzu.com/img/*`. URL pattern:

```
https://photos.grayzu.com/img/<TRANSFORM>/<R2_KEY>

Examples:
https://photos.grayzu.com/img/width=800,format=auto,fit=scale-down/originals/abc.jpg
https://photos.grayzu.com/img/format=auto/originals/abc.heic
```

## What it does

1. Tries Cloudflare Image Transformations via the `cf.image` binding. This
   handles JPEG / PNG / WebP / AVIF / plain HEIC perfectly. Free tier covers
   5,000 unique transforms/month.
2. Caches every successful response at the CF edge forever
   (`Cache-Control: public, max-age=31536000, immutable`).
3. If CF rejects a source (returns 415 or an `err=...` cf-resized header),
   returns a friendly SVG placeholder image saying "Unsupported format"
   instead of a broken image icon. Placeholder is cached for 1 hour so the
   request doesn't keep retrying.

## Known limitation: iPhone Live / Portrait Mode (heix HEIF variant)

Photos taken on iPhone in HEIF mode with **Live Photo** or **Portrait Mode**
use the `heix` brand with Apple-specific `SHIF` (Stereo HEIF) extensions.
Cloudflare Image Transformations rejects these with error 9412 "not an image".

We initially tried decoding via libheif WASM in the worker, but Cloudflare
Workers forbid runtime WebAssembly.instantiate (security restriction). Only
statically-imported WASM modules are allowed, and libheif's emscripten build
doesn't support that path. Reverse-engineering it is multi-day work.

**Workaround for users**: On the iPhone, go to
`Settings → Camera → Formats → Most Compatible`. New photos will be captured
as plain JPEG (sRGB) and CF transforms will handle them perfectly. Live Photos
still work; the still image is just JPEG instead of HEIF.

For existing Live Photos already in R2, they'll display the SVG placeholder
until you re-upload them as JPEG (e.g. by exporting them as JPEG from Photos
on Mac/iPhone first).

## Bundle size

~24 KiB raw / ~6 KiB gzipped. Trivially fits in Workers free tier.

## Deploy

One-time auth:

```bash
cd worker
npx wrangler login                 # interactive (opens browser)
# OR set CLOUDFLARE_API_TOKEN env var
```

Then:

```bash
npm install
npx wrangler deploy
```

## Tail logs

```bash
npx wrangler tail
```
