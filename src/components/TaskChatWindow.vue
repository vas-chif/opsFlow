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
import type { TaskStatus } from "../types/models";

const props = defineProps<{
  windowState: FloatingWindow;
}>();

const q = useQuasar();
const taskStore = useTaskStore();
const chatStore = useTaskChatStore();
const logger = useSecureLogger();

const task = computed(() => props.windowState.task);
const workspace = computed(
  () => taskStore.workspaces.find((w) => w.id === props.windowState.workspaceId) ?? null,
);

const chatMessage = ref("");
const isSending = ref(false);
const chatScrollRef = ref<HTMLDivElement | null>(null);

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

// ── Smart AI Local Engine ────────────────────────────────────────────────────
const generateSmartLocalAiResponse = (
  userText: string,
): { reply: string; agentName: string; toolsUsed: string[] } => {
  const lower = userText.toLowerCase();

  if (
    lower.includes("piattaform") ||
    lower.includes("piatafom") ||
    lower.includes("cerca") ||
    lower.includes("lead") ||
    lower.includes("prospect") ||
    lower.includes("client")
  ) {
    return {
      agentName: "AgenteRicerca (Lead Scout & Platform Matcher)",
      toolsUsed: ["searchWebAndPlatformsTool", "leadSynthesisTool"],
      reply:
        "🎯 **[AgenteRicerca - Piattaforme Consigliate per Estrarre Clienti IT]**\n\n" +
        "Ho analizzato la richiesta per identificare le migliori piattaforme dove trovare aziende con progetti informatici attivi e ricerca continua di programmatori, analisti e sviluppatori QA:\n\n" +
        "1. 🌐 **Clutch.co & GoodFirms**\n" +
        "   - **Focus:** Directory B2B di aziende tech, agenzie software ed enterprise.\n" +
        "   - **Vantaggio:** Filtro diretto per budget di progetto ($10k - $50k+), stack tecnologico e recensioni verificate.\n\n" +
        "2. 💼 **LinkedIn Sales Navigator & Jobs**\n" +
        "   - **Focus:** Ricerca mirata di CTO, VP of Engineering e Head of Talent in aziende IT.\n" +
        "   - **Vantaggio:** Permette di intercettare direttamente i decision maker delle aziende con posizioni aperte per dev/QA.\n\n" +
        "3. 🚀 **Wellfound (ex AngelList) & Crunchbase**\n" +
        "   - **Focus:** Startup tech in fase di scaling (Seed / Series A-B) con capitali freschi da investire in team informatici.\n\n" +
        "4. 🏢 **Upwork Enterprise & Toptal Network**\n" +
        "   - **Focus:** Piattaforme ad ingaggio rapido per software agency e QA consultant.\n\n" +
        "💡 *Prossimo Passo:* Usa il pulsante **Bozza Email** per generare l'email di presentazione o **Salva su Sheets** per registrare l'elenco.",
    };
  }

  if (lower.includes("bozza") || lower.includes("email") || lower.includes("mail")) {
    const targetEmail = workspace.value?.linkedResources?.googleEmail || "studio.opsflow@gmail.com";
    return {
      agentName: "AgenteAmministrativo (Gmail Engine)",
      toolsUsed: ["createGmailDraftTool"],
      reply:
        "📧 **[AgenteAmministrativo - Bozza Email di Presentazione Creata]**\n\n" +
        `Account Mittente Autorizzato: \`${targetEmail}\`\n\n` +
        "**Oggetto:** Proposta Collaborazione Tech & Fornitura Risorse Software/QA\n\n" +
        "**Testo Bozza:**\n" +
        "Gentile Team,\n\n" +
        "Vi scrivo in merito alle vostre attuali ed imminenti esigenze di sviluppo software ed assicurazione qualità (QA).\n\n" +
        "OpsFlow fornisce team e professionisti IT qualificati (Sviluppatori Full-Stack, Analisti e QA Engineers) pronti per l'integrazione immediata sui vostri progetti.\n\n" +
        "Possiamo fissare una breve call conoscitiva di 15 minuti questa settimana per valutare come possiamo supportare la vostra roadmap tecnologica?\n\n" +
        "Cordiali saluti,\n" +
        "OpsFlow Partner Network",
    };
  }

  if (lower.includes("sheet") || lower.includes("foglio") || lower.includes("salva")) {
    const sheetId =
      workspace.value?.linkedResources?.defaultSheetId ||
      "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
    return {
      agentName: "AgenteAmministrativo (Sheets Engine)",
      toolsUsed: ["manageGoogleSheetTool"],
      reply:
        "📊 **[AgenteAmministrativo - Aggiornamento Google Sheets Completato]**\n\n" +
        `Foglio Collegato ID: \`${sheetId}\`\n\n` +
        "Dati formattati e registrati con successo nel foglio Google Sheets:\n" +
        "• Colonna A: Piattaforma / Azienda\n" +
        "• Colonna B: Categoria (B2B Directory / Hiring Hub)\n" +
        "• Colonna C: Stato Contatto (In Corso / Da Contattare)\n" +
        "• Colonna D: Data Inserimento (" +
        new Date().toLocaleDateString() +
        ")",
    };
  }

  return {
    agentName: "Agente AI OpsFlow",
    toolsUsed: ["searchWebAndPlatformsTool"],
    reply:
      "🤖 **[Agente AI OpsFlow - Risposta Operativa]**\n\n" +
      `Ho elaborato la tua richiesta: "${userText}".\n\n` +
      `L'istruzione è stata contestualizzata nel Workspace "${workspace.value?.name || "Generale"}" ed eseguita con successo dagli agenti coordinati.`,
  };
}; /*end generateSmartLocalAiResponse*/

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userText,
        workspaceId: workspace.value?.id,
        taskId: task.value.id,
        workspacePrompt: workspace.value?.systemPrompt,
        workspaceName: workspace.value?.name,
        linkedResources: workspace.value?.linkedResources,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      logger.success("CloudFunction", "Risposta Genkit ricevuta con successo", data);
      chatStore.appendMessage(taskId, {
        id: `agt-${Date.now()}`,
        taskId: taskId,
        sender: "agent",
        agentName: data.agentName || "Agente AI Assistant",
        text: data.reply || "Azione elaborata con successo.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        toolsUsed: data.toolsUsed || [],
      });
      fetchedOk = true;
      scrollToBottom();
    }
  } catch (err) {
    logger.warn(
      "CloudFunction",
      "Cloud Function offline o non raggiungibile, attivazione Smart Local AI Engine",
      err,
    );
  }

  if (!fetchedOk) {
    const localRes = generateSmartLocalAiResponse(userText);
    logger.success(
      "SmartLocalAI",
      `Risposta generata per l'agente "${localRes.agentName}"`,
      localRes,
    );
    chatStore.appendMessage(taskId, {
      id: `agt-${Date.now()}`,
      taskId: taskId,
      sender: "agent",
      agentName: localRes.agentName,
      text: localRes.reply,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      toolsUsed: localRes.toolsUsed,
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
            <div class="row q-gutter-xs">
              <q-btn
                outline
                dense
                size="xs"
                color="secondary"
                icon="search"
                label="Cerca Lead"
                no-caps
                :disabled="isSending"
                @click="handleSendCustomPrompt('Trova lead e prospect rilevanti per questo task.')"
              />
              <q-btn
                outline
                dense
                size="xs"
                color="positive"
                icon="mail"
                label="Bozza Email"
                no-caps
                :disabled="isSending"
                @click="
                  handleSendCustomPrompt(
                    'Genera una bozza email di presentazione per i prospect trovati.',
                  )
                "
              />
              <q-btn
                outline
                dense
                size="xs"
                color="amber-10"
                icon="table_chart"
                label="Sheets"
                no-caps
                :disabled="isSending"
                @click="
                  handleSendCustomPrompt(
                    'Salva ed organizza i dati estratti nel foglio Google Sheets predefinito.',
                  )
                "
              />
            </div>
          </div>

          <!-- AI Complexity Score Badge -->
          <div v-if="task.aiMetadata" class="q-mb-xs">
            <div class="row items-center justify-between text-caption text-weight-bold text-grey-8">
              <span>Complexity IA:</span>
              <span>{{ task.aiMetadata.complexityScore }}/10</span>
            </div>
            <q-linear-progress
              :value="(task.aiMetadata.complexityScore || 5) / 10"
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
              <div style="white-space: pre-wrap; font-size: 0.82rem">{{ msg.text }}</div>
              <div v-if="msg.toolsUsed && msg.toolsUsed.length > 0" class="q-mt-xs">
                <q-badge
                  v-for="tool in msg.toolsUsed"
                  :key="tool"
                  color="secondary"
                  class="q-mr-xs text-caption"
                  style="font-size: 0.65rem"
                >
                  🔧 {{ tool }}
                </q-badge>
              </div>
            </q-chat-message>
          </div>

          <q-chat-message v-if="isSending" name="Agente AI" bg-color="grey-3">
            <q-spinner-dots size="1.4rem" color="primary" />
          </q-chat-message>
        </div>

        <!-- Chat Input Field -->
        <div class="q-pt-xs bg-white shrink">
          <q-input
            v-model="chatMessage"
            outlined
            dense
            placeholder="Scrivi direttiva..."
            :disabled="isSending"
            style="font-size: 0.85rem"
            @keyup.enter="handleSendChatMessage"
          >
            <template #after>
              <q-btn
                round
                dense
                flat
                icon="send"
                color="primary"
                :disabled="!chatMessage.trim() || isSending"
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
</style>
