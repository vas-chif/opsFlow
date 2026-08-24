/**
 * @file webSearch.ts
 * @description Genkit Tools for Web Research, Platform Discovery, and Lead Generation (AgenteRicerca).
 *   Multi-Provider Chaining: Tavily AI → Exa.ai → Jina Search API → Safe Empty Result.
 *   Zero HTTP 500 guarantee — all exceptions are converted to structured data.
 * @author Vasile Chifeac
 * @created 2026-07-30
 * @modified 2026-08-24
 *
 * @notes
 * - searchWebAndPlatformsTool: Multi-provider chaining with AbortController (6s hard timeout per provider).
 * - leadSynthesisTool: Formats discovered prospects into standardized lead structures.
 * - jinaReaderTool: Extracts clean Markdown from any URL via r.jina.ai (zero server cost).
 * - art14NoticeDueBy: GDPR Art. 14 compliance — ISO timestamp +30 days from search.
 *
 * @dependencies
 * - process.env.TAVILY_API_KEY — Tavily AI Search (1.000 req/mo, no credit card)
 * - process.env.EXA_API_KEY   — Exa.ai Neural Search (~1.400 req/mo, no credit card)
 * - https://s.jina.ai/         — Jina Search API (1M token free tier)
 *
 * @performance
 * - Hard timeout per provider: 6.000 ms (AbortController)
 * - Token budget: slice to 3.000 chars per URL extract (<800 tokens)
 * - Graceful degradation: never throws, always returns { success: false, results: [] } on total failure
 * - GDPR Art. 32: No PII logged in production
 */

import { ai } from "../ai/genkitConfig";
import { z } from "genkit";
import * as logger from "firebase-functions/logger";

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDER_TIMEOUT_MS = 6_000;
const MAX_TEXT_CHARS = 3_000;
const MAX_RESULTS_PER_QUERY = 5;

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

// ── Shared Output Item Type ───────────────────────────────────────────────────

interface SearchResultItem {
  title: string;
  snippet: string;
  url: string;
}

// ── Helper: Hard-Timeout Fetch ────────────────────────────────────────────────

/**
 * Performs a fetch with an AbortController-based hard timeout.
 * Returns null (never throws) on timeout or network errors.
 * @param {string} url - The URL to fetch.
 * @param {RequestInit} options - Optional fetch init options (method, headers, body).
 * @param {number} timeoutMs - Hard timeout in milliseconds before aborting.
 * @returns {Promise<Response | null>} The fetch Response, or null on timeout/error.
 */
async function fetchWithHardTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = PROVIDER_TIMEOUT_MS,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
} /* end fetchWithHardTimeout */

// ── Provider 1: Tavily AI Search ──────────────────────────────────────────────

/**
 * Queries Tavily AI Search API.
 * Free tier: 1.000 requests/month — no credit card required.
 * Returns null on any failure (caller handles fallback).
 * @param {string} query - The search query string.
 * @param {string} apiKey - Tavily AI API key from process.env.TAVILY_API_KEY.
 * @returns {Promise<SearchResultItem[] | null>} Structured results, or null on failure.
 */
async function searchTavily(query: string, apiKey: string): Promise<SearchResultItem[] | null> {
  const res = await fetchWithHardTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: MAX_RESULTS_PER_QUERY }),
  });

  if (!res || !res.ok) return null;

  try {
    const data = (await res.json()) as {
      results?: { title?: string; content?: string; url?: string }[];
    };
    if (!Array.isArray(data.results) || data.results.length === 0) return null;
    return data.results.map((r) => ({
      title: r.title || query,
      snippet: (r.content || "").slice(0, MAX_TEXT_CHARS),
      url: r.url || "",
    }));
  } catch {
    return null;
  }
} /* end searchTavily */

// ── Provider 2: Exa.ai Neural Search ─────────────────────────────────────────

/**
 * Queries Exa.ai Neural Search API.
 * Free tier: ~1.400 requests/month credit — no credit card required.
 * Returns null on any failure (caller handles fallback).
 * @param {string} query - The search query string.
 * @param {string} apiKey - Exa.ai API key from process.env.EXA_API_KEY.
 * @returns {Promise<SearchResultItem[] | null>} Structured results, or null on failure.
 */
async function searchExa(query: string, apiKey: string): Promise<SearchResultItem[] | null> {
  const res = await fetchWithHardTimeout("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ query, numResults: MAX_RESULTS_PER_QUERY, contents: { text: true } }),
  });

  if (!res || !res.ok) return null;

  try {
    const data = (await res.json()) as {
      results?: { title?: string; text?: string; url?: string }[];
    };
    if (!Array.isArray(data.results) || data.results.length === 0) return null;
    return data.results.map((r) => ({
      title: r.title || query,
      snippet: (r.text || "").slice(0, MAX_TEXT_CHARS),
      url: r.url || "",
    }));
  } catch {
    return null;
  }
} /* end searchExa */

// ── Provider 3: Jina Search API ───────────────────────────────────────────────

