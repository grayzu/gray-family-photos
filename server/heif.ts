import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { env } from "./env.js";
import { newPhotoKey } from "./storage.js";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const CF_UNSUPPORTED_BRANDS = new Set([
  "heix",
  "msf1",
  "hevx",
  "hevs",
  "mif2",
]);

export type HeifInspect = {
  isHeif: boolean;
  majorBrand: string | null;
  compatibleBrands: string[];
  needsConversion: boolean;
};

export async function inspectHeifBrand(key: string): Promise<HeifInspect> {
  let bytes: Buffer;
  try {
    const got = await s3.send(
      new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Range: "bytes=0-63" }),
    );
    const chunks: Uint8Array[] = [];
    for await (const c of got.Body as AsyncIterable<Uint8Array>) chunks.push(c);
    bytes = Buffer.concat(chunks);
  } catch {
    return { isHeif: false, majorBrand: null, compatibleBrands: [], needsConversion: false };
  }

  if (bytes.length < 16) {
    return { isHeif: false, majorBrand: null, compatibleBrands: [], needsConversion: false };
  }
  if (bytes.subarray(4, 8).toString("ascii") !== "ftyp") {
    return { isHeif: false, majorBrand: null, compatibleBrands: [], needsConversion: false };
  }

  const majorBrand = bytes.subarray(8, 12).toString("ascii");
  const boxSize = bytes.readUInt32BE(0);
  const ftypEnd = Math.min(boxSize, bytes.length);
  const compatibleBrands: string[] = [];
  for (let i = 16; i + 4 <= ftypEnd; i += 4) {
    compatibleBrands.push(bytes.subarray(i, i + 4).toString("ascii"));
  }

  const heifMarkers = new Set(["heic", "heix", "msf1", "mif1", "mif2", "miaf", "avif", "hevc", "hevx"]);
  const isHeif =
    heifMarkers.has(majorBrand) ||
    compatibleBrands.some((b) => heifMarkers.has(b));

  const needsConversion =
    isHeif &&
    (CF_UNSUPPORTED_BRANDS.has(majorBrand) ||
      compatibleBrands.some((b) => CF_UNSUPPORTED_BRANDS.has(b))) &&
    !(majorBrand === "heic" || compatibleBrands.includes("heic"));

  return { isHeif, majorBrand, compatibleBrands, needsConversion };
}

export async function convertHeifToJpeg(
  sourceKey: string,
  quality = 95,
): Promise<{ newKey: string; size: number }> {
  const got = await s3.send(
    new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: sourceKey }),
  );
  const chunks: Uint8Array[] = [];
  for await (const c of got.Body as AsyncIterable<Uint8Array>) chunks.push(c);
  const inputBuffer = Buffer.concat(chunks);

  const { default: convert } = await import("heic-convert");
  const jpegBuffer = (await convert({
    buffer: inputBuffer,
    format: "JPEG",
    quality: quality / 100,
  })) as Uint8Array;

  const newKey = newPhotoKey("jpg");
  await s3.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: newKey,
      Body: Buffer.from(jpegBuffer),
      ContentType: "image/jpeg",
    }),
  );

  await s3
    .send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: sourceKey }))
    .catch(() => undefined);

  return { newKey, size: jpegBuffer.byteLength };
}

export async function r2HeadSize(key: string): Promise<number | null> {
  try {
    const h = await s3.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
    return h.ContentLength ?? null;
  } catch {
    return null;
  }
}
