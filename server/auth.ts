import { eq } from "drizzle-orm";
import { encodeHexLowerCase, encodeBase32LowerCaseNoPadding } from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
import { db } from "./db/client.js";
import { sessions, users, type User } from "./db/schema.js";
import { randomBytes, pbkdf2Sync, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE = "session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = "sha256";

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEYLEN,
    PBKDF2_DIGEST,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iters = Number.parseInt(parts[1]!, 10);
  const salt = Buffer.from(parts[2]!, "hex");
  const expected = Buffer.from(parts[3]!, "hex");
  const got = pbkdf2Sync(password, salt, iters, expected.length, PBKDF2_DIGEST);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function generateSessionToken(): string {
  const bytes = randomBytes(20);
  return encodeBase32LowerCaseNoPadding(bytes);
}

function tokenToSessionId(token: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
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

export function sessionCookieAttributes(expiresAtSec: number): string {
  const expires = new Date(expiresAtSec * 1000).toUTCString();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Expires=${expires}${secure}`;
}

export function setSessionCookieHeader(token: string, expiresAtSec: number) {
  return `${SESSION_COOKIE}=${token}; ${sessionCookieAttributes(expiresAtSec)}`;
}

export function clearSessionCookieHeader() {
  const expires = new Date(0).toUTCString();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}${secure}`;
}

export function readSessionCookie(cookieHeader: string | undefined | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) return rest.join("=");
  }
  return null;
}
