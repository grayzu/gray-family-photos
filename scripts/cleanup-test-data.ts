import { db } from "../server/db/client.js";
import { photos, albums, shareLinks } from "../server/db/schema.js";
import { deleteObject } from "../server/storage.js";

const allPhotos = await db.select().from(photos);
const allAlbums = await db.select().from(albums);
const allShares = await db.select().from(shareLinks);

console.log(`Found:`);
console.log(`  ${allPhotos.length} photos`);
console.log(`  ${allAlbums.length} albums`);
console.log(`  ${allShares.length} share links`);
console.log();

const dryRun = process.argv.includes("--dry-run");
if (dryRun) {
  console.log("[dry run] Would delete all of the above. Re-run without --dry-run to execute.");
  process.exit(0);
}

console.log("Deleting R2 objects...");
let deleted = 0;
let failed = 0;
for (const p of allPhotos) {
  const keys = new Set([p.r2OriginalKey, p.r2ThumbnailKey]);
  for (const k of keys) {
    try {
      await deleteObject(k);
      deleted++;
    } catch {
      failed++;
    }
  }
}
console.log(`  R2 deletes: ${deleted} ok, ${failed} failed`);

console.log("Deleting DB rows...");
await db.delete(shareLinks);
await db.delete(photos);
await db.delete(albums);
console.log("Done.");
