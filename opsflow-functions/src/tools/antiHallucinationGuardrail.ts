/**
 * @file antiHallucinationGuardrail.ts
 * @description Deterministic middleware to sanitize LLM-generated tabular data before Firestore persistence.
 * @author Vasile Chifeac
 * @created 2026-09-17
 * @modified 2026-09-28
 *
 * @notes
 * - Ground-Truth URL Matching: only URLs in the groundTruthUrls Set (from webSearch.ts) are accepted.
 * - Synthetic Email/Phone Blocker: regex-based filter for fake domains and sequential phone numbers.
 * - GDPR Art. 14 Date Forcing: overwrites any GDPR notification date with now() + 30 days (deterministic).
 * - Zero LLM calls, zero Firestore reads — pure Node.js in-memory computation.
 * - Architecture Pattern: Pure middleware injected by manageGoogleSheetTool before Firestore write.
 * - Step 28 (Dust.tt Pattern): classifyFieldEvidence() and buildEvidenceChips() generate
 *   typed chip descriptors ([\U0001f7e2 VERIFIED] / [\U0001f7e1 GAP]) consumed by ApprovalCard.vue.
 *
 * @dependencies
 * - Node.js built-in: no external dependencies required.
 *
 * @performance
 * - O(n*m) where n = rows, m = columns — typically <5ms for 50 rows.
 * - Memory footprint: negligible (operates on existing string[][] reference).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Result object returned by the guardrail sanitization pipeline.
 */
export interface SanitizationResult {
  /** Sanitized 2D string array ready for Firestore/Sheets storage. */
  sanitizedValues: string[][];
  /** Total number of cells or rows that were corrected or filtered. */
  correctionsCount: number;
  /** Granular breakdown of correction types. */
  flags: {
    unverifiedUrlsRemoved: number;
    syntheticEmailsBlocked: number;
    gdprDatesNormalized: number;
    rejectedRowsCount: number;
  };
} /* end SanitizationResult */

// ── Constants & Patterns ──────────────────────────────────────────────────────

/**
 * Regex: matches email addresses on clearly synthetic/test domains.
 * Blocks: example.*, test.*, company.*, fake.*, example-consulting.*, placeholder.*
 */
const SYNTHETIC_EMAIL_REGEX =
  /@(example\.|test\.|company\.|fake\.|placeholder\.|sample\.|noreply\.|example-consulting\.)/i;

/**
 * Regex: detects phone numbers with obviously sequential or dummy patterns.
 * Examples blocked: +39 340 1234567, +39 000 0000000, +1 555-0100
 */
const DUMMY_PHONE_PATTERNS = [
  /1234567/,
  /7654321/,
  /0000000/,
  /1111111/,
  /9999999/,
  /\b555-0\d{3}\b/i, // US test numbers
];

/**
 * Regex: detects if a cell looks like a URL (http/https prefix or linkedin.com etc.).
 */
const URL_LIKE_REGEX = /^https?:\/\//i;

/**
 * Regex: Blacklist for placeholder, anonymous or synthetic candidate designations.
 * Categorically blocks strings like "Candidato #01", "Senior Scala Engineer #1", "Developer #2", etc.
 */
