/**
 * @file models.ts
 * @description Central Firestore document models for OpsFlow Task Management & AI Knowledge Base.
 * @author Vasile Chifeac
 * @created 2026-07-16
 * @modified 2026-09-14
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

/** Macro statuses for primary OpsFlow tasks governing overall container workflow. */
export type MacroTaskStatus = "pending" | "in-progress" | "completed" | "cancelled";

/** Allowed task statuses in OpsFlow workflow (preserves backwards compatibility with existing UI/stores). */
export type TaskStatus =
  | MacroTaskStatus
  | "contacted"
  | "positive-response"
  | "negative-response"
  | "follow-up-30-days";

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
  previewRows: (string | number)[][] | Array<{ cells: (string | number)[] }>;
  rowsJson?: string;
  previewRowsJson?: string;
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
  agentName?: string | undefined;
  text: string;
  timestamp: string;
  toolsUsed?: string[] | undefined;
  draftUrl?: string | undefined;
  /** If present, render an <ApprovalCard> inline for this approval. */
  approvalId?: string | undefined;
  approvalRecord?: ApprovalRecord | undefined;
  oauthError?: OAuthError | undefined;
}

/**
 * Task-level operational settings (Google Sheet, internal tab, custom email signature).
 */
export interface TaskSettings {
  selectedSheetId?: string | undefined;
  selectedSheetName?: string | undefined;
  selectedSheetIds?: string[] | undefined;
  selectedSheets?: LinkedGoogleResource[] | undefined;
  selectedSheetTab?: string | undefined;
  emailSignature?: string | undefined;
  emailHeader?: string | undefined;
  syncToMasterSheet?: boolean | undefined;
  /** Data integration mode for Google Sheets (Step 19 / Step 21 Strada 3). */
  sheetUpdateMode?: SheetUpdateMode | undefined;
  /** Whether to automatically apply Elite Styling to target Google Sheets. */
  autoStyleSheet?: boolean | undefined;
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
  /** List of emails or UIDs explicitly assigned to this single task (Step 26). */
  assignedMembers?: string[];
  aiMetadata: TaskAIMetadata;
  settings?: TaskSettings;
  archived?: boolean;
  archivedAt?: FirestoreTimestamp | string | null;
  pinned?: boolean;
  order?: number;
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

// ── Step 20: Polymorphic Entity SubTasks ──────────────────────────────────────

/** Supported operational domains for polymorphic SubTasks. */
export type EntityDomain = "recruiting" | "healthcare" | "procurement" | "operations" | "generic";

/** Granular operational status for per-entity Sub-Tasks. */
export type EntitySubTaskStatus =
  | "new"
  | "contacted"
  | "waiting_response"
  | "negotiation"
  | "positive_response"
  | "negative_response"
  | "follow_up"
  | "completed";

/** Final business outcome of an Entity Sub-Task. */
export type EntitySubTaskOutcome = "in_progress" | "won" | "lost" | "cancelled";

/** Type of event recorded in an entity's private timeline. */
export type EntityEventType =
  | "status_change"
  | "call"
  | "email"
  | "whatsapp"
  | "note"
  | "mini_task";

/** Single chronological event in the entity's private timeline. */
export interface EntityTimelineEvent {
  id: string;
  eventType: EntityEventType;
  title: string;
  description?: string | undefined;
  authorId: string;
  authorName: string;
  timestamp: string; // ISO 8601
} /*end EntityTimelineEvent*/

/** Nested mini-action inside an entity Sub-Task. */
export interface NestedMiniTask {
  id: string;
  title: string;
  completed: boolean;
  dueDate?: string;
  assignedTo?: string;
} /*end NestedMiniTask*/

/**
 * Complete Polymorphic Entity SubTask Model.
 * Stored at: tenants/{tenantId}/workspaces/{workspaceId}/tasks/{taskId}/subtasks/{subtaskId}
 */
export interface EntitySubTask {
  id: string;
  tenantId: string;
  workspaceId: string;
  taskId: string;
  domain: EntityDomain;

