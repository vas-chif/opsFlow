<script setup lang="ts">
/**
 * @file AppFloatingWindow.vue
 * @description Unified desktop-grade floating window container supporting dragging, resizing, fullscreen, minimize, and z-index layering.
 * @author Vasile Chifeac
 * @created 2026-09-24
 * @modified 2026-09-24
 *
 * @notes
 * - Design System "Elite": Royal Navy #0a2342, Gold #c5a065, Off-White #f9f7f2.
 * - Single reusable window manager frame for all operational modals in OpsFlow.
 *
 * @dependencies
 * - Quasar (q-btn, q-icon, q-badge, q-tooltip)
 * - useFloatingWindowManager composable
 *
 * @performance
 * - Smooth 60fps drag & resize with RAF or direct coordinate updates.
 * - Automatic window event listener teardown on unmount to prevent leaks.
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { ref, computed, onMounted, onUnmounted, watch } from "vue";

// ── Composables ──────────────────────────────────────────────────────────────
import { useFloatingWindowManager } from "../composables/useFloatingWindowManager";

// ── Props & Emits ────────────────────────────────────────────────────────────
interface Props {
  modelValue: boolean;
  windowId: string;
  title: string;
  subtitle?: string | undefined;
  badgeLabel?: string | undefined;
  badgeColor?: string | undefined;
  icon?: string | undefined;
  iconColor?: string | undefined;
  initialWidth?: number | undefined;
  initialHeight?: number | undefined;
  minWidth?: number | undefined;
  minHeight?: number | undefined;
}

const props = withDefaults(defineProps<Props>(), {
  subtitle: undefined,
  badgeLabel: undefined,
  badgeColor: "amber-9",
  icon: "tune",
  iconColor: "amber-5",
  initialWidth: 780,
  initialHeight: 560,
  minWidth: 440,
  minHeight: 340,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "close"): void;
}>();

// ── Window Manager ───────────────────────────────────────────────────────────
const windowManager = useFloatingWindowManager();

const isFullscreen = ref(false);
const isMinimized = ref(false);
const isDragging = ref(false);
const isResizing = ref(false);

const position = ref<{ x: number; y: number }>({ x: 60, y: 60 });
const size = ref<{ width: number; height: number }>({
  width: props.initialWidth,
  height: props.initialHeight,
});

const dragStart = ref<{ x: number; y: number }>({ x: 0, y: 0 });
const initialPos = ref<{ x: number; y: number }>({ x: 0, y: 0 });
const resizeStart = ref<{ x: number; y: number; w: number; h: number }>({
  x: 0,
  y: 0,
  w: props.initialWidth,
  h: props.initialHeight,
});

const currentZIndex = computed(() => {
  if (isFullscreen.value) return 9999;
  return windowManager.getZIndex(props.windowId);
});

// ── Centering & Initialization ───────────────────────────────────────────────
function initWindowPlacement(): void {
  if (typeof window === "undefined") return;

  const targetW = Math.min(props.initialWidth, window.innerWidth - 40);
  const targetH = Math.min(props.initialHeight, window.innerHeight - 60);

  size.value = {
    width: Math.max(props.minWidth, targetW),
    height: Math.max(props.minHeight, targetH),
  };

  const centerX = Math.max(20, Math.round((window.innerWidth - size.value.width) / 2));
  const centerY = Math.max(20, Math.round((window.innerHeight - size.value.height) / 2));

  position.value = { x: centerX, y: centerY };
  windowManager.bringToFront(props.windowId);
} /*end initWindowPlacement*/

onMounted(() => {
  initWindowPlacement();
  window.addEventListener("keydown", handleGlobalKeydown);
});

// ── Focus & Controls ─────────────────────────────────────────────────────────
function handleWindowClick(): void {
  windowManager.bringToFront(props.windowId);
} /*end handleWindowClick*/

function toggleFullscreen(): void {
  isFullscreen.value = !isFullscreen.value;
  if (isFullscreen.value) {
    isMinimized.value = false;
    windowManager.bringToFront(props.windowId);
  }
} /*end toggleFullscreen*/

function toggleMinimize(): void {
  isMinimized.value = !isMinimized.value;
  if (!isMinimized.value) {
    windowManager.bringToFront(props.windowId);
  }
} /*end toggleMinimize*/

function handleSendToBack(): void {
  windowManager.sendToBack(props.windowId);
} /*end handleSendToBack*/

function handleClose(): void {
  emit("update:modelValue", false);
  emit("close");
} /*end handleClose*/

function handleGlobalKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" && isFullscreen.value) {
    isFullscreen.value = false;
  }
} /*end handleGlobalKeydown*/

