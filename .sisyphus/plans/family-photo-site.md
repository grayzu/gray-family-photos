# Family Photo Site - Implementation Plan

## Overview

A family photo website deployed to Vercel. Family members (invite-only) can
upload photos, which are automatically organized into albums by month +
location. Photos missing EXIF GPS data trigger a location prompt that is
validated via geocoding. Albums can be shared via public links.

## Requirements Summary

| Requirement | Decision |
|---|---|
| Hosting | Vercel |
| Frontend | Vue 3 |
| Backend | Node.js (Vercel Functions) |
| Database | SQLite-compatible (Turso / libSQL) |
| Scale | Thousands of photos |
| Auth | Individual user accounts, invite-only |
| Album grouping | Same month + same location |
| Sharing | Anyone with link can view |
| Photo management | Move, delete, edit metadata, download originals |
| Missing GPS | Required text-field prompt, backend validates via geocoder |
| Originals | Store originals + thumbnails |
| Geocoding | Nominatim (free, OSM) |
| Extras | Keep simple (no favorites/ratings) |

## Architecture

```
Vue 3 SPA  →  Vercel Functions (Hono)  →  Turso (libSQL)        [metadata]
                                       →  Cloudflare R2          [originals + thumbnails]
                                       →  Nominatim              [geocoding]

Browser viewing photos → R2 public bucket via photos.<domain> (zero egress cost)
```

**Hybrid rationale**: Vercel runs the app (simple deploy, `sharp` works for
server-side thumbnails). Cloudflare R2 stores photos because R2 has **zero
egress fees** - critical for a photo gallery where the same images are viewed
repeatedly. Photos are served directly from R2's edge to browsers, bypassing
Vercel entirely.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Vue 3 + Vite + Vue Router + Pinia + TailwindCSS |
| Backend | Hono on Vercel Functions (Node.js) |
| DB | Turso (libSQL) + Drizzle ORM |
| Storage | Cloudflare R2 via `@aws-sdk/client-s3` (S3-compatible) |
| Auth | Email one-time code (OTP) via Resend |
| EXIF | `exifr` |
| Image processing | `sharp` (thumbnails only, originals untouched) |
| Geocoding | Nominatim (OSM) - rate-limit 1 req/sec, must set User-Agent |
| DNS | Cloudflare (existing) - includes `photos.<domain>` CNAME to R2 bucket |

---

## Phase 0: Bootstrap (concrete commands)

Run from repo root `/Users/markg/git/family_photo`. The repo currently
contains only `.sisyphus/plans/family-photo-site.md` - **no other files
exist yet**. Every file mentioned in this plan is "to be created" unless
explicitly marked otherwise.

### 0.1 Initialize project

```bash
# Scaffold Vue 3 + TS + Vite
npm create vite@latest . -- --template vue-ts

# Core deps
npm i vue-router pinia
npm i hono @hono/node-server
npm i @libsql/client drizzle-orm
npm i @oslojs/crypto @oslojs/encoding
npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm i exifr sharp

# Dev deps
npm i -D drizzle-kit tailwindcss@^3 postcss autoprefixer
npm i -D @types/node vercel
npm i -D @playwright/test
npx tailwindcss init -p
npx playwright install --with-deps chromium
```

### 0.2 Files to create in Phase 0 (none exist yet)

| File | Purpose |
|---|---|
| `vercel.json` | Routes config: `/api/*` → functions, all else → SPA |
| `drizzle.config.ts` | Drizzle migration config (points at `server/db/schema.ts`) |
| `.env.example` | Documents required env vars |
| `tailwind.config.js` | Tailwind setup (replace stub from init) |
| `tsconfig.json` | Extend Vite default with `server/` path alias |
| `playwright.config.ts` | Playwright config: `baseURL` from `E2E_BASE_URL` env (default `http://localhost:3000`), single chromium project, `testDir: 'tests/e2e'`, retries 0, reporter `list` |
| `tests/e2e/.gitkeep` | Holds Playwright specs added per phase |
| `package.json` scripts | Exactly: `"dev": "vite"`, `"dev:vercel": "vercel dev"`, `"build": "vite build"`, `"db:generate": "drizzle-kit generate"`, `"db:push": "drizzle-kit push"`, `"db:studio": "drizzle-kit studio"`, `"e2e": "playwright test"`, `"e2e:ui": "playwright test --ui"` |
| `README.md` | Setup instructions |

