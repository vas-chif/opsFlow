/** * @file StatusBadge.vue * @description Task status badge component with Elite themed colors *
@author Vasile Chifeac * @created 2026-07-16 * * @notes * - Displays task status: pending,
completed, in-progress * - Uses Elite color palette * - Pill shape with uppercase text * *
@dependencies * - Quasar UI components * * @performance * - Minimal rendering cost */

<script setup lang="ts">
// ── Vue & Framework ──────────────────────────────────────────────────────────
import { computed } from "vue";

// ── Types ────────────────────────────────────────────────────────────────────
import type { TaskStatus } from "@/types/models";

// ── Props Interface ──────────────────────────────────────────────────────────
// UI-only — component props
interface Props {
  status: TaskStatus;
  dense?: boolean;
}

const props = defineProps<Props>();

// ── Computed Properties ───────────────────────────────────────────────────────
const statusConfig = computed(() => {
  const configs: Record<TaskStatus, { label: string; color: string; textColor: string }> = {
    pending: {
      label: "Pending",
      color: "#c5a065", // Gold
      textColor: "#ffffff",
    },
    completed: {
      label: "Completed",
      color: "#21ba45", // Positive (green)
      textColor: "#ffffff",
    },
    "in-progress": {
      label: "In Progress",
      color: "#0a2342", // Royal Navy
      textColor: "#ffffff",
    },
    cancelled: {
      label: "Cancelled",
      color: "#c10015", // Negative
      textColor: "#ffffff",
    },
    contacted: {
      label: "Contacted",
      color: "#0288d1", // Info Blue
      textColor: "#ffffff",
    },
    "positive-response": {
      label: "Positive Response",
      color: "#2e7d32", // Forest Green
      textColor: "#ffffff",
    },
    "negative-response": {
      label: "Negative Response",
      color: "#c62828", // Red
      textColor: "#ffffff",
    },
    "follow-up-30-days": {
      label: "Follow-up (30d)",
      color: "#e65100", // Deep Orange
      textColor: "#ffffff",
    },
  };
  return configs[props.status] || configs.pending;
});

const badgeStyle = computed(() => ({
  backgroundColor: statusConfig.value.color,
  color: statusConfig.value.textColor,
  borderRadius: "9999px",
  padding: props.dense ? "2px 10px" : "4px 16px",
  fontSize: props.dense ? "10px" : "12px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
}));

/*end StatusBadge.vue*/
</script>

<template>
  <span class="status-badge" :style="badgeStyle">
    {{ statusConfig.label }}
  </span>
</template>

<style scoped lang="scss">
.status-badge {
  display: inline-block;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.status-badge:hover {
  opacity: 0.9;
  transform: scale(1.02);
}

/*end StatusBadge.vue styles*/
</style>
