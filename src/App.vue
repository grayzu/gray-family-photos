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
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <header v-if="auth.isAuthenticated" class="border-b border-slate-200 bg-white">
      <nav class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <RouterLink to="/" class="font-semibold text-lg">Gray Family Photos</RouterLink>
        <div class="flex items-center gap-4 text-sm">
          <RouterLink to="/" class="hover:underline">Home</RouterLink>
          <RouterLink to="/upload" class="hover:underline">Upload</RouterLink>
          <RouterLink v-if="auth.isAdmin" to="/admin" class="hover:underline">Admin</RouterLink>
          <span class="text-slate-500">{{ auth.user?.name }}</span>
          <button
            data-test="logout"
            class="text-slate-700 hover:text-slate-900 underline"
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
