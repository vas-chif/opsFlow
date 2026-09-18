<script setup lang="ts">
/**
 * @file TaskSettingsModal.vue
 * @description Task-level operational settings modal (Objective & AI Prompt, Assigned Google Sheet, email signature, Master DB sync).
 * @author Vasile Chifeac
 * @created 2026-09-08
 * @modified 2026-09-17
 *
 * @notes
 * - Step 21: Adds tab 'Obiettivo & Prompt IA' to allow live editing of task title, category, and AI prompt.
 * - Allows binding a specific Google Sheet by friendly Name from Workspace resources or adding one on the fly.
 * - Any new Google Sheet added here is also automatically registered in the Workspace's linked resources.
 * - Allows specifying an internal tab name (auto-created via Google Sheets addSheet API if not existing).
 * - Allows setting custom email signature/header per task with zero hardcoded PII.
 * - Design System "Elite": Royal Navy #0a2342, Gold #c5a065, Off-White #f9f7f2.
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { computed, ref, watch } from "vue";
import { useQuasar } from "quasar";

// ── Types ─────────────────────────────────────────────────────────────────────
import type {
  Task,
  TaskSettings,
  Workspace,
  LinkedGoogleResource,
  SheetUpdateMode,
} from "../types/models";

// ── Components ───────────────────────────────────────────────────────────────
import SheetIntegrationConfigCard from "./SheetIntegrationConfigCard.vue";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useTaskStore } from "../stores/taskStore";

// ── Props & Emits ─────────────────────────────────────────────────────────────
const props = defineProps<{
  modelValue: boolean;
  task: Task;
  workspace?: Workspace | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
  (e: "saved"): void;
  (e: "openScheduleModal"): void;
  (e: "openRegenerateModal", payload: { prompt: string; title: string; category: string }): void;
}>();

const q = useQuasar();
const taskStore = useTaskStore();

// ── State ─────────────────────────────────────────────────────────────────────
const isSaving = ref<boolean>(false);
const activeTab = ref<string>("prompt");

// Step 21 §1.2 — Editable task core fields (Obiettivo & Prompt IA tab)
const editTitle = ref<string>("");
const editCategory = ref<string>("general");
const editPrompt = ref<string>("");
const isReplanningSubtasks = ref<boolean>(false);

// Task settings state
const selectedSheetIds = ref<string[]>([]);
const primarySheetId = ref<string>("");
const selectedSheetTab = ref<string>("");
const emailSignature = ref<string>("");
const emailHeader = ref<string>("");
const syncToMasterSheet = ref<boolean>(true);

// Step 21 Strada 3 — Sheet integration & auto-styling mode
const taskSheetUpdateMode = ref<SheetUpdateMode>("append_new");
const taskAutoStyleSheet = ref<boolean>(true);

// Add new sheet on the fly
const isAddingNewSheet = ref<boolean>(false);
const newSheetNameInput = ref<string>("");
const newSheetUrlInput = ref<string>("");

// ── Computed ──────────────────────────────────────────────────────────────────
const isOpen = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit("update:modelValue", val),
});

const availableWorkspaceSheets = computed<LinkedGoogleResource[]>(() => {
  const list = props.workspace?.linkedResources?.linkedSheets || [];
  if (list.length > 0) return list;

  // Backward-compatibility: if legacy defaultSheetId exists, construct one
  if (props.workspace?.linkedResources?.defaultSheetId) {
    return [
      {
        id: props.workspace.linkedResources.defaultSheetId,
        name: props.workspace.linkedResources.defaultSheetName || "Foglio Predefinito",
        type: "sheet",
        isMaster: true,
      },
    ];
  }
  return [];
});

const masterSheet = computed<LinkedGoogleResource | null>(() => {
  return (
    availableWorkspaceSheets.value.find((s) => s.isMaster) ||
    availableWorkspaceSheets.value[0] ||
    null
  );
});

const isSheetConfigInherited = computed<boolean>(() => {
  return (
    props.task.settings?.sheetUpdateMode === undefined &&
    props.task.settings?.autoStyleSheet === undefined
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const extractIdFromUrl = (input: string): string => {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match?.[1]) return match[1];
  return trimmed;
}; /*end extractIdFromUrl*/

