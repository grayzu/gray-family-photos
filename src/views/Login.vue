<script setup lang="ts">
import { ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const stage = ref<"email" | "code">("email");
const email = ref("");
const code = ref("");
const error = ref<string | null>(null);
const submitting = ref(false);

async function submitEmail() {
  error.value = null;
  submitting.value = true;
  try {
    await auth.requestCode(email.value);
    stage.value = "code";
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "request failed";
  } finally {
    submitting.value = false;
  }
}

async function submitCode() {
  error.value = null;
  submitting.value = true;
  try {
    await auth.verifyCode(email.value, code.value);
    const redirect = (route.query.redirect as string) || "/";
    router.push(redirect);
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "verify failed";
    code.value = "";
  } finally {
    submitting.value = false;
  }
}

function backToEmail() {
  stage.value = "email";
  code.value = "";
  error.value = null;
}
</script>

<template>
  <div class="max-w-sm mx-auto bg-white p-6 rounded-lg shadow border border-slate-200">
    <h1 class="text-xl font-semibold mb-4">Sign in</h1>

    <form v-if="stage === 'email'" @submit.prevent="submitEmail" class="space-y-3">
      <label class="block">
        <span class="text-sm text-slate-600">Email</span>
        <input
          data-test="email"
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="mt-1 block w-full rounded border-slate-300 border px-3 py-2"
        />
      </label>
      <p v-if="error" data-test="error" class="text-sm text-red-600">{{ error }}</p>
      <button
        data-test="send-code"
        type="submit"
        :disabled="submitting"
        class="w-full bg-slate-900 text-white rounded py-2 disabled:opacity-50"
      >
        {{ submitting ? "Sending..." : "Send code" }}
      </button>
      <p class="text-xs text-slate-500">
        You'll receive a 6-digit code by email.
      </p>
    </form>

    <form v-else @submit.prevent="submitCode" class="space-y-3">
      <p class="text-sm text-slate-600">
        Sent a code to <span class="font-medium text-slate-900">{{ email }}</span>.
        Check your inbox.
      </p>
      <label class="block">
        <span class="text-sm text-slate-600">6-digit code</span>
        <input
          data-test="code"
          v-model="code"
          type="text"
          required
          autocomplete="one-time-code"
          inputmode="numeric"
          pattern="[0-9]{6}"
          maxlength="6"
          class="mt-1 block w-full rounded border-slate-300 border px-3 py-2 font-mono text-lg tracking-widest text-center"
        />
      </label>
      <p v-if="error" data-test="error" class="text-sm text-red-600">{{ error }}</p>
      <button
        data-test="verify"
        type="submit"
        :disabled="submitting || code.length !== 6"
        class="w-full bg-slate-900 text-white rounded py-2 disabled:opacity-50"
      >
        {{ submitting ? "Verifying..." : "Sign in" }}
      </button>
      <button
        type="button"
        @click="backToEmail"
        class="w-full text-sm text-slate-500 underline"
      >
        Use a different email
      </button>
    </form>
  </div>
</template>
