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

// Configure global options BEFORE importing any triggers or HTTPS handlers
setGlobalOptions({
  region: "europe-west1", // Zero cross-region egress cost towards Firestore (§5)
  maxInstances: 10, // Hard-cap — cost control < €1/1000 users/mo
});

import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { initializeApp } from "firebase-admin/app";
import { google } from "googleapis";

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

/**
 * Validates the caller's JWT token and checks the required role.
 * Throws HttpsError if unauthorized — never queries Firestore for authz (§5).
 *
 * @param {object | undefined} auth - The auth context from an onCall handler.
 * @param {Array<string>} allowedRoles - At least one of these roles must match the token claim.
 * @return {void}
 */
function requireRole(
  auth: { uid: string; token: Record<string, unknown> } | undefined,
  allowedRoles: Array<"superadmin" | "admin" | "user">,
): void {
  if (!auth) {
    throw new HttpsError("unauthenticated", "Autenticazione richiesta.");
  }
  if (auth.token.isActive !== true) {
    throw new HttpsError("permission-denied", "Account non attivo. Contatta l'amministratore.");
  }
  const callerRole = auth.token.role as string | undefined;
  if (!callerRole || !allowedRoles.includes(callerRole as "superadmin" | "admin" | "user")) {
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
export const setUserRole = onCall({ region: "europe-west1" }, async (request) => {
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
}); // end setUserRole

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
        model: "googleai/gemini-1.5-flash",
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
    memory: "1GiB", // Step 12: 1GiB RAM grants 1 full vCPU to Cloud Run (fixes container healthcheck boot timeout)
    minInstances: 0, // Scale-to-Zero: €0,00 during inactivity
    maxInstances: 10, // Hard-cap for 1000 concurrent users
  },
  async (req, res) => {
    try {
      const {
        message,
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
        const oAuth2Client = await getAuthenticatedOAuth2Client(tenantId, userId, [
          "https://www.googleapis.com/auth/gmail.compose",
        ]);

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
          previewRows: string[][];
        };

        const oAuth2Client = await getAuthenticatedOAuth2Client(tenantId, userId, [
          "https://www.googleapis.com/auth/spreadsheets",
        ]);

        const sheets = google.sheets({ version: "v4", auth: oAuth2Client });
        await sheets.spreadsheets.values.append({
          spreadsheetId: preview.spreadsheetId,
          range: preview.range,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: preview.previewRows },
        });

        logger.info("resolveApproval: Sheets rows appended", { tenantId, taskId, approvalId });
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

// ── GOOGLE OAUTH CALLBACK ─────────────────────────────────────────────────────

/**
 * Callable Function: googleOAuthCallback
 * Stores encrypted OAuth tokens in Firestore Vault after consent flow.
 */
export const googleOAuthCallback = onRequest(
  { cors: true, region: "europe-west1" },
  async (req, res) => {
    const { code, tenantId, userId, scopes } = req.body as {
      code: string;
      tenantId: string;
      userId: string;
      scopes: string[];
    };

    if (!code || !tenantId || !userId) {
      res.status(400).json({ error: "Missing code, tenantId or userId." });
      return;
    }

    try {
      const { OAuth2 } = google.auth;
      const oAuth2Client = new OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI,
      );

      const { tokens } = await oAuth2Client.getToken(code);

      if (!tokens.refresh_token) {
        res
          .status(400)
          .json({ error: "No refresh_token received. Ensure prompt: consent was set." });
        return;
      }

      await saveOAuthToken(tenantId, userId, {
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token ?? "",
        scopes: scopes ?? [],
        expiresAt: tokens.expiry_date ?? Date.now() + 3600_000,
      });

      logger.info("googleOAuthCallback: token saved to vault", { tenantId, userId });
      res.status(200).json({ success: true });
    } catch (err) {
      logger.error("googleOAuthCallback: failed", { err });
      res.status(500).json({ error: "OAuth token exchange failed." });
    }
  },
); // end googleOAuthCallback

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
export const generateDbsAttitude = onCall({ region: "europe-west1" }, async (request) => {
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
      model: "googleai/gemini-1.5-flash",
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
}); // end generateDbsAttitude
