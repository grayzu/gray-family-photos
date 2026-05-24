export function isHeic(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    file.type === "image/heic-sequence" ||
    file.type === "image/heif-sequence" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

let heic2anyPromise: Promise<typeof import("heic2any").default> | null = null;

function loadHeic2any() {
  if (!heic2anyPromise) {
    heic2anyPromise = import("heic2any").then((m) => m.default);
  }
  return heic2anyPromise;
}

export async function convertHeicToJpeg(file: File, quality = 0.9): Promise<File> {
  const heic2any = await loadHeic2any();
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality,
  });
  const blob = Array.isArray(result) ? result[0]! : result;
  const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
  return new File([blob], newName, {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}
