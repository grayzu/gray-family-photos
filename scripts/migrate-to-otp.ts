import { createClient } from "@libsql/client";

const c = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

console.log("Dropping legacy tables/columns...");

await c.execute("DROP TABLE IF EXISTS invites");

const cols = await c.execute("PRAGMA table_info(users)");
const hasPasswordHash = cols.rows.some((r) => r.name === "password_hash");
if (hasPasswordHash) {
  await c.execute("ALTER TABLE users DROP COLUMN password_hash");
  console.log("  dropped users.password_hash");
}

console.log("Done.");
const tables = await c.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' ORDER BY name",
);
console.log("Tables now:", tables.rows.map((r) => r.name));
