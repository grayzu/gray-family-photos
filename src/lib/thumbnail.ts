const MAX_DIM = 800;
const QUALITY = 0.8;

export type ThumbnailResult = {
  blob: Blob;
  width: number;
  height: number;
};

export async function generateThumbnail(file: File): Promise<ThumbnailResult> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const scale = Math.min(MAX_DIM / bitmap.width, MAX_DIM / bitmap.height, 1);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  let blob: Blob;
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(bitmap, 0, 0, w, h);
    blob = await canvas.convertToBlob({ type: "image/jpeg", quality: QUALITY });
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(bitmap, 0, 0, w, h);
    blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
        "image/jpeg",
        QUALITY,
      );
    });
  }

  const fullWidth = bitmap.width;
  const fullHeight = bitmap.height;
  bitmap.close();
  return { blob, width: fullWidth, height: fullHeight };
}
