export interface Env {
  R2_PUBLIC_BASE_URL: string;
}

type Fit = "cover" | "contain" | "scale-down";

interface TransformParams {
  width?: number;
  height?: number;
  format?: "auto" | "jpeg" | "webp" | "avif" | "png";
  fit?: Fit;
  quality?: number;
}

function parseParams(raw: string): TransformParams {
  const out: TransformParams = {};
  for (const pair of raw.split(",")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (!k || !v) continue;
    if (k === "width" || k === "height" || k === "quality") {
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n) && n > 0) out[k] = n;
    } else if (k === "format" && ["auto", "jpeg", "webp", "avif", "png"].includes(v)) {
      out.format = v as TransformParams["format"];
    } else if (k === "fit" && ["cover", "contain", "scale-down"].includes(v)) {
      out.fit = v as Fit;
    }
  }
  return out;
}

function withCacheHeaders(res: Response, maxAge = 31536000): Response {
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", `public, max-age=${maxAge}, immutable`);
  out.headers.set("Vary", "Accept");
  return out;
}

const UNSUPPORTED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <rect width="400" height="400" fill="#1e2a24"/>
  <g fill="#8da99c" font-family="sans-serif" text-anchor="middle">
    <text x="200" y="180" font-size="20">Unsupported format</text>
    <text x="200" y="210" font-size="14" fill="#fb7185">iPhone Live Photo / Portrait Mode</text>
    <text x="200" y="240" font-size="12">Set Camera \u2192 Formats \u2192 Most Compatible</text>
  </g>
</svg>`;

function unsupportedResponse(reason: string): Response {
  return new Response(UNSUPPORTED_SVG, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
      "X-Image-Unsupported": "true",
      "X-CF-Reason": reason,
    },
  });
}

async function tryCloudflareImage(
  r2Url: string,
  params: TransformParams,
): Promise<
  { ok: true; res: Response } | { ok: false; status: number; reason: string }
> {
  const cfImage: Record<string, unknown> = {};
  if (params.width) cfImage.width = params.width;
  if (params.height) cfImage.height = params.height;
  if (params.fit) cfImage.fit = params.fit;
  if (params.quality) cfImage.quality = params.quality;
  if (params.format && params.format !== "auto") cfImage.format = params.format;

  const res = await fetch(r2Url, { cf: { image: cfImage } } as RequestInit);
  if (res.status !== 200) {
    return { ok: false, status: res.status, reason: `HTTP ${res.status}` };
  }
  const resized = res.headers.get("cf-resized") ?? "";
  if (resized.startsWith("err=")) {
    return { ok: false, status: 415, reason: resized };
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.startsWith("image/")) {
    return { ok: false, status: 415, reason: `content-type: ${ct}` };
  }
  return { ok: true, res };
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/img\/([^/]+)\/(.+)$/);
    if (!match) return new Response("Not found", { status: 404 });

    const paramStr = match[1]!;
    const key = match[2]!;
    const params = parseParams(paramStr);

    const cache = (caches as unknown as { default: Cache }).default;
    const cacheKey = new Request(url.toString(), {
      headers: { Accept: request.headers.get("Accept") ?? "" },
    });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const r2Url = `${env.R2_PUBLIC_BASE_URL}/${key}`;
    const cfResult = await tryCloudflareImage(r2Url, params);

    if (cfResult.ok) {
      const out = withCacheHeaders(cfResult.res);
      ctx.waitUntil(cache.put(cacheKey, out.clone()));
      return out;
    }

    const placeholder = unsupportedResponse(cfResult.reason);
    ctx.waitUntil(cache.put(cacheKey, placeholder.clone()));
    return placeholder;
  },
};
