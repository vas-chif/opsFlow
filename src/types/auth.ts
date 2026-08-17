/**
 * @file auth.ts
 * @description TypeScript interfaces for authentication and JWT custom claims.
 * @author Vasile Chifeac
 * @created 2026-07-16
 * @modified 2026-08-17
 *
 * @notes
 * - Claims-based multi-tenant auth (JWT-only navigation, AGENTS.md §5)
 * - Step 8 RBAC: superadmin (platform) | admin (tenant) | user (workspace)
 * - No PII beyond uid/email required for session identity
 *
 * @dependencies
 * - None (pure types)
 *
 * @performance
 * - Zero runtime cost (compile-time only)
 */

/**
 * OpsFlow RBAC roles — three-tier hierarchy (Step 8).
 *
 * - `superadmin`: Platform master owner. Full cross-tenant control.
 * - `admin`:      Tenant manager. Manages workspaces, members, AI approvals.
 * - `user`:       Workspace collaborator. Operates tasks within invited workspaces.
 *
 * @remarks Legacy values (`manager`, `operator`, `viewer`) are kept for backward
 * compatibility during migration and map to `user` at runtime.
 */
export type TenantRole = "superadmin" | "admin" | "user" | "manager" | "operator" | "viewer";

/**
 * Custom claims embedded in the Firebase Auth JWT.
 * Used by Firestore rules via request.auth.token.*
 */
export interface AuthClaims {
  tenantId: string;
  role: TenantRole;
  isActive: boolean;
}

/**
 * Client-side user profile derived from Firebase Auth + custom claims.
 * Not a Firestore document model — session state only.
 */
export interface UserProfile {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName?: string | undefined;
  claims: AuthClaims | null;
}

/** Payload for the setUserRole callable Cloud Function (Step 8 — Fase 1.1). */
export interface SetUserRoleRequest {
  uid: string;
  tenantId: string;
  role: TenantRole;
  isActive?: boolean;
}

/** Response from the setUserRole callable Cloud Function. */
export interface SetUserRoleResponse {
  success: boolean;
  uid?: string;
  role?: TenantRole;
}

/**
 * @deprecated Use SetUserRoleRequest instead.
 * Kept for backward compatibility.
 */
export interface SetTenantRoleRequest extends SetUserRoleRequest {}

/**
 * @deprecated Use SetUserRoleResponse instead.
 * Kept for backward compatibility.
 */
export interface SetTenantRoleResponse extends SetUserRoleResponse {}
