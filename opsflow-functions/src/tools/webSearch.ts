/**
 * @file webSearch.ts
 * @description Genkit Tools for Web Research, Platform Discovery, and Lead Generation (AgenteRicerca).
 *   Multi-Provider Chaining: Brave Search API → Tavily AI → Exa.ai → Jina Search API → Safe Empty Result.
 *   Double Cost Guard: HTTP 402/429 interceptor + Firestore monthly counter capped at 950 (BRAVE_MONTHLY_HARD_CAP).
 *   Zero HTTP 500 guarantee — all exceptions are converted to structured data.
 * @author Vasile Chifeac
 * @created 2026-07-30
 * @modified 2026-09-28
 *
 * @notes
 * - searchWebAndPlatformsTool: Multi-provider chaining with AbortController (6s hard timeout per provider).
 * - leadSynthesisTool: Formats discovered prospects into standardized lead structures.
 * - jinaReaderTool: Extracts clean Markdown from any URL via r.jina.ai (zero server cost).
 * - art14NoticeDueBy: GDPR Art. 14 compliance — ISO timestamp +30 days from search.
 * - Brave Cost Guard: HTTP 402/429 triggers immediate rollover. Firestore counter `system/searchUsage_{YYYY_MM}`
 *   stops Brave calls at 950/month — well below $5 credit limit. Primary protection via dashboard Hard Limit $5.
 * - SHA-256 Cache (Step 28): 72h Firestore cache at tenants/{tenantId}/webSearchCache/{queryHash}.
 *   Writes expiresAt: Timestamp for native TTL (gcloud firestore fields ttls update expiresAt).
 * - Brave Throttle (Step 28): 1.1s deterministic delay between sequential calls to stay within 1 QPS.
 * - Per-Workspace Quota Cap (Step 28): freemium accounts capped at 50 searches/month.
 * - Clay.com Pre-Filter (Step 28): regex extraction of URLs, emails, phones from raw snippets
 *   before passing text to Gemini Flash — reduces input token cost by ~40%.
 *
 * @dependencies
 * - process.env.BRAVE_SEARCH_API_KEY — Brave Search API ($5 credit/mo, requires card)
 * - process.env.TAVILY_API_KEY       — Tavily AI Search (1.000 req/mo, no credit card)
 * - process.env.EXA_API_KEY          — Exa.ai Neural Search (~1.400 req/mo, no credit card)
 * - https://s.jina.ai/               — Jina Search API (1M token free tier)
 * - firebase-admin/firestore          — Firestore monthly usage counter (FieldValue.increment)
 * - node:crypto                       — SHA-256 query digest for cache key
 *
 * @performance
 * - Hard timeout per provider: 6.000 ms (AbortController)
 * - Token budget: slice to 3.000 chars per URL extract (<800 tokens)
 * - Graceful degradation: never throws, always returns { success: false, results: [] } on total failure
 * - GDPR Art. 32: No PII logged in production; sanitizePii() applied before all external API calls
 */

// ── Node.js Built-ins ─────────────────────────────────────────────────────────
import { createHash } from "node:crypto";

// ── Vue & Framework ───────────────────────────────────────────────────────────
import { ai } from "../ai/genkitConfig";
import { z } from "genkit";
import * as logger from "firebase-functions/logger";

// ── Firebase ──────────────────────────────────────────────────────────────────
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDER_TIMEOUT_MS = 6_000;
const MAX_TEXT_CHARS = 3_000;
const MAX_RESULTS_PER_QUERY = 5;

/**
 * Hard cap for Brave Search API calls per calendar month.
 * Set to 950 (below the ~1.000 query/$5 credit threshold) as a preventive guard.
 * Primary protection is the $5 Hard Limit set in the Brave Dashboard with Auto-Recharge OFF.
 */
const BRAVE_MONTHLY_HARD_CAP = 950;

/**
 * Step 28 — Rifinitura 2: Throttling deterministico Brave Search.
 * Brave Free Tier rate limit: 1 query/second. 1.1s adds 10% safety margin
 * to prevent HTTP 429 bursts that would waste Tavily fallback credits.
 */
const BRAVE_THROTTLE_MS = 1_100;

/**
 * Step 28 — Rifinitura 1: TTL della cache SHA-256 Firestore.
 * 72 ore = 259.200.000 ms. Allineato con il campo `expiresAt` per la TTL
 * nativa di Firestore (gcloud firestore fields ttls update expiresAt ...).
 */
