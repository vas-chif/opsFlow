<!--
  @file TaskChatWindow.vue
  @description Draggable & Resizable Multi-Window Task Chat component for OpsFlow.
  @author Vasile Chifeac
  @created 2026-07-31
  @modified 2026-08-30 (Step 12 Fase 3: TaskKeyPointsCard.vue integration, rolling key points parser, europe-west1 endpoint)
-->

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useQuasar } from "quasar";
import { useTaskStore } from "../stores/taskStore";
import { useTaskChatStore, type FloatingWindow } from "../stores/taskChatStore";
import { useSecureLogger } from "../composables/useSecureLogger";
import { useWebSpeech } from "../composables/useWebSpeech";
import type { TaskStatus, TaskKeyPoint, KeyPointCategory } from "../types/models";

// ── Components ───────────────────────────────────────────────────────────────
import TaskKeyPointsCard from "./TaskKeyPointsCard.vue";

const props = defineProps<{
  windowState: FloatingWindow;
}>();

const q = useQuasar();
const taskStore = useTaskStore();
const chatStore = useTaskChatStore();
const logger = useSecureLogger();
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

// Resize state
const isResizing = ref(false);
const resizeStart = ref({ x: 0, y: 0, w: 0, h: 0 });

// Fullscreen & Layout View Mode
const isFullscreen = computed(() => !!props.windowState.isFullscreen);
const viewMode = ref<"both" | "details" | "chat">("both");
const splitterModel = ref(48); // 48% left pane, 52% right pane

const setViewMode = (mode: "both" | "details" | "chat"): void => {
  viewMode.value = mode;
  if (mode === "details") {
    splitterModel.value = 100;
  } else if (mode === "chat") {
    splitterModel.value = 0;
  } else {
    splitterModel.value = 48;
  }
}; /*end setViewMode*/

const toggleFullscreen = (): void => {
  chatStore.toggleFullscreenWindow(props.windowState.taskId);
}; /*end toggleFullscreen*/

const sendToBack = (): void => {
  chatStore.sendToBack(props.windowState.taskId);
}; /*end sendToBack*/

const activeSession = computed(() => {
  return chatStore.openSession(props.windowState.taskId, props.windowState.workspaceId);
});

const statusOptions: { label: string; value: TaskStatus; color: string; icon: string }[] = [
  { label: "Pending", value: "pending", color: "warning", icon: "schedule" },
  { label: "In Progress", value: "in-progress", color: "primary", icon: "play_arrow" },
  { label: "Contacted", value: "contacted", color: "info", icon: "mail" },
  { label: "Positive Response", value: "positive-response", color: "positive", icon: "thumb_up" },
  { label: "Negative Response", value: "negative-response", color: "negative", icon: "thumb_down" },
  {
    label: "Follow-up 30 Days",
    value: "follow-up-30-days",
    color: "deep-orange",
    icon: "event_repeat",
  },
  { label: "Completed", value: "completed", color: "positive", icon: "check_circle" },
  { label: "Cancelled", value: "cancelled", color: "grey", icon: "cancel" },
];

