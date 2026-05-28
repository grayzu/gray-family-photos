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
const lastInvite = ref<{ email: string; invited: boolean; inviteError: string | null } | null>(null);

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
    const data = (await res.json().catch(() => ({}))) as {
      email?: string;
      invited?: boolean;
      inviteError?: string | null;
    };
    lastInvite.value = {
      email: data.email ?? newEmail.value,
      invited: Boolean(data.invited),
      inviteError: data.inviteError ?? null,
    };
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
    <div class="bg-surface p-6 rounded-lg shadow border border-border-subtle">
      <h1 class="text-xl font-semibold mb-2 text-text-primary">Invite family member</h1>
      <p class="text-sm text-text-muted mb-4">
        Adding an email to the allowlist lets that person sign in with a code
        sent to their inbox. The first time they sign in, an account is
        created automatically.
      </p>
      <form @submit.prevent="add" class="space-y-3">
        <label class="block">
          <span class="text-sm text-text-muted">Email</span>
          <input
            v-model="newEmail"
            type="email"
            required
            class="mt-1 block w-full rounded bg-surface-2 border border-border-subtle px-3 py-2 text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <label class="block">
          <span class="text-sm text-text-muted">Name</span>
          <input
            v-model="newName"
            type="text"
            required
            class="mt-1 block w-full rounded bg-surface-2 border border-border-subtle px-3 py-2 text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <label class="flex items-center gap-2 text-sm text-text-muted">
          <input v-model="newIsAdmin" type="checkbox" class="accent-accent" />
          <span>Grant admin access (can manage allowlist)</span>
        </label>
        <p v-if="error" class="text-sm text-coral">{{ error }}</p>
        <div
          v-if="lastInvite"
          :class="[
            'text-sm rounded border px-3 py-2',
            lastInvite.invited
              ? 'border-turquoise text-turquoise bg-turquoise/10'
              : 'border-coral text-coral bg-coral/10',
          ]"
        >
          <template v-if="lastInvite.invited">
            Invitation email sent to {{ lastInvite.email }}.
          </template>
          <template v-else>
            Added {{ lastInvite.email }} to allowlist, but invite email failed:
            {{ lastInvite.inviteError ?? "unknown error" }}.
            They can still sign in at /login by entering their email manually.
          </template>
        </div>
        <button
          type="submit"
          :disabled="submitting"
          class="w-full bg-accent hover:bg-accent-hover text-base font-medium rounded py-2 disabled:opacity-50 transition-colors"
        >
          Add
        </button>
      </form>
    </div>

    <div class="bg-surface p-6 rounded-lg shadow border border-border-subtle">
      <h2 class="text-lg font-semibold mb-3 text-text-primary">Allowlist (pending first sign-in)</h2>
      <p v-if="loading" class="text-text-muted">Loading...</p>
      <p v-else-if="list.length === 0" class="text-text-muted">
        No pending invitations.
      </p>
      <ul v-else class="divide-y divide-border-subtle">
        <li v-for="row in list" :key="row.email" class="py-3 flex items-center justify-between">
          <div>
            <div class="font-medium text-text-primary">{{ row.name }}</div>
            <div class="text-sm text-text-muted">{{ row.email }}<span v-if="row.isAdmin" class="ml-2 text-xs text-turquoise">admin</span></div>
          </div>
          <button @click="remove(row.email)" class="text-sm text-coral hover:underline">
            Remove
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