export const PLACEHOLDER_NAME_REGEX =
  /^(candidato|candidate|profilo|profile)\b|^(senior|lead|engineer|developer|specialist|consultant)\s*(#|\d+)/i;

/**
 * Regex: Detects candidate / person name columns from headers.
 */
export const CANDIDATE_NAME_HEADER_REGEX =
  /^(candidat|nominativ|profilo|persona|full.?name|nome|name|cognome|lead)/i;

/**
 * Global Ground-Truth URL Buffer.
 * Accumulates normalized URLs returned by webSearch tools in a single agent turn.
 */
export const groundTruthUrlBuffer: Set<string> = new Set();

/**
 * Global Ground-Truth Search Snippets Buffer.
 * Contains raw text (titles + snippets) from search engines to verify entity names.
 */
export const groundTruthSnippetBuffer: string[] = [];

/**
 * Resets all ground-truth buffers for a new agent turn.
 * @return {void}
 */
export function resetGroundTruthBuffer(): void {
  groundTruthUrlBuffer.clear();
  groundTruthSnippetBuffer.length = 0;
} /* end resetGroundTruthBuffer */

/**
 * Adds raw URLs to the ground-truth buffer.
 * Filters out generic root domains/homepages.
 * @param {string[]} urls - List of URLs discovered during search or provided by user.
 * @return {void}
 */
export function addGroundTruthUrls(urls: string[]): void {
  for (const url of urls) {
    if (url && !isRootOrGenericPortal(url)) {
      groundTruthUrlBuffer.add(normalizeUrl(url));
    }
  }
} /* end addGroundTruthUrls */

/**
 * Adds full search results (urls + titles + snippets) to the ground-truth buffer.
 * @param {Array<object>} results - Search results containing url, title, and snippet.
 * @return {void}
 */
export function addGroundTruthSearchResults(
  results: Array<{ url?: string; title?: string; snippet?: string }>,
): void {
  if (!results || !Array.isArray(results)) return;
  for (const item of results) {
    if (item.url && !isRootOrGenericPortal(item.url)) {
      groundTruthUrlBuffer.add(normalizeUrl(item.url));
    }
    if (item.title) {
      groundTruthSnippetBuffer.push(item.title);
    }
    if (item.snippet) {
      groundTruthSnippetBuffer.push(item.snippet);
    }
  }
} /* end addGroundTruthSearchResults */

/**
 * Gets the consolidated text of all search snippets and URLs for name verification.
 * @return {string} Lowercased concatenated string of all search evidence.
 */
export function getGroundTruthEvidenceText(): string {
  const parts: string[] = [...groundTruthSnippetBuffer];
  for (const url of groundTruthUrlBuffer) {
    parts.push(url);
  }
  return parts.join(" ").toLowerCase();
} /* end getGroundTruthEvidenceText */

/**
 * Determines if a string resembles a URL (protocol or domain structure).
 * @param {string} val - String to evaluate.
 * @return {boolean} True if string is a URL.
 */
export const isUrlLike = (val: string): boolean => {
  const trimmed = val.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^(www\.)?[a-zA-Z0-9-]+\.(com|it|org|net|io|eu|dev|co|me|ai|app|edu|gov)(\/.*)?$/i.test(trimmed)) {
    return true;
  }
  return false;
}; /* end isUrlLike */

/**
 * Verifies whether at least one token of a candidate's name is present in search snippets.
 * @param {string} name - Candidate name string.
 * @param {string} snippetsText - Consolidated lowercased text of search snippets.
 * @return {boolean} True if verifiable or if snippets buffer is empty.
 */
export const isNameVerifiableInSnippets = (name: string, snippetsText: string): boolean => {
  if (!snippetsText || snippetsText.trim() === "") return true;
  const tokens = name.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return false;
  return tokens.some((token) => snippetsText.includes(token));
}; /* end isNameVerifiableInSnippets */

/**
 * Regex: detects GDPR-related date columns by header keywords.
 */
const GDPR_COLUMN_KEYWORDS = [
  "gdpr",
  "informativa",
  "notifica",
  "privacy",
  "data_notifica",
  "data notifica",
  "data_gdpr",
];

/**
 * Replacement string for synthetic/unverified contact data.
 */
const CONTACT_FALLBACK = "Contatto via InMail / Profilo Pubblico";

// ── Core Utilities ────────────────────────────────────────────────────────────

/**
 * Normalizes a URL for consistent comparison:
 * - Converts protocol to https:// (neutralizes http vs https differences)
 * - Lowercases the full URL
 * - Removes tracking query parameters (utm_*, ref, fbclid, etc.)
 * - Strips trailing slash
 * - Removes www. prefix for domain matching flexibility
 * @param {string} url - Raw URL string to normalize.
 * @return {string} Normalized URL string.
 */
