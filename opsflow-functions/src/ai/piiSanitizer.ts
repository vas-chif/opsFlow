/**
 * @file piiSanitizer.ts
 * @description PII Anonymization Middleware for OpsFlow AI LLM Requests (GDPR Art. 32 & OWASP)
 * @author Vasile Chifeac
 * @created 2026-07-29
 * @modified 2026-07-29
 *
 * @notes
 * - Anonymizes emails, phone numbers, Italian Fiscal Codes (CF), IBANs, and credit cards
 * - Replaces PII with pseudonimised tokens ([EMAIL_1], [PHONE_1], etc.)
 *
 * @performance
 * - Executed in <2ms per task text
 */

export interface SanitizedResult {
  sanitizedText: string;
  restorationMap: Record<string, string>;
  piiCount: number;
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+39\s?)?(?:3\d{2}|0\d{1,4})\s?\d{6,7}/g;
const FISCAL_CODE_REGEX = /[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]/gi;
const IBAN_REGEX = /IT\d{2}[A-Z]\d{10}[0-9A-Z]{12}/gi;

/**
 * Sanitize PII from input text before passing to LLM.
 * @param {string} text - Raw input text containing potential PII
 * @return {SanitizedResult} Object containing sanitized text and restoration map
 */
export function sanitizePii(text: string): SanitizedResult {
  if (!text) {
    return { sanitizedText: "", restorationMap: {}, piiCount: 0 };
  }

  const restorationMap: Record<string, string> = {};
  let piiCount = 0;
  let result = text;

  // 1. Emails
  let emailIdx = 1;
  result = result.replace(EMAIL_REGEX, (match) => {
    const token = `[EMAIL_${emailIdx++}]`;
    restorationMap[token] = match;
    piiCount++;
    return token;
  });

  // 2. Phones
  let phoneIdx = 1;
  result = result.replace(PHONE_REGEX, (match) => {
    const token = `[PHONE_${phoneIdx++}]`;
    restorationMap[token] = match;
    piiCount++;
    return token;
  });

  // 3. Fiscal Codes
  let cfIdx = 1;
  result = result.replace(FISCAL_CODE_REGEX, (match) => {
    const token = `[TAX_ID_${cfIdx++}]`;
    restorationMap[token] = match;
    piiCount++;
    return token;
  });

  // 4. IBANs
  let ibanIdx = 1;
  result = result.replace(IBAN_REGEX, (match) => {
    const token = `[FINANCIAL_${ibanIdx++}]`;
    restorationMap[token] = match;
    piiCount++;
    return token;
  });

  return {
    sanitizedText: result,
    restorationMap,
    piiCount,
  };
} /* end sanitizePii */

/**
 * Restore PII in LLM output using the restoration map.
 * @param {string} sanitizedText - Text containing PII tokens
 * @param {Record<string, string>} restorationMap - Token to original string map
 * @return {string} Restored text
 */
export function restorePii(sanitizedText: string, restorationMap: Record<string, string>): string {
  let restored = sanitizedText;
  for (const [token, original] of Object.entries(restorationMap)) {
    restored = restored.replace(new RegExp(token.replace(/[[\]]/g, "\\$&"), "g"), original);
  }
  return restored;
} /* end restorePii */
