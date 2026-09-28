# 🎨 OpsFlow Rule 03 — Frontend Quasar 2, Vue 3 & Elite Design System

> **Scope:** Vue 3 component structure, Quasar 2 composables, Pinia Stores, Elite Design System  
> **Source:** Derived from AGENTS.md §4, §6, §7  
> **Applicability:** All files in `src/`

---

## 🏗️ 1. Vue 3 Component Conventions

- **Mandatory `<script setup lang="ts">`:** Options API and `defineComponent` are strictly prohibited.
- **Ordered Blocks:** File structure must strictly follow:
  1. `<script setup lang="ts">`
  2. `<template>`
  3. `<style scoped lang="scss">`
     _(Never place template or style before the script)._
- **Typed Props:** Use `defineProps<T>()` with explicit TypeScript interfaces.
- **Imports Grouping Order:**
  ```typescript
  // ── Vue & Framework ──────────────────────────────────────────────────────────
  // ── Firebase ─────────────────────────────────────────────────────────────────
  // ── Types ────────────────────────────────────────────────────────────────────
  // ── Stores ───────────────────────────────────────────────────────────────────
  // ── Composables ──────────────────────────────────────────────────────────────
  // ── Utils ────────────────────────────────────────────────────────────────────
  // ── Components ───────────────────────────────────────────────────────────────
  ```
- **Quasar Composables:** Import directly from `'quasar'` (e.g. `useQuasar`, `Notify`). Import app-level helpers from `'#q-app'` (e.g. `defineBoot`, `defineRouter`).

---

## 💎 2. "Elite" Design System & Visual Hierarchy

- **Color Palette:** Royal Navy (`#0a2342`), Gold (`#c5a065`), Off-White (`#f9f7f2`).
- **Typography:** _Playfair Display_ for headers, _Mulish_ or _Outfit_ for crisp body readability.
- **Glassmorphism:** Use `GlassCard.vue` styling with backdrop-filter blur, rounded corners (`border-radius: 14px`), and airy paddings (`q-pa-lg`, `q-pa-xl`).
- **Triple-Pane Responsive Layout:** Workspaces feature Left Sidebar (Navigation/Workspaces), Center Pane (Task Timeline/Chat), and Right Drawer (Sub-Task Entities/Settings).
- **Lighthouse Standard:** Every view must target 100/100 on Performance, Accessibility, Best Practices, and SEO.

---

## 🏷️ 3. TypeScript Centralization & Code Style

- **Centralized Models:** Firestore models and interfaces must reside in `src/types/models.ts`. Never declare inline Firestore data interfaces inside Vue components or stores. Local types must be marked `// UI-only — not Firestore data`.
- **Standard JSDoc Header:**
  ```typescript
  /**
   * @file ComponentName.vue
   * @description Brief description
   * @author Vasile Chifeac
   * @created YYYY-MM-DD
   * @modified YYYY-MM-DD
   */
  ```
- **Closure Markers:** Always close functions with commented markers:
  ```typescript
  const myFn = (): void => {
    // ...
  }; /*end myFn*/
  ```
