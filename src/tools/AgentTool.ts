/**
 * @file AgentTool.ts
 * @description Standard contract interface for OpsFlow Agent Tools & Plugins.
 * @author Vasile Chifeac
 * @created 2026-07-30
 */

import type { z } from "zod";

export type ToolCategory =
  | "google_workspace"
  | "communication"
  | "search"
  | "data"
  | "content"
  | "webhook"
  | "internal";

export interface ToolManifest {
  displayName: string;
  description: string;
  icon: string;
  requiresOAuth: boolean;
  oauthScopes?: string[];
  humanApprovalDefault: boolean;
}

export interface ToolExecutionContext {
  taskId?: string;
  workspaceId?: string;
  tenantId?: string;
  userId?: string;
  toolConfig?: Record<string, unknown>;
  sandbox?: boolean;
}

export interface ToolExecutionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  costCents?: number;
  requiresApproval?: boolean;
  approvalPreview?: {
    type: string;
    data: Record<string, unknown>;
  };
}

export interface AgentTool<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput extends z.ZodTypeAny = z.ZodTypeAny,
> {
  readonly id: string;
  readonly version: string;
  readonly category: ToolCategory;
  readonly manifest: ToolManifest;
  readonly inputSchema: TInput;
  readonly outputSchema: TOutput;
  execute(
    input: z.infer<TInput>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<z.infer<TOutput>>>;
  canExecute?(context: ToolExecutionContext): Promise<{ ok: boolean; reason?: string }>;
}
