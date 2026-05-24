<script setup lang="ts">
import { ref, onMounted } from "vue";

type AllowedEmail = {
  email: string;
  name: string;
  isAdmin: boolean;
  addedAt: number;
};

const list = ref<AllowedEmail[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const newEmail = ref("");
const newName = ref("");
const newIsAdmin = ref(false);
const submitting = ref(false);

async function refresh() {
  loading.value = true;
  try {
    const res = await fetch("/api/admin/allowed-emails", { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    list.value = (await res.json()) as AllowedEmail[];
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "load failed";
  } finally {
    loading.value = false;
  }
}

async function add() {
  error.value = null;
  submitting.value = true;
  try {
    const res = await fetch("/api/admin/allowed-emails", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: newEmail.value,
        name: newName.value,
        isAdmin: newIsAdmin.value,
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    newEmail.value = "";
    newName.value = "";
    newIsAdmin.value = false;
    await refresh();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "add failed";
  } finally {
    submitting.value = false;
  }
}

async function remove(email: string) {
  if (!confirm(`Remove ${email} from the allowlist?`)) return;
  await fetch(`/api/admin/allowed-emails/${encodeURIComponent(email)}`, {
    method: "DELETE",
    credentials: "include",
  });
  await refresh();
}

onMounted(refresh);
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <div class="bg-white p-6 rounded-lg shadow border border-slate-200">
      <h1 class="text-xl font-semibold mb-2">Invite family member</h1>
      <p class="text-sm text-slate-500 mb-4">
        Adding an email to the allowlist lets that person sign in with a code
        sent to their inbox. The first time they sign in, an account is
        created automatically.
      </p>
      <form @submit.prevent="add" class="space-y-3">
        <label class="block">
          <span class="text-sm text-slate-600">Email</span>
          <input
            v-model="newEmail"
            type="email"
            required
            class="mt-1 block w-full rounded border-slate-300 border px-3 py-2"
          />
        </label>
        <label class="block">
          <span class="text-sm text-slate-600">Name</span>
          <input
            v-model="newName"
            type="text"
            required
            class="mt-1 block w-full rounded border-slate-300 border px-3 py-2"
          />
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="newIsAdmin" type="checkbox" />
          <span>Grant admin access (can manage allowlist)</span>
        </label>
        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        <button
          type="submit"
          :disabled="submitting"
          class="w-full bg-slate-900 text-white rounded py-2 disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>

    <div class="bg-white p-6 rounded-lg shadow border border-slate-200">
      <h2 class="text-lg font-semibold mb-3">Allowlist (pending first sign-in)</h2>
      <p v-if="loading" class="text-slate-500">Loading...</p>
      <p v-else-if="list.length === 0" class="text-slate-500">
        No pending invitations.
      </p>
      <ul v-else class="divide-y divide-slate-200">
        <li v-for="row in list" :key="row.email" class="py-3 flex items-center justify-between">
          <div>
            <div class="font-medium">{{ row.name }}</div>
            <div class="text-sm text-slate-500">{{ row.email }}<span v-if="row.isAdmin" class="ml-2 text-xs text-slate-400">admin</span></div>
          </div>
          <button @click="remove(row.email)" class="text-sm text-red-600 underline">
            Remove
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
