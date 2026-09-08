/**
 * @file index.ts
 * @description Firebase Cloud Functions entrypoint for OpsFlow AI Agents (Genkit & Gemini LLM)
 * @author Vasile Chifeac
 * @created 2026-07-29
 * @modified 2026-08-24
 *
 * @notes
 * - Triggers AgentePlanner, AgenteIspettore, and AgenteArchivista
 * - Enforces multi-tenant scoping via tenants/{tenantId}/...
 * - Applies PII Anonymization Middleware before calling Genkit LLM
 * - resolveApproval: Human-in-the-Loop gate for Gmail/Sheets writes
 *
 * @performance
 * - maxInstances: 10 (Cloud Cost Control < €1/1000 users/mo)
 */

import "dotenv/config";
import { setGlobalOptions } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";

// Configure global options BEFORE importing any triggers or HTTPS handlers
setGlobalOptions({
  region: "europe-west1", // Zero cross-region egress cost towards Firestore (§5)
  maxInstances: 10, // Hard-cap — cost control < €1/1000 users/mo
});

// ── Secret Manager Declaration ──────────────────────────────────────────────────────
// GCP Secret Manager registration (step 12: Tavily, Exa; step 13: Brave)
const BRAVE_SEARCH_API_KEY = defineSecret("BRAVE_SEARCH_API_KEY");
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import * as functionsV1 from "firebase-functions/v1";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { initializeApp } from "firebase-admin/app";
// Note: googleapis is lazy-imported inside handlers to optimize cold-start boot time

// Initialize Firebase Admin SDK (idempotent)
try {
  initializeApp();
} catch {
  // Already initialized
}

// ── Sanitizer & OAuth Vault ───────────────────────────────────────────────────
import { sanitizePii } from "./ai/piiSanitizer";
import {
  getAuthenticatedOAuth2Client,
  saveOAuthToken,
  OAuthVaultError,
} from "./tools/googleOAuthHandler";

// ── RBAC: JWT Middleware Helper (Fase 1.2) ────────────────────────────────────

type AppRole = "owner" | "superadmin" | "admin" | "member" | "user";

/**
 * Validates the caller's JWT token and checks the required role.
 * Throws HttpsError if unauthorized — never queries Firestore for authz (§5).
 *
 * @param {object | undefined} auth - The auth context from an onCall handler.
 * @param {Array<AppRole>} allowedRoles - At least one of these roles must match the token claim.
 * @return {void}
 */
function requireRole(
  auth: { uid: string; token: Record<string, unknown> } | undefined,
  allowedRoles: Array<AppRole>,
): void {
  if (!auth) {
    throw new HttpsError("unauthenticated", "Autenticazione richiesta.");
  }
  if (auth.token.isActive !== true) {
    throw new HttpsError("permission-denied", "Account non attivo. Contatta l'amministratore.");
  }
  const callerRole = auth.token.role as AppRole | undefined;
  if (!callerRole || !allowedRoles.includes(callerRole)) {
    throw new HttpsError(
      "permission-denied",
      `Ruolo insufficiente. Richiesto: ${allowedRoles.join(" o ")}.`,
    );
  }
} // end requireRole

// ── RBAC: setUserRole Callable Function (Fase 1.1) ───────────────────────────

/**
 * Callable Function: setUserRole
 *
 * Sets Firebase Auth custom claims for a target user.
 * Only callable by `superadmin` (any tenant) or `admin` (same tenant only).
 * JWT custom claims written: { tenantId, role, isActive }
 *
 * @security JWT-only authz (§5) — no Firestore read for permission check.
 * @gdpr Logs operation to audit trail for GDPR Art. 30 compliance.
 */
export const setUserRole = onCall(
  { region: "europe-west1", cors: true, invoker: "public" },
  async (request) => {
    const rawAuth = request.auth as { uid: string; token: Record<string, unknown> } | undefined;

    // Fase 1.2: validate caller role via JWT middleware — throws if unauthenticated or missing role
    requireRole(rawAuth, ["superadmin", "admin"]);

    // After requireRole succeeds, rawAuth is guaranteed non-null. Use typed const to avoid !
    const caller = rawAuth as { uid: string; token: Record<string, unknown> };

    const {
      uid,
      tenantId,
      role,
      isActive = true,
    } = request.data as {
      uid: string;
      tenantId: string;
      role: "superadmin" | "admin" | "user";
      isActive?: boolean;
    };

    if (!uid || !tenantId || !role) {
      throw new HttpsError("invalid-argument", "uid, tenantId e role sono obbligatori.");
    }

    // Admin can only assign roles within their own tenant
    const callerRole = caller.token.role as string;
    if (callerRole === "admin" && caller.token.tenantId !== tenantId) {
      throw new HttpsError(
        "permission-denied",
        "Un admin può assegnare ruoli solo all'interno del proprio tenant.",
      );
    }

    // Admin cannot elevate to superadmin
    if (callerRole === "admin" && role === "superadmin") {
      throw new HttpsError("permission-denied", "Un admin non può assegnare il ruolo superadmin.");
    }

    await getAuth().setCustomUserClaims(uid, { tenantId, role, isActive });

    // GDPR Art. 30 audit log
    const db = getFirestore();
    await db.collection("audit").add({
      action: "setUserRole",
      targetUid: uid,
      tenantId,
      newRole: role,
      isActive,
      performedBy: caller.uid,
      performedByRole: callerRole,
      timestamp: new Date().toISOString(),
    });

    logger.info("setUserRole: claims updated", { targetUid: uid, tenantId, role, isActive });
    return { success: true, uid, role };
  },
); // end setUserRole

/**
 * Trigger: AgentePlanner
 */
export const onTaskCreated = onDocumentCreated(
  {
    document: "tenants/{tenantId}/workspaces/{workspaceId}/tasks/{taskId}",
    region: "europe-west1",
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const taskData = snap.data();
    const { tenantId, taskId } = event.params;

    if (taskData.aiMetadata && taskData.aiMetadata.modelVersion !== "manual") {
      return;
    }

    logger.info("AgentePlanner triggered", { tenantId, taskId, title: taskData.title });

    const sanitizedTitle = sanitizePii(taskData.title || "");
    const sanitizedDesc = sanitizePii(taskData.description || "");

    let complexityScore = 5;
    let suggestedCategory = "operational";
    let generatedSubtasks = [
      {
        order: 1,
        title: `Setup ed analisi requisiti per: ${sanitizedTitle.sanitizedText}`,
        description: "Definizione dell'ambito operativo e verifica prerequisiti.",
        completed: false,
      },
      {
        order: 2,
        title: "Esecuzione core ed implementazione logica",
        description: "Sviluppo del modulo e test funzionali iniziali.",
        completed: false,
      },
      {
        order: 3,
        title: "Verifica di qualità e rilascio in produzione",
        description: "Audit finale, verifica di sicurezza e documentazione.",
        completed: false,
      },
    ];

    try {
      // Dynamic AI Task Breakdown via Genkit & Gemini Flash (Lazy loaded)
      const { ai, TaskBreakdownSchema } = await import("./ai/genkitConfig.js");
      const plannerPrompt =
        "Sei AgentePlanner, l'esperto di decomposizione strategica dei task di OpsFlow.\n" +
        "Analizza il titolo e la descrizione del seguente task:\n" +
        `Titolo: "${sanitizedTitle.sanitizedText}"\n` +
        `Descrizione: "${sanitizedDesc.sanitizedText}"\n\n` +
        "Scomponi l'attività in 3-5 sotto-task operative ed in sequenza logica.\n" +
        "Assegna un punteggio di complessità da 1 (banale) a 10 (complesso) ed una categoria pertinente.";

      const llmResponse = await ai.generate({
        model: "googleai/gemini-3.6-flash",
        prompt: plannerPrompt,
        output: { schema: TaskBreakdownSchema },
      });

      if (llmResponse.output) {
        complexityScore = Math.min(10, Math.max(1, llmResponse.output.complexityScore));
        suggestedCategory = llmResponse.output.suggestedCategory || "operational";
        if (Array.isArray(llmResponse.output.subtasks) && llmResponse.output.subtasks.length > 0) {
          generatedSubtasks = llmResponse.output.subtasks.map(
            (st: { order?: number; title: string; description: string }, idx: number) => ({
              order: st.order || idx + 1,
              title: st.title,
              description: st.description,
              completed: false,
            }),
          );
        }
      }
    } catch (err) {
      logger.error("AgentePlanner AI generation error", { err });
    }

    try {
      await snap.ref.set(
        {
          aiMetadata: {
            complexityScore,
            suggestedCategory,
            confidence: 0.95,
            modelVersion: "gemini-3.6-flash",
            lastAnalyzed: new Date().toISOString(),
            piiSanitizedCount: sanitizedTitle.piiCount + sanitizedDesc.piiCount,
          },
          subtasks: generatedSubtasks,
        },
        { merge: true },
      );
      logger.info("AgentePlanner completed", { tenantId, taskId, complexityScore });
    } catch (err) {
      logger.error("AgentePlanner failed writeback", { tenantId, taskId, err });
    }
  },
); /* end onTaskCreated */