### 0.2.1 Playwright bootstrap details

- Install (already in 0.1): `npm i -D @playwright/test && npx playwright install --with-deps chromium`
- Config file (`playwright.config.ts`) must export:
  ```ts
  import { defineConfig } from '@playwright/test';
  export default defineConfig({
    testDir: 'tests/e2e',
    use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000' },
    projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
    reporter: 'list',
    retries: 0,
  });
  ```
- Run command: `E2E_BASE_URL=http://localhost:3000 npm run e2e` (against
  `vercel dev`), or `E2E_BASE_URL=https://<preview>.vercel.app npm run e2e`
  (against a deployed preview).

### 0.3 Required env vars (in `.env.local` + Vercel project settings)

```
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...

# Cloudflare R2 (S3-compatible) - create bucket + API token in CF dashboard
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=gray-family-photos
R2_PUBLIC_BASE_URL=https://photos.example.com   # custom domain CNAME'd to bucket

NOMINATIM_USER_AGENT=gray-family-photos/1.0 (mark@grayszone.com)
SESSION_SECRET=...              # 32-byte random hex

# Resend (email OTP delivery) - sign up at resend.com (free 3000/mo)
# Optional locally: if unset, codes are printed to the API server console
RESEND_API_KEY=re_xxx
# Optional: defaults to "Gray Family Photos <onboarding@resend.dev>"
RESEND_FROM_EMAIL=Gray Family Photos <noreply@yourdomain.com>
```

### 0.4 External account setup (one-time)

- Turso: `turso db create gray-family-photos` → grab URL + token
- Cloudflare R2:
  - Create bucket `gray-family-photos` in CF dashboard (R2 → Create bucket)
  - Settings → Public Access → enable
  - Connect custom domain (e.g. `photos.grayszone.com`) - CF auto-creates the CNAME because DNS is already on Cloudflare
  - R2 → Manage API Tokens → create token with Object Read & Write scope for this bucket
- Vercel: `vercel link` to associate repo with project
- Add all env vars to Vercel project settings (Settings → Environment Variables)

### 0.5 Phase 0 QA

| # | Scenario | Steps | Expected |
|---|---|---|---|
| QA-0.1 | Dev server boots | `npm run dev` | Vite serves on `:5173`, default Vue page renders |
| QA-0.2 | Vercel dev runs | `vercel dev` | API + SPA served on `:3000`, no errors |
| QA-0.3 | DB connection | `npm run db:push` (drizzle script) | Migrations apply to Turso, no errors |
| QA-0.4 | Env validated | Boot with missing `TURSO_DATABASE_URL` | App fails fast with clear error |
| QA-0.5 | Playwright runs | `npm run e2e -- --list` | Lists 0 tests (no specs yet), exits 0 |

---

## Phase 1: Foundation (auth + single photo upload + view)

**QA execution**: Run `vercel dev` in one terminal (serves on
`http://localhost:3000`). Run Playwright specs with
`E2E_BASE_URL=http://localhost:3000 npm run e2e`. Run curl scenarios against
the same base URL. Phase-specific specs live under
`tests/e2e/phase-1/*.spec.ts` (and similarly for phases 2-4).

### 1.1 Data model (concrete tables)

File: `server/db/schema.ts`

