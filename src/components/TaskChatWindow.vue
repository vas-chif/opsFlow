<!--
  @file TaskChatWindow.vue
  @description Draggable & Resizable Multi-Window Task Chat component for OpsFlow.
  @author Vasile Chifeac
  @created 2026-07-31
  @modified 2026-08-30 (Step 12 Fase 3: TaskKeyPointsCard.vue integration, rolling key points parser, europe-west1 endpoint)
-->

<script setup lang="ts">
// ── Vue & Framework ──────────────────────────────────────────────────────────
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useQuasar, copyToClipboard } from "quasar";

// ── Firebase ─────────────────────────────────────────────────────────────────
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  limit,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

// ── Types ────────────────────────────────────────────────────────────────────
import type {
  Task,
  TaskStatus,
  TaskKeyPoint,
  KeyPointCategory,
  TaskTimelineEvent,
  TaskChatMessage,
  ApprovalRecord,
  LinkedGoogleResource,
  ScheduledSourcingJob,
  EntitySubTask,
  EntitySubTaskStatus,
} from "../types/models";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useAuthStore } from "../stores/authStore";
import { useTaskStore } from "../stores/taskStore";
import { useTaskChatStore, type FloatingWindow } from "../stores/taskChatStore";
import { useTimelineStore } from "../stores/timelineStore";

// ── Composables ──────────────────────────────────────────────────────────────
import { useSecureLogger } from "../composables/useSecureLogger";
import { useWebSpeech } from "../composables/useWebSpeech";

// ── Components ───────────────────────────────────────────────────────────────
import TaskKeyPointsCard from "./TaskKeyPointsCard.vue";
import ApprovalCard from "./ApprovalCard.vue";
import TaskSettingsModal from "./TaskSettingsModal.vue";
import ScheduleTaskModal from "./ScheduleTaskModal.vue";
import SubTaskEntityModal from "./SubTaskEntityModal.vue";
import CreateSubtaskModal from "./CreateSubtaskModal.vue";
import AITaskArchitectModal from "./AITaskArchitectModal.vue";

const props = defineProps<{
  windowState: FloatingWindow;
}>();

const q = useQuasar();
const authStore = useAuthStore();
const taskStore = useTaskStore();
const chatStore = useTaskChatStore();
const timelineStore = useTimelineStore();
const logger = useSecureLogger();
const isResolvingApproval = ref<string | null>(null);
const {
  isListening,
  isSpeaking,
  isSttSupported,
  isTtsSupported,
  startListening,
  stopListening,
  speak,
  stopSpeaking,
} = useWebSpeech();

const task = computed(
  () => taskStore.tasks.find((t) => t.id === props.windowState.taskId) ?? props.windowState.task,
);
const workspace = computed(
  () =>
    taskStore.workspaces.find(
      (w) =>
        w.id === props.windowState.workspaceId ||
        w.name === props.windowState.workspaceId ||
        w.id === task.value?.workspaceId,
    ) ?? null,
);

const allAvailableSheets = computed<LinkedGoogleResource[]>(() => {
  const map = new Map<string, LinkedGoogleResource>();

  // 1. Workspace linked sheets
  const wsSheets = workspace.value?.linkedResources?.linkedSheets;
  if (Array.isArray(wsSheets)) {
    for (const s of wsSheets) {
      if (s?.id) map.set(s.id, s);
    }
  }

  // 2. Legacy/default workspace sheet
  const defId = workspace.value?.linkedResources?.defaultSheetId;
  if (defId && !map.has(defId)) {
    map.set(defId, {
      id: defId,
      name: workspace.value?.linkedResources?.defaultSheetName || "Foglio Predefinito",
      type: "sheet",
      isMaster: true,
    });
  }

  // 3. Task-level selected sheets
  const taskSheets = task.value?.settings?.selectedSheets;
  if (Array.isArray(taskSheets)) {
    for (const s of taskSheets) {
      if (s?.id && !map.has(s.id)) map.set(s.id, s);
    }
  }

  return Array.from(map.values());
});

const chatMessage = ref("");
const isSending = ref(false);
const activeAbortController = ref<AbortController | null>(null);
const chatInputRef = ref<any>(null);
const chatScrollRef = ref<HTMLDivElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);

function triggerFileInput(): void {
  fileInputRef.value?.click();
} /*end triggerFileInput*/

function handleFileSelected(event: Event): void {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    selectedFile.value = target.files[0];
    q.notify({
      type: "info",
      message: `Documento allegato: ${selectedFile.value.name}`,
      icon: "attach_file",
    });
  }
} /*end handleFileSelected*/

function toggleVoiceDictation(): void {
  if (isListening.value) {
    stopListening();
  } else {
    const baseText = chatMessage.value.trim();
    const prefix = baseText ? `${baseText} ` : "";
    startListening((text) => {
      chatMessage.value = prefix + text;
    });
  }
} /*end toggleVoiceDictation*/

function handleSpeakMessage(text: string): void {
  if (isSpeaking.value) {
    stopSpeaking();
  } else {
    speak(text);
  }
} /*end handleSpeakMessage*/

// Drag state
const isDragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });
const initialPos = ref({ x: 0, y: 0 });

// UI window state (minimized, maximized, size, position)
const isExpanded = ref(false);
const showTaskSettingsModal = ref<boolean>(false);
const showScheduleModal = ref<boolean>(false);
const showRegenerateTaskModal = ref<boolean>(false);
const regenerateDraft = ref<string>("");
const isResizing = ref(false);
const resizeStart = ref({ x: 0, y: 0, w: 0, h: 0 });

// Step 19: Active Scheduled Sourcing Job state & management
const activeScheduledJob = ref<ScheduledSourcingJob | null>(null);

const isTaskClosed = computed(() => {
  return task.value?.status === "completed" || task.value?.status === "cancelled";
});

const scheduledJobStatusColor = computed<string>(() => {
  if (!activeScheduledJob.value) return "grey-6";
  if (isTaskClosed.value) return "grey-6";
  switch (activeScheduledJob.value.status) {
    case "active":
      return "positive";
    case "paused":
      return "warning";
    case "completed":
      return "grey-7";
    default:
      return "grey-6";
  }
});

const scheduledJobStatusIcon = computed<string>(() => {
  if (!activeScheduledJob.value) return "schedule";
  if (isTaskClosed.value) return "pause_circle";
  switch (activeScheduledJob.value.status) {
    case "active":
      return "schedule";
    case "paused":
      return "pause_circle";
    case "completed":
      return "check_circle";
    default:
      return "schedule";
  }
});

const scheduledJobStatusLabel = computed<string>(() => {
  if (!activeScheduledJob.value) return "";
  if (isTaskClosed.value) return "⏸️ In Pausa (Task Chiuso)";
  switch (activeScheduledJob.value.status) {
    case "active":
      return "⏰ 04:00 AM Attiva";
    case "paused":
      return "⏸️ In Pausa";
    case "completed":
      return "✔️ Conclusa";
    default:
      return "⏰ Programmata";
  }
});

let isFetchingScheduledJob = false;
const fetchActiveScheduledJob = async (): Promise<void> => {
  if (isFetchingScheduledJob) return;
  const tId = authStore.tenantId;
  const wsId = workspace.value?.id || task.value?.workspaceId;
  const taskId = task.value?.id;
  if (!tId || !wsId || !taskId) return;

  isFetchingScheduledJob = true;
  try {
    const db = getFirestore();
    const qCol = query(
      collection(db, "tenants", tId, "workspaces", wsId, "scheduledJobs"),
      where("taskId", "==", taskId),
      limit(1),
    );
    const snap = await getDocs(qCol);
    if (!snap.empty && snap.docs[0]) {
      activeScheduledJob.value = {
        id: snap.docs[0].id,
        ...(snap.docs[0].data() as Omit<ScheduledSourcingJob, "id">),
      };
    } else {
      activeScheduledJob.value = null;
    }
  } catch (err: unknown) {
    const firebaseErr = err as { code?: string; message?: string };
    logger.warn("TaskChatWindow", "Failed to fetch active scheduled job", {
      code: firebaseErr.code || "unknown",
      message: firebaseErr.message || String(err),
    });
  } finally {
    isFetchingScheduledJob = false;
  }
}; /*end fetchActiveScheduledJob*/

const handleScheduledJobSaved = (job: ScheduledSourcingJob): void => {
  activeScheduledJob.value = job;
}; /*end handleScheduledJobSaved*/

const handleScheduledJobDeleted = (): void => {
  activeScheduledJob.value = null;
}; /*end handleScheduledJobDeleted*/

// ── Step 20: Polymorphic Entity SubTasks State ─────────────────────────────
const subtasks = ref<EntitySubTask[]>([]);
const selectedSubtask = ref<EntitySubTask | null>(null);

// ── Step 21 §2: Live Editing Card State ─────────────────────────────────────
/** Dialog state for editing the Task Description directly from the right panel. */
const showEditDescriptionDialog = ref<boolean>(false);
const editDescriptionDraft = ref<string>("");

/** Dialog state for editing AI Subtasks (from aiMetadata.subtasks) from the right panel. */
const showEditSubtasksDialog = ref<boolean>(false);
const editSubtasksDraft = ref<import("../types/models").SubTask[]>([]);

const openEditDescriptionDialog = (): void => {
  editDescriptionDraft.value = task.value?.description || "";
  showEditDescriptionDialog.value = true;
}; /*end openEditDescriptionDialog*/

const saveEditedDescription = async (): Promise<void> => {
  if (!task.value || !workspace.value) return;
  try {
    await taskStore.updateTask(workspace.value.id, task.value.id, {
      description: editDescriptionDraft.value.trim(),
    });
    showEditDescriptionDialog.value = false;
    q.notify({
      type: "positive",
      message: "Descrizione aggiornata!",
      icon: "edit_note",
      position: "top",
      timeout: 1500,
    });
  } catch (err) {
    q.notify({
      type: "negative",
      message: `Errore: ${err instanceof Error ? err.message : String(err)}`,
      position: "top",
    });
  }
}; /*end saveEditedDescription*/

const openEditSubtasksDialog = (): void => {
  editSubtasksDraft.value = JSON.parse(
    JSON.stringify(task.value?.aiMetadata?.subtasks ?? []),
  ) as import("../types/models").SubTask[];
  showEditSubtasksDialog.value = true;
}; /*end openEditSubtasksDialog*/

const saveEditedSubtasks = async (): Promise<void> => {
  if (!task.value || !workspace.value) return;
  try {
    await taskStore.updateTask(workspace.value.id, task.value.id, {
      aiMetadata: {
        ...task.value.aiMetadata,
        subtasks: editSubtasksDraft.value,
      },
    });
    showEditSubtasksDialog.value = false;
    q.notify({
      type: "positive",
      message: "Sotto-Task aggiornate!",
      icon: "checklist",
      position: "top",
      timeout: 1500,
    });
  } catch (err) {
    q.notify({
      type: "negative",
      message: `Errore: ${err instanceof Error ? err.message : String(err)}`,
      position: "top",
    });
  }
}; /*end saveEditedSubtasks*/

const addEditSubtaskItem = (): void => {
  editSubtasksDraft.value.push({
    id: `st-${Date.now()}`,
    taskId: task.value?.id || "",
    tenantId: "",
    title: "",
    description: "",
    completed: false,
    order: editSubtasksDraft.value.length + 1,
    createdAt: new Date(),
  });
}; /*end addEditSubtaskItem*/

const removeEditSubtaskItem = (idx: number): void => {
  editSubtasksDraft.value.splice(idx, 1);
}; /*end removeEditSubtaskItem*/

const showSubtaskModal = ref<boolean>(false);
const isLoadingSubtasks = ref<boolean>(false);

const fetchSubtasks = async (): Promise<void> => {
  const tId = authStore.tenantId;
  const wsId = workspace.value?.id || task.value?.workspaceId;
  const taskId = task.value?.id;
  if (!tId || !wsId || !taskId) return;

  isLoadingSubtasks.value = true;
  try {
    const db = getFirestore();
    const subCol = collection(db, "tenants", tId, "workspaces", wsId, "tasks", taskId, "subtasks");
    const snap = await getDocs(subCol);
    const list: EntitySubTask[] = [];
    snap.forEach((d) => {
      list.push({ id: d.id, ...(d.data() as Omit<EntitySubTask, "id">) });
    });
    list.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    subtasks.value = list;
  } catch (err: unknown) {
    logger.warn("TaskChatWindow", "Failed to fetch subtasks", err);
  } finally {
    isLoadingSubtasks.value = false;
  }
}; /*end fetchSubtasks*/

const openSubtaskModal = (st: EntitySubTask): void => {
  selectedSubtask.value = st;
  showSubtaskModal.value = true;
}; /*end openSubtaskModal*/

const handleSubtaskSaved = (updated: EntitySubTask): void => {
  const idx = subtasks.value.findIndex((s) => s.id === updated.id);
  if (idx >= 0) {
    subtasks.value[idx] = updated;
  } else {
    subtasks.value.push(updated);
  }
  selectedSubtask.value = updated;
}; /*end handleSubtaskSaved*/

const handleSubtaskDeleted = (subtaskId: string): void => {
  subtasks.value = subtasks.value.filter((s) => s.id !== subtaskId);
  showSubtaskModal.value = false;
  selectedSubtask.value = null;
}; /*end handleSubtaskDeleted*/

const isDeletingSubtask = ref<boolean>(false);

