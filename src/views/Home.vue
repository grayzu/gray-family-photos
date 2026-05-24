<script setup lang="ts">
import { ref, onMounted } from "vue";

type PhotoListItem = {
  id: string;
  originalUrl: string;
  thumbnailUrl: string;
  takenAt: number | null;
  width: number;
  height: number;
  uploadedAt: number;
  locationDisplay: string | null;
};

const photos = ref<PhotoListItem[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await fetch("/api/photos", { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    photos.value = (await res.json()) as PhotoListItem[];
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "load failed";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-semibold">Photos</h1>
      <RouterLink
        to="/upload"
        class="bg-slate-900 text-white px-4 py-2 rounded text-sm"
      >
        Upload
      </RouterLink>
    </div>

    <p v-if="loading" class="text-slate-500">Loading...</p>
    <p v-else-if="error" class="text-red-600" data-test="error">{{ error }}</p>
    <p v-else-if="photos.length === 0" data-test="empty" class="text-slate-500">
      No photos yet.
      <RouterLink to="/upload" class="underline">Upload your first photo</RouterLink>.
    </p>
    <div v-else data-test="photo-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      <a
        v-for="p in photos"
        :key="p.id"
        :href="p.originalUrl"
        target="_blank"
        rel="noopener"
        class="block aspect-square overflow-hidden rounded bg-slate-200"
        data-test="photo-thumb"
      >
        <img
          :src="p.thumbnailUrl"
          :alt="p.locationDisplay ?? 'Photo'"
          loading="lazy"
          class="w-full h-full object-cover"
        />
      </a>
    </div>
  </div>
</template>