export const normalizeUrl = (url: string): string => {
  try {
    let trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = "https://" + trimmed;
    }
    const parsed = new URL(trimmed);
    // Remove tracking parameters
    const trackingParams = [
      "utm_source", "utm_medium", "utm_campaign", "utm_content",
      "utm_term", "ref", "fbclid", "gclid", "mc_cid", "mc_eid",
    ];
    for (const param of trackingParams) {
      parsed.searchParams.delete(param);
    }
    // Rebuild clean URL
    let clean = parsed.toString().toLowerCase();
    // Strip trailing slash
    if (clean.endsWith("/")) {
      clean = clean.slice(0, -1);
    }
    // Normalize www. prefix
    clean = clean.replace("://www.", "://");
    return clean;
  } catch {
    // If URL is invalid, return lowercased trimmed original
    return url.trim().toLowerCase();
  }
}; /* end normalizeUrl */

/**
 * Evaluates whether a given URL is a generic root domain or homepage portal
 * lacking deep specific path evidence (e.g. "https://domain.com/", "https://domain.com/index.html").
 * Root URLs cannot serve as verified documentary evidence for specific entity records.
 * @param {string} url - URL string to check.
 * @return {boolean} True if the URL is a root or generic portal homepage.
 */
export const isRootOrGenericPortal = (url: string): boolean => {
  try {
    let trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = "https://" + trimmed;
    }
    const parsed = new URL(trimmed);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      return true;
    }
    if (segments.length === 1 && /^index\.(html?|php|asp|aspx)$|^home$/i.test(segments[0])) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}; /* end isRootOrGenericPortal */

/**
 * Builds a normalized Set from an array of raw URLs (e.g., from webSearch results).
 * This Set is the "ground truth" whitelist for URL validation.
 * Filters out generic root domains/homepages so they cannot act as wildcards.
 * @param {string[]} rawUrls - List of raw URLs discovered during search.
 * @return {Set<string>} Set of normalized unique URLs.
 */
export const buildGroundTruthSet = (rawUrls: string[]): Set<string> => {
  return new Set(
    rawUrls
      .filter((url) => Boolean(url) && !isRootOrGenericPortal(url))
      .map(normalizeUrl),
  );
}; /* end buildGroundTruthSet */

/**
 * Determines whether a given URL is present in the ground-truth Set.
 * Enforces STRICT EXACT-MATCH against normalized ground-truth URLs from raw search results.
 * Root domains and generic portal homepages are strictly rejected.
 * No reverse or permissive prefix matches are permitted.
 * @param {string} url - Target URL to verify.
 * @param {Set<string>} groundTruthUrls - Ground-truth Set of certified URLs.
 * @return {boolean} True if the URL matches an exact ground-truth entry.
 */
export const isUrlGroundTruth = (url: string, groundTruthUrls: Set<string>): boolean => {
  if (!url || isRootOrGenericPortal(url)) return false;
  if (!groundTruthUrls || groundTruthUrls.size === 0) return false;

  const normalized = normalizeUrl(url);
  return groundTruthUrls.has(normalized);
}; /* end isUrlGroundTruth */

/**
 * Detects if a cell value is a synthetic/fake email address.
 * @param {string} value - Cell string to test.
 * @return {boolean} True if the value matches a synthetic email pattern.
 */
const isSyntheticEmail = (value: string): boolean => {
  // Must contain @ to be an email
  if (!value.includes("@")) return false;
  return SYNTHETIC_EMAIL_REGEX.test(value);
}; /* end isSyntheticEmail */

/**
 * Detects if a cell value is a synthetic/dummy phone number.
 * @param {string} value - Cell string to test.
 * @return {boolean} True if the value matches dummy phone patterns.
 */
const isDummyPhone = (value: string): boolean => {
  // Heuristic: must look like a phone (digits with optional +, spaces, hyphens)
  if (!/^[+\d\s\-().]{7,20}$/.test(value.trim())) return false;
  return DUMMY_PHONE_PATTERNS.some((pattern) => pattern.test(value));
}; /* end isDummyPhone */

