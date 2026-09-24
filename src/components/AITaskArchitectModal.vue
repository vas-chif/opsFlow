/** * @file AITaskArchitectModal.vue * @description Modale AI Task Architect per la creazione rapida
di task operativi assistita da Gemini 3.6 Flash. * @author Vasile Chifeac * @created 2026-09-04 *
@modified 2026-09-04 * * @notes * - Framework DBS: trasforma un appunto grezzo in una scheda task
professionale e strutturata. * - Human-in-the-Loop: l'utente rivede, modifica e conferma prima del
salvataggio. * - Fail-safe: errore di rete non resetta il testo digitato (§3.2 piano Step 17). * -
modelVersion: "gemini-3.6-flash" inibisce il trigger onTaskCreated (Flow 03 guard). * *
@dependencies * - taskStore (refineTaskDraft, createTask, isRefiningTaskDraft) * - quasar (QDialog,
QCard, QBtn, QInput, QChip, QBadge, QSpinner, useQuasar) * - @/types/models (RefinedTaskDraft,
RefinedSubTask) * * @performance * - 1 Gemini Flash call (~500 token ≈ 0.00005 €) + 1 Firestore
write */

<script setup lang="ts">
// ── Vue & Framework ──────────────────────────────────────────────────────────
import { ref, computed, watch } from "vue";
import { useQuasar } from "quasar";

// ── Types ────────────────────────────────────────────────────────────────────
import type { RefinedTaskDraft, Task } from "@/types/models";

// ── Components ───────────────────────────────────────────────────────────────
import AppFloatingWindow from "./AppFloatingWindow.vue";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useTaskStore } from "@/stores/taskStore";

// ── Props & Emits ─────────────────────────────────────────────────────────────
const props = defineProps<{
  modelValue: boolean;
  workspaceId: string;
  /** Optional: pre-populate rawDraft (e.g. when opened from inline chip or task settings). */
  initialDraft?: string;
  /** Optional: existing task to regenerate subtasks for (in-context update mode). */
  existingTask?: Task | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "taskCreated"): void;
  (e: "taskUpdated", task: Task): void;
}>();

// ── Store & Quasar ───────────────────────────────────────────────────────────
const $q = useQuasar();
const taskStore = useTaskStore();

// ── Local State ──────────────────────────────────────────────────────────────
const rawDraft = ref("");
const refinedDraft = ref<RefinedTaskDraft | null>(null);
const isSaving = ref(false);

// Dual-Mode flag: true if regenerating an already open task
const isRegenerateMode = computed<boolean>(() => !!props.existingTask);

// Pre-populate rawDraft and fields when modal opens
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      if (props.initialDraft) {
        rawDraft.value = props.initialDraft;
      } else if (props.existingTask) {
        rawDraft.value = props.existingTask.description || props.existingTask.title || "";
      }

      if (props.existingTask) {
        editableTitle.value = props.existingTask.title || "";
        editableDescription.value = props.existingTask.description || "";
        if (props.existingTask.aiMetadata?.suggestedCategory) {
          editableCategory.value = props.existingTask.aiMetadata
            .suggestedCategory as typeof editableCategory.value;
        }
        if (
          props.existingTask.aiMetadata?.subtasks &&
          props.existingTask.aiMetadata.subtasks.length > 0
        ) {
          editableSubtasks.value = props.existingTask.aiMetadata.subtasks.map((st) => ({
            order: st.order,
            title: st.title,
            description: st.description,
            selected: true,
          }));
        }
      }
    }
  },
);

// Editable preview fields (human-in-the-loop)
const editableTitle = ref("");
const editableDescription = ref("");
const editablePriority = ref<"low" | "medium" | "high">("medium");
const editableCategory = ref<"general" | "marketing" | "research" | "admin" | "dev" | "clinical">(
  "general",
);
const editableSubtasks = ref<
  { order: number; title: string; description: string; selected: boolean }[]
>([]);

