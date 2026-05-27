import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
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

async function describeBytes(key: string): Promise<string> {
  const get = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key, Range: "bytes=0-31" }),
  );
  const chunks: Uint8Array[] = [];
  for await (const c of get.Body as AsyncIterable<Uint8Array>) chunks.push(c);
  const buf = Buffer.concat(chunks);
  const hex = Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join(" ");
  const txt = Array.from(buf).map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
  return `\n    hex: ${hex}\n    txt: ${txt}`;
}

console.log("Listing all originals/ in R2...\n");
const list = await s3.send(
  new ListObjectsV2Command({ Bucket: bucket, Prefix: "originals/", MaxKeys: 50 }),
);
const objects = (list.Contents ?? []).sort(
  (a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0),
);

if (objects.length === 0) {
  console.log("No files in originals/. Upload something first.");
  process.exit(0);
}

for (const o of objects) {
  const key = o.Key!;
  console.log(`\n=== ${key} ===`);
  console.log(`Size: ${((o.Size ?? 0) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Uploaded: ${o.LastModified?.toISOString()}`);

  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    console.log(`R2 Content-Type: ${head.ContentType}`);
  } catch (e) {
    console.log(`HEAD error: ${(e as Error).message}`);
  }

  console.log(`First 32 bytes:${await describeBytes(key)}`);

  const directUrl = `${publicBase}/${key}`;
  console.log(`\nDirect R2 fetch: ${directUrl}`);
  const direct = await fetch(directUrl);
  console.log(`  HTTP ${direct.status} | ct: ${direct.headers.get("content-type")}`);
  await direct.arrayBuffer();

  const thumbUrl = `${publicBase}/img/width=800,format=auto,fit=scale-down/${key}`;
  console.log(`\nWorker thumbnail: ${thumbUrl}`);
  const thumb = await fetch(thumbUrl, {
    headers: { Accept: "image/avif,image/webp,image/*,*/*" },
  });
  console.log(
    `  HTTP ${thumb.status} | ct: ${thumb.headers.get("content-type")} | size: ${thumb.headers.get("content-length")}`,
  );
  console.log(`  cf-resized: ${thumb.headers.get("cf-resized") ?? "(none)"}`);
  console.log(`  x-image-unsupported: ${thumb.headers.get("x-image-unsupported") ?? "no"}`);
  console.log(`  x-cf-reason: ${thumb.headers.get("x-cf-reason") ?? "(none)"}`);
  console.log(`  cf-cache-status: ${thumb.headers.get("cf-cache-status") ?? "(none)"}`);
  if (!thumb.ok) {
    console.log(`  body: ${(await thumb.text()).slice(0, 200)}`);
  } else {
    await thumb.arrayBuffer();
  }
}
