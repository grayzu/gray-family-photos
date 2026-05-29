<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import Lightbox, { type LightboxPhoto } from "@/components/Lightbox.vue";
import MoveToAlbumModal from "@/components/MoveToAlbumModal.vue";
import EditPhotoModal from "@/components/EditPhotoModal.vue";
import AlbumThumbnailModal from "@/components/AlbumThumbnailModal.vue";
import { useToastStore } from "@/stores/toast";
import { downloadManyPhotos } from "@/utils/download";

type PhotoInAlbum = LightboxPhoto & {
  thumbnailUrl: string;
  width: number;
  height: number;
  uploadedAt: number;
  locationDisplay: string | null;
  uploadedBy?: string | null;
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
  coverPhotoId?: string | null;
  coverMode?: "single" | "collage";
  collagePhotoIds?: string[] | null;
};

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const toast = useToastStore();

const isAdmin = computed(() => auth.isAdmin);
const isAuthenticated = computed(() => auth.isAuthenticated);
const thumbnailModalOpen = ref(false);
const album = ref<AlbumDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const lightboxIdx = ref<number | null>(null);

const shareLinks = ref<ShareLink[]>([]);
const sharePanelOpen = ref(false);
const creatingShare = ref(false);
const advancedOpen = ref(false);

const selectMode = ref(false);
const selectedIds = ref<Set<string>>(new Set());

const moveModalPhotos = ref<PhotoInAlbum[] | null>(null);
const editModalPhoto = ref<PhotoInAlbum | null>(null);

const selectedPhotos = computed(() => {
  if (!album.value) return [];
  return album.value.photos.filter((p) => selectedIds.value.has(p.id));
});

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

function toggleSelect(id: string) {
  const s = new Set(selectedIds.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  selectedIds.value = s;
}

function enterSelectMode(initialId?: string) {
  selectMode.value = true;
  if (initialId) selectedIds.value = new Set([initialId]);
}

function exitSelectMode() {
  selectMode.value = false;
  selectedIds.value = new Set();
}

function selectAll() {
  if (!album.value) return;
  selectedIds.value = new Set(album.value.photos.map((p) => p.id));
}

function openPhoto(i: number, p: PhotoInAlbum, e: MouseEvent) {
  if (selectMode.value) {
    toggleSelect(p.id);
    return;
  }
  if (isAuthenticated.value && (e.shiftKey || e.metaKey || e.ctrlKey)) {
    enterSelectMode(p.id);
    return;
  }
  lightboxIdx.value = i;
}

async function bulkDelete() {
  const ids = Array.from(selectedIds.value);
  if (ids.length === 0) return;
  if (
    !confirm(
      ids.length === 1
        ? "Delete this photo? This cannot be undone."
        : `Delete ${ids.length} photos? This cannot be undone.`,
    )
  )
    return;

  try {
    const res = await fetch("/api/photos/bulk-delete", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error("delete failed");
    toast.addToast(`${ids.length} photo${ids.length === 1 ? '' : 's'} deleted`, "success");
    exitSelectMode();
    if (album.value && album.value.photos.length === ids.length) {
      router.replace("/");
      return;
    }
    await load();
  } catch (e: unknown) {
    toast.addToast("Failed to delete photos", "error");
  }
}

function startBulkMove() {
  if (selectedIds.value.size === 0 || !album.value) return;
  moveModalPhotos.value = selectedPhotos.value;
}

const bulkDownloading = ref(false);

async function bulkDownload() {
  if (selectedIds.value.size === 0) return;
  const photos = selectedPhotos.value.map((p) => ({
    id: p.id,
    originalUrl: p.originalUrl,
    takenAt: p.takenAt,
  }));
  bulkDownloading.value = true;
  toast.addToast(
    photos.length === 1
      ? "Downloading photo..."
      : `Downloading ${photos.length} photos...`,
    "info",
  );
  try {
    const result = await downloadManyPhotos(photos);
    if (result.status === "cancelled") return;
    if (result.failed === 0) {
      toast.addToast(
        result.saved === 1
          ? "Photo downloaded"
          : `Downloaded ${result.saved} photos`,
        "success",
      );
    } else if (result.saved === 0) {
      toast.addToast("Download failed", "error");
    } else {
      toast.addToast(
        `Downloaded ${result.saved} of ${result.total} (${result.failed} failed)`,
        "error",
      );
    }
  } finally {
    bulkDownloading.value = false;
  }
}

async function onBulkMoveConfirm(targetAlbumId: string) {
  const ids = Array.from(selectedIds.value);
  if (ids.length === 0) return;
  try {
    const res = await fetch("/api/photos/bulk-move", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids, albumId: targetAlbumId }),
    });
    if (!res.ok) throw new Error("move failed");
    toast.addToast(`${ids.length} photos moved successfully`, "success");
    moveModalPhotos.value = null;
    exitSelectMode();
    if (album.value && album.value.photos.length === ids.length) {
      router.replace("/");
      return;
    }
    await load();
  } catch (e: unknown) {
    toast.addToast("Failed to move photos", "error");
    moveModalPhotos.value = null;
  }
}

