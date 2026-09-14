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
  serverTimestamp,
} from "firebase/firestore";

// ── Types ────────────────────────────────────────────────────────────────────
import type {
  TaskStatus,
  TaskKeyPoint,
  KeyPointCategory,
  TaskTimelineEvent,
  TaskChatMessage,
  ApprovalRecord,
  LinkedGoogleResource,
  ScheduledSourcingJob,
  EntitySubTask,
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
    startListening((text) => {
      chatMessage.value = text;
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

const getStatusLabel = (status: string): string => {
  switch (status) {
    case "new":
      return "Da Contattare";
    case "contacted":
      return "Contattato";
    case "waiting_response":
      return "In Attesa";
    case "negotiation":
      return "In Trattativa";
    case "positive_response":
      return "Positivo";
    case "negative_response":
      return "Negativo";
    case "follow_up":
      return "Follow-up";
    case "completed":
      return "Completato";
    default:
      return status;
  }
}; /*end getStatusLabel*/

const getStatusColor = (status: string): string => {
  switch (status) {
    case "new":
      return "blue-6";
    case "contacted":
      return "light-blue-7";
    case "waiting_response":
      return "amber-8";
    case "negotiation":
      return "purple-6";
    case "positive_response":
    case "completed":
      return "positive";
    case "negative_response":
      return "deep-orange-7";
    case "follow_up":
      return "indigo-6";
    default:
      return "grey-7";
  }
}; /*end getStatusColor*/

const isSubtasksTimelineEntry = (entry: {
  status?: string;
  title?: string;
  id?: string;
}): boolean => {
  if (entry.status === "in-progress" || entry.title === "In Progress") return true;
  const hasInProgress = activeSession.value?.timelineEvents?.some(
    (e) => e.status === "in-progress" || e.title === "In Progress",
  );
  if (!hasInProgress && entry.status === task.value?.status) return true;
  return false;
}; /*end isSubtasksTimelineEntry*/

interface DetectedCandidate {
  title: string;
  role?: string;
  email?: string;
  source: "sheet" | "web" | "email" | "chat";
  notes?: string;
}

const showSmartSubtaskModal = ref<boolean>(false);
const isCreatingSmartSubtask = ref<boolean>(false);
const smartSubtaskForm = ref({
  title: "",
  role: "",
  email: "",
  source: "sheet" as "sheet" | "web" | "email" | "chat" | "manual",
  notes: "",
});

const detectedCandidates = computed<DetectedCandidate[]>(() => {
  const list: DetectedCandidate[] = [];
  const seenTitles = new Set<string>();

  // 1. Scan approvals (Google Sheet preview rows & Gmail drafts)
  for (const app of activeSession.value?.approvals || []) {
    const raw = app.previewData as unknown as Record<string, unknown> | undefined;
    if (!raw) continue;

    let rows: unknown[] = [];
    if (Array.isArray(raw.previewRows)) rows = raw.previewRows;
    else if (Array.isArray(raw.rows)) rows = raw.rows;
    else if (typeof raw.rowsJson === "string") {
      try {
        const parsed = JSON.parse(raw.rowsJson);
        if (Array.isArray(parsed)) rows = parsed;
      } catch {}
    } else if (typeof raw.previewRowsJson === "string") {
      try {
        const parsed = JSON.parse(raw.previewRowsJson);
        if (Array.isArray(parsed)) rows = parsed;
      } catch {}
    }

    for (const row of rows) {
      if (!row) continue;
      let name = "";
      let role = "";
      let email = "";
      let note = "";

      if (Array.isArray(row)) {
        name = String(row[0] ?? "").trim();
        role = String(row[1] ?? "").trim();
        email = String(row[2] ?? "").trim();
      } else if (typeof row === "object") {
        const rObj = row as Record<string, unknown>;
        name = String(
          rObj["Nome Candidato"] ||
            rObj["Nome"] ||
            rObj["Candidate"] ||
            rObj["Candidato"] ||
            rObj["Name"] ||
            rObj["name"] ||
            rObj["title"] ||
            "",
        ).trim();
        role = String(
          rObj["Ruolo / Specializzazione"] ||
            rObj["Ruolo"] ||
            rObj["Role"] ||
            rObj["Specializzazione"] ||
            "",
        ).trim();
        email = String(rObj["Email"] || rObj["email"] || rObj["E-mail"] || "").trim();
        note = String(rObj["Note"] || rObj["Dettagli"] || "").trim();
      }

      if (name && name.length > 2 && !seenTitles.has(name.toLowerCase())) {
        seenTitles.add(name.toLowerCase());
        list.push({
          title: name,
          role,
          email,
          source: "sheet",
          notes: note,
        });
      }
    }

    if (raw.to) {
      const to = String(raw.to || "").trim();
      if (to && !seenTitles.has(to.toLowerCase())) {
        seenTitles.add(to.toLowerCase());
        list.push({
          title: to,
          email: to,
          role: String(raw.subject || "Email Recipient").trim(),
          source: "email",
          notes: String(raw.body || "").substring(0, 200),
        });
      }
    }
  }

  // 2. Scan AI messages for structured lists
  for (const msg of activeSession.value?.messages || []) {
    if (msg.sender !== "agent" || !msg.text) continue;
    const lines = msg.text.split("\n");
    for (const line of lines) {
      const match = line.match(
        /^[\s*#-]*\d*\.?\s*\*?\*?([A-Z][a-zÀ-ÿ]+ [A-Z][a-zÀ-ÿ]+)\*?\*?\s*[-–:]\s*(.+)/,
      );
      if (match && match[1] && match[2]) {
        const name = match[1].trim();
        const role = match[2].trim();
        if (!seenTitles.has(name.toLowerCase()) && name.length > 3 && name.length < 40) {
          seenTitles.add(name.toLowerCase());
          list.push({
            title: name,
            role: role.substring(0, 80),
            source: "chat",
          });
        }
      }
    }
  }

  return list;
});

const openSmartSubtaskModal = (cand?: DetectedCandidate): void => {
  if (cand) {
    smartSubtaskForm.value = {
      title: cand.title,
      role: cand.role || "",
      email: cand.email || "",
      source: cand.source,
      notes: cand.notes || "",
    };
  } else if (detectedCandidates.value.length > 0 && !smartSubtaskForm.value.title) {
    const first = detectedCandidates.value[0]!;
    smartSubtaskForm.value = {
      title: first.title,
      role: first.role || "",
      email: first.email || "",
      source: first.source,
      notes: first.notes || "",
    };
  } else if (!smartSubtaskForm.value.title) {
    smartSubtaskForm.value = {
      title: "",
      role: "",
      email: "",
      source: "manual",
      notes: "",
    };
  }
  showSmartSubtaskModal.value = true;
}; /*end openSmartSubtaskModal*/

const selectDetectedCandidate = (cand: DetectedCandidate): void => {
  smartSubtaskForm.value = {
    title: cand.title,
    role: cand.role || "",
    email: cand.email || "",
    source: cand.source,
    notes: cand.notes || "",
  };
}; /*end selectDetectedCandidate*/

const handleCreateSmartSubtask = async (): Promise<void> => {
  const name = smartSubtaskForm.value.title.trim();
  if (!name || !task.value) return;

  const tId = authStore.tenantId;
  const wsId = workspace.value?.id || task.value?.workspaceId;
  const taskId = task.value?.id;
  if (!tId || !wsId || !taskId) return;

  isCreatingSmartSubtask.value = true;
  try {
    const db = getFirestore();
    const subCol = collection(db, "tenants", tId, "workspaces", wsId, "tasks", taskId, "subtasks");
    const newRef = doc(subCol);
    const nowIso = new Date().toISOString();

    const attributes: Record<string, unknown> = {};
    if (smartSubtaskForm.value.role) {
      attributes.role = smartSubtaskForm.value.role.trim();
    }
    if (smartSubtaskForm.value.email) {
      attributes.email = smartSubtaskForm.value.email.trim();
    }
    if (smartSubtaskForm.value.source) {
      attributes.source = smartSubtaskForm.value.source;
    }

    const newSubtask: EntitySubTask = {
      id: newRef.id,
      tenantId: tId,
      workspaceId: wsId,
      taskId,
      domain: "recruiting",
      title: name,
      ...(smartSubtaskForm.value.role.trim()
        ? { subtitle: smartSubtaskForm.value.role.trim() }
        : {}),
      status: "new",
      outcome: "in_progress",
      attributes,
      notes: smartSubtaskForm.value.notes.trim() || "",
      timeline: [
        {
          id: `evt_init_${Date.now()}`,
          eventType: "status_change",
          title: "Risorsa creata",
          description: `Creata tramite ${
            smartSubtaskForm.value.source === "sheet"
              ? "Google Sheet"
              : smartSubtaskForm.value.source === "chat"
                ? "estrazione chat"
                : "inserimento operatore"
          }`,
          authorId: authStore.user?.uid || "user",
          authorName: authStore.user?.displayName || "Operatore",
          timestamp: nowIso,
        },
      ],
      nestedTasks: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const { setDoc } = await import("firebase/firestore");
    await setDoc(newRef, newSubtask);

    subtasks.value.push(newSubtask);
    showSmartSubtaskModal.value = false;
    smartSubtaskForm.value = { title: "", role: "", email: "", source: "manual", notes: "" };
    q.notify({
      type: "positive",
      message: `Risorsa "${name}" creata con successo!`,
      icon: "person_add",
      position: "top",
    });
    openSubtaskModal(newSubtask);
  } catch (err) {
    logger.error("TaskChatWindow", "Failed to create smart subtask", err);
    q.notify({
      type: "negative",
      message: "Errore durante la creazione del sub-task",
      position: "top",
    });
  } finally {
    isCreatingSmartSubtask.value = false;
  }
}; /*end handleCreateSmartSubtask*/

const handleCreateManualSubtask = (): void => {
  openSmartSubtaskModal();
}; /*end handleCreateManualSubtask*/

const handleSyncToGoogleSheets = (): void => {
  const pendingSheetApproval = activeSession.value?.approvals?.find(
    (a) => a.actionType === "sheet_append" && a.status === "pending",
  );
  if (pendingSheetApproval) {
    q.notify({
      type: "info",
      message: "Scheda di approvazione Google Sheets attiva trovata nella chat.",
      icon: "table_chart",
      position: "top",
    });
  } else {
    q.notify({
      type: "positive",
      message: "Tutte le risorse sono collegate al Workspace.",
      icon: "check_circle",
      position: "top",
    });
  }
}; /*end handleSyncToGoogleSheets*/

const handleDraftEmailForSubtasks = (): void => {
  chatMessage.value =
    "Prepara una bozza di email formale da inviare alle risorse per verificare la disponibilità e presentare i dettagli operativi.";
  q.notify({
    type: "info",
    message: "Istruzione email inserita nella chat. Invia il messaggio per generarla!",
    icon: "mail",
    position: "top",
  });
}; /*end handleDraftEmailForSubtasks*/

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

              <!-- Sub-Tasks Embedded under In Progress Milestone (Img 1 + Img 5) -->
              <div
                v-if="isSubtasksTimelineEntry(entry)"
                class="subtasks-timeline-block q-mt-sm q-pa-xs rounded-borders bg-white shadow-1"
                style="border: 1.5px solid #c5a065"
                @click.stop
              >
                <div class="row items-center justify-between q-pa-xs border-bottom-subtle">
                  <div class="row items-center q-gutter-2xs no-wrap ellipsis" style="flex: 1">
                    <q-icon name="group_work" color="amber-9" size="14px" />
                    <span
                      class="text-caption text-weight-bold text-primary ellipsis"
                      style="font-size: 0.72rem"
                    >
                      Risorse & Sub-Task ({{ subtaskWonCount + subtaskLostCount }}/{{
                        subtasks.length
                      }})
                    </span>
                  </div>
                  <div class="row items-center q-gutter-2xs no-wrap">
                    <q-btn
                      flat
                      round
                      dense
                      size="2xs"
                      icon="person_add"
                      color="primary"
                      @click.stop="openSmartSubtaskModal()"
                    >
                      <q-tooltip>Nuova Risorsa (Smart Extraction)</q-tooltip>
                    </q-btn>
                    <q-btn
                      flat
                      round
                      dense
                      size="2xs"
                      icon="table_chart"
                      color="teal-7"
                      @click.stop="handleSyncToGoogleSheets"
                    >
                      <q-tooltip>Sincronizza / Verifica Google Sheets</q-tooltip>
                    </q-btn>
                    <q-btn
                      flat
                      round
                      dense
                      size="2xs"
                      icon="mail"
                      color="indigo-7"
                      @click.stop="handleDraftEmailForSubtasks"
                    >
                      <q-tooltip>Bozza Email per Risorse</q-tooltip>
                    </q-btn>
                    <q-btn
                      flat
                      round
                      dense
                      size="2xs"
                      icon="refresh"
                      color="grey-7"
                      :loading="isLoadingSubtasks"
                      @click.stop="fetchSubtasks"
                    >
                      <q-tooltip>Ricarica Risorse</q-tooltip>
                    </q-btn>
                  </div>
                </div>

                <!-- Subtasks List (One under another, clickable) -->
                <div v-if="subtasks.length > 0" class="column q-gutter-y-2xs q-pt-xs">
                  <div
                    v-for="st in subtasks"
                    :key="st.id"
                    class="row items-center justify-between q-pa-xs rounded-borders cursor-pointer subtask-timeline-row"
                    style="background: #faf8f5; border: 1px solid rgba(10, 35, 66, 0.08)"
                    @click.stop="openSubtaskModal(st)"
                  >
                    <div class="row items-center no-wrap ellipsis q-mr-xs" style="flex: 1">
                      <q-avatar
                        size="20px"
                        font-size="12px"
                        color="amber-1"
                        text-color="amber-10"
                        :icon="st.domain === 'healthcare' ? 'medical_services' : 'person'"
                        class="q-mr-xs"
                      />
                      <span
                        class="text-caption text-weight-bold text-navy ellipsis"
                        style="font-size: 0.72rem"
                      >
                        {{ st.title }}
                      </span>
                    </div>
                    <div class="row items-center q-gutter-2xs no-wrap">
                      <q-badge
                        dense
                        rounded
                        :color="getStatusColor(st.status)"
                        class="text-caption text-weight-medium q-px-xs"
                        style="font-size: 0.65rem"
                      >
                        {{ getStatusLabel(st.status) }}
                      </q-badge>
                      <q-icon name="chevron_right" size="14px" color="grey-6" />
                    </div>
                  </div>
                </div>

                <div
                  v-else
                  class="q-pa-xs text-center text-grey-6 text-caption"
                  style="font-size: 0.7rem"
                >
                  Nessuna risorsa creata. Clicca
                  <q-icon name="person_add" size="13px" color="primary" /> per iniziare.
                </div>
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
              <div class="text-caption text-weight-bold text-primary q-mb-xs">
                📌 Descrizione Task
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
                  :loading="isDecomposing"
                  @click="handleDecomposeExistingTask"
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
              <q-expansion-item
                v-if="task.aiMetadata?.subtasks && task.aiMetadata.subtasks.length > 0"
                dense
                icon="checklist"
                :label="`Sotto-Task Operative (${task.aiMetadata.subtasks.filter((s) => s.completed).length}/${task.aiMetadata.subtasks.length})`"
                header-class="text-caption text-weight-bold text-primary q-pa-xs bg-blue-1 rounded-borders"
                class="q-mb-sm task-subtasks-expansion rounded-borders"
                style="border: 1px solid rgba(10, 35, 66, 0.15)"
              >
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
                        style="overflow-wrap: break-word; word-break: normal"
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
                    style="overflow-y: auto"
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
                      outlined
                      dense
                      placeholder="Scrivi un'istruzione o detta a voce..."
                      :disabled="isSending"
                      style="font-size: 0.85rem"
                      @keyup.enter="handleSendChatMessage"
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
                            isListening ? "Ferma dettatura" : "Dettatura vocale nativa (€0)"
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

                        <!-- Sub-Tasks Embedded under In Progress Milestone (Img 1 + Img 5) -->
                        <div
                          v-if="isSubtasksTimelineEntry(entry)"
                          class="subtasks-timeline-block q-mt-xs q-pa-xs rounded-borders bg-white shadow-1"
                          style="border: 1.5px solid #c5a065"
                          @click.stop
                        >
                          <div
                            class="row items-center justify-between q-pa-xs border-bottom-subtle"
                          >
                            <div
                              class="row items-center q-gutter-2xs no-wrap ellipsis"
                              style="flex: 1"
                            >
                              <q-icon name="group_work" color="amber-9" size="14px" />
                              <span
                                class="text-caption text-weight-bold text-primary ellipsis"
                                style="font-size: 0.72rem"
                              >
                                Risorse & Sub-Task ({{ subtaskWonCount + subtaskLostCount }}/{{
                                  subtasks.length
                                }})
                              </span>
                            </div>
                            <div class="row items-center q-gutter-2xs no-wrap">
                              <q-btn
                                flat
                                round
                                dense
                                size="2xs"
                                icon="person_add"
                                color="primary"
                                @click.stop="openSmartSubtaskModal()"
                              >
                                <q-tooltip>Nuova Risorsa (Smart Extraction)</q-tooltip>
                              </q-btn>
                              <q-btn
                                flat
                                round
                                dense
                                size="2xs"
                                icon="table_chart"
                                color="teal-7"
                                @click.stop="handleSyncToGoogleSheets"
                              >
                                <q-tooltip>Sincronizza / Verifica Google Sheets</q-tooltip>
                              </q-btn>
                              <q-btn
                                flat
                                round
                                dense
                                size="2xs"
                                icon="mail"
                                color="indigo-7"
                                @click.stop="handleDraftEmailForSubtasks"
                              >
                                <q-tooltip>Bozza Email per Risorse</q-tooltip>
                              </q-btn>
                              <q-btn
                                flat
                                round
                                dense
                                size="2xs"
                                icon="refresh"
                                color="grey-7"
                                :loading="isLoadingSubtasks"
                                @click.stop="fetchSubtasks"
                              >
                                <q-tooltip>Ricarica Risorse</q-tooltip>
                              </q-btn>
                            </div>
                          </div>

                          <!-- Subtasks List (One under another, clickable) -->
                          <div v-if="subtasks.length > 0" class="column q-gutter-y-2xs q-pt-xs">
                            <div
                              v-for="st in subtasks"
                              :key="st.id"
                              class="row items-center justify-between q-pa-xs rounded-borders cursor-pointer subtask-timeline-row"
                              style="background: #faf8f5; border: 1px solid rgba(10, 35, 66, 0.08)"
                              @click.stop="openSubtaskModal(st)"
                            >
                              <div
                                class="row items-center no-wrap ellipsis q-mr-xs"
                                style="flex: 1"
                              >
                                <q-avatar
                                  size="20px"
                                  font-size="12px"
                                  color="amber-1"
                                  text-color="amber-10"
                                  :icon="st.domain === 'healthcare' ? 'medical_services' : 'person'"
                                  class="q-mr-xs"
                                />
                                <span
                                  class="text-caption text-weight-bold text-navy ellipsis"
                                  style="font-size: 0.72rem"
                                >
                                  {{ st.title }}
                                </span>
                              </div>
                              <div class="row items-center q-gutter-2xs no-wrap">
                                <q-badge
                                  dense
                                  rounded
                                  :color="getStatusColor(st.status)"
                                  class="text-caption text-weight-medium q-px-xs"
                                  style="font-size: 0.65rem"
                                >
                                  {{ getStatusLabel(st.status) }}
                                </q-badge>
                                <q-icon name="chevron_right" size="14px" color="grey-6" />
                              </div>
                            </div>
                          </div>

                          <div
                            v-else
                            class="q-pa-xs text-center text-grey-6 text-caption"
                            style="font-size: 0.7rem"
                          >
                            Nessuna risorsa creata. Clicca
                            <q-icon name="person_add" size="13px" color="primary" /> per iniziare.
                          </div>
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

    <!-- Smart SubTask Creation Dialog (Point 2) -->
    <q-dialog v-model="showSmartSubtaskModal" persistent>
      <q-card style="width: 520px; max-width: 95vw" class="rounded-borders bg-white shadow-3">
        <q-card-section class="bg-royal-navy text-white row items-center justify-between q-pa-sm">
          <div class="row items-center q-gutter-xs">
            <q-avatar
              size="28px"
              font-size="16px"
              color="amber-9"
              text-color="dark"
              icon="person_add"
            />
            <span class="text-subtitle2 text-weight-bold">Nuova Risorsa / Sub-Task</span>
          </div>
          <q-btn flat round dense icon="close" color="white" v-close-popup />
        </q-card-section>

        <q-card-section class="q-pa-md">
          <!-- Detected Candidates from Chat / Sheets -->
          <div v-if="detectedCandidates.length > 0" class="q-mb-md">
            <div
              class="text-caption text-weight-bold text-primary q-mb-xs row items-center q-gutter-xs"
            >
              <q-icon name="auto_awesome" color="amber-9" size="14px" />
              <span>Profili Rilevati nella Chat / Tabella (1-Click Fill):</span>
            </div>
            <div class="row q-gutter-xs">
              <q-chip
                v-for="(cand, cIdx) in detectedCandidates"
                :key="cIdx"
                clickable
                dense
                outline
                color="amber-9"
                text-color="dark"
                icon="person"
                class="cursor-pointer text-caption text-weight-medium"
                @click="selectDetectedCandidate(cand)"
              >
                {{ cand.title }}
                <span v-if="cand.role" class="text-grey-7 text-weight-regular q-ml-xs">
                  ({{ cand.role }})
                </span>
                <q-tooltip>Clicca per pre-compilare i dati di {{ cand.title }}</q-tooltip>
              </q-chip>
            </div>
          </div>

          <!-- Form -->
          <div class="q-gutter-y-sm">
            <q-input
              v-model="smartSubtaskForm.title"
              outlined
              dense
              label="Nome Risorsa / Candidato *"
              placeholder="es. Davide Benvenuti"
              :rules="[(val) => (val && val.trim().length > 0) || 'Nome obbligatorio']"
            >
              <template #prepend>
                <q-icon name="person" color="primary" />
              </template>
            </q-input>

            <q-input
              v-model="smartSubtaskForm.role"
              outlined
              dense
              label="Ruolo / Specializzazione"
              placeholder="es. Senior Oracle DBA"
            >
              <template #prepend>
                <q-icon name="badge" color="primary" />
              </template>
            </q-input>

            <q-input
              v-model="smartSubtaskForm.email"
              outlined
              dense
              type="email"
              label="Email Contatto"
              placeholder="es. candidato@azienda.it"
            >
              <template #prepend>
                <q-icon name="email" color="primary" />
              </template>
            </q-input>

            <q-select
              v-model="smartSubtaskForm.source"
              outlined
              dense
              emit-value
              map-options
              label="Origine / Fonte"
              :options="[
                { label: 'Google Sheets', value: 'sheet' },
                { label: 'Ricerca Web', value: 'web' },
                { label: 'Email Ricevuta', value: 'email' },
                { label: 'Inserimento Manuale', value: 'manual' },
              ]"
            >
              <template #prepend>
                <q-icon name="source" color="primary" />
              </template>
            </q-select>

            <q-input
              v-model="smartSubtaskForm.notes"
              type="textarea"
              outlined
              dense
              autogrow
              rows="2"
              label="Note Operative Iniziali"
              placeholder="Inserisci dettagli, contatti o note ereditate..."
            />
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-sm bg-grey-1 border-top-light">
          <q-btn flat dense label="Annulla" color="grey-7" v-close-popup />
          <q-btn
            unelevated
            dense
            color="primary"
            icon="add_circle"
            label="Crea e Apri Scheda"
            class="q-px-md text-weight-bold"
            :loading="isCreatingSmartSubtask"
            :disable="!smartSubtaskForm.title.trim()"
            @click="handleCreateSmartSubtask"
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
</style>
