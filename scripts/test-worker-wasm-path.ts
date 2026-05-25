import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { readFileSync, writeFileSync } from "node:fs";

const accountId = process.env.R2_ACCOUNT_ID!;
const bucket = process.env.R2_BUCKET!;
const publicBase = process.env.R2_PUBLIC_BASE_URL!;
const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

const s3 = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const key = "_health/wasm-test.heic";
const bytes = readFileSync("/tmp/sample.heic");

console.log(`1. Upload ${bytes.length}-byte HEIC to R2 as ${key}`);
await s3.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: bytes,
    ContentType: "image/heic",
  }),
);
console.log("   OK\n");

const tests = [
  {
    label: "via CF fast path (default)",
    url: `${publicBase}/img/width=800,format=auto,fit=scale-down/${key}`,
  },
  {
    label: "FORCED WASM path (?nocf=1)",
    url: `${publicBase}/img/width=800,format=auto,fit=scale-down/${key}?nocf=1`,
  },
];

for (const t of tests) {
  console.log(t.label);
  console.log(`  ${t.url}`);
  const t0 = Date.now();
  const res = await fetch(t.url, {
    headers: { Accept: "image/avif,image/webp,image/*,*/*" },
  });
  const elapsed = Date.now() - t0;
  console.log(
    `  HTTP ${res.status} | ct: ${res.headers.get("content-type")} | size: ${res.headers.get("content-length")} | took ${elapsed}ms`,
  );
  console.log(`  cf-resized: ${res.headers.get("cf-resized") ?? "(none = WASM path)"}`);
  if (res.ok) {
    const buf = await res.arrayBuffer();
    const sig = new Uint8Array(buf.slice(0, 4));
    const hex = Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join(" ");
    const isJpeg = sig[0] === 0xff && sig[1] === 0xd8;
    const isWebp = sig[0] === 0x52 && sig[1] === 0x49;
    const isAvif = buf.byteLength > 12 && new TextDecoder().decode(new Uint8Array(buf, 4, 8)).includes("ftyp");
    console.log(
      `  body magic: ${hex} (${isJpeg ? "JPEG ✓" : isWebp ? "WebP ✓" : isAvif ? "AVIF ✓" : "?"}) - ${buf.byteLength} bytes`,
    );
    if (isJpeg) {
      writeFileSync(`/tmp/worker-output-${t.label.includes("WASM") ? "wasm" : "cf"}.jpg`, Buffer.from(buf));
      console.log(`  saved -> /tmp/worker-output-${t.label.includes("WASM") ? "wasm" : "cf"}.jpg`);
    }
  } else {
    console.log(`  body: ${(await res.text()).slice(0, 200)}`);
  }
  console.log();
}

console.log("Cleanup");
await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
console.log("  OK");
