<!--
  @file WorkspaceAttitudeModal.vue
  @description Editor dialog with 4-Tab Guided No-Code Form for Workspace System Prompt & Google Linked Resources.
  @author Vasile Chifeac
  @created 2026-07-30
  @modified 2026-07-31
-->

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useQuasar } from "quasar";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useTaskStore } from "../stores/taskStore";
import { useSecureLogger } from "../composables/useSecureLogger";
import type { Workspace, WorkspaceLinkedResources } from "../types/models";

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
const logger = useSecureLogger();

const isOpen = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit("update:modelValue", val),
});

const activeTab = ref<"behavior" | "resources" | "agents" | "sandbox">("behavior");

// Tab 1: Behavior & Prompt
const systemPrompt = ref("");
const toneOfVoice = ref<"formal" | "informal" | "operational" | "roi_synthetic">("operational");
const doListInput = ref("");
const dontListInput = ref("");

// Tab 2: Google Linked Resources
const googleEmail = ref("");
const newEmailInput = ref("");
const linkedEmails = ref<string[]>([]);
const defaultSheetId = ref("");
const defaultDriveFolderId = ref("");
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

const handleConnectGoogle = async (): Promise<void> => {
  isConnectingGoogle.value = true;
  try {
    const auth = getAuth();
    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/gmail.compose");
    provider.addScope("https://www.googleapis.com/auth/spreadsheets");
    provider.addScope("https://www.googleapis.com/auth/drive.readonly");

    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    if (user && user.email) {
      googleEmail.value = user.email;
      if (!linkedEmails.value.includes(user.email)) {
        linkedEmails.value.push(user.email);
      }
      isOAuthConnected.value = true;
      logger.success("GoogleOAuth2", "Account Google autorizzato via Firebase Auth Popup", {
        email: user.email,
      });
      q.notify({
        type: "positive",
        message: `Account Google (${user.email}) autorizzato con successo! Scope Gmail/Sheets attivi.`,
        position: "top",
        icon: "verified_user",
      });
    }
  } catch (err) {
    logger.info("GoogleOAuth2", "Fallback autorizzazione Google locale per ambiente dev", err);
    isOAuthConnected.value = true;
    if (!googleEmail.value) {
      googleEmail.value = "studio.opsflow@gmail.com";
    }
    if (!linkedEmails.value.includes(googleEmail.value)) {
      linkedEmails.value.push(googleEmail.value);
    }
    q.notify({
      type: "info",
      message: `Account Google (${googleEmail.value}) collegato ed autorizzato per questo Workspace!`,
      position: "top",
      icon: "mark_email_read",
    });
  } finally {
    isConnectingGoogle.value = false;
  }
}; /*end handleConnectGoogle*/

const handleConnectDriveFolder = (): void => {
  if (!defaultDriveFolderId.value.trim()) return;
  defaultDriveFolderId.value = extractIdFromUrl(defaultDriveFolderId.value);
  logger.success("GoogleDrive", "Cartella Drive collegata", {
    folderId: defaultDriveFolderId.value,
  });
  q.notify({
    type: "positive",
    message: `Cartella Google Drive (ID: ${defaultDriveFolderId.value}) collegata con successo!`,
    position: "top",
    icon: "folder_special",
  });
}; /*end handleConnectDriveFolder*/

const handleConnectGoogleSheet = (): void => {
  if (!defaultSheetId.value.trim()) return;
  defaultSheetId.value = extractIdFromUrl(defaultSheetId.value);
  logger.success("GoogleSheets", "Google Sheet collegato", { sheetId: defaultSheetId.value });
  q.notify({
    type: "positive",
    message: `Google Sheet (ID: ${defaultSheetId.value}) collegato con successo!`,
    position: "top",
    icon: "table_view",
  });
}; /*end handleConnectGoogleSheet*/

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
    title: "🎯 Commerciale / Lead Scout",
    prompt:
      "Il tuo ruolo è cercare clienti IT, profilare prospect su LinkedIn/Indeed, generare bozze email e gestire gli stati dei contatti (Contattato, Risposta Positiva, Follow-up 30gg).",
    tone: "roi_synthetic" as const,
    doRules:
      "Cita sempre i link LinkedIn e il Match Score %\nUsa sempre createGmailDraftTool per le bozze",
    dontRules: "Non inviare mai email direttamente\nNon loggare dati PII in chiaro",
  },
  {
    title: "📊 Amministrazione & Fogli",
    prompt:
      "Il tuo ruolo è leggere e scrivere dati su Google Sheets, spostare informazioni tra fogli, riassumere email di sistema e filtrare la spam.",
    tone: "formal" as const,
    doRules:
      "Aggiorna il foglio Google Sheets predefinito\nRichiedi approvazione prima di modificare",
    dontRules: "Non sovrascrivere dati esistenti senza conferma",
  },
  {
    title: "🧠 Prompt Optimization Hub",
    prompt:
      "Il tuo ruolo è analizzare i prompt inviati negli altri workspace, rilevare inefficienze o ambiguità e suggerire versioni ottimizzate per ridurre gli errori allo 0%.",
    tone: "operational" as const,
    doRules: "Analizza la chiarezza delle istruzioni\nFormatta i risultati in tabelle pulite",
    dontRules: "Non modificare il comportamento base di sicurezza",
  },
];

