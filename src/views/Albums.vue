<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

type AlbumSummary = {
  id: string;
  name: string;
  year: number;
  month: number;
  locationDisplay: string;
  photoCount: number;
  coverUrls: string[];
};

const albums = ref<AlbumSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const grouped = computed(() => {
  const out = new Map<number | string, AlbumSummary[]>();
  for (const a of albums.value) {
    const key = a.year === 0 ? "Undated" : a.year;
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push(a);
  }
  return Array.from(out.entries()).sort((a, b) => {
    if (a[0] === "Undated") return 1;
    if (b[0] === "Undated") return -1;
    return (b[0] as number) - (a[0] as number);
  });
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await fetch("/api/albums", { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    albums.value = (await res.json()) as AlbumSummary[];
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
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-semibold text-text-primary">Albums</h1>
      <RouterLink to="/upload" class="bg-accent hover:bg-accent-hover text-base font-medium px-4 py-2 rounded text-sm transition-colors">
        Upload
      </RouterLink>
    </div>

    <p v-if="loading" class="text-text-muted">Loading...</p>
    <p v-else-if="error" class="text-coral" data-test="error">{{ error }}</p>
    <p v-else-if="albums.length === 0" class="text-text-muted" data-test="empty">
      No albums yet.
      <RouterLink to="/upload" class="text-accent hover:underline">Upload a photo</RouterLink> to start.
    </p>
    <div v-else class="space-y-8">
      <section v-for="[year, group] in grouped" :key="year">
        <h2 class="text-lg font-semibold mb-3 text-text-muted">{{ year }}</h2>
        <div data-test="album-grid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <RouterLink
            v-for="album in group"
            :key="album.id"
            :to="`/albums/${album.id}`"
            class="block group"
            data-test="album-card"
          >
            <div class="aspect-square bg-surface-2 rounded-lg overflow-hidden border border-border-subtle group-hover:border-accent transition-all group-hover:shadow-lg group-hover:shadow-accent/10 group-hover:scale-[1.02]">
              <div
                v-if="album.coverUrls.length === 4"
                class="w-full h-full grid grid-cols-2 grid-rows-2 gap-px bg-border-subtle"
                data-test="album-cover-collage"
              >
                <img
                  v-for="(url, i) in album.coverUrls"
                  :key="i"
                  :src="url"
                  :alt="`${album.name} ${i + 1}`"
                  loading="lazy"
                  class="w-full h-full object-cover"
                />
              </div>
              <img
                v-else-if="album.coverUrls.length === 1"
                :src="album.coverUrls[0]"
                :alt="album.name"
                loading="lazy"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-text-muted text-sm">
                No photo
              </div>
            </div>
            <div class="mt-2">
              <div class="text-sm font-medium truncate text-text-primary">{{ album.name }}</div>
              <div class="text-xs text-text-muted">{{ album.photoCount }} photo{{ album.photoCount === 1 ? "" : "s" }}</div>
            </div>
          </RouterLink>
        </div>
      </section>
    </div>
  </div>
</template>
