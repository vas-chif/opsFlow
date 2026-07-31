/**
 * @file taskStore.ts
 * @description Pinia store for task management with tenant-isolated Firestore operations.
 * @author Vasile Chifeac
 * @created 2026-07-16
 * @modified 2026-07-16
 *
 * @notes
 * - Implements Config-Fenced pattern via useFirestore composable (masterChecklist §2.2)
 * - State acts as local cache for offline resilience (§5)
 * - All CRUD ops validated by Firestore Security Rules tenant isolation
 *
 * @dependencies
 * - pinia
 * - src/composables/useFirestore.ts
 * - src/types/models.ts
 *
 * @performance
 * - Firestore reads: 1 read per fetchTasks()
 * - Cache persistence in Pinia state (survives auth refresh)
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { defineStore, acceptHMRUpdate } from "pinia";

// ── Firebase ─────────────────────────────────────────────────────────────────
// (useFirestore handles all Firebase interactions)

// ── Types ────────────────────────────────────────────────────────────────────
import type {
  Task,
  TaskStatus,
  CreateTaskPayload,
  TaskAIMetadata,
  Workspace,
  CreateWorkspacePayload,
} from "@/types/models";

// ── Composables ──────────────────────────────────────────────────────────────
import { useFirestore } from "@/composables/useFirestore";

// ── Utils ────────────────────────────────────────────────────────────────────
// (none)

// ── Stores ───────────────────────────────────────────────────────────────────
// (none)

/**
 * Task store state interface.
 */
interface TaskState {
  tasks: Task[];
  workspaces: Workspace[];
  isLoading: boolean;
  error: string | null;
} /*end TaskState*/

/**
 * Default AI metadata for new tasks.
 * Applied when creating a task without aiMetadata.
 */
const DEFAULT_AI_METADATA: TaskAIMetadata = {
  complexityScore: 5,
  suggestedCategory: "general",
  confidence: 0.5,
  modelVersion: "manual",
  lastAnalyzed: null,
}; /*end DEFAULT_AI_METADATA*/

/**
 * Build complete AI metadata from partial input.
 */
function buildAIMetadata(metadata?: Partial<TaskAIMetadata>): TaskAIMetadata {
  return metadata
    ? {
        complexityScore: metadata.complexityScore ?? 5,
        suggestedCategory: metadata.suggestedCategory ?? "general",
        confidence: metadata.confidence ?? 0.5,
        modelVersion: metadata.modelVersion ?? "manual",
        lastAnalyzed: metadata.lastAnalyzed ?? null,
      }
    : DEFAULT_AI_METADATA;
} /*end buildAIMetadata*/

const WORKSPACES_CACHE_KEY = "opsflow_workspaces_cache";