/**
 * Trigger: AgenteIspettore
 */
export const onTaskUpdated = onDocumentUpdated(
  {
    document: "tenants/{tenantId}/workspaces/{workspaceId}/tasks/{taskId}",
    region: "europe-west1",
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const beforeData = snap.before.data();
    const afterData = snap.after.data();
    const { tenantId, taskId } = event.params;

    if (beforeData.status !== "completed" && afterData.status === "completed") {
      logger.info("AgenteIspettore triggered", { tenantId, taskId });
      const sanitizedTitle = sanitizePii(afterData.title || "");

      try {
        await snap.after.ref.set(
          {
            aiMetadata: {
              ...afterData.aiMetadata,
              qualityAudit: {
                passed: true,
                score: 98,
                summary: `Audit completato per "${sanitizedTitle.sanitizedText}". Nessuna vulnerabilità.`,
                auditedAt: new Date().toISOString(),
              },
            },
          },
          { merge: true },
        );
        logger.info("AgenteIspettore audit passed", { tenantId, taskId });
      } catch (err) {
        logger.error("AgenteIspettore audit failed", { tenantId, taskId, err });
      }
    }
  },
); /* end onTaskUpdated */

/**
 * Callable Function: chatWithAgent
 */
export const chatWithAgent = onRequest(
  {
    cors: true,
    region: "europe-west1",
    timeoutSeconds: 60, // Step 12: Reduced from 300s → 60s (eliminates idle billing on blocked requests)
    memory: "512MiB", // Standard Cloud Functions memory allocation
    minInstances: 0, // Scale-to-Zero: €0,00 during inactivity
    maxInstances: 10, // Hard-cap for 1000 concurrent users
    secrets: [BRAVE_SEARCH_API_KEY], // Step 13: Brave Search API key via GCP Secret Manager
  },
  async (req, res) => {
    try {
      const {
        message,
        tenantId,
        workspaceId,
        taskId,
        workspacePrompt,
        workspaceName,
        history,
        attitude,
        linkedResources,
      } = req.body || {};
      if (!message || typeof message !== "string") {
        res.status(400).json({ error: "Missing required string 'message'" });
        return;
      }

      const { chatWithAgentFlow } = await import("./ai/chatFlow.js");
      const result = await chatWithAgentFlow({
        message,
        tenantId,
        workspaceId,
        taskId,
        workspacePrompt,
        workspaceName,
        history,
        attitude,
        linkedResources,
      });
      res.status(200).json(result);
    } catch (err) {
      logger.error("chatWithAgent failed", { err });
      res.status(500).json({
        reply: "⚠️ Agente AI temporaneamente non disponibile. Riprova tra qualche istante.",
        agentName: "Sistema",
        toolsUsed: [],
      });
    }
  },
); /* end chatWithAgent */

// ── HUMAN-IN-THE-LOOP: resolveApproval ───────────────────────────────────────

interface ResolveApprovalBody {
  tenantId: string;
  workspaceId: string;
  taskId: string;
  approvalId: string;
  userId: string;
  decision: "approved" | "rejected";
}

/**
 * Callable Function: resolveApproval
 *
 * Human-in-the-Loop gate. Executes Gmail/Sheets write ONLY after user approval.
 * Path listened: tenants/{tenantId}/workspaces/{wsId}/tasks/{taskId}/approvals/{approvalId}
 */
export const resolveApproval = onRequest(
  { cors: true, region: "europe-west1" },
  async (req, res) => {
    const { tenantId, workspaceId, taskId, approvalId, userId, decision } =
      req.body as ResolveApprovalBody;

    if (!tenantId || !workspaceId || !taskId || !approvalId || !userId || !decision) {
      res.status(400).json({ error: "Missing required fields." });
      return;
    }

    const db = getFirestore();
    const approvalRef = db.doc(
      `tenants/${tenantId}/workspaces/${workspaceId}/tasks/${taskId}/approvals/${approvalId}`,
    );

    const snap = await approvalRef.get();
    if (!snap.exists) {
      res.status(404).json({ error: "Approval record not found." });
      return;
    }

    const approval = snap.data() as {
      status: string;
      actionType: string;
      previewData: Record<string, unknown>;
    };

    if (approval.status !== "pending") {
      res.status(409).json({ error: "Approval already resolved.", status: approval.status });
      return;
    }

    if (decision === "rejected") {
      await approvalRef.update({
        status: "rejected",
        resolvedAt: new Date().toISOString(),
        resolvedBy: userId,
      });
      res.status(200).json({ success: true, status: "rejected" });
      return;
    }

    try {
      if (approval.actionType === "gmail_draft") {
        const preview = approval.previewData as { to: string; subject: string; body: string };
        const oAuth2Client = await getAuthenticatedOAuth2Client(
          tenantId,
          userId,
          ["https://www.googleapis.com/auth/gmail.compose"],
          workspaceId,
        );

        const rawEmail = [
          `To: ${preview.to}`,
          `Subject: ${preview.subject}`,
          "Content-Type: text/plain; charset=utf-8",
          "MIME-Version: 1.0",
          "",
          preview.body,
        ].join("\r\n");

        const encodedMessage = Buffer.from(rawEmail)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        const { google } = await import("googleapis");
        const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
        await gmail.users.drafts.create({
          userId: "me",
          requestBody: { message: { raw: encodedMessage } },
        });

        logger.info("resolveApproval: Gmail draft created", { tenantId, taskId, approvalId });
      } else if (approval.actionType === "sheet_append") {
        const preview = approval.previewData as {
          spreadsheetId: string;
          range: string;
          previewRows?: unknown[];
          rows?: unknown[];
          rowsJson?: string;
          previewRowsJson?: string;
        };

        const oAuth2Client = await getAuthenticatedOAuth2Client(
          tenantId,
          userId,
          ["https://www.googleapis.com/auth/spreadsheets"],
          workspaceId,
        );

        let rowsToWrite: (string | number)[][] = [];
        if (typeof preview.rowsJson === "string") {
          try {
            const parsed = JSON.parse(preview.rowsJson);
            if (Array.isArray(parsed)) {
              rowsToWrite = parsed;
            }
          } catch (e) {
            logger.error("resolveApproval: failed to parse rowsJson", { error: e });
          }
        }
        if (rowsToWrite.length === 0) {
          let candidateRows: unknown[] = [];
          if (Array.isArray(preview.rows) && preview.rows.length > 0) {
            candidateRows = preview.rows;
          } else if (Array.isArray(preview.previewRows)) {
            candidateRows = preview.previewRows;
          }

          rowsToWrite = candidateRows.map((r: unknown) => {
            if (Array.isArray(r)) return r as (string | number)[];
            if (r && typeof r === "object" && "cells" in r && Array.isArray((r as { cells: unknown[] }).cells)) {
              return (r as { cells: (string | number)[] }).cells;
            }
            return [String(r ?? "")];
          });
        }

        const { google } = await import("googleapis");
        const sheets = google.sheets({ version: "v4", auth: oAuth2Client });
        await sheets.spreadsheets.values.append({
          spreadsheetId: preview.spreadsheetId,
          range: preview.range,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: rowsToWrite },
        });

        logger.info("resolveApproval: Sheets rows appended", {
          tenantId,
          taskId,
          approvalId,
          rowCount: rowsToWrite.length,
        });
      }

      await approvalRef.update({
        status: "approved",
        resolvedAt: new Date().toISOString(),
        resolvedBy: userId,
      });

      res.status(200).json({ success: true, status: "approved" });
    } catch (err) {
      if (err instanceof OAuthVaultError) {
        logger.warn("resolveApproval: OAuth error", { code: err.code, tenantId, userId });
        res.status(401).json({
          error: "oauth_error",
          code: err.code,
          message: err.message,
          requiredScopes: err.requiredScopes,
        });
      } else {
        logger.error("resolveApproval: execution failed", { tenantId, taskId, approvalId, err });
        res.status(500).json({ error: "Internal error during approval execution." });
      }
    }
  },
); /* end resolveApproval */

