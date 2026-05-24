<script setup lang="ts">
import { RouterLink, RouterView, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { onMounted } from "vue";

const auth = useAuthStore();
const router = useRouter();

onMounted(() => {
  if (!auth.loaded) auth.fetchMe();
});

async function handleLogout() {
  await auth.logout();
  router.push({ name: "login" });
}
</script>

<template>
  <div class="min-h-screen bg-base text-text-primary">
    <header v-if="auth.isAuthenticated" class="border-b border-border-subtle bg-surface">
      <nav class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <RouterLink to="/" class="font-semibold text-lg text-accent">Gray Family Photos</RouterLink>
        <div class="flex items-center gap-4 text-sm">
          <RouterLink
            to="/"
            class="text-text-muted hover:text-text-primary"
            active-class="text-text-primary"
          >
            Albums
          </RouterLink>
          <RouterLink
            to="/upload"
            class="text-text-muted hover:text-text-primary"
            active-class="text-text-primary"
          >
            Upload
          </RouterLink>
          <RouterLink
            v-if="auth.isAdmin"
            to="/admin"
            class="text-text-muted hover:text-text-primary"
            active-class="text-text-primary"
          >
            Admin
          </RouterLink>
          <span class="text-text-muted">{{ auth.user?.name }}</span>
          <button
            data-test="logout"
            class="text-text-muted hover:text-accent"
            @click="handleLogout"
          >
            Logout
          </button>
        </div>
      </nav>
    </header>
    <main class="max-w-6xl mx-auto px-4 py-8">
      <RouterView />
    </main>
  </div>
</template>