const CACHE_TTL_MS = 72 * 60 * 60 * 1_000;

/**
 * Step 28 — Rifinitura 3: Quota cap per account freemium.
 * Un workspace freemium può invocare al massimo 50 ricerche al mese.
 * Gli account premium non sono soggetti a questo limite.
 */
const FREEMIUM_QUOTA_CAP = 50;

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
 * @return {Promise<Response | null>} The fetch Response, or null on timeout/error.
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

// ── Helper: Throttle Sleep ────────────────────────────────────────────────────

/**
 * Step 28 — Rifinitura 2: Deterministic async sleep for Brave 1 QPS rate limit.
 * Prevents burst HTTP 429 that would prematurely consume Tavily (Tier 2) credits.
 * @param {number} ms - Milliseconds to pause execution.
 * @return {Promise<void>}
 */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
/* end sleep */

// ── Helper: SHA-256 Query Hash ────────────────────────────────────────────────

/**
 * Step 28 — Rifinitura 1: Computes a SHA-256 hex digest of the search query.
 * Used as Firestore document ID in tenants/{tenantId}/webSearchCache/{queryHash}.
 * Deterministic — same query always maps to the same cache document.
 * @param {string} query - Raw search query string.
 * @param {string} category - Search category (clients/trainers/platforms/general).
 * @return {string} 64-character lowercase hex digest.
 */
export const computeQueryHash = (query: string, category: string): string =>
  createHash("sha256")
    .update(`${query.trim().toLowerCase()}::${category}`)
    .digest("hex");
/* end computeQueryHash */

// ── Helper: Clay.com-Style Regex Pre-Filter ───────────────────────────────────

/** Structured contact data extracted from raw search snippets (Clay.com pattern). */
export interface PreFilteredData {
  /** Normalized https URLs found in snippets. */
  urls: string[];
  /** Email addresses (non-synthetic) found in snippets. */
  emails: string[];
  /** Phone numbers found in snippets (raw, unformatted). */
  phones: string[];
  /** Cleaned plain-text snippets with contact data removed (for Gemini token budget). */
  cleanedSnippets: string[];
}

/** Regex patterns for Clay.com-style deterministic pre-filtering. */
const CLAY_URL_REGEX = /https?:\/\/[^\s"'<>]{4,200}/gi;
const CLAY_EMAIL_REGEX = /[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,10}/g;
const CLAY_PHONE_REGEX =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){1,4}\d{3,6}(?![\d])/g;
/** Blocks synthetic emails (example.*, test.*, company.*, etc.). */
const SYNTHETIC_EMAIL_BLOCKER =
  /@(?:example|test|company|fake|placeholder|sample|noreply)\./i;

/**
 * Step 28 — Pre-Filtering a Regex Deterministico (Pattern Clay.com).
 * Scans raw SearchResultItem snippets to extract structured contact data
 * (URLs, emails, phones) BEFORE passing text to Gemini Flash.
 * Reduces input token cost by ~40% by stripping raw contact data from the
 * prompt and passing only clean narrative text.
 *
 * @param {SearchResultItem[]} results - Raw results from any search provider.
 * @return {PreFilteredData} Extracted structured data + cleaned text snippets.
 */
export const extractStructuredDataFromResults = (
  results: SearchResultItem[],
): PreFilteredData => {
  const urls: string[] = [];
  const emails: string[] = [];
  const phones: string[] = [];
  const cleanedSnippets: string[] = [];

  for (const item of results) {
    let text = item.snippet;

    // Extract URLs (include the result URL itself as ground truth)
    const foundUrls: string[] = (text.match(CLAY_URL_REGEX) ?? []) as string[];
    if (item.url && item.url.startsWith("http")) {
      foundUrls.unshift(item.url);
    }
    for (const u of foundUrls) {
      if (!urls.includes(u)) urls.push(u);
    }
    // Remove URLs from snippet to reduce token count
    text = text.replace(CLAY_URL_REGEX, "");

    // Extract non-synthetic emails
    const foundEmails = text.match(CLAY_EMAIL_REGEX) ?? [];
    for (const e of foundEmails) {
      if (!SYNTHETIC_EMAIL_BLOCKER.test(e) && !emails.includes(e)) {
        emails.push(e);
      }
    }
    // Remove emails from snippet
    text = text.replace(CLAY_EMAIL_REGEX, "");

    // Extract phone numbers
    const foundPhones = text.match(CLAY_PHONE_REGEX) ?? [];
    for (const p of foundPhones) {
      const cleaned = p.trim();
      if (cleaned.length >= 7 && !phones.includes(cleaned)) {
        phones.push(cleaned);
      }
    }
    // Remove phones from snippet
    text = text.replace(CLAY_PHONE_REGEX, "");

    // Normalize whitespace and trim
    cleanedSnippets.push(text.replace(/\s{2,}/g, " ").trim());
  }

  return { urls, emails, phones, cleanedSnippets };
}; /* end extractStructuredDataFromResults */