  /** Visual identification */
  title: string;
  subtitle?: string;
  entityExternalId?: string;

  /** State machine & outcome */
  status: EntitySubTaskStatus;
  outcome: EntitySubTaskOutcome;

  /** Dynamic context inherited from table/chat */
  contextSnippet?: string;
  attributes: Record<string, unknown>;

  /** Private timeline and notes */
  notes: string;
  timeline: EntityTimelineEvent[];
  nestedTasks: NestedMiniTask[];

  /** Timestamps */
  createdAt: string;
  updatedAt: string;
} /*end EntitySubTask*/

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
  assignedMembers?: string[];
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
 * Structured Google Resource (Spreadsheet, Drive Folder) linked to a Workspace or Task.
 */
export interface LinkedGoogleResource {
  id: string;
  name: string;
  type: "sheet" | "folder";
  url?: string | undefined;
  isMaster?: boolean | undefined;
  addedAt?: string | undefined;
}

/**
 * Linked Google resources & OAuth state for a Workspace.
 */
export interface WorkspaceLinkedResources {
  googleEmail?: string | undefined;
  linkedEmails?: string[] | undefined;
  linkedSheets?: LinkedGoogleResource[] | undefined;
  linkedFolders?: LinkedGoogleResource[] | undefined;
  defaultSheetId?: string | undefined;
  defaultSheetName?: string | undefined;
  defaultDriveFolderId?: string | undefined;
  defaultDriveFolderName?: string | undefined;
  defaultEmailSignature?: string | undefined;
  isOAuthConnected?: boolean | undefined;
  assignedAgents?: string[] | undefined;
  /**
   * When true, all tasks in this workspace will sync their results to the Master Google Sheet
   * by default. Individual tasks can override this via TaskSettings.syncToMasterSheet.
   */
  autoSyncToMasterSheet?: boolean | undefined;
  /** @deprecated Migrated to WorkspaceAttitude.rules.doList */
  doList?: string[] | undefined;
  /** @deprecated Migrated to WorkspaceAttitude.rules.dontList */
  dontList?: string[] | undefined;
  /** @deprecated Migrated to WorkspaceAttitude.tone */
  toneOfVoice?: "formal" | "informal" | "operational" | "roi_synthetic" | undefined;
  /** Default data integration mode for Google Sheets in this workspace (Step 19 / Step 21 Strada 3). */
  sheetUpdateMode?: SheetUpdateMode | undefined;
  /** Whether to automatically apply Elite Styling to target Google Sheets by default. */
  autoStyleSheet?: boolean | undefined;
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
  /** List of emails or UIDs explicitly assigned to this workspace (Step 26). */
  assignedMembers?: string[];
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
  assignedMembers?: string[];
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
  /** Scope of the invitation: whole tenant, specific workspace, or specific task (Step 26). */
  scope?: "tenant" | "workspace" | "task";
  workspaceId?: string;
  workspaceName?: string;
  taskId?: string;
  taskTitle?: string;
} /*end TenantInvitation*/

/**
 * Payload for the createTenantInvitation callable function.
 * Only email + role: the UID is no longer required from the Admin (Step 14 goal).
 */
export interface CreateInvitationPayload {
  email: string;
  role: TenantRole;
  scope?: "tenant" | "workspace" | "task";
  workspaceId?: string;
  workspaceName?: string;
  taskId?: string;
  taskTitle?: string;
} /*end CreateInvitationPayload*/

/**
 * Usage metrics and limits for freemium users (Step 26).
 * Persisted in localStorage and Firestore profile.
 */
export interface UserUsageQuota {
  createdTasksTotal: number;
  deletedTasksCount: number;
} /*end UserUsageQuota*/

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

// ── Step 19: Scheduled Sourcing & Smart Diffing Engine ───────────────────────

/**
 * Frequency cadence for automated recurring sourcing jobs.
 * Maps to a cron expression managed by the Dispatcher Cloud Function.
 */
export type ScheduledJobFrequency = "daily_04am" | "weekly_mon_04am" | "custom_cron";

/**
 * Update behavior when integrating newly discovered candidates.
 * - append_new: Non-destructive — only adds profiles not already in the sheet.
 * - re_rank_all: Merges existing + new, sorts by Match Score descending.
 */
export type SheetUpdateMode = "append_new" | "re_rank_all";

/**
 * Audit log entry for a single scheduled sourcing job execution.
 * Path: tenants/{tenantId}/workspaces/{workspaceId}/scheduledJobs/{jobId}/executionLogs/{logId}
 */
export interface ScheduledJobExecutionLog {
  executedAt: string; // ISO 8601
  newCandidatesFound: number;
  totalDuplicatesSkipped: number;
  urlDuplicatesSkipped: number;
  nameDuplicatesSkipped: number;
  status: "success" | "warning" | "error";
  errorMessage?: string | undefined;
  rowsWritten: number;
} /*end ScheduledJobExecutionLog*/

/**
 * Operational definition of a Scheduled Sourcing Job stored in Firestore.
 * Path: tenants/{tenantId}/workspaces/{workspaceId}/scheduledJobs/{jobId}
 *
 * @notes
 * - Dual-Key Deduplication: profileUrl (normalized) + candidateName (lowercased)
 * - GDPR Art. 5: mandatory endDate ensures processes are time-limited
 * - isLocked prevents concurrent execution on Cloud Function retries
 *
 * @performance
 * - Single Firestore query per dispatcher tick (every 60 min)
 * - Zero LLM tokens consumed for deduplication (pure Set lookup)
 */
export interface ScheduledSourcingJob {
  id: string;
  tenantId: string;
  workspaceId: string;
  taskId: string;
  title: string;
  status: "active" | "paused" | "completed";
  pauseReason?: string | undefined;

