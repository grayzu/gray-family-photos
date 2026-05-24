<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import LocationPromptModal, {
  type LocationCandidate,
} from "@/components/LocationPromptModal.vue";
import { hasGps, parsePhotoExif } from "@/lib/exif";

const router = useRouter();
const file = ref<File | null>(null);
const progress = ref<"idle" | "checking" | "needs-location" | "uploading" | "done" | "error">(
  "idle",
);
const error = ref<string | null>(null);
const locationModalOpen = ref(false);
const pendingLocation = ref<LocationCandidate | null>(null);

function onSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  file.value = input.files?.[0] ?? null;
  error.value = null;
  pendingLocation.value = null;
  progress.value = "idle";
}

async function startUpload() {
  if (!file.value) return;
  error.value = null;
  progress.value = "checking";

  const parsed = await parsePhotoExif(file.value);
  if (!hasGps(parsed) && !pendingLocation.value) {
    progress.value = "needs-location";
    locationModalOpen.value = true;
    return;
  }

  await sendUpload();
}

async function sendUpload() {
  if (!file.value) return;
  progress.value = "uploading";
  const fd = new FormData();
  fd.append("file", file.value);
  if (pendingLocation.value) {
    fd.append("latitude", String(pendingLocation.value.lat));
    fd.append("longitude", String(pendingLocation.value.lon));
    fd.append("locationDisplay", pendingLocation.value.display);
    fd.append("locationName", pendingLocation.value.name);
    if (pendingLocation.value.countryCode) {
      fd.append("locationCountry", pendingLocation.value.countryCode);
    }
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
    progress.value = "done";
    router.push("/");
  } catch (e: unknown) {
    progress.value = "error";
    error.value = e instanceof Error ? e.message : "upload failed";
  }
}

function onLocationConfirm(value: LocationCandidate) {
  pendingLocation.value = value;
  locationModalOpen.value = false;
  void sendUpload();
}

function onLocationCancel() {
  locationModalOpen.value = false;
  progress.value = "idle";
}
</script>

<template>
  <div class="max-w-lg mx-auto bg-white p-6 rounded-lg shadow border border-slate-200">
    <h1 class="text-xl font-semibold mb-4">Upload a photo</h1>
    <form @submit.prevent="startUpload" class="space-y-4">
      <input
        data-test="file"
        type="file"
        accept="image/*"
        @change="onSelect"
        required
        class="block w-full text-sm"
      />
      <p v-if="error" class="text-sm text-red-600" data-test="error">{{ error }}</p>
      <p
        v-if="pendingLocation"
        class="text-sm text-slate-600"
        data-test="pending-location"
      >
        Location: <span class="font-medium">{{ pendingLocation.display }}</span>
      </p>
      <button
        data-test="submit"
        type="submit"
        :disabled="!file || progress === 'uploading' || progress === 'checking'"
        class="w-full bg-slate-900 text-white rounded py-2 disabled:opacity-50"
      >
        {{
          progress === "uploading"
            ? "Uploading..."
            : progress === "checking"
              ? "Checking..."
              : "Upload"
        }}
      </button>
    </form>

    <LocationPromptModal
      :open="locationModalOpen"
      :file-name="file?.name"
      @confirm="onLocationConfirm"
      @cancel="onLocationCancel"
    />
  </div>
</template>