const promptDeleteSubtask = (st: EntitySubTask): void => {
  q.dialog({
    title: "Elimina Sub-Task",
    message: `Sei sicuro di voler eliminare definitivamente la risorsa "${st.title}"? L'elemento verrà rimosso sia da Firebase che dall'elenco locale.`,
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
    isDeletingSubtask.value = true;
    try {
      const tenantId = authStore.tenantId || st.tenantId;
      const workspaceId = st.workspaceId || workspace.value?.id || task.value?.workspaceId;
      const taskId = st.taskId || task.value?.id;
      if (!tenantId || !workspaceId || !taskId) return;

      const db = getFirestore();
      const subtaskRef = doc(
        db,
        `tenants/${tenantId}/workspaces/${workspaceId}/tasks/${taskId}/subtasks/${st.id}`,
      );
      await deleteDoc(subtaskRef);
      subtasks.value = subtasks.value.filter((s) => s.id !== st.id);
      if (selectedSubtask.value?.id === st.id) {
        showSubtaskModal.value = false;
        selectedSubtask.value = null;
      }
      logger.info("TaskChatWindow", `Subtask ${st.id} permanently deleted from Firestore`);
      q.notify({
        type: "positive",
        message: `Sub-task "${st.title}" eliminato con successo.`,
        position: "top",
      });
    } catch (err: unknown) {
      logger.error("TaskChatWindow", "Error deleting subtask from Firestore", err);
      q.notify({
        type: "negative",
        message: "Errore durante l'eliminazione del sub-task.",
        position: "top",
      });
    } finally {
      isDeletingSubtask.value = false;
    }
  });
}; /*end promptDeleteSubtask*/

const showCreateSubtaskModal = ref<boolean>(false);

const handleCreateManualSubtask = (): void => {
  showCreateSubtaskModal.value = true;
}; /*end handleCreateManualSubtask*/

const handleSubtaskCreated = (newSt: EntitySubTask): void => {
  const idx = subtasks.value.findIndex((s) => s.id === newSt.id);
  if (idx >= 0) {
    subtasks.value[idx] = newSt;
  } else {
    subtasks.value.push(newSt);
  }
  openSubtaskModal(newSt);
}; /*end handleSubtaskCreated*/

