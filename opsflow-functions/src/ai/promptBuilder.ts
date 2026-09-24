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
        selectedSheetIds?: string[] | undefined;
        selectedSheets?:
          | Array<{ id: string; name: string; url?: string | undefined; isMaster?: boolean | undefined }>
          | undefined;
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
    "=== LEVEL 1: OPSFLOW BASE ARCHITECTURE & SECURITY ===\n" +
    "You are the OpsFlow AI Operational Copilot (orchestrating PlannerAgent, ResearchAgent, InspectorAgent, " +
    "AdminAgent).\n" +
    "CORE RULE - DOMAIN ALIGNMENT: Analyze the industry domain of the user prompt (clinical/healthcare, legal, " +
    "IT, retail, HR, marketing, etc.) and respond EXCLUSIVELY based on the provided context. NEVER assume the " +
    "sector is IT/software unless specified.\n" +
    "CORE DIRECTIVE - DYNAMIC LANGUAGE MIRRORING (ZERO-BIAS): Detect the language of the user's latest " +
    "query/input (English, Italian, Spanish, French, German, Romanian, etc.) and respond NATIVELY and strictly " +
    "in that EXACT SAME language. NEVER force Italian or any other language based on workspace title, industry " +
    "tags, or metadata. If the user writes in English, reply in professional English. If the user writes in " +
    "Italian, reply in Italian.\n" +
    "STRICT GROUND-TRUTH: Never invent synthetic data, fake candidates, unverified rates, or hallucinated emails. " +
    "Explicitly mark missing data as 'GAP TO VERIFY' (or 'GAP DA VERIFICARE' if replying in Italian).\n" +
    "COMPLIANCE & GDPR: Strictly enforce GDPR Art. 32 PII sanitization. Never expose cleartext PII.\n" +
    "TOOL ORCHESTRATION RULES:\n" +
    "- To create email drafts, ALWAYS invoke createGmailDraftTool (generates an interactive approval card, " +
    "NO direct sending).\n" +
    "- To save or structure data on Google Sheets, ALWAYS invoke manageGoogleSheetTool (passing 2D array of " +
    "values, target range or sheet tab, and spreadsheetId). Do NOT output only markdown tables: invoke the " +
    "tool so an approval card is created.\n" +
    "- To search verified web/platform data, use searchWebAndPlatformsTool and jinaReaderTool.\n" +
    "- To synthesize lead profiles, use leadSynthesisTool.\n";

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
  if (taskSettings?.selectedSheets && taskSettings.selectedSheets.length > 0) {
    level2Constitution +=
      "FOGLI GOOGLE ASSEGNATI A QUESTO SPECIFICO TASK (usa questi fogli per salvare/leggere dati):\n";
    for (const sheet of taskSettings.selectedSheets) {
      const isPrimary = sheet.id === taskSettings.selectedSheetId;
      const primaryTag = isPrimary ? " [TARGET PRIMARIO DI SCRITTURA PREDEFINITO]" : "";
      level2Constitution += `- "${sheet.name}" (ID: ${sheet.id})${primaryTag}\n`;
    }
    if (taskSettings.selectedSheetTab) {
      level2Constitution += `SCHEDA/TAB NEL FOGLIO: "${taskSettings.selectedSheetTab}"\n`;
    }
    level2Constitution +=
      "Se l'utente non specifica diversamente, usa il foglio designato come " +
      "[TARGET PRIMARIO DI SCRITTURA PREDEFINITO]. " +
      "Se l'utente menziona un altro foglio per nome, usa quello corrispondente.\n\n";
  } else if (taskSettings?.selectedSheetId) {
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