/**
 * Calculates the GDPR Art. 14 notification deadline: now() + 30 days.
 * @return {string} Formatted date string in Italian locale (dd/mm/yyyy).
 */
const computeGdprDeadline = (): string => {
  const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return deadline.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}; /* end computeGdprDeadline */

/**
 * Determines if a column header indicates a GDPR date column.
 * @param {string} header - Column header name to inspect.
 * @return {boolean} True if header contains GDPR-related keywords.
 */
const isGdprDateColumn = (header: string): boolean => {
  const normalized = header.toLowerCase().trim();
  return GDPR_COLUMN_KEYWORDS.some((kw) => normalized.includes(kw));
}; /* end isGdprDateColumn */

// ── Main Sanitization Function ────────────────────────────────────────────────

/**
 * Validates and sanitizes a 2D string array from the LLM before Firestore write.
 *
 * Pipeline (in order):
 * 1. URL Ground-Truth check — enforces STRICT EXACT-MATCH against groundTruthUrls.
 *    Any unverified or synthetic URL immediately throws HALLUCINATED_URL_REJECTED.
 * 2. Candidate Name Blacklist & Verification — blocks placeholder/anonymous names
 *    and verifies entity names against search snippets.
 * 3. Synthetic email/phone blocker — replaces fake contacts with InMail fallback.
 * 4. GDPR date forcing — overwrites GDPR columns with deterministic +30d deadline.
 *
 * @param {Array<Array<string>>} values - Raw 2D string array from LLM.
 * @param {Set<string>} groundTruthUrls - Set of normalized URLs from search.
 * @param {boolean} [hasHeaders=true] - Whether the first row contains headers.
 * @param {string} [evidenceText] - Optional consolidated search snippets text.
 * @return {SanitizationResult} Result with sanitized data and metrics.
 */
