<script setup lang="ts">
/**
 * @file CreateSubtaskModal.vue
 * @description Unified Resource Extraction & Sub-Task Creation Dialog with dynamic user-driven source connector (Tables, Sheets, AI Responses, and Manual).
 * @author Vasile Chifeac
 * @created 2026-09-14
 * @modified 2026-09-14
 *
 * @notes
 * - Unified single-screen workflow (no fragmented tabs): user picks the data source (Chat Table, Agent Evaluation, Google Sheets, Email or Freehand).
 * - Displays active row cells as interactive chips for 1-click auto-mapping or direct assignment.
 * - Extracts candidate profiles and technical evaluation attributes without mistaking bullet titles for candidate names.
 * - Inherits domain from parent task category with subtle badge and optional override.
 * - Centralized types imported from src/types/extraction.ts and src/types/models.ts.
 * - Atomic write to Firestore tenants/{t}/workspaces/{w}/tasks/{taskId}/subtasks/{subtaskId}.
 *
 * @dependencies
 * - Firebase Firestore (client SDK)
 * - useAuthStore, useTaskChatStore, useSecureLogger
 *
 * @performance
 * - Client-side regex & table inspection (<2ms)
 * - Single atomic Firestore write
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { computed, ref, watch } from "vue";
import { useQuasar } from "quasar";

// ── Firebase ─────────────────────────────────────────────────────────────────
import { getFirestore, collection, doc, setDoc } from "firebase/firestore";

// ── Types ────────────────────────────────────────────────────────────────────
import type {
  Task,
  EntitySubTask,
  EntityDomain,
  ApprovalRecord,
  TaskChatMessage,
  SheetAppendPreview,
  GmailDraftPreview,
} from "../types/models";
import type {
  DetectedTableColumnValue,
  DetectedTableRow,
  DetectedTableSource,
} from "../types/extraction";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useAuthStore } from "../stores/authStore";
import { useTaskChatStore } from "../stores/taskChatStore";

// ── Composables ──────────────────────────────────────────────────────────────
import { useSecureLogger } from "../composables/useSecureLogger";

// ── Props & Emits ─────────────────────────────────────────────────────────────
const props = defineProps<{
  modelValue: boolean;
  taskId: string;
  workspaceId: string;
  task?: Task | null;
  messages?: TaskChatMessage[];
  approvals?: ApprovalRecord[];
  existingSubtasks?: EntitySubTask[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
  (e: "created", newSubtask: EntitySubTask): void;
}>();

const q = useQuasar();
const authStore = useAuthStore();
const chatStore = useTaskChatStore();
const logger = useSecureLogger();

// ── State ─────────────────────────────────────────────────────────────────────
const isOpen = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit("update:modelValue", val),
});

const isSaving = ref<boolean>(false);

// Source & Table Connector State
const detectedSources = ref<DetectedTableSource[]>([]);
const selectedSourceId = ref<string>("manual");
const selectedRowIndex = ref<number | null>(null);
const showDomainSelect = ref<boolean>(false);

// Form Fields
const formName = ref<string>("");
const formRole = ref<string>("");
const formDomain = ref<EntityDomain>("recruiting");
const formEmail = ref<string>("");
const formProfileUrl = ref<string>("");
const formContact = ref<string>("");
const formNotes = ref<string>("");

const domainOptions: { label: string; value: EntityDomain; icon: string }[] = [
  { label: "Recruiting & Human Resources", value: "recruiting", icon: "person" },
  { label: "Healthcare & Clinical Care", value: "healthcare", icon: "medical_services" },
  { label: "Procurement & Supplies", value: "procurement", icon: "inventory_2" },
  { label: "Operations & Equipment", value: "operations", icon: "precision_manufacturing" },
  { label: "General / Other", value: "generic", icon: "assignment_ind" },
];

// ── Computed Properties ───────────────────────────────────────────────────────
const defaultDomain = computed<EntityDomain>(() => {
  const cat = (props.task?.aiMetadata?.suggestedCategory || "").toLowerCase();
  if (cat.includes("recruiting") || cat.includes("hr")) return "recruiting";
  if (cat.includes("health") || cat.includes("sanit")) return "healthcare";
  if (cat.includes("procure") || cat.includes("fornit")) return "procurement";
  if (cat.includes("operat")) return "operations";
  return "generic";
});

const inheritedDomainLabel = computed<string>(() => {
  const cat = (props.task?.aiMetadata?.suggestedCategory || "").toLowerCase();
  if (cat.includes("recruiting") || cat.includes("hr")) return "Recruiting & HR";
  if (cat.includes("health") || cat.includes("sanit")) return "Healthcare & Clinical";
  if (cat.includes("procure") || cat.includes("fornit")) return "Procurement & Supplies";
  if (cat.includes("operat")) return "Operations & Equipment";
  return "General";
});

const activeSource = computed<DetectedTableSource | undefined>(() => {
  return detectedSources.value.find((s) => s.id === selectedSourceId.value);
});

const activeRow = computed<DetectedTableRow | undefined>(() => {
  if (!activeSource.value || selectedRowIndex.value === null) return undefined;
  return activeSource.value.rows.find((r) => r.index === selectedRowIndex.value);
});

const sourceOptions = computed(() => {
  return detectedSources.value.map((s) => {
    let icon = "edit_note";
    let color = "grey-7";
    if (s.type === "sheets") {
      icon = "grid_on";
      color = "positive";
    } else if (s.type === "chat_table") {
      icon = "table_chart";
      color = "primary";
    } else if (s.type === "chat_response") {
      icon = "psychology";
      color = "amber-9";
    } else if (s.type === "email") {
      icon = "email";
      color = "teal-7";
    }
    return {
      label: s.label,
      value: s.id,
      icon,
      color,
      rowsCount: s.rows.length,
    };
  });
});

interface SourceOptionItem {
  label: string;
  value: string;
  icon: string;
  color: string;
  rowsCount: number;
}

interface RowOptionItem {
  label: string;
  value: number;
}

const filteredSourceOptions = ref<SourceOptionItem[]>([]);

watch(
  sourceOptions,
  (newOpts) => {
    filteredSourceOptions.value = newOpts;
  },
  { immediate: true },
);

const filterSources = (val: string, update: (callback: () => void) => void): void => {
  const needle = val.toLowerCase().trim();
  update(() => {
    if (!needle) {
      filteredSourceOptions.value = sourceOptions.value;
    } else {
      filteredSourceOptions.value = sourceOptions.value.filter((s) =>
        s.label.toLowerCase().includes(needle),
      );
    }
  });
}; /*end filterSources*/

