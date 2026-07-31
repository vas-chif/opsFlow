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

// ── Types ────────────────────────────────────────────────────────────────────
import type { Task, Workspace, TaskStatus } from "@/types/models";

// ── Components ───────────────────────────────────────────────────────────────
import TaskChatWindow from "@/components/TaskChatWindow.vue";
import WorkspaceAttitudeModal from "@/components/WorkspaceAttitudeModal.vue";

// ── State ────────────────────────────────────────────────────────────────────
const q = useQuasar();
const uiStore = useUiStore();
const taskStore = useTaskStore();

const selectedWorkspace = computed(() => taskStore.activeWorkspace);
const selectedTask = inject<Ref<Task | null>>("selectedTask", ref(null));

// Modal states for Task-as-a-Chat & Workspace Attitude
const showTaskChatModal = ref(false);
const showAttitudeModal = ref(false);

// Modal states for Prompt-Driven Task Creation
const showCreateTaskModal = ref(false);
const newTaskTitle = ref("");
const newTaskPrompt = ref("");
const newTaskCategory = ref("general");

const categoryOptions = [
  { label: "Generale / Operativo", value: "general" },
  { label: "Marketing & Lead Gen", value: "marketing" },
  { label: "Ricerca & Sourcing", value: "research" },
  { label: "Amministrazione & Email", value: "admin" },
  { label: "Sviluppo & Tech", value: "dev" },
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
        modelVersion: "gemini-1.5-flash",
        lastAnalyzed: new Date(),
      },
    });

    q.notify({
      type: "positive",
      message: "Task creato con successo! AgentePlanner in sottofondo per la scomposizione.",
      position: "top",
      icon: "smart_toy",
    });
    showCreateTaskModal.value = false;
  } catch (err) {
    q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Errore durante la creazione del task",
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
      message: "Stato sotto-task aggiornato",
      position: "top",
    });
  } catch {
    q.notify({
      type: "negative",
      message: "Errore durante l'aggiornamento della sotto-task",
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
      message: "Task aggiornato con successo",
      position: "top",
    });
    showEditTaskModal.value = false;
  } catch (err) {
    q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Errore durante l'aggiornamento del task",
      position: "top",
    });
  }
}; /*end confirmEditTask*/

