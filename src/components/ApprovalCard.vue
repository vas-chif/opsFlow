/** * @file ApprovalCard.vue * @description Human-in-the-Loop interactive preview card for pending
AI actions. * @author Vasile Chifeac * @created 2026-08-14 * @modified 2026-08-14 * * @notes * -
Renders inline in the Task Chat feed for each ApprovalRecord with status 'pending'. * - Emits
'approve' and 'reject' events upward to TaskChatWindow.vue. * - Design System "Elite": border gold
#c5a065, background off-white #f9f7f2. * - GDPR: Displays sanitized preview only. No raw PII from
backend. * * @dependencies * - quasar components * - ApprovalRecord, GmailDraftPreview,
SheetAppendPreview from types/models */ -->

<script setup lang="ts">
// ── Vue & Framework ──────────────────────────────────────────────────────────
import { computed } from "vue";

// ── Types ─────────────────────────────────────────────────────────────────────
import type { ApprovalRecord, GmailDraftPreview, SheetAppendPreview } from "../types/models";

// ── Props & Emits ─────────────────────────────────────────────────────────────
const props = defineProps<{
  approval: ApprovalRecord;
  isResolving?: boolean;
}>();

const emit = defineEmits<{
  (e: "approve", approvalId: string): void;
  (e: "reject", approvalId: string): void;
}>();

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

const sheetPreview = computed<SheetAppendPreview | null>(() => {
  if (!isSheetAppend.value) return null;
  return props.approval.previewData as SheetAppendPreview;
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

// ── Methods ───────────────────────────────────────────────────────────────────

const onApprove = (): void => {
  emit("approve", props.approval.id);
}; /*end onApprove*/

const onReject = (): void => {
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
        <q-chip
          :icon="statusIcon"
          :color="statusColor"
          text-color="white"
          size="sm"
          class="q-ml-sm"
        >
          {{ isPending ? "Awaiting Approval" : isApproved ? "Approved" : "Rejected" }}
        </q-chip>
      </q-card-section>

      <q-separator />

      <!-- Gmail Draft Preview -->
      <q-card-section v-if="isGmailDraft && gmailPreview" class="q-pa-md">
        <div class="approval-card__preview-row">
          <span class="approval-card__label">To:</span>
          <span class="approval-card__value text-weight-medium">{{ gmailPreview.to }}</span>
        </div>
        <div class="approval-card__preview-row q-mt-xs">
          <span class="approval-card__label">Subject:</span>
          <span class="approval-card__value text-weight-medium">{{ gmailPreview.subject }}</span>
        </div>
        <q-separator class="q-my-sm" />
        <div class="approval-card__body">
          <pre class="approval-card__body-text">{{ gmailPreview.body }}</pre>
        </div>
      </q-card-section>

      <!-- Google Sheets Preview -->
      <q-card-section v-else-if="isSheetAppend && sheetPreview" class="q-pa-md">
        <div class="approval-card__preview-row">
          <span class="approval-card__label">Sheet ID:</span>
          <span class="approval-card__value text-mono">
            {{ sheetPreview.spreadsheetId.slice(0, 20) }}...
          </span>
        </div>
        <div class="approval-card__preview-row q-mt-xs">
          <span class="approval-card__label">Range:</span>
          <span class="approval-card__value">{{ sheetPreview.range }}</span>
        </div>
        <q-separator class="q-my-sm" />
        <div class="approval-card__table-wrapper">
          <table class="approval-card__table">
            <tr
              v-for="(row, rowIdx) in sheetPreview.previewRows"
              :key="rowIdx"
              :class="rowIdx === 0 ? 'approval-card__table-header' : ''"
            >
              <td v-for="(cell, cellIdx) in row" :key="cellIdx" class="approval-card__table-cell">
                {{ cell }}
              </td>
            </tr>
          </table>
        </div>
      </q-card-section>

      <!-- Action Buttons (only when pending) -->
      <template v-if="isPending">
        <q-separator />
        <q-card-actions class="approval-card__actions q-pa-sm row justify-end q-gutter-sm">
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
  </div>
</template>

<style scoped lang="scss">
.approval-card-wrapper {
  max-width: 560px;
  align-self: flex-start;
}

.approval-card {
  border: 1.5px solid #c5a065;
  border-radius: 12px;
  background: #f9f7f2;
  overflow: hidden;
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
  max-height: 120px;
  overflow-y: auto;
}

.approval-card__body-text {
  font-family: "Mulish", monospace;
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
}

.approval-card__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  font-family: "Mulish", sans-serif;
}

.approval-card__table-header td {
  background: rgba(197, 160, 101, 0.15);
  font-weight: 700;
  color: #0a2342;
}

.approval-card__table-cell {
  padding: 5px 10px;
  border-bottom: 1px solid rgba(197, 160, 101, 0.15);
  color: #333;
  white-space: nowrap;
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
  transition: box-shadow 0.2s ease;

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
</style>
