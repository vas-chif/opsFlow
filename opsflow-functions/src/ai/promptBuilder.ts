/**
 * @file promptBuilder.ts
 * @description Dynamic 3-Level Prompt Stacking Engine for OpsFlow AI Agents.
 * @author Vasile Chifeac
 * @created 2026-07-30
 *
 * @notes
 * - Level 1: System Base Rules (OpsFlow Agent Architecture, GDPR PII Filter).
 * - Level 2: Workspace System Prompt (Custom operational attitude fetched from Firestore).
 * - Level 3: Task Context & User Instruction.
 */

export interface PromptStackOptions {
  userPrompt: string;
  workspacePrompt?: string | undefined;
  workspaceName?: string | undefined;
  taskTitle?: string | undefined;
  linkedResources?:
    | {
        googleEmail?: string | undefined;
        linkedEmails?: string[] | undefined;
        defaultSheetId?: string | undefined;
        defaultDriveFolderId?: string | undefined;
      }
    | undefined;
}

/**
 * Builds the stacked system instruction dynamically at runtime.
 * @param {PromptStackOptions} options - Prompt stacking options
 * @return {string} Formatted 3-level stacked prompt string
 */
export function buildStackedPrompt(options: PromptStackOptions): string {
  const { userPrompt, workspacePrompt, workspaceName, taskTitle, linkedResources } = options;

  const level1Base =
    "=== LEVEL 1: OPSFLOW BASE RULES & SECURITY ===\n" +
    "Sei l'Assistente Operativo AI di OpsFlow (orchestratore di AgentePlanner, AgenteIspettore).\n" +
    "Rileva la lingua del prompt utente ed elabora la risposta nella STESSA lingua (es. Italiano/Inglese).\n" +
    "Rispetta sempre le normative GDPR, esegui la sanitizzazione PII e non esporre mai dati PII.\n" +
    "Per creare bozze email usa createGmailDraftTool (NO invio diretto).\n" +
    "Per cercare sul web o profilare lead usa searchWebAndPlatformsTool e leadSynthesisTool.\n";

  let defaultAttitude = "Agisci con precisione operativa e massima attenzione al ROI.";
  if (workspaceName) {
    defaultAttitude = `Agisci secondo la logica del Workspace "${workspaceName}".`;
  }

  let attitudeText = defaultAttitude;
  if (workspacePrompt && workspacePrompt.trim()) {
    attitudeText = workspacePrompt.trim();
  }

  let linkedStr = "";
  if (linkedResources) {
    if (linkedResources.linkedEmails && linkedResources.linkedEmails.length > 0) {
      linkedStr += `\n- Account Gmail Autorizzati: [${linkedResources.linkedEmails.join(", ")}]`;
    } else if (linkedResources.googleEmail) {
      linkedStr += `\n- Account Gmail Autorizzato: "${linkedResources.googleEmail}"`;
    }
    if (linkedResources.defaultSheetId) {
      linkedStr += `\n- Google Sheet Predefinito ID: "${linkedResources.defaultSheetId}"`;
    }
    if (linkedResources.defaultDriveFolderId) {
      linkedStr += `\n- Cartella Google Drive ID: "${linkedResources.defaultDriveFolderId}"`;
    }
  }

  const level2Workspace =
    "\n=== LEVEL 2: WORKSPACE OPERATIONAL ATTITUDE & LINKED RESOURCES ===\n" +
    `${attitudeText}${linkedStr}\n`;

  let taskContextStr = "";
  if (taskTitle) {
    taskContextStr = ` [Task Attivo: "${taskTitle}"]`;
  }

  const level3Task =
    "\n=== LEVEL 3: TASK CONTEXT & INSTRUCTION ===\n" +
    `Richiesta Utente${taskContextStr}: "${userPrompt}"`;

  return `${level1Base}${level2Workspace}${level3Task}`;
} /* end buildStackedPrompt */
