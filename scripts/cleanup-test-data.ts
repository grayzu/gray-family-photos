import { eq, inArray } from "drizzle-orm";
import { db } from "../server/db/client.js";
import { photos, albums, shareLinks, users } from "../server/db/schema.js";
import { deleteObject } from "../server/storage.js";

const DANGER_FLAG = "--i-understand-this-deletes-real-photos";
const args = process.argv.slice(2);

if (!args.includes(DANGER_FLAG)) {
  console.error(`
This script DELETES PHOTOS PERMANENTLY from the database AND from R2.
Refuses to run without explicit filters.

Usage:
  npx tsx scripts/cleanup-test-data.ts ${DANGER_FLAG} [filter ...]

Filters (at least one of --user or --older-than required):
  --user EMAIL              only delete photos owned by this user
  --older-than SECONDS      only delete photos uploaded more than N seconds ago
  --dry-run                 show what would be deleted, do not delete

Example (only photos uploaded by a specific test user in the last 5 minutes):
  ${DANGER_FLAG} --user tester@example.com --older-than 300 --dry-run
`);
  process.exit(1);
}

function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

const dryRun = args.includes("--dry-run");
const userFilter = flag("--user");
const olderThanArg = flag("--older-than");
const olderThanSec = olderThanArg ? Number.parseInt(olderThanArg, 10) : null;

if (!userFilter && !olderThanSec) {
  console.error("ERROR: at least one of --user or --older-than is required.");
  process.exit(1);
}

let userIdFilter: string | null = null;
if (userFilter) {
  const rows = await db.select().from(users).where(eq(users.email, userFilter));
  if (rows.length === 0) {
    console.error(`No user with email ${userFilter}`);
    process.exit(1);
  }
  userIdFilter = rows[0]!.id;
}

const cutoffUnix = olderThanSec
  ? Math.floor(Date.now() / 1000) - olderThanSec
  : null;

const all = await db.select().from(photos);
const matching = all.filter((p) => {
  if (userIdFilter && p.userId !== userIdFilter) return false;
  if (cutoffUnix !== null && p.uploadedAt > cutoffUnix) return false;
  return true;
});

console.log(`Total photos in DB: ${all.length}`);
console.log(`Matching filters:   ${matching.length}`);
matching.slice(0, 10).forEach((p) => {
  console.log(
    `  ${p.id} | user=${p.userId} | uploaded=${new Date(p.uploadedAt * 1000).toISOString()} | key=${p.r2OriginalKey}`,
  );
});
if (matching.length > 10) console.log(`  ... and ${matching.length - 10} more`);

if (dryRun) {
  console.log("\n[dry run] Done. No changes made.");
  process.exit(0);
}
if (matching.length === 0) {
  console.log("Nothing to delete.");
  process.exit(0);
}

console.log("\nDeleting R2 objects...");
const ids = matching.map((p) => p.id);
let ok = 0;
let fail = 0;
for (const p of matching) {
  try {
    await deleteObject(p.r2OriginalKey);
    if (p.r2ThumbnailKey !== p.r2OriginalKey) {
      await deleteObject(p.r2ThumbnailKey).catch(() => undefined);
    }
    ok++;
  } catch {
    fail++;
  }
}
console.log(`  R2 ok=${ok} fail=${fail}`);

console.log("Deleting DB rows...");
const affectedAlbumIds = new Set(
  matching.map((p) => p.albumId).filter((x): x is string => !!x),
);
if (affectedAlbumIds.size > 0) {
  await db
    .delete(shareLinks)
    .where(inArray(shareLinks.albumId, Array.from(affectedAlbumIds)));
}
await db.delete(photos).where(inArray(photos.id, ids));

let droppedAlbums = 0;
for (const albumId of affectedAlbumIds) {
  const remaining = await db
    .select({ id: photos.id })
    .from(photos)
    .where(eq(photos.albumId, albumId))
    .limit(1);
  if (remaining.length === 0) {
    await db.delete(albums).where(eq(albums.id, albumId));
    droppedAlbums++;
  }
}
console.log(
  `  Deleted ${matching.length} photo rows, ${droppedAlbums} empty albums`,
);
console.log("Done.");
