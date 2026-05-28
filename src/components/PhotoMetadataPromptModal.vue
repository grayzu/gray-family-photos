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
  remainingCount?: number;
  initialLocation: LocationCandidate | null;
  initialDateUnix: number | null;
  showApplyToRemaining: boolean;
}>();

const emit = defineEmits<{
  (
    e: "confirm",
    value: {
      location: LocationCandidate;
      takenAtUnix: number;
      applyToRemaining: boolean;
    },
  ): void;
  (e: "cancel"): void;
}>();

const query = ref("");
const candidates = ref<LocationCandidate[]>([]);
const selected = ref<LocationCandidate | null>(null);
const dateValue = ref<string>("");
const applyToRemaining = ref(false);
const loadingLocations = ref(false);
const searchedOnce = ref(false);
const locationError = ref<string | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastIssuedToken = 0;

function unixToInputValue(ts: number | null): string {
  if (!ts) {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    selected.value = props.initialLocation;
    if (props.initialLocation) {
      query.value = props.initialLocation.display;
      candidates.value = [props.initialLocation];
    } else {
      query.value = "";
      candidates.value = [];
    }
    dateValue.value = unixToInputValue(props.initialDateUnix);
    applyToRemaining.value = false;
    searchedOnce.value = false;
    locationError.value = null;
  },
);

watch(query, (q) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (selected.value && selected.value.display === q) return;
  selected.value = null;
  locationError.value = null;
  const trimmed = q.trim();
  if (trimmed.length < 2) {
    candidates.value = [];
    loadingLocations.value = false;
    searchedOnce.value = false;
    return;
  }
  loadingLocations.value = true;
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
    locationError.value = e instanceof Error ? e.message : "search failed";
    candidates.value = [];
  } finally {
    if (token === lastIssuedToken) {
      loadingLocations.value = false;
      searchedOnce.value = true;
    }
  }
}

function confirm() {
  if (!selected.value || !dateValue.value) return;
  const ts = Math.floor(new Date(dateValue.value).getTime() / 1000);
  if (!Number.isFinite(ts)) return;
  emit("confirm", {
    location: selected.value,
    takenAtUnix: ts,
    applyToRemaining: applyToRemaining.value,
  });
}
</script>

<template>
  <Transition name="modal">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      data-test="metadata-modal"
    >
      <div
        class="bg-surface rounded-xl shadow-2xl border border-border-subtle max-w-md w-full p-6 modal-content"
      >
        <h2 class="text-lg font-semibold mb-1 text-text-primary">
          Photo details
        </h2>
        <p class="text-sm text-text-muted mb-4">
          {{ fileName ?? "This photo" }} needs a date and location. EXIF didn't
          include both.
        </p>

        <label class="block mb-3">
          <span class="text-sm text-text-muted">Date taken</span>
          <input
            v-model="dateValue"
            type="datetime-local"
            data-test="metadata-date"
            class="mt-1 block w-full rounded bg-surface-2 border border-border-subtle px-3 py-2 text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>

        <label class="block">
          <span class="text-sm text-text-muted">Location</span>
          <input
            v-model="query"
            type="text"
            placeholder="e.g. sydney"
            autocomplete="off"
            data-test="metadata-location-input"
            class="mt-1 block w-full rounded bg-surface-2 border border-border-subtle px-3 py-2 text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>

        <div class="mt-2">
          <div v-if="loadingLocations" class="text-xs text-text-muted">
            Searching...
          </div>
          <div
            v-else-if="locationError"
            class="text-xs text-coral"
            data-test="metadata-location-error"
          >
            {{ locationError }}
          </div>
          <div
            v-else-if="searchedOnce && candidates.length === 0 && !selected"
            class="text-xs text-text-muted"
            data-test="metadata-no-matches"
          >
            No matches. Try a different search.
          </div>
          <ul
            v-else-if="candidates.length > 0"
            class="max-h-40 overflow-y-auto divide-y divide-border-subtle border border-border-subtle rounded mt-1"
          >
            <li v-for="c in candidates" :key="c.placeId">
              <button
                type="button"
                @click="
                  selected = c;
                  query = c.display;
                "
                :class="[
                  'w-full text-left p-2 text-xs rounded-none transition-colors',
                  selected?.placeId === c.placeId
                    ? 'bg-accent text-base'
                    : 'text-text-primary hover:bg-surface-2',
                ]"
                data-test="metadata-location-option"
              >
                <div class="font-medium">{{ c.name }}</div>
                <div
                  :class="[
                    'text-[10px]',
                    selected?.placeId === c.placeId
                      ? 'text-base/70'
                      : 'text-text-muted',
                  ]"
                >
                  {{ c.display }}
                </div>
              </button>
            </li>
          </ul>
        </div>

        <label
          v-if="showApplyToRemaining && (remainingCount ?? 0) > 0"
          class="flex items-center gap-2 mt-4 text-sm text-text-muted cursor-pointer"
        >
          <input
            v-model="applyToRemaining"
            type="checkbox"
            data-test="metadata-apply-remaining"
            class="accent-accent"
          />
          <span>
            Apply this date &amp; location to the remaining
            {{ remainingCount }} photo{{ remainingCount === 1 ? "" : "s" }}
          </span>
        </label>

        <div class="flex justify-end gap-2 mt-5">
          <button
            type="button"
            @click="emit('cancel')"
            class="px-4 py-2 text-sm text-text-muted hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            @click="confirm"
            :disabled="!selected || !dateValue"
            data-test="metadata-confirm"
            class="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-base font-medium rounded disabled:opacity-50 transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-content {
  transform: scale(0.95) translateY(10px);
}
.modal-leave-to .modal-content {
  transform: scale(0.95) translateY(10px);
}
</style>
