/**
 * @file taskChatStore.ts
 * @description Decoupled Pinia store for Multi-Window & Multi-Task Chat Sessions in OpsFlow.
 * @author Vasile Chifeac
 * @created 2026-07-30
 *
 * @notes
 * - "Chat is Data, Not a Component" Architecture.
 * - Map<taskId, ChatSession> supports N simultaneous task chat sessions.
 * - Allows mounting task chat in drawers, floating modals, or parallel split panels.
 */

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { Task, TaskChatMessage } from "../types/models";

export interface ChatSession {
  taskId: string;
  workspaceId: string;
  task: Task | null;
  messages: TaskChatMessage[];
  isLoading: boolean;
  isAgentTyping: boolean;
  inputDraft: string;
  error: string | null;
  _unsubscribeMessages?: () => void;
}

export interface FloatingWindow {
  id: string;
  taskId: string;
  workspaceId: string;
  task: Task;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  isMinimized: boolean;
}

export const useTaskChatStore = defineStore("taskChat", () => {
  // Map of active chat sessions keyed by taskId
  const sessions = ref<Map<string, ChatSession>>(new Map());

  // Primary active session (e.g. displayed in Main Right Drawer)
  const primarySessionId = ref<string | null>(null);

  // Array of parallel session taskIds (e.g. multi-panel split view)
  const parallelSessionIds = ref<string[]>([]);

  // Array of open draggable/resizable floating windows
  const floatingWindows = ref<FloatingWindow[]>([]);
  const highestZIndex = ref(1000);

  const primarySession = computed(() => {
    if (!primarySessionId.value) return null;
    return sessions.value.get(primarySessionId.value) ?? null;
  });

  /**
   * Opens or retrieves an existing ChatSession for a given taskId.
   * @param {string} taskId - Target task ID
   * @param {string} workspaceId - Target workspace ID
   * @returns {ChatSession} The active chat session
   */
  function openSession(taskId: string, workspaceId: string): ChatSession {
    const existing = sessions.value.get(taskId);
    if (existing) {
      return existing;
    }
    const newSession: ChatSession = {
      taskId,
      workspaceId,
      task: null,
      messages: [],
      isLoading: false,
      isAgentTyping: false,
      inputDraft: "",
      error: null,
    };
    sessions.value.set(taskId, newSession);
    return newSession;
  } /*end openSession*/

  /**
   * Closes a ChatSession and cleans up subscriptions.
   * @param {string} taskId - Target task ID to close
   */
  function closeSession(taskId: string): void {
    const s = sessions.value.get(taskId);
    if (s) {
      s._unsubscribeMessages?.();
      sessions.value.delete(taskId);
    }
    if (primarySessionId.value === taskId) {
      primarySessionId.value = null;
    }
    parallelSessionIds.value = parallelSessionIds.value.filter((id) => id !== taskId);
  } /*end closeSession*/

  /**
   * Appends a message to a task session.
   * @param {string} taskId - Target task ID
   * @param {TaskChatMessage} msg - Message to append
   */
  function appendMessage(taskId: string, msg: TaskChatMessage): void {
    const s = sessions.value.get(taskId);
    if (s) {
      s.messages.push(msg);
    }
  } /*end appendMessage*/

  /**
   * Sets typing state for an agent on a task.
   * @param {string} taskId - Target task ID
   * @param {boolean} typing - Is agent typing
   */
  function setAgentTyping(taskId: string, typing: boolean): void {
    const s = sessions.value.get(taskId);
    if (s) {
      s.isAgentTyping = typing;
    }
  } /*end setAgentTyping*/

  /**
   * Sets the primary active session ID.
   * @param {string | null} taskId - Primary task ID
   */
  function setPrimary(taskId: string | null): void {
    primarySessionId.value = taskId;
  } /*end setPrimary*/

  /**
   * Adds a session to the parallel multi-panel view.
   * @param {string} taskId - Target task ID
   */
  function addParallelSession(taskId: string): void {
    if (!parallelSessionIds.value.includes(taskId)) {
      parallelSessionIds.value.push(taskId);
    }
  } /*end addParallelSession*/

  /**
   * Opens or focuses a floating task chat window.
   */
  function openFloatingWindow(task: Task, workspaceId: string): FloatingWindow {
    openSession(task.id, workspaceId);

    const existing = floatingWindows.value.find((w) => w.taskId === task.id);
    if (existing) {
      highestZIndex.value += 1;
      existing.zIndex = highestZIndex.value;
      existing.isMinimized = false;
      return existing;
    }

    highestZIndex.value += 1;
    const count = floatingWindows.value.length;
    const initialX = Math.min(window.innerWidth - 650, 120 + (count % 4) * 45);
    const initialY = Math.min(window.innerHeight - 500, 70 + (count % 4) * 35);

    const newWin: FloatingWindow = {
      id: `win-${task.id}`,
      taskId: task.id,
      workspaceId,
      task,
      position: { x: Math.max(20, initialX), y: Math.max(20, initialY) },
      size: { width: 680, height: 480 },
      zIndex: highestZIndex.value,
      isMinimized: false,
    };

    floatingWindows.value.push(newWin);
    return newWin;
  } /*end openFloatingWindow*/

  function closeFloatingWindow(taskId: string): void {
    floatingWindows.value = floatingWindows.value.filter((w) => w.taskId !== taskId);
  } /*end closeFloatingWindow*/

  function bringToFront(taskId: string): void {
    const win = floatingWindows.value.find((w) => w.taskId === taskId);
    if (win) {
      highestZIndex.value += 1;
      win.zIndex = highestZIndex.value;
    }
  } /*end bringToFront*/

  function updateWindowPosition(taskId: string, pos: { x: number; y: number }): void {
    const win = floatingWindows.value.find((w) => w.taskId === taskId);
    if (win) {
      win.position = pos;
    }
  } /*end updateWindowPosition*/

  function updateWindowSize(taskId: string, size: { width: number; height: number }): void {
    const win = floatingWindows.value.find((w) => w.taskId === taskId);
    if (win) {
      win.size = size;
    }
  } /*end updateWindowSize*/

  function toggleMinimizeWindow(taskId: string): void {
    const win = floatingWindows.value.find((w) => w.taskId === taskId);
    if (win) {
      win.isMinimized = !win.isMinimized;
    }
  } /*end toggleMinimizeWindow*/

  return {
    sessions,
    primarySessionId,
    parallelSessionIds,
    floatingWindows,
    highestZIndex,
    primarySession,
    openSession,
    closeSession,
    appendMessage,
    setAgentTyping,
    setPrimary,
    addParallelSession,
    openFloatingWindow,
    closeFloatingWindow,
    bringToFront,
    updateWindowPosition,
    updateWindowSize,
    toggleMinimizeWindow,
  };
});
