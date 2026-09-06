<script setup lang="ts">
/**
 * @file index.vue
 * @description Main operational dashboard with Triple-Pane UI, Prompt-Driven Task Creation & AI SubTask Inspector.
 * @author Vasile Chifeac
 * @created 2026-07-29
 * @modified 2026-07-30
 *
 * @notes
 * - Integrates MainLayout (Header, Left Workspace Tree, Right AI Chat)
 * - NotebookLM-style 3-dots context menu on Task Cards
 * - Prompt-Driven Task Creation Dialog for sending direct objectives to AI Agents
 * - AI SubTask Inspector Dialog displaying AgentePlanner complexity scores & subtask checklists
 *
 * @dependencies
 * - MainLayout.vue
 * - uiStore & taskStore
 * - Quasar components
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { ref, computed, inject, watch, onMounted, type Ref } from "vue";
import { useQuasar } from "quasar";

// ── Layout ───────────────────────────────────────────────────────────────────
import MainLayout from "@/layouts/MainLayout.vue";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useUiStore } from "@/stores/uiStore";
import { useTaskStore } from "@/stores/taskStore";
import { useTaskChatStore } from "@/stores/taskChatStore";
import { useAuthStore } from "@/stores/authStore";

// ── Types ────────────────────────────────────────────────────────────────────
import type { Task, Workspace, TaskStatus } from "@/types/models";

// ── Components ───────────────────────────────────────────────────────────────
import TaskChatWindow from "@/components/TaskChatWindow.vue";
import WorkspaceAttitudeModal from "@/components/WorkspaceAttitudeModal.vue";
import AIPromptArchitectModal from "@/components/AIPromptArchitectModal.vue";
import AITaskArchitectModal from "@/components/AITaskArchitectModal.vue";

// ── State ────────────────────────────────────────────────────────────────────
const q = useQuasar();
const uiStore = useUiStore();
const taskStore = useTaskStore();
const authStore = useAuthStore();

const selectedWorkspace = computed(() => taskStore.activeWorkspace);
const selectedTask = inject<Ref<Task | null>>("selectedTask", ref(null));

// Modal states for Task-as-a-Chat & Workspace Attitude
const showTaskChatModal = ref(false);
const showAttitudeModal = ref(false);
const showPromptArchitectModal = ref(false);

// Modal states for Prompt-Driven Task Creation
const showCreateTaskModal = ref(false);
const newTaskTitle = ref("");
const newTaskPrompt = ref("");
const newTaskCategory = ref("general");
/** AI Task Architect modal state (Step 17). */
const showTaskArchitectModal = ref(false);
/** Pre-populated draft when opened from the inline chip in the standard task dialog (Step 17 §4.2). */
const rawDraftFromInline = ref("");

const categoryOptions = [
  { label: "General / Operational", value: "general" },
  { label: "Marketing & Lead Gen", value: "marketing" },
  { label: "Research & Sourcing", value: "research" },
  { label: "Administration & Email", value: "admin" },
  { label: "Development & Tech", value: "dev" },
  { label: "Healthcare / Clinical Assistance", value: "clinical" },
];

// Modal states for SubTask Inspector
const showSubTaskInspectorModal = ref(false);
const inspectorTask = ref<Task | null>(null);

// Modal states for Task Edit & Delete
const showEditTaskModal = ref(false);
const editingTask = ref<Task | null>(null);
const editTaskTitle = ref("");
const editTaskDescription = ref("");

const showDeleteTaskModal = ref(false);
const deletingTask = ref<Task | null>(null);
const confirmDeleteTitle = ref("");

const currentWorkspaceTasks = computed(() => {
  const sw = selectedWorkspace.value;
  if (!sw) return [];
  return taskStore.tasks.filter((t: Task) => t.workspaceId === sw.id);
});

const chatStore = useTaskChatStore();

const selectTask = (task: Task): void => {
  selectedTask.value = task;
  if (selectedWorkspace.value) {
    chatStore.openFloatingWindow(task, selectedWorkspace.value.id);
  }
}; /*end selectTask*/

const openSubTaskInspector = (task: Task): void => {
  inspectorTask.value = task;
  showSubTaskInspectorModal.value = true;
}; /*end openSubTaskInspector*/

const openCreateTaskModal = (): void => {
  newTaskTitle.value = "";
  newTaskPrompt.value = "";
  newTaskCategory.value = "general";
  showCreateTaskModal.value = true;
}; /*end openCreateTaskModal*/

const openTaskArchitectFromDialog = (): void => {
  const parts: string[] = [];
  if (newTaskTitle.value.trim()) parts.push(newTaskTitle.value.trim());
  if (newTaskPrompt.value.trim()) parts.push(newTaskPrompt.value.trim());
  rawDraftFromInline.value = parts.join(" — ");
  showCreateTaskModal.value = false;
  showTaskArchitectModal.value = true;
}; /*end openTaskArchitectFromDialog*/

