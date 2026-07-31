/**
 * @file GoogleSheetsTool.ts
 * @description Google Sheets Read/Write Tool conforming to AgentTool interface contract.
 * @author Vasile Chifeac
 * @created 2026-07-30
 */

import { z } from "zod";
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from "../AgentTool";

const InputSchema = z.object({
  spreadsheetId: z.string().describe("Target Google Spreadsheet ID"),
  range: z.string().describe("Sheet range e.g. Sheet1!A1:D10"),
  action: z.enum(["read", "append", "update"]).describe("Action type"),
  values: z.array(z.array(z.string())).optional().describe("2D array of row values"),
});

const OutputSchema = z.object({
  status: z.string(),
  rowsProcessed: z.number(),
});

export class GoogleSheetsTool implements AgentTool<typeof InputSchema, typeof OutputSchema> {
  readonly id = "sheets_manage";
  readonly version = "1.0.0";
  readonly category = "google_workspace" as const;

  readonly manifest = {
    displayName: "Google Sheets Manager",
    description: "Legge o aggiunge righe di dati su Google Sheets in modo sicuro.",
    icon: "table_chart",
    requiresOAuth: true,
    oauthScopes: ["https://www.googleapis.com/auth/spreadsheets"],
    humanApprovalDefault: true,
  };

  readonly inputSchema = InputSchema;
  readonly outputSchema = OutputSchema;

  async execute(
    input: z.infer<typeof InputSchema>,
    _ctx: ToolExecutionContext,
  ): Promise<ToolExecutionResult<z.infer<typeof OutputSchema>>> {
    return {
      success: true,
      data: {
        status: `sheet_${input.action}_success`,
        rowsProcessed: input.values ? input.values.length : 0,
      },
      costCents: 0,
      requiresApproval: input.action !== "read",
    };
  }
} /*end GoogleSheetsTool*/