export const validateAndSanitizeRows = (
  values: string[][],
  groundTruthUrls: Set<string>,
  hasHeaders = true,
  evidenceText?: string,
): SanitizationResult => {
  const flags = {
    unverifiedUrlsRemoved: 0,
    syntheticEmailsBlocked: 0,
    gdprDatesNormalized: 0,
    rejectedRowsCount: 0,
  };

  if (!values || values.length === 0) {
    return { sanitizedValues: [], correctionsCount: 0, flags };
  }

  // Extract headers for column-type detection
  const headers: string[] = hasHeaders && values.length > 0 ? (values[0] ?? []) : [];
  const dataRows = hasHeaders ? values.slice(1) : values;

  // Identify GDPR date column indices from headers
  const gdprColumnIndices = new Set<number>(
    headers.reduce<number[]>((acc, h, i) => {
      if (isGdprDateColumn(h)) acc.push(i);
      return acc;
    }, []),
  );

  // Identify candidate name columns from headers
  const candidateColumnIndices = new Set<number>(
    headers.reduce<number[]>((acc, h, i) => {
      if (CANDIDATE_NAME_HEADER_REGEX.test(h)) acc.push(i);
      return acc;
    }, []),
  );
  // Default to column 0 if no headers matched but columns exist
  if (candidateColumnIndices.size === 0 && headers.length > 0) {
    candidateColumnIndices.add(0);
  }

  // Pre-compute GDPR deadline once (deterministic for the whole batch)
  const gdprDeadline = computeGdprDeadline();

  // Process each data row resiliently: filter out non-compliant rows rather than crashing batch
  const sanitizedDataRows: string[][] = [];
  const rejectedReasons: string[] = [];

  for (const row of dataRows) {
    let rowRejected = false;
    let rejectReason = "";
    const sanitizedRow: string[] = [];

    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const cell = row[colIndex];
      const trimmed = cell.trim();

      // ── Rule 1: GDPR Date Normalization (highest priority) ──────────────
      if (gdprColumnIndices.has(colIndex) && trimmed !== "") {
        flags.gdprDatesNormalized++;
        sanitizedRow.push(gdprDeadline);
        continue;
      }

      // ── Rule 2: Strict Exact-Match URL Ground-Truth Verification ───────
      if (isUrlLike(trimmed)) {
        if (!isUrlGroundTruth(trimmed, groundTruthUrls)) {
          rowRejected = true;
          rejectReason =
            `HALLUCINATED_URL_REJECTED: L'URL ${trimmed} non proviene dai risultati reali della ricerca web.`;
          break;
        }
        sanitizedRow.push(cell); // URL strictly verified against ground truth
        continue;
      }

      // ── Rule 2b: Candidate Name Blacklist & Verification (Candidate Column Only) ─
      if (
        candidateColumnIndices.has(colIndex) &&
        trimmed !== "" &&
        trimmed !== "-" &&
        trimmed.toLowerCase() !== "n/a"
      ) {
        // Universal placeholder blacklist on candidate name
        if (PLACEHOLDER_NAME_REGEX.test(trimmed)) {
          rowRejected = true;
          rejectReason =
            `HALLUCINATED_NAME_REJECTED: Il nominativo '${trimmed}' è un segnaposto fittizio non verificabile.`;
          break;
        }
        const words = trimmed.split(/\s+/).filter(Boolean);
        if (words.length < 2) {
          rowRejected = true;
          rejectReason =
            `HALLUCINATED_NAME_REJECTED: Il nominativo '${trimmed}' non contiene un Nome e Cognome reale.`;
          break;
        }
        if (evidenceText && !isNameVerifiableInSnippets(trimmed, evidenceText)) {
          rowRejected = true;
          rejectReason =
            `HALLUCINATED_NAME_REJECTED: Il nominativo '${trimmed}' non è verificabile nei risultati web.`;
          break;
        }
      }

      // ── Rule 3: Synthetic Email Blocker ─────────────────────────────────
      if (isSyntheticEmail(trimmed)) {
        flags.syntheticEmailsBlocked++;
        sanitizedRow.push(CONTACT_FALLBACK);
        continue;
      }

      // ── Rule 4: Dummy Phone Number Blocker ──────────────────────────────
      if (isDummyPhone(trimmed)) {
        flags.syntheticEmailsBlocked++;
        sanitizedRow.push(CONTACT_FALLBACK);
        continue;
      }

      sanitizedRow.push(cell); // Cell passed all checks
    }

    if (rowRejected) {
      flags.rejectedRowsCount++;
      rejectedReasons.push(rejectReason);
    } else {
      sanitizedDataRows.push(sanitizedRow);
    }
  }

  // If input had data rows but ALL were non-compliant, fail-fast
  if (dataRows.length > 0 && sanitizedDataRows.length === 0) {
    const mainReason =
      rejectedReasons[0] ||
      "Tutte le righe contengono dati non conformi o allucinati rispetto al ground truth.";
    throw new Error(mainReason);
  }

  // Reassemble with headers if present
  const sanitizedValues = hasHeaders ? [headers, ...sanitizedDataRows] : sanitizedDataRows;
  const correctionsCount =
    flags.unverifiedUrlsRemoved +
    flags.syntheticEmailsBlocked +
    flags.gdprDatesNormalized +
    flags.rejectedRowsCount;

  return { sanitizedValues, correctionsCount, flags };
}; /* end validateAndSanitizeRows */

/**
 * Generates a human-readable summary of applied guardrail corrections.
 * Used for the chat guardrail notification message (Fase 4.3).
 * @param {SanitizationResult} result - Sanitization pipeline output.
 * @return {string|null} Summary message string or null if zero corrections.
 */
export const buildGuardrailSummary = (result: SanitizationResult): string | null => {
  if (result.correctionsCount === 0) return null;
  const parts: string[] = [];
  if (result.flags.unverifiedUrlsRemoved > 0) {
    parts.push(`${result.flags.unverifiedUrlsRemoved} link non certificati rimossi`);
  }
  if (result.flags.syntheticEmailsBlocked > 0) {
    parts.push(`${result.flags.syntheticEmailsBlocked} contatti sintetici convertiti in InMail`);
  }
  if (result.flags.gdprDatesNormalized > 0) {
    parts.push(`${result.flags.gdprDatesNormalized} date GDPR forzate a +30gg (Art. 14)`);
  }
  if (result.flags.rejectedRowsCount > 0) {
    parts.push(`${result.flags.rejectedRowsCount} righe non conformi scartate`);
  }
  return `\u{1F6E1}\uFE0F OpsFlow Guardrail: ${parts.join(", ")}.`;
}; /* end buildGuardrailSummary */

