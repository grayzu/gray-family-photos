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

const SWIPE_THRESHOLD_PX = 50;
const touchStartX = ref<number | null>(null);
const touchStartY = ref<number | null>(null);

function onTouchStart(e: TouchEvent) {
  const t = e.touches[0];
  if (!t) return;
  touchStartX.value = t.clientX;
  touchStartY.value = t.clientY;
}

function onTouchEnd(e: TouchEvent) {
  if (touchStartX.value === null || touchStartY.value === null) return;
  const t = e.changedTouches[0];
  if (!t) return;
  const dx = t.clientX - touchStartX.value;
  const dy = t.clientY - touchStartY.value;
  touchStartX.value = null;
  touchStartY.value = null;
  if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
  if (Math.abs(dy) > Math.abs(dx)) return;
  if (dx < 0) next();
  else prev();
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
    class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center select-none"
    data-test="lightbox"
    @click="emit('close')"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
  >
    <button
      data-test="lightbox-prev"
      @click.stop="prev"
      aria-label="Previous"
      class="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 text-white text-3xl bg-black/40 hover:bg-black/70 w-12 h-12 rounded-full flex items-center justify-center"
    >
      ‹
    </button>

    <button
      data-test="lightbox-next"
      @click.stop="next"
      aria-label="Next"
      class="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-white text-3xl bg-black/40 hover:bg-black/70 w-12 h-12 rounded-full flex items-center justify-center"
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
      class="max-w-[95vw] max-h-[90vh] object-contain pointer-events-none"
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
