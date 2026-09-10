<script setup lang="ts">
/**
 * @file ScheduleTaskModal.vue
 * @description Modal for creating and managing Scheduled Sourcing Jobs (Step 19).
 * @author Vasile Chifeac
 * @created 2026-09-10
 * @modified 2026-09-10
 *
 * @notes
 * - Allows users to schedule recurring AgenteRicerca sourcing jobs (daily/weekly/custom).
 * - Writes ScheduledSourcingJob to Firestore: tenants/{tenantId}/workspaces/{workspaceId}/scheduledJobs/{jobId}
 * - Dual-Key dedup config (URL column + Name column) is set here and used by the Dispatcher.
 * - Design System "Elite": Royal Navy #0a2342, Gold #c5a065, Off-White #f9f7f2.
 * - GDPR Art. 5: endDate is mandatory — prevents indefinite crawling.
 *
 * @dependencies
 * - firebase-admin/firestore (via Firebase client SDK)
 * - Pinia useAuthStore for tenantId/workspaceId
 * - ScheduledSourcingJob type from src/types/models.ts
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { computed, ref, watch } from "vue";
import { useQuasar } from "quasar";

// ── Firebase ─────────────────────────────────────────────────────────────────
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

// ── Types ─────────────────────────────────────────────────────────────────────
import type {
  ScheduledSourcingJob,
  ScheduledJobFrequency,
  SheetUpdateMode,
  Task,
  Workspace,
  LinkedGoogleResource,
} from "../types/models";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useAuthStore } from "../stores/authStore";

// ── Props & Emits ─────────────────────────────────────────────────────────────
const props = defineProps<{
  modelValue: boolean;
  task: Task;
  workspace?: Workspace | null;
  /** Existing active job for this task (if any) — to allow edit/pause/delete */
  existingJob?: ScheduledSourcingJob | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
  (e: "saved", job: ScheduledSourcingJob): void;
  (e: "deleted"): void;
}>();

const q = useQuasar();
const authStore = useAuthStore();

// ── State ─────────────────────────────────────────────────────────────────────
const isSaving = ref<boolean>(false);
const isDeleting = ref<boolean>(false);

// Job configuration
const jobTitle = ref<string>("");
const selectedFrequency = ref<ScheduledJobFrequency>("daily_04am");
const endDate = ref<string>(""); // YYYY/MM/DD format for q-date
const updateMode = ref<SheetUpdateMode>("append_new");
const autoStyleSheet = ref<boolean>(true);
const searchQuery = ref<string>("");
const promptTemplate = ref<string>("");

// Sheet target
const selectedSheetId = ref<string>("");
const selectedSheetName = ref<string>("");
const selectedSheetTab = ref<string>("Foglio1");
const dedupUrlColumnIndex = ref<number>(7); // Default col H (Fonte / Profilo Pubblico)
const dedupNameColumnIndex = ref<number>(1); // Default col B (Nome e Cognome)

// ── Constants ─────────────────────────────────────────────────────────────────
const FREQUENCY_OPTIONS: {
  label: string;
  value: ScheduledJobFrequency;
  icon: string;
  desc: string;
}[] = [
  {
    label: "Giornaliero alle 04:00",
    value: "daily_04am",
    icon: "schedule",
    desc: "Ogni giorno alle 04:00 (Europe/Rome)",
  },
  {
    label: "Settimanale (Lun 04:00)",
    value: "weekly_mon_04am",
    icon: "view_week",
    desc: "Ogni lunedì alle 04:00 (Europe/Rome)",
  },
  {
    label: "Personalizzato (cron)",
    value: "custom_cron",
    icon: "terminal",
    desc: "Definisci una cron expression personalizzata",
  },
];

const FREQUENCY_TO_CRON: Record<ScheduledJobFrequency, string> = {
  daily_04am: "0 4 * * *",
  weekly_mon_04am: "0 4 * * 1",
  custom_cron: "0 4 * * *",
};

const UPDATE_MODE_OPTIONS = [
  {
    label: "Aggiungi solo nuovi",
    value: "append_new" as SheetUpdateMode,
    desc: "Non sovrascrive le righe esistenti — appende solo i profili mai visti prima (deduplicazione doppia chiave)",
    icon: "add_circle",
  },
  {
    label: "Ricalcola graduatoria",
    value: "re_rank_all" as SheetUpdateMode,
    desc: "Unisce esistenti + nuovi, riordina per Match Score decrescente",
    icon: "sort",
  },
];