function loadCachedWorkspaces(): Workspace[] {
  try {
    const raw = localStorage.getItem(WORKSPACES_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Workspace[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
} /*end loadCachedWorkspaces*/

function saveCachedWorkspaces(workspaces: Workspace[]): void {
  try {
    localStorage.setItem(WORKSPACES_CACHE_KEY, JSON.stringify(workspaces));
  } catch {
    // Ignore quota error
  }
} /*end saveCachedWorkspaces*/

export const useTaskStore = defineStore("tasks", {
  state: (): TaskState => ({
    tasks: [],
    workspaces: loadCachedWorkspaces(),
    isLoading: false,
    error: null,
  }),

  getters: {
    /**
     * Tasks not yet completed (pending + in-progress).
     * Used for task list view filtering.
     */
    pendingTasks: (state): Task[] => {
      return state.tasks.filter(
        (task) => task.status === "pending" || task.status === "in-progress",
      );
    },

    /**
     * Tasks marked as completed.
     * Used for completion history view.
     */
    completedTasks: (state): Task[] => {
      return state.tasks.filter((task) => task.status === "completed");
    },

    /**
     * Tasks assigned to a specific user.
     * Usage: const myTasks = storeToRefs(useTaskStore()).assignedTasks(taskId)
     */
    assignedTasks: (state) => {
      return (assigneeId: string): Task[] => {
        return state.tasks.filter((task) => task.assignedTo === assigneeId);
      };
    },
  },

  actions: {
    /**
     * Fetch all workspaces for the current tenant.
     */
    async fetchWorkspaces(): Promise<void> {
      const firestore = useFirestore();

      this.isLoading = true;
      this.error = null;

      try {
        const docs = await firestore.getTenantDocs<Workspace>(firestore.COLLECTIONS.WORKSPACES);
        this.workspaces = docs;
        saveCachedWorkspaces(docs);
      } catch (err) {
        this.error = err instanceof Error ? err.message : "Failed to fetch workspaces";
        throw err;
      } finally {
        this.isLoading = false;
      }
    } /*end fetchWorkspaces*/,

    /**
     * Fetch tasks for a specific workspace from nested collection tenants/{tenantId}/workspaces/{workspaceId}/tasks.
     * Also checks flat tasks collection for backwards compatibility.
     */
    async fetchWorkspaceTasks(workspaceId: string): Promise<void> {
      const firestore = useFirestore();

      this.isLoading = true;
      this.error = null;

      try {
        const nestedTasks = await firestore.getWorkspaceTaskDocs<Task>(workspaceId);
        const legacyTasks = await firestore.getTenantDocs<Task>(firestore.COLLECTIONS.TASKS);
        const filteredLegacy = legacyTasks.filter((t) => t.workspaceId === workspaceId);

        // Merge without duplicates
        const existingIds = new Set(nestedTasks.map((t) => t.id));
        const allTasks = [...nestedTasks];
        for (const lt of filteredLegacy) {
          if (!existingIds.has(lt.id)) {
            allTasks.push(lt);
          }
        }

        // Update local state for this workspace
        this.tasks = this.tasks.filter((t) => t.workspaceId !== workspaceId).concat(allTasks);
      } catch (err) {
        this.error = err instanceof Error ? err.message : "Failed to fetch workspace tasks";
        throw err;
      } finally {
        this.isLoading = false;
      }
    } /*end fetchWorkspaceTasks*/,

    /**
     * Fetch all tasks across workspaces.
     */
    async fetchTasks(): Promise<void> {
      const firestore = useFirestore();

      this.isLoading = true;
      this.error = null;

      try {
        if (this.workspaces.length === 0) {
          await this.fetchWorkspaces();
        }

        const taskPromises = this.workspaces.map((ws) =>
          firestore.getWorkspaceTaskDocs<Task>(ws.id),
        );
        const nestedResults = await Promise.all(taskPromises);
        const legacyTasks = await firestore.getTenantDocs<Task>(firestore.COLLECTIONS.TASKS);

        const allTasks: Task[] = [];
        const seenIds = new Set<string>();

        for (const list of nestedResults) {
          for (const t of list) {
            allTasks.push(t);
            seenIds.add(t.id);
          }
        }

        for (const lt of legacyTasks) {
          if (!seenIds.has(lt.id)) {
            allTasks.push(lt);
          }
        }

        this.tasks = allTasks;
      } catch (err) {
        this.error = err instanceof Error ? err.message : "Failed to fetch tasks";
        throw err;
      } finally {
        this.isLoading = false;
      }
    } /*end fetchTasks*/,

    /**
     * Create a new task inside a workspace nested collection.
     */
    async createTask(draft: CreateTaskPayload & { workspaceId: string }): Promise<string> {
      const firestore = useFirestore();

      this.isLoading = true;
      this.error = null;

      try {
        const aiMetadata = buildAIMetadata(draft.aiMetadata);
        const status = draft.status ?? "pending";
        const assignedTo = draft.assignedTo ?? null;

        const taskId = await firestore.addWorkspaceTaskDoc<
          Omit<Task, "id" | "createdAt" | "updatedAt">
        >(draft.workspaceId, {
          title: draft.title,
          description: draft.description,
          workspaceId: draft.workspaceId,
          status,
          assignedTo,
          aiMetadata,
        });

        const newTask: Task = {
          title: draft.title,
          description: draft.description,
          workspaceId: draft.workspaceId,
          status,
          assignedTo,
          aiMetadata,
          id: taskId,
          tenantId: "",
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Task;

        this.tasks.push(newTask);
        return taskId;
      } catch (err) {
        this.error = err instanceof Error ? err.message : "Failed to create task";
        throw err;
      } finally {
        this.isLoading = false;
      }
    } /*end createTask*/,

    /**
     * Update task status in Firestore workspace collection.
     */
    async updateTaskStatus(workspaceId: string, taskId: string, status: TaskStatus): Promise<void> {
      const firestore = useFirestore();

      this.isLoading = true;
      this.error = null;

      try {
        await firestore.updateWorkspaceTaskDoc(workspaceId, taskId, { status });

        const task = this.tasks.find((t) => t.id === taskId);
        if (task) {
          task.status = status;
          task.updatedAt = new Date();
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : "Failed to update task status";
        throw err;
      } finally {
        this.isLoading = false;
      }
    } /*end updateTaskStatus*/,

    /**
     * Move a task from source workspace to target workspace.
     */
    async moveTask(
      taskId: string,
      sourceWorkspaceId: string,
      targetWorkspaceId: string,
    ): Promise<void> {
      const firestore = useFirestore();

      this.isLoading = true;
      this.error = null;

      try {
        await firestore.moveWorkspaceTaskDoc(sourceWorkspaceId, targetWorkspaceId, taskId);

        const task = this.tasks.find((t) => t.id === taskId);
        if (task) {
          task.workspaceId = targetWorkspaceId;
          task.updatedAt = new Date();
        }

        // Remove from local tasks list if currently viewing source workspace
        this.tasks = this.tasks.filter(
          (t) => t.workspaceId !== sourceWorkspaceId || t.id !== taskId,
        );
      } catch (err) {
        this.error = err instanceof Error ? err.message : "Failed to move task";
        throw err;
      } finally {
        this.isLoading = false;
      }
    } /*end moveTask*/,

    /**
     * Update the dynamic system prompt (AI attitude) of a Workspace.
     */
    async updateWorkspacePrompt(workspaceId: string, systemPrompt: string): Promise<void> {
      const firestore = useFirestore();

      this.isLoading = true;
      this.error = null;

      try {
        await firestore.updateTenantDoc(firestore.COLLECTIONS.WORKSPACES, workspaceId, {
          systemPrompt,
        });

        const ws = this.workspaces.find((w) => w.id === workspaceId);
        if (ws) {
          ws.systemPrompt = systemPrompt;
          ws.updatedAt = new Date();
        }
        saveCachedWorkspaces(this.workspaces);
      } catch (err) {
        this.error = err instanceof Error ? err.message : "Failed to update workspace prompt";
        throw err;
      } finally {
        this.isLoading = false;
      }
    } /*end updateWorkspacePrompt*/,

    /**
     * Update task details (title, description) in Firestore workspace collection.
     */
    async updateTask(workspaceId: string, taskId: string, updates: Partial<Task>): Promise<void> {
      const firestore = useFirestore();

      this.isLoading = true;
      this.error = null;

      try {
        await firestore.updateWorkspaceTaskDoc(workspaceId, taskId, updates);

        const task = this.tasks.find((t) => t.id === taskId);
        if (task) {
          Object.assign(task, updates);
          task.updatedAt = new Date();
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : "Failed to update task";
        throw err;
      } finally {
        this.isLoading = false;
      }
    } /*end updateTask*/,

    /**
     * Delete a task from Firestore workspace collection.
     */
    async deleteTask(workspaceId: string, taskId: string): Promise<void> {
      const firestore = useFirestore();

      this.isLoading = true;
      this.error = null;

      try {
        await firestore.deleteWorkspaceTaskDoc(workspaceId, taskId);
        this.tasks = this.tasks.filter((t) => t.id !== taskId);
      } catch (err) {
        this.error = err instanceof Error ? err.message : "Failed to delete task";
        throw err;
      } finally {
        this.isLoading = false;
      }
    } /*end deleteTask*/,

    /**
     * Create a new workspace.
     * Auto-injects tenantId via addTenantDoc.
     */
    async createWorkspace(draft: CreateWorkspacePayload): Promise<string> {
      const firestore = useFirestore();

      this.isLoading = true;
      this.error = null;

      try {
        const workspaceData: Omit<Workspace, "id" | "createdAt" | "updatedAt"> = {
          name: draft.name,
          description: draft.description ?? "",
          tenantId: "",
        };
        if (draft.icon !== undefined) {
          workspaceData.icon = draft.icon;
        }

        const workspaceId = await firestore.addTenantDoc<
          Omit<Workspace, "id" | "createdAt" | "updatedAt">
        >(firestore.COLLECTIONS.WORKSPACES, workspaceData);

        const newWorkspace: Workspace = {
          id: workspaceId,
          name: draft.name,
          description: draft.description ?? "",
          tenantId: "",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        if (draft.icon !== undefined) {
          newWorkspace.icon = draft.icon;
        }

        this.workspaces.push(newWorkspace);
        saveCachedWorkspaces(this.workspaces);
        return workspaceId;
      } catch (err) {
        this.error = err instanceof Error ? err.message : "Failed to create workspace";
        throw err;
      } finally {
        this.isLoading = false;
      }
    } /*end createWorkspace*/,
    /**
     * Update workspace in Firestore and optimistic local cache.
     */
    async updateWorkspace(workspaceId: string, updates: Partial<Workspace>): Promise<void> {
      const firestore = useFirestore();

      this.isLoading = true;
      this.error = null;

      try {
        await firestore.updateTenantDoc(firestore.COLLECTIONS.WORKSPACES, workspaceId, updates);

        const ws = this.workspaces.find((w) => w.id === workspaceId);
        if (ws) {
          Object.assign(ws, updates);
          ws.updatedAt = new Date();
          saveCachedWorkspaces(this.workspaces);
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : "Failed to update workspace";
        throw err;
      } finally {
        this.isLoading = false;
      }
    } /*end updateWorkspace*/,

    /**
     * Delete workspace from Firestore and local cache.
     */
    async deleteWorkspace(workspaceId: string): Promise<void> {
      const firestore = useFirestore();

      this.isLoading = true;
      this.error = null;

      try {
        await firestore.deleteTenantDoc(firestore.COLLECTIONS.WORKSPACES, workspaceId);
        this.workspaces = this.workspaces.filter((w) => w.id !== workspaceId);
        saveCachedWorkspaces(this.workspaces);
      } catch (err) {
        this.error = err instanceof Error ? err.message : "Failed to delete workspace";
        throw err;
      } finally {
        this.isLoading = false;
      }
    } /*end deleteWorkspace*/,

    /**
     * Clear error state.
     * Call from component when snackbar is dismissed.
     */
    clearError(): void {
      this.error = null;
    } /*end clearError*/,
  },
});

// HMR support for development
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useTaskStore, import.meta.hot));
}
