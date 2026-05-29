import { and, eq, gte, isNull, sql } from "drizzle-orm";
import {
  encodeHexLowerCase,
  encodeBase32LowerCaseNoPadding,
} from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
import { randomBytes, randomInt } from "node:crypto";
import { db } from "./db/client.js";
import {
  sessions,
  users,
  emailCodes,
  allowedEmails,
  type User,
} from "./db/schema.js";

// Account creation is invite-only. The only path to sign in is to be present
// in either the `users` table (existing account) or the `allowed_emails`
// allowlist (added by an admin via POST /api/admin/allowed-emails). There is
// no self-signup and no bootstrap path: the seed admin must be inserted
// directly into the database the first time the app is deployed.

const SESSION_COOKIE = "session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

const CODE_TTL_SEC = 60 * 15;
const CODE_MAX_ATTEMPTS = 5;

function hashString(s: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(s)));
}

function generateNumericCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function issueLoginCode(
  emailRaw: string,
): Promise<{ code: string; name: string | null } | null> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return null;

  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  let name: string | null = userRows[0]?.name ?? null;
  let allowed = userRows.length > 0;

  if (!allowed) {
    const allowedRows = await db
      .select()
      .from(allowedEmails)
      .where(eq(allowedEmails.email, email))
      .limit(1);
    if (allowedRows.length > 0) {
      allowed = true;
      name = allowedRows[0]!.name;
    }
  }

  if (!allowed) return null;

  const code = generateNumericCode();
  const now = Math.floor(Date.now() / 1000);

  await db
    .update(emailCodes)
    .set({ usedAt: now })
    .where(and(eq(emailCodes.email, email), isNull(emailCodes.usedAt)));

  await db.insert(emailCodes).values({
    id: randomBytes(16).toString("hex"),
    email,
    codeHash: hashString(`${email}:${code}`),
    createdAt: now,
    expiresAt: now + CODE_TTL_SEC,
    usedAt: null,
    attempts: 0,
  });

  return { code, name };
}

export type VerifyResult =
  | { ok: true; user: User }
  | { ok: false; reason: "invalid" | "expired" | "locked" };

export async function verifyLoginCode(
  emailRaw: string,
  code: string,
): Promise<VerifyResult> {
  const email = emailRaw.trim().toLowerCase();
  const codeHash = hashString(`${email}:${code}`);
  const now = Math.floor(Date.now() / 1000);

  const rows = await db
    .select()
    .from(emailCodes)
    .where(
      and(
        eq(emailCodes.email, email),
        eq(emailCodes.codeHash, codeHash),
        isNull(emailCodes.usedAt),
        gte(emailCodes.expiresAt, now),
      ),
    )
    .limit(1);
  const match = rows[0];

  if (!match) {
    await db
      .update(emailCodes)
      .set({ attempts: sql`${emailCodes.attempts} + 1` })
      .where(
        and(
          eq(emailCodes.email, email),
          isNull(emailCodes.usedAt),
          gte(emailCodes.expiresAt, now),
        ),
      );
    await db
      .update(emailCodes)
      .set({ usedAt: now })
      .where(
        and(
          eq(emailCodes.email, email),
          isNull(emailCodes.usedAt),
          gte(emailCodes.attempts, CODE_MAX_ATTEMPTS),
        ),
      );
    return { ok: false, reason: "invalid" };
  }

  if (match.attempts >= CODE_MAX_ATTEMPTS) {
    await db.update(emailCodes).set({ usedAt: now }).where(eq(emailCodes.id, match.id));
    return { ok: false, reason: "locked" };
  }

  await db.update(emailCodes).set({ usedAt: now }).where(eq(emailCodes.id, match.id));

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing[0]) return { ok: true, user: existing[0] };

  const allowed = await db
    .select()
    .from(allowedEmails)
    .where(eq(allowedEmails.email, email))
    .limit(1);
  if (!allowed[0]) return { ok: false, reason: "invalid" };

  const id = randomBytes(16).toString("hex");
  await db.insert(users).values({
    id,
    email,
    name: allowed[0].name,
    isAdmin: allowed[0].isAdmin,
    createdAt: now,
  });
  await db.delete(allowedEmails).where(eq(allowedEmails.email, email));

  const created = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return { ok: true, user: created[0]! };
}

export function generateSessionToken(): string {
  return encodeBase32LowerCaseNoPadding(randomBytes(20));
}

function tokenToSessionId(token: string): string {
  return hashString(token);
}

export async function createSession(token: string, userId: string) {
  const id = tokenToSessionId(token);
  const expiresAt = Math.floor((Date.now() + SESSION_TTL_MS) / 1000);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return { id, userId, expiresAt };
}

export async function validateSessionToken(
  token: string,
): Promise<{ user: User; session: { id: string; expiresAt: number } } | null> {
  const id = tokenToSessionId(token);
  const rows = await db
    .select()
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .limit(1);
  if (rows.length === 0) return null;
  const { sessions: session, users: user } = rows[0]!;
  const nowSec = Math.floor(Date.now() / 1000);
  if (session.expiresAt < nowSec) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  if (session.expiresAt - nowSec < SESSION_TTL_MS / 1000 / 2) {
    const newExpiresAt = Math.floor((Date.now() + SESSION_TTL_MS) / 1000);
    await db
      .update(sessions)
      .set({ expiresAt: newExpiresAt })
      .where(eq(sessions.id, id));
    session.expiresAt = newExpiresAt;
  }
  return { user, session };
}

export async function invalidateSession(token: string) {
  const id = tokenToSessionId(token);
  await db.delete(sessions).where(eq(sessions.id, id));
}

function cookieAttributes(expiresAtSec: number): string {
  const expires = new Date(expiresAtSec * 1000).toUTCString();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Expires=${expires}${secure}`;
}

export function setSessionCookieHeader(token: string, expiresAtSec: number) {
  return `${SESSION_COOKIE}=${token}; ${cookieAttributes(expiresAtSec)}`;
}

export function clearSessionCookieHeader() {
  const expires = new Date(0).toUTCString();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}${secure}`;
}

export function readSessionCookie(
  cookieHeader: string | undefined | null,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) return rest.join("=");
  }
  return null;
}