// ── Step 28: Evidence Citation Chips (Dust.tt Pattern) ──────────────────────────────

/**
 * Verification status for a single data field (Dust.tt Evidence Chip pattern).
 * - "verified": the value was found in the ground-truth URL set from web search.
 * - "gap": the value could not be confirmed against ground-truth sources.
 */
export type EvidenceChipType = "verified" | "gap";

/**
 * A structured evidence descriptor for a single data field,
 * rendered as a clickable chip in ApprovalCard.vue.
 */
export interface EvidenceChip {
  /** Human-readable field label (e.g. "Website", "LinkedIn"). */
  field: string;
  /** The raw value from the LLM output. */
  value: string;
  /** Verification status: verified (\U0001f7e2) or gap (\U0001f7e1). */
  type: EvidenceChipType;
  /** The ground-truth URL that verified this value (only set when type="verified"). */
  sourceUrl?: string;
}
/**
 * Result of a single field evidence classification against ground truth.
 */
export interface FieldEvidenceResult {
  /** Verification status: verified or gap. */
  type: EvidenceChipType;
  /** The ground-truth URL that verified this value (only when verified). */
  sourceUrl?: string;
}

/**
 * Classifies a single field value against the ground-truth URL set.
 * Pure function — no side effects, no I/O.
 * Enforces strict exact match on certified URLs.
 * @param {string} fieldValue - The raw string value to classify.
 * @param {Set<string>} groundTruthUrls - Normalized URL set from web search.
 * @return {FieldEvidenceResult} Classification result.
 */
export const classifyFieldEvidence = (
  fieldValue: string,
  groundTruthUrls: Set<string>,
): FieldEvidenceResult => {
  if (!fieldValue || !fieldValue.trim()) {
    return { type: "gap" };
  }
  // Check if the value itself is a URL present in ground truth
  if (URL_LIKE_REGEX.test(fieldValue)) {
    // Root or generic portal URLs cannot serve as verified entity evidence
    if (isRootOrGenericPortal(fieldValue)) {
      return { type: "gap" };
    }
    const normalized = normalizeUrl(fieldValue);
    if (groundTruthUrls.has(normalized)) {
      return { type: "verified", sourceUrl: normalized };
    }
    return { type: "gap" };
  }
  // For non-URL values (e.g. company names, emails) — treat as gap by default
  // The LLM prompt should use [GAP TO VERIFY: ...] for unverifiable fields;
  // those are always classified as gap.
  if (fieldValue.includes("[GAP")) {
    return { type: "gap" };
  }
  // If we have no URL-based evidence, mark as gap
  return { type: "gap" };
}; /* end classifyFieldEvidence */

/**
 * Step 28 — Dust.tt Pattern: Builds an array of EvidenceChip descriptors
 * for a row of LLM-generated data fields.
 * Consumed by ApprovalCard.vue to render [\U0001f7e2 VERIFIED] / [\U0001f7e1 GAP] chips.
 *
 * @param {Record<string, string>} fields - Map of field name -> field value.
 * @param {Set<string>} groundTruthUrls - Ground-truth URL set from web search.
 * @return {EvidenceChip[]} Array of evidence chip descriptors.
 */
export const buildEvidenceChips = (
  fields: Record<string, string>,
  groundTruthUrls: Set<string>,
): EvidenceChip[] => {
  return Object.entries(fields).map(([field, value]) => {
    const { type, sourceUrl } = classifyFieldEvidence(value, groundTruthUrls);
    return { field, value, type, sourceUrl };
  });
}; /* end buildEvidenceChips */