const handleOpenOrSyncSheet = (): void => {
  const sheetId = task.value?.settings?.selectedSheetId;
  if (sheetId) {
    window.open(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`, "_blank");
  } else {
    handleSendCustomPrompt(
      "Salva, sincronizza e organizza i sub-task e le risorse nel foglio Google Sheets predefinito.",
    );
  }
}; /*end handleOpenOrSyncSheet*/

const handleEmailAction = (): void => {
  handleSendCustomPrompt(
    "Genera una bozza email formale di contatto e follow-up per le risorse operative monitorate in questo task.",
  );
}; /*end handleEmailAction*/

const isInProgressEntry = (entry: TaskTimelineEvent): boolean => {
  return (
    entry.status === "in-progress" ||
    entry.title.toLowerCase().includes("in progress") ||
    (entry.description ? entry.description.toLowerCase().includes("in progress") : false)
  );
}; /*end isInProgressEntry*/

const isTargetSubtasksEntry = (entry: TaskTimelineEvent): boolean => {
  const entries = activeSession.value.timelineEvents || [];
  const inProgressEntries = entries.filter(isInProgressEntry);
  if (inProgressEntries.length > 0) {
    return entry.id === inProgressEntries[inProgressEntries.length - 1]!.id;
  }
  if (task.value?.status === "in-progress") {
    return entries.length > 0 && entry.id === entries[entries.length - 1]!.id;
  }
  return false;
}; /*end isTargetSubtasksEntry*/

const getSubtaskStatusBadge = (status: EntitySubTaskStatus): { label: string; color: string } => {
  switch (status) {
    case "new":
      return { label: "Da Contattare", color: "blue-6" };
    case "contacted":
      return { label: "Contattato", color: "light-blue-7" };
    case "waiting_response":
      return { label: "In Attesa", color: "amber-8" };
    case "negotiation":
      return { label: "In Trattativa", color: "purple-6" };
    case "positive_response":
      return { label: "Positiva", color: "teal-6" };
    case "negative_response":
      return { label: "Negativa", color: "deep-orange-7" };
    case "follow_up":
      return { label: "Follow-up", color: "indigo-6" };
    case "completed":
      return { label: "Completato", color: "positive" };
    default:
      return { label: status, color: "grey-6" };
  }
}; /*end getSubtaskStatusBadge*/

const subtaskFinishedCount = computed(() => {
  return subtasks.value.filter(
    (s) => s.outcome === "won" || s.outcome === "lost" || s.status === "completed",
  ).length;
});

// Macro Rollup Computed (Requirement 4.10)
const allSubtasksFinished = computed(() => {
  if (subtasks.value.length === 0) return false;
  if (task.value?.status === "completed" || task.value?.status === "cancelled") return false;
  return subtasks.value.every((s) => s.outcome === "won" || s.outcome === "lost");
});

const subtaskWonCount = computed(() => subtasks.value.filter((s) => s.outcome === "won").length);
const subtaskLostCount = computed(() => subtasks.value.filter((s) => s.outcome === "lost").length);

// Fullscreen & Layout View Mode
const isFullscreen = computed(() => !!props.windowState.isFullscreen);
const viewMode = ref<"both" | "details" | "chat" | "timeline">("both");
const splitterModel = ref(46); // balanced default: left details, right chat + timeline

// Timeline section: default CLOSED (showTimeline = false), persisted via Pinia
const showTimeline = computed(() => timelineStore.showTimeline);
const chatTimelineSplitterModel = ref(
  timelineStore.showTimeline ? timelineStore.savedSplitterRatio : 100,
);

// Persist user-adjusted splitter ratio when timeline is open
watch(chatTimelineSplitterModel, (newVal) => {
  if (timelineStore.showTimeline && newVal < 98) {
    timelineStore.setSplitterRatio(newVal);
  }
});

const showNoteDialog = ref(false);
const selectedTimelineEntry = ref<TaskTimelineEvent | null>(null);
const currentNoteText = ref("");

const timelineLayout = computed({
  get: () => timelineStore.timelineLayout,
  set: (val) => timelineStore.setTimelineLayout(val),
});

const timelineSide = computed({
  get: () => timelineStore.timelineSide,
  set: (val) => timelineStore.setTimelineSide(val),
});

const toggleTimeline = (): void => {
  timelineStore.toggleTimeline();
  if (!timelineStore.showTimeline) {
    chatTimelineSplitterModel.value = 100;
  } else {
    chatTimelineSplitterModel.value =
      timelineStore.savedSplitterRatio < 100 ? timelineStore.savedSplitterRatio : 62;
  }
}; /*end toggleTimeline*/

const openNoteDialog = (entry: TaskTimelineEvent): void => {
  selectedTimelineEntry.value = entry;
  currentNoteText.value = entry.note || "";
  showNoteDialog.value = true;
}; /*end openNoteDialog*/

const saveNote = (): void => {
  if (!selectedTimelineEntry.value || !task.value) return;
  chatStore.updateTimelineEventNote(
    task.value.id,
    selectedTimelineEntry.value.id,
    currentNoteText.value.trim(),
    true,
  );
  showNoteDialog.value = false;
  q.notify({
    type: "positive",
    message: "Nota salvata sulla timeline",
    position: "top",
    timeout: 1500,
  });
}; /*end saveNote*/

const deleteNote = (): void => {
  if (!selectedTimelineEntry.value || !task.value) return;
  chatStore.updateTimelineEventNote(task.value.id, selectedTimelineEntry.value.id, undefined, true);
  showNoteDialog.value = false;
  q.notify({
    type: "info",
    message: "Nota rimossa dallo step",
    position: "top",
    timeout: 1500,
  });
}; /*end deleteNote*/

const toggleNoteVisibility = (entry: TaskTimelineEvent): void => {
  if (!task.value) return;
  const newVisibility = entry.showNote === false;
  chatStore.updateTimelineEventNote(task.value.id, entry.id, entry.note, newVisibility);
}; /*end toggleNoteVisibility*/

const handleEntryClick = (e: MouseEvent, entry: TaskTimelineEvent): void => {
  const target = e.target as HTMLElement | null;
  if (target && (target.closest(".q-timeline__dot") || target.closest(".q-timeline__icon"))) {
    openNoteDialog(entry);
  }
}; /*end handleEntryClick*/

const setViewMode = (mode: "both" | "details" | "chat" | "timeline"): void => {
  viewMode.value = mode;
  if (mode === "details") {
    splitterModel.value = 100;
  } else if (mode === "chat") {
    splitterModel.value = 0;
  } else {
    splitterModel.value = 46;
  }
}; /*end setViewMode*/

const toggleFullscreen = (): void => {
  chatStore.toggleFullscreenWindow(props.windowState.taskId);
}; /*end toggleFullscreen*/

const handleKeyDown = (e: KeyboardEvent): void => {
  if (e.key === "Escape" && isFullscreen.value) {
    toggleFullscreen();
  }
}; /*end handleKeyDown*/

const sendToBack = (): void => {
  chatStore.sendToBack(props.windowState.taskId);
}; /*end sendToBack*/

const activeSession = computed(() => {
  return chatStore.openSession(props.windowState.taskId, props.windowState.workspaceId);
});

const statusOptions: { label: string; value: TaskStatus; color: string; icon: string }[] = [
  { label: "Pending", value: "pending", color: "amber-5", icon: "schedule" },
  { label: "In Progress", value: "in-progress", color: "cyan-4", icon: "play_arrow" },
  { label: "Completed", value: "completed", color: "positive", icon: "check_circle" },
  { label: "Cancelled", value: "cancelled", color: "grey-5", icon: "cancel" },
];

const defaultStatusObj = statusOptions[0]!;
const currentStatusObj = computed(() => {
  return statusOptions.find((s) => s.value === task.value.status) ?? defaultStatusObj;
});

const formatDateTime = (d: unknown): string => {
  if (!d) {
    return new Date().toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  try {
    const dateObj =
      typeof (d as { toDate?: () => Date }).toDate === "function"
        ? (d as { toDate: () => Date }).toDate()
        : new Date(d as string | number | Date);
    if (isNaN(dateObj.getTime())) {
      return new Date().toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return dateObj.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date().toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}; /*end formatDateTime*/

const initTaskTimeline = (): void => {
  if (!task.value) return;
  const taskId = task.value.id;
  const session = activeSession.value;
  if (!session.timelineEvents || session.timelineEvents.length === 0) {
    const createdTime = formatDateTime(task.value.createdAt);
    chatStore.appendTimelineEvent(taskId, {
      id: `tle-create-${taskId}`,
      taskId,
      status: "pending",
      title: "Inizializzazione Task",
      subtitle: createdTime,
      description: "Task creato nel workspace",
      icon: "add_task",
      color: "primary",
      timestamp: createdTime,
    });

    if (task.value.status && task.value.status !== "pending") {
      const sObj = statusOptions.find((s) => s.value === task.value?.status) ?? defaultStatusObj;
      const updatedTime = formatDateTime(task.value.updatedAt);
      chatStore.appendTimelineEvent(taskId, {
        id: `tle-curr-${taskId}-${task.value.status}`,
        taskId,
        status: task.value.status,
        title: sObj.label,
        subtitle: updatedTime,
        description: `Stato avanzato a ${sObj.label}`,
        icon: sObj.icon,
        color: sObj.color,
        timestamp: updatedTime,
      });
    }
  }
}; /*end initTaskTimeline*/

onMounted(() => {
  window.addEventListener("keydown", handleKeyDown);
  initTaskTimeline();
});

watch(
  () => task.value?.id,
  (newTaskId) => {
    if (newTaskId) {
      fetchActiveScheduledJob();
      fetchSubtasks();
    } else {
      activeScheduledJob.value = null;
      subtasks.value = [];
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
});

const scrollToBottom = (): void => {
  nextTick(() => {
    if (chatScrollRef.value) {
      chatScrollRef.value.scrollTop = chatScrollRef.value.scrollHeight;
    }
  });
}; /*end scrollToBottom*/

watch(
  () => activeSession.value.messages.length,
  () => {
    scrollToBottom();
  },
  { immediate: true },
);

// ── Drag & Resize Handlers ───────────────────────────────────────────────────
const handleHeaderMouseDown = (e: MouseEvent): void => {
  chatStore.bringToFront(props.windowState.taskId);
  if (isFullscreen.value) return;
  isDragging.value = true;
  dragStart.value = { x: e.clientX, y: e.clientY };
  initialPos.value = { ...props.windowState.position };

  window.addEventListener("mousemove", handleHeaderMouseMove);
  window.addEventListener("mouseup", handleHeaderMouseUp);
}; /*end handleHeaderMouseDown*/

const handleHeaderMouseMove = (e: MouseEvent): void => {
  if (!isDragging.value) return;
  const deltaX = e.clientX - dragStart.value.x;
  const deltaY = e.clientY - dragStart.value.y;

  const newX = Math.max(10, Math.min(window.innerWidth - 200, initialPos.value.x + deltaX));
  const newY = Math.max(10, Math.min(window.innerHeight - 100, initialPos.value.y + deltaY));

  chatStore.updateWindowPosition(props.windowState.taskId, { x: newX, y: newY });
}; /*end handleHeaderMouseMove*/

const handleHeaderMouseUp = (): void => {
  isDragging.value = false;
  window.removeEventListener("mousemove", handleHeaderMouseMove);
  window.removeEventListener("mouseup", handleHeaderMouseUp);
}; /*end handleHeaderMouseUp*/

const handleResizeMouseDown = (e: MouseEvent): void => {
  e.stopPropagation();
  chatStore.bringToFront(props.windowState.taskId);
  isResizing.value = true;
  resizeStart.value = {
    x: e.clientX,
    y: e.clientY,
    w: props.windowState.size.width,
    h: props.windowState.size.height,
  };

  window.addEventListener("mousemove", handleResizeMouseMove);
  window.addEventListener("mouseup", handleResizeMouseUp);
}; /*end handleResizeMouseDown*/

const handleResizeMouseMove = (e: MouseEvent): void => {
  if (!isResizing.value) return;
  const deltaX = e.clientX - resizeStart.value.x;
  const deltaY = e.clientY - resizeStart.value.y;

  const newW = Math.max(
    480,
    Math.min(window.innerWidth - props.windowState.position.x - 20, resizeStart.value.w + deltaX),
  );
  const newH = Math.max(
    380,
    Math.min(window.innerHeight - props.windowState.position.y - 20, resizeStart.value.h + deltaY),
  );

  chatStore.updateWindowSize(props.windowState.taskId, { width: newW, height: newH });
}; /*end handleResizeMouseMove*/

const handleResizeMouseUp = (): void => {
  isResizing.value = false;
  window.removeEventListener("mousemove", handleResizeMouseMove);
  window.removeEventListener("mouseup", handleResizeMouseUp);
}; /*end handleResizeMouseUp*/

const renderFormattedMessage = (text: string): string => {
  if (!text) return "";
  let escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  escaped = escaped.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  escaped = escaped.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary text-weight-bold" style="text-decoration: underline;">$1 🔗</a>',
  );

  escaped = escaped.replace(
    /(^|[^"'])((https?:\/\/[^\s<]+))/g,
    '$1<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary text-weight-bold" style="text-decoration: underline;">$2 🔗</a>',
  );

  return escaped;
}; /*end renderFormattedMessage*/

const reactivateScheduledJob = async (): Promise<void> => {
  if (!activeScheduledJob.value) return;
  const tId = authStore.tenantId;
  const wsId = workspace.value?.id || task.value?.workspaceId;
  if (!tId || !wsId) return;
  try {
    const db = getFirestore();
    const jobRef = doc(
      db,
      `tenants/${tId}/workspaces/${wsId}/scheduledJobs/${activeScheduledJob.value.id}`,
    );
    await updateDoc(jobRef, {
      status: "active",
      pauseReason: null,
      updatedAt: serverTimestamp(),
    });
    activeScheduledJob.value = {
      ...activeScheduledJob.value,
      status: "active",
      pauseReason: undefined,
    };
    q.notify({
      type: "positive",
      message: "Ricerca programmata notturna riattivata con successo.",
      position: "top",
    });
  } catch (err) {
    logger.warn("TaskChatWindow", "Failed to reactivate scheduled job", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}; /*end reactivateScheduledJob*/

const executeStatusUpdate = async (newStatus: TaskStatus): Promise<void> => {
  if (!task.value || !workspace.value) return;
  try {
    await taskStore.updateTaskStatus(workspace.value.id, task.value.id, newStatus);
    const sObj = statusOptions.find((s) => s.value === newStatus) ?? defaultStatusObj;
    const nowStr = formatDateTime(new Date());
    chatStore.appendTimelineEvent(task.value.id, {
      id: `tle-status-${task.value.id}-${Date.now()}`,
      taskId: task.value.id,
      status: newStatus,
      title: sObj.label,
      subtitle: nowStr,
      description: `Stato aggiornato a ${sObj.label}`,
      icon: sObj.icon,
      color: sObj.color,
      timestamp: nowStr,
    });
    q.notify({
      type: "positive",
      message: `Status updated to "${sObj.label}"`,
      position: "top",
    });
  } catch {
    q.notify({
      type: "negative",
      message: "Error updating status",
      position: "top",
    });
  }
}; /*end executeStatusUpdate*/

const handleStatusChange = async (newStatus: TaskStatus): Promise<void> => {
  if (!task.value || !workspace.value) return;
  const currentStatus = task.value.status;
  if (currentStatus === newStatus) return;

  // Reopening safety check (Requirement 3.5)
  if (
    (currentStatus === "completed" || currentStatus === "cancelled") &&
    (newStatus === "in-progress" || newStatus === "pending")
  ) {
    const wasPausedByParent =
      activeScheduledJob.value &&
      activeScheduledJob.value.status === "paused" &&
      activeScheduledJob.value.pauseReason === "parent_task_closed";

    if (wasPausedByParent) {
      q.dialog({
        title: "Task Riaperto",
        message:
          "Il task è stato riaperto: desideri riattivare anche la ricerca programmata notturna collegata?",
        ok: {
          label: "Sì, Riattiva Ricerca",
          color: "primary",
          flat: true,
        },
        cancel: {
          label: "No, Lascia in Pausa",
          flat: true,
          color: "grey",
        },
        persistent: true,
      })
        .onOk(async () => {
          await executeStatusUpdate(newStatus);
          await reactivateScheduledJob();
        })
        .onCancel(async () => {
          await executeStatusUpdate(newStatus);
        });
      return;
    }
  }

  // Teardown cascade confirmation check (Requirement 3.3)
  if (newStatus === "completed" || newStatus === "cancelled") {
    q.dialog({
      title: newStatus === "completed" ? "Completare il Task?" : "Annullare il Task?",
      message:
        "Completando o annullando questo task, tutti i monitoraggi e le pianificazioni ricorrenti attive collegate verranno messi in pausa automaticamente.",
      ok: {
        label: newStatus === "completed" ? "Completa Task" : "Annulla Task",
        color: newStatus === "completed" ? "positive" : "negative",
        flat: true,
      },
      cancel: {
        label: "Indietro",
        flat: true,
        color: "grey",
      },
      persistent: true,
    }).onOk(async () => {
      await executeStatusUpdate(newStatus);
      if (activeScheduledJob.value && activeScheduledJob.value.status === "active") {
        activeScheduledJob.value = {
          ...activeScheduledJob.value,
          status: "paused",
          pauseReason: "parent_task_closed",
        };
      }
    });
    return;
  }

  await executeStatusUpdate(newStatus);
}; /*end handleStatusChange*/

const handleSendChatMessage = async (): Promise<void> => {
  if (!chatMessage.value.trim() || !task.value || isSending.value) return;

  if (isListening.value) {
    stopListening();
  }

  const userText = chatMessage.value.trim();
  const taskId = task.value.id;
  const timeNow = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  chatStore.appendMessage(taskId, {
    id: `usr-${Date.now()}`,
    taskId: taskId,
    sender: "user",
    text: userText,
    timestamp: timeNow,
  });

  chatMessage.value = "";
  isSending.value = true;
  chatStore.setAgentTyping(taskId, true);
  scrollToBottom();

  logger.info("TaskChat", `Messaggio inviato sul task "${task.value.title}"`, { taskId, userText });

  let fetchedOk = false;
  const abortCtrl = new AbortController();
  activeAbortController.value = abortCtrl;
  const timeoutId = setTimeout(() => {
    abortCtrl.abort("timeout");
  }, 55000); // 55s — 5s headroom below CF 60s timeout

  try {
    const res = await fetch("https://europe-west1-opsflow-88of.cloudfunctions.net/chatWithAgent", {
      method: "POST",
      signal: abortCtrl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userText,
        tenantId: authStore.tenantId || workspace.value?.tenantId || "opsflow_tenant_default",
        workspaceId: workspace.value?.id || task.value?.workspaceId || "main",
        taskId: task.value.id,
        taskTitle: task.value.title,
        workspacePrompt: workspace.value?.systemPrompt,
        workspaceName: workspace.value?.name,
        history: activeSession.value.messages.slice(-6, -1).map((m) => ({
          sender: m.sender,
          text: m.text.slice(0, 1000),
        })),
        attitude: workspace.value?.attitude,
        linkedResources: workspace.value?.linkedResources,
        taskSettings: task.value?.settings,
      }),
    });

    const data = await res.json().catch(() => null);

    if (data && data.reply) {
      const finalReply: string = String(data.reply);
      const finalAgentName: string = String(data.agentName || "Agente AI Assistant");
      const finalTools: string[] = Array.isArray(data.toolsUsed) ? data.toolsUsed : [];
      const approvalId: string | undefined =
        typeof data.approvalId === "string" ? data.approvalId : undefined;
      const approvalRecord: ApprovalRecord | undefined = data.approvalRecord || undefined;

      if (approvalRecord) {
        chatStore.appendApproval(taskId, approvalRecord);
      }

      logger.success("CloudFunction", "Risposta ricevuta dalla Cloud Function", {
        status: res.status,
        reply: finalReply,
      });
      const newMsg: TaskChatMessage = {
        id: `agt-${Date.now()}`,
        taskId: taskId,
        sender: "agent",
        agentName: finalAgentName,
        text: finalReply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        toolsUsed: finalTools,
        approvalId,
        approvalRecord,
      };
      chatStore.appendMessage(taskId, newMsg);
      // Extract key points from agent reply for the TaskKeyPointsCard panel
      parseKeyPointsFromReply(taskId, finalReply);
      fetchedOk = true;
      scrollToBottom();
    }
  } catch (err: unknown) {
    if (abortCtrl.signal.aborted && abortCtrl.signal.reason !== "timeout") {
      logger.info("TaskChat", "Richiesta annullata dall'utente.");
      fetchedOk = true;
      chatStore.appendMessage(taskId, {
        id: `agt-${Date.now()}`,
        taskId: taskId,
        sender: "agent",
        agentName: "Sistema",
        text: "⏹️ *Elaborazione IA interrotta dall'utente.*",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        toolsUsed: [],
      });
    } else {
      logger.warn("CloudFunction", "Cloud Function non raggiungibile", err);
    }
  } finally {
    clearTimeout(timeoutId);
    activeAbortController.value = null;
    isSending.value = false;
    chatStore.setAgentTyping(taskId, false);
    scrollToBottom();
  }

  if (!fetchedOk) {
    chatStore.appendMessage(taskId, {
      id: `agt-${Date.now()}`,
      taskId: taskId,
      sender: "agent",
      agentName: "Sistema",
      text:
        "⚠️ **Connessione all'Agente AI non disponibile.**\n\n" +
        "La Cloud Function `chatWithAgent` non è raggiungibile. Verifica:\n" +
        "- La connessione internet\n" +
        "- Lo stato del deploy Firebase Functions\n" +
        "- La configurazione CORS\n\n" +
        "Riprova tra qualche istante.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      toolsUsed: [],
    });
    scrollToBottom();
  }
}; /*end handleSendChatMessage*/

const focusChatInput = (): void => {
  nextTick(() => {
    chatInputRef.value?.focus();
  });
}; /*end focusChatInput*/

const handleStopAiExecution = (): void => {
  if (activeAbortController.value) {
    activeAbortController.value.abort();
    activeAbortController.value = null;
  }
  isSending.value = false;
  if (task.value) {
    chatStore.setAgentTyping(task.value.id, false);
  }
  q.notify({
    type: "warning",
    message: "Elaborazione IA interrotta dall'utente.",
    icon: "stop_circle",
    timeout: 1500,
  });
}; /*end handleStopAiExecution*/

const handleCopyMessage = async (text: string): Promise<void> => {
  try {
    if (typeof copyToClipboard === "function") {
      await copyToClipboard(text);
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
    q.notify({
      type: "positive",
      message: "Testo copiato negli appunti",
      icon: "content_copy",
      timeout: 1500,
    });
  } catch {
    q.notify({
      type: "negative",
      message: "Impossibile copiare il testo",
      icon: "error",
      timeout: 1500,
    });
  }
}; /*end handleCopyMessage*/

const isLastAgentMessage = (msg: TaskChatMessage): boolean => {
  const agentMessages = activeSession.value.messages.filter((m) => m.sender === "agent");
  const last = agentMessages[agentMessages.length - 1];
  return last ? last.id === msg.id : false;
}; /*end isLastAgentMessage*/

const handleRetryLastMessage = async (): Promise<void> => {
  if (isSending.value || !activeSession.value.messages.length) return;
  const userMessages = activeSession.value.messages.filter((m) => m.sender === "user");
  const lastUserMsg = userMessages[userMessages.length - 1];
  if (!lastUserMsg) return;
  chatMessage.value = lastUserMsg.text;
  q.notify({
    type: "info",
    message: "Rigenerazione risposta in corso...",
    icon: "replay",
    timeout: 1500,
  });
  await handleSendChatMessage();
}; /*end handleRetryLastMessage*/

const handleEditUserPrompt = (msg: TaskChatMessage): void => {
  chatMessage.value = msg.text;
  focusChatInput();
  q.notify({
    type: "info",
    message: "Prompt ricaricato per la modifica.",
    icon: "edit",
    timeout: 1500,
  });
}; /*end handleEditUserPrompt*/

const getApprovalForMessage = (msg: TaskChatMessage): ApprovalRecord | null => {
  if (!msg.approvalId && !msg.approvalRecord) return null;
  const id = msg.approvalId || msg.approvalRecord?.id;
  if (!id) return null;
  const found = activeSession.value.approvals.find((a) => a.id === id);
  return found || msg.approvalRecord || null;
}; /*end getApprovalForMessage*/

const handleApproveAction = async (
  approvalId: string,
  editedData?: Record<string, unknown>,
  context?: { tenantId?: string; workspaceId?: string; taskId?: string },
): Promise<void> => {
  if (!task.value || !approvalId) return;
  const foundApproval = activeSession.value.approvals.find((a) => a.id === approvalId);
  const taskId = context?.taskId || foundApproval?.taskId || task.value.id;
  const tenantId =
    context?.tenantId ||
    foundApproval?.tenantId ||
    authStore.tenantId ||
    workspace.value?.tenantId ||
    "opsflow_tenant_default";
  const workspaceId =
    workspace.value?.id ||
    task.value.workspaceId ||
    context?.workspaceId ||
    foundApproval?.workspaceId ||
    "main";
  const userId = authStore.user?.uid || "user_anonymous";

  isResolvingApproval.value = approvalId;
  try {
    const res = await fetch(
      "https://europe-west1-opsflow-88of.cloudfunctions.net/resolveApproval",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          workspaceId,
          taskId,
          approvalId,
          userId,
          decision: "approved",
          editedData,
        }),
      },
    );
    const result = await res.json().catch(() => null);
    if (res.ok && result?.success) {
      chatStore.resolveApprovalInSession(taskId, approvalId, "approved");

      // Synchronize task settings if user changed the target sheet or range
      if (
        editedData?.spreadsheetId &&
        typeof editedData.spreadsheetId === "string" &&
        task.value?.settings
      ) {
        const newSheetId = editedData.spreadsheetId;
        const matched = allAvailableSheets.value.find((s) => s.id === newSheetId);
        const existingIds = task.value.settings.selectedSheetIds || [];
        const updatedIds = existingIds.includes(newSheetId)
          ? existingIds
          : [...existingIds, newSheetId];
        const existingSheets = task.value.settings.selectedSheets || [];
        const updatedSheets =
          matched && !existingSheets.some((s) => s.id === newSheetId)
            ? [...existingSheets, matched]
            : existingSheets;

        void taskStore.updateTask(workspaceId, taskId, {
          settings: {
            ...task.value.settings,
            selectedSheetId: newSheetId,
            selectedSheetName:
              matched?.name || task.value.settings.selectedSheetName || "Foglio Google",
            selectedSheetIds: updatedIds,
            selectedSheets: updatedSheets,
            selectedSheetTab: (editedData.range as string) || task.value.settings.selectedSheetTab,
          },
        });
      }

      await fetchSubtasks();

      q.notify({
        type: "positive",
        message: result.alreadyResolved
          ? result.message || "Azione già approvata in precedenza."
          : "Azione approvata ed eseguita con successo!",
        icon: "check_circle",
      });
    } else if (res.status === 401 && result?.error === "oauth_error") {
      // Step 21 §5.2 — Token scaduto: mostra banner di riconnessione, non errore generico
      chatStore.setSessionOAuthError(taskId, {
        code: (result.code as import("../types/models").OAuthErrorCode) ?? "TOKEN_EXPIRED",
        message: result.message ?? "Il token Google è scaduto. Riconnetti il tuo account.",
      });
      q.notify({
        type: "warning",
        message: "🔑 Token Google scaduto. Riconnetti il tuo account Google per continuare.",
        icon: "lock_reset",
        timeout: 6000,
        position: "top",
      });
    } else {
      throw new Error(result?.error || "Errore durante l'esecuzione dell'azione.");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    q.notify({
      type: "negative",
      message: `Errore approvazione: ${msg}`,
      icon: "error",
    });
  } finally {
    isResolvingApproval.value = null;
  }
}; /*end handleApproveAction*/

const handleRejectAction = async (
  approvalId: string,
  context?: { tenantId?: string; workspaceId?: string; taskId?: string },
): Promise<void> => {
  if (!task.value || !approvalId) return;
  const foundApproval = activeSession.value.approvals.find((a) => a.id === approvalId);
  const taskId = context?.taskId || foundApproval?.taskId || task.value.id;
  const tenantId =
    context?.tenantId ||
    foundApproval?.tenantId ||
    authStore.tenantId ||
    workspace.value?.tenantId ||
    "opsflow_tenant_default";
  const workspaceId =
    workspace.value?.id ||
    task.value.workspaceId ||
    context?.workspaceId ||
    foundApproval?.workspaceId ||
    "main";
  const userId = authStore.user?.uid || "user_anonymous";

  isResolvingApproval.value = approvalId;
  try {
    const res = await fetch(
      "https://europe-west1-opsflow-88of.cloudfunctions.net/resolveApproval",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          workspaceId,
          taskId,
          approvalId,
          userId,
          decision: "rejected",
        }),
      },
    );
    const result = await res.json().catch(() => null);
    if (res.ok && result?.success) {
      chatStore.resolveApprovalInSession(taskId, approvalId, "rejected");
      q.notify({
        type: "info",
        message: "Azione rifiutata.",
        icon: "cancel",
      });
    } else {
      throw new Error(result?.error || "Errore durante il rifiuto dell'azione.");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    q.notify({
      type: "negative",
      message: `Errore rifiuto: ${msg}`,
      icon: "error",
    });
  } finally {
    isResolvingApproval.value = null;
  }
}; /*end handleRejectAction*/

/**
 * Lightweight parser that extracts structured key points from an agent reply.
 * Identifies bold markers like **Lead:, **Requisito:, **Azione:, **GDPR:, etc.
 * No external dependencies — pure regex on the reply text.
 * @param {string} taskId - Target task ID for storing extracted points
 * @param {string} text - Agent reply text to parse
 */
function parseKeyPointsFromReply(taskId: string, text: string): void {
  const categoryKeywords: {
    pattern: RegExp;
    category: KeyPointCategory;
    icon: string;
    color: string;
  }[] = [
    { pattern: /\*\*Lead[:\s]/i, category: "lead", icon: "person_add", color: "positive" },
    { pattern: /\*\*Prospect[:\s]/i, category: "lead", icon: "person_add", color: "positive" },
    {
      pattern: /\*\*Requisito[:\s]/i,
      category: "requirement",
      icon: "checklist",
      color: "primary",
    },
    {
      pattern: /\*\*Obiettivo[:\s]/i,
      category: "requirement",
      icon: "checklist",
      color: "primary",
    },
    { pattern: /\*\*Azione[:\s]/i, category: "action", icon: "bolt", color: "warning" },
    { pattern: /\*\*Step[:\s]/i, category: "action", icon: "bolt", color: "warning" },
    { pattern: /\*\*Insight[:\s]/i, category: "insight", icon: "lightbulb", color: "info" },
    { pattern: /\*\*Nota[:\s]/i, category: "insight", icon: "lightbulb", color: "info" },
    {
      pattern: /\*\*Attenzione[:\s]/i,
      category: "warning",
      icon: "warning_amber",
      color: "negative",
    },
    { pattern: /\*\*GDPR[:\s]/i, category: "gdpr", icon: "gpp_good", color: "deep-orange" },
  ];

  const lines = text.split("\n").filter((l) => l.trim().startsWith("**"));
  const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  for (const line of lines) {
    for (const { pattern, category, icon, color } of categoryKeywords) {
      if (pattern.test(line)) {
        const cleanTitle = line
          .replace(/\*\*/g, "")
          .replace(/^[^:]+:\s*/, "")
          .slice(0, 80)
          .trim();
        if (cleanTitle.length > 5) {
          chatStore.addKeyPoint(taskId, {
            id: `kp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            taskId,
            title: cleanTitle,
            detail: line.replace(/\*\*/g, "").trim().slice(0, 200),
            category,
            icon,
            color,
            timestamp,
          } satisfies TaskKeyPoint);
        }
        break;
      }
    }
  }
} /*end parseKeyPointsFromReply*/

