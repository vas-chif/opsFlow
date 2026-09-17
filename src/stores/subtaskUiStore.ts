/**
 * @file subtaskUiStore.ts
 * @description Local Pinia store for SubTaskEntityModal UI preferences (split layout, mini-tasks checklist visibility, timeline collapse)
 * @author Vasile Chifeac
 * @created 2026-09-14
 * @modified 2026-09-14
 *
 * @notes
 * - Manages persistent UI states for the polymorphic SubTask modal.
 * - By default, mini-tasks checklist is compact/closed to optimize small screens.
 * - State persisted client-side to localStorage (opsflow_subtask_ui_state).
 * - Zero cloud/Firestore reads (€0.00 cost per §5 AGENTS.md).
 *
 * @dependencies
 * - Pinia
 *
 * @performance
 * - Instant reactive state (<1ms) with zero network overhead.
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { defineStore } from "pinia";

interface SubtaskUiState {
  isTimelineExpanded: boolean;
  isMiniTasksExpanded: boolean;
  splitterRatio: number;
}

const STORAGE_KEY = "opsflow_subtask_ui_state";

function loadPersistedState(): Partial<SubtaskUiState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // Fallback on parse failure
  }
  return {};
} /*end loadPersistedState*/

function persistState(state: SubtaskUiState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota or disabled storage
  }
} /*end persistState*/

export const useSubtaskUiStore = defineStore("subtaskUi", {
  state: (): SubtaskUiState => {
    const persisted = loadPersistedState();
    return {
      isTimelineExpanded: persisted.isTimelineExpanded ?? true,
      // Default: CLOSED as requested, persisted once toggled
      isMiniTasksExpanded: persisted.isMiniTasksExpanded ?? false,
      splitterRatio: persisted.splitterRatio ?? 52,
    };
  },

  actions: {
    toggleMiniTasks(): void {
      this.isMiniTasksExpanded = !this.isMiniTasksExpanded;
      persistState(this.$state);
    } /*end toggleMiniTasks*/,

    setMiniTasksExpanded(val: boolean): void {
      this.isMiniTasksExpanded = val;
      persistState(this.$state);
    } /*end setMiniTasksExpanded*/,

    toggleTimeline(): void {
      this.isTimelineExpanded = !this.isTimelineExpanded;
      persistState(this.$state);
    } /*end toggleTimeline*/,

    setTimelineExpanded(val: boolean): void {
      this.isTimelineExpanded = val;
      persistState(this.$state);
    } /*end setTimelineExpanded*/,

    setSplitterRatio(ratio: number): void {
      if (ratio >= 30 && ratio <= 70) {
        this.splitterRatio = ratio;
        persistState(this.$state);
      }
    } /*end setSplitterRatio*/,
  },
});

if (import.meta.hot) {
  import.meta.hot.accept();
}
