<script setup lang="ts">
// ── Vue & Framework ──────────────────────────────────────────────────────────
import { computed } from "vue";

// ── Types ────────────────────────────────────────────────────────────────────
import type { SheetUpdateMode } from "../types/models";

/**
 * @file SheetIntegrationConfigCard.vue
 * @description Reusable UI card for configuring Google Sheets data integration mode and auto-styling.
 * @author Vasile Chifeac
 * @created 2026-09-17
 * @modified 2026-09-17
 *
 * @notes
 * - Shared component used in TaskSettingsModal, WorkspaceAttitudeModal, and ScheduleTaskModal.
 * - Supports two-way binding for updateMode and autoStyleSheet.
 * - Displays badge when task inherits workspace-level default policy.
 *
 * @dependencies
 * - Quasar components: q-list, q-item, q-radio, q-toggle, q-card, q-badge, q-icon
 * - Models: SheetUpdateMode
 *
 * @performance
 * - Pure UI component, zero Firestore reads/writes.
 */

interface Props {
  updateMode: SheetUpdateMode;
  autoStyleSheet: boolean;
  /** Whether the component is rendered inside a task context (TaskSettingsModal) */
  isTaskLevel?: boolean;
  /** Whether the current setting is inherited from the workspace default (not customized) */
  isInherited?: boolean;
  /** Optional custom title for the section */
  title?: string;
}

const props = withDefaults(defineProps<Props>(), {
  isTaskLevel: false,
  isInherited: false,
  title: "Modalità Integrazione Dati",
});

const emit = defineEmits<{
  (e: "update:updateMode", val: SheetUpdateMode): void;
  (e: "update:autoStyleSheet", val: boolean): void;
}>();

const UPDATE_MODE_OPTIONS = [
  {
    label: "Aggiungi solo nuovi",
    value: "append_new" as SheetUpdateMode,
    desc: "Non sovrascrive le righe esistenti — appende solo i profili mai visti prima (deduplicazione doppia chiave)",
    icon: "add_circle",
  },
  {
    label: "Ricalcola graduatoria",
    value: "re_rank_all" as SheetUpdateMode,
    desc: "Unisce esistenti + nuovi, riordina per Match Score decrescente",
    icon: "sort",
  },
];

const currentMode = computed<SheetUpdateMode>({
  get: () => props.updateMode,
  set: (val: SheetUpdateMode) => emit("update:updateMode", val),
}); /* end currentMode */

const currentAutoStyle = computed<boolean>({
  get: () => props.autoStyleSheet,
  set: (val: boolean) => emit("update:autoStyleSheet", val),
}); /* end currentAutoStyle */
</script>

<template>
  <div class="sheet-integration-config-card q-my-md">
    <!-- Header Section -->
    <div class="row items-center justify-between q-mb-xs">
      <div class="text-subtitle2 text-weight-bold text-navy row items-center no-wrap">
        <q-icon name="merge" size="18px" color="amber-9" class="q-mr-xs" />
        <span>{{ title }}</span>
      </div>
      <q-badge
        v-if="isTaskLevel && isInherited"
        color="teal-1"
        text-color="teal-9"
        class="text-weight-bold border-teal-light"
      >
        <q-icon name="apartment" size="13px" class="q-mr-xs" />
        Default Workspace
      </q-badge>
      <q-badge
        v-else-if="isTaskLevel && !isInherited"
        color="amber-1"
        text-color="amber-10"
        class="text-weight-bold border-amber-light"
      >
        <q-icon name="tune" size="13px" class="q-mr-xs" />
        Personalizzato per questo Task
      </q-badge>
    </div>

    <!-- Update Mode Options -->
    <q-list bordered separator class="rounded-borders bg-white q-mb-sm border-gold-light">
      <q-item
        v-for="opt in UPDATE_MODE_OPTIONS"
        :key="opt.value"
        clickable
        :active="currentMode === opt.value"
        active-class="bg-amber-1"
        class="update-mode-item"
        @click="currentMode = opt.value"
      >
        <q-item-section avatar style="min-width: 36px">
          <q-radio v-model="currentMode" :val="opt.value" color="amber-9" />
        </q-item-section>
        <q-item-section>
          <q-item-label
            class="text-subtitle2"
            :class="{ 'text-weight-bold text-navy': currentMode === opt.value }"
          >
            {{ opt.label }}
          </q-item-label>
          <q-item-label caption class="text-grey-7">
            {{ opt.desc }}
          </q-item-label>
        </q-item-section>
      </q-item>
    </q-list>

    <!-- Auto-style toggle -->
    <q-card bordered flat class="bg-white rounded-borders q-pa-sm border-gold-light">
      <q-item tag="label" class="q-pa-xs">
        <q-item-section avatar>
          <q-toggle v-model="currentAutoStyle" color="amber-9" />
        </q-item-section>
        <q-item-section>
          <q-item-label class="text-weight-bold text-grey-9"> Auto-Styling Elite 🎨 </q-item-label>
          <q-item-label caption class="text-grey-7">
            Applica automaticamente header scuro navy, testo a capo e larghezze colonne ottimali
          </q-item-label>
        </q-item-section>
      </q-item>
    </q-card>
  </div>
</template>

<style scoped lang="scss">
.text-navy {
  color: #0a2342;
}

.border-gold-light {
  border: 1px solid rgba(197, 160, 101, 0.35);
}

.border-teal-light {
  border: 1px solid rgba(38, 166, 154, 0.4);
}

.border-amber-light {
  border: 1px solid rgba(255, 179, 0, 0.4);
}

.update-mode-item {
  transition: background-color 0.2s ease;
}
</style>
