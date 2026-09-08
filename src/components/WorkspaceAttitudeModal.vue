<!--
  @file WorkspaceAttitudeModal.vue
  @description Editor dialog with 4-Tab Guided No-Code Form for Workspace System Prompt & Google Linked Resources.
  @author Vasile Chifeac
  @created 2026-07-30
  @modified 2026-09-06
-->

<script setup lang="ts">
// ── Vue & Framework ──────────────────────────────────────────────────────────
import { ref, computed, watch, onUnmounted } from "vue";
import { useQuasar } from "quasar";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useTaskStore } from "../stores/taskStore";
import { useAuthStore } from "../stores/authStore";

// ── Composables ──────────────────────────────────────────────────────────────
import { useSecureLogger } from "../composables/useSecureLogger";

// ── Types ────────────────────────────────────────────────────────────────────
import type { Workspace, WorkspaceLinkedResources, LinkedGoogleResource } from "../types/models";

const props = defineProps<{
  modelValue: boolean;
  workspace: Workspace | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
  (e: "saved"): void;
}>();

const q = useQuasar();
const taskStore = useTaskStore();
const authStore = useAuthStore();
const logger = useSecureLogger();

/**
 * Allowed origins for incoming postMessage events (Step 18 §4.1).
 * Whitelist includes the Google OAuth callback Cloud Function and supported frontend origins.
 */
const ALLOWED_MESSAGE_ORIGINS: ReadonlySet<string> = new Set([
  "http://localhost:9000",
  "http://localhost:9001",
  "http://localhost:9002",
  "https://opsflow-88of.web.app",
  "https://opsflow-88of.firebaseapp.com",
  "https://europe-west1-opsflow-88of.cloudfunctions.net",
]);

function isAllowedMessageOrigin(origin: string): boolean {
  if (ALLOWED_MESSAGE_ORIGINS.has(origin)) return true;
  if (typeof window !== "undefined" && origin === window.location.origin) return true;
  try {
    const url = new URL(origin);
    return (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") && url.protocol === "http:"
    );
  } catch {
    return false;
  }
}

/** Google OAuth callback function URL (Cloud Function redirect endpoint). */
const OAUTH_CALLBACK_URL =
  "https://europe-west1-opsflow-88of.cloudfunctions.net/googleOAuthCallback";

/** Reference to the OAuth popup window for cleanup. */
let oauthPopup: Window | null = null;

/** postMessage event listener reference for cleanup. */
let messageListener: ((event: MessageEvent) => void) | null = null;
let focusListener: (() => void) | null = null;

const isOpen = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit("update:modelValue", val),
});

const activeTab = ref<"behavior" | "resources" | "agents" | "sandbox">("behavior");

// Tab 1: Behavior & Prompt (DBS Framework)
const systemPrompt = ref("");
const industryScope = ref("Generale");
const tone = ref("operativo e conciso");
const skills = ref<string[]>([]);
const doListInput = ref("");
const dontListInput = ref("");

// Tab 2: Google Linked Resources
const googleEmail = ref("");
const newEmailInput = ref("");
const linkedEmails = ref<string[]>([]);
const defaultSheetId = ref("");
const defaultDriveFolderId = ref("");
const defaultEmailSignature = ref("");
const linkedSheets = ref<LinkedGoogleResource[]>([]);
const newSheetNameInput = ref("");
const newSheetUrlInput = ref("");
const linkedFolders = ref<LinkedGoogleResource[]>([]);
const newFolderNameInput = ref("");
const newFolderUrlInput = ref("");
const isOAuthConnected = ref(false);
const isConnectingGoogle = ref(false);

const extractIdFromUrl = (input: string): string => {
  const trimmed = input.trim();
  if (trimmed.includes("/d/")) {
    const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) return match[1];
  }
  if (trimmed.includes("id=")) {
    const match = trimmed.match(/id=([a-zA-Z0-9-_]+)/);
    if (match && match[1]) return match[1];
  }
  return trimmed;
};

const addEmail = (): void => {
  const email = newEmailInput.value.trim();
  if (email && !linkedEmails.value.includes(email)) {
    linkedEmails.value.push(email);
    newEmailInput.value = "";
    q.notify({
      type: "positive",
      message: `Email "${email}" collegata con successo al Workspace!`,
      position: "top",
      icon: "mark_email_read",
    });
  }
}; /*end addEmail*/

const removeEmail = (email: string): void => {
  linkedEmails.value = linkedEmails.value.filter((e) => e !== email);
}; /*end removeEmail*/

/**
 * Handles Google OAuth 2.0 connection for the workspace.
 *
 * Step 18 Implementation — No Session Swap (CWE-384 eliminated):
 * 1. Opens a popup synchronously on `about:blank` BEFORE any await (anti-popup-blocker).
 * 2. Builds the Google OAuth URL with `state` payload (tenantId, workspaceId, userId, origin, nonce).
 * 3. Redirects the popup to Google consent screen.
 * 4. Listens for `postMessage` from the Cloud Function callback page.
 * 5. Validates `event.origin` against whitelist — never trusts wildcard `*`.
 * 6. On OPSFLOW_GOOGLE_LINKED: updates local state reactively WITHOUT touching Firebase Auth.
 *
 * @security Firebase Auth (authStore.currentUser) is NEVER altered by this function.
 */
