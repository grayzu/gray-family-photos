<script setup lang="ts">
import { ref, watch } from "vue";
import LocationPromptModal, {
  type LocationCandidate,
} from "@/components/LocationPromptModal.vue";

const props = defineProps<{
  open: boolean;
  photoId: string;
  takenAt: number | null;
  locationDisplay: string | null;
}>();

const emit = defineEmits<{
  (e: "saved"): void;
  (e: "cancel"): void;
}>();

const dateValue = ref<string>("");
const location = ref<LocationCandidate | null>(null);
const locationLabel = ref<string | null>(null);
const showLocationPicker = ref(false);
const submitting = ref(false);
const error = ref<string | null>(null);

function isoFromUnix(taken: number | null): string {
  if (!taken) return "";
  const d = new Date(taken * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

watch(
  () => props.open,
  (v) => {
    if (v) {
      dateValue.value = isoFromUnix(props.takenAt);
      location.value = null;
      locationLabel.value = props.locationDisplay;
      error.value = null;
    }
  },
);

function onPickedLocation(c: LocationCandidate) {
  location.value = c;
  locationLabel.value = c.display;
  showLocationPicker.value = false;
}

async function save() {
  error.value = null;
  submitting.value = true;
  try {
    const body: Record<string, unknown> = {};
    if (dateValue.value) {
      body.takenAt = Math.floor(new Date(dateValue.value).getTime() / 1000);
    } else {
      body.takenAt = null;
    }
    if (location.value) {
      body.latitude = location.value.lat;
      body.longitude = location.value.lon;
      body.locationDisplay = location.value.display;
      body.locationName = location.value.name;
      if (location.value.countryCode) body.locationCountry = location.value.countryCode;
    }
    const res = await fetch(`/api/photos/${props.photoId}`, {
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
    data-test="edit-modal"
  >
    <div class="bg-surface rounded-lg shadow-xl border border-border-subtle max-w-md w-full p-6">
      <h2 class="text-lg font-semibold mb-1 text-text-primary">Edit photo</h2>
      <p class="text-sm text-text-muted mb-4">
        Change the date or location. Photo will be moved to a different album
        if the change affects its month or location.
      </p>

      <label class="block mb-3">
        <span class="text-sm text-text-muted">Date taken</span>
        <input
          v-model="dateValue"
          type="datetime-local"
          data-test="edit-date"
          class="mt-1 block w-full rounded bg-surface-2 border border-border-subtle px-3 py-2 text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </label>

      <div class="mb-3">
        <span class="text-sm text-text-muted block mb-1">Location</span>
        <div class="flex items-center gap-2">
          <span class="flex-1 text-sm text-text-primary truncate" data-test="edit-location-label">
            {{ locationLabel ?? "(none)" }}
          </span>
          <button
            type="button"
            @click="showLocationPicker = true"
            data-test="edit-location-change"
            class="text-sm px-3 py-1 border border-border-subtle text-text-primary hover:border-accent rounded"
          >
            Change
          </button>
        </div>
      </div>

      <p v-if="error" class="text-sm text-coral mb-3" data-test="edit-error">{{ error }}</p>

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
          :disabled="submitting"
          data-test="edit-save"
          class="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-base font-medium rounded disabled:opacity-50 transition-colors"
        >
          {{ submitting ? "Saving..." : "Save" }}
        </button>
      </div>

      <LocationPromptModal
        :open="showLocationPicker"
        @confirm="onPickedLocation"
        @cancel="showLocationPicker = false"
      />
    </div>
  </div>
</template>
