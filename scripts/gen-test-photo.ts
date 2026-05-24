import sharp from "sharp";
import fs from "node:fs";

await sharp({
  create: {
    width: 1200,
    height: 800,
    channels: 3,
    background: { r: 200, g: 100, b: 50 },
  },
})
  .jpeg()
  .withExif({
    IFD0: { Software: "test", DateTime: "2025:03:15 12:00:00" },
    ExifIFD: { DateTimeOriginal: "2025:03:15 12:00:00" },
  })
  .toFile("/tmp/test-photo.jpg");

console.log("Size:", fs.statSync("/tmp/test-photo.jpg").size, "bytes");
