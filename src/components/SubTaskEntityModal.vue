<script setup lang="ts">
/**
 * @file SubTaskEntityModal.vue
 * @description Modal for polymorphic Entity SubTask management, operational notes, private timeline, and nested mini-tasks (Step 20).
 * @author Vasile Chifeac
 * @created 2026-09-14
 * @modified 2026-09-14
 *
 * @notes
 * - Provides granular entity lifecycle management (new -> contacted -> waiting_response -> negotiation -> won/lost).
 * - Multi-domain polymorphic vocabulary: recruiting, healthcare, procurement, operations, generic.
 * - Private timeline for per-entity interactions (calls, emails, WhatsApp, notes).
 * - Nested mini-tasks checklist for operational sub-actions.
 * - Direct Firestore updates to tenants/{tenantId}/workspaces/{workspaceId}/tasks/{taskId}/subtasks/{subtaskId}.
 * - Design System "Elite": Royal Navy #0a2342, Gold #c5a065, Off-White #f9f7f2.
 *
 * @dependencies
 * - firebase/firestore client SDK
 * - useAuthStore (tenantId)
 * - EntitySubTask models from src/types/models.ts
 *
 * @performance
 * - Atomic single-document write on Firestore per action
 * - Zero Google Sheets live cell rewrites (unidirectional sync boundary)
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { computed, ref, watch } from "vue";
import { useQuasar, copyToClipboard } from "quasar";

// ── Firebase ─────────────────────────────────────────────────────────────────
import { getFirestore, doc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";

// ── Types ────────────────────────────────────────────────────────────────────
import type {
  EntitySubTask,
  EntitySubTaskStatus,
  EntitySubTaskOutcome,
  EntityEventType,
  EntityTimelineEvent,
  NestedMiniTask,
  EntityDomain,
} from "../types/models";

// ── Components ───────────────────────────────────────────────────────────────
import AppFloatingWindow from "./AppFloatingWindow.vue";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useAuthStore } from "../stores/authStore";
import { useSubtaskUiStore } from "../stores/subtaskUiStore";

// ── Composables ──────────────────────────────────────────────────────────────
import { useSecureLogger } from "../composables/useSecureLogger";

// ── Props & Emits ─────────────────────────────────────────────────────────────
const props = defineProps<{
  modelValue: boolean;
  subtask: EntitySubTask | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
  (e: "saved", updatedSubtask: EntitySubTask): void;
  (e: "deleted", subtaskId: string): void;
}>();

const q = useQuasar();
const authStore = useAuthStore();
const subtaskUiStore = useSubtaskUiStore();
const logger = useSecureLogger();

// ── State ─────────────────────────────────────────────────────────────────────
const isOpen = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit("update:modelValue", val),
});

// UI expansion state persisted via Pinia subtaskUiStore (Img 4 + Img 5 alignment)
const isMiniTasksExpanded = computed(() => subtaskUiStore.isMiniTasksExpanded);
const isTimelineExpanded = computed(() => subtaskUiStore.isTimelineExpanded);

const toggleMiniTasks = (): void => {
  subtaskUiStore.toggleMiniTasks();
}; /*end toggleMiniTasks*/

const toggleTimeline = (): void => {
  subtaskUiStore.toggleTimeline();
}; /*end toggleTimeline*/

// Local draft state
const localStatus = ref<EntitySubTaskStatus>("new");
const localOutcome = ref<EntitySubTaskOutcome>("in_progress");
const localNotes = ref<string>("");
const isSavingNotes = ref<boolean>(false);
const hasUnsavedNotes = ref<boolean>(false);

// New timeline event draft
const isAddingEvent = ref<boolean>(false);
const newEventType = ref<EntityEventType>("call");
const newEventTitle = ref<string>("");
const newEventDesc = ref<string>("");
const isSavingEvent = ref<boolean>(false);

// New nested mini-task draft
const newMiniTaskTitle = ref<string>("");
const isSavingMiniTask = ref<boolean>(false);

// Status Options
const subtaskStatusOptions: {
  label: string;
  value: EntitySubTaskStatus;
  color: string;
  icon: string;
}[] = [
  { label: "Da Contattare", value: "new", color: "blue-6", icon: "person_add" },
  { label: "Contattato", value: "contacted", color: "light-blue-7", icon: "phone_forwarded" },
  {
    label: "In Attesa Risposta",
    value: "waiting_response",
    color: "amber-8",
    icon: "hourglass_top",
  },
  { label: "In Trattativa", value: "negotiation", color: "purple-6", icon: "handshake" },
  { label: "Risposta Positiva", value: "positive_response", color: "teal-6", icon: "thumb_up" },
  {
    label: "Risposta Negativa",
    value: "negative_response",
    color: "deep-orange-7",
    icon: "thumb_down",
  },
  { label: "Follow-up", value: "follow_up", color: "indigo-6", icon: "event_repeat" },
  { label: "Completato", value: "completed", color: "positive", icon: "check_circle" },
];

