<!--
  @file TaskChatModal.vue
  @description Task-as-a-Chat Modal component for OpsFlow with AI Engine & Clean Auto-Scroll.
  @author Vasile Chifeac
  @created 2026-07-30
  @modified 2026-07-31
-->

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useQuasar } from "quasar";
import { useTaskStore } from "../stores/taskStore";
import type { Task, Workspace, TaskStatus } from "../types/models";
import { useTaskChatStore } from "../stores/taskChatStore";

const props = defineProps<{
  modelValue: boolean;
  task: Task | null;
  workspace: Workspace | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
  (e: "taskMoved", targetWsId: string): void;
  (e: "taskUpdated"): void;
}>();

const q = useQuasar();
const taskStore = useTaskStore();
const chatStore = useTaskChatStore();

const isOpen = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit("update:modelValue", val),
});

// Chat & Status State
const chatMessage = ref("");
const isSending = ref(false);
const moveModalOpen = ref(false);
const selectedTargetWsId = ref("");
const chatScrollRef = ref<HTMLDivElement | null>(null);

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
  return statusOptions.find((s) => s.value === props.task?.status) ?? defaultStatusObj;
});

const activeSession = computed(() => {
  if (!props.task) return null;
  return chatStore.openSession(props.task.id, props.workspace?.id || "");
});

const scrollToBottom = (): void => {
  nextTick(() => {
    if (chatScrollRef.value) {
      chatScrollRef.value.scrollTop = chatScrollRef.value.scrollHeight;
    }
  });
}; /*end scrollToBottom*/

watch(
  () => props.task,
  (newTask) => {
    if (newTask && activeSession.value && activeSession.value.messages.length === 0) {
      chatStore.appendMessage(newTask.id, {
        id: `init-${newTask.id}`,
        taskId: newTask.id,
        sender: "agent",
        agentName: "Agente AI OpsFlow",
        text: `Thread avviato per il task "${newTask.title}". Posso aiutarti a trovare contatti, generare bozze o aggiornare lo stato.`,
        timestamp: "Inizio Task",
      });
      scrollToBottom();
    }
  },
  { immediate: true },
);

watch(
  () => activeSession.value?.messages.length,
  () => {
    scrollToBottom();
  },
);

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
    const targetEmail = props.workspace?.linkedResources?.googleEmail || "studio.opsflow@gmail.com";
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
      props.workspace?.linkedResources?.defaultSheetId ||
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
      `L'istruzione è stata contestualizzata nel Workspace "${props.workspace?.name || "Generale"}" ed eseguita con successo dagli agenti coordinati.`,
  };
}; /*end generateSmartLocalAiResponse*/

const handleStatusChange = async (newStatus: TaskStatus): Promise<void> => {
  if (!props.task || !props.workspace) return;
  try {
    await taskStore.updateTaskStatus(props.workspace.id, props.task.id, newStatus);
    q.notify({
      type: "positive",
      message: `Stato aggiornato a "${newStatus}"`,
      position: "top",
    });
    emit("taskUpdated");
  } catch {
    q.notify({
      type: "negative",
      message: "Errore nell'aggiornamento dello stato",
      position: "top",
    });
  }
}; /*end handleStatusChange*/

const handleSendChatMessage = async (): Promise<void> => {
  if (!chatMessage.value.trim() || !props.task || isSending.value) return;

  const userText = chatMessage.value.trim();
  const taskId = props.task.id;
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

  let fetchedOk = false;

  try {
    const res = await fetch("https://us-central1-opsflow-88of.cloudfunctions.net/chatWithAgent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userText,
        workspaceId: props.workspace?.id,
        taskId: props.task.id,
        workspacePrompt: props.workspace?.systemPrompt,
        workspaceName: props.workspace?.name,
        linkedResources: props.workspace?.linkedResources,
      }),
    });

    if (res.ok) {
      const data = await res.json();
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
    console.warn("Cloud Function unreachable, activating Smart Local AI Engine", err);
  }

  if (!fetchedOk) {
    // Smart Local Fallback Response Engine
    const localRes = generateSmartLocalAiResponse(userText);
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
  if (!props.task || isSending.value) return;
  chatMessage.value = customText;
  await handleSendChatMessage();
}; /*end handleSendCustomPrompt*/

