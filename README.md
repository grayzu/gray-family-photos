# gray-family-photos

A family photo website with invite-only auth, automatic album organization by
month + location, EXIF-based geocoding (with prompt fallback), and public
share links. Deployed on Vercel.

## Stack

Hybrid: Vercel for app (Node functions can run `sharp`), Cloudflare R2 for
photo storage (zero egress fees).

- Vue 3 + Vite + TypeScript + TailwindCSS + Pinia + Vue Router
- Hono on Vercel Functions (Node.js)
- Turso (libSQL) + Drizzle ORM (metadata only)
- Cloudflare R2 via `@aws-sdk/client-s3` (originals + thumbnails)
- Session-based auth (hand-rolled with `@oslojs/crypto`)
- `exifr` for EXIF, `sharp` for thumbnails
- Nominatim (OpenStreetMap) for geocoding

## Setup

1. Copy env template and fill in values:
   ```bash
   cp .env.example .env.local
   ```
   - Create a Turso DB: `turso db create gray-family-photos` → grab URL + token
   - Create a Cloudflare R2 bucket `gray-family-photos`:
     - Enable Public Access on the bucket
     - Connect a custom domain (e.g. `photos.grayszone.com`) - the CNAME is
       auto-created since DNS is already on Cloudflare
     - Create an R2 API token with Object Read & Write scope for the bucket
   - Generate `SESSION_SECRET`: `openssl rand -hex 32`

2. Install dependencies:
   ```bash
   npm install
   ```

3. Push schema to Turso (once schema exists in Phase 1):
   ```bash
   npm run db:push
   ```

4. Run dev server:
   ```bash
   npm run dev          # Vite only (frontend)
   npm run dev:vercel   # Full stack (frontend + /api)
   ```

5. Run end-to-end tests:
   ```bash
   E2E_BASE_URL=http://localhost:3000 npm run e2e
   ```

## First-time admin bootstrap

The first signup (when the `users` table is empty) creates the admin account
with no invite token required. Subsequent signups require an invite token.

Initial admin email: `mark@grayszone.com`

## Sharing invites

Invites are manual: the admin creates an invite from the admin panel, then
copies the generated signup link and shares it with the family member
directly. No automated email delivery is configured.

## Deployment

```bash
vercel link
vercel env pull .env.local
vercel --prod=false   # preview deploy
vercel --prod         # production deploy
```

Required env vars in Vercel project settings:
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE_URL`
- `NOMINATIM_USER_AGENT`
- `SESSION_SECRET`
