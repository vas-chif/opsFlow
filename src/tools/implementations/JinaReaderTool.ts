/**
 * @file JinaReaderTool.ts
 * @description Free Web Scraping & Page-to-Markdown tool via Jina AI Reader (r.jina.ai).
 * @author Vasile Chifeac
 * @created 2026-07-30
 */

import { z } from "zod";
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from "../AgentTool";

const InputSchema = z.object({
  url: z.string().url().describe("Target webpage or public profile URL to scrape"),
});

const OutputSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  markdownContent: z.string(),
});

export class JinaReaderTool implements AgentTool<typeof InputSchema, typeof OutputSchema> {
  readonly id = "jina_reader";
  readonly version = "1.0.0";
  readonly category = "search" as const;

  readonly manifest = {
    displayName: "Jina AI Web Reader (Scraper Gratuito)",
    description:
      "Converte qualsiasi URL o profilo pubblico in testo Markdown pulito ed ottimizzato per l'IA a costo zero.",
    icon: "auto_stories",
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
          url: input.url,
          title: "Sandbox Scraped Page",
          markdownContent: `# Sandbox Content\nScraped content from ${input.url}`,
        },
        costCents: 0,
      };
    }

    try {
      const targetUrl = `https://r.jina.ai/${input.url}`;
      const response = await fetch(targetUrl, {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          "X-No-Cache": "true",
        },
      });

      if (!response.ok) {
        throw new Error(`Jina Reader HTTP error: ${response.status}`);
      }

      const text = await response.text();
      return {
        success: true,
        data: {
          url: input.url,
          markdownContent: text.slice(0, 15000),
        },
        costCents: 0,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        costCents: 0,
      };
    }
  }
} /*end JinaReaderTool*/
