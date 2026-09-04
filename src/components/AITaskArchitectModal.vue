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

const categoryLabels: Record<string, string> = {
  general: "Generale",
  marketing: "Marketing",
  research: "Ricerca",
  admin: "Amministrazione",
  dev: "Sviluppo",
  clinical: "🏥 Sanitario",
};

const categoryLabel = computed(() => {
  return categoryLabels[editableCategory.value] ?? editableCategory.value;
}); /*end categoryLabel*/

const priorityColor = computed(() => {
  return { high: "negative", medium: "warning", low: "positive" }[editablePriority.value] ?? "grey";
}); /*end priorityColor*/

const priorityLabel = computed(() => {
  return { high: "Alta", medium: "Media", low: "Bassa" }[editablePriority.value] ?? "";
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
    emit("update:modelValue", false);
    resetModal();
  } catch {
    $q.notify({ type: "negative", message: "Errore durante la creazione del task." });
  } finally {
    isSaving.value = false;
  }
} /*end handleCreateTask*/

function handleClose(): void {
  emit("update:modelValue", false);
  resetModal();
} /*end handleClose*/
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    persistent
    maximized-mobile
    transition-show="scale"
    transition-hide="scale"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <q-card class="dbs-modal-card" style="width: 720px; max-width: 95vw">
      <!-- ── Header Royal Navy ─────────────────────────────────────────── -->
      <q-card-section class="bg-navy text-white row items-center justify-between">
        <div class="row items-center q-gutter-sm">
          <q-icon name="auto_awesome" color="gold" size="28px" />
          <div>
            <div class="text-h6 text-weight-bold">✨ AI Task Architect</div>
            <div class="text-caption text-gold-light">
              Scomposizione Intelligente & Scheda Operativa (Gemini 3.6 Flash)
            </div>
          </div>
        </div>
        <q-btn flat round dense icon="close" color="white" @click="handleClose" />
      </q-card-section>

      <!-- ── Card Body Chiaro ─────────────────────────────────────────── -->
      <q-card-section class="q-pa-md">
        <div class="text-body2 text-grey-8 q-mb-md">
          Descrivi con parole tue il task da svolgere (anche un appunto veloce o informale). Gemini
          estrarrà automaticamente il <strong>Titolo</strong>, la <strong>Categoria</strong>, la
          <strong>Priorità</strong> e la <strong>Checklist di sotto-task</strong> operative in base
          alla Costituzione del tuo Workspace.
        </div>

        <!-- Modelli Rapidi -->
        <div class="q-mb-md">
          <div class="text-caption text-weight-bold text-grey-7 q-mb-xs">
            Oppure seleziona un modello veloce:
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

        <!-- Input Appunto -->
        <q-input
          v-model="rawDraft"
          type="textarea"
          rows="3"
          outlined
          dense
          placeholder="Es: 'medicazione paziente a Forte dei Marmi martedì mattina, verificare bende sterili e mandare fattura...'"
          class="q-mb-md"
        />

        <div class="row justify-end q-mb-md">
          <q-btn
            color="primary"
            unelevated
            rounded
            icon="auto_awesome"
            label="GENERA STRUTTURA TASK CON IA"
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
            Anteprima Scheda Task Generata
          </div>

          <!-- Categoria & Priorità -->
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-md-6">
              <q-card flat bordered class="q-pa-sm bg-grey-1">
                <div class="text-caption text-grey-6 text-uppercase text-weight-bold">
                  Categoria Suggerita
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
                  Priorità & Stima Durata
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
                      {{ { low: "Bassa", medium: "Media", high: "Alta" }[p] }}
                    </q-chip>
                  </div>
                  <q-badge color="grey-8" text-color="white" class="q-pa-xs">
                    ⏱ {{ refinedDraft.estimatedMinutes }} min
                  </q-badge>
                </div>
              </q-card>
            </div>
          </div>

          <!-- Titolo & Descrizione -->
          <div class="q-mb-md">
            <div class="text-caption text-grey-7 text-weight-bold q-mb-xs">Titolo Task:</div>
            <q-input
              v-model="editableTitle"
              outlined
              dense
              class="q-mb-sm bg-white"
              :rules="[(v) => !!v.trim() || 'Il titolo è obbligatorio']"
            />
            <div class="text-caption text-grey-7 text-weight-bold q-mb-xs">
              Descrizione Operativa:
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

          <!-- Checklist Sotto-task -->
          <div class="q-mb-md">
            <div class="text-caption text-grey-7 text-weight-bold q-mb-xs">
              📋 Sotto-task Operative Generate (seleziona / deseleziona):
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
      </q-card-section>

      <!-- ── Footer Azioni ─────────────────────────────────────────────── -->
      <q-card-actions align="right" class="bg-grey-2 q-pa-md">
        <q-btn flat label="Annulla" color="grey-8" @click="handleClose" />
        <q-btn
          v-if="refinedDraft"
          flat
          label="Modifica Appunto"
          color="primary"
          @click="refinedDraft = null"
        />
        <q-btn
          v-if="refinedDraft"
          color="positive"
          unelevated
          rounded
          icon="rocket_launch"
          label="Crea Task nel Workspace"
          :loading="isSaving"
          :disable="!editableTitle.trim()"
          @click="handleCreateTask"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
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
