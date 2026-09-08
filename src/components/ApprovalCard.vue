<script setup lang="ts">
/**
 * @file ApprovalCard.vue
 * @description Human-in-the-Loop interactive preview, editing, and fullscreen modal card for pending AI actions.
 * @author Vasile Chifeac
 * @created 2026-08-14
 * @modified 2026-09-08
 *
 * @notes
 * - Renders inline in the Task Chat feed for each ApprovalRecord with status 'pending'.
 * - Supports Fullscreen Expanded Modal for detailed analysis and in-place editing.
 * - Supports editing recipient (TO), subject, body, signature, range, and table cells before approval.
 * - Emits 'approve' (with edited payload) and 'reject' events upward to TaskChatWindow.vue.
 * - Design System "Elite": border gold #c5a065, background off-white #f9f7f2, navy #0a2342.
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { computed, ref, watch } from "vue";
import { useQuasar } from "quasar";

// ── Types ─────────────────────────────────────────────────────────────────────
import type { ApprovalRecord, GmailDraftPreview } from "../types/models";

// ── Props & Emits ─────────────────────────────────────────────────────────────
const props = defineProps<{
  approval: ApprovalRecord;
  isResolving?: boolean;
}>();

const emit = defineEmits<{
  (e: "approve", approvalId: string, editedData?: Record<string, unknown>): void;
  (e: "reject", approvalId: string): void;
}>();

const q = useQuasar();

// ── State ─────────────────────────────────────────────────────────────────────
const isExpanded = ref<boolean>(false);
const isEditing = ref<boolean>(false);

// Editable fields
const editableTo = ref<string>("");
const editableSubject = ref<string>("");
const editableBody = ref<string>("");

const editableSpreadsheetId = ref<string>("");
const editableRange = ref<string>("A1");
const editableRows = ref<(string | number)[][]>([]);

const VERSILIA_CARE_SIGNATURE =
  "Cordiali saluti,\n\n" +
  "Dott. Vasile Chifeac Infermiere\n" +
  "Specialista in Area Critica e Terapia Intensiva\n" +
  "Versilia Care – Assistenza Infermieristica Specialistica\n" +
  "📍 Massa-Carrara e Versilia\n" +
  "🌐 https://versiliacare.it/ | 📞 +39 327 4459377\n" +
  "Email: versiliacare@gmail.com\n" +
  "Servizio Programmato su Appuntamento";

// ── Computed ──────────────────────────────────────────────────────────────────
const isGmailDraft = computed(() => props.approval.actionType === "gmail_draft");
const isSheetAppend = computed(() => props.approval.actionType === "sheet_append");
const isPending = computed(() => props.approval.status === "pending");
const isApproved = computed(() => props.approval.status === "approved");
const isRejected = computed(() => props.approval.status === "rejected");

const gmailPreview = computed<GmailDraftPreview | null>(() => {
  if (!isGmailDraft.value) return null;
  return props.approval.previewData as GmailDraftPreview;
}); /*end gmailPreview*/

const sheetPreview = computed<{
  spreadsheetId: string;
  range: string;
  previewRows: (string | number)[][];
} | null>(() => {
  if (!isSheetAppend.value) return null;
  const raw = props.approval.previewData as unknown as Record<string, unknown> | undefined;
  if (!raw) return null;

  let previewRows: (string | number)[][] = [];
  if (Array.isArray(raw.previewRows)) {
    previewRows = (raw.previewRows as unknown[]).map((r) => {
      if (Array.isArray(r)) return r as (string | number)[];
      if (
        r &&
        typeof r === "object" &&
        "cells" in r &&
        Array.isArray((r as { cells: unknown[] }).cells)
      ) {
        return (r as { cells: (string | number)[] }).cells;
      }
      return [String(r)];
    });
  } else if (typeof raw.previewRowsJson === "string") {
    try {
      const parsed = JSON.parse(raw.previewRowsJson);
      if (Array.isArray(parsed)) {
        previewRows = parsed;
      }
    } catch {
      // Ignore parse failure
    }
  } else if (typeof raw.rowsJson === "string") {
    try {
      const parsed = JSON.parse(raw.rowsJson);
      if (Array.isArray(parsed)) {
        previewRows = parsed.slice(0, 5);
      }
    } catch {
      // Ignore parse failure
    }
  }

  return {
    spreadsheetId: typeof raw.spreadsheetId === "string" ? raw.spreadsheetId : "",
    range: typeof raw.range === "string" ? raw.range : "A1",
    previewRows,
  };
}); /*end sheetPreview*/

