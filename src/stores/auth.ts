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

  async function login(email: string, password: string) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? "login failed");
    }
    user.value = (await res.json()) as Me;
  }

  async function signup(input: { email: string; password: string; name: string; invite?: string }) {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? "signup failed");
    }
    user.value = (await res.json()) as Me;
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    user.value = null;
  }

  return { user, loaded, isAuthenticated, isAdmin, fetchMe, login, signup, logout };
});