```ts
users         (id TEXT PK, email TEXT UNIQUE, name TEXT,
               is_admin INTEGER, created_at INTEGER)
sessions      (id TEXT PK, user_id TEXT FK, expires_at INTEGER)
allowed_emails (email TEXT PK, name TEXT, is_admin INTEGER,
                added_by TEXT FK, added_at INTEGER)
email_codes   (id TEXT PK, email TEXT, code_hash TEXT UNIQUE,
               created_at INTEGER, expires_at INTEGER,
               used_at INTEGER NULL, attempts INTEGER DEFAULT 0)
photos        (id TEXT PK, user_id TEXT FK,
               r2_original_key TEXT, r2_thumbnail_key TEXT,
               -- Public URL = `${R2_PUBLIC_BASE_URL}/${r2_original_key}`
               taken_at INTEGER NULL,
               latitude REAL NULL, longitude REAL NULL,
               location_name TEXT NULL, location_display TEXT NULL,
               location_country TEXT NULL,
               width INTEGER, height INTEGER, file_size INTEGER, mime_type TEXT,
               uploaded_at INTEGER)
```

### 1.2 Files to create (none exist yet)

| File (to be created) | Purpose |
|---|---|
| `server/db/client.ts` | libSQL client + drizzle instance |
| `server/db/schema.ts` | Drizzle schema (tables above) |
| `server/auth.ts` | Session helpers + OTP code generation/verification |
| `server/email.ts` | Resend client (with console-log fallback for dev) |
| `server/storage.ts` | R2 client (`@aws-sdk/client-s3`) helpers: `putOriginal`, `putThumbnail`, `deleteObject`, `presignUpload` |
| `api/index.ts` | Hono app entry mounted at `/api/*` |
| `api/auth/request-code.ts` | POST email → email a 6-digit code (silent if email unknown) |
| `api/auth/verify-code.ts` | POST email+code → create user if first time, set session cookie |
| `api/auth/login.ts` | POST login |
| `api/auth/logout.ts` | POST logout |
| `api/auth/me.ts` | GET current user |
| `api/admin/allowed-emails.ts` | GET list / POST add / DELETE remove (admin only) |
| `api/photos/upload.ts` | POST upload single photo |
| `api/photos/index.ts` | GET list user's photos |
| `src/router/index.ts` | Routes: `/login`, `/signup`, `/`, `/upload` |
| `src/stores/auth.ts` | Pinia auth store |
| `src/views/Login.vue` (two-stage: email → code), `Home.vue`, `Upload.vue` | Pages |
| `src/components/PhotoGrid.vue` | Reusable photo grid |

### 1.3 Admin bootstrap rule

If both `users` and `allowed_emails` are empty, the very first email to
request a code is automatically allowed AND created as an admin user.
After that, only emails in `users` or `allowed_emails` can request codes
(the API silently no-ops for unknown emails to avoid leaking who is a
member).

### 1.4 Phase 1 QA

| # | Scenario | Tool | Steps | Expected |
|---|---|---|---|---|
| QA-1.1 | First-email bootstrap (admin) | curl | `POST /api/auth/request-code` then `POST /api/auth/verify-code` with returned code (or env-injected for tests) | 200, user created with `is_admin=1`, session cookie set |
| QA-1.2 | Unknown email silently no-ops | curl | `POST /api/auth/request-code {email: random@example.com}` (when users non-empty) | 200 with generic ok message, no row in `email_codes`, no email sent |
| QA-1.3 | Admin adds allowed email | curl | Admin session → `POST /api/admin/allowed-emails {email, name}` | 201, row added |
| QA-1.4 | Allowed email completes login | curl | `POST /api/auth/request-code` then verify with received code | 200, user row created from `allowed_emails`, allowlist row deleted |
| QA-1.4b | Wrong code rejected | curl | `POST /api/auth/verify-code` with bad code | 401, attempts counter incremented |
| QA-1.4c | Code locks after 5 wrong attempts | curl | 5 wrong attempts | code invalidated, must request new one |
| QA-1.5 | Login works | Playwright | Navigate `/login`, fill creds, submit | Redirected to `/`, session cookie set |
| QA-1.6 | Logout works | Playwright | Click logout | Redirected to `/login`, cookie cleared |
| QA-1.7 | Photo upload | Playwright | Drag a JPEG with EXIF on `/upload` | Photo appears in `/` grid, row in DB, object in R2 (visible via `R2_PUBLIC_BASE_URL`) |
| QA-1.8 | Auth required for upload | curl | `POST /api/photos/upload` without cookie | 401 |
| QA-1.9 | Thumbnail generated | curl | `GET ${R2_PUBLIC_BASE_URL}/${r2_thumbnail_key}` | 200, image bytes, smaller than original |
| QA-1.10 | Unauthenticated grid | curl | `GET /api/photos` without cookie | 401 |