// ── Preset Templates ─────────────────────────────────────────────────────────
const presetTemplates = [
  {
    label: "📧 Docente da Email Cliente",
    text: "Buongiorno, cerchiamo con urgenza un docente senior su Camunda 8 BPMN per una formazione aziendale a Milano (o ibrido). Corso previsto fine ottobre per 3 giornate. Non abbiamo ancora budget definito né tariffa concordata: potete inviarci profili idonei?",
  },
  {
    label: "🔍 Sourcing Specialista IT",
    text: "Ricerca specialisti Oracle RAC / GoldenGate su Milano o da remoto. Seniority almeno 5 anni, esperienza architetture enterprise. Verificare disponibilità immediata e referenze.",
  },
  {
    label: "🏥 Home Visit",
    text: "Patient home visit, vital signs assessment, wound dressing, and clinical diary update.",
  },
  {
    label: "📋 Patient Follow-up",
    text: "Post-discharge patient follow-up call, verify therapy adherence, schedule home visit if needed.",
  },
  {
    label: "🧾 Invoicing",
    text: "Issue invoice for home nursing service, log into accounting software, and send receipt to patient.",
  },
];

// ── Computed ─────────────────────────────────────────────────────────────────
const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
}); /*end isOpen*/

const categoryLabels: Record<string, string> = {
  general: "General",
  marketing: "Marketing",
  research: "Research",
  admin: "Administration",
  dev: "Development",
  clinical: "🏥 Clinical",
};

const categoryLabel = computed(() => {
  return categoryLabels[editableCategory.value] ?? editableCategory.value;
}); /*end categoryLabel*/

const priorityColor = computed(() => {
  return { high: "negative", medium: "warning", low: "positive" }[editablePriority.value] ?? "grey";
}); /*end priorityColor*/

const priorityLabel = computed(() => {
  return { high: "High", medium: "Medium", low: "Low" }[editablePriority.value] ?? "";
}); /*end priorityLabel*/

function priorityChipColor(p: "low" | "medium" | "high"): string {
  return { high: "negative", medium: "warning", low: "positive" }[p];
} /*end priorityChipColor*/

// ── Methods ───────────────────────────────────────────────────────────────────

function selectTemplate(text: string): void {
  rawDraft.value = text;
} /*end selectTemplate*/

function resetModal(): void {
  rawDraft.value = "";
  refinedDraft.value = null;
  editableTitle.value = "";
  editableDescription.value = "";
  editablePriority.value = "medium";
  editableCategory.value = "general";
  editableSubtasks.value = [];
} /*end resetModal*/

async function handleRefine(): Promise<void> {
  if (!rawDraft.value.trim() || rawDraft.value.trim().length < 5) {
    $q.notify({ type: "warning", message: "Inserisci almeno 5 caratteri per descrivere il task." });
    return;
  }

  try {
    const result = await taskStore.refineTaskDraft(props.workspaceId, rawDraft.value.trim());
    refinedDraft.value = result;

    // Populate editable preview fields
    editableTitle.value = result.title;
    editableDescription.value = result.description;
    editablePriority.value = result.priority;
    editableCategory.value = result.suggestedCategory;
    editableSubtasks.value = result.subtasks.map((st) => ({ ...st, selected: true }));

    $q.notify({
      type: "positive",
      message: "Task structured by Gemini! Review and confirm.",
      icon: "auto_awesome",
    });
  } catch {
    // rawDraft.value is intentionally NOT reset (fail-safe §3.2)
    $q.notify({
      type: "negative",
      message: "Network error. Please try again or create the task manually.",
      caption: "Your entered text has been preserved.",
      icon: "wifi_off",
    });
  }
} /*end handleRefine*/

