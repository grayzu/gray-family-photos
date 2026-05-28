<script setup lang="ts">
import { ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const prefillEmail = typeof route.query.email === "string" ? route.query.email : "";

const stage = ref<"email" | "code">("email");
const email = ref(prefillEmail);
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
  <div class="-mx-4 -my-8 px-4 py-24 min-h-[calc(100vh-4rem)] flex items-center justify-center">
    <div class="max-w-sm mx-auto bg-surface/80 backdrop-blur-md p-8 rounded-2xl shadow-2xl border border-border-subtle w-full">
      <h1 class="text-3xl font-display font-bold mb-6 text-text-primary text-center">Sign in</h1>

      <Transition name="fade" mode="out-in">
      <form v-if="stage === 'email'" @submit.prevent="submitEmail" class="space-y-4">
        <label class="block">
          <span class="text-sm font-medium text-text-muted mb-1.5 block">Email address</span>
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
          class="w-full bg-accent hover:bg-accent-hover text-base font-medium rounded-lg py-2.5 disabled:opacity-50 transition-colors shadow-sm"
        >
          {{ submitting ? "Sending..." : "Send code" }}
        </button>
        <p class="text-xs text-text-muted text-center pt-2">
          You'll receive a secure 6-digit code by email.
        </p>
      </form>

      <form v-else @submit.prevent="submitCode" class="space-y-4">
        <p class="text-sm text-text-muted text-center mb-6">
          We sent a code to <br/><span class="font-medium text-text-primary">{{ email }}</span>
        </p>
        <label class="block">
          <span class="sr-only">6-digit code</span>
          <input
            data-test="code"
            v-model="code"
            type="text"
            required
            autocomplete="one-time-code"
            inputmode="numeric"
            pattern="[0-9]{6}"
            maxlength="6"
            placeholder="000000"
            class="block w-full rounded-lg bg-surface-2 border border-border-subtle px-3 py-3 font-mono text-2xl tracking-[0.5em] text-center text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <p v-if="error" data-test="error" class="text-sm text-coral text-center bg-coral/10 py-2 rounded">{{ error }}</p>
        <button
          data-test="verify"
          type="submit"
          :disabled="submitting || code.length !== 6"
          class="w-full bg-accent hover:bg-accent-hover text-base font-medium rounded-lg py-2.5 disabled:opacity-50 transition-colors shadow-sm"
        >
          {{ submitting ? "Verifying..." : "Verify & Sign in" }}
        </button>
        <div class="text-center pt-2">
          <button
            type="button"
            @click="backToEmail"
            class="text-sm text-text-muted hover:text-accent transition-colors"
          >
            Use a different email
          </button>
        </div>
      </form>
      </Transition>
    </div>
  </div>
</template>
