/**
 * @file useGoogleOAuth.ts
 * @description Client-side Google OAuth composable for OpsFlow consent flow and token status.
 * @author Vasile Chifeac
 * @created 2026-08-14
 * @modified 2026-08-14
 *
 * @notes
 * - Opens Google consent popup with access_type: 'offline' and prompt: 'consent'.
 * - Exchanges code via googleOAuthCallback Cloud Function (server-side, secure).
 * - Exposes reactive oauthError for banner rendering in TaskChatWindow.vue.
 * - Never stores tokens in browser memory or localStorage.
 *
 * @dependencies
 * - vue (ref, computed)
 * - firebase/auth (for current user UID + tenantId JWT claim)
 * - useSecureLogger
 *
 * @performance
 * - Zero Firestore reads (token state inferred from Cloud Function response)
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { ref, computed } from "vue";

// ── Firebase ─────────────────────────────────────────────────────────────────
import { getAuth } from "firebase/auth";

// ── Types ─────────────────────────────────────────────────────────────────────
import type { OAuthError, OAuthErrorCode } from "../types/models";

// ── Composables ───────────────────────────────────────────────────────────────
import { useSecureLogger } from "./useSecureLogger";

// ── Utils ─────────────────────────────────────────────────────────────────────
const FUNCTIONS_BASE_URL = import.meta.env.VITE_FUNCTIONS_BASE_URL as string;

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.readonly",
];

const SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
];

/** All scopes required by OpsFlow for full Google Workspace integration. */
export const ALL_GOOGLE_SCOPES = [...GMAIL_SCOPES, ...SHEETS_SCOPES];

// ── Composable ────────────────────────────────────────────────────────────────

export function useGoogleOAuth() {
  const logger = useSecureLogger();

  const isConnecting = ref(false);
  const isConnected = ref(false);
  const oauthError = ref<OAuthError | null>(null);

  const hasOAuthError = computed(() => oauthError.value !== null);

  /**
   * Returns the OAuthError banner label based on error code.
   */
  const oauthErrorBannerLabel = computed<string>(() => {
    if (!oauthError.value) return "";
    const labels: Record<OAuthErrorCode, string> = {
      TOKEN_EXPIRED: "Google account session expired.",
      INSUFFICIENT_SCOPES: "Missing Google permissions.",
      TOKEN_NOT_FOUND: "Google account not connected yet.",
    };
    return labels[oauthError.value.code] ?? "Google authentication error.";
  }); /*end oauthErrorBannerLabel*/

  /**
   * Opens the Google OAuth consent popup.
   * Uses access_type: 'offline' and prompt: 'consent' to guarantee refresh_token.
   *
   * Flow:
   * 1. Build the OAuth URL with all required scopes.
   * 2. Open popup window.
   * 3. Listen for postMessage from redirect page with the code.
   * 4. Exchange code via googleOAuthCallback Cloud Function.
   */
  async function connectGoogleAccount(): Promise<void> {
    isConnecting.value = true;
    oauthError.value = null;

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated.");

      const idTokenResult = await user.getIdTokenResult();
      const tenantId = (idTokenResult.claims["tenantId"] as string | undefined) ?? user.uid;

      const clientId =
        (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ||
        "348805838247-8p7qa4j09bfaa0f7neun7qg0lk6f7le1.apps.googleusercontent.com";
      const redirectUri =
        (import.meta.env.VITE_GOOGLE_REDIRECT_URI as string | undefined)?.trim() ||
        "https://europe-west1-opsflow-88of.cloudfunctions.net/googleOAuthCallback";

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: ALL_GOOGLE_SCOPES.join(" "),
        access_type: "offline",
        prompt: "select_account consent",
        state: user.uid,
      });

      const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

      // Open consent popup
      const popup = window.open(oauthUrl, "google-oauth-consent", "width=540,height=660");

      if (!popup) {
        throw new Error("Popup blocked. Allow popups for this site.");
      }

      // Listen for the OAuth code via postMessage from the redirect page
      const code = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("OAuth consent timed out after 3 minutes."));
        }, 180_000);

        const handler = (event: MessageEvent): void => {
          if (event.origin !== window.location.origin) return;
          if (event.data?.type === "GOOGLE_OAUTH_CODE") {
            clearTimeout(timeout);
            window.removeEventListener("message", handler);
            resolve(event.data.code as string);
          }
        };
        window.addEventListener("message", handler);
      });

      // Exchange code for tokens via secure Cloud Function
      const response = await fetch(`${FUNCTIONS_BASE_URL}/googleOAuthCallback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          tenantId,
          userId: user.uid,
          scopes: ALL_GOOGLE_SCOPES,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.status}`);
      }

      isConnected.value = true;
      logger.success("GoogleOAuth", "Google account connected successfully.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown OAuth error.";
      oauthError.value = { code: "TOKEN_NOT_FOUND", message };
      logger.error("GoogleOAuth", "Failed to connect Google account", { message });
    } finally {
      isConnecting.value = false;
    }
  } /*end connectGoogleAccount*/

  /**
   * Handles an OAuthError received from a Cloud Function response (e.g. resolveApproval).
   * Surfaces the error banner in the chat.
   */
  function handleOAuthError(error: OAuthError): void {
    oauthError.value = error;
    isConnected.value = false;
    logger.warn("GoogleOAuth", `OAuth error: ${error.code}`, { code: error.code });
  } /*end handleOAuthError*/

  /**
   * Clears the current OAuth error state (e.g. after reconnection).
   */
  function clearOAuthError(): void {
    oauthError.value = null;
  } /*end clearOAuthError*/

  return {
    isConnecting,
    isConnected,
    oauthError,
    hasOAuthError,
    oauthErrorBannerLabel,
    connectGoogleAccount,
    handleOAuthError,
    clearOAuthError,
  };
} /*end useGoogleOAuth*/

export default useGoogleOAuth;
