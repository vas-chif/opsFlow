/**
 * @file chat.ts
 * @description Centralized TypeScript definitions for OpsFlow Workspace Chat, Task Chat Sessions, and Floating Windows.
 * @author Vasile Chifeac
 * @created 2026-09-14
 * @modified 2026-09-14
 *
 * @notes
 * - Workspace Chat messages cached in localStorage (opsflow_workspace_chat_{wsId})
 * - In-memory active chat session models for taskChatStore
 * - Floating window coordinate & visibility management for multi-task multitasking
 *
 * @dependencies
 * - Task, TaskChatMessage, ApprovalRecord, TaskTimelineEvent, OAuthError from models.ts
 *
 * @performance
 * - Zero runtime overhead (compile-time TypeScript interfaces)
 */

// ── Types ────────────────────────────────────────────────────────────────────
import type {
  Task,
  TaskChatMessage,
  ApprovalRecord,
  TaskTimelineEvent,
  OAuthError,
} from "./models";

/**
 * Message model for Workspace-level chat persisted in browser localStorage.
 * UI-only / local cache — not directly stored in Firestore task collections.
 */
export interface ChatMsg {
  id: string;
  sender: "user" | "agent";
  agentName?: string;
  text: string;
  timestamp: string;
  toolsUsed?: string[];
}

/**
 * In-memory state of an active task-level chat session in taskChatStore.
 */
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
  oauthError: OAuthError | null;
  _unsubscribeMessages?: () => void;
  _unsubscribeApprovals?: () => void;
}

/**
 * Geometric, positioning and visibility state of a floating chat window.
 */
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
