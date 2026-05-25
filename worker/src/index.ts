/// <reference path="./types.d.ts" />
// @ts-ignore - libheif-js/wasm-bundle has no types; declared in types.d.ts
import libheif from "libheif-js/wasm-bundle";
import { encode as encodeJpeg } from "@jsquash/jpeg";
import resize from "@jsquash/resize";

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

function withCacheHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  out.headers.set("Vary", "Accept");
  return out;
}

async function tryCloudflareImage(
  r2Url: string,
  params: TransformParams,
): Promise<Response | null> {
  const cfImage: Record<string, unknown> = {};
  if (params.width) cfImage.width = params.width;
  if (params.height) cfImage.height = params.height;
  if (params.fit) cfImage.fit = params.fit;
  if (params.quality) cfImage.quality = params.quality;
  if (params.format && params.format !== "auto") cfImage.format = params.format;

  const res = await fetch(r2Url, { cf: { image: cfImage } } as RequestInit);
  if (res.status !== 200) return null;

  const resized = res.headers.get("cf-resized") ?? "";
  if (resized.startsWith("err=")) return null;

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.startsWith("image/")) return null;

  return res;
}

function targetDimensions(
  srcW: number,
  srcH: number,
  params: TransformParams,
): { width: number; height: number } {
  const w = params.width;
  const h = params.height;
  const fit: Fit = params.fit ?? "scale-down";

  if (!w && !h) return { width: srcW, height: srcH };

  if (fit === "scale-down") {
    const scale = Math.min(
      w ? w / srcW : 1,
      h ? h / srcH : 1,
      1,
    );
    return {
      width: Math.max(1, Math.round(srcW * scale)),
      height: Math.max(1, Math.round(srcH * scale)),
    };
  }
  if (fit === "contain") {
    const scale = Math.min(
      w ? w / srcW : Number.POSITIVE_INFINITY,
      h ? h / srcH : Number.POSITIVE_INFINITY,
    );
    return {
      width: Math.max(1, Math.round(srcW * scale)),
      height: Math.max(1, Math.round(srcH * scale)),
    };
  }
  const scale = Math.max(
    w ? w / srcW : 0,
    h ? h / srcH : 0,
  );
  return {
    width: w ?? Math.max(1, Math.round(srcW * scale)),
    height: h ?? Math.max(1, Math.round(srcH * scale)),
  };
}

async function decodeHeifToImageData(bytes: ArrayBuffer): Promise<ImageData> {
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(new Uint8Array(bytes));
  if (!images || images.length === 0) {
    throw new Error("HEIF decode returned no images");
  }
  const image = images[0];
  const width = image.get_width();
  const height = image.get_height();
  const rgba = new Uint8ClampedArray(width * height * 4);
  await new Promise<void>((resolve, reject) => {
    image.display({ data: rgba, width, height }, (display: unknown) => {
      if (!display) reject(new Error("HEIF display callback returned null"));
      else resolve();
    });
  });
  return { data: rgba, width, height, colorSpace: "srgb" } as ImageData;
}

async function wasmDecodeAndResize(
  r2Url: string,
  params: TransformParams,
): Promise<Response> {
  const raw = await fetch(r2Url);
  if (!raw.ok) {
    return new Response(`source fetch failed: ${raw.status}`, { status: 502 });
  }
  const bytes = await raw.arrayBuffer();

  let img: ImageData;
  try {
    img = await decodeHeifToImageData(bytes);
  } catch (e) {
    return new Response(`decode failed: ${(e as Error).message}`, {
      status: 500,
    });
  }

  const target = targetDimensions(img.width, img.height, params);
  let resized: ImageData = img;
  if (target.width !== img.width || target.height !== img.height) {
    resized = await resize(img, {
      width: target.width,
      height: target.height,
      method: "lanczos3",
    });
  }

  const jpegBuffer = await encodeJpeg(resized, {
    quality: params.quality ?? 85,
  });

  return new Response(jpegBuffer, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(jpegBuffer.byteLength),
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/img\/([^/]+)\/(.+)$/);
    if (!match) return new Response("Not found", { status: 404 });

    const paramStr = match[1]!;
    const key = match[2]!;
    const params = parseParams(paramStr);

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), {
      headers: { Accept: request.headers.get("Accept") ?? "" },
    });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const r2Url = `${env.R2_PUBLIC_BASE_URL}/${key}`;

    const cfRes = await tryCloudflareImage(r2Url, params);
    if (cfRes) {
      const out = withCacheHeaders(cfRes);
      ctx.waitUntil(cache.put(cacheKey, out.clone()));
      return out;
    }

    const wasmRes = await wasmDecodeAndResize(r2Url, params);
    if (wasmRes.ok) {
      const out = withCacheHeaders(wasmRes);
      ctx.waitUntil(cache.put(cacheKey, out.clone()));
      return out;
    }
    return wasmRes;
  },
};
