import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "node:crypto";
import { env } from "./env.js";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

export function newPhotoKey(ext: string): string {
  const id = randomBytes(16).toString("hex");
  const cleanExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `originals/${id}.${cleanExt}`;
}

export function publicUrl(key: string, transform?: string): string {
  const base = env.R2_PUBLIC_BASE_URL;
  if (transform) return `${base}/cdn-cgi/image/${transform}/${key}`;
  return `${base}/${key}`;
}

export function thumbnailUrl(key: string): string {
  return publicUrl(key, "width=800,format=auto,fit=cover");
}

export function viewUrl(key: string): string {
  return publicUrl(key, "format=auto");
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
