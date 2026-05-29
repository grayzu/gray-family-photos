# gray-family-photos

A family photo website with **publicly viewable albums** and **invite-only
account creation**. Anyone with the URL can browse and view photos; only
invited family members can upload, edit, or delete. Albums are organized
automatically by month + location with EXIF-based geocoding (with prompt
fallback). Deployed on Vercel.

## Stack

Hybrid: Vercel for app (Node functions can run `sharp`), Cloudflare R2 for
photo storage (zero egress fees).

- Vue 3 + Vite + TypeScript + TailwindCSS + Pinia + Vue Router
- Hono on Vercel Functions (Node.js)
- Turso (libSQL) + Drizzle ORM (metadata only)
- Cloudflare R2 via `@aws-sdk/client-s3` (originals + thumbnails)
- Email one-time code (OTP) auth via Resend (`@oslojs/crypto` for sessions)
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
     - **Configure CORS** on the bucket (Settings → CORS Policy) so the
       browser can upload originals directly. Use this JSON:
       ```json
       [
         {
           "AllowedOrigins": [
             "https://gray-family-photos.vercel.app",
             "http://localhost:3000"
           ],
           "AllowedMethods": ["PUT", "GET", "HEAD"],
           "AllowedHeaders": ["*"],
           "ExposeHeaders": ["ETag"],
           "MaxAgeSeconds": 3600
         }
       ]
       ```
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

## Access model

- **Public viewing**: anyone can browse `/` (album list) and `/albums/:id`
  (album detail with photos) without signing in. No login is required to
  view the family gallery.
- **Invite-only accounts**: there is no self-signup. To get an account, an
  admin must add your email + name on the `/admin` page, which triggers an
  invite email. You then visit `/login`, enter your email, receive a
  6-digit code by email, and type it in. First sign-in creates your
  account from the allowlist entry.
- **Authenticated actions**: uploading photos, creating share links, and
  setting album thumbnails require a signed-in account.
- **Admin-only actions**: editing, moving, and deleting photos or albums,
  managing the invite allowlist, and renaming albums.

## First-time admin bootstrap

Account creation is invite-only with **no auto-bootstrap path**. To seed
the first admin, insert a row directly into the `allowed_emails` table on
your Turso database before the first sign-in attempt:

```sql
INSERT INTO allowed_emails (email, name, is_admin, added_by, added_at)
VALUES ('you@example.com', 'Your Name', 1, NULL, unixepoch());
```

After that admin signs in once, they can invite additional family members
from the `/admin` page.

## Sharing invites

Admins go to `/admin` to add a family member's email + name to the
allowlist. The family member receives an invitation email (subject to
Resend deliverability — see below), visits `/login`, enters their email,
receives a 6-digit code, and types it in.

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
- `RESEND_API_KEY` (optional locally; required in prod for real email)
- `RESEND_FROM_EMAIL` (optional; defaults to onboarding@resend.dev)
- `APP_BASE_URL` (optional; used as the link in invitation emails)

## Email deliverability (IMPORTANT)

Invitation emails and sign-in codes go through Resend.

- If `RESEND_FROM_EMAIL` is left as the default `onboarding@resend.dev`,
  Resend's free tier will **only deliver to the account owner's verified
  email address**. Anyone else will silently fail to receive emails.
- To send to family members, verify your domain at
  https://resend.com/domains and set `RESEND_FROM_EMAIL` to an address
  on that domain (e.g. `Gray Family Photos <noreply@grayszone.com>`).
- Diagnose delivery problems with:
  ```bash
  npx tsx --env-file=.env.local scripts/check-resend.ts someone@example.com
  ```
  This lists verified domains on the account and sends a test email.
