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
  taskSettings?:
    | {
        selectedSheetId?: string | undefined;
        selectedSheetName?: string | undefined;
        selectedSheetTab?: string | undefined;
        emailSignature?: string | undefined;
      }
    | undefined;
  attitude?:
    | {
        industryScope?: string | undefined;
        tone?: string | undefined;
        skills?: string[] | undefined;
        rules?:
          | {
              doList?: string[] | undefined;
              dontList?: string[] | undefined;
              outputFormat?: string | undefined;
            }
          | undefined;
      }
    | undefined;
  linkedResources?:
    | {
        googleEmail?: string | undefined;
        linkedEmails?: string[] | undefined;
        defaultSheetId?: string | undefined;
        defaultSheetName?: string | undefined;
        defaultEmailSignature?: string | undefined;
        linkedSheets?:
          | Array<{ id: string; name: string; isMaster?: boolean | undefined }>
          | undefined;
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
  const { userPrompt, workspacePrompt, workspaceName, taskTitle, attitude, linkedResources, taskSettings } =
    options;

  const level1Base =
    "=== LEVEL 1: OPSFLOW BASE RULES & SECURITY ===\n" +
    "Sei l'Assistente Operativo AI di OpsFlow " +
    "(orchestratore di AgentePlanner, AgenteRicerca, AgenteIspettore, AgenteAmministrativo).\n" +
    "REGOLA FONDAMENTALE: Analizza il dominio del prompt utente (sanitario, legale, IT, " +
    "retail, HR, marketing, ecc.) e rispondi ESCLUSIVAMENTE in base al contesto fornito. " +
    "NON assumere mai che il settore sia IT/software.\n" +
    "REGOLA SULLA LINGUA: Se la conversazione precedente o il workspace/task è in lingua italiana, " +
    "rispondi SEMPRE in lingua italiana (anche se il prompt utente o comandi rapidi contengono singole frasi in " +
    "inglese). Rispondi in inglese SOLO se l'intero workspace ed i messaggi " +
    "precedenti sono esplicitamente in inglese.\n" +
    "Rispetta sempre le normative GDPR, esegui la sanitizzazione PII e non esporre mai dati PII.\n" +
    "Per creare bozze email usa SEMPRE createGmailDraftTool (genera la card di approvazione, NO invio diretto).\n" +
    "Per salvare o strutturare dati su Google Sheets invoca SEMPRE il tool manageGoogleSheetTool (passando i dati in " +
    "values come matrice 2D di righe e colonne, range es. 'Sheet1!A1' o con il nome della scheda specificata e " +
    "spreadsheetId presente nelle risorse collegate). NON limitarti a scrivere solo tabelle markdown nel testo: " +
    "invoca il tool affinché venga creata la card di approvazione interattiva.\n" +
    "Per cercare informazioni reali sul web usa searchWebAndPlatformsTool e jinaReaderTool.\n" +
    "Per profilare prospetti usa leadSynthesisTool.\n";

  let level2Constitution = "\n=== LEVEL 2: WORKSPACE CONSTITUTION & LINKED RESOURCES ===\n";

  // Dynamic Email Signature from Task or Workspace Settings
  const effectiveSignature = taskSettings?.emailSignature || linkedResources?.defaultEmailSignature;
  if (effectiveSignature?.trim()) {
    level2Constitution +=
      "FIRMA EMAIL CONFIGURATA (usa sempre questa firma in calce a bozze email):\n" +
      `${effectiveSignature.trim()}\n\n`;
  } else {
    level2Constitution +=
      "FIRMA EMAIL: Se non espressamente richiesta dall'utente, usa una formula di chiusura formale neutra " +
      "(es. 'Cordiali saluti,') senza inventare nominativi o contatti privati non forniti.\n\n";
  }

  // Dynamic Google Sheets assignment
  if (taskSettings?.selectedSheetId) {
    const sName = taskSettings.selectedSheetName || "Foglio Task";
    const tabSuffix = taskSettings.selectedSheetTab ?
      `SCHEDA/TAB NEL FOGLIO: "${taskSettings.selectedSheetTab}"\n` :
      "";
    level2Constitution +=
      `FOGLIO GOOGLE DI LAVORO ASSEGNATO A QUESTO TASK: "${sName}" (ID: ${taskSettings.selectedSheetId})\n` +
      tabSuffix +
      "Se l'utente chiede di salvare o aggiornare dati per questo task, usa questo spreadsheetId.\n\n";
  } else if (linkedResources?.linkedSheets && linkedResources.linkedSheets.length > 0) {
    level2Constitution += "FOGLI GOOGLE COLLEGATI AL WORKSPACE (fai riferimento ad essi con il loro NOME):\n";
    for (const sheet of linkedResources.linkedSheets) {
      const masterTag = sheet.isMaster ? " [FOGLIO PRINCIPALE / MASTER DATABASE]" : "";
      level2Constitution += `- "${sheet.name}" (ID: ${sheet.id})${masterTag}\n`;
    }
    level2Constitution += "\n";
  }

  if (workspaceName) {
    level2Constitution += `WORKSPACE NAME: "${workspaceName}"\n`;
  }

  if (attitude) {
    if (attitude.industryScope) {
      level2Constitution += `SETTORE: ${attitude.industryScope}\n`;
    }
    if (attitude.tone) {
      level2Constitution += `TONO DI VOCE: ${attitude.tone}\n`;
    }
    if (attitude.skills && attitude.skills.length > 0) {
      level2Constitution += `RUOLI E SKILL ATTIVI: [${attitude.skills.join(", ")}]\n`;
    }
    if (attitude.rules?.doList && attitude.rules.doList.length > 0) {
      const doText = attitude.rules.doList.map((r, i) => `  ${i + 1}. ${r}`).join("\n");
      level2Constitution += `REGOLE VINCOLANTI (DO):\n${doText}\n`;
    }
    if (attitude.rules?.dontList && attitude.rules.dontList.length > 0) {
      const dontText = attitude.rules.dontList.map((r, i) => `  ${i + 1}. ${r}`).join("\n");
      level2Constitution += `DIVIETI TASSATIVI (DON'T):\n${dontText}\n`;
    }
  } else if (workspacePrompt && workspacePrompt.trim()) {
    level2Constitution += `SYSTEM PROMPT: ${workspacePrompt.trim()}\n`;
  } else {
    level2Constitution +=
      "ATTEGGIAMENTO: Agisci con precisione operativa e massima attenzione al ROI.\n";
  }

  if (linkedResources) {
    if (linkedResources.linkedEmails && linkedResources.linkedEmails.length > 0) {
      level2Constitution += `- Account Gmail Autorizzati: [${linkedResources.linkedEmails.join(", ")}]\n`;
    } else if (linkedResources.googleEmail) {
      level2Constitution += `- Account Gmail Autorizzato: "${linkedResources.googleEmail}"\n`;
    }
    if (linkedResources.defaultSheetId) {
      level2Constitution += `- Google Sheet Predefinito ID: "${linkedResources.defaultSheetId}"\n`;
    }
    if (linkedResources.defaultDriveFolderId) {
      level2Constitution += `- Cartella Google Drive ID: "${linkedResources.defaultDriveFolderId}"\n`;
    }
  }

  level2Constitution += "=== FINE COSTITUZIONE WORKSPACE — RISPETTA RIGOROSAMENTE ===\n";

  let taskContextStr = "";
  if (taskTitle) {
    taskContextStr = ` [Task Attivo: "${taskTitle}"]`;
  }

  const level3Task =
    "\n=== LEVEL 3: TASK CONTEXT & INSTRUCTION ===\n" +
    `Richiesta Utente${taskContextStr}: "${userPrompt}"`;

  return `${level1Base}${level2Constitution}${level3Task}`;
} // end buildStackedPrompt