const statusIcon = computed<string>(() => {
  if (isApproved.value) return "check_circle";
  if (isRejected.value) return "cancel";
  return "pending_actions";
}); /*end statusIcon*/

const statusColor = computed<string>(() => {
  if (isApproved.value) return "positive";
  if (isRejected.value) return "grey";
  return "warning";
}); /*end statusColor*/

const actionIcon = computed<string>(() => {
  if (isGmailDraft.value) return "drafts";
  if (isSheetAppend.value) return "table_chart";
  return "assignment";
}); /*end actionIcon*/

// ── Initialization & Sync ─────────────────────────────────────────────────────
const initFields = (): void => {
  if (isGmailDraft.value && gmailPreview.value) {
    editableTo.value = gmailPreview.value.to || "";
    editableSubject.value = gmailPreview.value.subject || "";
    editableBody.value = gmailPreview.value.body || "";
  } else if (isSheetAppend.value) {
    const raw = props.approval.previewData as unknown as Record<string, unknown> | undefined;
    editableSpreadsheetId.value = (raw?.spreadsheetId as string) || "";
    editableRange.value = (raw?.range as string) || "A1";

    let allRows: (string | number)[][] = [];
    if (typeof raw?.rowsJson === "string") {
      try {
        const parsed = JSON.parse(raw.rowsJson);
        if (Array.isArray(parsed)) allRows = parsed;
      } catch {}
    }
    if (allRows.length === 0 && sheetPreview.value) {
      allRows = JSON.parse(JSON.stringify(sheetPreview.value.previewRows));
    }
    editableRows.value = allRows;
  }
}; /*end initFields*/

watch(
  () => props.approval,
  () => {
    initFields();
  },
  { immediate: true },
);

// ── Editing Helpers ───────────────────────────────────────────────────────────
const insertVersiliaSignature = (): void => {
  if (!editableBody.value.includes("Versilia Care")) {
    editableBody.value = editableBody.value.trim() + "\n\n" + VERSILIA_CARE_SIGNATURE;
  } else {
    editableBody.value = editableBody.value + "\n\n" + VERSILIA_CARE_SIGNATURE;
  }
  q.notify({
    type: "positive",
    message: "Firma ufficiale VersiliaCare inserita!",
    icon: "verified",
    timeout: 1400,
  });
}; /*end insertVersiliaSignature*/

const addRow = (): void => {
  const colCount = editableRows.value[0]?.length || 4;
  editableRows.value.push(Array.from({ length: colCount }, () => ""));
}; /*end addRow*/

const removeRow = (index: number): void => {
  if (editableRows.value.length <= 1) return;
  editableRows.value.splice(index, 1);
}; /*end removeRow*/

const onCellInput = (rowIdx: number, cellIdx: number, val: string): void => {
  const row = editableRows.value[rowIdx];
  if (row) {
    row[cellIdx] = val;
  }
}; /*end onCellInput*/

