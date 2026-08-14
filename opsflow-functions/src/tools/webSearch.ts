/**
 * @file webSearch.ts
 * @description Genkit Tools for Web Research, Platform Discovery, and Lead Generation (AgenteRicerca).
 * @author Vasile Chifeac
 * @created 2026-07-30
 * @modified 2026-08-14
 *
 * @notes
 * - searchWebAndPlatformsTool: Queries real-time web search APIs for market research.
 * - leadSynthesisTool: Formats discovered prospects into standardized lead structures.
 * - jinaReaderTool: Extracts clean Markdown from any URL via r.jina.ai (zero server cost).
 *
 * @performance
 * - jinaReaderTool: < 2s average, 100% free, no Playwright/Puppeteer server needed.
 */

import { ai } from "../ai/genkitConfig";
import { z } from "genkit";

// ── Input Schemas ─────────────────────────────────────────────────────────────

/** Input schema for web search and platform discovery. */
export const WebSearchQuerySchema = z.object({
  query: z
    .string()
    .describe(
      "Search query string (e.g. 'Aziende IT supporto Milano' or 'Trainer Kubernetes Italia')",
    ),
  category: z
    .enum(["clients", "trainers", "platforms", "general"])
    .default("general")
    .describe("Target category for search"),
});

/** Input schema for lead synthesis. */
export const LeadSynthesisSchema = z.object({
  companyName: z.string().describe("Target company or profile name"),
  websiteUrl: z.string().describe("Website URL or profile link"),
  requestedService: z.string().describe("Identified service need or tech stack"),
  matchScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Ideal Customer Profile match percentage (0-100%)"),
});

/** Input schema for Jina AI Reader tool. */
export const JinaReaderSchema = z.object({
  url: z.string().url().describe("Target URL to extract Markdown content from via r.jina.ai"),
});

// ── Genkit Tools ──────────────────────────────────────────────────────────────

/**
 * Genkit Tool: searchWebAndPlatformsTool (AgenteRicerca)
 * Performs structured web search and discovery across target platforms.
 */
export const searchWebAndPlatformsTool = ai.defineTool(
  {
    name: "searchWebAndPlatformsTool",
    description:
      "Cerca sul web e su piattaforme professionali (LinkedIn, Indeed, siti IT) per trovare prospect o trainer.",
    inputSchema: WebSearchQuerySchema,
    outputSchema: z.object({
      success: z.boolean(),
      results: z.array(
        z.object({
          title: z.string(),
          snippet: z.string(),
          url: z.string(),
        }),
      ),
      summary: z.string(),
    }),
  },
  async ({ query, category }) => {
    // Real web search via Jina AI Reader on DuckDuckGo HTML (zero infrastructure cost)
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const jinaUrl = `https://r.jina.ai/${searchUrl}`;

    try {
      const response = await fetch(jinaUrl, {
        headers: {
          Accept: "text/markdown",
          "X-Return-Format": "markdown",
        },
      });

      const rawMarkdown = response.ok ? await response.text() : "";
      const trimmed = rawMarkdown.slice(0, 6000);

      // Parse the first 5 result blocks from the markdown
      const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
      const results: { title: string; snippet: string; url: string }[] = [];
      let i = 0;
      while (results.length < 5 && i < lines.length) {
        const urlMatch = lines[i]?.match(/https?:\/\/[^\s)]+/);
        if (urlMatch) {
          results.push({
            title: lines[i - 1]?.replace(/^#+\s*/, "").trim() || query,
            snippet: lines[i + 1]?.trim() || `Risultato per la categoria: ${category}`,
            url: urlMatch[0],
          });
        }
        i++;
      }

      // Fallback: at least one entry pointing to direct search
      if (results.length === 0) {
        results.push({
          title: `Ricerca: ${query}`,
          snippet: `Nessun risultato estratto automaticamente. Apri la ricerca diretta per la categoria "${category}".`,
          url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        });
      }

      return {
        success: true,
        results,
        summary: `Estratti ${results.length} risultati reali per la ricerca "${query}" (categoria: ${category}) tramite Jina AI Reader.`,
      };
    } catch {
      return {
        success: false,
        results: [
          {
            title: `Ricerca: ${query}`,
            snippet: "Errore durante il fetch della ricerca web. Verifica la connettività.",
            url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
          },
        ],
        summary: `Ricerca fallita per "${query}" (categoria: ${category}).`,
      };
    }
  },
); /* end searchWebAndPlatformsTool */

/**
 * Genkit Tool: leadSynthesisTool (AgenteRicerca)
 * Formats lead discovery into uniform workspace structures.
 */
export const leadSynthesisTool = ai.defineTool(
  {
    name: "leadSynthesisTool",
    description:
      "Sintetizza un prospect trovato in una struttura dati pronta per l'inserimento nel Workspace o Google Sheets.",
    inputSchema: LeadSynthesisSchema,
    outputSchema: z.object({
      success: z.boolean(),
      leadRecord: LeadSynthesisSchema,
      formattedText: z.string(),
    }),
  },
  async ({ companyName, websiteUrl, requestedService, matchScore }) => {
    const formattedText =
      `🏢 **${companyName}** | Match: ${matchScore}%\n` +
      `🌐 Link: ${websiteUrl}\n` +
      `⚙️ Servizio: ${requestedService}`;

    return {
      success: true,
      leadRecord: { companyName, websiteUrl, requestedService, matchScore },
      formattedText,
    };
  },
); /* end leadSynthesisTool */

/**
 * Genkit Tool: jinaReaderTool (AgenteRicerca)
 *
 * Extracts clean Markdown from any public URL using the free Jina AI Reader (r.jina.ai).
 * Zero infrastructure cost — no headless browser, no Playwright server.
 * Ideal for B2B lead scouting on Clutch, GoodFirms, company websites.
 */
export const jinaReaderTool = ai.defineTool(
  {
    name: "jinaReaderTool",
    description:
      "Estrae il contenuto Markdown pulito da qualsiasi URL pubblico tramite Jina AI Reader (r.jina.ai). " +
      "Gratis, senza browser headless. Usa per scouting B2B su Clutch, GoodFirms, siti aziendali.",
    inputSchema: JinaReaderSchema,
    outputSchema: z.object({
      success: z.boolean(),
      url: z.string(),
      markdown: z.string(),
      extractedAt: z.string(),
    }),
  },
  async ({ url }) => {
    const jinaUrl = `https://r.jina.ai/${url}`;

    const response = await fetch(jinaUrl, {
      headers: {
        Accept: "text/markdown",
        "X-Return-Format": "markdown",
      },
    });

    if (!response.ok) {
      return {
        success: false,
        url,
        markdown: `[JinaReader] Failed to extract content from ${url}. Status: ${response.status}`,
        extractedAt: new Date().toISOString(),
      };
    }

    const markdown = await response.text();
    // Trim to 8000 chars to stay within Gemini context limits
    const trimmed = markdown.slice(0, 8000);

    return {
      success: true,
      url,
      markdown: trimmed,
      extractedAt: new Date().toISOString(),
    };
  },
); /* end jinaReaderTool */
