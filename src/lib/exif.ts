import exifr from "exifr";

export type ParsedExif = {
  takenAt: Date | null;
  latitude: number | null;
  longitude: number | null;
};

export async function parsePhotoExif(file: File): Promise<ParsedExif> {
  try {
    const ex = await exifr.parse(file, { gps: true });
    const takenAt =
      ex?.DateTimeOriginal instanceof Date ? ex.DateTimeOriginal : null;
    const latitude =
      typeof ex?.latitude === "number" ? ex.latitude : null;
    const longitude =
      typeof ex?.longitude === "number" ? ex.longitude : null;
    return { takenAt, latitude, longitude };
  } catch {
    return { takenAt: null, latitude: null, longitude: null };
  }
}

export function hasGps(parsed: ParsedExif): boolean {
  return parsed.latitude !== null && parsed.longitude !== null;
}