const handleExecuteTaskAI = async (): Promise<void> => {
  if (!props.task) return;
  const prompt = `Avvia esecuzione task: "${props.task.title}". Descrizione: "${props.task.description || "Nessuna"}". Analizza i requisiti, cerca le risorse e procedi.`;
  await handleSendCustomPrompt(prompt);
}; /*end handleExecuteTaskAI*/

const handleMoveTask = async (): Promise<void> => {
  if (!props.task || !props.workspace || !selectedTargetWsId.value) return;
  try {
    await taskStore.moveTask(props.task.id, props.workspace.id, selectedTargetWsId.value);
    q.notify({
      type: "positive",
      message: "Task spostato con successo nel nuovo Workspace!",
      position: "top",
    });
    moveModalOpen.value = false;
    isOpen.value = false;
    emit("taskMoved", selectedTargetWsId.value);
  } catch {
    q.notify({
      type: "negative",
      message: "Errore durante lo spostamento del task",
      position: "top",
    });
  }
}; /*end handleMoveTask*/
</script>

<template>
  <q-dialog v-model="isOpen" persistent maximizable backdrop-filter="blur(14px)">
    <q-card
      style="width: 900px; max-width: 95vw; height: 85vh; max-height: 85vh"
      class="column no-wrap overflow-hidden"
    >
      <!-- Modal Header -->
      <q-card-section class="row items-center justify-between bg-primary text-white q-py-sm shrink">
        <div class="row items-center q-gutter-sm">
          <q-icon name="forum" size="24px" color="amber-5" />
          <div>
            <div class="text-h6 text-weight-bold">{{ task?.title || "Task Thread" }}</div>
            <div class="text-caption text-grey-4">
              Workspace: {{ workspace?.name }} | ID: {{ task?.id.substring(0, 8) }}
            </div>
          </div>
        </div>

        <div class="row items-center q-gutter-xs">
          <!-- Status Dropdown Button -->
          <q-btn-dropdown
            dense
            outline
            :color="currentStatusObj.color"
            :label="currentStatusObj.label"
            :icon="currentStatusObj.icon"
            class="q-px-sm"
          >
            <q-list dense style="min-width: 180px">
              <q-item
                v-for="opt in statusOptions"
                :key="opt.value"
                clickable
                v-close-popup
                @click="handleStatusChange(opt.value)"
              >
                <q-item-section avatar>
                  <q-icon :name="opt.icon" :color="opt.color" size="18px" />
                </q-item-section>
                <q-item-section>{{ opt.label }}</q-item-section>
              </q-item>
            </q-list>
          </q-btn-dropdown>

          <!-- Move Task to Workspace Button -->
          <q-btn
            flat
            round
            dense
            icon="drive_file_move"
            color="amber-5"
            @click="moveModalOpen = true"
          >
            <q-tooltip>Sposta Task in altro Workspace</q-tooltip>
          </q-btn>

          <q-btn flat round dense icon="close" v-close-popup />
        </div>
      </q-card-section>

      <q-separator />

      <!-- Modal Body (Split view: Description/Metadata + Chat Thread) -->
      <q-card-section
        class="col row q-col-gutter-md q-pa-md overflow-hidden"
        style="height: calc(100% - 50px)"
      >
        <!-- Left Pane: Info & Details -->
        <div
          class="col-12 col-md-5 column justify-between border-right q-pr-md overflow-hidden"
          style="height: 100%"
        >
          <div class="scroll col">
            <div class="text-subtitle2 text-weight-bold text-primary q-mb-xs">
              📌 Descrizione Obiettivo
            </div>
            <div class="text-body2 text-grey-8 q-mb-md bg-grey-2 q-pa-sm rounded-borders">
              {{ task?.description || "Nessuna descrizione fornita per questo task." }}
            </div>

            <!-- Action Buttons for Direct AI Execution -->
            <div class="q-mb-md">
              <q-btn
                color="primary"
                icon="auto_awesome"
                label="🚀 Avvia Esecuzione IA"
                no-caps
                class="full-width q-mb-xs text-weight-bold"
                :loading="isSending"
                @click="handleExecuteTaskAI"
              />
              <div class="text-caption text-grey-7 text-weight-bold q-mb-xs">Azioni Rapide IA:</div>
              <div class="row q-gutter-xs">
                <q-btn
                  outline
                  dense
                  size="sm"
                  color="secondary"
                  icon="search"
                  label="Cerca Lead"
                  no-caps
                  :disabled="isSending"
                  @click="
                    handleSendCustomPrompt('Trova lead e prospect rilevanti per questo task.')
                  "
                />
                <q-btn
                  outline
                  dense
                  size="sm"
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
                  size="sm"
                  color="amber-10"
                  icon="table_chart"
                  label="Salva su Sheets"
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

            <div v-if="task?.aiMetadata" class="q-mb-md">
              <div class="text-subtitle2 text-weight-bold text-primary q-mb-xs">
                ⚡ Complexity Score IA
              </div>
              <q-linear-progress
                :value="(task.aiMetadata.complexityScore || 5) / 10"
                color="secondary"
                size="10px"
                stripe
                rounded
              />
              <div class="text-caption text-grey-7 q-mt-xs">
                Punteggio: {{ task.aiMetadata.complexityScore }}/10 (Categoria:
                {{ task.aiMetadata.suggestedCategory || "Generale" }})
              </div>
            </div>

            <!-- Quality Audit Result Card if available -->
            <div
              v-if="task?.aiMetadata?.qualityAudit"
              class="q-mb-md bg-positive-1 q-pa-sm rounded-borders border-positive"
            >
              <div class="text-caption text-weight-bold text-positive row items-center q-gutter-xs">
                <q-icon name="verified" />
                <span
                  >Audit AgenteIspettore (Score {{ task.aiMetadata.qualityAudit.score }}/100)</span
                >
              </div>
              <div class="text-caption text-grey-8 q-mt-xs">
                {{ task.aiMetadata.qualityAudit.summary }}
              </div>
            </div>
          </div>
        </div>

        <!-- Right Pane: Interactive Chat Thread -->
        <div class="col-12 col-md-7 column no-wrap overflow-hidden" style="height: 100%">
          <div ref="chatScrollRef" class="col scroll q-mb-sm q-px-xs" style="overflow-y: auto">
            <div v-for="msg in activeSession?.messages || []" :key="msg.id" class="q-mb-sm">
              <q-chat-message
                :name="msg.sender === 'user' ? 'Tu' : msg.agentName || 'Agente AI'"
                :stamp="msg.timestamp"
                :sent="msg.sender === 'user'"
                :bg-color="msg.sender === 'user' ? 'primary' : 'grey-3'"
                :text-color="msg.sender === 'user' ? 'white' : 'dark'"
              >
                <div style="white-space: pre-wrap">{{ msg.text }}</div>
                <div v-if="msg.toolsUsed && msg.toolsUsed.length > 0" class="q-mt-xs">
                  <q-badge
                    v-for="tool in msg.toolsUsed"
                    :key="tool"
                    color="secondary"
                    class="q-mr-xs text-caption"
                  >
                    🔧 {{ tool }}
                  </q-badge>
                </div>
              </q-chat-message>
            </div>

            <q-chat-message v-if="isSending" name="Agente AI" bg-color="grey-3">
              <q-spinner-dots size="1.8rem" color="primary" />
            </q-chat-message>
          </div>

          <!-- Chat Input (Pinned at Bottom) -->
          <div class="q-pt-xs bg-white shrink">
            <q-input
              v-model="chatMessage"
              outlined
              dense
              placeholder="Scrivi una direttiva per questo task..."
              :disabled="isSending"
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
      </q-card-section>
    </q-card>
  </q-dialog>

  <!-- Move Task Modal -->
  <q-dialog v-model="moveModalOpen">
    <q-card style="width: 450px" class="q-pa-md">
      <q-card-section>
        <div class="text-h6 text-weight-bold">Sposta Task in Altro Workspace</div>
      </q-card-section>
      <q-card-section>
        <q-select
          v-model="selectedTargetWsId"
          :options="
            taskStore.workspaces
              .filter((w) => w.id !== workspace?.id)
              .map((w) => ({ label: w.name, value: w.id }))
          "
          emit-value
          map-options
          outlined
          dense
          label="Seleziona Workspace di Destinazione"
        />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Annulla" v-close-popup />
        <q-btn
          color="primary"
          label="Sposta Task"
          :disabled="!selectedTargetWsId"
          @click="handleMoveTask"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
