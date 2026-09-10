/**
 * @file masterSheetLogger.ts
 * @description Automatic logging of task events, prompts, and milestones to the Master Google Sheet.
 * @author Vasile Chifeac
 * @created 2026-09-09
 * @modified 2026-09-09
 *
 * @notes
 * - Uses workspace-scoped Google OAuth2 credentials from Vault.
 * - Non-blocking: failures are logged without disrupting primary user operations.
 * - Appends structured audit rows: [Timestamp (Rome), Task Title, Event Type, Summary, Detail, User/Agent].
 *
 * @dependencies
 * - firebase-admin/firestore
 * - firebase-functions/logger
 * - googleapis (sheets v4)
 *
 * @performance
 * - Asynchronous fire-and-forget execution (<2s background append).
 */

// ── Firebase ─────────────────────────────────────────────────────────────────
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";

// ── Utils ────────────────────────────────────────────────────────────────────
import { getAuthenticatedOAuth2Client } from "./googleOAuthHandler.js";

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

/**
 * Synchronously or asynchronously appends an operational event row to the Workspace's designated Master Google Sheet.
 * Checks if task.settings.syncToMasterSheet is true before appending.
 *
 * @param {MasterSheetEvent} event - The operational event metadata to log
 * @return {Promise<boolean>} True if appended successfully, false otherwise
 */
export async function syncTaskEventToMasterSheet(event: MasterSheetEvent): Promise<boolean> {
  try {
    const db = getFirestore();

    // 1. Fetch Task to verify if syncToMasterSheet is enabled
    let taskRef = db.doc(
      `tenants/${event.tenantId}/workspaces/${event.workspaceId}/tasks/${event.taskId}`,
    );
    let taskSnap = await taskRef.get();
    if (!taskSnap.exists && event.workspaceId !== "main") {
      const altTaskRef = db.doc(
        `tenants/${event.tenantId}/workspaces/main/tasks/${event.taskId}`,
      );
      const altTaskSnap = await altTaskRef.get();
      if (altTaskSnap.exists) {
        taskSnap = altTaskSnap;
        taskRef = altTaskRef;
      }
    }
    if (!taskSnap.exists) return false;

    const taskData = taskSnap.data();
    if (!taskData?.settings?.syncToMasterSheet) {
      return false; // Sync toggle is off for this task
    }

    // 2. Fetch Workspace to locate the Master Google Sheet
    let wsRef = db.doc(`tenants/${event.tenantId}/workspaces/${event.workspaceId}`);
    let wsSnap = await wsRef.get();
    if (!wsSnap.exists) {
      const wsByName = await db
        .collection(`tenants/${event.tenantId}/workspaces`)
        .where("name", "==", event.workspaceId)
        .limit(1)
        .get();
      if (!wsByName.empty) {
        wsSnap = wsByName.docs[0];
        wsRef = wsSnap.ref;
      } else {
        const mainWsRef = db.doc(`tenants/${event.tenantId}/workspaces/main`);
        const mainWsSnap = await mainWsRef.get();
        if (mainWsSnap.exists) {
          wsSnap = mainWsSnap;
          wsRef = mainWsRef;
        }
      }
    }
    if (!wsSnap.exists) return false;

    const wsData = wsSnap.data();
    const linkedSheets: Array<{ id: string; name: string; isMaster?: boolean }> =
      wsData?.linkedResources?.linkedSheets || [];

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
    const effectiveUserId = event.userId || wsData?.ownerId || "system_agent";
    const oAuth2Client = await getAuthenticatedOAuth2Client(
      event.tenantId,
      effectiveUserId,
      ["https://www.googleapis.com/auth/spreadsheets"],
      event.workspaceId,
    );

    const { google } = await import("googleapis");
    const sheets = google.sheets({ version: "v4", auth: oAuth2Client });

    // 4. Inspect spreadsheet to find target sheet title (default to first sheet tab)
    let targetSheetTitle = "Cronologia";
    try {
      const meta = await sheets.spreadsheets.get({
        spreadsheetId: masterSheet.id,
      });
      const firstSheet = meta.data.sheets?.[0]?.properties?.title;
      if (firstSheet) {
        targetSheetTitle = firstSheet;
      }
    } catch {
      targetSheetTitle = "Sheet1";
    }

    // 5. Format row values: [Timestamp, Task, Tipo Evento, Sintesi, Dettaglio, Autore]
    const nowStr = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
    const rowValues = [
      nowStr,
      event.taskTitle,
      event.eventType,
      event.summary,
      (event.detail || "").slice(0, 2000),
      event.userId || "Agente IA OpsFlow",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: masterSheet.id,
      range: `'${targetSheetTitle}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [rowValues] },
    });

    logger.info("syncTaskEventToMasterSheet: row appended to master sheet", {
      masterSheetId: masterSheet.id,
      taskTitle: event.taskTitle,
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
