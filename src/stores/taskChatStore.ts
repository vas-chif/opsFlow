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
import type {
  Task,
  TaskChatMessage,
  ApprovalRecord,
  TaskKeyPoint,
  TaskTimelineEvent,
} from "../types/models";

export interface ChatSession {
  taskId: string;
  workspaceId: string;
  task: Task | null;
  messages: TaskChatMessage[];
  timelineEvents: TaskTimelineEvent[];
  approvals: ApprovalRecord[];
  isLoading: boolean;
  isAgentTyping: boolean;
  inputDraft: string;
  error: string | null;
  oauthError: import("../types/models").OAuthError | null;
  _unsubscribeMessages?: () => void;
  _unsubscribeApprovals?: () => void;
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
  isFullscreen?: boolean;
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

  // Map of key points per taskId (UI Working Memory — Rolling Summary)
  const keyPointsMap = ref<Map<string, TaskKeyPoint[]>>(new Map());

  const primarySession = computed(() => {
    if (!primarySessionId.value) return null;
    return sessions.value.get(primarySessionId.value) ?? null;
  });

  /**
   * Helper to load persisted chat messages from localStorage.
   */
  function loadMessagesFromStorage(taskId: string): TaskChatMessage[] {
    try {
      const raw = localStorage.getItem(`opsflow_task_chat_${taskId}`);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {
      // Ignore storage error
    }
    return [];
  } /*end loadMessagesFromStorage*/

  /**
   * Helper to save chat messages to localStorage.
   */
  function saveMessagesToStorage(taskId: string, msgs: TaskChatMessage[]): void {
    try {
      localStorage.setItem(`opsflow_task_chat_${taskId}`, JSON.stringify(msgs));
    } catch {
      // Ignore storage error
    }
  } /*end saveMessagesToStorage*/

  /**
   * Helper to load persisted timeline events from localStorage.
   */
  function loadTimelineFromStorage(taskId: string): TaskTimelineEvent[] {
    try {
      const raw = localStorage.getItem(`opsflow_task_timeline_${taskId}`);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {
      // Ignore storage error
    }
    return [];
  } /*end loadTimelineFromStorage*/

  /**
   * Helper to save timeline events to localStorage.
   */
  function saveTimelineToStorage(taskId: string, events: TaskTimelineEvent[]): void {
    try {
      localStorage.setItem(`opsflow_task_timeline_${taskId}`, JSON.stringify(events));
    } catch {
      // Ignore storage error
    }
  } /*end saveTimelineToStorage*/

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
    const savedMessages = loadMessagesFromStorage(taskId);
    const savedTimeline = loadTimelineFromStorage(taskId);
    const newSession: ChatSession = {
      taskId,
      workspaceId,
      task: null,
      messages: savedMessages,
      timelineEvents: savedTimeline,
      approvals: [],
      isLoading: false,
      isAgentTyping: false,
      inputDraft: "",
      error: null,
      oauthError: null,
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
      s._unsubscribeApprovals?.();
      sessions.value.delete(taskId);
    }
    if (primarySessionId.value === taskId) {
      primarySessionId.value = null;
    }
    parallelSessionIds.value = parallelSessionIds.value.filter((id) => id !== taskId);
  } /*end closeSession*/

  /**
   * Appends a message to a task session and persists to storage.
   * @param {string} taskId - Target task ID
   * @param {TaskChatMessage} msg - Message to append
   */
  function appendMessage(taskId: string, msg: TaskChatMessage): void {
    const s = sessions.value.get(taskId);
    if (s) {
      s.messages.push(msg);
      saveMessagesToStorage(taskId, s.messages);
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
      const idx = floatingWindows.value.indexOf(existing);
      if (idx > -1 && idx !== floatingWindows.value.length - 1) {
        floatingWindows.value.splice(idx, 1);
        floatingWindows.value.push(existing);
      }
      return existing;
    }

    highestZIndex.value += 1;
    const count = floatingWindows.value.length;
    const targetWidth = Math.min(920, Math.max(760, window.innerWidth - 60));
    const targetHeight = Math.min(580, Math.max(460, window.innerHeight - 80));
    const initialX = Math.min(window.innerWidth - targetWidth - 20, 80 + (count % 4) * 35);
    const initialY = Math.min(window.innerHeight - targetHeight - 20, 60 + (count % 4) * 30);

    const newWin: FloatingWindow = {
      id: `win-${task.id}`,
      taskId: task.id,
      workspaceId,
      task,
      position: { x: Math.max(15, initialX), y: Math.max(15, initialY) },
      size: { width: targetWidth, height: targetHeight },
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
      const idx = floatingWindows.value.indexOf(win);
      if (idx > -1 && idx !== floatingWindows.value.length - 1) {
        floatingWindows.value.splice(idx, 1);
        floatingWindows.value.push(win);
      }
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

  function toggleFullscreenWindow(taskId: string): void {
    const win = floatingWindows.value.find((w) => w.taskId === taskId);
    if (win) {
      win.isFullscreen = !win.isFullscreen;
      if (win.isFullscreen) {
        highestZIndex.value += 1;
        win.zIndex = highestZIndex.value;
        const idx = floatingWindows.value.indexOf(win);
        if (idx > -1 && idx !== floatingWindows.value.length - 1) {
          floatingWindows.value.splice(idx, 1);
          floatingWindows.value.push(win);
        }
      }
    }
  } /*end toggleFullscreenWindow*/

  function sendToBack(taskId: string): void {
    const win = floatingWindows.value.find((w) => w.taskId === taskId);
    if (win) {
      const lowestZ = Math.min(...floatingWindows.value.map((w) => w.zIndex));
      win.zIndex = Math.max(10, lowestZ - 1);
      const idx = floatingWindows.value.indexOf(win);
      if (idx > 0) {
        floatingWindows.value.splice(idx, 1);
        floatingWindows.value.unshift(win);
      }
      const otherWins = floatingWindows.value.filter((w) => w.taskId !== taskId);
      if (otherWins.length > 0) {
        const topOther = otherWins[otherWins.length - 1]!;
        highestZIndex.value += 1;
        topOther.zIndex = highestZIndex.value;
      }
    }
  } /*end sendToBack*/

  function appendTimelineEvent(taskId: string, event: TaskTimelineEvent): void {
    const s = sessions.value.get(taskId);
    if (s) {
      if (!s.timelineEvents.some((e) => e.id === event.id)) {
        s.timelineEvents.push(event);
        saveTimelineToStorage(taskId, s.timelineEvents);
      }
    }
  } /*end appendTimelineEvent*/

  function updateTimelineEventNote(
    taskId: string,
    eventId: string,
    note?: string,
    showNote?: boolean,
  ): void {
    const s = sessions.value.get(taskId);
    if (s) {
      const ev = s.timelineEvents.find((e) => e.id === eventId);
      if (ev) {
        if (note !== undefined) {
          ev.note = note.trim();
        }
        if (showNote !== undefined) {
          ev.showNote = showNote;
        }
        saveTimelineToStorage(taskId, s.timelineEvents);
      }
    }
  } /*end updateTimelineEventNote*/

  /**
   * Appends or updates an ApprovalRecord in the session.
   * Called by the Firestore onSnapshot listener for /approvals/.
   * @param {string} taskId - Target task ID
   * @param {ApprovalRecord} approval - Approval record from Firestore
   */
  function appendApproval(taskId: string, approval: ApprovalRecord): void {
    const s = sessions.value.get(taskId);
    if (!s) return;
    const idx = s.approvals.findIndex((a) => a.id === approval.id);
    if (idx >= 0) {
      s.approvals.splice(idx, 1, approval);
    } else {
      s.approvals.push(approval);
    }
  } /*end appendApproval*/

  /**
   * Marks an approval as approved or rejected in the local session store.
   * Called optimistically when the user clicks Approve/Reject before backend confirms.
   * @param {string} taskId - Target task ID
   * @param {string} approvalId - Approval record ID to update
   * @param {'approved' | 'rejected'} status - New status
   */
  function resolveApprovalInSession(
    taskId: string,
    approvalId: string,
    status: "approved" | "rejected",
  ): void {
    const s = sessions.value.get(taskId);
    if (!s) return;
    const approval = s.approvals.find((a) => a.id === approvalId);
    if (approval) {
      approval.status = status;
      approval.resolvedAt = new Date().toISOString();
    }
  } /*end resolveApprovalInSession*/

  /**
   * Sets an OAuthError on a session for UI banner rendering.
   * @param {string} taskId - Target task ID
   * @param {import("../types/models").OAuthError | null} error - OAuth error or null to clear
   */
  function setSessionOAuthError(
    taskId: string,
    error: import("../types/models").OAuthError | null,
  ): void {
    const s = sessions.value.get(taskId);
    if (s) {
      s.oauthError = error;
    }
  } /*end setSessionOAuthError*/

  /**
   * Replaces all key points for a task (full set from agent response).
   * @param {string} taskId - Target task ID
   * @param {TaskKeyPoint[]} points - Array of extracted key points
   */
  function setKeyPoints(taskId: string, points: TaskKeyPoint[]): void {
    keyPointsMap.value.set(taskId, [...points]);
  } /*end setKeyPoints*/

  /**
   * Appends a single key point to the task key points list.
   * Avoids duplicates by ID.
   * @param {string} taskId - Target task ID
   * @param {TaskKeyPoint} point - Key point to append
   */
  function addKeyPoint(taskId: string, point: TaskKeyPoint): void {
    const existing = keyPointsMap.value.get(taskId) ?? [];
    if (!existing.find((p) => p.id === point.id)) {
      keyPointsMap.value.set(taskId, [...existing, point]);
    }
  } /*end addKeyPoint*/

  /**
   * Clears all key points for a task (e.g. on session reset).
   * @param {string} taskId - Target task ID
   */
  function clearKeyPoints(taskId: string): void {
    keyPointsMap.value.delete(taskId);
  } /*end clearKeyPoints*/

  /**
   * Returns the reactive key points array for a given task.
   * @param {string} taskId - Target task ID
   * @return {TaskKeyPoint[]} Array of key points or empty array
   */
  function getKeyPoints(taskId: string): TaskKeyPoint[] {
    return keyPointsMap.value.get(taskId) ?? [];
  } /*end getKeyPoints*/

  return {
    sessions,
    primarySessionId,
    parallelSessionIds,
    floatingWindows,
    highestZIndex,
    primarySession,
    keyPointsMap,
    openSession,
    closeSession,
    appendMessage,
    appendApproval,
    resolveApprovalInSession,
    setSessionOAuthError,
    setAgentTyping,
    setPrimary,
    addParallelSession,
    openFloatingWindow,
    closeFloatingWindow,
    bringToFront,
    updateWindowPosition,
    updateWindowSize,
    toggleMinimizeWindow,
    toggleFullscreenWindow,
    sendToBack,
    appendTimelineEvent,
    updateTimelineEventNote,
    setKeyPoints,
    addKeyPoint,
    clearKeyPoints,
    getKeyPoints,
  };
});
