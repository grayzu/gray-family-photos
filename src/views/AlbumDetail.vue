<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

type PhotoInAlbum = {
  id: string;
  originalUrl: string;
  thumbnailUrl: string;
  takenAt: number | null;
  width: number;
  height: number;
  uploadedAt: number;
  locationDisplay: string | null;
};

type AlbumDetail = {
  id: string;
  name: string;
  year: number;
  month: number;
  locationDisplay: string;
  photos: PhotoInAlbum[];
};

const route = useRoute();
const router = useRouter();
const album = ref<AlbumDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await fetch(`/api/albums/${route.params.id}`, {
      credentials: "include",
    });
    if (res.status === 404) {
      router.replace("/");
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    album.value = (await res.json()) as AlbumDetail;
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "load failed";
  } finally {
    loading.value = false;
  }
}

async function deletePhoto(id: string) {
  if (!confirm("Delete this photo? This cannot be undone.")) return;
  const res = await fetch(`/api/photos/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (res.ok) await load();
}

async function deleteAlbum() {
  if (!album.value) return;
  if (
    !confirm(
      `Delete the entire album "${album.value.name}" and all ${album.value.photos.length} photos? This cannot be undone.`,
    )
  )
    return;
  const res = await fetch(`/api/albums/${album.value.id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (res.ok) router.replace("/");
}

onMounted(load);
</script>

<template>
  <div>
    <RouterLink to="/" class="text-sm text-slate-500 hover:text-slate-900">
      ← Albums
    </RouterLink>

    <p v-if="loading" class="mt-6 text-slate-500">Loading...</p>
    <p v-else-if="error" class="mt-6 text-red-600">{{ error }}</p>
    <div v-else-if="album" class="mt-4">
      <div class="flex items-baseline justify-between mb-1">
        <h1 class="text-2xl font-semibold" data-test="album-name">{{ album.name }}</h1>
        <button
          @click="deleteAlbum"
          data-test="delete-album"
          class="text-sm text-red-600 hover:underline"
        >
          Delete album
        </button>
      </div>
      <p class="text-sm text-slate-500 mb-6">
        {{ album.locationDisplay }} · {{ album.photos.length }} photo{{ album.photos.length === 1 ? "" : "s" }}
      </p>

      <p
        v-if="album.photos.length === 0"
        class="text-slate-500"
        data-test="empty"
      >
        This album is empty.
      </p>
      <div
        v-else
        data-test="album-photo-grid"
        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
      >
        <div
          v-for="p in album.photos"
          :key="p.id"
          class="relative group"
          data-test="album-photo"
        >
          <a
            :href="p.originalUrl"
            target="_blank"
            rel="noopener"
            class="block aspect-square overflow-hidden rounded bg-slate-200"
          >
            <img
              :src="p.thumbnailUrl"
              :alt="p.locationDisplay ?? 'Photo'"
              loading="lazy"
              class="w-full h-full object-cover"
            />
          </a>
          <button
            @click="deletePhoto(p.id)"
            class="absolute top-2 right-2 bg-white/90 text-red-600 text-xs px-2 py-1 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
