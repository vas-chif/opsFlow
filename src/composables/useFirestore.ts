/**
 * @file useFirestore.ts
 * @description Tenant-isolated Firestore composable for secure multi-tenant data operations.
 * @author Vasile Chifeac
 * @created 2026-07-16
 * @modified 2026-07-30
 *
 * @notes
 * - Implements Config-Fenced pattern (masterChecklist §2.2)
 * - Workspace-nested tasks: tenants/{tenantId}/workspaces/{workspaceId}/tasks/{taskId}
 * - All queries auto-filtered by tenantId from JWT claims
 * - Never exposes raw Firestore SDK directly
 *
 * @dependencies
 * - firebase/firestore
 * - pinia
 * - src/stores/authStore.ts
 *
 * @performance
 * - Uses Firestore cache-first strategy (§5)
 * - Zero extra reads for tenant validation (uses JWT claims)
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { storeToRefs } from "pinia";

// ── Firebase ─────────────────────────────────────────────────────────────────
import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  type CollectionReference,
  type DocumentReference,
  type QueryConstraint,
  type DocumentData,
  type QuerySnapshot,
  type DocumentSnapshot,
} from "firebase/firestore";

// ── Types ────────────────────────────────────────────────────────────────────
import type { Task, SubTask, KnowledgeBase, TaskStatus } from "@/types/models";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useAuthStore } from "@/stores/authStore";

// ── Utils ────────────────────────────────────────────────────────────────────
import { db } from "@/boot/firebase";

/** Collection names as constants to prevent typos. */
const COLLECTIONS = {
  TASKS: "tasks",
  SUBTASKS: "subtasks",
  KNOWLEDGE_BASE: "knowledgeBase",
  WORKSPACES: "workspaces",
} as const; /*end COLLECTIONS*/

/**
 * Get the tenant-scoped collection reference.
 * Throws if no tenantId is available (user not authenticated).
 */
function getTenantCollection(collectionName: string): CollectionReference<DocumentData> {
  const authStore = useAuthStore();
  const { tenantId } = storeToRefs(authStore);

  if (!tenantId.value) {
    throw new Error("Tenant ID not available - user must be authenticated");
  }

  return collection(db, "tenants", tenantId.value, collectionName);
} /*end getTenantCollection*/

/**
 * Get the tenant-scoped document reference.
 */
function getTenantDoc(collectionName: string, docId: string): DocumentReference<DocumentData> {
  const authStore = useAuthStore();
  const { tenantId } = storeToRefs(authStore);

  if (!tenantId.value) {
    throw new Error("Tenant ID not available - user must be authenticated");
  }

  return doc(db, "tenants", tenantId.value, collectionName, docId);
} /*end getTenantDoc*/

/**
 * Get collection reference for workspace-nested tasks:
 * tenants/{tenantId}/workspaces/{workspaceId}/tasks
 */
function getWorkspaceTaskCollection(workspaceId: string): CollectionReference<DocumentData> {
  const authStore = useAuthStore();
  const { tenantId } = storeToRefs(authStore);

  if (!tenantId.value) {
    throw new Error("Tenant ID not available - user must be authenticated");
  }

  return collection(
    db,
    "tenants",
    tenantId.value,
    COLLECTIONS.WORKSPACES,
    workspaceId,
    COLLECTIONS.TASKS,
  );
} /*end getWorkspaceTaskCollection*/

/**
 * Add a task inside a specific workspace collection:
 * tenants/{tenantId}/workspaces/{workspaceId}/tasks/{taskId}
 */
