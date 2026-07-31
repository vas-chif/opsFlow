/**
 * @file contentMarketing.ts
 * @description Genkit Tool for Social & Content Marketing Automation (AgenteAmministrativo / Social Assistant).
 * @author Vasile Chifeac
 * @created 2026-07-30
 *
 * @notes
 * - contentMarketingTool: Generates editorial plans, LinkedIn posts, newsletter scripts, and Cold Outreach emails.
 */

import { ai } from "../ai/genkitConfig";
import { z } from "genkit";

/** Input schema for content marketing generation. */
export const ContentMarketingSchema = z.object({
  topic: z
    .string()
    .describe("Topic or offer subject (e.g. 'Servizi di supporto cloud per aziende')"),
  contentType: z
    .enum(["linkedin_post", "cold_email", "editorial_plan", "proposal_script"])
    .describe("Type of marketing content to generate"),
  targetAudience: z
    .string()
    .default("Decision maker IT e titolari d'azienda")
    .describe("Target audience description"),
});

/**
 * Genkit Tool: contentMarketingTool (Social & Content Assistant)
 * Generates marketing content tailored to the user's business services.
 */
export const contentMarketingTool = ai.defineTool(
  {
    name: "contentMarketingTool",
    description:
      "Genera piani editoriali, post LinkedIn, script newsletter o bozze di Cold Outreach per marketing.",
    inputSchema: ContentMarketingSchema,
    outputSchema: z.object({
      success: z.boolean(),
      contentType: z.string(),
      generatedText: z.string(),
      headline: z.string(),
    }),
  },
  async ({ topic, contentType, targetAudience }) => {
    let headline = "";
    let generatedText = "";

    if (contentType === "cold_email") {
      headline = `Bozza Cold Outreach: ${topic}`;
      generatedText =
        "Gentile Responsabile,\n\nHo notato la vostra costante crescita nel settore e volevo proporvi " +
        `una breve panoramica su come ottimizzare i vostri processi IT dedicati a "${topic}".\n\n` +
        "Sarei felice di condividere un breve report informativo senza alcun impegno.\n\n" +
        "Cordiali saluti,\nOpsFlow Assistant";
    } else if (contentType === "linkedin_post") {
      headline = `Post LinkedIn: ${topic}`;
      generatedText =
        "🚀 Come ottimizzare i processi operativi in azienda?\n\n" +
        `Oggi parliamo di ${topic} e di come l'automazione intelligente ed il controllo dei costi ` +
        `possono fare la differenza per ${targetAudience}.\n\n` +
        "👇 Condividi la tua opinione nei commenti!\n#OpsFlow #Automation #CloudIT";
    } else {
      headline = `Piano Editoriale: ${topic}`;
      generatedText =
        `📌 Settimana 1: Introduzione a ${topic}\n` +
        `📌 Settimana 2: Case Study su ${targetAudience}\n` +
        "📌 Settimana 3: Guida pratica e checklist operativa.";
    }

    return {
      success: true,
      contentType,
      generatedText,
      headline,
    };
  },
); /* end contentMarketingTool */
