# 📋 OpsFlow — Master Blueprint & Architecture Export

> **Project Name:** OpsFlow (Operational Intelligence Platform)  
> **Export Date:** 2026-08-13  
> **Status:** Production Architecture Blueprint

---

## 🎯 1. Purpose & Core Vision

**OpsFlow** is an AI-First SaaS Operational Intelligence Platform built for professionals, agencies, and teams to eliminate repetitive operational overhead (email drafting, Google Sheets compilation, B2B lead scouting) while maintaining strict **Human-in-the-Loop** control and near-zero cloud execution costs (< €1.00/month per 1,000 active users).

### Key Architectural Concepts:

- **Task-as-a-Chat:** Tasks are living conversational units. Clicking a task opens a dedicated thread tracking every interaction from research to email drafting and sheet updates.
- **Human-in-the-Loop:** AI agents generate drafts and prepare sheet rows, but NEVER perform destructive actions or autonomous email sends without explicit user consent (`✅ Approve` / `❌ Reject`).
- **Multi-Window UI:** Users can open multiple tasks in floating, draggable, and resizable chat windows simultaneously without state interference.
- **Persistent Chat Sessions:** Chat session threads are persisted in `localStorage` (`opsflow_task_chat_{taskId}`) to preserve history across page refreshes.

---

## 🏗️ 2. Technology Stack & Framework Choices

| Layer                       | Technology Choice                | Rationale & Configuration                                                             |
| --------------------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| **Frontend Framework**      | **Quasar Framework 2 (Vue 3)**   | Script setup `<script setup lang="ts">`, Composition API, typed components.           |
| **Type System**             | **TypeScript Strict Mode**       | Explicit type definitions in `src/types/models.ts`. No inline types in Vue files.     |
| **State Management**        | **Pinia Stores**                 | Decoupled state management (`taskStore.ts`, `taskChatStore.ts`, `workspaceStore.ts`). |
| **Backend & DB**            | **Firebase (Auth + Firestore)**  | Multi-tenant isolation scoped by `tenantId` in Firestore rules.                       |
| **Serverless AI Functions** | **Firebase Genkit + Gemini API** | Cloud Functions in `opsflow-functions/` running Gemini Flash for low latency.         |
| **Build & Tooling**         | **Yarn + Vite + oxlint / oxfmt** | Fast Rust-based linter and formatter (`oxlint`, `oxfmt`).                             |

---

## 🌐 3. Internationalization (i18n) Strategy

- **Static UI Strings:** Fixed in standard English (`en-US`) via `src/i18n/en-US/`.
- **Dynamic AI Response Engine:** System prompts (`promptBuilder.ts`) detect the user's input language and respond in the matching language (e.g., Italian, English, Romanian, Russian).

---

## 🤖 4. AI Agent Orchestration & Prompt Stacking

### 3-Level Prompt Stacking Engine (`promptBuilder.ts`)

1. **Level 1 (Base Rules & Security):** OpsFlow base system rules, GDPR PII filtering, human-in-the-loop policies.
2. **Level 2 (Workspace Operational Attitude):** Custom attitude configuration fetched from Firestore workspace settings (Comportamento, Strumenti, Agenti, Test Sandbox) plus linked Google Workspace resource IDs.
3. **Level 3 (Task Context & Instruction):** Task title and user instruction.

### Agent Roster & Roles:

- **AgentePlanner:** Decomposes complex tasks into 3-5 subtasks with complexity scoring.
- **AgenteRicerca (Lead Scout):** Performs B2B platform scouting ([Clutch.co](https://clutch.co), [GoodFirms](https://goodfirms.co), [LinkedIn Sales Navigator](https://www.linkedin.com/sales), [Wellfound](https://wellfound.com), [Upwork Enterprise](https://www.upwork.com/enterprise)).
- **AgenteAmministrativo:** Generates Gmail presentation drafts and updates Google Sheets (`1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`).
- **AgenteIspettore:** Audits task completion and quality before closure.

---

## 🛡️ 5. Cybersecurity, GDPR & Safe Logging

- **Client-Side Logging (`useSecureLogger.ts`):** Formatted console logs in `Development` mode; automatic PII email masking (`***@***.com`) and key redaction (`[REDACTED]`) in `Production`.
- **Firestore Multi-Tenant Security:** All queries strictly scoped by `tenantId`.
- **JWT Custom Claims:** Navigation and role checks (`isActive`, `role`) rely on JWT claims without triggering extra Firestore reads.
- **Supply Chain Security:** No unapproved HTTP libraries (`axios`, `got`, `superagent` banned). Uses official Firebase SDK and native `fetch`.

---

## 🗂️ 6. Core Project File Structure

### Frontend Pages (`src/pages/`)

- 📄 `src/pages/[...path].vue`
- 📄 `src/pages/index.vue`
- 📄 `src/pages/login.vue`
- 📄 `src/pages/register.vue`

### Frontend Layouts (`src/layouts/`)

- 📄 `src/layouts/MainLayout.vue`

### Pinia Stores (`src/stores/`)

- 📄 `src/stores/authStore.ts`
- 📄 `src/stores/example-store.ts`
- 📄 `src/stores/index.ts`
- 📄 `src/stores/taskChatStore.ts`
- 📄 `src/stores/taskStore.ts`
- 📄 `src/stores/uiStore.ts`

### Composables (`src/composables/`)

- 📄 `src/composables/useFirestore.ts`
- 📄 `src/composables/useSecureFirestore.ts`
- 📄 `src/composables/useSecureLogger.ts`

### Reusable UI Components (`src/components/`)

- 📄 `src/components/TaskChatModal.vue`
- 📄 `src/components/TaskChatWindow.vue`
- 📄 `src/components/WorkspaceAttitudeModal.vue`
  📁 `src/components/base/`
- 📄 `src/components/base/BaseButton.vue`
- 📄 `src/components/base/BaseInput.vue`
- 📄 `src/components/base/DashboardCard.vue`
- 📄 `src/components/base/StatusBadge.vue`

### Backend Cloud Functions (`opsflow-functions/src/`)

📁 `opsflow-functions/src/ai/`

- 📄 `opsflow-functions/src/ai/chatFlow.ts`
- 📄 `opsflow-functions/src/ai/genkitConfig.ts`
- 📄 `opsflow-functions/src/ai/piiSanitizer.ts`
- 📄 `opsflow-functions/src/ai/promptBuilder.ts`
- 📄 `opsflow-functions/src/index.ts`
  📁 `opsflow-functions/src/tools/`
- 📄 `opsflow-functions/src/tools/contentMarketing.ts`
- 📄 `opsflow-functions/src/tools/googleWorkspace.ts`
- 📄 `opsflow-functions/src/tools/webSearch.ts`

---

## 📌 7. Key Verification & Audit Summary

- **Typecheck Status:** Fully verified via `yarn typecheck` (`vue-tsc --noEmit`).
- **Linter Status:** Verified via `yarn lint` (`oxlint`, `oxfmt`). Zero warnings, zero errors.
- **Security Check:** No API keys, secrets, credentials, or PII exposed in this export.
