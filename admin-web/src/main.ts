import { createApp } from "vue";
import { createRouter, createWebHashHistory } from "vue-router";
import App from "./App.vue";
import Login from "./views/Login.vue";
import Overview from "./views/Overview.vue";
import { auth, requireAdmin } from "./platform";
import "./style.css";
import "./catalog.css";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/login", component: Login },
    { path: "/", component: Overview, meta: { requiresAdmin: true } },
    {
      path: "/catalog",
      component: () => import("./views/Catalog.vue"),
      meta: { requiresAdmin: true },
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});
router.beforeEach(async (to) => {
  if (!to.meta.requiresAdmin) return true;
  try {
    await requireAdmin();
    return true;
  } catch {
    return { path: "/login" };
  }
});
auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") void router.replace("/login");
});
createApp(App).use(router).mount("#app");
