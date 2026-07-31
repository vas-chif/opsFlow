/**
 * @file processTaskFlow.ts
 * @description Firestore-triggered agent: creates SubTasks for new Tasks using Gemini, respecting PII sanitization
 * @author Vasile Chifeac
 * @created 2026-07-16
 * @modified 2026-07-16
 *
 * @notes
 * - Trigger: onCreate at /tenants/{tenantId}/tasks/{taskId}
 * - Calls Gemini via Genkit after sanitizing input
 * - Writes SubTasks collection + updates aiMetadata
 *
 * @dependencies
 * - firebase-admin, firebase-functions, genkit
 * - sanitizeForAI utility
 *
 * @performance
 * - 1 write per SubTask + 1 update (batch)
 * - Cost: 1 Gemini call per task creation
 */

// ── Firebase ─────────────────────────────────────────────────────────────────
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";

// ── Types ────────────────────────────────────────────────────────────────────
export interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  tenantId: string;
  assignedTo: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  aiMetadata: {
    complexityScore: number;
    suggestedCategory: string;
    confidence: number;
    modelVersion: string;
    lastAnalyzed: Date | null;
  };
}

export interface SubTask {
  id: string;
  taskId: string;
  title: string;
  description: string;
  order: number;
  completed: boolean;
  tenantId: string;
  createdAt: Date | null;
}

// ── Utils ────────────────────────────────────────────────────────────────────
import { sanitizeForAI } from "../utils/privacy";

// ── Genkit ───────────────────────────────────────────────────────────────────
import { ai } from "../genkit";

// ── Initialization ───────────────────────────────────────────────────────────
admin.initializeApp();
const db = admin.firestore();

// ── Prompt Template ──────────────────────────────────────────────────────────
const PROMPT_TEMPLATE = (safeTask: Task) =>
  `You are an expert task planner. Break the task below into 3-7 concrete subtasks. Return ONLY a JSON array with objects having keys: title, description, order (integer starting from 1). Do not include PII. Task JSON: ${JSON.stringify(safeTask)}`;

// ── Flow Definition ─────────────────────────────────────────────────────────
export const processTaskFlow = onDocumentCreated(
  "tenants/{tenantId}/tasks/{taskId}",
  async (event) => {
    if (!event.data) return;
    const task = event.data.data() as Task;
    const tenantId = event.params.tenantId;
    const taskId = event.params.taskId;

    // 1. Sanitize before sending to LLM
    const safeTask = sanitizeForAI(task) as unknown as Task;

    // 2. Ask Gemini to plan subtasks
    const response = await ai.generate(PROMPT_TEMPLATE(safeTask));
    const content = response.text;

    let items: Array<{ title: string; description: string; order: number }>;
    try {
      items = JSON.parse(content);
    } catch {
      logger.warn("processTaskFlow: Invalid AI response", content);
      return;
    }

    if (!event.data) return;

    // 3. Batch write: subtasks + aiMetadata update
    const batch = db.batch();
    const subtasksCol = db.collection(`tenants/${tenantId}/subtasks`);
    const now = admin.firestore.FieldValue.serverTimestamp();

    for (const item of items) {
      const id = `st_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const docRef = subtasksCol.doc(id);
      const sub: Omit<SubTask, "createdAt"> & {
        createdAt: admin.firestore.FieldValue;
      } = {
        id,
        taskId,
        title: item.title,
        description: item.description,
        order: item.order,
        completed: false,
        tenantId,
        createdAt: now,
      };
      batch.set(docRef, sub);
    }

    // Update task aiMetadata
    const aiMetadata: Task["aiMetadata"] = {
      complexityScore: Math.min(items.length, 10),
      suggestedCategory: "auto-generated",
      confidence: 0.85,
      modelVersion: "gemini-1.5-flash",
      lastAnalyzed: now as any,
    };
    if (!event.data) return;
    batch.update(event.data.ref, { aiMetadata });

    await batch.commit();
    logger.info("processTaskFlow: Created subtasks", {
      taskId,
      count: items.length,
    });
  },
); /*end processTaskFlow*/