/**
 * Queries Jina Search API (official s.jina.ai endpoint).
 * Free tier: 1M tokens — no credit card required.
 * Returns null on any failure (caller handles fallback).
 * @param {string} query - The search query string.
 * @returns {Promise<SearchResultItem[] | null>} Structured results parsed from Markdown, or null on failure.
 */
async function searchJina(query: string): Promise<SearchResultItem[] | null> {
  const jinaUrl = `https://s.jina.ai/${encodeURIComponent(query)}`;

  const res = await fetchWithHardTimeout(jinaUrl, {
    headers: { Accept: "text/markdown", "X-Return-Format": "markdown" },
  });

  if (!res || !res.ok) return null;

  try {
    const rawText = await res.text();
    const trimmed = rawText.slice(0, MAX_TEXT_CHARS);
    const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
    const results: SearchResultItem[] = [];
    let i = 0;
    while (results.length < MAX_RESULTS_PER_QUERY && i < lines.length) {
      const urlMatch = lines[i]?.match(/https?:\/\/[^\s)]+/);
      if (urlMatch) {
        results.push({
          title: lines[i - 1]?.replace(/^#+\s*/, "").trim() || query,
          snippet: lines[i + 1]?.trim() || `Risultato Jina per: ${query}`,
          url: urlMatch[0],
        });
      }
      i++;
    }
    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
} /* end searchJina */

// ── Genkit Tools ──────────────────────────────────────────────────────────────

/**
 * Genkit Tool: searchWebAndPlatformsTool (AgenteRicerca)
 *
 * Multi-Provider Chaining with Zero HTTP 500 Guarantee:
 * Tavily AI → Exa.ai → Jina Search API → Safe Empty Result.
 *
 * GDPR Art. 14: Includes art14NoticeDueBy (+30 days) in every response.
 *
 * @security Never throws — all providers return null on failure, never propagate exceptions.
 * @performance Hard timeout 6s per provider. Total worst-case: ~18s (well within 60s CF timeout).
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
      providerUsed: z.string(),
      art14NoticeDueBy: z.string().describe("GDPR Art. 14 notice expiry — ISO date +30 days"),
    }),
  },
  async ({ query, category }) => {
    // GDPR Art. 14: calculate +30-day notice expiry for any personal data extracted
    const art14NoticeDueBy = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const tavilyKey = process.env.TAVILY_API_KEY || "";
    const exaKey = process.env.EXA_API_KEY || "";

    // --- Tier 1: Tavily AI Search ---
    if (tavilyKey) {
      const tavilyResults = await searchTavily(query, tavilyKey);
      if (tavilyResults && tavilyResults.length > 0) {
        logger.info("searchWebAndPlatformsTool: Tavily AI success", { query, category });
        return {
          success: true,
          results: tavilyResults,
          summary: `Tavily AI: ${tavilyResults.length} risultati per "${query}" (${category}).`,
          providerUsed: "tavily",
          art14NoticeDueBy,
        };
      }
    }

    // --- Tier 2: Exa.ai Neural Search ---
    if (exaKey) {
      const exaResults = await searchExa(query, exaKey);
      if (exaResults && exaResults.length > 0) {
        logger.info("searchWebAndPlatformsTool: Exa.ai success", { query, category });
        return {
          success: true,
          results: exaResults,
          summary: `Exa.ai: ${exaResults.length} risultati neurali per "${query}" (${category}).`,
          providerUsed: "exa",
          art14NoticeDueBy,
        };
      }
    }

    // --- Tier 3: Jina Search API ---
    const jinaResults = await searchJina(query);
    if (jinaResults && jinaResults.length > 0) {
      logger.info("searchWebAndPlatformsTool: Jina Search success", { query, category });
      return {
        success: true,
        results: jinaResults,
        summary: `Jina Search: ${jinaResults.length} risultati per "${query}" (${category}).`,
        providerUsed: "jina",
        art14NoticeDueBy,
      };
    }

    // --- Tier 4: Safe Empty Result (Zero Crash Guarantee) ---
    logger.warn("searchWebAndPlatformsTool: All providers failed — returning safe empty result", {
      query,
      category,
    });
    return {
      success: false,
      results: [],
      summary: `Ricerca temporaneamente non disponibile per "${query}". Riprova tra qualche istante.`,
      providerUsed: "none",
      art14NoticeDueBy,
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

    const response = await fetchWithHardTimeout(jinaUrl, {
      headers: { Accept: "text/markdown", "X-Return-Format": "markdown" },
    });

    if (!response || !response.ok) {
      return {
        success: false,
        url,
        markdown: `[JinaReader] Failed to extract content from ${url}. Status: ${response?.status ?? "timeout"}`,
        extractedAt: new Date().toISOString(),
      };
    }

    try {
      const markdown = await response.text();
      // Trim to 3000 chars to enforce strict token budget control (<800 tokens)
      const trimmed = markdown.slice(0, MAX_TEXT_CHARS);
      return {
        success: true,
        url,
        markdown: trimmed,
        extractedAt: new Date().toISOString(),
      };
    } catch {
      return {
        success: false,
        url,
        markdown: `[JinaReader] Failed to parse response from ${url}.`,
        extractedAt: new Date().toISOString(),
      };
    }
  },
); /* end jinaReaderTool */
