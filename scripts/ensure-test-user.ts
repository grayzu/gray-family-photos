import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "../server/db/client.js";
import { users, allowedEmails } from "../server/db/schema.js";

const TEST_EMAIL = "playwright-test@example.com";
const TEST_NAME = "Playwright";

const existing = await db.select().from(users).where(eq(users.email, TEST_EMAIL));
if (existing.length > 0) {
  console.log(`Test user already exists: ${TEST_EMAIL} (id=${existing[0]!.id})`);
  process.exit(0);
}

const allowedExisting = await db
  .select()
  .from(allowedEmails)
  .where(eq(allowedEmails.email, TEST_EMAIL));

if (allowedExisting.length > 0) {
  console.log(`Email already in allowlist: ${TEST_EMAIL}`);
} else {
  await db.insert(allowedEmails).values({
    email: TEST_EMAIL,
    name: TEST_NAME,
    isAdmin: true,
    addedBy: null,
    addedAt: Math.floor(Date.now() / 1000),
  });
  console.log(`Added ${TEST_EMAIL} to allowlist (will auto-create user on first sign-in).`);
}

const id = randomBytes(16).toString("hex");
await db.insert(users).values({
  id,
  email: TEST_EMAIL,
  name: TEST_NAME,
  isAdmin: true,
  createdAt: Math.floor(Date.now() / 1000),
});
await db.delete(allowedEmails).where(eq(allowedEmails.email, TEST_EMAIL));
console.log(`Created user ${TEST_EMAIL} (id=${id}). Tests can now sign in via OTP.`);