const handleConnectGoogle = (): void => {
  if (!props.workspace) return;

  // Validate required auth context from JWT claims (§5 AGENTS.md)
  const user = authStore.user;
  const tenantId = authStore.tenantId;
  if (!user || !tenantId) {
    q.notify({
      type: "negative",
      message: "Invalid session. Please sign in again.",
      position: "top",
    });
    return;
  }

  const clientId =
    (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ||
    "348805838247-8p7qa4j09bfaa0f7neun7qg0lk6f7le1.apps.googleusercontent.com";

  if (!clientId) {
    q.notify({
      type: "negative",
      message: "Google Client ID is not configured. Check your .env file.",
      position: "top",
      icon: "error_outline",
    });
    return;
  }

  // ── 1. Open popup SYNCHRONOUSLY before any await (anti-popup-blocker) ─────
  oauthPopup = window.open(
    "about:blank",
    "opsflow_google_auth",
    "width=520,height=650,status=no,toolbar=no,menubar=no",
  );

  if (!oauthPopup) {
    q.notify({
      type: "warning",
      message: "The popup was blocked by the browser. Please allow popups for this site.",
      position: "top",
      icon: "block",
    });
    return;
  }

  isConnectingGoogle.value = true;

  // ── 2. Build state payload (Base64 encoded — CSRF nonce included) ──────────
  const statePayload = {
    tenantId,
    workspaceId: props.workspace.id,
    userId: user.uid,
    clientOrigin: window.location.origin,
    nonce: crypto.randomUUID(),
  };
  const state = btoa(JSON.stringify(statePayload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  // ── 3. Build Google OAuth URL and redirect the popup ──────────────────────
  const scopes = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
  ].join(" ");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", OAUTH_CALLBACK_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "select_account consent");
  authUrl.searchParams.set("state", state);

  oauthPopup.location.href = authUrl.toString();

  // ── 4. Register postMessage listener with strict origin validation ──────────
  if (messageListener) {
    window.removeEventListener("message", messageListener);
  }

  let popupCheckInterval: ReturnType<typeof setInterval> | null = null;
  let popupTimeout: ReturnType<typeof setTimeout> | null = null;

  const cleanupPopupTracking = (): void => {
    if (popupCheckInterval) {
      clearInterval(popupCheckInterval);
      popupCheckInterval = null;
    }
    if (popupTimeout) {
      clearTimeout(popupTimeout);
      popupTimeout = null;
    }
    if (messageListener) {
      window.removeEventListener("message", messageListener);
      messageListener = null;
    }
    if (focusListener) {
      window.removeEventListener("focus", focusListener);
      focusListener = null;
    }
  };

  messageListener = (event: MessageEvent): void => {
    // ── 5. Validate origin against whitelist (zero wildcard *) ─────────────
    if (!isAllowedMessageOrigin(event.origin)) {
      logger.info(
        "WorkspaceOAuth",
        "Ignored postMessage from untrusted origin",
        { origin: event.origin }, // No PII
      );
      return;
    }

    const data = event.data as {
      type?: string;
      email?: string;
      workspaceId?: string;
      message?: string;
    };

    if (data.type === "OPSFLOW_GOOGLE_LINKED" && data.workspaceId === props.workspace?.id) {
      // ── 6. Update UI state reactively — Firebase Auth NOT touched ──────
      const email = data.email ?? "";
      googleEmail.value = email;
      if (email && !linkedEmails.value.includes(email)) {
        linkedEmails.value.push(email);
      }
      isOAuthConnected.value = true;
      isConnectingGoogle.value = false;

      logger.success(
        "WorkspaceOAuth",
        "Google Workspace account linked successfully via OAuth 2.0",
        { workspaceId: data.workspaceId }, // No PII — email not logged
      );

      q.notify({
        type: "positive",
        message: `✅ Google Account (${email}) successfully linked to the Workspace!`,
        position: "top",
        icon: "verified_user",
        timeout: 5000,
      });

      cleanupPopupTracking();
    } else if (data.type === "OPSFLOW_GOOGLE_ERROR") {
      isConnectingGoogle.value = false;
      logger.info("WorkspaceOAuth", "OAuth error received from popup", {});
      q.notify({
        type: "negative",
        message: data.message ?? "Google authorization failed.",
        position: "top",
        icon: "error_outline",
      });
      cleanupPopupTracking();
    }
  };

  window.addEventListener("message", messageListener);

  // ── Focus & Timeout: cleanup if popup is closed or abandoned ─────────────
  focusListener = (): void => {
    // Delay check slightly to give the postMessage time to arrive
    setTimeout(() => {
      try {
        if (oauthPopup && oauthPopup.closed) {
          cleanupPopupTracking();
          if (isConnectingGoogle.value) {
            isConnectingGoogle.value = false;
          }
        }
      } catch {
        // Cross-origin COOP policy safe
      }
    }, 500);
  };

  window.addEventListener("focus", focusListener);

  // Maximum 3 minutes before auto-canceling tracking
  popupTimeout = setTimeout(() => {
    cleanupPopupTracking();
    if (isConnectingGoogle.value) {
      isConnectingGoogle.value = false;
    }
  }, 180_000);
}; /*end handleConnectGoogle*/

/** Cleanup OAuth listener and popup on component unmount. */
onUnmounted(() => {
  if (messageListener) {
    window.removeEventListener("message", messageListener);
    messageListener = null;
  }
  if (focusListener) {
    window.removeEventListener("focus", focusListener);
    focusListener = null;
  }
  if (oauthPopup && !oauthPopup.closed) {
    oauthPopup.close();
    oauthPopup = null;
  }
}); /*end onUnmounted*/

const addSheetResource = (): void => {
  if (!newSheetUrlInput.value.trim()) return;
  const cleanId = extractIdFromUrl(newSheetUrlInput.value);
  const friendlyName =
    newSheetNameInput.value.trim() || `Foglio Google (${cleanId.slice(0, 8)}...)`;
  const isMaster = linkedSheets.value.length === 0;

  linkedSheets.value.push({
    id: cleanId,
    name: friendlyName,
    type: "sheet",
    url: newSheetUrlInput.value.trim(),
    isMaster,
    addedAt: new Date().toISOString(),
  });

  if (isMaster) defaultSheetId.value = cleanId;
  newSheetNameInput.value = "";
  newSheetUrlInput.value = "";

  q.notify({
    type: "positive",
    message: `Foglio "${friendlyName}" aggiunto alle Risorse!`,
    icon: "table_chart",
    position: "top",
  });
}; /*end addSheetResource*/

const setMasterSheet = (sheetId: string): void => {
  for (const s of linkedSheets.value) {
    s.isMaster = s.id === sheetId;
  }
  defaultSheetId.value = sheetId;
  q.notify({
    type: "positive",
    message: "⭐ Foglio Principale (Master Database) impostato!",
    icon: "star",
    position: "top",
  });
}; /*end setMasterSheet*/

const removeSheetResource = (sheetId: string): void => {
  linkedSheets.value = linkedSheets.value.filter((s: LinkedGoogleResource) => s.id !== sheetId);
  if (defaultSheetId.value === sheetId) {
    defaultSheetId.value = linkedSheets.value[0]?.id || "";
    if (linkedSheets.value[0]) linkedSheets.value[0].isMaster = true;
  }
}; /*end removeSheetResource*/

const addFolderResource = (): void => {
  if (!newFolderUrlInput.value.trim()) return;
  const cleanId = extractIdFromUrl(newFolderUrlInput.value);
  const friendlyName =
    newFolderNameInput.value.trim() || `Cartella Drive (${cleanId.slice(0, 8)}...)`;
  const isMaster = linkedFolders.value.length === 0;

  linkedFolders.value.push({
    id: cleanId,
    name: friendlyName,
    type: "folder",
    url: newFolderUrlInput.value.trim(),
    isMaster,
    addedAt: new Date().toISOString(),
  });

  if (isMaster) defaultDriveFolderId.value = cleanId;
  newFolderNameInput.value = "";
  newFolderUrlInput.value = "";

  q.notify({
    type: "positive",
    message: `Cartella "${friendlyName}" aggiunta!`,
    icon: "folder_special",
    position: "top",
  });
}; /*end addFolderResource*/

const removeFolderResource = (folderId: string): void => {
  linkedFolders.value = linkedFolders.value.filter((f: LinkedGoogleResource) => f.id !== folderId);
  if (defaultDriveFolderId.value === folderId) {
    defaultDriveFolderId.value = linkedFolders.value[0]?.id || "";
    if (linkedFolders.value[0]) linkedFolders.value[0].isMaster = true;
  }
}; /*end removeFolderResource*/

// Tab 3: Assigned Agents
const assignedAgents = ref<string[]>([
  "AgentePlanner",
  "AgenteRicerca",
  "AgenteIspettore",
  "AgenteAmministrativo",
]);

const agentOptions = [
  { label: "AgentePlanner (Scomposizione Task & Score)", value: "AgentePlanner" },
  { label: "AgenteRicerca (Lead Scout & Platform Matcher)", value: "AgenteRicerca" },
  { label: "AgenteIspettore (Quality & Compliance Audit)", value: "AgenteIspettore" },
  { label: "AgenteAmministrativo (Gmail & Google Sheets)", value: "AgenteAmministrativo" },
];

// Tab 4: Sandbox
const testInput = ref("");
const testOutput = ref("");
const isTesting = ref(false);

const isSaving = ref(false);

const presetTemplates = [
  {
    title: "🎯 Commercial / Lead Scout",
    prompt:
      "Your role is to search for IT clients, profile prospects on LinkedIn/Indeed, generate email drafts, and manage contact statuses (Contacted, Positive Response, Follow-up 30 Days).",
    industryScope: "Commercial / B2B Sales",
    tone: "professional, concise, ROI-focused",
    skills: ["Lead Scouting", "Email Outreach", "ROI Analysis"],
    doRules:
      "Always cite LinkedIn links and Match Score %\nAlways use createGmailDraftTool for drafts",
    dontRules: "Never send emails directly\nNever log PII in plain text",
  },
  {
    title: "📊 Administration & Sheets",
    prompt:
      "Your role is to read and write data to Google Sheets, move info between spreadsheets, summarize system emails, and filter spam.",
    industryScope: "Administration & Accounting",
    tone: "formal, precise, analytical",
    skills: ["Google Sheets Sync", "Summary Reports", "Data Validation"],
    doRules: "Update the default Google Sheets spreadsheet\nRequest approval before modifying",
    dontRules: "Never overwrite existing data without confirmation",
  },
  {
    title: "🧠 Prompt Optimization Hub",
    prompt:
      "Your role is to analyze prompts sent in other workspaces, detect inefficiencies or ambiguities, and suggest optimized versions to reduce error rates to 0%.",
    industryScope: "AI Operations & Compliance",
    tone: "operational, rigorous, technical",
    skills: ["Prompt Architecture", "Anti-Hallucination Audit", "GDPR Compliance"],
    doRules: "Analyze clarity of instructions\nFormat results in clean tables",
    dontRules: "Do not modify core security behavior",
  },
];

const syncFromWorkspace = (newWs: Workspace | null): void => {
  if (!newWs) return;
  const att = newWs.attitude;
  if (att) {
    industryScope.value = att.industryScope || "Generale";
    tone.value = att.tone || "operativo";
    skills.value = Array.isArray(att.skills) ? [...att.skills] : [];
    doListInput.value = att.rules?.doList ? att.rules.doList.join("\n") : "";
    dontListInput.value = att.rules?.dontList ? att.rules.dontList.join("\n") : "";
    systemPrompt.value =
      newWs.systemPrompt ||
      (att.industryScope
        ? `Ruolo Agente Workspace: esperto in ${att.industryScope}. Tono: ${att.tone}.`
        : "");
  } else {
    const res = newWs.linkedResources || {};
    industryScope.value = newWs.category || "Generale";
    tone.value = res.toneOfVoice || "operativo";
    skills.value = res.assignedAgents ? [...res.assignedAgents] : [];
    doListInput.value = res.doList ? res.doList.join("\n") : "";
    dontListInput.value = res.dontList ? res.dontList.join("\n") : "";
    systemPrompt.value = newWs.systemPrompt || "";
  }
  const res = newWs.linkedResources || {};

  // Step 18: Prefer googleIntegration (workspace-scoped vault) over legacy linkedResources
  if (newWs.googleIntegration?.connected) {
    googleEmail.value = newWs.googleIntegration.connectedEmail || res.googleEmail || "";
    isOAuthConnected.value = true;
  } else {
    googleEmail.value = res.googleEmail || "";
    isOAuthConnected.value = res.isOAuthConnected || false;
  }

  linkedEmails.value = res.linkedEmails
    ? [...res.linkedEmails]
    : googleEmail.value
      ? [googleEmail.value]
      : [];
  defaultSheetId.value = res.defaultSheetId || "";
  defaultDriveFolderId.value = res.defaultDriveFolderId || "";
  defaultEmailSignature.value = res.defaultEmailSignature || "";

  linkedSheets.value = res.linkedSheets ? [...res.linkedSheets] : [];
  if (linkedSheets.value.length === 0 && res.defaultSheetId) {
    linkedSheets.value = [
      {
        id: res.defaultSheetId,
        name: res.defaultSheetName || "Foglio Google Predefinito",
        type: "sheet",
        isMaster: true,
      },
    ];
  }

  linkedFolders.value = res.linkedFolders ? [...res.linkedFolders] : [];
  if (linkedFolders.value.length === 0 && res.defaultDriveFolderId) {
    linkedFolders.value = [
      {
        id: res.defaultDriveFolderId,
        name: res.defaultDriveFolderName || "Cartella Drive Principale",
        type: "folder",
        isMaster: true,
      },
    ];
  }

  if (res.assignedAgents) {
    assignedAgents.value = [...res.assignedAgents];
  }
}; /*end syncFromWorkspace*/

watch(
  () => props.workspace,
  (newWs) => {
    syncFromWorkspace(newWs);
  },
  { immediate: true, deep: true },
);

watch(
  () => props.modelValue,
  (isOpenVal) => {
    if (isOpenVal) {
      syncFromWorkspace(props.workspace);
    }
  },
);

const applyPreset = (preset: (typeof presetTemplates)[0]): void => {
  systemPrompt.value = preset.prompt;
  industryScope.value = preset.industryScope;
  tone.value = preset.tone;
  skills.value = [...preset.skills];
  doListInput.value = preset.doRules;
  dontListInput.value = preset.dontRules;
  q.notify({
    type: "info",
    message: `Template "${preset.title}" applicato con successo!`,
    position: "top",
  });
}; /*end applyPreset*/

const runSandboxTest = (): void => {
  if (!testInput.value.trim()) return;
  isTesting.value = true;
  setTimeout(() => {
    testOutput.value =
      `🧪 [Simulazione Response Engine OpsFlow]\n` +
      `📌 Workspace: ${props.workspace?.name || "Corrente"}\n` +
      `🏢 Settore: ${industryScope.value}\n` +
      `📧 Gmail Autorizzata: ${googleEmail.value || "Non collegata"}\n` +
      `📊 Sheet ID: ${defaultSheetId.value || "Non specificato"}\n` +
      `📁 Drive Folder ID: ${defaultDriveFolderId.value || "Non specificato"}\n` +
      `🎭 Tono: ${tone.value}\n\n` +
      `Risposta IA: Ricevuta istruzione "${testInput.value}". Gli agenti attivi (${assignedAgents.value.join(", ")}) invocheranno searchWebAndPlatformsTool e formatteranno i risultati.`;
    isTesting.value = false;
  }, 600);
}; /*end runSandboxTest*/

const handleSave = async (): Promise<void> => {
  if (!props.workspace || isSaving.value) return;

  isSaving.value = true;
  try {
    const doList = doListInput.value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const dontList = dontListInput.value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const masterSheetObj =
      linkedSheets.value.find((s: LinkedGoogleResource) => s.isMaster) || linkedSheets.value[0];
    const masterFolderObj =
      linkedFolders.value.find((f: LinkedGoogleResource) => f.isMaster) || linkedFolders.value[0];

    const cleanLinkedSheets = linkedSheets.value.map((s: LinkedGoogleResource) => {
      const item: LinkedGoogleResource = {
        id: s.id,
        name: s.name,
        type: s.type || "sheet",
        isMaster: !!s.isMaster,
      };
      if (s.url) item.url = s.url;
      if (s.addedAt) item.addedAt = s.addedAt;
      return item;
    });

    const cleanLinkedFolders = linkedFolders.value.map((f: LinkedGoogleResource) => {
      const item: LinkedGoogleResource = {
        id: f.id,
        name: f.name,
        type: f.type || "folder",
        isMaster: !!f.isMaster,
      };
      if (f.url) item.url = f.url;
      if (f.addedAt) item.addedAt = f.addedAt;
      return item;
    });

    const linkedResources: WorkspaceLinkedResources = {
      googleEmail: googleEmail.value.trim() || (linkedEmails.value[0] ?? ""),
      linkedEmails: linkedEmails.value,
      linkedSheets: cleanLinkedSheets,
      linkedFolders: cleanLinkedFolders,
      defaultSheetId: masterSheetObj?.id || defaultSheetId.value.trim() || "",
      defaultSheetName: masterSheetObj?.name || "Foglio Master",
      defaultDriveFolderId: masterFolderObj?.id || defaultDriveFolderId.value.trim() || "",
      defaultDriveFolderName: masterFolderObj?.name || "Cartella Drive",
      defaultEmailSignature: defaultEmailSignature.value.trim(),
      isOAuthConnected: isOAuthConnected.value,
      assignedAgents: assignedAgents.value,
    };

    await taskStore.updateWorkspaceLinkedResources(
      props.workspace.id,
      linkedResources,
      systemPrompt.value,
    );

    await taskStore.updateWorkspaceAttitude(props.workspace.id, {
      industryScope: industryScope.value.trim() || "Generale",
      tone: tone.value.trim() || "operativo",
      skills: skills.value,
      rules: {
        doList,
        dontList,
        outputFormat: "markdown",
      },
    });

    q.notify({
      type: "positive",
      message: "AI Attitude & Skill Matrix saved successfully!",
      position: "top",
    });
    emit("saved");
    isOpen.value = false;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("WorkspaceAttitude", "Error saving Workspace configuration", { error: errorMsg });
    q.notify({
      type: "negative",
      message: `Errore salvataggio configurazione: ${errorMsg}`,
      position: "top",
    });
  } finally {
    isSaving.value = false;
  }
}; /*end handleSave*/
</script>

<template>
  <q-dialog v-model="isOpen" persistent backdrop-filter="blur(14px)">
    <q-card style="width: 720px; max-width: 95vw; border-radius: 20px" class="q-pa-md">
      <q-card-section class="row items-center justify-between q-pb-none">
        <div class="row items-center q-gutter-sm">
          <q-avatar icon="psychology" color="amber-8" text-color="white" />
          <div>
            <div class="text-h6 text-weight-bold text-navy">AI Attitude &amp; Linked Resources</div>
            <div class="text-caption text-grey-7">Workspace: {{ workspace?.name }}</div>
          </div>
        </div>
        <q-btn flat round dense icon="close" v-close-popup />
      </q-card-section>

      <!-- 4-Tab Header -->
      <q-card-section class="q-pt-sm">
        <q-tabs
          v-model="activeTab"
          dense
          class="text-grey"
          active-color="primary"
          indicator-color="primary"
          align="justify"
          narrow-indicator
        >
          <q-tab name="behavior" icon="tune" label="1. Behavior" />
          <q-tab name="resources" icon="cloud_sync" label="2. Google Resources" />
          <q-tab name="agents" icon="smart_toy" label="3. AI Agents" />
          <q-tab name="sandbox" icon="science" label="4. Sandbox Test" />
        </q-tabs>

        <q-separator />

        <q-tab-panels v-model="activeTab" animated class="q-pt-md">
          <!-- TAB 1: Behavior & Prompt -->
          <q-tab-panel name="behavior" class="q-pa-none">
            <!-- Preset Buttons -->
            <div class="q-mb-md">
              <div class="text-caption text-weight-bold text-grey-7 q-mb-xs">
                Ready-to-use Quick Templates:
              </div>
              <div class="row q-gutter-xs">
                <q-btn
                  v-for="tpl in presetTemplates"
                  :key="tpl.title"
                  dense
                  outline
                  size="sm"
                  color="primary"
                  :label="tpl.title"
                  @click="applyPreset(tpl)"
                />
              </div>
            </div>

            <div class="row q-col-gutter-md q-mb-md">
              <div class="col-12 col-md-6">
                <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
                  Domain / Professional Sector:
                </div>
                <q-input
                  v-model="industryScope"
                  outlined
                  dense
                  placeholder="e.g. Healthcare, Engineering, Legal, Consulting..."
                />
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
                  Tone of Voice &amp; Style:
                </div>
                <q-input
                  v-model="tone"
                  outlined
                  dense
                  placeholder="e.g. concise &amp; operational, clinical, creative, formal..."
                />
              </div>
            </div>

            <div class="q-mb-md">
              <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
                🧠 Skill Matrix (Active AI Skills):
              </div>
              <q-select
                v-model="skills"
                use-input
                use-chips
                multiple
                hide-dropdown-icon
                new-value-mode="add-unique"
                outlined
                dense
                placeholder="Press Enter to add new skills..."
              />
            </div>

            <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
              System Prompt (Additional Instructions):
            </div>
            <q-input
              v-model="systemPrompt"
              type="textarea"
              rows="3"
              outlined
              dense
              class="q-mb-md"
              placeholder="e.g. Your role is to search for IT clients, profile prospects on LinkedIn, and prepare email drafts on Gmail..."
            />

            <div class="row q-col-gutter-md q-mb-md">
              <div class="col-12 col-md-6">
                <div class="text-caption text-weight-bold text-positive q-mb-xs">
                  ✅ Binding Rules (Do List):
                </div>
                <q-input
                  v-model="doListInput"
                  type="textarea"
                  rows="3"
                  outlined
                  dense
                  placeholder="One rule per line (e.g. Always cite links)"
                />
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption text-weight-bold text-negative q-mb-xs">
                  🚫 Strict Restrictions (Don't List):
                </div>
                <q-input
                  v-model="dontListInput"
                  type="textarea"
                  rows="3"
                  outlined
                  dense
                  placeholder="One rule per line (e.g. Never send direct emails)"
                />
              </div>
            </div>
          </q-tab-panel>

          <!-- TAB 2: Google Linked Resources -->
          <q-tab-panel name="resources" class="q-pa-none">
            <!-- OAuth Main Banner -->
            <div class="q-pa-sm bg-blue-1 rounded-borders q-mb-md">
              <div class="row items-center justify-between">
                <div class="row items-center q-gutter-sm">
                  <q-icon
                    :name="isOAuthConnected ? 'check_circle' : 'warning'"
                    :color="isOAuthConnected ? 'positive' : 'warning'"
                    size="sm"
                  />
                  <div>
                    <div class="text-subtitle2 text-weight-bold text-navy">
                      {{
                        isOAuthConnected
                          ? "Google OAuth2 Connection Status: ACTIVE"
                          : "Google Account Not Authorized"
                      }}
                    </div>
                    <div class="text-caption text-grey-8">
                      Allows AI to interact with your Gmail, Google Sheets, and Google Drive.
                    </div>
                    <!-- Connected Account Badge / Card -->
                    <div
                      v-if="
                        isOAuthConnected &&
                        (googleEmail || (linkedEmails && linkedEmails.length > 0))
                      "
                      class="row items-center q-gutter-xs q-mt-xs bg-white q-px-sm q-py-2xs rounded-borders"
                      style="border: 1px solid rgba(10, 35, 66, 0.15); display: inline-flex"
                    >
                      <q-icon name="mark_email_read" size="14px" color="positive" />
                      <span class="text-caption text-weight-bold text-navy"
                        >Account collegato:</span
                      >
                      <span class="text-caption text-weight-bold text-primary">
                        {{ googleEmail || linkedEmails[0] }}
                      </span>
                    </div>
                  </div>
                </div>
                <q-btn
                  :color="isOAuthConnected ? 'positive' : 'primary'"
                  :icon="isOAuthConnected ? 'verified' : 'login'"
                  :label="isOAuthConnected ? 'OAuth2 Authorized' : 'Connect Google OAuth2'"
                  no-caps
                  dense
                  class="q-px-sm"
                  :loading="isConnectingGoogle"
                  @click="handleConnectGoogle"
                />
              </div>
            </div>

            <!-- Multi-Email Connection Section -->
            <div class="q-mb-md">
              <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
                ✉️ Indirizzi Email Autorizzati (Puoi aggiungere più account):
              </div>
              <div class="row q-gutter-sm q-mb-xs">
                <q-input
                  v-model="newEmailInput"
                  outlined
                  dense
                  class="col"
                  placeholder="Es: studio.opsflow@gmail.com o admin@opsflow.it"
                  @keyup.enter="addEmail"
                >
                  <template #prepend>
                    <q-icon name="email" color="primary" />
                  </template>
                </q-input>
                <q-btn
                  color="primary"
                  icon="add"
                  label="Aggiungi Email"
                  no-caps
                  dense
                  class="q-px-sm"
                  :disabled="!newEmailInput.trim()"
                  @click="addEmail"
                />
              </div>

              <div v-if="linkedEmails.length > 0" class="row q-gutter-xs q-mt-xs">
                <q-chip
                  v-for="email in linkedEmails"
                  :key="email"
                  removable
                  color="primary"
                  text-color="white"
                  icon="mark_email_read"
                  size="sm"
                  @remove="removeEmail(email)"
                >
                  {{ email }}
                </q-chip>
              </div>
              <div v-else class="text-caption text-grey-6 italic">
                Nessuna email secondaria aggiunta. L'IA usera l'email principale di login.
              </div>
            </div>

            <q-separator class="q-my-md" />

            <!-- Google Sheets Section (Multiple Sheets with Names) -->
            <div class="q-mb-lg">
              <div class="row items-center justify-between q-mb-xs">
                <div class="text-subtitle2 text-weight-bold text-navy">
                  📊 Fogli Google Sheets Collegati (riconoscibili per Nome):
                </div>
              </div>
              <p class="text-caption text-grey-7 q-mb-sm">
                Seleziona quale foglio funge da
                <strong>⭐ Foglio Principale (Master Database)</strong> per la cronologia generale e
                quali fogli sono dedicati ai singoli task.
              </p>

              <!-- Sheets List -->
              <q-list
                v-if="linkedSheets.length > 0"
                bordered
                separator
                class="rounded-borders bg-white q-mb-sm"
              >
                <q-item v-for="sheet in linkedSheets" :key="sheet.id" class="q-py-sm">
                  <q-item-section avatar style="min-width: 36px">
                    <q-icon name="table_chart" color="positive" size="22px" />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-subtitle2 text-weight-bold">
                      {{ sheet.name }}
                      <q-chip
                        v-if="sheet.isMaster"
                        color="amber-9"
                        text-color="dark"
                        size="xs"
                        icon="star"
                        class="text-weight-bold q-ml-xs"
                      >
                        Foglio Master (Database)
                      </q-chip>
                    </q-item-label>
                    <q-item-label
                      caption
                      class="text-mono text-grey-6 text-ellipsis"
                      style="max-width: 320px"
                    >
                      ID: {{ sheet.id }}
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side class="row no-wrap items-center q-gutter-xs">
                    <q-btn
                      v-if="!sheet.isMaster"
                      flat
                      dense
                      no-caps
                      size="xs"
                      color="amber-9"
                      icon="star_border"
                      label="Imposta come Master"
                      @click="setMasterSheet(sheet.id)"
                    />
                    <q-btn
                      v-if="sheet.url"
                      flat
                      round
                      dense
                      icon="open_in_new"
                      size="xs"
                      color="grey-7"
                      :href="sheet.url"
                      target="_blank"
                    />
                    <q-btn
                      flat
                      round
                      dense
                      icon="delete"
                      size="xs"
                      color="negative"
                      @click="removeSheetResource(sheet.id)"
                    />
                  </q-item-section>
                </q-item>
              </q-list>
              <div v-else class="text-caption text-grey-6 italic q-mb-sm">
                Nessun Foglio Google ancora registrato. Aggiungine uno qui sotto:
              </div>

              <!-- Add Sheet Form -->
              <div class="row q-col-gutter-xs items-center bg-grey-1 q-pa-xs rounded-borders">
                <div class="col-12 col-md-4">
                  <q-input
                    v-model="newSheetNameInput"
                    outlined
                    dense
                    placeholder="Nome Foglio (es. Listino Servizi)"
                    bg-color="white"
                  />
                </div>
                <div class="col-12 col-md-6">
                  <q-input
                    v-model="newSheetUrlInput"
                    outlined
                    dense
                    placeholder="URL o ID Foglio Google"
                    bg-color="white"
                  />
                </div>
                <div class="col-12 col-md-2">
                  <q-btn
                    unelevated
                    color="positive"
                    icon="add"
                    label="Aggiungi"
                    no-caps
                    dense
                    class="full-width"
                    :disabled="!newSheetUrlInput.trim()"
                    @click="addSheetResource"
                  />
                </div>
              </div>
            </div>

            <q-separator class="q-my-md" />

            <!-- Google Drive Folders Section -->
            <div class="q-mb-lg">
              <div class="text-subtitle2 text-weight-bold text-navy q-mb-xs">
                📁 Cartelle Google Drive Collegate:
              </div>
              <p class="text-caption text-grey-7 q-mb-sm">
                Spazi Drive per l'indicizzazione e l'estrazione documentale da parte dell'Agente.
              </p>

              <q-list
                v-if="linkedFolders.length > 0"
                bordered
                separator
                class="rounded-borders bg-white q-mb-sm"
              >
                <q-item v-for="folder in linkedFolders" :key="folder.id" class="q-py-sm">
                  <q-item-section avatar style="min-width: 36px">
                    <q-icon name="folder_special" color="amber-9" size="22px" />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-subtitle2 text-weight-bold">
                      {{ folder.name }}
                    </q-item-label>
                    <q-item-label
                      caption
                      class="text-mono text-grey-6 text-ellipsis"
                      style="max-width: 320px"
                    >
                      ID: {{ folder.id }}
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side class="row no-wrap items-center q-gutter-xs">
                    <q-btn
                      v-if="folder.url"
                      flat
                      round
                      dense
                      icon="open_in_new"
                      size="xs"
                      color="grey-7"
                      :href="folder.url"
                      target="_blank"
                    />
                    <q-btn
                      flat
                      round
                      dense
                      icon="delete"
                      size="xs"
                      color="negative"
                      @click="removeFolderResource(folder.id)"
                    />
                  </q-item-section>
                </q-item>
              </q-list>

              <!-- Add Folder Form -->
              <div class="row q-col-gutter-xs items-center bg-grey-1 q-pa-xs rounded-borders">
                <div class="col-12 col-md-4">
                  <q-input
                    v-model="newFolderNameInput"
                    outlined
                    dense
                    placeholder="Nome Cartella (es. Documenti)"
                    bg-color="white"
                  />
                </div>
                <div class="col-12 col-md-6">
                  <q-input
                    v-model="newFolderUrlInput"
                    outlined
                    dense
                    placeholder="URL o ID Cartella Drive"
                    bg-color="white"
                  />
                </div>
                <div class="col-12 col-md-2">
                  <q-btn
                    unelevated
                    color="amber-9"
                    text-color="dark"
                    icon="add"
                    label="Aggiungi"
                    no-caps
                    dense
                    class="full-width text-weight-bold"
                    :disabled="!newFolderUrlInput.trim()"
                    @click="addFolderResource"
                  />
                </div>
              </div>
            </div>

            <q-separator class="q-my-md" />

            <!-- Default Email Signature for the Workspace -->
            <div class="q-mb-md">
              <div class="text-subtitle2 text-weight-bold text-navy q-mb-xs">
                ✍️ Firma Email Predefinita del Workspace:
              </div>
              <p class="text-caption text-grey-7 q-mb-sm">
                Questa firma viene ereditata automaticamente da tutti i task del Workspace (può
                essere personalizzata nel singolo task).
              </p>
              <q-input
                v-model="defaultEmailSignature"
                type="textarea"
                rows="4"
                outlined
                dense
                placeholder="Inserisci la firma predefinita (es. Cordiali saluti, Team OpsFlow...)"
              />
            </div>
          </q-tab-panel>

          <!-- TAB 3: Assigned Agents -->
          <q-tab-panel name="agents" class="q-pa-none">
            <div class="text-body2 text-grey-8 q-mb-md">
              Seleziona quali agenti IA coordinati sono abilitati ad operare su questo Workspace:
            </div>

            <q-option-group
              v-model="assignedAgents"
              :options="agentOptions"
              type="checkbox"
              color="primary"
              class="q-mb-md"
            />
          </q-tab-panel>

          <!-- TAB 4: Sandbox Test -->
          <q-tab-panel name="sandbox" class="q-pa-none">
            <div class="text-body2 text-grey-8 q-mb-sm">
              Test the AI response with the attitude and linked resources before saving:
            </div>

            <q-input
              v-model="testInput"
              outlined
              dense
              placeholder="Type a test instruction (e.g. Find private clinics and save to spreadsheet)..."
              class="q-mb-sm"
              @keyup.enter="runSandboxTest"
            >
              <template #after>
                <q-btn
                  color="secondary"
                  icon="play_arrow"
                  label="Test Prompt"
                  no-caps
                  :loading="isTesting"
                  @click="runSandboxTest"
                />
              </template>
            </q-input>

            <div v-if="testOutput" class="q-pa-md bg-grey-2 rounded-borders text-caption font-mono">
              <pre style="white-space: pre-wrap; margin: 0">{{ testOutput }}</pre>
            </div>
          </q-tab-panel>
        </q-tab-panels>
      </q-card-section>

      <q-card-actions align="right" class="q-pt-none">
        <q-btn flat label="Cancel" v-close-popup />
        <q-btn
          color="primary"
          icon="save"
          label="Save Configuration"
          :loading="isSaving"
          @click="handleSave"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
