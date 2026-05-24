import {
  sqliteTable,
  text,
  integer,
  real,
  index,
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
  },
  (t) => [
    index("photos_user_id_idx").on(t.userId),
    index("photos_taken_at_idx").on(t.takenAt),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type AllowedEmail = typeof allowedEmails.$inferSelect;
export type EmailCode = typeof emailCodes.$inferSelect;
export type GeocodeCacheEntry = typeof geocodeCache.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