const rowOptions = computed<RowOptionItem[]>(() => {
  if (!activeSource.value) return [];
  return activeSource.value.rows.map((r) => ({
    label: r.label,
    value: r.index,
  }));
});

const filteredRowOptions = ref<RowOptionItem[]>([]);

watch(
  rowOptions,
  (newOpts) => {
    filteredRowOptions.value = newOpts;
  },
  { immediate: true },
);

const filterRows = (val: string, update: (callback: () => void) => void): void => {
  if (!activeSource.value) {
    update(() => {
      filteredRowOptions.value = [];
    });
    return;
  }

  const needle = val.toLowerCase().trim();
  update(() => {
    if (!needle) {
      filteredRowOptions.value = rowOptions.value;
    } else {
      filteredRowOptions.value = activeSource
        .value!.rows.filter((r) => {
          const matchLabel = r.label.toLowerCase().includes(needle);
          const matchCells = r.cells.some((c) =>
            String(c ?? "")
              .toLowerCase()
              .includes(needle),
          );
          return matchLabel || matchCells;
        })
        .map((r) => ({
          label: r.label,
          value: r.index,
        }));
    }
  });
}; /*end filterRows*/

// ── Extraction Parser Logic ───────────────────────────────────────────────────
const extractSourcesFromContext = (): void => {
  const sources: DetectedTableSource[] = [];

  // 1. Scan Approvals: Google Sheets (sheet_append)
  if (props.approvals && props.approvals.length > 0) {
    for (const app of props.approvals) {
      if (app.actionType === "sheet_append" && app.previewData) {
        const preview = app.previewData as SheetAppendPreview;
        const rawRows = preview.previewRows || [];
        if (rawRows.length > 0) {
          const firstR = rawRows[0];
          const cells0 = Array.isArray(firstR)
            ? firstR.map((c) => String(c ?? "").trim())
            : ((firstR as { cells?: (string | number)[] })?.cells || []).map((c) =>
                String(c ?? "").trim(),
              );
          const hasHeader = cells0.some((c) =>
            /^(nome|name|candidat|ruolo|role|contatt|email|tariffa|note|colonna|item|titolo)/i.test(
              c,
            ),
          );
          const headerList = hasHeader ? cells0 : cells0.map((_, idx) => `Column ${idx + 1}`);
          const startIdx = hasHeader ? 1 : 0;

          const tableRows: DetectedTableRow[] = [];
          for (let r = startIdx; r < rawRows.length; r++) {
            const rowItem = rawRows[r];
            const cells = Array.isArray(rowItem)
              ? rowItem.map((c) => String(c ?? "").trim())
              : ((rowItem as { cells?: (string | number)[] })?.cells || []).map((c) =>
                  String(c ?? "").trim(),
                );
            if (cells.every((c) => !c)) continue;

            const colValues: DetectedTableColumnValue[] = cells.map((cell, cIdx) => ({
              header: headerList[cIdx] || `Column ${cIdx + 1}`,
              value: cell,
              index: cIdx,
            }));

            tableRows.push({
              index: tableRows.length,
              label: `Row ${tableRows.length + 1}: ${cells[0] || "Item"}${cells[1] ? ` (${cells[1]})` : ""}`,
              cells,
              columns: colValues,
            });
          }

          if (tableRows.length > 0) {
            sources.push({
              id: `src-sheet-${app.id}`,
              label: preview.range
                ? `📑 Google Sheet (${preview.range} — ${tableRows.length} rows)`
                : `📑 Google Sheet (${tableRows.length} rows)`,
              type: "sheets",
              headers: headerList,
              rows: tableRows,
            });
          }
        }
      } else if (app.actionType === "gmail_draft" && app.previewData) {
        const draft = app.previewData as GmailDraftPreview;
        if (draft.to) {
          const cells = [draft.to, draft.subject || ""];
          const cols: DetectedTableColumnValue[] = [
            { header: "Email Recipient", value: draft.to, index: 0 },
            { header: "Draft Subject", value: draft.subject || "", index: 1 },
          ];
          sources.push({
            id: `src-email-${app.id}`,
            label: `✉️ Email Draft for ${draft.to}`,
            type: "email",
            headers: ["Email Recipient", "Draft Subject"],
            rows: [
              {
                index: 0,
                label: `Draft: ${draft.to}`,
                cells,
                columns: cols,
              },
            ],
          });
        }
      }
    }
  }

  // 2. Scan Chat Messages: Markdown Tables & Structured Evaluations
  if (props.messages && props.messages.length > 0) {
    const agentMsgs = props.messages.filter((m) => m.sender === "agent").slice(-6);

    for (let mIdx = agentMsgs.length - 1; mIdx >= 0; mIdx--) {
      const msg = agentMsgs[mIdx]!;
      const text = msg.text || "";
      const lines = text.split("\n");

      // 2a. Check for Markdown Tables
      let inTable = false;
      let headerCols: string[] = [];
      let currentTableRows: DetectedTableRow[] = [];

      for (let lIdx = 0; lIdx < lines.length; lIdx++) {
        const line = lines[lIdx] || "";
        const trimmed = line.trim();
        if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
          const rawCells = trimmed
            .split("|")
            .slice(1, -1)
            .map((c) => c.trim().replace(/\*\*/g, ""));

          if (rawCells.every((c) => /^[-:\s]+$/.test(c))) {
            inTable = true;
            continue;
          }

          if (!inTable) {
            headerCols = rawCells;
          } else {
            if (rawCells.some((c) => c.length > 0)) {
              const colValues: DetectedTableColumnValue[] = rawCells.map((cell, cIdx) => ({
                header: headerCols[cIdx] || `Column ${cIdx + 1}`,
                value: cell,
                index: cIdx,
              }));

              currentTableRows.push({
                index: currentTableRows.length,
                label: `Row ${currentTableRows.length + 1}: ${rawCells[0] || "Item"}${rawCells[1] ? ` (${rawCells[1]})` : ""}`,
                cells: rawCells,
                columns: colValues,
              });
            }
          }
        } else {
          if (inTable && currentTableRows.length > 0) {
            sources.push({
              id: `src-chat-tbl-${msg.id}-${sources.length}`,
              label: `📊 Chat Table (${currentTableRows.length} rows)`,
              type: "chat_table",
              headers: headerCols,
              rows: [...currentTableRows],
            });
            currentTableRows = [];
            headerCols = [];
          }
          inTable = false;
        }
      }

      if (inTable && currentTableRows.length > 0) {
        sources.push({
          id: `src-chat-tbl-${msg.id}-${sources.length}`,
          label: `📊 Chat Table (${currentTableRows.length} rows)`,
          type: "chat_table",
          headers: headerCols,
          rows: [...currentTableRows],
        });
      }

      // 2b. Check for Structured Evaluation Response (Bullet Points with Keys like in user's screenshot)
      const evalRegex = /(?:^|\n)\s*(?:[\d]+\.|\*|-)\s*\*\*([^*:]+)\*\*\s*[:–—]\s*([^\n]+)/g;
      const parsedAttrs: DetectedTableColumnValue[] = [];
      let evalMatch: RegExpExecArray | null;

      while ((evalMatch = evalRegex.exec(text)) !== null) {
        const key = (evalMatch[1] || "").trim();
        const val = (evalMatch[2] || "").trim();
        if (key.length >= 2 && val.length >= 1) {
          parsedAttrs.push({
            header: key,
            value: val,
            index: parsedAttrs.length,
          });
        }
      }

      // If this message has 2 or more structured evaluation attributes, treat it as a candidate evaluation source
      if (parsedAttrs.length >= 2) {
        let candidateNameCandidate = "";
        const nameHeadingMatch = text.match(
          /(?:candidato|profilo|trainer|risorsa|analisi|valutazione)\s*[:#*–—\s]+([A-Z][a-zà-ú]+(?:\s+[A-Z][a-zà-ú]+)+)/i,
        );
        if (nameHeadingMatch && nameHeadingMatch[1]) {
          candidateNameCandidate = nameHeadingMatch[1].trim();
        }

        const roleAttr = parsedAttrs.find((a) =>
          /(ruolo|profilo|specializz|mansione)/i.test(a.header),
        );
        const rowLabel = candidateNameCandidate
          ? `${candidateNameCandidate}${roleAttr ? ` — ${roleAttr.value}` : ""}`
          : roleAttr
            ? `Profile: ${roleAttr.value}`
            : `Agent Evaluation (${parsedAttrs.length} attributes)`;

        sources.push({
          id: `src-chat-eval-${msg.id}`,
          label: `💬 AI Evaluation: ${rowLabel.slice(0, 50)}`,
          type: "chat_response",
          headers: parsedAttrs.map((a) => a.header),
          rows: [
            {
              index: 0,
              label: rowLabel,
              cells: parsedAttrs.map((a) => a.value),
              columns: parsedAttrs,
            },
          ],
        });
      }
    }
  }

  // 3. Scan KeyPoints with category === 'lead'
  const keyPoints = chatStore.getKeyPoints(props.taskId);
  for (const kp of keyPoints) {
    sources.push({
      id: `src-kp-${kp.id}`,
      label: `💡 KeyPoint: ${kp.title.slice(0, 40)}`,
      type: "keypoint",
      headers: ["Lead Title", "Details"],
      rows: [
        {
          index: 0,
          label: kp.title,
          cells: [kp.title, kp.detail || ""],
          columns: [
            { header: "Lead Name / Title", value: kp.title, index: 0 },
            { header: "Operational Details", value: kp.detail || "", index: 1 },
          ],
        },
      ],
    });
  }

  // Always include Manual Freehand option
  sources.push({
    id: "manual",
    label: "✍️ Freehand Manual Entry (No source)",
    type: "manual",
    headers: [],
    rows: [],
  });

  detectedSources.value = sources;

  // Auto-select first source if available
  if (sources.length > 1) {
    selectedSourceId.value = sources[0]!.id;
    selectedRowIndex.value = sources[0]!.rows[0]?.index ?? null;
  } else {
    selectedSourceId.value = "manual";
    selectedRowIndex.value = null;
  }
}; /*end extractSourcesFromContext*/

