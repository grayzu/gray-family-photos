<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import Lightbox, { type LightboxPhoto } from "@/components/Lightbox.vue";
import MoveToAlbumModal from "@/components/MoveToAlbumModal.vue";
import EditPhotoModal from "@/components/EditPhotoModal.vue";

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

const moveModalPhoto = ref<PhotoInAlbum | null>(null);
const editModalPhoto = ref<PhotoInAlbum | null>(null);

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
  if (res.ok) {
    if (album.value && album.value.photos.length === 1) {
      router.replace("/");
      return;
    }
    await load();
  }
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

async function onMoveConfirm(targetAlbumId: string) {
  if (!moveModalPhoto.value || !album.value) return;
  const res = await fetch(`/api/photos/${moveModalPhoto.value.id}/move`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ albumId: targetAlbumId }),
  });
  moveModalPhoto.value = null;
  if (res.ok) {
    if (album.value.photos.length === 1) {
      router.replace("/");
      return;
    }
    await load();
  }
}

async function onEditSaved() {
  editModalPhoto.value = null;
  await load();
}

onMounted(load);
</script>

<template>
  <div>
    <RouterLink to="/" class="text-sm text-text-muted hover:text-accent">
      ← Albums
    </RouterLink>

    <p v-if="loading" class="mt-6 text-text-muted">Loading...</p>
    <p v-else-if="error" class="mt-6 text-coral">{{ error }}</p>
    <div v-else-if="album" class="mt-4">
      <div class="flex items-baseline justify-between mb-1">
        <h1 class="text-2xl font-semibold text-text-primary" data-test="album-name">{{ album.name }}</h1>
        <div class="flex items-center gap-4 text-sm">
          <button
            @click="toggleSharePanel"
            data-test="share-toggle"
            class="text-accent hover:text-accent-hover underline"
          >
            Share
          </button>
          <button
            @click="deleteAlbum"
            data-test="delete-album"
            class="text-coral hover:underline"
          >
            Delete album
          </button>
        </div>
      </div>
      <p class="text-sm text-text-muted mb-6">
        {{ album.locationDisplay }} · {{ album.photos.length }} photo{{ album.photos.length === 1 ? "" : "s" }}
      </p>

      <div
        v-if="sharePanelOpen"
        data-test="share-panel"
        class="bg-surface border border-border-subtle rounded-lg p-4 mb-6"
      >
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-text-primary">Share this album</h2>
          <button
            @click="createShareLink"
            :disabled="creatingShare"
            data-test="create-share"
            class="bg-accent hover:bg-accent-hover text-base font-medium text-sm px-3 py-1.5 rounded disabled:opacity-50 transition-colors"
          >
            {{ creatingShare ? "Creating..." : "+ Create link" }}
          </button>
        </div>
        <p v-if="shareLinks.length === 0" class="text-sm text-text-muted">
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
              class="flex-1 font-mono text-xs px-2 py-1 border border-border-subtle bg-surface-2 text-text-primary rounded"
            />
            <button
              @click="copyShareUrl(link.token)"
              class="text-sm px-3 py-1 border border-border-subtle text-text-primary hover:border-accent rounded"
            >
              Copy
            </button>
            <button
              @click="revokeShare(link.token)"
              class="text-sm text-coral hover:underline"
              data-test="revoke-share"
            >
              Revoke
            </button>
          </li>
        </ul>
      </div>

      <p
        v-if="album.photos.length === 0"
        class="text-text-muted"
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
            class="block w-full aspect-square overflow-hidden rounded bg-surface-2 border border-border-subtle group-hover:border-accent transition-colors"
            :aria-label="`Open photo ${i + 1}`"
          >
            <img
              :src="p.thumbnailUrl"
              :alt="p.locationDisplay ?? 'Photo'"
              loading="lazy"
              class="w-full h-full object-cover"
            />
          </button>
          <div
            class="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
          >
            <button
              @click="editModalPhoto = p"
              data-test="photo-edit"
              class="bg-surface/90 text-text-primary text-xs px-2 py-1 rounded shadow border border-border-subtle hover:border-accent"
            >
              Edit
            </button>
            <button
              @click="moveModalPhoto = p"
              data-test="photo-move"
              class="bg-surface/90 text-text-primary text-xs px-2 py-1 rounded shadow border border-border-subtle hover:border-accent"
            >
              Move
            </button>
            <button
              @click="deletePhoto(p.id)"
              data-test="photo-delete"
              class="bg-surface/90 text-coral text-xs px-2 py-1 rounded shadow border border-border-subtle"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      <Lightbox
        :photos="album.photos"
        :index="lightboxIdx"
        @close="lightboxIdx = null"
        @navigate="(i) => (lightboxIdx = i)"
      />

      <MoveToAlbumModal
        v-if="moveModalPhoto && album"
        :open="moveModalPhoto !== null"
        :current-album-id="album.id"
        @select="onMoveConfirm"
        @cancel="moveModalPhoto = null"
      />

      <EditPhotoModal
        v-if="editModalPhoto"
        :open="editModalPhoto !== null"
        :photo-id="editModalPhoto.id"
        :taken-at="editModalPhoto.takenAt"
        :location-display="editModalPhoto.locationDisplay"
        @saved="onEditSaved"
        @cancel="editModalPhoto = null"
      />
    </div>
  </div>
</template>
