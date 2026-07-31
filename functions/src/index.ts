/**
 * @file index.ts
 * @description Cloud Functions entrypoint for OpsFlow backend (custom claims).
 * @author Vasile Chifeac
 * @created 2026-07-16
 * @modified 2026-07-16
 *
 * @notes
 * - Layer 3 security: only admins may assign tenantId/role claims
 * - Audit trail via structured logger (GDPR Art. 30)
 *
 * @dependencies
 * - firebase-admin
 * - firebase-functions
 *
 * @performance
 * - maxInstances: 10 for cost control
 */

import { setGlobalOptions } from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

setGlobalOptions({ maxInstances: 10 });

// ── Agents ────────────────────────────────────────────────────────────────────
export { processTaskFlow } from "./agents/processTaskFlow";

const ALLOWED_ROLES = new Set(["admin", "manager", "operator", "viewer"]);

/**
 * Assigns tenantId + role custom claims to a Firebase Auth user.
 * Callable only by callers with token.admin === true.
 */
export const setTenantRole = onCall(async (request) => {
  if (request.auth?.token.admin !== true) {
    throw new HttpsError("permission-denied", "Unauthorized: admin only");
  }

  const uid = request.data?.uid;
  const tenantId = request.data?.tenantId;
  const role = request.data?.role;

  if (typeof uid !== "string" || uid.length === 0) {
    throw new HttpsError("invalid-argument", "Missing or invalid uid");
  }

  if (typeof tenantId !== "string" || tenantId.length === 0) {
    throw new HttpsError("invalid-argument", "Missing or invalid tenantId");
  }

  if (typeof role !== "string" || !ALLOWED_ROLES.has(role)) {
    throw new HttpsError(
      "invalid-argument",
      "Missing or invalid role (admin|manager|operator|viewer)",
    );
  }

  await admin.auth().setCustomUserClaims(uid, {
    tenantId,
    role,
    isActive: true,
  });

  // Audit trail — no PII beyond uid (GDPR Art. 30 / Art. 32)
  logger.info("setTenantRole", {
    targetUid: uid,
    tenantId,
    role,
    actorUid: request.auth.uid,
  });

  return { success: true };
}); /*end setTenantRole*/
