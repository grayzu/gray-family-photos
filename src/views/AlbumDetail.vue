<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import Lightbox, { type LightboxPhoto } from "@/components/Lightbox.vue";

type PhotoInAlbum = LightboxPhoto & {
  thumbnailUrl: string;
  width: number;
  height: number;
  uploadedAt: number;
  locationDisplay: string | null;
};

type ShareLink = {
  id: string;
  token: string;
  albumId: string;
  createdAt: number;
  expiresAt: number | null;
};

type AlbumDetail = {
  id: string;
  name: string;
  year: number;
  month: number;
  locationDisplay: string;
  photos: PhotoInAlbum[];
};

const route = useRoute();
const router = useRouter();
const album = ref<AlbumDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const lightboxIdx = ref<number | null>(null);

const shareLinks = ref<ShareLink[]>([]);
const sharePanelOpen = ref(false);
const creatingShare = ref(false);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await fetch(`/api/albums/${route.params.id}`, {
      credentials: "include",
    });
    if (res.status === 404) {
      router.replace("/");
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    album.value = (await res.json()) as AlbumDetail;
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "load failed";
  } finally {
    loading.value = false;
  }
}

async function loadShareLinks() {
  if (!album.value) return;
  const res = await fetch(`/api/share/album/${album.value.id}`, {
    credentials: "include",
  });
  if (res.ok) shareLinks.value = (await res.json()) as ShareLink[];
}

async function deletePhoto(id: string) {
  if (!confirm("Delete this photo? This cannot be undone.")) return;
  const res = await fetch(`/api/photos/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (res.ok) await load();
}

async function deleteAlbum() {
  if (!album.value) return;
  if (
    !confirm(
      `Delete the entire album "${album.value.name}" and all ${album.value.photos.length} photos? This cannot be undone.`,
    )
  )
    return;
  const res = await fetch(`/api/albums/${album.value.id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (res.ok) router.replace("/");
}

async function toggleSharePanel() {
  sharePanelOpen.value = !sharePanelOpen.value;
  if (sharePanelOpen.value) await loadShareLinks();
}

async function createShareLink() {
  if (!album.value) return;
  creatingShare.value = true;
  try {
    const res = await fetch("/api/share", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ albumId: album.value.id }),
    });
    if (res.ok) await loadShareLinks();
  } finally {
    creatingShare.value = false;
  }
}

async function revokeShare(token: string) {
  if (!confirm("Revoke this share link? Anyone using it will lose access.")) return;
  await fetch(`/api/share/${token}`, {
    method: "DELETE",
    credentials: "include",
  });
  await loadShareLinks();
}

function shareUrl(token: string) {
  return `${window.location.origin}/share/${token}`;
}

async function copyShareUrl(token: string) {
  await navigator.clipboard.writeText(shareUrl(token));
}

onMounted(load);
</script>

<template>
  <div>
    <RouterLink to="/" class="text-sm text-slate-500 hover:text-slate-900">
      ← Albums
    </RouterLink>

    <p v-if="loading" class="mt-6 text-slate-500">Loading...</p>
    <p v-else-if="error" class="mt-6 text-red-600">{{ error }}</p>
    <div v-else-if="album" class="mt-4">
      <div class="flex items-baseline justify-between mb-1">
        <h1 class="text-2xl font-semibold" data-test="album-name">{{ album.name }}</h1>
        <div class="flex items-center gap-3 text-sm">
          <button
            @click="toggleSharePanel"
            data-test="share-toggle"
            class="text-slate-700 hover:text-slate-900 underline"
          >
            Share
          </button>
          <button
            @click="deleteAlbum"
            data-test="delete-album"
            class="text-red-600 hover:underline"
          >
            Delete album
          </button>
        </div>
      </div>
      <p class="text-sm text-slate-500 mb-6">
        {{ album.locationDisplay }} · {{ album.photos.length }} photo{{ album.photos.length === 1 ? "" : "s" }}
      </p>

      <div
        v-if="sharePanelOpen"
        data-test="share-panel"
        class="bg-white border border-slate-200 rounded-lg p-4 mb-6"
      >
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold">Share this album</h2>
          <button
            @click="createShareLink"
            :disabled="creatingShare"
            data-test="create-share"
            class="bg-slate-900 text-white text-sm px-3 py-1.5 rounded disabled:opacity-50"
          >
            {{ creatingShare ? "Creating..." : "+ Create link" }}
          </button>
        </div>
        <p v-if="shareLinks.length === 0" class="text-sm text-slate-500">
          No share links yet.
        </p>
        <ul v-else class="space-y-2">
          <li
            v-for="link in shareLinks"
            :key="link.id"
            data-test="share-link"
            class="flex items-center gap-2"
          >
            <input
              readonly
              :value="shareUrl(link.token)"
              class="flex-1 font-mono text-xs px-2 py-1 border border-slate-300 rounded bg-slate-50"
            />
            <button
              @click="copyShareUrl(link.token)"
              class="text-sm px-3 py-1 border border-slate-300 rounded"
            >
              Copy
            </button>
            <button
              @click="revokeShare(link.token)"
              class="text-sm text-red-600 underline"
              data-test="revoke-share"
            >
              Revoke
            </button>
          </li>
        </ul>
      </div>

      <p
        v-if="album.photos.length === 0"
        class="text-slate-500"
        data-test="empty"
      >
        This album is empty.
      </p>
      <div
        v-else
        data-test="album-photo-grid"
        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
      >
        <div
          v-for="(p, i) in album.photos"
          :key="p.id"
          class="relative group"
          data-test="album-photo"
        >
          <button
            type="button"
            @click="lightboxIdx = i"
            class="block w-full aspect-square overflow-hidden rounded bg-slate-200"
            :aria-label="`Open photo ${i + 1}`"
          >
            <img
              :src="p.thumbnailUrl"
              :alt="p.locationDisplay ?? 'Photo'"
              loading="lazy"
              class="w-full h-full object-cover"
            />
          </button>
          <button
            @click="deletePhoto(p.id)"
            class="absolute top-2 right-2 bg-white/90 text-red-600 text-xs px-2 py-1 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Delete
          </button>
        </div>
      </div>

      <Lightbox
        :photos="album.photos"
        :index="lightboxIdx"
        @close="lightboxIdx = null"
        @navigate="(i) => (lightboxIdx = i)"
      />
    </div>
  </div>
</template>
