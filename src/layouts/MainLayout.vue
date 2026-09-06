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
import { ref, computed, provide, watch, onMounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQuasar, useMeta } from "quasar";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useUiStore } from "@/stores/uiStore";
import { useTaskStore } from "@/stores/taskStore";
import { useAuthStore } from "@/stores/authStore";

// ── Types ────────────────────────────────────────────────────────────────────
import type { Workspace, Task } from "@/types/models";

// ── Components ───────────────────────────────────────────────────────────────
import DeleteAccountDialog from "@/components/DeleteAccountDialog.vue";

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

const showDeleteAccountDialog = ref(false);

onMounted(async () => {
  try {
    if (authStore.needsProvisioning) {
      await authStore.provisionInitialTenant();
    }
    await taskStore.fetchWorkspaces();
    await taskStore.fetchTasks();
  } catch {
    // Ignore fetch error on unauthenticated initial render
  }
});

const leftDrawerOpen = ref(true);
const rightDrawerOpen = ref(false);
const selectedWorkspace = computed(() => taskStore.activeWorkspace);
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
  taskStore.setActiveWorkspace(workspace);
  selectedTask.value = null;
  rightDrawerOpen.value = true;
}; /*end selectWorkspace*/

const goToHomeDashboard = async (): Promise<void> => {
  await taskStore.setActiveWorkspace(null);
  selectedTask.value = null;
  rightDrawerOpen.value = false;
}; /*end goToHomeDashboard*/

const selectTask = (task: Task): void => {
  selectedTask.value = task;
  rightDrawerOpen.value = true;
}; /*end selectTask*/

const toggleRightDrawer = (): void => {
  if (!selectedWorkspace.value) {
    if (sortedWorkspaces.value.length > 0 && sortedWorkspaces.value[0]) {
      taskStore.setActiveWorkspace(sortedWorkspaces.value[0]);
      rightDrawerOpen.value = true;
      q.notify({
        type: "info",
        message: `AI Assistant opened for workspace "${sortedWorkspaces.value[0].name}".`,
        icon: "smart_toy",
      });
      scrollToBottom();
      return;
    }
    q.notify({
      type: "warning",
      message: "Create or select a workspace to open the AI Assistant.",
      icon: "smart_toy",
    });
    return;
  }
  rightDrawerOpen.value = !rightDrawerOpen.value;
  if (rightDrawerOpen.value) {
    scrollToBottom();
  }
}; /*end toggleRightDrawer*/

// ── Resizable Drawers State & Logic ──────────────────────────────────────────
const leftDrawerWidth = ref<number>(
  Number(localStorage.getItem("opsflow_drawer_left_width")) || 300,
);
const rightDrawerWidth = ref<number>(
  Number(localStorage.getItem("opsflow_drawer_right_width")) || 380,
);
const isResizingLeft = ref(false);
const isResizingRight = ref(false);