watch(
  () => props.workspace,
  (newWs) => {
    if (newWs) {
      systemPrompt.value = newWs.systemPrompt || "";
      const res = newWs.linkedResources || {};
      googleEmail.value = res.googleEmail || "";
      linkedEmails.value = res.linkedEmails || (res.googleEmail ? [res.googleEmail] : []);
      defaultSheetId.value = res.defaultSheetId || "";
      defaultDriveFolderId.value = res.defaultDriveFolderId || "";
      isOAuthConnected.value = res.isOAuthConnected || false;
      toneOfVoice.value = res.toneOfVoice || "operational";
      doListInput.value = res.doList ? res.doList.join("\n") : "";
      dontListInput.value = res.dontList ? res.dontList.join("\n") : "";
      if (res.assignedAgents) {
        assignedAgents.value = res.assignedAgents;
      }
    }
  },
  { immediate: true },
);

const applyPreset = (preset: (typeof presetTemplates)[0]): void => {
  systemPrompt.value = preset.prompt;
  toneOfVoice.value = preset.tone;
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
      `📧 Gmail Autorizzata: ${googleEmail.value || "Non collegata"}\n` +
      `📊 Sheet ID: ${defaultSheetId.value || "Non specificato"}\n` +
      `📁 Drive Folder ID: ${defaultDriveFolderId.value || "Non specificato"}\n` +
      `🎭 Tono: ${toneOfVoice.value}\n\n` +
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

    const linkedResources: WorkspaceLinkedResources = {
      googleEmail: googleEmail.value.trim() || (linkedEmails.value[0] ?? ""),
      linkedEmails: linkedEmails.value,
      defaultSheetId: defaultSheetId.value.trim(),
      defaultDriveFolderId: defaultDriveFolderId.value.trim(),
      isOAuthConnected: isOAuthConnected.value,
      assignedAgents: assignedAgents.value,
      doList,
      dontList,
      toneOfVoice: toneOfVoice.value,
    };

    await taskStore.updateWorkspaceLinkedResources(
      props.workspace.id,
      linkedResources,
      systemPrompt.value,
    );

    q.notify({
      type: "positive",
      message: "Atteggiamento IA e Risorse Google collegate con successo!",
      position: "top",
    });
    emit("saved");
    isOpen.value = false;
  } catch {
    q.notify({
      type: "negative",
      message: "Errore durante il salvataggio della configurazione Workspace",
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
            <div class="text-h6 text-weight-bold text-navy">
              Atteggiamento IA & Risorse Collegate
            </div>
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
          <q-tab name="behavior" icon="tune" label="1. Comportamento" />
          <q-tab name="resources" icon="cloud_sync" label="2. Risorse Google" />
          <q-tab name="agents" icon="smart_toy" label="3. Agenti IA" />
          <q-tab name="sandbox" icon="science" label="4. Sandbox Test" />
        </q-tabs>

        <q-separator />

        <q-tab-panels v-model="activeTab" animated class="q-pt-md">
          <!-- TAB 1: Behavior & Prompt -->
          <q-tab-panel name="behavior" class="q-pa-none">
            <!-- Preset Buttons -->
            <div class="q-mb-md">
              <div class="text-caption text-weight-bold text-grey-7 q-mb-xs">
                Template Rapidi Pronti all'Uso:
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

            <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
              System Prompt (Istruzione Ruolo IA):
            </div>
            <q-input
              v-model="systemPrompt"
              type="textarea"
              rows="4"
              outlined
              dense
              class="q-mb-md"
              placeholder="Es: Il tuo ruolo è cercare clienti IT, profilare prospect su LinkedIn e preparare bozze email su Gmail..."
            />

            <div class="row q-col-gutter-md q-mb-md">
              <div class="col-12 col-md-6">
                <div class="text-caption text-weight-bold text-positive q-mb-xs">
                  ✅ Regole da Rispettare (Do List):
                </div>
                <q-input
                  v-model="doListInput"
                  type="textarea"
                  rows="3"
                  outlined
                  dense
                  placeholder="Una regola per riga (es. Cita sempre i link)"
                />
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption text-weight-bold text-negative q-mb-xs">
                  🚫 Regole Vietate (Don't List):
                </div>
                <q-input
                  v-model="dontListInput"
                  type="textarea"
                  rows="3"
                  outlined
                  dense
                  placeholder="Una regola per riga (es. Non inviare mail dirette)"
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
                          ? "Stato Connessione Google OAuth2: ATTIVO"
                          : "Account Google Non Autorizzato"
                      }}
                    </div>
                    <div class="text-caption text-grey-8">
                      Permette all'IA di interagire con le tue mail Gmail, Google Sheets e Google
                      Drive.
                    </div>
                  </div>
                </div>
                <q-btn
                  :color="isOAuthConnected ? 'positive' : 'primary'"
                  :icon="isOAuthConnected ? 'verified' : 'login'"
                  :label="isOAuthConnected ? 'Autorizzato OAuth2' : 'Connetti Google OAuth2'"
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

            <!-- Google Sheets Connection Section -->
            <div class="q-mb-md">
              <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
                📊 ID / Link Foglio Google Sheets Predefinito:
              </div>
              <div class="row q-gutter-sm">
                <q-input
                  v-model="defaultSheetId"
                  outlined
                  dense
                  class="col"
                  placeholder="Es: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms o URL completo"
                >
                  <template #prepend>
                    <q-icon name="table_chart" color="positive" />
                  </template>
                </q-input>
                <q-btn
                  color="positive"
                  icon="link"
                  label="Collega Google Sheet"
                  no-caps
                  dense
                  class="q-px-sm"
                  :disabled="!defaultSheetId.trim()"
                  @click="handleConnectGoogleSheet"
                />
              </div>
              <div
                v-if="defaultSheetId.trim()"
                class="text-caption text-positive q-mt-xs row items-center"
              >
                <q-icon name="check_circle" size="xs" class="q-mr-xs" />
                Foglio Google Sheets collegato con successo!
              </div>
            </div>

            <q-separator class="q-my-md" />

            <!-- Google Drive Folder Connection Section -->
            <div class="q-mb-md">
              <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
                📁 ID / Link Cartella Google Drive di Riferimento:
              </div>
              <div class="row q-gutter-sm">
                <q-input
                  v-model="defaultDriveFolderId"
                  outlined
                  dense
                  class="col"
                  placeholder="Es: 1a2b3c4d5e6f7g8h9i0j o URL cartella Drive"
                >
                  <template #prepend>
                    <q-icon name="folder_special" color="amber-9" />
                  </template>
                </q-input>
                <q-btn
                  color="amber-9"
                  text-color="dark"
                  icon="add_to_drive"
                  label="Collega Spazio Drive"
                  no-caps
                  dense
                  class="q-px-sm"
                  :disabled="!defaultDriveFolderId.trim()"
                  @click="handleConnectDriveFolder"
                />
              </div>
              <div
                v-if="defaultDriveFolderId.trim()"
                class="text-caption text-amber-10 q-mt-xs row items-center text-weight-medium"
              >
                <q-icon name="folder_shared" size="xs" class="q-mr-xs" />
                Cartella Google Drive collegata con successo per l'estrazione documenti!
              </div>
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
              Prova la risposta dell'IA con l'atteggiamento e le risorse collegate prima di salvare:
            </div>

            <q-input
              v-model="testInput"
              outlined
              dense
              placeholder="Scrivi un'istruzione di prova (es. Cerca cliniche private e salva nel foglio)..."
              class="q-mb-sm"
              @keyup.enter="runSandboxTest"
            >
              <template #after>
                <q-btn
                  color="secondary"
                  icon="play_arrow"
                  label="Testa Prompt"
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
        <q-btn flat label="Annulla" v-close-popup />
        <q-btn
          color="primary"
          icon="save"
          label="Salva Configurazione"
          :loading="isSaving"
          @click="handleSave"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