const defaultStatusObj = statusOptions[0]!;
const currentStatusObj = computed(() => {
  return statusOptions.find((s) => s.value === task.value.status) ?? defaultStatusObj;
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
    q.notify({
      type: "positive",
      message: `Status updated to "${newStatus}"`,
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

  try {
    const res = await fetch("https://europe-west1-opsflow-88of.cloudfunctions.net/chatWithAgent", {
      method: "POST",
      signal: AbortSignal.timeout(55000), // Step 12: 55s — 5s headroom below CF 60s timeout
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userText,
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
      }),
    });

    const data = await res.json().catch(() => null);

    if (data && data.reply) {
      const finalReply = data.reply;
      const finalAgentName = data.agentName || "Agente AI Assistant";
      const finalTools: string[] = data.toolsUsed || [];

      logger.success("CloudFunction", "Risposta ricevuta dalla Cloud Function", {
        status: res.status,
        reply: finalReply,
      });
      chatStore.appendMessage(taskId, {
        id: `agt-${Date.now()}`,
        taskId: taskId,
        sender: "agent",
        agentName: finalAgentName,
        text: finalReply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        toolsUsed: finalTools,
      });
      // Extract key points from agent reply for the TaskKeyPointsCard panel
      parseKeyPointsFromReply(taskId, finalReply);
      fetchedOk = true;
      scrollToBottom();
    }
  } catch (err) {
    logger.warn("CloudFunction", "Cloud Function non raggiungibile", err);
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

  isSending.value = false;
  chatStore.setAgentTyping(taskId, false);
  scrollToBottom();
}; /*end handleSendChatMessage*/

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
      zIndex: windowState.zIndex,
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
          class="q-px-xs"
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

        <!-- Send To Back Button -->
        <q-btn flat round dense size="sm" icon="flip_to_back" color="white" @click="sendToBack">
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
          @click="toggleFullscreen"
        >
          <q-tooltip>{{
            isFullscreen ? "Ripristina dimensione" : "Schermo intero (Fullscreen)"
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
      <q-splitter
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
            class="column justify-between q-pa-sm overflow-hidden full-height"
            style="min-width: 0"
          >
            <div class="scroll col q-pr-xs">
              <div class="text-caption text-weight-bold text-primary q-mb-xs">
                📌 Descrizione Task
              </div>
              <div
                class="text-caption text-grey-9 q-mb-sm bg-grey-2 q-pa-sm rounded-borders"
                style="
                  word-break: break-word;
                  overflow-wrap: anywhere;
                  white-space: pre-wrap;
                  line-height: 1.45;
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
                default-opened
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
                        style="word-break: break-word; overflow-wrap: anywhere"
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
                          word-break: break-word;
                          overflow-wrap: anywhere;
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
                default-opened
              >
                <div class="q-px-xs q-pb-xs">
                  <TaskKeyPointsCard :task-id="task.id" :task="task" />
                </div>
              </q-expansion-item>

              <!-- Direct AI Execution & Shortcuts -->
              <div class="q-mb-sm">
                <q-btn
                  color="primary"
                  icon="auto_awesome"
                  label="🚀 Avvia Esecuzione IA"
                  no-caps
                  dense
                  class="full-width q-mb-xs text-weight-bold"
                  :loading="isSending"
                  @click="handleExecuteTaskAI"
                />
                <div class="row q-col-gutter-xs full-width">
                  <div class="col-12 col-sm-4">
                    <q-btn
                      outline
                      dense
                      size="sm"
                      color="secondary"
                      icon="search"
                      label="Search Leads"
                      no-caps
                      class="full-width q-py-xs text-weight-bold"
                      :disabled="isSending"
                      @click="
                        handleSendCustomPrompt('Find relevant leads and prospects for this task.')
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
                      label="Draft Email"
                      no-caps
                      class="full-width q-py-xs text-weight-bold"
                      :disabled="isSending"
                      @click="
                        handleSendCustomPrompt(
                          'Generate an email intro draft for the found prospects.',
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
                      label="Sheets"
                      no-caps
                      class="full-width q-py-xs text-weight-bold"
                      :disabled="isSending"
                      @click="
                        handleSendCustomPrompt(
                          'Save and organize extracted data into the default Google Sheets.',
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

        <!-- After Slot: Interactive Chat Thread -->
        <template #after>
          <div
            v-show="splitterModel < 100"
            class="column no-wrap overflow-hidden q-pa-sm full-height"
            style="min-width: 0"
          >
            <div ref="chatScrollRef" class="col scroll q-mb-xs q-px-xs" style="overflow-y: auto">
              <div v-for="msg in activeSession.messages" :key="msg.id" class="q-mb-xs">
                <q-chat-message
                  :name="msg.sender === 'user' ? 'You' : msg.agentName || 'AI Agent'"
                  :stamp="msg.timestamp"
                  :sent="msg.sender === 'user'"
                  :bg-color="msg.sender === 'user' ? 'primary' : 'grey-3'"
                  :text-color="msg.sender === 'user' ? 'white' : 'dark'"
                >
                  <div
                    style="white-space: pre-wrap; font-size: 0.85rem"
                    v-html="renderFormattedMessage(msg.text)"
                  ></div>

                  <!-- TTS Audio Read Aloud button for agent messages -->
                  <div v-if="msg.sender === 'agent'" class="row items-center justify-end q-mt-xs">
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
                        isSpeaking ? "Stop audio" : "Listen to voice response"
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
                v-model="chatMessage"
                outlined
                dense
                placeholder="Type instruction or dictate..."
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
                    <q-tooltip>Attach PDF / text document for Document Understanding</q-tooltip>
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
                      isListening ? "Stop dictation" : "Native voice dictation (€0)"
                    }}</q-tooltip>
                  </q-btn>
                </template>

                <template #after>
                  <q-btn
                    round
                    dense
                    flat
                    icon="send"
                    color="primary"
                    :disabled="(!chatMessage.trim() && !selectedFile) || isSending"
                    @click="handleSendChatMessage"
                  />
                </template>
              </q-input>
            </div>
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
}
</style>
