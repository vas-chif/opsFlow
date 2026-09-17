/**
 * @file antiHallucinationGuardrail.ts
 * @description Deterministic middleware to sanitize LLM-generated tabular data before Firestore persistence.
 * @author Vasile Chifeac
 * @created 2026-09-17
 * @modified 2026-09-17
 *
 * @notes
 * - Ground-Truth URL Matching: only URLs in the groundTruthUrls Set (from webSearch.ts) are accepted.
 * - Synthetic Email/Phone Blocker: regex-based filter for fake domains and sequential phone numbers.
 * - GDPR Art. 14 Date Forcing: overwrites any GDPR notification date with now() + 30 days (deterministic).
 * - Zero LLM calls, zero Firestore reads — pure Node.js in-memory computation.
 * - Architecture Pattern: Pure middleware injected by manageGoogleSheetTool before Firestore write.
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
  /** Total number of cells that were corrected. */
  correctionsCount: number;
  /** Granular breakdown of correction types. */
  flags: {
    unverifiedUrlsRemoved: number;
    syntheticEmailsBlocked: number;
    gdprDatesNormalized: number;
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

/**
 * Replacement string for unverified URLs not found in ground-truth results.
 */
const URL_UNVERIFIED_LABEL = "[Profilo non certificato dai motori]";

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
    const trimmed = url.trim().replace(/^http:\/\//i, "https://");
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
 * Builds a normalized Set from an array of raw URLs (e.g., from webSearch results).
 * This Set is the "ground truth" whitelist for URL validation.
 * @param {string[]} rawUrls - List of raw URLs discovered during search.
 * @return {Set<string>} Set of normalized unique URLs.
 */
export const buildGroundTruthSet = (rawUrls: string[]): Set<string> => {
  return new Set(rawUrls.map(normalizeUrl));
}; /* end buildGroundTruthSet */

/**
 * Determines whether a given URL is present in the ground-truth Set.
 * Uses prefix matching to handle sub-page variations of a verified domain.
 * @param {string} url - Target URL to verify.
 * @param {Set<string>} groundTruthUrls - Ground-truth Set of certified URLs.
 * @return {boolean} True if the URL matches a ground-truth entry.
 */
const isUrlGroundTruth = (url: string, groundTruthUrls: Set<string>): boolean => {
  const normalized = normalizeUrl(url);
  // Exact match
  if (groundTruthUrls.has(normalized)) return true;
  // Prefix match: if a ground-truth URL is a prefix of this URL (sub-page of verified profile)
  for (const trusted of groundTruthUrls) {
    if (normalized.startsWith(trusted) || trusted.startsWith(normalized)) {
      return true;
    }
  }
  return false;
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
 * 1. URL Ground-Truth check — flags URLs not in webSearch results.
 * 2. Synthetic email/phone blocker — replaces fake contacts with InMail fallback.
 * 3. GDPR date forcing — overwrites GDPR columns with deterministic +30d deadline.
 *
 * @param {Array<Array<string>>} values - Raw 2D string array from LLM.
 * @param {Set<string>} groundTruthUrls - Set of normalized URLs from search.
 * @param {boolean} hasHeaders - Whether the first row contains headers.
 * @return {SanitizationResult} Result with sanitized data and metrics.
 */
export const validateAndSanitizeRows = (
  values: string[][],
  groundTruthUrls: Set<string>,
  hasHeaders = true,
): SanitizationResult => {
  const flags = {
    unverifiedUrlsRemoved: 0,
    syntheticEmailsBlocked: 0,
    gdprDatesNormalized: 0,
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

  // Pre-compute GDPR deadline once (deterministic for the whole batch)
  const gdprDeadline = computeGdprDeadline();

  // Process each data row
  const sanitizedDataRows = dataRows.map((row) => {
    return row.map((cell, colIndex) => {
      const trimmed = cell.trim();

      // ── Rule 1: GDPR Date Normalization (highest priority) ──────────────
      if (gdprColumnIndices.has(colIndex) && trimmed !== "") {
        flags.gdprDatesNormalized++;
        return gdprDeadline;
      }

      // ── Rule 2: URL Ground-Truth Verification ───────────────────────────
      if (URL_LIKE_REGEX.test(trimmed)) {
        // Only validate if we have ground-truth URLs to compare against
        if (groundTruthUrls.size > 0 && !isUrlGroundTruth(trimmed, groundTruthUrls)) {
          flags.unverifiedUrlsRemoved++;
          return URL_UNVERIFIED_LABEL;
        }
        return cell; // URL is verified or no ground-truth available
      }

      // ── Rule 3: Synthetic Email Blocker ─────────────────────────────────
      if (isSyntheticEmail(trimmed)) {
        flags.syntheticEmailsBlocked++;
        return CONTACT_FALLBACK;
      }

      // ── Rule 4: Dummy Phone Number Blocker ──────────────────────────────
      if (isDummyPhone(trimmed)) {
        flags.syntheticEmailsBlocked++;
        return CONTACT_FALLBACK;
      }

      return cell; // Cell passed all checks
    });
  }); /* end dataRows.map */

  // Reassemble with headers if present
  const sanitizedValues = hasHeaders ? [headers, ...sanitizedDataRows] : sanitizedDataRows;
  const correctionsCount =
    flags.unverifiedUrlsRemoved + flags.syntheticEmailsBlocked + flags.gdprDatesNormalized;

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
  return `🛡️ OpsFlow Guardrail: ${parts.join(", ")}.`;
}; /* end buildGuardrailSummary */

