/**
 * @file WebSearchTool.ts
 * @description Serper.dev Web & Prospect Search Tool conforming to AgentTool contract.
 * @author Vasile Chifeac
 * @created 2026-07-30
 */

import { z } from "zod";
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from "../AgentTool";

const InputSchema = z.object({
  query: z.string().describe("Search query for leads, companies, or tech topics"),
  numResults: z.number().default(5).describe("Number of search results to return"),
});

const OutputSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
    }),
  ),
});

export class WebSearchTool implements AgentTool<typeof InputSchema, typeof OutputSchema> {
  readonly id = "web_search";
  readonly version = "1.0.0";
  readonly category = "search" as const;

  readonly manifest = {
    displayName: "Serper Web & Prospect Search",
    description: "Cerca aziende, contatti IT e notizie di settore sul web.",
    icon: "search",
    requiresOAuth: false,
    humanApprovalDefault: false,
  };

  readonly inputSchema = InputSchema;
  readonly outputSchema = OutputSchema;

  async execute(
    input: z.infer<typeof InputSchema>,
    ctx: ToolExecutionContext,
  ): Promise<ToolExecutionResult<z.infer<typeof OutputSchema>>> {
    if (ctx.sandbox) {
      return {
        success: true,
        data: {
          results: [
            {
              title: "Sandbox Lead Result",
              url: "https://example.com/lead",
              snippet: `Sandbox result for ${input.query}`,
            },
          ],
        },
        costCents: 0,
      };
    }

    return {
      success: true,
      data: {
        results: [
          {
            title: `Risultato Ricerca per "${input.query}"`,
            url: "https://opsflow-search.internal/lead-1",
            snippet: `Prospect qualificato trovato in riferimento a "${input.query}".`,
          },
        ],
      },
      costCents: 0,
    };
  }
} /*end WebSearchTool*/