// Watch modal open to refresh source inspection
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      extractSourcesFromContext();
      resetForm();
    }
  },
  { immediate: true },
);

const resetForm = (): void => {
  formName.value = "";
  formRole.value = "";
  formDomain.value = defaultDomain.value;
  formEmail.value = "";
  formProfileUrl.value = "";
  formContact.value = "";
  formNotes.value = "";
  showDomainSelect.value = false;

  if (detectedSources.value.length > 1) {
    selectedSourceId.value = detectedSources.value[0]!.id;
    selectedRowIndex.value = detectedSources.value[0]!.rows[0]?.index ?? null;
  } else {
    selectedSourceId.value = "manual";
    selectedRowIndex.value = null;
  }
}; /*end resetForm*/

const handleSelectSource = (sourceId: string): void => {
  selectedSourceId.value = sourceId;
  const src = detectedSources.value.find((s) => s.id === sourceId);
  if (src && src.rows.length > 0) {
    selectedRowIndex.value = src.rows[0]!.index;
  } else {
    selectedRowIndex.value = null;
  }
}; /*end handleSelectSource*/

const handleSelectRow = (rowIndex: number | null): void => {
  selectedRowIndex.value = rowIndex;
}; /*end handleSelectRow*/

const autoMapFromActiveRow = (): void => {
  if (!activeRow.value) {
    q.notify({ type: "warning", message: "Please select a valid row or source first." });
    return;
  }

  const cols = activeRow.value.columns;
  let mappedCount = 0;
  const extraNotes: string[] = [];

  for (const col of cols) {
    const h = col.header.toLowerCase().trim();
    const v = col.value.trim();
    if (!v) continue;

    // Check Name
    if (
      /(nome|name|candidat|persona|trainer|consulente|fornitore|paziente)/i.test(h) &&
      !/(ruolo|profilo)/i.test(h) &&
      !formName.value
    ) {
      formName.value = v;
      mappedCount++;
      continue;
    }

    // Check Role
    if (/(ruolo|role|specializz|competenz|mansione|titolo|figura)/i.test(h) && !formRole.value) {
      formRole.value = v;
      mappedCount++;
      continue;
    }

    // Check Email
    if (
      (/(email|e-mail|mail)/i.test(h) || /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/.test(v)) &&
      !formEmail.value
    ) {
      formEmail.value = v;
      mappedCount++;
      continue;
    }

    // Check Profile / LinkedIn / Web
    if (
      (/(linkedin|profilo|url|link|sito|web)/i.test(h) || /^https?:\/\//i.test(v)) &&
      !/(ruolo)/i.test(h) &&
      !formProfileUrl.value
    ) {
      formProfileUrl.value = v;
      mappedCount++;
      continue;
    }

    // Check Phone / Contact
    if (/(telefono|tel|cell|phone|contatt)/i.test(h) && !formContact.value) {
      formContact.value = v;
      mappedCount++;
      continue;
    }

    // Extra columns (Location, Competenze, Gap, Compliance, Tariffa, Età, Note)
    extraNotes.push(`[${col.header}: ${v}]`);
  }

  // Fallback for Name if not yet matched
  if (!formName.value && activeSource.value?.type === "chat_table" && cols[0]?.value) {
    formName.value = cols[0].value;
    mappedCount++;
  } else if (!formName.value && activeSource.value?.type === "chat_response") {
    const candidateMatch = activeRow.value.label.match(/^([A-Z][a-zà-ú]+(?:\s+[A-Z][a-zà-ú]+)+)/);
    if (candidateMatch && candidateMatch[1]) {
      formName.value = candidateMatch[1];
      mappedCount++;
    }
  }

  // Append extra attributes into notes
  if (extraNotes.length > 0) {
    const formatted = extraNotes.join("\n");
    if (!formNotes.value.includes(extraNotes[0]!)) {
      formNotes.value = formNotes.value ? `${formNotes.value}\n\n${formatted}` : formatted;
    }
  }

  q.notify({
    type: "positive",
    message: `Mapped ${mappedCount} fields from source data!`,
    icon: "auto_fix_high",
  });
}; /*end autoMapFromActiveRow*/

const applyColumnToField = (
  target: "name" | "role" | "email" | "profile" | "contact" | "notes",
  val: string,
  headerTitle: string,
): void => {
  if (target === "name") formName.value = val;
  else if (target === "role") formRole.value = val;
  else if (target === "email") formEmail.value = val;
  else if (target === "profile") formProfileUrl.value = val;
  else if (target === "contact") formContact.value = val;
  else if (target === "notes") {
    const entry = `[${headerTitle}: ${val}]`;
    formNotes.value = formNotes.value ? `${formNotes.value}\n${entry}` : entry;
  }

  q.notify({
    type: "info",
    message: `Assigned "${val.slice(0, 25)}..." to ${target.toUpperCase()}`,
    timeout: 1200,
  });
}; /*end applyColumnToField*/

const handleCreateSubtaskFromData = async (payload: {
  name: string;
  role?: string | undefined;
  contact?: string | undefined;
  notes?: string | undefined;
  domain?: EntityDomain | undefined;
  attributes?: Record<string, unknown> | undefined;
}): Promise<void> => {
  const tId = authStore.tenantId;
  const wsId = props.workspaceId;
  const taskId = props.taskId;

  if (!tId || !wsId || !taskId) {
    q.notify({ type: "negative", message: "Invalid context ID for creation." });
    return;
  }

  if (!payload.name.trim()) {
    q.notify({ type: "warning", message: "Please enter a valid name for the resource." });
    return;
  }

  isSaving.value = true;
  try {
    const db = getFirestore();
    const subCol = collection(db, "tenants", tId, "workspaces", wsId, "tasks", taskId, "subtasks");
    const newRef = doc(subCol);
    const nowIso = new Date().toISOString();

    const newSubtask: EntitySubTask = {
      id: newRef.id,
      tenantId: tId,
      workspaceId: wsId,
      taskId,
      domain: payload.domain || formDomain.value || defaultDomain.value,
      title: payload.name.trim(),
      ...(payload.role?.trim() ? { subtitle: payload.role.trim() } : {}),
      status: "new",
      outcome: "in_progress",
      attributes: {
        ...payload.attributes,
        ...(payload.contact?.trim() ? { contactInfo: payload.contact.trim() } : {}),
      },
      notes: payload.notes?.trim() || "",
      timeline: [
        {
          id: `evt_init_${Date.now()}`,
          eventType: "status_change",
          title: "Resource registered in task",
          description: payload.role ? `Profile: ${payload.role}` : "Created via Smart Extraction",
          authorId: authStore.user?.uid || "user",
          authorName: authStore.user?.displayName || "Operator",
          timestamp: nowIso,
        },
      ],
      nestedTasks: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await setDoc(newRef, newSubtask);

    q.notify({
      type: "positive",
      message: `Resource "${payload.name}" created successfully!`,
      icon: "check_circle",
    });

    emit("created", newSubtask);
    isOpen.value = false;
  } catch (err) {
    logger.error("CreateSubtaskModal", "Error creating subtask", err);
    q.notify({ type: "negative", message: "Error saving to Firestore." });
  } finally {
    isSaving.value = false;
  }
}; /*end handleCreateSubtaskFromData*/

const handleSubmitManual = async (): Promise<void> => {
  const contactParts = [
    formEmail.value.trim(),
    formProfileUrl.value.trim(),
    formContact.value.trim(),
  ].filter(Boolean);
  const primaryContact = contactParts.join(" | ");

  await handleCreateSubtaskFromData({
    name: formName.value,
    role: formRole.value || undefined,
    domain: formDomain.value,
    contact: primaryContact || undefined,
    notes: formNotes.value || undefined,
    attributes: {
      ...(formEmail.value.trim() ? { email: formEmail.value.trim() } : {}),
      ...(formProfileUrl.value.trim() ? { profileUrl: formProfileUrl.value.trim() } : {}),
      ...(activeRow.value ? { extractedRow: activeRow.value.cells } : {}),
      ...(activeSource.value ? { headers: activeSource.value.headers } : {}),
    },
  });
}; /*end handleSubmitManual*/
</script>

<template>
  <q-dialog v-model="isOpen" persistent transition-show="scale" transition-hide="scale">
    <q-card
      class="create-subtask-dialog column no-wrap"
      style="width: 780px; max-width: 95vw; max-height: 88vh; background-color: #fcfbfa"
    >
      <!-- Header Elite -->
      <div class="q-pa-md bg-royal-navy text-white row items-center justify-between no-wrap">
        <div class="row items-center q-gutter-x-sm">
          <q-avatar size="36px" color="amber-9" text-color="dark" icon="person_add" />
          <div>
            <div class="text-subtitle1 text-weight-bolder text-white">
              New Resource / Operational Sub-Task
            </div>
            <div class="text-caption text-grey-4">
              Track dedicated contacts, outcomes, and timeline for this entity
            </div>
          </div>
        </div>
        <q-btn round dense flat color="grey-4" icon="close" @click="isOpen = false">
          <q-tooltip>Close</q-tooltip>
        </q-btn>
      </div>

      <!-- Main Unified Content (No Tabs!) -->
      <div class="col scroll q-pa-md q-gutter-y-md" style="overflow-y: auto">
        <!-- ── SECTION 1: Flexible User-Driven Source Connector ───────────────── -->
        <q-card flat bordered class="bg-blue-1 border-navy-subtle rounded-borders q-pa-sm">
          <div class="row items-center justify-between q-mb-xs">
            <div
              class="row items-center q-gutter-x-xs text-primary text-weight-bolder text-caption"
            >
              <q-icon name="hub" size="18px" color="primary" />
              <span>Data Source (Select where to import information from)</span>
            </div>
            <q-badge
              v-if="detectedSources.length > 1"
              color="primary"
              outline
              size="xs"
              :label="`${detectedSources.length - 1} sources detected`"
            />
          </div>

          <!-- Source Select & Row Select -->
          <div class="row q-col-gutter-xs q-mb-xs">
            <div
              :class="activeSource && activeSource.rows.length > 1 ? 'col-12 col-sm-6' : 'col-12'"
            >
              <q-select
                v-model="selectedSourceId"
                :options="filteredSourceOptions"
                emit-value
                map-options
                dense
                outlined
                use-input
                input-debounce="0"
                fill-input
                hide-selected
                bg-color="white"
                label="Data Origin / Table"
                @filter="filterSources"
                @update:model-value="handleSelectSource"
              >
                <template #prepend>
                  <q-icon name="search" size="18px" color="primary" />
                </template>
                <template #option="scope">
                  <q-item v-bind="scope.itemProps" dense>
                    <q-item-section avatar style="min-width: 28px">
                      <q-icon :name="scope.opt.icon" size="18px" :color="scope.opt.color" />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label class="text-caption text-weight-bold">{{
                        scope.opt.label
                      }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </template>
                <template #no-option>
                  <q-item dense>
                    <q-item-section class="text-grey-6 text-caption">
                      No tables or sources found
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>

            <!-- Row Selector (only if multiple rows exist) with Live Search Bar -->
            <div v-if="activeSource && activeSource.rows.length > 1" class="col-12 col-sm-6">
              <q-select
                v-model="selectedRowIndex"
                :options="filteredRowOptions"
                emit-value
                map-options
                dense
                outlined
                use-input
                input-debounce="0"
                clearable
                fill-input
                hide-selected
                bg-color="white"
                label="Search and Select Row / Candidate"
                @filter="filterRows"
                @update:model-value="handleSelectRow"
              >
                <template #prepend>
                  <q-icon name="search" size="18px" color="primary" />
                </template>
                <template #no-option>
                  <q-item dense>
                    <q-item-section class="text-grey-6 text-caption">
                      No candidates or rows found matching query
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>
          </div>

          <!-- Active Row Columns / Attributes Chips -->
          <div
            v-if="activeRow && activeRow.columns.length > 0"
            class="bg-white rounded-borders q-pa-xs border-light-grey q-mt-xs"
          >
            <div class="row items-center justify-between q-px-xs q-py-2xs">
              <div
                class="row items-center q-gutter-x-xs text-caption text-grey-8"
                style="font-size: 0.74rem"
              >
                <q-icon name="list_alt" size="16px" color="primary" />
                <span class="text-weight-bold">
                  {{ activeRow.columns.length }} fields available in source
                </span>
                <span class="text-grey-6">(click a chip to assign value)</span>
              </div>
              <q-btn
                dense
                unelevated
                size="xs"
                color="amber-9"
                text-color="dark"
                icon="bolt"
                label="⚡ Map All Fields"
                class="text-weight-bold q-px-xs"
                @click="autoMapFromActiveRow"
              >
                <q-tooltip
                  >Automatically assign Name, Role, Email, LinkedIn and append details to
                  notes</q-tooltip
                >
              </q-btn>
            </div>

            <!-- Column Chips -->
            <div
              class="row items-center q-gutter-xs q-pa-xs"
              style="max-height: 140px; overflow-y: auto"
            >
              <q-chip
                v-for="col in activeRow.columns"
                :key="col.index"
                clickable
                dense
                size="sm"
                color="grey-2"
                text-color="dark"
                class="col-chip shadow-xs"
              >
                <span class="text-weight-bold text-primary q-mr-xs">{{ col.header }}:</span>
                <span class="ellipsis" style="max-width: 160px">{{ col.value || "—" }}</span>
                <q-menu auto-close>
                  <q-list dense style="min-width: 200px">
                    <q-item-label header class="text-caption text-weight-bold"
                      >Assign "{{ col.value.slice(0, 30) }}..." to:</q-item-label
                    >
                    <q-item clickable @click="applyColumnToField('name', col.value, col.header)">
                      <q-item-section avatar
                        ><q-icon name="person" size="16px" color="primary"
                      /></q-item-section>
                      <q-item-section class="text-caption">Full Name</q-item-section>
                    </q-item>
                    <q-item clickable @click="applyColumnToField('role', col.value, col.header)">
                      <q-item-section avatar
                        ><q-icon name="badge" size="16px" color="primary"
                      /></q-item-section>
                      <q-item-section class="text-caption">Role / Subtitle</q-item-section>
                    </q-item>
                    <q-item clickable @click="applyColumnToField('email', col.value, col.header)">
                      <q-item-section avatar
                        ><q-icon name="email" size="16px" color="primary"
                      /></q-item-section>
                      <q-item-section class="text-caption">Dedicated Email</q-item-section>
                    </q-item>
                    <q-item clickable @click="applyColumnToField('profile', col.value, col.header)">
                      <q-item-section avatar
                        ><q-icon name="link" size="16px" color="primary"
                      /></q-item-section>
                      <q-item-section class="text-caption">LinkedIn / Web Profile</q-item-section>
                    </q-item>
                    <q-item clickable @click="applyColumnToField('contact', col.value, col.header)">
                      <q-item-section avatar
                        ><q-icon name="phone" size="16px" color="primary"
                      /></q-item-section>
                      <q-item-section class="text-caption">Other Contact</q-item-section>
                    </q-item>
                    <q-separator />
                    <q-item clickable @click="applyColumnToField('notes', col.value, col.header)">
                      <q-item-section avatar
                        ><q-icon name="note_add" size="16px" color="amber-9"
                      /></q-item-section>
                      <q-item-section class="text-caption"
                        >Append to Operational Notes</q-item-section
                      >
                    </q-item>
                  </q-list>
                </q-menu>
              </q-chip>
            </div>
          </div>
        </q-card>

        <!-- ── SECTION 2: Operational Entity Input Fields ─────────────────────── -->
        <div class="q-gutter-y-sm">
          <!-- Full Width Name Input -->
          <div>
            <q-input
              v-model="formName"
              outlined
              dense
              label="Full Name / Entity Title *"
              placeholder="e.g. John Doe"
              class="bg-white"
              autofocus
              :rules="[(val) => !!val.trim() || 'Name is required']"
            >
              <template #prepend>
                <q-icon name="person" size="20px" color="primary" />
              </template>
            </q-input>
          </div>

          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-6">
              <q-input
                v-model="formRole"
                outlined
                dense
                label="Role / Specialization"
                placeholder="e.g. Senior Cloud Architect"
                class="bg-white"
              >
                <template #prepend>
                  <q-icon name="badge" size="20px" color="grey-6" />
                </template>
              </q-input>
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                v-model="formEmail"
                outlined
                dense
                type="email"
                label="Dedicated Email"
                placeholder="e.g. john.doe@example.com"
                class="bg-white"
              >
                <template #prepend>
                  <q-icon name="email" size="20px" color="grey-6" />
                </template>
              </q-input>
            </div>
          </div>

          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-6">
              <q-input
                v-model="formProfileUrl"
                outlined
                dense
                label="LinkedIn / Web Profile"
                placeholder="e.g. https://linkedin.com/in/..."
                class="bg-white"
              >
                <template #prepend>
                  <q-icon name="link" size="20px" color="grey-6" />
                </template>
              </q-input>
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                v-model="formContact"
                outlined
                dense
                label="Phone / Other Contact"
                placeholder="e.g. +1 555 123 4567"
                class="bg-white"
              >
                <template #prepend>
                  <q-icon name="phone" size="20px" color="grey-6" />
                </template>
              </q-input>
            </div>
          </div>

          <!-- Subtle Inherited Domain Indicator with Optional Override -->
          <div class="row items-center justify-between text-caption text-grey-7 q-px-xs">
            <div class="row items-center q-gutter-x-xs">
              <span>Domain:</span>
              <q-badge
                color="primary"
                outline
                :label="
                  domainOptions.find((d) => d.value === formDomain)?.label || 'Recruiting & HR'
                "
              />
              <span class="text-grey-5">(inherited from {{ inheritedDomainLabel }})</span>
            </div>
            <q-btn
              flat
              dense
              size="xs"
              color="grey-6"
              :label="showDomainSelect ? 'Hide selector' : 'Change domain'"
              @click="showDomainSelect = !showDomainSelect"
            />
          </div>

          <div v-if="showDomainSelect" class="q-pt-2xs">
            <q-select
              v-model="formDomain"
              :options="domainOptions"
              emit-value
              map-options
              outlined
              dense
              label="Custom Domain"
              class="bg-white"
            />
          </div>

          <!-- Manual Notes (100% freehand / editable) -->
          <q-input
            v-model="formNotes"
            type="textarea"
            outlined
            autogrow
            rows="3"
            label="Operational Notes / Manual Notes"
            placeholder="Write freehand observations, availability, contact outcome, or negotiation details here..."
            class="bg-white"
          >
            <template #prepend>
              <q-icon name="edit_note" size="20px" color="grey-6" />
            </template>
          </q-input>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="q-pa-md bg-white border-top-light row items-center justify-end q-gutter-x-sm">
        <q-btn flat label="Cancel" color="grey-7" @click="isOpen = false" />
        <q-btn
          unelevated
          color="primary"
          icon="add_task"
          label="Create Resource Record"
          class="text-weight-bold q-px-md"
          :loading="isSaving"
          :disabled="!formName.trim()"
          @click="handleSubmitManual"
        />
      </div>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.bg-royal-navy {
  background-color: #0a2342;
}

.border-bottom-light {
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.border-top-light {
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

.border-navy-subtle {
  border: 1px solid rgba(10, 35, 66, 0.15);
}

.border-light-grey {
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.col-chip {
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  }
}
</style>