async function handleCreateTask(): Promise<void> {
  if (!editableTitle.value.trim()) {
    $q.notify({ type: "warning", message: "Task title is required." });
    return;
  }

  isSaving.value = true;
  try {
    const selectedSubtasks = editableSubtasks.value
      .filter((st) => st.selected)
      .map(({ selected: _s, ...rest }) => ({
        ...rest,
        id: `st_${rest.order}`,
        completed: false,
        createdAt: new Date() as Date | null,
      }));

    await taskStore.createTask({
      workspaceId: props.workspaceId,
      title: editableTitle.value.trim(),
      description: editableDescription.value.trim(),
      status: "pending",
      aiMetadata: {
        suggestedCategory: editableCategory.value,
        complexityScore: 6,
        confidence: 0.9,
        // Flow 03 Guard: modelVersion != "manual" → onTaskCreated is skipped
        modelVersion: "gemini-3.6-flash",
        lastAnalyzed: new Date(),
        subtasks: selectedSubtasks,
      },
    });

    $q.notify({
      type: "positive",
      message: `Task "${editableTitle.value}" created in workspace!`,
      icon: "check_circle",
    });

    emit("taskCreated");
    emit("update:modelValue", false);
    resetModal();
  } catch {
    $q.notify({ type: "negative", message: "Error creating task." });
  } finally {
    isSaving.value = false;
  }
} /*end handleCreateTask*/

async function handleUpdateExistingTask(): Promise<void> {
  if (!props.existingTask || !editableTitle.value.trim()) {
    $q.notify({ type: "warning", message: "Task title is required." });
    return;
  }

  isSaving.value = true;
  try {
    const selectedSubtasks = editableSubtasks.value
      .filter((st) => st.selected)
      .map(({ selected: _s, ...rest }) => ({
        ...rest,
        id: `st_${rest.order}`,
        completed: false,
        createdAt: new Date() as Date | null,
      }));

    const updatedAiMetadata = {
      ...props.existingTask.aiMetadata,
      suggestedCategory: editableCategory.value,
      complexityScore: props.existingTask.aiMetadata?.complexityScore ?? 6,
      confidence: 0.9,
      modelVersion: "gemini-3.6-flash",
      lastAnalyzed: new Date(),
      subtasks: selectedSubtasks,
    };

    const updates: Partial<Task> = {
      title: editableTitle.value.trim(),
      description: editableDescription.value.trim(),
      aiMetadata: updatedAiMetadata as Task["aiMetadata"],
    };

    await taskStore.updateTask(props.workspaceId, props.existingTask.id, updates);

    $q.notify({
      type: "positive",
      message: `Sotto-task del task "${editableTitle.value}" rigenerate con successo!`,
      icon: "auto_awesome",
    });

    const updatedTaskObject: Task = {
      ...props.existingTask,
      ...updates,
      aiMetadata: updatedAiMetadata as Task["aiMetadata"],
    };

    emit("taskUpdated", updatedTaskObject);
    emit("update:modelValue", false);
    resetModal();
  } catch {
    $q.notify({ type: "negative", message: "Errore durante l'aggiornamento del task." });
  } finally {
    isSaving.value = false;
  }
} /*end handleUpdateExistingTask*/

function handleClose(): void {
  emit("update:modelValue", false);
  resetModal();
} /*end handleClose*/
</script>

