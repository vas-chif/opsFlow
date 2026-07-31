/**
 * @file genkit.ts
 * @description Genkit initialization with Gemini plugin and Firebase Auth
 * @author Vasile Chifeac
 * @created 2026-07-16
 * @modified 2026-07-16
 *
 * @notes
 * - Central entrypoint for all AI agents/flows
 * - Uses env vars for API keys; never logs credentials
 *
 * @dependencies
 * - genkit, @genkit-ai/googleai, @genkit-ai/firebase-auth
 *
 * @performance
 * - Initialized once per cold start
 * - No per-request overhead
 */

// ── Firebase ─────────────────────────────────────────────────────────────────
import { genkit } from "genkit";
import { googleAI } from "@genkit-ai/googleai";

// ── Utils ────────────────────────────────────────────────────────────────────
import "dotenv/config";

// ── Initialization ───────────────────────────────────────────────────────────
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GOOGLE_API_KEY ?? "",
    }),
  ],
}); /*end ai*/
