<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import PhotoMetadataPromptModal, {
  type LocationCandidate,
} from "@/components/PhotoMetadataPromptModal.vue";
import { hasGps, parsePhotoExif, type ParsedExif } from "@/lib/exif";

type Status =
  | "pending"
  | "needs-metadata"
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
  takenAtOverride: number | null;
  error: string | null;
};

const router = useRouter();
const route = useRoute();
const jobs = ref<Job[]>([]);
const promptingIdx = ref<number | null>(null);

const lastConfirmedLocation = ref<LocationCandidate | null>(null);
const lastConfirmedDate = ref<number | null>(null);

const targetAlbumId = ref<string | null>(null);
const targetAlbumName = ref<string | null>(null);

async function loadTargetAlbum(id: string) {
  try {
    const res = await fetch(`/api/albums/${id}`, { credentials: "include" });
    if (res.ok) {
      const a = (await res.json()) as { id: string; name: string };
      targetAlbumId.value = a.id;
      targetAlbumName.value = a.name;
    }
  } catch {
    /* no-op */
  }
}

function clearTargetAlbum() {
  targetAlbumId.value = null;
  targetAlbumName.value = null;
  router.replace({ path: "/upload" });
}

onMounted(() => {
  const q = route.query.albumId;
  if (typeof q === "string" && q) loadTargetAlbum(q);
});

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
    takenAtOverride: null,
    error: null,
  }));

  for (const job of jobs.value) {
    job.exif = await parsePhotoExif(job.file);
    const dims = await readDimensions(job.file);
    job.width = dims.width;
    job.height = dims.height;
  }
}

function jobHasLocation(job: Job): boolean {
  return Boolean(job.location) || (job.exif !== null && hasGps(job.exif));
}

function jobHasDate(job: Job): boolean {
  return job.takenAtOverride !== null || job.exif?.takenAt instanceof Date;
}

async function startBatch() {
  for (let i = 0; i < jobs.value.length; i++) {
    const job = jobs.value[i]!;
    if (job.status === "done" || job.status === "error") continue;
    if (!job.exif) job.exif = await parsePhotoExif(job.file);

    if (!jobHasLocation(job) || !jobHasDate(job)) {
      job.status = "needs-metadata";
      promptingIdx.value = i;
      return;
    }

    await uploadOne(i);
  }

  if (allDone.value && jobs.value.every((j) => j.status === "done")) {
    if (targetAlbumId.value) {
      router.push(`/albums/${targetAlbumId.value}`);
    } else {
      router.push("/");
    }
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
      job.takenAtOverride ??
      (job.exif?.takenAt instanceof Date
        ? Math.floor(job.exif.takenAt.getTime() / 1000)
        : null);

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
        targetAlbumId: targetAlbumId.value,
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

const currentJob = computed(() =>
  promptingIdx.value !== null ? jobs.value[promptingIdx.value] : null,
);

const remainingCount = computed(() => {
  if (promptingIdx.value === null) return 0;
  let count = 0;
  for (let i = promptingIdx.value + 1; i < jobs.value.length; i++) {
    const j = jobs.value[i]!;
    if (j.status === "done" || j.status === "error") continue;
    if (!jobHasLocation(j) || !jobHasDate(j)) count++;
  }
  return count;
});

const initialLocation = computed<LocationCandidate | null>(() => {
  if (!currentJob.value) return null;
  if (currentJob.value.location) return currentJob.value.location;
  return lastConfirmedLocation.value;
});

const initialDateUnix = computed<number | null>(() => {
  if (!currentJob.value) return null;
  if (currentJob.value.takenAtOverride !== null)
    return currentJob.value.takenAtOverride;
  const exifDate = currentJob.value.exif?.takenAt;
  if (exifDate instanceof Date) return Math.floor(exifDate.getTime() / 1000);
  return lastConfirmedDate.value;
});

async function onMetadataConfirm(value: {
  location: LocationCandidate;
  takenAtUnix: number;
  applyToRemaining: boolean;
}) {
  if (promptingIdx.value === null) return;
  const i = promptingIdx.value;
  const job = jobs.value[i]!;
  job.location = value.location;
  job.takenAtOverride = value.takenAtUnix;
  job.status = "pending";
  lastConfirmedLocation.value = value.location;
  lastConfirmedDate.value = value.takenAtUnix;
  promptingIdx.value = null;

  if (value.applyToRemaining) {
    for (let j = i + 1; j < jobs.value.length; j++) {
      const r = jobs.value[j]!;
      if (r.status === "done" || r.status === "error") continue;
      if (!jobHasLocation(r)) r.location = value.location;
      if (!jobHasDate(r)) r.takenAtOverride = value.takenAtUnix;
    }
  }

  await startBatch();
}

function onMetadataCancel() {
  if (promptingIdx.value !== null) {
    jobs.value[promptingIdx.value]!.status = "error";
    jobs.value[promptingIdx.value]!.error = "Cancelled (no metadata)";
    promptingIdx.value = null;
  }
}

function statusLabel(s: Status) {
  switch (s) {
    case "pending":
      return "Waiting";
    case "needs-metadata":
      return "Awaiting metadata";
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

    <div
      v-if="targetAlbumName"
      data-test="target-album-banner"
      class="flex items-center justify-between gap-3 mb-4 px-3 py-2 rounded border border-accent/40 bg-accent/10 text-sm"
    >
      <span class="text-text-primary truncate">
        Uploading to
        <span class="font-medium text-accent">{{ targetAlbumName }}</span>
      </span>
      <button
        type="button"
        @click="clearTargetAlbum"
        class="text-text-muted hover:text-text-primary text-xs"
      >
        Clear
      </button>
    </div>

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
              job.status === 'needs-metadata' || job.status === 'uploading',
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
      Date and location are required for every photo. If your camera didn't
      capture them in EXIF, you'll be prompted before upload. The first answer
      becomes the default for the remaining photos. iPhone Live Photos and
      Sony A7IV HEIF are converted to JPEG server-side.
    </p>

    <PhotoMetadataPromptModal
      :open="promptingIdx !== null"
      :file-name="currentJob?.file.name"
      :initial-location="initialLocation"
      :initial-date-unix="initialDateUnix"
      :remaining-count="remainingCount"
      :show-apply-to-remaining="remainingCount > 0"
      @confirm="onMetadataConfirm"
      @cancel="onMetadataCancel"
    />
  </div>
</template>
