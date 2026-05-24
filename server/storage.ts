import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { env } from "./env.js";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const THUMB_MAX_DIM = 800;
const THUMB_QUALITY = 80;

export function newPhotoKey(ext: string): { originalKey: string; thumbnailKey: string } {
  const id = randomBytes(16).toString("hex");
  const cleanExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return {
    originalKey: `originals/${id}.${cleanExt}`,
    thumbnailKey: `thumbnails/${id}.jpg`,
  };
}

export function publicUrl(key: string): string {
  return `${env.R2_PUBLIC_BASE_URL}/${key}`;
}

export async function uploadOriginal(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
) {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function generateAndUploadThumbnail(
  originalBuffer: Buffer,
  thumbnailKey: string,
) {
  const thumb = await sharp(originalBuffer)
    .rotate()
    .resize(THUMB_MAX_DIM, THUMB_MAX_DIM, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: THUMB_QUALITY })
    .toBuffer();
  await s3.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: thumbnailKey,
      Body: thumb,
      ContentType: "image/jpeg",
    }),
  );
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}

export async function presignPut(key: string, contentType: string, ttlSec = 300) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: ttlSec },
  );
}

export async function readObject(key: string): Promise<Buffer> {
  const out = await s3.send(
    new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
  );
  const chunks: Uint8Array[] = [];
  for await (const chunk of out.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function imageDimensions(buf: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(buf).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}
