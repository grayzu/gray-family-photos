import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = process.env.R2_ACCOUNT_ID!;
const bucket = process.env.R2_BUCKET!;
const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

const s3 = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const testKey = `_health/cors-test-${Date.now()}.txt`;
const signed = await getSignedUrl(
  s3,
  new PutObjectCommand({ Bucket: bucket, Key: testKey, ContentType: "text/plain" }),
  { expiresIn: 300 },
);

console.log("Testing CORS for origins:\n");

const origins = [
  "https://gray-family-photos.vercel.app",
  "http://localhost:3000",
  "https://random-other-site.example.com",
];

for (const origin of origins) {
  console.log(`Origin: ${origin}`);
  const pre = await fetch(signed, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  const acao = pre.headers.get("access-control-allow-origin");
  const acam = pre.headers.get("access-control-allow-methods");
  const ach = pre.headers.get("access-control-allow-headers");
  console.log(`  Preflight: HTTP ${pre.status}`);
  console.log(`    Access-Control-Allow-Origin:  ${acao ?? "(missing)"}`);
  console.log(`    Access-Control-Allow-Methods: ${acam ?? "(missing)"}`);
  console.log(`    Access-Control-Allow-Headers: ${ach ?? "(missing)"}`);
  if (pre.status === 200 && acao) {
    console.log(`    ✅ ALLOWED`);
  } else {
    console.log(`    ❌ BLOCKED`);
  }
  console.log();
}

console.log("Real PUT from gray-family-photos.vercel.app origin...");
const put = await fetch(signed, {
  method: "PUT",
  body: "cors test",
  headers: {
    "content-type": "text/plain",
    Origin: "https://gray-family-photos.vercel.app",
  },
});
console.log(`  PUT: HTTP ${put.status}`);
console.log(
  `    Access-Control-Allow-Origin: ${put.headers.get("access-control-allow-origin") ?? "(missing)"}`,
);

await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
