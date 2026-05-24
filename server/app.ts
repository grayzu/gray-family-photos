import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "./db/client.js";
import { users, allowedEmails, photos } from "./db/schema.js";
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
  uploadOriginal,
  generateAndUploadThumbnail,
  imageDimensions,
  publicUrl,
  deleteObject,
} from "./storage.js";
import exifr from "exifr";
import { geocode } from "./geocoding.js";

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
  const authed = new Hono<{ Variables: Variables }>().use(async (c, next) => {
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
    authed
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
    "/photos",
    authed
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
            originalUrl: publicUrl(p.r2OriginalKey),
            thumbnailUrl: publicUrl(p.r2ThumbnailKey),
            takenAt: p.takenAt,
            width: p.width,
            height: p.height,
            uploadedAt: p.uploadedAt,
            locationDisplay: p.locationDisplay,
          })),
        );
      })
      .post("/upload", async (c) => {
        const user = c.get("user");
        const form = await c.req.formData();
        const file = form.get("file");
        if (!(file instanceof File)) return c.json({ error: "file required" }, 400);
        if (!file.type.startsWith("image/"))
          return c.json({ error: "image only" }, 400);

        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = file.name.split(".").pop() ?? "jpg";
        const { originalKey, thumbnailKey } = newPhotoKey(ext);

        let takenAt: number | null = null;
        let latitude: number | null = null;
        let longitude: number | null = null;
        let locationName: string | null = null;
        let locationDisplay: string | null = null;
        let locationCountry: string | null = null;
        try {
          const ex = await exifr.parse(buffer, { gps: true });
          if (ex?.DateTimeOriginal instanceof Date) {
            takenAt = Math.floor(ex.DateTimeOriginal.getTime() / 1000);
          }
          if (
            typeof ex?.latitude === "number" &&
            typeof ex?.longitude === "number"
          ) {
            latitude = ex.latitude;
            longitude = ex.longitude;
          }
        } catch {
          /* EXIF parse is best-effort; corrupt EXIF must not block upload */
        }

        const fLat = form.get("latitude");
        const fLon = form.get("longitude");
        const fDisplay = form.get("locationDisplay");
        const fName = form.get("locationName");
        const fCountry = form.get("locationCountry");
        if (typeof fLat === "string" && typeof fLon === "string" && typeof fDisplay === "string") {
          const overrideLat = Number(fLat);
          const overrideLon = Number(fLon);
          if (Number.isFinite(overrideLat) && Number.isFinite(overrideLon)) {
            latitude = overrideLat;
            longitude = overrideLon;
            locationDisplay = fDisplay;
            locationName = typeof fName === "string" && fName ? fName : null;
            locationCountry =
              typeof fCountry === "string" && fCountry ? fCountry : null;
          }
        }

        if (latitude === null || longitude === null) {
          return c.json({ error: "location required" }, 400);
        }

        const { width, height } = await imageDimensions(buffer);
        await uploadOriginal(originalKey, buffer, file.type);
        await generateAndUploadThumbnail(buffer, thumbnailKey);

        const id = randomBytes(16).toString("hex");
        await db.insert(photos).values({
          id,
          userId: user.id,
          r2OriginalKey: originalKey,
          r2ThumbnailKey: thumbnailKey,
          takenAt,
          latitude,
          longitude,
          locationName,
          locationDisplay,
          locationCountry,
          width,
          height,
          fileSize: buffer.length,
          mimeType: file.type,
          uploadedAt: Math.floor(Date.now() / 1000),
        });

        return c.json(
          {
            id,
            originalUrl: publicUrl(originalKey),
            thumbnailUrl: publicUrl(thumbnailKey),
            takenAt,
            width,
            height,
            locationDisplay,
          },
          201,
        );
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
        await Promise.allSettled([
          deleteObject(p.r2OriginalKey),
          deleteObject(p.r2ThumbnailKey),
        ]);
        await db.delete(photos).where(eq(photos.id, id));
        return c.json({ ok: true });
      }),
  );

  return app;
}
