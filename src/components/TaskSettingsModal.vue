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
import AppFloatingWindow from "./AppFloatingWindow.vue";
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
    message: "🎯 Primary writing sheet set for this task!",
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
    newSheetNameInput.value.trim() || `Google Sheet (${cleanId.slice(0, 10)}...)`;

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
      message: `Sheet "${friendlyName}" added to Task and registered in Workspace!`,
      icon: "cloud_done",
      position: "top",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    q.notify({
      type: "negative",
      message: `Error saving sheet: ${msg}`,
      position: "top",
    });
  }
}; /*end handleAddNewSheetOnTheFly*/

const loadWorkspaceSignature = (): void => {
  if (props.workspace?.linkedResources?.defaultEmailSignature) {
    emailSignature.value = props.workspace.linkedResources.defaultEmailSignature;
    q.notify({
      type: "info",
      message: "Default Workspace signature loaded.",
      icon: "file_download",
      timeout: 1200,
    });
  } else {
    q.notify({
      type: "warning",
      message: "No default signature configured in Workspace.",
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
      message: "Task settings successfully saved!",
      icon: "verified",
      position: "top",
    });

    emit("saved");
    isOpen.value = false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    q.notify({
      type: "negative",
      message: `Error saving settings: ${msg}`,
      position: "top",
    });
  } finally {
    isSaving.value = false;
  }
}; /*end handleSave*/
</script>

