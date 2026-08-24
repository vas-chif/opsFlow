// @ts-nocheck
// opsflow-functions/src/index.ts

import { setGlobalOptions } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

// Configurazione globale Cloud Functions Gen 2
setGlobalOptions({
  region: "europe-west1", // Uniformità geografica: zero egress cost verso Firestore
  maxInstances: 10, // Hard-cap di sicurezza
});

const tavilyKey = defineSecret("TAVILY_API_KEY");
const exaKey = defineSecret("EXA_API_KEY");

export const chatWithAgent = onRequest(
  {
    cors: true,
    region: "europe-west1",
    memory: "512MiB", // Risparmio del 50% di RAM rispetto a 1GiB con zero rischio OOM
    timeoutSeconds: 60, // Timeout a 60s per arrestare rapidamente code di rete
    minInstances: 0, // Scale-to-Zero: 0,00 € in inattività
    concurrency: 10, // Fissato a 10 (Anti-OOM per sessioni concorrenti con Genkit)
    secrets: [tavilyKey, exaKey],
  },
  async (_req, _res) => {
    // ... controller logic chatWithAgentFlow ...
  },
);
