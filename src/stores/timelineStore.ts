/**
 * @file timelineStore.ts
 * @description Local Pinia store for Task Timeline UI state and layout preferences
 * @author Vasile Chifeac
 * @created 2026-09-09
 * @modified 2026-09-09
 *
 * @notes
 * - Default state: CLOSED (showTimeline = false, maximizes chat canvas)
 * - State persisted to localStorage (opsflow_timeline_ui_state)
 * - Manages splitter ratio, layout density, and side orientation
 *
 * @dependencies
 * - Pinia
 *
 * @performance
 * - Instant reactive state (<1ms) with zero cloud overhead (€0.00)
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { defineStore } from "pinia";

export type TimelineLayout = "dense" | "comfortable" | "loose";
export type TimelineSide = "right" | "left";

interface TimelineState {
  showTimeline: boolean;
  savedSplitterRatio: number;
  timelineLayout: TimelineLayout;
  timelineSide: TimelineSide;
}

const STORAGE_KEY = "opsflow_timeline_ui_state";

function loadPersistedState(): Partial<TimelineState> {
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

function persistState(state: TimelineState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota or disabled storage
  }
} /*end persistState*/

export const useTimelineStore = defineStore("timeline", {
  state: (): TimelineState => {
    const persisted = loadPersistedState();
    return {
      // Default: CLOSED as requested by user
      showTimeline: persisted.showTimeline ?? false,
      savedSplitterRatio: persisted.savedSplitterRatio ?? 62,
      timelineLayout: persisted.timelineLayout ?? "dense",
      timelineSide: persisted.timelineSide ?? "right",
    };
  },

  actions: {
    toggleTimeline(): void {
      this.showTimeline = !this.showTimeline;
      persistState(this.$state);
    } /*end toggleTimeline*/,

    setShowTimeline(val: boolean): void {
      this.showTimeline = val;
      persistState(this.$state);
    } /*end setShowTimeline*/,

    setSplitterRatio(ratio: number): void {
      if (ratio > 0 && ratio < 100) {
        this.savedSplitterRatio = ratio;
        persistState(this.$state);
      }
    } /*end setSplitterRatio*/,

    setTimelineLayout(layout: TimelineLayout): void {
      this.timelineLayout = layout;
      persistState(this.$state);
    } /*end setTimelineLayout*/,

    setTimelineSide(side: TimelineSide): void {
      this.timelineSide = side;
      persistState(this.$state);
    } /*end setTimelineSide*/,
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(/* acceptHMRUpdate */);
}
