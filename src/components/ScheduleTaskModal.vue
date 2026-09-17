<script setup lang="ts">
/**
 * @file ScheduleTaskModal.vue
 * @description Modal for creating and managing Scheduled Sourcing Jobs (Step 19).
 * @author Vasile Chifeac
 * @created 2026-09-10
 * @modified 2026-09-14
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

// ── Components ───────────────────────────────────────────────────────────────
import SheetIntegrationConfigCard from "./SheetIntegrationConfigCard.vue";

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

// Read-only lock flags (true = locked/read-only; false = editable after user clicks 🔓)
/** When true, the job title field is in read-only display mode, protected from accidental edits. */
const isJobTitleLocked = ref<boolean>(true);
/** When true, the search query field is in read-only display mode, protected from accidental edits. */
const isSearchQueryLocked = ref<boolean>(true);

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
    jobTitle.value = props.task.title ? `Monitoraggio: ${props.task.title}` : "";
    selectedFrequency.value = "daily_04am";
    endDate.value = defaultEndDate.value;
    // Step 21 Strada 3: Pre-populate from task settings or workspace default
    const taskMode = props.task.settings?.sheetUpdateMode;
    const wsMode = props.workspace?.linkedResources?.sheetUpdateMode;
    updateMode.value = taskMode || wsMode || "append_new";

    const taskAutoStyle = props.task.settings?.autoStyleSheet;
    const wsAutoStyle = props.workspace?.linkedResources?.autoStyleSheet;
    autoStyleSheet.value =
      taskAutoStyle !== undefined ? taskAutoStyle : wsAutoStyle !== undefined ? wsAutoStyle : true;
    // Pre-populate searchQuery with task title (same as human intent of the task)
    searchQuery.value = props.task.title || "";
    promptTemplate.value =
      "Cerca professionisti corrispondenti al profilo richiesto. " +
      "Per ciascun candidato, valuta il match con il profilo ICP, " +
      "identifica le competenze combacianti e i gap critici. " +
      "Assegna un Match Score da 0 a 100 basato sull'aderenza al profilo cercato.";
    // Pre-populate sheet from task primary sheet (🎯 Primario), fallback to workspace default
    const taskPrimarySheetId =
      props.task.settings?.selectedSheetId || (props.task.settings?.selectedSheetIds?.[0] ?? "");
    const wsFallbackSheetId = props.workspace?.linkedResources?.defaultSheetId || "";
    const resolvedSheetId = taskPrimarySheetId || wsFallbackSheetId;
    selectedSheetId.value = resolvedSheetId;
    const matchedSheet = availableSheets.value.find((s) => s.id === resolvedSheetId);
    selectedSheetName.value = matchedSheet?.name || "";
    selectedSheetTab.value = "Candidati";
    dedupUrlColumnIndex.value = 7;
    dedupNameColumnIndex.value = 1;
    // Lock both read-only on open so user sees pre-filled values clearly before any edit
    isJobTitleLocked.value = true;
    isSearchQueryLocked.value = true;
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
  <q-dialog v-model="isOpen" persistent transition-show="scale" transition-hide="scale">
    <q-card
      class="schedule-modal-card"
      style="width: 860px; max-width: 95vw; max-height: 92vh; display: flex; flex-direction: column"
    >
      <!-- ── Header (Elite Navy & Gold - identical to TaskSettingsModal) ────────── -->
      <q-card-section class="schedule-modal-card__header row items-center q-py-md q-px-lg">
        <q-icon name="schedule" size="22px" color="amber-5" class="q-mr-sm" />
        <div>
          <div class="text-subtitle1 text-weight-bold text-white">
            {{ isEditMode ? "Gestisci Monitoraggio" : "⏰ Pianifica Ricerca Ricorrente" }}
          </div>
          <div class="text-caption text-amber-2">
            Task: {{ task.title }} | Workspace: {{ workspace?.name }}
          </div>
        </div>
        <q-space />

        <!-- Status chip (edit mode) -->
        <q-chip
          v-if="isEditMode && existingJob"
          :color="getStatusColor(existingJob.status)"
          text-color="white"
          dense
          :icon="existingJob.status === 'active' ? 'radio_button_checked' : 'pause_circle'"
          class="q-mr-sm text-weight-bold"
        >
          {{ getStatusLabel(existingJob.status) }}
        </q-chip>

        <q-btn flat round dense icon="close" color="white" v-close-popup />
      </q-card-section>

      <!-- ── Body (Off-White #f9f7f2) ──────────────────────────────────── -->
      <q-card-section class="schedule-modal-body q-pa-lg">
        <div class="schedule-grid">
          <!-- ── LEFT COLUMN: Frequency & Lifecycle ────────────────── -->
          <div class="schedule-section">
            <div class="section-label text-subtitle2 text-weight-bold text-navy q-mb-xs">
              <q-icon name="repeat" size="18px" color="amber-9" class="q-mr-xs" />
              Frequenza di Esecuzione
            </div>

            <!-- Frequency cards list -->
            <q-list bordered separator class="rounded-borders bg-white q-mb-md">
              <q-item
                v-for="opt in FREQUENCY_OPTIONS"
                :key="opt.value"
                clickable
                :active="selectedFrequency === opt.value"
                active-class="bg-amber-1"
                @click="selectedFrequency = opt.value"
                class="frequency-item"
              >
                <q-item-section avatar style="min-width: 36px">
                  <q-radio v-model="selectedFrequency" :val="opt.value" color="amber-9" />
                </q-item-section>
                <q-item-section>
                  <q-item-label
                    class="text-subtitle2"
                    :class="{ 'text-weight-bold': selectedFrequency === opt.value }"
                  >
                    {{ opt.label }}
                  </q-item-label>
                  <q-item-label caption class="text-grey-7">
                    {{ opt.desc }}
                  </q-item-label>
                </q-item-section>
              </q-item>
            </q-list>

            <!-- End date (GDPR Art. 5 mandatory) -->
            <div class="section-label text-subtitle2 text-weight-bold text-navy q-mb-xs q-mt-md">
              <q-icon name="event" size="18px" color="amber-9" class="q-mr-xs" />
              Data Limite (GDPR Art. 5)
              <q-badge color="negative" text-color="white" label="Obbligatoria" class="q-ml-sm" />
            </div>
            <q-input
              v-model="endDate"
              label="Data scadenza monitoraggio"
              outlined
              dense
              class="bg-white rounded-borders q-mb-sm"
              readonly
              :hint="
                endDateFormatted ? `Scade il: ${endDateFormatted}` : 'Seleziona una data limite'
              "
            >
              <template #prepend>
                <q-icon name="event" color="amber-9" class="cursor-pointer">
                  <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                    <q-date
                      v-model="endDate"
                      mask="YYYY/MM/DD"
                      :options="(d: string) => d >= minEndDate"
                      today-btn
                      color="amber-9"
                      class="schedule-datepicker"
                    />
                  </q-popup-proxy>
                </q-icon>
              </template>
            </q-input>

            <!-- Step 21 Strada 3: Update mode & Auto-style (DRY Reusable Component) -->
            <SheetIntegrationConfigCard
              v-model:update-mode="updateMode"
              v-model:auto-style-sheet="autoStyleSheet"
            />
          </div>

          <!-- ── RIGHT COLUMN: Search config & Sheet target ────────── -->
          <div class="schedule-section">
            <!-- Job title — read-only by default, unlock with edit button -->
            <div
              class="section-label text-subtitle2 text-weight-bold text-navy q-mb-xs row items-center justify-between"
            >
              <div class="row items-center">
                <q-icon name="label" size="18px" color="amber-9" class="q-mr-xs" />
                Nome del Monitoraggio
              </div>
              <q-btn
                v-if="isJobTitleLocked"
                flat
                dense
                round
                size="sm"
                icon="edit"
                color="amber-9"
                @click="isJobTitleLocked = false"
              >
                <q-tooltip>Modifica nome monitoraggio</q-tooltip>
              </q-btn>
              <q-btn
                v-else
                flat
                dense
                round
                size="sm"
                icon="lock"
                color="positive"
                @click="isJobTitleLocked = true"
              >
                <q-tooltip>Blocca (Read-Only)</q-tooltip>
              </q-btn>
            </div>
            <!-- Locked: expandable read-only display -->
            <div
              v-if="isJobTitleLocked"
              class="locked-field-display q-mb-md"
              @click="isJobTitleLocked = false"
            >
              <div class="locked-field-display__text">{{ jobTitle || "—" }}</div>
              <q-tooltip>Clicca per modificare</q-tooltip>
            </div>
            <!-- Unlocked: editable textarea -->
            <q-input
              v-else
              v-model="jobTitle"
              label="Es. Monitoraggio Trainer Kubernetes Italia"
              outlined
              dense
              type="textarea"
              :rows="2"
              autogrow
              class="bg-white rounded-borders q-mb-md"
              maxlength="120"
              counter
              autofocus
            />

            <!-- Search query — read-only by default, unlock with edit button -->
            <div
              class="section-label text-subtitle2 text-weight-bold text-navy q-mb-xs row items-center justify-between"
            >
              <div class="row items-center">
                <q-icon name="search" size="18px" color="amber-9" class="q-mr-xs" />
                Query di Ricerca
              </div>
              <q-btn
                v-if="isSearchQueryLocked"
                flat
                dense
                round
                size="sm"
                icon="edit"
                color="amber-9"
                @click="isSearchQueryLocked = false"
              >
                <q-tooltip>Modifica query di ricerca</q-tooltip>
              </q-btn>
              <q-btn
                v-else
                flat
                dense
                round
                size="sm"
                icon="lock"
                color="positive"
                @click="isSearchQueryLocked = true"
              >
                <q-tooltip>Blocca (Read-Only)</q-tooltip>
              </q-btn>
            </div>
            <!-- Locked: expandable read-only display -->
            <div
              v-if="isSearchQueryLocked"
              class="locked-field-display q-mb-sm"
              @click="isSearchQueryLocked = false"
            >
              <div class="locked-field-display__text">{{ searchQuery || "—" }}</div>
              <q-tooltip>Clicca per modificare</q-tooltip>
            </div>
            <div v-if="isSearchQueryLocked" class="text-caption text-grey-7 q-mb-md">
              Query inviata all&apos;AgenteRicerca ad ogni esecuzione
            </div>
            <!-- Unlocked: editable -->
            <q-input
              v-else
              v-model="searchQuery"
              label="Es. Trainer Kubernetes certificati Italia"
              outlined
              dense
              type="textarea"
              :rows="2"
              autogrow
              class="bg-white rounded-borders q-mb-md"
              hint="Query inviata all'AgenteRicerca ad ogni esecuzione"
              autofocus
            />

            <!-- Prompt template -->
            <div class="section-label text-subtitle2 text-weight-bold text-navy q-mb-xs">
              <q-icon name="smart_toy" size="18px" color="amber-9" class="q-mr-xs" />
              Istruzioni per AgenteRicerca
            </div>
            <q-input
              v-model="promptTemplate"
              label="Istruzioni di screening personalizzate..."
              outlined
              dense
              type="textarea"
              :rows="3"
              class="bg-white rounded-borders q-mb-md"
              hint="Criteri di match, focus competenze, esclusioni, etc."
            />

            <!-- Sheet selector -->
            <div class="section-label text-subtitle2 text-weight-bold text-navy q-mb-xs">
              <q-icon name="table_chart" size="18px" color="amber-9" class="q-mr-xs" />
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
              dense
              class="bg-white rounded-borders q-mb-md"
              label="Seleziona il foglio di destinazione"
              no-options-label="Nessun Google Sheet collegato al workspace"
            >
              <template #prepend>
                <q-icon name="table_chart" color="amber-9" />
              </template>
              <template #option="scope">
                <q-item v-bind="scope.itemProps">
                  <q-item-section avatar>
                    <q-icon
                      name="table_chart"
                      :color="scope.opt.isMaster ? 'amber-9' : 'primary'"
                    />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-weight-medium">{{ scope.opt.name }}</q-item-label>
                    <q-item-label caption class="text-grey-6"
                      >{{ scope.opt.id?.slice(0, 24) }}...</q-item-label
                    >
                  </q-item-section>
                  <q-item-section side>
                    <q-badge
                      v-if="scope.opt.isMaster"
                      color="amber-9"
                      text-color="dark"
                      label="⭐ Master"
                    />
                  </q-item-section>
                </q-item>
              </template>
            </q-select>

            <!-- Tab name -->
            <div class="section-label text-subtitle2 text-weight-bold text-navy q-mb-xs">
              <q-icon name="tab" size="18px" color="amber-9" class="q-mr-xs" />
              Nome Scheda (tab) Interna del Foglio
            </div>
            <q-input
              v-model="selectedSheetTab"
              label="Nome scheda (tab)"
              outlined
              dense
              class="bg-white rounded-borders q-mb-md"
              hint="Nome del foglio interno. Verrà creato automaticamente se non esiste."
            >
              <template #prepend>
                <q-icon name="tab" color="grey-7" />
              </template>
            </q-input>

            <!-- Dedup config (advanced) -->
            <q-expansion-item
              icon="security"
              label="Configurazione Deduplicazione Avanzata"
              header-class="text-weight-bold text-navy"
              class="bg-white rounded-borders border-gold-light q-mb-sm"
            >
              <div class="dedup-config q-pa-md bg-grey-1 rounded-borders">
                <div class="row items-center text-caption text-grey-8 q-mb-sm">
                  <q-icon name="info" color="amber-9" size="16px" class="q-mr-xs" />
                  <span>Dual-Key: URL profilo + Nome e Cognome (case-insensitive)</span>
                </div>
                <div class="row q-gutter-sm">
                  <q-input
                    v-model.number="dedupNameColumnIndex"
                    label="Indice colonna Nome (0-based)"
                    outlined
                    dense
                    type="number"
                    class="col bg-white rounded-borders"
                    hint="Default: 1 = colonna B"
                  />
                  <q-input
                    v-model.number="dedupUrlColumnIndex"
                    label="Indice colonna URL (0-based)"
                    outlined
                    dense
                    type="number"
                    class="col bg-white rounded-borders"
                    hint="Default: 7 = colonna H"
                  />
                </div>
              </div>
            </q-expansion-item>
          </div>
        </div>
      </q-card-section>

      <q-separator />

      <!-- ── Footer Actions (Clean White & Amber-9) ───────────────────────── -->
      <q-card-actions align="right" class="q-pa-md bg-white">
        <!-- Delete / Pause (edit mode only) -->
        <template v-if="isEditMode && existingJob">
          <q-btn
            flat
            icon="delete"
            label="Elimina"
            color="negative"
            no-caps
            :loading="isDeleting"
            class="q-mr-xs"
            @click="handleDelete"
          />
          <q-btn
            flat
            :icon="existingJob.status === 'active' ? 'pause' : 'play_arrow'"
            :label="existingJob.status === 'active' ? 'Metti in Pausa' : 'Riattiva'"
            color="warning"
            no-caps
            class="q-mr-sm"
            @click="handleTogglePause"
          />
        </template>

        <q-space />

        <q-btn flat label="Annulla" color="grey-8" no-caps v-close-popup />
        <q-btn
          unelevated
          color="amber-9"
          text-color="dark"
          icon="schedule"
          :label="isEditMode ? 'Salva Modifiche' : 'Attiva Monitoraggio'"
          no-caps
          class="text-weight-bold q-px-lg"
          :loading="isSaving"
          :disable="!canSave"
          @click="handleSave"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.schedule-modal-card {
  border-radius: 12px;
  overflow: hidden;
  background: #f9f7f2;
}

.schedule-modal-card__header {
  background: #0a2342;
  border-bottom: 2px solid #c5a065;
}

.schedule-modal-body {
  flex: 1;
  overflow-y: auto;
}

.schedule-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;

  @media (max-width: 800px) {
    grid-template-columns: 1fr;
  }
}

.text-navy {
  color: #0a2342;
}

.border-gold-light {
  border: 1px solid rgba(197, 160, 101, 0.35);
}

.frequency-item,
.update-mode-item {
  transition: background-color 0.15s ease;
}

.schedule-datepicker {
  background: #ffffff;
  border-radius: 10px;
}

// Read-only locked field display: shows pre-filled text with visual affordance
.locked-field-display {
  background: rgba(197, 160, 101, 0.08);
  border: 1px solid rgba(197, 160, 101, 0.4);
  border-radius: 8px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(197, 160, 101, 0.16);
  }

  &__text {
    color: #0a2342;
    font-size: 0.875rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 120px;
    overflow-y: auto;
  }
}
</style>
