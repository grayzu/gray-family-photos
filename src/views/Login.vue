<script setup lang="ts">
import { ref, reactive } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const form = reactive({ email: "", password: "" });
const error = ref<string | null>(null);
const submitting = ref(false);

async function submit() {
  error.value = null;
  submitting.value = true;
  try {
    await auth.login(form.email, form.password);
    const redirect = (route.query.redirect as string) || "/";
    router.push(redirect);
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "login failed";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="max-w-sm mx-auto bg-white p-6 rounded-lg shadow border border-slate-200">
    <h1 class="text-xl font-semibold mb-4">Log in</h1>
    <form @submit.prevent="submit" class="space-y-3">
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
        <span class="text-sm text-slate-600">Password</span>
        <input
          data-test="password"
          v-model="form.password"
          type="password"
          required
          autocomplete="current-password"
          class="mt-1 block w-full rounded border-slate-300 border px-3 py-2"
        />
      </label>
      <p v-if="error" data-test="error" class="text-sm text-red-600">{{ error }}</p>
      <button
        data-test="submit"
        type="submit"
        :disabled="submitting"
        class="w-full bg-slate-900 text-white rounded py-2 disabled:opacity-50"
      >
        {{ submitting ? "Logging in..." : "Log in" }}
      </button>
    </form>
    <p class="text-sm text-slate-500 mt-4">
      No account?
      <RouterLink to="/signup" class="text-slate-900 underline">Sign up</RouterLink>
    </p>
  </div>
</template>
