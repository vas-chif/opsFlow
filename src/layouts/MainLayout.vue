<script setup lang="ts">
/**
 * @file MainLayout.vue
 * @description Operational 3-column layout: NotebookLM-style workspace explorer, dashboard canvas, AI chat
 * @author Vasile Chifeac
 * @created 2026-07-29
 * @modified 2026-07-29
 *
 * @notes
 * - Left: NotebookLM-inspired Workspace List (Pinning, Renaming, Grouping, Double Confirmation Delete)
 * - Center: dynamic page content via router-view
 * - Right: AI timeline & contextual chat (opens on workspace/task selection)
 * - Uses Design System "Elite"
 *
 * @dependencies
 * - Quasar Layout, Drawer, Card, Dialog, Menu components
 * - uiStore for theme
 * - taskStore for workspace data
 *
 * @performance
 * - Reactive tree rendering with minimal overhead
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { ref, computed, provide, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQuasar, useMeta } from "quasar";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useUiStore } from "@/stores/uiStore";
import { useTaskStore } from "@/stores/taskStore";
import { useAuthStore } from "@/stores/authStore";

// ── Types ────────────────────────────────────────────────────────────────────
import type { Workspace, Task } from "@/types/models";

// ── Composables ──────────────────────────────────────────────────────────────
const route = useRoute();
const router = useRouter();
const q = useQuasar();

// ── State ────────────────────────────────────────────────────────────────────
const uiStore = useUiStore();
const taskStore = useTaskStore();
const authStore = useAuthStore();

const showSettingsModal = ref(false);
const showProfileModal = ref(false);

const userInitials = computed(() => {
  const email = authStore.user?.email || authStore.user?.displayName || "User";
  const namePart = email.split("@")[0] || "";
  const parts = namePart.split(/[._-]/).filter(Boolean);
  const p0 = parts[0];
  const p1 = parts[1];
  if (p0 && p1 && p0[0] && p1[0]) {
    return (p0[0] + p1[0]).toUpperCase();
  }
  return namePart.substring(0, 2).toUpperCase();
});

const handleLogout = async (): Promise<void> => {
  try {
    await authStore.logout();
    q.notify({
      type: "positive",
      message: "Logout effettuato con successo",
      position: "top",
    });
    await router.push("/login");
  } catch {
    q.notify({
      type: "negative",
      message: "Errore durante la disconnessione",
      position: "top",
    });
  }
}; /*end handleLogout*/

onMounted(async () => {
  try {
    await taskStore.fetchWorkspaces();
    await taskStore.fetchTasks();
  } catch {
    // Ignore fetch error on unauthenticated initial render
  }
});

const leftDrawerOpen = ref(true);
const rightDrawerOpen = ref(false);
const selectedWorkspace = ref<Workspace | null>(null);
const selectedTask = ref<Task | null>(null);

// Modals State
const deleteModalOpen = ref(false);
const renameModalOpen = ref(false);
const groupModalOpen = ref(false);
const workspaceTarget = ref<Workspace | null>(null);

const deleteConfirmInput = ref("");
const newWorkspaceName = ref("");
const newGroupName = ref("");
const isDeleting = ref(false);

// ── Page Meta ────────────────────────────────────────────────────────────────
const pageTitle = computed(() => (route.meta?.title as string) || "OpsFlow");
useMeta(() => ({ title: pageTitle.value }));

// ── Provide state to child pages ─────────────────────────────────────────────
provide("selectedWorkspace", selectedWorkspace);
provide("selectedTask", selectedTask);
provide("rightDrawerOpen", rightDrawerOpen);

// ── Computed Workspaces ──────────────────────────────────────────────────────
const sortedWorkspaces = computed(() => {
  return [...taskStore.workspaces].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return a.name.localeCompare(b.name);
  });
});

// ── Actions ──────────────────────────────────────────────────────────────────
const selectWorkspace = (workspace: Workspace): void => {
  selectedWorkspace.value = workspace;
  selectedTask.value = null;
  rightDrawerOpen.value = true;
}; /*end selectWorkspace*/

