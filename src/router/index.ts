import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const Albums = () => import("@/views/Albums.vue");
const AlbumDetail = () => import("@/views/AlbumDetail.vue");
const Login = () => import("@/views/Login.vue");
const Upload = () => import("@/views/Upload.vue");
const Admin = () => import("@/views/Admin.vue");

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "albums", component: Albums, meta: { requiresAuth: true } },
    {
      path: "/albums/:id",
      name: "album-detail",
      component: AlbumDetail,
      meta: { requiresAuth: true },
    },
    {
      path: "/upload",
      name: "upload",
      component: Upload,
      meta: { requiresAuth: true },
    },
    {
      path: "/admin",
      name: "admin",
      component: Admin,
      meta: { requiresAuth: true, adminOnly: true },
    },
    { path: "/login", name: "login", component: Login, meta: { guestOnly: true } },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.loaded) await auth.fetchMe();
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  if (to.meta.adminOnly && !auth.isAdmin) return { name: "home" };
  if (to.meta.guestOnly && auth.isAuthenticated) return { name: "home" };
  return true;
});