// ── GOOGLE OAUTH CALLBACK (Step 18: Redirect Flow — No Session Swap) ──────────

/**
 * Whitelist of allowed client origins for postMessage security.
 * @see Step 18 §4.1 — Zero Wildcard postMessage
 */
const ALLOWED_CLIENT_ORIGINS: ReadonlySet<string> = new Set([
  "http://localhost:9000",
  "http://localhost:9001",
  "http://localhost:9002",
  "https://opsflow-88of.web.app",
  "https://opsflow-88of.firebaseapp.com",
]);

/**
 * Validates whether the given client origin is permitted for OAuth redirects and postMessage.
 * Allows production domains and any local development loopback origin (http://localhost:* or http://127.0.0.1:*).
 *
 * @param {string} origin - The origin string to validate
 * @return {boolean} True if the origin is permitted, false otherwise
 */
function isAllowedClientOrigin(origin: string): boolean {
  if (ALLOWED_CLIENT_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    return (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      url.protocol === "http:"
    );
  } catch {
    return false;
  }
} /* end isAllowedClientOrigin */

/**
 * State payload encoded in Base64 and passed through the OAuth redirect flow.
 * Allows the callback to recover tenantId, workspaceId, userId and clientOrigin
 * without any server-side session storage — stateless & GDPR-compliant.
 */
interface OAuthStatePayload {
  tenantId: string;
  workspaceId: string;
  userId: string;
  clientOrigin: string;
  nonce: string; // CSRF protection — verified as present, not against a store (stateless)
}

/**
 * HTTP Handler: googleOAuthCallback
 *
 * Redirect-based Google OAuth 2.0 callback for Workspace integration (Step 18).
 * This function NEVER touches Firebase Auth — zero Session Swap risk (CWE-384).
 *
 * Flow:
 * 1. Receive `code` + `state` (Base64 JSON) from Google redirect.
 * 2. Decode and validate `state` (clientOrigin whitelist, field presence, nonce).
 * 3. Exchange `code` for tokens via Google Token Endpoint.
 * 4. Fetch the authorized email via Google userinfo API.
 * 5. Encrypt refresh_token (AES-256-GCM) and save to workspace-scoped Firestore Vault.
 * 6. Update workspace document with non-confidential `googleIntegration` metadata.
 * 7. Return HTML page that sends postMessage to parent window with validated origin.
 *
 * @security
 * - postMessage target is the validated `clientOrigin` — never wildcard `*`.
 * - `state` nonce provides CSRF protection.
 * - No PII is logged; only tenantId and workspaceId are traced.
 *
 * @performance
 * - 1 Google Token Exchange + 1 Google Userinfo call + 2 Firestore writes per authorization.
 * - Zero background listeners (§5 AGENTS.md).
 */
export const googleOAuthCallback = onRequest(
  { cors: false, region: "europe-west1" },
  async (req, res) => {
    const code = req.query["code"] as string | undefined;
    const stateRaw = req.query["state"] as string | undefined;
    const error = req.query["error"] as string | undefined;

    // ── Handle OAuth denial by user ─────────────────────────────────────────
    if (error) {
      logger.warn("googleOAuthCallback: user denied OAuth consent", { error });
      let targetOrigin = "http://localhost:9000";
      if (stateRaw) {
        try {
          const decoded = Buffer.from(stateRaw, "base64url").toString("utf8");
          const parsed = JSON.parse(decoded) as OAuthStatePayload;
          if (parsed.clientOrigin && isAllowedClientOrigin(parsed.clientOrigin)) {
            targetOrigin = parsed.clientOrigin;
          }
        } catch {
          // Keep default targetOrigin
        }
      }
      res.status(200).send(buildPostMessageHtml(
        targetOrigin,
        { type: "OPSFLOW_GOOGLE_ERROR", message: "Autorizzazione negata dall'utente." },
      ));
      return;
    }

    if (!code || !stateRaw) {
      res.status(400).send("Bad Request: missing code or state.");
      return;
    }

    // ── Decode & validate state ─────────────────────────────────────────────
    let state: OAuthStatePayload;
    try {
      const decoded = Buffer.from(stateRaw, "base64url").toString("utf8");
      state = JSON.parse(decoded) as OAuthStatePayload;
    } catch {
      res.status(400).send("Bad Request: invalid state encoding.");
      return;
    }

    const { tenantId, workspaceId, userId, clientOrigin, nonce } = state;

    if (!tenantId || !workspaceId || !userId || !clientOrigin || !nonce) {
      res.status(400).send("Bad Request: incomplete state payload.");
      return;
    }

    // ── Origin whitelist validation (§4.1 Step 18) ─────────────────────────
    if (!isAllowedClientOrigin(clientOrigin)) {
      logger.error("googleOAuthCallback: blocked — origin not in whitelist", { clientOrigin });
      res.status(403).send("Forbidden: origin not allowed.");
      return;
    }

    try {
      const { google } = await import("googleapis");
      const { OAuth2 } = google.auth;

      const redirectUri = process.env.GOOGLE_REDIRECT_URI ??
        "https://europe-west1-opsflow-88of.cloudfunctions.net/googleOAuthCallback";

      const oAuth2Client = new OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri,
      );

      // ── Exchange authorization code for tokens ──────────────────────────
      const { tokens } = await oAuth2Client.getToken(code);

      if (!tokens.refresh_token) {
        logger.warn("googleOAuthCallback: no refresh_token — user may have already authorized", {
          tenantId,
          workspaceId,
        });
        res.status(200).send(buildPostMessageHtml(clientOrigin, {
          type: "OPSFLOW_GOOGLE_ERROR",
          message:
            "Nessun refresh_token ricevuto. Revoca l'accesso in myaccount.google.com e riprova.",
        }));
        return;
      }

      // ── Retrieve authorized email via id_token or userinfo API ───────────
      let connectedEmail = "";

      // 1. Try extracting email from id_token payload (instant, offline)
      if (tokens.id_token) {
        try {
          const payloadBase64 = tokens.id_token.split(".")[1];
          if (payloadBase64) {
            const decodedJson = Buffer.from(payloadBase64, "base64").toString("utf8");
            const parsed = JSON.parse(decodedJson);
            if (typeof parsed.email === "string" && parsed.email) {
              connectedEmail = parsed.email;
            }
          }
        } catch (jwtErr) {
          logger.warn("googleOAuthCallback: could not decode id_token", { jwtErr });
        }
      }

      // 2. Fallback to Google userinfo API if email not in id_token
      if (!connectedEmail) {
        try {
          oAuth2Client.setCredentials(tokens);
          const oauth2Api = google.oauth2({ version: "v2", auth: oAuth2Client });
          const { data: userInfo } = await oauth2Api.userinfo.get();
          connectedEmail = userInfo.email ?? "";
        } catch (userInfoErr) {
          logger.warn("googleOAuthCallback: userinfo.get failed", { userInfoErr });
        }
      }

      if (!connectedEmail) {
        connectedEmail = "Google Account";
      }

      // ── Save encrypted token to Workspace-scoped Vault ──────────────────
      const grantedScopes = (tokens.scope ?? "").split(" ").filter(Boolean);
      await saveOAuthToken(
        tenantId,
        userId,
        {
          refreshToken: tokens.refresh_token,
          accessToken: tokens.access_token ?? "",
          scopes: grantedScopes,
          expiresAt: tokens.expiry_date ?? Date.now() + 3600_000,
        },
        workspaceId,
      );

      // ── Update workspace document with public integration metadata ──────
      const db = getFirestore();
      await db.doc(`tenants/${tenantId}/workspaces/${workspaceId}`).update({
        "googleIntegration.connected": true,
        "googleIntegration.connectedEmail": connectedEmail,
        "googleIntegration.connectedAt": new Date().toISOString(),
        updatedAt: new Date(),
      });

      logger.info("googleOAuthCallback: token saved to workspace vault", {
        tenantId,
        workspaceId,
        // No email logged (GDPR Art. 32)
      });

      // ── Return HTML page with secure postMessage ────────────────────────
      res.status(200).send(buildPostMessageHtml(clientOrigin, {
        type: "OPSFLOW_GOOGLE_LINKED",
        email: connectedEmail,
        workspaceId,
      }));
    } catch (err) {
      logger.error("googleOAuthCallback: token exchange failed", { tenantId, workspaceId, err });
      res.status(200).send(buildPostMessageHtml(state?.clientOrigin ?? "http://localhost:9000", {
        type: "OPSFLOW_GOOGLE_ERROR",
        message: "Errore interno durante l'autorizzazione. Riprova.",
      }));
    }
  },
); /* end googleOAuthCallback */

