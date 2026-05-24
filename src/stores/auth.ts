import { defineStore } from "pinia";
import { ref, computed } from "vue";

export type Me = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
};

export const useAuthStore = defineStore("auth", () => {
  const user = ref<Me | null>(null);
  const loaded = ref(false);

  const isAuthenticated = computed(() => user.value !== null);
  const isAdmin = computed(() => user.value?.isAdmin === true);

  async function fetchMe() {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (res.ok) {
      const data = (await res.json()) as { user: Me | null };
      user.value = data.user;
    } else {
      user.value = null;
    }
    loaded.value = true;
  }

  async function requestCode(email: string) {
    const res = await fetch("/api/auth/request-code", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? "request failed");
    }
  }

  async function verifyCode(email: string, code: string) {
    const res = await fetch("/api/auth/verify-code", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      const reason = err.error;
      if (reason === "locked") {
        throw new Error("Too many wrong attempts. Request a new code.");
      }
      throw new Error("That code didn't match. Please try again.");
    }
    user.value = (await res.json()) as Me;
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    user.value = null;
  }

  return {
    user,
    loaded,
    isAuthenticated,
    isAdmin,
    fetchMe,
    requestCode,
    verifyCode,
    logout,
  };
});
