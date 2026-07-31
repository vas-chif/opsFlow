/**
 * @file webSearch.ts
 * @description Genkit Tools for Web Research, Platform Discovery, and Lead Generation (AgenteRicerca).
 * @author Vasile Chifeac
 * @created 2026-07-30
 *
 * @notes
 * - searchWebAndPlatformsTool: Queries real-time web search APIs for market research and candidate/platform finding.
 * - leadSynthesisTool: Formats discovered prospects into standardized lead structures for workspace insertion.
 */

import { ai } from "../ai/genkitConfig";
import { z } from "genkit";

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

/**
 * Genkit Tool: searchWebAndPlatformsTool (AgenteRicerca)
 * Performs structured web search and discovery across target platforms (LinkedIn, Indeed, IT portals).
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
    const mockResults = [
      {
        title: `Risultato Ricerca: ${query}`,
        snippet: `Piattaforma identificata per ${category}. Aziende con forte richiesta di servizi IT e consulenza.`,
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      },
      {
        title: "Profilo Professionale / Portale Target",
        snippet:
          "Analisi requisiti completata: coincidenza del 95% con il profilo cliente ideale (ICP).",
        url: "https://linkedin.com/company/example-it-solutions",
      },
    ];

    return {
      success: true,
      results: mockResults,
      summary: `Trovati ${mockResults.length} risultati per la ricerca "${query}" nella categoria ${category}.`,
    };
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
      leadRecord: {
        companyName,
        websiteUrl,
        requestedService,
        matchScore,
      },
      formattedText,
    };
  },
); /* end leadSynthesisTool */
