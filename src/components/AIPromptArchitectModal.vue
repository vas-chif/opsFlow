/** * @file AIPromptArchitectModal.vue * @description Copilota no-code DBS framework per configurare
automaticamente l'Atteggiamento del Workspace. * @author Vasile Chifeac * @created 2026-08-17 *
@modified 2026-08-17 * * @notes * - Integrazione DBS: Direction (Scope/Tone), Blueprints (DO/DON'T),
Solutions (Skill Matrix) * - Invoca la Cloud Function `generateDbsAttitude` tramite l'azione Pinia
`taskStore.generateDbsAttitude` * - Stile Elite Design System con palette Royal Navy, Gold e
Off-White * * @dependencies * - taskStore (generateDbsAttitude, updateWorkspaceAttitude,
isGeneratingAttitude) * - quasar (QDialog, QCard, QInput, QBtn, QChip, QSpinner, useQuasar) * *
@performance * - Chiamata asincrona Gemini 3.5 Flash <1.5s */

<script setup lang="ts">
// ── Vue & Framework ──────────────────────────────────────────────────────────
import { ref } from "vue";
import { useQuasar } from "quasar";

// ── Types ────────────────────────────────────────────────────────────────────
import type { WorkspaceAttitude } from "@/types/models";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useTaskStore } from "@/stores/taskStore";

const props = defineProps<{
  modelValue: boolean;
  workspaceId: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "applied", attitude: WorkspaceAttitude): void;
}>();

const $q = useQuasar();
const taskStore = useTaskStore();

const userPrompt = ref("");
const generatedAttitude = ref<WorkspaceAttitude | null>(null);

const presetPromptExamples = [
  {
    label: "💇‍♀️ Hair Salon",
    prompt:
      "Appointment scheduling, hair coloring formulas, client regrowth reminders, styling product sales, and seasonal promotions.",
  },
  {
    label: "🏗️ Civil Engineering",
    prompt:
      "Bill of quantities calculation, tender specification verification, building regulation compliance, and construction site timeline management.",
  },
  {
    label: "⚖️ Law Firm",
    prompt:
      "Defense memo synthesis, court deadlines and filing schedule monitoring, out-of-court appraisal drafts, and formal client correspondence.",
  },
  {
    label: "💆‍♀️ Wellness Clinic",
    prompt:
      "Face and body treatment records, subscription package management, informed consents, periodic recall visits, and seasonal beauty offers.",
  },
];

function selectPresetPrompt(promptText: string): void {
  userPrompt.value = promptText;
} /*end selectPresetPrompt*/

async function handleGenerate(): Promise<void> {
  if (!userPrompt.value.trim()) {
    $q.notify({
      type: "warning",
      message: "Please enter a short description of your business activities.",
    });
    return;
  }

  try {
    const res = await taskStore.generateDbsAttitude(props.workspaceId, userPrompt.value.trim());
    generatedAttitude.value = res;
    $q.notify({
      type: "positive",
      message: "AI Attitude successfully generated!",
      icon: "auto_awesome",
    });
  } catch {
    $q.notify({
      type: "negative",
      message: "Error generating AI Attitude.",
    });
  }
} /*end handleGenerate*/

async function handleApply(): Promise<void> {
  if (!generatedAttitude.value) return;

  try {
    await taskStore.updateWorkspaceAttitude(props.workspaceId, generatedAttitude.value);
    $q.notify({
      type: "positive",
      message: "Attitude successfully applied to Workspace!",
      icon: "check_circle",
    });
    emit("applied", generatedAttitude.value);
    emit("update:modelValue", false);
  } catch {
    $q.notify({
      type: "negative",
      message: "Errore durante l'applicazione dell'Atteggiamento.",
    });
  }
} /*end handleApply*/

