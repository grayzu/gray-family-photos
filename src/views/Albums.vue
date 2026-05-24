<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

type AlbumSummary = {
  id: string;
  name: string;
  year: number;
  month: number;
  locationDisplay: string;
  photoCount: number;
  coverUrl: string | null;
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
      <h1 class="text-2xl font-semibold">Albums</h1>
      <RouterLink to="/upload" class="bg-slate-900 text-white px-4 py-2 rounded text-sm">
        Upload
      </RouterLink>
    </div>

    <p v-if="loading" class="text-slate-500">Loading...</p>
    <p v-else-if="error" class="text-red-600" data-test="error">{{ error }}</p>
    <p v-else-if="albums.length === 0" class="text-slate-500" data-test="empty">
      No albums yet.
      <RouterLink to="/upload" class="underline">Upload a photo</RouterLink> to start.
    </p>
    <div v-else class="space-y-8">
      <section v-for="[year, group] in grouped" :key="year">
        <h2 class="text-lg font-semibold mb-3 text-slate-600">{{ year }}</h2>
        <div data-test="album-grid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <RouterLink
            v-for="album in group"
            :key="album.id"
            :to="`/albums/${album.id}`"
            class="block group"
            data-test="album-card"
          >
            <div class="aspect-square bg-slate-200 rounded overflow-hidden">
              <img
                v-if="album.coverUrl"
                :src="album.coverUrl"
                :alt="album.name"
                loading="lazy"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-slate-400">
                No photo
              </div>
            </div>
            <div class="mt-2">
              <div class="text-sm font-medium truncate">{{ album.name }}</div>
              <div class="text-xs text-slate-500">{{ album.photoCount }} photo{{ album.photoCount === 1 ? "" : "s" }}</div>
            </div>
          </RouterLink>
        </div>
      </section>
    </div>
  </div>
</template>
