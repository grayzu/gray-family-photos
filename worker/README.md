# Gray Family Photos - Image Worker

A Cloudflare Worker that serves on-demand image transforms for photos stored
in R2. Routes on `photos.grayzu.com/img/*`. URL pattern:

```
https://photos.grayzu.com/img/<TRANSFORM>/<R2_KEY>

Examples:
https://photos.grayzu.com/img/width=800,format=auto,fit=scale-down/originals/abc.heif
https://photos.grayzu.com/img/format=auto/originals/abc.jpg
```

## Why it exists

Cloudflare's free Image Transformations service handles most images perfectly,
but **rejects iPhone Live Photos and Portrait Mode** (HEIF files with `heix`
brand and `SHIF` compatibility) with error 9412 "not an image".

This worker intercepts `/img/*` requests:

1. **Tries Cloudflare Image Transformations first** via `cf.image` binding.
   This handles JPEG / PNG / WebP / AVIF / plain HEIC normally and is free
   (5,000 unique transforms/month).
2. **Falls back to WASM** (`libheif-js` + `@jsquash/jpeg` + `@jsquash/resize`)
   only when CF rejects the source. The decoded RGBA is resized via Lanczos3
   and re-encoded as JPEG.
3. **Caches** every successful response in CF's edge cache forever via
   `Cache-Control: public, max-age=31536000, immutable`. Repeat requests
   to a given (key, transform) are served from cache at edge speed.

## Bundle size

~1.6 MiB raw / ~540 KiB gzipped. Fits in Workers free tier (3 MiB compressed).

## Deploy

One-time auth (opens browser to authorize):

```bash
cd worker
npx wrangler login
```

Then:

```bash
npm install
npx wrangler deploy
```

Wrangler will register the worker on `photos.grayzu.com/img/*`. Existing
requests to `photos.grayzu.com/originals/*` continue to hit R2 directly
(the worker only catches paths starting with `/img/`).

## Tail logs (live)

```bash
npx wrangler tail
```

## Configuration

See `wrangler.toml`. The only var is `R2_PUBLIC_BASE_URL` which the worker
uses to fetch the raw source from R2 when WASM decoding.
