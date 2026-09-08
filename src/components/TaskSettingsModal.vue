<script setup lang="ts">
/**
 * @file TaskSettingsModal.vue
 * @description Task-level operational settings modal (Assigned Google Sheet, internal tab, custom email signature).
 * @author Vasile Chifeac
 * @created 2026-09-08
 * @modified 2026-09-08
 *
 * @notes
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
import type { Task, TaskSettings, Workspace, LinkedGoogleResource } from "../types/models";

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
}>();

const q = useQuasar();
const taskStore = useTaskStore();

// ── State ─────────────────────────────────────────────────────────────────────
const isSaving = ref<boolean>(false);
const activeTab = ref<string>("sheet");

// Task settings state
const selectedSheetIds = ref<string[]>([]);
const primarySheetId = ref<string>("");
const selectedSheetTab = ref<string>("");
const emailSignature = ref<string>("");
const emailHeader = ref<string>("");
const syncToMasterSheet = ref<boolean>(false);

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

// ── Helpers ───────────────────────────────────────────────────────────────────
const extractIdFromUrl = (input: string): string => {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match?.[1]) return match[1];
  return trimmed;
}; /*end extractIdFromUrl*/

const syncFromTask = (): void => {
  const s = props.task.settings;

  // Initialize selected sheet IDs array (multi-select)
  if (Array.isArray(s?.selectedSheetIds) && s.selectedSheetIds.length > 0) {
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
  syncToMasterSheet.value = s?.syncToMasterSheet || false;
}; /*end syncFromTask*/

watch(
  () => props.modelValue,
  (val) => {
    if (val) syncFromTask();
  },
  { immediate: true },
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

const handleSave = async (): Promise<void> => {
  if (!props.workspace || isSaving.value) return;
  isSaving.value = true;

  try {
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
    <q-card class="task-settings-card" style="width: 720px; max-width: 95vw">
      <!-- Header (Elite Navy & Gold) -->
      <q-card-section class="task-settings-card__header row items-center q-py-md q-px-lg">
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

      <!-- Navigation Tabs -->
      <q-tabs
        v-model="activeTab"
        dense
        active-color="amber-9"
        indicator-color="amber-9"
        align="left"
        class="task-settings-card__tabs text-grey-7 bg-grey-2"
      >
        <q-tab name="sheet" icon="table_chart" label="1. Fogli Google & Schede" no-caps />
        <q-tab name="email" icon="mail" label="2. Firma & Intestazione Email" no-caps />
        <q-tab name="sync" icon="cloud_sync" label="3. Master DB & Cronologia" no-caps />
      </q-tabs>

      <q-separator />

      <!-- Tab Content -->
      <q-card-section class="q-pa-lg">
        <q-tab-panels v-model="activeTab" animated class="bg-transparent">
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

      <q-separator />

      <!-- Footer Actions -->
      <q-card-actions align="right" class="q-pa-md bg-white">
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
  border-radius: 12px;
  overflow: hidden;
  background: #f9f7f2;
}

.task-settings-card__header {
  background: #0a2342;
  border-bottom: 2px solid #c5a065;
}

.task-settings-card__tabs {
  border-bottom: 1px solid rgba(197, 160, 101, 0.2);
}

.border-gold-light {
  border: 1px solid rgba(197, 160, 101, 0.35);
}
</style>
