<script setup lang="ts">
/**
 * @file AppWindowDock.vue
 * @description Floating desktop dockbar showing active and minimized operational windows with fast restore and focus.
 * @author Vasile Chifeac
 * @created 2026-09-24
 * @modified 2026-09-24
 *
 * @notes
 * - Design System "Elite": Royal Navy #0a2342, Gold #c5a065 with subtle glassmorphism blur.
 * - Reactive dock listing all registered open/minimized floating windows.
 *
 * @dependencies
 * - Quasar components (q-btn, q-icon, q-tooltip, q-badge)
 * - useFloatingWindowManager
 *
 * @performance
 * - Automatically hidden when no windows are open (<0.01ms CPU).
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { computed } from "vue";

// ── Composables ──────────────────────────────────────────────────────────────
import { useFloatingWindowManager } from "../composables/useFloatingWindowManager";

const windowManager = useFloatingWindowManager();

const windowList = computed(() => Object.values(windowManager.registeredWindows));
const hasWindows = computed(() => windowList.value.length > 0);
</script>

<template>
  <Transition name="dock-fade">
    <div
      v-if="hasWindows"
      class="app-window-dock shadow-10 row items-center q-px-sm q-py-xs no-wrap"
    >
      <div class="row items-center q-gutter-x-xs no-wrap">
        <div
          v-for="win in windowList"
          :key="win.id"
          class="dock-item row items-center no-wrap cursor-pointer"
          :class="{ 'is-minimized': win.isMinimized }"
          @click="win.focus()"
        >
          <!-- Window Icon -->
          <q-icon
            :name="win.icon || 'web_asset'"
            :color="win.iconColor || 'amber-5'"
            size="18px"
            class="q-mr-xs"
          />

          <!-- Window Title -->
          <span class="dock-title text-caption text-weight-bold ellipsis text-white">
            {{ win.title }}
          </span>

          <!-- Minimized Status Indicator -->
          <div
            class="status-indicator q-ml-xs"
            :class="win.isMinimized ? 'bg-amber-5' : 'bg-positive'"
          />

          <!-- Action Tooltip -->
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[0, 8]">
            {{ win.title }} —
            {{ win.isMinimized ? "Clicca per ripristinare" : "Porta in primo piano" }}
          </q-tooltip>

          <!-- Quick Minimize / Restore Icon -->
          <q-btn
            flat
            round
            dense
            size="xs"
            :icon="win.isMinimized ? 'unfold_more' : 'minimize'"
            color="grey-4"
            class="q-ml-xs hover-bright"
            @click.stop="win.toggleMinimize()"
          >
            <q-tooltip>{{ win.isMinimized ? "Ripristina" : "Riduci a icona" }}</q-tooltip>
          </q-btn>

          <!-- Quick Close Button -->
          <q-btn
            flat
            round
            dense
            size="xs"
            icon="close"
            color="grey-5"
            class="q-ml-xs hover-red"
            @click.stop="win.close()"
          >
            <q-tooltip>Chiudi finestra</q-tooltip>
          </q-btn>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.app-window-dock {
  position: fixed;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9998;
  background: rgba(10, 35, 66, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(197, 160, 101, 0.35);
  border-radius: 28px;
  max-width: 90vw;
  overflow-x: auto;
  box-shadow:
    0 8px 32px rgba(10, 35, 66, 0.35),
    0 0 16px rgba(197, 160, 101, 0.15);
}

.dock-item {
  padding: 4px 10px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
  max-width: 220px;

  &:hover {
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(197, 160, 101, 0.6);
    transform: translateY(-2px);
  }

  &.is-minimized {
    opacity: 0.72;
    border-style: dashed;
    border-color: rgba(197, 160, 101, 0.4);

    &:hover {
      opacity: 1;
    }
  }
}

.dock-title {
  max-width: 120px;
}

.status-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  box-shadow: 0 0 4px currentColor;
}

.hover-bright:hover {
  color: #fff !important;
}

.hover-red:hover {
  color: #ff5252 !important;
}

.dock-fade-enter-active,
.dock-fade-leave-active {
  transition: all 0.25s ease-out;
}

.dock-fade-enter-from,
.dock-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 16px);
}
</style>
