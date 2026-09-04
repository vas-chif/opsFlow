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
import type { RefinedTaskDraft } from "@/types/models";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useTaskStore } from "@/stores/taskStore";

// ── Props & Emits ─────────────────────────────────────────────────────────────
const props = defineProps<{
  modelValue: boolean;
  workspaceId: string;
  /** Optional: pre-populate rawDraft (e.g. when opened from inline chip). */
  initialDraft?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "taskCreated"): void;
}>();

// ── Store & Quasar ───────────────────────────────────────────────────────────
const $q = useQuasar();
const taskStore = useTaskStore();

// ── Local State ──────────────────────────────────────────────────────────────
const rawDraft = ref("");
const refinedDraft = ref<RefinedTaskDraft | null>(null);
const isSaving = ref(false);

// Pre-populate rawDraft when modal opens with initialDraft prop (§4.2 chip inline)
watch(
  () => props.modelValue,
  (open) => {
    if (open && props.initialDraft) {
      rawDraft.value = props.initialDraft;
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
    label: "🏥 Visita Domiciliare",
    text: "Visita paziente a domicilio, valutazione parametri vitali, medicazione e aggiornamento diario clinico.",
  },
  {
    label: "📋 Follow-up Paziente",
    text: "Chiamata di follow-up paziente post-dimissione, verifica aderenza terapia, eventuale richiesta visita.",
  },
  {
    label: "🧾 Fatturazione",
    text: "Emettere fattura per prestazione infermieristica domiciliare, registrare nel gestionale e inviare al paziente.",
  },
  {
    label: "💊 Somministrazione Terapia",
    text: "Somministrazione terapia endovenosa, preparazione farmaci, monitoraggio reazione e documentazione.",
  },
];

// ── Computed ─────────────────────────────────────────────────────────────────
const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
}); /*end isOpen*/

const categoryLabel = computed(() => {
  const map: Record<string, string> = {
    general: "Generale",
    marketing: "Marketing",
    research: "Ricerca",
    admin: "Amministrazione",
    dev: "Sviluppo",
    clinical: "Sanitario / Clinico",
  };
  return map[editableCategory.value] ?? editableCategory.value;
}); /*end categoryLabel*/

const priorityColor = computed(() => {
  return { high: "negative", medium: "warning", low: "positive" }[editablePriority.value] ?? "grey";
}); /*end priorityColor*/

const priorityLabel = computed(() => {
  return { high: "Alta", medium: "Media", low: "Bassa" }[editablePriority.value] ?? "";
}); /*end priorityLabel*/

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
      message: "Task strutturato da Gemini! Rivedi e conferma.",
      icon: "auto_awesome",
    });
  } catch {
    // rawDraft.value is intentionally NOT reset (fail-safe §3.2)
    $q.notify({
      type: "negative",
      message: "Errore di rete. Riprova o crea il task manualmente.",
      caption: "Il testo inserito è stato preservato.",
      icon: "wifi_off",
    });
  }
} /*end handleRefine*/

async function handleCreateTask(): Promise<void> {
  if (!editableTitle.value.trim()) {
    $q.notify({ type: "warning", message: "Il titolo del task è obbligatorio." });
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
      message: `Task "${editableTitle.value}" creato nel workspace!`,
      icon: "check_circle",
    });

    emit("taskCreated");
    isOpen.value = false;
    resetModal();
  } catch {
    $q.notify({ type: "negative", message: "Errore durante la creazione del task." });
  } finally {
    isSaving.value = false;
  }
} /*end handleCreateTask*/

function handleClose(): void {
  isOpen.value = false;
  resetModal();
} /*end handleClose*/
</script>

