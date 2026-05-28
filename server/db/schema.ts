import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const allowedEmails = sqliteTable("allowed_emails", {
  email: text("email").primaryKey(),
  name: text("name").notNull(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  addedBy: text("added_by").references(() => users.id, { onDelete: "set null" }),
  addedAt: integer("added_at").notNull(),
});

export const emailCodes = sqliteTable(
  "email_codes",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull().unique(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
    attempts: integer("attempts").notNull().default(0),
  },
  (t) => [index("email_codes_email_idx").on(t.email)],
);

export const geocodeCache = sqliteTable("geocode_cache", {
  query: text("query").primaryKey(),
  response: text("response").notNull(),
  fetchedAt: integer("fetched_at").notNull(),
});

export const albums = sqliteTable(
  "albums",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    locationKey: text("location_key").notNull(),
    locationDisplay: text("location_display").notNull(),
    coverPhotoId: text("cover_photo_id"),
    coverMode: text("cover_mode").notNull().default("single"),
    collagePhotoIds: text("collage_photo_ids"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("albums_ymloc_unique").on(t.year, t.month, t.locationKey),
    index("albums_year_idx").on(t.year),
  ],
);

export const photos = sqliteTable(
  "photos",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    r2OriginalKey: text("r2_original_key").notNull(),
    r2ThumbnailKey: text("r2_thumbnail_key").notNull(),
    takenAt: integer("taken_at"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    locationName: text("location_name"),
    locationDisplay: text("location_display"),
    locationCountry: text("location_country"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    fileSize: integer("file_size").notNull(),
    mimeType: text("mime_type").notNull(),
    uploadedAt: integer("uploaded_at").notNull(),
    albumId: text("album_id"),
  },
  (t) => [
    index("photos_user_id_idx").on(t.userId),
    index("photos_taken_at_idx").on(t.takenAt),
    index("photos_album_id_idx").on(t.albumId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type AllowedEmail = typeof allowedEmails.$inferSelect;
export type EmailCode = typeof emailCodes.$inferSelect;
export type GeocodeCacheEntry = typeof geocodeCache.$inferSelect;
export type Album = typeof albums.$inferSelect;
export type NewAlbum = typeof albums.$inferInsert;

export const shareLinks = sqliteTable(
  "share_links",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    albumId: text("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at"),
  },
  (t) => [index("share_links_album_idx").on(t.albumId)],
);

export type ShareLink = typeof shareLinks.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