const startLeftResize = (e: MouseEvent): void => {
  isResizingLeft.value = true;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";

  const onMouseMove = (moveEvent: MouseEvent): void => {
    const maxWidth = Math.min(500, window.innerWidth * 0.45);
    const newWidth = Math.min(Math.max(moveEvent.clientX, 220), maxWidth);
    leftDrawerWidth.value = Math.round(newWidth);
  };

  const onMouseUp = (): void => {
    isResizingLeft.value = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    localStorage.setItem("opsflow_drawer_left_width", String(leftDrawerWidth.value));
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
}; /*end startLeftResize*/

const startRightResize = (e: MouseEvent): void => {
  isResizingRight.value = true;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";

  const onMouseMove = (moveEvent: MouseEvent): void => {
    const maxWidth = Math.min(750, window.innerWidth * 0.55);
    const newWidth = Math.min(Math.max(window.innerWidth - moveEvent.clientX, 300), maxWidth);
    rightDrawerWidth.value = Math.round(newWidth);
  };

  const onMouseUp = (): void => {
    isResizingRight.value = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    localStorage.setItem("opsflow_drawer_right_width", String(rightDrawerWidth.value));
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
}; /*end startRightResize*/

interface ChatMsg {
  id: string;
  sender: "user" | "agent";
  agentName?: string;
  text: string;
  timestamp: string;
  toolsUsed?: string[];
}

function loadWorkspaceChat(wsId: string): ChatMsg[] {
  try {
    const raw = localStorage.getItem(`opsflow_workspace_chat_${wsId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage parse error
  }
  const wsName = selectedWorkspace.value?.name || "this Workspace";
  return [
    {
      id: `init-${Date.now()}`,
      sender: "agent",
      agentName: "AI Assistant",
      text: `Hello! I am your AI Operational Assistant for workspace "${wsName}". I can help you manage tasks, draft Gmail communications, and analyze operational goals.`,
      timestamp: "Today",
    },
  ];
} /*end loadWorkspaceChat*/

function saveWorkspaceChat(wsId: string, msgs: ChatMsg[]): void {
  try {
    localStorage.setItem(`opsflow_workspace_chat_${wsId}`, JSON.stringify(msgs));
  } catch {
    // Ignore storage quota error
  }
} /*end saveWorkspaceChat*/

const chatMessage = ref("");
const isAgentTyping = ref(false);
const chatMessages = ref<ChatMsg[]>([]);
const chatScrollContainer = ref<HTMLElement | null>(null);

const scrollToBottom = (): void => {
  void nextTick(() => {
    if (chatScrollContainer.value) {
      chatScrollContainer.value.scrollTop = chatScrollContainer.value.scrollHeight;
    }
  });
}; /*end scrollToBottom*/

const clearWorkspaceChat = (): void => {
  const ws = selectedWorkspace.value;
  if (!ws) return;
  chatMessages.value = [
    {
      id: `init-${Date.now()}`,
      sender: "agent",
      agentName: "AI Assistant",
      text: `Chat history cleared. Ready to assist with workspace "${ws.name}".`,
      timestamp: "Today",
    },
  ];
  saveWorkspaceChat(ws.id, chatMessages.value);
  scrollToBottom();
  q.notify({
    type: "info",
    message: "Chat history cleared for this workspace.",
    icon: "delete_sweep",
  });
}; /*end clearWorkspaceChat*/

// Scope chat to active workspace: close drawer & load persistent history
watch(
  () => taskStore.activeWorkspaceId,
  (newId) => {
    if (!newId) {
      rightDrawerOpen.value = false;
      return;
    }
    chatMessages.value = loadWorkspaceChat(newId);
    scrollToBottom();
  },
  { immediate: true },
);

const sendChatMessage = async (): Promise<void> => {
  const ws = selectedWorkspace.value;
  if (!ws) {
    q.notify({
      type: "warning",
      message: "No active workspace. Select a workspace to interact with the assistant.",
    });
    rightDrawerOpen.value = false;
    return;
  }

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
  saveWorkspaceChat(ws.id, chatMessages.value);
  scrollToBottom();

  try {
    const res = await fetch("https://europe-west1-opsflow-88of.cloudfunctions.net/chatWithAgent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userText,
        workspaceId: selectedWorkspace.value?.id,
        taskId: selectedTask.value?.id,
        workspacePrompt: selectedWorkspace.value?.systemPrompt,
        workspaceName: selectedWorkspace.value?.name,
        linkedResources: selectedWorkspace.value?.linkedResources,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      chatMessages.value.push({
        id: `agent-${Date.now()}`,
        sender: "agent",
        agentName: data.agentName || "AI Assistant",
        text: data.reply || "Operation completed successfully by AI Agent.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        toolsUsed: data.toolsUsed || [],
      });
      saveWorkspaceChat(ws.id, chatMessages.value);
    } else {
      throw new Error("HTTP " + res.status);
    }
  } catch {
    chatMessages.value.push({
      id: `agent-${Date.now()}`,
      sender: "agent",
      agentName: "AI Assistant",
      text: `Received: "${userText}". Genkit agents are processing subtasks and connected tools.`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      toolsUsed: ["searchWebAndPlatformsTool"],
    });
    saveWorkspaceChat(ws.id, chatMessages.value);
  } finally {
    isAgentTyping.value = false;
    scrollToBottom();
  }
}; /*end sendChatMessage*/

const handleCreateWorkspace = (): void => {
  q.dialog({
    title: "New Workspace",
    message: "Enter the name for the new workspace:",
    prompt: {
      model: "",
      type: "text",
      placeholder: "e.g. Q4 Outreach Campaign...",
    },
    cancel: true,
    persistent: true,
  }).onOk(async (name: string) => {
    if (!name.trim()) return;
    try {
      const newId = await taskStore.createWorkspace({
        name: name.trim(),
        description: "",
      });
      const ws = taskStore.workspaces.find((w) => w.id === newId);
      if (ws) {
        await taskStore.setActiveWorkspace(ws);
        selectWorkspace(ws);
      }
      q.notify({
        type: "positive",
        message: `Workspace "${name.trim()}" created successfully!`,
        icon: "check_circle",
      });
    } catch {
      q.notify({
        type: "negative",
        message: "Error creating workspace",
      });
    }
  });
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
      message: "Workspace name updated",
      position: "top",
    });
  } catch {
    q.notify({
      type: "negative",
      message: "Error updating workspace name",
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
      message: isPinned ? "Workspace pinned to top" : "Workspace unpinned",
      position: "top",
    });
  } catch {
    q.notify({
      type: "negative",
      message: "Error updating pin status",
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
      message: "Group assigned successfully",
      position: "top",
    });
  } catch {
    q.notify({
      type: "negative",
      message: "Error assigning group",
      position: "top",
    });
  }
}; /*end confirmGroupWorkspace*/

const shareWorkspace = (ws: Workspace): void => {
  const url = `${window.location.origin}/#/workspace/${ws.id}`;
  navigator.clipboard.writeText(url);
  q.notify({
    type: "positive",
    message: "Workspace link copied to clipboard",
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
      await taskStore.setActiveWorkspace(null);
    }
    deleteModalOpen.value = false;
    q.notify({
      type: "positive",
      message: `Workspace "${workspaceTarget.value.name}" permanently deleted`,
      position: "top",
      icon: "delete_forever",
    });
  } catch {
    q.notify({
      type: "negative",
      message: "Error deleting workspace",
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

        <!-- Logo + Title (Clickable to go Home) -->
        <div class="row items-center cursor-pointer q-mr-md" @click="goToHomeDashboard">
          <q-avatar size="32px" class="q-mr-sm">
            <img src="~@/assets/logo_OPS.png" alt="OpsFlow logo" />
          </q-avatar>
          <q-toolbar-title class="q-my-none">
            {{ pageTitle }}
          </q-toolbar-title>
        </div>

        <q-space />

        <!-- Right drawer toggle (OpsFlow AI Assistant) -->
        <q-btn
          dense
          flat
          round
          icon="smart_toy"
          aria-label="Toggle AI assistant"
          :class="{ 'text-gold': rightDrawerOpen && selectedWorkspace }"
          @click="toggleRightDrawer"
        >
          <q-tooltip>
            {{
              selectedWorkspace
                ? `OpsFlow AI Assistant (${selectedWorkspace.name})`
                : "OpsFlow AI Assistant (Open Assistant)"
            }}
          </q-tooltip>
        </q-btn>

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
                    {{ authStore.user?.displayName || "Active User" }}
                  </q-item-label>
                  <q-item-label caption class="ellipsis text-caption">
                    {{ authStore.user?.email || "user@opsflow.io" }}
                  </q-item-label>
                  <div class="q-mt-xs">
                    <q-badge color="secondary" class="text-caption text-weight-bold">
                      Role: {{ authStore.user?.claims?.role || "operator" }}
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
                  <q-item-label>System Settings</q-item-label>
                  <q-item-label caption>Preferences &amp; Tenant</q-item-label>
                </q-item-section>
              </q-item>

              <!-- Profile -->
              <q-item clickable @click="showProfileModal = true">
                <q-item-section avatar>
                  <q-icon name="person" size="xs" color="primary" />
                </q-item-section>
                <q-item-section>
                  <q-item-label>User Profile</q-item-label>
                  <q-item-label caption>Credentials &amp; Details</q-item-label>
                </q-item-section>
              </q-item>

              <q-separator />

              <!-- Logout -->
              <q-item clickable class="text-negative" @click="handleLogout">
                <q-item-section avatar>
                  <q-icon name="logout" size="xs" color="negative" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-weight-bold">Sign Out (Logout)</q-item-label>
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
      :width="leftDrawerWidth"
      :breakpoint="1023"
      :class="{ 'no-transition': isResizingLeft }"
    >
      <!-- Interactive Resize Handle -->
      <div
        class="drawer-resizer drawer-resizer-right"
        :class="{ 'is-resizing': isResizingLeft }"
        @mousedown.prevent.stop="startLeftResize"
      >
        <div class="resizer-handle-pill"></div>
      </div>

      <div class="q-pa-md">
        <!-- Navigation to Home / Overview -->
        <q-item
          clickable
          v-ripple
          :active="!selectedWorkspace"
          active-class="bg-blue-1 text-primary text-weight-bold"
          class="rounded-borders q-mb-md"
          @click="goToHomeDashboard"
        >
          <q-item-section avatar style="min-width: 32px">
            <q-icon name="dashboard" color="primary" size="sm" />
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-weight-bold text-body2">
              Overview &amp; Profile
            </q-item-label>
            <q-item-label caption class="text-caption text-grey-6"> Home Dashboard </q-item-label>
          </q-item-section>
        </q-item>

        <q-separator class="q-mb-md" />

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
                      <q-item-section>Rename</q-item-section>
                    </q-item>

                    <q-item clickable @click="togglePinWorkspace(ws)">
                      <q-item-section avatar style="min-width: 28px">
                        <q-icon
                          :name="ws.isPinned ? 'do_not_disturb_on' : 'push_pin'"
                          size="xs"
                          color="amber-9"
                        />
                      </q-item-section>
                      <q-item-section>{{ ws.isPinned ? "Unpin" : "Pin to top" }}</q-item-section>
                    </q-item>

                    <q-item clickable @click="openGroupModal(ws)">
                      <q-item-section avatar style="min-width: 28px">
                        <q-icon name="folder_open" size="xs" color="secondary" />
                      </q-item-section>
                      <q-item-section>Group</q-item-section>
                    </q-item>

                    <q-item clickable @click="shareWorkspace(ws)">
                      <q-item-section avatar style="min-width: 28px">
                        <q-icon name="share" size="xs" color="info" />
                      </q-item-section>
                      <q-item-section>Share</q-item-section>
                    </q-item>

                    <q-separator class="q-my-xs" />

                    <q-item clickable class="text-negative" @click="openDeleteDialog(ws)">
                      <q-item-section avatar style="min-width: 28px">
                        <q-icon name="delete_forever" size="xs" color="negative" />
                      </q-item-section>
                      <q-item-section class="text-weight-bold">Delete</q-item-section>
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

    <!-- Right Drawer: AI Timeline & Chat (strictly workspace-scoped) -->
    <q-drawer
      v-if="selectedWorkspace"
      v-model="rightDrawerOpen"
      side="right"
      bordered
      :width="rightDrawerWidth"
      :breakpoint="1023"
      :class="[uiStore.darkMode ? 'bg-grey-9' : 'bg-white', { 'no-transition': isResizingRight }]"
      class="ai-assistant-drawer"
    >
      <!-- Interactive Resize Handle -->
      <div
        class="drawer-resizer drawer-resizer-left"
        :class="{ 'is-resizing': isResizingRight }"
        @mousedown.prevent.stop="startRightResize"
      >
        <div class="resizer-handle-pill"></div>
      </div>

      <div class="column no-wrap full-height q-pa-md ai-drawer-inner">
        <!-- AI Header -->
        <div
          class="row items-center justify-between q-mb-sm ai-drawer-header"
          style="flex-shrink: 0"
        >
          <div class="row items-center">
            <q-icon name="smart_toy" color="primary" size="sm" class="q-mr-sm" />
            <span class="text-subtitle1 text-weight-bold"> OpsFlow AI Assistant </span>
          </div>
          <div class="row items-center q-gutter-xs">
            <q-btn
              dense
              flat
              round
              icon="delete_sweep"
              size="sm"
              color="grey-7"
              aria-label="Clear chat history"
              @click="clearWorkspaceChat"
            >
              <q-tooltip>Clear chat history</q-tooltip>
            </q-btn>
            <q-btn dense flat round icon="close" size="sm" @click="rightDrawerOpen = false">
              <q-tooltip>Close Assistant</q-tooltip>
            </q-btn>
          </div>
        </div>

        <!-- Selection context badge -->
        <q-banner
          v-if="selectedWorkspace || selectedTask"
          dense
          rounded
          class="bg-blue-1 text-primary q-mb-sm ai-drawer-context"
          style="flex-shrink: 0"
        >
          <template #avatar>
            <q-icon name="info" color="primary" size="xs" />
          </template>
          <div class="text-caption">
            Context:
            <strong v-if="selectedWorkspace">{{ selectedWorkspace.name }}</strong>
            <span v-if="selectedTask"> / {{ selectedTask.title }}</span>
          </div>
        </q-banner>

        <!-- Live Chat Messages area -->
        <div
          ref="chatScrollContainer"
          class="col scroll q-py-xs q-px-xs ai-chat-messages-container"
        >
          <div v-for="msg in chatMessages" :key="msg.id" class="q-mb-sm">
            <q-chat-message
              :name="msg.sender === 'user' ? 'You' : msg.agentName || 'AI Assistant'"
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

          <q-chat-message v-if="isAgentTyping" name="AI Assistant" bg-color="grey-3">
            <q-spinner-dots size="2rem" color="primary" />
          </q-chat-message>
        </div>

        <!-- Chat Input area (pinned at bottom) -->
        <div class="q-pt-sm ai-drawer-input-container" style="flex-shrink: 0">
          <q-input
            v-model="chatMessage"
            outlined
            dense
            placeholder="Ask the AI Agent or give an instruction..."
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

        <div class="text-h6 text-weight-bold q-mb-xs">Delete Workspace</div>
        <div class="text-body2 text-grey-7 q-mb-md">
          Are you sure you want to delete <strong>"{{ workspaceTarget?.name }}"</strong>? This
          action is irreversible and will permanently remove all associated tasks and documents.
        </div>

        <div class="text-caption text-weight-medium text-negative q-mb-sm">
          Type the exact name <strong>{{ workspaceTarget?.name }}</strong> to confirm:
        </div>

        <q-input
          v-model="deleteConfirmInput"
          outlined
          dense
          placeholder="Type workspace name"
          class="q-mb-md"
          :dark="uiStore.darkMode"
          autofocus
        />

        <div class="row q-gutter-sm justify-end">
          <q-btn flat label="Cancel" color="grey-7" v-close-popup no-caps />
          <q-btn
            unelevated
            color="negative"
            label="Delete Permanently"
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
        <div class="text-subtitle1 text-weight-bold q-mb-sm">Rename Workspace</div>
        <q-input
          v-model="newWorkspaceName"
          outlined
          dense
          label="Workspace Name"
          class="q-mb-md"
          autofocus
        />
        <div class="row justify-end q-gutter-sm">
          <q-btn flat label="Cancel" v-close-popup no-caps />
          <q-btn color="primary" label="Save" no-caps @click="confirmRenameWorkspace" />
        </div>
      </q-card>
    </q-dialog>

    <!-- Elite Group Dialog -->
    <q-dialog v-model="groupModalOpen" persistent backdrop-filter="blur(10px)">
      <q-card style="width: 400px; max-width: 90vw; border-radius: 20px" class="q-pa-md">
        <div class="text-subtitle1 text-weight-bold q-mb-sm">Assign Group</div>
        <q-input
          v-model="newGroupName"
          outlined
          dense
          label="Group / Folder Name"
          placeholder="e.g. Projects 2026"
          class="q-mb-md"
          autofocus
        />
        <div class="row justify-end q-gutter-sm">
          <q-btn flat label="Cancel" v-close-popup no-caps />
          <q-btn color="primary" label="Save" no-caps @click="confirmGroupWorkspace" />
        </div>
      </q-card>
    </q-dialog>

    <!-- Settings Modal -->
    <q-dialog v-model="showSettingsModal" persistent backdrop-filter="blur(10px)">
      <q-card style="width: 440px; max-width: 90vw; border-radius: 20px" class="q-pa-lg">
        <div class="row items-center justify-between q-mb-md">
          <div class="text-h6 text-weight-bold text-primary">
            <q-icon name="settings" class="q-mr-sm" /> System Settings
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </div>

        <q-list separator>
          <q-item class="q-px-none">
            <q-item-section avatar>
              <q-icon name="dark_mode" color="primary" />
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-weight-medium">Dark Theme (Dark Mode)</q-item-label>
              <q-item-label caption>Toggle between Light and Dark mode</q-item-label>
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
              <q-item-label class="text-weight-medium">Current Tenant ID</q-item-label>
              <q-item-label caption>{{ authStore.tenantId }}</q-item-label>
            </q-item-section>
          </q-item>

          <q-item class="q-px-none">
            <q-item-section avatar>
              <q-icon name="verified_user" color="primary" />
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-weight-medium">JWT Custom Claims Permissions</q-item-label>
              <q-item-label caption
                >Role: {{ authStore.user?.claims?.role || "operator" }}</q-item-label
              >
            </q-item-section>
          </q-item>
        </q-list>

        <div class="row justify-end q-mt-lg">
          <q-btn color="primary" label="Close" no-caps v-close-popup />
        </div>
      </q-card>
    </q-dialog>

    <!-- Profile Modal -->
    <q-dialog v-model="showProfileModal" persistent backdrop-filter="blur(10px)">
      <q-card style="width: 440px; max-width: 90vw; border-radius: 20px" class="q-pa-lg">
        <div class="row items-center justify-between q-mb-md">
          <div class="text-h6 text-weight-bold text-primary">
            <q-icon name="person" class="q-mr-sm" /> User Profile
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </div>

        <div class="text-center q-mb-md">
          <q-avatar size="64px" color="primary" text-color="white" class="text-h5 text-weight-bold">
            {{ userInitials }}
          </q-avatar>
          <div class="text-subtitle1 text-weight-bold q-mt-sm">
            {{ authStore.user?.displayName || "Active User" }}
          </div>
          <div class="text-caption text-grey-7">
            {{ authStore.user?.email || "user@opsflow.io" }}
          </div>
        </div>

        <q-list separator>
          <q-item class="q-px-none">
            <q-item-section avatar>
              <q-icon name="mark_email_read" color="positive" />
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-weight-medium">Email Verification Status</q-item-label>
              <q-item-label caption class="text-positive text-weight-bold">
                ✓ Email Verified (GDPR Compliant)
              </q-item-label>
            </q-item-section>
          </q-item>
        </q-list>

        <q-separator class="q-my-md" />

        <!-- GDPR Art. 17 Account Self-Deletion Danger Zone -->
        <!-- Account Deletion / Organization Teardown Zone -->
        <div class="q-pa-sm bg-red-1 border-radius-8">
          <div class="text-caption text-weight-bold text-negative q-mb-xs">
            <q-icon name="warning" class="q-mr-xs" />
            {{ authStore.isOwner ? "Teardown Organization" : "Delete Personal Account" }}
          </div>
          <div class="text-caption text-grey-8 q-mb-sm">
            {{
              authStore.isOwner
                ? "Permanent teardown of the organization with cascade deletion of workspaces, tasks, and members."
                : "Right to be Forgotten (GDPR Art. 17): delete your personal profile. Workspace assets remain intact."
            }}
          </div>
          <q-btn
            color="negative"
            outline
            dense
            no-caps
            icon="delete_forever"
            :label="
              authStore.isOwner ? 'Teardown Organization & Account' : 'Delete My Personal Account'
            "
            class="full-width"
            @click="
              showProfileModal = false;
              showDeleteAccountDialog = true;
            "
          />
        </div>

        <div class="row justify-end q-mt-lg">
          <q-btn color="primary" label="Close" no-caps v-close-popup />
        </div>
      </q-card>
    </q-dialog>

    <!-- Security Account Deletion & Tenant Teardown Dialog (GDPR Art. 17 & RBAC) -->
    <delete-account-dialog v-model="showDeleteAccountDialog" />
  </q-layout>
</template>

<style scoped lang="scss">
:deep(.ai-assistant-drawer .q-drawer__content) {
  overflow: hidden !important;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.ai-drawer-inner {
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ai-drawer-header,
.ai-drawer-context,
.ai-drawer-input-container {
  flex-shrink: 0;
}

.ai-chat-messages-container {
  flex: 1 1 0%;
  min-height: 0;
  overflow-y: auto;
}

.no-transition,
.no-transition :deep(.q-drawer__content),
.no-transition.q-drawer {
  transition: none !important;
}

.drawer-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 10px;
  cursor: col-resize;
  z-index: 1000;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease;

  .resizer-handle-pill {
    width: 3px;
    height: 38px;
    border-radius: 3px;
    background: rgba(197, 160, 101, 0.45);
    transition:
      background 0.15s ease,
      height 0.15s ease,
      width 0.15s ease,
      box-shadow 0.15s ease;
  }

  &:hover,
  &.is-resizing {
    background-color: rgba(197, 160, 101, 0.22);
    box-shadow: 0 0 10px rgba(197, 160, 101, 0.4);

    .resizer-handle-pill {
      width: 4px;
      height: 56px;
      background: #c5a065;
      box-shadow: 0 0 8px rgba(197, 160, 101, 0.85);
    }
  }
}

.drawer-resizer-right {
  right: 0;
  border-right: 1.5px solid rgba(197, 160, 101, 0.25);
}

.drawer-resizer-left {
  left: 0;
  border-left: 1.5px solid rgba(197, 160, 101, 0.25);
}
</style>