// Initialize local state when subtask changes
watch(
  () => props.subtask,
  (st) => {
    if (st) {
      localStatus.value = st.status;
      localOutcome.value = st.outcome;
      localNotes.value = st.notes || "";
      hasUnsavedNotes.value = false;
      isAddingEvent.value = false;
    }
  },
  { immediate: true },
);

// Domain Vocabulary Helper (Fase 5: Polimorfismo)
const domainConfig = computed(() => {
  const d: EntityDomain = props.subtask?.domain || "recruiting";
  switch (d) {
    case "recruiting":
      return {
        domainLabel: "Recruiting & Talent",
        entityLabel: "Candidato",
        entityIcon: "person",
        primaryAttributeLabel: "Competenze",
        secondaryAttributeLabel: "Tariffa / Disponibilità",
      };
    case "healthcare":
      return {
        domainLabel: "Sanità & Assistenza",
        entityLabel: "Paziente",
        entityIcon: "medical_services",
        primaryAttributeLabel: "Prestazione Clinica",
        secondaryAttributeLabel: "Priorità / Urgenza",
      };
    case "procurement":
      return {
        domainLabel: "Procurement & Fornitori",
        entityLabel: "Fornitore / Articolo",
        entityIcon: "inventory_2",
        primaryAttributeLabel: "Articolo / Servizio",
        secondaryAttributeLabel: "Prezzo / Offerta",
      };
    case "operations":
      return {
        domainLabel: "Operations & Impianti",
        entityLabel: "Impianto / Macchinario",
        entityIcon: "precision_manufacturing",
        primaryAttributeLabel: "Anomalia / Manutenzione",
        secondaryAttributeLabel: "Tecnico Assegnato",
      };
    default:
      return {
        domainLabel: "Operativo",
        entityLabel: "Risorsa",
        entityIcon: "assignment_ind",
        primaryAttributeLabel: "Dettaglio",
        secondaryAttributeLabel: "Note Aggiuntive",
      };
  }
});

// Current Status Object
const currentStatusObj = computed(() => {
  return (
    subtaskStatusOptions.find((o) => o.value === localStatus.value) || subtaskStatusOptions[0]!
  );
});

// Extracted Row Attributes Formatting
const extractedRowCells = computed<string[]>(() => {
  const row = props.subtask?.attributes?.extractedRow;
  if (Array.isArray(row)) {
    return row.map((cell) => String(cell ?? ""));
  }
  return [];
});

const profileUrl = computed<string | null>(() => {
  if (!props.subtask) return null;
  // Look for url in extractedRow or attributes
  for (const cell of extractedRowCells.value) {
    if (/^https?:\/\//i.test(cell)) {
      return cell;
    }
  }
  if (typeof props.subtask.attributes?.profileUrl === "string") {
    return props.subtask.attributes.profileUrl;
  }
  return null;
});

// ── Firestore Save Helpers ────────────────────────────────────────────────────
const getSubtaskDocRef = () => {
  if (!props.subtask) return null;
  const tenantId = authStore.tenantId || props.subtask.tenantId;
  const workspaceId = props.subtask.workspaceId;
  const taskId = props.subtask.taskId;
  const subtaskId = props.subtask.id;
  if (!tenantId || !workspaceId || !taskId || !subtaskId) return null;

  const db = getFirestore();
  return doc(
    db,
    `tenants/${tenantId}/workspaces/${workspaceId}/tasks/${taskId}/subtasks/${subtaskId}`,
  );
}; /*end getSubtaskDocRef*/

const updateSubtaskField = async (
  fields: Partial<EntitySubTask>,
  notificationMessage?: string,
): Promise<void> => {
  const docRef = getSubtaskDocRef();
  if (!docRef || !props.subtask) return;

  try {
    const nowIso = new Date().toISOString();
    await updateDoc(docRef, {
      ...fields,
      updatedAt: nowIso,
      updatedAtServer: serverTimestamp(),
    });

    const updated: EntitySubTask = {
      ...props.subtask,
      ...fields,
      updatedAt: nowIso,
    };
    emit("saved", updated);

    if (notificationMessage) {
      q.notify({
        type: "positive",
        message: notificationMessage,
        position: "top",
        timeout: 2500,
      });
    }
  } catch (err) {
    logger.error("SubTaskEntityModal", "Failed to update subtask", err);
    q.notify({
      type: "negative",
      message: "Errore durante il salvataggio su Firestore",
      position: "top",
    });
  }
}; /*end updateSubtaskField*/

const isDeletingSubtask = ref<boolean>(false);

