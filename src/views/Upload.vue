<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import LocationPromptModal, {
  type LocationCandidate,
} from "@/components/LocationPromptModal.vue";
import { hasGps, parsePhotoExif, type ParsedExif } from "@/lib/exif";
import { convertHeicToJpeg, isHeic } from "@/lib/heic";
import { generateThumbnail } from "@/lib/thumbnail";

type Status =
  | "pending"
  | "converting"
  | "needs-location"
  | "uploading"
  | "done"
  | "error";

type Job = {
  originalFile: File;
  uploadFile: File;
  exif: ParsedExif | null;
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
const canStart = computed(() =>
  jobs.value.length > 0 &&
  !allDone.value &&
  promptingIdx.value === null &&
  jobs.value.every((j) => j.status !== "converting"),
);

async function onSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  jobs.value = files.map((file) => ({
    originalFile: file,
    uploadFile: file,
    exif: null,
    status: "pending" as Status,
    location: null,
    error: null,
  }));

  for (const job of jobs.value) {
    if (!isHeic(job.originalFile)) continue;
    job.status = "converting";
    try {
      job.exif = await parsePhotoExif(job.originalFile);
      job.uploadFile = await convertHeicToJpeg(job.originalFile);
      job.status = "pending";
    } catch (err) {
      job.status = "error";
      job.error =
        err instanceof Error
          ? `HEIC conversion failed: ${err.message}`
          : "HEIC conversion failed";
    }
  }
}

async function startBatch() {
  for (let i = 0; i < jobs.value.length; i++) {
    const job = jobs.value[i]!;
    if (job.status === "done" || job.status === "error") continue;
    if (job.status === "converting") return;

    if (!job.exif) {
      job.exif = await parsePhotoExif(job.uploadFile);
    }

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
    if (lat === null || lon === null) {
      throw new Error("location required");
    }

    const thumb = await generateThumbnail(job.uploadFile);

    const urlsRes = await fetch("/api/photos/upload-urls", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: job.uploadFile.name,
        mimeType: job.uploadFile.type,
        latitude: lat,
        longitude: lon,
      }),
    });
    if (!urlsRes.ok) {
      const err = (await urlsRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `HTTP ${urlsRes.status}`);
    }
    const {
      originalKey,
      thumbnailKey,
      originalUploadUrl,
      thumbnailUploadUrl,
    } = (await urlsRes.json()) as {
      originalKey: string;
      thumbnailKey: string;
      originalUploadUrl: string;
      thumbnailUploadUrl: string;
    };

    const [origPut, thumbPut] = await Promise.all([
      fetch(originalUploadUrl, {
        method: "PUT",
        body: job.uploadFile,
        headers: { "content-type": job.uploadFile.type },
      }),
      fetch(thumbnailUploadUrl, {
        method: "PUT",
        body: thumb.blob,
        headers: { "content-type": "image/jpeg" },
      }),
    ]);
    if (!origPut.ok || !thumbPut.ok) {
      throw new Error(
        "Direct R2 upload failed. The R2 bucket may need a CORS policy that allows PUT from this origin.",
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
        thumbnailKey,
        mimeType: job.uploadFile.type,
        fileSize: job.uploadFile.size,
        width: thumb.width,
        height: thumb.height,
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
    case "converting":
      return "Converting HEIC...";
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
        <span class="flex-1 truncate text-text-primary">{{ job.originalFile.name }}</span>
        <span
          :class="{
            'text-text-muted': job.status === 'pending',
            'text-turquoise': job.status === 'converting',
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
      :disabled="!canStart"
      @click="startBatch"
      class="w-full bg-accent hover:bg-accent-hover text-base font-medium rounded py-2 disabled:opacity-50 transition-colors"
    >
      {{ allDone ? "All done" : "Upload" }}
    </button>

    <p class="mt-3 text-xs text-text-muted">
      iPhone/Mac HEIC photos are automatically converted to JPEG in your
      browser before upload.
    </p>

    <LocationPromptModal
      :open="promptingIdx !== null"
      :file-name="
        promptingIdx !== null ? jobs[promptingIdx]?.originalFile.name : undefined
      "
      @confirm="onLocationConfirm"
      @cancel="onLocationCancel"
    />
  </div>
</template>