---

## Phase 2: Location Intelligence

### 2.1 New files (to be created)

| File (to be created) | Purpose |
|---|---|
| `server/geocoding.ts` | Nominatim client with rate limiting + DB cache |
| `server/db/schema.ts` (extend existing) | Add `geocode_cache (query TEXT PK, response JSON, fetched_at INTEGER)` |
| `api/geocode.ts` | GET `?q=sydney` → candidates |
| `src/components/LocationPromptModal.vue` | Modal for missing-GPS photos |
| `src/lib/exif.ts` | Client-side EXIF extraction wrapper |

### 2.2 Geocoding behavior

- Query: cached forever in `geocode_cache` (Nominatim ToS allows cache)
- Rate limit: in-process queue, min 1100ms between calls
- User-Agent header set from `NOMINATIM_USER_AGENT` env var
- Response: array of `{ display_name, lat, lon, country, place_id }`
- Upload payload requires either EXIF GPS OR confirmed `{lat, lon, location_display}`

### 2.3 Phase 2 QA

| # | Scenario | Tool | Steps | Expected |
|---|---|---|---|---|
| QA-2.1 | Geocode lookup | curl | `GET /api/geocode?q=sydney` | 200, array includes "Sydney, NSW, Australia" |
| QA-2.2 | Geocode cache hit | curl | Repeat QA-2.1 | <50ms response, second row not added to cache |
| QA-2.3 | Rate limit honored | script | 5 distinct queries in parallel | All succeed, total elapsed ≥ 4.4s |
| QA-2.4 | Photo with EXIF GPS | Playwright | Upload photo containing GPS | No prompt shown, photo saved with EXIF coords |
| QA-2.5 | Photo without GPS prompts | Playwright | Upload photo with no GPS | Modal opens, requires location input |
| QA-2.6 | Invalid location rejected | Playwright | Type gibberish "xqzpdq", submit | Form shows "no matches", submit disabled |
| QA-2.7 | Valid location confirmed | Playwright | Type "sydney", pick first result, confirm | Photo uploads with `location_display="Sydney, NSW, Australia"` |
| QA-2.8 | Upload without location blocked | curl | `POST /api/photos/upload` for GPS-less photo with no location body | 400 "location required" |

---

## Phase 3: Albums

### 3.1 New files (to be created)

| File (to be created) | Purpose |
|---|---|
| `server/db/schema.ts` (extend existing) | Add `albums`, `album_photos` tables |
| `server/albums.ts` | `assignToAlbum(photo)` - find/create by (year, month, location_key) |
| `api/albums/index.ts` | GET list albums grouped by year |
| `api/albums/[id].ts` | GET album + photos, PATCH rename, DELETE |
| `api/photos/[id].ts` | PATCH move/edit metadata, DELETE |
| `src/views/Albums.vue` | Album list page |
| `src/views/AlbumDetail.vue` | Album photo grid |
| `src/components/MoveToAlbumModal.vue` | Album picker |

### 3.2 Location key normalization

