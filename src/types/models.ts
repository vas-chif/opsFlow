/**
 * @file models.ts
 * @description Central Firestore document models for OpsFlow Task Management & AI Knowledge Base.
 * @author Vasile Chifeac
 * @created 2026-07-16
 * @modified 2026-08-14
 *
 * @notes
 * - Multi-tenant isolation: every document MUST have tenantId (validated by Firestore rules)
 * - Task status workflow is intentionally simple for MVP
 * - aiMetadata is structured for future RAG integration
 * - ApprovalRecord supports Human-in-the-Loop pattern (§AGENTS.md)
 *
 * @dependencies
 * - None (pure types)
 *
 * @performance
 * - Zero runtime cost (compile-time only)
 */

/** Allowed task statuses in OpsFlow workflow. */
export type TaskStatus =
  | "pending"
  | "in-progress"
  | "contacted"
  | "positive-response"
  | "negative-response"
  | "follow-up-30-days"
  | "completed"
  | "cancelled";

/** Timestamp format used by Firestore. */
export type FirestoreTimestamp = Date | null;

// ── Human-in-the-Loop: Approval Types ────────────────────────────────────────

/**
 * Type of pending external action requiring user approval.
 * Covers Gmail Draft creation and Google Sheets row append.
 */
export type PendingActionType = "gmail_draft" | "sheet_append" | "platform_sourcing";

/**
 * Lifecycle status of an approval record.
 * pending → approved (executes real action) | rejected (discards action).
 */
export type PendingActionStatus = "pending" | "approved" | "rejected";

/**
 * Preview payload for a Gmail draft pending approval.
 */
export interface GmailDraftPreview {
  to: string;
  subject: string;
  body: string;
}

/**
 * Preview payload for a Google Sheets append pending approval.
 */
export interface SheetAppendPreview {
  spreadsheetId: string;
  range: string;
  /** Human-readable preview of the rows to be written (first 5 max). */
  previewRows: string[][];
}

/**
 * Union type representing the data preview for any pending action.
 */
export type PendingActionPayload = GmailDraftPreview | SheetAppendPreview;

/**
 * Firestore document written by backend tools to the /approvals/ subcollection.
 * Path: tenants/{tenantId}/workspaces/{wsId}/tasks/{taskId}/approvals/{approvalId}
 */
export interface ApprovalRecord {
  id: string;
  taskId: string;
  workspaceId: string;
  tenantId: string;
  actionType: PendingActionType;
  status: PendingActionStatus;
  /** Human-readable summary of the action for the UI card. */
  summary: string;
  /** Structured preview data rendered in <ApprovalCard.vue>. */
  previewData: PendingActionPayload;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
} /*end ApprovalRecord*/

/**
 * Typed OAuth error codes surfaced by the backend Token Vault.
 * Used to trigger re-authentication banners in the frontend.
 */
export type OAuthErrorCode = "TOKEN_EXPIRED" | "INSUFFICIENT_SCOPES" | "TOKEN_NOT_FOUND";

/**
 * Structured OAuth error returned by backend when token validation fails.
 */
export interface OAuthError {
  code: OAuthErrorCode;
  message: string;
  requiredScopes?: string[];
} /*end OAuthError*/

/**
 * Chat message within a specific Task thread.
 * approvalId links to an ApprovalRecord rendered as <ApprovalCard> in the chat.
 */
export interface TaskChatMessage {
  id: string;
  taskId: string;
  sender: "user" | "agent";
  agentName?: string;
  text: string;
  timestamp: string;
  toolsUsed?: string[];
  draftUrl?: string;
  /** If present, render an <ApprovalCard> inline for this approval. */
  approvalId?: string;
  oauthError?: OAuthError;
}

/**
 * Core Task document model.
 * Represents a work item assigned to users/operators.
 */
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  tenantId: string;
  workspaceId: string;
  assignedTo: string | null;
  aiMetadata: TaskAIMetadata;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
} /*end Task*/

/**
 * AI-generated subtasks for breaking down complex tasks.
 * Created by the IA orchestration layer.
 */
export interface SubTask {
  id: string;
  taskId: string;
  title: string;
  description: string;
  order: number;
  completed: boolean;
  tenantId: string;
  createdAt: FirestoreTimestamp;
} /*end SubTask*/

/**
 * AI metadata attached to tasks for learning and automation.
 */
export interface QualityAuditResult {
  passed: boolean;
  score: number;
  summary: string;
  auditedAt: string;
}

export interface TaskAIMetadata {
  complexityScore: number; // 1-10 scale
  suggestedCategory: string;
  confidence: number; // 0-1 for AI confidence
  modelVersion: string;
  lastAnalyzed: FirestoreTimestamp;
  subtasks?: Omit<SubTask, "tenantId" | "taskId">[];
  qualityAudit?: QualityAuditResult;
} /*end TaskAIMetadata*/

/**
 * Knowledge base entry for tenant-specific AI learning.
 * Stores rules, preferences, and patterns discovered by the system.
 */
export interface KnowledgeBase {
  id: string;
  tenantId: string;
  category: "preference" | "rule" | "pattern";
  key: string;
  value: Record<string, unknown>;
  confidence: number; // 0-1 confidence score
  lastUpdated: FirestoreTimestamp;
  source: "user_input" | "ai_derived" | "system_default";
} /*end KnowledgeBase*/

/** Default source value for KnowledgeBase entries. */
export const DEFAULT_KB_SOURCE = "user_input" as const;

/**
 * Firestore document creation payload for Task.
 * tenantId is auto-injected by useFirestore composable.
 */
export interface CreateTaskPayload {
  title: string;
  description: string;
  status?: TaskStatus;
  assignedTo?: string | null;
  aiMetadata?: Partial<TaskAIMetadata>;
} /*end CreateTaskPayload*/

/**
 * Firestore document creation payload for SubTask.
 */
export interface CreateSubTaskPayload {
  taskId: string;
  title: string;
  description: string;
  order?: number;
} /*end CreateSubTaskPayload*/

/**
 * Linked Google resources & OAuth state for a Workspace.
 */
export interface WorkspaceLinkedResources {
  googleEmail?: string;
  linkedEmails?: string[];
  defaultSheetId?: string;
  defaultSheetName?: string;
  defaultDriveFolderId?: string;
  defaultDriveFolderName?: string;
  isOAuthConnected?: boolean;
  assignedAgents?: string[];
  doList?: string[];
  dontList?: string[];
  toneOfVoice?: "formal" | "informal" | "operational" | "roi_synthetic";
}

/**
 * Workspace entity for grouping tasks.
 * Follows multi-tenant isolation with tenantId.
 */
export interface Workspace {
  id: string;
  name: string;
  description: string;
  tenantId: string;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
  icon?: string;
  isPinned?: boolean;
  groupName?: string;
  systemPrompt?: string;
  category?: string;
  linkedResources?: WorkspaceLinkedResources;
} /*end Workspace*/

/**
 * Firestore document creation payload for Workspace.
 */
export interface CreateWorkspacePayload {
  name: string;
  description?: string;
  icon?: string;
  isPinned?: boolean;
  groupName?: string;
  systemPrompt?: string;
  category?: string;
  linkedResources?: WorkspaceLinkedResources;
} /*end CreateWorkspacePayload*/

/**
 * Firestore document creation payload for KnowledgeBase.
 */
export interface CreateKnowledgeBasePayload {
  category: "preference" | "rule" | "pattern";
  key: string;
  value: Record<string, unknown>;
  confidence?: number;
  source?: "user_input" | "ai_derived" | "system_default";
} /*end CreateKnowledgeBasePayload*/