const handleDeleteSubtask = (): void => {
  if (!props.subtask) return;
  const targetId = props.subtask.id;
  const targetTitle = props.subtask.title;

  q.dialog({
    title: "Elimina Sub-Task",
    message: `Sei sicuro di voler eliminare definitivamente la risorsa "${targetTitle}"? L'elemento verrà rimosso sia da Firebase che dall'elenco locale.`,
    cancel: {
      flat: true,
      color: "grey-7",
      label: "Annulla",
    },
    ok: {
      unelevated: true,
      color: "negative",
      label: "Elimina Definitivamente",
      icon: "delete_forever",
    },
    persistent: true,
  }).onOk(async () => {
    const docRef = getSubtaskDocRef();
    if (!docRef) return;

    isDeletingSubtask.value = true;
    try {
      await deleteDoc(docRef);
      logger.info("SubTaskEntityModal", `Subtask ${targetId} permanently deleted from Firestore`);
      q.notify({
        type: "positive",
        message: `Sub-task "${targetTitle}" eliminato con successo.`,
        position: "top",
      });
      emit("deleted", targetId);
      isOpen.value = false;
    } catch (err: unknown) {
      logger.error("SubTaskEntityModal", "Failed to delete subtask from Firestore", err);
      q.notify({
        type: "negative",
        message: "Errore durante l'eliminazione del sub-task da Firebase.",
        position: "top",
      });
    } finally {
      isDeletingSubtask.value = false;
    }
  });
}; /*end handleDeleteSubtask*/

// ── Handlers ──────────────────────────────────────────────────────────────────
const handleStatusChange = async (newStatus: EntitySubTaskStatus): Promise<void> => {
  if (!props.subtask || props.subtask.status === newStatus) return;
  localStatus.value = newStatus;

  const nowIso = new Date().toISOString();
  const sObj = subtaskStatusOptions.find((o) => o.value === newStatus);
  const statusEvent: EntityTimelineEvent = {
    id: `evt_status_${Date.now()}`,
    eventType: "status_change",
    title: `Stato aggiornato: ${sObj?.label || newStatus}`,
    authorId: authStore.user?.uid || "user",
    authorName: authStore.user?.displayName || "Operatore",
    timestamp: nowIso,
  };

  const updatedTimeline = [statusEvent, ...(props.subtask.timeline || [])];
  await updateSubtaskField(
    {
      status: newStatus,
      timeline: updatedTimeline,
    },
    `Stato impostato su "${sObj?.label || newStatus}"`,
  );
}; /*end handleStatusChange*/

const handleSaveNotes = async (): Promise<void> => {
  if (!props.subtask || isSavingNotes.value) return;
  isSavingNotes.value = true;
  try {
    await updateSubtaskField({ notes: localNotes.value }, "Note operative salvate con successo");
    hasUnsavedNotes.value = false;
  } finally {
    isSavingNotes.value = false;
  }
}; /*end handleSaveNotes*/

const handleAddTimelineEvent = async (): Promise<void> => {
  if (!props.subtask || !newEventTitle.value.trim() || isSavingEvent.value) return;
  isSavingEvent.value = true;
  try {
    const nowIso = new Date().toISOString();
    const event: EntityTimelineEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      eventType: newEventType.value,
      title: newEventTitle.value.trim(),
      description: newEventDesc.value.trim() || undefined,
      authorId: authStore.user?.uid || "user",
      authorName: authStore.user?.displayName || "Operatore",
      timestamp: nowIso,
    };

    const updatedTimeline = [event, ...(props.subtask.timeline || [])];
    await updateSubtaskField({ timeline: updatedTimeline }, "Evento registrato nella timeline");

    newEventTitle.value = "";
    newEventDesc.value = "";
    isAddingEvent.value = false;
  } finally {
    isSavingEvent.value = false;
  }
}; /*end handleAddTimelineEvent*/

const openAddEvent = (type: EntityEventType): void => {
  newEventType.value = type;
  isAddingEvent.value = true;
  switch (type) {
    case "call":
      newEventTitle.value = "Chiamata effettuata";
      break;
    case "email":
      newEventTitle.value = "Email di contatto inviata";
      break;
    case "whatsapp":
      newEventTitle.value = "Messaggio WhatsApp inviato";
      break;
    case "note":
      newEventTitle.value = "Nota di verifica interna";
      break;
    default:
      newEventTitle.value = "";
  }
}; /*end openAddEvent*/

