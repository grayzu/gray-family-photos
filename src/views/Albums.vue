<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useAuthStore } from "@/stores/auth";

type AlbumSummary = {
  id: string;
  name: string;
  year: number;
  month: number;
  locationDisplay: string;
  photoCount: number;
  coverUrls: string[];
};

const auth = useAuthStore();
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
    <div class="flex items-center justify-between mb-8">
      <h1 class="text-3xl font-display font-bold text-text-primary">Albums</h1>
      <RouterLink v-if="auth.isAuthenticated" to="/upload" class="bg-accent hover:bg-accent-hover text-base font-medium px-4 py-2.5 rounded-lg text-sm transition-colors shadow-sm">
        Upload photos
      </RouterLink>
    </div>

    <div v-if="loading" class="space-y-8 animate-pulse">
      <section v-for="i in 2" :key="i">
        <div class="h-6 bg-surface-2 rounded w-24 mb-4"></div>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <div v-for="j in 4" :key="j" class="block">
            <div class="aspect-square bg-surface-2 rounded-lg mb-2"></div>
            <div class="h-4 bg-surface-2 rounded w-3/4 mb-1"></div>
            <div class="h-3 bg-surface-2 rounded w-1/2"></div>
          </div>
        </div>
      </section>
    </div>

    <p v-else-if="error" class="text-coral bg-coral/10 p-4 rounded-lg border border-coral/20" data-test="error">{{ error }}</p>
    
    <div v-else-if="albums.length === 0" class="flex flex-col items-center justify-center py-24 px-4 text-center bg-surface/50 rounded-2xl border border-border-subtle" data-test="empty">
      <div class="w-16 h-16 bg-surface-2 rounded-full flex items-center justify-center mb-4 text-text-muted">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <h3 class="text-xl font-display font-medium text-text-primary mb-2">No albums yet</h3>
      <p class="text-text-muted mb-6 max-w-sm">{{ auth.isAuthenticated ? "Upload your first photos to automatically create organized albums." : "Sign in to add the first family photos." }}</p>
      <RouterLink v-if="auth.isAuthenticated" to="/upload" class="bg-surface-2 hover:bg-border-subtle text-text-primary font-medium px-6 py-2.5 rounded-lg text-sm transition-colors border border-border-subtle">
        Upload photos
      </RouterLink>
      <RouterLink v-else to="/login" class="bg-surface-2 hover:bg-border-subtle text-text-primary font-medium px-6 py-2.5 rounded-lg text-sm transition-colors border border-border-subtle">
        Sign in
      </RouterLink>
    </div>

    <div v-else class="space-y-10">
      <section v-for="[year, group] in grouped" :key="year">
        <h2 class="text-xl font-display font-semibold mb-4 text-text-muted/80 tracking-wide">{{ year }}</h2>
        <div data-test="album-grid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          <RouterLink
            v-for="album in group"
            :key="album.id"
            :to="`/albums/${album.id}`"
            class="block group outline-none"
            data-test="album-card"
          >
            <div class="aspect-square bg-surface-2 rounded-xl overflow-hidden border border-border-subtle group-hover:border-accent transition-all duration-300 group-hover:shadow-xl group-hover:shadow-accent/5 group-hover:-translate-y-1 group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-base">
              <div
                v-if="album.coverUrls.length === 4"
                class="w-full h-full grid grid-cols-2 grid-rows-2 gap-0.5 bg-border-subtle p-0.5"
                data-test="album-cover-collage"
              >
                <img
                  v-for="(url, i) in album.coverUrls"
                  :key="i"
                  :src="url"
                  :alt="`${album.name} ${i + 1}`"
                  loading="lazy"
                  class="w-full h-full object-cover transition-opacity duration-500 opacity-0 rounded-sm"
                  @load="(e) => (e.target as HTMLElement)?.classList.remove('opacity-0')"
                />
              </div>
              <img
                v-else-if="album.coverUrls.length === 1"
                :src="album.coverUrls[0]"
                :alt="album.name"
                loading="lazy"
                class="w-full h-full object-cover transition-opacity duration-500 opacity-0"
                @load="(e) => (e.target as HTMLElement)?.classList.remove('opacity-0')"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-text-muted text-sm bg-surface">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <div class="mt-3 px-1">
              <div class="text-sm font-semibold truncate text-text-primary leading-tight">{{ album.name }}</div>
              <div class="text-xs text-text-muted mt-0.5 font-medium">{{ album.photoCount }} photo{{ album.photoCount === 1 ? "" : "s" }}</div>
            </div>
          </RouterLink>
        </div>
      </section>
    </div>
  </div>
</template>