// ── Computed ──────────────────────────────────────────────────────────────────
const isOpen = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit("update:modelValue", val),
}); /*end isOpen*/

const isEditMode = computed(() => !!props.existingJob); /*end isEditMode*/

const availableSheets = computed((): LinkedGoogleResource[] => {
  return (props.workspace?.linkedResources?.linkedSheets || []).filter(
    (r: LinkedGoogleResource) => r.type === "sheet",
  );
}); /*end availableSheets*/

const selectedSheetDisplay = computed(() => {
  if (!selectedSheetId.value) return null;
  return availableSheets.value.find((s) => s.id === selectedSheetId.value) ?? null;
}); /*end selectedSheetDisplay*/

const endDateFormatted = computed(() => {
  if (!endDate.value) return "";
  // Convert YYYY/MM/DD → DD/MM/YYYY for display
  const parts = endDate.value.split("/");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return endDate.value;
}); /*end endDateFormatted*/

/** Default end date: December 31 of current year */
const defaultEndDate = computed(() => {
  const year = new Date().getFullYear();
  return `${year}/12/31`;
}); /*end defaultEndDate*/

const minEndDate = computed(() => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10).replace(/-/g, "/");
}); /*end minEndDate*/

const canSave = computed(
  () =>
    jobTitle.value.trim().length > 0 &&
    selectedSheetId.value.length > 0 &&
    endDate.value.length > 0 &&
    searchQuery.value.trim().length > 0,
); /*end canSave*/

// ── Watchers ──────────────────────────────────────────────────────────────────
watch(
  () => props.modelValue,
  (open) => {
    if (open) initializeForm();
  },
); /*end watch modelValue*/

watch(selectedSheetId, (id) => {
  const sheet = availableSheets.value.find((s) => s.id === id);
  if (sheet) selectedSheetName.value = sheet.name;
}); /*end watch selectedSheetId*/

// ── Methods ───────────────────────────────────────────────────────────────────
function initializeForm(): void {
  if (props.existingJob) {
    // Edit mode — populate from existing job
    const j = props.existingJob;
    jobTitle.value = j.title;
    selectedFrequency.value = j.frequency;
    // Convert ISO date to YYYY/MM/DD for q-date
    endDate.value = j.endDate.slice(0, 10).replace(/-/g, "/");
    updateMode.value = j.searchConfig.updateMode;
    autoStyleSheet.value = j.searchConfig.autoStyleSheet;
    searchQuery.value = j.searchConfig.searchQuery;
    promptTemplate.value = j.searchConfig.promptTemplate;
    selectedSheetId.value = j.targetResource.spreadsheetId;
    selectedSheetName.value = j.targetResource.sheetName;
    selectedSheetTab.value = j.targetResource.sheetName;
    dedupUrlColumnIndex.value = j.targetResource.dedupUrlColumnIndex;
    dedupNameColumnIndex.value = j.targetResource.dedupNameColumnIndex;
  } else {
    // Create mode — reset to defaults
    jobTitle.value = props.task.title ? `Monitoraggio: ${props.task.title}` : "";
    selectedFrequency.value = "daily_04am";
    endDate.value = defaultEndDate.value;
    updateMode.value = "append_new";
    autoStyleSheet.value = true;
    searchQuery.value = "";
    promptTemplate.value =
      "Cerca professionisti corrispondenti al profilo richiesto. " +
      "Per ciascun candidato, valuta il match con il profilo ICP, " +
      "identifica le competenze combacianti e i gap critici. " +
      "Assegna un Match Score da 0 a 100 basato sull'aderenza al profilo cercato.";
    selectedSheetId.value = "";
    selectedSheetName.value = "";
    selectedSheetTab.value = "Candidati";
    dedupUrlColumnIndex.value = 7;
    dedupNameColumnIndex.value = 1;
  }
} /*end initializeForm*/