const openNewWorkspaceModal = (): void => {
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
      const ws = taskStore.workspaces.find((w: Workspace) => w.id === newId);
      if (ws) {
        await taskStore.setActiveWorkspace(ws);
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
}; /*end openNewWorkspaceModal*/

const handleAttitudeApplied = async (): Promise<void> => {
  await taskStore.fetchWorkspaces();
}; /*end handleAttitudeApplied*/

const confirmCreateTask = async (): Promise<void> => {
  if (!selectedWorkspace.value || !newTaskTitle.value.trim() || !newTaskPrompt.value.trim()) return;

  try {
    await taskStore.createTask({
      workspaceId: selectedWorkspace.value.id,
      title: newTaskTitle.value.trim(),
      description: newTaskPrompt.value.trim(),
      aiMetadata: {
        suggestedCategory: newTaskCategory.value,
        complexityScore: 5,
        confidence: 0.8,
        modelVersion: "gemini-3.6-flash",
        lastAnalyzed: new Date(),
      },
    });

    q.notify({
      type: "positive",
      message:
        "Task created successfully! AgentePlanner is decomposing subtasks in the background.",
      position: "top",
      icon: "smart_toy",
    });
    showCreateTaskModal.value = false;
  } catch (err) {
    q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Error creating task",
      position: "top",
    });
  }
}; /*end confirmCreateTask*/

// SubTask Toggle Handler inside Inspector Modal
const toggleSubTask = async (subtaskIndex: number): Promise<void> => {
  if (!inspectorTask.value) return;

  const subtasks = inspectorTask.value.aiMetadata?.subtasks;
  if (!subtasks || !subtasks[subtaskIndex]) return;

  const currentSub = subtasks[subtaskIndex];
  if (currentSub) {
    currentSub.completed = !currentSub.completed;
  }

  try {
    await taskStore.updateTask(inspectorTask.value.workspaceId, inspectorTask.value.id, {
      aiMetadata: inspectorTask.value.aiMetadata,
    });
    q.notify({
      type: "positive",
      message: "Subtask status updated",
      position: "top",
    });
  } catch {
    q.notify({
      type: "negative",
      message: "Error updating subtask",
      position: "top",
    });
  }
}; /*end toggleSubTask*/

// Task 3-Dots Menu Handlers
const openEditTaskModal = (task: Task): void => {
  editingTask.value = task;
  editTaskTitle.value = task.title;
  editTaskDescription.value = task.description;
  showEditTaskModal.value = true;
}; /*end openEditTaskModal*/

const confirmEditTask = async (): Promise<void> => {
  if (!editingTask.value || !editTaskTitle.value.trim()) return;
  try {
    await taskStore.updateTask(editingTask.value.workspaceId, editingTask.value.id, {
      title: editTaskTitle.value.trim(),
      description: editTaskDescription.value.trim(),
    });
    q.notify({
      type: "positive",
      message: "Task updated successfully",
      position: "top",
    });
    showEditTaskModal.value = false;
  } catch (err) {
    q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Error updating task",
      position: "top",
    });
  }
}; /*end confirmEditTask*/

const handleStatusChange = async (task: Task, status: TaskStatus): Promise<void> => {
  try {
    await taskStore.updateTaskStatus(task.workspaceId, task.id, status);
    q.notify({
      type: "positive",
      message: `Task status updated to ${status}`,
      position: "top",
    });
  } catch (err) {
    q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Error updating status",
      position: "top",
    });
  }
}; /*end handleStatusChange*/

const openDeleteTaskModal = (task: Task): void => {
  deletingTask.value = task;
  confirmDeleteTitle.value = "";
  showDeleteTaskModal.value = true;
}; /*end openDeleteTaskModal*/

const confirmDeleteTask = async (): Promise<void> => {
  if (!deletingTask.value || confirmDeleteTitle.value.trim() !== deletingTask.value.title.trim()) {
    return;
  }
  try {
    await taskStore.deleteTask(deletingTask.value.workspaceId, deletingTask.value.id);
    q.notify({
      type: "positive",
      message: "Task permanently deleted",
      position: "top",
    });
    showDeleteTaskModal.value = false;
  } catch (err) {
    q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Error deleting task",
      position: "top",
    });
  }
}; /*end confirmDeleteTask*/

watch(
  selectedWorkspace,
  async (newWs) => {
    if (newWs) {
      try {
        await taskStore.fetchWorkspaceTasks(newWs.id);
      } catch {
        // Error handled in store
      }
    }
  },
  { immediate: true },
);

