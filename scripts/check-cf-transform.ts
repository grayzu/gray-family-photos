import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";

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

const key = "_health/cf-transform-test.jpg";
const testJpeg = await sharp({
  create: {
    width: 1600,
    height: 1200,
    channels: 3,
    background: { r: 50, g: 120, b: 80 },
  },
})
  .jpeg()
  .toBuffer();

console.log("1. Uploading test source to R2...");
await s3.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: testJpeg,
    ContentType: "image/jpeg",
  }),
);
console.log(`   OK (${testJpeg.length} bytes)`);

const sourceUrl = `${publicBase.replace(/\/$/, "")}/${key}`;
console.log(`2. Verify source accessible: ${sourceUrl}`);
const srcRes = await fetch(sourceUrl);
console.log(`   HTTP ${srcRes.status} (${srcRes.headers.get("content-length")} bytes)`);

const transformUrl = `${publicBase.replace(/\/$/, "")}/cdn-cgi/image/width=400,format=auto/${key}`;
console.log(`3. Try CF transform: ${transformUrl}`);
const tRes = await fetch(transformUrl, {
  headers: { Accept: "image/avif,image/webp,image/*,*/*" },
});
console.log(
  `   HTTP ${tRes.status} type=${tRes.headers.get("content-type")} size=${tRes.headers.get("content-length")} cf-resized=${tRes.headers.get("cf-resized") ?? "(none)"}`,
);
if (tRes.status !== 200) {
  const body = await tRes.text();
  console.log(`   body: ${body.slice(0, 300)}`);
}

console.log("4. Cleanup...");
await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
console.log("   OK");