// ── Drag Handlers ────────────────────────────────────────────────────────────
function handleHeaderMouseDown(e: MouseEvent): void {
  windowManager.bringToFront(props.windowId);
  if (isFullscreen.value) return;

  isDragging.value = true;
  dragStart.value = { x: e.clientX, y: e.clientY };
  initialPos.value = { ...position.value };

  window.addEventListener("mousemove", handleHeaderMouseMove);
  window.addEventListener("mouseup", handleHeaderMouseUp);
} /*end handleHeaderMouseDown*/

function handleHeaderMouseMove(e: MouseEvent): void {
  if (!isDragging.value) return;
  const deltaX = e.clientX - dragStart.value.x;
  const deltaY = e.clientY - dragStart.value.y;

  const newX = Math.max(0, Math.min(window.innerWidth - 120, initialPos.value.x + deltaX));
  const newY = Math.max(0, Math.min(window.innerHeight - 48, initialPos.value.y + deltaY));

  position.value = { x: newX, y: newY };
} /*end handleHeaderMouseMove*/

function handleHeaderMouseUp(): void {
  isDragging.value = false;
  cleanupDragListeners();
} /*end handleHeaderMouseUp*/

function cleanupDragListeners(): void {
  window.removeEventListener("mousemove", handleHeaderMouseMove);
  window.removeEventListener("mouseup", handleHeaderMouseUp);
} /*end cleanupDragListeners*/

// ── Resize Handlers ──────────────────────────────────────────────────────────
function handleResizeMouseDown(e: MouseEvent): void {
  e.stopPropagation();
  windowManager.bringToFront(props.windowId);
  isResizing.value = true;
  resizeStart.value = {
    x: e.clientX,
    y: e.clientY,
    w: size.value.width,
    h: size.value.height,
  };

  window.addEventListener("mousemove", handleResizeMouseMove);
  window.addEventListener("mouseup", handleResizeMouseUp);
} /*end handleResizeMouseDown*/

function handleResizeMouseMove(e: MouseEvent): void {
  if (!isResizing.value) return;
  const deltaX = e.clientX - resizeStart.value.x;
  const deltaY = e.clientY - resizeStart.value.y;

  const newW = Math.max(
    props.minWidth,
    Math.min(window.innerWidth - position.value.x - 16, resizeStart.value.w + deltaX),
  );
  const newH = Math.max(
    props.minHeight,
    Math.min(window.innerHeight - position.value.y - 16, resizeStart.value.h + deltaY),
  );

  size.value = { width: newW, height: newH };
} /*end handleResizeMouseMove*/

function handleResizeMouseUp(): void {
  isResizing.value = false;
  cleanupResizeListeners();
} /*end handleResizeMouseUp*/

function cleanupResizeListeners(): void {
  window.removeEventListener("mousemove", handleResizeMouseMove);
  window.removeEventListener("mouseup", handleResizeMouseUp);
} /*end cleanupResizeListeners*/

// ── Dock Registry Synchronization ───────────────────────────────────────────
function registerSelf(): void {
  windowManager.registerWindow({
    id: props.windowId,
    title: props.title,
    icon: props.icon,
    iconColor: props.iconColor,
    isMinimized: isMinimized.value,
    focus: () => {
      isMinimized.value = false;
      windowManager.bringToFront(props.windowId);
    },
    toggleMinimize,
    close: handleClose,
  });
} /*end registerSelf*/

function unregisterSelf(): void {
  windowManager.unregisterWindow(props.windowId);
} /*end unregisterSelf*/

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      isMinimized.value = false;
      initWindowPlacement();
      windowManager.bringToFront(props.windowId);
      registerSelf();
    } else {
      unregisterSelf();
    }
  },
  { immediate: true },
);

watch(
  () => isMinimized.value,
  (min) => {
    windowManager.updateWindowState(props.windowId, { isMinimized: min });
  },
);

watch(
  () => props.title,
  (newTitle) => {
    windowManager.updateWindowState(props.windowId, { title: newTitle });
  },
);