const handleSendCustomPrompt = async (customText: string): Promise<void> => {
  if (isSending.value) return;
  chatMessage.value = customText;
  await handleSendChatMessage();
}; /*end handleSendCustomPrompt*/

const isDecomposing = ref(false);

const handleExecuteTaskAI = async (): Promise<void> => {
  if (!task.value) return;
  let prompt = `Avvia esecuzione task: "${task.value.title}". Descrizione: "${task.value.description || "Nessuna"}".`;
  if (task.value.aiMetadata?.subtasks && task.value.aiMetadata.subtasks.length > 0) {
    const subtaskLines = task.value.aiMetadata.subtasks
      .map(
        (s, i) =>
          `${i + 1}. [${s.completed ? "COMPLETATO" : "DA FARE"}] ${s.title}: ${s.description}`,
      )
      .join("\n");
    prompt += `\n\nSotto-task operative pianificate da AI Task Architect:\n${subtaskLines}\n\nProcedi con l'esecuzione delle sotto-task pendenti.`;
  } else {
    prompt += " Analizza i requisiti, cerca le risorse e procedi.";
  }
  await handleSendCustomPrompt(prompt);
}; /*end handleExecuteTaskAI*/

const handleDecomposeExistingTask = async (): Promise<void> => {
  const currentTask = task.value;
  if (!currentTask) return;
  isDecomposing.value = true;
  try {
    const rawDraft = `${currentTask.title}. ${currentTask.description || ""}`.trim();
    const result = await taskStore.refineTaskDraft(props.windowState.workspaceId, rawDraft);
    if (result?.subtasks && result.subtasks.length > 0) {
      const generatedSubtasks = result.subtasks.map((st) => ({
        id: `st_${st.order}`,
        order: st.order,
        title: st.title,
        description: st.description,
        completed: false,
        createdAt: new Date() as Date | null,
      }));

      await taskStore.updateTask(props.windowState.workspaceId, currentTask.id, {
        aiMetadata: {
          ...currentTask.aiMetadata,
          subtasks: generatedSubtasks,
          suggestedCategory: result.suggestedCategory || currentTask.aiMetadata?.suggestedCategory,
          complexityScore: currentTask.aiMetadata?.complexityScore || 6,
          modelVersion: "gemini-3.6-flash",
          lastAnalyzed: new Date(),
        },
      });

      if (props.windowState.task) {
        props.windowState.task.aiMetadata = {
          ...props.windowState.task.aiMetadata,
          subtasks: generatedSubtasks,
        };
      }

      q.notify({
        type: "positive",
        message: `${generatedSubtasks.length} sotto-task generate con successo!`,
        icon: "auto_awesome",
      });
    }
  } catch {
    q.notify({
      type: "negative",
      message: "Impossibile decomporre il task con AI. Riprova.",
      icon: "error",
    });
  } finally {
    isDecomposing.value = false;
  }
}; /*end handleDecomposeExistingTask*/

const handleOpenRegenerateModal = (payload?: {
  prompt?: string;
  title?: string;
  category?: string;
}): void => {
  regenerateDraft.value = payload?.prompt || task.value?.description || task.value?.title || "";
  showTaskSettingsModal.value = false;
  showRegenerateTaskModal.value = true;
}; /*end handleOpenRegenerateModal*/

const handleTaskRegenerated = (updatedTask: Task): void => {
  if (props.windowState.task) {
    Object.assign(props.windowState.task, updatedTask);
  }
  taskStore.fetchTasks();
}; /*end handleTaskRegenerated*/

const toggleSubTask = async (subtaskIndex: number): Promise<void> => {
  const currentTask = task.value;
  if (!currentTask || !currentTask.aiMetadata?.subtasks) return;

  const subtasks = [...currentTask.aiMetadata.subtasks];
  const targetSub = subtasks[subtaskIndex];
  if (!targetSub) return;

  targetSub.completed = !targetSub.completed;

  try {
    await taskStore.updateTask(props.windowState.workspaceId, currentTask.id, {
      aiMetadata: {
        ...currentTask.aiMetadata,
        subtasks,
      },
    });
    if (props.windowState.task?.aiMetadata) {
      props.windowState.task.aiMetadata.subtasks = subtasks;
    }
    q.notify({
      type: "positive",
      message: targetSub.completed ? "Subtask marked completed" : "Subtask marked pending",
      position: "top",
      timeout: 1500,
    });
  } catch {
    q.notify({
      type: "negative",
      message: "Error updating subtask status",
      position: "top",
    });
  }
}; /*end toggleSubTask*/
</script>

