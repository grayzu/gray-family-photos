<script setup lang="ts">
import { ref } from "vue";

type Invite = { id: string; token: string; email: string | null; expiresAt: number };

const email = ref("");
const created = ref<Invite | null>(null);
const error = ref<string | null>(null);
const submitting = ref(false);

async function create() {
  error.value = null;
  submitting.value = true;
  try {
    const res = await fetch("/api/invites", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.value || null }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    created.value = (await res.json()) as Invite;
    email.value = "";
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "create failed";
  } finally {
    submitting.value = false;
  }
}

const signupLink = (token: string) => `${window.location.origin}/signup?token=${token}`;

async function copyLink() {
  if (!created.value) return;
  await navigator.clipboard.writeText(signupLink(created.value.token));
}
</script>

<template>
  <div class="max-w-lg mx-auto bg-white p-6 rounded-lg shadow border border-slate-200">
    <h1 class="text-xl font-semibold mb-4">Create invite</h1>
    <form @submit.prevent="create" class="space-y-3">
      <label class="block">
        <span class="text-sm text-slate-600">Email (optional, for your records)</span>
        <input
          v-model="email"
          type="email"
          class="mt-1 block w-full rounded border-slate-300 border px-3 py-2"
        />
      </label>
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      <button
        type="submit"
        :disabled="submitting"
        class="w-full bg-slate-900 text-white rounded py-2 disabled:opacity-50"
      >
        Generate invite
      </button>
    </form>

    <div v-if="created" class="mt-6 border-t border-slate-200 pt-4">
      <p class="text-sm text-slate-600 mb-2">Send this link to the invitee:</p>
      <div class="flex gap-2">
        <input
          readonly
          :value="signupLink(created.token)"
          class="flex-1 font-mono text-xs px-2 py-1 border border-slate-300 rounded"
        />
        <button @click="copyLink" class="px-3 py-1 text-sm border border-slate-300 rounded">
          Copy
        </button>
      </div>
      <p class="text-xs text-slate-500 mt-2">
        Expires {{ new Date(created.expiresAt * 1000).toLocaleString() }}
      </p>
    </div>
  </div>
</template>
