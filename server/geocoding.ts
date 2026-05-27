import { eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { geocodeCache } from "./db/schema.js";
import { env } from "./env.js";

export type GeocodeCandidate = {
  display: string;
  name: string;
  lat: number;
  lon: number;
  country: string | null;
  countryCode: string | null;
  placeId: number | string;
};

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL_MS = 1100;

let lastFetch = 0;
let chain: Promise<unknown> = Promise.resolve();

async function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastFetch);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastFetch = Date.now();
    return fn();
  });
  chain = run.catch(() => undefined);
  return run as Promise<T>;
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseRaw(raw: unknown): GeocodeCandidate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: unknown) => {
      if (typeof r !== "object" || r === null) return null;
      const obj = r as Record<string, unknown>;
      const lat = Number(obj["lat"]);
      const lon = Number(obj["lon"]);
      const display = typeof obj["display_name"] === "string" ? obj["display_name"] : null;
      const placeId = (obj["place_id"] as number | string) ?? "";
      const addr = obj["address"] as Record<string, unknown> | undefined;
      const country = typeof addr?.["country"] === "string" ? (addr["country"] as string) : null;
      const countryCode =
        typeof addr?.["country_code"] === "string"
          ? (addr["country_code"] as string).toUpperCase()
          : null;
      const name =
        typeof addr?.["city"] === "string"
          ? (addr["city"] as string)
          : typeof addr?.["town"] === "string"
            ? (addr["town"] as string)
            : typeof addr?.["village"] === "string"
              ? (addr["village"] as string)
              : typeof addr?.["state"] === "string"
                ? (addr["state"] as string)
                : (display?.split(",")[0]?.trim() ?? "");
      if (!display || Number.isNaN(lat) || Number.isNaN(lon)) return null;
      return { display, name, lat, lon, country, countryCode, placeId };
    })
    .filter((c): c is GeocodeCandidate => c !== null);
}

export async function geocode(q: string): Promise<GeocodeCandidate[]> {
  const query = normalizeQuery(q);
  if (!query) return [];

  const cached = await db
    .select()
    .from(geocodeCache)
    .where(eq(geocodeCache.query, query))
    .limit(1);
  if (cached[0]) {
    try {
      return parseRaw(JSON.parse(cached[0].response));
    } catch {
      /* cache row is corrupt; fall through to refetch */
    }
  }

  const raw = await rateLimited(async () => {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "5");
    const res = await fetch(url, {
      headers: {
        "User-Agent": env.NOMINATIM_USER_AGENT,
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    return res.json();
  });

  await db
    .insert(geocodeCache)
    .values({
      query,
      response: JSON.stringify(raw),
      fetchedAt: Math.floor(Date.now() / 1000),
    })
    .onConflictDoUpdate({
      target: geocodeCache.query,
      set: {
        response: JSON.stringify(raw),
        fetchedAt: Math.floor(Date.now() / 1000),
      },
    });

  return parseRaw(raw);
}

const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";

export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<GeocodeCandidate | null> {
  const cacheKey = `__rev__:${lat.toFixed(4)}:${lon.toFixed(4)}`;
  const cached = await db
    .select()
    .from(geocodeCache)
    .where(eq(geocodeCache.query, cacheKey))
    .limit(1);
  if (cached[0]) {
    try {
      const parsed = JSON.parse(cached[0].response);
      const arr = parseRaw([parsed]);
      return arr[0] ?? null;
    } catch {
      /* corrupt cache row, refetch */
    }
  }

  const raw = await rateLimited(async () => {
    const url = new URL(NOMINATIM_REVERSE_URL);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("zoom", "12");
    const res = await fetch(url, {
      headers: {
        "User-Agent": env.NOMINATIM_USER_AGENT,
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`nominatim reverse ${res.status}`);
    return res.json();
  });

  await db
    .insert(geocodeCache)
    .values({
      query: cacheKey,
      response: JSON.stringify(raw),
      fetchedAt: Math.floor(Date.now() / 1000),
    })
    .onConflictDoUpdate({
      target: geocodeCache.query,
      set: {
        response: JSON.stringify(raw),
        fetchedAt: Math.floor(Date.now() / 1000),
      },
    });

  const parsed = parseRaw([raw]);
  return parsed[0] ?? null;
}
