<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  open: boolean;
  fileName?: string;
}>();

const emit = defineEmits<{
  (e: "confirm", takenAtUnix: number): void;
  (e: "cancel"): void;
}>();

const dateValue = ref<string>("");

watch(
  () => props.open,
  (v) => {
    if (v) {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      dateValue.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }
  },
);

function confirm() {
  if (!dateValue.value) return;
  const ts = Math.floor(new Date(dateValue.value).getTime() / 1000);
  if (!Number.isFinite(ts)) return;
  emit("confirm", ts);
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    data-test="date-modal"
  >
    <div class="bg-surface rounded-lg shadow-xl border border-border-subtle max-w-md w-full p-6">
      <h2 class="text-lg font-semibold mb-1 text-text-primary">When was this taken?</h2>
      <p class="text-sm text-text-muted mb-4">
        {{ fileName ?? "This photo" }} doesn't have a date in its EXIF data.
        Pick when it was taken.
      </p>

      <input
        v-model="dateValue"
        type="datetime-local"
        data-test="date-input"
        class="block w-full rounded bg-surface-2 border border-border-subtle px-3 py-2 text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />

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
          :disabled="!dateValue"
          data-test="date-confirm"
          class="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-base font-medium rounded disabled:opacity-50 transition-colors"
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
</template>