<template>
  <div
    class="floating-task-window card-elevation-dark rounded-borders column no-wrap overflow-hidden"
    :class="{ 'is-fullscreen': isFullscreen }"
    :style="{
      position: 'fixed',
      left: isFullscreen ? '0px' : `${windowState.position.x}px`,
      top: isFullscreen ? '0px' : `${windowState.position.y}px`,
      width: isFullscreen ? '100vw' : `${windowState.size.width}px`,
      height: windowState.isMinimized
        ? '48px'
        : isFullscreen
          ? '100vh'
          : `${windowState.size.height}px`,
      zIndex: isFullscreen ? 9999 : windowState.zIndex,
      borderRadius: isFullscreen ? '0px' : '12px',
    }"
    @mousedown="chatStore.bringToFront(windowState.taskId)"
  >
    <!-- Draggable Header Bar -->
    <div
      class="window-header row items-center justify-between bg-navy text-white q-px-md q-py-xs unselectable"
      :style="{ cursor: isFullscreen ? 'default' : 'grab', height: '48px' }"
      @mousedown="handleHeaderMouseDown"
      @dblclick="toggleFullscreen"
    >
      <div class="row items-center q-gutter-xs text-ellipsis col">
        <q-icon name="forum" color="amber-5" size="18px" />
        <div class="text-subtitle2 text-weight-bold text-ellipsis" style="max-width: 45%">
          {{ task.title }}
        </div>
        <q-badge color="amber-9" text-color="dark" size="xs" class="gt-xs">
          {{ workspace?.name }}
        </q-badge>
      </div>

      <div class="row items-center q-gutter-xs no-wrap" @mousedown.stop>
        <!-- View Mode Segmented Controls -->
        <div v-if="!windowState.isMinimized" class="row items-center q-mr-xs">
          <q-btn-toggle
            v-model="viewMode"
            dense
            rounded
            unelevated
            toggle-color="amber-9"
            toggle-text-color="dark"
            color="navy-light"
            text-color="grey-4"
            size="xs"
            :options="[
              { label: 'Entrambi', value: 'both', icon: 'splitscreen' },
              { label: 'Task', value: 'details', icon: 'assignment' },
              { label: 'Chat', value: 'chat', icon: 'chat' },
              { label: 'Timeline', value: 'timeline', icon: 'timeline' },
            ]"
            @update:model-value="setViewMode"
          />
        </div>

        <!-- Status Dropdown Button -->
        <q-btn-dropdown
          dense
          outline
          size="sm"
          :color="currentStatusObj.color"
          :label="currentStatusObj.label"
          :icon="currentStatusObj.icon"
          class="q-px-xs text-weight-bold"
          text-color="white"
        >
          <q-list dense style="min-width: 160px">
            <q-item
              v-for="opt in statusOptions"
              :key="opt.value"
              clickable
              v-close-popup
              @click="handleStatusChange(opt.value)"
            >
              <q-item-section avatar style="min-width: 24px">
                <q-icon :name="opt.icon" :color="opt.color" size="16px" />
              </q-item-section>
              <q-item-section class="text-caption">{{ opt.label }}</q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>

        <!-- Active Scheduled Job Chip (Step 19 §5.3) -->
        <q-chip
          v-if="activeScheduledJob"
          dense
          clickable
          size="sm"
          :color="scheduledJobStatusColor"
          text-color="white"
          :icon="scheduledJobStatusIcon"
          class="cursor-pointer text-weight-bold"
          @click.stop="showScheduleModal = true"
          @mousedown.stop
        >
          {{ scheduledJobStatusLabel }}
          <q-tooltip>
            Pianificazione ricorrente ({{ activeScheduledJob.frequency }}): Scadenza
            {{ activeScheduledJob.endDate }} — Clicca per gestire
          </q-tooltip>
        </q-chip>

        <!-- Scheduled Sourcing Button (Step 19 §5.2) -->
        <q-btn
          flat
          round
          dense
          size="sm"
          icon="schedule"
          :color="
            activeScheduledJob
              ? activeScheduledJob.status === 'active'
                ? 'positive'
                : 'warning'
              : 'teal-4'
          "
          @click.stop="showScheduleModal = true"
          @mousedown.stop
        >
          <q-tooltip>
            {{
              activeScheduledJob
                ? `Pianificazione Ricorrente: ${activeScheduledJob.title} (${activeScheduledJob.status})`
                : "Pianifica Ricerca Ricorrente (04:00 AM)"
            }}
          </q-tooltip>
          <q-badge
            v-if="activeScheduledJob"
            floating
            rounded
            :color="activeScheduledJob.status === 'active' ? 'positive' : 'warning'"
          />
        </q-btn>

        <!-- Task Settings Button -->
        <q-btn
          flat
          round
          dense
          size="sm"
          icon="tune"
          color="amber-5"
          @click.stop="showTaskSettingsModal = true"
          @mousedown.stop
        >
          <q-tooltip>Impostazioni Task, Foglio Google & Firma</q-tooltip>
        </q-btn>

        <!-- Send To Back Button -->
        <q-btn
          flat
          round
          dense
          size="sm"
          icon="flip_to_back"
          color="white"
          @click.stop="sendToBack"
          @mousedown.stop
        >
          <q-tooltip>Sposta finestra in secondo piano (dietro le altre)</q-tooltip>
        </q-btn>

        <!-- Fullscreen Button -->
        <q-btn
          flat
          round
          dense
          size="sm"
          :icon="isFullscreen ? 'fullscreen_exit' : 'fullscreen'"
          color="white"
          @click.stop="toggleFullscreen"
          @mousedown.stop
        >
          <q-tooltip>{{
            isFullscreen ? "Ripristina dimensione (Esc)" : "Schermo intero (Fullscreen)"
          }}</q-tooltip>
        </q-btn>

        <!-- Minimize Button -->
        <q-btn
          flat
          round
          dense
          size="sm"
          :icon="windowState.isMinimized ? 'unfold_more' : 'minimize'"
          color="white"
          @click="chatStore.toggleMinimizeWindow(windowState.taskId)"
        >
          <q-tooltip>{{ windowState.isMinimized ? "Espandi" : "Riduci a icona" }}</q-tooltip>
        </q-btn>

        <!-- Close Button -->
        <q-btn
          flat
          round
          dense
          size="sm"
          icon="close"
          color="white"
          @click="chatStore.closeFloatingWindow(windowState.taskId)"
        >
          <q-tooltip>Chiudi finestra</q-tooltip>
        </q-btn>
      </div>
    </div>

    <!-- Window Body (Rendered when NOT minimized) -->
    <div
      v-if="!windowState.isMinimized"
      class="col overflow-hidden bg-white relative-position"
      style="height: calc(100% - 48px)"
    >
      <!-- Dedicated Full Timeline View -->
      <div
        v-if="viewMode === 'timeline'"
        class="col column no-wrap overflow-hidden bg-white full-height"
      >
        <div class="row q-gutter-md q-px-lg q-py-sm bg-grey-2 border-bottom-light items-center">
          <q-option-group
            type="radio"
            dense
            inline
            v-model="timelineLayout"
            :options="[
              { label: 'Dense layout', value: 'dense' },
              { label: 'Comfortable layout', value: 'comfortable' },
              { label: 'Loose layout', value: 'loose' },
            ]"
            class="text-caption text-weight-medium"
          />
          <q-option-group
            type="radio"
            dense
            inline
            v-model="timelineSide"
            :disable="timelineLayout === 'loose'"
            :options="[
              { label: 'Content on right', value: 'right' },
              { label: 'Content on left', value: 'left' },
            ]"
            class="text-caption text-weight-medium"
          />
        </div>

        <div class="col scroll q-pa-lg" style="overflow-y: auto">
          <q-timeline :layout="timelineLayout" :side="timelineSide" color="secondary">
            <q-timeline-entry heading>Stato e Cronologia Task</q-timeline-entry>

            <q-timeline-entry
              v-for="entry in activeSession.timelineEvents"
              :key="entry.id"
              :subtitle="entry.subtitle"
              :icon="entry.icon"
              :color="entry.color"
              :side="timelineSide"
              class="task-timeline-entry"
              @click="handleEntryClick($event, entry)"
            >
              <template #title>
                <div
                  class="row items-center justify-between no-wrap cursor-pointer"
                  @click.stop="openNoteDialog(entry)"
                >
                  <span
                    class="text-weight-bold text-subtitle2 text-primary"
                    style="overflow-wrap: break-word; word-break: normal"
                  >
                    {{ entry.title }}
                  </span>
                  <div class="row items-center q-gutter-2xs" @click.stop>
                    <q-btn
                      v-if="entry.note"
                      flat
                      round
                      dense
                      size="xs"
                      :icon="entry.showNote !== false ? 'visibility' : 'visibility_off'"
                      :color="entry.showNote !== false ? 'amber-9' : 'grey-5'"
                      @click.stop="toggleNoteVisibility(entry)"
                    >
                      <q-tooltip>{{
                        entry.showNote !== false ? "Nascondi nota" : "Mostra nota"
                      }}</q-tooltip>
                    </q-btn>
                    <q-btn
                      flat
                      round
                      dense
                      size="xs"
                      icon="edit_note"
                      color="amber-9"
                      @click.stop="openNoteDialog(entry)"
                    >
                      <q-tooltip>{{
                        entry.note ? "Modifica nota" : "Aggiungi nota allo step"
                      }}</q-tooltip>
                    </q-btn>
                  </div>
                </div>
              </template>

              <div
                class="text-body2 text-grey-9 q-mb-xs"
                style="line-height: 1.5; overflow-wrap: break-word; word-break: normal"
              >
                {{ entry.description }}
              </div>

              <!-- Note content display in full timeline view -->
              <div
                v-if="entry.note && entry.showNote !== false"
                class="timeline-step-note q-pa-sm q-mt-xs rounded-borders"
                style="
                  border-left: 3px solid #c5a065;
                  background: #fffdf7;
                  overflow-wrap: break-word;
                  word-break: normal;
                  white-space: pre-wrap;
                "
              >
                <div class="row items-center justify-between no-wrap q-mb-xs">
                  <span
                    class="text-caption text-weight-bold text-amber-10 row items-center q-gutter-xs"
                  >
                    <q-icon name="sticky_note_2" size="14px" color="amber-10" />
                    <span>Nota Operativa</span>
                  </span>
                  <div class="row items-center q-gutter-2xs">
                    <q-btn
                      flat
                      round
                      dense
                      size="2xs"
                      icon="edit"
                      color="grey-7"
                      @click.stop="openNoteDialog(entry)"
                    >
                      <q-tooltip>Modifica nota</q-tooltip>
                    </q-btn>
                    <q-btn
                      flat
                      round
                      dense
                      size="2xs"
                      icon="visibility_off"
                      color="grey-6"
                      @click.stop="toggleNoteVisibility(entry)"
                    >
                      <q-tooltip>Nascondi nota</q-tooltip>
                    </q-btn>
                  </div>
                </div>
                <div class="text-caption text-grey-9" style="line-height: 1.4">
                  {{ entry.note }}
                </div>
              </div>

              <!-- Hidden note indicator -->
              <div v-else-if="entry.note && entry.showNote === false" class="q-mt-xs">
                <q-btn
                  flat
                  dense
                  size="xs"
                  icon="visibility"
                  color="amber-9"
                  label="Mostra nota nascosta"
                  no-caps
                  class="text-caption"
                  style="font-size: 0.72rem; padding: 0 4px"
                  @click.stop="toggleNoteVisibility(entry)"
                />
              </div>

              <!-- Sub-Tasks Operativi & Risorse Embedded in In Progress Timeline Step (Point 1 - Full Timeline View) -->
              <div
                v-if="isTargetSubtasksEntry(entry)"
                class="q-mt-sm rounded-borders bg-white shadow-1 border-light q-pa-xs timeline-subtasks-card"
                style="border-left: 3px solid #c5a065; overflow-wrap: normal"
                @click.stop
              >
                <!-- Header: Contatore e Titolo -->
                <div class="row items-center justify-between q-pa-xs border-bottom-light">
                  <div class="row items-center q-gutter-x-xs">
                    <q-icon name="group_work" color="primary" size="18px" />
                    <span class="text-caption text-weight-bold text-primary">
                      Sub-Task Operativi
                    </span>
                    <q-badge
                      color="amber-9"
                      text-color="dark"
                      rounded
                      dense
                      :label="`${subtaskFinishedCount}/${subtasks.length}`"
                    />
                  </div>
                  <span class="text-caption text-grey-7" style="font-size: 0.68rem">
                    {{
                      subtaskFinishedCount === subtasks.length && subtasks.length > 0
                        ? "Tutti conclusi"
                        : `${subtasks.length - subtaskFinishedCount} in corso`
                    }}
                  </span>
                </div>

                <!-- Action Bar Rapida (Stile Img 3) -->
                <div
                  class="row q-gutter-xs items-center q-py-xs q-px-2xs bg-grey-1 rounded-borders q-my-2xs"
                >
                  <q-btn
                    unelevated
                    dense
                    size="xs"
                    color="primary"
                    icon="person_add"
                    label="Nuova Risorsa"
                    class="text-weight-bold q-px-xs"
                    @click="handleCreateManualSubtask"
                  >
                    <q-tooltip>Aggiungi o estrai risorsa dalla chat</q-tooltip>
                  </q-btn>

                  <q-btn
                    outline
                    dense
                    size="xs"
                    color="amber-10"
                    icon="table_chart"
                    label="Sheets"
                    class="q-px-xs"
                    @click="handleOpenOrSyncSheet"
                  >
                    <q-tooltip>Apri o sincronizza foglio Google</q-tooltip>
                  </q-btn>

                  <q-btn
                    outline
                    dense
                    size="xs"
                    color="positive"
                    icon="mail"
                    label="Email"
                    class="q-px-xs"
                    @click="handleEmailAction"
                  >
                    <q-tooltip>Genera bozza email per i contatti</q-tooltip>
                  </q-btn>

                  <q-space />

                  <q-btn
                    flat
                    dense
                    round
                    size="xs"
                    icon="refresh"
                    color="grey-7"
                    :loading="isLoadingSubtasks"
                    @click="fetchSubtasks"
                  >
                    <q-tooltip>Ricarica risorse</q-tooltip>
                  </q-btn>
                </div>

                <!-- Lista Risorse Compatta e Cliccabile -->
                <div
                  v-if="subtasks.length > 0"
                  class="q-gutter-y-2xs q-pt-2xs"
                  style="max-height: 280px; overflow-y: auto"
                >
                  <div
                    v-for="st in subtasks"
                    :key="st.id"
                    class="row items-center justify-between q-pa-xs rounded-borders bg-white cursor-pointer transition-subtask-row border-light"
                    @click="openSubtaskModal(st)"
                  >
                    <div class="row items-center q-gutter-x-xs col ellipsis">
                      <q-avatar
                        size="22px"
                        font-size="13px"
                        color="navy-light"
                        text-color="primary"
                        :icon="
                          st.domain === 'healthcare'
                            ? 'medical_services'
                            : st.domain === 'procurement'
                              ? 'inventory_2'
                              : st.domain === 'operations'
                                ? 'precision_manufacturing'
                                : 'person'
                        "
                      />
                      <div class="col ellipsis">
                        <div
                          class="text-caption text-weight-medium ellipsis"
                          style="font-size: 0.76rem"
                        >
                          {{ st.title }}
                        </div>
                        <div
                          v-if="st.subtitle"
                          class="text-grey-6 ellipsis"
                          style="font-size: 0.65rem; line-height: 1"
                        >
                          {{ st.subtitle }}
                        </div>
                      </div>
                    </div>

                    <div class="row items-center q-gutter-xs no-wrap">
                      <q-badge
                        :color="getSubtaskStatusBadge(st.status).color"
                        size="xs"
                        :label="getSubtaskStatusBadge(st.status).label"
                      />
                      <q-badge v-if="st.outcome === 'won'" color="positive" size="xs" label="Won" />
                      <q-badge
                        v-else-if="st.outcome === 'lost'"
                        color="grey-6"
                        size="xs"
                        label="Lost"
                      />
                      <q-btn
                        flat
                        round
                        dense
                        size="2xs"
                        icon="delete_outline"
                        color="grey-6"
                        class="q-ml-2xs"
                        @click.stop="promptDeleteSubtask(st)"
                      >
                        <q-tooltip>Elimina definitivamente</q-tooltip>
                      </q-btn>
                      <q-icon name="chevron_right" color="grey-5" size="14px" />
                    </div>
                  </div>
                </div>

                <div
                  v-else
                  class="text-caption text-grey-6 text-center q-pa-sm"
                  style="font-size: 0.7rem"
                >
                  Nessuna risorsa monitorata. Clicca su
                  <strong>"+ Nuova Risorsa"</strong> per crearne una o estrarla dai messaggi.
                </div>
              </div>
            </q-timeline-entry>
          </q-timeline>
        </div>
      </div>

      <!-- Splitter View for Both, Details, or Chat -->
      <q-splitter
        v-else
        v-model="splitterModel"
        :limits="viewMode === 'both' ? [20, 80] : [0, 100]"
        :separator-style="viewMode === 'both' ? 'width: 5px; cursor: col-resize;' : 'display: none'"
        separator-class="task-window-splitter-bar"
        class="full-width full-height overflow-hidden"
      >
        <!-- Before Slot: Task Details & Sotto-Task Pane -->
        <template #before>
          <div
            v-show="splitterModel > 0"
            class="column justify-between q-pa-md overflow-hidden full-height"
            style="min-width: 0"
          >
            <div class="scroll col q-pr-sm">
              <!-- Step 21 §2.1: Descrizione Task header with edit button -->
              <div class="row items-center justify-between q-mb-xs no-wrap">
                <div class="text-caption text-weight-bold text-primary">📌 Descrizione Task</div>
                <q-btn
                  flat
                  round
                  dense
                  size="xs"
                  icon="edit"
                  color="primary"
                  @click="openEditDescriptionDialog"
                >
                  <q-tooltip>Modifica Descrizione</q-tooltip>
                </q-btn>
              </div>
              <div
                class="text-caption text-grey-9 q-mb-sm bg-grey-2 q-pa-sm rounded-borders"
                style="
                  overflow-wrap: break-word;
                  word-break: normal;
                  white-space: pre-wrap;
                  line-height: 1.5;
                "
              >
                {{ task.description || "Nessuna descrizione." }}
              </div>

              <!-- Fallback button: Decompose with AI Architect if task has no subtasks -->
              <div
                v-if="!task.aiMetadata?.subtasks || task.aiMetadata.subtasks.length === 0"
                class="q-mb-sm"
              >
                <q-btn
                  outline
                  dense
                  size="sm"
                  color="amber-9"
                  icon="auto_awesome"
                  label="✨ Scomponi in Sotto-Task con AI Architect"
                  class="full-width rounded-borders text-caption text-weight-bold"
                  @click="handleOpenRegenerateModal()"
                >
                  <q-tooltip
                    >Analizza e genera automaticamente le sotto-task operative con Gemini</q-tooltip
                  >
                </q-btn>
              </div>

              <!-- Macro Rollup Banner (Step 20 §4.10) -->
              <div
                v-if="allSubtasksFinished"
                class="q-pa-sm q-mb-sm rounded-borders row items-center justify-between no-wrap macro-rollup-banner shadow-1"
                style="
                  background: linear-gradient(135deg, #fdfbf7 0%, #f4ede0 100%);
                  border: 1.5px solid #c5a065;
                "
              >
                <div class="row items-center no-wrap ellipsis q-mr-sm" style="flex: 1">
                  <q-icon name="emoji_events" color="amber-9" size="26px" class="q-mr-xs" />
                  <div class="text-caption text-primary ellipsis">
                    <strong>Tutte le risorse gestite</strong> ({{ subtaskWonCount }} won,
                    {{ subtaskLostCount }} lost). Completare il macro-task?
                  </div>
                </div>
                <q-btn
                  dense
                  unelevated
                  size="sm"
                  color="positive"
                  icon="check_circle"
                  label="Completa Macro-Task"
                  class="text-weight-bold q-px-sm"
                  @click="handleStatusChange('completed')"
                />
              </div>

              <!-- AI Operational SubTasks Checklist (AgentePlanner / AI Task Architect) -->
              <!-- Step 21 §2.1: Edit button on Sotto-Task Operative header -->
              <q-expansion-item
                v-if="task.aiMetadata?.subtasks && task.aiMetadata.subtasks.length > 0"
                dense
                icon="checklist"
                :label="`Sotto-Task Operative (${task.aiMetadata.subtasks.filter((s) => s.completed).length}/${task.aiMetadata.subtasks.length})`"
                header-class="text-caption text-weight-bold text-primary q-pa-xs bg-blue-1 rounded-borders"
                class="q-mb-sm task-subtasks-expansion rounded-borders"
                style="border: 1px solid rgba(10, 35, 66, 0.15)"
              >
                <template #header>
                  <q-item-section>
                    <span class="text-caption text-weight-bold text-primary">
                      🔀 Sotto-Task Operative ({{
                        task.aiMetadata.subtasks.filter((s) => s.completed).length
                      }}/{{ task.aiMetadata.subtasks.length }})
                    </span>
                  </q-item-section>
                  <q-item-section side>
                    <q-btn
                      flat
                      round
                      dense
                      size="xs"
                      icon="edit"
                      color="primary"
                      @click.stop="openEditSubtasksDialog"
                    >
                      <q-tooltip>Modifica Sotto-Task</q-tooltip>
                    </q-btn>
                  </q-item-section>
                </template>
                <q-list dense separator class="q-pa-xs bg-white rounded-borders">
                  <q-item
                    v-for="(sub, idx) in task.aiMetadata.subtasks"
                    :key="sub.id || idx"
                    clickable
                    dense
                    class="rounded-borders q-py-xs q-px-xs"
                    @click="toggleSubTask(idx)"
                  >
                    <q-item-section avatar style="min-width: 28px" class="q-pr-xs">
                      <q-checkbox
                        :model-value="sub.completed"
                        color="positive"
                        dense
                        size="sm"
                        @update:model-value="toggleSubTask(idx)"
                      />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label
                        :class="{ 'text-strike text-grey-6': sub.completed }"
                        class="text-weight-bold text-caption text-primary"
                        style="overflow-wrap: break-word; word-break: break-word; line-height: 1.35"
                      >
                        {{ sub.order ? `${sub.order}. ` : "" }}{{ sub.title }}
                      </q-item-label>
                      <q-item-label
                        v-if="sub.description"
                        caption
                        class="text-caption text-grey-8 q-mt-xs"
                        style="
                          font-size: 0.74rem;
                          line-height: 1.35;
                          overflow-wrap: break-word;
                          word-break: normal;
                          white-space: pre-wrap;
                        "
                      >
                        {{ sub.description }}
                      </q-item-label>
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-expansion-item>

              <!-- Task Key Points Panel (Working Memory Rolling Summary) -->
              <q-expansion-item
                dense
                icon="tips_and_updates"
                label="Punti Chiave del Task"
                header-class="text-caption text-weight-bold text-secondary q-pa-xs"
                class="q-mb-sm task-kp-expansion"
              >
                <div class="q-px-xs q-pb-xs">
                  <TaskKeyPointsCard :task-id="task.id" :task="task" />
                </div>
              </q-expansion-item>

              <!-- Direct AI Execution & Stop Button -->
              <div class="q-mb-sm">
                <div class="row q-col-gutter-xs items-center full-width q-mb-xs">
                  <div :class="isSending ? 'col-8' : 'col-12'">
                    <q-btn
                      color="primary"
                      icon="auto_awesome"
                      :label="isSending ? 'Elaborazione...' : '🚀 Avvia Esecuzione IA'"
                      no-caps
                      dense
                      class="full-width text-weight-bold"
                      :loading="isSending"
                      :disabled="isSending"
                      @click="handleExecuteTaskAI"
                    />
                  </div>
                  <div v-if="isSending" class="col-4">
                    <q-btn
                      color="negative"
                      icon="stop_circle"
                      label="Stop"
                      no-caps
                      dense
                      class="full-width text-weight-bold"
                      @click="handleStopAiExecution"
                    >
                      <q-tooltip>Interrompi immediatamente l'esecuzione dell'Agente IA</q-tooltip>
                    </q-btn>
                  </div>
                </div>
                <div class="row q-col-gutter-xs full-width">
                  <div class="col-12 col-sm-4">
                    <q-btn
                      outline
                      dense
                      size="sm"
                      color="secondary"
                      icon="search"
                      label="Cerca Lead"
                      no-caps
                      class="full-width q-py-xs text-weight-bold"
                      :disabled="isSending"
                      @click="
                        handleSendCustomPrompt(
                          'Trova e mappa lead o snodi territoriali per questo task in conformità deontologica e GDPR.',
                        )
                      "
                    />
                  </div>
                  <div class="col-12 col-sm-4">
                    <q-btn
                      outline
                      dense
                      size="sm"
                      color="positive"
                      icon="mail"
                      label="Bozza Email"
                      no-caps
                      class="full-width q-py-xs text-weight-bold"
                      :disabled="isSending"
                      @click="
                        handleSendCustomPrompt(
                          'Genera una bozza email formale per i destinatari identificati, con oggetto chiaro e la firma configurata per questo task/workspace.',
                        )
                      "
                    />
                  </div>
                  <div class="col-12 col-sm-4">
                    <q-btn
                      outline
                      dense
                      size="sm"
                      color="amber-10"
                      icon="table_chart"
                      label="Salva su Sheets"
                      no-caps
                      class="full-width q-py-xs text-weight-bold"
                      :disabled="isSending"
                      @click="
                        handleSendCustomPrompt(
                          'Salva e organizza i dati estratti nel foglio Google Sheets predefinito.',
                        )
                      "
                    />
                  </div>
                </div>
              </div>

              <!-- AI Complexity Score Badge -->
              <div
                v-if="task.aiMetadata && task.aiMetadata.complexityScore !== undefined"
                class="q-mb-xs"
              >
                <div
                  class="row items-center justify-between text-caption text-weight-bold text-grey-8"
                >
                  <span>Complexity IA:</span>
                  <span>{{ task.aiMetadata.complexityScore }}/10</span>
                </div>
                <q-linear-progress
                  :value="task.aiMetadata.complexityScore / 10"
                  color="secondary"
                  size="6px"
                  rounded
                />
              </div>
            </div>
          </div>
        </template>

        <!-- After Slot: Interactive Chat Thread + Vertical Status Timeline with Splitter -->
        <template #after>
          <div
            v-show="splitterModel < 100"
            class="full-height full-width overflow-hidden bg-white"
            style="min-width: 0"
          >
            <q-splitter
              v-model="chatTimelineSplitterModel"
              :limits="showTimeline ? [25, 80] : [100, 100]"
              :separator-style="showTimeline ? 'width: 5px; cursor: col-resize;' : 'display: none'"
              separator-class="task-window-splitter-bar"
              class="full-width full-height overflow-hidden"
            >
              <!-- Before Slot: Chat Main Pane -->
              <template #before>
                <div
                  class="column no-wrap overflow-hidden q-pa-sm full-height"
                  style="min-width: 0"
                >
                  <div class="row items-center justify-between q-px-xs q-pb-xs border-bottom-light">
                    <div
                      class="text-caption text-weight-bold text-primary row items-center q-gutter-xs"
                    >
                      <q-icon name="chat" size="16px" color="primary" />
                      <span>Assistente IA & Operazioni</span>
                    </div>
                    <q-btn
                      flat
                      dense
                      round
                      size="sm"
                      :icon="showTimeline ? 'view_sidebar' : 'history'"
                      :color="showTimeline ? 'amber-9' : 'grey-7'"
                      @click="toggleTimeline"
                    >
                      <q-tooltip>{{
                        showTimeline ? "Nascondi Timeline Stati" : "Mostra Timeline Stati"
                      }}</q-tooltip>
                    </q-btn>
                  </div>

                  <div
                    ref="chatScrollRef"
                    class="col scroll q-mb-xs q-px-xs q-pt-xs"
                    style="overflow-y: auto; overflow-x: hidden"
                  >
                    <div v-for="msg in activeSession.messages" :key="msg.id" class="q-mb-xs">
                      <q-chat-message
                        :name="msg.sender === 'user' ? 'You' : msg.agentName || 'AI Agent'"
                        :stamp="msg.timestamp"
                        :sent="msg.sender === 'user'"
                        :bg-color="msg.sender === 'user' ? 'primary' : 'grey-3'"
                        :text-color="msg.sender === 'user' ? 'white' : 'dark'"
                      >
                        <div
                          style="
                            white-space: pre-wrap;
                            font-size: 0.85rem;
                            overflow-wrap: break-word;
                            word-break: normal;
                          "
                          v-html="renderFormattedMessage(msg.text)"
                        ></div>

                        <!-- User Message Actions: Torna Indietro e Modifica / Copia -->
                        <div
                          v-if="msg.sender === 'user'"
                          class="row items-center justify-end q-mt-xs q-gutter-xs"
                        >
                          <q-btn
                            flat
                            round
                            dense
                            size="xs"
                            icon="edit"
                            color="white"
                            :disabled="isSending"
                            @click="handleEditUserPrompt(msg)"
                          >
                            <q-tooltip>Torna indietro e modifica prompt</q-tooltip>
                          </q-btn>
                          <q-btn
                            flat
                            round
                            dense
                            size="xs"
                            icon="content_copy"
                            color="white"
                            @click="handleCopyMessage(msg.text)"
                          >
                            <q-tooltip>Copia prompt</q-tooltip>
                          </q-btn>
                        </div>

                        <!-- Action buttons for agent messages: Copia, Rigenera e Audio TTS -->
                        <div
                          v-if="msg.sender === 'agent'"
                          class="row items-center justify-end q-mt-xs q-gutter-xs"
                        >
                          <q-btn
                            flat
                            round
                            dense
                            size="xs"
                            icon="content_copy"
                            color="grey-7"
                            @click="handleCopyMessage(msg.text)"
                          >
                            <q-tooltip>Copia testo negli appunti</q-tooltip>
                          </q-btn>
                          <q-btn
                            v-if="isLastAgentMessage(msg)"
                            flat
                            round
                            dense
                            size="xs"
                            icon="replay"
                            color="grey-7"
                            :disabled="isSending"
                            @click="handleRetryLastMessage"
                          >
                            <q-tooltip>Rigenera risposta dell'Agente</q-tooltip>
                          </q-btn>
                          <q-btn
                            flat
                            round
                            dense
                            size="xs"
                            :icon="isSpeaking ? 'volume_off' : 'volume_up'"
                            :color="isSpeaking ? 'negative' : 'grey-7'"
                            @click="handleSpeakMessage(msg.text)"
                          >
                            <q-tooltip>{{
                              isSpeaking ? "Interrompi audio" : "Ascolta risposta vocale"
                            }}</q-tooltip>
                          </q-btn>
                        </div>

                        <div
                          v-if="msg.toolsUsed && msg.toolsUsed.length > 0"
                          class="row wrap q-gutter-xs q-mt-xs"
                        >
                          <q-chip
                            v-for="tool in msg.toolsUsed"
                            :key="tool"
                            dense
                            square
                            outline
                            color="amber-9"
                            text-color="dark"
                            class="q-pa-xs text-weight-medium"
                            style="font-size: 0.78rem; border-radius: 6px"
                          >
                            🔧 {{ tool }}
                          </q-chip>
                        </div>
                      </q-chat-message>

                      <!-- Approval Card (Human-in-the-Loop) -->
                      <ApprovalCard
                        v-if="getApprovalForMessage(msg)"
                        :approval="getApprovalForMessage(msg)!"
                        :is-resolving="isResolvingApproval === getApprovalForMessage(msg)!.id"
                        :email-signature="
                          task?.settings?.emailSignature ||
                          workspace?.linkedResources?.defaultEmailSignature ||
                          ''
                        "
                        :available-sheets="allAvailableSheets"
                        class="q-my-sm q-ml-sm"
                        @approve="handleApproveAction"
                        @reject="handleRejectAction"
                      />
                    </div>

                    <q-chat-message v-if="isSending" name="AI Agent" bg-color="grey-3">
                      <q-spinner-dots size="1.4rem" color="primary" />
                    </q-chat-message>
                  </div>

                  <!-- File Upload Hidden Input -->
                  <input
                    ref="fileInputRef"
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    style="display: none"
                    @change="handleFileSelected"
                  />

                  <!-- Attached File Chip Preview -->
                  <div v-if="selectedFile" class="q-px-xs q-pb-xs">
                    <q-chip
                      removable
                      color="primary"
                      text-color="white"
                      dense
                      icon="attach_file"
                      @remove="selectedFile = null"
                    >
                      {{ selectedFile.name }}
                    </q-chip>
                  </div>

                  <!-- Chat Input Field with Voice STT & File Attach -->
                  <div class="q-pt-xs bg-white shrink">
                    <q-input
                      ref="chatInputRef"
                      v-model="chatMessage"
                      type="textarea"
                      autogrow
                      outlined
                      dense
                      rows="1"
                      placeholder="Scrivi un'istruzione o detta a voce... (Shift+Invio per a capo)"
                      :disabled="isSending"
                      class="chat-prompt-textarea"
                      @keydown.enter.exact.prevent="handleSendChatMessage"
                    >
                      <template #before>
                        <q-btn
                          flat
                          round
                          dense
                          icon="attach_file"
                          color="grey-7"
                          :disabled="isSending"
                          @click="triggerFileInput"
                        >
                          <q-tooltip>Allega documento PDF o testo</q-tooltip>
                        </q-btn>
                        <q-btn
                          flat
                          round
                          dense
                          :icon="isListening ? 'mic_off' : 'mic'"
                          :color="isListening ? 'negative' : 'primary'"
                          :class="{ 'pulse-mic': isListening }"
                          :disabled="isSending || !isSttSupported"
                          @click="toggleVoiceDictation"
                        >
                          <q-tooltip>{{
                            isListening ? "Ferma dettatura" : "Dettatura vocale nativa"
                          }}</q-tooltip>
                        </q-btn>
                      </template>

                      <template #after>
                        <q-btn
                          round
                          dense
                          flat
                          :icon="isSending ? 'stop_circle' : 'send'"
                          :color="isSending ? 'negative' : 'primary'"
                          :disabled="!isSending && !chatMessage.trim() && !selectedFile"
                          @click="isSending ? handleStopAiExecution() : handleSendChatMessage()"
                        >
                          <q-tooltip>{{
                            isSending ? "Interrompi elaborazione IA" : "Invia messaggio"
                          }}</q-tooltip>
                        </q-btn>
                      </template>
                    </q-input>
                  </div>
                </div>
              </template>

              <!-- After Slot: Vertical Timeline Column (Resizable, Interactive Notes) -->
              <template #after>
                <div
                  v-show="showTimeline"
                  class="task-timeline-panel column no-wrap bg-grey-1 q-pa-sm full-height overflow-hidden"
                  style="min-width: 0"
                >
                  <div
                    class="row items-center justify-between q-mb-xs text-caption text-weight-bold text-primary border-bottom-light q-pb-xs"
                  >
                    <div class="row items-center q-gutter-xs">
                      <q-icon name="timeline" color="primary" size="15px" />
                      <span>Timeline Stati</span>
                    </div>
                    <div class="row items-center q-gutter-xs">
                      <q-btn
                        flat
                        round
                        dense
                        size="xs"
                        :icon="
                          timelineSide === 'right'
                            ? 'align_horizontal_right'
                            : 'align_horizontal_left'
                        "
                        :color="timelineSide === 'right' ? 'primary' : 'amber-9'"
                        @click="timelineSide = timelineSide === 'right' ? 'left' : 'right'"
                      >
                        <q-tooltip>{{
                          timelineSide === "right" ? "Contenuto a sinistra" : "Contenuto a destra"
                        }}</q-tooltip>
                      </q-btn>
                      <q-btn
                        flat
                        round
                        dense
                        size="xs"
                        icon="close"
                        color="grey-7"
                        @click="toggleTimeline"
                      >
                        <q-tooltip>Nascondi Timeline</q-tooltip>
                      </q-btn>
                    </div>
                  </div>

                  <div class="col scroll q-pr-xs q-pt-xs" style="overflow-y: auto">
                    <q-timeline
                      :layout="timelineLayout"
                      :side="timelineSide"
                      color="secondary"
                      class="q-px-xs"
                    >
                      <q-timeline-entry
                        v-for="entry in activeSession.timelineEvents"
                        :key="entry.id"
                        :subtitle="entry.subtitle"
                        :icon="entry.icon"
                        :color="entry.color"
                        :side="timelineSide"
                        class="task-timeline-entry"
                        @click="handleEntryClick($event, entry)"
                      >
                        <template #title>
                          <div
                            class="row items-center justify-between no-wrap cursor-pointer"
                            @click.stop="openNoteDialog(entry)"
                          >
                            <span
                              class="text-weight-bold text-caption text-primary"
                              style="overflow-wrap: break-word; word-break: normal"
                            >
                              {{ entry.title }}
                            </span>
                            <div class="row items-center q-gutter-2xs" @click.stop>
                              <q-btn
                                v-if="entry.note"
                                flat
                                round
                                dense
                                size="2xs"
                                :icon="entry.showNote !== false ? 'visibility' : 'visibility_off'"
                                :color="entry.showNote !== false ? 'amber-9' : 'grey-5'"
                                @click.stop="toggleNoteVisibility(entry)"
                              >
                                <q-tooltip>{{
                                  entry.showNote !== false ? "Nascondi nota" : "Mostra nota"
                                }}</q-tooltip>
                              </q-btn>
                              <q-btn
                                flat
                                round
                                dense
                                size="2xs"
                                icon="edit_note"
                                color="amber-9"
                                @click.stop="openNoteDialog(entry)"
                              >
                                <q-tooltip>{{
                                  entry.note ? "Modifica nota" : "Aggiungi nota allo step"
                                }}</q-tooltip>
                              </q-btn>
                            </div>
                          </div>
                        </template>

                        <div
                          v-if="entry.description"
                          class="text-caption text-grey-8 q-mt-xs"
                          style="
                            font-size: 0.72rem;
                            line-height: 1.3;
                            overflow-wrap: break-word;
                            word-break: normal;
                          "
                        >
                          {{ entry.description }}
                        </div>

                        <!-- Timeline step note card -->
                        <div
                          v-if="entry.note && entry.showNote !== false"
                          class="timeline-step-note q-pa-xs q-mt-xs rounded-borders"
                          style="
                            border-left: 3px solid #c5a065;
                            background: #fffdf7;
                            overflow-wrap: break-word;
                            word-break: normal;
                            white-space: pre-wrap;
                          "
                        >
                          <div class="row items-center justify-between no-wrap q-mb-2xs">
                            <span
                              class="text-caption text-weight-bold text-amber-10 row items-center q-gutter-2xs"
                            >
                              <q-icon name="sticky_note_2" size="12px" color="amber-10" />
                              <span style="font-size: 0.7rem">Nota</span>
                            </span>
                            <div class="row items-center q-gutter-2xs">
                              <q-btn
                                flat
                                round
                                dense
                                size="2xs"
                                icon="edit"
                                color="grey-7"
                                @click.stop="openNoteDialog(entry)"
                              >
                                <q-tooltip>Modifica nota</q-tooltip>
                              </q-btn>
                              <q-btn
                                flat
                                round
                                dense
                                size="2xs"
                                icon="visibility_off"
                                color="grey-6"
                                @click.stop="toggleNoteVisibility(entry)"
                              >
                                <q-tooltip>Nascondi nota</q-tooltip>
                              </q-btn>
                            </div>
                          </div>
                          <div
                            class="text-caption text-grey-9"
                            style="font-size: 0.72rem; line-height: 1.35"
                          >
                            {{ entry.note }}
                          </div>
                        </div>

                        <!-- Hidden note indicator -->
                        <div v-else-if="entry.note && entry.showNote === false" class="q-mt-xs">
                          <q-btn
                            flat
                            dense
                            size="xs"
                            icon="visibility"
                            color="amber-9"
                            label="Mostra nota nascosta"
                            no-caps
                            class="text-caption"
                            style="font-size: 0.68rem; padding: 0 4px"
                            @click.stop="toggleNoteVisibility(entry)"
                          />
                        </div>

                        <!-- Sub-Tasks Operativi & Risorse Embedded in In Progress Timeline Step (Point 1) -->
                        <div
                          v-if="isTargetSubtasksEntry(entry)"
                          class="q-mt-sm rounded-borders bg-white shadow-1 border-light q-pa-xs timeline-subtasks-card"
                          style="border-left: 3px solid #c5a065; overflow-wrap: normal"
                          @click.stop
                        >
                          <!-- Header: Contatore e Titolo -->
                          <div class="row items-center justify-between q-pa-xs border-bottom-light">
                            <div class="row items-center q-gutter-x-xs">
                              <q-icon name="group_work" color="primary" size="18px" />
                              <span class="text-caption text-weight-bold text-primary">
                                Sub-Task Operativi
                              </span>
                              <q-badge
                                color="amber-9"
                                text-color="dark"
                                rounded
                                dense
                                :label="`${subtaskFinishedCount}/${subtasks.length}`"
                              />
                            </div>
                            <span class="text-caption text-grey-7" style="font-size: 0.68rem">
                              {{
                                subtaskFinishedCount === subtasks.length && subtasks.length > 0
                                  ? "Tutti conclusi"
                                  : `${subtasks.length - subtaskFinishedCount} in corso`
                              }}
                            </span>
                          </div>

                          <!-- Action Bar Rapida (Stile Img 3) -->
                          <div
                            class="row q-gutter-xs items-center q-py-xs q-px-2xs bg-grey-1 rounded-borders q-my-2xs"
                          >
                            <q-btn
                              unelevated
                              dense
                              size="xs"
                              color="primary"
                              icon="person_add"
                              label="Nuova Risorsa"
                              class="text-weight-bold q-px-xs"
                              @click="handleCreateManualSubtask"
                            >
                              <q-tooltip>Aggiungi o estrai risorsa dalla chat</q-tooltip>
                            </q-btn>

                            <q-btn
                              outline
                              dense
                              size="xs"
                              color="amber-10"
                              icon="table_chart"
                              label="Sheets"
                              class="q-px-xs"
                              @click="handleOpenOrSyncSheet"
                            >
                              <q-tooltip>Apri o sincronizza foglio Google</q-tooltip>
                            </q-btn>

                            <q-btn
                              outline
                              dense
                              size="xs"
                              color="positive"
                              icon="mail"
                              label="Email"
                              class="q-px-xs"
                              @click="handleEmailAction"
                            >
                              <q-tooltip>Genera bozza email per i contatti</q-tooltip>
                            </q-btn>

                            <q-space />

                            <q-btn
                              flat
                              dense
                              round
                              size="xs"
                              icon="refresh"
                              color="grey-7"
                              :loading="isLoadingSubtasks"
                              @click="fetchSubtasks"
                            >
                              <q-tooltip>Ricarica risorse</q-tooltip>
                            </q-btn>
                          </div>

                          <!-- Lista Risorse Compatta e Cliccabile -->
                          <div
                            v-if="subtasks.length > 0"
                            class="q-gutter-y-2xs q-pt-2xs"
                            style="max-height: 280px; overflow-y: auto"
                          >
                            <div
                              v-for="st in subtasks"
                              :key="st.id"
                              class="row items-center justify-between q-pa-xs rounded-borders bg-white cursor-pointer transition-subtask-row border-light"
                              @click="openSubtaskModal(st)"
                            >
                              <div class="row items-center q-gutter-x-xs col ellipsis">
                                <q-avatar
                                  size="22px"
                                  font-size="13px"
                                  color="navy-light"
                                  text-color="primary"
                                  :icon="
                                    st.domain === 'healthcare'
                                      ? 'medical_services'
                                      : st.domain === 'procurement'
                                        ? 'inventory_2'
                                        : st.domain === 'operations'
                                          ? 'precision_manufacturing'
                                          : 'person'
                                  "
                                />
                                <div class="column ellipsis">
                                  <div class="row items-center q-gutter-x-2xs no-wrap">
                                    <span
                                      class="text-caption text-weight-bold text-dark ellipsis"
                                      style="font-size: 0.76rem"
                                    >
                                      {{ st.title }}
                                    </span>
                                    <q-badge
                                      v-if="st.entityExternalId"
                                      outline
                                      size="2xs"
                                      color="amber-9"
                                      :label="st.entityExternalId"
                                    />
                                  </div>
                                  <span
                                    v-if="st.subtitle"
                                    class="text-caption text-grey-6 ellipsis"
                                    style="font-size: 0.68rem"
                                  >
                                    {{ st.subtitle }}
                                  </span>
                                </div>
                              </div>

                              <div class="row items-center q-gutter-x-2xs shrink q-ml-xs">
                                <q-badge
                                  dense
                                  size="xs"
                                  :color="getSubtaskStatusBadge(st.status).color"
                                  :label="getSubtaskStatusBadge(st.status).label"
                                />
                                <q-badge
                                  v-if="st.outcome === 'won'"
                                  color="positive"
                                  size="xs"
                                  label="Won"
                                />
                                <q-badge
                                  v-else-if="st.outcome === 'lost'"
                                  color="grey-6"
                                  size="xs"
                                  label="Lost"
                                />
                                <q-btn
                                  flat
                                  round
                                  dense
                                  size="sm"
                                  icon="delete"
                                  color="grey-6"
                                  @click.stop="promptDeleteSubtask(st)"
                                >
                                  <q-tooltip>Elimina definitivamente</q-tooltip>
                                </q-btn>
                                <q-icon name="chevron_right" color="grey-5" size="14px" />
                              </div>
                            </div>
                          </div>

                          <div
                            v-else
                            class="text-caption text-grey-6 text-center q-pa-sm"
                            style="font-size: 0.7rem"
                          >
                            Nessuna risorsa monitorata. Clicca su
                            <strong>"+ Nuova Risorsa"</strong> per crearne una o estrarla dai
                            messaggi.
                          </div>
                        </div>
                      </q-timeline-entry>
                    </q-timeline>
                  </div>
                </div>
              </template>
            </q-splitter>
          </div>
        </template>
      </q-splitter>

      <!-- Mouse Resize Handle Corner (only when not fullscreen) -->
      <div
        v-if="!isFullscreen"
        class="resize-handle"
        title="Trascina per ridimensionare finestra"
        @mousedown="handleResizeMouseDown"
      >
        <q-icon name="south_east" size="14px" color="grey-6" />
      </div>
    </div>

    <!-- Timeline Step Note Dialog -->
    <q-dialog v-model="showNoteDialog" persistent>
      <q-card style="min-width: 360px; max-width: 500px; border-radius: 12px">
        <q-card-section class="row items-center justify-between bg-navy text-white q-py-sm">
          <div class="row items-center q-gutter-xs">
            <q-icon name="note_alt" color="amber-5" size="20px" />
            <div class="text-subtitle2 text-weight-bold">
              Nota Step: {{ selectedTimelineEntry?.title }}
            </div>
          </div>
          <q-btn icon="close" flat round dense size="sm" color="white" v-close-popup />
        </q-card-section>

        <q-card-section class="q-pa-md">
          <div class="text-caption text-grey-7 q-mb-sm">
            Aggiungi una nota o appunto personalizzato per questa specifica fase della timeline.
          </div>
          <q-input
            v-model="currentNoteText"
            type="textarea"
            outlined
            rows="4"
            autofocus
            placeholder="Inserisci note operative, osservazioni o promemoria..."
            style="font-size: 0.85rem"
          />
        </q-card-section>

        <q-card-actions align="between" class="q-px-md q-pb-md">
          <q-btn
            v-if="selectedTimelineEntry?.note"
            flat
            color="negative"
            label="Elimina nota"
            icon="delete"
            size="sm"
            @click="deleteNote"
          />
          <div v-else></div>

          <div class="row items-center q-gutter-sm">
            <q-btn flat label="Annulla" color="grey-7" v-close-popup size="sm" />
            <q-btn
              color="primary"
              label="Salva Nota"
              icon="save"
              size="sm"
              class="text-weight-bold"
              @click="saveNote"
            />
          </div>
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Task Operational Settings Modal (Google Sheet, Tab & Email Signature) -->
    <TaskSettingsModal
      v-if="task"
      v-model="showTaskSettingsModal"
      :task="task"
      :workspace="workspace"
      @saved="taskStore.fetchTasks()"
      @open-schedule-modal="showScheduleModal = true"
      @open-regenerate-modal="handleOpenRegenerateModal"
    />

    <!-- AI Task Architect Modal for in-context subtask regeneration -->
    <AITaskArchitectModal
      v-if="task && workspace"
      v-model="showRegenerateTaskModal"
      :workspace-id="workspace.id"
      :existing-task="task"
      :initial-draft="regenerateDraft"
      @task-updated="handleTaskRegenerated"
    />

    <!-- Step 19: Schedule Sourcing Modal -->
    <ScheduleTaskModal
      v-if="task"
      v-model="showScheduleModal"
      :task="task"
      :workspace="workspace"
      :existing-job="activeScheduledJob"
      @saved="handleScheduledJobSaved"
      @deleted="handleScheduledJobDeleted"
    />

    <!-- Step 20: Polymorphic Entity SubTask Modal -->
    <SubTaskEntityModal
      v-model="showSubtaskModal"
      :subtask="selectedSubtask"
      @saved="handleSubtaskSaved"
      @deleted="handleSubtaskDeleted"
    />

    <!-- Step 21: Smart Resource Extraction Dialog (Point 2) -->
    <CreateSubtaskModal
      v-if="task"
      v-model="showCreateSubtaskModal"
      :task="task"
      :task-id="task.id"
      :workspace-id="workspace?.id || task.workspaceId"
      :messages="activeSession?.messages"
      :approvals="activeSession?.approvals"
      :existing-subtasks="subtasks"
      @created="handleSubtaskCreated"
    />
    <!-- Step 21 §2.2: Dialog — Modifica Descrizione Task -->
    <q-dialog v-model="showEditDescriptionDialog" persistent>
      <q-card style="min-width: 460px; max-width: 90vw" class="bg-white rounded-xl">
        <q-card-section
          class="row items-center q-py-sm q-px-md"
          style="background: #0a2342; border-bottom: 2px solid #c5a065"
        >
          <q-icon name="edit_note" color="amber-5" size="20px" class="q-mr-sm" />
          <span class="text-subtitle2 text-weight-bold text-white">Modifica Descrizione Task</span>
          <q-space />
          <q-btn flat round dense icon="close" color="white" v-close-popup />
        </q-card-section>
        <q-card-section class="q-pa-md">
          <q-input
            v-model="editDescriptionDraft"
            type="textarea"
            rows="8"
            outlined
            dense
            label="Descrizione / Obiettivo del Task"
            hint="Modifica la descrizione del task. Sarà usata come contesto dall'Agente IA."
          />
        </q-card-section>
        <q-card-actions align="right" class="q-px-md q-pb-md">
          <q-btn flat label="Annulla" color="grey-7" no-caps v-close-popup />
          <q-btn
            unelevated
            color="primary"
            icon="save"
            label="Salva Descrizione"
            no-caps
            class="text-weight-bold"
            @click="saveEditedDescription"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Step 21 §2.2: Dialog — Modifica Sotto-Task AI Operative -->
    <q-dialog v-model="showEditSubtasksDialog" persistent>
      <q-card style="min-width: 500px; max-width: 92vw" class="bg-white rounded-xl">
        <q-card-section
          class="row items-center q-py-sm q-px-md"
          style="background: #0a2342; border-bottom: 2px solid #c5a065"
        >
          <q-icon name="checklist" color="amber-5" size="20px" class="q-mr-sm" />
          <span class="text-subtitle2 text-weight-bold text-white"
            >Modifica Sotto-Task Operative</span
          >
          <q-space />
          <q-btn flat round dense icon="close" color="white" v-close-popup />
        </q-card-section>
        <q-card-section class="q-pa-md" style="max-height: 55vh; overflow-y: auto">
          <div
            v-if="editSubtasksDraft.length === 0"
            class="text-caption text-grey-6 italic q-mb-sm"
          >
            Nessuna sotto-task. Aggiungine una qui sotto.
          </div>
          <div
            v-for="(st, idx) in editSubtasksDraft"
            :key="st.id || idx"
            class="row items-center q-col-gutter-xs q-mb-xs no-wrap"
          >
            <div class="col-auto">
              <q-badge color="grey-5" text-color="dark" :label="idx + 1" />
            </div>
            <div class="col">
              <q-input v-model="st.title" outlined dense placeholder="Titolo sotto-task..." />
            </div>
            <div class="col-auto">
              <q-btn
                flat
                round
                dense
                size="xs"
                icon="delete"
                color="negative"
                @click="removeEditSubtaskItem(idx)"
              >
                <q-tooltip>Elimina</q-tooltip>
              </q-btn>
            </div>
          </div>
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            color="primary"
            icon="add_circle"
            label="Aggiungi Sotto-Task"
            class="q-mt-sm"
            @click="addEditSubtaskItem"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-px-md q-pb-md">
          <q-btn flat label="Annulla" color="grey-7" no-caps v-close-popup />
          <q-btn
            unelevated
            color="primary"
            icon="save"
            label="Salva Sotto-Task"
            no-caps
            class="text-weight-bold"
            @click="saveEditedSubtasks"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped lang="scss">
.floating-task-window {
  background: #ffffff;
  border-radius: 12px;
  border: 1.5px solid rgba(10, 35, 66, 0.25);
  box-shadow: 0 16px 40px rgba(10, 35, 66, 0.22);
  transition: box-shadow 0.2s ease;

  &:hover {
    box-shadow: 0 20px 48px rgba(10, 35, 66, 0.35);
  }
}

.bg-navy {
  background-color: #0a2342;
}

.unselectable {
  user-select: none;
}

.resize-handle {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  cursor: se-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  opacity: 0.7;

  &:hover {
    opacity: 1;
  }
}

.text-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pulse-mic {
  animation: pulse-ring 1.2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
}

@keyframes pulse-ring {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
  }
  70% {
    transform: scale(1.08);
    box-shadow: 0 0 0 10px rgba(239, 68, 68, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
  }
}

.task-window-splitter-bar {
  background-color: rgba(10, 35, 66, 0.12);
  width: 5px;
  cursor: col-resize;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #c5a065;
  }
}

