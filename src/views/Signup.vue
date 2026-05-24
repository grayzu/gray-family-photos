<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const form = reactive({ email: "", password: "", name: "", invite: "" });
const error = ref<string | null>(null);
const submitting = ref(false);

onMounted(() => {
  const token = route.query.token;
  if (typeof token === "string") form.invite = token;
});

async function submit() {
  error.value = null;
  submitting.value = true;
  try {
    await auth.signup({
      email: form.email,
      password: form.password,
      name: form.name,
      invite: form.invite || undefined,
    });
    router.push("/");
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "signup failed";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="max-w-sm mx-auto bg-white p-6 rounded-lg shadow border border-slate-200">
    <h1 class="text-xl font-semibold mb-4">Sign up</h1>
    <form @submit.prevent="submit" class="space-y-3">
      <label class="block">
        <span class="text-sm text-slate-600">Name</span>
        <input
          data-test="name"
          v-model="form.name"
          type="text"
          required
          class="mt-1 block w-full rounded border-slate-300 border px-3 py-2"
        />
      </label>
      <label class="block">
        <span class="text-sm text-slate-600">Email</span>
        <input
          data-test="email"
          v-model="form.email"
          type="email"
          required
          autocomplete="email"
          class="mt-1 block w-full rounded border-slate-300 border px-3 py-2"
        />
      </label>
      <label class="block">
        <span class="text-sm text-slate-600">Password (min 8 chars)</span>
        <input
          data-test="password"
          v-model="form.password"
          type="password"
          required
          minlength="8"
          autocomplete="new-password"
          class="mt-1 block w-full rounded border-slate-300 border px-3 py-2"
        />
      </label>
      <label class="block">
        <span class="text-sm text-slate-600">Invite token (required unless first user)</span>
        <input
          data-test="invite"
          v-model="form.invite"
          type="text"
          class="mt-1 block w-full rounded border-slate-300 border px-3 py-2 font-mono text-xs"
        />
      </label>
      <p v-if="error" data-test="error" class="text-sm text-red-600">{{ error }}</p>
      <button
        data-test="submit"
        type="submit"
        :disabled="submitting"
        class="w-full bg-slate-900 text-white rounded py-2 disabled:opacity-50"
      >
        {{ submitting ? "Creating..." : "Create account" }}
      </button>
    </form>
    <p class="text-sm text-slate-500 mt-4">
      Already have an account?
      <RouterLink to="/login" class="text-slate-900 underline">Log in</RouterLink>
    </p>
  </div>
</template>