const handleAddMiniTask = async (): Promise<void> => {
  if (!props.subtask || !newMiniTaskTitle.value.trim() || isSavingMiniTask.value) return;
  isSavingMiniTask.value = true;
  try {
    const newTask: NestedMiniTask = {
      id: `mini_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: newMiniTaskTitle.value.trim(),
      completed: false,
    };

    const updatedTasks = [...(props.subtask.nestedTasks || []), newTask];
    await updateSubtaskField({ nestedTasks: updatedTasks }, "Mini-task aggiunto");
    newMiniTaskTitle.value = "";
  } finally {
    isSavingMiniTask.value = false;
  }
}; /*end handleAddMiniTask*/

const handleToggleMiniTask = async (taskIndex: number): Promise<void> => {
  if (!props.subtask || !props.subtask.nestedTasks) return;
  const tasks = [...props.subtask.nestedTasks];
  const target = tasks[taskIndex];
  if (!target) return;

  target.completed = !target.completed;
  await updateSubtaskField({ nestedTasks: tasks });
}; /*end handleToggleMiniTask*/

const handleDeleteMiniTask = async (taskIndex: number): Promise<void> => {
  if (!props.subtask || !props.subtask.nestedTasks) return;
  const tasks = [...props.subtask.nestedTasks];
  tasks.splice(taskIndex, 1);
  await updateSubtaskField({ nestedTasks: tasks }, "Mini-task rimosso");
}; /*end handleDeleteMiniTask*/

// Outcome Actions (Won / Lost / Reopen)
const handleOutcomeWon = async (): Promise<void> => {
  if (!props.subtask) return;
  q.dialog({
    title: "⭐ Accetta & Concludi Risorsa",
    message: `Confermi l'accettazione con esito positivo per "${props.subtask.title}"? La scheda verrà marcata come Conclusa con Successo.`,
    ok: { label: "Accetta & Concludi", color: "positive", flat: false },
    cancel: { label: "Annulla", flat: true },
    persistent: true,
  }).onOk(async () => {
    localStatus.value = "completed";
    localOutcome.value = "won";
    const nowIso = new Date().toISOString();
    const event: EntityTimelineEvent = {
      id: `evt_won_${Date.now()}`,
      eventType: "status_change",
      title: "⭐ Risorsa Accettata e Conclusa con Successo",
      description: "Esito positivo confermato dall'operatore.",
      authorId: authStore.user?.uid || "user",
      authorName: authStore.user?.displayName || "Operatore",
      timestamp: nowIso,
    };
    const updatedTimeline = [event, ...(props.subtask?.timeline || [])];
    await updateSubtaskField(
      {
        status: "completed",
        outcome: "won",
        timeline: updatedTimeline,
      },
      "Risorsa accettata con successo!",
    );
  });
}; /*end handleOutcomeWon*/

const handleOutcomeLost = async (): Promise<void> => {
  if (!props.subtask) return;
  q.dialog({
    title: "❌ Rifiuta o Archivia Risorsa",
    message: `Desideri archiviare con esito negativo "${props.subtask.title}"?`,
    ok: { label: "Archivia Risorsa", color: "negative", flat: false },
    cancel: { label: "Annulla", flat: true },
    persistent: true,
  }).onOk(async () => {
    localStatus.value = "completed";
    localOutcome.value = "lost";
    const nowIso = new Date().toISOString();
    const event: EntityTimelineEvent = {
      id: `evt_lost_${Date.now()}`,
      eventType: "status_change",
      title: "❌ Risorsa Rifiutata / Archiviata",
      description: "Esito negativo o non idoneo registrato dall'operatore.",
      authorId: authStore.user?.uid || "user",
      authorName: authStore.user?.displayName || "Operatore",
      timestamp: nowIso,
    };
    const updatedTimeline = [event, ...(props.subtask?.timeline || [])];
    await updateSubtaskField(
      {
        status: "completed",
        outcome: "lost",
        timeline: updatedTimeline,
      },
      "Risorsa archiviata con esito negativo",
    );
  });
}; /*end handleOutcomeLost*/

const handleReopenEntity = async (): Promise<void> => {
  if (!props.subtask) return;
  localStatus.value = "negotiation";
  localOutcome.value = "in_progress";
  const nowIso = new Date().toISOString();
  const event: EntityTimelineEvent = {
    id: `evt_reopen_${Date.now()}`,
    eventType: "status_change",
    title: "🔄 Scheda Risorsa Riaperta",
    description: "Ripristinato lo stato operativo in corso.",
    authorId: authStore.user?.uid || "user",
    authorName: authStore.user?.displayName || "Operatore",
    timestamp: nowIso,
  };
  const updatedTimeline = [event, ...(props.subtask.timeline || [])];
  await updateSubtaskField(
    {
      status: "negotiation",
      outcome: "in_progress",
      timeline: updatedTimeline,
    },
    "Scheda risorsa riaperta con successo",
  );
}; /*end handleReopenEntity*/

const handleCopyText = (text: string, label: string): void => {
  copyToClipboard(text)
    .then(() => {
      q.notify({ type: "positive", message: `${label} copiato negli appunti`, timeout: 1500 });
    })
    .catch(() => {
      q.notify({ type: "negative", message: "Errore durante la copia" });
    });
}; /*end handleCopyText*/

const formatEventDate = (isoStr: string): string => {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return isNaN(d.getTime())
      ? isoStr
      : d.toLocaleDateString("it-IT", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
  } catch {
    return isoStr;
  }
}; /*end formatEventDate*/
</script>