:deep(.bg-navy-light) {
  background-color: rgba(255, 255, 255, 0.18) !important;
}

.floating-task-window.is-fullscreen {
  border-radius: 0 !important;
  border: none !important;
  box-shadow: none !important;
  z-index: 9999 !important;
}

.border-bottom-light {
  border-bottom: 1px solid rgba(10, 35, 66, 0.08);
}

.task-timeline-panel {
  background-color: #fbfbfd;
  transition: all 0.2s ease;
}

.task-timeline-entry {
  :deep(.q-timeline__dot) {
    cursor: pointer;
    transition: transform 0.15s ease;
    &:hover {
      transform: scale(1.15);
    }
  }
  :deep(.q-timeline__title) {
    font-size: 0.78rem;
    font-weight: 700;
    margin-bottom: 2px;
  }
  :deep(.q-timeline__subtitle) {
    font-size: 0.7rem;
    color: #6c757d;
    margin-bottom: 2px;
    text-transform: none;
    opacity: 0.85;
  }
}

.timeline-step-note {
  box-shadow: 0 1px 4px rgba(10, 35, 66, 0.08);
}

.timeline-subtasks-card {
  border-left: 3px solid #0a2342;
  transition: all 0.2s ease;
}

.transition-subtask-row {
  transition: all 0.15s ease-in-out;
  border: 1px solid rgba(10, 35, 66, 0.08);

  &:hover {
    background-color: #f0f4f8 !important;
    border-color: rgba(10, 35, 66, 0.2);
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(10, 35, 66, 0.08);
  }
}

.border-light {
  border: 1px solid rgba(10, 35, 66, 0.08);
}

.chat-prompt-textarea {
  font-size: 0.875rem;

  :deep(.q-field__control) {
    border-radius: 12px;
    padding: 2px 8px;
    min-height: 42px;
    background-color: #fafbfc;
    transition: all 0.2s ease;

    &:hover {
      border-color: rgba(10, 35, 66, 0.3);
    }
    &.q-field__control--focused {
      background-color: #ffffff;
      box-shadow: 0 0 0 2px rgba(10, 35, 66, 0.1);
    }
  }

  :deep(.q-field__native) {
    padding: 6px 0;
    max-height: 180px;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    line-height: 1.4;
    resize: none;
  }

  :deep(.q-field__before),
  :deep(.q-field__after) {
    align-self: flex-end;
    padding-bottom: 4px;
  }
}
</style>
