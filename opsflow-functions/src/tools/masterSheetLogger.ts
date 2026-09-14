/**
 * @file masterSheetLogger.ts
 * @description Automatic logging of task events to the Master Google Sheet.
 *   Architecture: Tab "📋 Indice Task" (index) + one dedicated tab per task.
 *   Each task's events are appended to its own named tab, preventing chaos.
 * @author Vasile Chifeac
 * @created 2026-09-09
 * @modified 2026-09-14
 *
 * @notes
 * - Multi-tab structure: Tab 1 "📋 Indice Task" registers all tasks; each task has its own tab.
 * - Elite styling applied after each write: dark header, freeze row, wrap, optimal col widths.
 * - Non-blocking: failures are logged without disrupting primary user operations.
 * - Tab names are sanitized (max 31 chars, no invalid chars) for Google Sheets compatibility.
 *
 * @dependencies
 * - firebase-admin/firestore
 * - firebase-functions/logger
 * - googleapis (sheets v4)
 *
 * @performance
 * - createTabIfMissing: 1 Sheets batchUpdate (idempotent, only when tab is new).
 * - registerTaskInIndex: 1 read + 1 conditional append (skips if task already indexed).
 * - applyProfessionalSheetStyling: fire-and-forget — never blocks append.
 */

// ── Firebase ─────────────────────────────────────────────────────────────────
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";

// ── Utils ────────────────────────────────────────────────────────────────────
import { getAuthenticatedOAuth2Client } from "./googleOAuthHandler.js";
import { applyProfessionalSheetStyling } from "./googleWorkspace.js";


// ── Constants ─────────────────────────────────────────────────────────────────

/** Name of the first tab: task index (never holds operational event data). */
const INDEX_TAB_TITLE = "📋 Indice Task";

/** Header row columns for the Index tab. */
const INDEX_HEADER_ROW = [
  "🏷️ Task Title",
  "🪪 Task ID",
  "📅 Prima Registrazione",
  "📊 Scheda Dedicata",
];

/** Header row columns for every per-task operational tab. */
const TASK_TAB_HEADER_ROW = [
  "⏰ Timestamp",
  "📋 Task",
  "🔖 Tipo Evento",
  "📝 Sintesi",
  "📄 Dettaglio",
  "👤 Autore",
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MasterSheetEvent {
  tenantId: string;
  workspaceId: string;
  taskId: string;
  taskTitle: string;
  userId?: string | undefined;
  eventType: "PROMPT_UTENTE" | "RISPOSTA_IA" | "AZIONE_ESEGUITA" | "MILESTONE_AGGIORNATA";
  summary: string;
  detail?: string | undefined;
}

// ── Private Helpers ───────────────────────────────────────────────────────────

/**
 * Sanitizes a task title for use as a Google Sheets tab name.
 * Google Sheets rules: max 31 chars, no backslash / ? * [ ] : characters.
 * @param {string} title - Raw task title to sanitize.
 * @return {string} Sanitized tab name, guaranteed non-empty (fallback: 'Task').
 */
function sanitizeTabName(title: string): string {
  return title.replace(/[\\/?*[\]:]/g, "").trim().slice(0, 31) || "Task";
} /* end sanitizeTabName */

// Sheets client type inferred from googleapis at runtime
type SheetsClient = ReturnType<typeof import("googleapis")["google"]["sheets"]>;

/**
 * Returns all existing tab titles in the given spreadsheet.
 * @param {SheetsClient} sheets - Authenticated Google Sheets API client.
 * @param {string} spreadsheetId - Target spreadsheet ID.
 * @return {Promise<string[]>} Array of existing tab title strings.
 */
async function fetchSheetTitles(sheets: SheetsClient, spreadsheetId: string): Promise<string[]> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  return (meta.data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => Boolean(t));
} /* end fetchSheetTitles */

/**
 * Creates a new tab if it does not already exist. Idempotent.
 * @param {SheetsClient} sheets - Authenticated Google Sheets API client.
 * @param {string} spreadsheetId - Target spreadsheet ID.
 * @param {string} tabTitle - Name of the tab to create.
 * @param {string[]} existingTitles - Currently known tab titles (to skip API call if already present).
 * @return {Promise<void>}
 */
async function createTabIfMissing(
  sheets: SheetsClient,
  spreadsheetId: string,
  tabTitle: string,
  existingTitles: string[],
): Promise<void> {
  if (existingTitles.includes(tabTitle)) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: tabTitle } } }] },
  });
} /* end createTabIfMissing */

