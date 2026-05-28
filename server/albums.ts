import { and, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "./db/client.js";
import { albums, photos, type Photo } from "./db/schema.js";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const UNDATED_YEAR = 0;
const UNDATED_MONTH = 0;

export function locationKey(
  city: string | null,
  countryCode: string | null,
  fallbackDisplay?: string | null,
): string {
  const raw =
    (city && city.trim()) ||
    (fallbackDisplay ? fallbackDisplay.split(",")[0]!.trim() : "") ||
    "unknown";
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const cc = (countryCode ?? "xx").toLowerCase();
  return `${base || "unknown"}-${cc}`;
}

function albumNameFor(
  year: number,
  month: number,
  city: string | null,
  fallbackDisplay: string,
): string {
  const name =
    (city && city.trim()) ||
    fallbackDisplay.split(",")[0]!.trim() ||
    "Unknown";
  if (year === UNDATED_YEAR && month === UNDATED_MONTH) return `${name} - Undated`;
  return `${name} - ${MONTH_NAMES[month - 1]} ${year}`;
}

export async function findOrCreateAlbum(input: {
  takenAt: number | null;
  locationName: string | null;
  locationDisplay: string;
  locationCountry: string | null;
  coverPhotoId?: string | null;
}): Promise<string> {
  let year = UNDATED_YEAR;
  let month = UNDATED_MONTH;
  if (input.takenAt !== null) {
    const d = new Date(input.takenAt * 1000);
    year = d.getUTCFullYear();
    month = d.getUTCMonth() + 1;
  }
  const key = locationKey(input.locationName, input.locationCountry, input.locationDisplay);

  const existing = await db
    .select()
    .from(albums)
    .where(
      and(
        eq(albums.year, year),
        eq(albums.month, month),
        eq(albums.locationKey, key),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0].id;

  const id = randomBytes(16).toString("hex");
  await db.insert(albums).values({
    id,
    name: albumNameFor(year, month, input.locationName, input.locationDisplay),
    year,
    month,
    locationKey: key,
    locationDisplay: input.locationDisplay,
    coverPhotoId: input.coverPhotoId ?? null,
    createdAt: Math.floor(Date.now() / 1000),
  });
  return id;
}

export async function assignPhotoToAlbum(photo: Photo): Promise<string | null> {
  if (!photo.locationDisplay) return null;
  const albumId = await findOrCreateAlbum({
    takenAt: photo.takenAt,
    locationName: photo.locationName,
    locationDisplay: photo.locationDisplay,
    locationCountry: photo.locationCountry,
    coverPhotoId: photo.id,
  });
  await db.update(photos).set({ albumId }).where(eq(photos.id, photo.id));

  await db
    .update(albums)
    .set({ coverPhotoId: photo.id })
    .where(and(eq(albums.id, albumId), sql`${albums.coverPhotoId} IS NULL`));

  return albumId;
}

export async function maybeDeleteEmptyAlbum(albumId: string): Promise<boolean> {
  const remaining = await db
    .select({ n: sql<number>`count(*)` })
    .from(photos)
    .where(eq(photos.albumId, albumId));
  if (Number(remaining[0]?.n ?? 0) === 0) {
    await db.delete(albums).where(eq(albums.id, albumId));
    return true;
  }
  return false;
}

export async function maybeFixAlbumCover(albumId: string) {
  const album = await db
    .select()
    .from(albums)
    .where(eq(albums.id, albumId))
    .limit(1);
  if (!album[0]) return;
  const coverStillExists = album[0].coverPhotoId
    ? (
        await db
          .select({ id: photos.id })
          .from(photos)
          .where(eq(photos.id, album[0].coverPhotoId))
          .limit(1)
      ).length > 0
    : false;
  if (coverStillExists) return;
  const newest = await db
    .select()
    .from(photos)
    .where(eq(photos.albumId, albumId))
    .orderBy(sql`${photos.uploadedAt} DESC`)
    .limit(1);
  await db
    .update(albums)
    .set({ coverPhotoId: newest[0]?.id ?? null })
    .where(eq(albums.id, albumId));
}