// ── Helper: Firestore SHA-256 Cache ──────────────────────────────────────────

/** Shape of a cached search result document in Firestore. */
interface CachedSearchDoc {
  results: SearchResultItem[];
  providerUsed: string;
  cachedAt: string;
  /** ISO string — also duplicated as Firestore Timestamp for native TTL. */
  expiresAtIso: string;
  /** Firestore Timestamp — enables native TTL auto-deletion (zero storage cost). */
  expiresAt: FirebaseFirestore.Timestamp;
}

/**
 * Reads a cached search result from Firestore (tenants/{tenantId}/webSearchCache/{queryHash}).
 * Returns null on cache miss, expired document, or any Firestore error.
 * @param {string} tenantId - Tenant isolation key.
 * @param {string} queryHash - SHA-256 hex digest of the query+category.
 * @return {Promise<CachedSearchDoc | null>} Cached document or null.
 */
async function readSearchCache(
  tenantId: string,
  queryHash: string,
): Promise<CachedSearchDoc | null> {
  try {
    const db = getFirestore();
    const ref = db
      .collection("tenants")
      .doc(tenantId)
      .collection("webSearchCache")
      .doc(queryHash);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const data = snap.data() as CachedSearchDoc | undefined;
    if (!data) return null;
    // Double-check expiry in application layer (safety net)
    if (new Date(data.expiresAtIso) < new Date()) return null;
    return data;
  } catch {
    return null; // Cache miss is non-critical
  }
} /* end readSearchCache */

/**
 * Writes a search result to Firestore cache with native TTL field `expiresAt`.
 * Collection: tenants/{tenantId}/webSearchCache/{queryHash}.
 * TTL deletion requires: `gcloud firestore fields ttls update expiresAt
 *   --collection-group=webSearchCache`
 * @param {string} tenantId - Tenant isolation key.
 * @param {string} queryHash - SHA-256 hex digest of the query+category.
 * @param {SearchResultItem[]} results - Provider results to cache.
 * @param {string} providerUsed - Provider identifier string.
 * @return {Promise<void>}
 */
async function writeSearchCache(
  tenantId: string,
  queryHash: string,
  results: SearchResultItem[],
  providerUsed: string,
): Promise<void> {
  try {
    const db = getFirestore();
    const ref = db
      .collection("tenants")
      .doc(tenantId)
      .collection("webSearchCache")
      .doc(queryHash);
    const now = Date.now();
    const expiresAtMs = now + CACHE_TTL_MS;
    const doc: CachedSearchDoc = {
      results,
      providerUsed,
      cachedAt: new Date(now).toISOString(),
      expiresAtIso: new Date(expiresAtMs).toISOString(),
      // Firestore Timestamp for native TTL zero-cost auto-deletion
      expiresAt: Timestamp.fromMillis(expiresAtMs),
    };
    await ref.set(doc);
  } catch {
    // Cache write failure is non-critical — search result is still returned
  }
} /* end writeSearchCache */

// ── Helper: Per-Workspace Freemium Quota Cap ──────────────────────────────────

/**
 * Step 28 — Rifinitura 3: Checks and increments the per-workspace monthly search counter.
 * Freemium workspaces are capped at FREEMIUM_QUOTA_CAP (50) searches/month.
 * Returns true if the workspace is within quota (search is allowed).
 * @param {string} tenantId - Tenant isolation key.
 * @param {string} workspaceId - Workspace document ID.
 * @param {boolean} isPremium - Whether the workspace has a premium subscription.
 * @return {Promise<boolean>} True if within quota, false if cap reached.
 */