const syncFromTask = (): void => {
  const s = props.task.settings;

  // Step 21 §1.2 — Initialize editable task core fields
  editTitle.value = props.task.title || "";
  editCategory.value = (props.task as { category?: string }).category || "general";
  editPrompt.value = props.task.description || "";

  // Initialize selected sheet IDs array (multi-select)
  if (s && Array.isArray(s.selectedSheetIds) && s.selectedSheetIds.length > 0) {
    selectedSheetIds.value = [...s.selectedSheetIds];
  } else if (s?.selectedSheetId) {
    selectedSheetIds.value = [s.selectedSheetId];
  } else if (props.workspace?.linkedResources?.defaultSheetId) {
    selectedSheetIds.value = [props.workspace.linkedResources.defaultSheetId];
  } else {
    selectedSheetIds.value = [];
  }

  // Primary sheet ID (default target for writing)
  primarySheetId.value =
    s?.selectedSheetId ||
    selectedSheetIds.value[0] ||
    props.workspace?.linkedResources?.defaultSheetId ||
    "";

  selectedSheetTab.value = s?.selectedSheetTab || "";
  emailSignature.value =
    s?.emailSignature || props.workspace?.linkedResources?.defaultEmailSignature || "";
  emailHeader.value = s?.emailHeader || "";
  // Inherit workspace-level autoSyncToMasterSheet as default (true unless workspace disables it).
  // If the task has an explicit stored value, use that instead.
  const wsAutoSync = props.workspace?.linkedResources?.autoSyncToMasterSheet !== false;
  syncToMasterSheet.value = s?.syncToMasterSheet !== undefined ? s.syncToMasterSheet : wsAutoSync;

  // Step 21 Strada 3 — Sheet integration mode & auto-styling with workspace default fallback
  const wsSheetMode = props.workspace?.linkedResources?.sheetUpdateMode ?? "append_new";
  const wsAutoStyle = props.workspace?.linkedResources?.autoStyleSheet !== false;
  taskSheetUpdateMode.value = s?.sheetUpdateMode ?? wsSheetMode;
  taskAutoStyleSheet.value = s?.autoStyleSheet !== undefined ? s.autoStyleSheet : wsAutoStyle;
}; /*end syncFromTask*/

watch(
  () => props.modelValue,
  (val) => {
    if (val) syncFromTask();
  },
  { immediate: true },
);

// Step 21 §1.3 — Re-sync when the task prop changes (e.g. real-time Firestore update)
watch(
  () => props.task,
  () => {
    syncFromTask();
  },
  { deep: false },
);

// ── Multi-Select Actions ───────────────────────────────────────────────────────
const isSheetSelected = (sheetId: string): boolean => {
  return selectedSheetIds.value.includes(sheetId);
}; /*end isSheetSelected*/

const toggleSheet = (sheet: LinkedGoogleResource): void => {
  const idx = selectedSheetIds.value.indexOf(sheet.id);
  if (idx >= 0) {
    selectedSheetIds.value.splice(idx, 1);
    if (primarySheetId.value === sheet.id) {
      primarySheetId.value = selectedSheetIds.value[0] || "";
    }
  } else {
    selectedSheetIds.value.push(sheet.id);
    if (!primarySheetId.value) {
      primarySheetId.value = sheet.id;
    }
  }
}; /*end toggleSheet*/

const setPrimarySheet = (sheetId: string, event?: Event): void => {
  if (event) event.stopPropagation();
  if (!selectedSheetIds.value.includes(sheetId)) {
    selectedSheetIds.value.push(sheetId);
  }
  primarySheetId.value = sheetId;
  q.notify({
    type: "positive",
    message: "🎯 Foglio primario di scrittura impostato per questo task!",
    position: "top",
    timeout: 1200,
  });
}; /*end setPrimarySheet*/