<template>
  <AppFloatingWindow
    :model-value="modelValue"
    window-id="ai-task-architect-modal"
    :title="
      isRegenerateMode ? '✨ AI Task Architect — Rigenera Sotto-Task' : '✨ AI Task Architect'
    "
    :subtitle="
      isRegenerateMode
        ? `Task: ${props.existingTask?.title || 'Attivo'} | Intelligent Decomposition`
        : 'Intelligent Decomposition & Operational Sheet'
    "
    icon="auto_awesome"
    icon-color="amber-5"
    :initial-width="780"
    :initial-height="660"
    :min-width="480"
    :min-height="380"
    @update:model-value="emit('update:modelValue', $event)"
    @close="handleClose"
  >
    <!-- ── Card Body Light ─────────────────────────────────────────── -->
    <div class="q-pa-md">
      <div class="text-body2 text-grey-8 q-mb-sm">
        <template v-if="isRegenerateMode">
          Verifica o adatta il prompt/obiettivo per questo task già aperto. AgentePlanner analizzerà
          la richiesta ed estrarrà la <strong>nuova Checklist di Sotto-Task</strong>
          operative senza creare task duplicati.
        </template>
        <template v-else>
          Incolla l'email o la richiesta grezza ricevuta dal cliente o fornitore (il
          <strong>COSA CERCARE / ESEGUIRE</strong>). Gemini estrarrà automaticamente il
          <strong>Titolo</strong>, la <strong>Categoria</strong>, la <strong>Priorità</strong> e la
          <strong>Checklist di Sotto-Task</strong> operative progressive.
        </template>
      </div>

      <div
        class="text-caption text-primary q-mb-md bg-blue-1 q-pa-sm rounded-borders row items-center justify-between"
      >
        <div class="row items-center q-gutter-xs">
          <q-icon :name="isRegenerateMode ? 'sync' : 'mail_outline'" color="primary" size="20px" />
          <span class="text-weight-bold">
            {{
              isRegenerateMode
                ? "Rigenerazione Contestuale del Task Aperto"
                : "Elaborazione Intelligente da Email & Testo Grezzo"
            }}
          </span>
        </div>
        <span class="text-caption text-grey-7"
          >Zero-Allucinazione: tariffe o disponibilità mancanti vengono catalogate come GAP da
          verificare.</span
        >
      </div>

      <!-- Quick Templates (solo per nuovi task) -->
      <div v-if="!isRegenerateMode" class="q-mb-md">
        <div class="text-caption text-weight-bold text-grey-7 q-mb-xs">
          Oppure seleziona un esempio rapido:
        </div>
        <div class="row q-gutter-xs">
          <q-chip
            v-for="tpl in presetTemplates"
            :key="tpl.label"
            clickable
            outline
            color="primary"
            size="sm"
            @click="selectTemplate(tpl.text)"
          >
            {{ tpl.label }}
          </q-chip>
        </div>
      </div>

      <!-- Draft Input -->
      <q-input
        v-model="rawDraft"
        type="textarea"
        rows="4"
        outlined
        dense
        :placeholder="
          isRegenerateMode
            ? 'Rivedi o adatta il prompt del task per guidare AgentePlanner nella decomposizione delle sotto-task...'
            : 'Incolla qui l\'email del cliente o l\'appunto grezzo (es. \'Buongiorno, cerchiamo con urgenza un docente Camunda a Milano per fine mese. Non abbiamo budget concordato: potete mandarci disponibilità e profili?\')...'
        "
        class="q-mb-md"
      />

      <div class="row justify-end q-mb-md">
        <q-btn
          color="primary"
          unelevated
          rounded
          icon="auto_awesome"
          :label="
            isRegenerateMode ? 'RIGENERA SOTTO-TASK CON AI' : 'GENERATE TASK STRUCTURE WITH AI'
          "
          :loading="taskStore.isRefiningTaskDraft"
          :disable="rawDraft.trim().length < 5"
          @click="handleRefine"
        />
      </div>

      <!-- FASE 2: Anteprima Scheda Task Generata -->
      <template v-if="refinedDraft">
        <q-separator class="q-my-md" />
        <div class="text-subtitle1 text-weight-bold text-navy q-mb-sm row items-center">
          <q-icon name="preview" class="q-mr-xs" color="secondary" />
          Generated Task Preview
        </div>

        <!-- Category & Priority -->
        <div class="row q-col-gutter-md q-mb-md">
          <div class="col-12 col-md-6">
            <q-card flat bordered class="q-pa-sm bg-grey-1">
              <div class="text-caption text-grey-6 text-uppercase text-weight-bold">
                Suggested Category
              </div>
              <div class="row q-gutter-xs q-mt-xs">
                <q-chip
                  v-for="cat in [
                    'general',
                    'admin',
                    'clinical',
                    'marketing',
                    'research',
                    'dev',
                  ] as const"
                  :key="cat"
                  clickable
                  :outline="editableCategory !== cat"
                  :color="editableCategory === cat ? 'primary' : 'grey-7'"
                  :text-color="editableCategory === cat ? 'white' : 'dark'"
                  size="sm"
                  @click="editableCategory = cat"
                >
                  {{ categoryLabels[cat] }}
                </q-chip>
              </div>
            </q-card>
          </div>

          <div class="col-12 col-md-6">
            <q-card flat bordered class="q-pa-sm bg-grey-1">
              <div class="text-caption text-grey-6 text-uppercase text-weight-bold">
                Priority &amp; Estimated Duration
              </div>
              <div class="row items-center justify-between q-mt-xs">
                <div class="row q-gutter-xs">
                  <q-chip
                    v-for="p in ['low', 'medium', 'high'] as const"
                    :key="p"
                    clickable
                    :outline="editablePriority !== p"
                    :color="editablePriority === p ? priorityChipColor(p) : 'grey-7'"
                    :text-color="editablePriority === p ? 'white' : 'dark'"
                    size="sm"
                    @click="editablePriority = p"
                  >
                    {{ { low: "Low", medium: "Medium", high: "High" }[p] }}
                  </q-chip>
                </div>
                <q-badge color="grey-8" text-color="white" class="q-pa-xs">
                  ⏱ {{ refinedDraft.estimatedMinutes }} min
                </q-badge>
              </div>
            </q-card>
          </div>
        </div>

        <!-- Title & Description -->
        <div class="q-mb-md">
          <div class="text-caption text-grey-7 text-weight-bold q-mb-xs">Task Title:</div>
          <q-input
            v-model="editableTitle"
            outlined
            dense
            class="q-mb-sm bg-white"
            :rules="[(v) => !!v.trim() || 'Title is required']"
          />
          <div class="text-caption text-grey-7 text-weight-bold q-mb-xs">
            Operational Description:
          </div>
          <q-input
            v-model="editableDescription"
            type="textarea"
            rows="2"
            outlined
            dense
            class="bg-white"
          />
        </div>

        <!-- Generated Subtasks Checklist -->
        <div class="q-mb-md">
          <div class="text-caption text-grey-7 text-weight-bold q-mb-xs">
            📋 Generated Operational Subtasks (select / deselect):
          </div>
          <q-list bordered dense separator class="rounded-borders bg-grey-1">
            <q-item
              v-for="st in editableSubtasks"
              :key="st.order"
              tag="label"
              v-ripple
              class="q-py-xs"
              :class="{ 'text-strike text-grey-6': !st.selected }"
            >
              <q-item-section side top>
                <q-checkbox v-model="st.selected" color="primary" dense />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-bold text-navy text-body2">
                  {{ st.order }}. {{ st.title }}
                </q-item-label>
                <q-item-label caption class="text-grey-7">
                  {{ st.description }}
                </q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </div>
      </template>
    </div>

    <!-- ── Footer Actions ─────────────────────────────────────────────── -->
    <template #footer>
      <div class="row items-center justify-end full-width q-gutter-sm">
        <q-btn flat label="Cancel" color="grey-8" no-caps @click="handleClose" />
        <q-btn
          v-if="refinedDraft"
          flat
          label="Edit Draft"
          color="primary"
          no-caps
          @click="refinedDraft = null"
        />
        <q-btn
          v-if="refinedDraft && isRegenerateMode"
          color="primary"
          unelevated
          rounded
          icon="auto_awesome"
          label="Aggiorna Sotto-Task del Task Attivo"
          no-caps
          :loading="isSaving"
          :disable="!editableTitle.trim()"
          @click="handleUpdateExistingTask"
        />
        <q-btn
          v-else-if="refinedDraft"
          color="positive"
          unelevated
          rounded
          icon="rocket_launch"
          label="Create Task in Workspace"
          no-caps
          :loading="isSaving"
          :disable="!editableTitle.trim()"
          @click="handleCreateTask"
        />
      </div>
    </template>
  </AppFloatingWindow>
</template>

<style scoped lang="scss">
.bg-navy {
  background-color: #0a2342;
}
.text-navy {
  color: #0a2342;
}
.text-gold {
  color: #c5a065;
}
.text-gold-light {
  color: #e5c898;
}
</style>