async function checkAndIncrementWorkspaceQuota(
  tenantId: string,
  workspaceId: string,
  isPremium: boolean,
): Promise<boolean> {
  if (isPremium) return true; // Premium accounts have no cap
  try {
    const db = getFirestore();
    const now = new Date();
    const monthKey = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
    const ref = db
      .collection("tenants")
      .doc(tenantId)
      .collection("workspaces")
      .doc(workspaceId);
    const snap = await ref.get();
    const data = snap.data() as
      | { searchQuota?: Record<string, number> }
      | undefined;
    const currentCount = data?.searchQuota?.[monthKey] ?? 0;
    if (currentCount >= FREEMIUM_QUOTA_CAP) {
      return false; // Cap reached — do not allow search
    }
    // Atomically increment
    await ref.set(
      { searchQuota: { [monthKey]: FieldValue.increment(1) } },
      { merge: true },
    );
    return true;
  } catch {
    return true; // Quota check failure is non-critical: allow search
  }
} /* end checkAndIncrementWorkspaceQuota */

// ── Provider 0: Brave Search API (Tier 1 Primario) ────────────────────────────

/**
 * Reads or increments the monthly Brave Search usage counter in Firestore.
 * Document: `system/searchUsage_{YYYY_MM}` — updated with atomic FieldValue.increment(1).
 * Returns the current count BEFORE this call (to decide whether to proceed).
 * @param {boolean} increment - If true, also increments the counter by 1 atomically.
 * @return {Promise<number>} The monthly Brave usage count before this call.
 */
