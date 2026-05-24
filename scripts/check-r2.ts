import "dotenv/config";
import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const required = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("Missing env vars:", missing);
  process.exit(1);
}

const accountId = process.env.R2_ACCOUNT_ID!;
const bucket = process.env.R2_BUCKET!;
const publicBase = process.env.R2_PUBLIC_BASE_URL!;
const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

console.log(`Endpoint: ${endpoint}`);
console.log(`Bucket:   ${bucket}`);
console.log(`Public:   ${publicBase}\n`);

const s3 = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const testKey = `_health/test-${Date.now()}.txt`;
const testBody = "hello from gray-family-photos";

try {
  console.log("1. HEAD bucket (verify access)...");
  await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log("   OK\n");

  console.log("2. LIST objects (verify read)...");
  const list = await s3.send(
    new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 3 }),
  );
  console.log(`   OK, ${list.KeyCount ?? 0} object(s) currently in bucket\n`);

  console.log(`3. PUT object ${testKey} (verify write)...`);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: testKey,
      Body: testBody,
      ContentType: "text/plain",
    }),
  );
  console.log("   OK\n");

  console.log("4. GET object (verify read of just-written)...");
  const got = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: testKey }),
  );
  const body = await got.Body!.transformToString();
  if (body !== testBody) throw new Error(`Body mismatch: got "${body}"`);
  console.log("   OK\n");

  console.log("5. Public URL fetch (verify public bucket + custom domain)...");
  const publicUrl = `${publicBase.replace(/\/$/, "")}/${testKey}`;
  console.log(`   URL: ${publicUrl}`);
  const res = await fetch(publicUrl);
  if (res.ok) {
    const text = await res.text();
    if (text === testBody) {
      console.log(`   OK (HTTP ${res.status})\n`);
    } else {
      console.warn(`   WARN: HTTP ${res.status} but body mismatch\n`);
    }
  } else {
    console.warn(
      `   WARN: HTTP ${res.status} - public access may not be configured yet on the bucket / custom domain\n`,
    );
  }

  console.log("6. DELETE test object (cleanup)...");
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
  console.log("   OK\n");

  console.log("ALL R2 CHECKS PASSED");
} catch (err: any) {
  console.error("R2 CHECK FAILED:", err?.name, err?.message);
  if (err?.$metadata?.httpStatusCode)
    console.error("  HTTP:", err.$metadata.httpStatusCode);
  process.exit(1);
}