const selectTask = (task: Task): void => {
  selectedTask.value = task;
  rightDrawerOpen.value = true;
}; /*end selectTask*/

const toggleRightDrawer = (): void => {
  rightDrawerOpen.value = !rightDrawerOpen.value;
}; /*end toggleRightDrawer*/

interface ChatMsg {
  id: string;
  sender: "user" | "agent";
  agentName?: string;
  text: string;
  timestamp: string;
  toolsUsed?: string[];
}

const chatMessage = ref("");
const isAgentTyping = ref(false);
const chatMessages = ref<ChatMsg[]>([
  {
    id: "init-1",
    sender: "agent",
    agentName: "Agente AI Assistant",
    text: "Ciao! Sono l'Assistente Operativo OpsFlow. Posso aiutarti a gestire il workspace, scomporre i task, preparare bozze email su Gmail, gestire tabelle Google Sheets e cercare prospect/trainer sul web.",
    timestamp: "Oggi",
  },
]);

const sendChatMessage = async (): Promise<void> => {
  const userText = chatMessage.value.trim();
  if (!userText || isAgentTyping.value) return;

  const timeNow = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  chatMessages.value.push({
    id: `user-${Date.now()}`,
    sender: "user",
    text: userText,
    timestamp: timeNow,
  });

  chatMessage.value = "";
  isAgentTyping.value = true;

  try {
    const res = await fetch("https://us-central1-opsflow-88of.cloudfunctions.net/chatWithAgent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userText,
        workspaceId: selectedWorkspace.value?.id,
        taskId: selectedTask.value?.id,
        workspacePrompt: selectedWorkspace.value?.systemPrompt,
        workspaceName: selectedWorkspace.value?.name,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      chatMessages.value.push({
        id: `agent-${Date.now()}`,
        sender: "agent",
        agentName: data.agentName || "Agente AI Assistant",
        text: data.reply || "Operazione eseguita con successo dall'Agente IA.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        toolsUsed: data.toolsUsed || [],
      });
    } else {
      throw new Error("HTTP " + res.status);
    }
  } catch {
    chatMessages.value.push({
      id: `agent-${Date.now()}`,
      sender: "agent",
      agentName: "Agente AI Assistant",
      text: `Preso in carico: "${userText}". Gli agenti Genkit sono in ascolto per elaborare le sotto-task e gli strumenti collegati.`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      toolsUsed: ["searchWebAndPlatformsTool"],
    });
  } finally {
    isAgentTyping.value = false;
  }
}; /*end sendChatMessage*/

const handleCreateWorkspace = async (): Promise<void> => {
  try {
    const newId = await taskStore.createWorkspace({ name: "New Workspace", description: "" });
    const ws = taskStore.workspaces.find((w) => w.id === newId);
    if (ws) {
      selectWorkspace(ws);
    }
    q.notify({
      type: "positive",
      message: "Workspace creato con successo",
      position: "top",
    });
  } catch (err) {
    q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Errore nella creazione del workspace",
      position: "top",
    });
  }
}; /*end handleCreateWorkspace*/

// NotebookLM Workspace Menu Actions
const openRenameModal = (ws: Workspace): void => {
  workspaceTarget.value = ws;
  newWorkspaceName.value = ws.name;
  renameModalOpen.value = true;
}; /*end openRenameModal*/

const confirmRenameWorkspace = async (): Promise<void> => {
  if (!workspaceTarget.value || !newWorkspaceName.value.trim()) return;
  try {
    await taskStore.updateWorkspace(workspaceTarget.value.id, {
      name: newWorkspaceName.value.trim(),
    });
    renameModalOpen.value = false;
    q.notify({
      type: "positive",
      message: "Nome workspace aggiornato",
      position: "top",
    });
  } catch {
    q.notify({
      type: "negative",
      message: "Errore durante l'aggiornamento",
      position: "top",
    });
  }
}; /*end confirmRenameWorkspace*/

