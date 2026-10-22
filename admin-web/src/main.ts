import { createApp } from "vue";
import { createRouter, createWebHashHistory } from "vue-router";
import App from "./App.vue";
import Login from "./views/Login.vue";
import Overview from "./views/Overview.vue";
import {merchantRoutes} from './merchant-routes';
import { auth, requireAdmin } from "./platform";
import "./style.css";
import "./catalog.css";
import "./operations.css";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/login", component: Login },
    { path: "/", component: Overview, meta: { requiresAdmin: true } },
    ...merchantRoutes,
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
