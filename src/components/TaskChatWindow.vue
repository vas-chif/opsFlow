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

// ── Types ────────────────────────────────────────────────────────────────────
import type {
  TaskStatus,
  TaskKeyPoint,
  KeyPointCategory,
  TaskTimelineEvent,
  TaskChatMessage,
  ApprovalRecord,
} from "../types/models";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useAuthStore } from "../stores/authStore";
import { useTaskStore } from "../stores/taskStore";
import { useTaskChatStore, type FloatingWindow } from "../stores/taskChatStore";

// ── Composables ──────────────────────────────────────────────────────────────
import { useSecureLogger } from "../composables/useSecureLogger";
import { useWebSpeech } from "../composables/useWebSpeech";

// ── Components ───────────────────────────────────────────────────────────────
import TaskKeyPointsCard from "./TaskKeyPointsCard.vue";
import ApprovalCard from "./ApprovalCard.vue";
import TaskSettingsModal from "./TaskSettingsModal.vue";

const props = defineProps<{
  windowState: FloatingWindow;
}>();

const q = useQuasar();
const authStore = useAuthStore();
const taskStore = useTaskStore();
const chatStore = useTaskChatStore();
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
  () => taskStore.workspaces.find((w) => w.id === props.windowState.workspaceId) ?? null,
);

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
const isResizing = ref(false);
const resizeStart = ref({ x: 0, y: 0, w: 0, h: 0 });

// Fullscreen & Layout View Mode
const isFullscreen = computed(() => !!props.windowState.isFullscreen);
const viewMode = ref<"both" | "details" | "chat" | "timeline">("both");
const splitterModel = ref(46); // balanced default: left details, right chat + timeline
const showTimeline = ref(true);
const chatTimelineSplitterModel = ref(62); // 62% chat, 38% timeline
const savedSplitterRatio = ref(62);

const showNoteDialog = ref(false);
const selectedTimelineEntry = ref<TaskTimelineEvent | null>(null);
const currentNoteText = ref("");

type TimelineLayout = "dense" | "comfortable" | "loose";
type TimelineSide = "right" | "left";

const timelineLayout = ref<TimelineLayout>("dense");
const timelineSide = ref<TimelineSide>("right");

const toggleTimeline = (): void => {
  showTimeline.value = !showTimeline.value;
  if (!showTimeline.value) {
    savedSplitterRatio.value = chatTimelineSplitterModel.value;
    chatTimelineSplitterModel.value = 100;
  } else {
    chatTimelineSplitterModel.value =
      savedSplitterRatio.value < 100 ? savedSplitterRatio.value : 62;
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
  { label: "Contacted", value: "contacted", color: "light-blue-3", icon: "mail" },
  { label: "Positive Response", value: "positive-response", color: "positive", icon: "thumb_up" },
  { label: "Negative Response", value: "negative-response", color: "negative", icon: "thumb_down" },
  {
    label: "Follow-up 30 Days",
    value: "follow-up-30-days",
    color: "deep-orange-4",
    icon: "event_repeat",
  },
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

const handleStatusChange = async (newStatus: TaskStatus): Promise<void> => {
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
        workspaceId: workspace.value?.id,
        taskId: task.value.id,
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
): Promise<void> => {
  if (!task.value || !approvalId) return;
  const taskId = task.value.id;
  const tenantId = authStore.tenantId || workspace.value?.tenantId || "opsflow_tenant_default";
  const workspaceId = workspace.value?.id || "default_workspace";
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

const handleRejectAction = async (approvalId: string): Promise<void> => {
  if (!task.value || !approvalId) return;
  const taskId = task.value.id;
  const tenantId = authStore.tenantId || workspace.value?.tenantId || "opsflow_tenant_default";
  const workspaceId = workspace.value?.id || "default_workspace";
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
                        :available-sheets="workspace?.linkedResources?.linkedSheets || []"
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