<template>
  <AppFloatingWindow
    v-if="subtask"
    v-model="isOpen"
    window-id="subtask-entity-modal"
    :title="subtask.title"
    :subtitle="subtask.subtitle || domainConfig.domainLabel"
    :icon="domainConfig.entityIcon"
    icon-color="amber-5"
    :initial-width="1060"
    :initial-height="720"
    :min-width="480"
    :min-height="380"
    @close="isOpen = false"
  >
    <template #header-middle>
      <div class="row items-center q-gutter-x-xs no-wrap">
        <q-badge
          v-if="subtask.entityExternalId"
          outline
          color="amber-4"
          :label="subtask.entityExternalId"
          class="text-weight-bold"
        />
        <q-badge dense color="navy-light" text-color="grey-4" :label="domainConfig.domainLabel" />
        <!-- Outcome Badge -->
        <q-badge
          v-if="localOutcome === 'won'"
          color="positive"
          class="q-pa-xs text-weight-bold shadow-1"
        >
          ⭐ Concluso (Won)
        </q-badge>
        <q-badge
          v-else-if="localOutcome === 'lost'"
          color="grey-7"
          class="q-pa-xs text-weight-bold shadow-1"
        >
          ❌ Archiviato (Lost)
        </q-badge>

        <!-- Quick Status Dropdown -->
        <q-btn-dropdown
          dense
          rounded
          outline
          size="sm"
          :color="currentStatusObj.color"
          :label="currentStatusObj.label"
          :icon="currentStatusObj.icon"
          class="q-px-sm text-weight-bold bg-dark"
        >
          <q-list dense style="min-width: 180px">
            <q-item
              v-for="opt in subtaskStatusOptions"
              :key="opt.value"
              clickable
              v-close-popup
              @click="handleStatusChange(opt.value)"
            >
              <q-item-section avatar style="min-width: 24px">
                <q-icon :name="opt.icon" :color="opt.color" size="18px" />
              </q-item-section>
              <q-item-section class="text-caption text-weight-medium">
                {{ opt.label }}
              </q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>
      </div>
    </template>

    <!-- ── Two-Column Split-View Body (Img 5 Coherent Layout) ────────────────── -->
    <div class="col row no-wrap overflow-hidden subtask-split-container">
      <!-- ── LEFT COLUMN: Dati Ereditati, Attributi & Note Operative ───────── -->
      <div
        class="col-12 col-md-6 column no-wrap scroll q-pa-md border-right-light left-pane bg-grey-1"
        style="overflow-y: auto"
      >
        <!-- Card 1: Dati Ereditati dalla Tabella / Chat -->
        <q-card flat bordered class="rounded-borders bg-white q-pa-md shadow-1 q-mb-md">
          <div class="row items-center justify-between q-mb-sm">
            <div
              class="text-caption text-weight-bold text-primary text-uppercase letter-spacing row items-center"
            >
              <q-icon name="info" size="18px" color="primary" class="q-mr-xs" />
              Dati Ereditati & Profilo Fonte
            </div>
            <q-btn
              v-if="profileUrl"
              outline
              dense
              size="xs"
              color="primary"
              icon="open_in_new"
              label="Apri Profilo Fonte"
              :href="profileUrl"
              target="_blank"
              class="q-px-sm"
            />
          </div>

          <div v-if="extractedRowCells.length > 0" class="q-mt-sm">
            <q-list dense separator class="rounded-borders bg-grey-1">
              <q-item v-for="(cell, cIdx) in extractedRowCells" :key="cIdx" class="q-py-xs">
                <q-item-section avatar style="min-width: 32px">
                  <q-badge color="grey-4" text-color="dark" :label="`Col ${cIdx + 1}`" />
                </q-item-section>
                <q-item-section class="text-caption" style="word-break: break-all">
                  <template v-if="/^https?:\/\//i.test(cell)">
                    <a :href="cell" target="_blank" class="text-primary text-weight-bold">
                      {{ cell }} 🔗
                    </a>
                  </template>
                  <template v-else>
                    {{ cell }}
                  </template>
                </q-item-section>
                <q-item-section side>
                  <q-btn
                    flat
                    dense
                    round
                    size="xs"
                    icon="content_copy"
                    color="grey-6"
                    @click="handleCopyText(cell, `Valore Colonna ${cIdx + 1}`)"
                  >
                    <q-tooltip>Copia Valore</q-tooltip>
                  </q-btn>
                </q-item-section>
              </q-item>
            </q-list>
          </div>

          <div v-else class="text-caption text-grey-6 q-pa-sm text-center">
            Nessun valore tabellare specifico ereditato.
          </div>

          <!-- Meta attributes summary -->
          <div class="q-mt-md q-pt-xs border-top-light">
            <div
              class="row justify-between items-center text-caption q-py-2xs border-bottom-dashed"
            >
              <span class="text-grey-7">Dominio Applicativo:</span>
              <span class="text-weight-bold text-dark">{{ domainConfig.domainLabel }}</span>
            </div>
            <div
              class="row justify-between items-center text-caption q-py-2xs border-bottom-dashed"
            >
              <span class="text-grey-7">Data Creazione:</span>
              <span class="text-grey-8">{{ formatEventDate(subtask.createdAt) }}</span>
            </div>
            <div class="row justify-between items-center text-caption q-py-2xs">
              <span class="text-grey-7">Ultimo Aggiornamento:</span>
              <span class="text-grey-8">{{ formatEventDate(subtask.updatedAt) }}</span>
            </div>
          </div>

          <!-- Unidirectional sync boundary note -->
          <div
            class="q-mt-sm q-pa-xs bg-blue-1 text-primary text-caption rounded-borders row items-center no-wrap"
            style="font-size: 0.72rem"
          >
            <q-icon name="sync_disabled" size="16px" class="q-mr-xs text-primary shrink" />
            <span>
              <strong>Isolamento Garantito:</strong> Gli stati e le note sono memorizzati in OpsFlow
              senza alterare le celle del Google Sheet originale.
            </span>
          </div>
        </q-card>

        <!-- Card 2: Note Operative & Appunti di Contatto -->
        <q-card
          flat
          bordered
          class="rounded-borders bg-white q-pa-md shadow-1 q-mb-xs col-grow column no-wrap"
        >
          <div class="row items-center justify-between q-mb-xs">
            <div class="row items-center">
              <q-icon name="sticky_note_2" color="amber-9" size="20px" class="q-mr-xs" />
              <span class="text-subtitle2 text-weight-bold text-primary">Note Operative</span>
            </div>

            <div class="row items-center q-gutter-x-xs">
              <q-badge v-if="hasUnsavedNotes" outline color="deep-orange" label="Non salvate" />
              <q-btn
                unelevated
                size="xs"
                color="primary"
                icon="save"
                label="Salva Note"
                :loading="isSavingNotes"
                class="text-weight-bold q-px-sm"
                @click="handleSaveNotes"
              />
            </div>
          </div>

          <!-- Healthcare Alert (GDPR Art. 9) -->
          <div
            v-if="subtask.domain === 'healthcare'"
            class="q-mb-xs q-pa-xs bg-amber-1 text-amber-10 text-caption rounded-borders row items-center"
            style="font-size: 0.72rem"
          >
            <q-icon name="security" size="16px" class="q-mr-xs" />
            <span><strong>GDPR Art. 9:</strong> Informazioni sanitarie isolate per tenant.</span>
          </div>

          <q-input
            v-model="localNotes"
            type="textarea"
            outlined
            autogrow
            rows="6"
            placeholder="Inserisci note sulla risorsa, riassunto colloqui, disponibilità, richieste economiche..."
            class="subtask-notes-input full-width q-mt-xs"
            @update:model-value="hasUnsavedNotes = true"
          />
        </q-card>
      </div>

      <!-- ── RIGHT COLUMN: Timeline Privata & Mini-Task Checklist Affiancati ── -->
      <div
        class="col-12 col-md-6 column no-wrap scroll q-pa-md right-pane bg-white"
        style="overflow-y: auto"
      >
        <!-- Sezione Mini-Task Checklist (Fisarmonica Espandibile con Persistenza Store Locale) -->
        <q-card
          flat
          bordered
          class="rounded-borders bg-grey-1 q-pa-sm shadow-1 q-mb-sm border-light"
        >
          <div class="row items-center justify-between cursor-pointer" @click="toggleMiniTasks">
            <div class="row items-center q-gutter-x-xs">
              <q-icon name="checklist" color="teal-7" size="20px" />
              <span class="text-subtitle2 text-weight-bold text-primary">Mini-Task Checklist</span>
              <q-badge
                v-if="subtask.nestedTasks && subtask.nestedTasks.length > 0"
                color="teal-7"
                rounded
                dense
                :label="`${subtask.nestedTasks.filter((t) => t.completed).length}/${subtask.nestedTasks.length}`"
              />
            </div>
            <div class="row items-center q-gutter-x-2xs">
              <span class="text-caption text-grey-6" style="font-size: 0.72rem">
                {{ isMiniTasksExpanded ? "Nascondi" : "Mostra" }}
              </span>
              <q-icon
                :name="isMiniTasksExpanded ? 'expand_less' : 'expand_more'"
                color="grey-7"
                size="18px"
              />
            </div>
          </div>

          <!-- Expandable Checklist Body -->
          <q-slide-transition>
            <div v-show="isMiniTasksExpanded" class="q-pt-sm">
              <!-- Add Mini-Task -->
              <div class="row q-gutter-x-xs items-center q-mb-sm">
                <q-input
                  v-model="newMiniTaskTitle"
                  dense
                  outlined
                  placeholder="Nuova azione (es. Inviare accordo entro giovedì)..."
                  class="col bg-white"
                  style="font-size: 0.8rem"
                  @keyup.enter="handleAddMiniTask"
                />
                <q-btn
                  dense
                  unelevated
                  size="sm"
                  color="teal-7"
                  icon="add"
                  class="q-px-xs"
                  :loading="isSavingMiniTask"
                  @click="handleAddMiniTask"
                >
                  <q-tooltip>Aggiungi Mini-Task</q-tooltip>
                </q-btn>
              </div>

              <!-- Mini Tasks List -->
              <div
                v-if="subtask.nestedTasks && subtask.nestedTasks.length > 0"
                class="q-gutter-y-2xs"
                style="max-height: 170px; overflow-y: auto"
              >
                <div
                  v-for="(mt, mtIdx) in subtask.nestedTasks"
                  :key="mt.id || mtIdx"
                  class="row items-center justify-between q-py-2xs q-px-xs rounded-borders bg-white border-light"
                >
                  <div class="row items-center q-gutter-x-xs col ellipsis">
                    <q-checkbox
                      :model-value="mt.completed"
                      color="teal-7"
                      dense
                      size="xs"
                      @update:model-value="handleToggleMiniTask(mtIdx)"
                    />
                    <span
                      class="text-caption ellipsis"
                      :class="{
                        'text-strike text-grey-5': mt.completed,
                        'text-dark text-weight-medium': !mt.completed,
                      }"
                      style="font-size: 0.78rem"
                    >
                      {{ mt.title }}
                    </span>
                  </div>
                  <q-btn
                    flat
                    dense
                    round
                    size="2xs"
                    icon="delete_outline"
                    color="negative"
                    @click="handleDeleteMiniTask(mtIdx)"
                  >
                    <q-tooltip>Elimina mini-task</q-tooltip>
                  </q-btn>
                </div>
              </div>
              <div
                v-else
                class="text-caption text-grey-5 text-center q-pa-xs"
                style="font-size: 0.72rem"
              >
                Nessuna sotto-azione inserita. Aggiungine una con il campo in alto.
              </div>
            </div>
          </q-slide-transition>
        </q-card>

        <!-- Sezione Timeline Privata degli Eventi (Identica visivamente alla Timeline Principale di Img 5) -->
        <q-card
          flat
          bordered
          class="rounded-borders bg-white q-pa-md shadow-1 col-grow column no-wrap"
        >
          <div class="row items-center justify-between q-mb-sm border-bottom-light q-pb-xs">
            <div>
              <div class="row items-center q-gutter-x-xs">
                <q-icon name="history" color="primary" size="20px" />
                <span class="text-subtitle2 text-weight-bold text-primary">Timeline Privata</span>
                <q-badge
                  v-if="subtask.timeline && subtask.timeline.length > 0"
                  color="primary"
                  rounded
                  dense
                  :label="subtask.timeline.length"
                />
              </div>
              <div class="text-caption text-grey-6" style="font-size: 0.72rem">
                Storico cronologico delle interazioni (chiamate, email, colloqui)
              </div>
            </div>

            <!-- Quick Log Action Bar: [📞 Chiamata] [✉️ Email] [💬 WhatsApp] [📝 Nota] -->
            <div class="row items-center q-gutter-2xs">
              <q-btn
                outline
                dense
                size="xs"
                color="primary"
                icon="call"
                label="Chiamata"
                class="q-px-2xs"
                @click="openAddEvent('call')"
              />
              <q-btn
                outline
                dense
                size="xs"
                color="teal-7"
                icon="mail"
                label="Email"
                class="q-px-2xs"
                @click="openAddEvent('email')"
              />
              <q-btn
                outline
                dense
                size="xs"
                color="green-8"
                icon="chat"
                label="WhatsApp"
                class="q-px-2xs"
                @click="openAddEvent('whatsapp')"
              />
              <q-btn
                outline
                dense
                size="xs"
                color="amber-9"
                icon="edit_note"
                label="Nota"
                class="q-px-2xs"
                @click="openAddEvent('note')"
              />
            </div>
          </div>

          <!-- Quick Add Event Form (Slide Transition) -->
          <q-slide-transition>
            <div
              v-if="isAddingEvent"
              class="q-pa-sm bg-grey-1 rounded-borders q-mb-sm border-light"
            >
              <div class="row items-center justify-between q-mb-xs">
                <div class="text-caption text-weight-bold text-primary" style="font-size: 0.78rem">
                  Registra Nuova Interazione ({{ newEventType.toUpperCase() }})
                </div>
                <q-btn flat round dense size="2xs" icon="close" @click="isAddingEvent = false" />
              </div>
              <div class="q-gutter-y-xs">
                <q-input
                  v-model="newEventTitle"
                  dense
                  outlined
                  placeholder="Titolo evento (es. Chiamata conoscitiva con esito positivo)"
                  class="bg-white"
                  style="font-size: 0.8rem"
                />
                <q-input
                  v-model="newEventDesc"
                  dense
                  outlined
                  type="textarea"
                  rows="2"
                  placeholder="Dettagli / note opzionali..."
                  class="bg-white"
                  style="font-size: 0.8rem"
                />
                <div class="row justify-end q-gutter-x-xs">
                  <q-btn flat size="xs" label="Annulla" @click="isAddingEvent = false" />
                  <q-btn
                    unelevated
                    size="xs"
                    color="primary"
                    label="Salva Evento"
                    :loading="isSavingEvent"
                    @click="handleAddTimelineEvent"
                  />
                </div>
              </div>
            </div>
          </q-slide-transition>

          <!-- Vertical Timeline List (Visually identical to TaskChatWindow Timeline in Img 5) -->
          <div class="col scroll q-pr-xs q-pt-xs" style="overflow-y: auto">
            <q-timeline
              v-if="subtask.timeline && subtask.timeline.length > 0"
              color="secondary"
              dense
              class="subtask-timeline q-px-xs"
            >
              <q-timeline-entry
                v-for="evt in subtask.timeline"
                :key="evt.id"
                :subtitle="formatEventDate(evt.timestamp)"
                :icon="
                  evt.eventType === 'call'
                    ? 'call'
                    : evt.eventType === 'email'
                      ? 'mail'
                      : evt.eventType === 'whatsapp'
                        ? 'chat'
                        : evt.eventType === 'status_change'
                          ? 'sync_alt'
                          : 'edit_note'
                "
                :color="
                  evt.eventType === 'call'
                    ? 'primary'
                    : evt.eventType === 'email'
                      ? 'teal-7'
                      : evt.eventType === 'whatsapp'
                        ? 'green-8'
                        : evt.eventType === 'status_change'
                          ? 'amber-9'
                          : 'indigo-6'
                "
                class="task-timeline-entry"
              >
                <template #title>
                  <span class="text-weight-bold text-caption text-primary">
                    {{ evt.title }}
                  </span>
                </template>
                <div
                  v-if="evt.description"
                  class="text-caption text-grey-8 q-mt-xs"
                  style="font-size: 0.74rem; line-height: 1.35"
                >
                  {{ evt.description }}
                </div>
                <div class="text-caption text-grey-5 q-mt-xs" style="font-size: 0.68rem">
                  Registrato da: {{ evt.authorName }}
                </div>
              </q-timeline-entry>
            </q-timeline>

            <div v-else class="text-caption text-grey-6 text-center q-pa-md">
              Nessun evento registrato nella timeline privata. Utilizza i pulsanti rapidi in alto
              per aggiungere una chiamata o una nota.
            </div>
          </div>
        </q-card>
      </div>
    </div>

    <!-- ── Footer Actions Elite ──────────────────────────────────────────────── -->
    <template #footer>
      <div class="row items-center justify-between full-width no-wrap">
        <div class="row items-center q-gutter-x-sm">
          <q-btn flat dense color="grey-7" label="Chiudi" no-caps @click="isOpen = false" />
          <q-btn
            v-if="localOutcome === 'won' || localOutcome === 'lost'"
            outline
            dense
            size="sm"
            color="primary"
            icon="restart_alt"
            label="Riapri Scheda Risorsa"
            no-caps
            class="q-px-sm"
            @click="handleReopenEntity"
          />
          <q-btn
            flat
            dense
            size="sm"
            color="negative"
            icon="delete_forever"
            label="Elimina Sub-Task"
            no-caps
            class="q-px-xs"
            :loading="isDeletingSubtask"
            @click="handleDeleteSubtask"
          >
            <q-tooltip>Elimina definitivamente la risorsa da Firebase e dallo store</q-tooltip>
          </q-btn>
        </div>

        <!-- Final Outcome Decision Buttons -->
        <div class="row items-center q-gutter-x-sm">
          <q-btn
            unelevated
            dense
            color="grey-8"
            icon="cancel"
            label="Rifiuta / Archivia (Lost)"
            no-caps
            class="text-weight-bold"
            :disable="localOutcome === 'lost'"
            @click="handleOutcomeLost"
          />
          <q-btn
            unelevated
            dense
            color="positive"
            icon="star"
            label="Accetta & Concludi (Won)"
            no-caps
            class="text-weight-bold shadow-2 text-dark bg-amber-5"
            style="background-color: #c5a065 !important; color: #0a2342 !important"
            :disable="localOutcome === 'won'"
            @click="handleOutcomeWon"
          />
        </div>
      </div>
    </template>
  </AppFloatingWindow>
</template>

<style scoped lang="scss">
.subtask-entity-card {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 12px 36px rgba(10, 35, 66, 0.25);
}

.elite-header {
  background: linear-gradient(135deg, #0a2342 0%, #113460 100%);
  border-bottom: 2px solid #c5a065;
}

.border-bottom-light {
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.border-bottom-dashed {
  border-bottom: 1px dashed rgba(0, 0, 0, 0.1);
}

.border-top-light {
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

.border-light {
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.letter-spacing {
  letter-spacing: 0.5px;
}

.subtask-notes-input :deep(.q-field__native) {
  font-family: inherit;
  font-size: 0.9rem;
  line-height: 1.5;
}

.subtask-timeline :deep(.q-timeline__title) {
  font-size: 0.85rem;
  font-weight: 700;
  color: #0a2342;
}

.subtask-timeline :deep(.q-timeline__subtitle) {
  font-size: 0.72rem;
  color: #757575;
}
</style>