/**
 * Ensures the Index Tab exists with a header row and Elite styling.
 * Creates and styles the tab if it is new; idempotent if already present.
 * @param {SheetsClient} sheets - Authenticated Google Sheets API client.
 * @param {string} spreadsheetId - Target spreadsheet ID.
 * @param {string[]} existingTitles - Currently known tab titles.
 * @return {Promise<string[]>} Updated list of tab titles (including the index tab if newly created).
 */
async function ensureIndexTab(
  sheets: SheetsClient,
  spreadsheetId: string,
  existingTitles: string[],
): Promise<string[]> {
  if (existingTitles.includes(INDEX_TAB_TITLE)) return existingTitles;

  await createTabIfMissing(sheets, spreadsheetId, INDEX_TAB_TITLE, existingTitles);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${INDEX_TAB_TITLE}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [INDEX_HEADER_ROW] },
  });
  applyProfessionalSheetStyling(sheets, spreadsheetId, INDEX_TAB_TITLE).catch((e: unknown) => {
    logger.warn("masterSheetLogger: index tab styling failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  });
  return [INDEX_TAB_TITLE, ...existingTitles];
} /* end ensureIndexTab */

/**
 * Ensures the dedicated task tab exists with a header row and Elite styling.
 * Creates and styles the tab if it is new; idempotent if already present.
 * @param {SheetsClient} sheets - Authenticated Google Sheets API client.
 * @param {string} spreadsheetId - Target spreadsheet ID.
 * @param {string} taskTitle - Original task title (will be sanitized for tab name).
 * @param {string[]} existingTitles - Currently known tab titles.
 * @return {Promise<string>} Sanitized tab title to use for appending rows.
 */
async function ensureTaskTab(
  sheets: SheetsClient,
  spreadsheetId: string,
  taskTitle: string,
  existingTitles: string[],
): Promise<string> {
  const tabTitle = sanitizeTabName(taskTitle);
  if (!existingTitles.includes(tabTitle)) {
    await createTabIfMissing(sheets, spreadsheetId, tabTitle, existingTitles);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabTitle}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [TASK_TAB_HEADER_ROW] },
    });
    applyProfessionalSheetStyling(sheets, spreadsheetId, tabTitle).catch((e: unknown) => {
      logger.warn("masterSheetLogger: task tab styling failed on creation", {
        error: e instanceof Error ? e.message : String(e),
        tabTitle,
      });
    });
  }
  return tabTitle;
} /* end ensureTaskTab */

/**
 * Appends the task to the Index tab if not already registered.
 * Idempotent: scans column B for the taskId before appending.
 * @param {SheetsClient} sheets - Authenticated Google Sheets API client.
 * @param {string} spreadsheetId - Target spreadsheet ID.
 * @param {string} taskId - Unique Firestore task document ID.
 * @param {string} taskTitle - Human-readable task title for the index row.
 * @param {string} tabTitle - Sanitized tab name for the task's dedicated sheet.
 * @param {string} nowStr - Locale-formatted timestamp string (Rome timezone).
 * @return {Promise<void>}
 */
async function registerTaskInIndex(
  sheets: SheetsClient,
  spreadsheetId: string,
  taskId: string,
  taskTitle: string,
  tabTitle: string,
  nowStr: string,
): Promise<void> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${INDEX_TAB_TITLE}'!A:B`,
  });
  const rows = res.data.values ?? [];
  // Skip header row (index 0); check column B (index 1) for taskId
  if (rows.slice(1).some((row) => row[1] === taskId)) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${INDEX_TAB_TITLE}'!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[taskTitle, taskId, nowStr, tabTitle]] },
  });
} /* end registerTaskInIndex */

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Appends an operational event row to the task's dedicated tab in the Master Google Sheet.
 *
 * Sheet structure after first write:
 *  - Tab "📋 Indice Task": one row per unique task (idempotent).
 *  - Tab "<Task Name>":    all events for that specific task, with Elite formatting.
 *
 * @param {MasterSheetEvent} event - The event metadata to log.
 * @return {Promise<boolean>} True if appended successfully, false on error or disabled toggle.
 */
