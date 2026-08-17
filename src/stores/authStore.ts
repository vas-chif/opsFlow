/**
 * @file authStore.ts
 * @description Pinia store for multi-tenant auth via Firebase JWT custom claims, email verification, and local cache.
 * @author Vasile Chifeac
 * @created 2026-07-16
 * @modified 2026-08-17
 *
 * @notes
 * - JWT-only navigation: roles/tenant from getIdTokenResult, not Firestore (§5)
 * - Step 8 RBAC: superadmin (platform) | admin (tenant) | user (workspace)
 * - Mandatory Email Verification check before session access (§3, GDPR)
 * - Synchronous local session cache (opsflow_user_session) to prevent F5 refresh redirect (§5)
 * - Logout resets Pinia state and clears session cache — never localStorage.clear() (§5, §11)
 * - setUserRole action calls CF via httpsCallable (§3 HTTP Stack — no fetch direct)
 *
 * @dependencies
 * - pinia
 * - firebase/auth
 * - src/boot/firebase.ts
 * - src/types/auth.ts
 *
 * @performance
 * - Claims read from token (0 Firestore reads for authz)
 * - Synchronous initial state load from localStorage (<1ms)
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { defineStore, acceptHMRUpdate } from "pinia";

// ── Firebase ─────────────────────────────────────────────────────────────────
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendEmailVerification,
  signOut,
  type User,
} from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

// ── Types ────────────────────────────────────────────────────────────────────
import type {
  AuthClaims,
  TenantRole,
  UserProfile,
  SetUserRoleRequest,
  SetUserRoleResponse,
} from "@/types/auth";

// ── Utils ────────────────────────────────────────────────────────────────────
import { auth, app } from "@/boot/firebase";

interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  initializationDone: boolean;
}

const SESSION_CACHE_KEY = "opsflow_user_session";

function loadCachedUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserProfile;
    if (parsed && parsed.uid && parsed.emailVerified) {
      return parsed;
    }
  } catch {
    // Ignore invalid JSON in localStorage
  }
  return null;
} /*end loadCachedUser*/

function saveCachedUser(user: UserProfile | null): void {
  try {
    if (user && user.emailVerified) {
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(user));
      localStorage.setItem(`opsflow_user_${user.uid}_profile`, JSON.stringify(user));
    } else {
      localStorage.removeItem(SESSION_CACHE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
} /*end saveCachedUser*/

/**
 * Maps raw JWT claims to a typed AuthClaims object.
 * Accepts all Step 8 RBAC roles plus legacy values for backward compat.
 */
function mapClaims(claims: Record<string, unknown>): AuthClaims | null {
  const tenantId = claims.tenantId;
  const role = claims.role;
  const isActive = claims.isActive;

  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return null;
  }

  const validRoles: TenantRole[] = ["superadmin", "admin", "user", "manager", "operator", "viewer"];
  if (!validRoles.includes(role as TenantRole)) {
    return null;
  }

  return {
    tenantId,
    role: role as TenantRole,
    isActive: isActive === true,
  };
} /*end mapClaims*/

async function buildUserProfile(firebaseUser: User): Promise<UserProfile> {
  const tokenResult = await firebaseUser.getIdTokenResult();
  const rawClaims = tokenResult.claims as Record<string, unknown>;

  const claims = mapClaims(rawClaims) ?? {
    tenantId: "default-tenant",
    role: "operator" as TenantRole,
    isActive: true,
  };

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? "",
    emailVerified: firebaseUser.emailVerified,
    displayName: firebaseUser.displayName ?? "",
    claims,
  };
} /*end buildUserProfile*/

