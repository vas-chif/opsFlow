/**
 * @file uiStore.ts
 * @description Global UI state management for theme and layout preferences
 * @author Vasile Chifeac
 * @created 2026-07-16
 * @modified 2026-07-29
 *
 * @notes
 * - Default option: Versione Giorno (Light Mode, paper canvas & navy)
 * - Dark mode preference persisted to localStorage as UI-only setting
 * - Uses Quasar Dark singleton for safe runtime theme toggling outside setup()
 *
 * @dependencies
 * - Pinia, Quasar (Dark)
 *
 * @performance
 * - <5ms toggle action
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { defineStore } from "pinia";
import { Dark } from "quasar";

export const useUiStore = defineStore("ui", {
  state: () => ({
    darkMode: false, // Default: Versione Giorno (Light Mode)
  }),

  actions: {
    initDarkMode(): void {
      const saved = localStorage.getItem("opsflow_darkMode");
      if (saved !== null) {
        this.darkMode = saved === "true";
      }
      Dark.set(this.darkMode);
    } /*end initDarkMode*/,

    toggleDarkMode(): void {
      this.darkMode = !this.darkMode;
      Dark.set(this.darkMode);
      localStorage.setItem("opsflow_darkMode", String(this.darkMode));
    } /*end toggleDarkMode*/,
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(/* acceptHMRUpdate */);
}