onMounted(async () => {
  try {
    await taskStore.fetchWorkspaces();
    if (!taskStore.activeWorkspaceId && taskStore.workspaces[0]) {
      await taskStore.setActiveWorkspace(taskStore.workspaces[0]);
    }
    if (selectedWorkspace.value) {
      await taskStore.fetchWorkspaceTasks(selectedWorkspace.value.id);
    }
  } catch {
    // Error handled in store
  }
});
</script>

<template>
  <MainLayout>
    <q-page
      class="q-pa-xl dashboard-canvas"
      :class="uiStore.darkMode ? 'dark-canvas' : 'light-canvas'"
    >
      <!-- Workspace header -->
      <div v-if="selectedWorkspace" class="q-mb-xl">
        <div class="row items-center justify-between">
          <div class="row items-center q-gutter-md">
            <q-btn
              flat
              round
              dense
              icon="arrow_back"
              :class="uiStore.darkMode ? 'text-white' : 'text-navy'"
              @click="taskStore.setActiveWorkspace(null)"
            >
              <q-tooltip>Back to Home Dashboard</q-tooltip>
            </q-btn>
            <div>
              <h2
                class="text-h4 text-weight-bold q-my-none"
                :class="uiStore.darkMode ? 'text-white' : 'text-navy'"
              >
                {{ selectedWorkspace.name }}
              </h2>
              <div
                class="text-body2 q-mt-xs"
                :class="uiStore.darkMode ? 'text-slate-light' : 'text-slate-dark'"
              >
                {{ currentWorkspaceTasks.length }} active tasks in this workspace
              </div>
            </div>
          </div>
          <div class="row items-center q-gutter-sm">
            <q-btn
              unelevated
              icon="auto_awesome"
              label="✨ AI Prompt Architect"
              no-caps
              color="primary"
              class="create-task-btn"
              :disabled="!selectedWorkspace"
              @click="showPromptArchitectModal = true"
            >
              <q-tooltip
                >No-Code configuration wizard to automatically generate Attitude &amp; Skill Matrix
                (DBS)</q-tooltip
              >
            </q-btn>

            <q-btn
              outline
              icon="psychology"
              label="AI Attitude"
              no-caps
              color="amber-7"
              class="create-task-btn"
              :disabled="!selectedWorkspace"
              @click="showAttitudeModal = true"
            >
              <q-tooltip>Modify the System Prompt and AI behavior for this Workspace</q-tooltip>
            </q-btn>

            <q-btn
              icon="add"
              label="New Task (Prompt Driven)"
              no-caps
              class="create-task-btn"
              :class="uiStore.darkMode ? 'dark-btn' : 'light-btn'"
              :disabled="!selectedWorkspace"
              @click="openCreateTaskModal"
            />
          </div>
        </div>
      </div>

      <!-- Home Dashboard / Overview Profile & Workspaces (when no workspace is active) -->
      <div v-if="!selectedWorkspace" class="dashboard-overview">
        <!-- Hero Profile & Welcome -->
        <div class="q-mb-xl">
          <div class="row items-center justify-between q-col-gutter-md">
            <div>
              <div class="row items-center q-gutter-sm q-mb-xs">
                <q-icon
                  name="dashboard"
                  size="32px"
                  :color="uiStore.darkMode ? 'amber-5' : 'primary'"
                />
                <h1
                  class="text-h4 text-weight-bold q-my-none"
                  :class="uiStore.darkMode ? 'text-white' : 'text-navy'"
                >
                  Overview &amp; Dashboard
                </h1>
                <q-badge color="primary" class="q-ml-sm text-caption">Master Owner</q-badge>
              </div>
              <div
                class="text-body1"
                :class="uiStore.darkMode ? 'text-slate-light' : 'text-slate-dark'"
              >
                Welcome back,
                <strong class="text-primary">{{
                  authStore.user?.displayName || authStore.user?.email || "User"
                }}</strong
                >. Select an operational workspace or create a new one.
              </div>
            </div>

            <div>
              <q-btn
                unelevated
                icon="add"
                label="New Workspace"
                no-caps
                color="secondary"
                class="create-task-btn"
                @click="openNewWorkspaceModal"
              />
            </div>
          </div>
        </div>

        <!-- Metric KPI Cards -->
        <div class="row q-col-gutter-md q-mb-xl">
          <div class="col-12 col-sm-4">
            <q-card
              flat
              class="q-pa-md metric-card rounded-borders"
              :class="uiStore.darkMode ? 'bg-grey-9 text-white' : 'bg-white text-navy shadow-1'"
            >
              <div class="row items-center justify-between">
                <div>
                  <div class="text-caption text-grey-6 text-uppercase text-weight-bold">
                    Active Workspaces
                  </div>
                  <div class="text-h4 text-weight-bold q-mt-xs">
                    {{ taskStore.workspaces.length }}
                  </div>
                </div>
                <q-avatar icon="folder_open" color="blue-1" text-color="primary" size="48px" />
              </div>
            </q-card>
          </div>

          <div class="col-12 col-sm-4">
            <q-card
              flat
              class="q-pa-md metric-card rounded-borders"
              :class="uiStore.darkMode ? 'bg-grey-9 text-white' : 'bg-white text-navy shadow-1'"
            >
              <div class="row items-center justify-between">
                <div>
                  <div class="text-caption text-grey-6 text-uppercase text-weight-bold">
                    Total Operational Tasks
                  </div>
                  <div class="text-h4 text-weight-bold q-mt-xs">{{ taskStore.tasks.length }}</div>
                </div>
                <q-avatar icon="assignment" color="amber-1" text-color="amber-9" size="48px" />
              </div>
            </q-card>
          </div>

          <div class="col-12 col-sm-4">
            <q-card
              flat
              class="q-pa-md metric-card rounded-borders"
              :class="uiStore.darkMode ? 'bg-grey-9 text-white' : 'bg-white text-navy shadow-1'"
            >
              <div class="row items-center justify-between">
                <div>
                  <div class="text-caption text-grey-6 text-uppercase text-weight-bold">
                    Completed Tasks
                  </div>
                  <div class="text-h4 text-weight-bold q-mt-xs text-positive">
                    {{ taskStore.tasks.filter((t: Task) => t.status === "completed").length }}
                  </div>
                </div>
                <q-avatar icon="check_circle" color="green-1" text-color="positive" size="48px" />
              </div>
            </q-card>
          </div>
        </div>

        <!-- Workspaces Grid -->
        <div class="q-mb-md row items-center justify-between">
          <div
            class="text-h6 text-weight-bold"
            :class="uiStore.darkMode ? 'text-white' : 'text-navy'"
          >
            Your Operational Workspaces
          </div>
          <div class="text-caption text-grey-6">
            Click a workspace to open the operational board
          </div>
        </div>

        <div v-if="taskStore.workspaces.length === 0" class="text-center q-pa-xl">
          <q-icon name="folder_open" size="64px" color="grey-5" class="q-mb-md" />
          <div class="text-h6 text-grey-7">No workspaces found</div>
          <p class="text-caption text-grey-5 q-mb-md">
            Create your first workspace to start orchestrating AI tasks.
          </p>
          <q-btn
            unelevated
            color="primary"
            label="Create Workspace"
            icon="add"
            no-caps
            @click="openNewWorkspaceModal"
          />
        </div>

        <div v-else class="row q-col-gutter-lg">
          <div v-for="ws in taskStore.workspaces" :key="ws.id" class="col-12 col-sm-6 col-md-4">
            <q-card
              flat
              class="q-pa-lg cursor-pointer task-card workspace-overview-card"
              :class="uiStore.darkMode ? 'dark-task-card' : 'light-task-card'"
              @click="taskStore.setActiveWorkspace(ws)"
            >
              <div class="row items-center justify-between q-mb-sm">
                <div class="row items-center q-gutter-sm">
                  <q-icon
                    :name="ws.isPinned ? 'push_pin' : ws.icon || 'folder'"
                    :color="ws.isPinned ? 'amber-9' : 'primary'"
                    size="sm"
                  />
                  <div
                    class="text-h6 text-weight-bold"
                    :class="uiStore.darkMode ? 'text-white' : 'text-navy'"
                  >
                    {{ ws.name }}
                  </div>
                </div>
                <q-badge
                  v-if="ws.googleIntegration?.connected"
                  color="positive"
                  class="text-caption"
                  outline
                >
                  Google Active
                </q-badge>
              </div>

              <p class="text-body2 text-grey-7 q-mb-md" style="min-height: 40px">
                {{ ws.description || "No description set for this workspace." }}
              </p>

              <div class="row justify-between items-center q-pt-sm border-top-subtle">
                <q-badge color="secondary" outline>
                  {{ taskStore.tasks.filter((t: Task) => t.workspaceId === ws.id).length }} Tasks
                </q-badge>
                <div class="row items-center text-primary text-weight-bold text-caption">
                  <span>Open Workspace</span>
                  <q-icon name="arrow_forward" size="xs" class="q-ml-xs" />
                </div>
              </div>
            </q-card>
          </div>

          <!-- Add Workspace Card in the Grid -->
          <div class="col-12 col-sm-6 col-md-4">
            <q-card
              flat
              class="q-pa-lg cursor-pointer task-card workspace-overview-card new-workspace-dash-card column items-center justify-center text-center"
              :class="uiStore.darkMode ? 'dark-add-card' : 'light-add-card'"
              @click="openNewWorkspaceModal"
            >
              <q-avatar
                icon="add"
                color="primary"
                text-color="white"
                size="52px"
                class="q-mb-md shadow-2"
              />
              <div
                class="text-h6 text-weight-bold"
                :class="uiStore.darkMode ? 'text-white' : 'text-navy'"
              >
                Create New Workspace
              </div>
              <p class="text-caption text-grey-6 q-mt-xs q-mb-none">
                Add a new operational environment to organize tasks and AI agents
              </p>
            </q-card>
          </div>
        </div>
      </div>

      <!-- Task cards grid -->
      <div v-else class="row q-col-gutter-lg">
        <div v-for="task in currentWorkspaceTasks" :key="task.id" class="col-12 col-sm-6 col-md-4">
          <q-card
            flat
            class="q-pa-lg cursor-pointer task-card"
            :class="[
              selectedTask?.id === task.id ? 'selected-card' : '',
              uiStore.darkMode ? 'dark-task-card' : 'light-task-card',
            ]"
            @click="selectTask(task)"
          >
            <!-- Task Header with 3-Dots Menu -->
            <div class="row items-center justify-between q-mb-sm">
              <div
                class="text-h6 text-weight-bold task-title-text"
                :class="uiStore.darkMode ? 'text-white' : 'text-navy'"
              >
                {{ task.title }}
              </div>
              <q-btn
                flat
                round
                dense
                icon="more_vert"
                :class="uiStore.darkMode ? 'text-slate-light' : 'text-navy'"
                @click.stop
              >
                <q-menu auto-close class="notebook-menu">
                  <q-list style="min-width: 180px">
                    <!-- Inspect AI SubTasks -->
                    <q-item clickable @click="selectTask(task)">
                      <q-item-section avatar>
                        <q-icon name="analytics" size="xs" color="secondary" />
                      </q-item-section>
                      <q-item-section>Inspect AI SubTasks</q-item-section>
                    </q-item>

                    <!-- Edit Task -->
                    <q-item clickable @click="openEditTaskModal(task)">
                      <q-item-section avatar>
                        <q-icon name="edit" size="xs" color="primary" />
                      </q-item-section>
                      <q-item-section>Edit Task</q-item-section>
                    </q-item>

                    <!-- Change Status -->
                    <q-item clickable>
                      <q-item-section avatar>
                        <q-icon name="sync" size="xs" color="warning" />
                      </q-item-section>
                      <q-item-section>Change Status</q-item-section>
                      <q-item-section side>
                        <q-icon name="chevron_right" size="xs" />
                      </q-item-section>
                      <q-menu anchor="top end" self="top start" auto-close>
                        <q-list style="min-width: 140px">
                          <q-item clickable @click="handleStatusChange(task, 'pending')">
                            <q-item-section avatar>
                              <q-icon name="schedule" size="xs" color="grey-7" />
                            </q-item-section>
                            <q-item-section>Pending</q-item-section>
                          </q-item>
                          <q-item clickable @click="handleStatusChange(task, 'in-progress')">
                            <q-item-section avatar>
                              <q-icon name="autorenew" size="xs" color="warning" />
                            </q-item-section>
                            <q-item-section>In-Progress</q-item-section>
                          </q-item>
                          <q-item clickable @click="handleStatusChange(task, 'completed')">
                            <q-item-section avatar>
                              <q-icon name="check_circle" size="xs" color="positive" />
                            </q-item-section>
                            <q-item-section>Completed</q-item-section>
                          </q-item>
                        </q-list>
                      </q-menu>
                    </q-item>

                    <q-separator />

                    <!-- Delete Task -->
                    <q-item clickable class="text-negative" @click="openDeleteTaskModal(task)">
                      <q-item-section avatar>
                        <q-icon name="delete" size="xs" color="negative" />
                      </q-item-section>
                      <q-item-section>Delete Task</q-item-section>
                    </q-item>
                  </q-list>
                </q-menu>
              </q-btn>
            </div>

            <!-- Task Description -->
            <div
              class="text-body2 q-mb-lg task-desc"
              :class="uiStore.darkMode ? 'text-slate-light' : 'text-slate-dark'"
            >
              {{ task.description }}
            </div>

            <!-- AI Complexity Score Indicator -->
            <div
              v-if="task.aiMetadata && task.aiMetadata.complexityScore !== undefined"
              class="q-mb-md"
            >
              <div class="row items-center justify-between text-caption q-mb-xs text-grey-7">
                <span>Complexity Score (AgentePlanner)</span>
                <span class="text-weight-bold">{{ task.aiMetadata.complexityScore }}/10</span>
              </div>
              <q-linear-progress
                :value="task.aiMetadata.complexityScore / 10"
                color="amber-9"
                track-color="grey-4"
                style="height: 6px; border-radius: 3px"
              />
            </div>
            <div v-else class="q-mb-md row items-center text-caption text-grey-6">
              <q-spinner-dots color="amber-9" size="1.2em" class="q-mr-xs" />
              <span>Analyzing AI Complexity...</span>
            </div>

            <!-- Footer Badge & Bubble -->
            <div class="row justify-between items-center">
              <q-badge
                :color="
                  task.status === 'completed'
                    ? 'positive'
                    : task.status === 'in-progress'
                      ? 'warning'
                      : 'grey-7'
                "
                class="status-badge"
                :label="task.status"
              />
              <div class="row items-center q-gutter-xs">
                <q-badge
                  v-if="task.aiMetadata?.subtasks?.length"
                  color="secondary"
                  class="text-caption"
                >
                  {{ task.aiMetadata.subtasks.filter((s) => s.completed).length }}/{{
                    task.aiMetadata.subtasks.length
                  }}
                  Subtasks
                </q-badge>
                <q-icon
                  name="chat_bubble_outline"
                  size="sm"
                  :class="uiStore.darkMode ? 'text-gold' : 'text-navy'"
                />
              </div>
            </div>
          </q-card>
        </div>
      </div>

      <!-- Prompt-Driven Create Task Modal with integrated AI Task Architect -->
      <q-dialog v-model="showCreateTaskModal" persistent backdrop-filter="blur(10px)">
        <q-card style="width: 520px; max-width: 92vw; border-radius: 20px" class="q-pa-md">
          <q-card-section>
            <div class="row items-center no-wrap">
              <q-avatar icon="smart_toy" color="primary" text-color="white" class="q-mr-md" />
              <div>
                <div class="text-h6 text-weight-bold text-navy">New Operational Task for AI</div>
                <div class="text-caption text-grey-7">
                  Enter the objective: AgentePlanner will decompose it into subtasks for you.
                </div>
              </div>
            </div>
          </q-card-section>

          <q-card-section class="q-pt-none">
            <q-input
              v-model="newTaskTitle"
              label="Task / Project Title"
              placeholder="e.g. IT Client Outreach Campaign"
              outlined
              dense
              class="q-mb-md"
              autofocus
            />

            <q-select
              v-model="newTaskCategory"
              :options="categoryOptions"
              label="Operational Category"
              outlined
              dense
              emit-value
              map-options
              class="q-mb-md"
            />

            <q-input
              v-model="newTaskPrompt"
              label="Prompt / Goal Description for AI Agent"
              placeholder="e.g. Find prospects in healthcare sector for IT solutions, generate draft emails on Gmail and compile expense sheet..."
              outlined
              dense
              type="textarea"
              rows="4"
            >
              <template #append>
                <q-btn
                  round
                  dense
                  flat
                  icon="auto_awesome"
                  color="secondary"
                  @click="openTaskArchitectFromDialog"
                >
                  <q-tooltip
                    >Refine and structure this prompt with AI Task Architect (Gemini
                    Flash)</q-tooltip
                  >
                </q-btn>
              </template>
            </q-input>
          </q-card-section>

          <q-card-actions align="between" class="q-pt-sm q-px-md">
            <!-- AI Task Architect button always visible -->
            <q-btn
              outline
              icon="auto_awesome"
              label="AI Task Architect"
              no-caps
              color="secondary"
              @click="openTaskArchitectFromDialog"
            >
              <q-tooltip>Decompose and generate full task card with AI</q-tooltip>
            </q-btn>

            <div class="row q-gutter-sm items-center">
              <q-btn v-close-popup flat label="Cancel" no-caps />
              <q-btn
                color="primary"
                icon="smart_toy"
                label="Create &amp; Activate AI Agent"
                no-caps
                :disabled="!newTaskTitle.trim() || !newTaskPrompt.trim()"
                @click="confirmCreateTask"
              />
            </div>
          </q-card-actions>
        </q-card>
      </q-dialog>

      <!-- AI SubTask Inspector Dialog -->
      <q-dialog v-model="showSubTaskInspectorModal" persistent backdrop-filter="blur(12px)">
        <q-card style="width: 540px; max-width: 90vw; border-radius: 24px" class="q-pa-lg">
          <q-card-section class="q-pa-none q-mb-md">
            <div class="row items-center justify-between">
              <div class="row items-center">
                <q-avatar icon="analytics" color="secondary" text-color="white" class="q-mr-sm" />
                <div>
                  <div class="text-h6 text-weight-bold text-navy">AI SubTask Inspector</div>
                  <div class="text-caption text-grey-7">
                    AgentePlanner Analysis &amp; Decomposition
                  </div>
                </div>
              </div>
              <q-btn flat round dense icon="close" v-close-popup />
            </div>
          </q-card-section>

          <q-card-section v-if="inspectorTask" class="q-pa-none">
            <div class="q-pa-md bg-blue-1 rounded-borders q-mb-md">
              <div class="text-subtitle1 text-weight-bold text-navy">
                {{ inspectorTask.title }}
              </div>
              <div class="text-body2 text-grey-8 q-mt-xs">
                {{ inspectorTask.description }}
              </div>
            </div>

            <!-- Score Complexity -->
            <div
              v-if="inspectorTask.aiMetadata?.complexityScore !== undefined"
              class="q-mb-md q-pa-sm bg-amber-1 rounded-borders"
            >
              <div
                class="row items-center justify-between text-body2 text-weight-bold text-amber-10"
              >
                <span>Agent Complexity Score:</span>
                <span>{{ inspectorTask.aiMetadata.complexityScore }} / 10</span>
              </div>
              <q-linear-progress
                :value="inspectorTask.aiMetadata.complexityScore / 10"
                color="amber-9"
                class="q-mt-xs"
                style="height: 8px; border-radius: 4px"
              />
            </div>

            <!-- SubTasks List Checklist -->
            <div class="text-subtitle2 text-weight-bold q-mb-xs text-navy">
              Assigned SubTasks (AgentePlanner):
            </div>

            <div
              v-if="!inspectorTask.aiMetadata?.subtasks?.length"
              class="text-caption text-grey-7 q-my-sm"
            >
              ℹ️ AgentePlanner is processing subtasks in the background...
            </div>

            <q-list v-else separator class="q-mb-md bg-grey-1 rounded-borders">
              <q-item
                v-for="(sub, idx) in inspectorTask.aiMetadata.subtasks"
                :key="idx"
                clickable
                @click="toggleSubTask(idx)"
              >
                <q-item-section avatar style="min-width: 36px">
                  <q-checkbox
                    :model-value="sub.completed"
                    color="positive"
                    @update:model-value="toggleSubTask(idx)"
                  />
                </q-item-section>
                <q-item-section>
                  <q-item-label
                    :class="{ 'text-strike text-grey-6': sub.completed }"
                    class="text-weight-bold text-body2"
                  >
                    {{ sub.title }}
                  </q-item-label>
                  <q-item-label caption class="text-caption">
                    {{ sub.description }}
                  </q-item-label>
                </q-item-section>
              </q-item>
            </q-list>

            <!-- Quality Audit Card (AgenteIspettore) -->
            <div
              v-if="inspectorTask.aiMetadata?.qualityAudit"
              class="q-pa-md bg-green-1 rounded-borders text-positive border-positive"
            >
              <div class="row items-center">
                <q-icon name="verified" size="sm" class="q-mr-sm" />
                <span class="text-weight-bold">AgenteIspettore Quality Audit Passed</span>
              </div>
              <div class="text-caption q-mt-xs">
                {{ inspectorTask.aiMetadata.qualityAudit.summary }}
              </div>
            </div>
          </q-card-section>

          <q-card-actions align="right" class="q-pt-md">
            <q-btn color="primary" label="Close Inspector" no-caps v-close-popup />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <!-- Edit Task Dialog -->
      <q-dialog v-model="showEditTaskModal" persistent>
        <q-card style="min-width: 400px; border-radius: 16px" class="q-pa-md">
          <q-card-section>
            <div class="text-h6 text-weight-bold text-navy">Edit Task</div>
          </q-card-section>

          <q-card-section class="q-pt-none">
            <q-input
              v-model="editTaskTitle"
              label="Task Title"
              outlined
              dense
              class="q-mb-md"
              autofocus
            />
            <q-input
              v-model="editTaskDescription"
              label="Task Description"
              outlined
              dense
              type="textarea"
              rows="3"
            />
          </q-card-section>

          <q-card-actions align="between">
            <q-btn
              flat
              dense
              icon="auto_awesome"
              label="Refine with AI"
              color="secondary"
              no-caps
              @click="
                () => {
                  rawDraftFromInline = editTaskTitle + ' — ' + editTaskDescription;
                  showEditTaskModal = false;
                  showTaskArchitectModal = true;
                }
              "
            >
              <q-tooltip>Refine and structure this task with Gemini Flash</q-tooltip>
            </q-btn>
            <div class="row q-gutter-sm">
              <q-btn v-close-popup flat label="Cancel" no-caps />
              <q-btn
                color="primary"
                label="Save Changes"
                no-caps
                :disabled="!editTaskTitle.trim()"
                @click="confirmEditTask"
              />
            </div>
          </q-card-actions>
        </q-card>
      </q-dialog>

      <!-- Delete Task Double-Confirmation Elite Dialog -->
      <q-dialog v-model="showDeleteTaskModal" persistent>
        <q-card style="min-width: 420px; border-radius: 16px" class="q-pa-md">
          <q-card-section>
            <div class="row items-center no-wrap">
              <q-icon name="warning" color="negative" size="md" class="q-mr-sm" />
              <div class="text-h6 text-weight-bold text-negative">Delete Task</div>
            </div>
          </q-card-section>

          <q-card-section class="q-pt-none">
            <p class="text-body2 text-slate-dark q-mb-md">
              This action is **irreversible**. To confirm permanent deletion of the task, type its
              exact title:
            </p>

            <div class="q-pa-sm bg-grey-2 rounded-borders text-weight-bold text-navy q-mb-md">
              {{ deletingTask?.title }}
            </div>

            <q-input
              v-model="confirmDeleteTitle"
              placeholder="Type the exact task title"
              outlined
              dense
              autofocus
            />
          </q-card-section>

          <q-card-actions align="right">
            <q-btn v-close-popup flat label="Cancel" no-caps />
            <q-btn
              color="negative"
              label="Delete Permanently"
              no-caps
              :disabled="!deletingTask || confirmDeleteTitle.trim() !== deletingTask.title.trim()"
              @click="confirmDeleteTask"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <!-- Draggable & Resizable Multi-Window Task Chats -->
      <TaskChatWindow v-for="win in chatStore.floatingWindows" :key="win.id" :window-state="win" />

      <!-- Workspace Attitude Editor Modal -->
      <WorkspaceAttitudeModal
        v-model="showAttitudeModal"
        :workspace="selectedWorkspace"
        @saved="taskStore.fetchWorkspaces()"
      />

      <!-- AI Prompt Architect Modal (Step 10 Fase 3) -->
      <AIPromptArchitectModal
        v-if="selectedWorkspace"
        v-model="showPromptArchitectModal"
        :workspace-id="selectedWorkspace.id"
        @applied="handleAttitudeApplied"
      />

      <!-- AI Task Architect Modal (Step 17) — workspace-scoped -->
      <AITaskArchitectModal
        v-if="selectedWorkspace"
        v-model="showTaskArchitectModal"
        :workspace-id="selectedWorkspace.id"
        :initial-draft="rawDraftFromInline"
        @task-created="
          taskStore.fetchWorkspaceTasks(selectedWorkspace.id);
          rawDraftFromInline = '';
        "
      />
    </q-page>
  </MainLayout>
