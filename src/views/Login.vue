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
  <div class="bg-forest-radial -mx-4 -my-8 px-4 py-16 min-h-[calc(100vh-4rem)]">
    <div class="max-w-sm mx-auto bg-surface p-6 rounded-lg shadow-xl border border-border-subtle">
      <h1 class="text-xl font-semibold mb-4 text-text-primary">Sign in</h1>

      <form v-if="stage === 'email'" @submit.prevent="submitEmail" class="space-y-3">
        <label class="block">
          <span class="text-sm text-text-muted">Email</span>
          <input
            data-test="email"
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="mt-1 block w-full rounded bg-surface-2 border border-border-subtle px-3 py-2 text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <p v-if="error" data-test="error" class="text-sm text-coral">{{ error }}</p>
        <button
          data-test="send-code"
          type="submit"
          :disabled="submitting"
          class="w-full bg-accent hover:bg-accent-hover text-base font-medium rounded py-2 disabled:opacity-50 transition-colors"
        >
          {{ submitting ? "Sending..." : "Send code" }}
        </button>
        <p class="text-xs text-text-muted">
          You'll receive a 6-digit code by email.
        </p>
      </form>

      <form v-else @submit.prevent="submitCode" class="space-y-3">
        <p class="text-sm text-text-muted">
          Sent a code to <span class="font-medium text-text-primary">{{ email }}</span>.
          Check your inbox.
        </p>
        <label class="block">
          <span class="text-sm text-text-muted">6-digit code</span>
          <input
            data-test="code"
            v-model="code"
            type="text"
            required
            autocomplete="one-time-code"
            inputmode="numeric"
            pattern="[0-9]{6}"
            maxlength="6"
            class="mt-1 block w-full rounded bg-surface-2 border border-border-subtle px-3 py-2 font-mono text-lg tracking-widest text-center text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <p v-if="error" data-test="error" class="text-sm text-coral">{{ error }}</p>
        <button
          data-test="verify"
          type="submit"
          :disabled="submitting || code.length !== 6"
          class="w-full bg-accent hover:bg-accent-hover text-base font-medium rounded py-2 disabled:opacity-50 transition-colors"
        >
          {{ submitting ? "Verifying..." : "Sign in" }}
        </button>
        <button
          type="button"
          @click="backToEmail"
          class="w-full text-sm text-text-muted hover:text-accent underline"
        >
          Use a different email
        </button>
      </form>
    </div>
  </div>
</template>
