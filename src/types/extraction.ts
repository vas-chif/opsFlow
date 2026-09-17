/**
 * @file extraction.ts
 * @description Centralized TypeScript definitions for Smart Resource Extraction, Table Connectors, and Chat Data Mapping.
 * @author Vasile Chifeac
 * @created 2026-09-14
 * @modified 2026-09-14
 *
 * @notes
 * - Transient client-side data transfer objects (DTOs) for inspecting chat tables, Google Sheets, emails and agent evaluations
 * - Powers 1-click column-to-field auto-mapping in subtask creation workflows
 * - UI-only data structures — not directly stored as standalone Firestore documents
 *
 * @dependencies
 * - None (pure TypeScript types)
 *
 * @performance
 * - Zero runtime overhead (compile-time contracts)
 */

/** Supported sources for data extraction into subtasks. */
export type ExtractionSourceType =
  | "sheets"
  | "chat_table"
  | "chat_response"
  | "email"
  | "keypoint"
  | "manual";

/**
 * Transitory candidate resource model extracted from chat or sheets.
 * UI-only — not a direct Firestore collection.
 */
export interface ExtractedResource {
  id: string;
  name: string;
  role?: string | undefined;
  contact?: string | undefined;
  notes?: string | undefined;
  source: ExtractionSourceType;
  sourceLabel: string;
  rawAttributes?: Record<string, unknown> | undefined;
  alreadyAdded?: boolean;
}

/**
 * Single column header and value for an active row in a detected table.
 */
export interface DetectedTableColumnValue {
  header: string;
  value: string;
  index: number;
}

/**
 * Single selectable row from a detected table or evaluation response.
 */
export interface DetectedTableRow {
  index: number;
  label: string;
  cells: string[];
  columns: DetectedTableColumnValue[];
}

/**
 * Detected table source (Markdown table, Google Sheets approval, or Agent structured response).
 */
export interface DetectedTableSource {
  id: string;
  label: string;
  type: ExtractionSourceType;
  headers: string[];
  rows: DetectedTableRow[];
}