`location_key = slug(city) + "-" + country_code.toLowerCase()`
e.g. `"Sydney, NSW, Australia"` → `"sydney-au"`

### 3.3 Phase 3 QA

| # | Scenario | Tool | Steps | Expected |
|---|---|---|---|---|
| QA-3.1 | Album auto-create | Playwright | Upload first Sydney photo dated 2025-03-15 | Album "Sydney - March 2025" exists, photo assigned |
| QA-3.2 | Same album reuse | Playwright | Upload second Sydney photo dated 2025-03-20 | Same album, photo count = 2 |
| QA-3.3 | Different month → new album | Playwright | Upload Sydney photo dated 2025-04-01 | Two distinct Sydney albums (Mar, Apr) |
| QA-3.4 | Different city → new album | Playwright | Upload Melbourne photo dated 2025-03-15 | Two distinct March 2025 albums |
| QA-3.5 | Undated photo album | Playwright | Upload photo with no taken_at, location Sydney | Album "Undated - Sydney" |
| QA-3.6 | Album list grouped by year | Playwright | Visit `/albums` | Years descending, albums under each |
| QA-3.7 | Move photo between albums | Playwright | Open photo, "Move to..." → pick other album | Photo moves, source count decreases, target increases |
| QA-3.8 | Delete photo | Playwright | Click delete, confirm | Row removed, R2 objects deleted, album cover updates if needed |
| QA-3.9 | Delete empty album | Playwright | Delete last photo | Album auto-deletes |
| QA-3.10 | Edit photo metadata | Playwright | Change location → triggers album reassignment | Photo moves to correct album |

---

## Phase 4: Polish

### 4.1 New files (to be created)

| File (to be created) | Purpose |
|---|---|
| `api/share/create.ts` | POST create share link for album |
| `api/share/[token].ts` | GET public album view (no auth) |
| `src/views/Share.vue` | Public album page (no nav) |
| `src/components/Lightbox.vue` | Fullscreen photo viewer with keyboard nav |
| `src/components/BulkUpload.vue` | Multi-file upload with progress |

### 4.2 Bulk upload strategy

To avoid Vercel function timeout: client uploads each original directly to R2
using **presigned PUT URLs** (`@aws-sdk/s3-request-presigner`). The server
endpoint only:
1. Issues the presigned URL (small, fast)
2. After client confirms upload, generates a thumbnail (download from R2 →
   `sharp` resize → upload thumbnail to R2)
3. Inserts the photo row + assigns to album

If thumbnail generation also approaches the timeout for large originals,
move it to a background queue (out of scope for v1 - acceptable to keep it
inline given Vercel hobby 10s limit is enough for sub-20MB JPEGs).

### 4.3 Phase 4 QA

| # | Scenario | Tool | Steps | Expected |
|---|---|---|---|---|
| QA-4.1 | Create share link | Playwright | Album page → "Share" | Modal shows URL like `/share/abc123` |
| QA-4.2 | Public share access | Playwright (no auth) | Visit share URL in incognito | Album loads, no login prompt |
| QA-4.3 | Revoked link 404 | Playwright | Revoke link, revisit | 404 page |
| QA-4.4 | Expired link 404 | curl | Set `expires_at` in past, `GET /share/:token` | 404 |
| QA-4.5 | Download original | Playwright | Click "Download" on photo | Original bytes downloaded, EXIF intact |
| QA-4.6 | Bulk upload 20 photos | Playwright | Drag 20 JPEGs | All 20 PUT directly to R2 via presigned URLs, progress bar advances, all appear in grid, no Vercel function timeout |
| QA-4.7 | Lightbox keyboard nav | Playwright | Open photo, press → ← Esc | Navigates next/prev, Esc closes |
| QA-4.8 | Mobile layout | Playwright (375px viewport) | Visit `/`, `/albums` | No horizontal scroll, touch targets ≥ 44px |

---

## Final Verification Wave

Before declaring the project complete, run all QA scenarios end-to-end against
a deployed Vercel preview environment:

1. Provision fresh Turso DB + Vercel Blob bucket
2. Deploy preview: `vercel --prod=false`
3. Run all Playwright scenarios (QA-1.5..1.7, 2.4..2.7, 3.*, 4.*) against
   preview URL
4. Run all curl scenarios against preview API
5. Manual smoke: upload 50 real family photos, browse albums, share one
6. Inspect Turso schema matches `schema.ts`
7. Verify Blob bucket contains both originals and thumbnails per photo

---

## Auth Flow (Email OTP)

```
┌────────────┐  email     ┌─────────────┐  6-digit code (Resend)   ┌─────────┐
│ /login UI  │ ──────────▶│ /api/auth/  │ ───────────────────────▶ │ Inbox   │
│ (stage 1)  │            │ request-code│                          └─────────┘
└────────────┘            └─────────────┘                              │
                                                                       │ types code
                                                                       ▼
┌────────────┐  code      ┌─────────────┐
│ /login UI  │ ──────────▶│ /api/auth/  │ ── creates user (first time)
│ (stage 2)  │            │ verify-code │ ── sets session cookie
└────────────┘            └─────────────┘ ── 302 / redirect to /
```

**request-code** logic:
1. If email is in `users` → issue code
2. Else if email is in `allowed_emails` → issue code
3. Else if `users` AND `allowed_emails` are both empty (bootstrap) → add email
   to `allowed_emails` (admin), issue code
4. Else (unknown email) → silently return `{ok: true}` (no leak, no email,
   no DB write)

Always responds the same way (~150ms) regardless of branch taken, so a
caller can't distinguish unknown from known emails.

**verify-code** logic:
1. Look up `email_codes` row by `(email, code_hash)` where `used_at IS NULL`
   and `expires_at > now`
2. If not found → increment any matching `email` rows' `attempts`; if
   `attempts >= 5`, mark code `used_at = now` (invalidated). Return 401.
3. If found → mark `used_at = now`. If user doesn't exist yet, copy from
   `allowed_emails` to `users` and delete the allowlist row. Set session
   cookie. Return user info.

## Theme & Visual Design

**Dark background with a vibrant nature-based color palette.**

Photos look their best against dark backgrounds (less retinal flare, no
visual competition from chrome). The accent system pulls from natural
imagery: leaf greens, dawn/sunset gold, forest moss, river turquoise.

### Palette (TailwindCSS classes for reference)

| Token | Hex | Use |
|---|---|---|
| `bg-base` | `#0d1410` | App background (deep forest floor) |
| `bg-surface` | `#16201b` | Cards, modals, panels |
| `bg-surface-2` | `#1e2a24` | Elevated surfaces, input fields |
| `border-subtle` | `#2a3a32` | Dividers, card borders |
| `text-primary` | `#ecfdf5` | Headings, body |
| `text-muted` | `#8da99c` | Secondary text, hints |
| `accent` (emerald) | `#34d399` | Primary CTA, links |
| `accent-hover` | `#10b981` | Hover state |
| `lime` | `#a3e635` | Success / done state |
| `gold` | `#fbbf24` | Warning / pending |
| `coral` | `#fb7185` | Destructive (delete, revoke) |
| `turquoise` | `#5eead4` | Info, secondary highlights |

### Application notes

- All views use the `bg-base` page background.
- Cards/panels/modals use `bg-surface` with `border-subtle`.
- Form inputs use `bg-surface-2` with `border-subtle`; focus rings use
  `accent`.
- Primary buttons: `accent` background, dark text, hover `accent-hover`.
- Album cards have warm hover lift (subtle shadow + scale).
- Lightbox keeps pure-black background for max photo contrast.
- Login screen has a subtle radial gradient (forest top-down) to add
  depth without distracting from the form.

## Project Structure (final state)

