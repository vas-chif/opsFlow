/** * @file BaseButton.vue * @description Elite styled button wrapper with smooth hover transitions
* @author Vasile Chifeac * @created 2026-07-16 * * @notes * - Wrapper around q-btn with Elite
styling * - Smooth hover transition (0.3s ease) * - Slightly rounded corners (8px border-radius) * *
@dependencies * - Quasar UI components * * @performance * - Zero overhead: pure CSS transitions */

<script setup lang="ts">
// ── Vue & Framework ──────────────────────────────────────────────────────────
import { computed } from "vue";

// ── Props Interface ──────────────────────────────────────────────────────────
interface Props {
  label?: string;
  color?: "primary" | "secondary" | "accent" | "positive" | "negative" | "warning" | "info";
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  flat?: boolean;
  outline?: boolean;
  rounded?: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  type?: "button" | "submit" | "reset";
}

const props = defineProps<Props>();
defineEmits<{
  click: [event: MouseEvent];
}>();

// ── Computed Styles ───────────────────────────────────────────────────────────
const buttonClasses = computed(() => ({
  "rounded-elite": props.rounded ?? true,
  "transition-smooth": true,
}));

/*end BaseButton.vue*/
</script>

<template>
  <q-btn
    :label="label"
    :color="color ?? 'primary'"
    :icon="icon"
    :loading="loading"
    :disable="disabled"
    :flat="flat"
    :outline="outline"
    :size="size"
    :type="type"
    :class="buttonClasses"
    v-bind="$attrs"
  />
</template>

<style scoped lang="scss">
.rounded-elite {
  border-radius: 8px;
}

.transition-smooth {
  transition: all 0.3s ease;
}

/* Elite button hover effect */
:deep(.q-btn) {
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(10, 35, 66, 0.15);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }
}

/*end BaseButton.vue styles*/
</style>