const handleStatusChange = async (task: Task, status: TaskStatus): Promise<void> => {
  try {
    await taskStore.updateTaskStatus(task.workspaceId, task.id, status);
    q.notify({
      type: "positive",
      message: `Stato task aggiornato a ${status}`,
      position: "top",
    });
  } catch (err) {
    q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Errore durante il cambio di stato",
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
      message: "Task eliminato definitivamente",
      position: "top",
    });
    showDeleteTaskModal.value = false;
  } catch (err) {
    q.notify({
      type: "negative",
      message: err instanceof Error ? err.message : "Errore durante l'eliminazione del task",
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
          <div class="row items-center q-gutter-sm">
            <q-btn
              outline
              icon="psychology"
              label="Atteggiamento IA"
              no-caps
              color="amber-7"
              class="create-task-btn"
              :disabled="!selectedWorkspace"
              @click="showAttitudeModal = true"
            >
              <q-tooltip
                >Modifica il System Prompt ed il comportamento dell'IA per questo
                Workspace</q-tooltip
              >
            </q-btn>

            <q-btn
              icon="add"
              label="New Task (Prompt Guidato)"
              no-caps
              class="create-task-btn"
              :class="uiStore.darkMode ? 'dark-btn' : 'light-btn'"
              :disabled="!selectedWorkspace"
              @click="openCreateTaskModal"
            />
          </div>
        </div>
      </div>

      <!-- Default state: no workspace selected -->
      <div v-if="!selectedWorkspace" class="text-center q-pa-xl empty-state">
        <q-icon
          name="folder_open"
          size="72px"
          class="q-mb-md"
          :class="uiStore.darkMode ? 'text-gold' : 'text-navy'"
        />
        <h3 class="text-h5 text-weight-bold" :class="uiStore.darkMode ? 'text-white' : 'text-navy'">
          Seleziona un workspace per iniziare
        </h3>
        <p class="text-body1" :class="uiStore.darkMode ? 'text-slate-light' : 'text-slate-dark'">
          Scegli un workspace dal pannello sinistro o creane uno nuovo.
        </p>
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
                    <!-- Ispeziona Sotto-Task IA -->
                    <q-item clickable @click="selectTask(task)">
                      <q-item-section avatar>
                        <q-icon name="analytics" size="xs" color="secondary" />
                      </q-item-section>
                      <q-item-section>Ispeziona Sotto-Task IA</q-item-section>
                    </q-item>

                    <!-- Edit Task -->
                    <q-item clickable @click="openEditTaskModal(task)">
                      <q-item-section avatar>
                        <q-icon name="edit" size="xs" color="primary" />
                      </q-item-section>
                      <q-item-section>Modifica Task</q-item-section>
                    </q-item>

                    <!-- Change Status -->
                    <q-item clickable>
                      <q-item-section avatar>
                        <q-icon name="sync" size="xs" color="warning" />
                      </q-item-section>
                      <q-item-section>Cambia Stato</q-item-section>
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
                      <q-item-section>Elimina Task</q-item-section>
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
            <div v-if="task.aiMetadata" class="q-mb-md">
              <div class="row items-center justify-between text-caption q-mb-xs text-grey-7">
                <span>Complexity Score (AgentePlanner)</span>
                <span class="text-weight-bold">{{ task.aiMetadata.complexityScore || 5 }}/10</span>
              </div>
              <q-linear-progress
                :value="(task.aiMetadata.complexityScore || 5) / 10"
                color="amber-9"
                track-color="grey-4"
                style="height: 6px; border-radius: 3px"
              />
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

      <!-- Prompt-Driven Create Task Modal -->
      <q-dialog v-model="showCreateTaskModal" persistent backdrop-filter="blur(10px)">
        <q-card style="width: 480px; max-width: 90vw; border-radius: 20px" class="q-pa-md">
          <q-card-section>
            <div class="row items-center no-wrap">
              <q-avatar icon="smart_toy" color="primary" text-color="white" class="q-mr-md" />
              <div>
                <div class="text-h6 text-weight-bold text-navy">Nuovo Task Operativo per IA</div>
                <div class="text-caption text-grey-7">
                  Inserisci l'obiettivo: AgentePlanner lo scomporrà in sotto-task per te.
                </div>
              </div>
            </div>
          </q-card-section>

          <q-card-section class="q-pt-none">
            <q-input
              v-model="newTaskTitle"
              label="Titolo Task / Progetto"
              placeholder="Es: Campagna Outreach Clienti IT"
              outlined
              dense
              class="q-mb-md"
              autofocus
            />

            <q-select
              v-model="newTaskCategory"
              :options="categoryOptions"
              label="Categoria Operativa"
              outlined
              dense
              emit-value
              map-options
              class="q-mb-md"
            />

            <q-input
              v-model="newTaskPrompt"
              label="Prompt / Descrizione Obiettivo per l'Agente IA"
              placeholder="Es: Cercami prospect nel settore sanitario per soluzioni IT, genera le bozze email su Gmail e compila un foglio spese..."
              outlined
              dense
              type="textarea"
              rows="4"
            />
          </q-card-section>

          <q-card-actions align="right" class="q-pt-none">
            <q-btn v-close-popup flat label="Annulla" no-caps />
            <q-btn
              color="primary"
              icon="smart_toy"
              label="Crea & Attiva Agente IA"
              no-caps
              :disabled="!newTaskTitle.trim() || !newTaskPrompt.trim()"
              @click="confirmCreateTask"
            />
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
                  <div class="text-caption text-grey-7">Analisi & Scomposizione AgentePlanner</div>
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
            <div class="q-mb-md q-pa-sm bg-amber-1 rounded-borders">
              <div
                class="row items-center justify-between text-body2 text-weight-bold text-amber-10"
              >
                <span>Score Complessità Agente:</span>
                <span>{{ inspectorTask.aiMetadata?.complexityScore || 5 }} / 10</span>
              </div>
              <q-linear-progress
                :value="(inspectorTask.aiMetadata?.complexityScore || 5) / 10"
                color="amber-9"
                class="q-mt-xs"
                style="height: 8px; border-radius: 4px"
              />
            </div>

            <!-- SubTasks List Checklist -->
            <div class="text-subtitle2 text-weight-bold q-mb-xs text-navy">
              Sotto-Task Assegnate (AgentePlanner):
            </div>

            <div
              v-if="!inspectorTask.aiMetadata?.subtasks?.length"
              class="text-caption text-grey-7 q-my-sm"
            >
              ℹ️ L'AgentePlanner sta elaborando le sotto-task in background...
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
                <span class="text-weight-bold">Audit AgenteIspettore Superato</span>
              </div>
              <div class="text-caption q-mt-xs">
                {{ inspectorTask.aiMetadata.qualityAudit.summary }}
              </div>
            </div>
          </q-card-section>

          <q-card-actions align="right" class="q-pt-md">
            <q-btn color="primary" label="Chiudi Inspector" no-caps v-close-popup />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <!-- Edit Task Dialog -->
      <q-dialog v-model="showEditTaskModal" persistent>
        <q-card style="min-width: 400px; border-radius: 16px" class="q-pa-md">
          <q-card-section>
            <div class="text-h6 text-weight-bold text-navy">Modifica Task</div>
          </q-card-section>

          <q-card-section class="q-pt-none">
            <q-input
              v-model="editTaskTitle"
              label="Titolo Task"
              outlined
              dense
              class="q-mb-md"
              autofocus
            />
            <q-input
              v-model="editTaskDescription"
              label="Descrizione Task"
              outlined
              dense
              type="textarea"
              rows="3"
            />
          </q-card-section>

          <q-card-actions align="right">
            <q-btn v-close-popup flat label="Annulla" no-caps />
            <q-btn
              color="primary"
              label="Salva Modifiche"
              no-caps
              :disabled="!editTaskTitle.trim()"
              @click="confirmEditTask"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <!-- Delete Task Double-Confirmation Elite Dialog -->
      <q-dialog v-model="showDeleteTaskModal" persistent>
        <q-card style="min-width: 420px; border-radius: 16px" class="q-pa-md">
          <q-card-section>
            <div class="row items-center no-wrap">
              <q-icon name="warning" color="negative" size="md" class="q-mr-sm" />
              <div class="text-h6 text-weight-bold text-negative">Elimina Task</div>
            </div>
          </q-card-section>

          <q-card-section class="q-pt-none">
            <p class="text-body2 text-slate-dark q-mb-md">
              Questa azione è **irreversibile**. Per confermare l'eliminazione definitiva del task,
              digita il suo titolo esatto:
            </p>

            <div class="q-pa-sm bg-grey-2 rounded-borders text-weight-bold text-navy q-mb-md">
              {{ deletingTask?.title }}
            </div>

            <q-input
              v-model="confirmDeleteTitle"
              placeholder="Digita il titolo esatto del task"
              outlined
              dense
              autofocus
            />
          </q-card-section>

          <q-card-actions align="right">
            <q-btn v-close-popup flat label="Annulla" no-caps />
            <q-btn
              color="negative"
              label="Elimina Definitivamente"
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
}

.task-title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 80%;
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
</style>