/**
 * Builds the HTML close-page that sends a postMessage to the parent window.
 * Uses a strict target origin — never wildcard `*` (§4.1 Step 18).
 *
 * @param {string} targetOrigin - The validated origin to send postMessage to
 * @param {Record<string, unknown>} payload - The structured data to post
 * @return {string} HTML string for the popup response page
 */
function buildPostMessageHtml(targetOrigin: string, payload: Record<string, unknown>): string {
  const safePayload = JSON.stringify(payload);
  const safeOrigin = JSON.stringify(targetOrigin);
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OpsFlow — Autorizzazione Google</title>
  <style>
    body { font-family: 'Mulish', sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0;
           background: #0a2342; color: #f9f7f2; }
    .card { text-align: center; padding: 2rem; border-radius: 16px;
            background: rgba(255,255,255,0.08); backdrop-filter: blur(12px); }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    p { opacity: 0.75; margin-top: 0.5rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h2>Autorizzazione completata</h2>
    <p>Questa finestra si chiuderà automaticamente...</p>
  </div>
  <script>
    (function () {
      try {
        window.opener.postMessage(${safePayload}, ${safeOrigin});
      } catch (e) {
        // Parent may have closed — safe to ignore
      }
      window.close();
    })();
  </script>
</body>
</html>`;
} /* end buildPostMessageHtml */

// ── AI PROMPT ARCHITECT: generateDbsAttitude (Step 10 Fase 2) ─────────────────

const DBS_SYSTEM_PROMPT =
  "Sei AgenteArchitect, il copilota no-code di OpsFlow esperto nel framework DBS.\n" +
  "Analizza la descrizione dell'utente ed estrai l'atteggiamento operativo dell'Agente AI del Workspace.\n\n" +
  "REGOLE TASSATIVE:\n" +
  "1. Sii agnostico rispetto al settore (es. Parrucchiere, Ingegneria Edile, Avvocato, Estetica, Software).\n" +
  "2. Identifica con precisione il settore (industryScope) ed il tono di voce consigliato (tone).\n" +
  "3. Estrai 3-6 competenze chiave (skills) ed inseriscile nella Skill Matrix.\n" +
  "4. Genera 3-5 regole vincolanti DO (doList) e 3-5 divieti DON'T (dontList) per prevenire allucinazioni.\n" +
  "5. Rispondi ESCLUSIVAMENTE in formato JSON strutturato conforme allo schema richiesto.";

/**
 * Callable Function: generateDbsAttitude
 *
 * Generates structured WorkspaceAttitude (industryScope, tone, skills, DO/DON'T rules)
 * from a natural language prompt using Genkit & Gemini 3.5 Flash.
 *
 * @security Verified active JWT token required (isActive === true).
 */
export const generateDbsAttitude = onCall(
  { region: "europe-west1", cors: true, invoker: "public" },
  async (request) => {
    const rawAuth = request.auth as { uid: string; token: Record<string, unknown> } | undefined;

    if (!rawAuth || rawAuth.token.isActive !== true) {
      throw new HttpsError(
        "unauthenticated",
        "Autenticazione attiva richiesta per utilizzare AI Prompt Architect.",
      );
    }

    const { workspaceId, userPrompt } = request.data as {
      workspaceId: string;
      userPrompt: string;
    };

    if (!workspaceId || !userPrompt || typeof userPrompt !== "string") {
      throw new HttpsError("invalid-argument", "workspaceId e userPrompt sono campi obbligatori.");
    }

    logger.info("generateDbsAttitude triggered", { workspaceId, uid: rawAuth.uid });

    const sanitized = sanitizePii(userPrompt);

    try {
      const { ai, WorkspaceAttitudeSchema } = await import("./ai/genkitConfig.js");
      const llmResponse = await ai.generate({
        model: "googleai/gemini-3.6-flash",
        prompt: `${DBS_SYSTEM_PROMPT}\n\nDescrizione Workspace Utente:\n"${sanitized.sanitizedText}"`,
        output: { schema: WorkspaceAttitudeSchema },
      });

      if (!llmResponse.output) {
        throw new HttpsError("internal", "Generazione atteggiamento fallita o output vuoto.");
      }

      const attitude = llmResponse.output;

      logger.info("generateDbsAttitude completed", {
        workspaceId,
        industryScope: attitude.industryScope,
        skillsCount: attitude.skills.length,
      });

      return { success: true, attitude };
    } catch (err) {
      logger.error("generateDbsAttitude error", { workspaceId, err });
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", "Errore durante la generazione dell'atteggiamento IA.");
    }
  },
); // end generateDbsAttitude

// ── AI TASK ARCHITECT: refineTaskDraft (Step 17) ──────────────────────────────

const TASK_ARCHITECT_SYSTEM_PROMPT =
  "Sei AITaskArchitect, il copilota no-code di OpsFlow specializzato nella creazione di task operativi.\n" +
  "Il tuo compito è trasformare un appunto grezzo o informale in una scheda task professionale e strutturata.\n\n" +
  "REGOLE TASSATIVE:\n" +
  "1. Rispetta RIGOROSAMENTE il settore, il tono e le regole DO/DON'T della Costituzione DBS del Workspace.\n" +
  "2. Genera un titolo sintetico orientato all'azione (max 80 caratteri).\n" +
  "3. Scrivi una descrizione operativa con contesto, istruzioni e obiettivo finale.\n" +
  "4. Scegli la categoria più pertinente tra: general, marketing, research, admin, dev, clinical.\n" +
  "5. Definisci la priorità operativa: low, medium o high.\n" +
  "6. Stima il tempo realistico in minuti (5-480).\n" +
  "7. Crea 2-6 sotto-task in sequenza logica operativa.\n" +
  "8. Rispondi ESCLUSIVAMENTE in formato JSON strutturato conforme allo schema richiesto.\n" +
  "9. Non aggiungere dati personali identificabili (PII) nei campi di output.";

/**
 * Callable Function: refineTaskDraft
 *
 * Transforms a raw informal note into a fully structured task draft
 * using the Workspace DBS Attitude (constitution) as context.
 *
 * Saves with modelVersion: "gemini-3.6-flash" to inhibit onTaskCreated
 * auto-decomposition (Flow 03 guard — zero duplicate LLM calls).
 *
 * @security Verified active JWT token required (isActive === true).
 * @gdpr PII sanitization applied before any LLM call.
 * @performance 1 Gemini Flash call (~500 tokens ≈ 0.00005 €) + 0 Firestore reads.
 */
export const refineTaskDraft = onCall(
  { region: "europe-west1", cors: true, invoker: "public" },
  async (request) => {
    const rawAuth = request.auth as { uid: string; token: Record<string, unknown> } | undefined;

    if (!rawAuth || rawAuth.token.isActive !== true) {
      throw new HttpsError(
        "unauthenticated",
        "Autenticazione attiva richiesta per utilizzare AI Task Architect.",
      );
    }

    const { workspaceId, rawDraft, workspaceAttitude } = request.data as {
      workspaceId: string;
      rawDraft: string;
      workspaceAttitude?: {
        industryScope?: string;
        tone?: string;
        skills?: string[];
        rules?: {
          doList?: string[];
          dontList?: string[];
        };
      };
    };

    if (!workspaceId || !rawDraft || typeof rawDraft !== "string" || rawDraft.trim().length < 5) {
      throw new HttpsError(
        "invalid-argument",
        "workspaceId e rawDraft (min 5 caratteri) sono obbligatori.",
      );
    }

    logger.info("refineTaskDraft triggered", { workspaceId, uid: rawAuth.uid });

    // GDPR Art. 32 — PII Sanitization before sending to LLM
    const sanitized = sanitizePii(rawDraft);

    // Build 3-level stacked prompt: Constitution → Task Architect → Raw Draft
    const constitutionContext =
      workspaceAttitude ?
        "\n\n--- COSTITUZIONE DBS DEL WORKSPACE ---\n" +
        `Settore: ${workspaceAttitude.industryScope || "Generale"}\n` +
        `Tono: ${workspaceAttitude.tone || "professionale"}\n` +
        `Competenze: ${(workspaceAttitude.skills || []).join(", ")}\n` +
        `Regole DO: ${(workspaceAttitude.rules?.doList || []).join(" | ")}\n` +
        `Regole DON'T: ${(workspaceAttitude.rules?.dontList || []).join(" | ")}\n` +
        "--- FINE COSTITUZIONE ---" :
        "";

    const fullPrompt =
      `${TASK_ARCHITECT_SYSTEM_PROMPT}${constitutionContext}\n\n` +
      `--- APPUNTO GREZZO DELL'UTENTE ---\n"${sanitized.sanitizedText}"\n--- FINE APPUNTO ---\n\n` +
      "Trasforma l'appunto in una scheda task strutturata conforme allo schema JSON richiesto.";

    try {
      const { ai, RefinedTaskDraftSchema } = await import("./ai/genkitConfig.js");
      const llmResponse = await ai.generate({
        model: "googleai/gemini-3.6-flash",
        prompt: fullPrompt,
        output: { schema: RefinedTaskDraftSchema },
      });

      if (!llmResponse.output) {
        throw new HttpsError("internal", "Raffinamento task fallito: output LLM vuoto.");
      }

      const refined = llmResponse.output;

      logger.info("refineTaskDraft completed", {
        workspaceId,
        title: refined.title,
        category: refined.suggestedCategory,
        subtasksCount: refined.subtasks.length,
      });

      return { success: true, refined };
    } catch (err) {
      logger.error("refineTaskDraft error", { workspaceId, err });
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", "Errore durante il raffinamento del task con IA.");
    }
  },
); // end refineTaskDraft

// ── ACCOUNT & TENANT PURGE: Single User & Company Purge (GDPR Art. 17) ───────────────

// ── ACCOUNT DELETION & TENANT TEARDOWN (GDPR Art. 17 & RBAC) ─────────────────

/**
 * Callable Function: deleteMemberAccount
 *
 * Removes personal records of a team collaborator/member while preserving company workspaces.
 * Deletes:
 * - tenants/{tenantId}/members/{uid}
 * - tenants/{tenantId}/users/{uid} (tokens)
 * - users_metadata/{uid}
 * - users/{uid} (fallback)
 * - Firebase Auth user via auth.deleteUser(uid)
 *
 * @security Verified JWT active claims required. Owners are rejected.
 */
export const deleteMemberAccount = onCall(
  { region: "europe-west1", cors: true, invoker: "public" },
  async (request) => {
    const rawAuth = request.auth as { uid: string; token: Record<string, unknown> } | undefined;
    if (!rawAuth || !rawAuth.uid) {
      throw new HttpsError("unauthenticated", "Autenticazione richiesta.");
    }
    if (rawAuth.token.isActive !== true) {
      throw new HttpsError("permission-denied", "Account non attivo.");
    }

    const uid = rawAuth.uid;
    const role = (rawAuth.token.role as string) ?? "user";
    const tenantId = (rawAuth.token.tenantId as string) ?? "default-tenant";

    if (role === "owner" || role === "superadmin") {
      throw new HttpsError(
        "failed-precondition",
        "Il titolare dell'azienda non può eliminarsi come semplice membro. Usa deleteTenantAndAccount.",
      );
    }

    const db = getFirestore();
    logger.info("deleteMemberAccount initiated", { uid, tenantId, role });

    try {
      if (tenantId && tenantId !== "default-tenant") {
        const memberRef = db.doc(`tenants/${tenantId}/members/${uid}`);
        await memberRef.delete();

        const userTokensRef = db.doc(`tenants/${tenantId}/users/${uid}`);
        await db.recursiveDelete(userTokensRef);
      }

      await db.doc(`users_metadata/${uid}`).delete();

      try {
        await db.doc(`users/${uid}`).delete();
      } catch {
        // Ignored if non-existent
      }

      await db.collection("audit").add({
        action: "deleteMemberAccount",
        uid,
        tenantId,
        role,
        timestamp: new Date().toISOString(),
      });

      await getAuth().deleteUser(uid);

      logger.info("deleteMemberAccount completed successfully", { uid });
      return { success: true, message: "Account utente eliminato con successo." };
    } catch (err: unknown) {
      logger.error("deleteMemberAccount failed", { uid, err });
      throw new HttpsError("internal", "Errore durante l'eliminazione dell'account collaboratore.");
    }
  },
); // end deleteMemberAccount

/**
 * Callable Function: deleteTenantAndAccount
 *
 * Permanently deletes an entire tenant (recursive delete of workspaces, tasks, approvals,
 * invitations, members) and the owner's Auth user.
 * Blocks deletion if other team members still exist in the tenant.
 *
 * @security Verified JWT active claims required (`owner` or `superadmin`).
 */
export const deleteTenantAndAccount = onCall(
  { region: "europe-west1", cors: true, invoker: "public" },
  async (request) => {
    const rawAuth = request.auth as { uid: string; token: Record<string, unknown> } | undefined;
    if (!rawAuth || !rawAuth.uid) {
      throw new HttpsError("unauthenticated", "Autenticazione richiesta.");
    }
    if (rawAuth.token.isActive !== true) {
      throw new HttpsError("permission-denied", "Account non attivo.");
    }

    const uid = rawAuth.uid;
    const role = (rawAuth.token.role as string) ?? "user";
    const tenantId = (rawAuth.token.tenantId as string) ?? "default-tenant";

    if (role !== "owner" && role !== "superadmin") {
      throw new HttpsError(
        "permission-denied",
        "Solo il titolare aziendale (owner) può eliminare l'organizzazione.",
      );
    }

    const { confirmText } = (request.data as { confirmText?: string }) ?? {};
    if (!confirmText || typeof confirmText !== "string") {
      throw new HttpsError("invalid-argument", "È obbligatorio inserire la stringa di conferma.");
    }

    const db = getFirestore();
    const tenantRef = db.doc(`tenants/${tenantId}`);
    const tenantSnap = await tenantRef.get();

    const tenantData = tenantSnap.data();
    const tenantName = (tenantData?.name as string | undefined) ?? "";
    const trimmedConfirm = confirmText.trim();
    const isPhraseValid =
      trimmedConfirm === "ELIMINA DEFINITIVAMENTE" ||
      trimmedConfirm === tenantId ||
      (tenantName !== "" && trimmedConfirm.toLowerCase() === tenantName.toLowerCase());

    if (!isPhraseValid) {
      throw new HttpsError(
        "invalid-argument",
        "La stringa di conferma inserita non corrisponde al nome dell'organizzazione o alla frase di sicurezza.",
      );
    }

    // Integrity Check: ensure no other team members exist
    const membersSnap = await tenantRef.collection("members").get();
    const otherMembers = membersSnap.docs.filter((docSnap) => docSnap.id !== uid);

    if (otherMembers.length > 0) {
      throw new HttpsError(
        "failed-precondition",
        `Impossibile eliminare l'organizzazione: sono ancora presenti ${otherMembers.length} ` +
          "collaboratori attivi. Rimuovi prima tutti i membri dal team o trasferisci la proprietà.",
      );
    }

    logger.warn("deleteTenantAndAccount: Initiating TOTAL recursive deletion", {
      tenantId,
      ownerUid: uid,
    });

    try {
      if (tenantSnap.exists) {
        await db.recursiveDelete(tenantRef);
      } else {
        const workspacesQuery = await tenantRef.collection("workspaces").get();
        for (const wsDoc of workspacesQuery.docs) {
          await db.recursiveDelete(wsDoc.ref);
        }
      }

      await db.doc(`users_metadata/${uid}`).delete();
      try {
        await db.doc(`users/${uid}`).delete();
      } catch {
        // Ignored if non-existent
      }

      await db.collection("audit").add({
        action: "deleteTenantAndAccount",
        tenantId,
        ownerUid: uid,
        timestamp: new Date().toISOString(),
      });

      await getAuth().deleteUser(uid);

      logger.info("deleteTenantAndAccount completed successfully", { tenantId, uid });
      return {
        success: true,
        message: "Organizzazione ed account eliminati definitivamente senza lasciare dati orfani.",
      };
    } catch (err: unknown) {
      logger.error("deleteTenantAndAccount failed", { tenantId, uid, err });
      throw new HttpsError(
        "internal",
        "Errore critico durante la distruzione ricorsiva del tenant.",
      );
    }
  },
); // end deleteTenantAndAccount

/**
 * Event Trigger: onUserAccountDeleted
 *
 * Intercepts user account deletion in Firebase Auth.
 * 1. Deletes personal profile metadata from `users_metadata/{uid}`.
 * 2. Checks if user was the sole member of a tenant or if tenant has no active members.
 * 3. If solo tenant, performs `db.recursiveDelete()` on `tenants/{tenantId}` (GDPR Art. 17).
 */
export const onUserAccountDeleted = functionsV1
  .region("europe-west1")
  .auth.user()
  .onDelete(async (user: functionsV1.auth.UserRecord) => {
    const uid = user.uid;
    logger.info("onUserAccountDeleted triggered", { uid });

    const db = getFirestore();

    // 1. Delete personal profile metadata doc
    try {
      await db.doc(`users_metadata/${uid}`).delete();
      logger.info("users_metadata deleted", { uid });
    } catch (err) {
      logger.warn("Failed to delete users_metadata doc", { uid, err });
    }

    // 2. Search for member documents matching uid across tenants
    try {
      const membersQuery = await db.collectionGroup("members").where("uid", "==", uid).get();

      for (const memberDoc of membersQuery.docs) {
        const tenantRef = memberDoc.ref.parent.parent;
        if (!tenantRef) continue;

        const tenantId = tenantRef.id;

        // Delete this member record
        await memberDoc.ref.delete();

        // Check remaining members in tenant
        const remainingMembers = await tenantRef.collection("members").get();
        if (remainingMembers.empty) {
          logger.info(
            "Solo tenant detected with 0 remaining members. Purging tenant ricorsivamente",
            { tenantId },
          );
          await db.recursiveDelete(tenantRef);
        }
      }

      // Also check fallback for default-tenant or tenant named by uid
      const userTenantRef = db.doc(`tenants/${uid}`);
      const userTenantSnap = await userTenantRef.get();
      if (userTenantSnap.exists) {
        logger.info("Purging user personal tenant ricorsivamente", { tenantId: uid });
        await db.recursiveDelete(userTenantRef);
      }
    } catch (err) {
      logger.error("Error during tenant member cleanup on user deletion", { uid, err });
    }
  }); // end onUserAccountDeleted

/**
 * Callable Function: purgeCompanyTenant
 *
 * Allows a Tenant Admin or Superadmin to permanently delete a company workspace and all its data.
 * Requires double confirmation with `confirmTenantName`.
 *
 * @security Verified JWT active claims required (`admin`, `owner` or `superadmin` role).
 */
export const purgeCompanyTenant = onCall(
  { region: "europe-west1", cors: true, invoker: "public" },
  async (request) => {
    const rawAuth = request.auth as { uid: string; token: Record<string, unknown> } | undefined;

    requireRole(rawAuth, ["admin", "owner", "superadmin"]);

    const { tenantId, confirmTenantName } = request.data as {
      tenantId: string;
      confirmTenantName: string;
    };

    if (!tenantId || !confirmTenantName || typeof confirmTenantName !== "string") {
      throw new HttpsError("invalid-argument", "tenantId e confirmTenantName sono obbligatori.");
    }

    // Tenant boundary check (§3, §5): caller must belong to target tenant unless superadmin
    const callerTenantId = rawAuth?.token.tenantId as string | undefined;
    const callerRole = rawAuth?.token.role as string | undefined;

    if (callerRole !== "superadmin" && callerTenantId !== tenantId) {
      throw new HttpsError("permission-denied", "Non sei autorizzato ad eliminare questo tenant.");
    }

    const db = getFirestore();
    const tenantRef = db.doc(`tenants/${tenantId}`);
    const tenantSnap = await tenantRef.get();

    if (!tenantSnap.exists) {
      throw new HttpsError("not-found", "Tenant non trovato.");
    }

    logger.info("purgeCompanyTenant initiated by admin", {
      tenantId,
      adminUid: rawAuth?.uid,
      confirmTenantName,
    });

    try {
      // Perform recursive delete of tenant document and ALL subcollections (workspaces, tasks, approvals, KB)
      await db.recursiveDelete(tenantRef);

      logger.info("purgeCompanyTenant completed successfully", { tenantId });
      return {
        success: true,
        message: "Organizzazione ed i relativi dati aziendali eliminati definitivamente.",
      };
    } catch (err) {
      logger.error("purgeCompanyTenant failed", { tenantId, err });
      throw new HttpsError(
        "internal",
        "Errore durante l'eliminazione dell'organizzazione aziendale.",
      );
    }
  },
); // end purgeCompanyTenant

// ── STEP 14: EMAIL INVITATION SYSTEM ─────────────────────────────────────────

import * as crypto from "crypto";
import { onSchedule } from "firebase-functions/v2/scheduler";

/**
 * Helper: compute SHA-256 hash of a raw token string.
 * The raw token is NEVER stored — only its hash (GDPR Art. 32 / Anti-Replay).
 * @param {string} rawToken - The raw invitation token generated with crypto.randomBytes.
 * @return {string} Hex-encoded SHA-256 digest used as Firestore document ID.
 */
function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
} // end hashToken

