/**
 * @file googleWorkspace.ts
 * @description Genkit Tools for Google Workspace Integration (Gmail Drafts & Sheets).
 * @author Vasile Chifeac
 * @created 2026-07-30
 * @modified 2026-09-17
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
 * - antiHallucinationGuardrail (Step 21: deterministic sanitization middleware)
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
import { logger } from "firebase-functions";

// ── Utils ─────────────────────────────────────────────────────────────────────
import { randomUUID } from "node:crypto";
import { validateAndSanitizeRows, buildGuardrailSummary } from "./antiHallucinationGuardrail";

// ── Context Management ───────────────────────────────────────────────────────

export interface GoogleWorkspaceContext {
  tenantId?: string;
  workspaceId?: string;
  taskId?: string;
  defaultSheetId?: string;
}

export const activeWorkspaceContext: GoogleWorkspaceContext = {};

/**
 * Step 21 — Anti-Hallucination Ground-Truth URL Buffer.
 * Accumulates all URLs returned by webSearch tools in a single agent turn.
 * Set is reset at the start of each chatWithAgentFlow invocation.
 * @see antiHallucinationGuardrail.ts
 */
export const groundTruthUrlBuffer: Set<string> = new Set();

/**
 * Resets the ground-truth URL buffer for a new agent turn.
 */
export function resetGroundTruthBuffer(): void {
  groundTruthUrlBuffer.clear();
} /* end resetGroundTruthBuffer */

/**
 * Adds verified URLs from a search result to the ground-truth buffer.
 * @param {string[]} urls - List of verified ground-truth URLs to accumulate.
 */