```
family_photo/
├── api/
│   ├── index.ts                # Hono entry
│   ├── auth/
│   │   ├── request-code.ts
│   │   ├── verify-code.ts
│   │   ├── logout.ts
│   │   └── me.ts
│   ├── admin/
│   │   └── allowed-emails.ts
│   ├── photos/
│   │   ├── upload.ts
│   │   ├── index.ts
│   │   └── [id].ts
│   ├── albums/
│   │   ├── index.ts
│   │   └── [id].ts
│   ├── geocode.ts
│   └── share/
│       ├── create.ts
│       └── [token].ts
├── src/
│   ├── main.ts
│   ├── App.vue
│   ├── router/index.ts
│   ├── stores/auth.ts
│   ├── lib/exif.ts
│   ├── views/
│   │   ├── Login.vue
│   │   ├── Home.vue
│   │   ├── Upload.vue
│   │   ├── Albums.vue
│   │   ├── AlbumDetail.vue
│   │   └── Share.vue
│   └── components/
│       ├── PhotoGrid.vue
│       ├── LocationPromptModal.vue
│       ├── MoveToAlbumModal.vue
│       ├── Lightbox.vue
│       └── BulkUpload.vue
├── server/
│   ├── db/
│   │   ├── client.ts
│   │   └── schema.ts
│   ├── auth.ts
│   ├── storage.ts
│   ├── geocoding.ts
│   └── albums.ts
├── drizzle/                    # generated migrations
├── vercel.json
├── drizzle.config.ts
├── tailwind.config.js
├── tsconfig.json
├── .env.example
├── package.json
└── README.md
```

## Key Considerations / Risks

1. **Vercel Function timeout**: 10s hobby / 60s pro. Mitigated by direct-to-R2
   presigned uploads in Phase 4.
2. **Nominatim rate limit**: 1 req/sec. Mitigated by DB cache + in-process
   queue.
3. **Storage costs (R2)**: 10GB free, then $0.015/GB/mo. **Zero egress fees**
   regardless of viewing volume. Realistic cost at 3000 family photos
   (~15GB): ~$0.075/mo. Bandwidth always free.
4. **R2 public bucket security**: Photos are served from a public R2 bucket
   via random opaque keys (e.g. UUIDs). Anyone with a direct URL can view
   that one photo. Album/grid listings are still auth-gated in our DB - only
   share-link recipients get the URLs. Acceptable for family-photo threat
   model.
5. **OTP brute-force resistance**: 6-digit codes have only 1M possibilities,
   so brute-force is feasible without rate limiting. Mitigations:
   - Each code is hashed (SHA-256) before storage; raw code only exists in
     the email
   - Codes expire in 15 minutes
   - `attempts` counter per code; code is invalidated after 5 wrong attempts
   - Unknown emails get a generic success response (no leak about who's a
     member) but no code is sent or stored
6. **Email deliverability**: Resend's default sender (`onboarding@resend.dev`)
   works for dev/testing. For production, configure a custom domain in
   Resend to avoid spam filters - set `RESEND_FROM_EMAIL` accordingly.
7. **EXIF orientation**: `sharp` thumbnail pipeline must call `.rotate()` to
   bake in orientation before resize.
6. **Originals unmodified**: Uploaded bytes are sent to R2 unchanged - EXIF
   preserved exactly.
7. **R2 → Vercel data path on upload**: Original upload goes
   browser → Vercel function → R2 (Phase 1) or browser → R2 directly via
   presigned URL (Phase 4). Either way zero egress because R2 ingress is
   always free.

## Open Items Before Implementation

- Project name for `package.json`: **`gray-family-photos`**
- Email delivery for sign-in: **Resend** (free tier 3000/mo). Admin adds
  family-member email + name to allowlist in the admin panel; family member
  goes to /login, types email, receives a 6-digit code, types it in. No
  passwords, no manual link copy-paste.
- Initial admin email for Phase 1 bootstrap: **`mark@grayszone.com`**