async function handleSave(): Promise<void> {
  if (!canSave.value || isSaving.value) return;

  const tenantId = authStore.tenantId;
  const workspaceId = props.task.workspaceId || "main";
  const taskId = props.task.id;

  if (!tenantId) {
    q.notify({ type: "negative", message: "Sessione scaduta — rieffettua il login." });
    return;
  }

  isSaving.value = true;

  try {
    const db = getFirestore();
    const jobId =
      props.existingJob?.id ?? `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Convert YYYY/MM/DD → ISO 8601
    const endDateIso = endDate.value.replace(/\//g, "-") + "T23:59:59.999Z";

    const jobData: Omit<ScheduledSourcingJob, "id"> = {
      tenantId,
      workspaceId,
      taskId,
      title: jobTitle.value.trim(),
      status: "active",

      frequency: selectedFrequency.value,
      cronExpression: FREQUENCY_TO_CRON[selectedFrequency.value],
      timeZone: "Europe/Rome",
      startDate: new Date().toISOString(),
      endDate: endDateIso,

      targetResource: {
        type: "google_sheet",
        spreadsheetId: selectedSheetId.value,
        sheetName: selectedSheetTab.value || selectedSheetName.value,
        dedupUrlColumnIndex: dedupUrlColumnIndex.value,
        dedupNameColumnIndex: dedupNameColumnIndex.value,
        dedupColumnHeader: "Fonte / Profilo Pubblico",
      },

      searchConfig: {
        promptTemplate: promptTemplate.value.trim(),
        searchQuery: searchQuery.value.trim(),
        updateMode: updateMode.value,
        autoStyleSheet: autoStyleSheet.value,
      },

      isLocked: false,
      lastRunAt: undefined,
      nextRunAt: undefined,
      resultsHistory: [],
    };

    const jobRef = doc(db, `tenants/${tenantId}/workspaces/${workspaceId}/scheduledJobs/${jobId}`);

    await setDoc(jobRef, { ...jobData, id: jobId }, { merge: true });

    q.notify({
      type: "positive",
      icon: "schedule",
      message: `✅ Ricerca programmata "${jobData.title}" salvata con successo!`,
      caption: `Frequenza: ${FREQUENCY_OPTIONS.find((f) => f.value === selectedFrequency.value)?.label}`,
      timeout: 4000,
    });

    emit("saved", { ...jobData, id: jobId });
    isOpen.value = false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    q.notify({ type: "negative", message: `Errore nel salvataggio: ${msg}` });
  } finally {
    isSaving.value = false;
  }
} /*end handleSave*/

async function handleTogglePause(): Promise<void> {
  if (!props.existingJob) return;
  const tenantId = authStore.tenantId;
  if (!tenantId) return;

  const db = getFirestore();
  const j = props.existingJob;
  const newStatus = j.status === "active" ? "paused" : "active";

  const jobRef = doc(db, `tenants/${tenantId}/workspaces/${j.workspaceId}/scheduledJobs/${j.id}`);
  await updateDoc(jobRef, { status: newStatus });

  q.notify({
    type: "info",
    message:
      newStatus === "paused" ? "⏸ Monitoraggio messo in pausa." : "▶ Monitoraggio riattivato.",
  });
  emit("saved", { ...j, status: newStatus });
  isOpen.value = false;
} /*end handleTogglePause*/

async function handleDelete(): Promise<void> {
  if (!props.existingJob || isDeleting.value) return;

  q.dialog({
    title: "🗑 Elimina Monitoraggio",
    message: `Sei sicuro di voler eliminare il job "${props.existingJob.title}"? L'operazione non può essere annullata.`,
    ok: { label: "Elimina", color: "negative", flat: false },
    cancel: { label: "Annulla", flat: true },
    persistent: true,
  }).onOk(async () => {
    const tenantId = authStore.tenantId;
    if (!tenantId || !props.existingJob) return;
    isDeleting.value = true;
    try {
      const db = getFirestore();
      const j = props.existingJob;
      const jobRef = doc(
        db,
        `tenants/${tenantId}/workspaces/${j.workspaceId}/scheduledJobs/${j.id}`,
      );
      await deleteDoc(jobRef);
      q.notify({ type: "positive", message: "Job eliminato con successo." });
      emit("deleted");
      isOpen.value = false;
    } catch (err) {
      q.notify({ type: "negative", message: "Errore durante l'eliminazione." });
    } finally {
      isDeleting.value = false;
    }
  });
} /*end handleDelete*/

function getStatusColor(status: string): string {
  if (status === "active") return "positive";
  if (status === "paused") return "warning";
  return "grey-5";
} /*end getStatusColor*/

function getStatusLabel(status: string): string {
  if (status === "active") return "Attivo";
  if (status === "paused") return "In Pausa";
  if (status === "completed") return "Terminato";
  return status;
} /*end getStatusLabel*/
</script>

