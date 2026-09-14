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
import { getFirestore, doc, updateDoc, serverTimestamp } from "firebase/firestore";

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

// ── Stores ───────────────────────────────────────────────────────────────────
import { useAuthStore } from "../stores/authStore";

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
const logger = useSecureLogger();

// ── State ─────────────────────────────────────────────────────────────────────
const isOpen = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit("update:modelValue", val),
});

const activeTab = ref<"attributes" | "notes" | "timeline" | "miniTasks">("attributes");

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
  <q-dialog v-model="isOpen" persistent transition-show="scale" transition-hide="scale">
    <q-card
      v-if="subtask"
      class="subtask-entity-card column no-wrap"
      style="
        width: 860px;
        max-width: 95vw;
        height: 86vh;
        max-height: 86vh;
        background-color: #fcfbfa;
      "
    >
      <!-- ── Header Elite ──────────────────────────────────────────────────────── -->
      <div
        class="q-pa-md bg-royal-navy text-white row items-center justify-between no-wrap elite-header"
      >
        <div class="row items-center no-wrap ellipsis q-mr-sm" style="flex: 1">
          <q-avatar
            size="44px"
            font-size="24px"
            color="amber-9"
            text-color="dark"
            :icon="domainConfig.entityIcon"
            class="shadow-2 q-mr-md"
          />
          <div class="column ellipsis" style="flex: 1">
            <div class="row items-center q-gutter-x-sm no-wrap">
              <span class="text-subtitle1 text-weight-bolder text-white ellipsis">
                {{ subtask.title }}
              </span>
              <q-badge
                v-if="subtask.entityExternalId"
                outline
                color="amber-4"
                :label="subtask.entityExternalId"
                class="text-weight-bold"
              />
              <q-badge
                dense
                color="navy-light"
                text-color="grey-4"
                :label="domainConfig.domainLabel"
              />
            </div>
            <div v-if="subtask.subtitle" class="text-caption text-grey-4 ellipsis q-mt-xs">
              {{ subtask.subtitle }}
            </div>
          </div>
        </div>

        <!-- Right Header Controls: Status Dropdown & Outcome -->
        <div class="row items-center q-gutter-x-sm no-wrap">
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

          <!-- Close Icon -->
          <q-btn round dense flat color="grey-4" icon="close" @click="isOpen = false">
            <q-tooltip>Chiudi Scheda Risorsa</q-tooltip>
          </q-btn>
        </div>
      </div>

      <!-- ── Subheader Navigation Tabs ────────────────────────────────────────── -->
      <div class="bg-white border-bottom-light">
        <q-tabs
          v-model="activeTab"
          dense
          active-color="amber-9"
          indicator-color="amber-9"
          align="left"
          class="text-grey-8"
        >
          <q-tab name="attributes" icon="info" label="Dati Ereditati" class="q-px-md" />
          <q-tab name="notes" icon="edit_note" label="Note Operative" class="q-px-md">
            <q-badge v-if="hasUnsavedNotes" color="deep-orange" floating rounded />
          </q-tab>
          <q-tab name="timeline" icon="history" label="Timeline Privata" class="q-px-md">
            <q-badge
              v-if="subtask.timeline && subtask.timeline.length > 0"
              color="primary"
              floating
              rounded
              :label="subtask.timeline.length"
            />
          </q-tab>
          <q-tab name="miniTasks" icon="checklist" label="Mini-Task Checklist" class="q-px-md">
            <q-badge
              v-if="subtask.nestedTasks && subtask.nestedTasks.length > 0"
              color="teal-7"
              floating
              rounded
              :label="`${subtask.nestedTasks.filter((t) => t.completed).length}/${subtask.nestedTasks.length}`"
            />
          </q-tab>
        </q-tabs>
      </div>

      <!-- ── Tab Panels Content ────────────────────────────────────────────────── -->
      <q-tab-panels v-model="activeTab" animated class="col scroll bg-transparent">
        <!-- ── PANEL 1: Dati Ereditati & Attributi ─────────────────────────────── -->
        <q-tab-panel name="attributes" class="q-pa-md">
          <div class="row q-col-gutter-md">
            <!-- Left Info Card -->
            <div class="col-12 col-md-7">
              <q-card flat bordered class="rounded-borders bg-white q-pa-md shadow-1">
                <div class="row items-center justify-between q-mb-sm">
                  <div
                    class="text-caption text-weight-bold text-primary text-uppercase letter-spacing"
                  >
                    Dettagli Estratti dalla Tabella
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

                <div v-else class="text-caption text-grey-6 q-pa-md text-center">
                  Nessun valore tabellare ereditato presente.
                </div>
              </q-card>
            </div>

            <!-- Right Meta & Status Card -->
            <div class="col-12 col-md-5">
              <q-card flat bordered class="rounded-borders bg-white q-pa-md shadow-1">
                <div
                  class="text-caption text-weight-bold text-primary text-uppercase q-mb-sm letter-spacing"
                >
                  Stato & Tracciamento Risorsa
                </div>

                <div class="q-gutter-y-sm">
                  <div
                    class="row justify-between items-center text-caption q-py-xs border-bottom-dashed"
                  >
                    <span class="text-grey-7">Dominio Applicativo:</span>
                    <span class="text-weight-bold text-dark">{{ domainConfig.domainLabel }}</span>
                  </div>
                  <div
                    class="row justify-between items-center text-caption q-py-xs border-bottom-dashed"
                  >
                    <span class="text-grey-7">Stato Operativo:</span>
                    <q-badge :color="currentStatusObj.color" :label="currentStatusObj.label" />
                  </div>
                  <div
                    class="row justify-between items-center text-caption q-py-xs border-bottom-dashed"
                  >
                    <span class="text-grey-7">Esito Finale:</span>
                    <span
                      class="text-weight-bold"
                      :class="{
                        'text-positive': localOutcome === 'won',
                        'text-negative': localOutcome === 'lost',
                        'text-primary': localOutcome === 'in_progress',
                      }"
                    >
                      {{
                        localOutcome === "won"
                          ? "Accettato (Won)"
                          : localOutcome === "lost"
                            ? "Archiviato (Lost)"
                            : "In Corso"
                      }}
                    </span>
                  </div>
                  <div
                    class="row justify-between items-center text-caption q-py-xs border-bottom-dashed"
                  >
                    <span class="text-grey-7">Data Creazione:</span>
                    <span class="text-grey-8">{{ formatEventDate(subtask.createdAt) }}</span>
                  </div>
                  <div class="row justify-between items-center text-caption q-py-xs">
                    <span class="text-grey-7">Ultimo Aggiornamento:</span>
                    <span class="text-grey-8">{{ formatEventDate(subtask.updatedAt) }}</span>
                  </div>
                </div>

                <!-- Unidirectional Sync Boundary Banner (Requisito 4.9) -->
                <div
                  class="q-mt-md q-pa-sm bg-blue-1 text-primary text-caption rounded-borders row items-center no-wrap"
                >
                  <q-icon name="sync_disabled" size="20px" class="q-mr-xs text-primary" />
                  <span>
                    <strong>Isolamento Garantito:</strong> Le modifiche allo stato e le note sono
                    registrate esclusivamente in OpsFlow senza sovrascrivere le celle del Google
                    Sheet originale.
                  </span>
                </div>
              </q-card>
            </div>
          </div>
        </q-tab-panel>

        <!-- ── PANEL 2: Note Operative ─────────────────────────────────────────── -->
        <q-tab-panel name="notes" class="q-pa-md">
          <q-card flat bordered class="rounded-borders bg-white q-pa-md shadow-1">
            <div class="row items-center justify-between q-mb-sm">
              <div class="row items-center">
                <q-icon name="sticky_note_2" color="amber-9" size="22px" class="q-mr-xs" />
                <span class="text-subtitle2 text-weight-bold text-primary">
                  Note Operative & Appunti di Contatto
                </span>
              </div>

              <div class="row items-center q-gutter-x-sm">
                <q-badge
                  v-if="hasUnsavedNotes"
                  outline
                  color="deep-orange"
                  label="Modifiche non salvate"
                />
                <q-btn
                  unelevated
                  size="sm"
                  color="primary"
                  icon="save"
                  label="Salva Note"
                  :loading="isSavingNotes"
                  @click="handleSaveNotes"
                />
              </div>
            </div>

            <!-- Healthcare Alert (GDPR Art. 9) -->
            <div
              v-if="subtask.domain === 'healthcare'"
              class="q-mb-md q-pa-sm bg-amber-1 text-amber-10 text-caption rounded-borders row items-center"
            >
              <q-icon name="security" size="18px" class="q-mr-xs" />
              <span>
                <strong>Healthcare Privacy (GDPR Art. 9):</strong> Inserire solo informazioni
                pertinenti; tutti i dati clinici e PII sono protetti e isolati per tenant.
              </span>
            </div>

            <q-input
              v-model="localNotes"
              type="textarea"
              outlined
              autogrow
              rows="8"
              placeholder="Inserisci note sulla risorsa, riassunto colloqui, disponibilità, richieste economiche o specifiche contrattuali..."
              class="subtask-notes-input"
              @update:model-value="hasUnsavedNotes = true"
            />
          </q-card>
        </q-tab-panel>

        <!-- ── PANEL 3: Timeline Privata dell'Entità ────────────────────────────── -->
        <q-tab-panel name="timeline" class="q-pa-md">
          <q-card flat bordered class="rounded-borders bg-white q-pa-md shadow-1">
            <div class="row items-center justify-between q-mb-md">
              <div>
                <div class="text-subtitle2 text-weight-bold text-primary">
                  Storico Cronologico delle Interazioni
                </div>
                <div class="text-caption text-grey-6">
                  Traccia ogni contatto, esito di colloquio o aggiornamento formale per questa
                  specifica risorsa.
                </div>
              </div>

              <!-- Quick Log Action Bar -->
              <div class="row items-center q-gutter-xs">
                <q-btn
                  outline
                  dense
                  size="sm"
                  color="primary"
                  icon="call"
                  label="Chiamata"
                  @click="openAddEvent('call')"
                />
                <q-btn
                  outline
                  dense
                  size="sm"
                  color="teal-7"
                  icon="mail"
                  label="Email"
                  @click="openAddEvent('email')"
                />
                <q-btn
                  outline
                  dense
                  size="sm"
                  color="green-8"
                  icon="chat"
                  label="WhatsApp"
                  @click="openAddEvent('whatsapp')"
                />
                <q-btn
                  outline
                  dense
                  size="sm"
                  color="amber-9"
                  icon="post_add"
                  label="Nota Rapida"
                  @click="openAddEvent('note')"
                />
              </div>
            </div>

            <!-- Quick Add Event Form -->
            <q-slide-transition>
              <div
                v-if="isAddingEvent"
                class="q-pa-md bg-grey-1 rounded-borders q-mb-md border-light"
              >
                <div class="row items-center justify-between q-mb-sm">
                  <div class="text-caption text-weight-bold text-primary">
                    Registra Nuova Interazione ({{ newEventType.toUpperCase() }})
                  </div>
                  <q-btn flat round dense size="xs" icon="close" @click="isAddingEvent = false" />
                </div>
                <div class="q-gutter-y-sm">
                  <q-input
                    v-model="newEventTitle"
                    dense
                    outlined
                    placeholder="Titolo evento (es. Chiamata conoscitiva con esito positivo)"
                    class="bg-white"
                  />
                  <q-input
                    v-model="newEventDesc"
                    dense
                    outlined
                    type="textarea"
                    rows="2"
                    placeholder="Dettagli / note opzionali..."
                    class="bg-white"
                  />
                  <div class="row justify-end q-gutter-x-sm">
                    <q-btn flat size="sm" label="Annulla" @click="isAddingEvent = false" />
                    <q-btn
                      unelevated
                      size="sm"
                      color="primary"
                      label="Salva Evento"
                      :loading="isSavingEvent"
                      @click="handleAddTimelineEvent"
                    />
                  </div>
                </div>
              </div>
            </q-slide-transition>

            <!-- Chronological Timeline List -->
            <div v-if="subtask.timeline && subtask.timeline.length > 0" class="q-px-sm">
              <q-timeline color="amber-9" class="subtask-timeline">
                <q-timeline-entry
                  v-for="evt in subtask.timeline"
                  :key="evt.id"
                  :title="evt.title"
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
                >
                  <div v-if="evt.description" class="text-caption text-grey-8 q-mt-xs">
                    {{ evt.description }}
                  </div>
                  <div class="text-caption text-grey-5 q-mt-xs" style="font-size: 0.72rem">
                    Registrato da: {{ evt.authorName }}
                  </div>
                </q-timeline-entry>
              </q-timeline>
            </div>

            <div v-else class="text-caption text-grey-6 text-center q-pa-lg">
              Nessun evento registrato nella timeline privata. Utilizza i pulsanti in alto per
              registrare una chiamata o una nota.
            </div>
          </q-card>
        </q-tab-panel>

        <!-- ── PANEL 4: Mini-Task Checklist ────────────────────────────────────── -->
        <q-tab-panel name="miniTasks" class="q-pa-md">
          <q-card flat bordered class="rounded-borders bg-white q-pa-md shadow-1">
            <div class="row items-center justify-between q-mb-md">
              <div>
                <div class="text-subtitle2 text-weight-bold text-primary">
                  Mini-Task Operativi Nidificati
                </div>
                <div class="text-caption text-grey-6">
                  Azioni concrete necessarie per finalizzare la risorsa (es. invio modulo, verifica
                  referenze, ricezione contratto).
                </div>
              </div>
            </div>

            <!-- Add Mini Task Input -->
            <div class="row q-gutter-x-sm items-center q-mb-md">
              <q-input
                v-model="newMiniTaskTitle"
                dense
                outlined
                placeholder="Nuova sotto-azione (es. Inviare accordo di riservatezza entro giovedì)"
                class="col bg-grey-1"
                @keyup.enter="handleAddMiniTask"
              />
              <q-btn
                unelevated
                color="primary"
                icon="add"
                label="Aggiungi"
                :loading="isSavingMiniTask"
                @click="handleAddMiniTask"
              />
            </div>

            <!-- Mini Tasks List -->
            <div v-if="subtask.nestedTasks && subtask.nestedTasks.length > 0">
              <q-list dense separator class="rounded-borders border-light">
                <q-item
                  v-for="(mt, mtIdx) in subtask.nestedTasks"
                  :key="mt.id || mtIdx"
                  class="q-py-xs"
                >
                  <q-item-section avatar style="min-width: 32px">
                    <q-checkbox
                      :model-value="mt.completed"
                      color="positive"
                      dense
                      size="sm"
                      @update:model-value="handleToggleMiniTask(mtIdx)"
                    />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label
                      class="text-caption"
                      :class="{
                        'text-strike text-grey-5': mt.completed,
                        'text-weight-medium text-dark': !mt.completed,
                      }"
                    >
                      {{ mt.title }}
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-btn
                      flat
                      dense
                      round
                      size="xs"
                      icon="delete_outline"
                      color="negative"
                      @click="handleDeleteMiniTask(mtIdx)"
                    >
                      <q-tooltip>Elimina mini-task</q-tooltip>
                    </q-btn>
                  </q-item-section>
                </q-item>
              </q-list>
            </div>

            <div v-else class="text-caption text-grey-6 text-center q-pa-lg">
              Nessun mini-task inserito per questa risorsa. Aggiungine uno con il box in alto.
            </div>
          </q-card>
        </q-tab-panel>
      </q-tab-panels>

      <!-- ── Footer Actions Elite ──────────────────────────────────────────────── -->
      <div class="q-pa-md bg-white border-top-light row items-center justify-between no-wrap">
        <div class="row items-center q-gutter-x-sm">
          <q-btn flat dense color="grey-7" label="Chiudi" @click="isOpen = false" />
          <q-btn
            v-if="localOutcome === 'won' || localOutcome === 'lost'"
            outline
            dense
            size="sm"
            color="primary"
            icon="restart_alt"
            label="Riapri Scheda Risorsa"
            class="q-px-sm"
            @click="handleReopenEntity"
          />
        </div>

        <!-- Final Outcome Decision Buttons -->
        <div class="row items-center q-gutter-x-sm">
          <q-btn
            unelevated
            dense
            color="grey-8"
            icon="cancel"
            label="Rifiuta / Archivia (Lost)"
            class="q-px-md text-weight-bold"
            :disable="localOutcome === 'lost'"
            @click="handleOutcomeLost"
          />
          <q-btn
            unelevated
            dense
            color="positive"
            icon="star"
            label="Accetta & Concludi (Won)"
            class="q-px-md text-weight-bold shadow-2 text-dark bg-amber-5"
            style="background-color: #c5a065 !important; color: #0a2342 !important"
            :disable="localOutcome === 'won'"
            @click="handleOutcomeWon"
          />
        </div>
      </div>
    </q-card>
  </q-dialog>
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
