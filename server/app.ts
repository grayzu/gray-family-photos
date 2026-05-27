import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "./db/client.js";
import { users, allowedEmails, photos, albums, shareLinks } from "./db/schema.js";
import {
  issueLoginCode,
  verifyLoginCode,
  generateSessionToken,
  createSession,
  validateSessionToken,
  invalidateSession,
  readSessionCookie,
  setSessionCookieHeader,
  clearSessionCookieHeader,
} from "./auth.js";
import { sendCodeEmail, getDevLastCode } from "./email.js";
import {
  newPhotoKey,
  presignPut,
  thumbnailUrl,
  viewUrl,
  deleteObject,
} from "./storage.js";
import { geocode, reverseGeocode } from "./geocoding.js";
import { inspectHeifBrand, convertHeifToJpeg } from "./heif.js";
import {
  assignPhotoToAlbum,
  maybeDeleteEmptyAlbum,
  maybeFixAlbumCover,
} from "./albums.js";

export function buildApp() {
  const app = new Hono().basePath("/api");

  if (process.env.NODE_ENV !== "production") {
    app.use(async (c, next) => {
      const t = Date.now();
      await next();
      console.log(
        `[api] ${c.req.method} ${c.req.path} -> ${c.res.status} (${Date.now() - t}ms)`,
      );
    });
  }

  type Variables = {
    user: { id: string; email: string; name: string; isAdmin: boolean };
  };
  function authedRouter() {
    return new Hono<{ Variables: Variables }>().use(async (c, next) => {
      const token = readSessionCookie(c.req.header("cookie"));
      if (!token) return c.json({ error: "unauthorized" }, 401);
      const v = await validateSessionToken(token);
      if (!v) return c.json({ error: "unauthorized" }, 401);
      c.set("user", {
        id: v.user.id,
        email: v.user.email,
        name: v.user.name,
        isAdmin: v.user.isAdmin,
      });
      await next();
    });
  }

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/geocode", async (c) => {
    const q = c.req.query("q")?.trim();
    if (!q) return c.json({ error: "q required" }, 400);
    if (q.length < 2) return c.json([]);
    try {
      const results = await geocode(q);
      return c.json(results);
    } catch (err) {
      console.error("geocode failed:", err);
      return c.json({ error: "geocode failed" }, 502);
    }
  });

  app.get("/share/:token", async (c) => {
    const token = c.req.param("token");
    const linkRows = await db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.token, token))
      .limit(1);
    const link = linkRows[0];
    if (!link) return c.json({ error: "not found" }, 404);
    if (link.expiresAt && link.expiresAt < Math.floor(Date.now() / 1000)) {
      return c.json({ error: "expired" }, 404);
    }
    const albumRows = await db
      .select()
      .from(albums)
      .where(eq(albums.id, link.albumId))
      .limit(1);
    const album = albumRows[0];
    if (!album) return c.json({ error: "not found" }, 404);
    const albumPhotos = await db
      .select()
      .from(photos)
      .where(eq(photos.albumId, album.id))
      .orderBy(sql`${photos.takenAt} ASC, ${photos.uploadedAt} ASC`);
    return c.json({
      album: {
        id: album.id,
        name: album.name,
        locationDisplay: album.locationDisplay,
      },
      photos: albumPhotos.map((p) => ({
        id: p.id,
        originalUrl: viewUrl(p.r2OriginalKey),
        thumbnailUrl: thumbnailUrl(p.r2OriginalKey),
        takenAt: p.takenAt,
        width: p.width,
        height: p.height,
      })),
    });
  });

  if (process.env.NODE_ENV !== "production") {
    app.get("/__test/latest-code", async (c) => {
      const email = c.req.query("email")?.trim().toLowerCase();
      if (!email) return c.json({ error: "email required" }, 400);
      const code = getDevLastCode(email);
      if (!code) return c.json({ error: "no code" }, 404);
      return c.json({ code });
    });
  }

  app.post("/auth/request-code", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.email !== "string") {
      return c.json({ error: "email required" }, 400);
    }
    const issued = await issueLoginCode(body.email);
    if (issued) {
      try {
        await sendCodeEmail(body.email.trim().toLowerCase(), issued.code, issued.name ?? undefined);
      } catch (err) {
        console.error("sendCodeEmail failed:", err);
      }
    }
    return c.json({ ok: true });
  });

  app.post("/auth/verify-code", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (
      !body ||
      typeof body.email !== "string" ||
      typeof body.code !== "string"
    ) {
      return c.json({ error: "email and code required" }, 400);
    }
    const result = await verifyLoginCode(body.email, body.code);
    if (!result.ok) {
      const status = result.reason === "locked" ? 429 : 401;
      return c.json({ error: result.reason }, status);
    }
    const token = generateSessionToken();
    const sess = await createSession(token, result.user.id);
    c.header("Set-Cookie", setSessionCookieHeader(token, sess.expiresAt));
    return c.json({
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      isAdmin: result.user.isAdmin,
    });
  });

  app.post("/auth/logout", async (c) => {
    const token = readSessionCookie(c.req.header("cookie"));
    if (token) await invalidateSession(token);
    c.header("Set-Cookie", clearSessionCookieHeader());
    return c.json({ ok: true });
  });

  app.get("/auth/me", async (c) => {
    const token = readSessionCookie(c.req.header("cookie"));
    if (!token) return c.json({ user: null });
    const v = await validateSessionToken(token);
    if (!v) return c.json({ user: null });
    return c.json({
      user: {
        id: v.user.id,
        email: v.user.email,
        name: v.user.name,
        isAdmin: v.user.isAdmin,
      },
    });
  });

  app.route(
    "/admin/allowed-emails",
    authedRouter()
      .get("/", async (c) => {
        const user = c.get("user");
        if (!user.isAdmin) return c.json({ error: "admin only" }, 403);
        const rows = await db.select().from(allowedEmails);
        return c.json(rows);
      })
      .post("/", async (c) => {
        const user = c.get("user");
        if (!user.isAdmin) return c.json({ error: "admin only" }, 403);
        const body = await c.req.json().catch(() => null);
        if (
          !body ||
          typeof body.email !== "string" ||
          typeof body.name !== "string"
        ) {
          return c.json({ error: "email and name required" }, 400);
        }
        const email = body.email.trim().toLowerCase();
        const name = body.name.trim();
        const isAdmin = Boolean(body.isAdmin);

        const existingUser = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (existingUser.length) {
          return c.json({ error: "already a user" }, 409);
        }
        await db
          .insert(allowedEmails)
          .values({
            email,
            name,
            isAdmin,
            addedBy: user.id,
            addedAt: Math.floor(Date.now() / 1000),
          })
          .onConflictDoUpdate({
            target: allowedEmails.email,
            set: { name, isAdmin, addedBy: user.id },
          });
        return c.json({ email, name, isAdmin }, 201);
      })
      .delete("/:email", async (c) => {
        const user = c.get("user");
        if (!user.isAdmin) return c.json({ error: "admin only" }, 403);
        const email = decodeURIComponent(c.req.param("email")).toLowerCase();
        await db.delete(allowedEmails).where(eq(allowedEmails.email, email));
        return c.json({ ok: true });
      }),
  );

  app.route(
    "/albums",
    authedRouter()
      .get("/", async (c) => {
        const user = c.get("user");

        const photoRows = await db
          .select({
            albumId: photos.albumId,
            id: photos.id,
            originalKey: photos.r2OriginalKey,
            uploadedAt: photos.uploadedAt,
          })
          .from(photos)
          .where(eq(photos.userId, user.id));

        const countsByAlbum = new Map<string, { count: number; coverKey: string | null; coverUploadedAt: number }>();
        for (const p of photoRows) {
          if (!p.albumId) continue;
          const existing = countsByAlbum.get(p.albumId);
          if (!existing) {
            countsByAlbum.set(p.albumId, {
              count: 1,
              coverKey: p.originalKey,
              coverUploadedAt: p.uploadedAt,
            });
          } else {
            existing.count++;
            if (p.uploadedAt > existing.coverUploadedAt) {
              existing.coverKey = p.originalKey;
              existing.coverUploadedAt = p.uploadedAt;
            }
          }
        }

        const albumRows = await db.select().from(albums);
        const visible = albumRows
          .map((a) => {
            const info = countsByAlbum.get(a.id);
            if (!info) return null;
            return {
              id: a.id,
              name: a.name,
              year: a.year,
              month: a.month,
              locationDisplay: a.locationDisplay,
              photoCount: info.count,
              coverUrl: info.coverKey ? thumbnailUrl(info.coverKey) : null,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
          .sort((a, b) => {
            if (a.year !== b.year) return b.year - a.year;
            if (a.month !== b.month) return b.month - a.month;
            return a.name.localeCompare(b.name);
          });

        return c.json(visible);
      })
      .get("/:id", async (c) => {
        const user = c.get("user");
        const id = c.req.param("id");
        const album = await db
          .select()
          .from(albums)
          .where(eq(albums.id, id))
          .limit(1);
        if (!album[0]) return c.json({ error: "not found" }, 404);
        const albumPhotos = await db
          .select()
          .from(photos)
          .where(and(eq(photos.albumId, id), eq(photos.userId, user.id)))
          .orderBy(sql`${photos.takenAt} ASC, ${photos.uploadedAt} ASC`);
        return c.json({
          id: album[0].id,
          name: album[0].name,
          year: album[0].year,
          month: album[0].month,
          locationDisplay: album[0].locationDisplay,
          photos: albumPhotos.map((p) => ({
            id: p.id,
            originalUrl: viewUrl(p.r2OriginalKey),
            thumbnailUrl: thumbnailUrl(p.r2OriginalKey),
            takenAt: p.takenAt,
            width: p.width,
            height: p.height,
            uploadedAt: p.uploadedAt,
            locationDisplay: p.locationDisplay,
          })),
        });
      })
      .patch("/:id", async (c) => {
        const id = c.req.param("id");
        const body = await c.req.json().catch(() => null);
        if (
          !body ||
          typeof body !== "object" ||
          typeof (body as Record<string, unknown>).name !== "string"
        ) {
          return c.json({ error: "name required" }, 400);
        }
        await db
          .update(albums)
          .set({ name: (body as Record<string, string>).name.trim() })
          .where(eq(albums.id, id));
        return c.json({ ok: true });
      })
      .delete("/:id", async (c) => {
        const user = c.get("user");
        const id = c.req.param("id");
        const userPhotos = await db
          .select()
          .from(photos)
          .where(and(eq(photos.albumId, id), eq(photos.userId, user.id)));
        for (const p of userPhotos) {
          await deleteObject(p.r2OriginalKey).catch(() => undefined);
        }
        await db
          .delete(photos)
          .where(and(eq(photos.albumId, id), eq(photos.userId, user.id)));
        await maybeDeleteEmptyAlbum(id);
        return c.json({ ok: true });
      }),
  );

  app.route(
    "/share",
    authedRouter()
      .post("/", async (c) => {
        const user = c.get("user");
        const body = await c.req.json().catch(() => null);
        if (
          !body ||
          typeof (body as Record<string, unknown>).albumId !== "string"
        ) {
          return c.json({ error: "albumId required" }, 400);
        }
        const albumId = (body as Record<string, string>).albumId;
        const ttlDays =
          typeof (body as Record<string, unknown>).ttlDays === "number"
            ? ((body as Record<string, number>).ttlDays as number)
            : null;

        const owns = await db
          .select({ id: photos.id })
          .from(photos)
          .where(and(eq(photos.albumId, albumId), eq(photos.userId, user.id)))
          .limit(1);
        if (owns.length === 0) return c.json({ error: "album not found" }, 404);

        const id = randomBytes(16).toString("hex");
        const token = randomBytes(18).toString("base64url");
        const now = Math.floor(Date.now() / 1000);
        await db.insert(shareLinks).values({
          id,
          token,
          albumId,
          createdBy: user.id,
          createdAt: now,
          expiresAt: ttlDays ? now + ttlDays * 86400 : null,
        });
        return c.json({ id, token, albumId, expiresAt: ttlDays ? now + ttlDays * 86400 : null }, 201);
      })
      .get("/album/:albumId", async (c) => {
        const user = c.get("user");
        const albumId = c.req.param("albumId");
        const owns = await db
          .select({ id: photos.id })
          .from(photos)
          .where(and(eq(photos.albumId, albumId), eq(photos.userId, user.id)))
          .limit(1);
        if (owns.length === 0) return c.json({ error: "album not found" }, 404);
        const rows = await db
          .select()
          .from(shareLinks)
          .where(eq(shareLinks.albumId, albumId));
        return c.json(rows);
      })
      .delete("/:token", async (c) => {
        const user = c.get("user");
        const token = c.req.param("token");
        await db
          .delete(shareLinks)
          .where(and(eq(shareLinks.token, token), eq(shareLinks.createdBy, user.id)));
        return c.json({ ok: true });
      }),
  );

  app.route(
    "/photos",
    authedRouter()
      .get("/", async (c) => {
        const user = c.get("user");
        const rows = await db
          .select()
          .from(photos)
          .where(eq(photos.userId, user.id))
          .orderBy(sql`${photos.uploadedAt} DESC`);
        return c.json(
          rows.map((p) => ({
            id: p.id,
            originalUrl: viewUrl(p.r2OriginalKey),
            thumbnailUrl: thumbnailUrl(p.r2OriginalKey),
            takenAt: p.takenAt,
            width: p.width,
            height: p.height,
            uploadedAt: p.uploadedAt,
            locationDisplay: p.locationDisplay,
          })),
        );
      })
      .post("/upload-urls", async (c) => {
        c.get("user");
        const body = (await c.req.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        if (!body) return c.json({ error: "body required" }, 400);
        const fileName = String(body.fileName ?? "photo.jpg");
        const mimeType = String(body.mimeType ?? "image/jpeg");
        if (!mimeType.startsWith("image/")) {
          return c.json({ error: "image only" }, 400);
        }
        const lat = Number(body.latitude);
        const lon = Number(body.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          return c.json({ error: "location required" }, 400);
        }
        const ext = fileName.split(".").pop() ?? "jpg";
        const originalKey = newPhotoKey(ext);
        const originalUploadUrl = await presignPut(originalKey, mimeType, 600);
        return c.json({
          originalKey,
          originalUploadUrl,
        });
      })
      .post("/commit", async (c) => {
        const user = c.get("user");
        const body = (await c.req.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        if (!body) return c.json({ error: "body required" }, 400);

        const rawOriginalKey = typeof body.originalKey === "string" ? body.originalKey : null;
        let mimeType = typeof body.mimeType === "string" ? body.mimeType : null;
        let fileSize = typeof body.fileSize === "number" ? body.fileSize : null;
        const width = typeof body.width === "number" ? body.width : 0;
        const height = typeof body.height === "number" ? body.height : 0;
        const latitude = typeof body.latitude === "number" ? body.latitude : null;
        const longitude = typeof body.longitude === "number" ? body.longitude : null;
        let locationDisplay =
          typeof body.locationDisplay === "string" && body.locationDisplay.trim()
            ? (body.locationDisplay as string)
            : null;
        let locationName =
          typeof body.locationName === "string" && body.locationName.trim()
            ? (body.locationName as string)
            : null;
        let locationCountry =
          typeof body.locationCountry === "string" && body.locationCountry.trim()
            ? (body.locationCountry as string)
            : null;
        const takenAt =
          typeof body.takenAt === "number" ? body.takenAt : null;

        if (
          !rawOriginalKey ||
          !mimeType ||
          fileSize === null ||
          latitude === null ||
          longitude === null
        ) {
          return c.json({ error: "missing required fields" }, 400);
        }
        if (!rawOriginalKey.startsWith("originals/")) {
          return c.json({ error: "invalid key" }, 400);
        }

        if (!locationDisplay) {
          try {
            const rev = await reverseGeocode(latitude, longitude);
            if (rev) {
              locationDisplay = rev.display;
              locationName = locationName ?? rev.name;
              locationCountry = locationCountry ?? rev.countryCode;
            }
          } catch (err) {
            console.warn("reverse-geocode failed:", err);
          }
          if (!locationDisplay) {
            locationDisplay = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
          }
        }

        let originalKey = rawOriginalKey;
        const heifInfo = await inspectHeifBrand(originalKey);
        if (heifInfo.needsConversion) {
          try {
            const converted = await convertHeifToJpeg(originalKey, 95);
            originalKey = converted.newKey;
            mimeType = "image/jpeg";
            fileSize = converted.size;
            console.log(
              `Converted heix variant (${heifInfo.majorBrand}) -> jpeg: ${originalKey} (${converted.size} bytes)`,
            );
          } catch (err) {
            console.error("HEIF conversion failed:", err);
            return c.json(
              {
                error:
                  "This HEIF variant cannot be processed. Try exporting as JPEG from your camera or photo app.",
              },
              415,
            );
          }
        }

        const id = randomBytes(16).toString("hex");
        await db.insert(photos).values({
          id,
          userId: user.id,
          r2OriginalKey: originalKey,
          r2ThumbnailKey: originalKey,
          takenAt,
          latitude,
          longitude,
          locationName,
          locationDisplay,
          locationCountry,
          width,
          height,
          fileSize,
          mimeType,
          uploadedAt: Math.floor(Date.now() / 1000),
        });

        const inserted = await db
          .select()
          .from(photos)
          .where(eq(photos.id, id))
          .limit(1);
        const albumId = inserted[0]
          ? await assignPhotoToAlbum(inserted[0])
          : null;

        return c.json(
          {
            id,
            originalUrl: viewUrl(originalKey),
            thumbnailUrl: thumbnailUrl(originalKey),
            takenAt,
            width,
            height,
            locationDisplay,
            albumId,
          },
          201,
        );
      })
      .patch("/:id", async (c) => {
        const user = c.get("user");
        const id = c.req.param("id");
        const body = await c.req.json().catch(() => null);
        if (!body || typeof body !== "object")
          return c.json({ error: "body required" }, 400);

        const rows = await db
          .select()
          .from(photos)
          .where(eq(photos.id, id))
          .limit(1);
        const photo = rows[0];
        if (!photo || photo.userId !== user.id)
          return c.json({ error: "not found" }, 404);

        const updates: Partial<typeof photos.$inferInsert> = {};
        let needsReassign = false;
        const b = body as Record<string, unknown>;

        if ("takenAt" in b) {
          updates.takenAt =
            b.takenAt === null
              ? null
              : typeof b.takenAt === "number"
                ? b.takenAt
                : photo.takenAt;
          needsReassign = true;
        }
        if (
          typeof b.latitude === "number" &&
          typeof b.longitude === "number" &&
          typeof b.locationDisplay === "string"
        ) {
          updates.latitude = b.latitude;
          updates.longitude = b.longitude;
          updates.locationDisplay = b.locationDisplay;
          if (typeof b.locationName === "string")
            updates.locationName = b.locationName;
          if (typeof b.locationCountry === "string")
            updates.locationCountry = b.locationCountry;
          needsReassign = true;
        }

        if (Object.keys(updates).length === 0)
          return c.json({ error: "no fields to update" }, 400);

        await db.update(photos).set(updates).where(eq(photos.id, id));

        if (needsReassign) {
          const prevAlbumId = photo.albumId;
          const updated = await db
            .select()
            .from(photos)
            .where(eq(photos.id, id))
            .limit(1);
          await assignPhotoToAlbum(updated[0]!);
          if (prevAlbumId && prevAlbumId !== updated[0]!.albumId) {
            await maybeFixAlbumCover(prevAlbumId);
            await maybeDeleteEmptyAlbum(prevAlbumId);
          }
        }

        return c.json({ ok: true });
      })
      .post("/:id/move", async (c) => {
        const user = c.get("user");
        const id = c.req.param("id");
        const body = await c.req.json().catch(() => null);
        const targetAlbumId =
          body && typeof (body as Record<string, unknown>).albumId === "string"
            ? ((body as Record<string, string>).albumId as string)
            : null;
        if (!targetAlbumId) return c.json({ error: "albumId required" }, 400);

        const photoRows = await db
          .select()
          .from(photos)
          .where(eq(photos.id, id))
          .limit(1);
        const photo = photoRows[0];
        if (!photo || photo.userId !== user.id)
          return c.json({ error: "photo not found" }, 404);

        const targetAlbum = await db
          .select()
          .from(albums)
          .where(eq(albums.id, targetAlbumId))
          .limit(1);
        if (!targetAlbum[0]) return c.json({ error: "album not found" }, 404);

        const ownsTarget = await db
          .select({ id: photos.id })
          .from(photos)
          .where(and(eq(photos.albumId, targetAlbumId), eq(photos.userId, user.id)))
          .limit(1);
        if (ownsTarget.length === 0)
          return c.json({ error: "album not found" }, 404);

        const prevAlbumId = photo.albumId;
        if (prevAlbumId === targetAlbumId) return c.json({ ok: true });

        await db
          .update(photos)
          .set({ albumId: targetAlbumId })
          .where(eq(photos.id, id));

        if (prevAlbumId) {
          await maybeFixAlbumCover(prevAlbumId);
          await maybeDeleteEmptyAlbum(prevAlbumId);
        }
        return c.json({ ok: true });
      })
      .delete("/:id", async (c) => {
        const user = c.get("user");
        const id = c.req.param("id");
        const rows = await db
          .select()
          .from(photos)
          .where(eq(photos.id, id))
          .limit(1);
        const p = rows[0];
        if (!p || p.userId !== user.id) return c.json({ error: "not found" }, 404);
        await deleteObject(p.r2OriginalKey).catch(() => undefined);
        await db.delete(photos).where(eq(photos.id, id));
        if (p.albumId) {
          await maybeFixAlbumCover(p.albumId);
          await maybeDeleteEmptyAlbum(p.albumId);
        }
        return c.json({ ok: true });
      }),
  );

  return app;
}