<template>
  <q-dialog
    v-model="isOpen"
    persistent
    maximized
    transition-show="slide-up"
    transition-hide="slide-down"
  >
    <q-card class="ai-architect-modal">
      <!-- ── Header ───────────────────────────────────────────────────── -->
      <div class="architect-header q-pa-lg">
        <div class="row items-center justify-between">
          <div class="row items-center gap-md">
            <div class="architect-icon">
              <q-icon name="auto_awesome" size="28px" color="gold" />
            </div>
            <div>
              <div class="architect-title">AI Task Architect</div>
              <div class="architect-subtitle">
                Trasforma un appunto in un task operativo strutturato
              </div>
            </div>
          </div>
          <q-btn flat round icon="close" color="white" size="md" @click="handleClose" />
        </div>
      </div>

      <q-separator color="gold" style="opacity: 0.3" />

      <q-card-section class="architect-body scroll">
        <!-- ── FASE 1: Input appunto grezzo ───────────────────────────── -->
        <div v-if="!refinedDraft" class="input-phase">
          <!-- Preset Templates -->
          <div class="section-label q-mb-md">Modelli Rapidi</div>
          <div class="row q-gutter-sm q-mb-lg">
            <q-chip
              v-for="tpl in presetTemplates"
              :key="tpl.label"
              clickable
              outline
              color="gold"
              text-color="gold"
              class="preset-chip"
              @click="selectTemplate(tpl.text)"
            >
              {{ tpl.label }}
            </q-chip>
          </div>

          <!-- Raw Draft Input -->
          <div class="section-label q-mb-sm">Descrivi il tuo task (anche informalmente)</div>
          <q-input
            v-model="rawDraft"
            outlined
            autogrow
            type="textarea"
            placeholder="es. medicazione paziente a Forte dei Marmi martedì mattina, verificare bende sterili e mandare fattura…"
            :rows="4"
            class="draft-input q-mb-md"
            dark
            color="gold"
            label-color="gold"
            :hint="`${rawDraft.length} caratteri · min 5 richiesti`"
          />

          <!-- CTA Refine Button -->
          <q-btn
            class="refine-btn full-width q-py-sm"
            :loading="taskStore.isRefiningTaskDraft"
            :disable="rawDraft.trim().length < 5"
            icon="auto_awesome"
            label="✨ Genera Struttura Task con IA"
            no-caps
            size="lg"
            @click="handleRefine"
          >
            <template #loading>
              <q-spinner-dots color="white" size="24px" />
              <span class="q-ml-sm">Gemini sta analizzando…</span>
            </template>
          </q-btn>
        </div>

        <!-- ── FASE 2: Anteprima Interattiva ──────────────────────────── -->
        <div v-else class="preview-phase">
          <!-- Back button -->
          <q-btn
            flat
            icon="arrow_back"
            label="Modifica appunto"
            color="gold"
            no-caps
            class="q-mb-lg"
            @click="refinedDraft = null"
          />

          <!-- Preview Card -->
          <div class="preview-card q-pa-lg q-mb-lg">
            <!-- Category + Priority + Time -->
            <div class="row items-center q-gutter-sm q-mb-md">
              <q-chip
                :label="categoryLabel"
                color="primary"
                text-color="white"
                icon="category"
                dense
              />
              <q-chip
                :label="priorityLabel"
                :color="priorityColor"
                text-color="white"
                icon="flag"
                dense
              />
              <q-chip
                :label="`⏱ ${refinedDraft.estimatedMinutes} min`"
                color="grey-8"
                text-color="white"
                dense
              />
            </div>

            <!-- Editable Title -->
            <div class="section-label q-mb-xs">Titolo</div>
            <q-input
              v-model="editableTitle"
              outlined
              dense
              dark
              color="gold"
              class="q-mb-md"
              :rules="[(v) => !!v.trim() || 'Titolo obbligatorio']"
            />

            <!-- Editable Description -->
            <div class="section-label q-mb-xs">Descrizione</div>
            <q-input
              v-model="editableDescription"
              outlined
              autogrow
              dark
              color="gold"
              type="textarea"
              :rows="3"
              class="q-mb-lg"
            />

            <!-- Priority selector -->
            <div class="section-label q-mb-xs">Priorità</div>
            <div class="row q-gutter-sm q-mb-lg">
              <q-chip
                v-for="p in ['low', 'medium', 'high'] as const"
                :key="p"
                clickable
                :selected="editablePriority === p"
                :color="editablePriority === p ? priorityColor : 'grey-8'"
                text-color="white"
                class="priority-chip"
                @click="editablePriority = p"
              >
                {{ { low: "Bassa", medium: "Media", high: "Alta" }[p] }}
              </q-chip>
            </div>

            <!-- Category selector -->
            <div class="section-label q-mb-xs">Categoria</div>
            <div class="row q-gutter-sm q-mb-lg flex-wrap">
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
                :selected="editableCategory === cat"
                :color="editableCategory === cat ? 'primary' : 'grey-8'"
                text-color="white"
                class="category-chip"
                @click="editableCategory = cat"
              >
                {{
                  {
                    general: "Generale",
                    admin: "Admin",
                    clinical: "🏥 Sanitario",
                    marketing: "Marketing",
                    research: "Ricerca",
                    dev: "Dev",
                  }[cat]
                }}
              </q-chip>
            </div>

            <!-- Subtasks Checklist -->
            <div class="section-label q-mb-md">Sotto-Task (deseleziona per escludere)</div>
            <div class="subtasks-list">
              <div
                v-for="st in editableSubtasks"
                :key="st.order"
                class="subtask-item q-pa-md q-mb-sm"
                :class="{ 'subtask-disabled': !st.selected }"
              >
                <div class="row items-start gap-md">
                  <q-checkbox v-model="st.selected" color="gold" />
                  <div class="col">
                    <div class="subtask-title">{{ st.order }}. {{ st.title }}</div>
                    <div class="subtask-desc">{{ st.description }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Confirm CTA -->
          <q-btn
            class="confirm-btn full-width q-py-sm"
            :loading="isSaving"
            :disable="!editableTitle.trim()"
            icon="check_circle"
            label="Crea Task nel Workspace"
            no-caps
            size="lg"
            @click="handleCreateTask"
          >
            <template #loading>
              <q-spinner-oval color="white" size="24px" />
              <span class="q-ml-sm">Salvataggio in corso…</span>
            </template>
          </q-btn>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
// ── Design System Elite: Royal Navy + Gold + Off-White ────────────────────────
$navy: #0a2342;
$gold: #c5a065;
$off-white: #f9f7f2;

.ai-architect-modal {
  background: linear-gradient(160deg, #0d2b4e 0%, $navy 50%, #071830 100%);
  color: $off-white;
  display: flex;
  flex-direction: column;
  height: 100dvh;
}

.architect-header {
  background: linear-gradient(90deg, rgba($gold, 0.12) 0%, transparent 100%);
  border-bottom: 1px solid rgba($gold, 0.2);
}

.architect-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: rgba($gold, 0.15);
  border: 1px solid rgba($gold, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.architect-title {
  font-family: "Playfair Display", Georgia, serif;
  font-size: 1.4rem;
  font-weight: 700;
  color: $off-white;
  letter-spacing: 0.02em;
}

.architect-subtitle {
  font-family: "Mulish", sans-serif;
  font-size: 0.82rem;
  color: rgba($gold, 0.8);
  margin-top: 2px;
}

.architect-body {
  flex: 1;
  padding: 32px;
  max-width: 720px;
  margin: 0 auto;
  width: 100%;
}

.section-label {
  font-family: "Mulish", sans-serif;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba($gold, 0.7);
}

.preset-chip {
  border-color: rgba($gold, 0.4) !important;
  transition: all 0.2s ease;

  &:hover {
    background: rgba($gold, 0.12) !important;
    transform: translateY(-1px);
  }
}

.draft-input {
  :deep(.q-field__control) {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba($gold, 0.3);
    border-radius: 12px;
    font-family: "Mulish", sans-serif;
    font-size: 0.95rem;
    color: $off-white;
    transition: border-color 0.2s;

    &:hover {
      border-color: rgba($gold, 0.5);
    }
  }

  :deep(.q-field__hint) {
    color: rgba($off-white, 0.4);
    font-size: 0.75rem;
  }
}

.refine-btn {
  background: linear-gradient(135deg, $gold 0%, darken($gold, 15%) 100%);
  color: $navy;
  font-family: "Mulish", sans-serif;
  font-weight: 700;
  border-radius: 12px;
  letter-spacing: 0.03em;
  box-shadow: 0 4px 20px rgba($gold, 0.3);
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 30px rgba($gold, 0.4);
  }

  &:disabled {
    opacity: 0.4;
  }
}

.preview-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba($gold, 0.2);
  border-radius: 16px;
  backdrop-filter: blur(12px);
}

.priority-chip,
.category-chip {
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: "Mulish", sans-serif;
  font-size: 0.8rem;

  &:hover {
    transform: translateY(-1px);
  }
}

.subtasks-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.subtask-item {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba($gold, 0.15);
  border-radius: 10px;
  transition: all 0.2s ease;

  &:hover {
    border-color: rgba($gold, 0.3);
    background: rgba($gold, 0.06);
  }

  &.subtask-disabled {
    opacity: 0.4;
    text-decoration: line-through;
  }
}

.subtask-title {
  font-family: "Mulish", sans-serif;
  font-weight: 700;
  font-size: 0.9rem;
  color: $off-white;
  margin-bottom: 2px;
}

.subtask-desc {
  font-family: "Mulish", sans-serif;
  font-size: 0.8rem;
  color: rgba($off-white, 0.6);
  line-height: 1.4;
}

.confirm-btn {
  background: linear-gradient(135deg, #1a6b3c 0%, #0d4a28 100%);
  color: #fff;
  font-family: "Mulish", sans-serif;
  font-weight: 700;
  border-radius: 12px;
  letter-spacing: 0.03em;
  box-shadow: 0 4px 20px rgba(26, 107, 60, 0.4);
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 30px rgba(26, 107, 60, 0.5);
  }
}

.gap-md {
  gap: 12px;
}
</style>
