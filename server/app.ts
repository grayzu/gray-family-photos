import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "./db/client.js";
import { users, invites, photos } from "./db/schema.js";
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  createSession,
  validateSessionToken,
  invalidateSession,
  readSessionCookie,
  setSessionCookieHeader,
  clearSessionCookieHeader,
} from "./auth.js";
import {
  newPhotoKey,
  uploadOriginal,
  generateAndUploadThumbnail,
  imageDimensions,
  publicUrl,
  deleteObject,
} from "./storage.js";
import exifr from "exifr";

export function buildApp() {
  const app = new Hono().basePath("/api");

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

  app.post("/auth/signup", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (
      !body ||
      typeof body.email !== "string" ||
      typeof body.password !== "string" ||
      typeof body.name !== "string"
    ) {
      return c.json({ error: "email, password, name required" }, 400);
    }
    const email = body.email.trim().toLowerCase();
    const password = body.password;
    const name = body.name.trim();
    if (password.length < 8)
      return c.json({ error: "password must be >=8 chars" }, 400);

    const countRow = await db.select({ n: sql<number>`count(*)` }).from(users);
    const userCount = Number(countRow[0]?.n ?? 0);
    const isBootstrap = userCount === 0;

    let inviteRow: typeof invites.$inferSelect | undefined;
    if (!isBootstrap) {
      const token: string | undefined = body.invite;
      if (!token || typeof token !== "string") {
        return c.json({ error: "invite token required" }, 403);
      }
      const rows = await db
        .select()
        .from(invites)
        .where(eq(invites.token, token))
        .limit(1);
      inviteRow = rows[0];
      if (!inviteRow) return c.json({ error: "invalid invite" }, 403);
      if (inviteRow.usedAt) return c.json({ error: "invite already used" }, 403);
      if (inviteRow.expiresAt < Math.floor(Date.now() / 1000)) {
        return c.json({ error: "invite expired" }, 403);
      }
    }

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing.length)
      return c.json({ error: "email already registered" }, 409);

    const id = randomBytes(16).toString("hex");
    await db.insert(users).values({
      id,
      email,
      name,
      passwordHash: hashPassword(password),
      isAdmin: isBootstrap,
      createdAt: Math.floor(Date.now() / 1000),
    });
    if (inviteRow) {
      await db
        .update(invites)
        .set({ usedAt: Math.floor(Date.now() / 1000) })
        .where(eq(invites.id, inviteRow.id));
    }

    const sessToken = generateSessionToken();
    const sess = await createSession(sessToken, id);
    c.header("Set-Cookie", setSessionCookieHeader(sessToken, sess.expiresAt));
    return c.json({ id, email, name, isAdmin: isBootstrap }, 201);
  });

  app.post("/auth/login", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (
      !body ||
      typeof body.email !== "string" ||
      typeof body.password !== "string"
    ) {
      return c.json({ error: "email and password required" }, 400);
    }
    const email = body.email.trim().toLowerCase();
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const user = rows[0];
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      return c.json({ error: "invalid credentials" }, 401);
    }
    const token = generateSessionToken();
    const sess = await createSession(token, user.id);
    c.header("Set-Cookie", setSessionCookieHeader(token, sess.expiresAt));
    return c.json({
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
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
    "/invites",
    authed.post("/", async (c) => {
      const user = c.get("user");
      if (!user.isAdmin) return c.json({ error: "admin only" }, 403);
      const body = await c.req.json().catch(() => ({}));
      const email =
        typeof body?.email === "string" ? body.email.trim().toLowerCase() : null;
      const ttlDays = typeof body?.ttlDays === "number" ? body.ttlDays : 7;
      const id = randomBytes(16).toString("hex");
      const token = randomBytes(24).toString("base64url");
      const now = Math.floor(Date.now() / 1000);
      await db.insert(invites).values({
        id,
        token,
        email,
        createdBy: user.id,
        usedAt: null,
        createdAt: now,
        expiresAt: now + ttlDays * 86400,
      });
      return c.json(
        { id, token, email, expiresAt: now + ttlDays * 86400 },
        201,
      );
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
          locationName: null,
          locationDisplay: null,
          locationCountry: null,
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
