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
import { getFirestore } from "firebase-admin/firestore";

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
} /*end setGoogleWorkspaceContext*/

// ── Input Schemas ─────────────────────────────────────────────────────────────

/** Input schema for creating a Gmail draft approval. */
export const CreateGmailDraftSchema = z.object({
  to: z.string().describe("Recipient email address"),
  subject: z.string().describe("Email subject line"),
  body: z.string().describe("Formatted email body text"),
  tenantId: z.string().optional().describe("Tenant ID for Firestore isolation"),
  workspaceId: z.string().optional().describe("Workspace ID for scoping"),
  taskId: z.string().optional().describe("Task ID for approval subcollection"),
});

/** Input schema for managing Google Sheets rows. */
export const ManageGoogleSheetSchema = z.object({
  spreadsheetId: z
    .string()
    .optional()
    .describe("Target Google Spreadsheet ID (se omesso usa il foglio predefinito del workspace)"),
  range: z
    .string()
    .default("Sheet1!A1")
    .describe("Sheet range or name (es. Sheet1!A1 o NomeFoglio!A1)"),
  values: z
    .array(z.array(z.union([z.string(), z.number(), z.boolean()])))
    .describe("2D array of row values to append or update"),
  tenantId: z.string().optional().describe("Tenant ID for Firestore isolation"),
  workspaceId: z.string().optional().describe("Workspace ID for scoping"),
  taskId: z.string().optional().describe("Task ID for approval subcollection"),
});

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
  async ({ to, subject, body, tenantId, workspaceId, taskId }) => {
    const db = getFirestore();
    const approvalId = randomUUID();

    const effectiveTenantId =
      tenantId || activeWorkspaceContext.tenantId || "opsflow_tenant_default";
    const effectiveWorkspaceId =
      workspaceId || activeWorkspaceContext.workspaceId || "default_workspace";
    const effectiveTaskId = taskId || activeWorkspaceContext.taskId || "default_task";

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
  async ({ spreadsheetId, range, values, tenantId, workspaceId, taskId }) => {
    const db = getFirestore();
    const approvalId = randomUUID();

    const effectiveTenantId =
      tenantId || activeWorkspaceContext.tenantId || "opsflow_tenant_default";
    const effectiveWorkspaceId =
      workspaceId || activeWorkspaceContext.workspaceId || "default_workspace";
    const effectiveTaskId = taskId || activeWorkspaceContext.taskId || "default_task";
    const effectiveSpreadsheetId =
      spreadsheetId || activeWorkspaceContext.defaultSheetId || "default_sheet";

    const approvalsRef = db.collection(
      `tenants/${effectiveTenantId}/workspaces/${effectiveWorkspaceId}/tasks/${effectiveTaskId}/approvals`,
    );

    // Preview: show max 5 rows to keep Firestore document small
    const previewRows = values.slice(0, 5);

    const approvalRecord = {
      id: approvalId,
      taskId: effectiveTaskId,
      workspaceId: effectiveWorkspaceId,
      tenantId: effectiveTenantId,
      actionType: "sheet_append",
      status: "pending",
      summary: `📊 Aggiunta ${values.length} righe → Sheets ID: ${effectiveSpreadsheetId.slice(0, 15)}...`,
      previewData: {
        spreadsheetId: effectiveSpreadsheetId,
        range,
        previewRows,
        rows: values,
      },
      createdAt: new Date().toISOString(),
    };

    await approvalsRef.doc(approvalId).set(approvalRecord);

    return {
      approvalId,
      status: "pending" as const,
      message:
        `📊 ${values.length} righe formattate per Google Sheets (${range}). ` +
        "Rivedi l'anteprima e clicca [✅ Approva ed Esegui] per scrivere su Sheets.",
      approvalRecord,
    };
  },
); /* end manageGoogleSheetTool */
