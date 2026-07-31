/**
 * @file TenantGuard.ts
 * @description Route guard that enforces authentication and tenant presence before allowing access to the dashboard
 * @author Vasile Chifeac
 * @created 2026-07-29
 * @modified 2026-07-29
 *
 * @notes
 * - Blocks access if user is not authenticated or missing tenantId in JWT claims
 * - Hydrates synchronously from local cache (opsflow_user_session) to prevent F5 refresh redirect
 * - Uses authStore only (0 Firestore reads) for JWT-only navigation (§5, §11)
 * - Redirects unauthenticated users to /login
 * - Designed for filename-based routing with auto-routes
 *
 * @dependencies
 * - vue-router
 * - authStore
 *
 * @performance
 * - <1ms per navigation (pure JWT & local cache checks)
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import type { NavigationGuardWithThis } from "vue-router";
import type { Router } from "vue-router";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useAuthStore } from "@/stores/authStore";

/**
 * Global before guard for tenant-aware authentication.
 * Must run before every route change to protected areas.
 */
export const tenantGuard: NavigationGuardWithThis<undefined> = async (to) => {
  const authStore = useAuthStore();

  const publicRoutes = ["/login", "/register"];
  if (publicRoutes.includes(to.path)) {
    // If already authenticated, redirect to dashboard
    if (authStore.isAuthenticated && authStore.tenantId) {
      return "/";
    }
    return true;
  }

  // Wait for initial auth hydration if cache was empty and init is still pending
  if (!authStore.initializationDone && !authStore.user) {
    await new Promise<void>((resolve) => {
      const unwatch = authStore.$subscribe((_mutation, state) => {
        if (state.initializationDone) {
          unwatch();
          resolve();
        }
      });
    });
  }

  // For all other routes, require authentication + tenant
  if (!authStore.isAuthenticated || !authStore.tenantId) {
    // Preserve intended destination for post-login redirect
    return {
      path: "/login",
      query: { redirect: to.fullPath },
    };
  }

  return true;
}; /*end tenantGuard*/

/**
 * Registers the tenant guard on the provided router instance.
 */
export const registerTenantGuard = (router: Router): void => {
  router.beforeEach(tenantGuard);
}; /*end registerTenantGuard*/