</template>

<style scoped lang="scss">
.dashboard-canvas {
  min-height: 100vh;
  transition: background-color 0.3s ease;
}

.light-canvas {
  background-color: #f4f1ea;
}

.dark-canvas {
  background-color: #0b1320;
}

.text-navy {
  color: #0a2342;
}

.text-slate-dark {
  color: #475569;
}

.text-slate-light {
  color: #cbd5e1;
}

.text-gold {
  color: #c5a065;
}

.create-task-btn {
  height: 44px;
  font-weight: 700;
  border-radius: 12px;
  padding: 0 20px;
}

.light-btn {
  background-color: #0a2342 !important;
  color: #ffffff !important;
}

.dark-btn {
  background-color: #c5a065 !important;
  color: #0b1320 !important;
}

// ── Task Card Styling High Contrast ──────────────────────────────────────────
.task-card {
  border-radius: 20px;
  transition: all 0.25s ease;
  height: 260px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
}

.task-title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 80%;
}

.task-desc {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
  line-height: 1.5;
  margin-bottom: auto;
}

@media (max-width: 599px) {
  .task-card {
    height: auto;
    min-height: 220px;
  }
}

.light-task-card {
  background: #ffffff;
  border: 1px solid rgba(197, 160, 101, 0.4);
  box-shadow: 0 8px 24px rgba(10, 35, 66, 0.06);

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 16px 36px rgba(10, 35, 66, 0.12);
  }
}

.dark-task-card {
  background: #152238;
  border: 1.5px solid #334155;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);

  &:hover {
    transform: translateY(-4px);
    border-color: #c5a065;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
  }
}

.selected-card {
  border: 2px solid #c5a065 !important;
  box-shadow: 0 8px 32px rgba(197, 160, 101, 0.3) !important;
}

.status-badge {
  padding: 6px 12px;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.metric-card {
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  &:hover {
    transform: translateY(-2px);
  }
}

.workspace-overview-card {
  min-height: 180px;
  height: auto;
}

.border-top-subtle {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.light-add-card {
  background: rgba(255, 255, 255, 0.7);
  border: 2px dashed rgba(10, 35, 66, 0.25);
  box-shadow: 0 4px 16px rgba(10, 35, 66, 0.04);

  &:hover {
    transform: translateY(-4px);
    border-color: #0a2342;
    background: #ffffff;
    box-shadow: 0 12px 28px rgba(10, 35, 66, 0.1);
  }
}

.dark-add-card {
  background: rgba(21, 34, 56, 0.5);
  border: 2px dashed rgba(197, 160, 101, 0.35);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);

  &:hover {
    transform: translateY(-4px);
    border-color: #c5a065;
    background: #152238;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  }
}
</style>
