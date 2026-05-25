<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import LocationPromptModal, {
  type LocationCandidate,
} from "@/components/LocationPromptModal.vue";
import { hasGps, parsePhotoExif, type ParsedExif } from "@/lib/exif";

type Status =
  | "pending"
  | "needs-location"
  | "uploading"
  | "done"
  | "error";

type Job = {
  file: File;
  exif: ParsedExif | null;
  width: number;
  height: number;
  status: Status;
  location: LocationCandidate | null;
  error: string | null;
};

const router = useRouter();
const jobs = ref<Job[]>([]);
const promptingIdx = ref<number | null>(null);
const overallProgress = computed(() => {
  if (jobs.value.length === 0) return null;
  const done = jobs.value.filter(
    (j) => j.status === "done" || j.status === "error",
  ).length;
  return { done, total: jobs.value.length };
});
const allDone = computed(
  () =>
    jobs.value.length > 0 &&
    jobs.value.every((j) => j.status === "done" || j.status === "error"),
);

function isHeicLike(file: File): boolean {
  const n = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    n.endsWith(".heic") ||
    n.endsWith(".heif") ||
    n.endsWith(".hif")
  );
}

async function readDimensions(file: File): Promise<{ width: number; height: number }> {
  if (isHeicLike(file)) return { width: 0, height: 0 };
  try {
    const bmp = await createImageBitmap(file);
    const w = bmp.width;
    const h = bmp.height;
    bmp.close();
    return { width: w, height: h };
  } catch {
    return { width: 0, height: 0 };
  }
}

async function onSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  jobs.value = files.map((file) => ({
    file,
    exif: null,
    width: 0,
    height: 0,
    status: "pending" as Status,
    location: null,
    error: null,
  }));

  for (const job of jobs.value) {
    job.exif = await parsePhotoExif(job.file);
    const dims = await readDimensions(job.file);
    job.width = dims.width;
    job.height = dims.height;
  }
}

async function startBatch() {
  for (let i = 0; i < jobs.value.length; i++) {
    const job = jobs.value[i]!;
    if (job.status === "done" || job.status === "error") continue;
    if (!job.exif) job.exif = await parsePhotoExif(job.file);
    if (!hasGps(job.exif) && !job.location) {
      job.status = "needs-location";
      promptingIdx.value = i;
      return;
    }
    await uploadOne(i);
  }
  if (allDone.value && jobs.value.every((j) => j.status === "done")) {
    router.push("/");
  }
}

async function uploadOne(i: number) {
  const job = jobs.value[i]!;
  job.status = "uploading";
  job.error = null;
  try {
    const exifLat = job.exif?.latitude ?? null;
    const exifLon = job.exif?.longitude ?? null;
    const lat = job.location?.lat ?? exifLat;
    const lon = job.location?.lon ?? exifLon;
    if (lat === null || lon === null) throw new Error("location required");

    const urlsRes = await fetch("/api/photos/upload-urls", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: job.file.name,
        mimeType: job.file.type || "image/jpeg",
        latitude: lat,
        longitude: lon,
      }),
    });
    if (!urlsRes.ok) {
      const err = (await urlsRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `HTTP ${urlsRes.status}`);
    }
    const { originalKey, originalUploadUrl } = (await urlsRes.json()) as {
      originalKey: string;
      originalUploadUrl: string;
    };

    const putRes = await fetch(originalUploadUrl, {
      method: "PUT",
      body: job.file,
      headers: { "content-type": job.file.type || "image/jpeg" },
    });
    if (!putRes.ok) {
      throw new Error(
        "Direct R2 upload failed. The R2 bucket needs a CORS policy allowing PUT from this origin.",
      );
    }

    const takenAt =
      job.exif?.takenAt instanceof Date
        ? Math.floor(job.exif.takenAt.getTime() / 1000)
        : null;

    const commitRes = await fetch("/api/photos/commit", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        originalKey,
        mimeType: job.file.type || "image/jpeg",
        fileSize: job.file.size,
        width: job.width,
        height: job.height,
        takenAt,
        latitude: lat,
        longitude: lon,
        locationDisplay: job.location?.display ?? null,
        locationName: job.location?.name ?? null,
        locationCountry: job.location?.countryCode ?? null,
      }),
    });
    if (!commitRes.ok) {
      const err = (await commitRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `HTTP ${commitRes.status}`);
    }
    job.status = "done";
  } catch (e: unknown) {
    job.status = "error";
    job.error = e instanceof Error ? e.message : "upload failed";
  }
}

async function onLocationConfirm(value: LocationCandidate) {
  if (promptingIdx.value === null) return;
  const i = promptingIdx.value;
  jobs.value[i]!.location = value;
  jobs.value[i]!.status = "pending";
  promptingIdx.value = null;
  await startBatch();
}

function onLocationCancel() {
  if (promptingIdx.value !== null) {
    jobs.value[promptingIdx.value]!.status = "error";
    jobs.value[promptingIdx.value]!.error = "Cancelled (no location)";
    promptingIdx.value = null;
  }
}

function statusLabel(s: Status) {
  switch (s) {
    case "pending":
      return "Waiting";
    case "needs-location":
      return "Awaiting location";
    case "uploading":
      return "Uploading...";
    case "done":
      return "Done";
    case "error":
      return "Failed";
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto bg-surface p-6 rounded-lg shadow border border-border-subtle">
    <h1 class="text-xl font-semibold mb-4 text-text-primary">Upload photos</h1>
    <input
      data-test="files"
      type="file"
      accept="image/*,.heic,.heif"
      multiple
      @change="onSelect"
      class="block w-full text-sm mb-4 text-text-primary file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-accent file:text-base hover:file:bg-accent-hover file:cursor-pointer cursor-pointer"
    />

    <ul v-if="jobs.length > 0" class="space-y-2 mb-4">
      <li
        v-for="(job, i) in jobs"
        :key="i"
        data-test="upload-job"
        class="flex items-center gap-3 text-sm border-b border-border-subtle pb-2"
      >
        <span class="flex-1 truncate text-text-primary">{{ job.file.name }}</span>
        <span
          :class="{
            'text-text-muted': job.status === 'pending',
            'text-gold':
              job.status === 'needs-location' || job.status === 'uploading',
            'text-lime': job.status === 'done',
            'text-coral': job.status === 'error',
          }"
        >
          {{ statusLabel(job.status) }}
        </span>
      </li>
    </ul>

    <p
      v-if="overallProgress"
      class="text-sm text-text-muted mb-3"
      data-test="progress"
    >
      {{ overallProgress.done }} / {{ overallProgress.total }} processed
    </p>

    <button
      data-test="start"
      type="button"
      :disabled="jobs.length === 0 || allDone || promptingIdx !== null"
      @click="startBatch"
      class="w-full bg-accent hover:bg-accent-hover text-base font-medium rounded py-2 disabled:opacity-50 transition-colors"
    >
      {{ allDone ? "All done" : "Upload" }}
    </button>

    <p class="mt-3 text-xs text-text-muted">
      iPhone HEIC photos upload as-is; thumbnails are generated on demand by
      Cloudflare's image pipeline (no conversion in your browser).
    </p>

    <LocationPromptModal
      :open="promptingIdx !== null"
      :file-name="
        promptingIdx !== null ? jobs[promptingIdx]?.file.name : undefined
      "
      @confirm="onLocationConfirm"
      @cancel="onLocationCancel"
    />
  </div>
</template>