export async function syncTaskEventToMasterSheet(event: MasterSheetEvent): Promise<boolean> {
  try {
    const db = getFirestore();

    // 1. Fetch Task — verify syncToMasterSheet toggle is enabled
    const taskRef = db.doc(
      `tenants/${event.tenantId}/workspaces/${event.workspaceId}/tasks/${event.taskId}`,
    );
    let taskSnap = await taskRef.get();
    if (!taskSnap.exists && event.workspaceId !== "main") {
      const altRef = db.doc(
        `tenants/${event.tenantId}/workspaces/main/tasks/${event.taskId}`,
      );
      const altSnap = await altRef.get();
      if (altSnap.exists) taskSnap = altSnap;
    }
    if (!taskSnap.exists) return false;

    const taskData = taskSnap.data();
    if (!taskData?.settings?.syncToMasterSheet) return false;

    // 2. Fetch Workspace — locate the Master Google Sheet
    const wsRef = db.doc(`tenants/${event.tenantId}/workspaces/${event.workspaceId}`);
    let wsSnap = await wsRef.get();
    if (!wsSnap.exists) {
      const wsByName = await db
        .collection(`tenants/${event.tenantId}/workspaces`)
        .where("name", "==", event.workspaceId)
        .limit(1)
        .get();
      if (!wsByName.empty) wsSnap = wsByName.docs[0];
    }
    if (!wsSnap.exists) return false;

    const wsData = wsSnap.data();
    const linkedSheets: Array<{ id: string; name: string; isMaster?: boolean }> =
      wsData?.linkedResources?.linkedSheets ?? [];

    let masterSheet = linkedSheets.find((s) => s.isMaster);
    if (!masterSheet && wsData?.linkedResources?.defaultSheetId) {
      masterSheet = { id: wsData.linkedResources.defaultSheetId, name: "Foglio Predefinito" };
    }
    if (!masterSheet?.id) {
      logger.warn("syncTaskEventToMasterSheet: No Master Sheet designated in workspace", {
        workspaceId: event.workspaceId,
        taskId: event.taskId,
      });
      return false;
    }

    // 3. Authenticate with Google Sheets API via OAuth Vault
    const effectiveUserId = event.userId ?? wsData?.ownerId ?? "system_agent";
    const oAuth2Client = await getAuthenticatedOAuth2Client(
      event.tenantId,
      effectiveUserId,
      ["https://www.googleapis.com/auth/spreadsheets"],
      event.workspaceId,
    );

    const { google } = await import("googleapis");
    const sheets = google.sheets({ version: "v4", auth: oAuth2Client });
    const spreadsheetId = masterSheet.id;

    // 4. Fetch existing tabs once (minimises Sheets API round-trips)
    let existingTitles = await fetchSheetTitles(sheets, spreadsheetId);

    // 5. Ensure Index Tab exists (creates + styles on first call; idempotent on subsequent)
    existingTitles = await ensureIndexTab(sheets, spreadsheetId, existingTitles);

    // 6. Ensure dedicated Task Tab exists (creates + styles on first call; idempotent on subsequent)
    const taskTabTitle = await ensureTaskTab(sheets, spreadsheetId, event.taskTitle, existingTitles);

    // 7. Rome timezone timestamp
    const nowStr = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });

    // 8. Register task in Index tab (idempotent — skips if taskId already present)
    await registerTaskInIndex(
      sheets, spreadsheetId, event.taskId, event.taskTitle, taskTabTitle, nowStr,
    );

    // 9. Append event row to the task's dedicated tab
    const rowValues = [
      nowStr,
      event.taskTitle,
      event.eventType,
      event.summary,
      (event.detail ?? "").slice(0, 2000),
      event.userId ?? "Agente IA OpsFlow",
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${taskTabTitle}'!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [rowValues] },
    });

    // 10. Re-apply Elite styling post-append (ensures formatting persists across sessions)
    applyProfessionalSheetStyling(sheets, spreadsheetId, taskTabTitle).catch((e: unknown) => {
      logger.warn("syncTaskEventToMasterSheet: post-append styling skipped", {
        error: e instanceof Error ? e.message : String(e),
        taskTabTitle,
      });
    });

    logger.info("syncTaskEventToMasterSheet: row appended successfully", {
      masterSheetId: spreadsheetId,
      taskTabTitle,
      eventType: event.eventType,
    });
    return true;
  } catch (err: unknown) {
    logger.warn("syncTaskEventToMasterSheet: non-blocking append failed", {
      error: err instanceof Error ? err.message : String(err),
      workspaceId: event.workspaceId,
      taskId: event.taskId,
    });
    return false;
  }
} /* end syncTaskEventToMasterSheet */

