/**
 * @file useFloatingWindowManager.ts
 * @description Shared composable for managing z-index layering, bring-to-front, and send-to-back across all floating modal windows.
 * @author Vasile Chifeac
 * @created 2026-09-24
 * @modified 2026-09-24
 *
 * @notes
 * - Coordinates z-index hierarchy between task chat windows and operational modals.
 * - Pure reactive state without external dependencies.
 *
 * @dependencies
 * - Vue reactive & ref
 *
 * @performance
 * - O(1) z-index updates with zero DOM or Firestore overhead (<0.1ms).
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { reactive, ref } from "vue";

// ── Types ────────────────────────────────────────────────────────────────────
export interface FloatingWindowMeta {
  id: string;
  title: string;
  icon?: string;
  iconColor?: string;
  isMinimized: boolean;
  focus: () => void;
  toggleMinimize: () => void;
  close: () => void;
}

// ── State ────────────────────────────────────────────────────────────────────
const zIndexMap = reactive<Record<string, number>>({});
const registeredWindows = reactive<Record<string, FloatingWindowMeta>>({});
const globalHighestZ = ref(1000);

export function useFloatingWindowManager() {
  /**
   * Registers an open floating window in the global dock registry.
   */
  function registerWindow(meta: FloatingWindowMeta): void {
    registeredWindows[meta.id] = meta;
  } /*end registerWindow*/

  /**
   * Updates state (e.g. minimized) of a registered window.
   */
  function updateWindowState(id: string, updates: Partial<FloatingWindowMeta>): void {
    const target = registeredWindows[id];
    if (target) {
      Object.assign(target, updates);
    }
  } /*end updateWindowState*/

  /**
   * Brings the specified window to the front of all floating windows.
   */
  function bringToFront(windowId: string): number {
    globalHighestZ.value += 1;
    zIndexMap[windowId] = globalHighestZ.value;
    return globalHighestZ.value;
  } /*end bringToFront*/

  /**
   * Sends the specified window behind other floating windows.
   */
  function sendToBack(windowId: string): number {
    const existingValues = Object.values(zIndexMap);
    const lowest = existingValues.length > 0 ? Math.min(...existingValues) : 1000;
    const newZ = Math.max(10, lowest - 1);
    zIndexMap[windowId] = newZ;
    return newZ;
  } /*end sendToBack*/

  /**
   * Gets the current z-index for a window or initializes it.
   */
  function getZIndex(windowId: string, initialDefault = 1000): number {
    if (zIndexMap[windowId] === undefined) {
      globalHighestZ.value += 1;
      zIndexMap[windowId] = Math.max(initialDefault, globalHighestZ.value);
    }
    return zIndexMap[windowId] ?? initialDefault;
  } /*end getZIndex*/

  /**
   * Removes a window from the registry and z-index map upon closing.
   */
  function unregisterWindow(windowId: string): void {
    delete zIndexMap[windowId];
    delete registeredWindows[windowId];
  } /*end unregisterWindow*/

  return {
    globalHighestZ,
    registeredWindows,
    registerWindow,
    updateWindowState,
    bringToFront,
    sendToBack,
    getZIndex,
    unregisterWindow,
  };
} /*end useFloatingWindowManager*/
