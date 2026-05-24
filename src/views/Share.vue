<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import Lightbox, { type LightboxPhoto } from "@/components/Lightbox.vue";

type PublicAlbum = {
  album: { id: string; name: string; locationDisplay: string };
  photos: (LightboxPhoto & { width: number; height: number })[];
};

const route = useRoute();
const data = ref<PublicAlbum | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const lightboxIdx = ref<number | null>(null);

async function load() {
  loading.value = true;
  try {
    const res = await fetch(`/api/share/${route.params.token}`);
    if (res.status === 404) {
      error.value = "This share link is invalid or has expired.";
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data.value = (await res.json()) as PublicAlbum;
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
    <p v-if="loading" class="text-slate-500">Loading...</p>
    <p v-else-if="error" class="text-red-600 text-center mt-12" data-test="share-error">
      {{ error }}
    </p>
    <div v-else-if="data">
      <h1 class="text-2xl font-semibold mb-1" data-test="share-album-name">
        {{ data.album.name }}
      </h1>
      <p class="text-sm text-slate-500 mb-6">
        {{ data.album.locationDisplay }} · {{ data.photos.length }} photo{{ data.photos.length === 1 ? "" : "s" }}
      </p>

      <div
        data-test="share-photo-grid"
        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
      >
        <button
          v-for="(p, i) in data.photos"
          :key="p.id"
          type="button"
          @click="lightboxIdx = i"
          class="block aspect-square overflow-hidden rounded bg-slate-200"
          data-test="share-photo"
        >
          <img
            :src="p.thumbnailUrl"
            :alt="`Photo ${i + 1}`"
            loading="lazy"
            class="w-full h-full object-cover"
          />
        </button>
      </div>

      <Lightbox
        :photos="data.photos"
        :index="lightboxIdx"
        @close="lightboxIdx = null"
        @navigate="(i) => (lightboxIdx = i)"
      />
    </div>
  </div>
</template>
