/**
 * @file models.ts
 * @description Central Firestore document models for OpsFlow Task Management & AI Knowledge Base.
 * @author Vasile Chifeac
 * @created 2026-07-16
 * @modified 2026-07-16
 *
 * @notes
 * - Multi-tenant isolation: every document MUST have tenantId (validated by Firestore rules)
 * - Task status workflow is intentionally simple for MVP
 * - aiMetadata is structured for future RAG integration
 *
 * @dependencies
 * - None (pure types)
 *
 * @performance
 * - Zero runtime cost (compile-time only)
 */

/** Allowed task statuses in OpsFlow workflow. */
export type TaskStatus = "pending" | "in-progress" | "completed" | "cancelled";

/** Timestamp format used by Firestore. */
export type FirestoreTimestamp = Date | null;

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
export interface TaskAIMetadata {
  complexityScore: number; // 1-10 scale
  suggestedCategory: string;
  confidence: number; // 0-1 for AI confidence
  modelVersion: string;
  lastAnalyzed: FirestoreTimestamp;
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
 * Firestore document creation payload for KnowledgeBase.
 */
export interface CreateKnowledgeBasePayload {
  category: "preference" | "rule" | "pattern";
  key: string;
  value: Record<string, unknown>;
  confidence?: number;
  source?: "user_input" | "ai_derived" | "system_default";
} /*end CreateKnowledgeBasePayload*/