const selectAllSheets = (): void => {
  selectedSheetIds.value = availableWorkspaceSheets.value.map((s) => s.id);
  if (!primarySheetId.value && selectedSheetIds.value.length > 0) {
    primarySheetId.value = selectedSheetIds.value[0] || "";
  }
}; /*end selectAllSheets*/

const clearSelectedSheets = (): void => {
  selectedSheetIds.value = [];
  primarySheetId.value = "";
}; /*end clearSelectedSheets*/

const handleAddNewSheetOnTheFly = async (): Promise<void> => {
  if (!newSheetUrlInput.value.trim() || !props.workspace) return;
  const cleanId = extractIdFromUrl(newSheetUrlInput.value);
  const friendlyName =
    newSheetNameInput.value.trim() || `Foglio Google (${cleanId.slice(0, 10)}...)`;

  const newResource: LinkedGoogleResource = {
    id: cleanId,
    name: friendlyName,
    type: "sheet",
    url: newSheetUrlInput.value.trim(),
    addedAt: new Date().toISOString(),
    isMaster: availableWorkspaceSheets.value.length === 0,
  };

  const currentList = [...(props.workspace.linkedResources?.linkedSheets || [])];
  // Avoid duplicate ID
  const existingIdx = currentList.findIndex((s) => s.id === cleanId);
  if (existingIdx >= 0) {
    currentList[existingIdx] = newResource;
  } else {
    currentList.push(newResource);
  }

  try {
    // 1. Update workspace resources in Firestore so it's available to all tasks
    await taskStore.updateWorkspaceLinkedResources(props.workspace.id, {
      ...props.workspace.linkedResources,
      linkedSheets: currentList,
      defaultSheetId: props.workspace.linkedResources?.defaultSheetId || cleanId,
      defaultSheetName: props.workspace.linkedResources?.defaultSheetName || friendlyName,
    });

    // 2. Select it for this task (add to multi-select and set as primary)
    if (!selectedSheetIds.value.includes(cleanId)) {
      selectedSheetIds.value.push(cleanId);
    }
    primarySheetId.value = cleanId;

    // Reset input
    newSheetNameInput.value = "";
    newSheetUrlInput.value = "";
    isAddingNewSheet.value = false;

    q.notify({
      type: "positive",
      message: `Foglio "${friendlyName}" aggiunto al Task e registrato nel Workspace!`,
      icon: "cloud_done",
      position: "top",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    q.notify({
      type: "negative",
      message: `Errore salvataggio foglio: ${msg}`,
      position: "top",
    });
  }
}; /*end handleAddNewSheetOnTheFly*/

const loadWorkspaceSignature = (): void => {
  if (props.workspace?.linkedResources?.defaultEmailSignature) {
    emailSignature.value = props.workspace.linkedResources.defaultEmailSignature;
    q.notify({
      type: "info",
      message: "Firma predefinita del Workspace caricata.",
      icon: "file_download",
      timeout: 1200,
    });
  } else {
    q.notify({
      type: "warning",
      message: "Nessuna firma predefinita configurata nel Workspace.",
      icon: "info",
      timeout: 1500,
    });
  }
}; /*end loadWorkspaceSignature*/

const handleTriggerRegenerate = (): void => {
  emit("openRegenerateModal", {
    prompt: editPrompt.value.trim() || props.task.description || "",
    title: editTitle.value.trim() || props.task.title,
    category:
      editCategory.value.trim() ||
      props.task.aiMetadata?.suggestedCategory ||
      (props.task as { category?: string }).category ||
      "general",
  });
}; /*end handleTriggerRegenerate*/

const handleSave = async (): Promise<void> => {
  if (!props.workspace || isSaving.value) return;
  isSaving.value = true;

  try {
    // Step 21 §1.4 — Persist task core fields (title, category, prompt/description)
    const coreUpdates: Record<string, string> = {};
    const trimmedTitle = editTitle.value.trim();
    const trimmedPrompt = editPrompt.value.trim();
    const trimmedCategory = editCategory.value.trim() || "general";

    if (trimmedTitle && trimmedTitle !== props.task.title) {
      coreUpdates["title"] = trimmedTitle;
    }
    if (trimmedPrompt !== props.task.description) {
      coreUpdates["description"] = trimmedPrompt;
    }
    if (Object.keys(coreUpdates).length > 0) {
      await taskStore.updateTask(props.workspace.id, props.task.id, {
        ...coreUpdates,
        ...(trimmedCategory !== ((props.task as { category?: string }).category ?? "general")
          ? { category: trimmedCategory }
          : {}),
      } as Parameters<typeof taskStore.updateTask>[2]);
    }

    const selectedSheetsList = availableWorkspaceSheets.value.filter((ws) =>
      selectedSheetIds.value.includes(ws.id),
    );
    const primarySheet =
      selectedSheetsList.find((ws) => ws.id === primarySheetId.value) || selectedSheetsList[0];

    const updatedSettings: TaskSettings = {
      selectedSheetId: primarySheet?.id || undefined,
      selectedSheetName: primarySheet?.name || undefined,
      selectedSheetIds: selectedSheetIds.value,
      selectedSheets: selectedSheetsList,
      selectedSheetTab: selectedSheetTab.value.trim() || undefined,
      emailSignature: emailSignature.value.trim() || undefined,
      emailHeader: emailHeader.value.trim() || undefined,
      syncToMasterSheet: syncToMasterSheet.value,
      sheetUpdateMode: taskSheetUpdateMode.value,
      autoStyleSheet: taskAutoStyleSheet.value,
    };

    await taskStore.updateTask(props.workspace.id, props.task.id, {
      settings: updatedSettings,
    });

    q.notify({
      type: "positive",
      message: "Impostazioni del Task salvate con successo!",
      icon: "verified",
      position: "top",
    });

    emit("saved");
    isOpen.value = false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    q.notify({
      type: "negative",
      message: `Errore salvataggio impostazioni: ${msg}`,
      position: "top",
    });
  } finally {
    isSaving.value = false;
  }
}; /*end handleSave*/
</script>

<template>
  <q-dialog v-model="isOpen" persistent transition-show="scale" transition-hide="scale">
    <q-card class="task-settings-card column no-wrap">
      <!-- Header (Elite Navy & Gold) - Fixed -->
      <q-card-section class="task-settings-card__header row items-center q-py-md q-px-lg shrink-0">
        <q-icon name="tune" size="22px" color="amber-5" class="q-mr-sm" />
        <div>
          <div class="text-subtitle1 text-weight-bold text-white">Impostazioni Operative Task</div>
          <div class="text-caption text-amber-2">
            Task: {{ task.title }} | Workspace: {{ workspace?.name }}
          </div>
        </div>
        <q-space />
        <q-btn flat round dense icon="close" color="white" v-close-popup />
      </q-card-section>

      <!-- Navigation Tabs - Fixed -->
      <q-tabs
        v-model="activeTab"
        dense
        active-color="amber-9"
        indicator-color="amber-9"
        align="left"
        class="task-settings-card__tabs text-grey-7 bg-grey-2 shrink-0"
      >
        <!-- Step 21: Tab 1 — Obiettivo & Prompt IA (NEW, prioritario) -->
        <q-tab name="prompt" icon="psychology" label="1. Obiettivo &amp; Prompt IA" no-caps />
        <q-tab name="sheet" icon="table_chart" label="2. Fogli Google &amp; Schede" no-caps />
        <q-tab name="email" icon="mail" label="3. Firma &amp; Intestazione Email" no-caps />
        <q-tab name="sync" icon="cloud_sync" label="4. Master DB &amp; Cronologia" no-caps />
      </q-tabs>

      <q-separator class="shrink-0" />

      <!-- Tab Content - Scrollable Body -->
      <q-card-section class="col task-settings-card__body q-pa-none">
        <q-tab-panels
          v-model="activeTab"
          animated
          class="full-height task-settings-scroll-area custom-scrollbar q-pa-lg bg-transparent"
        >
          <!-- TAB 0: OBIETTIVO & PROMPT IA (Step 21) -->
          <q-tab-panel name="prompt" class="q-pa-none">
            <div class="text-subtitle2 text-weight-bold text-navy q-mb-xs">
              🎯 Obiettivo &amp; Prompt IA per questo Task
            </div>
            <p class="text-caption text-grey-7 q-mb-md">
              Modifica il titolo, la categoria operativa e il prompt/obiettivo dell'Agente IA per
              questo task attivo. Le modifiche sono immediate e senza perdita di contesto.
            </p>

            <!-- Titolo Task -->
            <div class="q-mb-md">
              <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">📝 Titolo Task:</div>
              <q-input
                v-model="editTitle"
                outlined
                dense
                placeholder="Es. Docente Oracle/RAC Milano | NobleProg"
                :rules="[(v: string) => v.trim().length > 0 || 'Il titolo è obbligatorio']"
              >
                <template #prepend>
                  <q-icon name="title" color="amber-9" />
                </template>
              </q-input>
            </div>

            <!-- Categoria Operativa -->
            <div class="q-mb-md">
              <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
                🏷️ Categoria Operativa:
              </div>
              <q-select
                v-model="editCategory"
                outlined
                dense
                :options="[
                  { label: '⚙️ Generale / Operativo', value: 'general' },
                  { label: '🔍 Ricerca &amp; Screening', value: 'web_search' },
                  { label: '📊 Sincronizzazione Sheets', value: 'sheet_sync' },
                  { label: '✉️ Bozze Gmail', value: 'gmail_draft' },
                  { label: '📄 Analisi PDF', value: 'pdf_analysis' },
                ]"
                emit-value
                map-options
                option-value="value"
                option-label="label"
              >
                <template #prepend>
                  <q-icon name="category" color="amber-9" />
                </template>
              </q-select>
            </div>

            <!-- Prompt / Obiettivo Agente IA -->
            <div class="q-mb-md">
              <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
                🤖 Prompt / Obiettivo dell'Agente IA:
              </div>
              <q-input
                v-model="editPrompt"
                type="textarea"
                rows="7"
                outlined
                dense
                placeholder="Es. Trova candidati docenti Oracle/RAC su LinkedIn e Malt in Lombardia, genera bozze email personalizzate e compila il foglio di monitoraggio..."
                hint="Questo è l'obiettivo che l'Agente IA utilizzerà ad ogni esecuzione del task."
                class="q-mb-sm"
              >
                <template #prepend>
                  <q-icon name="smart_toy" color="amber-9" />
                </template>
              </q-input>
            </div>

            <!-- Step 21 §1.5: Rigenera Sotto-Task con AgentePlanner -->
            <div class="q-pa-sm bg-blue-1 rounded-borders border-primary-light q-mb-xs">
              <div class="row items-center justify-between no-wrap">
                <div class="col">
                  <div class="text-caption text-weight-bold text-primary">
                    ✨ Rigenera Sotto-Task
                  </div>
                  <div class="text-caption text-grey-7">
                    Usa AgentePlanner per scomporre automaticamente il nuovo prompt in sotto-task
                    operative.
                  </div>
                </div>
                <q-btn
                  outline
                  dense
                  no-caps
                  size="sm"
                  color="primary"
                  icon="auto_awesome"
                  label="Rigenera"
                  :loading="isReplanningSubtasks"
                  class="q-ml-md"
                  @click="handleTriggerRegenerate"
                >
                  <q-tooltip>Ri-decompone il task aggiornato con AgentePlanner</q-tooltip>
                </q-btn>
              </div>
            </div>
          </q-tab-panel>

          <!-- TAB 1: GOOGLE SHEETS (MULTI-SELECT) -->
          <q-tab-panel name="sheet" class="q-pa-none">
            <div class="text-subtitle2 text-weight-bold text-navy q-mb-xs">
              📊 Fogli Google di Lavoro per questo Task (Multi-selezione):
            </div>
            <p class="text-caption text-grey-7 q-mb-md">
              Seleziona uno o più fogli Google da collegare a questo task. L'Agente IA conoscerà
              tutti i fogli selezionati e potrà leggere o salvare dati su ciascuno di essi in base
              alle tue istruzioni.
            </p>

            <!-- Available Sheets Multi-Select List -->
            <div v-if="availableWorkspaceSheets.length > 0" class="q-mb-md">
              <div class="row items-center justify-between q-mb-xs">
                <div class="text-caption text-weight-bold text-grey-8">
                  Seleziona dalla libreria del Workspace:
                </div>
                <div class="row q-gutter-xs">
                  <q-btn
                    flat
                    dense
                    no-caps
                    size="xs"
                    color="primary"
                    label="Seleziona tutti"
                    @click="selectAllSheets"
                  />
                  <span class="text-grey-4">|</span>
                  <q-btn
                    flat
                    dense
                    no-caps
                    size="xs"
                    color="grey-7"
                    label="Deseleziona tutti"
                    @click="clearSelectedSheets"
                  />
                </div>
              </div>

              <q-list bordered separator class="rounded-borders bg-white">
                <q-item
                  v-for="sheet in availableWorkspaceSheets"
                  :key="sheet.id"
                  clickable
                  :active="isSheetSelected(sheet.id)"
                  active-class="bg-amber-1"
                  @click="toggleSheet(sheet)"
                >
                  <q-item-section avatar style="min-width: 40px">
                    <q-checkbox
                      :model-value="isSheetSelected(sheet.id)"
                      color="amber-9"
                      @update:model-value="toggleSheet(sheet)"
                      @click.stop
                    />
                  </q-item-section>

                  <q-item-section>
                    <q-item-label class="text-subtitle2 row items-center no-wrap">
                      <span :class="{ 'text-weight-bold': isSheetSelected(sheet.id) }">
                        {{ sheet.name }}
                      </span>
                      <q-badge
                        v-if="primarySheetId === sheet.id"
                        color="positive"
                        text-color="white"
                        label="🎯 Primario"
                        class="q-ml-sm"
                      >
                        <q-tooltip>Foglio target per la scrittura automatica predefinita</q-tooltip>
                      </q-badge>
                      <q-badge
                        v-else-if="sheet.isMaster"
                        color="amber-9"
                        text-color="dark"
                        label="⭐ Master DB"
                        class="q-ml-sm"
                      />
                    </q-item-label>
                    <q-item-label caption class="text-mono text-grey-6">
                      ID: {{ sheet.id }}
                    </q-item-label>
                  </q-item-section>

                  <q-item-section side class="row no-wrap items-center q-gutter-xs">
                    <!-- Button to make this sheet primary -->
                    <q-btn
                      v-if="isSheetSelected(sheet.id) && primarySheetId !== sheet.id"
                      flat
                      dense
                      no-caps
                      size="xs"
                      color="positive"
                      icon="check_circle_outline"
                      label="Rendi Primario"
                      @click.stop="setPrimarySheet(sheet.id, $event)"
                    >
                      <q-tooltip>Imposta questo foglio come target primario di scrittura</q-tooltip>
                    </q-btn>

                    <q-btn
                      v-if="sheet.url"
                      flat
                      round
                      dense
                      icon="open_in_new"
                      size="sm"
                      color="grey-7"
                      :href="sheet.url"
                      target="_blank"
                    >
                      <q-tooltip>Apri in Google Sheets</q-tooltip>
                    </q-btn>
                  </q-item-section>
                </q-item>
              </q-list>
            </div>
            <div v-else class="text-caption text-grey-6 italic q-mb-md">
              Nessun foglio Google ancora collegato a questo Workspace. Aggiungine uno qui sotto.
            </div>

            <!-- Tab / Sub-Sheet Specification -->
            <div class="q-mb-md">
              <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
                🏷️ Nome Scheda / Tab Interna del Foglio:
              </div>
              <q-input
                v-model="selectedSheetTab"
                outlined
                dense
                placeholder="Es: Lead_2026, Servizi_Pazienti, Risultati_Task"
                hint="Se la scheda non esiste ancora, verrà creata automaticamente all'interno dello stesso file durante la prima approvazione!"
              >
                <template #prepend>
                  <q-icon name="tab" color="primary" />
                </template>
              </q-input>
            </div>

            <q-separator class="q-my-md" />

            <!-- Add New Sheet on the fly -->
            <div>
              <q-btn
                flat
                dense
                no-caps
                size="sm"
                color="primary"
                :icon="isAddingNewSheet ? 'expand_less' : 'add_circle'"
                :label="
                  isAddingNewSheet
                    ? 'Chiudi Form Aggiunta'
                    : '➕ Collega un Nuovo Foglio Google al volo'
                "
                @click="isAddingNewSheet = !isAddingNewSheet"
              />

              <div
                v-if="isAddingNewSheet"
                class="q-pa-md q-mt-sm bg-grey-1 rounded-borders border-gold-light"
              >
                <div class="text-caption text-weight-bold text-navy q-mb-sm">
                  Aggiungi Nuovo Foglio Google (sarà visibile anche a tutti gli altri task del
                  Workspace):
                </div>
                <div class="row q-col-gutter-sm">
                  <div class="col-12 col-md-5">
                    <q-input
                      v-model="newSheetNameInput"
                      outlined
                      dense
                      placeholder="Nome Riconoscibile (es. Pazienti Domiciliari)"
                    />
                  </div>
                  <div class="col-12 col-md-7">
                    <q-input
                      v-model="newSheetUrlInput"
                      outlined
                      dense
                      placeholder="URL o ID Google Sheets"
                    >
                      <template #after>
                        <q-btn
                          unelevated
                          color="positive"
                          label="Collega e Salva"
                          no-caps
                          dense
                          class="q-px-md"
                          :disabled="!newSheetUrlInput.trim()"
                          @click="handleAddNewSheetOnTheFly"
                        />
                      </template>
                    </q-input>
                  </div>
                </div>
              </div>
            </div>

            <!-- Step 21 Strada 3: Modalità Integrazione Dati & Auto-Styling Elite -->
            <SheetIntegrationConfigCard
              v-model:update-mode="taskSheetUpdateMode"
              v-model:auto-style-sheet="taskAutoStyleSheet"
              :is-task-level="true"
              :is-inherited="isSheetConfigInherited"
            />

            <!-- Step 19 §5.2: Scheduled Sourcing Card in Settings -->
            <div
              class="scheduled-sourcing-banner q-mt-lg q-pa-md rounded-borders row items-center justify-between"
            >
              <div class="row items-center no-wrap col-grow q-pr-md">
                <q-icon name="schedule" size="26px" color="teal-8" class="q-mr-md" />
                <div>
                  <div class="text-subtitle2 text-weight-bold text-teal-10">
                    ⏰ Ricerca Programmata & Monitoraggio Notturno (04:00 AM)
                  </div>
                  <div class="text-caption text-grey-8">
                    Automatizza l'AgenteRicerca: diffing a doppia chiave preventivo e aggiunta dei
                    soli profili nuovi.
                  </div>
                </div>
              </div>
              <q-btn
                outline
                color="teal-9"
                icon="alarm_on"
                label="Pianifica"
                no-caps
                class="text-weight-bold"
                @click="emit('openScheduleModal')"
              />
            </div>
          </q-tab-panel>

          <!-- TAB 2: EMAIL SIGNATURE -->
          <q-tab-panel name="email" class="q-pa-none">
            <div class="row items-center justify-between q-mb-xs">
              <span class="text-subtitle2 text-weight-bold text-navy">
                ✍️ Firma Istituzionale per le Bozze Email di questo Task:
              </span>
              <q-btn
                outline
                dense
                no-caps
                size="xs"
                color="primary"
                icon="file_download"
                label="Carica Firma del Workspace"
                @click="loadWorkspaceSignature"
              />
            </div>
            <p class="text-caption text-grey-7 q-mb-md">
              Questa firma verrà inserita automaticamente in tutte le bozze Gmail generate dall'IA
              per questo task. Nessun dato personale è hardcoded nel sistema.
            </p>

            <q-input
              v-model="emailSignature"
              type="textarea"
              rows="8"
              outlined
              dense
              placeholder="Inserisci la tua firma personalizzata, es:&#10;&#10;Cordiali saluti,&#10;Dott. / Studio / Azienda&#10;Tel: +39 ...&#10;Email: ..."
              class="q-mb-md"
            />

            <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
              Intestazione Opzionale (Header Email):
            </div>
            <q-input
              v-model="emailHeader"
              outlined
              dense
              placeholder="Es. Gentile Paziente / Spettabile Ditta,"
            />
          </q-tab-panel>

          <!-- TAB 3: MASTER DB & SYNC -->
          <q-tab-panel name="sync" class="q-pa-none">
            <div class="text-subtitle2 text-weight-bold text-navy q-mb-xs">
              📜 Master Database su Google Drive (Audit & Cronologia Generale)
            </div>
            <p class="text-caption text-grey-7 q-mb-md">
              Il Master Database funge da registro centralizzato di tutto il Workspace, tracciando
              le sessioni, i prompt e gli stati dei task.
            </p>

            <div
              v-if="masterSheet"
              class="q-pa-md bg-amber-1 rounded-borders q-mb-md row items-center justify-between"
            >
              <div>
                <div class="text-weight-bold text-navy">
                  ⭐ Foglio Master Corrente: {{ masterSheet.name }}
                </div>
                <div class="text-caption text-mono text-grey-7">ID: {{ masterSheet.id }}</div>
              </div>
              <q-icon name="verified" color="amber-9" size="24px" />
            </div>
            <div v-else class="text-caption text-grey-6 italic q-mb-md">
              Nessun foglio Master ancora designato nel Workspace. Vai in AI Attitude per
              impostarlo.
            </div>

            <q-toggle
              v-model="syncToMasterSheet"
              color="amber-9"
              label="Registra automaticamente le milestone e i prompt di questo task nel Foglio Master"
              class="text-weight-medium"
            />
          </q-tab-panel>
        </q-tab-panels>
      </q-card-section>

      <q-separator class="shrink-0" />

      <!-- Footer Actions - Fixed at Bottom -->
      <q-card-actions align="right" class="task-settings-card__footer shrink-0 q-pa-md bg-white">
        <q-btn flat label="Annulla" color="grey-8" no-caps v-close-popup />
        <q-btn
          unelevated
          color="amber-9"
          text-color="dark"
          icon="save"
          label="Salva Impostazioni Task"
          no-caps
          class="text-weight-bold q-px-lg"
          :loading="isSaving"
          @click="handleSave"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.task-settings-card {
  width: 760px;
  max-width: 95vw;
  height: 85vh;
  max-height: 880px;
  border-radius: 16px;
  overflow: hidden;
  background: #f9f7f2;
  box-shadow: 0 20px 60px rgba(10, 35, 66, 0.22);
  border: 1px solid rgba(197, 160, 101, 0.25);
  display: flex;
  flex-direction: column;
}

.task-settings-card__header {
  background: #0a2342;
  border-bottom: 2px solid #c5a065;
}

.task-settings-card__tabs {
  border-bottom: 1px solid rgba(197, 160, 101, 0.2);
}

.task-settings-card__body {
  overflow: hidden;
  min-height: 0; // Essential for nested flex child scrolling
}

.task-settings-scroll-area {
  overflow-y: auto !important;
  overflow-x: hidden !important;
  height: 100%;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
    margin: 8px 0;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(197, 160, 101, 0.45);
    border-radius: 6px;
    &:hover {
      background: rgba(197, 160, 101, 0.75);
    }
  }
}

.task-settings-card__footer {
  background: #ffffff;
  border-top: 1px solid rgba(10, 35, 66, 0.08);
}

.border-amber-3 {
  border: 1px solid #ffd54f !important;
}

.scheduled-sourcing-banner {
  background: linear-gradient(135deg, rgba(38, 166, 154, 0.1) 0%, rgba(38, 166, 154, 0.04) 100%);
  border: 1px solid rgba(38, 166, 154, 0.3);
}

.border-gold-light {
  border: 1px solid rgba(197, 160, 101, 0.35);
}

.border-primary-light {
  border: 1px solid rgba(10, 35, 66, 0.2);
}
</style>
