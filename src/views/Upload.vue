<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import LocationPromptModal, {
  type LocationCandidate,
} from "@/components/LocationPromptModal.vue";
import { hasGps, parsePhotoExif } from "@/lib/exif";

type Status = "pending" | "needs-location" | "uploading" | "done" | "error";

type Job = {
  file: File;
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

async function onSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  jobs.value = files.map((file) => ({
    file,
    status: "pending" as Status,
    location: null,
    error: null,
  }));
}

async function startBatch() {
  for (let i = 0; i < jobs.value.length; i++) {
    const job = jobs.value[i]!;
    if (job.status === "done") continue;
    const parsed = await parsePhotoExif(job.file);
    if (!hasGps(parsed) && !job.location) {
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
  const fd = new FormData();
  fd.append("file", job.file);
  if (job.location) {
    fd.append("latitude", String(job.location.lat));
    fd.append("longitude", String(job.location.lon));
    fd.append("locationDisplay", job.location.display);
    fd.append("locationName", job.location.name);
    if (job.location.countryCode)
      fd.append("locationCountry", job.location.countryCode);
  }
  try {
    const res = await fetch("/api/photos/upload", {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `HTTP ${res.status}`);
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
  <div class="max-w-2xl mx-auto bg-white p-6 rounded-lg shadow border border-slate-200">
    <h1 class="text-xl font-semibold mb-4">Upload photos</h1>
    <input
      data-test="files"
      type="file"
      accept="image/*"
      multiple
      @change="onSelect"
      class="block w-full text-sm mb-4"
    />

    <ul v-if="jobs.length > 0" class="space-y-2 mb-4">
      <li
        v-for="(job, i) in jobs"
        :key="i"
        data-test="upload-job"
        class="flex items-center gap-3 text-sm border-b border-slate-100 pb-2"
      >
        <span class="flex-1 truncate">{{ job.file.name }}</span>
        <span
          :class="{
            'text-slate-500': job.status === 'pending',
            'text-amber-600': job.status === 'needs-location' || job.status === 'uploading',
            'text-green-600': job.status === 'done',
            'text-red-600': job.status === 'error',
          }"
        >
          {{ statusLabel(job.status) }}
        </span>
      </li>
    </ul>

    <p
      v-if="overallProgress"
      class="text-sm text-slate-600 mb-3"
      data-test="progress"
    >
      {{ overallProgress.done }} / {{ overallProgress.total }} processed
    </p>

    <button
      data-test="start"
      type="button"
      :disabled="jobs.length === 0 || allDone || promptingIdx !== null"
      @click="startBatch"
      class="w-full bg-slate-900 text-white rounded py-2 disabled:opacity-50"
    >
      {{ allDone ? "All done" : "Upload" }}
    </button>

    <LocationPromptModal
      :open="promptingIdx !== null"
      :file-name="promptingIdx !== null ? jobs[promptingIdx]?.file.name : undefined"
      @confirm="onLocationConfirm"
      @cancel="onLocationCancel"
    />
  </div>
</template>
