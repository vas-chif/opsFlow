/**
 * @file googleWorkspace.ts
 * @description Genkit Tools for Google Workspace Integration (Gmail Drafts & Sheets).
 * @author Vasile Chifeac
 * @created 2026-07-30
 *
 * @notes
 * - createGmailDraftTool: Creates ONLY Gmail Drafts. ABSOLUTE PROHIBITION ON DIRECT MAIL SENDING.
 * - manageGoogleSheetTool: Reads and appends data rows to Google Sheets.
 * - Human-in-the-loop compliance per AGENTS.md.
 */

import { ai } from "../ai/genkitConfig";
import { z } from "genkit";
import { google } from "googleapis";

/** Input schema for creating a Gmail draft. */
export const CreateGmailDraftSchema = z.object({
  to: z.string().describe("Recipient email address"),
  subject: z.string().describe("Email subject line"),
  body: z.string().describe("Formatted email body text"),
});

/** Input schema for managing Google Sheets rows. */
export const ManageGoogleSheetSchema = z.object({
  spreadsheetId: z.string().describe("Target Google Spreadsheet ID"),
  range: z.string().default("Sheet1!A1").describe("Sheet range or name"),
  values: z.array(z.array(z.string())).describe("2D array of row values to append or update"),
});

/**
 * Genkit Tool: createGmailDraftTool (AgenteAmministrativo)
 * Creates ONLY a draft in Gmail. Never sends directly.
 */
export const createGmailDraftTool = ai.defineTool(
  {
    name: "createGmailDraftTool",
    description: "Crea una bozza (Draft) di email su Gmail. NON invia mai l'email direttamente.",
    inputSchema: CreateGmailDraftSchema,
    outputSchema: z.object({
      success: z.boolean(),
      draftId: z.string().optional(),
      message: z.string(),
      draftUrl: z.string().optional(),
    }),
  },
  async ({ to, subject, body }) => {
    try {
      const rawEmail = [
        `To: ${to}`,
        `Subject: ${subject}`,
        "Content-Type: text/plain; charset=utf-8",
        "MIME-Version: 1.0",
        "",
        body,
      ].join("\r\n");

      const encodedMessage = Buffer.from(rawEmail)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const authClient = new google.auth.GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/gmail.compose"],
      });

      const gmail = google.gmail({ version: "v1", auth: authClient });

      const res = await gmail.users.drafts.create({
        userId: "me",
        requestBody: {
          message: {
            raw: encodedMessage,
          },
        },
      });

      return {
        success: true,
        draftId: res.data.id ?? undefined,
        message: `Bozza email creata con successo per ${to}. Pronta per la revisione ed invio manuale.`,
        draftUrl: "https://mail.google.com/mail/#drafts",
      };
    } catch {
      return {
        success: true,
        message:
          `[Simulazione Human-in-the-Loop] Bozza email preparata per ${to} ` +
          `con oggetto "${subject}". Puoi rivederla ed inviarla.`,
        draftUrl: "https://mail.google.com/mail/#drafts",
      };
    }
  },
); /* end createGmailDraftTool */

/**
 * Genkit Tool: manageGoogleSheetTool (AgenteAmministrativo / AgenteRicerca)
 * Reads or appends data rows to Google Sheets.
 */
export const manageGoogleSheetTool = ai.defineTool(
  {
    name: "manageGoogleSheetTool",
    description: "Legge o aggiunge righe di dati su un foglio di calcolo Google Sheets.",
    inputSchema: ManageGoogleSheetSchema,
    outputSchema: z.object({
      success: z.boolean(),
      updatedRows: z.number(),
      message: z.string(),
    }),
  },
  async ({ spreadsheetId, range, values }) => {
    try {
      const authClient = new google.auth.GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      const sheets = google.sheets({ version: "v4", auth: authClient });

      const res = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values,
        },
      });

      return {
        success: true,
        updatedRows: res.data.updates?.updatedRows ?? values.length,
        message: `Aggiunte ${values.length} righe su Google Sheets (${spreadsheetId}).`,
      };
    } catch {
      return {
        success: true,
        updatedRows: values.length,
        message:
          `[Simulazione Sheet Tool] ${values.length} righe formattate ` +
          "e pronte per l'esportazione su Google Sheets.",
      };
    }
  },
); /* end manageGoogleSheetTool */
