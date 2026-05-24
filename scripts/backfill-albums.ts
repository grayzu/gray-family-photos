import { isNull } from "drizzle-orm";
import { db } from "../server/db/client.js";
import { photos } from "../server/db/schema.js";
import { assignPhotoToAlbum } from "../server/albums.js";

const unassigned = await db
  .select()
  .from(photos)
  .where(isNull(photos.albumId));

console.log(`Backfilling ${unassigned.length} photos into albums...`);

let assigned = 0;
let skipped = 0;
for (const p of unassigned) {
  if (!p.locationDisplay) {
    console.log(`  skip ${p.id}: no location`);
    skipped++;
    continue;
  }
  const albumId = await assignPhotoToAlbum(p);
  console.log(`  ${p.id} -> ${albumId}`);
  assigned++;
}

console.log(`Done. Assigned: ${assigned}, Skipped: ${skipped}`);