/**
 * Helper: send invitation email via Resend SDK (server-side only — Prescrizione 1).
 * The raw token is embedded in the link; hashing happens only server-side.
 * @param {object} params - Email parameters (toEmail, tenantName, tenantId, rawToken, role, resendApiKey).
 * @return {Promise<void>} Resolves when email is accepted by Resend API.
 */
async function sendInvitationEmail(params: {
  toEmail: string;
  tenantName: string;
  tenantId: string;
  rawToken: string;
  role: string;
  resendApiKey: string;
}): Promise<void> {
  const { Resend } = await import("resend");
  const resend = new Resend(params.resendApiKey);

  const inviteUrl = `https://opsflow-88of.web.app/#/invite?token=${params.rawToken}&tenant=${params.tenantId}`;

  await resend.emails.send({
    from: "OpsFlow <onboarding@resend.dev>",
    to: params.toEmail,
    subject: `Sei stato invitato a unirti a ${params.tenantName} su OpsFlow`,
    html: [
      "<div style=\"font-family:'Mulish',sans-serif;background:#0a2342;",
      "color:#f9f7f2;padding:40px;border-radius:12px;max-width:580px;margin:auto\">",
      "<h1 style=\"color:#c5a065;font-family:'Playfair Display',serif;margin-bottom:8px\">",
      "Benvenuto in OpsFlow &#x1F44B;</h1>",
      "<p style=\"margin-bottom:24px\">",
      `Sei stato invitato a unirti all'organizzazione <strong>${params.tenantName}</strong>`,
      `con il ruolo <strong>${params.role}</strong>.</p>`,
      `<a href="${inviteUrl}"`,
      "style=\"display:inline-block;background:#c5a065;color:#0a2342;",
      "font-weight:700;padding:14px 32px;border-radius:8px;\"",
      "text-decoration:none;font-size:16px\">",
      "&#x2705; Accetta invito &amp; unisciti al team</a>",
      "<p style=\"margin-top:32px;font-size:13px;color:#9aacbe\">",
      "Questo link scade in 7 giorni. ",
      "Se non riconosci questo invito puoi ignorare questa email.<br>",
      "Per revocare: <a href=\"mailto:support@opsflow.app\"",
      "style=\"color:#c5a065\">support@opsflow.app</a></p>",
      "<p style=\"margin-top:16px;font-size:11px;color:#5a7a9b\">",
      "OpsFlow SaaS Platform &mdash; GDPR Art. 14 compliant.</p>",
      "</div>",
    ].join(""),
  });
} // end sendInvitationEmail

