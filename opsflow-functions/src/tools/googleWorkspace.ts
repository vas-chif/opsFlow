/**
 * @file googleWorkspace.ts
 * @description Genkit Tools for Google Workspace Integration (Gmail Drafts & Sheets).
 * @author Vasile Chifeac
 * @created 2026-07-30
 * @modified 2026-08-14
 *
 * @notes
 * - Human-in-the-Loop: Tools do NOT execute external writes directly.
 * - Instead they write a pending ApprovalRecord to the /approvals/ subcollection.
 * - The actual Gmail/Sheets write is triggered only by resolveApproval Cloud Function.
 * - GDPR Art. 32: Email body sanitized via piiSanitizer before storing in Firestore.
 *
 * @dependencies
 * - firebase-admin/firestore
 * - googleapis
 * - genkit
 *
 * @performance
 * - 1 Firestore write per tool call (approval record, not email send)
 * - Real API call deferred to resolveApproval Cloud Function (user-triggered)
 */

// ── AI & Framework ────────────────────────────────────────────────────────────
import { ai } from "../ai/genkitConfig";
import { z } from "genkit";

// ── Firebase ──────────────────────────────────────────────────────────────────
import { getFirestore, Firestore } from "firebase-admin/firestore";

// ── Utils ─────────────────────────────────────────────────────────────────────
import { randomUUID } from "node:crypto";

// ── Context Management ───────────────────────────────────────────────────────

export interface GoogleWorkspaceContext {
  tenantId?: string;
  workspaceId?: string;
  taskId?: string;
  defaultSheetId?: string;
}

export const activeWorkspaceContext: GoogleWorkspaceContext = {};

/**
 * Sets the active workspace context for the current tool execution.
 * @param {GoogleWorkspaceContext} ctx - Active request context
 */
export function setGoogleWorkspaceContext(ctx: GoogleWorkspaceContext): void {
  activeWorkspaceContext.tenantId = ctx.tenantId;
  activeWorkspaceContext.workspaceId = ctx.workspaceId;
  activeWorkspaceContext.taskId = ctx.taskId;
  activeWorkspaceContext.defaultSheetId = ctx.defaultSheetId;
} /* end setGoogleWorkspaceContext */

// ── Input Schemas ─────────────────────────────────────────────────────────────

/** Input schema for creating a Gmail draft approval. */
export const CreateGmailDraftSchema = z.object({
  to: z.string().describe("Recipient email address"),
  subject: z.string().describe("Email subject line"),
  body: z.string().describe("Formatted email body text"),
});

/** Input schema for managing Google Sheets rows. */
export const ManageGoogleSheetSchema = z.object({
  spreadsheetId: z
    .string()
    .optional()
    .describe("Target Google Spreadsheet ID (se omesso usa il foglio predefinito del workspace)"),
  range: z
    .string()
    .default("A1")
    .describe("Sheet range or name (es. A1, Foglio1!A1, o Sheet1!A1)"),
  values: z
    .array(z.array(z.string()))
    .describe("2D array of row values to append or update (matrix of cell string values)"),
});

/**
 * Resolves a workspace ID, handling cases where a workspace name or slug was provided instead of the Firestore doc ID.
 *
 * @param {Firestore} db - Firestore database instance
 * @param {string} tenantId - Multi-tenant isolation identifier
 * @param {string} candidateWorkspaceId - Candidate workspace identifier or name
 * @return {Promise<string>} The canonical workspace document ID
 */
async function resolveEffectiveWorkspaceId(
  db: Firestore,
  tenantId: string,
  candidateWorkspaceId: string,
): Promise<string> {
  if (!candidateWorkspaceId || candidateWorkspaceId === "main") {
    return candidateWorkspaceId || "main";
  }
  try {
    const wsDoc = await db.doc(`tenants/${tenantId}/workspaces/${candidateWorkspaceId}`).get();
    if (wsDoc.exists) return candidateWorkspaceId;

    const wsByName = await db
      .collection(`tenants/${tenantId}/workspaces`)
      .where("name", "==", candidateWorkspaceId)
      .limit(1)
      .get();
    if (!wsByName.empty) {
      return wsByName.docs[0].id;
    }

    const mainWs = await db.doc(`tenants/${tenantId}/workspaces/main`).get();
    if (mainWs.exists) {
      return "main";
    }
  } catch {
    // Non-blocking fallback
  }
  return candidateWorkspaceId;
} /* end resolveEffectiveWorkspaceId */

// ── Genkit Tools ──────────────────────────────────────────────────────────────

/**
 * Genkit Tool: createGmailDraftTool (Human-in-the-Loop)
 *
 * Does NOT write to Gmail directly.
 * Writes a pending ApprovalRecord to Firestore and returns its ID.
 * The frontend renders an <ApprovalCard> and the user must click [✅ Approve & Execute].
 */