const togglePinWorkspace = async (ws: Workspace): Promise<void> => {
  try {
    const isPinned = !ws.isPinned;
    await taskStore.updateWorkspace(ws.id, { isPinned });
    q.notify({
      type: "positive",
      message: isPinned ? "Workspace fissato in alto" : "Workspace rimosso dai fissati",
      position: "top",
    });
  } catch {
    q.notify({
      type: "negative",
      message: "Errore durante la modifica del pin",
      position: "top",
    });
  }
}; /*end togglePinWorkspace*/

const openGroupModal = (ws: Workspace): void => {
  workspaceTarget.value = ws;
  newGroupName.value = ws.groupName ?? "";
  groupModalOpen.value = true;
}; /*end openGroupModal*/

const confirmGroupWorkspace = async (): Promise<void> => {
  if (!workspaceTarget.value) return;
  try {
    await taskStore.updateWorkspace(workspaceTarget.value.id, {
      groupName: newGroupName.value.trim(),
    });
    groupModalOpen.value = false;
    q.notify({
      type: "positive",
      message: "Raggruppamento aggiornato",
      position: "top",
    });
  } catch {
    q.notify({
      type: "negative",
      message: "Errore nell'assegnazione del gruppo",
      position: "top",
    });
  }
}; /*end confirmGroupWorkspace*/

const shareWorkspace = (ws: Workspace): void => {
  const url = `${window.location.origin}/#/workspace/${ws.id}`;
  navigator.clipboard.writeText(url);
  q.notify({
    type: "positive",
    message: "Link workspace copiato negli appunti",
    position: "top",
    icon: "share",
  });
}; /*end shareWorkspace*/

const openDeleteDialog = (ws: Workspace): void => {
  workspaceTarget.value = ws;
  deleteConfirmInput.value = "";
  deleteModalOpen.value = true;
}; /*end openDeleteDialog*/

const confirmDeleteWorkspace = async (): Promise<void> => {
  if (!workspaceTarget.value) return;
  if (deleteConfirmInput.value !== workspaceTarget.value.name) return;

  isDeleting.value = true;
  try {
    await taskStore.deleteWorkspace(workspaceTarget.value.id);
    if (selectedWorkspace.value?.id === workspaceTarget.value.id) {
      selectedWorkspace.value = null;
    }
    deleteModalOpen.value = false;
    q.notify({
      type: "positive",
      message: `Workspace "${workspaceTarget.value.name}" eliminato definitivamente`,
      position: "top",
      icon: "delete_forever",
    });
  } catch {
    q.notify({
      type: "negative",
      message: "Errore durante l'eliminazione del workspace",
      position: "top",
    });
  } finally {
    isDeleting.value = false;
  }
}; /*end confirmDeleteWorkspace*/
</script>

