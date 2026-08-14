# 📋 OpsFlow — Master Blueprint & Implementation Architecture

> **Project Name:** OpsFlow (Operational Intelligence Platform)  
> **Author:** Vasile Chifeac  
> **Status:** Production-Ready Architecture & Implementation Blueprint  
> **Target Cost:** < €5.00 – €10.00 / month (Optimized Free-Tiers & Zero Waste)

---

## 🎯 1. Purpose & Core Vision

**OpsFlow** is an AI-First SaaS Operational Intelligence Platform built for professionals, agencies, and teams to eliminate repetitive operational overhead (email drafting, Google Sheets compilation, B2B lead scouting) while maintaining strict **Human-in-the-Loop** control.

### Key Architectural Concepts:

- **Task-as-a-Chat:** Tasks are living conversational units. Clicking a task opens a dedicated thread tracking every interaction from research to email drafting and sheet updates.
- **Human-in-the-Loop:** AI agents generate drafts and prepare sheet rows, but NEVER perform destructive actions or autonomous email sends without explicit user consent (`✅ Approve` / `❌ Reject`).
- **Multi-Window UI:** Users can open multiple tasks in floating, draggable, and resizable chat windows simultaneously without state interference.
- **Persistent Chat Sessions:** Chat session threads are persisted securely via Firestore subcollections (`messages`) with real-time `onSnapshot` listeners to prevent any history loss on page refresh (F5).

---

## 🏗️ 2. Technology Stack & Framework Choices

| Layer                       | Technology Choice                | Rationale & Configuration                                                             |
| --------------------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| **Frontend Framework**      | **Quasar Framework 2 (Vue 3)**   | Script setup `<script setup lang="ts">`, Composition API, typed components.           |
| **Type System**             | **TypeScript Strict Mode**       | Explicit type definitions in `src/types/`. No inline types in Vue files.              |
| **State Management**        | **Pinia Stores**                 | Decoupled state management (`taskStore.ts`, `taskChatStore.ts`, `workspaceStore.ts`). |
| **Backend & DB**            | **Firebase (Auth + Firestore)**  | Multi-tenant isolation scoped by `tenantId` in Firestore rules.                       |
| **Serverless AI Functions** | **Firebase Genkit + Gemini API** | Cloud Functions in backend running Gemini Flash for low latency and high context.     |
| **Build & Tooling**         | **Yarn + Vite + oxlint / oxfmt** | Fast Rust-based linter and formatter (`oxlint`, `oxfmt`).                             |

---

## 🌐 3. Internationalization (i18n) Strategy

- **Static UI Strings:** Fixed in standard professional English (`en-US`) via `src/i18n/en-US/`.
- **Dynamic AI Response Engine:** System prompts (`promptBuilder.ts`) detect the user's input language and respond in the matching language natively (e.g., Italian, English, Romanian, Russian).

---

## 🤖 4. AI Agent Orchestration & Prompt Stacking

### 3-Level Prompt Stacking Engine (`promptBuilder.ts`)

1. **Level 1 (Base Rules & Security):** OpsFlow base system rules, GDPR PII filtering, human-in-the-loop policies.
2. **Level 2 (Workspace Operational Attitude):** Custom attitude configuration fetched from Firestore workspace settings (Comportamento, Strumenti, Agenti, Test Sandbox).
3. **Level 3 (Task Context & Instruction):** Task title and user instruction.

### Agent Roster & Custom Roles:

- **AgentePlanner:** Decomposes complex tasks into structured subtasks.
- **AgenteRicerca (Lead Scout):** Performs web scouting and markdown extraction via **Jina AI Reader** (`r.jina.ai/URL`) at zero cost.
- **AgenteAmministrativo:** Generates Gmail presentation drafts and updates Google Sheets safely.
- **AgenteIspettore:** Audits task completion and quality before closure.

---

## 🛡️ 5. Cybersecurity, GDPR & Safe Logging

- **Client-Side Logging (`useSecureLogger.ts`):** Formatted console logs in `Development` mode; automatic PII email masking (`***@***.com`) and key redaction (`[REDACTED]`) in `Production`.
- **Firestore Multi-Tenant Security:** All queries strictly scoped by `tenantId`.
- **JWT Custom Claims:** Navigation and role checks (`platformRole`, `tenantRole`) rely on JWT claims without triggering extra Firestore reads.
- **Supply Chain Security:** No unapproved HTTP libraries. Uses official Firebase SDK and native `fetch`.

---

## 🗂️ 6. Core Project Architecture & File Structure

```text
src/
├── boot/           # i18n, Firebase boot files
├── components/     # TaskChatModal.vue, WorkspaceAttitudeModal.vue, base/
├── composables/    # useSecureLogger.ts, useFirestore.ts
├── i18n/           # en-US dictionary
├── layouts/        # MainLayout.vue
├── pages/          # Index, Login, Register, Admin Diagnostics
├── stores/         # taskChatStore.ts (Map-based sessions), taskStore.ts, workspaceStore.ts
└── types/          # AgentTool.ts, models.ts
```
