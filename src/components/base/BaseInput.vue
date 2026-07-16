/** * @file BaseInput.vue * @description Elite styled input wrapper with
minimalist design * @author Vasile Chifeac * @created 2026-07-16 * * @notes * -
Wrapper around q-input with Elite styling * - Minimalist design with subtle
borders * - Readable labels and clear focus states * * @dependencies * - Quasar
UI components * * @performance * - No additional overhead */

<script setup lang="ts">
// ── Vue & Framework ──────────────────────────────────────────────────────────
import { computed } from "vue";

// ── Props Interface ──────────────────────────────────────────────────────────
interface Props {
  modelValue?: string | number;
  label?: string;
  type?: "text" | "password" | "email" | "number" | "tel" | "url";
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  error?: boolean;
  errorMessage?: string;
  dense?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  "update:modelValue": [value: string | number];
}>();

// ── Computed Properties ───────────────────────────────────────────────────────
const inputClasses = computed(() => ({
  "input-elite": true
}));

/*end BaseInput.vue*/
</script>

<template>
  <q-input
    :model-value="modelValue"
    :label="label"
    :type="type"
    :placeholder="placeholder"
    :required="required"
    :disable="disabled"
    :readonly="readonly"
    :error="error"
    :error-message="errorMessage"
    :dense="dense"
    :class="inputClasses"
    v-bind="$attrs"
  >
    <template v-for="(_, slot) in $slots" #[slot]="scope">
      <slot :name="slot" v-bind="scope" />
    </template>
  </q-input>
</template>

<style scoped lang="scss">
.input-elite {
  :deep(.q-field__control) {
    border-radius: 8px;
  }

  :deep(.q-field__label) {
    font-weight: 500;
    color: $primary;
  }

  :deep(.q-field__native) {
    font-family: "Mulish", sans-serif;
  }

  :deep(.q-field--focused .q-field__label) {
    color: $secondary;
  }
}

/*end BaseInput.vue styles*/
</style>
