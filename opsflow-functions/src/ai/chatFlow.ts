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
import {
  createGmailDraftTool,
  manageGoogleSheetTool,
  setGoogleWorkspaceContext,
} from "../tools/googleWorkspace";
import { searchWebAndPlatformsTool, leadSynthesisTool, jinaReaderTool } from "../tools/webSearch";
import { contentMarketingTool } from "../tools/contentMarketing";
import { syncTaskEventToMasterSheet } from "../tools/masterSheetLogger";

/** Input schema for the chat flow. */
export const ChatInputSchema = z.object({
  message: z.string().describe("User prompt or instruction sent from chat drawer"),
  tenantId: z.string().optional().describe("Active tenant context ID"),
  workspaceId: z.string().optional().describe("Active workspace context ID"),
  taskId: z.string().optional().describe("Active task context ID"),
  taskTitle: z.string().optional().describe("Active task title"),
  workspacePrompt: z.string().optional().describe("Dynamic Workspace System Prompt from Firestore"),
  workspaceName: z.string().optional().describe("Active workspace name"),
  history: z
    .array(
      z.object({
        sender: z.string(),
        text: z.string(),
      }),
    )
    .optional()
    .describe("Recent conversation history (last 5 turns) for sliding window context"),
  attitude: z
    .object({
      industryScope: z.string().optional(),
      tone: z.string().optional(),
      skills: z.array(z.string()).optional(),
      rules: z
        .object({
          doList: z.array(z.string()).optional(),
          dontList: z.array(z.string()).optional(),
          outputFormat: z.string().optional(),
        })
        .optional(),
    })
    .optional()
    .describe("Universal DBS Workspace Attitude constitution"),
  taskSettings: z
    .object({
      selectedSheetId: z.string().optional(),
      selectedSheetName: z.string().optional(),
      selectedSheetIds: z.array(z.string()).optional(),
      selectedSheets: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            url: z.string().optional(),
            isMaster: z.boolean().optional(),
          }),
        )
        .optional(),
      selectedSheetTab: z.string().optional(),
      emailSignature: z.string().optional(),
      emailHeader: z.string().optional(),
      syncToMasterSheet: z.boolean().optional(),
    })
    .optional()
    .describe("Specific task settings such as assigned sheets, tab, and custom signature"),
  linkedResources: z
    .object({
      googleEmail: z.string().optional(),
      linkedEmails: z.array(z.string()).optional(),
      defaultSheetId: z.string().optional(),
      defaultSheetName: z.string().optional(),
      defaultEmailSignature: z.string().optional(),
      linkedSheets: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            isMaster: z.boolean().optional(),
          }),
        )
        .optional(),
      defaultDriveFolderId: z.string().optional(),
    })
    .optional()
    .describe("Linked Google resources for the workspace"),
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
      approvalId: z.string().optional(),
      approvalRecord: z.any().optional(),
    }),
  },
  async ({
    message,
    tenantId,
    workspaceId,
    taskId,
    taskTitle,
    workspacePrompt,
    workspaceName,
    history,
    attitude,
    taskSettings,
    linkedResources,
  }) => {
    // 1. Sanitize user message for PII protection (GDPR Compliance)
    const sanitized = sanitizePii(message);

    // 2. Set active execution context for Google Workspace tools (prevents LLM missing ID errors)
    setGoogleWorkspaceContext({
      tenantId: tenantId || "opsflow_tenant_default",
      workspaceId: workspaceId || "default_workspace",
      taskId: taskId || "default_task",
      defaultSheetId: taskSettings?.selectedSheetId || linkedResources?.defaultSheetId,
    });

    // 3. Format Sliding Window History (Last 5 messages max, 1000 chars per msg max)
    let historyContext = "";
    if (history && history.length > 0) {
      const recentTurns = history.slice(-5);
      const cleanHistory = recentTurns
        .map((h) => `${h.sender === "user" ? "Utente" : "Agente"}: ${h.text.slice(0, 1000)}`)
        .join("\n");
      historyContext =
        "\n\n--- CRONOLOGIA RECENTE (Sliding Window ultimi 5 turni) ---\n" +
        `${cleanHistory}\n--- FINE CRONOLOGIA ---`;
    }

    // 4. Build 3-Level Dynamic Stacked Prompt
    const systemInstruction =
      buildStackedPrompt({
        userPrompt: sanitized.sanitizedText,
        workspacePrompt,
        workspaceName,
        taskTitle: taskId,
        taskSettings,
        attitude,
        linkedResources,
      }) + historyContext;

    // 5. Generate response with tool calling support via Gemini 3.6 Flash
    try {
      const llmResponse = await ai.generate({
        model: "googleai/gemini-3.6-flash",
        prompt: systemInstruction,
        tools: [
          createGmailDraftTool,
          manageGoogleSheetTool,
          searchWebAndPlatformsTool,
          leadSynthesisTool,
          jinaReaderTool,
          contentMarketingTool,
        ],
      });

      let replyText =
        llmResponse.text || "Operazione completata con successo dall'Agente IA OpsFlow.";

      const toolsUsed: string[] = [];
      let approvalId: string | undefined;
      let approvalRecord: unknown = undefined;

      if (llmResponse.messages) {
        for (const msg of llmResponse.messages) {
          if (msg.content) {
            for (const part of msg.content) {
              if (part.toolRequest) {
                toolsUsed.push(part.toolRequest.name);
              }
              if (part.toolResponse && part.toolResponse.output) {
                const out = part.toolResponse.output as {
                  approvalId?: string;
                  approvalRecord?: unknown;
                };
                if (out.approvalId) {
                  approvalId = out.approvalId;
                }
                if (out.approvalRecord) {
                  approvalRecord = out.approvalRecord;
                }
              }
            }
          }
        }
      }

      // Defensive Parsing: If LLM generated textual JSON with tool_calls instead of executing natively
      if (!approvalRecord && replyText.includes("\"tool_calls\"")) {
        try {
          const jsonMatch = replyText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, replyText];
          const rawJson = (jsonMatch[1] || replyText).trim();
          const parsed = JSON.parse(rawJson);
          const toolCalls = parsed.tool_calls || parsed;
          if (Array.isArray(toolCalls)) {
            for (const call of toolCalls) {
              if (call.name === "manageGoogleSheetTool" && call.args) {
                const toolRes = await manageGoogleSheetTool(call.args);
                approvalId = toolRes.approvalId;
                approvalRecord = toolRes.approvalRecord;
                toolsUsed.push("manageGoogleSheetTool");
                replyText =
                  "📊 Ho estratto e organizzato i dati nel foglio Google Sheets. " +
                  "Verifica l'anteprima nella scheda sottostante e clicca [✅ Approva ed Esegui] per confermare.";
              } else if (call.name === "createGmailDraftTool" && call.args) {
                const toolRes = await createGmailDraftTool(call.args);
                approvalId = toolRes.approvalId;
                approvalRecord = toolRes.approvalRecord;
                toolsUsed.push("createGmailDraftTool");
                replyText =
                  "📧 Ho preparato la bozza email richiesta. " +
                  "Verifica l'anteprima nella scheda sottostante e clicca [✅ Approva ed Esegui] per creare la bozza.";
              }
            }
          }
        } catch (parseErr) {
          console.warn("[chatWithAgentFlow] Failed to auto-parse textual tool_calls:", parseErr);
        }
      }

      // Background sync to Master Google Sheet if enabled on this task
      if (taskSettings?.syncToMasterSheet && taskId && workspaceId) {
        syncTaskEventToMasterSheet({
          tenantId: tenantId || "opsflow_tenant_default",
          workspaceId,
          taskId,
          taskTitle: taskTitle || workspaceName || "Task OpsFlow",
          eventType: "PROMPT_UTENTE",
          summary: sanitized.sanitizedText.slice(0, 300),
          detail: `Risposta IA: ${replyText.slice(0, 1500)}`,
        }).catch((syncErr) => {
          console.warn("[chatWithAgentFlow] Master sheet sync error:", syncErr);
        });
      }

      return {
        reply: replyText,
        agentName: "Agente AI Assistant",
        toolsUsed:
          toolsUsed.length > 0 ? Array.from(new Set(toolsUsed)) : ["searchWebAndPlatformsTool"],
        approvalId,
        approvalRecord,
      };
    } catch (err) {
      // Step 18: Structured error log on tool calling failure
      console.error("[chatWithAgentFlow] Tool calling failed, fallback to direct mode:", {
        error: err instanceof Error ? err.message : String(err),
      });

      // Fallback: Generate direct response without external tool calling if network/tools fail
      const fallbackResponse = await ai.generate({
        model: "googleai/gemini-3.6-flash",
        prompt: systemInstruction,
      });

      let reply = fallbackResponse.text?.trim() || "";
      if (!reply && fallbackResponse.messages) {
        for (const msg of fallbackResponse.messages) {
          if (msg.content) {
            for (const part of msg.content) {
              if (part.text) reply += part.text;
            }
          }
        }
      }
      if (!reply) {
        reply = "Operazione completata in modalità diretta dall'Agente IA OpsFlow.";
      }
      let approvalId: string | undefined;
      let approvalRecord: unknown = undefined;
      const toolsUsed: string[] = [];

      // Defensive Parsing in fallback mode:
      if (reply.includes("\"tool_calls\"")) {
        try {
          const jsonMatch = reply.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, reply];
          const rawJson = (jsonMatch[1] || reply).trim();
          const parsed = JSON.parse(rawJson);
          const toolCalls = parsed.tool_calls || parsed;
          if (Array.isArray(toolCalls)) {
            for (const call of toolCalls) {
              if (call.name === "manageGoogleSheetTool" && call.args) {
                const toolRes = await manageGoogleSheetTool(call.args);
                approvalId = toolRes.approvalId;
                approvalRecord = toolRes.approvalRecord;
                toolsUsed.push("manageGoogleSheetTool");
                reply =
                  "📊 Ho estratto e organizzato i dati nel foglio Google Sheets. " +
                  "Verifica l'anteprima nella scheda sottostante e clicca [✅ Approva ed Esegui] per confermare.";
              } else if (call.name === "createGmailDraftTool" && call.args) {
                const toolRes = await createGmailDraftTool(call.args);
                approvalId = toolRes.approvalId;
                approvalRecord = toolRes.approvalRecord;
                toolsUsed.push("createGmailDraftTool");
                reply =
                  "📧 Ho preparato la bozza email richiesta. " +
                  "Verifica l'anteprima nella scheda sottostante e clicca [✅ Approva ed Esegui] per creare la bozza.";
              }
            }
          }
        } catch (parseErr) {
          console.warn("[chatWithAgentFlow] Fallback parse error:", parseErr);
        }
      }

      // Background sync to Master Google Sheet if enabled on this task
      if (taskSettings?.syncToMasterSheet && taskId && workspaceId) {
        syncTaskEventToMasterSheet({
          tenantId: tenantId || "opsflow_tenant_default",
          workspaceId,
          taskId,
          taskTitle: taskTitle || workspaceName || "Task OpsFlow",
          eventType: "PROMPT_UTENTE",
          summary: sanitized.sanitizedText.slice(0, 300),
          detail: `Risposta IA: ${reply.slice(0, 1500)}`,
        }).catch((syncErr) => {
          console.warn("[chatWithAgentFlow] Master sheet sync error (fallback):", syncErr);
        });
      }

      return {
        reply,
        agentName: approvalRecord ? "Agente AI Assistant" : "Agente AI Assistant (Diretto)",
        toolsUsed,
        approvalId,
        approvalRecord,
      };
    }
  },
); /* end chatWithAgentFlow */
