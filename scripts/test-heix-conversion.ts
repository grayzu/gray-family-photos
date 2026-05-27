import { readFileSync, writeFileSync } from "node:fs";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { inspectHeifBrand, convertHeifToJpeg } from "../server/heif.js";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});
const bucket = process.env.R2_BUCKET!;

function findHeix(): Buffer | null {
  for (const path of ["/tmp/test-heix.hif", "/tmp/sample.hif"]) {
    try {
      return readFileSync(path);
    } catch {}
  }
  return null;
}

const local = findHeix();
let testKey: string;

if (local) {
  testKey = "_health/conv-test-local.hif";
  console.log(`Using local file (${local.length} bytes)`);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: testKey,
      Body: local,
      ContentType: "image/heif",
    }),
  );
} else {
  console.log("No local heix file; pulling the user's existing one from R2...");
  testKey = "originals/ce744c40765e0d6d936b9262eb2cd954.hif";
  const head = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: testKey, Range: "bytes=0-15" })).catch(() => null);
  if (!head) {
    console.log("User's heix file is gone too. Upload one first.");
    process.exit(0);
  }
  console.log(`Found existing in R2: ${testKey}`);
}

console.log("\n1. Inspecting brand...");
const info = await inspectHeifBrand(testKey);
console.log(`  isHeif: ${info.isHeif}`);
console.log(`  majorBrand: ${info.majorBrand}`);
console.log(`  compatibleBrands: ${info.compatibleBrands.join(", ")}`);
console.log(`  needsConversion: ${info.needsConversion}`);

if (!info.needsConversion) {
  console.log("\nNot a brand that needs conversion. Stopping.");
  if (local) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
  process.exit(0);
}

console.log("\n2. Converting heix -> jpeg...");
const t0 = Date.now();
try {
  const result = await convertHeifToJpeg(testKey, 95);
  const elapsed = Date.now() - t0;
  console.log(`  newKey: ${result.newKey}`);
  console.log(`  size: ${result.size} bytes (${(result.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  elapsed: ${elapsed}ms`);

  console.log("\n3. Verify converted JPEG renders via CF transforms...");
  const url = `${process.env.R2_PUBLIC_BASE_URL}/img/width=800,format=auto,fit=scale-down/${result.newKey}`;
  console.log(`  ${url}`);
  const res = await fetch(url, { headers: { Accept: "image/avif,image/webp,image/*,*/*" }});
  console.log(`  HTTP ${res.status} | ct: ${res.headers.get("content-type")} | size: ${res.headers.get("content-length")}`);
  console.log(`  cf-resized: ${res.headers.get("cf-resized") ?? "(none)"}`);

  const fullBuf = await res.arrayBuffer();
  if (res.ok && fullBuf.byteLength > 1000) {
    writeFileSync("/tmp/converted-thumb.bin", Buffer.from(fullBuf));
    console.log(`  saved -> /tmp/converted-thumb.bin (${fullBuf.byteLength} bytes)`);
  }

  console.log("\n4. Cleanup...");
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: result.newKey }));
  console.log("  OK");
} catch (e) {
  console.log(`  FAILED: ${(e as Error).message}`);
  if (e instanceof Error) console.log(e.stack);
}
