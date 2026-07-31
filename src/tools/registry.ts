/**
 * @file registry.ts
 * @description Central Tool Registry for OpsFlow Agent Tools & Plugins.
 * @author Vasile Chifeac
 * @created 2026-07-30
 */

import type { AgentTool } from "./AgentTool";
import { GmailDraftTool } from "./implementations/GmailDraftTool";
import { GoogleSheetsTool } from "./implementations/GoogleSheetsTool";
import { WebSearchTool } from "./implementations/WebSearchTool";
import { JinaReaderTool } from "./implementations/JinaReaderTool";

const ALL_TOOLS: AgentTool[] = [
  new GmailDraftTool(),
  new GoogleSheetsTool(),
  new WebSearchTool(),
  new JinaReaderTool(),
];

export const toolRegistry = {
  /**
   * Retrieves all registered agent tools.
   * @returns {AgentTool[]} Array of all registered tools
   */
  getAll(): AgentTool[] {
    return ALL_TOOLS;
  },

  /**
   * Retrieves a registered tool by its unique ID.
   * @param {string} id - Unique tool ID
   * @returns {AgentTool | undefined} Tool instance if found
   */
  getById(id: string): AgentTool | undefined {
    return ALL_TOOLS.find((t) => t.id === id);
  },

  /**
   * Filter tools enabled for a specific workspace.
   * @param {string[]} enabledToolIds - Array of enabled tool IDs
   * @returns {AgentTool[]} Filtered agent tools
   */
  getEnabledTools(enabledToolIds: string[]): AgentTool[] {
    return ALL_TOOLS.filter((t) => enabledToolIds.includes(t.id));
  },
};