<template>
  <q-dialog
    v-model="isOpen"
    persistent
    maximized
    transition-show="slide-up"
    transition-hide="slide-down"
  >
    <q-card class="schedule-modal-card">
      <!-- ── Header ──────────────────────────────────────────────────── -->
      <q-card-section class="schedule-modal-header row items-center q-px-xl q-py-lg">
        <div class="col">
          <div class="row items-center q-gutter-sm">
            <q-icon name="schedule" size="28px" class="text-gold" />
            <div>
              <h2 class="schedule-modal-title">
                {{ isEditMode ? "Gestisci Monitoraggio" : "⏰ Pianifica Ricerca Ricorrente" }}
              </h2>
              <p class="schedule-modal-subtitle">{{ task.title }}</p>
            </div>
          </div>
        </div>

        <!-- Status chip (edit mode) -->
        <div v-if="isEditMode && existingJob" class="q-mr-md">
          <q-chip
            :color="getStatusColor(existingJob.status)"
            text-color="white"
            :icon="existingJob.status === 'active' ? 'radio_button_checked' : 'pause_circle'"
            class="schedule-status-chip"
          >
            {{ getStatusLabel(existingJob.status) }}
          </q-chip>
        </div>

        <q-btn flat round icon="close" class="text-grey-4" @click="isOpen = false" />
      </q-card-section>

      <q-separator class="separator-gold" />

      <!-- ── Body ──────────────────────────────────────────────────────── -->
      <q-card-section class="q-px-xl q-py-lg schedule-modal-body">
        <div class="schedule-grid">
          <!-- ── LEFT COLUMN: Frequency & Lifecycle ────────────────── -->
          <div class="schedule-section">
            <div class="section-label">
              <q-icon name="repeat" size="18px" class="text-gold q-mr-sm" />
              Frequenza di Esecuzione
            </div>

            <!-- Frequency cards -->
            <div class="frequency-cards q-gutter-sm">
              <div
                v-for="opt in FREQUENCY_OPTIONS"
                :key="opt.value"
                class="frequency-card"
                :class="{ 'frequency-card--active': selectedFrequency === opt.value }"
                @click="selectedFrequency = opt.value"
              >
                <q-icon :name="opt.icon" size="20px" class="q-mr-sm" />
                <div>
                  <div class="freq-label">{{ opt.label }}</div>
                  <div class="freq-desc">{{ opt.desc }}</div>
                </div>
              </div>
            </div>

            <!-- End date (GDPR Art. 5 mandatory) -->
            <div class="section-label q-mt-lg">
              <q-icon name="event" size="18px" class="text-gold q-mr-sm" />
              Data Limite (GDPR Art. 5)
              <q-badge color="negative" label="Obbligatoria" class="q-ml-sm" />
            </div>
            <q-input
              v-model="endDate"
              label="Data scadenza monitoraggio"
              outlined
              dark
              class="schedule-input q-mb-sm"
              readonly
              :hint="
                endDateFormatted ? `Scade il: ${endDateFormatted}` : 'Seleziona una data limite'
              "
            >
              <template #prepend>
                <q-icon name="event" class="text-gold cursor-pointer">
                  <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                    <q-date
                      v-model="endDate"
                      mask="YYYY/MM/DD"
                      :options="(d: string) => d >= minEndDate"
                      today-btn
                      dark
                      class="schedule-datepicker"
                    />
                  </q-popup-proxy>
                </q-icon>
              </template>
            </q-input>

            <!-- Update mode -->
            <div class="section-label q-mt-lg">
              <q-icon name="merge" size="18px" class="text-gold q-mr-sm" />
              Modalità Integrazione Dati
            </div>
            <div class="update-mode-cards q-gutter-sm">
              <div
                v-for="opt in UPDATE_MODE_OPTIONS"
                :key="opt.value"
                class="update-mode-card"
                :class="{ 'update-mode-card--active': updateMode === opt.value }"
                @click="updateMode = opt.value"
              >
                <q-icon :name="opt.icon" size="18px" class="q-mr-sm text-gold" />
                <div>
                  <div class="freq-label">{{ opt.label }}</div>
                  <div class="freq-desc">{{ opt.desc }}</div>
                </div>
              </div>
            </div>

            <!-- Auto-style toggle -->
            <q-item class="schedule-toggle q-mt-md" tag="label">
              <q-item-section avatar>
                <q-toggle v-model="autoStyleSheet" color="amber-6" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-white">Auto-Styling Elite 🎨</q-item-label>
                <q-item-label caption class="text-grey-5">
                  Applica header scuro, wrap e larghezze ottimali ad ogni aggiornamento
                </q-item-label>
              </q-item-section>
            </q-item>
          </div>

          <!-- ── RIGHT COLUMN: Search config & Sheet target ────────── -->
          <div class="schedule-section">
            <!-- Job title -->
            <div class="section-label">
              <q-icon name="label" size="18px" class="text-gold q-mr-sm" />
              Nome del Monitoraggio
            </div>
            <q-input
              v-model="jobTitle"
              label="Es. Monitoraggio Trainer Kubernetes Italia"
              outlined
              dark
              class="schedule-input q-mb-lg"
              maxlength="120"
              counter
            />

            <!-- Search query -->
            <div class="section-label">
              <q-icon name="search" size="18px" class="text-gold q-mr-sm" />
              Query di Ricerca
            </div>
            <q-input
              v-model="searchQuery"
              label="Es. Trainer Kubernetes certificati Italia"
              outlined
              dark
              class="schedule-input q-mb-sm"
              hint="Query inviata all'AgenteRicerca ad ogni esecuzione"
            />

            <!-- Prompt template -->
            <div class="section-label q-mt-lg">
              <q-icon name="smart_toy" size="18px" class="text-gold q-mr-sm" />
              Istruzioni per AgenteRicerca
            </div>
            <q-input
              v-model="promptTemplate"
              label="Istruzioni di screening personalizzate..."
              outlined
              dark
              type="textarea"
              :rows="3"
              class="schedule-input q-mb-lg"
              hint="Criteri di match, focus competenze, esclusioni, etc."
            />

            <!-- Sheet selector -->
            <div class="section-label">
              <q-icon name="table_chart" size="18px" class="text-gold q-mr-sm" />
              Foglio Google di Destinazione
            </div>
            <q-select
              v-model="selectedSheetId"
              :options="availableSheets"
              option-value="id"
              option-label="name"
              emit-value
              map-options
              outlined
              dark
              class="schedule-input q-mb-sm"
              label="Seleziona il foglio di destinazione"
              no-options-label="Nessun Google Sheet collegato al workspace"
            >
              <template #prepend>
                <q-icon name="table_chart" class="text-gold" />
              </template>
              <template #option="scope">
                <q-item v-bind="scope.itemProps">
                  <q-item-section avatar>
                    <q-icon name="table_chart" :color="scope.opt.isMaster ? 'amber-6' : 'blue-4'" />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label>{{ scope.opt.name }}</q-item-label>
                    <q-item-label caption>{{ scope.opt.id?.slice(0, 20) }}...</q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-badge v-if="scope.opt.isMaster" color="amber-6" label="⭐ Master" />
                  </q-item-section>
                </q-item>
              </template>
            </q-select>

            <!-- Tab name -->
            <q-input
              v-model="selectedSheetTab"
              label="Nome scheda (tab)"
              outlined
              dark
              class="schedule-input q-mb-lg"
              hint="Nome del foglio interno. Verrà creato automaticamente se non esiste."
            >
              <template #prepend>
                <q-icon name="tab" class="text-grey-5" />
              </template>
            </q-input>

            <!-- Dedup config (advanced) -->
            <q-expansion-item
              icon="security"
              label="Configurazione Deduplicazione Avanzata"
              class="schedule-expansion"
              header-class="text-grey-4"
            >
              <div class="dedup-config q-pa-md q-gutter-sm">
                <div class="dedup-info">
                  <q-icon name="info" class="text-gold q-mr-sm" />
                  <span>Dual-Key: URL profilo + Nome e Cognome (case-insensitive)</span>
                </div>
                <div class="row q-gutter-sm">
                  <q-input
                    v-model.number="dedupNameColumnIndex"
                    label="Indice colonna Nome (0-based)"
                    outlined
                    dark
                    type="number"
                    class="col schedule-input"
                    hint="Default: 1 = colonna B"
                  />
                  <q-input
                    v-model.number="dedupUrlColumnIndex"
                    label="Indice colonna URL (0-based)"
                    outlined
                    dark
                    type="number"
                    class="col schedule-input"
                    hint="Default: 7 = colonna H"
                  />
                </div>
              </div>
            </q-expansion-item>
          </div>
        </div>
      </q-card-section>

      <!-- ── Footer Actions ────────────────────────────────────────────── -->
      <q-card-actions class="schedule-modal-footer q-px-xl q-py-lg">
        <!-- Delete / Pause (edit mode only) -->
        <template v-if="isEditMode && existingJob">
          <q-btn
            flat
            icon="delete"
            label="Elimina"
            color="negative"
            :loading="isDeleting"
            class="q-mr-sm"
            @click="handleDelete"
          />
          <q-btn
            flat
            :icon="existingJob.status === 'active' ? 'pause' : 'play_arrow'"
            :label="existingJob.status === 'active' ? 'Metti in Pausa' : 'Riattiva'"
            color="warning"
            @click="handleTogglePause"
          />
        </template>

        <q-space />

        <q-btn flat label="Annulla" class="text-grey-4" @click="isOpen = false" />
        <q-btn
          unelevated
          icon="save"
          :label="isEditMode ? 'Salva Modifiche' : 'Attiva Monitoraggio'"
          color="amber-7"
          text-color="dark"
          :loading="isSaving"
          :disable="!canSave"
          class="schedule-save-btn q-ml-sm"
          @click="handleSave"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
