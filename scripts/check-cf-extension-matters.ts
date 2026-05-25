import {
  S3Client,
  CopyObjectCommand,
  DeleteObjectCommand,
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

const source = "originals/3373c5b789564b3fa44f2cb156f5f8e5.hif";

const variants = [
  { key: "_health/cors-test-rename.heic", ct: "image/heic" },
  { key: "_health/cors-test-rename.heif", ct: "image/heif" },
  { key: "_health/cors-test-rename.jpg", ct: "image/jpeg" },
];

for (const v of variants) {
  console.log(`\n--- Copy as ${v.key} (Content-Type: ${v.ct}) ---`);
  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: v.key,
      CopySource: `${bucket}/${source}`,
      ContentType: v.ct,
      MetadataDirective: "REPLACE",
    }),
  );

  const transformUrl = `${publicBase}/cdn-cgi/image/width=800,format=auto/${v.key}`;
  const res = await fetch(transformUrl, {
    headers: { Accept: "image/avif,image/webp,image/*,*/*" },
  });
  console.log(`  GET ${transformUrl}`);
  console.log(
    `    HTTP ${res.status} | ct: ${res.headers.get("content-type")} | size: ${res.headers.get("content-length")} | cf-resized: ${res.headers.get("cf-resized") ?? "(none)"}`,
  );
  if (!res.ok) {
    const body = await res.text();
    console.log(`    body: ${body.slice(0, 200)}`);
  }
}

console.log("\n--- Cleanup ---");
for (const v of variants) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: v.key }));
}
console.log("Done.");