// ── Actions ───────────────────────────────────────────────────────────────────
const onApprove = (): void => {
  let editedPayload: Record<string, unknown> | undefined;
  if (isGmailDraft.value) {
    editedPayload = {
      to: editableTo.value,
      subject: editableSubject.value,
      body: editableBody.value,
    };
  } else if (isSheetAppend.value) {
    editedPayload = {
      spreadsheetId: editableSpreadsheetId.value,
      range: editableRange.value,
      rows: editableRows.value,
    };
  }
  isExpanded.value = false;
  emit("approve", props.approval.id, editedPayload);
}; /*end onApprove*/

const onReject = (): void => {
  isExpanded.value = false;
  emit("reject", props.approval.id);
}; /*end onReject*/
</script>

<template>
  <div class="approval-card-wrapper q-my-sm">
    <q-card class="approval-card" flat bordered>
      <!-- Header -->
      <q-card-section class="approval-card__header row items-center q-py-sm q-px-md">
        <q-icon :name="actionIcon" size="20px" color="amber-7" class="q-mr-sm" />
        <span class="approval-card__title text-weight-bold">
          {{ isGmailDraft ? "📧 Email Draft Preview" : "📊 Google Sheets Preview" }}
        </span>
        <q-space />

        <!-- Fullscreen / Expand Button -->
        <q-btn
          flat
          round
          dense
          icon="open_in_full"
          color="primary"
          size="sm"
          class="q-mr-xs"
          @click="isExpanded = true"
        >
          <q-tooltip>Espandi a schermo intero</q-tooltip>
        </q-btn>

        <!-- Edit Toggle Button (Only when pending) -->
        <q-btn
          v-if="isPending"
          flat
          round
          dense
          :icon="isEditing ? 'visibility' : 'edit'"
          :color="isEditing ? 'amber-9' : 'grey-7'"
          size="sm"
          class="q-mr-xs"
          @click="isEditing = !isEditing"
        >
          <q-tooltip>{{ isEditing ? "Visualizza Anteprima" : "Modifica Dati" }}</q-tooltip>
        </q-btn>

        <q-chip
          :icon="statusIcon"
          :color="statusColor"
          text-color="white"
          size="sm"
          class="q-ml-xs"
        >
          {{ isPending ? "Awaiting Approval" : isApproved ? "Approved" : "Rejected" }}
        </q-chip>
      </q-card-section>

      <q-separator />

      <!-- Gmail Draft: EDIT MODE -->
      <q-card-section v-if="isGmailDraft && isEditing && isPending" class="q-pa-md q-gutter-y-sm">
        <q-input
          v-model="editableTo"
          label="Destinatario (TO)"
          dense
          outlined
          placeholder="es. info@versiliacare.it"
        />
        <q-input
          v-model="editableSubject"
          label="Oggetto (SUBJECT)"
          dense
          outlined
          placeholder="Oggetto dell'email"
        />

        <div class="row items-center justify-between q-mt-xs">
          <span class="text-caption text-weight-bold text-grey-8">Corpo del messaggio:</span>
          <q-btn
            outline
            dense
            no-caps
            size="xs"
            color="primary"
            icon="verified"
            label="Inserisci Firma VersiliaCare"
            @click="insertVersiliaSignature"
          />
        </div>

        <q-input
          v-model="editableBody"
          type="textarea"
          rows="6"
          outlined
          dense
          class="approval-card__edit-textarea"
        />
      </q-card-section>

      <!-- Gmail Draft: READ-ONLY DISPLAY -->
      <q-card-section v-else-if="isGmailDraft && gmailPreview" class="q-pa-md">
        <div class="approval-card__preview-row">
          <span class="approval-card__label">To:</span>
          <span class="approval-card__value text-weight-medium">{{
            editableTo || gmailPreview.to
          }}</span>
        </div>
        <div class="approval-card__preview-row q-mt-xs">
          <span class="approval-card__label">Subject:</span>
          <span class="approval-card__value text-weight-medium">{{
            editableSubject || gmailPreview.subject
          }}</span>
        </div>
        <q-separator class="q-my-sm" />
        <div class="approval-card__body">
          <pre class="approval-card__body-text">{{ editableBody || gmailPreview.body }}</pre>
        </div>
      </q-card-section>

      <!-- Google Sheets: EDIT MODE -->
      <q-card-section
        v-else-if="isSheetAppend && isEditing && isPending"
        class="q-pa-md q-gutter-y-sm"
      >
        <div class="row q-col-gutter-sm items-center">
          <div class="col-8">
            <q-input
              v-model="editableRange"
              label="Foglio / Range (es. Foglio1!A1 o A1)"
              dense
              outlined
            />
          </div>
          <div class="col-4 text-right">
            <q-btn
              outline
              dense
              no-caps
              size="xs"
              color="primary"
              icon="add"
              label="Aggiungi Riga"
              @click="addRow"
            />
          </div>
        </div>

        <div class="approval-card__table-wrapper q-mt-xs">
          <table class="approval-card__table approval-card__table--editable">
            <tbody>
              <tr
                v-for="(row, rowIdx) in editableRows"
                :key="rowIdx"
                :class="rowIdx === 0 ? 'approval-card__table-header' : ''"
              >
                <td v-for="(cell, cellIdx) in row" :key="cellIdx" class="approval-card__table-cell">
                  <input
                    :value="cell"
                    class="approval-card__cell-input"
                    :placeholder="rowIdx === 0 ? `Colonna ${cellIdx + 1}` : ''"
                    @input="onCellInput(rowIdx, cellIdx, ($event.target as HTMLInputElement).value)"
                  />
                </td>
                <td
                  v-if="rowIdx > 0"
                  class="approval-card__table-cell text-center"
                  style="width: 32px"
                >
                  <q-btn
                    flat
                    round
                    dense
                    icon="delete"
                    size="xs"
                    color="negative"
                    @click="removeRow(rowIdx)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </q-card-section>

      <!-- Google Sheets: READ-ONLY DISPLAY -->
      <q-card-section v-else-if="isSheetAppend && sheetPreview" class="q-pa-md">
        <div class="approval-card__preview-row">
          <span class="approval-card__label">Sheet ID:</span>
          <span class="approval-card__value text-mono">
            {{ (editableSpreadsheetId || sheetPreview.spreadsheetId).slice(0, 20) }}...
          </span>
        </div>
        <div class="approval-card__preview-row q-mt-xs">
          <span class="approval-card__label">Range:</span>
          <span class="approval-card__value">{{ editableRange || sheetPreview.range }}</span>
        </div>
        <q-separator class="q-my-sm" />
        <div class="approval-card__table-wrapper">
          <table class="approval-card__table">
            <tbody>
              <tr
                v-for="(row, rowIdx) in editableRows.length > 0
                  ? editableRows.slice(0, 5)
                  : sheetPreview.previewRows"
                :key="rowIdx"
                :class="rowIdx === 0 ? 'approval-card__table-header' : ''"
              >
                <td v-for="(cell, cellIdx) in row" :key="cellIdx" class="approval-card__table-cell">
                  {{ cell }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </q-card-section>

      <!-- Action Buttons (only when pending) -->
      <template v-if="isPending">
        <q-separator />
        <q-card-actions class="approval-card__actions q-pa-sm row justify-between items-center">
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            :icon="isEditing ? 'visibility' : 'edit'"
            :label="isEditing ? 'Visualizza Anteprima' : '✏️ Modifica Dati'"
            color="primary"
            @click="isEditing = !isEditing"
          />

          <div class="row q-gutter-sm">
            <q-btn
              flat
              no-caps
              icon="close"
              label="Reject"
              color="grey-7"
              class="approval-card__btn-reject"
              :loading="isResolving"
              :disable="isResolving"
              @click="onReject"
            />
            <q-btn
              unelevated
              no-caps
              icon="check_circle"
              label="✅ Approve & Execute"
              class="approval-card__btn-approve"
              :loading="isResolving"
              :disable="isResolving"
              @click="onApprove"
            />
          </div>
        </q-card-actions>
      </template>

      <!-- Resolved State Banner -->
      <q-banner
        v-else-if="isApproved"
        dense
        class="approval-card__resolved-banner approval-card__resolved-banner--approved"
      >
        <template #avatar>
          <q-icon name="check_circle" color="positive" />
        </template>
        Action executed successfully.
      </q-banner>

      <q-banner
        v-else-if="isRejected"
        dense
        class="approval-card__resolved-banner approval-card__resolved-banner--rejected"
      >
        <template #avatar>
          <q-icon name="cancel" color="grey-6" />
        </template>
        Action rejected by user.
      </q-banner>
    </q-card>

    <!-- FULLSCREEN MODAL DIALOG -->
    <q-dialog
      v-model="isExpanded"
      maximized
      transition-show="slide-up"
      transition-hide="slide-down"
    >
      <q-card class="approval-dialog column no-wrap">
        <!-- Dialog Header -->
        <q-toolbar class="approval-dialog__toolbar text-white q-px-lg">
          <q-icon :name="actionIcon" size="24px" color="amber-7" class="q-mr-sm" />
          <q-toolbar-title class="text-weight-bold">
            {{
              isGmailDraft
                ? "📧 Bozza Email — Revisione Dettagliata"
                : "📊 Google Sheets — Ispezione Dati Completa"
            }}
          </q-toolbar-title>

          <q-btn
            v-if="isPending"
            outline
            dense
            no-caps
            size="sm"
            color="amber-4"
            :icon="isEditing ? 'visibility' : 'edit'"
            :label="isEditing ? 'Mostra Anteprima' : '✏️ Modalità Modifica'"
            class="q-mr-md q-px-sm"
            @click="isEditing = !isEditing"
          />

          <q-chip
            :icon="statusIcon"
            :color="statusColor"
            text-color="white"
            size="sm"
            class="q-mr-md"
          >
            {{ isPending ? "In Attesa di Approvazione" : isApproved ? "Approvato" : "Rifiutato" }}
          </q-chip>

          <q-btn flat round dense icon="close" v-close-popup />
        </q-toolbar>

        <q-separator />

        <!-- Dialog Scrollable Content -->
        <q-card-section class="col q-pa-xl scroll bg-grey-1">
          <div class="approval-dialog__inner-card shadow-3 q-pa-xl bg-white">
            <!-- GMAIL FULLSCREEN VIEW -->
            <template v-if="isGmailDraft">
              <div v-if="isEditing && isPending" class="q-gutter-y-md">
                <q-input
                  v-model="editableTo"
                  label="Destinatario (TO)"
                  outlined
                  placeholder="es. caregiver.info@versiliacare.it"
                />
                <q-input
                  v-model="editableSubject"
                  label="Oggetto dell'email"
                  outlined
                  placeholder="Oggetto dell'email"
                />

                <div class="row items-center justify-between q-pt-sm">
                  <span class="text-subtitle2 text-weight-bold text-navy"
                    >Testo del Messaggio:</span
                  >
                  <q-btn
                    outline
                    no-caps
                    size="sm"
                    color="primary"
                    icon="verified"
                    label="Inserisci Firma Ufficiale VersiliaCare"
                    @click="insertVersiliaSignature"
                  />
                </div>

                <q-input
                  v-model="editableBody"
                  type="textarea"
                  rows="14"
                  outlined
                  class="approval-dialog__textarea"
                />
              </div>

              <div v-else class="q-gutter-y-md">
                <div class="row items-center text-subtitle1">
                  <strong class="q-mr-sm text-grey-7">A:</strong>
                  <span class="text-weight-bold text-primary">{{
                    editableTo || gmailPreview?.to
                  }}</span>
                </div>
                <div class="row items-center text-subtitle1">
                  <strong class="q-mr-sm text-grey-7">Oggetto:</strong>
                  <span class="text-weight-bold text-navy">{{
                    editableSubject || gmailPreview?.subject
                  }}</span>
                </div>
                <q-separator class="q-my-md" />
                <div class="approval-dialog__preview-box q-pa-lg">
                  <pre class="approval-dialog__pre">{{ editableBody || gmailPreview?.body }}</pre>
                </div>
              </div>
            </template>

            <!-- SHEETS FULLSCREEN VIEW -->
            <template v-else-if="isSheetAppend">
              <div class="row items-center justify-between q-mb-md">
                <div>
                  <span class="text-subtitle1 text-weight-bold text-navy">
                    Tabella Dati VersiliaCare
                  </span>
                  <div class="text-caption text-grey-7">
                    Sheet ID: {{ editableSpreadsheetId || sheetPreview?.spreadsheetId }} | Range:
                    {{ editableRange || sheetPreview?.range }}
                  </div>
                </div>

                <div v-if="isEditing && isPending" class="row q-gutter-sm items-center">
                  <q-input
                    v-model="editableRange"
                    label="Range"
                    dense
                    outlined
                    style="width: 140px"
                  />
                  <q-btn
                    outline
                    dense
                    no-caps
                    size="sm"
                    color="primary"
                    icon="add"
                    label="Aggiungi Riga"
                    @click="addRow"
                  />
                </div>
              </div>

              <!-- Full Table Grid -->
              <div class="approval-dialog__table-scroll shadow-1">
                <table class="approval-card__table approval-dialog__table">
                  <tbody>
                    <tr
                      v-for="(row, rowIdx) in editableRows.length > 0
                        ? editableRows
                        : sheetPreview?.previewRows || []"
                      :key="rowIdx"
                      :class="rowIdx === 0 ? 'approval-card__table-header' : ''"
                    >
                      <td
                        v-for="(cell, cellIdx) in row"
                        :key="cellIdx"
                        class="approval-card__table-cell"
                      >
                        <input
                          v-if="isEditing && isPending"
                          :value="cell"
                          class="approval-card__cell-input"
                          @input="
                            onCellInput(rowIdx, cellIdx, ($event.target as HTMLInputElement).value)
                          "
                        />
                        <span v-else>{{ cell }}</span>
                      </td>
                      <td
                        v-if="isEditing && isPending && rowIdx > 0"
                        class="approval-card__table-cell text-center"
                        style="width: 40px"
                      >
                        <q-btn
                          flat
                          round
                          dense
                          icon="delete"
                          size="xs"
                          color="negative"
                          @click="removeRow(rowIdx)"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </div>
        </q-card-section>

        <q-separator />

        <!-- Dialog Footer Actions -->
        <q-toolbar
          v-if="isPending"
          class="approval-dialog__footer bg-white q-py-md q-px-xl justify-between"
        >
          <q-btn
            flat
            no-caps
            icon="close"
            label="Rifiuta ed Elimina"
            color="grey-8"
            class="q-px-md"
            @click="onReject"
          />

          <div class="row q-gutter-md">
            <q-btn
              outline
              no-caps
              :icon="isEditing ? 'visibility' : 'edit'"
              :label="isEditing ? 'Anteprima Risultato' : '✏️ Modifica Dati'"
              color="primary"
              class="q-px-md"
              @click="isEditing = !isEditing"
            />
            <q-btn
              unelevated
              no-caps
              icon="check_circle"
              label="✅ Approva ed Esegui Operazione"
              color="amber-9"
              class="approval-card__btn-approve q-px-lg text-weight-bold"
              :loading="isResolving"
              :disable="isResolving"
              @click="onApprove"
            />
          </div>
        </q-toolbar>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped lang="scss">
.approval-card-wrapper {
  max-width: 580px;
  align-self: flex-start;
}

.approval-card {
  border: 1.5px solid #c5a065;
  border-radius: 12px;
  background: #f9f7f2;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(10, 35, 66, 0.05);
}

.approval-card__header {
  background: rgba(197, 160, 101, 0.08);
}

.approval-card__title {
  font-family: "Mulish", sans-serif;
  font-size: 13px;
  color: #0a2342;
  letter-spacing: 0.3px;
}

.approval-card__preview-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
}

