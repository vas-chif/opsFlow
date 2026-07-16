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
  TaskAIMetadata
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
  lastAnalyzed: null
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
        lastAnalyzed: metadata.lastAnalyzed ?? null
      }
    : DEFAULT_AI_METADATA;
} /*end buildAIMetadata*/

export const useTaskStore = defineStore("tasks", {
  state: (): TaskState => ({
    tasks: [],
    isLoading: false,
    error: null
  }),

  getters: {
    /**
     * Tasks not yet completed (pending + in-progress).
     * Used for task list view filtering.
     */
    pendingTasks: (state): Task[] => {
      return state.tasks.filter(
        task => task.status === "pending" || task.status === "in-progress"
      );
    },

    /**
     * Tasks marked as completed.
     * Used for completion history view.
     */
    completedTasks: (state): Task[] => {
      return state.tasks.filter(task => task.status === "completed");
    },

    /**
     * Tasks assigned to a specific user.
     * Usage: const myTasks = storeToRefs(useTaskStore()).assignedTasks(taskId)
     */
    assignedTasks: state => {
      return (assigneeId: string): Task[] => {
        return state.tasks.filter(task => task.assignedTo === assigneeId);
      };
    }
  },

  actions: {
    /**
     * Fetch all tasks for the current tenant.
     * Uses getTenantDocs for tenant-scoped query (0 extra reads for tenant validation).
     */
    async fetchTasks(): Promise<void> {
      const firestore = useFirestore();

      this.isLoading = true;
      this.error = null;

      try {
        this.tasks = await firestore.getTenantDocs<Task>(
          firestore.COLLECTIONS.TASKS
        );
      } catch (err) {
        this.error =
          err instanceof Error ? err.message : "Failed to fetch tasks";
        throw err;
      } finally {
        this.isLoading = false;
      }
    } /*end fetchTasks*/,

    /**
     * Create a new task in Firestore.
     * Auto-injects tenantId, timestamps, and default AI metadata via addTenantDoc.
     */
    async createTask(draft: CreateTaskPayload): Promise<string> {
      const firestore = useFirestore();

      this.isLoading = true;
      this.error = null;

      try {
        const aiMetadata = buildAIMetadata(draft.aiMetadata);
        const status = draft.status ?? "pending";
        const assignedTo = draft.assignedTo ?? null;

        const taskId = await firestore.addTenantDoc<
          Omit<Task, "id" | "createdAt" | "updatedAt">
        >(firestore.COLLECTIONS.TASKS, {
          title: draft.title,
          description: draft.description,
          status,
          assignedTo,
          aiMetadata
        });

        // Optimistic cache update (Firestore-first write already happened)
        const newTask: Task = {
          title: draft.title,
          description: draft.description,
          status,
          assignedTo,
          aiMetadata,
          id: taskId,
          tenantId: "", // Will be set by Firestore server-side
          createdAt: new Date(),
          updatedAt: new Date()
        } as Task;

        this.tasks.push(newTask);
        return taskId;
      } catch (err) {
        this.error =
          err instanceof Error ? err.message : "Failed to create task";
        throw err;
      } finally {
        this.isLoading = false;
      }
    } /*end createTask*/,

    /**
     * Update task status in Firestore.
     * Persists change and updates local cache optimistically.
     */
    async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
      const firestore = useFirestore();

      this.isLoading = true;
      this.error = null;

      try {
        await firestore.updateTenantDoc(firestore.COLLECTIONS.TASKS, taskId, {
          status
        });

        // Optimistic state update
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
          task.status = status;
          task.updatedAt = new Date();
        }
      } catch (err) {
        this.error =
          err instanceof Error ? err.message : "Failed to update task status";
        throw err;
      } finally {
        this.isLoading = false;
      }
    } /*end updateTaskStatus*/,

    /**
     * Delete a task from Firestore.
     * Removes from local cache after successful deletion.
     */
    async deleteTask(taskId: string): Promise<void> {
      const firestore = useFirestore();

      this.isLoading = true;
      this.error = null;

      try {
        await firestore.deleteTenantDoc(firestore.COLLECTIONS.TASKS, taskId);

        // Optimistic cache removal
        this.tasks = this.tasks.filter(t => t.id !== taskId);
      } catch (err) {
        this.error =
          err instanceof Error ? err.message : "Failed to delete task";
        throw err;
      } finally {
        this.isLoading = false;
      }
    } /*end deleteTask*/,

    /**
     * Clear error state.
     * Call from component when snackbar is dismissed.
     */
    clearError(): void {
      this.error = null;
    } /*end clearError*/
  }
});

// HMR support for development
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useTaskStore, import.meta.hot));
}
