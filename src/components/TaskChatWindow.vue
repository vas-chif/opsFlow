<!--
  @file TaskChatWindow.vue
  @description Draggable & Resizable Multi-Window Task Chat component for OpsFlow.
  @author Vasile Chifeac
  @created 2026-07-31
-->

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useQuasar } from "quasar";
import { useTaskStore } from "../stores/taskStore";
import { useTaskChatStore, type FloatingWindow } from "../stores/taskChatStore";
import { useSecureLogger } from "../composables/useSecureLogger";
import { useWebSpeech } from "../composables/useWebSpeech";
import type { TaskStatus } from "../types/models";

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

const task = computed(() => props.windowState.task);
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

const activeSession = computed(() => {
  return chatStore.openSession(props.windowState.taskId, props.windowState.workspaceId);
});

const statusOptions: { label: string; value: TaskStatus; color: string; icon: string }[] = [
  { label: "In Attesa", value: "pending", color: "warning", icon: "schedule" },
  { label: "In Corso", value: "in-progress", color: "primary", icon: "play_arrow" },
  { label: "Contattato", value: "contacted", color: "info", icon: "mail" },
  { label: "Risposta Positiva", value: "positive-response", color: "positive", icon: "thumb_up" },
  { label: "Risposta Negativa", value: "negative-response", color: "negative", icon: "thumb_down" },
  {
    label: "Follow-up 30gg",
    value: "follow-up-30-days",
    color: "deep-orange",
    icon: "event_repeat",
  },
  { label: "Completato", value: "completed", color: "positive", icon: "check_circle" },
  { label: "Annullato", value: "cancelled", color: "grey", icon: "cancel" },
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
      message: `Stato aggiornato a "${newStatus}"`,
      position: "top",
    });
  } catch {
    q.notify({
      type: "negative",
      message: "Errore nell'aggiornamento dello stato",
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
    const res = await fetch("https://us-central1-opsflow-88of.cloudfunctions.net/chatWithAgent", {
      method: "POST",
      signal: AbortSignal.timeout(180000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userText,
        workspaceId: workspace.value?.id,
        taskId: task.value.id,
        workspacePrompt: workspace.value?.systemPrompt,
        workspaceName: workspace.value?.name,
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

const handleSendCustomPrompt = async (customText: string): Promise<void> => {
  if (isSending.value) return;
  chatMessage.value = customText;
  await handleSendChatMessage();
}; /*end handleSendCustomPrompt*/

const handleExecuteTaskAI = async (): Promise<void> => {
  if (!task.value) return;
  const prompt = `Avvia esecuzione task: "${task.value.title}". Descrizione: "${task.value.description || "Nessuna"}". Analizza i requisiti, cerca le risorse e procedi.`;
  await handleSendCustomPrompt(prompt);
}; /*end handleExecuteTaskAI*/
</script>

<template>
  <div
    class="floating-task-window card-elevation-dark rounded-borders column no-wrap overflow-hidden"
    :style="{
      position: 'fixed',
      left: `${windowState.position.x}px`,
      top: `${windowState.position.y}px`,
      width: `${windowState.size.width}px`,
      height: windowState.isMinimized ? '48px' : `${windowState.size.height}px`,
      zIndex: windowState.zIndex,
    }"
    @mousedown="chatStore.bringToFront(windowState.taskId)"
  >
    <!-- Draggable Header Bar -->
    <div
      class="window-header row items-center justify-between bg-navy text-white q-px-md q-py-xs unselectable"
      style="cursor: grab; height: 48px"
      @mousedown="handleHeaderMouseDown"
    >
      <div class="row items-center q-gutter-sm text-ellipsis col">
        <q-icon name="forum" color="amber-5" size="20px" />
        <div class="text-subtitle2 text-weight-bold text-ellipsis" style="max-width: 70%">
          {{ task.title }}
        </div>
        <q-badge color="amber-9" text-color="dark" size="xs">
          {{ workspace?.name }}
        </q-badge>
      </div>

      <div class="row items-center q-gutter-xs" @mousedown.stop>
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

        <!-- Minimize Button -->
        <q-btn
          flat
          round
          dense
          size="sm"
          :icon="windowState.isMinimized ? 'unfold_more' : 'minimize'"
          color="white"
          @click="chatStore.toggleMinimizeWindow(windowState.taskId)"
        />

        <!-- Close Button -->
        <q-btn
          flat
          round
          dense
          size="sm"
          icon="close"
          color="white"
          @click="chatStore.closeFloatingWindow(windowState.taskId)"
        />
      </div>
    </div>

    <!-- Window Body (Rendered when NOT minimized) -->
    <div
      v-if="!windowState.isMinimized"
      class="col row q-pa-sm overflow-hidden bg-white relative-position"
      style="height: calc(100% - 48px)"
    >
      <!-- Left Pane: Info & Actions -->
      <div
        class="col-12 col-md-5 column justify-between border-right q-pr-sm overflow-hidden"
        style="height: 100%"
      >
        <div class="scroll col">
          <div class="text-caption text-weight-bold text-primary q-mb-xs">📌 Descrizione Task</div>
          <div class="text-caption text-grey-9 q-mb-sm bg-grey-2 q-pa-xs rounded-borders">
            {{ task.description || "Nessuna descrizione." }}
          </div>

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
                  label="Cerca Lead"
                  no-caps
                  class="full-width q-py-xs text-weight-bold"
                  :disabled="isSending"
                  @click="
                    handleSendCustomPrompt('Trova lead e prospect rilevanti per questo task.')
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
                      'Genera una bozza email di presentazione per i prospect trovati.',
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
                      'Salva ed organizza i dati estratti nel foglio Google Sheets predefinito.',
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
            <div class="row items-center justify-between text-caption text-weight-bold text-grey-8">
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

      <!-- Right Pane: Interactive Chat Thread -->
      <div class="col-12 col-md-7 column no-wrap overflow-hidden q-pl-sm" style="height: 100%">
        <div ref="chatScrollRef" class="col scroll q-mb-xs q-px-xs" style="overflow-y: auto">
          <div v-for="msg in activeSession.messages" :key="msg.id" class="q-mb-xs">
            <q-chat-message
              :name="msg.sender === 'user' ? 'Tu' : msg.agentName || 'Agente AI'"
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
                    isSpeaking ? "Fermia audio" : "Ascolta risposta vocale"
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

          <q-chat-message v-if="isSending" name="Agente AI" bg-color="grey-3">
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
            placeholder="Scrivi direttiva o detta..."
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
                <q-tooltip>Allega documento PDF / testo per Document Understanding</q-tooltip>
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
                  isListening ? "Interrompi dettatura" : "Dettatura vocale nativa (€0)"
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

      <!-- Mouse Resize Handle Corner -->
      <div
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
</style>