.approval-card__label {
  font-family: "Mulish", sans-serif;
  color: #888;
  min-width: 56px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding-top: 1px;
}

.approval-card__value {
  font-family: "Mulish", sans-serif;
  color: #0a2342;
}

.approval-card__body {
  background: #fff;
  border: 1px solid rgba(197, 160, 101, 0.25);
  border-radius: 8px;
  padding: 10px 12px;
  max-height: 140px;
  overflow-y: auto;
}

.approval-card__body-text {
  font-family: "Mulish", sans-serif;
  font-size: 12px;
  line-height: 1.5;
  color: #333;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.approval-card__table-wrapper {
  overflow-x: auto;
  border: 1px solid rgba(197, 160, 101, 0.25);
  border-radius: 8px;
  background: #fff;
}

.approval-card__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  font-family: "Mulish", sans-serif;

  &--editable {
    background: #fff;
  }
}

.approval-card__table-header td {
  background: rgba(197, 160, 101, 0.15);
  font-weight: 700;
  color: #0a2342;
}

.approval-card__table-cell {
  padding: 5px 8px;
  border-bottom: 1px solid rgba(197, 160, 101, 0.15);
  color: #333;
  white-space: nowrap;
}

.approval-card__cell-input {
  width: 100%;
  min-width: 90px;
  border: 1px solid rgba(197, 160, 101, 0.3);
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
  font-family: "Mulish", sans-serif;
  background: #fff;

  &:focus {
    outline: none;
    border-color: #c5a065;
    background: #fffefb;
  }
}

