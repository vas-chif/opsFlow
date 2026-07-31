/**
 * @file useSecureLogger.ts
 * @description Safe conditional logger for OpsFlow with automatic PII & credential redaction.
 * @author Vasile Chifeac
 * @created 2026-07-31
 *
 * @notes
 * - Dev Mode: Prints clean, formatted, tagged messages to browser console.
 * - Prod Mode: Redacts sensitive keys (token, password, secret, key) and masks emails (GDPR Art. 32).
 */

export interface ISecureLogger {
  debug: (tag: string, message: string, data?: unknown) => void;
  info: (tag: string, message: string, data?: unknown) => void;
  success: (tag: string, message: string, data?: unknown) => void;
  warn: (tag: string, message: string, data?: unknown) => void;
  error: (tag: string, message: string, error?: unknown) => void;
}

export function useSecureLogger(): ISecureLogger {
  const isDev = Boolean(import.meta.env.DEV || process.env.NODE_ENV === "development");

  /**
   * Sanitizes strings or objects by masking emails and redacting sensitive keys.
   */
  function sanitize(data: unknown): unknown {
    if (typeof data === "string") {
      return data.replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, "***@***.com");
    }
    if (typeof data === "object" && data !== null) {
      const clone: any = Array.isArray(data) ? [] : {};
      for (const key of Object.keys(data)) {
        if (/token|password|secret|credential|key/i.test(key)) {
          clone[key] = "[REDACTED]";
        } else {
          clone[key] = sanitize((data as Record<string, unknown>)[key]);
        }
      }
      return clone;
    }
    return data;
  }

  return {
    debug(tag: string, message: string, data?: unknown): void {
      if (isDev) {
        console.debug(`🔍 [OpsFlow:${tag}]`, message, data !== undefined ? sanitize(data) : "");
      }
    },
    info(tag: string, message: string, data?: unknown): void {
      if (isDev) {
        console.log(`ℹ️ [OpsFlow:${tag}]`, message, data !== undefined ? sanitize(data) : "");
      }
    },
    success(tag: string, message: string, data?: unknown): void {
      if (isDev) {
        console.log(`✅ [OpsFlow:${tag}]`, message, data !== undefined ? sanitize(data) : "");
      }
    },
    warn(tag: string, message: string, data?: unknown): void {
      console.warn(`⚠️ [OpsFlow:${tag}]`, message, data !== undefined ? sanitize(data) : "");
    },
    error(tag: string, message: string, error?: unknown): void {
      console.error(`❌ [OpsFlow:${tag}]`, message, error !== undefined ? sanitize(error) : "");
    },
  };
}

export default useSecureLogger;