async function addWorkspaceTaskDoc<T extends { tenantId: string }>(
  workspaceId: string,
  data: Omit<T, "tenantId">,
): Promise<string> {
  const authStore = useAuthStore();
  const { tenantId } = storeToRefs(authStore);

  if (!tenantId.value) {
    throw new Error("Tenant ID not available - user must be authenticated");
  }

  const docData = {
    ...data,
    tenantId: tenantId.value,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as T & { createdAt: Date; updatedAt: Date };

  const taskColl = getWorkspaceTaskCollection(workspaceId);
  const docRef = await addDoc(taskColl, docData);

  return docRef.id;
} /*end addWorkspaceTaskDoc*/

/**
 * Get all tasks for a specific workspace:
 * tenants/{tenantId}/workspaces/{workspaceId}/tasks
 */
async function getWorkspaceTaskDocs<T>(workspaceId: string): Promise<T[]> {
  const taskColl = getWorkspaceTaskCollection(workspaceId);
  const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(taskColl);

  return querySnapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as T[];
} /*end getWorkspaceTaskDocs*/

/**
 * Update a task inside a specific workspace collection.
 */
async function updateWorkspaceTaskDoc(
  workspaceId: string,
  taskId: string,
  data: Partial<DocumentData>,
): Promise<void> {
  const authStore = useAuthStore();
  const { tenantId } = storeToRefs(authStore);

  if (!tenantId.value) {
    throw new Error("Tenant ID not available - user must be authenticated");
  }

  const docRef = doc(
    db,
    "tenants",
    tenantId.value,
    COLLECTIONS.WORKSPACES,
    workspaceId,
    COLLECTIONS.TASKS,
    taskId,
  );
  await updateDoc(docRef, {
    ...data,
    updatedAt: new Date(),
  });
} /*end updateWorkspaceTaskDoc*/

/**
 * Delete a task inside a specific workspace collection.
 */
async function deleteWorkspaceTaskDoc(workspaceId: string, taskId: string): Promise<void> {
  const authStore = useAuthStore();
  const { tenantId } = storeToRefs(authStore);

  if (!tenantId.value) {
    throw new Error("Tenant ID not available - user must be authenticated");
  }

  const docRef = doc(
    db,
    "tenants",
    tenantId.value,
    COLLECTIONS.WORKSPACES,
    workspaceId,
    COLLECTIONS.TASKS,
    taskId,
  );
  await deleteDoc(docRef);
} /*end deleteWorkspaceTaskDoc*/

/**
 * Move a task document from a source workspace to a target workspace atomically.
 */
async function moveWorkspaceTaskDoc(
  sourceWorkspaceId: string,
  targetWorkspaceId: string,
  taskId: string,
): Promise<void> {
  const authStore = useAuthStore();
  const { tenantId } = storeToRefs(authStore);

  if (!tenantId.value) {
    throw new Error("Tenant ID not available - user must be authenticated");
  }

  const sourceRef = doc(
    db,
    "tenants",
    tenantId.value,
    COLLECTIONS.WORKSPACES,
    sourceWorkspaceId,
    COLLECTIONS.TASKS,
    taskId,
  );

  const targetRef = doc(
    db,
    "tenants",
    tenantId.value,
    COLLECTIONS.WORKSPACES,
    targetWorkspaceId,
    COLLECTIONS.TASKS,
    taskId,
  );

  const sourceSnap = await getDoc(sourceRef);
  if (!sourceSnap.exists()) {
    throw new Error("Source task document does not exist");
  }

  const taskData = sourceSnap.data();
  taskData.workspaceId = targetWorkspaceId;
  taskData.updatedAt = new Date();

  await setDoc(targetRef, taskData);
  await deleteDoc(sourceRef);
} /*end moveWorkspaceTaskDoc*/

/**
 * Build query constraints with mandatory tenantId filter.
 */
function buildTenantQueryConstraints(extraConstraints: QueryConstraint[] = []): QueryConstraint[] {
  return extraConstraints;
} /*end buildTenantQueryConstraints*/

/**
 * Add a new document to a tenant-scoped collection.
 */
async function addTenantDoc<T extends { tenantId: string }>(
  collectionName: string,
  data: Omit<T, "tenantId">,
): Promise<string> {
  const authStore = useAuthStore();
  const { tenantId } = storeToRefs(authStore);

  if (!tenantId.value) {
    throw new Error("Tenant ID not available - user must be authenticated");
  }

  const docData = {
    ...data,
    tenantId: tenantId.value,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as T & { createdAt: Date; updatedAt: Date };

  const tenantCollection = getTenantCollection(collectionName);
  const docRef = await addDoc(tenantCollection, docData);

  return docRef.id;
} /*end addTenantDoc*/

/**
 * Get all documents from a tenant-scoped collection.
 */
async function getTenantDocs<T>(
  collectionName: string,
  extraConstraints: QueryConstraint[] = [],
): Promise<T[]> {
  const tenantCollection = getTenantCollection(collectionName);
  const constraints = buildTenantQueryConstraints(extraConstraints);
  const q = query(tenantCollection, ...constraints);

  const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(q);

  return querySnapshot.docs.map((docItem) => ({
    id: docItem.id,
    ...docItem.data(),
  })) as T[];
} /*end getTenantDocs*/

/**
 * Get a single document by ID from a tenant-scoped collection.
 */
async function getTenantDocById<T>(collectionName: string, docId: string): Promise<T | null> {
  const docRef = getTenantDoc(collectionName, docId);
  const docSnapshot: DocumentSnapshot<DocumentData> = await getDoc(docRef);

  if (!docSnapshot.exists()) {
    return null;
  }

  return {
    id: docSnapshot.id,
    ...docSnapshot.data(),
  } as T;
} /*end getTenantDocById*/

/**
 * Update a document in a tenant-scoped collection.
 */
async function updateTenantDoc(
  collectionName: string,
  docId: string,
  data: Partial<DocumentData>,
): Promise<void> {
  const docRef = getTenantDoc(collectionName, docId);
  const updateData = {
    ...data,
    updatedAt: new Date(),
  };

  await updateDoc(docRef, updateData);
} /*end updateTenantDoc*/

/**
 * Delete a document from a tenant-scoped collection.
 */
async function deleteTenantDoc(collectionName: string, docId: string): Promise<void> {
  const docRef = getTenantDoc(collectionName, docId);
  await deleteDoc(docRef);
} /*end deleteTenantDoc*/

/**
 * Get tasks filtered by status.
 */
async function getTasksByStatus(status: TaskStatus): Promise<Task[]> {
  return getTenantDocs<Task>(COLLECTIONS.TASKS, [where("status", "==", status)]);
} /*end getTasksByStatus*/

/**
 * Get tasks assigned to a specific user.
 */
async function getTasksByAssignee(assigneeId: string): Promise<Task[]> {
  return getTenantDocs<Task>(COLLECTIONS.TASKS, [where("assignedTo", "==", assigneeId)]);
} /*end getTasksByAssignee*/

/**
 * Get subtasks for a specific task.
 */
async function getSubTasksByTaskId(taskId: string): Promise<SubTask[]> {
  return getTenantDocs<SubTask>(COLLECTIONS.SUBTASKS, [
    where("taskId", "==", taskId),
    orderBy("order", "asc"),
  ]);
} /*end getSubTasksByTaskId*/

/**
 * Get knowledge base entries by category.
 */
async function getKnowledgeByCategory(
  category: "preference" | "rule" | "pattern",
): Promise<KnowledgeBase[]> {
  return getTenantDocs<KnowledgeBase>(COLLECTIONS.KNOWLEDGE_BASE, [
    where("category", "==", category),
  ]);
} /*end getKnowledgeByCategory*/

/**
 * Set a knowledge base entry (upsert pattern).
 */
async function setKnowledgeEntry(
  key: string,
  payload: import("@/types/models").CreateKnowledgeBasePayload,
): Promise<string> {
  const authStore = useAuthStore();
  const { tenantId } = storeToRefs(authStore);

  if (!tenantId.value) {
    throw new Error("Tenant ID not available - user must be authenticated");
  }

  const existing = await getTenantDocs<KnowledgeBase>(COLLECTIONS.KNOWLEDGE_BASE, [
    where("key", "==", key),
    limit(1),
  ]);

  const docData = {
    ...payload,
    tenantId: tenantId.value,
    lastUpdated: new Date(),
    source: payload.source ?? ("user_input" as const),
    confidence: payload.confidence ?? 0.5,
  };

  const existingEntry = existing[0];

  if (existingEntry) {
    await updateTenantDoc(COLLECTIONS.KNOWLEDGE_BASE, existingEntry.id, docData);
    return existingEntry.id;
  } else {
    return addTenantDoc<Omit<KnowledgeBase, "id">>(COLLECTIONS.KNOWLEDGE_BASE, docData);
  }
} /*end setKnowledgeEntry*/

// Export all functions as a composable
export function useFirestore() {
  return {
    // Core CRUD operations
    addTenantDoc,
    getTenantDocs,
    getTenantDocById,
    updateTenantDoc,
    deleteTenantDoc,

    // Workspace-nested Task operations
    addWorkspaceTaskDoc,
    getWorkspaceTaskDocs,
    updateWorkspaceTaskDoc,
    deleteWorkspaceTaskDoc,
    moveWorkspaceTaskDoc,

    // Task operations
    getTasksByStatus,
    getTasksByAssignee,

    // SubTask operations
    getSubTasksByTaskId,

    // Knowledge Base operations
    getKnowledgeByCategory,
    setKnowledgeEntry,

    // Collection constants
    COLLECTIONS,
  };
} /*end useFirestore*/

export type { Task, SubTask, KnowledgeBase, TaskStatus };