export const useAuthStore = defineStore("auth", {
  state: (): AuthState => ({
    user: loadCachedUser(),
    isLoading: false,
    error: null,
    initializationDone: false,
  }),

  getters: {
    isAuthenticated: (state): boolean => {
      return (
        state.user !== null &&
        state.user.emailVerified === true &&
        (state.user.claims === null || state.user.claims.isActive === true)
      );
    },

    tenantId: (state): string => {
      return state.user?.claims?.tenantId ?? "default-tenant";
    },

    /** Current user role from JWT claim. Defaults to 'user' for legacy compat. */
    role: (state): TenantRole => {
      return state.user?.claims?.role ?? "user";
    },

    /** True if the user has the platform-level superadmin role (Step 8). */
    isSuperAdmin: (state): boolean => {
      return state.user?.claims?.role === "superadmin";
    },

    /** True if the user is admin or superadmin — can manage workspaces and members (Step 8). */
    isAdmin: (state): boolean => {
      const r = state.user?.claims?.role;
      return r === "admin" || r === "superadmin";
    },

    /**
     * True if the user can manage workspace settings, invite members, and configure integrations.
     * Requires `admin` or `superadmin` role (Step 8 — Fase 2.2).
     */
    canManageWorkspace: (state): boolean => {
      const r = state.user?.claims?.role;
      return r === "admin" || r === "superadmin";
    },

    /**
     * True if the user can approve or reject critical AI actions (Human-in-the-Loop).
     * Requires `admin` or `superadmin` role (Step 8 — Fase 2.2).
     */
    canApproveAI: (state): boolean => {
      const r = state.user?.claims?.role;
      return r === "admin" || r === "superadmin";
    },
  },

  actions: {
    /**
     * Subscribe to Firebase auth state and hydrate claims from JWT.
     * Call once at app start.
     */
    init(): void {
      if (this.initializationDone) {
        return;
      }

      this.isLoading = true;

      onAuthStateChanged(auth, async (firebaseUser) => {
        try {
          if (firebaseUser) {
            // Check if email is verified
            if (
              !firebaseUser.emailVerified &&
              firebaseUser.providerData[0]?.providerId === "password"
            ) {
              this.user = null;
              saveCachedUser(null);
            } else {
              this.user = await buildUserProfile(firebaseUser);
              saveCachedUser(this.user);
            }
          } else {
            this.user = null;
            saveCachedUser(null);
          }
          this.error = null;
        } catch {
          this.user = null;
          saveCachedUser(null);
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
        const credential = await signInWithEmailAndPassword(auth, email, password);
        await credential.user.reload();

        if (!credential.user.emailVerified) {
          await signOut(auth);
          this.user = null;
          saveCachedUser(null);
          this.error = "EMAIL_NOT_VERIFIED";
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        this.user = await buildUserProfile(credential.user);
        saveCachedUser(this.user);
      } catch (err) {
        if (err instanceof Error && err.message === "EMAIL_NOT_VERIFIED") {
          throw err;
        }
        this.error = "Login failed";
        this.user = null;
        saveCachedUser(null);
        throw new Error("Login failed");
      } finally {
        this.isLoading = false;
      }
    } /*end login*/,

    async resendVerificationEmail(email: string, password: string): Promise<void> {
      this.error = null;

      try {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        if (!credential.user.emailVerified) {
          await sendEmailVerification(credential.user);
        }
        await signOut(auth);
        this.user = null;
        saveCachedUser(null);
      } catch {
        this.error = "Failed to resend verification email";
        throw new Error("Failed to resend verification email");
      }
    } /*end resendVerificationEmail*/,

    async loginWithGoogle(): Promise<void> {
      this.isLoading = true;
      this.error = null;

      try {
        const provider = new GoogleAuthProvider();
        const credential = await signInWithPopup(auth, provider);
        this.user = await buildUserProfile(credential.user);
        saveCachedUser(this.user);
      } catch {
        this.error = "Google login failed";
        this.user = null;
        saveCachedUser(null);
        throw new Error("Google login failed");
      } finally {
        this.isLoading = false;
      }
    } /*end loginWithGoogle*/,

    async logout(): Promise<void> {
      this.isLoading = true;
      this.error = null;

      try {
        await signOut(auth);
        // Reset session state & clear session cache only — do NOT call localStorage.clear() (§5, §11)
        this.user = null;
        saveCachedUser(null);
      } catch {
        this.error = "Logout failed";
        throw new Error("Logout failed");
      } finally {
        this.isLoading = false;
      }
    } /*end logout*/,

    /**
     * Force-refresh the ID token and re-read custom claims.
     */
    /**
     * Assign a role to a user by calling the setUserRole Cloud Function.
     * Only callable by superadmin or admin (enforced server-side via JWT, Fase 1.1).
     * On success, the target user must re-login to receive the updated JWT token.
     */
    async setUserRole(payload: SetUserRoleRequest): Promise<SetUserRoleResponse> {
      this.isLoading = true;
      this.error = null;

      try {
        const functions = getFunctions(app, "us-central1");
        const callable = httpsCallable<SetUserRoleRequest, SetUserRoleResponse>(
          functions,
          "setUserRole",
        );
        const result = await callable(payload);
        return result.data;
      } catch (err) {
        this.error = err instanceof Error ? err.message : "setUserRole failed";
        throw err;
      } finally {
        this.isLoading = false;
      }
    } /*end setUserRole*/,

    async refreshClaims(): Promise<void> {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        this.user = null;
        saveCachedUser(null);
        return;
      }

      this.isLoading = true;
      this.error = null;

      try {
        await firebaseUser.getIdToken(true);
        this.user = await buildUserProfile(firebaseUser);
        saveCachedUser(this.user);
      } catch {
        this.error = "Failed to refresh claims";
        throw new Error("Failed to refresh claims");
      } finally {
        this.isLoading = false;
      }
    } /*end refreshClaims*/,
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot));
}