function startBulkEdit() {
  if (selectedIds.value.size === 1) {
    const p = selectedPhotos.value[0]!;
    editModalPhoto.value = p;
    return;
  }
  alert("Edit currently supports one photo at a time. Pick a single photo to edit.");
}

async function deleteFromLightbox() {
  if (lightboxIdx.value === null || !album.value) return;
  const photo = album.value.photos[lightboxIdx.value]!;
  if (!confirm("Delete this photo? This cannot be undone.")) return;
  try {
    const res = await fetch(`/api/photos/${photo.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) throw new Error("delete failed");
    toast.addToast("Photo deleted", "success");
    lightboxIdx.value = null;
    if (album.value.photos.length === 1) {
      router.replace("/");
      return;
    }
    await load();
  } catch (e: unknown) {
    toast.addToast("Failed to delete photo", "error");
  }
}

function moveFromLightbox() {
  if (lightboxIdx.value === null || !album.value) return;
  const photo = album.value.photos[lightboxIdx.value]!;
  moveModalPhotos.value = [photo];
  lightboxIdx.value = null;
}

async function onSingleMoveConfirm(targetAlbumId: string) {
  if (!moveModalPhotos.value || moveModalPhotos.value.length === 0) return;
  const ids = moveModalPhotos.value.map((p) => p.id);
  try {
    const res = await fetch("/api/photos/bulk-move", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids, albumId: targetAlbumId }),
    });
    if (!res.ok) throw new Error("move failed");
    toast.addToast("Photo moved successfully", "success");
    moveModalPhotos.value = null;
    exitSelectMode();
    if (album.value && album.value.photos.length === ids.length) {
      router.replace("/");
      return;
    }
    await load();
  } catch (e: unknown) {
    toast.addToast("Failed to move photo", "error");
    moveModalPhotos.value = null;
  }
}

function editFromLightbox() {
  if (lightboxIdx.value === null || !album.value) return;
  editModalPhoto.value = album.value.photos[lightboxIdx.value]!;
  lightboxIdx.value = null;
}

async function onEditSaved() {
  editModalPhoto.value = null;
  await load();
}

async function onThumbnailSaved() {
  thumbnailModalOpen.value = false;
  await load();
}

async function renameAlbum() {
  if (!album.value) return;
  const newName = window.prompt("Rename album to:", album.value.name);
  if (!newName) return;
  const trimmed = newName.trim();
  if (!trimmed || trimmed === album.value.name) return;
  try {
    const res = await fetch(`/api/albums/${album.value.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!res.ok) throw new Error("rename failed");
    toast.addToast("Album renamed", "success");
    await load();
  } catch (e: unknown) {
    toast.addToast(e instanceof Error ? e.message : "Rename failed", "error");
  }
}

async function deleteAlbum() {
  if (!album.value) return;
  if (
    !window.confirm(
      `Delete album "${album.value.name}"?\n\nWARNING: All ${album.value.photos.length} photos in this album will also be permanently deleted. This cannot be undone.`,
    )
  ) {
    return;
  }
  try {
    const res = await fetch(`/api/albums/${album.value.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) throw new Error("delete failed");
    toast.addToast("Album deleted", "success");
    router.replace("/");
  } catch (e: unknown) {
    toast.addToast(e instanceof Error ? e.message : "Delete failed", "error");
  }
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
    if (!res.ok) throw new Error("Failed to create share link");
    await loadShareLinks();
    toast.addToast("Share link created", "success");
  } catch (e: unknown) {
    toast.addToast("Failed to create share link", "error");
  } finally {
    creatingShare.value = false;
  }
}

async function revokeShare(token: string) {
  if (!confirm("Revoke this share link? Anyone using it will lose access."))
    return;
  try {
    const res = await fetch(`/api/share/${token}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to revoke share link");
    await loadShareLinks();
    toast.addToast("Share link revoked", "success");
  } catch (e: unknown) {
    toast.addToast("Failed to revoke share link", "error");
  }
}

function shareUrl(token: string) {
  return `${window.location.origin}/share/${token}`;
}

async function copyShareUrl(token: string) {
  try {
    await navigator.clipboard.writeText(shareUrl(token));
    toast.addToast("Link copied to clipboard", "success");
  } catch (e: unknown) {
    toast.addToast("Failed to copy link", "error");
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (selectMode.value && e.key === "Escape") {
    e.preventDefault();
    exitSelectMode();
  }
}

onMounted(() => {
  load();
  window.addEventListener("keydown", onKeyDown);
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKeyDown));
</script>

<template>
  <div>
    <RouterLink to="/" class="text-sm font-medium text-text-muted hover:text-accent transition-colors flex items-center gap-1 w-max">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
      Back to Albums
    </RouterLink>

    <div v-if="loading" class="mt-6 animate-pulse">
      <div class="h-8 bg-surface-2 rounded w-48 mb-2"></div>
      <div class="h-4 bg-surface-2 rounded w-32 mb-6"></div>
      <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
        <div v-for="i in 12" :key="i" class="aspect-square bg-surface-2 rounded-lg"></div>
      </div>
    </div>

    <p v-else-if="error" class="mt-6 text-coral bg-coral/10 p-4 rounded-lg border border-coral/20">{{ error }}</p>
    
    <div v-else-if="album" class="mt-4">
      <div class="flex flex-col sm:flex-row sm:items-baseline justify-between mb-1 gap-3">
        <h1 class="text-3xl font-display font-bold text-text-primary truncate" data-test="album-name">
          {{ album.name }}
        </h1>
        <div class="relative flex items-center gap-4 text-sm shrink-0">
          <RouterLink
            v-if="!selectMode && album && isAuthenticated"
            :to="`/upload?albumId=${album.id}`"
            data-test="upload-to-album"
            class="text-text-muted hover:text-accent font-medium transition-colors"
          >
            + Upload
          </RouterLink>
          <button
            v-if="!selectMode && isAuthenticated"
            @click="enterSelectMode()"
            data-test="enter-select"
            class="text-text-muted hover:text-text-primary"
          >
            Select
          </button>
          <button
            v-if="isAuthenticated"
            @click="toggleSharePanel"
            data-test="share-toggle"
            class="text-accent hover:text-accent-hover underline"
          >
            Share
          </button>
          <button
            v-if="isAdmin"
            @click="advancedOpen = !advancedOpen"
            data-test="advanced-menu"
            class="text-text-muted hover:text-text-primary w-7 h-7 inline-flex items-center justify-center rounded hover:bg-surface-2"
            aria-label="More options"
          >
            ⋯
          </button>
          <div
            v-if="advancedOpen && isAdmin"
            class="absolute right-0 top-8 z-20 bg-surface border border-border-subtle rounded shadow-lg py-1 min-w-[180px]"
          >
            <button
              @click="advancedOpen = false; renameAlbum()"
              data-test="rename-album"
              class="block w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-surface-2"
            >
              Rename album
            </button>
            <button
              @click="advancedOpen = false; thumbnailModalOpen = true"
              data-test="set-thumbnail"
              class="block w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-surface-2"
            >
              Set album thumbnail
            </button>
            <button
              @click="advancedOpen = false; deleteAlbum()"
              data-test="delete-album"
              class="block w-full text-left px-3 py-2 text-sm text-coral hover:bg-surface-2"
            >
              Delete album
            </button>
          </div>
        </div>
      </div>
      <p class="text-sm text-text-muted mb-6">
        {{ album.locationDisplay }} · {{ album.photos.length }} photo{{
          album.photos.length === 1 ? "" : "s"
        }}
      </p>

      <div
        v-if="selectMode"
        data-test="select-bar"
        class="sticky top-0 z-10 bg-base/95 backdrop-blur border-y border-border-subtle py-3 mb-4 flex items-center gap-4 flex-wrap"
      >
        <button
          @click="exitSelectMode"
          class="text-text-muted hover:text-text-primary text-sm"
          aria-label="Cancel selection"
        >
          ✕
        </button>
        <span class="text-sm text-text-primary">
          {{ selectedIds.size }} selected
        </span>
        <button
          @click="selectAll"
          class="text-sm text-accent hover:underline"
        >
          Select all
        </button>
        <div class="flex-1"></div>
        <button
          v-if="isAuthenticated"
          @click="bulkDownload"
          :disabled="selectedIds.size === 0 || bulkDownloading"
          data-test="bulk-download"
          class="text-sm px-3 py-1.5 border border-border-subtle text-text-primary hover:border-accent rounded disabled:opacity-40"
        >
          {{ bulkDownloading ? "Downloading..." : "Download" }}
        </button>
        <button
          v-if="isAdmin"
          @click="startBulkEdit"
          :disabled="selectedIds.size !== 1"
          data-test="bulk-edit"
          class="text-sm px-3 py-1.5 border border-border-subtle text-text-primary hover:border-accent rounded disabled:opacity-40"
        >
          Edit
        </button>
        <button
          v-if="isAdmin"
          @click="startBulkMove"
          :disabled="selectedIds.size === 0"
          data-test="bulk-move"
          class="text-sm px-3 py-1.5 border border-border-subtle text-text-primary hover:border-accent rounded disabled:opacity-40"
        >
          Move
        </button>
        <button
          v-if="isAdmin"
          @click="bulkDelete"
          :disabled="selectedIds.size === 0"
          data-test="bulk-delete"
          class="text-sm px-3 py-1.5 border border-coral text-coral hover:bg-coral/10 rounded disabled:opacity-40"
        >
          Delete
        </button>
      </div>

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

      <div
        v-if="album.photos.length === 0"
        class="flex flex-col items-center justify-center py-20 px-4 text-center bg-surface/50 rounded-2xl border border-border-subtle"
        data-test="empty"
      >
        <div class="w-16 h-16 bg-surface-2 rounded-full flex items-center justify-center mb-4 text-text-muted">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 class="text-xl font-display font-medium text-text-primary mb-2">This album is empty</h3>
        <p class="text-text-muted mb-6">{{ isAuthenticated ? "Upload photos to add them to this album." : "Sign in to add photos to this album." }}</p>
        <RouterLink
          v-if="isAuthenticated"
          :to="`/upload?albumId=${album.id}`"
          class="bg-surface-2 hover:bg-border-subtle text-text-primary font-medium px-6 py-2.5 rounded-lg text-sm transition-colors border border-border-subtle"
        >
          Upload photos
        </RouterLink>
        <RouterLink
          v-else
          to="/login"
          class="bg-surface-2 hover:bg-border-subtle text-text-primary font-medium px-6 py-2.5 rounded-lg text-sm transition-colors border border-border-subtle"
        >
          Sign in
        </RouterLink>
      </div>
      <div
        v-else
        data-test="album-photo-grid"
        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
      >
        <button
          v-for="(p, i) in album.photos"
          :key="p.id"
          type="button"
          @click="(e) => openPhoto(i, p, e)"
          :class="[
            'relative block w-full aspect-square overflow-hidden rounded bg-surface-2 border transition-all',
            selectedIds.has(p.id)
              ? 'border-accent ring-2 ring-accent ring-offset-2 ring-offset-base'
              : 'border-border-subtle hover:border-accent',
          ]"
          data-test="album-photo"
          :aria-label="selectMode ? `Toggle selection for photo ${i + 1}` : `Open photo ${i + 1}`"
        >
          <img
            :src="p.thumbnailUrl"
            :alt="p.locationDisplay ?? 'Photo'"
            loading="lazy"
            class="w-full h-full object-cover"
          />
          <span
            v-if="selectMode"
            :class="[
              'absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs',
              selectedIds.has(p.id)
                ? 'bg-accent border-accent text-base'
                : 'bg-base/60 border-text-muted/70 text-transparent',
            ]"
            data-test="select-mark"
          >
            ✓
          </span>
        </button>
      </div>

      <Lightbox
        :photos="album.photos"
        :index="lightboxIdx"
        :show-actions="isAdmin"
        :can-download="isAuthenticated"
        @close="lightboxIdx = null"
        @navigate="(i) => (lightboxIdx = i)"
        @edit="editFromLightbox"
        @move="moveFromLightbox"
        @delete="deleteFromLightbox"
      />

      <MoveToAlbumModal
        v-if="moveModalPhotos && album"
        :open="moveModalPhotos !== null"
        :current-album-id="album.id"
        @select="
          (target) =>
            moveModalPhotos && moveModalPhotos.length > 1
              ? onBulkMoveConfirm(target)
              : onSingleMoveConfirm(target)
        "
        @cancel="moveModalPhotos = null"
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

      <AlbumThumbnailModal
        v-if="album && thumbnailModalOpen"
        :open="thumbnailModalOpen"
        :album-id="album.id"
        :photos="album.photos.map((p) => ({ id: p.id, thumbnailUrl: p.thumbnailUrl }))"
        :current-cover-photo-id="album.coverPhotoId ?? null"
        :current-collage-photo-ids="album.collagePhotoIds ?? null"
        :current-mode="album.coverMode === 'collage' ? 'collage' : 'single'"
        @saved="onThumbnailSaved"
        @cancel="thumbnailModalOpen = false"
      />
    </div>
  </div>
</template>
