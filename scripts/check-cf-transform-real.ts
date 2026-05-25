import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

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

console.log("1. Listing recent originals in R2...\n");
const list = await s3.send(
  new ListObjectsV2Command({ Bucket: bucket, Prefix: "originals/", MaxKeys: 20 }),
);
const objects = (list.Contents ?? []).sort(
  (a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0),
);
for (const o of objects) {
  console.log(
    `  ${o.Key} (${((o.Size ?? 0) / 1024 / 1024).toFixed(2)} MB, ${o.LastModified?.toISOString()})`,
  );
}

if (objects.length === 0) {
  console.log("\nNo originals found. Upload first.");
  process.exit(0);
}

const target = objects[0]!;
const key = target.Key!;
console.log(`\n2. Testing CF transforms on most recent: ${key}\n`);

const tests = [
  { label: "raw original (no transform)", url: `${publicBase}/${key}` },
  { label: "format=auto", url: `${publicBase}/cdn-cgi/image/format=auto/${key}` },
  {
    label: "thumbnail (width=800,format=auto,fit=cover)",
    url: `${publicBase}/cdn-cgi/image/width=800,format=auto,fit=cover/${key}`,
  },
  {
    label: "format=jpeg width=800",
    url: `${publicBase}/cdn-cgi/image/width=800,format=jpeg/${key}`,
  },
];

for (const t of tests) {
  console.log(`  ${t.label}:`);
  console.log(`    ${t.url}`);
  try {
    const res = await fetch(t.url, {
      headers: { Accept: "image/avif,image/webp,image/*,*/*" },
    });
    console.log(
      `    HTTP ${res.status} | content-type: ${res.headers.get("content-type") ?? "(none)"} | size: ${res.headers.get("content-length") ?? "?"} | cf-resized: ${res.headers.get("cf-resized") ?? "(none)"}`,
    );
    if (!res.ok) {
      const body = await res.text();
      console.log(`    body (first 500 chars): ${body.slice(0, 500)}`);
    }
  } catch (e) {
    console.log(`    fetch error: ${(e as Error).message}`);
  }
  console.log();
}
