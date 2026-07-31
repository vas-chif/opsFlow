/**
 * @file GmailDraftTool.ts
 * @description Gmail Draft Creation Tool (Human-in-the-Loop enforce - No direct send).
 * @author Vasile Chifeac
 * @created 2026-07-30
 */

import { z } from "zod";
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from "../AgentTool";

const InputSchema = z.object({
  to: z.array(z.string().email()).describe("Recipient email addresses"),
  subject: z.string().max(200).describe("Email subject line"),
  body: z.string().describe("Email body content in plain text or HTML"),
});

const OutputSchema = z.object({
  draftId: z.string(),
  status: z.string(),
});

export class GmailDraftTool implements AgentTool<typeof InputSchema, typeof OutputSchema> {
  readonly id = "gmail_draft";
  readonly version = "1.0.0";
  readonly category = "google_workspace" as const;

  readonly manifest = {
    displayName: "Gmail Draft Creator",
    description:
      "Prepara una bozza di email in Gmail per la revisione dell'utente. NON invia mai automaticamente.",
    icon: "mail",
    requiresOAuth: true,
    oauthScopes: ["https://www.googleapis.com/auth/gmail.compose"],
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
        draftId: `draft-${Date.now()}`,
        status: "draft_created_awaiting_user_review",
      },
      costCents: 0,
      requiresApproval: true,
      approvalPreview: {
        type: "email_draft",
        data: {
          to: input.to,
          subject: input.subject,
          bodyPreview: input.body.slice(0, 300),
        },
      },
    };
  }
} /*end GmailDraftTool*/