export function addGroundTruthUrls(urls: string[]): void {
  for (const url of urls) {
    if (url) groundTruthUrlBuffer.add(url);
  }
} /* end addGroundTruthUrls */

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
    const rawNormalized: string[][] = (values || []).map((row) =>
      Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [String(row ?? "")],
    );

    // Step 21 — Anti-Hallucination Guardrail: sanitize before Firestore write
    const guardrailResult = validateAndSanitizeRows(rawNormalized, groundTruthUrlBuffer, true);
    const normalizedValues = guardrailResult.sanitizedValues;
    const guardrailSummary = buildGuardrailSummary(guardrailResult);

    if (guardrailResult.correctionsCount > 0) {
      logger.info("[manageGoogleSheetTool] Anti-hallucination guardrail applied", {
        corrections: guardrailResult.correctionsCount,
        flags: guardrailResult.flags,
      });
    }

    // Preview: show max 5 rows to keep Firestore document small
    const previewRows = normalizedValues.slice(0, 5);

    // Build guardrail metadata for transparency in ApprovalCard
    let guardrailMeta = undefined;
    if (guardrailResult.correctionsCount > 0) {
      guardrailMeta = {
        correctionsCount: guardrailResult.correctionsCount,
        flags: guardrailResult.flags,
        summary: guardrailSummary,
      };
    }

    // Firestore does not permit direct nested arrays (e.g. string[][]).
    // We store previewRows as an array of objects { cells: [...] } and full data as rowsJson.
    const baseRowCount = rawNormalized.length > 0 ? rawNormalized.length - 1 : 0; // exclude header
    const approvalRecord = {
      id: approvalId,
      taskId: effectiveTaskId,
      workspaceId: effectiveWorkspaceId,
      tenantId: effectiveTenantId,
      actionType: "sheet_append",
      status: "pending",
      summary: `📊 Aggiunta ${baseRowCount} righe → Sheets ID: ${effectiveSpreadsheetId.slice(0, 15)}...`,
      guardrail: guardrailMeta,
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

    const guardrailNotice = guardrailSummary ? `\n${guardrailSummary}` : "";
    return {
      approvalId,
      status: "pending" as const,
      message:
        `📊 ${baseRowCount} righe formattate per Google Sheets (${range}). ` +
        `Rivedi l'anteprima e clicca [✅ Approva ed Esegui] per scrivere su Sheets.${guardrailNotice}`,
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

// ── Step 19: Auto-Styling Helper ─────────────────────────────────────────────

/**
 * Column width configuration for Elite sheet styling (pixels).
 * Follows the §6 Design System spec from Step 19 plan.
 * Index: 0=ID, 1=Nome, 2=Ruolo, 3=Score, 4=Competenze, 5=Gap, 6=GDPR, 7=Fonte, 8=Note
 */
const ELITE_COLUMN_WIDTHS_PX = [120, 160, 220, 110, 320, 320, 130, 220, 380] as const;

/**
 * Applies the OpsFlow "Elite" professional styling to a Google Sheet after data append.
 * Styling: frozen header row, dark navy bg (#1E293B), white bold text, text wrap, optimal column widths.
 *
 * @param {any} sheets - Authenticated Google Sheets API client (v4)
 * @param {string} spreadsheetId - Target spreadsheet ID
 * @param {string} sheetTitle - Exact tab name to style (used to resolve numeric sheetId)
 * @return {Promise<void>} Resolves when styling is applied or logged
 *
 * @performance
 * - 2 API calls: spreadsheets.get (resolve sheetId) + spreadsheets.batchUpdate (style)
 * - Estimated cost: ~€0.0000001 per execution
 */
export async function applyProfessionalSheetStyling(
  sheets: Awaited<ReturnType<typeof import("googleapis")["google"]["sheets"]>>,
  spreadsheetId: string,
  sheetTitle: string,
): Promise<void> {
  // Resolve numeric sheetId from sheet title (required by batchUpdate API)
  const metaResponse = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  });

  const sheetsList = metaResponse.data.sheets || [];
  const cleanTitle = (sheetTitle || "").replace(/^'|'$/g, "").trim();

  // 1. Exact match
  // 2. Cleaned title match (without quotes/trim)
  // 3. Case-insensitive match
  // 4. Normalized match (ignoring spaces, e.g. "Foglio1" == "Foglio 1")
  let targetSheet =
    sheetsList.find((s) => s.properties?.title === sheetTitle) ||
    sheetsList.find((s) => s.properties?.title === cleanTitle) ||
    sheetsList.find((s) => s.properties?.title?.toLowerCase() === cleanTitle.toLowerCase()) ||
    sheetsList.find(
      (s) =>
        (s.properties?.title || "").replace(/\s+/g, "").toLowerCase() ===
        cleanTitle.replace(/\s+/g, "").toLowerCase(),
    );

  // 5. Fallback: if only 1 sheet exists in the document, apply styling to it
  if (!targetSheet && sheetsList.length === 1) {
    targetSheet = sheetsList[0];
  }

  if (!targetSheet?.properties) {
    logger.warn("applyProfessionalSheetStyling: Sheet tab not found, styling skipped", {
      spreadsheetId,
      requestedSheetTitle: sheetTitle,
      availableTabs: sheetsList.map((s) => s.properties?.title),
    });
    return;
  }

  const sheetId: number = targetSheet.properties.sheetId ?? 0;


  const batchRequests = [
    // 1. Freeze first row (header stays visible while scrolling)
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: 1 },
        },
        fields: "gridProperties.frozenRowCount",
      },
    },
    // 2. Header row: Dark Slate #1E293B background, white bold text 10pt, MIDDLE aligned
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.118, green: 0.161, blue: 0.231 },
            textFormat: {
              bold: true,
              fontSize: 10,
              foregroundColor: { red: 1, green: 1, blue: 1 },
            },
            verticalAlignment: "MIDDLE",
            horizontalAlignment: "CENTER",
          },
        },
        fields:
          "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,horizontalAlignment)",
      },
    },
    // 3. Data rows: WRAP text + TOP vertical alignment (prevents text clipping)
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            wrapStrategy: "WRAP",
            verticalAlignment: "TOP",
          },
        },
        fields: "userEnteredFormat(wrapStrategy,verticalAlignment)",
      },
    },
    // 4. Column widths (Elite spec §6: readable, non-compressed layout)
    ...ELITE_COLUMN_WIDTHS_PX.map((pixelSize, colIdx) => ({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: colIdx,
          endIndex: colIdx + 1,
        },
        properties: { pixelSize },
        fields: "pixelSize",
      },
    })),
  ];

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: batchRequests },
  });
} /* end applyProfessionalSheetStyling */

