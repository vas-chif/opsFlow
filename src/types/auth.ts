/**
 * @file auth.ts
 * @description TypeScript interfaces for authentication and JWT custom claims.
 * @author Vasile Chifeac
 * @created 2026-07-16
 * @modified 2026-07-16
 *
 * @notes
 * - Claims-based multi-tenant auth (JWT-only navigation, AGENTS.md §5)
 * - No PII beyond uid/email required for session identity
 *
 * @dependencies
 * - None (pure types)
 *
 * @performance
 * - Zero runtime cost (compile-time only)
 */

/** Allowed tenant roles for OpsFlow multi-tenant access control. */
export type TenantRole = "admin" | "manager" | "operator" | "viewer";

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
  displayName?: string;
  claims: AuthClaims | null;
}

/** Payload for the setTenantRole callable Cloud Function. */
export interface SetTenantRoleRequest {
  uid: string;
  tenantId: string;
  role: TenantRole;
}

/** Response from the setTenantRole callable Cloud Function. */
export interface SetTenantRoleResponse {
  success: boolean;
}