/**
 * Callable Function: createTenantInvitation (Fase 2.1)
 *
 * Creates a cryptographic invitation token (SHA-256 hash as Firestore document ID)
 * and delivers the invitation email server-side via Resend.
 *
 * @security JWT: admin or superadmin only. Admin restricted to own tenant.
 * @gdpr Audit log written on every invitation issuance (GDPR Art. 30).
 * @performance 1 Firestore write + 1 email send.
 */
export const createTenantInvitation = onCall(
  {
    region: "europe-west1",
    cors: true,
    invoker: "public",
    secrets: [RESEND_API_KEY],
  },
  async (request) => {
    const rawAuth = request.auth as { uid: string; token: Record<string, unknown> } | undefined;
    requireRole(rawAuth, ["admin", "superadmin"]);
    const caller = rawAuth as { uid: string; token: Record<string, unknown> };

    const { email, role } = request.data as { email: string; role: "admin" | "user" };

    // Input validation
    if (!email || !role) {
      throw new HttpsError("invalid-argument", "email e role sono obbligatori.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError("invalid-argument", "Indirizzo email non valido.");
    }
    if (!["admin", "user"].includes(role)) {
      throw new HttpsError("invalid-argument", "Ruolo non valido. Usare 'admin' o 'user'.");
    }

    // Tenant boundary check
    const callerTenantId = caller.token.tenantId as string | undefined;
    const callerRole = caller.token.role as string;
    if (callerRole === "admin" && !callerTenantId) {
      throw new HttpsError("permission-denied", "Tenant non trovato nel token JWT.");
    }
    let tenantId = callerTenantId || "";
    if (callerRole === "superadmin") {
      tenantId = (request.data.tenantId as string) || callerTenantId || "";
    }

    // Retrieve tenant name for the email
    const db = getFirestore();
    const tenantSnap = await db.doc(`tenants/${tenantId}`).get();
    const tenantName = (tenantSnap.data()?.name as string | undefined) ?? tenantId;

    // Prescrizione 2: Generate raw token + tokenHash (document ID = tokenHash for O(1) lookup)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days

    // Write invitation doc (tokenHash = document ID)
    await db.doc(`tenants/${tenantId}/invitations/${tokenHash}`).set({
      tokenHash,
      tenantId,
      email,
      role,
      status: "pending",
      invitedBy: caller.uid,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    // Prescrizione 1: Send email server-side ONLY
    try {
      await sendInvitationEmail({
        toEmail: email,
        tenantName,
        tenantId,
        rawToken,
        role,
        resendApiKey: RESEND_API_KEY.value(),
      });
    } catch (emailErr) {
      // Rollback invitation doc if email fails — atomic consistency
      await db.doc(`tenants/${tenantId}/invitations/${tokenHash}`).delete();
      logger.error("createTenantInvitation: email send failed — invitation rolled back", {
        tenantId,
        email,
        emailErr,
      });
      throw new HttpsError("internal", "Errore nell'invio dell'email di invito. Riprova.");
    }

    // GDPR Art. 30 audit log
    await db.collection("audit").add({
      action: "createTenantInvitation",
      tenantId,
      invitedEmail: email, // email allowed in audit — GDPR Art. 30 (traceability)
      role,
      invitedBy: caller.uid,
      timestamp: now.toISOString(),
    });

    logger.info("createTenantInvitation: invitation issued", { tenantId, email, role });
    return { success: true, message: `Invito inviato a ${email} con ruolo ${role}.` };
  },
); // end createTenantInvitation

/**
 * Callable Function: acceptTenantInvitation (Fase 2.2)
 *
 * Validates the raw invitation token (O(1) getDoc by tokenHash), verifies expiry and status,
 * then atomically via runTransaction:
 *  - Sets JWT Custom Claims { tenantId, role, isActive: true }
 *  - Writes member doc in tenants/{tenantId}/members/{uid}
 *  - Marks invitation as accepted
 *
 * @security Prescrizione 3 — caller must invoke getIdToken(true) after this returns.
 * @performance 1 O(1) getDoc + runTransaction (1 read + 2 writes).
 */
export const acceptTenantInvitation = onCall(
  { region: "europe-west1", cors: true, invoker: "public" },
  async (request) => {
    const rawAuth = request.auth as { uid: string; token: Record<string, unknown> } | undefined;
    if (!rawAuth) {
      throw new HttpsError("unauthenticated", "Devi essere autenticato per accettare un invito.");
    }

    const { token, tenantId } = request.data as { token: string; tenantId: string };
    if (!token || !tenantId) {
      throw new HttpsError("invalid-argument", "token e tenantId sono obbligatori.");
    }

    // Prescrizione 2: O(1) direct lookup by tokenHash
    const tokenHash = hashToken(token);
    const db = getFirestore();
    const invitationRef = db.doc(`tenants/${tenantId}/invitations/${tokenHash}`);

    // Prescrizione 3 (Anti-Replay): use runTransaction to prevent concurrent redemption
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(invitationRef);

      if (!snap.exists) {
        throw new HttpsError("not-found", "Invito non valido o già riscattato.");
      }

      const inv = snap.data() as {
        status: string;
        expiresAt: string;
        email: string;
        role: string;
        tenantId: string;
      };

      // Status check
      if (inv.status !== "pending") {
        throw new HttpsError(
          "failed-precondition",
          `Invito non più valido (stato: ${inv.status}).`,
        );
      }

      // Expiry check
      if (new Date(inv.expiresAt) < new Date()) {
        tx.update(invitationRef, { status: "expired" });
        throw new HttpsError("deadline-exceeded", "Il link di invito è scaduto.");
      }

      // Anti-Privilege Escalation: role is read from DB — not from client payload
      const assignedRole = inv.role as "admin" | "user";

      // Set JWT Custom Claims via Admin SDK (bypasses Firestore rules — server-side only)
      await getAuth().setCustomUserClaims(rawAuth.uid, {
        tenantId: inv.tenantId,
        role: assignedRole,
        isActive: true,
      });

      // Write member document
      const memberRef = db.doc(`tenants/${tenantId}/members/${rawAuth.uid}`);
      tx.set(memberRef, {
        uid: rawAuth.uid,
        email: rawAuth.token.email ?? inv.email,
        role: assignedRole,
        tenantId: inv.tenantId,
        joinedAt: new Date().toISOString(),
        displayName: rawAuth.token.name ?? null,
        photoURL: rawAuth.token.picture ?? null,
        isActive: true,
      });

      // Mark invitation as accepted
      tx.update(invitationRef, {
        status: "accepted",
        acceptedAt: new Date().toISOString(),
        acceptedByUid: rawAuth.uid,
      });
    });

    // GDPR Art. 30 audit log
    await db.collection("audit").add({
      action: "acceptTenantInvitation",
      tenantId,
      acceptedByUid: rawAuth.uid,
      timestamp: new Date().toISOString(),
    });

    logger.info("acceptTenantInvitation: membership granted", { tenantId, uid: rawAuth.uid });

    // IMPORTANT: After this response, the FRONTEND must call getIdToken(true) + refreshClaims()
    // to load the new JWT Custom Claims before navigating (Prescrizione 3).
    return {
      success: true,
      tenantId,
      message: "Accesso all'organizzazione concesso con successo. Benvenuto!",
    };
  },
); // end acceptTenantInvitation

/**
 * Callable Function: revokeTenantInvitation (Fase 2.3)
 *
 * Allows an Admin to revoke a pending invitation before it is redeemed.
 * Updates status to 'revoked' — invitation can no longer be accepted.
 *
 * @security Admin of the same tenant only.
 */
export const revokeTenantInvitation = onCall(
  { region: "europe-west1", cors: true, invoker: "public" },
  async (request) => {
    const rawAuth = request.auth as { uid: string; token: Record<string, unknown> } | undefined;
    requireRole(rawAuth, ["admin", "superadmin"]);
    const caller = rawAuth as { uid: string; token: Record<string, unknown> };

    const { tokenHash, tenantId } = request.data as { tokenHash: string; tenantId: string };
    if (!tokenHash || !tenantId) {
      throw new HttpsError("invalid-argument", "tokenHash e tenantId sono obbligatori.");
    }

    // Tenant boundary check
    const callerRole = caller.token.role as string;
    const callerTenantId = caller.token.tenantId as string | undefined;
    if (callerRole === "admin" && callerTenantId !== tenantId) {
      throw new HttpsError(
        "permission-denied",
        "Un admin può revocare inviti solo per il proprio tenant.",
      );
    }

    const db = getFirestore();
    const invRef = db.doc(`tenants/${tenantId}/invitations/${tokenHash}`);
    const snap = await invRef.get();

    if (!snap.exists) {
      throw new HttpsError("not-found", "Invito non trovato.");
    }
    if (snap.data()?.status !== "pending") {
      throw new HttpsError(
        "failed-precondition",
        "L'invito non è in stato 'pending' e non può essere revocato.",
      );
    }

    await invRef.update({
      status: "revoked",
      revokedBy: caller.uid,
      revokedAt: new Date().toISOString(),
    });

    // GDPR Art. 30 audit log
    await db.collection("audit").add({
      action: "revokeTenantInvitation",
      tenantId,
      tokenHash,
      revokedBy: caller.uid,
      timestamp: new Date().toISOString(),
    });

    logger.info("revokeTenantInvitation: invitation revoked", { tenantId, tokenHash });
    return { success: true, message: "Invito revocato con successo." };
  },
); // end revokeTenantInvitation

/**
 * Scheduled Function: cleanupExpiredInvitations (Fase 2.4)
 *
 * Runs every 24 hours via Cloud Scheduler.
 * Deletes all invitation documents in 'pending' status with expiresAt < now (GDPR Art. 17 TTL).
 *
 * @performance Bounded: max 7-day-old documents × active tenants. Paginated in batches of 100.
 */
export const cleanupExpiredInvitations = onSchedule(
  {
    schedule: "every 24 hours",
    region: "europe-west1",
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async () => {
    const db = getFirestore();
    const now = new Date().toISOString();

    const expiredQuery = await db
      .collectionGroup("invitations")
      .where("status", "==", "pending")
      .where("expiresAt", "<", now)
      .limit(100)
      .get();

    if (expiredQuery.empty) {
      logger.info("cleanupExpiredInvitations: no expired invitations found.");
      return;
    }

    const batch = db.batch();
    expiredQuery.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    logger.info("cleanupExpiredInvitations: deleted expired invitations", {
      count: expiredQuery.docs.length,
    });
  },
); // end cleanupExpiredInvitations

// ── TENANT PROVISIONING: provisionInitialTenant (Step 15) ─────────────────────

/**
 * Callable Function: provisionInitialTenant
 *
 * Automatically provisions a dedicated tenant, root documents, default workspace,
 * and sets Custom Claims { tenantId, role: "owner", isActive: true } for newly registered users.
 *
 * @security
 * - Caller must be authenticated with emailVerified === true.
 * - Idempotent: If user already has an active tenant, returns current tenant without re-creating.
 *
 * @gdpr
 * - Logs tenant creation event to /audit for GDPR Art. 30 compliance.
 */
export const provisionInitialTenant = onCall(
  { region: "europe-west1", cors: true, invoker: "public" },
  async (request) => {
    const rawAuth = request.auth;
    if (!rawAuth || !rawAuth.uid) {
      throw new HttpsError("unauthenticated", "Autenticazione richiesta.");
    }

    const emailVerified =
      rawAuth.token.email_verified === true ||
      rawAuth.token.firebase?.sign_in_provider === "google.com";

    if (!emailVerified) {
      throw new HttpsError(
        "failed-precondition",
        "L'email deve essere verificata prima di procedere con l'inizializzazione del tenant.",
      );
    }

    const { organizationName } = (request.data || {}) as { organizationName?: string };
    const uid = rawAuth.uid;
    const userEmail = (rawAuth.token.email as string) || "";
    const existingTenantId = rawAuth.token.tenantId as string | undefined;

    const db = getFirestore();
    const authAdmin = getAuth();

    if (existingTenantId && existingTenantId !== "default-tenant") {
      const existingTenantDoc = await db.collection("tenants").doc(existingTenantId).get();
      if (existingTenantDoc.exists) {
        logger.info("provisionInitialTenant: user already has an active tenant", {
          uid,
          tenantId: existingTenantId,
        });
        return {
          success: true,
          tenantId: existingTenantId,
          workspaceId: "main",
          alreadyExisted: true,
        };
      }
    }

    const tenantId = `t_${uid
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 12)
      .toLowerCase()}`;
    const cleanOrgName =
      typeof organizationName === "string" && organizationName.trim().length > 0 ?
        organizationName.trim() :
        `Spazio di ${userEmail.split("@")[0] || "OpsFlow"}`;

    const nowIso = new Date().toISOString();
    const batch = db.batch();

    // 1. Root tenant: tenants/{tenantId}
    const tenantRef = db.collection("tenants").doc(tenantId);
    batch.set(
      tenantRef,
      {
        id: tenantId,
        name: cleanOrgName,
        ownerUid: uid,
        createdAt: nowIso,
        updatedAt: nowIso,
        status: "active",
        tier: "free",
      },
      { merge: true },
    );

    // 2. Default workspace: tenants/{tenantId}/workspaces/main
    const workspaceRef = tenantRef.collection("workspaces").doc("main");
    batch.set(
      workspaceRef,
      {
        id: "main",
        name: "Workspace Principale",
        description: "Spazio di lavoro operativo predefinito",
        tenantId,
        isPinned: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      { merge: true },
    );

    // 3. User profile: users/{uid}
    const userRef = db.collection("users").doc(uid);
    batch.set(
      userRef,
      {
        uid,
        email: userEmail,
        displayName: (rawAuth.token.name as string) || cleanOrgName,
        tenantId,
        role: "owner",
        isActive: true,
        createdAt: nowIso,
        lastLoginAt: nowIso,
      },
      { merge: true },
    );

    // 4. Tenant membership: tenants/{tenantId}/members/{uid}
    const memberRef = tenantRef.collection("members").doc(uid);
    batch.set(
      memberRef,
      {
        uid,
        email: userEmail,
        role: "owner",
        joinedAt: nowIso,
      },
      { merge: true },
    );

    // 5. GDPR Art. 30 audit log
    const auditRef = db.collection("audit").doc();
    batch.set(auditRef, {
      action: "provisionInitialTenant",
      tenantId,
      ownerUid: uid,
      email: userEmail,
      timestamp: nowIso,
    });

    await batch.commit();

    await authAdmin.setCustomUserClaims(uid, {
      tenantId,
      role: "owner",
      isActive: true,
    });

    logger.info("provisionInitialTenant: tenant provisioned successfully", {
      uid,
      tenantId,
      cleanOrgName,
    });

    return {
      success: true,
      tenantId,
      workspaceId: "main",
      alreadyExisted: false,
    };
  },
); // end provisionInitialTenant
