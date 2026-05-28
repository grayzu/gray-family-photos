<script setup lang="ts">
import { useToastStore } from "@/stores/toast";
import { TransitionGroup } from "vue";

const toastStore = useToastStore();
</script>

<template>
  <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none w-full max-w-sm px-4">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toastStore.toasts"
        :key="toast.id"
        :class="[
          'px-4 py-3 rounded-lg shadow-xl text-sm font-medium border pointer-events-auto flex items-center justify-between w-full backdrop-blur-md',
          toast.type === 'success' ? 'bg-surface-2/90 border-accent/30 text-accent' :
          toast.type === 'error' ? 'bg-surface-2/90 border-coral/30 text-coral' :
          'bg-surface-2/90 border-border-subtle text-text-primary'
        ]"
      >
        <span>{{ toast.message }}</span>
        <button
          @click="toastStore.removeToast(toast.id)"
          class="ml-3 text-current opacity-70 hover:opacity-100"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(1rem) scale(0.95);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-0.5rem) scale(0.95);
}
</style>
