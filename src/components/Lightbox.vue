<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";

export type LightboxPhoto = {
  id: string;
  originalUrl: string;
  thumbnailUrl: string;
  takenAt: number | null;
};

const props = defineProps<{
  photos: LightboxPhoto[];
  index: number | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "navigate", index: number): void;
}>();

const current = computed(() =>
  props.index === null ? null : (props.photos[props.index] ?? null),
);

function prev() {
  if (props.index === null) return;
  const next = props.index <= 0 ? props.photos.length - 1 : props.index - 1;
  emit("navigate", next);
}

function next() {
  if (props.index === null) return;
  const nextIdx = props.index >= props.photos.length - 1 ? 0 : props.index + 1;
  emit("navigate", nextIdx);
}

function onKey(e: KeyboardEvent) {
  if (props.index === null) return;
  if (e.key === "ArrowLeft") prev();
  else if (e.key === "ArrowRight") next();
  else if (e.key === "Escape") emit("close");
}

onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

watch(
  () => props.index,
  (idx) => {
    if (idx !== null) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
  },
);

function formatDate(taken: number | null) {
  if (!taken) return "Date unknown";
  return new Date(taken * 1000).toLocaleString();
}
</script>

<template>
  <div
    v-if="current !== null && index !== null"
    class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
    data-test="lightbox"
    @click="emit('close')"
  >
    <button
      data-test="lightbox-prev"
      @click.stop="prev"
      aria-label="Previous"
      class="absolute left-4 top-1/2 -translate-y-1/2 text-white text-3xl bg-black/40 hover:bg-black/70 w-12 h-12 rounded-full flex items-center justify-center"
    >
      ‹
    </button>

    <button
      data-test="lightbox-next"
      @click.stop="next"
      aria-label="Next"
      class="absolute right-4 top-1/2 -translate-y-1/2 text-white text-3xl bg-black/40 hover:bg-black/70 w-12 h-12 rounded-full flex items-center justify-center"
    >
      ›
    </button>

    <button
      data-test="lightbox-close"
      @click.stop="emit('close')"
      aria-label="Close"
      class="absolute top-4 right-4 text-white bg-black/40 hover:bg-black/70 w-10 h-10 rounded-full flex items-center justify-center"
    >
      ✕
    </button>

    <div class="absolute top-4 left-4 text-white text-sm bg-black/40 px-3 py-1 rounded">
      {{ index + 1 }} / {{ photos.length }}
    </div>

    <img
      :src="current.originalUrl"
      :alt="`Photo ${current.id}`"
      class="max-w-[95vw] max-h-[90vh] object-contain"
      @click.stop
    />

    <div class="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-2 rounded flex items-center gap-3">
      <span>{{ formatDate(current.takenAt) }}</span>
      <a
        :href="current.originalUrl"
        :download="`photo-${current.id}.jpg`"
        target="_blank"
        rel="noopener"
        @click.stop
        class="underline hover:no-underline"
        data-test="lightbox-download"
      >
        Download
      </a>
    </div>
  </div>
</template>