<template>
  <AppFloatingWindow
    v-model="isOpen"
    :window-id="`task-settings-${task.id}`"
    title="Operational Task Settings"
    :subtitle="`Task: ${task.title}`"
    :badge-label="workspace?.name"
    badge-color="amber-9"
    icon="tune"
    icon-color="amber-5"
    :initial-width="840"
    :initial-height="660"
    :min-width="480"
    :min-height="380"
    @close="isOpen = false"
  >
    <!-- Navigation Tabs - Fixed -->
    <q-tabs
      v-model="activeTab"
      dense
      active-color="amber-9"
      indicator-color="amber-9"
      align="left"
      class="task-settings-card__tabs text-grey-7 bg-grey-2 shrink-0"
    >
      <!-- Step 21: Tab 1 — Objective & AI Prompt -->
      <q-tab name="prompt" icon="psychology" label="1. Objective &amp; AI Prompt" no-caps />
      <q-tab name="sheet" icon="table_chart" label="2. Google Sheets &amp; Tabs" no-caps />
      <q-tab name="email" icon="mail" label="3. Email Signature &amp; Header" no-caps />
      <q-tab name="sync" icon="cloud_sync" label="4. Master DB &amp; History" no-caps />
    </q-tabs>

    <q-separator class="shrink-0" />

    <!-- Tab Content - Scrollable Body -->
    <div class="col task-settings-card__body q-pa-none">
      <q-tab-panels
        v-model="activeTab"
        animated
        class="full-height task-settings-scroll-area custom-scrollbar q-pa-lg bg-transparent"
      >
        <!-- TAB 0: OBJECTIVE & AI PROMPT -->
        <q-tab-panel name="prompt" class="q-pa-none">
          <div class="text-subtitle2 text-weight-bold text-navy q-mb-xs">
            🎯 Objective &amp; AI Prompt for this Task
          </div>
          <p class="text-caption text-grey-7 q-mb-md">
            Update the title, operational category, and AI Agent prompt/objective for this active
            task. Changes take effect immediately without context loss.
          </p>

          <!-- Task Title -->
          <div class="q-mb-md">
            <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">📝 Task Title:</div>
            <q-input
              v-model="editTitle"
              outlined
              dense
              placeholder="e.g. Senior MuleSoft Integration Architect | Remote"
              :rules="[(v: string) => v.trim().length > 0 || 'Title is required']"
            >
              <template #prepend>
                <q-icon name="title" color="amber-9" />
              </template>
            </q-input>
          </div>

          <!-- Operational Category -->
          <div class="q-mb-md">
            <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
              🏷️ Operational Category:
            </div>
            <q-select
              v-model="editCategory"
              outlined
              dense
              :options="[
                { label: '⚙️ General / Operations', value: 'general' },
                { label: '🔍 Research &amp; Screening', value: 'web_search' },
                { label: '📊 Sheets Synchronization', value: 'sheet_sync' },
                { label: '✉️ Gmail Drafts', value: 'gmail_draft' },
                { label: '📄 PDF Analysis', value: 'pdf_analysis' },
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

          <!-- AI Prompt / Objective -->
          <div class="q-mb-md">
            <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
              🤖 AI Agent Prompt / Objective:
            </div>
            <q-input
              v-model="editPrompt"
              type="textarea"
              rows="7"
              outlined
              dense
              placeholder="e.g. Sourcing certified MuleSoft architects on LinkedIn and tech communities, generate personalized outreach drafts, and log contacts into the tracking sheet..."
              hint="This is the objective that the AI Agent will utilize during each task execution."
              class="q-mb-sm"
            >
              <template #prepend>
                <q-icon name="smart_toy" color="amber-9" />
              </template>
            </q-input>
          </div>

          <!-- Regenerate Subtasks -->
          <div class="q-pa-sm bg-blue-1 rounded-borders border-primary-light q-mb-xs">
            <div class="row items-center justify-between no-wrap">
              <div class="col">
                <div class="text-caption text-weight-bold text-primary">✨ Regenerate Subtasks</div>
                <div class="text-caption text-grey-7">
                  Use AgentePlanner to automatically decompose the updated prompt into operational
                  subtasks.
                </div>
              </div>
              <q-btn
                outline
                dense
                no-caps
                size="sm"
                color="primary"
                icon="auto_awesome"
                label="Regenerate"
                :loading="isReplanningSubtasks"
                class="q-ml-md"
                @click="handleTriggerRegenerate"
              >
                <q-tooltip>Re-decompose updated task with AgentePlanner</q-tooltip>
              </q-btn>
            </div>
          </div>
        </q-tab-panel>

        <!-- TAB 1: GOOGLE SHEETS (MULTI-SELECT) -->
        <q-tab-panel name="sheet" class="q-pa-none">
          <div class="text-subtitle2 text-weight-bold text-navy q-mb-xs">
            📊 Google Sheets Workfiles for this Task (Multi-select):
          </div>
          <p class="text-caption text-grey-7 q-mb-md">
            Select one or more Google Sheets to connect with this task. The AI Agent will reference
            all selected sheets and read or save data based on your instructions.
          </p>

          <!-- Available Sheets Multi-Select List -->
          <div v-if="availableWorkspaceSheets.length > 0" class="q-mb-md">
            <div class="row items-center justify-between q-mb-xs">
              <div class="text-caption text-weight-bold text-grey-8">
                Select from Workspace Library:
              </div>
              <div class="row q-gutter-xs">
                <q-btn
                  flat
                  dense
                  no-caps
                  size="xs"
                  color="primary"
                  label="Select All"
                  @click="selectAllSheets"
                />
                <span class="text-grey-4">|</span>
                <q-btn
                  flat
                  dense
                  no-caps
                  size="xs"
                  color="grey-7"
                  label="Deselect All"
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
                      label="🎯 Primary"
                      class="q-ml-sm"
                    >
                      <q-tooltip>Target sheet for default automated writes</q-tooltip>
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
                    label="Set as Primary"
                    @click.stop="setPrimarySheet(sheet.id, $event)"
                  >
                    <q-tooltip>Set this sheet as primary write target</q-tooltip>
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
                    <q-tooltip>Open in Google Sheets</q-tooltip>
                  </q-btn>
                </q-item-section>
              </q-item>
            </q-list>
          </div>
          <div v-else class="text-caption text-grey-6 italic q-mb-md">
            No Google Sheets connected to this Workspace yet. Add one below.
          </div>

          <!-- Tab / Sub-Sheet Specification -->
          <div class="q-mb-md">
            <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
              🏷️ Internal Sheet / Tab Name:
            </div>
            <q-input
              v-model="selectedSheetTab"
              outlined
              dense
              placeholder="e.g. Leads_2026, Candidates, Task_Results"
              hint="If the tab does not exist yet, it will be automatically created inside the spreadsheet upon first approval!"
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
              :label="isAddingNewSheet ? 'Close Form' : '➕ Connect a New Google Sheet on the fly'"
              @click="isAddingNewSheet = !isAddingNewSheet"
            />

            <div
              v-if="isAddingNewSheet"
              class="q-pa-md q-mt-sm bg-grey-1 rounded-borders border-gold-light"
            >
              <div class="text-caption text-weight-bold text-navy q-mb-sm">
                Add New Google Sheet (will be visible across all Workspace tasks):
              </div>
              <div class="row q-col-gutter-sm">
                <div class="col-12 col-md-5">
                  <q-input
                    v-model="newSheetNameInput"
                    outlined
                    dense
                    placeholder="Recognizable Name (e.g. Recruitment Pipeline)"
                  />
                </div>
                <div class="col-12 col-md-7">
                  <q-input
                    v-model="newSheetUrlInput"
                    outlined
                    dense
                    placeholder="Google Sheets URL or ID"
                  >
                    <template #after>
                      <q-btn
                        unelevated
                        color="positive"
                        label="Connect &amp; Save"
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
                  ⏰ Scheduled Sourcing &amp; Periodic Harvesting (04:00 AM)
                </div>
                <div class="text-caption text-grey-8">
                  Automate AgenteRicerca: pre-emptive dual-key diffing and append of new verified
                  profiles only.
                </div>
              </div>
            </div>
            <q-btn
              outline
              color="teal-9"
              icon="alarm_on"
              label="Schedule"
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
              ✍️ Corporate Signature for Email Drafts in this Task:
            </span>
            <q-btn
              outline
              dense
              no-caps
              size="xs"
              color="primary"
              icon="file_download"
              label="Load Workspace Signature"
              @click="loadWorkspaceSignature"
            />
          </div>
          <p class="text-caption text-grey-7 q-mb-md">
            This signature will be automatically included in all Gmail drafts generated by the AI
            for this task. No personal data is hardcoded in the platform.
          </p>

          <q-input
            v-model="emailSignature"
            type="textarea"
            rows="8"
            outlined
            dense
            placeholder="Enter your custom signature, e.g.:&#10;&#10;Best regards,&#10;Name / Company&#10;Tel: +1 ...&#10;Email: ..."
            class="q-mb-md"
          />

          <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
            Optional Email Header:
          </div>
          <q-input
            v-model="emailHeader"
            outlined
            dense
            placeholder="e.g. Dear Candidate / To whom it may concern,"
          />
        </q-tab-panel>

        <!-- TAB 3: MASTER DB & SYNC -->
        <q-tab-panel name="sync" class="q-pa-none">
          <div class="text-subtitle2 text-weight-bold text-navy q-mb-xs">
            📜 Master Database on Google Drive (Audit &amp; Global History)
          </div>
          <p class="text-caption text-grey-7 q-mb-md">
            The Master Database serves as a centralized log for the entire Workspace, tracking
            sessions, prompts, and task states.
          </p>

          <div
            v-if="masterSheet"
            class="q-pa-md bg-amber-1 rounded-borders q-mb-md row items-center justify-between"
          >
            <div>
              <div class="text-weight-bold text-navy">
                ⭐ Current Master Sheet: {{ masterSheet.name }}
              </div>
              <div class="text-caption text-mono text-grey-7">ID: {{ masterSheet.id }}</div>
            </div>
            <q-icon name="verified" color="amber-9" size="24px" />
          </div>
          <div v-else class="text-caption text-grey-6 italic q-mb-md">
            No Master Sheet designated in Workspace yet. Go to AI Attitude to configure it.
          </div>

          <q-toggle
            v-model="syncToMasterSheet"
            color="amber-9"
            label="Automatically log milestones and prompts of this task into the Master Sheet"
            class="text-weight-medium"
          />
        </q-tab-panel>
      </q-tab-panels>
    </div>

    <!-- Footer Actions - Fixed at Bottom -->
    <template #footer>
      <div class="row items-center justify-end q-gutter-sm">
        <q-btn flat label="Cancel" color="grey-8" no-caps @click="isOpen = false" />
        <q-btn
          unelevated
          color="amber-9"
          text-color="dark"
          icon="save"
          label="Save Task Settings"
          no-caps
          class="text-weight-bold q-px-lg"
          :loading="isSaving"
          @click="handleSave"
        />
      </div>
    </template>
  </AppFloatingWindow>
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
