/**
 * @file authStore.ts
 * @description Pinia store for multi-tenant auth via Firebase JWT custom claims.
 * @author Vasile Chifeac
 * @created 2026-07-16
 * @modified 2026-07-16
 *
 * @notes
 * - JWT-only navigation: roles/tenant from getIdTokenResult, not Firestore (§5)
 * - Logout resets Pinia state only — never localStorage.clear() (§5, §11)
 *
 * @dependencies
 * - pinia
 * - firebase/auth
 * - src/boot/firebase.ts
 * - src/types/auth.ts
 *
 * @performance
 * - Claims read from token (0 Firestore reads for authz)
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { defineStore, acceptHMRUpdate } from "pinia";

// ── Firebase ─────────────────────────────────────────────────────────────────
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User
} from "firebase/auth";

// ── Types ────────────────────────────────────────────────────────────────────
import type { AuthClaims, TenantRole, UserProfile } from "@/types/auth";

// ── Utils ────────────────────────────────────────────────────────────────────
import { auth } from "@/boot/firebase";

interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  initializationDone: boolean;
}

function mapClaims(claims: Record<string, unknown>): AuthClaims | null {
  const tenantId = claims.tenantId;
  const role = claims.role;
  const isActive = claims.isActive;

  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return null;
  }

  if (
    role !== "admin" &&
    role !== "manager" &&
    role !== "operator" &&
    role !== "viewer"
  ) {
    return null;
  }

  return {
    tenantId,
    role: role as TenantRole,
    isActive: isActive === true
  };
} /*end mapClaims*/

async function buildUserProfile(firebaseUser: User): Promise<UserProfile> {
  const tokenResult = await firebaseUser.getIdTokenResult();
  const claims = mapClaims(tokenResult.claims as Record<string, unknown>);

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? "",
    emailVerified: firebaseUser.emailVerified,
    displayName: firebaseUser.displayName ?? undefined,
    claims
  };
} /*end buildUserProfile*/

export const useAuthStore = defineStore("auth", {
  state: (): AuthState => ({
    user: null,
    isLoading: false,
    error: null,
    initializationDone: false
  }),

  getters: {
    isAuthenticated: (state): boolean => {
      return (
        state.user !== null &&
        state.user.claims !== null &&
        state.user.claims.isActive === true
      );
    },

    tenantId: (state): string | null => {
      return state.user?.claims?.tenantId ?? null;
    },

    role: (state): TenantRole | null => {
      return state.user?.claims?.role ?? null;
    },

    isAdmin: (state): boolean => {
      return state.user?.claims?.role === "admin";
    }
  },

  actions: {
    /**
     * Subscribe to Firebase auth state and hydrate claims from JWT.
     * Call once at app start (e.g. from a boot file or App.vue).
     */
    init(): void {
      if (this.initializationDone) {
        return;
      }

      this.isLoading = true;

      onAuthStateChanged(auth, async firebaseUser => {
        try {
          if (firebaseUser) {
            this.user = await buildUserProfile(firebaseUser);
          } else {
            this.user = null;
          }
          this.error = null;
        } catch {
          this.user = null;
          this.error = "Failed to load authentication state";
        } finally {
          this.isLoading = false;
          this.initializationDone = true;
        }
      });
    } /*end init*/,

    async login(email: string, password: string): Promise<void> {
      this.isLoading = true;
      this.error = null;

      try {
        const credential = await signInWithEmailAndPassword(
          auth,
          email,
          password
        );
        this.user = await buildUserProfile(credential.user);
      } catch {
        this.error = "Login failed";
        this.user = null;
        throw new Error("Login failed");
      } finally {
        this.isLoading = false;
      }
    } /*end login*/,

    async logout(): Promise<void> {
      this.isLoading = true;
      this.error = null;

      try {
        await signOut(auth);
        // Reset session state only — do NOT call localStorage.clear() (§5, §11)
        this.user = null;
      } catch {
        this.error = "Logout failed";
        throw new Error("Logout failed");
      } finally {
        this.isLoading = false;
      }
    } /*end logout*/,

    /**
     * Force-refresh the ID token and re-read custom claims.
     * Use after setTenantRole so the client picks up new claims.
     */
    async refreshClaims(): Promise<void> {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        this.user = null;
        return;
      }

      this.isLoading = true;
      this.error = null;

      try {
        await firebaseUser.getIdToken(true);
        this.user = await buildUserProfile(firebaseUser);
      } catch {
        this.error = "Failed to refresh claims";
        throw new Error("Failed to refresh claims");
      } finally {
        this.isLoading = false;
      }
    } /*end refreshClaims*/
  }
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot));
}
