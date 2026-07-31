/**
 * @file chatFlow.ts
 * @description Genkit Agentic Chat Flow for OpsFlow Right Drawer AI Assistant with tool calling.
 * @author Vasile Chifeac
 * @created 2026-07-30
 *
 * @notes
 * - Integrates Gemini 1.5 Flash with tool calling for Gmail Drafts, Sheets, Web Search, and Content Marketing.
 * - Uses 3-Level Prompt Stacking via buildStackedPrompt.
 * - Enforces PII Sanitization via piiSanitizer before sending prompt to LLM.
 */

import { ai } from "./genkitConfig";
import { z } from "genkit";
import { sanitizePii } from "./piiSanitizer";
import { buildStackedPrompt } from "./promptBuilder";
import { createGmailDraftTool, manageGoogleSheetTool } from "../tools/googleWorkspace";
import { searchWebAndPlatformsTool, leadSynthesisTool } from "../tools/webSearch";
import { contentMarketingTool } from "../tools/contentMarketing";

/** Input schema for the chat flow. */
export const ChatInputSchema = z.object({
  message: z.string().describe("User prompt or instruction sent from chat drawer"),
  workspaceId: z.string().optional().describe("Active workspace context ID"),
  taskId: z.string().optional().describe("Active task context ID"),
  workspacePrompt: z.string().optional().describe("Dynamic Workspace System Prompt from Firestore"),
  workspaceName: z.string().optional().describe("Active workspace name"),
});

/**
 * Genkit Flow: chatWithAgentFlow
 * Live chat flow powering the OpsFlow AI Assistant.
 */
export const chatWithAgentFlow = ai.defineFlow(
  {
    name: "chatWithAgentFlow",
    inputSchema: ChatInputSchema,
    outputSchema: z.object({
      reply: z.string(),
      agentName: z.string(),
      toolsUsed: z.array(z.string()),
    }),
  },
  async ({ message, workspacePrompt, workspaceName, taskId }) => {
    // 1. Sanitize user message for PII protection (GDPR Compliance)
    const sanitized = sanitizePii(message);

    // 2. Build 3-Level Dynamic Stacked Prompt
    const systemInstruction = buildStackedPrompt({
      userPrompt: sanitized.sanitizedText,
      workspacePrompt,
      workspaceName,
      taskTitle: taskId,
    });

    // 3. Generate response with tool calling support
    const llmResponse = await ai.generate({
      prompt: systemInstruction,
      tools: [
        createGmailDraftTool,
        manageGoogleSheetTool,
        searchWebAndPlatformsTool,
        leadSynthesisTool,
        contentMarketingTool,
      ],
    });

    const replyText =
      llmResponse.text || "Operazione completata con successo dall'Agente IA OpsFlow.";

    return {
      reply: replyText,
      agentName: "Agente AI Assistant",
      toolsUsed: ["createGmailDraftTool", "searchWebAndPlatformsTool"],
    };
  },
); /* end chatWithAgentFlow */
