// File System Access API is Chromium-only. Narrow inline types avoid pulling
// in @types/wicg-file-system-access while keeping vue-tsc strict happy.
type FSWritable = {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
};
type FSFileHandle = { createWritable: () => Promise<FSWritable> };
type FSDirHandle = {
  getFileHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<FSFileHandle>;
};
type WindowFS = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }) => Promise<FSFileHandle>;
  showDirectoryPicker?: (options?: {
    mode?: "read" | "readwrite";
  }) => Promise<FSDirHandle>;
};

export type DownloadablePhoto = {
  id: string;
  originalUrl: string;
  takenAt: number | null;
};

function extFromUrl(url: string): string {
  try {
    const path = new URL(url, window.location.origin).pathname;
    const dot = path.lastIndexOf(".");
    if (dot === -1) return "jpg";
    const ext = path.slice(dot + 1).toLowerCase();
    return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "jpg";
  } catch {
    return "jpg";
  }
}

function fileNameFor(photo: DownloadablePhoto): string {
  const ext = extFromUrl(photo.originalUrl);
  const datePart = photo.takenAt
    ? new Date(photo.takenAt * 1000).toISOString().slice(0, 10)
    : "undated";
  return `${datePart}-${photo.id.slice(0, 8)}.${ext}`;
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

function anchorDownloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function anchorDownloadUrl(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function isAbort(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: unknown }).name === "AbortError"
  );
}

export type DownloadOneResult = "saved" | "cancelled" | "fallback" | "error";

export async function downloadOnePhoto(
  photo: DownloadablePhoto,
): Promise<DownloadOneResult> {
  const name = fileNameFor(photo);
  const w = window as WindowFS;

  if (typeof w.showSaveFilePicker === "function") {
    let blob: Blob;
    try {
      blob = await fetchBlob(photo.originalUrl);
    } catch {
      anchorDownloadUrl(photo.originalUrl, name);
      return "fallback";
    }
    let handle: FSFileHandle;
    try {
      handle = await w.showSaveFilePicker({
        suggestedName: name,
        types: [
          {
            description: "Image",
            accept: { "image/*": [`.${extFromUrl(photo.originalUrl)}`] },
          },
        ],
      });
    } catch (err) {
      if (isAbort(err)) return "cancelled";
      throw err;
    }
    try {
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch {
      return "error";
    }
  }

  // Fallback: anchor download. Cross-origin URLs will use the server-provided
  // filename, not our suggested one, but the file still downloads.
  try {
    const blob = await fetchBlob(photo.originalUrl);
    anchorDownloadBlob(blob, name);
    return "fallback";
  } catch {
    anchorDownloadUrl(photo.originalUrl, name);
    return "fallback";
  }
}

export type BulkProgress = {
  done: number;
  total: number;
  saved: number;
  failed: number;
};

export type DownloadManyResult = {
  status: "saved" | "cancelled" | "fallback" | "error";
  saved: number;
  failed: number;
  total: number;
};

export async function downloadManyPhotos(
  photos: DownloadablePhoto[],
  onProgress?: (p: BulkProgress) => void,
): Promise<DownloadManyResult> {
  const total = photos.length;
  if (total === 0) return { status: "saved", saved: 0, failed: 0, total: 0 };

  const w = window as WindowFS;

  if (typeof w.showDirectoryPicker === "function") {
    let dir: FSDirHandle;
    try {
      dir = await w.showDirectoryPicker({ mode: "readwrite" });
    } catch (err) {
      if (isAbort(err)) {
        return { status: "cancelled", saved: 0, failed: 0, total };
      }
      throw err;
    }
    let saved = 0;
    let failed = 0;
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i]!;
      try {
        const blob = await fetchBlob(photo.originalUrl);
        const fileHandle = await dir.getFileHandle(fileNameFor(photo), {
          create: true,
        });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        saved++;
      } catch {
        failed++;
      }
      onProgress?.({ done: i + 1, total, saved, failed });
    }
    return {
      status: failed === 0 ? "saved" : saved > 0 ? "saved" : "error",
      saved,
      failed,
      total,
    };
  }

  // Fallback: sequential <a download> clicks. Files land in the default
  // Downloads folder; the user cannot pick a directory. Some browsers
  // prompt to allow multiple file downloads from the same site.
  let saved = 0;
  let failed = 0;
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]!;
    const name = fileNameFor(photo);
    try {
      const blob = await fetchBlob(photo.originalUrl);
      anchorDownloadBlob(blob, name);
      saved++;
    } catch {
      try {
        anchorDownloadUrl(photo.originalUrl, name);
        saved++;
      } catch {
        failed++;
      }
    }
    onProgress?.({ done: i + 1, total, saved, failed });
    // Small delay to give the browser time to register each download
    // before triggering the next; prevents some browsers from coalescing.
    await new Promise((r) => setTimeout(r, 150));
  }
  return {
    status: failed === 0 ? "fallback" : saved > 0 ? "fallback" : "error",
    saved,
    failed,
    total,
  };
}