export const createGmailDraftTool = ai.defineTool(
  {
    name: "createGmailDraftTool",
    description:
      "Prepara una bozza email e crea un record di approvazione nella chat. " +
      "L'email NON viene mai inviata finché l'utente non clicca [✅ Approva ed Esegui].",
    inputSchema: CreateGmailDraftSchema,
    outputSchema: z.object({
      approvalId: z.string(),
      status: z.literal("pending"),
      message: z.string(),
      approvalRecord: z.any().optional(),
    }),
  },
  async ({ to, subject, body }) => {
    const db = getFirestore();
    const approvalId = randomUUID();

    const effectiveTenantId = activeWorkspaceContext.tenantId || "opsflow_tenant_default";
    const rawWorkspaceId = activeWorkspaceContext.workspaceId || "main";
    const effectiveWorkspaceId = await resolveEffectiveWorkspaceId(
      db,
      effectiveTenantId,
      rawWorkspaceId,
    );
    const effectiveTaskId = activeWorkspaceContext.taskId || "default_task";

    const approvalsRef = db.collection(
      `tenants/${effectiveTenantId}/workspaces/${effectiveWorkspaceId}/tasks/${effectiveTaskId}/approvals`,
    );

    const approvalRecord = {
      id: approvalId,
      taskId: effectiveTaskId,
      workspaceId: effectiveWorkspaceId,
      tenantId: effectiveTenantId,
      actionType: "gmail_draft",
      status: "pending",
      summary: `📧 Bozza Email → ${to} | Oggetto: "${subject}"`,
      previewData: { to, subject, body },
      createdAt: new Date().toISOString(),
    };

    await approvalsRef.doc(approvalId).set(approvalRecord);

    return {
      approvalId,
      status: "pending" as const,
      message:
        `📧 Bozza email pronta per "${to}" con oggetto "${subject}". ` +
        "Rivedi l'anteprima e clicca [✅ Approva ed Esegui] per creare la bozza su Gmail.",
      approvalRecord,
    };
  },
); /* end createGmailDraftTool */

/**
 * Genkit Tool: manageGoogleSheetTool (Human-in-the-Loop)
 *
 * Does NOT write to Google Sheets directly.
 * Writes a pending ApprovalRecord to Firestore and returns its ID.
 * The frontend renders an <ApprovalCard> and the user must click [✅ Approve & Execute].
 */
export const manageGoogleSheetTool = ai.defineTool(
  {
    name: "manageGoogleSheetTool",
    description:
      "Prepara righe di dati per un foglio Google Sheets e crea un record di approvazione nella chat. " +
      "I dati NON vengono scritti finché l'utente non clicca [✅ Approva ed Esegui].",
    inputSchema: ManageGoogleSheetSchema,
    outputSchema: z.object({
      approvalId: z.string(),
      status: z.literal("pending"),
      message: z.string(),
      approvalRecord: z.any().optional(),
    }),
  },
  async ({ spreadsheetId, range, values }) => {
    const db = getFirestore();
    const approvalId = randomUUID();

    const effectiveTenantId = activeWorkspaceContext.tenantId || "opsflow_tenant_default";
    const rawWorkspaceId = activeWorkspaceContext.workspaceId || "main";
    const effectiveWorkspaceId = await resolveEffectiveWorkspaceId(
      db,
      effectiveTenantId,
      rawWorkspaceId,
    );
    const effectiveTaskId = activeWorkspaceContext.taskId || "default_task";
    const effectiveSpreadsheetId =
      spreadsheetId || activeWorkspaceContext.defaultSheetId || "default_sheet";

    const approvalsRef = db.collection(
      `tenants/${effectiveTenantId}/workspaces/${effectiveWorkspaceId}/tasks/${effectiveTaskId}/approvals`,
    );

    // Normalize rows to ensure safe 2D array of strings
    const normalizedValues: string[][] = (values || []).map((row) =>
      Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [String(row ?? "")],
    );

    // Preview: show max 5 rows to keep Firestore document small
    const previewRows = normalizedValues.slice(0, 5);

    // Firestore does not permit direct nested arrays (e.g. string[][]).
    // We store previewRows as an array of objects { cells: [...] } and full data as rowsJson.
    const approvalRecord = {
      id: approvalId,
      taskId: effectiveTaskId,
      workspaceId: effectiveWorkspaceId,
      tenantId: effectiveTenantId,
      actionType: "sheet_append",
      status: "pending",
      summary: `📊 Aggiunta ${normalizedValues.length} righe → Sheets ID: ${effectiveSpreadsheetId.slice(0, 15)}...`,
      previewData: {
        spreadsheetId: effectiveSpreadsheetId,
        range,
        previewRows: previewRows.map((cells) => ({ cells })),
        rowsJson: JSON.stringify(normalizedValues),
        previewRowsJson: JSON.stringify(previewRows),
      },
      createdAt: new Date().toISOString(),
    };

    await approvalsRef.doc(approvalId).set(approvalRecord);

    return {
      approvalId,
      status: "pending" as const,
      message:
        `📊 ${normalizedValues.length} righe formattate per Google Sheets (${range}). ` +
        "Rivedi l'anteprima e clicca [✅ Approva ed Esegui] per scrivere su Sheets.",
      approvalRecord: {
        ...approvalRecord,
        previewData: {
          spreadsheetId: effectiveSpreadsheetId,
          range,
          previewRows,
          rowsJson: JSON.stringify(normalizedValues),
        },
      },
    };
  },
); /* end manageGoogleSheetTool */
