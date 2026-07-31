/**
 * @file privacy.ts
 * @description PII sanitization utility for AI calls
 * @author Vasile Chifeac
 * @created 2026-07-16
 * @modified 2026-07-16
 *
 * @notes
 * - Masks/removes sensitive fields before sending data to LLMs
 * - Must be applied to all Genkit/Gemini inputs
 *
 * @dependencies
 * - None (pure utility)
 *
 * @performance
 * - O(n) shallow traversal
 */

// ── Utils ────────────────────────────────────────────────────────────────────

/**
 * Sanitize data for AI by removing or masking PII fields.
 * Masks email, name, surname. Replaces values with placeholders.
 */
const SENSITIVE_KEYS = new Set([
  "email",
  "nome",
  "name",
  "cognome",
  "surname",
  "firstName",
  "lastName",
]);

const MASK = "REDACTED";

const sanitizeValue = (value: unknown): unknown => {
  if (value == null) return value;
  if (typeof value === "string") return MASK;
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value === "object") return sanitizeForAI(value);
  return value;
};

export const sanitizeForAI = (data: unknown): unknown => {
  if (data == null || typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map(sanitizeForAI);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = MASK;
    } else {
      result[key] = sanitizeValue(value);
    }
  }
  return result;
}; /*end sanitizeForAI*/