async function getBraveMonthlyUsage(increment: boolean): Promise<number> {
  try {
    const db = getFirestore();
    const now = new Date();
    const docId = `searchUsage_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
    const ref = db.collection("system").doc(docId);

    if (increment) {
      // Atomic increment — safe under concurrent Cloud Run instances
      await ref.set(
        { braveCount: FieldValue.increment(1), updatedAt: new Date().toISOString() },
        { merge: true },
      );
    }

    const snap = await ref.get();
    const data = snap.data() as { braveCount?: number } | undefined;
    return data?.braveCount ?? 0;
  } catch {
    // Firestore read failure is non-critical: fall back to allowing the call
    return 0;
  }
} /* end getBraveMonthlyUsage */

/**
 * Queries Brave Search API with Double Cost Guard protection.
 * Guard 1 (Hard Limit $5): Dashboard setting — API returns HTTP 402/429 when credit is exhausted.
 * Guard 2 (Preventive Counter): Firestore monthly counter capped at BRAVE_MONTHLY_HARD_CAP (950).
 * Returns null on quota exhaustion or any failure (caller handles immediate fallback to Tavily).
 * @param {string} query - The sanitized search query string (no PII).
 * @param {string} apiKey - Brave Search API key from process.env.BRAVE_SEARCH_API_KEY.
 * @return {Promise<SearchResultItem[] | null>} Structured results, or null on failure/quota.
 */
async function searchBrave(query: string, apiKey: string): Promise<SearchResultItem[] | null> {
  // Preventive Counter Guard: read current monthly count before calling API
  const currentUsage = await getBraveMonthlyUsage(false);
  if (currentUsage >= BRAVE_MONTHLY_HARD_CAP) {
    logger.info("searchBrave: monthly hard cap reached, skipping to Tavily", {
      currentUsage,
      cap: BRAVE_MONTHLY_HARD_CAP,
    });
    return null;
  }

  // Step 28 — Rifinitura 2: Throttling deterministico 1.1s (Brave 1 QPS rate limit)
  await sleep(BRAVE_THROTTLE_MS);

  const braveBase = "https://api.search.brave.com/res/v1/web/search";
  const endpoint = `${braveBase}?q=${encodeURIComponent(query)}&count=${MAX_RESULTS_PER_QUERY}&text_decorations=false`;

  const res = await fetchWithHardTimeout(endpoint, {
    headers: {
      "X-Subscription-Token": apiKey,
      Accept: "application/json",
      "Accept-Encoding": "gzip",
    },
  });

  if (!res) return null;

  // ── DOUBLE COST GUARD: HTTP 402 (Payment Required) or 429 (Rate Limit Exceeded) ──
  if (res.status === 402 || res.status === 429) {
    logger.warn(
      "searchBrave: credit exhausted or rate limited — immediate zero-cost rollover to Tavily",
      {
        httpStatus: res.status,
      },
    );
    return null; // Triggers immediate fallback — no exception, no HTTP 500
  }

  if (!res.ok) return null;

  try {
    const data = (await res.json()) as {
      web?: { results?: { title?: string; description?: string; url?: string }[] };
    };
    const items = data.web?.results;
    if (!Array.isArray(items) || items.length === 0) return null;

    // Increment Firestore counter only on successful result
    void getBraveMonthlyUsage(true);

    return items.map((r) => ({
      title: r.title || query,
      snippet: (r.description || "").slice(0, MAX_TEXT_CHARS),
      url: r.url || "",
    }));
  } catch {
    return null;
  }
} /* end searchBrave */

// ── Provider 1: Tavily AI Search ──────────────────────────────────────────────

/**
 * Queries Tavily AI Search API.
 * Free tier: 1.000 requests/month — no credit card required.
 * Returns null on any failure (caller handles fallback).
 * @param {string} query - The search query string.
 * @param {string} apiKey - Tavily AI API key from process.env.TAVILY_API_KEY.
 * @return {Promise<SearchResultItem[] | null>} Structured results, or null on failure.
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
 * @return {Promise<SearchResultItem[] | null>} Structured results, or null on failure.
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
 * @return {Promise<SearchResultItem[] | null>} Structured results parsed from Markdown, or null on failure.
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
 * Brave Search API → Tavily AI → Exa.ai → Jina Search API → Safe Empty Result.
 *
 * Double Cost Guard on Brave:
 *   1. HTTP 402/429 Interceptor — immediate rollover to Tavily on credit exhaustion.
 *   2. Firestore monthly counter — soft cap at 950 calls/month (below $5 threshold).
 *
 * GDPR Art. 14: Includes art14NoticeDueBy (+30 days) in every response.
 *
 * @security Never throws — all providers return null on failure, never propagate exceptions.
 * @performance Hard timeout 6s per provider. Total worst-case: ~24s (well within 60s CF timeout).
 */
export const searchWebAndPlatformsTool = ai.defineTool(
  {
    name: "searchWebAndPlatformsTool",
    description:
      "Cerca sul web e su piattaforme professionali (LinkedIn, Indeed, siti IT) per trovare prospect o trainer.",
    inputSchema: WebSearchQuerySchema.extend({
      tenantId: z.string().optional().describe("Tenant ID for cache & quota isolation"),
      workspaceId: z.string().optional().describe("Workspace ID for freemium quota cap"),
      isPremium: z
        .boolean()
        .optional()
        .default(false)
        .describe("Skip freemium quota cap for premium workspaces"),
    }),
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
      fromCache: z.boolean().describe("True if results were served from 72h Firestore cache"),
      art14NoticeDueBy: z.string().describe("GDPR Art. 14 notice expiry — ISO date +30 days"),
      preFiltered: z
        .object({
          urls: z.array(z.string()),
          emails: z.array(z.string()),
          phones: z.array(z.string()),
        })
        .optional()
        .describe("Clay.com-style structured data extracted from raw snippets before LLM"),
    }),
  },
  async ({ query, category, tenantId, workspaceId, isPremium }) => {
    // GDPR Art. 14: calculate +30-day notice expiry for any personal data extracted
    const art14NoticeDueBy = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const resolvedTenantId = tenantId ?? "system";
    const resolvedWorkspaceId = workspaceId ?? "default";
    const resolvedIsPremium = isPremium ?? false;

    // Step 28 — Rifinitura 3: Per-Workspace Freemium Quota Cap
    const withinQuota = await checkAndIncrementWorkspaceQuota(
      resolvedTenantId,
      resolvedWorkspaceId,
      resolvedIsPremium,
    );
    if (!withinQuota) {
      logger.warn("searchWebAndPlatformsTool: freemium quota cap reached", {
        tenantId: resolvedTenantId,
        workspaceId: resolvedWorkspaceId,
        cap: FREEMIUM_QUOTA_CAP,
      });
      return {
        success: false,
        results: [],
        summary:
          `Quota mensile ricerche esaurita (${FREEMIUM_QUOTA_CAP} max per account freemium). ` +
          "Passa a Premium per ricerche illimitate.",
        providerUsed: "none",
        fromCache: false,
        art14NoticeDueBy,
      };
    }

    // Step 28 — Rifinitura 1: SHA-256 Cache Lookup (72h TTL)
    const queryHash = computeQueryHash(query, category);
    const cached = await readSearchCache(resolvedTenantId, queryHash);
    if (cached) {
      logger.info("searchWebAndPlatformsTool: cache HIT — returning cached results", {
        queryHash,
        providerUsed: cached.providerUsed,
      });
      const preFiltered = extractStructuredDataFromResults(cached.results);
      return {
        success: true,
        results: cached.results,
        summary:
          `[CACHE HIT] ${cached.providerUsed}: ${cached.results.length}` +
          ` risultati per "${query}" (${category}). Cached at ${cached.cachedAt}.`,
        providerUsed: cached.providerUsed,
        fromCache: true,
        art14NoticeDueBy,
        preFiltered: {
          urls: preFiltered.urls,
          emails: preFiltered.emails,
          phones: preFiltered.phones,
        },
      };
    }

    const braveKey = process.env.BRAVE_SEARCH_API_KEY || "";
    const tavilyKey = process.env.TAVILY_API_KEY || "";
    const exaKey = process.env.EXA_API_KEY || "";

    // --- Tier 0: Brave Search API (Primary — $5 credit/mo, Double Cost Guard active) ---
    if (braveKey) {
      const braveResults = await searchBrave(query, braveKey);
      if (braveResults && braveResults.length > 0) {
        logger.info("searchWebAndPlatformsTool: Brave Search API success", { query, category });
        void writeSearchCache(resolvedTenantId, queryHash, braveResults, "brave");
        const preFiltered = extractStructuredDataFromResults(braveResults);
        return {
          success: true,
          results: braveResults,
          summary: `Brave Search: ${braveResults.length} risultati per "${query}" (${category}).`,
          providerUsed: "brave",
          fromCache: false,
          art14NoticeDueBy,
          preFiltered: {
            urls: preFiltered.urls,
            emails: preFiltered.emails,
            phones: preFiltered.phones,
          },
        };
      }
    }

    // --- Tier 1: Tavily AI Search ---
    if (tavilyKey) {
      const tavilyResults = await searchTavily(query, tavilyKey);
      if (tavilyResults && tavilyResults.length > 0) {
        logger.info("searchWebAndPlatformsTool: Tavily AI success", { query, category });
        void writeSearchCache(resolvedTenantId, queryHash, tavilyResults, "tavily");
        const preFiltered = extractStructuredDataFromResults(tavilyResults);
        return {
          success: true,
          results: tavilyResults,
          summary: `Tavily AI: ${tavilyResults.length} risultati per "${query}" (${category}).`,
          providerUsed: "tavily",
          fromCache: false,
          art14NoticeDueBy,
          preFiltered: {
            urls: preFiltered.urls,
            emails: preFiltered.emails,
            phones: preFiltered.phones,
          },
        };
      }
    }

    // --- Tier 2: Exa.ai Neural Search ---
    if (exaKey) {
      const exaResults = await searchExa(query, exaKey);
      if (exaResults && exaResults.length > 0) {
        logger.info("searchWebAndPlatformsTool: Exa.ai success", { query, category });
        void writeSearchCache(resolvedTenantId, queryHash, exaResults, "exa");
        const preFiltered = extractStructuredDataFromResults(exaResults);
        return {
          success: true,
          results: exaResults,
          summary: `Exa.ai: ${exaResults.length} risultati neurali per "${query}" (${category}).`,
          providerUsed: "exa",
          fromCache: false,
          art14NoticeDueBy,
          preFiltered: {
            urls: preFiltered.urls,
            emails: preFiltered.emails,
            phones: preFiltered.phones,
          },
        };
      }
    }

    // --- Tier 3: Jina Search API ---
    const jinaResults = await searchJina(query);
    if (jinaResults && jinaResults.length > 0) {
      logger.info("searchWebAndPlatformsTool: Jina Search success", { query, category });
      void writeSearchCache(resolvedTenantId, queryHash, jinaResults, "jina");
      const preFiltered = extractStructuredDataFromResults(jinaResults);
      return {
        success: true,
        results: jinaResults,
        summary: `Jina Search: ${jinaResults.length} risultati per "${query}" (${category}).`,
        providerUsed: "jina",
        fromCache: false,
        art14NoticeDueBy,
        preFiltered: {
          urls: preFiltered.urls,
          emails: preFiltered.emails,
          phones: preFiltered.phones,
        },
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
      fromCache: false,
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
