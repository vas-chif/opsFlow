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

/** UI & Session model for tracking Task status progression timeline. */
export interface TaskTimelineEvent {
  id: string;
  taskId: string;
  status: TaskStatus;
  title: string;
  subtitle: string;
  description?: string;
  note?: string;
  showNote?: boolean;
  icon: string;
  color: string;
  timestamp: string;
}

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
 * Universal Task Preset categories (Step 10 DBS Engine).
 */
export type TaskPresetCategory = "web_search" | "sheet_sync" | "gmail_draft" | "pdf_analysis";

/**
 * Universal binding rules for AI agent execution in a workspace (Step 10).
 */
export interface WorkspaceRules {
  doList: string[];
  dontList: string[];
  outputFormat: "markdown" | "table" | "json" | "bullet_points";
}

/**
 * Universal DBS Workspace Attitude & Skill Matrix constitution (Step 10).
 */
export interface WorkspaceAttitude {
  industryScope: string;
  tone: string;
  skills: string[];
  rules: WorkspaceRules;
}

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
  /** @deprecated Migrated to WorkspaceAttitude.rules.doList */
  doList?: string[];
  /** @deprecated Migrated to WorkspaceAttitude.rules.dontList */
  dontList?: string[];
  /** @deprecated Migrated to WorkspaceAttitude.tone */
  toneOfVoice?: "formal" | "informal" | "operational" | "roi_synthetic";
}

/**
 * Public (non-confidential) metadata for a Google Workspace integration.
 * Stored directly on the workspace document — never contains tokens or PII.
 * The encrypted refresh_token lives in: tenants/{tenantId}/workspaces/{workspaceId}/integrations/google
 *
 * @see Step 18 — Workspace-Scoped Token Vault
 */
export interface GoogleWorkspaceIntegration {
  /** Whether a Google account is currently linked and authorized. */
  connected: boolean;
  /** The Google email address that was authorized (e.g. versiliacare@gmail.com). */
  connectedEmail: string;
  /** ISO 8601 timestamp of when the connection was established. */
  connectedAt: string;
} /*end GoogleWorkspaceIntegration*/

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
  /** @deprecated Sostituito dalla costruzione dinamica in promptBuilder.ts via attitude */
  systemPrompt?: string;
  category?: string;
  linkedResources?: WorkspaceLinkedResources;
  attitude?: WorkspaceAttitude;
  /**
   * Public Google Workspace integration metadata (Step 18).
   * Set by the `googleOAuthCallback` Cloud Function after a successful OAuth consent.
   * Does NOT contain tokens — those are in the encrypted workspace-scoped vault.
   */
  googleIntegration?: GoogleWorkspaceIntegration;
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
  attitude?: WorkspaceAttitude;
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

// ── UI-Only: Task Key Points (Working Memory Summary) ─────────────────────────

/**
 * Category label for a Task Key Point card.
 * UI-only — not Firestore data.
 */
export type KeyPointCategory = "lead" | "requirement" | "action" | "insight" | "warning" | "gdpr";

/**
 * Represents a single extracted key point from the AI conversation.
 * Used by TaskKeyPointsCard.vue to display a visual summary without raw JSON.
 * UI-only — not Firestore data.
 */
export interface TaskKeyPoint {
  id: string;
  taskId: string;
  title: string;
  detail: string;
  category: KeyPointCategory;
  icon: string;
  color: string;
  timestamp: string;
} /*end TaskKeyPoint*/

// ── Team Onboarding & Multi-Tenant Invitations (Step 14) ─────────────────────

/**
 * Roles available within an OpsFlow tenant.
 * Sealed here as single source of truth for both Frontend and Cloud Functions.
 */
export type TenantRole = "owner" | "superadmin" | "admin" | "member" | "user";

/** Lifecycle status of a tenant invitation document. */
export type TenantInvitationStatus = "pending" | "accepted" | "expired" | "revoked";

/**
 * Firestore document for a tenant email invitation.
 * Path: tenants/{tenantId}/invitations/{tokenHash}
 *
 * @notes
 * - Document ID IS the tokenHash (SHA-256 of the raw token) for direct O(1) lookup.
 * - The raw token is NEVER stored — only its SHA-256 hash (GDPR Art. 32 — Anti-Replay).
 * - Riscatto (acceptance) must go through Cloud Function with Admin SDK only (no client writes).
 * - TTL: inviti pendenti eliminati automaticamente dopo 7 giorni (GDPR Art. 17).
 *
 * @performance
 * - Create: 1 Firestore write
 * - Accept: 1 O(1) getDoc + 1 write (runTransaction)
 */
export interface TenantInvitation {
  /** SHA-256 hash of the raw token — also serves as Document ID. */
  tokenHash: string;
  tenantId: string;
  /** Email address of the invited user. */
  email: string;
  /** Role assigned upon acceptance — sealed server-side (Anti-Privilege Escalation). */
  role: TenantRole;
  status: TenantInvitationStatus;
  /** UID of the admin who sent the invitation. */
  invitedBy: string;
  createdAt: FirestoreTimestamp;
  /** Absolute expiry — 7 days from createdAt. */
  expiresAt: FirestoreTimestamp;
  /** Set by Cloud Function acceptTenantInvitation upon successful redemption. */
  acceptedAt?: FirestoreTimestamp;
  /** UID of the user who redeemed the invitation. */
  acceptedByUid?: string;
} /*end TenantInvitation*/

/**
 * Payload for the createTenantInvitation callable function.
 * Only email + role: the UID is no longer required from the Admin (Step 14 goal).
 */
export interface CreateInvitationPayload {
  email: string;
  role: TenantRole;
} /*end CreateInvitationPayload*/

/**
 * Payload for the acceptTenantInvitation callable function.
 * The raw token (not the hash) is passed; hashing happens server-side.
 */
export interface AcceptInvitationPayload {
  token: string;
  tenantId: string;
} /*end AcceptInvitationPayload*/

/**
 * Payload for the revokeTenantInvitation callable function.
 */
export interface RevokeInvitationPayload {
  tokenHash: string;
} /*end RevokeInvitationPayload*/

/**
 * Member document stored in tenants/{tenantId}/members/{uid}.
 * Written atomically by acceptTenantInvitation Cloud Function.
 */
export interface TenantMember {
  uid: string;
  email: string;
  role: TenantRole;
  tenantId: string;
  joinedAt: FirestoreTimestamp;
  /** Display name, populated from Firebase Auth profile. */
  displayName?: string;
  /** photoURL from Firebase Auth profile. */
  photoURL?: string;
  /** Whether the member account is currently active. */
  isActive: boolean;
} /*end TenantMember*/

// ── AI Task Architect: Refined Task Draft (Step 17) ──────────────────────────

/**
 * A single sub-task item within a refined task draft.
 * UI-only — not Firestore data (stored embedded in RefinedTaskDraft).
 */
export interface RefinedSubTask {
  order: number;
  title: string;
  description: string;
} // UI-only — not Firestore data

/**
 * Structured task draft returned by the `refineTaskDraft` Cloud Function.
 * Populated into AITaskArchitectModal.vue for human review before saving.
 * UI-only — not Firestore data.
 */
export interface RefinedTaskDraft {
  title: string;
  description: string;
  suggestedCategory: "general" | "marketing" | "research" | "admin" | "dev" | "clinical";
  priority: "low" | "medium" | "high";
  estimatedMinutes: number;
  subtasks: RefinedSubTask[];
} // UI-only — not Firestore data
