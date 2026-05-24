<script setup lang="ts">
import { RouterLink, RouterView, useRouter, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { onMounted, ref, watch } from "vue";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const mobileNavOpen = ref(false);

onMounted(() => {
  if (!auth.loaded) auth.fetchMe();
});

async function handleLogout() {
  mobileNavOpen.value = false;
  await auth.logout();
  router.push({ name: "login" });
}

watch(() => route.fullPath, () => {
  mobileNavOpen.value = false;
});
</script>

<template>
  <div class="min-h-screen bg-base text-text-primary">
    <header v-if="auth.isAuthenticated" class="border-b border-border-subtle bg-surface">
      <nav class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <RouterLink to="/" class="font-semibold text-lg text-accent">Gray Family Photos</RouterLink>

        <div class="hidden md:flex items-center gap-4 text-sm">
          <RouterLink to="/" class="text-text-muted hover:text-text-primary" active-class="text-text-primary">
            Albums
          </RouterLink>
          <RouterLink to="/upload" class="text-text-muted hover:text-text-primary" active-class="text-text-primary">
            Upload
          </RouterLink>
          <RouterLink v-if="auth.isAdmin" to="/admin" class="text-text-muted hover:text-text-primary" active-class="text-text-primary">
            Admin
          </RouterLink>
          <span class="text-text-muted">{{ auth.user?.name }}</span>
          <button data-test="logout" class="text-text-muted hover:text-accent" @click="handleLogout">
            Logout
          </button>
        </div>

        <button
          @click="mobileNavOpen = !mobileNavOpen"
          class="md:hidden w-10 h-10 inline-flex items-center justify-center text-text-primary hover:text-accent"
          :aria-expanded="mobileNavOpen"
          aria-label="Toggle navigation"
          data-test="mobile-nav-toggle"
        >
          <svg v-if="!mobileNavOpen" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
          <svg v-else class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="6" y1="18" x2="18" y2="6" />
          </svg>
        </button>
      </nav>

      <div
        v-if="mobileNavOpen"
        class="md:hidden border-t border-border-subtle bg-surface"
        data-test="mobile-nav"
      >
        <div class="max-w-6xl mx-auto px-4 py-2 flex flex-col text-base">
          <RouterLink
            to="/"
            class="py-3 text-text-muted active:bg-surface-2"
            active-class="text-text-primary"
            @click="mobileNavOpen = false"
          >
            Albums
          </RouterLink>
          <RouterLink
            to="/upload"
            class="py-3 text-text-muted active:bg-surface-2"
            active-class="text-text-primary"
            @click="mobileNavOpen = false"
          >
            Upload
          </RouterLink>
          <RouterLink
            v-if="auth.isAdmin"
            to="/admin"
            class="py-3 text-text-muted active:bg-surface-2"
            active-class="text-text-primary"
            @click="mobileNavOpen = false"
          >
            Admin
          </RouterLink>
          <div class="py-3 border-t border-border-subtle text-text-muted text-sm">
            {{ auth.user?.name }}
          </div>
          <button
            data-test="logout-mobile"
            class="py-3 text-left text-coral"
            @click="handleLogout"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
    <main class="max-w-6xl mx-auto px-4 py-8">
      <RouterView />
    </main>
  </div>
</template>