@import url("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Mulish:wght@300;400;500;600&display=swap");

.schedule-modal-card {
  background: linear-gradient(160deg, #0d1b2e 0%, #0a2342 50%, #091928 100%);
  color: #f9f7f2;
  font-family: "Mulish", sans-serif;
  display: flex;
  flex-direction: column;
}

.schedule-modal-header {
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(197, 160, 101, 0.2);
}

.schedule-modal-title {
  font-family: "Playfair Display", serif;
  font-size: 1.4rem;
  font-weight: 600;
  color: #f9f7f2;
  margin: 0;
  line-height: 1.2;
}

.schedule-modal-subtitle {
  font-size: 0.8rem;
  color: #c5a065;
  margin: 2px 0 0;
  opacity: 0.8;
}

.separator-gold {
  background: linear-gradient(90deg, transparent, #c5a065 30%, #c5a065 70%, transparent);
  height: 1px;
  opacity: 0.4;
}

.schedule-modal-body {
  flex: 1;
  overflow-y: auto;
}

.schedule-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  max-width: 1100px;
  margin: 0 auto;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.schedule-section {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.section-label {
  display: flex;
  align-items: center;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #c5a065;
  margin-bottom: 0.5rem;
  margin-top: 0.25rem;
}

.text-gold {
  color: #c5a065 !important;
}

.frequency-cards,
.update-mode-cards {
  display: flex;
  flex-direction: column;
}

.frequency-card,
.update-mode-card {
  display: flex;
  align-items: flex-start;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(197, 160, 101, 0.08);
    border-color: rgba(197, 160, 101, 0.3);
  }

  &--active {
    background: rgba(197, 160, 101, 0.15) !important;
    border-color: #c5a065 !important;
    box-shadow: 0 0 12px rgba(197, 160, 101, 0.2);
  }
}

.freq-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #f9f7f2;
}

.freq-desc {
  font-size: 0.72rem;
  color: rgba(249, 247, 242, 0.5);
  margin-top: 2px;
}

.schedule-input {
  :deep(.q-field__control) {
    background: rgba(255, 255, 255, 0.04);
    border-radius: 10px;
  }
  :deep(.q-field__label),
  :deep(.q-field__native),
  :deep(.q-field__input) {
    color: #f9f7f2;
  }
  :deep(.q-field__bottom) {
    color: rgba(249, 247, 242, 0.5);
  }
}

.schedule-datepicker {
  background: #0d1b2e !important;
  border: 1px solid rgba(197, 160, 101, 0.3);
  border-radius: 12px;
}

.schedule-toggle {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 0.5rem 1rem;
}

.schedule-expansion {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
}

.dedup-config {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.dedup-info {
  display: flex;
  align-items: center;
  font-size: 0.78rem;
  color: rgba(249, 247, 242, 0.6);
  margin-bottom: 0.5rem;
}

.schedule-status-chip {
  font-weight: 600;
  font-size: 0.8rem;
}

.schedule-modal-footer {
  background: rgba(0, 0, 0, 0.3);
  border-top: 1px solid rgba(197, 160, 101, 0.15);
}

.schedule-save-btn {
  font-weight: 700;
  border-radius: 10px;
  padding: 0 1.5rem;
  font-size: 0.9rem;
  transition: transform 0.15s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(197, 160, 101, 0.3);
  }
}
</style>
