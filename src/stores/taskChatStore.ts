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

export const useTaskChatStore = defineStore("taskChat", () => {
  // Map of active chat sessions keyed by taskId
  const sessions = ref<Map<string, ChatSession>>(new Map());

  // Primary active session (e.g. displayed in Main Right Drawer)
  const primarySessionId = ref<string | null>(null);

  // Array of parallel session taskIds (e.g. multi-panel split view)
  const parallelSessionIds = ref<string[]>([]);

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

  return {
    sessions,
    primarySessionId,
    parallelSessionIds,
    primarySession,
    openSession,
    closeSession,
    appendMessage,
    setAgentTyping,
    setPrimary,
    addParallelSession,
  };
});
