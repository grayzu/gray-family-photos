<script setup lang="ts">
import { onMounted, ref } from "vue";

type AlbumOption = {
  id: string;
  name: string;
  year: number;
  month: number;
  photoCount: number;
};

const props = defineProps<{
  open: boolean;
  currentAlbumId: string;
}>();

const emit = defineEmits<{
  (e: "select", albumId: string): void;
  (e: "cancel"): void;
}>();

const albums = ref<AlbumOption[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const selectedId = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await fetch("/api/albums", { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const all = (await res.json()) as AlbumOption[];
    albums.value = all.filter((a) => a.id !== props.currentAlbumId);
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "load failed";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (props.open) load();
});

function pick(id: string) {
  selectedId.value = id;
}

function confirm() {
  if (selectedId.value) emit("select", selectedId.value);
}
</script>

<template>
  <Transition name="modal">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      data-test="move-modal"
    >
      <div
        class="bg-surface rounded-xl shadow-2xl border border-border-subtle max-w-md w-full p-6 modal-content"
      >
        <h2 class="text-lg font-semibold mb-1 text-text-primary">
          Move to album
        </h2>
        <p class="text-sm text-text-muted mb-4">
          Pick the album to move this photo to. Only your other albums are
          shown.
        </p>

        <p v-if="loading" class="text-sm text-text-muted">Loading...</p>
        <p v-else-if="error" class="text-sm text-coral" data-test="move-error">
          {{ error }}
        </p>
        <p
          v-else-if="albums.length === 0"
          class="text-sm text-text-muted"
          data-test="move-empty"
        >
          No other albums to move to.
        </p>
        <ul
          v-else
          class="max-h-60 overflow-y-auto divide-y divide-border-subtle"
        >
          <li v-for="a in albums" :key="a.id">
            <button
              type="button"
              @click="pick(a.id)"
              :class="[
                'w-full text-left p-2 text-sm rounded transition-colors',
                selectedId === a.id
                  ? 'bg-accent text-base'
                  : 'text-text-primary hover:bg-surface-2',
              ]"
              data-test="move-option"
            >
              <div class="font-medium">{{ a.name }}</div>
              <div
                :class="[
                  'text-xs',
                  selectedId === a.id ? 'text-base/70' : 'text-text-muted',
                ]"
              >
                {{ a.photoCount }} photo{{ a.photoCount === 1 ? "" : "s" }}
              </div>
            </button>
          </li>
        </ul>

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
            :disabled="!selectedId"
            data-test="move-confirm"
            class="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-base font-medium rounded disabled:opacity-50 transition-colors"
          >
            Move
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
