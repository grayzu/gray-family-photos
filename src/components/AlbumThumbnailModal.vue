<script setup lang="ts">
import { computed, ref, watch } from "vue";

type Photo = {
  id: string;
  thumbnailUrl: string;
};

const props = defineProps<{
  open: boolean;
  albumId: string;
  photos: Photo[];
  currentCoverPhotoId: string | null;
  currentCollagePhotoIds: string[] | null;
  currentMode: "single" | "collage";
}>();

const emit = defineEmits<{
  (e: "saved"): void;
  (e: "cancel"): void;
}>();

const mode = ref<"single" | "collage">("single");
const selectedIds = ref<string[]>([]);
const submitting = ref(false);
const error = ref<string | null>(null);

const requiredCount = computed(() => (mode.value === "single" ? 1 : 4));
const canConfirm = computed(() => selectedIds.value.length === requiredCount.value);

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    mode.value = props.currentMode;
    if (props.currentMode === "collage" && props.currentCollagePhotoIds) {
      selectedIds.value = props.currentCollagePhotoIds.slice(0, 4);
    } else if (props.currentCoverPhotoId) {
      selectedIds.value = [props.currentCoverPhotoId];
    } else {
      selectedIds.value = [];
    }
    error.value = null;
  },
);

function setMode(m: "single" | "collage") {
  if (mode.value === m) return;
  mode.value = m;
  if (m === "single" && selectedIds.value.length > 1) {
    selectedIds.value = selectedIds.value.slice(0, 1);
  }
  error.value = null;
}

function toggle(id: string) {
  const idx = selectedIds.value.indexOf(id);
  if (idx >= 0) {
    selectedIds.value = selectedIds.value.filter((x) => x !== id);
    return;
  }
  if (mode.value === "single") {
    selectedIds.value = [id];
  } else {
    if (selectedIds.value.length >= 4) {
      selectedIds.value = [...selectedIds.value.slice(1), id];
    } else {
      selectedIds.value = [...selectedIds.value, id];
    }
  }
}

function orderIndex(id: string): number {
  const i = selectedIds.value.indexOf(id);
  return i >= 0 ? i + 1 : 0;
}

async function save() {
  if (!canConfirm.value) return;
  submitting.value = true;
  error.value = null;
  try {
    const body =
      mode.value === "single"
        ? { coverMode: "single", coverPhotoId: selectedIds.value[0] }
        : { coverMode: "collage", collagePhotoIds: selectedIds.value };
    const res = await fetch(`/api/albums/${props.albumId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    emit("saved");
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "save failed";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    data-test="thumbnail-modal"
  >
    <div class="bg-surface rounded-lg shadow-xl border border-border-subtle max-w-2xl w-full p-6">
      <h2 class="text-lg font-semibold mb-1 text-text-primary">Set album thumbnail</h2>
      <p class="text-sm text-text-muted mb-4">
        Pick a single photo for the cover, or four photos for a 2×2 collage.
      </p>

      <div class="flex gap-2 mb-4 text-sm">
        <button
          type="button"
          @click="setMode('single')"
          data-test="thumbnail-mode-single"
          :class="[
            'px-3 py-1.5 rounded border',
            mode === 'single'
              ? 'bg-accent text-base border-accent'
              : 'text-text-primary border-border-subtle hover:border-accent',
          ]"
        >
          Single (1 photo)
        </button>
        <button
          type="button"
          @click="setMode('collage')"
          data-test="thumbnail-mode-collage"
          :class="[
            'px-3 py-1.5 rounded border',
            mode === 'collage'
              ? 'bg-accent text-base border-accent'
              : 'text-text-primary border-border-subtle hover:border-accent',
          ]"
        >
          Collage (4 photos)
        </button>
        <div class="flex-1"></div>
        <span class="text-text-muted self-center">
          {{ selectedIds.length }} / {{ requiredCount }} selected
        </span>
      </div>

      <div
        class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[50vh] overflow-y-auto p-1"
      >
        <button
          v-for="p in photos"
          :key="p.id"
          type="button"
          @click="toggle(p.id)"
          :class="[
            'relative block aspect-square overflow-hidden rounded border-2 transition-colors',
            selectedIds.includes(p.id)
              ? 'border-accent'
              : 'border-border-subtle hover:border-accent/60',
          ]"
          data-test="thumbnail-photo"
        >
          <img
            :src="p.thumbnailUrl"
            :alt="`Photo ${p.id}`"
            loading="lazy"
            class="w-full h-full object-cover"
          />
          <span
            v-if="selectedIds.includes(p.id)"
            class="absolute top-1 right-1 w-6 h-6 rounded-full bg-accent text-base text-xs font-medium flex items-center justify-center"
          >
            {{ mode === "collage" ? orderIndex(p.id) : "✓" }}
          </span>
        </button>
      </div>

      <p v-if="error" class="text-sm text-coral mt-3" data-test="thumbnail-error">{{ error }}</p>

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
          @click="save"
          :disabled="!canConfirm || submitting"
          data-test="thumbnail-save"
          class="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-base font-medium rounded disabled:opacity-50 transition-colors"
        >
          {{ submitting ? "Saving..." : "Save thumbnail" }}
        </button>
      </div>
    </div>
  </div>
</template>