.approval-card__actions {
  background: rgba(197, 160, 101, 0.05);
}

.approval-card__btn-reject {
  border-radius: 8px;
  font-family: "Mulish", sans-serif;
  font-size: 13px;
}

.approval-card__btn-approve {
  background: #c5a065 !important;
  color: #fff !important;
  border-radius: 8px;
  font-family: "Mulish", sans-serif;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(197, 160, 101, 0.4);
  transition: all 0.2s ease;

  &:hover {
    box-shadow: 0 4px 14px rgba(197, 160, 101, 0.6);
  }
}

.approval-card__resolved-banner {
  font-family: "Mulish", sans-serif;
  font-size: 12px;

  &--approved {
    background: rgba(33, 186, 69, 0.06);
    color: #1a7a35;
  }

  &--rejected {
    background: rgba(150, 150, 150, 0.08);
    color: #666;
  }
}

/* Fullscreen Dialog Styles (Elite Design) */
.approval-dialog {
  background: #f7f5ef;
}

.approval-dialog__toolbar {
  background: #0a2342;
  border-bottom: 2px solid #c5a065;
}

.approval-dialog__inner-card {
  max-width: 1200px;
  margin: 0 auto;
  border-radius: 12px;
  border: 1px solid rgba(197, 160, 101, 0.25);
}

.approval-dialog__preview-box {
  background: #faf9f6;
  border: 1px solid rgba(197, 160, 101, 0.2);
  border-radius: 8px;
}

.approval-dialog__pre {
  font-family: "Mulish", sans-serif;
  font-size: 14px;
  line-height: 1.6;
  color: #2c3e50;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.approval-dialog__table-scroll {
  overflow-x: auto;
  border: 1px solid rgba(197, 160, 101, 0.25);
  border-radius: 8px;
}

.approval-dialog__table {
  font-size: 13px;

  td {
    padding: 8px 12px;
  }
}

.approval-dialog__footer {
  border-top: 1px solid rgba(197, 160, 101, 0.2);
}
</style>