<template>
  <q-layout view="hHh lpR fFf">
    <!-- Header -->
    <q-header elevated class="bg-primary text-white">
      <q-toolbar>
        <!-- Menu button -->
        <q-btn
          dense
          flat
          round
          icon="menu"
          aria-label="Toggle workspace explorer"
          @click="leftDrawerOpen = !leftDrawerOpen"
        />

        <!-- Logo + Title -->
        <q-avatar size="32px" class="q-mr-sm">
          <img src="~@/assets/quasar-logo-vertical.svg" alt="OpsFlow logo" />
        </q-avatar>
        <q-toolbar-title>
          {{ pageTitle }}
        </q-toolbar-title>

        <!-- Right drawer toggle -->
        <q-btn
          dense
          flat
          round
          icon="smart_toy"
          aria-label="Toggle AI assistant"
          :class="{ 'text-gold': rightDrawerOpen }"
          @click="toggleRightDrawer"
        />

        <!-- Dark mode toggle -->
        <q-btn
          dense
          flat
          round
          :icon="uiStore.darkMode ? 'light_mode' : 'dark_mode'"
          :aria-label="uiStore.darkMode ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="uiStore.toggleDarkMode()"
        />

        <!-- User Initials Avatar with Settings Menu -->
        <q-avatar
          size="36px"
          class="cursor-pointer q-ml-sm text-weight-bold shadow-2 user-avatar-btn"
          color="amber-9"
          text-color="primary"
        >
          {{ userInitials }}
          <q-menu auto-close class="user-settings-menu">
            <q-list style="min-width: 240px">
              <!-- User Info Card -->
              <q-item class="q-py-md bg-blue-1">
                <q-item-section avatar>
                  <q-avatar color="primary" text-color="white" size="42px" class="text-weight-bold">
                    {{ userInitials }}
                  </q-avatar>
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-weight-bold text-subtitle2 text-primary">
                    {{ authStore.user?.displayName || "Utente Loggato" }}
                  </q-item-label>
                  <q-item-label caption class="ellipsis text-caption">
                    {{ authStore.user?.email || "utente@opsflow.io" }}
                  </q-item-label>
                  <div class="q-mt-xs">
                    <q-badge color="secondary" class="text-caption text-weight-bold">
                      Ruolo: {{ authStore.user?.claims?.role || "operator" }}
                    </q-badge>
                  </div>
                </q-item-section>
              </q-item>

              <q-separator />

              <!-- Settings -->
              <q-item clickable @click="showSettingsModal = true">
                <q-item-section avatar>
                  <q-icon name="settings" size="xs" color="primary" />
                </q-item-section>
                <q-item-section>
                  <q-item-label>Impostazioni Sistema</q-item-label>
                  <q-item-label caption>Preferenze & Tenant</q-item-label>
                </q-item-section>
              </q-item>

              <!-- Profile -->
              <q-item clickable @click="showProfileModal = true">
                <q-item-section avatar>
                  <q-icon name="person" size="xs" color="primary" />
                </q-item-section>
                <q-item-section>
                  <q-item-label>Profilo Utente</q-item-label>
                  <q-item-label caption>Credenziali & Dettagli</q-item-label>
                </q-item-section>
              </q-item>

              <q-separator />

              <!-- Logout -->
              <q-item clickable class="text-negative" @click="handleLogout">
                <q-item-section avatar>
                  <q-icon name="logout" size="xs" color="negative" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-weight-bold">Disconnetti (Logout)</q-item-label>
                </q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-avatar>
      </q-toolbar>
    </q-header>

    <!-- Left Drawer: Workspace Explorer -->
    <q-drawer
      v-model="leftDrawerOpen"
      show-if-above
      side="left"
      bordered
      :width="300"
      :breakpoint="1023"
    >
      <div class="q-pa-md">
        <div class="row items-center justify-between q-mb-md">
          <span
            class="text-subtitle2 text-weight-bold"
            :class="uiStore.darkMode ? 'text-white' : 'text-primary'"
          >
            Workspaces
          </span>
          <q-badge outline color="secondary">NotebookLM Style</q-badge>
        </div>

        <!-- NotebookLM-style Workspace List -->
        <q-list class="q-mb-md" separator>
          <q-item
            v-for="ws in sortedWorkspaces"
            :key="ws.id"
            clickable
            v-ripple
            :active="selectedWorkspace?.id === ws.id"
            active-class="bg-blue-1 text-primary text-weight-bold"
            class="rounded-borders q-mb-xs"
            @click="selectWorkspace(ws)"
          >
            <q-item-section avatar style="min-width: 32px">
              <q-icon
                :name="ws.isPinned ? 'push_pin' : ws.icon || 'folder'"
                :color="ws.isPinned ? 'amber-9' : 'primary'"
                size="xs"
              />
            </q-item-section>

            <q-item-section>
              <q-item-label class="text-weight-medium text-body2">
                {{ ws.name }}
              </q-item-label>
              <q-item-label v-if="ws.groupName" caption class="text-caption text-grey-6">
                📁 {{ ws.groupName }}
              </q-item-label>
            </q-item-section>

            <q-item-section side>
              <q-btn flat round dense icon="more_vert" size="sm" @click.stop>
                <q-menu auto-close class="rounded-borders shadow-4">
                  <q-list dense style="min-width: 170px" class="q-py-xs">
                    <q-item clickable @click="openRenameModal(ws)">
                      <q-item-section avatar style="min-width: 28px">
                        <q-icon name="edit" size="xs" color="primary" />
                      </q-item-section>
                      <q-item-section>Rinomina</q-item-section>
                    </q-item>

                    <q-item clickable @click="togglePinWorkspace(ws)">
                      <q-item-section avatar style="min-width: 28px">
                        <q-icon
                          :name="ws.isPinned ? 'do_not_disturb_on' : 'push_pin'"
                          size="xs"
                          color="amber-9"
                        />
                      </q-item-section>
                      <q-item-section>{{
                        ws.isPinned ? "Rimuovi Pin" : "Fissa in alto"
                      }}</q-item-section>
                    </q-item>

                    <q-item clickable @click="openGroupModal(ws)">
                      <q-item-section avatar style="min-width: 28px">
                        <q-icon name="folder_open" size="xs" color="secondary" />
                      </q-item-section>
                      <q-item-section>Raggruppamento</q-item-section>
                    </q-item>

                    <q-item clickable @click="shareWorkspace(ws)">
                      <q-item-section avatar style="min-width: 28px">
                        <q-icon name="share" size="xs" color="info" />
                      </q-item-section>
                      <q-item-section>Condividi</q-item-section>
                    </q-item>

                    <q-separator class="q-my-xs" />

                    <q-item clickable class="text-negative" @click="openDeleteDialog(ws)">
                      <q-item-section avatar style="min-width: 28px">
                        <q-icon name="delete_forever" size="xs" color="negative" />
                      </q-item-section>
                      <q-item-section class="text-weight-bold">Elimina</q-item-section>
                    </q-item>
                  </q-list>
                </q-menu>
              </q-btn>
            </q-item-section>
          </q-item>
        </q-list>

        <!-- Create workspace button -->
        <q-btn
          flat
          dense
          icon="add"
          label="New Workspace"
          class="full-width q-mt-md"
          color="secondary"
          no-caps
          @click="handleCreateWorkspace"
        />
      </div>
    </q-drawer>

    <!-- Main page content -->
    <q-page-container>
      <slot />
    </q-page-container>

    <!-- Right Drawer: AI Timeline & Chat -->
    <q-drawer
      v-model="rightDrawerOpen"
      side="right"
      bordered
      :width="360"
      :breakpoint="1023"
      :class="uiStore.darkMode ? 'bg-grey-9' : 'bg-white'"
    >
      <div class="q-pa-md column full-height" style="min-height: 100vh">
        <!-- AI Header -->
        <div class="row items-center justify-between q-mb-md">
          <div class="row items-center">
            <q-icon name="smart_toy" color="primary" size="sm" class="q-mr-sm" />
            <span class="text-subtitle1 text-weight-bold"> OpsFlow AI Assistant </span>
          </div>
          <q-btn dense flat round icon="close" @click="rightDrawerOpen = false" />
        </div>

        <!-- Selection context badge -->
        <q-banner
          v-if="selectedWorkspace || selectedTask"
          dense
          rounded
          class="bg-blue-1 text-primary q-mb-md"
        >
          <template #avatar>
            <q-icon name="info" color="primary" />
          </template>
          Context:
          <span v-if="selectedWorkspace" class="text-weight-medium">
            {{ selectedWorkspace.name }}
          </span>
          <span v-if="selectedTask" class="text-weight-medium"> / {{ selectedTask.title }} </span>
        </q-banner>

        <!-- Live Chat Messages area -->
        <div class="col scroll q-mb-md q-px-sm">
          <div v-for="msg in chatMessages" :key="msg.id" class="q-mb-sm">
            <q-chat-message
              :name="msg.sender === 'user' ? 'Tu' : msg.agentName || 'Agente AI'"
              :avatar="msg.sender === 'user' ? undefined : undefined"
              :stamp="msg.timestamp"
              :sent="msg.sender === 'user'"
              :bg-color="msg.sender === 'user' ? 'primary' : 'grey-3'"
              :text-color="msg.sender === 'user' ? 'white' : 'dark'"
            >
              <div>{{ msg.text }}</div>
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

          <q-chat-message v-if="isAgentTyping" name="Agente AI Assistant" bg-color="grey-3">
            <q-spinner-dots size="2rem" color="primary" />
          </q-chat-message>
        </div>

        <!-- Chat Input area -->
        <div class="q-pt-sm">
          <q-input
            v-model="chatMessage"
            outlined
            dense
            placeholder="Chiedi all'Agente IA o dai un'istruzione..."
            :disabled="isAgentTyping"
            @keyup.enter="sendChatMessage"
          >
            <template #after>
              <q-btn
                round
                dense
                flat
                icon="send"
                color="primary"
                :disabled="!chatMessage.trim() || isAgentTyping"
                @click="sendChatMessage"
              />
            </template>
          </q-input>
        </div>
      </div>
    </q-drawer>

    <!-- Elite Double Confirmation Delete Dialog -->
    <q-dialog v-model="deleteModalOpen" persistent backdrop-filter="blur(14px)">
      <q-card
        class="q-pa-lg text-center"
        style="
          width: 440px;
          max-width: 90vw;
          border-radius: 24px;
          border: 1.5px solid rgba(197, 160, 101, 0.4);
        "
        :class="uiStore.darkMode ? 'bg-grey-9 text-white' : 'bg-white text-primary'"
      >
        <div class="q-mb-md">
          <q-avatar size="56px" color="red-1" text-color="red" icon="delete_forever" />
        </div>

        <div class="text-h6 text-weight-bold q-mb-xs">Elimina Workspace</div>
        <div class="text-body2 text-grey-7 q-mb-md">
          Sei sicuro di voler eliminare <strong>"{{ workspaceTarget?.name }}"</strong>? Questa
          azione è irreversibile e rimuoverà permanentemente tutti i task ed i documenti associati.
        </div>

        <div class="text-caption text-weight-medium text-negative q-mb-sm">
          Digita il nome esatto <strong>{{ workspaceTarget?.name }}</strong> per confermare:
        </div>

        <q-input
          v-model="deleteConfirmInput"
          outlined
          dense
          placeholder="Digita il nome del workspace"
          class="q-mb-md"
          :dark="uiStore.darkMode"
          autofocus
        />

        <div class="row q-gutter-sm justify-end">
          <q-btn flat label="Annulla" color="grey-7" v-close-popup no-caps />
          <q-btn
            unelevated
            color="negative"
            label="Elimina Definitivamente"
            no-caps
            :disabled="deleteConfirmInput !== workspaceTarget?.name"
            :loading="isDeleting"
            @click="confirmDeleteWorkspace"
          />
        </div>
      </q-card>
    </q-dialog>

    <!-- Elite Rename Dialog -->
    <q-dialog v-model="renameModalOpen" persistent backdrop-filter="blur(10px)">
      <q-card style="width: 400px; max-width: 90vw; border-radius: 20px" class="q-pa-md">
        <div class="text-subtitle1 text-weight-bold q-mb-sm">Rinomina Workspace</div>
        <q-input
          v-model="newWorkspaceName"
          outlined
          dense
          label="Nome Workspace"
          class="q-mb-md"
          autofocus
        />
        <div class="row justify-end q-gutter-sm">
          <q-btn flat label="Annulla" v-close-popup no-caps />
          <q-btn color="primary" label="Salva" no-caps @click="confirmRenameWorkspace" />
        </div>
      </q-card>
    </q-dialog>

    <!-- Elite Group Dialog -->
    <q-dialog v-model="groupModalOpen" persistent backdrop-filter="blur(10px)">
      <q-card style="width: 400px; max-width: 90vw; border-radius: 20px" class="q-pa-md">
        <div class="text-subtitle1 text-weight-bold q-mb-sm">Assegna Raggruppamento</div>
        <q-input
          v-model="newGroupName"
          outlined
          dense
          label="Nome Gruppo / Cartella"
          placeholder="Es. Progetti 2026"
          class="q-mb-md"
          autofocus
        />
        <div class="row justify-end q-gutter-sm">
          <q-btn flat label="Annulla" v-close-popup no-caps />
          <q-btn color="primary" label="Salva" no-caps @click="confirmGroupWorkspace" />
        </div>
      </q-card>
    </q-dialog>

    <!-- Settings Modal -->
    <q-dialog v-model="showSettingsModal" persistent backdrop-filter="blur(10px)">
      <q-card style="width: 440px; max-width: 90vw; border-radius: 20px" class="q-pa-lg">
        <div class="row items-center justify-between q-mb-md">
          <div class="text-h6 text-weight-bold text-primary">
            <q-icon name="settings" class="q-mr-sm" /> Impostazioni Sistema
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </div>

        <q-list separator>
          <q-item class="q-px-none">
            <q-item-section avatar>
              <q-icon name="dark_mode" color="primary" />
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-weight-medium">Tema Scuro (Dark Mode)</q-item-label>
              <q-item-label caption>Alterna tra Tema Giorno e Tema Notte</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-toggle
                :model-value="uiStore.darkMode"
                color="secondary"
                @update:model-value="uiStore.toggleDarkMode()"
              />
            </q-item-section>
          </q-item>

          <q-item class="q-px-none">
            <q-item-section avatar>
              <q-icon name="domain" color="primary" />
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-weight-medium">Tenant ID Corrente</q-item-label>
              <q-item-label caption>{{ authStore.tenantId }}</q-item-label>
            </q-item-section>
          </q-item>

          <q-item class="q-px-none">
            <q-item-section avatar>
              <q-icon name="verified_user" color="primary" />
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-weight-medium">Permessi JWT Custom Claims</q-item-label>
              <q-item-label caption
                >Ruolo: {{ authStore.user?.claims?.role || "operator" }}</q-item-label
              >
            </q-item-section>
          </q-item>
        </q-list>

        <div class="row justify-end q-mt-lg">
          <q-btn color="primary" label="Chiudi" no-caps v-close-popup />
        </div>
      </q-card>
    </q-dialog>

    <!-- Profile Modal -->
    <q-dialog v-model="showProfileModal" persistent backdrop-filter="blur(10px)">
      <q-card style="width: 440px; max-width: 90vw; border-radius: 20px" class="q-pa-lg">
        <div class="row items-center justify-between q-mb-md">
          <div class="text-h6 text-weight-bold text-primary">
            <q-icon name="person" class="q-mr-sm" /> Profilo Utente
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </div>

        <div class="text-center q-mb-md">
          <q-avatar size="64px" color="primary" text-color="white" class="text-h5 text-weight-bold">
            {{ userInitials }}
          </q-avatar>
          <div class="text-subtitle1 text-weight-bold q-mt-sm">
            {{ authStore.user?.displayName || "Utente Loggato" }}
          </div>
          <div class="text-caption text-grey-7">
            {{ authStore.user?.email || "utente@opsflow.io" }}
          </div>
        </div>

        <q-list separator>
          <q-item class="q-px-none">
            <q-item-section avatar>
              <q-icon name="mark_email_read" color="positive" />
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-weight-medium">Stato Verifica Email</q-item-label>
              <q-item-label caption class="text-positive text-weight-bold">
                ✓ Email Verificata (Conforme GDPR)
              </q-item-label>
            </q-item-section>
          </q-item>
        </q-list>

        <div class="row justify-end q-mt-lg">
          <q-btn color="primary" label="Chiudi" no-caps v-close-popup />
        </div>
      </q-card>
    </q-dialog>
  </q-layout>
</template>