onUnmounted(() => {
  unregisterSelf();
  window.removeEventListener("keydown", handleGlobalKeydown);
  cleanupDragListeners();
  cleanupResizeListeners();
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="app-floating-window card-elevation-elite column no-wrap overflow-hidden"
      :class="{ 'is-fullscreen': isFullscreen, 'is-minimized': isMinimized }"
      :style="{
        position: 'fixed',
        left: isFullscreen ? '0px' : `${position.x}px`,
        top: isFullscreen ? '0px' : `${position.y}px`,
        width: isFullscreen ? '100vw' : `${size.width}px`,
        height: isMinimized ? '48px' : isFullscreen ? '100vh' : `${size.height}px`,
        zIndex: currentZIndex,
        borderRadius: isFullscreen ? '0px' : '12px',
      }"
      @mousedown.capture="handleWindowClick"
    >
      <!-- Draggable Header Bar (Elite Navy & Gold) -->
      <div
        class="window-header row items-center justify-between bg-navy text-white q-px-md q-py-xs unselectable"
        :style="{ cursor: isFullscreen ? 'default' : 'grab', height: '48px' }"
        @mousedown="handleHeaderMouseDown"
        @dblclick="toggleFullscreen"
      >
        <!-- Left: Icon, Title, Subtitle, Badge -->
        <div class="row items-center q-gutter-xs text-ellipsis col min-width-0">
          <slot name="header-prefix">
            <q-icon :name="icon" :color="iconColor" size="20px" class="q-mr-xs shrink-0" />
          </slot>

          <div
            class="text-subtitle2 text-weight-bold text-ellipsis text-white"
            style="max-width: 50%"
          >
            {{ title }}
          </div>

          <q-badge
            v-if="badgeLabel"
            :color="badgeColor"
            text-color="dark"
            size="xs"
            class="gt-xs q-ml-xs text-weight-bold"
          >
            {{ badgeLabel }}
          </q-badge>

          <div v-if="subtitle" class="text-caption text-grey-4 ellipsis q-ml-xs gt-sm">
            {{ subtitle }}
          </div>
        </div>

        <!-- Middle Slot (Optional Tabs or Actions) -->
        <div v-if="!isMinimized" class="col-auto row items-center q-px-sm" @mousedown.stop>
          <slot name="header-middle" />
        </div>

        <!-- Right: Window Action Controls -->
        <div class="row items-center q-gutter-xs no-wrap shrink-0" @mousedown.stop>
          <!-- Send to Back Button -->
          <q-btn
            flat
            round
            dense
            size="sm"
            icon="flip_to_back"
            color="grey-4"
            @click="handleSendToBack"
          >
            <q-tooltip>Manda in secondo piano</q-tooltip>
          </q-btn>

          <!-- Fullscreen Toggle Button -->
          <q-btn
            flat
            round
            dense
            size="sm"
            :icon="isFullscreen ? 'fullscreen_exit' : 'fullscreen'"
            color="white"
            @click="toggleFullscreen"
          >
            <q-tooltip>{{
              isFullscreen ? "Ripristina dimensione (Esc)" : "Schermo intero (Fullscreen)"
            }}</q-tooltip>
          </q-btn>

          <!-- Minimize Toggle Button -->
          <q-btn
            flat
            round
            dense
            size="sm"
            :icon="isMinimized ? 'unfold_more' : 'minimize'"
            color="white"
            @click="toggleMinimize"
          >
            <q-tooltip>{{ isMinimized ? "Espandi finestra" : "Riduci a icona" }}</q-tooltip>
          </q-btn>

          <!-- Close Button -->
          <q-btn flat round dense size="sm" icon="close" color="white" @click="handleClose">
            <q-tooltip>Chiudi finestra</q-tooltip>
          </q-btn>
        </div>
      </div>

      <!-- Window Body (Rendered when NOT minimized) -->
      <div
        v-if="!isMinimized"
        class="window-body col overflow-hidden bg-white relative-position column no-wrap"
        style="height: calc(100% - 48px)"
      >
        <!-- Main Content Area -->
        <div class="col full-width overflow-auto custom-scrollbar relative-position">
          <slot />
        </div>

        <!-- Optional Footer Area -->
        <div v-if="$slots.footer" class="window-footer shrink-0 border-top-light bg-grey-1 q-pa-sm">
          <slot name="footer" />
        </div>

        <!-- Resize Handle Corner (only when not fullscreen) -->
        <div
          v-if="!isFullscreen"
          class="resize-handle"
          title="Trascina per ridimensionare finestra"
          @mousedown="handleResizeMouseDown"
        >
          <q-icon name="south_east" size="14px" color="grey-6" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.app-floating-window {
  box-sizing: border-box;
  background: #ffffff;
  border: 1px solid rgba(197, 160, 101, 0.35);
  box-shadow:
    0 16px 44px -8px rgba(10, 35, 66, 0.32),
    0 0 0 1px rgba(10, 35, 66, 0.08);
  transition: box-shadow 0.2s ease;

  &.is-fullscreen {
    border: none;
    box-shadow: none;
  }
}

.bg-navy {
  background: #0a2342 !important;
}

.unselectable {
  user-select: none;
  -webkit-user-select: none;
}

.window-header {
  border-bottom: 2px solid #c5a065;
}

.window-body {
  min-height: 0;
}

.border-top-light {
  border-top: 1px solid rgba(10, 35, 66, 0.08);
}

.resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 22px;
  height: 22px;
  cursor: se-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 35, 66, 0.05);
  border-top-left-radius: 8px;
  z-index: 50;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(197, 160, 101, 0.3);
  }
}
</style>