  /** Frequency & Lifecycle */
  frequency: ScheduledJobFrequency;
  /** Cron expression e.g. '0 4 * * *' (daily 04:00) or '0 4 * * 1' (Mon) */
  cronExpression: string;
  /** IANA timezone e.g. 'Europe/Rome' */
  timeZone: string;
  /** ISO 8601 start date */
  startDate: string;
  /** ISO 8601 mandatory end date (GDPR Art. 5 — data retention limit) */
  endDate: string;

  /** Target Google Sheet resource & Dual-Key Deduplication config */
  targetResource: {
    type: "google_sheet";
    spreadsheetId: string;
    sheetName: string;
    /** 0-based column index for Profile URL (Dual-Key: URL) */
    dedupUrlColumnIndex: number;
    /** 0-based column index for Full Name (Dual-Key: Name) */
    dedupNameColumnIndex: number;
    /** Human-readable label for the URL column (e.g. 'Fonte / Profilo Pubblico') */
    dedupColumnHeader: string;
  };

  /** Search & Output Configuration */
  searchConfig: {
    /** The sourcing prompt template for the AgenteRicerca */
    promptTemplate: string;
    /** Structured search query sent to the web search tool */
    searchQuery: string;
    /** How new results are merged into the existing sheet */
    updateMode: SheetUpdateMode;
    /** When true, applies Elite batchUpdate styling after each write */
    autoStyleSheet: boolean;
  };

  /** Runtime State & Locking (prevents concurrent Cloud Function retry conflicts) */
  isLocked?: boolean | undefined;
  lastRunAt?: string | undefined; // ISO 8601
  nextRunAt?: string | undefined; // ISO 8601
  /** Summary history of last N executions (capped at 30 for cost control) */
  resultsHistory?: ScheduledJobExecutionLog[] | undefined;
} /*end ScheduledSourcingJob*/