function handleClose(): void {
  emit("update:modelValue", false);
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
      <!-- Header -->
      <q-card-section class="bg-navy text-white row items-center justify-between">
        <div class="row items-center q-gutter-sm">
          <q-icon name="auto_awesome" color="gold" size="28px" />
          <div>
            <div class="text-h6 text-weight-bold">✨ AI Prompt Architect</div>
            <div class="text-caption text-gold-light">
              No-Code Attitude &amp; Skill Matrix Configurator (DBS Framework)
            </div>
          </div>
        </div>
        <q-btn flat round dense icon="close" color="white" @click="handleClose" />
      </q-card-section>

      <q-card-section class="q-pa-md">
        <div class="text-body2 text-grey-8 q-mb-md">
          Describe in your own words what you do in your business. Gemini will automatically extract
          the <strong>Industry</strong>, <strong>Tone</strong>, <strong>Skill Matrix</strong>, and
          strict <strong>DO / DON'T</strong> anti-hallucination rules.
        </div>

        <!-- Quick Examples -->
        <div class="q-mb-md">
          <div class="text-caption text-weight-bold text-grey-7 q-mb-xs">
            Or select a quick example:
          </div>
          <div class="row q-gutter-xs">
            <q-chip
              v-for="example in presetPromptExamples"
              :key="example.label"
              clickable
              outline
              color="primary"
              size="sm"
              @click="selectPresetPrompt(example.prompt)"
            >
              {{ example.label }}
            </q-chip>
          </div>
        </div>

        <!-- Textarea input -->
        <q-input
          v-model="userPrompt"
          type="textarea"
          rows="3"
          outlined
          dense
          placeholder="e.g. 'I run a fitness gym. I handle workout cards, membership renewals, reminders, and seasonal promotions...'"
          class="q-mb-md"
        />

        <div class="row justify-end q-mb-lg">
          <q-btn
            color="primary"
            unelevated
            rounded
            icon="auto_awesome"
            label="Generate DBS Attitude"
            :loading="taskStore.isGeneratingAttitude"
            @click="handleGenerate"
          />
        </div>

        <!-- Generated Preview Section -->
        <template v-if="generatedAttitude">
          <q-separator class="q-my-md" />
          <div class="text-subtitle1 text-weight-bold text-navy q-mb-sm row items-center">
            <q-icon name="preview" class="q-mr-xs" color="secondary" />
            Generated Constitution Preview
          </div>

          <div class="row q-col-gutter-md q-mb-md">
            <!-- Sector & Tone -->
            <div class="col-12 col-md-6">
              <q-card flat bordered class="q-pa-sm bg-grey-1">
                <div class="text-caption text-grey-6 text-uppercase text-weight-bold">
                  Domain / Sector
                </div>
                <div class="text-body1 text-weight-bold text-navy">
                  {{ generatedAttitude.industryScope }}
                </div>
              </q-card>
            </div>
            <div class="col-12 col-md-6">
              <q-card flat bordered class="q-pa-sm bg-grey-1">
                <div class="text-caption text-grey-6 text-uppercase text-weight-bold">
                  Recommended Tone
                </div>
                <div class="text-body1 text-weight-bold text-secondary">
                  {{ generatedAttitude.tone }}
                </div>
              </q-card>
            </div>
          </div>

          <!-- Skill Matrix -->
          <div class="q-mb-md">
            <div class="text-caption text-grey-7 text-weight-bold q-mb-xs">
              🧠 Extracted Skill Matrix:
            </div>
            <div class="row q-gutter-xs">
              <q-chip
                v-for="skill in generatedAttitude.skills"
                :key="skill"
                color="secondary"
                text-color="white"
                size="sm"
                icon="psychology"
              >
                {{ skill }}
              </q-chip>
            </div>
          </div>

          <!-- DO & DON'T Rules -->
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-md-6">
              <div class="text-caption text-positive text-weight-bold q-mb-xs">
                ✅ Binding Rules (DO):
              </div>
              <q-list bordered dense separator class="rounded-borders bg-green-1">
                <q-item v-for="item in generatedAttitude.rules.doList" :key="item">
                  <q-item-section avatar min-width="24px">
                    <q-icon name="check_circle" color="positive" size="xs" />
                  </q-item-section>
                  <q-item-section class="text-caption">{{ item }}</q-item-section>
                </q-item>
              </q-list>
            </div>

            <div class="col-12 col-md-6">
              <div class="text-caption text-negative text-weight-bold q-mb-xs">
                🚫 Strict Restrictions (DON'T):
              </div>
              <q-list bordered dense separator class="rounded-borders bg-red-1">
                <q-item v-for="item in generatedAttitude.rules.dontList" :key="item">
                  <q-item-section avatar min-width="24px">
                    <q-icon name="cancel" color="negative" size="xs" />
                  </q-item-section>
                  <q-item-section class="text-caption">{{ item }}</q-item-section>
                </q-item>
              </q-list>
            </div>
          </div>
        </template>
      </q-card-section>

      <!-- Actions -->
      <q-card-actions align="right" class="bg-grey-2 q-pa-md">
        <q-btn flat label="Cancel" color="grey-8" @click="handleClose" />
        <q-btn
          v-if="generatedAttitude"
          color="positive"
          unelevated
          rounded
          icon="rocket_launch"
          label="Apply to AI Attitude"
          :loading="taskStore.isLoading"
          @click="handleApply"
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
