<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const file = ref<File | null>(null);
const progress = ref<"idle" | "uploading" | "done" | "error">("idle");
const error = ref<string | null>(null);

function onSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  file.value = input.files?.[0] ?? null;
}

async function submit() {
  if (!file.value) return;
  progress.value = "uploading";
  error.value = null;
  const fd = new FormData();
  fd.append("file", file.value);
  try {
    const res = await fetch("/api/photos/upload", {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    progress.value = "done";
    router.push("/");
  } catch (e: unknown) {
    progress.value = "error";
    error.value = e instanceof Error ? e.message : "upload failed";
  }
}
</script>

<template>
  <div class="max-w-lg mx-auto bg-white p-6 rounded-lg shadow border border-slate-200">
    <h1 class="text-xl font-semibold mb-4">Upload a photo</h1>
    <form @submit.prevent="submit" class="space-y-4">
      <input
        data-test="file"
        type="file"
        accept="image/*"
        @change="onSelect"
        required
        class="block w-full text-sm"
      />
      <p v-if="error" class="text-sm text-red-600" data-test="error">{{ error }}</p>
      <button
        data-test="submit"
        type="submit"
        :disabled="!file || progress === 'uploading'"
        class="w-full bg-slate-900 text-white rounded py-2 disabled:opacity-50"
      >
        {{ progress === "uploading" ? "Uploading..." : "Upload" }}
      </button>
    </form>
  </div>
</template>
