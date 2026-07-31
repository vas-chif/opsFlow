<script setup lang="ts">
 /**
 * @file DashboardCard.vue
 * @description Paper-style card container with Gold accent and Graphite dark mode, WCAG 2.1 AA compliant
 * @author Vasile Chifeac
 * @created 2026-07-16
 * @modified 2026-07-16
 *
 * @notes
 * - Design System "Matita/Leggero": solid paper background, no glass blur
 * - Uses centralized SCSS variables ($paper, $graphite-light, $pencil-gold)
 * - Supports dark/light mode via Quasar `.body--dark` class
 * - No inline styles, pure SCSS scoped
 *
 * @dependencies
 * - Quasar utility classes (q-pa-lg)
 * - Design System variables (quasar.variables.scss)
 *
 * @performance
 * - Pure CSS, no runtime overhead
 * - Reduced repaints vs glass-blur approach
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
// No imports needed for slot-only component

// ── Components ───────────────────────────────────────────────────────────────
// Slot-based, no child components
</script>

<template>
  <div class="dashboard-card q-pa-lg">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.dashboard-card {
  // Organic, generous radius for "paper" feel
  border-radius: 20px;

  // Pencil border + subtle depth (no glass blur)
  border: 1px solid $pencil-gold;
  box-shadow: 0 2px 12px rgba(197, 160, 101, 0.12);
  margin-bottom: 24px;

  // Solid paper background — light mode
  background-color: $paper;

  // Elevated paper surface — dark mode
  .body--dark & {
    background-color: $graphite-light;
    border-color: $graphite-soft;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
  }

  // Soft hover lift (transform + shadow depth)
  @extend .card-depth !optional;
}
</style>
