<script setup lang="ts">
import { ref, watch } from "vue";

export type LocationCandidate = {
  display: string;
  name: string;
  lat: number;
  lon: number;
  country: string | null;
  countryCode: string | null;
  placeId: number | string;
};

const props = defineProps<{
  open: boolean;
  fileName?: string;
}>();

const emit = defineEmits<{
  (e: "confirm", value: LocationCandidate): void;
  (e: "cancel"): void;
}>();

const query = ref("");
const candidates = ref<LocationCandidate[]>([]);
const selected = ref<LocationCandidate | null>(null);
const loading = ref(false);
const searchedOnce = ref(false);
const error = ref<string | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastIssuedToken = 0;

function reset() {
  query.value = "";
  candidates.value = [];
  selected.value = null;
  loading.value = false;
  searchedOnce.value = false;
  error.value = null;
}

watch(
  () => props.open,
  (v) => {
    if (v) reset();
  },
);

watch(query, (q) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  selected.value = null;
  candidates.value = [];
  error.value = null;
  const trimmed = q.trim();
  if (trimmed.length < 2) {
    loading.value = false;
    searchedOnce.value = false;
    return;
  }
  loading.value = true;
  debounceTimer = setTimeout(() => doSearch(trimmed), 400);
});

async function doSearch(q: string) {
  const token = ++lastIssuedToken;
  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as LocationCandidate[];
    if (token !== lastIssuedToken) return;
    candidates.value = data;
    if (data.length === 1) selected.value = data[0]!;
  } catch (e: unknown) {
    if (token !== lastIssuedToken) return;
    error.value = e instanceof Error ? e.message : "search failed";
    candidates.value = [];
  } finally {
    if (token === lastIssuedToken) {
      loading.value = false;
      searchedOnce.value = true;
    }
  }
}

function confirm() {
  if (!selected.value) return;
  emit("confirm", selected.value);
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    data-test="location-modal"
  >
    <div class="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full p-6">
      <h2 class="text-lg font-semibold mb-1">Where was this taken?</h2>
      <p class="text-sm text-slate-500 mb-4">
        {{ fileName ?? "This photo" }} doesn't have location info in its EXIF
        data. Type a place name to attach a location.
      </p>

      <input
        v-model="query"
        type="text"
        placeholder="e.g. sydney"
        autocomplete="off"
        data-test="location-input"
        class="block w-full rounded border border-slate-300 px-3 py-2 mb-3"
      />

      <div v-if="loading" class="text-sm text-slate-500">Searching...</div>
      <div
        v-else-if="error"
        class="text-sm text-red-600"
        data-test="location-error"
      >
        {{ error }}
      </div>
      <div
        v-else-if="searchedOnce && candidates.length === 0"
        class="text-sm text-slate-500"
        data-test="no-matches"
      >
        No matches. Try a different search.
      </div>
      <ul v-else class="max-h-56 overflow-y-auto divide-y divide-slate-100">
        <li v-for="c in candidates" :key="c.placeId">
          <button
            type="button"
            @click="selected = c"
            :class="[
              'w-full text-left p-2 text-sm rounded',
              selected?.placeId === c.placeId
                ? 'bg-slate-900 text-white'
                : 'hover:bg-slate-100',
            ]"
            data-test="location-option"
          >
            <div class="font-medium">{{ c.name }}</div>
            <div :class="['text-xs', selected?.placeId === c.placeId ? 'text-slate-300' : 'text-slate-500']">
              {{ c.display }}
            </div>
          </button>
        </li>
      </ul>

      <div class="flex justify-end gap-2 mt-5">
        <button
          type="button"
          @click="emit('cancel')"
          class="px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
        >
          Cancel
        </button>
        <button
          type="button"
          @click="confirm"
          :disabled="!selected"
          data-test="location-confirm"
          class="px-4 py-2 text-sm bg-slate-900 text-white rounded disabled:opacity-50"
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
</template>
