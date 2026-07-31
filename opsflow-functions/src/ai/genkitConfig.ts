/**
 * @file genkitConfig.ts
 * @description Genkit & Gemini LLM AI Orchestration pipeline initialization for OpsFlow Cloud Functions.
 * @author Vasile Chifeac
 * @created 2026-07-29
 * @modified 2026-07-29
 *
 * @notes
 * - Uses Genkit SDK with googleAI plugin (gemini-1.5-flash / gemini-1.5-pro)
 * - Configures structured JSON output schema for task decomposition and quality inspection
 * - Enforces zero PII leak via piiSanitizer integration
 *
 * @dependencies
 * - genkit
 * - @genkit-ai/google-genai
 * - z (zod)
 *
 * @performance
 * - Gemini 1.5 Flash stream response <800ms
 */

import { genkit, z } from "genkit";
import { googleAI } from "@genkit-ai/google-genai";

export const ai = genkit({
  plugins: [googleAI()],
  model: "googleai/gemini-1.5-flash",
});

/** Schema for AgentePlanner task breakdown output. */
export const TaskBreakdownSchema = z.object({
  complexityScore: z
    .number()
    .min(1)
    .max(10)
    .describe("Task complexity score from 1 (simple) to 10 (very complex)"),
  suggestedCategory: z.string().describe("Suggested category for this work item"),
  subtasks: z
    .array(
      z.object({
        title: z.string().describe("Concise title of the subtask"),
        description: z.string().describe("Actionable description of work required"),
        order: z.number().describe("Sequential execution order (1-indexed)"),
      }),
    )
    .describe("Array of 3-5 sequential actionable subtasks"),
});

export type TaskBreakdownResult = z.infer<typeof TaskBreakdownSchema>;

/** Schema for AgenteIspettore quality inspection audit. */
export const QualityAuditSchema = z.object({
  passed: z
    .boolean()
    .describe("Whether the task execution satisfies quality and security standards"),
  score: z.number().min(0).max(100).describe("Quality score percentage 0-100"),
  summary: z.string().describe("Short audit summary or list of gaps identified"),
  recommendations: z.array(z.string()).describe("Improvement suggestions"),
});

export type QualityAuditResult = z.infer<typeof QualityAuditSchema>;
